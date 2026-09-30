const VendorEquipment = require('../../models/VendorEquipment');
const Vendor = require('../../models/Vendor');
const Settings = require('../../models/Settings');
const { parseTimeToMinutes, parseSlotInterval, isIntervalOverlapping } = require('../../utils/timeSlotHelper');

/**
 * Public Equipment Controllers (For Farmers)
 * Handles browsing and viewing details of equipment without needing login.
 */

// GET /api/public/equipment
exports.getPublicEquipment = async (req, res) => {
  try {
    const { cityId, stateId, districtId, subDistrictId, categoryId, implementId, search, isFeatured, lat, lng, radius } = req.query;

    const query = { status: { $in: ['active', 'approved'] } }; // Only show active/approved equipment

    let vendorDistanceMap = {};
    let hasGeoFilter = false;

    // Dynamic Vendor/Service distance logic
    if (lat && lng && lat !== 'undefined' && lng !== 'undefined') {
        hasGeoFilter = true;
        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);
        const searchRadius = (parseInt(radius) || 50) * 1000; // Search within 50km by default

        const nearbyVendors = await Vendor.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [userLng, userLat] },
                    distanceField: "calculatedDistance", 
                    maxDistance: searchRadius,
                    spherical: true,
                    distanceMultiplier: 0.001 // Convert meters to km
                }
            },
            {
                $match: {
                    $expr: {
                        // Ensure user is within the vendor's delivery radius (default 50km if not set)
                        $lte: ["$calculatedDistance", { $ifNull: ["$shopDetails.deliveryRadius", 50] }]
                    }
                }
            },
            {
                $project: { _id: 1, calculatedDistance: 1 }
            }
        ]);

        nearbyVendors.forEach(v => {
            vendorDistanceMap[v._id.toString()] = v.calculatedDistance;
        });

        const geoVendorIds = nearbyVendors.map(v => v._id);
        query.vendorId = { $in: geoVendorIds };
    }

    // Geographic Scope Filtering: GLOBAL_INDIA + matching State/District/Sub-District/Legacy City
    const hasGeoScope = Boolean(stateId || districtId || subDistrictId || cityId);
    if (hasGeoScope) {
        const mongoose = require('mongoose');
        const geoConditions = [
            { scope: 'GLOBAL_INDIA' }
        ];

        if (subDistrictId && mongoose.Types.ObjectId.isValid(subDistrictId)) {
            geoConditions.push({ subDistrictId: new mongoose.Types.ObjectId(subDistrictId) });
        }
        if (districtId && mongoose.Types.ObjectId.isValid(districtId)) {
            geoConditions.push({ districtId: new mongoose.Types.ObjectId(districtId) });
        }
        if (stateId && mongoose.Types.ObjectId.isValid(stateId)) {
            geoConditions.push({ stateId: new mongoose.Types.ObjectId(stateId) });
        }
        if (cityId) {
            geoConditions.push({ cityIds: cityId });
        }

        if (hasGeoFilter) {
            const vendorScopeFilter = [];
            if (districtId && mongoose.Types.ObjectId.isValid(districtId)) {
                vendorScopeFilter.push({ districtId: new mongoose.Types.ObjectId(districtId) });
            }
            if (stateId && mongoose.Types.ObjectId.isValid(stateId)) {
                vendorScopeFilter.push({ stateId: new mongoose.Types.ObjectId(stateId) });
            }
            if (cityId) {
                vendorScopeFilter.push({ cityId });
            }
            if (vendorScopeFilter.length > 0) {
                const scopedVendors = await Vendor.find({ $or: vendorScopeFilter }).select('_id');
                const scopedVendorIds = scopedVendors.map(v => v._id.toString());
                query.vendorId.$in = query.vendorId.$in.filter(id => scopedVendorIds.includes(id.toString()));
            }
        }

        query.$or = geoConditions;
    }
    
    if (categoryId) query.categoryId = categoryId;
    if (isFeatured) query.isFeatured = true;

    if (implementId) {
      query.$or = [
        { 'implements.subCategoryId': implementId },
        { subCategoryIds: implementId } // For backward compatibility
      ];
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');

      const matchingVendors = await Vendor.find({ name: searchRegex }).select('_id');
      const vendorIds = matchingVendors.map(v => v._id);

      const searchCondition = {
        $or: [
          { name: searchRegex },
          { vendorId: { $in: vendorIds } }
        ]
      };

      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          searchCondition
        ];
        delete query.$or;
      } else {
        query.$or = searchCondition.$or;
      }
    }

    let equipment = await VendorEquipment.find(query)
      .populate('categoryId', 'title slug homeIconUrl')
      .populate('subCategoryIds', 'title slug')
      .populate('implements.subCategoryId', 'title slug')
      .populate('vendorId', 'name phone rating avatar')
      .populate('stateId', 'name code')
      .populate('districtId', 'name')
      .populate('subDistrictId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // Map calculated distances to equipment
    if (hasGeoFilter) {
        equipment = equipment.map(eq => ({
            ...eq,
            distance: eq.vendorId && vendorDistanceMap[eq.vendorId._id.toString()] !== undefined 
                        ? vendorDistanceMap[eq.vendorId._id.toString()] 
                        : null
        }));
    }

    res.status(200).json({
      success: true,
      count: equipment.length,
      data: equipment
    });
  } catch (error) {
    console.error('Get public equipment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery catalog'
    });
  }
};

