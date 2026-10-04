const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const Service = require('../../models/Service');
const Category = require('../../models/Category');
const Plan = require('../../models/Plan');
const Cart = require('../../models/Cart');
const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');
const Review = require('../../models/Review');
const Settings = require('../../models/Settings');
const VendorEquipment = require('../../models/VendorEquipment');
const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
const { validationResult } = require('express-validator');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');
const { createNotification } = require('../notificationControllers/notificationController');
const { dispatchVendorRequest } = require('../../services/bookingSettlementService');
const { sendNotificationToUser, sendNotificationToVendor, sendNotificationToWorker } = require('../../services/firebaseAdmin');
const { sendNewBookingNotification } = require('../../services/firebaseNotificationService');
const { parseTimeToMinutes, parseSlotInterval, isIntervalOverlapping, validateSchedule } = require('../../utils/timeSlotHelper');
const {
  vendorIneligibleReason,
  findVendorSlotConflict,
  CONFLICT_STATUSES,
  cancelBookingWithRefund,
  refundToWallet,
  getAdvancePaid,
  expireOpenRequests,
  releaseVendorIfIdle,
  generateDistinctOtp
} = require('../../services/bookingSettlementService');

const MAX_OPEN_REQUESTS_PER_FARMER = 5;

/** Atomically moves a booking to CANCELLED on behalf of the farmer (refund is handled by the caller). */
const cancelBookingWithRefundNoRefund = async (bookingId, userId, reason, allowedStatuses) => {
  const doc = await Booking.findOneAndUpdate(
    { _id: bookingId, userId, status: { $in: allowedStatuses } },
    { $set: { status: BOOKING_STATUS.CANCELLED, cancelledAt: new Date(), cancelledBy: 'user', cancellationReason: reason || 'Cancelled by user' } },
    { new: true }
  );
  if (doc && doc.serviceTimer && ['RUNNING', 'PAUSED'].includes(doc.serviceTimer.status)) {
    require('../../services/bookingSettlementService').closeServiceTimer(doc, new Date(), 'STOPPED');
    await doc.save();
  }
  return { booking: doc };
};

/**
 * Create a new booking
 */
const createBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    let {
      serviceId,
      vendorId,
      address,
      scheduledDate,
      scheduledTime,
      timeSlot,
      userNotes,
      paymentMethod,
      amount,
      isPlusAdded,
      bookedItems, // Array of specific items from cart
      visitingCharges: reqVisitingCharges,
      visitationFee: reqVisitationFee, // Backward compatibility
      basePrice: reqBasePrice,
      discount: reqDiscount,
      tax: reqTax,
      // Metadata from frontend
      serviceCategory: reqServiceCategory,
      categoryIcon: reqCategoryIcon,
      brandName: reqBrandName,
      brandIcon: reqBrandIcon,
      bookingType, // Extract bookingType
      rental_type,  // Agriculture: extract rental_type
      cropType,     // Agriculture: extract cropType
      chemicalUsed, // Agriculture: chemical to spray
      landSize,      // Agriculture: extract landSize
      endDate,      // Agriculture: extract range end
      estimatedDuration, // Agriculture: extract hours
      selectedImplements, // MACHINERY: attachments chosen by user
      equipmentId   // NEW: For direct marketplace booking of specific equipment
    } = req.body;

    // --- TIME VALIDATION (timezone-aware: past dates, passed slots, >90 days ahead) ---
    const schedule = validateSchedule(scheduledDate, timeSlot);
    if (!schedule.ok) {
      return res.status(400).json({ success: false, message: schedule.message });
    }

    // Anti-hoarding: a farmer can only have a handful of unanswered requests at once
    const openRequests = await Booking.countDocuments({
      userId, status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] }
    });
    if (openRequests >= MAX_OPEN_REQUESTS_PER_FARMER) {
      return res.status(429).json({
        success: false,
        message: 'You have too many pending booking requests. Please wait for vendors to respond or cancel some first.'
      });
    }
    // --- END TIME VALIDATION ---

    // Visiting charges are set by the platform (Settings), never by the client.
    let visitingCharges = 0;

    // Calculate total value from booked items or fallback to base (Move to top)
    let totalServiceValue = 0;
    if (bookedItems && bookedItems.length > 0) {
      totalServiceValue = bookedItems.reduce((sum, item) => {
        const itemPrice = item.card?.price || item.price || 0;
        return sum + (itemPrice * (item.quantity || 1));
      }, 0);
    }
    // Note: Fallback to service.basePrice is done later if totalServiceValue is 0 AND service is loaded.
    // But we need 'service' to define fallback.
    // 'service' is loaded at line 46.
    // So we must calculate it AFTER loading service but BEFORE usage.
    // Usage is at line 98. Service loaded at 46.
    // So distinct placement: AFTER line 52.

    // Handle serviceId if it's an object (from populated cart data)
    if (typeof serviceId === 'object' && serviceId._id) {
      serviceId = serviceId._id;
    }

    // Verify service exists (or check if serviceId is an Independent Worker or Category ID)
    let service = await Service.findById(serviceId);
    let requestedWorker = null;

    if (!service) {
      requestedWorker = await Worker.findById(serviceId);
      if (requestedWorker) {
        service = {
          _id: requestedWorker._id,
          title: requestedWorker.name,
          category: reqServiceCategory || 'Labour',
          basePrice: requestedWorker.hourlyRate || requestedWorker.dailyRate || requestedWorker.landRate || 250,
          hourly_price: requestedWorker.hourlyRate || 0,
          daily_price: requestedWorker.dailyRate || 0,
          land_price: requestedWorker.landRate || 0,
          isWorkerProfile: true
        };
      }
    }

    if (!service) {
      const catObj = await Category.findById(serviceId);
      if (catObj) {
        service = {
          _id: catObj._id,
          title: catObj.title,
          category: catObj.title,
          basePrice: 250,
          hourly_price: 250,
          daily_price: 500,
          land_price: 300
        };
      }
    }

    if (!service) {
      const equipObj = await VendorEquipment.findById(serviceId);
      if (equipObj) {
        equipmentId = equipObj._id; // Set equipmentId for downstream use
        const catObj = await Category.findById(equipObj.categoryId);
        service = {
          _id: equipObj._id,
          title: equipObj.name,
          category: catObj ? catObj.title : 'Agriculture',
          categoryId: equipObj.categoryId,
          basePrice: equipObj.pricing?.hourly?.price || 500,
          hourly_price: equipObj.pricing?.hourly?.price || 0,
          daily_price: equipObj.pricing?.daily?.price || 0,
          land_price: equipObj.pricing?.land_based?.price || 0
        };
      }
    }

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service, Worker, or Category not found'
      });
    }

    // Get category for the service FIRST (needed for Agri check)
    const categoryId = service.categoryId || service.categoryIds?.[0];
    const category = categoryId ? await Category.findById(categoryId) : null;

    // Calculate total value from booked items or fallback to service base price immediately after service load
    const isAgriService = !!(
      equipmentId ||
      rental_type ||
      service.rental_type ||
      service.category === 'Agriculture' ||
      (category && ['agriculture', 'machinery', 'tractor', 'equipment', 'farm equipment'].includes(category.title?.toLowerCase())) ||
      (reqServiceCategory && ['agriculture', 'machinery', 'tractor', 'equipment', 'farm equipment'].some(c => reqServiceCategory.toLowerCase().includes(c))) ||
      (service.serviceCategory && ['agriculture', 'machinery', 'tractor', 'equipment', 'farm equipment'].some(c => service.serviceCategory.toLowerCase().includes(c))) ||
      (service.title && ['tractor', 'rotavator', 'harvester', 'cultivator', 'plough', 'drone'].some(k => service.title.toLowerCase().includes(k)))
    );

    let equipmentObj = null;
    let calculatedDurationMinutes = null; // hoisted: persisted on the booking below

    if (isAgriService) {
      // ── Agriculture Dynamic Multiplier Logic ──
      let multiplier = 1;

      if (rental_type === 'hourly') {
        if (timeSlot && timeSlot.start && timeSlot.end) {
          const [startHours, startMinutes] = timeSlot.start.split(':').map(Number);
          const [endHours, endMinutes] = timeSlot.end.split(':').map(Number);
          calculatedDurationMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
          
          if (calculatedDurationMinutes <= 0) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
          }
          if (calculatedDurationMinutes < 30) {
            return res.status(400).json({ success: false, message: 'Hourly booking must be at least 30 minutes.' });
          }
          if (calculatedDurationMinutes % 30 !== 0) {
            return res.status(400).json({ success: false, message: 'Hourly booking duration must be in 30-minute increments.' });
          }
          multiplier = calculatedDurationMinutes / 60;
        } else {
          return res.status(400).json({ success: false, message: 'Start and end time required for hourly bookings.' });
        }
      } else if (rental_type === 'land_based') {
        const parsedArea = parseFloat(String(landSize).replace(/[^\d.]/g, ''));
        multiplier = isNaN(parsedArea) ? 1 : Math.max(0.5, parsedArea);
      } else if (rental_type === 'daily' || rental_type === 'monthly') {
        multiplier = Math.max(1, parseInt(estimatedDuration, 10)) || 1;
      }

      if (equipmentId) {
        equipmentObj = await VendorEquipment.findById(equipmentId);
      }

      // Determine correct unit rate 
      // NEW: Prioritize vendor's actual equipment price over Admin's template cap
      let unitRate = service.basePrice || 500;
      
      if (equipmentObj && equipmentObj.pricing) {
        const ep = equipmentObj.pricing;
        if (rental_type === 'hourly' && ep.hourly?.isEnabled) unitRate = ep.hourly.price;
        else if (rental_type === 'land_based' && ep.land_based?.isEnabled) unitRate = ep.land_based.price;
        else if (rental_type === 'daily' && ep.daily?.isEnabled) unitRate = ep.daily.price;
      } else {
        // Fallback to Admin caps
        if (rental_type === 'hourly' && service.hourly_price) unitRate = service.hourly_price;
        else if (rental_type === 'land_based' && service.land_price) unitRate = service.land_price;
        else if ((rental_type === 'daily' || rental_type === 'monthly') && service.daily_price) unitRate = service.daily_price;
        else if (service.basePrice) unitRate = service.basePrice;
      }

      let finalMultiplier = multiplier;
      if (rental_type === 'monthly') finalMultiplier = multiplier * 30;

      const mainAgriPrice = Math.round(unitRate * finalMultiplier);
      
      // Update the price of the main service in bookedItems to reflect the calculated Agri price
      // This ensures the items list and basePrice are consistent.
      if (Array.isArray(bookedItems) && bookedItems.length > 0) {
        let mainItemHandled = false;
        bookedItems.forEach(item => {
          const itemTitle = item.card?.title || item.title;
          if (itemTitle === service.title && !mainItemHandled) {
            // Update this item's price with the calculated agri price
            if (item.card) item.card.price = mainAgriPrice;
            else item.price = mainAgriPrice;
            mainItemHandled = true;
          }
        });

        // Recalculate totalServiceValue from the updated items
        totalServiceValue = bookedItems.reduce((sum, item) => {
          const itemPrice = item.card?.price || item.price || 0;
          return sum + (itemPrice * (item.quantity || 1));
        }, 0);
      } else {
        totalServiceValue = mainAgriPrice;
      }
      
      // --- ADD IMPLEMENT PRICING ---
      if (Array.isArray(selectedImplements) && selectedImplements.length > 0) {
        selectedImplements.forEach(impl => {
          const implPriceObj = impl.pricing?.[rental_type];
          if (implPriceObj && implPriceObj.isEnabled) {
            const implRate = implPriceObj.price || 0;
            totalServiceValue += Math.round(implRate * finalMultiplier);
          }
        });
      }
      
      console.log(`[AgriPricing] unitRate=${unitRate}, multiplier=${multiplier}, totalServiceValue=${totalServiceValue}`);
    } else if (totalServiceValue === 0) { 
      // Standard services
      totalServiceValue = service.basePrice || 500;
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check for Pending Penalty
    const pendingPenalty = user.wallet?.penalty || 0;

    // Don't assign vendor initially - send to nearby vendors instead
    // Vendor will be assigned when a vendor accepts the booking

    // --- LOCATION AND PROVIDER SEARCH ---
    const { findNearbyVendors, findNearbyWorkers, geocodeAddress } = require('../../services/locationService');

    // Determine booking location (prioritize frontend coordinates)
    let bookingLocation;
    if (address.lat && address.lng) {
      bookingLocation = { lat: address.lat, lng: address.lng };
      console.log('Using provided coordinates for provider search:', bookingLocation);
    } else {
      bookingLocation = await geocodeAddress(
        `${address.addressLine1}, ${address.city}, ${address.state} ${address.pincode}`
      );
      console.log('Geocoded address for provider search:', bookingLocation);
    }

    // Determine provider type
    const isWorkerBooking = !!requestedWorker || service.isWorkerProfile || category?.bookingType === 'WORKER' || reqServiceCategory?.toLowerCase().includes('labour') || reqServiceCategory?.toLowerCase().includes('worker');
    const providerType = isWorkerBooking ? 'WORKER' : 'VENDOR';

    let nearbyVendors = [];
    let nearbyWorkers = [];
    let usedRadius = 2;
    const searchRadii = [2, 5, 8, 10, 15, 20, 30];

    if (providerType === 'VENDOR') {
      const targetedVendorId = vendorId || (equipmentObj ? equipmentObj.vendorId : null);
      if (targetedVendorId) {
        // Targeted single-vendor flow: alert ONLY the selected vendor
        const specificVendor = await Vendor.findById(targetedVendorId);
        if (specificVendor) {
          specificVendor.distance = 0;
          nearbyVendors.push(specificVendor);
          console.log(`[CreateBooking] Single-vendor targeted flow: vendor directly added ${specificVendor._id}`);
        }
      } else {
        // Non-targeted standard services: broadcast to nearby vendors
        const vendorFilters = {
          ...(category ? { service: category.title } : {}),
          checkCashLimit: paymentMethod === 'cash'
        };

        for (const radius of searchRadii) {
          usedRadius = radius;
          const found = await findNearbyVendors(bookingLocation, radius, vendorFilters);
          const filtered = (found || []).filter(v => v.availability === 'AVAILABLE' || v.availability === 'OFFLINE');
          if (filtered.length > 0) {
            nearbyVendors = [...nearbyVendors, ...filtered];
            break; // Stop expanding radius if we found available vendors
          }
        }
      }

      // Deduplicate nearbyVendors by _id to prevent duplicate notifications
      const uniqueVendorIds = new Set();
      nearbyVendors = nearbyVendors.filter(vendor => {
        const idStr = (vendor._id || vendor.id).toString();
        if (uniqueVendorIds.has(idStr)) return false;
        uniqueVendorIds.add(idStr);
        return true;
      });

      console.log(`[CreateBooking] Found ${nearbyVendors.length} nearby vendors for booking within ${usedRadius}km`);
    } else {
      // Find workers within dynamic radius
      if (requestedWorker) {
        nearbyWorkers = [requestedWorker];
      } else {
        const workerFilters = {};
        
        for (const radius of searchRadii) {
          usedRadius = radius;
          nearbyWorkers = await findNearbyWorkers(bookingLocation, radius, workerFilters);
          
          if (nearbyWorkers && nearbyWorkers.length > 0) {
            break; 
          }
        }
      }

      // Deduplicate nearbyWorkers
      const uniqueWorkerIds = new Set();
      nearbyWorkers = nearbyWorkers.filter(worker => {
        const idStr = worker._id.toString();
        if (uniqueWorkerIds.has(idStr)) return false;
        uniqueWorkerIds.add(idStr);
        return true;
      });

      console.log(`[CreateBooking] Found ${nearbyWorkers.length} nearby workers for booking within ${usedRadius}km`);
    }
    // --- END PROVIDER SEARCH BLOCK ---

    // Direct-vendor eligibility: approved, active, not cash-blocked, and the machine really is theirs & live
    if (providerType === 'VENDOR') {
      const directVendorId = vendorId || (equipmentObj ? equipmentObj.vendorId : null);
      if (directVendorId) {
        const directVendor = await Vendor.findById(directVendorId).select('approvalStatus isActive wallet');
        const reason = vendorIneligibleReason(directVendor);
        if (reason) {
          return res.status(400).json({ success: false, message: reason });
        }
        if (equipmentObj) {
          if (String(equipmentObj.vendorId) !== String(directVendorId)) {
            return res.status(400).json({ success: false, message: 'The selected equipment does not belong to the selected vendor.' });
          }
          if (!['active', 'approved'].includes(equipmentObj.status)) {
            return res.status(400).json({ success: false, message: 'The selected equipment is not available for booking.' });
          }
        }
      }
    }

    // Calculate pricing - use amount from frontend if provided, otherwise calculate
    let basePrice, discount, tax, finalAmount;
    let bookingStatus = BOOKING_STATUS.SEARCHING;
    let bookingPaymentStatus = PAYMENT_STATUS.PENDING;

    // -------------------------------------------------------------------------
    // PRICING CALCULATION LOGIC
    // -------------------------------------------------------------------------

    // 1. Determine if we can use Plan Benefits
    let usePlanBenefits = false;
    if (paymentMethod === 'plan_benefit') {
      if (user.plans && user.plans.isActive) {
        if (user.plans.expiry && new Date() > new Date(user.plans.expiry)) {
          // Plan expired - update status and FALLBACK to normal
          console.log(`[CreateBooking] Plan expired for user ${userId}. Falling back to normal booking.`);
          user.plans.isActive = false;
          await user.save();
          paymentMethod = 'pay_at_home'; // Fallback to Pay at Home
        } else {
          usePlanBenefits = true;
        }
      } else {
        // No active plan or invalid status - Fallback
        paymentMethod = 'pay_at_home';
      }
    }

    // 2. Logic Branch: Plan Benefit vs Standard
    if (usePlanBenefits) {
      // Prioritize planId if available
      let userPlan = null;
      if (user.plans.planId) {
          userPlan = await Plan.findById(user.plans.planId);
      }
      if (!userPlan && user.plans.name) {
          userPlan = await Plan.findOne({ name: user.plans.name });
      }

      if (!userPlan) {
        // Fallback if data missing
        usePlanBenefits = false;
        paymentMethod = 'pay_at_home';
      } else {
        // --- IMPROVED PLAN LOGIC: PERCENTAGE DISCOUNTS & FREE DELIVERY & FREE SERVICES ---

        // Helper to normalize ObjectIds for comparison
        const normalizeId = (id) => {
            if (!id) return null;
            if (typeof id === 'string') return id;
            if (id.toString) return id.toString();
            return String(id);
        };

        let finalCategory = category;
        if (!finalCategory && service.category) {
          finalCategory = await Category.findOne({ title: service.category });
        }

        const serviceIdStr = normalizeId(service._id);
        const categoryIdStr = normalizeId(finalCategory?._id || categoryId);
        
        let isFreeBrand = false;
        if (service.brandId) {
            isFreeBrand = userPlan.freeBrands?.some(id => normalizeId(id) === normalizeId(service.brandId));
        }

        const isFreeService = userPlan.freeServices?.some(id => normalizeId(id) === serviceIdStr);
        const isFreeCategory = userPlan.freeCategories?.some(id => normalizeId(id) === categoryIdStr);

        // 1. Check if the core service itself is 100% Free
        if (isFreeService || isFreeCategory || isFreeBrand) {
            totalServiceValue = 0;
            basePrice = 0;
        }        
        // 2. Equipment Rental Discount
        const isRental = !!(rental_type || service.rental_type);
        const rentalDiscount = isRental ? (userPlan.rentalDiscountPercentage || 0) : 0;

        // 3. Marketplace Product Discount
        let totalProductDiscount = 0;
        if (bookedItems && bookedItems.length > 0 && userPlan.marketplaceDiscountPercentage > 0) {
          bookedItems.forEach(item => {
            if (item.type === 'product' || item.category === 'Marketplace') {
              const itemPrice = item.card?.price || item.price || 0;
              const itemTotal = itemPrice * (item.quantity || 1);
              totalProductDiscount += (itemTotal * (userPlan.marketplaceDiscountPercentage / 100));
            }
          });
        }

        // 4. Apply calculated discounts
        if (basePrice !== 0) {
             basePrice = totalServiceValue > 0 ? totalServiceValue : (service.basePrice || 500);
        }

        const rentalDiscountAmount = (basePrice * (rentalDiscount / 100));
        discount = Math.round(rentalDiscountAmount + totalProductDiscount);

        // 5. Free Transport/Delivery Check
        visitingCharges = (await Settings.findOne({ type: 'global' }))?.visitedCharges ?? 49;
        if (userPlan.freeTransport) {
            visitingCharges = 0; // Waive transport fee
        }

        tax = Math.round((basePrice - discount) * 0.18);
        finalAmount = (basePrice - discount + tax + visitingCharges) + pendingPenalty;

        bookingStatus = BOOKING_STATUS.SEARCHING;
        bookingPaymentStatus = PAYMENT_STATUS.PENDING;

        console.log(`[PlanBenefit] Applied ${rentalDiscount}% Rental Disc and ₹${totalProductDiscount} Product Disc, Free Transport: ${userPlan.freeTransport}`);
      }
    }

    // 3. Standard Pricing (Fallback) if NOT using Plan Benefits
    if (!usePlanBenefits) {
      const settings = await Settings.findOne({ type: 'global' });
      
      // Override visiting charges with settings unless it's a worker booking without conveyance or an agri/equipment booking
      const systemVisitingCharges = settings?.visitedCharges || 49;
      visitingCharges = isAgriService ? 0 : systemVisitingCharges;
      
      const gstPercentage = isAgriService ? (settings?.rentalGstPercentage || 5) : (settings?.serviceGstPercentage || 18);
      const gstDecMultiplier = gstPercentage / 100;

      if (isAgriService) {
        // ALWAYS trust backend for Agri/Equipment Flow. Disregard frontend amounts.
        basePrice = totalServiceValue;
        discount = 0; // Standard flow has no discount unless added by admin/coupons (TBD)
        visitingCharges = 0; // Agri/equipment bookings have FREE conveyance/mobilization!
        tax = Math.round(basePrice * gstDecMultiplier);
        finalAmount = basePrice - discount + tax + visitingCharges + pendingPenalty;
        console.log(`[CreateBooking] Backend calculated Agri Price: Base=${basePrice}, Tax=${tax}, Total=${finalAmount}`);
      } else {
        // Standard Services (Wait until we migrate these to full backend authoritativeness too)
        // For now, doing a safer recalculation
        const clientNums = [amount, reqBasePrice, reqDiscount].filter(v => v !== undefined && v !== null);
        if (clientNums.some(v => !Number.isFinite(Number(v)) || Number(v) < 0)) {
          return res.status(400).json({ success: false, message: 'Invalid price details' });
        }
        const priceFloor = Number(service.priceRangeMin) > 0 ? Number(service.priceRangeMin) : 0;
        const clientBase = reqBasePrice !== undefined ? Number(reqBasePrice) : (amount ? Number(amount) - Number(visitingCharges) : undefined);
        if (clientBase !== undefined && clientBase < priceFloor) {
          return res.status(400).json({ success: false, message: 'The submitted price is below the minimum for this service.' });
        }
        if (reqDiscount !== undefined && Number(reqDiscount) > (reqBasePrice !== undefined ? Number(reqBasePrice) : Infinity)) {
          return res.status(400).json({ success: false, message: 'Discount cannot exceed the price.' });
        }
        if (amount && amount > 0) {
           if (reqBasePrice !== undefined) {
               basePrice = reqBasePrice;
               discount = reqDiscount || 0;
               tax = Math.round((basePrice - discount) * gstDecMultiplier);
               finalAmount = (basePrice - discount + tax + visitingCharges) + pendingPenalty;
           } else {
               basePrice = Math.round((amount - visitingCharges) / (1 + gstDecMultiplier));
               tax = amount - basePrice - visitingCharges;
               finalAmount = amount + pendingPenalty;
               discount = 0;
           }
        } else {
           basePrice = service.basePrice || 500;
           discount = service.discountPrice ? (basePrice - service.discountPrice) : 0;
           tax = Math.round((basePrice - discount) * gstDecMultiplier);
           finalAmount = (basePrice - discount + tax + visitingCharges) + pendingPenalty;
        }
      }
    }

    // NOTE: vendor earnings are NOT calculated at booking creation.
    // They are computed ONLY at bill generation (completeSelfJob) and stored in VendorBill.
    // This prevents inconsistency between Booking and VendorBill.
    console.log(`[CreateBooking] Payment=${paymentMethod}, FinalAmount=${finalAmount}, Penalty=${pendingPenalty}`);

    // NOTE: the carried-over penalty is cleared only after the booking is safely created (see end of createBooking).

    // Ensure minimum amount for Razorpay (₹1) for paid bookings
    if (isNaN(finalAmount) || finalAmount < 1) {
      if (paymentMethod !== 'plan_benefit') {
        finalAmount = 1;
      } else {
        finalAmount = 0;
      }
    }
    
    // Ensure numeric fields are valid
    basePrice = Number(basePrice) || 0;
    discount = Number(discount) || 0;
    tax = Number(tax) || 0;
    visitingCharges = Number(visitingCharges) || 0;
    finalAmount = Number(finalAmount) || 0;

    // Create booking
    const bookingNumber = `BK${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Improve Category Fetching if ID is missing (Fallback to title match)
    let finalCategory = category;
    if (!finalCategory && service.category) {
      // Try finding by name if ID lookup failed
      finalCategory = await Category.findOne({ title: service.category });
    }

    // Map booked items to new schema (sectionTitle -> brandName)
    const formattedBookedItems = (Array.isArray(bookedItems) && bookedItems.length > 0) ? bookedItems.map(item => ({
      brandName: item.brandName || item.sectionTitle || item.brand || '', // Robust fallback
      brandIcon: item.brandIcon || item.sectionIcon || item.icon || null,
      card: item.card || item,
      quantity: item.quantity || 1
    })) : [];

    console.log('[CreateBooking] About to save with formatted items:', JSON.stringify(formattedBookedItems, null, 2));

    // Extract Visual Identity Details
    const categoryIcon = finalCategory?.icon || finalCategory?.image || service.iconUrl || 'https://cdn-icons-png.flaticon.com/512/3500/3500833.png';
    let brandName = null;
    let brandIcon = null;

    if (formattedBookedItems.length > 0) {
      // Try to find a distinct brand name
      const distinctBrands = [...new Set(formattedBookedItems.map(item => item.brandName).filter(Boolean))];
      if (distinctBrands.length > 0) {
        brandName = distinctBrands.join(', ');
      }

      // Try to find brand icon
      brandIcon = formattedBookedItems[0].brandIcon || null;
    }

    const booking = await Booking.create({
      bookingNumber,
      userId,
      vendorId: (vendorId || (equipmentObj ? equipmentObj.vendorId : null)) || null,
      equipmentId: equipmentId || (equipmentObj ? equipmentObj._id : null),
      workerId: requestedWorker ? requestedWorker._id : null, // Set workerId if directly requested
      providerType,
      serviceId,
      categoryId: finalCategory?._id || categoryId,
      serviceName: service.title,
      serviceCategory: reqServiceCategory || finalCategory?.title || service.category || 'General',
      // Visual Identity Fields
      categoryIcon: reqCategoryIcon || categoryIcon,
      brandName: reqBrandName || brandName,
      brandIcon: reqBrandIcon || brandIcon,
      bookingType: bookingType || 'scheduled',
      rental_type: rental_type || null,
      cropType: cropType || null,
      chemicalUsed: chemicalUsed || null,
      landSize: landSize || null,
      endDate: (endDate && !isNaN(new Date(endDate).getTime())) ? new Date(endDate) : null,
      estimatedDuration: (estimatedDuration !== undefined && estimatedDuration !== null && !isNaN(Number(estimatedDuration))) ? Number(estimatedDuration) : null,
      durationMinutes: calculatedDurationMinutes,

      description: service.description,
      serviceImages: service.images || [],
      bookedItems: formattedBookedItems,
      basePrice,
      discount,
      tax,
      gstPercentage,
      visitingCharges,
      penalty: pendingPenalty || 0,
      finalAmount,
      userPayableAmount: finalAmount,
      districtId: user?.districtId || address?.districtId || null,
      subDistrictId: user?.subDistrictId || address?.subDistrictId || null,
      address: {
        type: address.type || 'home',
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || '',
        city: address.city,
        district: address.district || user?.districtName || '',
        state: address.state,
        pincode: address.pincode,
        landmark: address.landmark || '',
        lat: address.lat || null,
        lng: address.lng || null
      },
      scheduledDate: new Date(scheduledDate),
      scheduledTime,
      timeSlot: {
        start: timeSlot.start,
        end: timeSlot.end
      },
      paymentMethod: paymentMethod || null,
      status: (providerType === 'VENDOR' && (vendorId || (equipmentObj && equipmentObj.vendorId))) ? BOOKING_STATUS.REQUESTED : bookingStatus,
      paymentStatus: bookingPaymentStatus,
      selectedImplements: selectedImplements || []
    });

    // NOTE: a client-supplied `isPlusAdded` flag must never grant a paid membership; plans are bought through the plan-order flow.

    let chosenVendor = null; // hoisted: used again after the targeted-vendor block
    const WAVE_1_COUNT = 3;
    const io = req.app.get('io');
    const BookingRequest = require('../../models/BookingRequest');

    if (providerType === 'VENDOR') {
      const targetVendorId = vendorId || (equipmentObj ? equipmentObj.vendorId : null);

      if (targetVendorId) {
        // TARGETED SINGLE-VENDOR FLOW: Send ONLY to the farmer's selected vendor
        chosenVendor = nearbyVendors.find(v => (v._id || v.id).toString() === targetVendorId.toString())
          || await Vendor.findById(targetVendorId);

        if (!chosenVendor) {
          await Booking.findByIdAndDelete(booking._id);
          return res.status(404).json({
            success: false,
            message: 'Selected vendor not found'
          });
        }

        // Conflict check: vendor must not have an overlapping booking for this slot
        const resolvedEquipId = equipmentId || (equipmentObj ? equipmentObj._id : null);
        const conflictBooking = await findVendorSlotConflict(
          { scheduledDate, timeSlot, scheduledTime, rental_type, equipmentId: resolvedEquipId },
          targetVendorId,
          { excludeId: booking._id, statuses: [BOOKING_STATUS.REQUESTED, ...CONFLICT_STATUSES] }
        );

        if (conflictBooking) {
          await Booking.findByIdAndDelete(booking._id);
          const isRequested = conflictBooking.status === BOOKING_STATUS.REQUESTED;
          return res.status(409).json({
            success: false,
            conflict: true,
            message: isRequested
              ? 'This vendor currently has a pending request for this time slot. Please choose another vendor or time slot.'
              : 'This vendor is already booked for this time slot. Please choose another vendor or time slot.'
          });
        }

        let vendorDist = chosenVendor?.distance || null;
        if (!vendorDist && chosenVendor?.geoLocation?.coordinates?.length === 2 && bookingLocation) {
          const { calculateDistance } = require('../../services/locationService');
          const [vLng, vLat] = chosenVendor.geoLocation.coordinates;
          if (vLat && vLng) {
            vendorDist = Math.round(calculateDistance(bookingLocation, { lat: vLat, lng: vLng }) * 10) / 10;
          }
        }

        booking.vendorId = targetVendorId;
        booking.equipmentId = equipmentId || (equipmentObj ? equipmentObj._id : null);
        // Pay-online bookings are held (vendor not alerted) until the payment is verified
        const holdForPayment = ['online', 'razorpay'].includes(paymentMethod) && finalAmount > 0 && !usePlanBenefits;
        booking.status = holdForPayment ? BOOKING_STATUS.AWAITING_PAYMENT : BOOKING_STATUS.REQUESTED;
        booking.requestHeldForPayment = holdForPayment;
        booking.potentialVendors = []; // NO WAVES
        booking.currentWave = 1;
        booking.waveStartedAt = new Date();
        booking.notifiedVendors = holdForPayment ? [] : [targetVendorId];
        await booking.save();

        // Two farmers racing for the same slot: the later request backs off
        const racer = await findVendorSlotConflict(
          { scheduledDate, timeSlot, scheduledTime, rental_type, equipmentId: resolvedEquipId },
          targetVendorId,
          { excludeId: booking._id, statuses: [BOOKING_STATUS.REQUESTED, ...CONFLICT_STATUSES], beatenBy: { field: 'createdAt', at: booking.createdAt, id: booking._id } }
        );
        if (racer) {
          await Booking.findByIdAndDelete(booking._id);
          return res.status(409).json({
            success: false,
            conflict: true,
            message: 'This vendor was just booked for this time slot. Please choose another vendor or time slot.'
          });
        }

        if (holdForPayment) {
          // Online payment first: the vendor is alerted only once the payment is verified (see applyOnlinePayment)
          console.log(`[CreateBooking] Holding request for vendor ${targetVendorId} until payment is verified`);
        } else {
          await dispatchVendorRequest(booking, { io, distance: vendorDist, chosenVendor });
        }
      } else {
        // Fallback if no specific vendor requested
        booking.vendorId = null;
        booking.status = BOOKING_STATUS.SEARCHING;
        booking.potentialVendors = [];
        await booking.save();
      }
    } else {
      // WORKER BLOCK
      const sortedWorkers = nearbyWorkers.sort((a, b) => (a.distance || 0) - (b.distance || 0));
      const wave1Workers = sortedWorkers.slice(0, WAVE_1_COUNT);

      booking.potentialWorkers = sortedWorkers.map(w => ({
        workerId: w._id,
        distance: w.distance || 0
      }));
      booking.currentWave = 1;
      booking.waveStartedAt = new Date();
      booking.notifiedWorkers = wave1Workers.map(w => w._id);
      await booking.save();

      if (wave1Workers.length > 0) {
        console.log(`[CreateBooking] Wave 1: Alerting ${wave1Workers.length} closest workers (of ${sortedWorkers.length} total)`);

        const bookingRequests = wave1Workers.map(worker => ({
          bookingId: booking._id,
          providerType: 'WORKER',
          workerId: worker._id,
          status: 'PENDING',
          wave: 1,
          distance: worker.distance || null,
          sentAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000) // Expires in 1 hour
        }));

        try {
          await BookingRequest.insertMany(bookingRequests, { ordered: false });
        } catch (err) {
          if (err.code !== 11000) console.error('[CreateBooking] BookingRequest insert error:', err);
        }

        if (io) {
          wave1Workers.forEach(worker => {
            io.to(`worker_${worker._id}`).emit('notification', {
              type: 'worker_booking_request',
              title: 'New Job Alert!',
              message: `New job request within ${worker.distance?.toFixed(1) || '?'}km!`,
              relatedId: booking._id,
              data: {
                requestId: booking._id, // Map to what the frontend expects
                bookingId: booking._id,
                serviceName: service.title,
                serviceCategory: category ? category.title : 'Category',
                customerName: user.name,
                customerPhone: user.phone,
                scheduledDate: scheduledDate,
                scheduledTime: scheduledTime,
                price: finalAmount,
                basePrice: basePrice,
                address: address,
                distance: worker.distance,
                brandName: service.brand || '',
                brandIcon: service.brandIcon || '',
                rental_type: service.pricingType || '',
                estimatedDuration: booking.estimatedDuration || '',
                landSize: address.landSize || '',
                playSound: true,
                isFarmerBroadcast: false // It's a direct booking request, not a broadcast
              }
            });
          });
        }
      } else {
        console.warn(`[CreateBooking] NO WORKERS FOUND nearby! Push notifications will not be sent.`);
      }
    }

    // Handle database notifications below

    // Save notifications to DB in background (don't await — don't block response)
    if (providerType === 'VENDOR' && typeof wave1Vendors !== 'undefined') {
      Promise.all(wave1Vendors.map(vendor =>
        createNotification({
          vendorId: vendor._id,
          type: 'booking_request',
          title: 'New Booking Request',
          message: `New service request for ${service.title} from ${user.name}`,
          relatedId: booking._id,
          relatedType: 'booking',
          data: {
            bookingId: booking._id,
            serviceName: service.title,
            customerName: user.name,
            customerPhone: user.phone,
            scheduledDate: scheduledDate,
            scheduledTime: scheduledTime,
            location: address,
            price: finalAmount,
            distance: vendor.distance
          },
          pushData: {
            type: 'new_booking',
            dataOnly: false,
            link: `/vendor/bookings/${booking._id}`
          }
        })
      )).catch(err => console.error('[Notification] Background save error (vendor):', err));
    } else if (providerType === 'WORKER' && typeof wave1Workers !== 'undefined') {
      Promise.all(wave1Workers.map(worker =>
        createNotification({
          workerId: worker._id,
          type: 'job_request',
          title: 'New Job Request',
          message: `New job request for ${service.title} from ${user.name}`,
          relatedId: booking._id,
          relatedType: 'booking',
          data: {
            bookingId: booking._id,
            serviceName: service.title,
            customerName: user.name,
            customerPhone: user.phone,
            scheduledDate: scheduledDate,
            scheduledTime: scheduledTime,
            location: address,
            price: finalAmount,
            distance: worker.distance
          },
          pushData: {
            type: 'new_job',
            dataOnly: false,
            link: `/worker/jobs/${booking._id}`
          }
        })
      )).catch(err => console.error('[Notification] Background save error (worker):', err));
    }

    // Populate booking details
    const populatedBooking = await Booking.findById(booking._id)
      .populate('userId', 'name phone email')
      .populate('serviceId', 'title iconUrl')
      .populate('categoryId', 'title slug requiresDriver');

    // NOTIFY USER: Send actionable notification so they can track status

    // Send notification to user.
    // If booking is held for online payment, suppress the push (user is still on the Razorpay screen).
    // A proper "Payment Successful / Booking Confirmed" push is sent once payment verifies.
    const isHeldForPayment = booking.requestHeldForPayment === true;
    await createNotification({
      userId,
      type: 'booking_requested',
      title: isHeldForPayment ? 'Complete Your Payment' : 'Booking Created',
      message: isHeldForPayment
        ? `Complete the payment of ₹${booking.finalAmount || booking.basePrice || 0} to confirm your booking ${booking.bookingNumber}.`
        : `Your booking ${booking.bookingNumber} has been created successfully.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'booking_requested',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`,
        // For held-payment bookings, send as a silent data-only push so the user isn't
        // notified of a "booking" before they have actually paid.
        dataOnly: isHeldForPayment
      }
    });

    // Clear user's cart (both category and main carts if applicable, generally all items for the user)
    // Ensures cart is empty after successful booking
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } }
    );

    // Send notification to vendor only if assigned directly and not already notified above
    let vendorObj = null;
    if (vendorId && !chosenVendor && booking.status !== BOOKING_STATUS.AWAITING_PAYMENT) {
      await createNotification({
        vendorId,
        type: 'booking_created',
        title: 'New Booking Received',
        message: `You have received a new booking ${booking.bookingNumber} for ${service.title}.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'booking_created',
          bookingId: booking._id.toString(),
          link: `/vendor/booking/${booking._id}`
        }
      });
      // Fetch vendor details for email
      const Vendor = require('../../models/Vendor');
      vendorObj = await Vendor.findById(vendorId);
    } else if (vendorId) {
      const Vendor = require('../../models/Vendor');
      vendorObj = await Vendor.findById(vendorId);
    }

    // SEND EMAILS (Confirmation)
    const { sendBookingEmails } = require('../../services/emailService');
    // Run in background (no await) to speed up response
    sendBookingEmails(populatedBooking, user, booking.requestHeldForPayment ? null : vendorObj, service).catch(err => console.error(err));

    // Clear booked items from user's cart
    try {
      if (bookedItems && bookedItems.length > 0) {
        const userCart = await Cart.findOne({ userId });
        if (userCart && userCart.items.length > 0) {
          console.log(`[CreateBooking] Clearing ${bookedItems.length} booked items from cart...`);

          // Identify items to remove by title
          const bookedTitles = new Set(bookedItems.map(item => item.card?.title || item.title));

          const originalCount = userCart.items.length;
          userCart.items = userCart.items.filter(item => {
            const itemTitle = item.title;
            const itemCardTitle = item.card?.title;
            // Remove if title matches
            const shouldRemove = bookedTitles.has(itemTitle) || (itemCardTitle && bookedTitles.has(itemCardTitle));
            return !shouldRemove;
          });

          if (userCart.items.length < originalCount) {
            await userCart.save();
            console.log(`[CreateBooking] Removed ${originalCount - userCart.items.length} items from cart. Remaining: ${userCart.items.length}`);
          }
        }
      } else if (serviceId) {
        // Fallback: if no bookedItems passed, check if this service is in cart and remove it.
        const userCart = await Cart.findOne({ userId });
        if (userCart) {
          const originalCount = userCart.items.length;
          userCart.items = userCart.items.filter(item => {
            // Check if item.serviceId matches the booked serviceId
            if (item.serviceId && item.serviceId.toString() === serviceId.toString()) return false;
            return true;
          });

          if (userCart.items.length < originalCount) {
            await userCart.save();
            console.log(`[CreateBooking] Removed service ${serviceId} from cart.`);
          }
        }
      }
    } catch (cartError) {
      console.error('[CreateBooking] Failed to clear cart items:', cartError);
      // specific error shouldn't fail the booking response
    }

    // Clear user's cart COMPLETELY after booking setup (if providers were found or vendor targeted)
    const hasTargetVendor = !!(booking.vendorId);
    const activeProviders = hasTargetVendor
      ? [booking.vendorId]
      : (providerType === 'WORKER' 
          ? (typeof wave1Workers !== 'undefined' ? wave1Workers : []) 
          : (typeof wave1Vendors !== 'undefined' ? wave1Vendors : []));

    try {
      if (activeProviders.length > 0 || hasTargetVendor) {
        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });
      }
    } catch (e) {
      console.error('Final cart clear failed:', e);
    }

    // The carried-over penalty was added to this booking's total: clear it now that the booking exists
    if (pendingPenalty > 0) {
      await User.updateOne({ _id: userId, 'wallet.penalty': { $gte: pendingPenalty } }, { $inc: { 'wallet.penalty': -pendingPenalty } });
    }

    res.status(201).json({
      success: true,
      message: hasTargetVendor 
        ? (booking.requestHeldForPayment ? 'Booking created. Complete the payment to send the request to the vendor' : 'Booking request sent to selected vendor')
        : (activeProviders.length > 0 ? 'Booking created successfully' : (providerType === 'WORKER' ? 'No workers found nearby' : 'No vendors found nearby')),
      noVendorsFound: !hasTargetVendor && activeProviders.length === 0,
      paymentRequired: booking.status === BOOKING_STATUS.AWAITING_PAYMENT && !!booking.requestHeldForPayment,
      data: populatedBooking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking. Please try again.'
    });
  }
};

