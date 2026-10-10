const User = require('../../models/User');

/**
 * Standard Indian Land Measurement Conversions
 * 1 Acre = 4046.8564224 sq meters = 43,560 sq ft
 * 1 Hectare = 10,000 sq meters = 2.47105 acres
 * 1 Acre = 40 Gunthas
 */
const REGIONAL_BIGHA_RATES = {
  standard: { rate: 1.613, label: 'Standard / Uttar Pradesh (1 Acre ≈ 1.61 Bigha)' },
  up_bihar: { rate: 1.613, label: 'UP / Bihar (1 Acre ≈ 1.61 Bigha)' },
  rajasthan: { rate: 1.60, label: 'Rajasthan (1 Acre ≈ 1.60 Bigha)' },
  mp: { rate: 1.67, label: 'Madhya Pradesh (1 Acre ≈ 1.67 Bigha)' },
  punjab_haryana: { rate: 1.0, label: 'Punjab / Haryana (1 Acre = 1 Killa / Pucca Bigha)' },
  gujarat: { rate: 2.47, label: 'Gujarat (1 Acre ≈ 2.47 Vigha)' },
  west_bengal: { rate: 3.025, label: 'West Bengal (1 Acre ≈ 3.03 Bigha)' },
  maharashtra: { rate: 1.613, label: 'Maharashtra (Primary: Guntha, 1 Acre = 40 Guntha)' }
};

// Haversine distance in meters
function getHaversineDistance(p1, p2) {
  const R = 6378137;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Spherical geodesic polygon area in square meters (Gauss / WGS84 authalic)
function calculateGeodesicArea(points) {
  if (!points || points.length < 3) return 0;
  const RADIUS = 6378137;
  let total = 0;
  const len = points.length;

  for (let i = 0; i < len; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % len];
    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const lng1 = (p1.lng * Math.PI) / 180;
    const lng2 = (p2.lng * Math.PI) / 180;
    total += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((total * RADIUS * RADIUS) / 2);
}

// Perimeter length in meters
function calculatePerimeter(points) {
  if (!points || points.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    perimeter += getHaversineDistance(points[i], next);
  }
  return perimeter;
}

/**
 * Controller for Field Area Measurement API
 */
const fieldAreaController = {
  /**
   * Calculate field area from polygon coordinates or manual acreage input
   * POST /api/field-area/calculate
   */
  calculate: async (req, res) => {
    try {
      const { points, manualAcres, region = 'standard' } = req.body;

      let areaSqMeters = 0;
      let perimeterMeters = 0;
      let pointCount = 0;

      if (Array.isArray(points) && points.length >= 3) {
        // Filter and validate lat/lng points
        const validPoints = points.filter(
          p => p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
        );

        if (validPoints.length < 3) {
          return res.status(400).json({
            success: false,
            message: 'A valid polygon requires at least 3 GPS coordinates.'
          });
        }

        pointCount = validPoints.length;
        areaSqMeters = calculateGeodesicArea(validPoints);
        perimeterMeters = calculatePerimeter(validPoints);
      } else if (manualAcres !== undefined && manualAcres !== null) {
        const parsedAcres = parseFloat(manualAcres);
        if (isNaN(parsedAcres) || parsedAcres <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Please provide a valid manual acreage greater than 0.'
          });
        }
        areaSqMeters = parsedAcres * 4046.8564224;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Either polygon points (min 3) or manualAcres must be provided.'
        });
      }

      // Convert to agricultural units
      const acres = areaSqMeters / 4046.8564224;
      const hectares = areaSqMeters / 10000;
      const sqFeet = areaSqMeters * 10.7639104;
      const guntha = acres * 40;

      const regionConfig = REGIONAL_BIGHA_RATES[region] || REGIONAL_BIGHA_RATES.standard;
      const bigha = acres * regionConfig.rate;

      return res.status(200).json({
        success: true,
        data: {
          area: {
            acres: Math.round(acres * 10000) / 10000,
            acresFormatted: Number(acres.toFixed(2)),
            bigha: Math.round(bigha * 1000) / 1000,
            bighaFormatted: Number(bigha.toFixed(2)),
            guntha: Math.round(guntha * 100) / 100,
            gunthaFormatted: Number(guntha.toFixed(1)),
            hectares: Math.round(hectares * 10000) / 10000,
            hectaresFormatted: Number(hectares.toFixed(2)),
            sqMeters: Math.round(areaSqMeters * 100) / 100,
            sqFeet: Math.round(sqFeet)
          },
          perimeter: {
            meters: Math.round(perimeterMeters * 10) / 10,
            feet: Math.round(perimeterMeters * 3.28084 * 10) / 10
          },
          pointsCount: pointCount,
          region: {
            key: region,
            label: regionConfig.label,
            ratePerAcre: regionConfig.rate
          }
        }
      });
    } catch (error) {
      console.error('Field Area Calculation Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to calculate field area',
        error: error.message
      });
    }
  },

  /**
   * Get supported regional conversion units
   * GET /api/field-area/regions
   */
  getRegions: async (req, res) => {
    try {
      const regions = Object.entries(REGIONAL_BIGHA_RATES).map(([key, val]) => ({
        key,
        rate: val.rate,
        label: val.label
      }));
      return res.status(200).json({
        success: true,
        data: regions
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch regional units'
      });
    }
  },

  /**
   * Save measured field boundaries to farmer profile
   * POST /api/field-area/save-farm
   */
  saveFarmBoundary: async (req, res) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to save farm boundary'
        });
      }

      const { name, sizeInAcres, khasraNumber, cropType, polygonCoordinates, centerLocation } = req.body;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ success: false, message: 'Farmer not found' });
      }

      const newFarm = {
        name: name || `Measured Field (${new Date().toLocaleDateString('en-IN')})`,
        sizeInAcres: parseFloat(sizeInAcres) || 0,
        khasraNumber: khasraNumber || null,
        cropType: cropType || [],
        location: centerLocation || (polygonCoordinates && polygonCoordinates[0]) || { lat: 0, lng: 0 },
        polygonCoordinates: polygonCoordinates || []
      };

      user.farms = user.farms || [];
      user.farms.push(newFarm);
      await user.save();

      return res.status(201).json({
        success: true,
        message: 'Farm boundary saved successfully',
        data: user.farms
      });
    } catch (error) {
      console.error('Save Farm Boundary Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to save farm boundary',
        error: error.message
      });
    }
  }
};

module.exports = fieldAreaController;