// GET /api/public/equipment/:id
exports.getPublicEquipmentById = async (req, res) => {
  try {
    const equipment = await VendorEquipment.findOne({
      _id: req.params.id,
      status: { $in: ['active', 'approved'] }
    })
      .populate('categoryId', 'title slug homeIconUrl')
      .populate('subCategoryIds', 'title slug')
      .populate('implements.subCategoryId', 'title slug')
      .populate('vendorId', 'name phone rating avatar address')
      .populate('stateId', 'name code')
      .populate('districtId', 'name')
      .populate('subDistrictId', 'name')
      .lean();

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found or not yet approved'
      });
    }

    res.status(200).json({
      success: true,
      data: equipment
    });
  } catch (error) {
    console.error('Get public equipment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery details'
    });
  }
};

// GET /api/public/equipment/:id/availability
exports.checkAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, timeSlot } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }

    const Booking = require('../../models/Booking');
    const { BOOKING_STATUS } = require('../../utils/constants');

    const startOfDay = new Date(new Date(date).setHours(0, 0, 0, 0));
    const endOfDay = new Date(new Date(date).setHours(23, 59, 59, 999));

    const activeBookings = await Booking.find({
      $or: [{ equipmentId: id }, { serviceId: id }],
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: {
        $in: [
          BOOKING_STATUS.REQUESTED,
          BOOKING_STATUS.CONFIRMED,
          BOOKING_STATUS.ACCEPTED,
          BOOKING_STATUS.ASSIGNED,
          BOOKING_STATUS.JOURNEY_STARTED,
          BOOKING_STATUS.IN_PROGRESS,
          BOOKING_STATUS.WORK_DONE
        ]
      }
    });

    let available = true;
    let conflictDetails = null;

    if (timeSlot) {
      const reqInterval = parseSlotInterval(timeSlot, null, 'hourly');
      for (const b of activeBookings) {
        const bInterval = parseSlotInterval(b.timeSlot, b.scheduledTime, b.rental_type);
        if (isIntervalOverlapping(bInterval, reqInterval)) {
          available = false;
          conflictDetails = bInterval.isFullDay
            ? 'Already booked for full day on this date'
            : `Slot overlaps with existing booking (${bInterval.rawStart || 'Booked'} - ${bInterval.rawEnd || ''})`;
          break;
        }
      }
    } else if (activeBookings.length > 0) {
      available = false;
      conflictDetails = 'Already has active bookings on this date';
    }

    res.status(200).json({
      success: true,
      available,
      message: available ? 'Slot is available' : (conflictDetails || 'Slot is unavailable')
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check availability'
    });
  }
};

/**
 * Find qualified nearby vendors for a specific tractor/equipment job
 * Validates: Category, Implement compatibility, Horsepower (HP), Real Availability
 * Calculates exact upfront price for each vendor.
 */
