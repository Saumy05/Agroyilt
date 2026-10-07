const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, isSuperAdmin } = require('../../middleware/roleMiddleware');
const { listRoles, getRole, createRole, updateRole, deleteRole, seedStarterRoles } = require('../../controllers/adminControllers/adminRoleController');

/**
 * Admin Roles (saved permission sets). Super admin only.
 * Base: /api/admin/roles
 */
router.use(authenticate, isAdmin, isSuperAdmin);

router.get('/', listRoles);
router.post('/', createRole);
router.post('/seed-starters', seedStarterRoles); // before /:id
router.get('/:id', getRole);
router.put('/:id', updateRole);
router.delete('/:id', deleteRole);

module.exports = router;
