const User = require('../../models/User');
const { generateTokenPair, verifyRefreshToken, generateVerificationToken, verifyVerificationToken } = require('../../utils/tokenService');
const { generateOTP, hashOTP, storeOTP, verifyOTP, checkRateLimit } = require('../../utils/redisOtp.util');
const { sendOTP: sendSMSOTP } = require('../../services/smsService');
const { sendOTPEmail, sendWelcomeEmail } = require('../../services/emailService');
const { USER_ROLES } = require('../../utils/constants');
const { validationResult } = require('express-validator');
const mpinService = require('../../utils/mpinService');

/**
 * Send OTP for user registration/login
 */
const sendOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phone, email, purpose } = req.body; // purpose: 'register' | 'forgotMpin'

    // If this is a forgot MPIN attempt, verify user exists first
    if (purpose === 'forgotMpin') {
      const userExists = await User.findOne({ phone });
      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'User not found with this number'
        });
      }
    }

    // 1. Rate limit check
    const allowed = await checkRateLimit(phone);
    if (!allowed) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP requests. Please try again after 10 minutes.'
      });
    }

    // 2. Generate OTP
    const otp = generateOTP(phone);
    const otpHash = hashOTP(otp);

    // 3. Store OTP (Redis primary, MongoDB fallback)
    await storeOTP(phone, otpHash);

    // 4. Send OTP via SMS
    const smsResult = await sendSMSOTP(phone, otp);

    // Log OTP in development mode only (NEVER in production)
    if (process.env.NODE_ENV === 'development' || process.env.USE_DEFAULT_OTP === 'true') {
      console.log(`[DEV] OTP for ${phone}: ${otp}`);
    }

    // 5. Optional: Send email notification if email provided
    if (email) {
      await sendOTPEmail(email, otp, 'verification');
    }

    // Check if SMS failed
    if (!smsResult.success) {
      console.warn(`[OTP] SMS failed for ${phone}, but OTP stored for manual entry`);
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      token: 'verification-pending' // Required by frontend to allow login
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.'
    });
  }
};

/**
 * Verify OTP and Check User Status (Unified Login/Signup Entry)
 */
const verifyLogin = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // 1. Verify OTP
    const verification = await verifyOTP(phone, otp);
    if (!verification.success) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    // 2. Check if user exists
    const user = await User.findOne({ phone });

    // NEW FLOW: Always return a verification token, whether new or existing user.
    // The frontend will then either go to Register (if new) or Set MPIN / Reset MPIN.
    const verificationToken = generateVerificationToken(phone);

    return res.status(200).json({
      success: true,
      isNewUser: !user,
      message: 'OTP verified successfully.',
      verificationToken
    });

  } catch (error) {
    console.error('Verify Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
};

/**
 * Register user with Verification Token (No OTP required again)
 */
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, verificationToken, gender } = req.body;
    let phone = req.body.phone;

    // Verify token if provided (New Flow)
    if (verificationToken) {
      const verifiedPhone = verifyVerificationToken(verificationToken);
      if (!verifiedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired verification session. Please verify phone again.'
        });
      }
      phone = verifiedPhone; // Trust the token's phone number
    } else {
      // Fallback to legacy OTP flow (if needed, but discouraged)
      if (!req.body.otp) {
        return res.status(400).json({ success: false, message: 'Verification token or OTP required.' });
      }
      const verification = await verifyOTP(phone, req.body.otp);
      if (!verification.success) {
        return res.status(400).json({ success: false, message: verification.message });
      }
    }

    const normalizedEmail = (email && typeof email === 'string' && email.trim() !== '')
      ? email.trim().toLowerCase()
      : undefined;

    // Check if user already exists
    const existingQuery = [{ phone }];
    if (normalizedEmail) {
      existingQuery.push({ email: normalizedEmail });
    }
    const existingUser = await User.findOne({ $or: existingQuery });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists. Please login.'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email: normalizedEmail,
      phone,
      gender: (gender && ['male', 'female', 'other'].includes(String(gender).toLowerCase())) ? String(gender).toLowerCase() : null,
      isPhoneVerified: true,
      isEmailVerified: !!normalizedEmail ? false : true,
      isMpinSet: false,
      approvalStatus: 'pending'
    });

    // Process Referral Attribution if referral code provided
    const referralCode = req.body.referralCode || req.body.ref;
    if (referralCode) {
      try {
        const referralService = require('../../services/referralService');
        await referralService.createReferralAttribution({
          referredUserId: user._id,
          referredModel: 'User',
          referredRole: 'farmer',
          referralCode,
          metadata: { ip: req.ip, userAgent: req.headers['user-agent'] }
        });
      } catch (refErr) {
        console.error('Referral attribution error for farmer:', refErr);
      }
    }

    // Auto-create unique referral code for this new farmer
    try {
      const referralService = require('../../services/referralService');
      await referralService.getOrCreateUserReferralCode(user._id, 'User');
    } catch (e) {
      console.error('Auto-generate referral code error for farmer:', e);
    }

    // Notify Admins about new Farmer registration
    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      const Admin = require('../../models/Admin');
      const admins = await Admin.find({ isActive: true }).select('_id');
      for (const admin of admins) {
        await createNotification({
          adminId: admin._id,
          type: 'farmer_approval_request',
          title: '🌾 New Farmer Registration',
          message: `${user.name} (${user.phone}) has registered as a Farmer`,
          relatedId: user._id,
          relatedType: 'user',
          data: { userId: user._id, userName: user.name, phone: user.phone },
          pushData: { type: 'admin_alert', link: '/admin/users/all' }
        });
      }
    } catch (e) { console.error('Notify admin error for farmer:', e); }

    // Send Welcome Email
    if (email) {
      sendWelcomeEmail(email, name).catch(err => console.error(err));
    }

    // Generate JWT tokens
    const tokens = generateTokenPair({
      userId: user._id,
      role: USER_ROLES.USER
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Pending admin approval.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        approvalStatus: user.approvalStatus,
        isPhoneVerified: user.isPhoneVerified,
        isEmailVerified: user.isEmailVerified
      },
      ...tokens
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
};