exports.findQualifiedVendors = async (req, res) => {
  try {
    const params = { ...(req.query || {}), ...(req.body || {}) };
    const {
      categoryId,
      implementId,
      minHp,
      maxHp,
      rental_type = 'hourly',
      landSize,
      durationHours,
      durationMinutes,
      estimatedDuration,
      date,
      timeSlot,
      lat,
      lng,
      radius = 50
    } = params;

    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'Machinery category is required' });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'Booking date is required' });
    }

    const Category = require('../../models/Category');
    const Booking = require('../../models/Booking');
    const { BOOKING_STATUS } = require('../../utils/constants');
    const { calculateDistance } = require('../../services/locationService');

    const catObj = await Category.findById(categoryId);
    const categoryTitle = catObj ? catObj.title : 'Machinery';

    // 0. Fetch global settings for pricing integrity
    const settings = await Settings.findOne({ type: 'global' });
    const visitingCharges = (settings && typeof settings.visitedCharges === 'number') ? settings.visitedCharges : 49;
    const gstPercentage = settings?.rentalGstPercentage || 5;

    // 1. Calculate Multiplier and Normalized Interval
    const reqInterval = parseSlotInterval(timeSlot, null, rental_type);
    let multiplier = 1;
    if (rental_type === 'hourly') {
      let minutes = reqInterval.endMinutes - reqInterval.startMinutes;
      if (minutes <= 0) minutes = 60;
      if (durationMinutes) minutes = Number(durationMinutes);
      else if (durationHours) minutes = Number(durationHours) * 60;
      multiplier = Math.max(0.5, minutes / 60);
    } else if (rental_type === 'land_based') {
      const area = parseFloat(String(landSize || '1').replace(/[^\d.]/g, ''));
      multiplier = isNaN(area) || area <= 0 ? 1 : Math.max(0.5, area);
    } else if (rental_type === 'daily' || rental_type === 'monthly') {
      const days = parseInt(estimatedDuration || '1', 10);
      multiplier = isNaN(days) || days <= 0 ? 1 : days;
      if (rental_type === 'monthly') multiplier *= 30;
    }

    // 2. Find nearby approved vendors
    const vendorQuery = {
      approvalStatus: 'approved',
      isActive: true
    };

    let nearbyVendors = await Vendor.find(vendorQuery)
      .select('name businessName phone avatar rating totalJobs geoLocation shopDetails address')
      .lean();

    // Attach distance
    const userLocation = (lat && lng && !isNaN(Number(lat)) && !isNaN(Number(lng)))
      ? { lat: Number(lat), lng: Number(lng) }
      : null;

    if (userLocation) {
      nearbyVendors = nearbyVendors.map(v => {
        let dist = 10;
        let vLat = v.address?.lat || v.shopDetails?.shopLocation?.lat;
        let vLng = v.address?.lng || v.shopDetails?.shopLocation?.lng;
        if ((!vLat || !vLng) && v.geoLocation?.coordinates?.length === 2) {
          const [gLng, gLat] = v.geoLocation.coordinates;
          if (gLat !== 0 || gLng !== 0) {
            vLat = gLat;
            vLng = gLng;
          }
        }
        if (vLat && vLng) {
          dist = calculateDistance(userLocation, { lat: vLat, lng: vLng });
        }
        return { ...v, distance: Math.round(dist * 10) / 10 };
      });

      // Prefer vendors within radius, but fall back to all approved vendors if none within radius
      const withinRadius = nearbyVendors.filter(v => v.distance <= Number(radius));
      if (withinRadius.length > 0) {
        nearbyVendors = withinRadius;
      }
    } else {
      nearbyVendors = nearbyVendors.map(v => ({ ...v, distance: 5 }));
    }

    if (nearbyVendors.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No approved vendors found in your area.'
      });
    }

    const vendorIds = nearbyVendors.map(v => v._id);
    const vendorMap = new Map(nearbyVendors.map(v => [v._id.toString(), v]));

    // 3. Find matching equipment for these vendors
    const equipQuery = {
      vendorId: { $in: vendorIds },
      status: { $in: ['active', 'approved'] },
      categoryId: categoryId
    };

    if (implementId) {
      equipQuery.$or = [
        { 'implements.subCategoryId': implementId },
        { subCategoryIds: implementId }
      ];
    }

    const equipments = await VendorEquipment.find(equipQuery)
      .populate('categoryId', 'title slug homeIconUrl trackingType requiresDriver')
      .populate('implements.subCategoryId', 'title slug homeIconUrl')
      .lean();

    // 4. Check date boundaries for real availability
    const startOfDay = new Date(new Date(date).setHours(0, 0, 0, 0));
    const endOfDay = new Date(new Date(date).setHours(23, 59, 59, 999));

    const existingBookings = await Booking.find({
      vendorId: { $in: vendorIds },
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: {
        $in: [
          BOOKING_STATUS.REQUESTED,
          BOOKING_STATUS.CONFIRMED,
          BOOKING_STATUS.ACCEPTED,
          BOOKING_STATUS.ASSIGNED,
          BOOKING_STATUS.JOURNEY_STARTED,
          BOOKING_STATUS.IN_PROGRESS,
          BOOKING_STATUS.WORK_DONE
        ]
      }
    }).select('vendorId equipmentId scheduledDate scheduledTime timeSlot rental_type status bookingNumber').lean();

    const vendorBookingMap = new Map();
    existingBookings.forEach(b => {
      const vId = b.vendorId?.toString();
      if (vId) {
        if (!vendorBookingMap.has(vId)) vendorBookingMap.set(vId, []);
        vendorBookingMap.get(vId).push(b);
      }
    });

    // 5. Build Qualified Vendors List
    const qualifiedVendors = [];

    for (const eq of equipments) {
      const vId = eq.vendorId?.toString();
      const vendor = vendorMap.get(vId);
      if (!vendor) continue;

      // Horsepower validation: strictly exclude if minHp or maxHp specified and horsepower is explicitly out of range
      const eqHp = Number(eq.horsepower || eq.hp || 0);
      if (minHp && eqHp > 0 && eqHp < Number(minHp)) continue;
      if (maxHp && eqHp > 0 && eqHp > Number(maxHp)) continue;

      // Pricing validation for requested rental_type (must be explicitly enabled and price > 0)
      const pricingObj = eq.pricing?.[rental_type];
      const tractorUnitRate = (pricingObj?.isEnabled && pricingObj.price > 0) ? pricingObj.price : 0;
      if (tractorUnitRate <= 0) continue; // Not enabled or price <= 0

      // Implement validation & pricing
      let matchedImplement = null;
      let implementUnitRate = 0;
      if (implementId) {
        const foundImpl = (eq.implements || []).find(i => 
          (i.subCategoryId?._id || i.subCategoryId)?.toString() === implementId.toString()
        );
        const hasInSubCats = (eq.subCategoryIds || []).some(id =>
          (id?._id || id)?.toString() === implementId.toString()
        );

        if (foundImpl) {
          const implPriceObj = foundImpl.pricing?.[rental_type];
          implementUnitRate = (implPriceObj?.isEnabled && implPriceObj.price > 0) ? implPriceObj.price : 0;
          matchedImplement = {
            _id: foundImpl.subCategoryId?._id || foundImpl.subCategoryId,
            title: foundImpl.subCategoryId?.title || 'Selected Implement',
            rate: implementUnitRate
          };
        } else if (hasInSubCats) {
          matchedImplement = {
            _id: implementId,
            title: 'Selected Implement',
            rate: 0
          };
        } else {
          continue; // Implement not compatible/attached
        }
      }

      // Real-time availability check using normalized interval overlap
      const vendorBookings = vendorBookingMap.get(vId) || [];
      let isAvailable = true;
      let conflictReason = null;

      for (const b of vendorBookings) {
        const isSameMachine = !b.equipmentId || b.equipmentId.toString() === eq._id.toString();
        if (!isSameMachine) continue;

        const bInterval = parseSlotInterval(b.timeSlot, b.scheduledTime, b.rental_type);
        if (isIntervalOverlapping(bInterval, reqInterval)) {
          isAvailable = false;
          conflictReason = bInterval.isFullDay
            ? 'Booked for full day on this date'
            : `Busy during ${bInterval.rawStart || 'slot'} - ${bInterval.rawEnd || ''}`;
          break;
        }
      }

      // Calculate totals with 100% synchronized pricing breakdown
      const tractorTotal = Math.round(tractorUnitRate * multiplier);
      const implementTotal = Math.round(implementUnitRate * multiplier);
      const basePrice = tractorTotal + implementTotal;
      const tax = Math.round(basePrice * (gstPercentage / 100));
      const totalAmount = basePrice + tax + visitingCharges;

      qualifiedVendors.push({
        vendor: {
          _id: vendor._id,
          name: vendor.name,
          businessName: vendor.businessName || vendor.name,
          phone: vendor.phone,
          rating: vendor.rating || 4.8,
          avatar: vendor.avatar || vendor.profilePhoto || null,
          distance: vendor.distance
        },
        equipment: {
          _id: eq._id,
          name: eq.name,
          modelNumber: eq.modelNumber || '',
          year: eq.year || null,
          horsepower: eqHp,
          images: eq.images || [],
          includesDriver: eq.includesDriver !== false,
          driver: eq.driver || null,
          description: eq.description || ''
        },
        matchedImplement,
        pricing: {
          rental_type,
          multiplier,
          tractorUnitRate,
          tractorTotal,
          implementUnitRate,
          implementTotal,
          basePrice,
          tax,
          gstPercentage,
          visitingCharges,
          totalAmount
        },
        isAvailable,
        conflictReason
      });
    }

    // Sort: available vendors first, then by distance ascending
    qualifiedVendors.sort((a, b) => {
      if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
      return (a.vendor.distance || 0) - (b.vendor.distance || 0);
    });

    res.status(200).json({
      success: true,
      count: qualifiedVendors.length,
      data: qualifiedVendors,
      jobDetails: {
        categoryTitle,
        date,
        timeSlot: reqInterval.rawStart && reqInterval.rawEnd ? `${reqInterval.rawStart} - ${reqInterval.rawEnd}` : (timeSlot || 'Any Time'),
        rental_type,
        multiplier,
        visitingCharges,
        gstPercentage
      }
    });
  } catch (error) {
    console.error('Find qualified vendors error:', error);
    res.status(500).json({ success: false, message: 'Failed to search qualified vendors' });
  }
};
