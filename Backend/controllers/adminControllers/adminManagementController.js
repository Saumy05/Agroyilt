const mongoose = require('mongoose');
const Admin = require('../../models/Admin');
const AdminAuditLog = require('../../models/AdminAuditLog');
const State = require('../../models/State');
const District = require('../../models/District');
const SubDistrict = require('../../models/SubDistrict');
const { validateGeoScope } = require('../geoController');
const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');
const { validationResult } = require('express-validator');
const { PERMISSION_KEYS } = require('../../models/Admin');
const AdminRole = require('../../models/AdminRole');

/** Resolve an optional roleId from the request. Returns { role } | { error } ; role is null when none/cleared. */
const resolveRoleInput = async (roleId) => {
  if (roleId === undefined) return { skip: true };
  if (!roleId) return { role: null };
  if (!mongoose.isValidObjectId(roleId)) return { error: 'Invalid role' };
  const role = await AdminRole.findById(roleId).lean();
  return role ? { role } : { error: 'Role not found' };
};
const { calculateAdminCombinedIncentives } = require('../../utils/adminIncentiveHelper');

/**
 * Helper: extract request context for audit logs
 */
const getAuditContext = (req) => ({
  ipAddress: req.ip || req.connection?.remoteAddress,
  userAgent: req.headers['user-agent']
});

/**
 * Helper: extract admin identity for audit logs
 */