/**
 * Login user with OTP
 * DEPRECATED: Normal login must use MPIN.
 */
const login = async (req, res) => {
  return res.status(400).json({ success: false, message: 'OTP login is disabled. Please login using MPIN.' });
};

/**
 * Logout user
 */
const logout = async (req, res) => {
  try {
    const { platform = 'web', token, fcmToken, clearAll = false } = req.body;
    const targetToken = fcmToken || token;

    if (req.user && req.user._id) {
      if (targetToken) {
        // Targeted removal of only this session's device token
        await User.findByIdAndUpdate(req.user._id, {
          $pull: { fcmTokens: { token: targetToken } }
        });
        console.log(`[AUTH] ✅ Targeted FCM token removed for user: ${req.user._id}`);
      } else if (clearAll) {
        const updateQuery = platform === 'mobile'
          ? { $set: { fcmTokenMobile: [] } }
          : { $set: { fcmTokens: [] } };
        await User.findByIdAndUpdate(req.user._id, updateQuery);
        console.log(`[AUTH] ✅ ${platform} FCM tokens cleared for user: ${req.user._id}`);
      }
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

/**
 * Refresh Access Token
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Check if user exists
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check status
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }

    // Generate new token pair
    const tokens = generateTokenPair({
      userId: user._id,
      role: USER_ROLES.USER
    });

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      ...tokens
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
};

/**
 * Delete user account permanently
 * After deletion, the phone number will be treated as a new user on next login attempt
 */
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find the user first
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Permanently delete the user document from MongoDB
    const deleted = await User.findByIdAndDelete(userId);

    if (!deleted) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete account. Please try again.'
      });
    }

    console.log(`[AUTH] ✅ User account permanently deleted: ${userId} (phone: ${user.phone})`);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully. You will need to register again to use the app.'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account. Please try again.'
    });
  }
};

/**
 * Login user with MPIN
 */
