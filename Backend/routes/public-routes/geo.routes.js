/**
 * Public Geographic Routes (no authentication)
 * Used by the user/farmer frontend to load states, districts, sub-districts
 * for location selection.
 *
 * Routes:
 *   GET /api/public/states
 *   GET /api/public/states/:stateId/districts
 *   GET /api/public/districts/:districtId/sub-districts
 */
const express = require('express');
const router = express.Router();
const {
  getActiveStates,
  getDistrictsByState,
  getSubDistrictsByDistrict
} = require('../../controllers/geoController');

// Public — no authentication required
router.get('/states', getActiveStates);
router.get('/states/:stateId/districts', getDistrictsByState);
router.get('/districts/:districtId/sub-districts', getSubDistrictsByDistrict);

module.exports = router;