const getActorInfo = (admin) => ({
  adminId: admin._id,
  adminName: admin.name,
  adminEmail: admin.email,
  adminRole: admin.role
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/admins
// ────────────────────────────────────────────────────────────────────────────
const getAllAdmins = async (req, res) => {
  try {
    const { search, role, isActive, page = 1, limit = 50 } = req.query;

    const query = {};
    if (role && ['super_admin', 'admin'].includes(role)) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [admins, total] = await Promise.all([
      Admin.find(query)
        .select('-password')
        .populate('cityId', 'name')
        .populate('districtId', 'name')
        .populate('subDistrictId', 'name')
        .populate('createdBy', 'name email role')
        .populate('roleId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Admin.countDocuments(query)
    ]);

    // Calculate authoritative scope-aware registrations and threshold incentive stats for all admins
    const enrichedAdmins = await Promise.all(admins.map(async (admin) => {
      try {
        const calc = await calculateAdminCombinedIncentives(admin, { persist: false });
        return {
          ...admin,
          onboardedStats: {
            farmers: calc.counts.farmers,
            vendors: calc.counts.vendors,
            workers: calc.counts.workers,
            total: calc.totalCombinedRegistrations,
            minThreshold: calc.minRegistrationsThreshold,
            isThresholdMet: calc.isThresholdMet,
            qualifyingCount: calc.qualifyingRegistrationsCount,
            registrationsRemainingToUnlock: calc.registrationsRemainingToUnlock,
            farmerIncentives: calc.incentives.farmerIncentivesEarned,
            vendorIncentives: calc.incentives.vendorIncentivesEarned,
            workerIncentives: calc.incentives.workerIncentivesEarned,
            earnedIncentive: calc.incentives.totalIncentivesEarned,
            totalEstimatedComp: (admin.salary?.baseSalary || 0) + calc.incentives.totalIncentivesEarned
          }
        };
      } catch (err) {
        console.error('Error calculating incentives for admin:', admin._id, err);
        return {
          ...admin,
          onboardedStats: {
            farmers: 0,
            vendors: 0,
            workers: 0,
            total: 0,
            minThreshold: admin.salary?.minRegistrationsForIncentive || 0,
            isThresholdMet: false,
            qualifyingCount: 0,
            registrationsRemainingToUnlock: 0,
            farmerIncentives: 0,
            vendorIncentives: 0,
            workerIncentives: 0,
            earnedIncentive: 0,
            totalEstimatedComp: admin.salary?.baseSalary || 0
          }
        };
      }
    }));

    res.status(200).json({
      success: true,
      data: enrichedAdmins,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admins' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /api/admin/admins
// ────────────────────────────────────────────────────────────────────────────
const createAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      name, email, password, role,
      scopeType,
      stateId, stateName,
      cityId, cityName,
      districtId, districtName,
      subDistrictId, subDistrictName,
      permissions
    } = req.body;

    // Check duplicate
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin with this email already exists'
      });
    }

    const roleInput = await resolveRoleInput(req.body.roleId);
    if (roleInput.error) return res.status(400).json({ success: false, message: roleInput.error });

    // Build permissions object (only relevant for non-super_admin)
    let resolvedPermissions = Admin.defaultPermissions();
    if (role !== 'super_admin' && permissions && typeof permissions === 'object') {
      PERMISSION_KEYS.forEach(key => {
        if (permissions[key] === true) resolvedPermissions[key] = true;
      });
    } else if (role !== 'super_admin' && roleInput.role) {
      // A role was picked but no explicit ticks were sent: start from the role
      roleInput.role.permissionKeys.forEach(key => { resolvedPermissions[key] = true; });
    }

    // Validate Minimum Combined Registration Threshold if provided
    if (req.body.salary && req.body.salary.minRegistrationsForIncentive !== undefined && req.body.salary.minRegistrationsForIncentive !== '') {
      const minThresh = Number(req.body.salary.minRegistrationsForIncentive);
      if (isNaN(minThresh) || minThresh < 0 || !Number.isInteger(minThresh)) {
        return res.status(400).json({
          success: false,
          message: 'Minimum combined registration threshold must be a valid non-negative integer'
        });
      }
    }

    // Determine effective scope: super_admin always gets GLOBAL_INDIA
    const effectiveScopeType = role === 'super_admin' ? 'GLOBAL_INDIA' : (scopeType || 'GLOBAL_INDIA');

    // Server-side hierarchy validation for scoped admins
    if (role !== 'super_admin' && !['GLOBAL', 'GLOBAL_INDIA', 'CITY'].includes(effectiveScopeType)) {
      try {
        await validateGeoScope(effectiveScopeType, stateId, districtId, subDistrictId);
      } catch (geoErr) {
        return res.status(400).json({
          success: false,
          message: geoErr.message
        });
      }
    }

    const admin = await Admin.create({
      name,
      email,
      password,
      role: role || 'admin',
      roleId: role === 'super_admin' ? null : (roleInput.role?._id || null),
      scopeType: effectiveScopeType,
      stateId: stateId || null,
      stateName: stateName || '',
      cityId: cityId || null,
      cityName: cityName || '',
      districtId: districtId || null,
      districtName: districtName || '',
      subDistrictId: subDistrictId || null,
      subDistrictName: subDistrictName || '',
      permissions: resolvedPermissions,
      createdBy: req.user._id,
      salary: req.body.salary && typeof req.body.salary === 'object' ? {
        baseSalary: Number(req.body.salary.baseSalary) >= 0 ? Number(req.body.salary.baseSalary) : 0,
        payFrequency: req.body.salary.payFrequency || 'monthly',
        status: req.body.salary.status || 'ACTIVE',
        effectiveFrom: req.body.salary.effectiveFrom || new Date(),
        effectiveTo: req.body.salary.effectiveTo || null,
        farmerIncentive: Number(req.body.salary.farmerIncentive) >= 0 ? Number(req.body.salary.farmerIncentive) : 0,
        vendorIncentive: Number(req.body.salary.vendorIncentive) >= 0 ? Number(req.body.salary.vendorIncentive) : 0,
        workerIncentive: Number(req.body.salary.workerIncentive) >= 0 ? Number(req.body.salary.workerIncentive) : 0,
        minRegistrationsForIncentive: Number(req.body.salary.minRegistrationsForIncentive) >= 0 ? Number(req.body.salary.minRegistrationsForIncentive) : 0,
        bankDetails: req.body.salary.bankDetails || {},
        notes: req.body.salary.notes || ''
      } : undefined
    });

    // Audit log
    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'CREATE_ADMIN',
      module: 'ADMIN_MANAGEMENT',
      targetId: admin._id,
      targetModel: 'Admin',
      targetName: admin.name,
      description: `Created new admin "${admin.name}" (${admin.email}) with role "${admin.role}" and scope "${effectiveScopeType}"`,
      metadata: {
        role: admin.role,
        scopeType: effectiveScopeType,
        cityName: admin.cityName,
        districtName: admin.districtName,
        subDistrictName: admin.subDistrictName
      }
    });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: admin.toPublicJSON()
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ success: false, message: 'Failed to create admin' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/admins/:id
// ────────────────────────────────────────────────────────────────────────────
const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, password, role,
      scopeType,
      stateId, stateName,
      cityId, cityName,
      districtId, districtName,
      subDistrictId, subDistrictName,
      permissions
    } = req.body;

    let admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    // Prevent self-demotion
    if (id.toString() === req.user._id.toString() && role && role !== 'super_admin' && admin.role === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Cannot demote yourself' });
    }

    // Email uniqueness
    if (email && email.toLowerCase().trim() !== admin.email) {
      const existing = await Admin.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
    }

    const before = {
      name: admin.name, email: admin.email, role: admin.role,
      scopeType: admin.scopeType, stateName: admin.stateName, cityName: admin.cityName,
      districtName: admin.districtName, subDistrictName: admin.subDistrictName,
      isActive: admin.isActive
    };

    // Update fields
    if (name) admin.name = name;
    if (email) admin.email = email.toLowerCase().trim();
    if (password) admin.password = password; // pre-save hook hashes it

    if (role && ['super_admin', 'admin'].includes(role)) {
      admin.role = role;
    }

    // Geographic scope
    const targetRole = (role && ['super_admin', 'admin'].includes(role)) ? role : admin.role;
    const newScopeType = targetRole === 'super_admin' ? 'GLOBAL_INDIA' : (scopeType || admin.scopeType || 'GLOBAL_INDIA');

    // Server-side hierarchy validation for scoped admins
    if (targetRole !== 'super_admin' && !['GLOBAL', 'GLOBAL_INDIA', 'CITY'].includes(newScopeType)) {
      try {
        const targetStateId = stateId !== undefined ? stateId : admin.stateId;
        const targetDistrictId = districtId !== undefined ? districtId : admin.districtId;
        const targetSubDistrictId = subDistrictId !== undefined ? subDistrictId : admin.subDistrictId;
        await validateGeoScope(newScopeType, targetStateId, targetDistrictId, targetSubDistrictId);
      } catch (geoErr) {
        return res.status(400).json({
          success: false,
          message: geoErr.message
        });
      }
    }

    admin.scopeType = newScopeType;

    if (stateId !== undefined) admin.stateId = stateId || null;
    if (stateName !== undefined) admin.stateName = stateName || '';
    if (cityId !== undefined) admin.cityId = cityId || null;
    if (cityName !== undefined) admin.cityName = cityName || '';
    if (districtId !== undefined) admin.districtId = districtId || null;
    if (districtName !== undefined) admin.districtName = districtName || '';
    if (subDistrictId !== undefined) admin.subDistrictId = subDistrictId || null;
    if (subDistrictName !== undefined) admin.subDistrictName = subDistrictName || '';

    const roleInput = await resolveRoleInput(req.body.roleId);
    if (roleInput.error) return res.status(400).json({ success: false, message: roleInput.error });
    if (!roleInput.skip) admin.roleId = admin.role === 'super_admin' ? null : (roleInput.role?._id || null);

    // Permissions (only for non-super_admin)
    if (admin.role !== 'super_admin' && permissions && typeof permissions === 'object') {
      const updatedPermissions = admin.permissions || {};
      PERMISSION_KEYS.forEach(key => {
        updatedPermissions[key] = permissions[key] === true;
      });
      admin.permissions = updatedPermissions;
      admin.markModified('permissions');
    }

    // Salary & Incentive settings (Super Admin configurable with historical versioning)
    if (req.body.salary && typeof req.body.salary === 'object') {
      const s = req.body.salary;
      if (s.minRegistrationsForIncentive !== undefined && s.minRegistrationsForIncentive !== '') {
        const minThresh = Number(s.minRegistrationsForIncentive);
        if (isNaN(minThresh) || minThresh < 0 || !Number.isInteger(minThresh)) {
          return res.status(400).json({
            success: false,
            message: 'Minimum combined registration threshold must be a valid non-negative integer'
          });
        }
      }
      const newBaseSalary = Number(s.baseSalary) >= 0 ? Number(s.baseSalary) : (admin.salary?.baseSalary || 0);
      const newFarmerIncentive = Number(s.farmerIncentive) >= 0 ? Number(s.farmerIncentive) : (admin.salary?.farmerIncentive || 0);
      const newVendorIncentive = Number(s.vendorIncentive) >= 0 ? Number(s.vendorIncentive) : (admin.salary?.vendorIncentive || 0);
      const newWorkerIncentive = Number(s.workerIncentive) >= 0 ? Number(s.workerIncentive) : (admin.salary?.workerIncentive || 0);
      const newMinRegistrations = Number(s.minRegistrationsForIncentive) >= 0 ? Number(s.minRegistrationsForIncentive) : (admin.salary?.minRegistrationsForIncentive || 0);
      const newStatus = s.status || admin.salary?.status || 'ACTIVE';
      const newEffectiveFrom = s.effectiveFrom ? new Date(s.effectiveFrom) : (admin.salary?.effectiveFrom || new Date());

      // If configuration values changed and previous config existed, archive previous version
      const oldSalary = admin.salary ? (admin.salary.toObject ? admin.salary.toObject() : { ...admin.salary }) : null;
      const hasMeaningfulChange = oldSalary && (
        oldSalary.baseSalary !== newBaseSalary ||
        oldSalary.farmerIncentive !== newFarmerIncentive ||
        oldSalary.vendorIncentive !== newVendorIncentive ||
        oldSalary.workerIncentive !== newWorkerIncentive ||
        (oldSalary.minRegistrationsForIncentive || 0) !== newMinRegistrations ||
        oldSalary.status !== newStatus
      );

      if (hasMeaningfulChange && (oldSalary.baseSalary > 0 || oldSalary.farmerIncentive > 0 || oldSalary.vendorIncentive > 0 || oldSalary.workerIncentive > 0 || (oldSalary.minRegistrationsForIncentive || 0) > 0)) {
        if (!admin.salaryHistory) admin.salaryHistory = [];
        admin.salaryHistory.push({
          version: (admin.salaryHistory.length || 0) + 1,
          baseSalary: oldSalary.baseSalary || 0,
          payFrequency: oldSalary.payFrequency || 'monthly',
          status: oldSalary.status || 'ACTIVE',
          effectiveFrom: oldSalary.effectiveFrom || admin.createdAt || new Date(),
          effectiveTo: newEffectiveFrom,
          farmerIncentive: oldSalary.farmerIncentive || 0,
          vendorIncentive: oldSalary.vendorIncentive || 0,
          workerIncentive: oldSalary.workerIncentive || 0,
          minRegistrationsForIncentive: oldSalary.minRegistrationsForIncentive || 0,
          bankDetails: oldSalary.bankDetails || {},
          notes: oldSalary.notes || '',
          changeReason: s.changeReason || 'Salary configuration updated in Admin Edit',
          changedBy: req.user._id,
          changedAt: new Date()
        });
      }

      admin.salary = {
        baseSalary: newBaseSalary,
        payFrequency: s.payFrequency || admin.salary?.payFrequency || 'monthly',
        status: newStatus,
        effectiveFrom: newEffectiveFrom,
        effectiveTo: s.effectiveTo ? new Date(s.effectiveTo) : null,
        farmerIncentive: newFarmerIncentive,
        vendorIncentive: newVendorIncentive,
        workerIncentive: newWorkerIncentive,
        minRegistrationsForIncentive: newMinRegistrations,
        bankDetails: s.bankDetails || admin.salary?.bankDetails || {},
        notes: s.notes !== undefined ? s.notes : (admin.salary?.notes || '')
      };
      admin.markModified('salary');
      admin.markModified('salaryHistory');
    }

    await admin.save();
    await admin.populate([
      { path: 'cityId', select: 'name' },
      { path: 'districtId', select: 'name' },
      { path: 'subDistrictId', select: 'name' },
      { path: 'createdBy', select: 'name email' }
    ]);

    // Audit log
    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'UPDATE_ADMIN',
      module: 'ADMIN_MANAGEMENT',
      targetId: admin._id,
      targetModel: 'Admin',
      targetName: admin.name,
      description: `Updated admin "${admin.name}" (${admin.email})`,
      metadata: { before, after: { name: admin.name, email: admin.email, role: admin.role, scopeType: admin.scopeType } }
    });

    res.status(200).json({
      success: true,
      message: 'Admin updated successfully',
      data: admin.toPublicJSON()
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ success: false, message: 'Failed to update admin' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/admins/:id/permissions
// ────────────────────────────────────────────────────────────────────────────
const updatePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, message: 'Permissions object required' });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (admin.role === 'super_admin') {
      return res.status(400).json({
        success: false,
        message: 'Super Admin has all permissions by default. No need to set individual permissions.'
      });
    }

    const oldPermissions = { ...admin.permissions };
    const newPermissions = {};

    PERMISSION_KEYS.forEach(key => {
      newPermissions[key] = permissions[key] === true;
    });

    admin.permissions = newPermissions;
    admin.markModified('permissions');
    await admin.save();

    // Calculate what changed
    const changes = PERMISSION_KEYS.filter(k => (oldPermissions[k] || false) !== newPermissions[k]);

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'UPDATE_PERMISSIONS',
      module: 'ADMIN_MANAGEMENT',
      targetId: admin._id,
      targetModel: 'Admin',
      targetName: admin.name,
      description: `Updated permissions for admin "${admin.name}". Changed keys: ${changes.join(', ') || 'none'}`,
      metadata: { before: oldPermissions, after: newPermissions, changedKeys: changes }
    });

    res.status(200).json({
      success: true,
      message: 'Permissions updated successfully',
      data: { permissions: admin.permissions }
    });
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to update permissions' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/admins/:id/status  (block/unblock)
// ────────────────────────────────────────────────────────────────────────────
const toggleAdminStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot block yourself' });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (admin.email === 'admin@admin.com') {
      return res.status(400).json({ success: false, message: 'Cannot block primary super admin' });
    }

    const prevStatus = admin.isActive;
    admin.isActive = !admin.isActive;
    await admin.save();

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: admin.isActive ? 'UNBLOCK_ADMIN' : 'BLOCK_ADMIN',
      module: 'ADMIN_MANAGEMENT',
      targetId: admin._id,
      targetModel: 'Admin',
      targetName: admin.name,
      description: `${admin.isActive ? 'Unblocked' : 'Blocked'} admin account "${admin.name}" (${admin.email})`,
      metadata: { prevStatus, newStatus: admin.isActive }
    });

    res.status(200).json({
      success: true,
      message: `Admin ${admin.isActive ? 'unblocked' : 'blocked'} successfully`,
      data: { isActive: admin.isActive }
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/admins/:id
// ────────────────────────────────────────────────────────────────────────────
const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (admin.email === 'admin@admin.com') {
      return res.status(400).json({ success: false, message: 'Cannot delete the primary super admin account' });
    }

    const adminName = admin.name;
    const adminEmail = admin.email;
    await Admin.findByIdAndDelete(id);

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'DELETE_ADMIN',
      module: 'ADMIN_MANAGEMENT',
      targetId: id,
      targetModel: 'Admin',
      targetName: adminName,
      description: `Permanently deleted admin account "${adminName}" (${adminEmail})`
    });

    res.status(200).json({
      success: true,
      message: 'Admin deleted successfully'
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete admin' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/admins/:id/role  (legacy, kept for backwards compat)
// ────────────────────────────────────────────────────────────────────────────
const updateAdminRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['super_admin', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    if (id.toString() === req.user._id.toString() && role !== 'super_admin') {
      return res.status(400).json({ success: false, message: 'Cannot change your own role' });
    }

    const admin = await Admin.findByIdAndUpdate(
      id,
      { role, scopeType: role === 'super_admin' ? 'GLOBAL' : undefined },
      { new: true }
    ).select('-password');

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'CHANGE_ROLE',
      module: 'ADMIN_MANAGEMENT',
      targetId: admin._id,
      targetModel: 'Admin',
      targetName: admin.name,
      description: `Changed role of admin "${admin.name}" to "${role}"`
    });

    res.status(200).json({ success: true, message: 'Admin role updated', data: admin });
  } catch (error) {
    console.error('Update admin role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update admin role' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/admins/audit-logs
// ────────────────────────────────────────────────────────────────────────────
const getAuditLogs = async (req, res) => {
  try {
    const { adminId, module, action, page = 1, limit = 50, startDate, endDate } = req.query;

    const query = {};
    if (adminId) query.adminId = adminId;
    if (module) query.module = module;
    if (action) query.action = { $regex: action, $options: 'i' };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      AdminAuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('adminId', 'name email role profilePhoto'),
      AdminAuditLog.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/admins/permission-keys   (returns all available permission keys)
// ────────────────────────────────────────────────────────────────────────────
const getPermissionKeys = async (req, res) => {
  res.status(200).json({
    success: true,
    data: PERMISSION_KEYS
  });
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/admins/:id   (single admin detail)
// ────────────────────────────────────────────────────────────────────────────
const getAdminById = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id)
      .select('-password')
      .populate('cityId', 'name')
      .populate('districtId', 'name')
      .populate('subDistrictId', 'name')
      .populate('createdBy', 'name email role')
      .lean();

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    // Parallel count of people onboarded by this admin
    const [farmersCount, vendorsCount, workersCount] = await Promise.all([
      User.countDocuments({ createdByAdmin: admin._id }),
      Vendor.countDocuments({ createdByAdmin: admin._id }),
      Worker.countDocuments({ createdByAdmin: admin._id })
    ]);

    const farmerIncentive = admin.salary?.farmerIncentive || 0;
    const vendorIncentive = admin.salary?.vendorIncentive || 0;
    const workerIncentive = admin.salary?.workerIncentive || 0;
    const earnedIncentive = (farmersCount * farmerIncentive) + (vendorsCount * vendorIncentive) + (workersCount * workerIncentive);

    const enriched = {
      ...admin,
      onboardedStats: {
        farmers: farmersCount,
        vendors: vendorsCount,
        workers: workersCount,
        total: farmersCount + vendorsCount + workersCount,
        earnedIncentive,
        totalEstimatedComp: (admin.salary?.baseSalary || 0) + earnedIncentive
      }
    };

    res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    console.error('Get admin by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Attribution Helpers
// ────────────────────────────────────────────────────────────────────────────
const buildAttributionDateFilter = (dateRange, startDate, endDate) => {
  const filter = {};
  const now = new Date();
  
  if (dateRange === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    filter.createdAt = { $gte: start, $lte: end };
  } else if (dateRange === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
    filter.createdAt = { $gte: start, $lte: end };
  } else if (dateRange === '7days' || dateRange === 'last7') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    filter.createdAt = { $gte: start, $lte: now };
  } else if (dateRange === '30days' || dateRange === 'last30') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    filter.createdAt = { $gte: start, $lte: now };
  } else if (dateRange === 'custom') {
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
  }
  return filter;
};

const buildAttributionStatusFilter = (status) => {
  if (!status || status === 'all') return {};
  if (status === 'active') {
    return { isActive: true, approvalStatus: { $in: ['approved', null] } };
  }
  if (status === 'blocked') {
    return { isActive: false };
  }
  if (status === 'pending') {
    return { approvalStatus: 'pending' };
  }
  if (status === 'approved') {
    return { approvalStatus: 'approved' };
  }
  if (status === 'rejected') {
    return { approvalStatus: 'rejected' };
  }
  return {};
};

const buildAttributionSearchFilter = (search) => {
  if (!search || !search.trim()) return {};
  const s = search.trim();
  const or = [
    { name: { $regex: s, $options: 'i' } },
    { phone: { $regex: s, $options: 'i' } }
  ];
  if (s.includes('@')) {
    or.push({ email: { $regex: s, $options: 'i' } });
  }
  if (mongoose.Types.ObjectId.isValid(s)) {
    or.push({ _id: new mongoose.Types.ObjectId(s) });
  }
  return { $or: or };
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/admins/:id/registrations
// Returns server-side paginated & filtered list of people registered by this admin
// ────────────────────────────────────────────────────────────────────────────
const getAdminOnboardedPeoples = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      type = 'all',
      role,
      status = 'all',
      dateRange = 'all',
      startDate,
      endDate,
      search,
      page = 1,
      limit = 25
    } = req.query;

    const requestedRole = role || type;
    const isSuperAdmin = req.user?.role === 'super_admin';

    // Authorization & IDOR Protection: regular admin can only view their own
    if (!isSuperAdmin && req.user?._id?.toString() !== id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are only authorized to view your own registered people.'
      });
    }

    const admin = await Admin.findById(id).select('name email role scopeType cityName districtName subDistrictName isActive createdAt salary');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const adminObjectId = new mongoose.Types.ObjectId(id);
    const dateQuery = buildAttributionDateFilter(dateRange, startDate, endDate);
    const statusQuery = buildAttributionStatusFilter(status);
    const searchQuery = buildAttributionSearchFilter(search);

    const commonFilter = {
      createdByAdmin: adminObjectId,
      ...dateQuery,
      ...statusQuery,
      ...searchQuery
    };

    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const skip = (parsedPage - 1) * parsedLimit;

    let items = [];
    let totalMatching = 0;

    // Summary counts (unfiltered lifetime metrics for this admin)
    const [totalFarmers, totalVendors, totalWorkers] = await Promise.all([
      User.countDocuments({ createdByAdmin: adminObjectId }),
      Vendor.countDocuments({ createdByAdmin: adminObjectId }),
      Worker.countDocuments({ createdByAdmin: adminObjectId })
    ]);

    if (requestedRole === 'farmer' || requestedRole === 'user') {
      const [data, count] = await Promise.all([
        User.find(commonFilter)
          .select('name phone email creationSource createdByType createdByAdminSnapshot createdAt addresses approvalStatus isActive')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .lean(),
        User.countDocuments(commonFilter)
      ]);
      totalMatching = count;
      items = data.map(u => ({
        _id: u._id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        role: 'farmer',
        roleLabel: 'Farmer / User',
        creationSource: u.creationSource || 'ADMIN_CREATED',
        createdByType: u.createdByType || 'ADMIN',
        createdByAdminSnapshot: u.createdByAdminSnapshot,
        createdAt: u.createdAt,
        approvalStatus: u.approvalStatus || 'approved',
        isActive: u.isActive !== false,
        district: u.addresses?.[0]?.district || '',
        subDistrict: u.addresses?.[0]?.subDistrict || '',
        city: u.addresses?.[0]?.city || ''
      }));
    } else if (requestedRole === 'vendor') {
      const [data, count] = await Promise.all([
        Vendor.find(commonFilter)
          .select('name phone email businessName creationSource createdByType createdByAdminSnapshot createdAt address approvalStatus isActive')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .lean(),
        Vendor.countDocuments(commonFilter)
      ]);
      totalMatching = count;
      items = data.map(v => ({
        _id: v._id,
        name: v.name,
        phone: v.phone,
        email: v.email,
        role: 'vendor',
        roleLabel: 'Equipment Owner',
        creationSource: v.creationSource || 'ADMIN_CREATED',
        createdByType: v.createdByType || 'ADMIN',
        createdByAdminSnapshot: v.createdByAdminSnapshot,
        createdAt: v.createdAt,
        approvalStatus: v.approvalStatus || 'approved',
        isActive: v.isActive !== false,
        district: v.address?.district || '',
        subDistrict: v.address?.subDistrict || '',
        city: v.address?.city || ''
      }));
    } else if (requestedRole === 'worker') {
      const [data, count] = await Promise.all([
        Worker.find(commonFilter)
          .select('name phone email workerType creationSource createdByType createdByAdminSnapshot createdAt address approvalStatus isActive')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .lean(),
        Worker.countDocuments(commonFilter)
      ]);
      totalMatching = count;
      items = data.map(w => ({
        _id: w._id,
        name: w.name,
        phone: w.phone,
        email: w.email,
        role: 'worker',
        roleLabel: 'Worker',
        creationSource: w.creationSource || 'ADMIN_CREATED',
        createdByType: w.createdByType || 'ADMIN',
        createdByAdminSnapshot: w.createdByAdminSnapshot,
        createdAt: w.createdAt,
        approvalStatus: w.approvalStatus || 'approved',
        isActive: w.isActive !== false,
        district: w.address?.district || '',
        subDistrict: w.address?.subDistrict || '',
        city: w.address?.city || ''
      }));
    } else {
      // Unified query across User, Vendor, Worker with $unionWith
      const pipeline = [
        { $match: commonFilter },
        {
          $project: {
            _id: 1, name: 1, phone: 1, email: 1,
            role: { $literal: 'farmer' }, roleLabel: { $literal: 'Farmer / User' },
            creationSource: { $ifNull: ['$creationSource', 'ADMIN_CREATED'] },
            createdByType: { $ifNull: ['$createdByType', 'ADMIN'] },
            createdByAdminSnapshot: 1, createdAt: 1, approvalStatus: 1, isActive: 1,
            district: { $ifNull: [{ $arrayElemAt: ['$addresses.district', 0] }, ''] },
            subDistrict: { $ifNull: [{ $arrayElemAt: ['$addresses.subDistrict', 0] }, ''] },
            city: { $ifNull: [{ $arrayElemAt: ['$addresses.city', 0] }, ''] }
          }
        },
        {
          $unionWith: {
            coll: 'vendors',
            pipeline: [
              { $match: commonFilter },
              {
                $project: {
                  _id: 1, name: 1, phone: 1, email: 1,
                  role: { $literal: 'vendor' }, roleLabel: { $literal: 'Equipment Owner' },
                  creationSource: { $ifNull: ['$creationSource', 'ADMIN_CREATED'] },
                  createdByType: { $ifNull: ['$createdByType', 'ADMIN'] },
                  createdByAdminSnapshot: 1, createdAt: 1, approvalStatus: 1, isActive: 1,
                  district: { $ifNull: ['$address.district', ''] },
                  subDistrict: { $ifNull: ['$address.subDistrict', ''] },
                  city: { $ifNull: ['$address.city', ''] }
                }
              }
            ]
          }
        },
        {
          $unionWith: {
            coll: 'workers',
            pipeline: [
              { $match: commonFilter },
              {
                $project: {
                  _id: 1, name: 1, phone: 1, email: 1,
                  role: { $literal: 'worker' }, roleLabel: { $literal: 'Worker' },
                  creationSource: { $ifNull: ['$creationSource', 'ADMIN_CREATED'] },
                  createdByType: { $ifNull: ['$createdByType', 'ADMIN'] },
                  createdByAdminSnapshot: 1, createdAt: 1, approvalStatus: 1, isActive: 1,
                  district: { $ifNull: ['$address.district', ''] },
                  subDistrict: { $ifNull: ['$address.subDistrict', ''] },
                  city: { $ifNull: ['$address.city', ''] }
                }
              }
            ]
          }
        },
        { $sort: { createdAt: -1 } },
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            data: [{ $skip: skip }, { $limit: parsedLimit }]
          }
        }
      ];

      const [result] = await User.aggregate(pipeline);
      totalMatching = result?.metadata?.[0]?.total || 0;
      items = result?.data || [];
    }

    res.status(200).json({
      success: true,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        scopeType: admin.scopeType || 'CITY',
        cityName: admin.cityName || '',
        districtName: admin.districtName || '',
        subDistrictName: admin.subDistrictName || '',
        isActive: admin.isActive !== false,
        createdAt: admin.createdAt
      },
      summary: {
        totalFarmers,
        totalVendors,
        totalWorkers,
        totalAll: totalFarmers + totalVendors + totalWorkers
      },
      data: items,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: totalMatching,
        totalPages: Math.ceil(totalMatching / parsedLimit) || 1,
        hasNextPage: parsedPage < (Math.ceil(totalMatching / parsedLimit) || 1),
        hasPrevPage: parsedPage > 1
      }
    });
  } catch (error) {
    console.error('Get admin onboarded peoples error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch registered people' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/attribution/summary
// Super Admin global people attribution summary
// ────────────────────────────────────────────────────────────────────────────
const getAttributionSummary = async (req, res) => {
  try {
    const { dateRange = 'all', startDate, endDate } = req.query;
    const dateFilter = buildAttributionDateFilter(dateRange, startDate, endDate);

    // Get Super Admin IDs for robust attribution
    const superAdmins = await Admin.find({ role: 'super_admin' }).select('_id').lean();
    const superAdminIds = superAdmins.map(a => a._id);

    const superAdminMatch = {
      $or: [
        { createdByType: 'SUPER_ADMIN' },
        { creationSource: 'SUPER_ADMIN_CREATED' },
        { createdByAdmin: { $in: superAdminIds } },
        { 'createdByAdminSnapshot.role': 'super_admin' }
      ]
    };

    const adminMatch = {
      $and: [
        {
          $or: [
            { createdByType: 'ADMIN' },
            { creationSource: 'ADMIN_CREATED' },
            { createdByAdmin: { $nin: superAdminIds, $ne: null } }
          ]
        },
        { createdByType: { $ne: 'SUPER_ADMIN' } },
        { creationSource: { $ne: 'SUPER_ADMIN_CREATED' } }
      ]
    };

    const selfMatch = {
      $or: [
        { creationSource: 'SELF_REGISTERED' },
        {
          $and: [
            { createdByAdmin: null },
            { createdByType: { $nin: ['ADMIN', 'SUPER_ADMIN'] } },
            { creationSource: { $nin: ['ADMIN_CREATED', 'SUPER_ADMIN_CREATED'] } }
          ]
        }
      ]
    };

    // Parallel aggregations for global metrics
    const [
      adminUsers,
      superAdminUsers,
      selfUsers,
      totalUsers,
      adminVendors,
      superAdminVendors,
      selfVendors,
      totalVendors,
      adminWorkers,
      superAdminWorkers,
      selfWorkers,
      totalWorkers,
      adminsList
    ] = await Promise.all([
      // Users
      User.countDocuments({ ...dateFilter, ...adminMatch }),
      User.countDocuments({ ...dateFilter, ...superAdminMatch }),
      User.countDocuments({ ...dateFilter, ...selfMatch }),
      User.countDocuments(dateFilter),
      // Vendors
      Vendor.countDocuments({ ...dateFilter, ...adminMatch }),
      Vendor.countDocuments({ ...dateFilter, ...superAdminMatch }),
      Vendor.countDocuments({ ...dateFilter, ...selfMatch }),
      Vendor.countDocuments(dateFilter),
      // Workers
      Worker.countDocuments({ ...dateFilter, ...adminMatch }),
      Worker.countDocuments({ ...dateFilter, ...superAdminMatch }),
      Worker.countDocuments({ ...dateFilter, ...selfMatch }),
      Worker.countDocuments(dateFilter),
      // Admins list
      Admin.find().select('name email role scopeType cityName districtName subDistrictName isActive createdAt salary').lean()
    ]);

    // Admin-wise breakdown via $group
    const [userGroups, vendorGroups, workerGroups] = await Promise.all([
      User.aggregate([
        { $match: { ...dateFilter, createdByAdmin: { $ne: null } } },
        { $group: { _id: '$createdByAdmin', count: { $sum: 1 } } }
      ]),
      Vendor.aggregate([
        { $match: { ...dateFilter, createdByAdmin: { $ne: null } } },
        { $group: { _id: '$createdByAdmin', count: { $sum: 1 } } }
      ]),
      Worker.aggregate([
        { $match: { ...dateFilter, createdByAdmin: { $ne: null } } },
        { $group: { _id: '$createdByAdmin', count: { $sum: 1 } } }
      ])
    ]);

    const userCountMap = new Map(userGroups.map(g => [g._id.toString(), g.count]));
    const vendorCountMap = new Map(vendorGroups.map(g => [g._id.toString(), g.count]));
    const workerCountMap = new Map(workerGroups.map(g => [g._id.toString(), g.count]));

    const adminBreakdown = adminsList.map(adm => {
      const aId = adm._id.toString();
      const farmers = userCountMap.get(aId) || 0;
      const vendors = vendorCountMap.get(aId) || 0;
      const workers = workerCountMap.get(aId) || 0;
      const total = farmers + vendors + workers;
      const earnedIncentive = (farmers * (adm.salary?.farmerIncentive || 0)) +
                              (vendors * (adm.salary?.vendorIncentive || 0)) +
                              (workers * (adm.salary?.workerIncentive || 0));

      return {
        _id: adm._id,
        adminId: adm._id,
        id: adm._id,
        name: adm.name,
        email: adm.email,
        role: adm.role,
        scopeType: adm.scopeType || 'CITY',
        cityName: adm.cityName || '',
        districtName: adm.districtName || '',
        subDistrictName: adm.subDistrictName || '',
        isActive: adm.isActive !== false,
        createdAt: adm.createdAt,
        total,
        farmers,
        vendors,
        workers,
        counts: { farmers, vendors, workers, total },
        earnedIncentive
      };
    }).sort((a, b) => b.total - a.total);

    const legacyUsers = Math.max(0, totalUsers - (adminUsers + superAdminUsers + selfUsers));
    const legacyVendors = Math.max(0, totalVendors - (adminVendors + superAdminVendors + selfVendors));
    const legacyWorkers = Math.max(0, totalWorkers - (adminWorkers + superAdminWorkers + selfWorkers));

    const byAdmins = {
      total: adminUsers + adminVendors + adminWorkers,
      farmers: adminUsers,
      vendors: adminVendors,
      workers: adminWorkers
    };

    const bySuperAdmin = {
      total: superAdminUsers + superAdminVendors + superAdminWorkers,
      farmers: superAdminUsers,
      vendors: superAdminVendors,
      workers: superAdminWorkers
    };

    const selfRegistered = {
      total: selfUsers + selfVendors + selfWorkers,
      farmers: selfUsers,
      vendors: selfVendors,
      workers: selfWorkers
    };

    const legacyUnknown = {
      total: legacyUsers + legacyVendors + legacyWorkers,
      farmers: legacyUsers,
      vendors: legacyVendors,
      workers: legacyWorkers
    };

    const grandTotal = {
      total: totalUsers + totalVendors + totalWorkers,
      farmers: totalUsers,
      vendors: totalVendors,
      workers: totalWorkers
    };

    res.status(200).json({
      success: true,
      summary: {
        byAdmins,
        totalByAdmins: byAdmins,
        bySuperAdmin,
        totalBySuperAdmin: bySuperAdmin,
        selfRegistered,
        totalSelfRegistered: selfRegistered,
        legacyUnknown,
        totalLegacyUnknown: legacyUnknown,
        grandTotal
      },
      adminBreakdown,
      admins: adminBreakdown
    });
  } catch (error) {
    console.error('Get attribution summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attribution summary' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/attribution/export
// Streams CSV file of people attribution data with full creator traceability
// ────────────────────────────────────────────────────────────────────────────
const exportAttributionData = async (req, res) => {
  try {
    const { adminId, role, status, dateRange = 'all', startDate, endDate } = req.query;
    const dateFilter = buildAttributionDateFilter(dateRange, startDate, endDate);
    const filter = { ...dateFilter };

    if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
      filter.createdByAdmin = new mongoose.Types.ObjectId(adminId);
    } else {
      filter.createdByAdmin = { $ne: null };
    }

    let users = [], vendors = [], workers = [];

    if (!role || role === 'all' || role === 'farmer' || role === 'user') {
      users = await User.find({ ...filter, ...buildAttributionStatusFilter(status) })
        .populate('createdByAdmin', 'name email role')
        .select('name phone email creationSource createdByType createdByAdmin createdByAdminSnapshot createdAt addresses approvalStatus isActive')
        .lean();
    }
    if (!role || role === 'all' || role === 'vendor') {
      vendors = await Vendor.find({ ...filter, ...buildAttributionStatusFilter(status) })
        .populate('createdByAdmin', 'name email role')
        .select('name phone email creationSource createdByType createdByAdmin createdByAdminSnapshot createdAt address approvalStatus isActive')
        .lean();
    }
    if (!role || role === 'all' || role === 'worker') {
      workers = await Worker.find({ ...filter, ...buildAttributionStatusFilter(status) })
        .populate('createdByAdmin', 'name email role')
        .select('name phone email creationSource createdByType createdByAdmin createdByAdminSnapshot createdAt address approvalStatus isActive')
        .lean();
    }

    const rows = [
      ...users.map(u => ({
        id: u._id,
        name: u.name,
        role: 'Farmer',
        phone: u.phone,
        email: u.email || '',
        creatorName: u.createdByAdmin?.name || u.createdByAdminSnapshot?.name || 'Unknown',
        creatorEmail: u.createdByAdmin?.email || u.createdByAdminSnapshot?.email || '',
        creatorRole: u.createdByAdmin?.role || u.createdByAdminSnapshot?.role || u.createdByType || 'ADMIN',
        creationSource: u.creationSource || 'ADMIN_CREATED',
        createdAt: new Date(u.createdAt).toLocaleString('en-IN'),
        district: u.addresses?.[0]?.district || '',
        subDistrict: u.addresses?.[0]?.subDistrict || '',
        city: u.addresses?.[0]?.city || '',
        approvalStatus: u.approvalStatus || 'approved',
        status: u.isActive !== false ? 'Active' : 'Blocked'
      })),
      ...vendors.map(v => ({
        id: v._id,
        name: v.name,
        role: 'Equipment Owner',
        phone: v.phone,
        email: v.email || '',
        creatorName: v.createdByAdmin?.name || v.createdByAdminSnapshot?.name || 'Unknown',
        creatorEmail: v.createdByAdmin?.email || v.createdByAdminSnapshot?.email || '',
        creatorRole: v.createdByAdmin?.role || v.createdByAdminSnapshot?.role || v.createdByType || 'ADMIN',
        creationSource: v.creationSource || 'ADMIN_CREATED',
        createdAt: new Date(v.createdAt).toLocaleString('en-IN'),
        district: v.address?.district || '',
        subDistrict: v.address?.subDistrict || '',
        city: v.address?.city || '',
        approvalStatus: v.approvalStatus || 'approved',
        status: v.isActive !== false ? 'Active' : 'Blocked'
      })),
      ...workers.map(w => ({
        id: w._id,
        name: w.name,
        role: 'Worker',
        phone: w.phone,
        email: w.email || '',
        creatorName: w.createdByAdmin?.name || w.createdByAdminSnapshot?.name || 'Unknown',
        creatorEmail: w.createdByAdmin?.email || w.createdByAdminSnapshot?.email || '',
        creatorRole: w.createdByAdmin?.role || w.createdByAdminSnapshot?.role || w.createdByType || 'ADMIN',
        creationSource: w.creationSource || 'ADMIN_CREATED',
        createdAt: new Date(w.createdAt).toLocaleString('en-IN'),
        district: w.address?.district || '',
        subDistrict: w.address?.subDistrict || '',
        city: w.address?.city || '',
        approvalStatus: w.approvalStatus || 'approved',
        status: w.isActive !== false ? 'Active' : 'Blocked'
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const csvHeader = 'Person ID,Name,Role,Phone,Email,Creator Name,Creator Email,Creator Role,Creation Source,Created At,District,Sub-District,City,Approval Status,Account Status\n';
    const csvRows = rows.map(r =>
      `"${r.id}","${(r.name || '').replace(/"/g, '""')}","${r.role}","${r.phone}","${r.email}","${(r.creatorName || '').replace(/"/g, '""')}","${r.creatorEmail}","${r.creatorRole}","${r.creationSource}","${r.createdAt}","${r.district}","${r.subDistrict}","${r.city}","${r.approvalStatus}","${r.status}"`
    ).join('\n');

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'EXPORT_ATTRIBUTION_DATA',
      module: 'ADMIN_MANAGEMENT',
      targetId: req.user._id,
      targetModel: 'Admin',
      targetName: req.user.name,
      description: `Super Admin exported people attribution data (${rows.length} records)`
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="agroyilt_people_attribution_${Date.now()}.csv"`);
    res.status(200).send(csvHeader + csvRows);
  } catch (error) {
    console.error('Export attribution data error:', error);
    res.status(500).json({ success: false, message: 'Failed to export attribution data' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/admins/:id/salary
// Super admin sets or updates an admin's salary & incentive configuration
// ────────────────────────────────────────────────────────────────────────────
const updateAdminSalary = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      baseSalary,
      payFrequency,
      farmerIncentive,
      vendorIncentive,
      workerIncentive,
      minRegistrationsForIncentive,
      bankDetails,
      notes,
      status,
      effectiveFrom,
      effectiveTo,
      changeReason
    } = req.body;

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (minRegistrationsForIncentive !== undefined && minRegistrationsForIncentive !== '') {
      const minThresh = Number(minRegistrationsForIncentive);
      if (isNaN(minThresh) || minThresh < 0 || !Number.isInteger(minThresh)) {
        return res.status(400).json({
          success: false,
          message: 'Minimum combined registration threshold must be a valid non-negative integer'
        });
      }
    }

    const newBaseSalary = Number(baseSalary) >= 0 ? Number(baseSalary) : (admin.salary?.baseSalary || 0);
    const newFarmerIncentive = Number(farmerIncentive) >= 0 ? Number(farmerIncentive) : (admin.salary?.farmerIncentive || 0);
    const newVendorIncentive = Number(vendorIncentive) >= 0 ? Number(vendorIncentive) : (admin.salary?.vendorIncentive || 0);
    const newWorkerIncentive = Number(workerIncentive) >= 0 ? Number(workerIncentive) : (admin.salary?.workerIncentive || 0);
    const newMinRegistrations = Number(minRegistrationsForIncentive) >= 0 ? Number(minRegistrationsForIncentive) : (admin.salary?.minRegistrationsForIncentive || 0);
    const newStatus = status || admin.salary?.status || 'ACTIVE';
    const newEffectiveFrom = effectiveFrom ? new Date(effectiveFrom) : (admin.salary?.effectiveFrom || new Date());

    // Archive old salary if it has real values and changed
    const oldSalary = admin.salary ? (admin.salary.toObject ? admin.salary.toObject() : { ...admin.salary }) : null;
    const hasMeaningfulChange = oldSalary && (
      oldSalary.baseSalary !== newBaseSalary ||
      oldSalary.farmerIncentive !== newFarmerIncentive ||
      oldSalary.vendorIncentive !== newVendorIncentive ||
      oldSalary.workerIncentive !== newWorkerIncentive ||
      (oldSalary.minRegistrationsForIncentive || 0) !== newMinRegistrations ||
      oldSalary.status !== newStatus
    );

    if (hasMeaningfulChange && (oldSalary.baseSalary > 0 || oldSalary.farmerIncentive > 0 || oldSalary.vendorIncentive > 0 || oldSalary.workerIncentive > 0 || (oldSalary.minRegistrationsForIncentive || 0) > 0)) {
      if (!admin.salaryHistory) admin.salaryHistory = [];
      admin.salaryHistory.push({
        version: (admin.salaryHistory.length || 0) + 1,
        baseSalary: oldSalary.baseSalary || 0,
        payFrequency: oldSalary.payFrequency || 'monthly',
        status: oldSalary.status || 'ACTIVE',
        effectiveFrom: oldSalary.effectiveFrom || admin.createdAt || new Date(),
        effectiveTo: newEffectiveFrom,
        farmerIncentive: oldSalary.farmerIncentive || 0,
        vendorIncentive: oldSalary.vendorIncentive || 0,
        workerIncentive: oldSalary.workerIncentive || 0,
        minRegistrationsForIncentive: oldSalary.minRegistrationsForIncentive || 0,
        bankDetails: oldSalary.bankDetails || {},
        notes: oldSalary.notes || '',
        changeReason: changeReason || 'Salary configuration updated by Super Admin',
        changedBy: req.user._id,
        changedAt: new Date()
      });
      admin.markModified('salaryHistory');
    }

    admin.salary = {
      baseSalary: newBaseSalary,
      payFrequency: payFrequency || admin.salary?.payFrequency || 'monthly',
      status: newStatus,
      effectiveFrom: newEffectiveFrom,
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      farmerIncentive: newFarmerIncentive,
      vendorIncentive: newVendorIncentive,
      workerIncentive: newWorkerIncentive,
      minRegistrationsForIncentive: newMinRegistrations,
      bankDetails: bankDetails || admin.salary?.bankDetails || {},
      notes: notes !== undefined ? notes : (admin.salary?.notes || '')
    };
    admin.markModified('salary');

    await admin.save();

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'UPDATE_SALARY',
      module: 'PAYROLL',
      targetId: admin._id,
      targetModel: 'Admin',
      targetName: admin.name,
      description: `Updated salary & incentive configuration for admin "${admin.name}" (Base: ₹${admin.salary.baseSalary}, Status: ${admin.salary.status})`,
      metadata: {
        salary: admin.salary,
        historyCount: admin.salaryHistory?.length || 0,
        changeReason: changeReason || ''
      }
    });

    res.status(200).json({
      success: true,
      message: 'Admin compensation details updated successfully',
      data: {
        salary: admin.salary,
        salaryHistory: admin.salaryHistory || []
      }
    });
  } catch (error) {
    console.error('Update admin salary error:', error);
    res.status(500).json({ success: false, message: 'Failed to update admin salary' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Geographic management: Districts & Sub-Districts
// ────────────────────────────────────────────────────────────────────────────

const getDistricts = async (req, res) => {
  try {
    const { cityId } = req.query;
    const query = { isActive: true };
    if (cityId) query.cityId = cityId;
    const districts = await District.find(query).sort({ displayOrder: 1, name: 1 });
    res.status(200).json({ success: true, data: districts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch districts' });
  }
};

const createDistrict = async (req, res) => {
  try {
    const { name, cityId, cityName, displayOrder } = req.body;
    if (!name || !cityId) {
      return res.status(400).json({ success: false, message: 'Name and cityId are required' });
    }
    const district = await District.create({
      name, cityId, cityName: cityName || '', displayOrder: displayOrder || 0,
      createdBy: req.user._id
    });
    await AdminAuditLog.log({
      ...getActorInfo(req.user), ...getAuditContext(req),
      action: 'CREATE_DISTRICT', module: 'CITY',
      targetId: district._id, targetModel: 'District', targetName: district.name,
      description: `Created district "${district.name}" in city "${district.cityName}"`
    });
    res.status(201).json({ success: true, message: 'District created', data: district });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'District already exists in this city' });
    }
    res.status(500).json({ success: false, message: 'Failed to create district' });
  }
};

const updateDistrict = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive, displayOrder } = req.body;
    const district = await District.findByIdAndUpdate(id, { name, isActive, displayOrder }, { new: true });
    if (!district) return res.status(404).json({ success: false, message: 'District not found' });
    res.status(200).json({ success: true, message: 'District updated', data: district });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update district' });
  }
};

const deleteDistrict = async (req, res) => {
  try {
    const district = await District.findByIdAndDelete(req.params.id);
    if (!district) return res.status(404).json({ success: false, message: 'District not found' });
    // Also delete child sub-districts
    await SubDistrict.deleteMany({ districtId: req.params.id });
    res.status(200).json({ success: true, message: 'District deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete district' });
  }
};

const getSubDistricts = async (req, res) => {
  try {
    const { districtId, cityId } = req.query;
    const query = { isActive: true };
    if (districtId) query.districtId = districtId;
    if (cityId) query.cityId = cityId;
    const subDistricts = await SubDistrict.find(query).sort({ displayOrder: 1, name: 1 });
    res.status(200).json({ success: true, data: subDistricts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch sub-districts' });
  }
};

const createSubDistrict = async (req, res) => {
  try {
    const { name, districtId, districtName, cityId, cityName, displayOrder } = req.body;
    if (!name || !districtId || !cityId) {
      return res.status(400).json({ success: false, message: 'Name, districtId, and cityId are required' });
    }
    const subDistrict = await SubDistrict.create({
      name, districtId, districtName: districtName || '',
      cityId, cityName: cityName || '',
      displayOrder: displayOrder || 0, createdBy: req.user._id
    });
    res.status(201).json({ success: true, message: 'Sub-district created', data: subDistrict });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Sub-district already exists in this district' });
    }
    res.status(500).json({ success: false, message: 'Failed to create sub-district' });
  }
};

const updateSubDistrict = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive, displayOrder } = req.body;
    const sub = await SubDistrict.findByIdAndUpdate(id, { name, isActive, displayOrder }, { new: true });
    if (!sub) return res.status(404).json({ success: false, message: 'Sub-district not found' });
    res.status(200).json({ success: true, message: 'Sub-district updated', data: sub });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update sub-district' });
  }
};

const deleteSubDistrict = async (req, res) => {
  try {
    const sub = await SubDistrict.findByIdAndDelete(req.params.id);
    if (!sub) return res.status(404).json({ success: false, message: 'Sub-district not found' });
    res.status(200).json({ success: true, message: 'Sub-district deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete sub-district' });
  }
};

module.exports = {
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
};
