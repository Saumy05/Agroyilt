const VendorEquipment = require('../../models/VendorEquipment');
const Category = require('../../models/Category');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');
const Service = require('../../models/Service');
const RentalTransaction = require('../../models/RentalTransaction');
const Booking = require('../../models/Booking');
const { validationResult } = require('express-validator');

// Helper for pricing validation
const validatePricing = (pricing) => {
  if (!pricing) return 'Pricing information is required';
  const checkBounds = (val) => typeof val === 'number' && val >= 0 && val <= 50000;
  if (pricing.hourly?.isEnabled && !checkBounds(pricing.hourly.price)) return 'Invalid hourly price (must be 0-50000)';
  if (pricing.daily?.isEnabled && !checkBounds(pricing.daily.price)) return 'Invalid daily price (must be 0-50000)';
  if (pricing.land_based?.isEnabled && !checkBounds(pricing.land_based.price)) return 'Invalid land-based price (must be 0-50000)';
  return null;
};

/**
 * Get all equipment for the logged-in vendor
 */
exports.getMyEquipment = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const equipment = await VendorEquipment.find({ vendorId })
      .populate('categoryId', 'title slug homeIconUrl trackingType requiresDriver')
      .populate('subCategoryIds', 'title slug')
      .populate('implements.subCategoryId', 'title slug')
      .populate('workerId', 'name phone profilePhoto status')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: equipment.length,
      data: equipment
    });
  } catch (error) {
    console.error('Get my equipment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment inventory'
    });
  }
};

/**
 * Get single equipment by ID for the logged-in vendor
 */
exports.getEquipmentById = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const equipment = await VendorEquipment.findOne({ _id: id, vendorId })
      .populate('categoryId', 'title slug homeIconUrl trackingType requiresDriver')
      .populate('subCategoryIds', 'title slug')
      .populate('implements.subCategoryId', 'title slug')
      .populate('workerId', 'name phone profilePhoto status');

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found in your inventory'
      });
    }

    res.status(200).json({
      success: true,
      data: equipment
    });
  } catch (error) {
    console.error('Get equipment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment details'
    });
  }
};

/**
 * Add new machinery to vendor's inventory
 */
