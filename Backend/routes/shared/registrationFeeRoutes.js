const express = require('express');
const router = express.Router();
const { 
  initiatePayment, 
  verifyFeePayment, 
  getFeeConfig 
} = require('../../controllers/shared/registrationFeeController');

// The `protect` middleware normally checks for valid full-access token. 
// We need a specific middleware that accepts a PRE_AUTH token, or we can use the existing auth 
// middleware if it doesn't strictly reject without full permissions yet, but wait - 
// we will just use a generic JWT verifier for PRE_AUTH tokens to keep it secure.

const jwt = require('jsonwebtoken');

const requirePreAuth = (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;
    const role = (decoded.role || '').toUpperCase();

    if (!userId || !role) {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }

    if (!['USER', 'VENDOR', 'WORKER'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Invalid role for registration fee payment' });
    }
    
    req.user = {
      accountId: userId,
      role: role
    };
    next();
  } catch (error) {
    console.error('requirePreAuth error:', error.message);
    const isExpired = error.name === 'TokenExpiredError';
    return res.status(401).json({ 
      success: false, 
      message: isExpired ? 'Registration session expired. Please log in again.' : 'Not authorized, token invalid' 
    });
  }
};

// Public
router.get('/config/:role', getFeeConfig);

// Protected by PreAuth Token
router.post('/initiate-payment', requirePreAuth, initiatePayment);
router.post('/verify-payment', requirePreAuth, verifyFeePayment);

module.exports = router;