/**
 * Get user bookings with filters (High-Performance Optimized)
 */
const getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    // Build query
    const query = { userId };
    if (status) {
      if (status.includes(',')) {
        query.status = { $in: status.split(',').map(s => s.trim()) };
      } else {
        query.status = status;
      }
    }
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Run query and total count in parallel with lean() and precise lightweight projection
    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .select('_id bookingNumber providerType serviceCategory categoryIcon brandName brandIcon serviceName bookedItems selectedImplements address scheduledDate scheduledTime timeSlot rental_type status paymentStatus paymentMethod finalAmount totalAmount userPayableAmount workerRequestId parentRequestId rating settlementStatus workerPaymentStatus createdAt vendorId workerId serviceId categoryId')
        .populate('vendorId', 'name businessName phone')
        .populate('serviceId', 'title iconUrl')
        .populate('categoryId', 'title slug requiresDriver')
        .populate('workerId', 'name phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Booking.countDocuments(query)
    ]);

    // Single batch enrichment for WorkerBookingRequest (only if missing and needed)
    const missingIds = bookings
      .filter(b => !b.workerRequestId && (b.providerType === 'WORKER' || (b.bookingNumber && b.bookingNumber.startsWith('WRK-'))))
      .map(b => b._id);

    const parentMap = new Map();
    if (missingIds.length > 0) {
      try {
        const parentRequests = await WorkerBookingRequest.find({
          $or: [
            { finalBookingIds: { $in: missingIds } },
            { finalBookingId: { $in: missingIds } }
          ]
        }).select('_id finalBookingIds finalBookingId').lean();

        for (const reqDoc of parentRequests) {
          if (reqDoc.finalBookingId) parentMap.set(reqDoc.finalBookingId.toString(), reqDoc._id);
          if (Array.isArray(reqDoc.finalBookingIds)) {
            for (const fid of reqDoc.finalBookingIds) {
              parentMap.set(fid.toString(), reqDoc._id);
            }
          }
        }
      } catch (e) {
        // Silently continue without parent map
      }
    }

    const enrichedBookings = bookings.map(b => {
      const bObj = { ...b };
      if (!bObj.workerRequestId && parentMap.has(b._id.toString())) {
        bObj.workerRequestId = parentMap.get(b._id.toString());
        bObj.parentRequestId = bObj.workerRequestId;
      } else if (bObj.workerRequestId) {
        bObj.parentRequestId = bObj.workerRequestId;
      }
      return bObj;
    });

    res.status(200).json({
      success: true,
      data: enrichedBookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings. Please try again.'
    });
  }
};