exports.addEquipment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const vendorId = req.user.id;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    if (vendor.approvalStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Your account must be approved by an admin before you can list machinery.' });
    }

    const { 
      categoryId,
      serviceId, 
      requestedCategoryName,
      subCategoryIds,
      implements: implementsList,
      listingType,
      name, 
      modelNumber, 
      year, 
      horsepower,
      hp,
      description, 
      images, 
      pricing,
      includesDriver,
      driver,
      workerId,
      requestedCityName
    } = req.body;

    const priceError = validatePricing(pricing);
    if (priceError) return res.status(400).json({ success: false, message: priceError });

    // 1. Verify Category exists and is a "Main Category" (if categoryId is provided)
    if (categoryId) {
      const mainCategory = await Category.findById(categoryId);
      if (!mainCategory || mainCategory.parentCategory) {
        return res.status(400).json({
          success: false,
          message: 'Invalid main category selected'
        });
      }

      // 2. Verify sub-categories belong to this main category
      let allCategories = [mainCategory];
      if (subCategoryIds && subCategoryIds.length > 0) {
        const children = await Category.find({ _id: { $in: subCategoryIds }, parentCategory: categoryId });
        if (children.length !== subCategoryIds.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more implements (sub-categories) do not belong to the selected machine type'
          });
        }
        allCategories = allCategories.concat(children);
      }
    }

    // 3. Rate-Card Validation against Admin Service Template (Price Cap)
    if (serviceId) {
      const serviceTemplate = await Service.findById(serviceId);
      if (!serviceTemplate) {
         return res.status(404).json({ success: false, message: 'Selected Service template not found' });
      }
      
      const submittedPrice = pricing?.hourly?.isEnabled ? pricing.hourly.price : (pricing?.land_based?.isEnabled ? pricing.land_based.price : pricing?.daily?.price);
      
      // Admin sets the cap via basePrice or hourly_price
      const maxAllowed = serviceTemplate.basePrice || serviceTemplate.hourly_price || 0;

      if (maxAllowed > 0 && submittedPrice != null && submittedPrice > maxAllowed) {
        return res.status(400).json({
          success: false,
          message: `Your price (₹${submittedPrice}) exceeds the Admin maximum limit of ₹${maxAllowed}.`
        });
      }
    }

    // 3. Retrieve geographic location (State / District / Sub-District)
    const stateId = req.body.stateId || vendor.stateId || vendor.address?.stateId || null;
    const districtId = req.body.districtId || vendor.districtId || vendor.address?.districtId || null;
    const subDistrictId = req.body.subDistrictId || vendor.subDistrictId || vendor.address?.subDistrictId || null;
    const scope = req.body.scope || (subDistrictId ? 'SUB_DISTRICT' : (districtId ? 'DISTRICT' : (stateId ? 'STATE' : 'GLOBAL_INDIA')));

    // Legacy city support
    let cityIds = req.body.cityIds || [];
    if (!cityIds.length && vendor) {
      cityIds = (vendor.cityId || vendor.address?.cityId)
        ? [vendor.cityId || vendor.address.cityId]
        : [];
    }

    // 4. Create equipment (enforce category's Admin fulfillmentMode if defined)
    const finalListingType = (mainCategory && mainCategory.fulfillmentMode) 
      ? mainCategory.fulfillmentMode 
      : (listingType || 'service');

    const equipment = await VendorEquipment.create({
      vendorId,
      categoryId: categoryId || null,
      serviceId: serviceId || null,
      requestedCategoryName: requestedCategoryName || null,
      listingType: finalListingType,
      implements: implementsList || [],
      subCategoryIds: subCategoryIds || [],
      name,
      modelNumber,
      year,
      horsepower: (horsepower !== undefined && horsepower !== null) ? Number(horsepower) : ((hp !== undefined && hp !== null) ? Number(hp) : null),
      hp: (hp !== undefined && hp !== null) ? Number(hp) : ((horsepower !== undefined && horsepower !== null) ? Number(horsepower) : null),
      description,
      images: images || [],
      pricing,
      includesDriver,
      driver,
      workerId,
      cityIds,
      requestedCityName: requestedCityName || null,
      scope,
      stateId,
      districtId,
      subDistrictId,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      message: 'Equipment added successfully. Waiting for admin verification.',
      data: equipment
    });
  } catch (error) {
    console.error('Add equipment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add equipment. Please try again.'
    });
  }
};

/**
 * Update existing equipment
 */
