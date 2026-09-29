const VendorEquipment = require('../../models/VendorEquipment');
const Category = require('../../models/Category');
const Vendor = require('../../models/Vendor');
const Service = require('../../models/Service');
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

    // 4. Create equipment
    const equipment = await VendorEquipment.create({
      vendorId,
      categoryId: categoryId || null,
      serviceId: serviceId || null,
      requestedCategoryName: requestedCategoryName || null,
      listingType: listingType || 'service',
      implements: implementsList || [],
      subCategoryIds: subCategoryIds || [],
      name,
      modelNumber,
      year,
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
    if (updateData.categoryId && updateData.categoryId !== equipment.categoryId.toString()) {
      updateData.status = 'pending';
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
  try {
    const vendorId = req.user.id;
    const { bookingId } = req.params;
    const { status } = req.body; // 'accepted' or 'rejected'

    const Booking = require('../../models/Booking');
    const { BOOKING_STATUS } = require('../../utils/constants');
    const { createNotification } = require('../notificationControllers/notificationController');

    const booking = await Booking.findOne({ _id: bookingId, vendorId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (status === 'accepted') {
      booking.status = BOOKING_STATUS.CONFIRMED;
      // Generate Start OTP for farmer
      const startOtp = Math.floor(1000 + Math.random() * 9000).toString();
      booking.driver_start_otp = startOtp;
      
      await booking.save();

      // Notify Farmer
      await createNotification({
        userId: booking.userId,
        type: 'worker_accepted',
        title: 'Machinery Booking Confirmed!',
        message: `Your booking #${booking.bookingNumber} is confirmed. Share OTP ${startOtp} with the driver only when they arrive at your farm.`,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high'
      });

    } else {
      booking.status = BOOKING_STATUS.CANCELLED;
      booking.cancellationReason = 'Rejected by Vendor';
      await booking.save();

      await createNotification({
        userId: booking.userId,
        type: 'booking_cancelled',
        title: 'Machinery Booking Rejected',
        message: `Vendor has rejected your machinery booking #${booking.bookingNumber}.`,
        relatedId: booking._id,
        relatedType: 'booking'
      });
    }

    res.status(200).json({ success: true, message: `Booking ${status} successfully`, data: booking });
  } catch (err) {
    console.error('Respond to rental error:', err);
    res.status(500).json({ success: false, message: 'Process failed' });
  }
};

// 2. Start Work (Vendor/Driver inputs Farmer OTP)
// For 'service' (Tractor): requires KM/Odometer photo
// For 'rental' (Tool/Pump): requires condition photo only
exports.startMachineryWork = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { bookingId } = req.params;
    const { otp, startKmPhoto, conditionPhoto } = req.body;

    const Booking = require('../../models/Booking');
    const { BOOKING_STATUS } = require('../../utils/constants');

    const booking = await Booking.findOne({ _id: bookingId, vendorId }).select('+driver_start_otp');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.driver_start_otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid Start OTP from Farmer' });
    }

    // Adaptive tracking: check listingType from the SPECIFIC equipment linked to this booking
    const equipment = await VendorEquipment.findById(booking.serviceId).select('listingType');
    const isRentalType = equipment?.listingType === 'rental';

    if (isRentalType) {
      // Tool/Pump: condition photo is optional
      booking.start_kilometer_photo = conditionPhoto || startKmPhoto || null; // reuse existing field
    } else {
      // Machine Service (Tractor): KM photo is optional
      booking.start_kilometer_photo = startKmPhoto || null;
    }

    booking.status = BOOKING_STATUS.IN_PROGRESS;
    booking.startedAt = new Date();
    booking.driver_start_otp = undefined;
    await booking.save();

    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'work_started',
      title: isRentalType ? 'Equipment Handover Confirmed' : 'Machine Work In-Progress',
      message: isRentalType
        ? `Equipment for booking #${booking.bookingNumber} has been handed over. Happy farming!`
        : `Equipment work has started for booking #${booking.bookingNumber}.`,
      relatedId: booking._id,
      relatedType: 'booking'
    });

    res.status(200).json({ success: true, message: 'Work started', data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Start work failed' });
  }
};

// 3. Complete Work (Vendor inputs Final KM - Sends End OTP to Farmer)
exports.completeMachineryWork = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { bookingId } = req.params;
    const { endKmPhoto, workUnits, evidencePhoto } = req.body;

    const Booking = require('../../models/Booking');
    const { BOOKING_STATUS } = require('../../utils/constants');

    const booking = await Booking.findOne({ _id: bookingId, vendorId }).populate('serviceId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Calculate dynamic base price for the Trip
    const service = booking.serviceId || {};
    let baseAmount = booking.basePrice || 0;
    const now = new Date();
    const durationMs = now - (booking.startedAt || now);
    const durationHours = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60))); // Round up to nearest hour

    const durationDays = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));

    if (booking.rental_type === 'hourly') {
      baseAmount = (service.hourly_price || booking.basePrice || 0) * durationHours;
    } else if (booking.rental_type === 'land_based') {
      baseAmount = (service.land_price || booking.basePrice || 0) * (workUnits || 1);
    } else if (booking.rental_type === 'daily') {
      baseAmount = (service.daily_price || booking.basePrice || 0) * durationDays;
    }

    // Add per-implement charges (ONLY for those selected during booking)
    if (booking.selectedImplements && booking.selectedImplements.length > 0) {
      for (const impl of booking.selectedImplements) {
        const implPricing = impl.pricing;
        if (booking.rental_type === 'hourly' && implPricing?.hourly?.isEnabled) {
          baseAmount += (implPricing.hourly.price || 0) * durationHours;
        } else if (booking.rental_type === 'land_based' && implPricing?.land_based?.isEnabled) {
          baseAmount += (implPricing.land_based.price || 0) * (workUnits || 1);
        } else if (booking.rental_type === 'daily' && implPricing?.daily?.isEnabled) {
          baseAmount += (implPricing.daily.price || 0) * durationDays;
        }
      }
    }

    const endOtp = Math.floor(1000 + Math.random() * 9000).toString();
    booking.status = BOOKING_STATUS.WORK_DONE;
    booking.end_kilometer_photo = endKmPhoto;
    
    // Track dynamic billing updates
    if (baseAmount > 0) {
      booking.basePrice = baseAmount;
    }
    
    // Store evidence and working units temporarily if needed on details panel
    if (evidencePhoto) booking.work_evidence_photo = evidencePhoto;
    if (workUnits) booking.workUnits = workUnits;
    
    booking.driver_end_otp = endOtp;
    await booking.save();

    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'work_completed',
      title: 'Machine Work Completed!',
      message: `Work finished for #${booking.bookingNumber}. Please share OTP ${endOtp} with the driver only if you are satisfied.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high'
    });

    res.status(200).json({ success: true, message: 'Work marked as done. OTP sent to farmer.', data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Completion failed' });
  }
};