/**
 * Get booking details by ID
 */
const getBookingById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const booking = await Booking.findOne({ _id: id, userId })
      .select('+visitOtp +paymentOtp +driver_start_otp +driver_end_otp +start_kilometer_photo +end_kilometer_photo') // Include secure OTPs and trip photos
      .populate('userId', 'name phone email')
      .populate('vendorId', 'name businessName phone email address profilePhoto')
      .populate('serviceId', 'title description iconUrl images')
      .populate('categoryId', 'title slug requiresDriver')
      .populate('workerId', 'name phone rating totalJobs location profilePhoto');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Fetch Vendor Bill if exists
    const VendorBill = require('../../models/VendorBill');
    const bill = await VendorBill.findOne({ bookingId: booking._id });

    // Convert to object to attach bill and canonical financial summary
    const bookingData = booking.toObject();
    if (bill) {
      bookingData.bill = bill;
    }

    // Check if Independent Worker booking
    const isWorkerBooking = booking.providerType === 'WORKER' || Boolean(booking.workerRequestId) || (booking.bookingNumber && booking.bookingNumber.startsWith('WRK-'));
    if (isWorkerBooking) {
      bookingData.providerType = 'WORKER';
      try {
        const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
        const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
        const { buildFarmerPaymentSummary } = require('../../services/workerFinancialService');

        let parentRequest = null;
        if (booking.workerRequestId) {
          parentRequest = await WorkerBookingRequest.findById(booking.workerRequestId);
        } else {
          parentRequest = await WorkerBookingRequest.findOne({
            $or: [
              { finalBookingIds: booking._id },
              { finalBookingId: booking._id }
            ]
          });
        }

        let assignments = [];
        let confirmedExtensions = [];
        if (parentRequest) {
          assignments = await IndWorkerAssignment.find({ parentRequestId: parentRequest._id });
          try {
            const IndWorkerExtension = require('../../models/IndWorkerExtension');
            confirmedExtensions = await IndWorkerExtension.find({
              parentRequestId: parentRequest._id,
              status: 'CONFIRMED'
            }).populate('workerExtensions.workerId', 'name phone profilePicture');
          } catch (extErr) {
            console.warn('[userBookingController getBookingById] Extension query warning:', extErr.message);
          }
        } else {
          assignments = await IndWorkerAssignment.find({ legacyBookingId: booking._id });
        }

        bookingData.paymentSummary = buildFarmerPaymentSummary(parentRequest, assignments, booking, confirmedExtensions);
        bookingData.confirmedExtensions = confirmedExtensions;
        if (parentRequest) {
          bookingData.parentRequestId = parentRequest._id;
          bookingData.financialSnapshot = parentRequest.financialSnapshot;
          bookingData.refundAmount = parentRequest.refundAmount;
          bookingData.refundCredited = parentRequest.refundCredited;
        }
      } catch (finErr) {
        console.warn('[userBookingController getBookingById] Worker paymentSummary enrichment warning:', finErr.message);
      }
    }

    res.status(200).json({
      success: true,
      data: bookingData
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking. Please try again.'
    });
  }
};

