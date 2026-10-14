const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { identifyRole, verifyMpin } = require('../../controllers/commonControllers/appAuthController');

/**
 * POST /api/app/identify-role
 * Public — no auth required.
 * Identifies which role(s) a phone number is registered under.
 */
router.post(
  '/identify-role',
  [
    body('phone')
      .trim()
      .notEmpty().withMessage('Phone number is required')
      .isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  ],
  identifyRole
);

/**
 * POST /api/app/verify-mpin
 * Public — no auth required. Reports which account(s) on this phone the MPIN belongs to.
 */
router.post('/verify-mpin', verifyMpin);

module.exports = router;
