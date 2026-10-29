const mongoose = require('mongoose');
const { resolveVendorServices } = require('../../utils/vendorCategories');
const Vendor = require('../../models/Vendor');
const { validationResult } = require('express-validator');
const cloudinaryService = require('../../services/cloudinaryService');
const { validateDob, calculateAge } = require('../../utils/age');

/**
 * Get vendor profile
 */
const getProfile = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const vendor = await Vendor.findById(vendorId).select('-password -__v');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // A vendor who typed or picked their own address has no state / district record yet: match it from the address
    // (needed for the category lists). Saved with updateOne so older profiles that fail full validation still work.
    try {
      const filled = await require('../../services/vendorAreaService').fillMissingVendorArea(vendor);
      if (Object.keys(filled).length) await Vendor.updateOne({ _id: vendorId }, { $set: filled });
    } catch (areaErr) {
      console.warn('[getProfile] area match skipped:', areaErr.message);
    }

    // Use stored rating if available (and > 0), otherwise calculate
    let rating = vendor.rating || 0;

    const Booking = require('../../models/Booking');

    if (rating === 0) {
      const [ratingData] = await Booking.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), rating: { $ne: null } } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ]);
      rating = ratingData ? ratingData.avgRating : 0;
    }

    const totalJobs = await Booking.countDocuments({ vendorId });
    const completedJobs = await Booking.countDocuments({ vendorId, status: 'completed' });
    const completionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

    res.status(200).json({
      success: true,
      vendor: {
        id: vendor._id,
        name: vendor.name,
        businessName: vendor.businessName || null,
        email: vendor.email,
        phone: vendor.phone,
        gender: vendor.gender || null,
        dateOfBirth: vendor.dateOfBirth || null,
        age: calculateAge(vendor.dateOfBirth),
        service: vendor.service,
        skills: vendor.skills || [],
        address: vendor.address || null,
        cityId: vendor.cityId || null,
        // the vendor's area: the category lists use it to include state / district scoped categories
        stateId: vendor.stateId || null,
        districtId: vendor.districtId || null,
        subDistrictId: vendor.subDistrictId || null,
        rating: rating > 0 ? parseFloat(rating.toFixed(1)) : 0,
        totalJobs,
        completionRate,
        approvalStatus: vendor.approvalStatus,
        isPhoneVerified: vendor.isPhoneVerified || false,
        isEmailVerified: vendor.isEmailVerified || false,
        profilePhoto: vendor.profilePhoto || null,
        aadharDocument: vendor.aadhar?.document || null,
        labDetails: vendor.labDetails || {},
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt
      }
    });
  } catch (error) {
    console.error('Get vendor profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile. Please try again.'
    });
  }
};

