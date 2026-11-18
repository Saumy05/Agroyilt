const Admin = require('../../models/Admin');
const AdminAuditLog = require('../../models/AdminAuditLog');
require('../../models/City'); // Ensure City model is loaded for populate
const { generateTokenPair } = require('../../utils/tokenService');
const { USER_ROLES } = require('../../utils/constants');
const { validationResult } = require('express-validator');

/**
 * Login admin with email and password
 */
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find admin with password
    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      // Log failed attempt
      await AdminAuditLog.log({
        adminId: admin._id,
        adminName: admin.name,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        description: `Failed login attempt for admin "${admin.email}"`,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        status: 'FAILURE'
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate JWT tokens
    const tokens = generateTokenPair({
      userId: admin._id,
      role: USER_ROLES.ADMIN // Uppercase ADMIN role from constants
    });

    // Log successful login
    await AdminAuditLog.log({
      adminId: admin._id,
      adminName: admin.name,
      adminEmail: admin.email,
      adminRole: admin.role,
      action: 'LOGIN_SUCCESS',
      module: 'AUTH',
      description: `Admin "${admin.email}" logged in successfully`,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        scopeType: admin.scopeType || 'CITY',
        cityId: admin.cityId,
        cityName: admin.cityName,
        districtId: admin.districtId,
        districtName: admin.districtName,
        subDistrictId: admin.subDistrictId,
        subDistrictName: admin.subDistrictName,
        permissions: admin.permissions || {},
        salary: admin.salary || {},
        profilePhoto: admin.profilePhoto
      },
      ...tokens
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

/**
 * Logout admin
 */
const logout = async (req, res) => {
  try {
    if (req.user) {
      await AdminAuditLog.log({
        adminId: req.user._id,
        adminName: req.user.name,
        adminEmail: req.user.email,
        adminRole: req.user.role,
        action: 'LOGOUT',
        module: 'AUTH',
        description: `Admin "${req.user.email}" logged out`,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      });
    }
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;
    const { email, name, profilePhoto, currentPassword, newPassword } = req.body;

    const admin = await Admin.findById(adminId).select('+password');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    // Verify current password
    if (currentPassword) {
      const isMatch = await admin.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Incorrect current password' });
      }
    } else if (newPassword) {
      return res.status(400).json({ success: false, message: 'Current password is required to set new password' });
    }

    // Update fields
    if (email) admin.email = email;
    if (name) admin.name = name;
    if (profilePhoto !== undefined) admin.profilePhoto = profilePhoto;
    if (newPassword) admin.password = newPassword;

    // Allow admin to self-manage their Bank & Payout details
    if (req.body.bankDetails && typeof req.body.bankDetails === 'object') {
      const b = req.body.bankDetails;
      admin.salary = admin.salary || {};
      admin.salary.bankDetails = {
        accountHolderName: b.accountHolderName || '',
        bankName: b.bankName || '',
        accountNumber: b.accountNumber || '',
        ifscCode: b.ifscCode ? b.ifscCode.toUpperCase().trim() : '',
        upiId: b.upiId ? b.upiId.trim() : ''
      };
      admin.markModified('salary');
    }

    await admin.save();

    await AdminAuditLog.log({
      adminId: admin._id,
      adminName: admin.name,
      adminEmail: admin.email,
      adminRole: admin.role,
      action: 'UPDATE_PROFILE',
      module: 'AUTH',
      description: `Admin "${admin.email}" updated their profile & payout information`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        profilePhoto: admin.profilePhoto,
        salary: admin.salary
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

const getProfile = async (req, res) => {
  try {
    const adminId = req.user?._id || req.user?.id || req.userId;
    const admin = await Admin.findById(adminId)
      .populate('cityId', 'name')
      .populate('districtId', 'name')
      .populate('subDistrictId', 'name')
      .populate('createdBy', 'name email');

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        scopeType: admin.scopeType || 'CITY',
        cityId: admin.cityId,
        cityName: admin.cityName,
        districtId: admin.districtId,
        districtName: admin.districtName,
        subDistrictId: admin.subDistrictId,
        subDistrictName: admin.subDistrictName,
        permissions: admin.permissions || {},
        salary: admin.salary || {},
        profilePhoto: admin.profilePhoto,
        lastLogin: admin.lastLogin,
        createdBy: admin.createdBy,
        salary: admin.salary || {}
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};

module.exports = {
  login,
  logout,
  updateProfile,
  getProfile
};
