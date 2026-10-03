const { verifyAccessToken } = require('../utils/tokenService');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');
const { USER_ROLES } = require('../utils/constants');

/**
 * Authentication middleware - verifies JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.query && req.query.token && req.method === 'GET') {
      // Query-string tokens exist only for browser download links (e.g. invoices). They end up in logs and
      // referrers, so they are never accepted for state-changing requests.
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please login.'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
      // console.log('Decoded Token:', decoded); // Debug
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token. Please login again.'
      });
    }

    // Get user based on role
    let user;
    // console.log('Role from token:', decoded.role); // Debug
    switch (decoded.role) {
      case USER_ROLES.USER:
        user = await User.findById(decoded.userId).select('-password');
        if (user && user.isActive === false) {
          return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact support.' });
        }
        break;
      case USER_ROLES.VENDOR:
        user = await Vendor.findById(decoded.userId).select('-password');
        if (user && (user.approvalStatus === 'rejected' || user.approvalStatus === 'suspended')) {
          return res.status(403).json({
            success: false,
            message: 'Your vendor account has been suspended or rejected. Please contact support.'
          });
        }
        break;
      case USER_ROLES.WORKER:
        user = await Worker.findById(decoded.userId).select('-password');
        if (user && (user.isActive === false || ['rejected', 'suspended'].includes(user.approvalStatus))) {
          return res.status(403).json({ success: false, message: 'Your worker account has been suspended or deactivated. Please contact support.' });
        }
        break;
      case USER_ROLES.ADMIN:
      case 'super_admin':
      case 'admin':
      case 'ADMIN':
        user = await Admin.findById(decoded.userId).select('-password');
        break;
      default:
        console.error('Role mismatch in middleware:', decoded.role);
        return res.status(401).json({
          success: false,
          message: 'Invalid user role.'
        });
    }

    if (!user) {
      console.error('User not found for ID:', decoded.userId);
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.'
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = decoded.userId;
    req.userRole = decoded.role;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error. Please try again.'
    });
  }
};

module.exports = { authenticate };