/**
 * Update vendor profile
 */
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { name, businessName, address, profilePhoto, serviceCategory, skills, aadharNumber, aadharDocument, panNumber, panDocument, gender, dateOfBirth, stateId, districtId, subDistrictId } = req.body;

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // The vendor's own State / District / Sub-district choice (dropdowns). Each must belong to the one above it.
    if (stateId !== undefined || districtId !== undefined || subDistrictId !== undefined) {
      const picked = await require('../../services/vendorAreaService').resolvePickedArea({ stateId, districtId, subDistrictId });
      if (!picked.ok) {
        return res.status(400).json({ success: false, message: picked.message });
      }
      Object.assign(vendor, picked.fields);
    }

    // Update fields
    if (name) vendor.name = name.trim();
    if (businessName !== undefined) vendor.businessName = businessName ? businessName.trim() : null;
    if (gender !== undefined) {
      if (['male', 'female', 'other'].includes(String(gender).toLowerCase())) {
        vendor.gender = String(gender).toLowerCase();
      } else if (gender === null || gender === '') {
        vendor.gender = null;
      }
    }
    if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== '') {
      const dobCheck = validateDob(dateOfBirth);
      if (!dobCheck.ok) return res.status(400).json({ success: false, message: dobCheck.message });
      vendor.dateOfBirth = dobCheck.dob;
    }
    if (address) {
      if (typeof address === 'string') {
        // If address is coming as string from simple form
        vendor.address = {
          ...vendor.address,
          fullAddress: address
        };
      } else {
        // Address is an object from advanced picker
        vendor.address = {
          fullAddress: address.fullAddress || vendor.address?.fullAddress || '',
          addressLine1: address.addressLine1 || vendor.address?.addressLine1 || '',
          addressLine2: address.addressLine2 || vendor.address?.addressLine2 || '',
          city: address.city || vendor.address?.city || '',
          state: address.state || vendor.address?.state || '',
          pincode: address.pincode || vendor.address?.pincode || '',
          landmark: address.landmark || vendor.address?.landmark || '',
          lat: address.lat !== undefined ? address.lat : vendor.address?.lat,
          lng: address.lng !== undefined ? address.lng : vendor.address?.lng
        };
      }

      // Resolve cityId robustly
      if (vendor.address?.city || vendor.address?.fullAddress) {
        const City = require('../../models/City');
        const activeCities = await City.find({ isActive: true });
        
        const inputCityLower = (vendor.address?.city || '').toLowerCase();
        const fullAddressLower = (vendor.address?.fullAddress || '').toLowerCase();
        
        // Find a city where the input city name contains the DB city name (e.g. "Indore City" contains "Indore")
        let matchedCity = activeCities.find(c => {
          const dbCityLower = c.name.toLowerCase();
          return inputCityLower === dbCityLower || inputCityLower.includes(dbCityLower);
        });

        // Fallback: Check if the full address contains the city name
        if (!matchedCity && fullAddressLower) {
          matchedCity = activeCities.find(c => fullAddressLower.includes(c.name.toLowerCase()));
        }

        if (matchedCity) {
          vendor.address.cityId = matchedCity._id;
          vendor.cityId = matchedCity._id;
        } else {
          vendor.address.cityId = null;
          vendor.cityId = null;
        }
      }
    }

    // Link the saved address to its State / District records (only fills what is still empty).
    // Skipped when the vendor chose their area from the dropdowns: that choice stands.
    const choseAreaExplicitly = stateId !== undefined || districtId !== undefined || subDistrictId !== undefined;
    if (!choseAreaExplicitly) try {
      // the picked place's district / tehsil as Google reported them (not stored, only used for matching)
      const areaHints = (address && typeof address === 'object') ? { district: address.district, subDistrict: address.subDistrict } : {};
      await require('../../services/vendorAreaService').fillMissingVendorArea(vendor, areaHints);
    } catch (areaErr) {
      console.warn('[updateProfile] area match skipped:', areaErr.message);
    }

    // Update profile photo - upload to Cloudinary if it's a base64 string
    if (profilePhoto !== undefined) {
      if (profilePhoto && profilePhoto.startsWith('data:')) {
        const uploadRes = await cloudinaryService.uploadFile(profilePhoto, { folder: 'vendors/profiles' });
        if (uploadRes.success) {
          vendor.profilePhoto = uploadRes.url;
        }
      } else {
        vendor.profilePhoto = profilePhoto;
      }
    }

    // Handle multiple service categories
    if (serviceCategory !== undefined) {
      if (Array.isArray(serviceCategory) || typeof serviceCategory === 'string') {
        const resolved = await resolveVendorServices({
          ids: req.body.serviceCategoryIds,
          titles: Array.isArray(serviceCategory) ? serviceCategory : [serviceCategory]
        });
        vendor.service = resolved.service;
        vendor.categories = resolved.service; // Sync categories field too
        vendor.serviceCategoryIds = resolved.serviceCategoryIds;
      }
    }

    // Handle skills
    if (skills !== undefined) {
      vendor.skills = Array.isArray(skills) ? skills : [];
    }
    // If aadharDocument exists and is not empty, update it
    if (aadharDocument || aadharNumber) {
      let aadharUrl = aadharDocument || vendor.aadhar?.document;
      if (aadharUrl && aadharUrl.startsWith('data:')) {
        const uploadRes = await cloudinaryService.uploadFile(aadharUrl, { folder: 'vendors/documents' });
        if (uploadRes.success) aadharUrl = uploadRes.url;
      }

      if (vendor.aadhar) {
        if (aadharNumber) vendor.aadhar.number = aadharNumber;
        if (aadharDocument) vendor.aadhar.document = aadharUrl;
      } else {
        vendor.aadhar = {
          number: aadharNumber || '',
          document: aadharUrl || ''
        };
      }
    }

    // If panDocument exists and is not empty, update it
    if (panDocument || panNumber) {
      let panUrl = panDocument || vendor.pan?.document;
      if (panUrl && panUrl.startsWith('data:')) {
        const uploadRes = await cloudinaryService.uploadFile(panUrl, { folder: 'vendors/documents' });
        if (uploadRes.success) panUrl = uploadRes.url;
      }

      if (vendor.pan) {
        if (panNumber) vendor.pan.number = panNumber;
        if (panDocument) vendor.pan.document = panUrl;
      } else {
        vendor.pan = {
          number: panNumber || '',
          document: panUrl || ''
        };
      }
    }

    await vendor.save();

    // Sync equipment cityIds if vendor updated city
    const VendorEquipment = require('../../models/VendorEquipment');
    await VendorEquipment.updateMany(
      { vendorId: vendor._id },
      { cityIds: vendor.cityId ? [vendor.cityId] : [] }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      vendor: {
        id: vendor._id,
        name: vendor.name,
        businessName: vendor.businessName,
        email: vendor.email,
        phone: vendor.phone,
        service: vendor.service,
        address: vendor.address,
        cityId: vendor.cityId || null,
        approvalStatus: vendor.approvalStatus,
        isPhoneVerified: vendor.isPhoneVerified,
        isEmailVerified: vendor.isEmailVerified,
        profilePhoto: vendor.profilePhoto,
        skills: vendor.skills,
        labDetails: vendor.labDetails || {}
      }
    });
  } catch (error) {
    console.error('Update vendor profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile. Please try again.'
    });
  }
};