/**
 * Cancel booking
 */
const cancelBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { cancellationReason } = req.body;

    let booking = await Booking.findOne({ _id: id, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking can be cancelled
    if (booking.status === BOOKING_STATUS.CANCELLED) {
      return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
    }
    if (booking.status === BOOKING_STATUS.COMPLETED) {
      return res.status(400).json({ success: false, message: 'Cannot cancel completed booking' });
    }
    // Once the work has started the bill is the vendor's to collect: no walking away from it.
    if ([BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status) && !booking.requestHeldForPayment) {
      return res.status(400).json({
        success: false,
        message: 'Work has already started on this booking, so it can no longer be cancelled. Please complete payment or raise a dispute from support.'
      });
    }
    const CANCELLABLE = [
      BOOKING_STATUS.SEARCHING, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED,
      BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.JOURNEY_STARTED, BOOKING_STATUS.VISITED,
      BOOKING_STATUS.REJECTED, BOOKING_STATUS.AWAITING_PAYMENT
    ];
    if (!CANCELLABLE.includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a booking that is ${booking.status}` });
    }

    // --- REFUND & CANCELLATION FEE LOGIC ---
    let cancellationFee = 0;
    let refundMessage = '';

    let settingsPenalty = 49;
    try {
      const globalSettings = await Settings.findOne({ type: 'global' });
      if (globalSettings && globalSettings.cancellationPenalty !== undefined) {
        settingsPenalty = globalSettings.cancellationPenalty;
      }
    } catch (err) {
      console.error('Error fetching settings for cancellation penalty:', err);
    }

    const advancePaid = getAdvancePaid(booking);
    const hasStartedJourney = !!booking.journeyStartedAt;
    // No fee when the vendor/system is the reason the booking fell through
    const providerFault = ['vendor', 'system'].includes(booking.cancelledBy) || booking.status === BOOKING_STATUS.REJECTED;

    if (hasStartedJourney && !providerFault) {
      const hasReached = !!booking.visitedAt || booking.status === BOOKING_STATUS.VISITED;
      cancellationFee = hasReached ? (booking.visitingCharges || 49) : settingsPenalty;
    }

    // Atomic claim: two simultaneous cancels (or a cancel racing an accept) cannot both win
    const { booking: claimed } = await cancelBookingWithRefundNoRefund(booking._id, userId, cancellationReason, CANCELLABLE);
    if (!claimed) {
      return res.status(409).json({ success: false, message: 'Booking changed state, please refresh and try again.' });
    }
    booking = claimed;

    let refundAmount = 0;
    if (advancePaid > 0) {
      refundAmount = await refundToWallet(booking, {
        amount: Math.max(0, advancePaid - cancellationFee),
        reason: cancellationFee > 0 ? `Refund (cancellation fee ₹${cancellationFee} deducted)` : 'Refund for cancelled booking'
      });
      // If the fee exceeded the refundable amount, the remainder stays with the platform
      refundMessage = cancellationFee > 0
        ? `Booking cancelled. Refund of ₹${refundAmount} initiated (cancellation fee ₹${cancellationFee} deducted).`
        : `Booking cancelled successfully. Full refund of ₹${refundAmount} initiated to your wallet.`;
    } else if (cancellationFee > 0) {
      await User.updateOne({ _id: userId }, { $inc: { 'wallet.penalty': cancellationFee } });
      refundMessage = `Booking cancelled. A cancellation fee of ₹${cancellationFee} will be charged on your next booking.`;
    } else {
      refundMessage = 'Booking cancelled successfully.';
    }

    // A penalty that was baked into this unpaid booking goes back onto the farmer's account
    if (advancePaid <= 0 && (booking.penalty || 0) > 0) {
      await User.updateOne({ _id: userId }, { $inc: { 'wallet.penalty': booking.penalty } });
    }

    // Stop timers, expire alerts, tell every vendor that was alerted
    const alerted = (booking.notifiedVendors || []).map(String);
    await expireOpenRequests(booking._id, 'CANCELLED');
    try {
      const ioC = req.app?.get ? req.app.get('io') : null;
      if (ioC) alerted.forEach(v => ioC.to(`vendor_${v}`).emit('booking_cancelled', { bookingId: booking._id.toString(), message: `Booking ${booking.bookingNumber} has been cancelled by the customer.` }));
    } catch (e) { /* non-fatal */ }

    // Send notification to user
    await createNotification({
      userId,
      type: 'booking_cancelled',
      title: 'Booking Cancelled',
      message: refundMessage || `Your booking ${booking.bookingNumber} has been cancelled.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'booking_cancelled',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    // Manual FCM push removed (handled by createNotification)

    // Send notification and socket event to vendor
    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'booking_cancelled',
        title: 'Booking Cancelled',
        message: `Booking ${booking.bookingNumber} has been cancelled by the customer.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'booking_cancelled',
          bookingId: booking._id.toString(),
          link: `/vendor/bookings/${booking._id}`
        }
      });

      try {
        const { getIO } = require('../../sockets');
        const io = getIO();
        if (io) {
          io.to(`vendor_${booking.vendorId}`).emit('booking_cancelled', {
            bookingId: booking._id.toString(),
            message: `Booking ${booking.bookingNumber} has been cancelled by the customer.`
          });
        }
      } catch (e) {}
    }

    // Handle Worker & Independent Worker Assignments Synchronization
    try {
      const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
      const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
      const { getIO } = require('../../sockets');
      const io = getIO();

      const affectedWorkerIds = new Set();
      if (booking.workerId) affectedWorkerIds.add(booking.workerId.toString());

      // Check if this booking belongs to an independent worker request
      let parentRequest = null;
      if (booking.workerRequestId) {
        parentRequest = await WorkerBookingRequest.findById(booking.workerRequestId);
      } else {
        parentRequest = await WorkerBookingRequest.findOne({
          $or: [
            { finalBookingIds: booking._id },
            { finalBookingId: booking._id }
          ]
        });
      }

      if (parentRequest) {
        // Mark parent request as cancelled
        parentRequest.status = 'cancelled';
        await parentRequest.save();

        // Cancel all sibling assignments
        await IndWorkerAssignment.updateMany(
          { parentRequestId: parentRequest._id },
          { assignmentStatus: 'CANCELLED', workStatus: 'CANCELLED' }
        );

        // Cancel all sibling booking docs
        if (parentRequest.finalBookingIds?.length > 0) {
          await Booking.updateMany(
            { _id: { $in: parentRequest.finalBookingIds } },
            { status: BOOKING_STATUS.CANCELLED, cancellationReason: cancellationReason || 'Farmer cancelled booking' }
          );
        }

        // Collect all workers from parent request & assignments
        if (Array.isArray(parentRequest.finalWorkers)) {
          parentRequest.finalWorkers.forEach(w => w && affectedWorkerIds.add(w.toString()));
        }
        if (Array.isArray(parentRequest.selectedWorkerIds)) {
          parentRequest.selectedWorkerIds.forEach(w => w && affectedWorkerIds.add(w.toString()));
        }
        const allAssignments = await IndWorkerAssignment.find({ parentRequestId: parentRequest._id });
        allAssignments.forEach(a => {
          if (a.workerId) affectedWorkerIds.add(a.workerId.toString());
        });
      } else {
        // Check if assignment exists directly for this booking
        const singleAssign = await IndWorkerAssignment.findOneAndUpdate(
          { legacyBookingId: booking._id },
          { assignmentStatus: 'CANCELLED', workStatus: 'CANCELLED' }
        );
        if (singleAssign && singleAssign.workerId) {
          affectedWorkerIds.add(singleAssign.workerId.toString());
        }
      }

      // Free all affected workers back to AVAILABLE
      if (affectedWorkerIds.size > 0) {
        const Worker = require('../../models/Worker');
        const workerList = Array.from(affectedWorkerIds);
        await Worker.updateMany(
          { _id: { $in: workerList } },
          { status: 'ONLINE' }
        );

        // Notify every worker and emit real-time socket events
        for (const wId of workerList) {
          await createNotification({
            workerId: wId,
            type: 'booking_cancelled',
            title: '❌ Booking Cancelled',
            message: `Booking #${booking.bookingNumber} (${booking.serviceName || 'Service'}) has been cancelled by the customer.`,
            relatedId: booking._id,
            relatedType: 'booking',
            pushData: {
              type: 'job_cancelled',
              bookingId: booking._id.toString(),
              link: `/worker/jobs`
            }
          });

          if (io) {
            const payload = {
              bookingId: booking._id.toString(),
              requestId: parentRequest?._id?.toString() || booking._id.toString(),
              bookingNumber: booking.bookingNumber,
              serviceName: booking.serviceName,
              message: `Booking #${booking.bookingNumber} has been cancelled by the customer.`
            };
            io.to(`worker_${wId}`).emit('worker_booking_cancelled', payload);
            io.to(`worker:${wId}`).emit('worker_booking_cancelled', payload);
            io.to(`worker_${wId}`).emit('job_cancelled', payload);
            io.to(`worker:${wId}`).emit('job_cancelled', payload);
            io.to(`worker_${wId}`).emit('booking_cancelled', payload);
            io.to(`worker:${wId}`).emit('booking_cancelled', payload);
            io.to(`worker_${wId}`).emit('worker_booking_update', { requestId: booking._id, type: 'booking_cancelled' });
            io.to(`worker:${wId}`).emit('worker_booking_update', { requestId: booking._id, type: 'booking_cancelled' });
          }
        }
      }
    } catch (workerSyncErr) {
      console.warn('[cancelBooking] Error syncing worker cancellation (non-fatal):', workerSyncErr.message);
    }

    // Sync Vendor cancellation, timer cleanup & availability
    if (booking.vendorId) {
      try {
        await releaseVendorIfIdle(booking.vendorId, booking._id);

        await createNotification({
          vendorId: booking.vendorId,
          type: 'booking_cancelled',
          title: '❌ Booking Cancelled',
          message: `Booking #${booking.bookingNumber} (${booking.serviceName || 'Service'}) has been cancelled by the customer.`,
          relatedId: booking._id,
          relatedType: 'booking',
          pushData: {
            type: 'booking_cancelled',
            bookingId: booking._id.toString(),
            link: `/vendor/bookings`
          }
        });

        const io = req.app?.get ? req.app.get('io') : (global.io || null);
        if (io) {
          const vPayload = {
            bookingId: booking._id.toString(),
            bookingNumber: booking.bookingNumber,
            serviceName: booking.serviceName,
            message: `Booking #${booking.bookingNumber} has been cancelled by the customer.`
          };
          io.to(`vendor_${booking.vendorId}`).emit('vendor_booking_cancelled', vPayload);
          io.to(`vendor_${booking.vendorId}`).emit('booking_cancelled', vPayload);
          io.to(`booking_${booking._id}`).emit('booking_cancelled', vPayload);
        }
      } catch (vErr) {
        console.warn('[cancelBooking] Error syncing vendor cancellation (non-fatal):', vErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: refundMessage || 'Booking cancelled successfully',
      data: booking
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking. Please try again.'
    });
  }
};