exports.updateEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user.id;

    let equipment = await VendorEquipment.findOne({ _id: id, vendorId });
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found in your inventory' });
    }

    // Update fields (excluding vendorId and status reset)
    const updateData = req.body;
    delete updateData.vendorId;
    
    if (updateData.pricing) {
      const priceError = validatePricing(updateData.pricing);
      if (priceError) return res.status(400).json({ success: false, message: priceError });
      
      // Enforce Cap
      const sId = updateData.serviceId || equipment.serviceId;
      if (sId) {
        const serviceTemplate = await Service.findById(sId);
        if (serviceTemplate) {
          const submittedPrice = updateData.pricing.hourly?.isEnabled ? updateData.pricing.hourly.price : (updateData.pricing.land_based?.isEnabled ? updateData.pricing.land_based.price : updateData.pricing.daily?.price);
          const maxAllowed = serviceTemplate.basePrice || serviceTemplate.hourly_price || 0;
          if (maxAllowed > 0 && submittedPrice != null && submittedPrice > maxAllowed) {
            return res.status(400).json({
              success: false,
              message: `Your price (₹${submittedPrice}) exceeds the Admin maximum limit of ₹${maxAllowed}.`
            });
          }
        }
      }
    }
    
    // If category changed, reset to pending
    if (updateData.categoryId && updateData.categoryId !== equipment.categoryId?.toString()) {
      updateData.status = 'pending';
    }

    // Enforce Category's Admin fulfillmentMode if category is present
    const targetCatId = updateData.categoryId || equipment.categoryId;
    if (targetCatId) {
      const catObj = await Category.findById(targetCatId).select('fulfillmentMode').lean();
      if (catObj?.fulfillmentMode) {
        updateData.listingType = catObj.fulfillmentMode;
      }
    }

    equipment = await VendorEquipment.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      message: 'Equipment updated successfully',
      data: equipment
    });
  } catch (error) {
    console.error('Update equipment error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
};

/**
 * Delete equipment
 */
exports.deleteEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user.id;

    const equipment = await VendorEquipment.findOneAndDelete({ _id: id, vendorId });
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }

    res.status(200).json({ success: true, message: 'Equipment removed from inventory' });
  } catch (error) {
    console.error('Delete equipment error:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
};

/**
 * Machinery Booking Management (Vendor directly manages work)
 */

// 1. Accept/Reject Booking
exports.respondToRentalBooking = async (req, res) => {
  // Same rules as the main vendor endpoints: delegate so there is exactly one accept/reject implementation.
  const vendorBooking = require('../bookingControllers/vendorBookingController');
  const { status } = req.body;
  req.params.id = req.params.bookingId;
  if (status === 'accepted') return vendorBooking.acceptBooking(req, res);
  if (status === 'rejected') return vendorBooking.rejectBooking(req, res);
  return res.status(400).json({ success: false, message: "status must be 'accepted' or 'rejected'" });
};

// Start / complete work now share the verified trip flow (start OTP, timer, single billing, payment OTP).
exports.startMachineryWork = (req, res) => {
  req.params.id = req.params.bookingId;
  return require('../bookingControllers/vendorBookingController').machineryStart(req, res);
};

exports.completeMachineryWork = (req, res) => {
  req.params.id = req.params.bookingId;
  return require('../bookingControllers/vendorBookingController').machineryComplete(req, res);
};

/**
 * Equipment Return Handover & Damage Claims (Vendor Side)
 */

// Vendor confirms equipment return received and inspected
exports.confirmRentalReturn = async (req, res) => {
  try {
    const bookingId = req.params.bookingId || req.params.id;
    const vendorId = req.user.id;
    const { notes } = req.body;

    // 1. Try finding RentalTransaction
    let rental = await RentalTransaction.findOne({ _id: bookingId, vendorId });
    if (rental) {
      rental.vendorConfirmedReturn = true;
      if (notes) rental.handoverNotes = notes;

      if (rental.farmerConfirmedReturn) {
        rental.status = 'returned';
        if (!rental.damageReport?.reportedBy) {
          rental.depositRefundStatus = 'released'; // Auto-release deposit
        }
      }

      await rental.save();
      return res.status(200).json({
        success: true,
        message: 'Equipment return confirmed and received by vendor',
        data: rental
      });
    }

    // 2. Try finding Booking
    const booking = await Booking.findOne({ _id: bookingId, vendorId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Rental booking not found' });
    }

    if (!booking.rentalHandover) {
      booking.rentalHandover = {};
    }

    booking.rentalHandover.vendorConfirmedReturn = true;
    booking.rentalHandover.vendorConfirmedAt = new Date();
    if (notes) booking.rentalHandover.returnNotes = notes;

    if (booking.rentalHandover.farmerConfirmedReturn) {
      booking.rentalHandover.returnStatus = 'returned';
      if (!booking.damageReport?.reported) {
        booking.rentalHandover.depositRefundStatus = 'released';
      }
    } else {
      booking.rentalHandover.returnStatus = 'vendor_received';
    }

    await booking.save();
    return res.status(200).json({
      success: true,
      message: 'Equipment return confirmed and received by vendor',
      data: {
        _id: booking._id,
        rentalHandover: booking.rentalHandover,
        damageReport: booking.damageReport
      }
    });
  } catch (error) {
    console.error('Vendor confirm return error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Vendor reports damage and files claim on security deposit
exports.reportRentalDamage = async (req, res) => {
  try {
    const bookingId = req.params.bookingId || req.params.id;
    const vendorId = req.user.id;
    const { description, photos, estimatedCost, severity } = req.body;

    if (!description?.trim()) {
      return res.status(400).json({ success: false, message: 'Description of damage is required' });
    }

    // 1. Try finding RentalTransaction
    let rental = await RentalTransaction.findOne({ _id: bookingId, vendorId });
    if (rental) {
      if (rental.damageReport?.reportedBy) {
        return res.status(400).json({ success: false, message: 'A damage report already exists for this rental' });
      }

      rental.status = 'disputed';
      rental.depositRefundStatus = 'pending'; // Freezes deposit in escrow
      rental.damageReport = {
        reportedBy: vendorId,
        reporterRole: 'Vendor',
        description,
        photos: photos || [],
        estimatedCost: Number(estimatedCost) || 0,
        severity: severity || 'minor',
        reportedAt: new Date()
      };

      await rental.save();
      return res.status(200).json({
        success: true,
        message: 'Damage reported successfully. AgroYilt admin will review the claim.',
        data: rental
      });
    }

    // 2. Try finding Booking
    const booking = await Booking.findOne({ _id: bookingId, vendorId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Rental booking not found' });
    }

    if (booking.damageReport?.reported) {
      return res.status(400).json({ success: false, message: 'A damage report already exists for this booking' });
    }

    if (!booking.rentalHandover) {
      booking.rentalHandover = {};
    }

    booking.rentalHandover.returnStatus = 'disputed';
    booking.rentalHandover.depositRefundStatus = 'pending'; // Freezes deposit in escrow
    booking.damageReport = {
      reported: true,
      reportedBy: vendorId,
      reporterRole: 'Vendor',
      description,
      photos: photos || [],
      estimatedCost: Number(estimatedCost) || 0,
      severity: severity || 'minor',
      reportedAt: new Date(),
      status: 'reported'
    };

    await booking.save();
    return res.status(200).json({
      success: true,
      message: 'Damage reported successfully. AgroYilt admin will review the claim.',
      data: {
        _id: booking._id,
        rentalHandover: booking.rentalHandover,
        damageReport: booking.damageReport
      }
    });
  } catch (error) {
    console.error('Vendor report damage error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Vendor gets current rental handover and damage status
exports.getRentalHandoverStatus = async (req, res) => {
  try {
    const bookingId = req.params.bookingId || req.params.id;
    const vendorId = req.user.id;

    let rental = await RentalTransaction.findOne({ _id: bookingId, vendorId })
      .populate('equipmentId')
      .populate('farmerId', 'name phone profileImage addresses');

    if (rental) {
      return res.status(200).json({ success: true, data: rental, type: 'RentalTransaction' });
    }

    const booking = await Booking.findOne({ _id: bookingId, vendorId })
      .populate('equipmentId')
      .populate('userId', 'name phone profileImage addresses');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Rental record not found' });
    }

    return res.status(200).json({
      success: true,
      type: 'Booking',
      data: {
        _id: booking._id,
        bookingNumber: booking.bookingNumber,
        equipmentId: booking.equipmentId,
        farmer: booking.userId,
        status: booking.status,
        rentalAmount: booking.finalAmount || booking.amount,
        securityDeposit: booking.equipmentId?.pricing?.security_deposit || 0,
        rentalHandover: booking.rentalHandover || {},
        damageReport: booking.damageReport || {},
        farmerConfirmedReturn: booking.rentalHandover?.farmerConfirmedReturn || false,
        vendorConfirmedReturn: booking.rentalHandover?.vendorConfirmedReturn || false,
        depositRefundStatus: booking.rentalHandover?.depositRefundStatus || 'pending'
      }
    });
  } catch (error) {
    console.error('Vendor get rental status error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