const loginWithMpin = async (req, res) => {
  try {
    const { phone, mpin } = req.body;

    if (!phone || !mpin) {
      return res.status(400).json({ success: false, message: 'Phone and MPIN are required' });
    }

    if (!mpinService.validateMpinFormat(mpin)) {
      return res.status(400).json({ success: false, message: 'MPIN must be exactly 4 digits' });
    }

    // Find user by phone, including the mpin field
    const user = await User.findOne({ phone }).select('+mpin');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
    }

    if (!user.isMpinSet) {
      // Return a special flag to force MPIN setup
      return res.status(400).json({ 
        success: false, 
        mpinNotSet: true, 
        requiresMpinSetup: true,
        message: 'MPIN is not set for this account. Please setup your MPIN.',
        user: { phone: user.phone }
      });
    }

    if (mpinService.isMpinLocked(user)) {
      return res.status(429).json({ 
        success: false, 
        message: `Too many failed attempts. Try again after ${mpinService.MPIN_LOCKOUT_MINUTES} minutes.`,
        lockUntil: user.mpinLockedUntil
      });
    }

    const isMatch = await mpinService.compareMpin(mpin, user.mpin);
    if (!isMatch) {
      const { locked, remainingAttempts } = await mpinService.incrementMpinAttempts(user);
      if (locked) {
        return res.status(429).json({ success: false, message: `Too many failed attempts. Account locked for ${mpinService.MPIN_LOCKOUT_MINUTES} minutes.` });
      }
      return res.status(401).json({ success: false, message: `Invalid MPIN. ${remainingAttempts} attempts remaining.` });
    }

    // Success - reset attempts
    await mpinService.resetMpinAttempts(user);

    // GATEKEEPER 1: Check Admin Approval
    // Existing active accounts created prior to approvalStatus field default to approved
    const userApproval = user.approvalStatus || (user.isActive ? 'approved' : 'pending');
    if (userApproval === 'pending') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_PENDING_APPROVAL',
        message: 'Your Farmer account is registered and pending admin approval. You can login once approved.'
      });
    }

    if (userApproval === 'rejected') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_REJECTED',
        message: user.rejectionReason
          ? `Your Farmer account application was rejected: ${user.rejectionReason}`
          : 'Your Farmer account application has been rejected by Admin. Please contact support.'
      });
    }

    // GATEKEEPER 2: Check Registration Fee
    if (user.registrationFeeStatus !== 'PAID') {
      const jwt = require('jsonwebtoken');
      const preAuthToken = jwt.sign(
        { userId: user._id, role: 'USER', isPreAuth: true },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
      );
      
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_FEE_REQUIRED',
        message: 'A one-time registration fee is required to activate your Farmer account.',
        preAuthToken,
        role: 'USER'
      });
    }

    // Generate JWT tokens
    const tokens = generateTokenPair({
      userId: user._id,
      role: USER_ROLES.USER
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        approvalStatus: user.approvalStatus || 'approved',
        isPhoneVerified: user.isPhoneVerified,
        isEmailVerified: user.isEmailVerified
      },
      ...tokens
    });
  } catch (error) {
    console.error('MPIN login error:', error);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

/**
 * Set or Change MPIN
 */
const setMpin = async (req, res) => {
  try {
    const userId = req.user._id;
    const { mpin, confirmMpin, currentMpin } = req.body;

    if (!mpin || !confirmMpin) {
      return res.status(400).json({ success: false, message: 'MPIN and Confirm MPIN are required' });
    }

    if (mpin !== confirmMpin) {
      return res.status(400).json({ success: false, message: 'MPINs do not match' });
    }

    if (!mpinService.validateMpinFormat(mpin)) {
      return res.status(400).json({ success: false, message: 'MPIN must be exactly 4 digits' });
    }

    const user = await User.findById(userId).select('+mpin');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isMpinSet) {
      if (!currentMpin) {
        return res.status(400).json({ success: false, message: 'Current MPIN is required to change it' });
      }

      if (mpinService.isMpinLocked(user)) {
        return res.status(429).json({ success: false, message: 'Too many failed attempts. Try again later.' });
      }

      const isMatch = await mpinService.compareMpin(currentMpin, user.mpin);
      if (!isMatch) {
        await mpinService.incrementMpinAttempts(user);
        return res.status(401).json({ success: false, message: 'Incorrect current MPIN' });
      }
    }

    user.mpin = await mpinService.hashMpin(mpin);
    user.isMpinSet = true;
    user.mpinAttempts = 0;
    user.mpinLockedUntil = null;
    await user.save();

    res.status(200).json({ success: true, message: 'MPIN set successfully' });
  } catch (error) {
    console.error('Set MPIN error:', error);
    res.status(500).json({ success: false, message: 'Failed to set MPIN' });
  }
};

/**
 * Reset MPIN via OTP verification token
 */
const resetMpin = async (req, res) => {
  try {
    const { verificationToken, mpin, confirmMpin } = req.body;

    if (!verificationToken || !mpin || !confirmMpin) {
      return res.status(400).json({ success: false, message: 'Verification token, MPIN, and confirm MPIN are required' });
    }

    if (mpin !== confirmMpin) {
      return res.status(400).json({ success: false, message: 'MPINs do not match' });
    }

    if (!mpinService.validateMpinFormat(mpin)) {
      return res.status(400).json({ success: false, message: 'MPIN must be exactly 4 digits' });
    }

    const phone = verifyVerificationToken(verificationToken);
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification session' });
    }

    const user = await User.findOne({ phone }).select('+mpin');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.mpin = await mpinService.hashMpin(mpin);
    user.isMpinSet = true;
    user.mpinAttempts = 0;
    user.mpinLockedUntil = null;
    await user.save();

    res.status(200).json({ success: true, message: 'MPIN reset successfully. You can now login.' });
  } catch (error) {
    console.error('Reset MPIN error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset MPIN' });
  }
};

/**
 * Get MPIN Status
 */
const getMpinStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.status(200).json({
      success: true,
      isMpinSet: !!user?.isMpinSet
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
};

module.exports = {
  sendOTP,
  verifyLogin,
  register,
  login,
  logout,
  refreshToken,
  deleteAccount,
  loginWithMpin,
  setMpin,
  resetMpin,
  getMpinStatus
};
