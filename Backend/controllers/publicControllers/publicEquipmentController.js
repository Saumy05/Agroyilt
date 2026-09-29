const VendorEquipment = require('../../models/VendorEquipment');
const Vendor = require('../../models/Vendor');

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
    const { date, timeSlot } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }

    // Logic for checking existing bookings will go here later
    // For now, return available: true
    res.status(200).json({
      success: true,
      available: true,
      message: 'Slot is available'
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check availability'
    });
  }
};
