const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  getAllAdmins,
  createAdmin,
  updateAdmin,
  updateAdminRole,
  updatePermissions,
  toggleAdminStatus,
  deleteAdmin,
  getAuditLogs,
  getPermissionKeys,
  getAdminById,
  getAdminOnboardedPeoples,
  getAttributionSummary,
  exportAttributionData,
  updateAdminSalary,
  // Geographic
  getDistricts,
  createDistrict,
  updateDistrict,
  deleteDistrict,
  getSubDistricts,
  createSubDistrict,
  updateSubDistrict,
  deleteSubDistrict
} = require('../../controllers/adminControllers/adminManagementController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, isSuperAdmin } = require('../../middleware/roleMiddleware');

// ── Validation ────────────────────────────────────────────────────────────

const createAdminValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['super_admin', 'admin']).withMessage('Invalid role'),
  body('scopeType').optional().isIn(['GLOBAL', 'CITY', 'DISTRICT', 'SUB_DISTRICT']).withMessage('Invalid scope type'),
  body('salary.minRegistrationsForIncentive').optional().custom(val => {
    if (val === '' || val === null || val === undefined) return true;
    const num = Number(val);
    if (!Number.isInteger(num) || num < 0) {
      throw new Error('Minimum combined registration threshold must be a valid non-negative integer');
    }
    return true;
  })
];

// All routes require authenticated active admin
router.use(authenticate, isAdmin);

// ── IMPORTANT: Static/specific routes MUST come before /:id wildcard ──────

// Admin collection routes (Super Admin only)
router.get('/', isSuperAdmin, getAllAdmins);
router.post('/', isSuperAdmin, createAdminValidation, createAdmin);

// People Attribution & Traceability routes (Super Admin only)
router.get('/attribution/summary', isSuperAdmin, getAttributionSummary);
router.get('/attribution/export', isSuperAdmin, exportAttributionData);

// Static named routes (must be before /:id to avoid Express matching as id)
router.get('/permission-keys', isSuperAdmin, getPermissionKeys);
router.get('/audit-logs', isSuperAdmin, getAuditLogs);

// Districts (static prefix 'geo' before /:id)
router.get('/geo/districts', isSuperAdmin, getDistricts);
router.post('/geo/districts', isSuperAdmin, createDistrict);
router.put('/geo/districts/:id', isSuperAdmin, updateDistrict);
router.delete('/geo/districts/:id', isSuperAdmin, deleteDistrict);

// Sub-Districts
router.get('/geo/sub-districts', isSuperAdmin, getSubDistricts);
router.post('/geo/sub-districts', isSuperAdmin, createSubDistrict);
router.put('/geo/sub-districts/:id', isSuperAdmin, updateSubDistrict);
router.delete('/geo/sub-districts/:id', isSuperAdmin, deleteSubDistrict);

// ── Dynamic /:id routes (must come AFTER all static routes) ──────────────
// People registered by this admin: Super admin can view any, admin can view their own (enforced in controller)
router.get('/:id/registrations', getAdminOnboardedPeoples);

router.get('/:id', isSuperAdmin, getAdminById);
router.put('/:id/salary', isSuperAdmin, updateAdminSalary);
router.put('/:id', isSuperAdmin, updateAdmin);
router.put('/:id/role', isSuperAdmin, updateAdminRole);
router.patch('/:id/permissions', isSuperAdmin, updatePermissions);
router.patch('/:id/status', isSuperAdmin, toggleAdminStatus);
router.delete('/:id', isSuperAdmin, deleteAdmin);

module.exports = router;
