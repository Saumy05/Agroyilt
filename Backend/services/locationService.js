const axios = require('axios');

/**
 * Location Service
 * Handles location-based operations using Google Maps API
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_API_URL = 'https://maps.googleapis.com/maps/api';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Object} coord1 - {lat, lng}
 * @param {Object} coord2 - {lat, lng}
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (coord1, coord2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Geocode address to coordinates using Google Maps API
 * @param {string} address - Full address string
 * @returns {Promise<Object|null>} {lat, lng}, or null when the address could not be located.
 *   Never a made-up position: a wrong place would send the job to the wrong vendors and price the trip to the wrong spot.
 */
const geocodeAddress = async (address) => {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('Google Maps API key not configured: address not geocoded');
      return null;
    }

    const response = await axios.get(`${GOOGLE_MAPS_API_URL}/geocode/json`, {
      params: {
        address: address,
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng
      };
    }

    throw new Error(`Geocoding failed: ${response.data.status}`);
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

/**
 * Find vendors within specified radius of a location
 * Priority: 1. Redis geo cache (fastest) → 2. MongoDB 2dsphere → 3. Haversine (fallback)
 * @param {Object} centerLocation - {lat, lng} of center point
 * @param {number} radiusKm - Search radius in kilometers (default: 10)
 * @param {Object} filters - Additional filters for vendors
 * @returns {Promise<Array>} Array of nearby vendors with distance
 */
const findNearbyVendors = async (centerLocation, radiusKm = 10, filters = {}) => {
  try {
    const Vendor = require('../models/Vendor');
    const { VENDOR_STATUS } = require('../utils/constants');
    const { getNearbyVendorsFromCache, isRedisConnected } = require('./redisService');

    // Extract custom options from filters
    const checkCashLimit = filters.checkCashLimit;
    const serviceCategory = filters.service; // Category title to match against vendor's categories array
    // Clone filters to avoid modifying original or polluting query
    const queryFilters = { ...filters };
    delete queryFilters.checkCashLimit;
    delete queryFilters.service; // Remove raw service filter — we handle it manually below

    // Build base query
    const baseQuery = {
      approvalStatus: VENDOR_STATUS.APPROVED,
      isActive: true,
      ...queryFilters
    };

    // Filter by vendor's selected categories (what they set in their profile) or fallback to their service list
    // Use flexible regex to match specific category or broader "Agriculture"/"Machinery"
    if (serviceCategory) {
      const cleanCategory = serviceCategory.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const categoryRegex = new RegExp(cleanCategory, 'i');
      // Also match by category id, so an admin renaming a category doesn't drop vendors who picked it
      const matchedCats = await require('../models/Category').find({ title: serviceCategory.trim() })
        .collation({ locale: 'en', strength: 2 }).select('_id').lean();
      baseQuery.$or = [
        ...(matchedCats.length ? [{ serviceCategoryIds: { $in: matchedCats.map(c => c._id) } }] : []),
        { categories: { $in: [categoryRegex] } },
        { service: { $in: [categoryRegex] } },
        { service: { $in: [/^agriculture$/i, /^machinery$/i, /^tractor/i] } },
        { categories: { $in: [/^agriculture$/i, /^machinery$/i, /^tractor/i] } }
      ];
      console.log(`[LocationService] Filtering vendors by category/service (flexible regex): "${serviceCategory}"`);
    }

    // Apply Cash Limit Check if requested
    if (checkCashLimit) {
      baseQuery.$expr = { $lte: ["$wallet.dues", "$wallet.cashLimit"] };
    }

    const VENDOR_SELECT_FIELDS = 'name businessName phone address profilePhoto service categories rating isOnline availability geoLocation fcmTokens';

    // OPTION 1: Try Redis geo cache first (fastest - <5ms)
    if (isRedisConnected()) {
      const cachedVendors = await getNearbyVendorsFromCache(centerLocation.lat, centerLocation.lng, radiusKm);

      if (cachedVendors && cachedVendors.length > 0) {
        console.log(`[LocationService] Found ${cachedVendors.length} vendors from Redis cache`);

        const vendorIds = cachedVendors.map(v => v.vendorId);
        const vendors = await Vendor.find({
          _id: { $in: vendorIds },
          ...baseQuery
        }).select(VENDOR_SELECT_FIELDS);

        const vendorMap = new Map(vendors.map(v => [v._id.toString(), v.toObject()]));
        const result = cachedVendors
          .filter(cv => vendorMap.has(cv.vendorId))
          .map(cv => ({
            ...vendorMap.get(cv.vendorId),
            distance: cv.distance
          }));

        if (result.length > 0) return result;
      }
    }

    // OPTION 2: Try MongoDB 2dsphere geo query (fast)
    let nearbyVendors = [];

    try {
      const hasGeoVendors = await Vendor.countDocuments({
        ...baseQuery,
        'geoLocation.coordinates': { $ne: [0, 0] }
      });

      if (hasGeoVendors > 0) {
        // Enforce deliveryRadius using geoNear aggregation
        const geoResults = await Vendor.aggregate([
          {
            $geoNear: {
              near: { type: 'Point', coordinates: [centerLocation.lng, centerLocation.lat] },
              distanceField: 'distance',
              maxDistance: radiusKm * 1000,
              spherical: true,
              query: baseQuery,
              distanceMultiplier: 0.001 // Convert meters to km
            }
          },
          {
            $match: {
              $expr: {
                $lte: ["$distance", { $ifNull: ["$shopDetails.deliveryRadius", 50] }]
              }
            }
          },
          { $limit: 20 }
        ]);

        if (geoResults.length > 0) {
          console.log(`[LocationService] Found ${geoResults.length} vendors using geoNear aggregation with deliveryRadius filter`);
          
          // Re-map to mongoose documents with distance property if needed,
          // though for our usage returning the plain object with distance is usually fine
          return geoResults.map(v => {
             return { ...v, id: v._id.toString() };
          });
        }
      }
    } catch (geoError) {
      console.warn('[LocationService] 2dsphere query failed, falling back to Haversine:', geoError.message);
    }

    // Fallback: Use Haversine formula (slower but works without geo index)
    const vendors = await Vendor.find(baseQuery).select(VENDOR_SELECT_FIELDS);

    nearbyVendors = vendors.map(vendor => {
      let distance = null;

      if (vendor.address && vendor.address.lat && vendor.address.lng) {
        distance = calculateDistance(centerLocation, {
          lat: vendor.address.lat,
          lng: vendor.address.lng
        });
      } else if (vendor.geoLocation && vendor.geoLocation.coordinates) {
        distance = calculateDistance(centerLocation, {
          lat: vendor.geoLocation.coordinates[1],
          lng: vendor.geoLocation.coordinates[0]
        });
      }

      const vendorObj = vendor.toObject();
      vendorObj.distance = distance;
      return vendorObj;
    }).filter(vendor => {
       const limit = vendor.shopDetails?.deliveryRadius || 50;
       return vendor.distance !== null && vendor.distance <= radiusKm && vendor.distance <= limit;
    });

    if (nearbyVendors.length > 0) {
      console.log(`[LocationService] Found ${nearbyVendors.length} vendors using Haversine`);
      return nearbyVendors;
    }

    // FALLBACK FOR DEVELOPMENT / TESTING:
    // If strict radius returned 0 vendors and search expanded to >= 30km,
    // find available active approved vendors so dispatch is never silently dropped in dev/testing
    if (radiusKm >= 30) {
      console.log(`[LocationService] No vendors within ${radiusKm}km. Fallback to active approved vendors for testing dispatch...`);
      const fallbackVendors = await Vendor.find({
        approvalStatus: VENDOR_STATUS.APPROVED,
        isActive: true
      }).select(VENDOR_SELECT_FIELDS).limit(5);

      if (fallbackVendors.length > 0) {
        console.log(`[LocationService] Fallback found ${fallbackVendors.length} vendors for dispatch`);
        return fallbackVendors.map(v => {
          const vObj = v.toObject();
          vObj.distance = vObj.distance || 5;
          return vObj;
        });
      }
    }

    return [];
  } catch (error) {
    console.error('Find nearby vendors error:', error);
    return [];
  }
};

/**
 * Find workers within specified radius of a location
 * @param {Object} centerLocation - {lat, lng} of center point
 * @param {number} radiusKm - Search radius in kilometers (default: 10)
 * @param {Object} filters - Additional filters for workers
 * @returns {Promise<Array>} Array of nearby workers with distance
 */
const findNearbyWorkers = async (centerLocation, radiusKm = 10, filters = {}) => {
  try {
    const Worker = require('../models/Worker');
    const { WORKER_STATUS } = require('../utils/constants');

    // Build base query
    const baseQuery = {
      status: WORKER_STATUS.AVAILABLE, // Only available workers are eligible
      ...filters
    };

    let nearbyWorkers = [];

    // Fallback: Use Haversine formula (assuming Worker model doesn't have 2dsphere yet or we do a simple query)
    const workers = await Worker.find(baseQuery)
      .select('name phone address profilePhoto skills serviceCategories status');

    // Calculate distances and filter by radius
    nearbyWorkers = workers.map(worker => {
      let distance = null;

      // If worker has coordinates in address
      if (worker.address && worker.address.lat && worker.address.lng) {
        distance = calculateDistance(centerLocation, {
          lat: worker.address.lat,
          lng: worker.address.lng
        });
      }

      return {
        ...worker.toObject(),
        distance: distance,
        withinRange: distance === null || distance <= radiusKm
      };
    }).filter(worker => worker.withinRange);

    console.log(`[LocationService] Found ${nearbyWorkers.length} workers using Haversine`);
    return nearbyWorkers;
  } catch (error) {
    console.error('Find nearby workers error:', error);
    return [];
  }
};

/**
 * Get distance matrix between multiple points
 * @param {Array} origins - Array of {lat, lng} objects
 * @param {Array} destinations - Array of {lat, lng} objects
 * @returns {Promise<Array>} Distance matrix
 */
const getDistanceMatrix = async (origins, destinations) => {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('Google Maps API key not configured, using mock distances');
      // Return mock distances
      return origins.map(() => destinations.map(() => ({ distance: { value: 5000 } })));
    }

    const originsStr = origins.map(coord => `${coord.lat},${coord.lng}`).join('|');
    const destinationsStr = destinations.map(coord => `${coord.lat},${coord.lng}`).join('|');

    const response = await axios.get(`${GOOGLE_MAPS_API_URL}/distancematrix/json`, {
      params: {
        origins: originsStr,
        destinations: destinationsStr,
        key: GOOGLE_MAPS_API_KEY,
        units: 'metric'
      }
    });

    return response.data.rows;
  } catch (error) {
    console.error('Distance matrix error:', error);
    return [];
  }
};

module.exports = {
  geocodeAddress,
  findNearbyVendors,
  findNearbyWorkers,
  calculateDistance,
  getDistanceMatrix
};
