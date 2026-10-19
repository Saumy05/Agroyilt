const { USER_ROLES } = require('../utils/constants');

/**
 * Role-based authorization middleware
 */
const isUser = (req, res, next) => {
  const role = (req.userRole || '').toUpperCase();
  if (role !== USER_ROLES.USER) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. User role required.'
    });
  }
  next();
};

const isVendor = (req, res, next) => {
  const role = (req.userRole || '').toUpperCase();
  if (role !== USER_ROLES.VENDOR) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Vendor role required.'
    });
  }
  next();
};

const isWorker = (req, res, next) => {
  const role = (req.userRole || '').toUpperCase();
  if (role !== USER_ROLES.WORKER) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Worker role required.'
    });
  }
  next();
};

const isAdmin = (req, res, next) => {
  const role = (req.userRole || '').toUpperCase();
  if (role !== USER_ROLES.ADMIN && role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
  }

  // Check account is still active
  if (req.user && req.user.isActive === false) {
    return res.status(403).json({
      success: false,
      message: 'Your admin account has been deactivated. Please contact support.'
    });
  }

  next();
};

const isAdminOrVendor = (req, res, next) => {
  if (req.userRole !== USER_ROLES.ADMIN && req.userRole !== 'super_admin' && req.userRole !== USER_ROLES.VENDOR) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin or Vendor role required.'
    });
  }
  next();
};

/**
 * Super Admin only middleware.
 * Checks the admin's stored role in the DB (via req.user populated by authenticate).
 */
const isSuperAdmin = async (req, res, next) => {
  try {
    // 1. Must be an admin at all
    const role = (req.userRole || '').toUpperCase();
    if (role !== USER_ROLES.ADMIN && role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    // 2. Account must be active
    if (req.user && req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Your admin account has been deactivated.'
      });
    }

    // 3. Must be specifically super_admin
    if (!req.user || req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin privileges required.'
      });
    }

    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

/**
 * Permission-check middleware factory.
 * Usage: requirePermission('users.view')
 * Super admins always pass. Regular admins need the specific permission enabled.
 */
const requirePermission = (permissionKey) => {
  return (req, res, next) => {
    try {
      const admin = req.user;

      if (!admin) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      // Super admins bypass all permission checks
      if (admin.role === 'super_admin') return next();

      // Check the specific permission
      if (!admin.permissions || !admin.permissions[permissionKey]) {
        return res.status(403).json({
          success: false,
          message: `Access denied. You do not have "${permissionKey}" permission.`
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ success: false, message: 'Permission check failed' });
    }
  };
};

/**
 * Like requirePermission, but any ONE of the keys is enough. For endpoints that two modules legitimately use
 * (e.g. the vendor list is read by Vendors and by Soil Testing).
 * Usage: requireAnyPermission('vendors.view', 'soiltest.view')
 */
const requireAnyPermission = (...permissionKeys) => {
  return (req, res, next) => {
    try {
      const admin = req.user;
      if (!admin) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }
      if (admin.role === 'super_admin') return next();
      if (permissionKeys.some(key => admin.permissions && admin.permissions[key])) return next();
      return res.status(403).json({
        success: false,
        message: `Access denied. You do not have "${permissionKeys[0]}" permission.`
      });
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ success: false, message: 'Permission check failed' });
    }
  };
};

module.exports = {
  isUser,
  isVendor,
  isWorker,
  isAdmin,
  isAdminOrVendor,
  isSuperAdmin,
  requirePermission,
  requireAnyPermission
};
