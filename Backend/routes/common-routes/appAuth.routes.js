const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { identifyRole } = require('../../controllers/commonControllers/appAuthController');

// This lookup tells an anonymous caller which account types exist for a number, so keep it tight per IP
const identifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many attempts. Please wait a minute and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/app/identify-role
 * Public — no auth required.
 * Identifies which role(s) a phone number is registered under.
 */
router.post(
  '/identify-role',
  identifyLimiter,
  [
    body('phone')
      .trim()
      .notEmpty().withMessage('Phone number is required')
      .isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  ],
  identifyRole
);

module.exports = router;