/**
 * Reschedule booking
 */
const rescheduleBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { scheduledDate, scheduledTime, timeSlot } = req.body;

    const booking = await Booking.findOne({ _id: id, userId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Only before the vendor has set out
    const RESCHEDULABLE = [
      BOOKING_STATUS.PENDING, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING,
      BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED
    ];
    if (!RESCHEDULABLE.includes(booking.status)) {
      return res.status(400).json({ success: false, message: `A booking that is ${booking.status} can no longer be rescheduled` });
    }

    const schedule = validateSchedule(scheduledDate, timeSlot);
    if (!schedule.ok) {
      return res.status(400).json({ success: false, message: schedule.message });
    }

    // Hourly machinery is priced by slot length: a different length needs a new booking
    if (booking.rental_type === 'hourly') {
      const oldLen = booking.durationMinutes ||
        (parseTimeToMinutes(booking.timeSlot?.end) - parseTimeToMinutes(booking.timeSlot?.start));
      const newLen = parseTimeToMinutes(timeSlot.end) - parseTimeToMinutes(timeSlot.start);
      if (oldLen > 0 && newLen !== oldLen) {
        return res.status(400).json({ success: false, message: 'The new slot must be the same length as the booked one. Cancel and rebook to change the duration.' });
      }
    }

    // The vendor must be free at the new time
    if (booking.vendorId) {
      const conflict = await findVendorSlotConflict(
        { scheduledDate, timeSlot, scheduledTime, rental_type: booking.rental_type, equipmentId: booking.equipmentId },
        booking.vendorId,
        { excludeId: booking._id, statuses: [BOOKING_STATUS.REQUESTED, ...CONFLICT_STATUSES] }
      );
      if (conflict) {
        return res.status(409).json({ success: false, message: 'The vendor is not available at that time. Please pick another slot.' });
      }
    }

    booking.scheduledDate = new Date(scheduledDate);
    booking.scheduledTime = scheduledTime;
    booking.timeSlot = { start: timeSlot.start, end: timeSlot.end };
    booking.startReminderSent = false;
    booking.endReminderSent = false;
    await booking.save();

    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'booking_rescheduled',
        title: 'Booking Rescheduled',
        message: `Booking ${booking.bookingNumber} has been rescheduled to ${new Date(scheduledDate).toLocaleDateString()} at ${scheduledTime}.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: { type: 'booking_rescheduled', bookingId: booking._id.toString(), link: `/vendor/booking/${booking._id}` }
      });
      const io = req.app.get('io') || global.io;
      if (io) {
        io.to(`vendor_${booking.vendorId}`).emit('booking_updated', {
          bookingId: booking._id, status: booking.status, scheduledDate: booking.scheduledDate,
          scheduledTime: booking.scheduledTime, message: `Booking ${booking.bookingNumber} has been rescheduled`
        });
      }
    }

    await createNotification({
      userId: booking.userId,
      type: 'booking_rescheduled',
      title: 'Booking Rescheduled',
      message: `Your booking ${booking.bookingNumber} has been rescheduled to ${new Date(scheduledDate).toLocaleDateString()} at ${scheduledTime}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: { type: 'booking_rescheduled', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
    });

    res.status(200).json({ success: true, message: 'Booking rescheduled successfully', data: booking });
  } catch (error) {
    console.error('Reschedule booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to reschedule booking. Please try again.' });
  }
};

/**
 * Add review and rating after completion
 */
const addReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { rating, review, reviewImages } = req.body;

    const booking = await Booking.findOne({ _id: id, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Reviews open only once the job is fully completed (work done AND paid)
    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'You can only review a booking after the work has been completed by the service provider'
      });
    }

    // Check if already reviewed
    if (booking.rating) {
      return res.status(400).json({
        success: false,
        message: 'Booking already reviewed'
      });
    }

    // Atomic: only the first submission can claim the review slot
    const reviewed = await Booking.findOneAndUpdate(
      { _id: booking._id, userId, rating: null, status: BOOKING_STATUS.COMPLETED },
      { $set: { rating, review: review || null, reviewImages: reviewImages || [], reviewedAt: new Date() } },
      { new: true }
    );
    if (!reviewed) {
      return res.status(400).json({ success: false, message: 'Booking already reviewed' });
    }
    booking.rating = reviewed.rating;

    // Create a new Review document for the Review model (used by Admin)
    try {
      await Review.create({
        bookingId: booking._id,
        userId: booking.userId,
        serviceId: booking.serviceId,
        vendorId: booking.vendorId,
        workerId: booking.workerId,
        rating: rating,
        review: review || '',
        images: reviewImages || [],
        status: 'active'
      });
    } catch (reviewErr) {
      console.error('Error creating separate review document:', reviewErr);
      // We don't fail the request if the separate review creation fails
    }

    // Cumulative rating as ONE atomic pipeline update (no read-modify-write races)
    const updateCumulativeRating = async (Model, docId, newRating) => {
      try {
        await Model.updateOne({ _id: docId }, [
          { $set: {
              rating: { $round: [{ $divide: [
                { $add: [{ $multiply: [{ $ifNull: ['$rating', 0] }, { $ifNull: ['$totalReviews', 0] }] }, newRating] },
                { $add: [{ $ifNull: ['$totalReviews', 0] }, 1] }
              ] }, 2] },
              totalReviews: { $add: [{ $ifNull: ['$totalReviews', 0] }, 1] }
          } }
        ]);
      } catch (err) {
        console.error(`Error updating rating for ${Model.modelName}:`, err);
      }
    };

    // Update Vendor Rating (Always)
    if (booking.vendorId) {
      await updateCumulativeRating(Vendor, booking.vendorId, rating);
    }

    // Update Worker Rating (Only if worker was assigned)
    if (booking.workerId) {
      await updateCumulativeRating(Worker, booking.workerId, rating);
    }

    // Update Equipment Rating (Only if equipment was booked)
    if (booking.equipmentId) {
      await updateCumulativeRating(VendorEquipment, booking.equipmentId, rating);
    }

    // Send notification to vendor
    if (booking.vendorId) await createNotification({
      vendorId: booking.vendorId,
      type: 'review_submitted',
      title: 'New Review Received',
      message: `You have received a ${rating}-star review for booking ${booking.bookingNumber}.`,
      relatedId: booking._id,
      relatedType: 'booking'
    });

    res.status(200).json({
      success: true,
      message: 'Review added successfully',
      data: booking
    });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add review. Please try again.'
    });
  }
};

/**
 * Get user ratings and reviews (given by the authenticated user)
 * Production-ready with IDOR protection, overall activity stats, and edge case resilience
 */