/**
 * Update vendor address
 */
const updateAddress = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { fullAddress, lat, lng } = req.body;

    if (!fullAddress || !lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Full address and coordinates are required'
      });
    }

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Update address with coordinates
    vendor.address = {
      ...vendor.address,
      fullAddress: fullAddress.trim(),
      lat: parseFloat(lat),
      lng: parseFloat(lng)
    };

    // Update geoLocation for GeoJSON searches
    vendor.geoLocation = {
      type: 'Point',
      coordinates: [parseFloat(lng), parseFloat(lat)]
    };

    try {
      await require('../../services/vendorAreaService').fillMissingVendorArea(vendor);
    } catch (areaErr) {
      console.warn('[updateAddress] area match skipped:', areaErr.message);
    }

    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      address: vendor.address
    });
  } catch (error) {
    console.error('Update vendor address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address. Please try again.'
    });
  }
};

/**
 * Update vendor real-time location
 */
const updateLocation = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
    }

    // Update both location and geoLocation fields
    await Vendor.findByIdAndUpdate(vendorId, {
      location: { lat, lng, updatedAt: new Date() },
      geoLocation: {
        type: 'Point',
        coordinates: [parseFloat(lng), parseFloat(lat)]
      }
    });

    res.status(200).json({ success: true, message: 'Location updated' });
  } catch (error) {
    console.error('Vendor location update error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Update vendor business profile (specifically lab details & services)
 */
const updateBusinessProfile = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { services, labName, licenseNumber, certificationDocument } = req.body;

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Update services array safely
    if (services !== undefined) {
      const resolved = await resolveVendorServices({
        ids: req.body.serviceCategoryIds,
        titles: Array.isArray(services) ? services : []
      });
      vendor.service = resolved.service;
      vendor.categories = resolved.service;
      vendor.serviceCategoryIds = resolved.serviceCategoryIds;
    }

    // Update Lab Details (if Soil Testing is enabled/managed)
    if (labName !== undefined || licenseNumber !== undefined || certificationDocument !== undefined) {
      if (!vendor.labDetails) vendor.labDetails = {};
      
      if (labName !== undefined) vendor.labDetails.labName = labName;
      if (licenseNumber !== undefined) vendor.labDetails.licenseNumber = licenseNumber;

      // Handle file upload base64 -> Cloudinary
      if (certificationDocument) {
        if (certificationDocument.startsWith('data:')) {
          const uploadRes = await cloudinaryService.uploadFile(certificationDocument, { folder: 'vendors/documents/labs' });
          if (uploadRes.success) vendor.labDetails.certificationDocument = uploadRes.url;
        } else {
          vendor.labDetails.certificationDocument = certificationDocument;
        }
      }
    }

    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Business profile updated successfully',
      service: vendor.service,
      labDetails: vendor.labDetails
    });
  } catch (error) {
    console.error('Update vendor business profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update business profile. Please try again.'
    });
  }
};

/**
 * Update vendor availability (Online / Offline) by vendor
 */
const updateAvailability = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const { isOnline, availability } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const nextOnline = typeof isOnline === 'boolean'
      ? isOnline
      : (availability ? availability.toUpperCase() === 'AVAILABLE' : !vendor.isOnline);

    if (nextOnline) {
      if (['suspended', 'rejected'].includes(vendor.approvalStatus) || vendor.isActive === false) {
        return res.status(400).json({
          success: false,
          message: 'Cannot set a suspended or inactive account to Online. Please contact support.'
        });
      }
    }

    vendor.isOnline = nextOnline;
    vendor.availability = nextOnline ? 'AVAILABLE' : 'OFFLINE';
    if (!nextOnline) {
      vendor.lastSeenAt = new Date();
    }
    await vendor.save();

    // Redis sync
    try {
      const { setVendorOnline } = require('../../services/redisService');
      await setVendorOnline(vendor._id, nextOnline);
    } catch (rErr) {
      console.warn('[Redis] Failed to sync vendor online status in Redis:', rErr.message);
    }

    // Socket broadcast
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        const payload = {
          vendorId: vendor._id.toString(),
          isOnline: vendor.isOnline,
          availability: vendor.availability
        };
        io.to(`vendor_${vendor._id.toString()}`).emit('vendor_status_updated', payload);
        io.to(`vendor:${vendor._id.toString()}`).emit('vendor_status_updated', payload);
        io.to(`vendor_${vendor._id.toString()}`).emit('vendor_availability_changed', payload);
        io.to('admin_global').emit('vendor_status_updated', payload);
      }
    } catch (sErr) {}

    return res.status(200).json({
      success: true,
      message: `You are now ${nextOnline ? 'Online' : 'Offline'}`,
      isOnline: vendor.isOnline,
      availability: vendor.availability
    });
  } catch (error) {
    console.error('Update vendor availability error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update availability status'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateAddress,
  updateLocation,
  updateBusinessProfile,
  updateAvailability
};

