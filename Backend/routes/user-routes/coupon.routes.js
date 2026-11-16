const express = require('express');
const router = express.Router();
const { verifyAccessToken } = require('../../utils/tokenService');
const User = require('../../models/User');
const {
  validateCoupon,
  getAvailableCoupons
} = require('../../controllers/commonControllers/couponController');

// Optional auth helper: decodes user if token present, but does not block guests/explorers
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (token) {
      const decoded = verifyAccessToken(token);
      if (decoded && decoded.userId) {
        const user = await User.findById(decoded.userId).select('-password');
        if (user && user.isActive !== false) {
          req.user = user;
          req.userId = decoded.userId;
          req.userRole = decoded.role;
        }
      }
    }
  } catch (err) {
    // Continue without req.user
  }
  next();
};

router.post('/validate', optionalAuth, validateCoupon);
router.get('/available', optionalAuth, getAvailableCoupons);

module.exports = router;