const getUserRatings = async (req, res) => {
  try {
    // Strict IDOR protection: Always derive identity from authenticated session
    const userId = req.user?._id || req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const userObjectId = new mongoose.Types.ObjectId(userId.toString());
    const filter = {
      userId: userObjectId,
      rating: { $gte: 1, $lte: 5 }
    };

    // Parallel fetch: aggregate stats + paginated list
    const [bookings, statsAggregate] = await Promise.all([
      Booking.find(filter)
        .populate('vendorId', 'name businessName profilePhoto phone')
        .populate('serviceId', 'title iconUrl name')
        .populate('workerId', 'name profilePhoto phone specializations skills')
        .populate('equipmentId', 'name model year images registrationNumber')
        .sort({ reviewedAt: -1, updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Booking.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalReviews = statsAggregate.length > 0 ? statsAggregate[0].totalReviews : 0;
    const averageRating = statsAggregate.length > 0 ? parseFloat(statsAggregate[0].avgRating.toFixed(1)) : 0;

    // Resilient formatting handling missing/deleted target references
    const formattedRatings = bookings.map(b => {
      let targetType = 'SERVICE';
      let targetName = b.serviceName || b.serviceId?.title || 'Agriculture Service';
      let targetPhoto = b.serviceId?.iconUrl || null;
      let targetRole = 'Service';

      if (b.workerId) {
        targetType = 'WORKER';
        targetName = b.workerId.name || 'Assigned Worker';
        targetPhoto = b.workerId.profilePhoto || null;
        targetRole = 'Worker';
      } else if (b.vendorId) {
        targetType = 'VENDOR';
        targetName = b.vendorId.businessName || b.vendorId.name || 'Equipment Owner';
        targetPhoto = b.vendorId.profilePhoto || null;
        targetRole = 'Vendor';
      } else if (b.equipmentId) {
        targetType = 'EQUIPMENT';
        targetName = b.equipmentId.name || 'Equipment Rental';
        targetPhoto = Array.isArray(b.equipmentId.images) ? b.equipmentId.images[0] : null;
        targetRole = 'Equipment';
      }

      return {
        _id: b._id,
        bookingId: b._id,
        bookingNumber: b.bookingNumber || b._id.toString().slice(-6).toUpperCase(),
        rating: b.rating || 0,
        review: b.review || '',
        reviewImages: Array.isArray(b.reviewImages) ? b.reviewImages : [],
        reviewedAt: b.reviewedAt || b.updatedAt || b.createdAt,
        targetType,
        targetRole,
        targetName,
        targetPhoto,
        workerId: b.workerId,
        vendorId: b.vendorId,
        serviceId: b.serviceId,
        serviceName: b.serviceName || b.serviceId?.title || 'Agriculture Service',
        scheduledDate: b.scheduledDate,
        status: b.status
      };
    });

    const paginationData = {
      page: pageNum,
      limit: limitNum,
      total: totalReviews,
      totalPages: Math.ceil(totalReviews / limitNum) || 1
    };

    return res.status(200).json({
      success: true,
      data: formattedRatings,
      ratings: formattedRatings,
      stats: {
        averageRating,
        totalReviews
      },
      pagination: paginationData
    });
  } catch (error) {
    console.error('Get user ratings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your ratings'
    });
  }
};

/**
 * Check equipment availability and return next available slot if booked
 */
const checkEquipmentAvailability = async (req, res) => {
  try {
    const { equipmentId, requestedDate, requestedTime } = req.query;

    if (!equipmentId || !requestedDate) {
      return res.status(400).json({
        success: false,
        message: 'Equipment ID and requested date are required'
      });
    }

    const { BOOKING_STATUS } = require('../../utils/constants');

    // Set up date boundaries for the requested date
    const reqDate = new Date(requestedDate);
    const startOfDay = new Date(reqDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(reqDate.setHours(23, 59, 59, 999));

    // 1. CHECK MAINTENANCE OVERLAP (New Agriculture Feature)
    const Maintenance = require('../../models/Maintenance');
    const maintenanceRecord = await Maintenance.findOne({
      equipmentId,
      status: 'active',
      startDate: { $lte: endOfDay },
      endDate: { $gte: startOfDay }
    });

    if (maintenanceRecord) {
      return res.status(200).json({
        success: true,
        available: false,
        message: `Equipment is currently under maintenance (${maintenanceRecord.reason}). It will be available after ${new Date(maintenanceRecord.endDate).toLocaleDateString()}.`
      });
    }

    // 2. CHECK EXISTING BOOKINGS (Conflict Check)
    const activeBookings = await Booking.find({
      serviceId: equipmentId,
      status: { $nin: ['CANCELLED', 'COMPLETED', 'REJECTED'] },
      scheduledDate: { $gte: startOfDay }
    }).sort({ scheduledDate: 1, 'timeSlot.start': 1 }); // Sort chronologically

    let isAvailable = true;

    // A simple check: if any active booking exists on the requested date with the exact same time slot
    for (let booking of activeBookings) {
      // Compare on same date 
      const bDate = new Date(booking.scheduledDate);
      if (
        bDate.getFullYear() === reqDate.getFullYear() &&
        bDate.getMonth() === reqDate.getMonth() &&
        bDate.getDate() === reqDate.getDate()
      ) {
        if (!requestedTime || booking.scheduledTime === requestedTime || (booking.timeSlot && booking.timeSlot.start === requestedTime)) {
          isAvailable = false;
          break;
        }
      }
    }

    if (isAvailable) {
      return res.status(200).json({
        success: true,
        available: true,
        message: 'Equipment is available for this slot.'
      });
    } else {
      // Find the next available day/time
      // For a robust system, this involves scanning forward. Here is a simple fallback: Next day morning.
      const nextDate = new Date(reqDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const nextAvailableSlotDate = nextDate.toISOString().split('T')[0];
      const nextAvailableSlotTime = "09:00";

      return res.status(200).json({
        success: true,
        available: false,
        nextAvailableSlot: `${nextAvailableSlotDate} ${nextAvailableSlotTime}`,
        message: 'Equipment is already booked for the requested time. Please check the next available slot.'
      });
    }
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check equipment availability'
    });
  }
};

/**
 * Calculate authoritative price for a booking before confirmation
 */
const calculatePrice = async (req, res) => {
  try {
    const {
      serviceId,
      equipmentId,
      rental_type,
      landSize,
      estimatedDuration,
      bookedItems
    } = req.body;

    let totalServiceValue = 0;
    if (bookedItems && bookedItems.length > 0) {
      totalServiceValue = bookedItems.reduce((sum, item) => {
        const itemPrice = item.card?.price || item.price || 0;
        return sum + (itemPrice * (item.quantity || 1));
      }, 0);
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const categoryId = service.categoryId || service.categoryIds?.[0];
    const category = categoryId ? await Category.findById(categoryId) : null;
    const isAgriService = !!(
      equipmentId ||
      rental_type ||
      service.rental_type ||
      service.category === 'Agriculture' ||
      (category && ['agriculture', 'machinery', 'tractor', 'equipment', 'farm equipment'].includes(category.title?.toLowerCase())) ||
      (service.serviceCategory && ['agriculture', 'machinery', 'tractor', 'equipment', 'farm equipment'].some(c => service.serviceCategory.toLowerCase().includes(c))) ||
      (service.title && ['tractor', 'rotavator', 'harvester', 'cultivator', 'plough', 'drone'].some(k => service.title.toLowerCase().includes(k)))
    );

    let unitRate = service.basePrice || 500;
    let equipmentObj = null;

    if (equipmentId) {
      equipmentObj = await VendorEquipment.findById(equipmentId);
    }

    if (equipmentObj && equipmentObj.pricing) {
      const ep = equipmentObj.pricing;
      if (rental_type === 'hourly' && ep.hourly?.isEnabled) unitRate = ep.hourly.price;
      else if (rental_type === 'land_based' && ep.land_based?.isEnabled) unitRate = ep.land_based.price;
      else if (rental_type === 'daily' && ep.daily?.isEnabled) unitRate = ep.daily.price;
    } else {
      if (rental_type === 'hourly' && service.hourly_price) unitRate = service.hourly_price;
      else if (rental_type === 'land_based' && service.land_price) unitRate = service.land_price;
      else if ((rental_type === 'daily' || rental_type === 'monthly') && service.daily_price) unitRate = service.daily_price;
      else if (service.basePrice) unitRate = service.basePrice;
    }

    let multiplier = 1;
    if (rental_type === 'hourly' || rental_type === 'daily') {
      multiplier = parseFloat(estimatedDuration) || 1;
    } else if (rental_type === 'land_based') {
      multiplier = parseFloat(String(landSize).replace(/[^\d.]/g, '')) || 1;
    }

    const mainAgriPrice = Math.round(unitRate * multiplier);
    
    if (isAgriService && (!bookedItems || bookedItems.length === 0)) {
      totalServiceValue = mainAgriPrice;
    } else if (isAgriService && bookedItems && bookedItems.length > 0) {
      // Overwrite main service item price
      let mainItemHandled = false;
      totalServiceValue = bookedItems.reduce((sum, item) => {
        if (!mainItemHandled && (!item.type || item.type !== 'product')) {
          mainItemHandled = true;
          return sum + mainAgriPrice;
        }
        const itemPrice = item.card?.price || item.price || 0;
        return sum + (itemPrice * (item.quantity || 1));
      }, 0);
    }

    const settings = await Settings.findOne({ type: 'global' });
    const visitingCharges = isAgriService ? 0 : (settings?.visitedCharges || 49);
    const gstPercentage = isAgriService ? (settings?.rentalGstPercentage || 5) : (settings?.serviceGstPercentage || 18);
    const gstDecMultiplier = gstPercentage / 100;

    const basePrice = isAgriService ? totalServiceValue : (totalServiceValue || unitRate);
    const discount = 0;
    const tax = Math.round(basePrice * gstDecMultiplier);
    const finalAmount = basePrice - discount + tax + visitingCharges;

    res.status(200).json({
      success: true,
      priceBreakdown: {
        basePrice,
        discount,
        tax,
        visitingCharges,
        finalAmount,
        unitRate,
        multiplier
      }
    });
  } catch (error) {
    console.error('Calculate price error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate price' });
  }
};

/**
 * Reselect a vendor for an equipment/machinery booking when the previous vendor
 * rejected, timed out, or became unavailable.
 * Never auto-switches vendors; triggered exclusively by the farmer.
 */
const reselectVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId, equipmentId, priceDetails } = req.body;
    const userId = req.user.id;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: 'vendorId is required' });
    }

    const booking = await Booking.findOne({ _id: id, userId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Reselection allowed if booking was rejected, timed out, cancelled, or still searching/requested
    // A CANCELLED booking is closed (and already refunded): it must never be revived.
    const allowedStatuses = [
      BOOKING_STATUS.REQUESTED,
      BOOKING_STATUS.REJECTED,
      BOOKING_STATUS.SEARCHING
    ];

    if (!allowedStatuses.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot reselect vendor when booking is in status: ${booking.status}`
      });
    }

    const Vendor = require('../../models/Vendor');
    const targetVendor = await Vendor.findById(vendorId);
    if (!targetVendor) {
      return res.status(404).json({ success: false, message: 'Selected vendor not found' });
    }
    const ineligible = vendorIneligibleReason(targetVendor);
    if (ineligible) {
      return res.status(400).json({ success: false, message: ineligible });
    }
    if (equipmentId) {
      const eq = await VendorEquipment.findById(equipmentId);
      if (!eq || String(eq.vendorId) !== String(vendorId) || !['active', 'approved'].includes(eq.status)) {
        return res.status(400).json({ success: false, message: 'The selected equipment is not available from this vendor.' });
      }
    }
    const previousVendorId = booking.vendorId ? String(booking.vendorId) : null;

    // Check real-time slot availability for the newly selected vendor
    const conflictBooking = await findVendorSlotConflict(
      { scheduledDate: booking.scheduledDate, timeSlot: booking.timeSlot, scheduledTime: booking.scheduledTime, rental_type: booking.rental_type, equipmentId: equipmentId || booking.equipmentId },
      vendorId,
      { excludeId: booking._id, statuses: [BOOKING_STATUS.REQUESTED, ...CONFLICT_STATUSES] }
    );

    if (conflictBooking) {
      const isRequested = conflictBooking.status === BOOKING_STATUS.REQUESTED;
      return res.status(409).json({
        success: false,
        message: isRequested
          ? 'This vendor currently has a pending request for this time slot. Please choose another vendor.'
          : 'This vendor already has a confirmed booking for this date and time slot. Please choose another vendor.'
      });
    }

    // Update equipment if provided
    if (equipmentId) {
      booking.equipmentId = equipmentId;
    }

    // The quoted price is locked when the booking is created; client-supplied price details are ignored.

    // Update distance
    let vendorDist = null;
    if (targetVendor.geoLocation?.coordinates?.length === 2 && booking.address?.lat && booking.address?.lng) {
      const { calculateDistance } = require('../../services/locationService');
      const [vLng, vLat] = targetVendor.geoLocation.coordinates;
      if (vLat && vLng) {
        vendorDist = Math.round(calculateDistance({ lat: booking.address.lat, lng: booking.address.lng }, { lat: vLat, lng: vLng }) * 10) / 10;
      }
    }

    // Reset status to REQUESTED for the newly chosen vendor ONLY
    booking.vendorId = vendorId;
    booking.status = BOOKING_STATUS.REQUESTED;
    booking.rejectionReason = undefined;
    booking.cancellationReason = undefined;
    booking.cancelledAt = undefined;
    booking.cancelledBy = undefined;
    booking.notifiedVendors = [vendorId];
    booking.potentialVendors = [];
    booking.currentWave = 1;
    booking.waveStartedAt = new Date();
    await booking.save();

    // Dismiss the alert on the previous vendor's phone
    if (previousVendorId && previousVendorId !== String(vendorId)) {
      try {
        const ioPrev = req.app.get('io');
        if (ioPrev) ioPrev.to(`vendor_${previousVendorId}`).emit('booking_taken', { bookingId: booking._id.toString(), message: 'The customer chose another vendor.' });
      } catch (e) { /* non-fatal */ }
    }

    // Expire any previous requests
    const BookingRequest = require('../../models/BookingRequest');
    await BookingRequest.updateMany(
      { bookingId: booking._id },
      { status: 'EXPIRED', respondedAt: new Date() }
    );

    // Create a single BookingRequest for the newly selected vendor
    await BookingRequest.create({
      bookingId: booking._id,
      providerType: 'VENDOR',
      vendorId: vendorId,
      status: 'PENDING',
      wave: 1,
      distance: vendorDist,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });

    // Notify new vendor via Socket.io
    const io = req.app.get('io');
    if (io) {
      const bookingData = {
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        serviceName: booking.serviceName || 'Equipment Booking',
        customerName: req.user.name,
        customerPhone: req.user.phone,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        timeSlot: booking.timeSlot,
        price: booking.finalAmount,
        finalAmount: booking.finalAmount,
        basePrice: booking.basePrice,
        tax: booking.tax,
        gstPercentage: booking.gstPercentage,
        visitingCharges: booking.visitingCharges,
        equipmentId: booking.equipmentId,
        serviceCategory: booking.serviceCategory,
        address: booking.address,
        distance: vendorDist,
        rental_type: booking.rental_type || '',
        estimatedDuration: booking.estimatedDuration || '',
        landSize: booking.landSize || '',
        selectedImplements: booking.selectedImplements || [],
        playSound: true,
        message: `New booking request from ${req.user.name}!`
      };

      const room = `vendor_${vendorId.toString()}`;
      io.to(room).emit('new_booking_request', bookingData);
      io.to(room).emit('new_booking', bookingData);
      io.to(room).emit('booking_updated', { bookingId: booking._id, status: 'requested' });

      // Notify farmer room
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: booking.status,
        vendorId: vendorId,
        message: 'Request sent to selected vendor'
      });
    }

    // Push notification to vendor
    try {
      if (targetVendor.fcmTokens && targetVendor.fcmTokens.length > 0) {
        await sendNewBookingNotification(
          targetVendor.fcmTokens,
          booking._id,
          booking.serviceName || 'Machinery Booking',
          `${booking.address?.city || ''}, ${booking.address?.state || ''}`.trim()
        );
      }
    } catch (err) {
      console.error('[FCM] Push notification failed for reselected vendor', vendorId, err);
    }

    // In-app notification for vendor
    createNotification({
      vendorId: vendorId,
      type: 'booking_request',
      title: 'New Booking Request',
      message: `New booking request for ${booking.serviceName || 'Machinery'} from ${req.user.name}`,
      relatedId: booking._id,
      relatedType: 'booking',
      data: {
        bookingId: booking._id,
        serviceName: booking.serviceName || 'Machinery Booking',
        customerName: req.user.name,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        location: booking.address,
        price: booking.finalAmount,
        distance: vendorDist
      },
      pushData: {
        type: 'new_booking',
        dataOnly: false,
        link: `/vendor/booking/${booking._id}`
      }
    }).catch(err => console.error('[Notification] Error creating vendor notification:', err));

    // Send confirmation notification to farmer
    createNotification({
      userId: booking.userId,
      type: 'booking_requested',
      title: 'Booking Request Sent',
      message: `Your booking request for ${booking.bookingNumber} has been sent to ${targetVendor.businessName || targetVendor.name}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      data: {
        bookingId: booking._id,
        vendorId: targetVendor._id,
        vendorName: targetVendor.businessName || targetVendor.name
      },
      pushData: {
        type: 'booking_requested',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    }).catch(err => console.error('[Notification] Error creating user confirmation notification:', err));

    res.status(200).json({
      success: true,
      message: 'Booking request sent to selected vendor',
      data: { booking }
    });
  } catch (error) {
    console.error('Reselect vendor error:', error);
    res.status(500).json({ success: false, message: 'Failed to reselect vendor. Please try again.' });
  }
};

