const express = require('express');
const router = express.Router();
const referralController = require('../../controllers/referralController');
const { authenticate } = require('../../middleware/authMiddleware');

// Public route: validate referral code during registration/onboarding
router.get('/validate', referralController.validateCode);

// Public route: which roles have referrals switched on
router.get('/status', referralController.getPublicStatus);

// Public route: the Play Store / registration links the invite page (/r/<CODE>) sends people to
router.get('/invite-config', referralController.getInviteConfig);

// Authenticated route: get current user's referral code, share link, and stats (Farmers, Vendors, Workers)
router.get('/me', authenticate, referralController.getMyReferral);

module.exports = router;
