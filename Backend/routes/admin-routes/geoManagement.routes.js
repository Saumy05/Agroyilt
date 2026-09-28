/**
 * Admin Geographic Management Routes
 * Handles States, Districts, and Sub-Districts
 *
 * Routes:
 *   GET    /api/admin/states
 *   POST   /api/admin/states
 *   PUT    /api/admin/states/:id
 *   DELETE /api/admin/states/:id
 *   PATCH  /api/admin/states/:id/status
 *
 *   GET    /api/admin/districts
 *   POST   /api/admin/districts
 *   PUT    /api/admin/districts/:id
 *   DELETE /api/admin/districts/:id
 *   PATCH  /api/admin/districts/:id/status
 *
 *   GET    /api/admin/sub-districts
 *   POST   /api/admin/sub-districts
 *   PUT    /api/admin/sub-districts/:id
 *   DELETE /api/admin/sub-districts/:id
 *   PATCH  /api/admin/sub-districts/:id/status
 */
const express = require('express');
const router = express.Router();
const {
  getAllStates,
  createState,
  updateState,
  deleteState,
  toggleStateStatus,
  getAllDistricts,
  createDistrict,
  updateDistrict,
  deleteDistrict,
  toggleDistrictStatus,
  getAllSubDistricts,
  createSubDistrict,
  updateSubDistrict,
  deleteSubDistrict,
  toggleSubDistrictStatus
} = require('../../controllers/geoController');

const { authenticate } = require('../../middleware/authMiddleware');
const { isSuperAdmin } = require('../../middleware/roleMiddleware');

// All routes require Super Admin
router.use(authenticate, isSuperAdmin);

// ── States ──────────────────────────────────────────────────────────────────
router.route('/states')
  .get(getAllStates)
  .post(createState);

router.route('/states/:id')
  .put(updateState)
  .delete(deleteState);

router.patch('/states/:id/status', toggleStateStatus);

// ── Districts ────────────────────────────────────────────────────────────────
router.route('/districts')
  .get(getAllDistricts)
  .post(createDistrict);

router.route('/districts/:id')
  .put(updateDistrict)
  .delete(deleteDistrict);

router.patch('/districts/:id/status', toggleDistrictStatus);

// ── Sub-Districts ─────────────────────────────────────────────────────────────
router.route('/sub-districts')
  .get(getAllSubDistricts)
  .post(createSubDistrict);

router.route('/sub-districts/:id')
  .put(updateSubDistrict)
  .delete(deleteSubDistrict);

router.patch('/sub-districts/:id/status', toggleSubDistrictStatus);

module.exports = router;