module.exports = {
  createBooking,
  getUserBookings,
  getBookingById,
  cancelBooking,
  rescheduleBooking,
  addReview,
  getUserRatings,
  checkEquipmentAvailability,
  calculatePrice,
  reselectVendor
};

/**
 * Confirm final amount for Independent Worker booking (by Farmer)
 */
const farmerConfirmFinalAmount = async (req, res) => {
  try {
    const { id } = req.params;
    const { finalAmount } = req.body;
    const userId = req.user.id;

    const booking = await Booking.findOne({ _id: id, userId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.vendorId) {
      return res.status(400).json({ success: false, message: 'This operation is only for Independent Worker bookings' });
    }

    if (
      booking.status !== BOOKING_STATUS.WORK_DONE &&
      booking.status !== BOOKING_STATUS.IN_PROGRESS &&
      booking.status !== BOOKING_STATUS.ACCEPTED &&
      booking.status !== BOOKING_STATUS.VISITED &&
      booking.status !== BOOKING_STATUS.JOURNEY_STARTED
    ) {
      return res.status(400).json({ success: false, message: `Cannot confirm amount for booking in status: ${booking.status}` });
    }

    const amount = Number(finalAmount);
    const min = booking.minRate || 0;
    const max = booking.maxRate || booking.minRate || 0;

    if (isNaN(amount) || amount < min || amount > max) {
      return res.status(400).json({
        success: false,
        message: `Final amount must be between ₹${min} and ₹${max}`
      });
    }

    booking.finalAmount = amount;
    booking.userPayableAmount = amount;
    booking.basePrice = amount;
    booking.totalAmount = amount;
    
    // Only move to AWAITING_PAYMENT if the work was already marked as done
    if (booking.status === BOOKING_STATUS.WORK_DONE) {
      booking.status = BOOKING_STATUS.AWAITING_PAYMENT;
    }

    await booking.save();

    // Notify Worker
    await createNotification({
      workerId: booking.workerId,
      type: 'worker_final_amount_confirmed',
      title: 'Amount Confirmed',
      message: `Final amount of ₹${amount} has been confirmed by the Farmer. Waiting for payment.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'worker_final_amount_confirmed',
        bookingId: booking._id.toString()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Final amount confirmed successfully',
      data: { finalAmount: amount, status: booking.status }
    });

  } catch (error) {
    console.error('Farmer confirm final amount error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm amount' });
  }
};

/**
 * Farmer selects Offline Payment (Cash)
 * This generates the OTP for the Worker to collect cash.
 */
const farmerSelectOfflinePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const booking = await Booking.findOne({ _id: id, userId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.cashCollected || [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR, PAYMENT_STATUS.REFUNDED].includes(booking.paymentStatus)) {
      return res.status(400).json({ success: false, message: 'This booking has already been paid' });
    }
    if (booking.status !== BOOKING_STATUS.AWAITING_PAYMENT && booking.status !== BOOKING_STATUS.WORK_DONE) {
      return res.status(400).json({ success: false, message: `Cannot select payment for booking in status: ${booking.status}` });
    }

    if (booking.finalAmount == null) {
      return res.status(400).json({ success: false, message: 'Final amount not confirmed yet' });
    }

    // Set payment method to cash (keep online advance, if any, as it is)
    if (!(booking.advancePaidAmount > 0)) booking.paymentMethod = 'cash';
    booking.status = BOOKING_STATUS.AWAITING_PAYMENT;
    
    // Generate OTP
    const payOtp = generateDistinctOtp(booking.driver_start_otp, booking.driver_end_otp);
    booking.customerConfirmationOTP = payOtp;
    booking.paymentOtp = payOtp;

    await booking.save();

    // Notify Worker or Vendor that Farmer selected offline payment and to collect cash
    if (booking.workerId) {
      await createNotification({
        workerId: booking.workerId,
        type: 'payment_received',
        title: 'Collect Cash',
        message: `Farmer selected offline payment. Please collect ₹${booking.finalAmount} and enter the OTP provided by the Farmer.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'offline_payment_selected',
          bookingId: booking._id.toString()
        }
      });
    }

    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'offline_payment_selected',
        title: 'Collect Cash',
        message: `Farmer selected offline cash payment. Please collect ₹${booking.finalAmount} and enter the verification OTP provided by the Farmer.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'offline_payment_selected',
          bookingId: booking._id.toString(),
          link: `/vendor/booking/${booking._id}`
        }
      });
    }

    // Notify Farmer with their cash verification OTP
    await createNotification({
      userId: booking.userId,
      type: 'cash_payment_selected',
      title: '💵 Cash Payment Selected',
      message: `You selected cash payment of ₹${booking.finalAmount}. Please share OTP (${payOtp}) with the operator only after paying cash.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      data: {
        bookingId: booking._id,
        paymentOtp: payOtp,
        finalAmount: booking.finalAmount
      },
      pushData: {
        type: 'cash_payment_selected',
        bookingId: booking._id.toString(),
        paymentOtp: payOtp,
        link: `/user/booking/${booking._id}`
      }
    });

    const io = req.app.get('io') || global.io;
    if (io) {
      // The OTP belongs to the farmer ONLY — it must never reach the vendor/worker/shared rooms.
      const payload = {
        bookingId: booking._id.toString(),
        status: booking.status,
        paymentMethod: 'cash',
        amount: booking.finalAmount
      };
      if (booking.workerId) io.to(`worker_${booking.workerId}`).emit('offline_payment_selected', payload);
      if (booking.vendorId) io.to(`vendor_${booking.vendorId}`).emit('offline_payment_selected', payload);
      io.to(`booking_${booking._id}`).emit('payment_pending', payload);
      io.to(`user_${booking.userId}`).emit('payment_pending', { ...payload, paymentOtp: payOtp });
    }

    res.status(200).json({
      success: true,
      message: 'Offline payment selected',
      data: {
        paymentOtp: payOtp
      }
    });

  } catch (error) {
    console.error('Farmer select offline payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to select offline payment' });
  }
};

module.exports.farmerConfirmFinalAmount = farmerConfirmFinalAmount;
module.exports.farmerSelectOfflinePayment = farmerSelectOfflinePayment;
