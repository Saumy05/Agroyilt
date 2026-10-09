const Worker = require('../../models/Worker');
const { generateOTP, hashOTP, storeOTP, verifyOTP, checkRateLimit } = require('../../utils/redisOtp.util');
const { generateTokenPair, verifyRefreshToken, generateVerificationToken, verifyVerificationToken } = require('../../utils/tokenService');
const { sendOTP: sendSMSOTP } = require('../../services/smsService');
const { sendOTPEmail, sendWelcomeEmail } = require('../../services/emailService');
const cloudinaryService = require('../../services/cloudinaryService');
const { USER_ROLES, WORKER_STATUS } = require('../../utils/constants');
const { validationResult } = require('express-validator');
const mpinService = require('../../utils/mpinService');

/**
 * Send OTP for worker registration/login
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

    const { phone, email } = req.body;

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

    // Log OTP
    if (process.env.NODE_ENV === 'development' || process.env.USE_DEFAULT_OTP === 'true') {
      console.log(`[DEV] Worker OTP for ${phone}: ${otp}`);
    }

    if (!smsResult.success) {
      console.warn(`[OTP] SMS failed for worker ${phone}, but OTP stored`);
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      token: 'verification-pending'
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
 * Verify OTP and Check Worker Status (Unified Login/Signup Entry)
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

    // 2. Check if worker exists
    const worker = await Worker.findOne({ phone });

    // NEW FLOW: Always return a verification token, whether new or existing user.
    // The frontend will then either go to Register (if new) or Set MPIN / Reset MPIN.
    const verificationToken = generateVerificationToken(phone);

    return res.status(200).json({
      success: true,
      isNewUser: !worker,
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
 * Register worker with Verification Token
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

    // verificationToken handling
    const { 
      name, 
      email, 
      verificationToken, 
      aadharNumber, 
      aadharDocument, 
      aadharBackDocument, 
      workerType,
      hasBike,
      drivingLicenseNumber,
      drivingLicenseDocument,
      gender
    } = req.body;
    let phone = req.body.phone;

    if (verificationToken) {
      const verifiedPhone = verifyVerificationToken(verificationToken);
      if (!verifiedPhone) return res.status(400).json({ success: false, message: 'Invalid verification session.' });
      phone = verifiedPhone;
    } else {
      // Fallback OTP
      if (!req.body.otp) return res.status(400).json({ success: false, message: 'Verification required.' });
      const ver = await verifyOTP(phone, req.body.otp);
      if (!ver.success) return res.status(400).json({ success: false, message: ver.message });
    }

    // Check existing worker
    const existingQuery = [{ phone }];
    if (email && typeof email === 'string' && email.trim() !== '') {
      existingQuery.push({ email: email.trim().toLowerCase() });
    }
    const existingWorker = await Worker.findOne({ $or: existingQuery });
    if (existingWorker) {
      return res.status(400).json({
        success: false,
        message: 'Worker already exists. Please login.'
      });
    }

    // Upload Aadhar
    let aadharUrl = aadharDocument || null;
    let aadharBackUrl = aadharBackDocument || null;
    let dlUrl = drivingLicenseDocument || null;

    if (aadharUrl && aadharUrl.startsWith('data:')) {
      const uploadRes = await cloudinaryService.uploadFile(aadharUrl, { folder: 'workers/documents' });
      if (uploadRes.success) aadharUrl = uploadRes.url;
    }

    if (aadharBackUrl && aadharBackUrl.startsWith('data:')) {
      const uploadRes = await cloudinaryService.uploadFile(aadharBackUrl, { folder: 'workers/documents' });
      if (uploadRes.success) aadharBackUrl = uploadRes.url;
    }

    if (dlUrl && dlUrl.startsWith('data:')) {
      const uploadRes = await cloudinaryService.uploadFile(dlUrl, { folder: 'workers/documents' });
      if (uploadRes.success) dlUrl = uploadRes.url;
    }

    // Validate workerType
    const validWorkerType = ['TEAM_LEADER', 'WORKER'].includes(workerType) ? workerType : 'WORKER';

    const normalizedEmail = (email && typeof email === 'string' && email.trim() !== '')
      ? email.trim().toLowerCase()
      : undefined;

    // Create worker
    const worker = await Worker.create({
      name,
      email: normalizedEmail,
      phone,
      gender: (gender && ['male', 'female', 'other'].includes(String(gender).toLowerCase())) ? String(gender).toLowerCase() : 'male',
      isPhoneVerified: true,
      aadhar: {
        number: req.body.aadhar || aadharNumber,
        document: aadharUrl,
        backDocument: aadharBackUrl
      },
      hasBike: Boolean(hasBike === true || hasBike === 'true'),
      drivingLicense: {
        number: drivingLicenseNumber ? String(drivingLicenseNumber).trim().toUpperCase() : null,
        document: dlUrl
      },
      status: WORKER_STATUS.OFFLINE,
      workerType: validWorkerType,
      isMpinSet: false,
      approvalStatus: 'pending'
    });

    // Process Referral Attribution if referral code provided
    const referralCode = req.body.referralCode || req.body.ref;
    if (referralCode) {
      try {
        const referralService = require('../../services/referralService');
        await referralService.createReferralAttribution({
          referredUserId: worker._id,
          referredModel: 'Worker',
          referredRole: 'worker',
          referralCode,
          metadata: { ip: req.ip, userAgent: req.headers['user-agent'] }
        });
      } catch (refErr) {
        console.error('Referral attribution error for worker:', refErr);
      }
    }

    // Auto-create unique referral code for this new worker
    try {
      const referralService = require('../../services/referralService');
      await referralService.getOrCreateUserReferralCode(worker._id, 'Worker');
    } catch (e) {
      console.error('Auto-generate referral code error for worker:', e);
    }

    // Notify Admins about new Worker registration
    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      const Admin = require('../../models/Admin');
      const admins = await Admin.find({ isActive: true }).select('_id');
      for (const admin of admins) {
        await createNotification({
          adminId: admin._id,
          type: 'worker_approval_request',
          title: '🛠️ New Worker Registration',
          message: `${worker.name} (${worker.phone}) has registered as a Worker (${worker.workerType})`,
          relatedId: worker._id,
          relatedType: 'worker',
          data: { workerId: worker._id, workerName: worker.name, phone: worker.phone, workerType: worker.workerType },
          pushData: { type: 'admin_alert', link: '/admin/workers/all' }
        });
      }
    } catch (e) { 
      console.error('Notify admin error for worker:', e); 
    }

    // Send Welcome Email if email is present
    if (worker.email) {
      sendWelcomeEmail(worker.email, worker.name).catch(err => {
        console.warn('[AUTH] Welcome email send error (non-fatal):', err.message);
      });
    }

    const tokens = generateTokenPair({
      userId: worker._id,
      role: USER_ROLES.WORKER
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Pending admin approval.',
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        workerType: worker.workerType,
        teamId: worker.teamId || null,
        hasBike: Boolean(worker.hasBike),
        status: worker.status,
        approvalStatus: worker.approvalStatus || 'pending',
        isMpinSet: false,
        serviceCategories: worker.serviceCategories || []
      },
      ...tokens
    });
  } catch (error) {
    console.error('Worker registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
};

/**
 * Login worker with OTP
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

    const { phone, otp } = req.body;

    // Verify OTP
    const verification = await verifyOTP(phone, otp);
    if (!verification.success) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    // Find worker
    const worker = await Worker.findOne({ phone });
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found. Please register first.'
      });
    }

    if (!worker.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated.' });
    }

    // Check approval status
    const workerApproval = worker.approvalStatus || (worker.isActive ? 'approved' : 'pending');
    if (workerApproval === 'pending') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_PENDING_APPROVAL',
        message: 'Your Worker account is registered and pending admin approval. Please wait for the admin to approve your account.'
      });
    }

    if (workerApproval === 'rejected') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_REJECTED',
        message: worker.rejectionReason
          ? `Your Worker application was rejected by admin. Reason: ${worker.rejectionReason}`
          : 'Your Worker application was rejected by admin. Please contact support.'
      });
    }

    // Check Registration Fee
    if (worker.registrationFeeStatus !== 'PAID') {
      const jwt = require('jsonwebtoken');
      const preAuthToken = jwt.sign(
        { userId: worker._id, role: 'WORKER', isPreAuth: true },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
      );
      
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_FEE_REQUIRED',
        message: 'A one-time registration fee is required to activate your Worker account.',
        preAuthToken,
        role: 'WORKER'
      });
    }

    const tokens = generateTokenPair({
      userId: worker._id,
      role: USER_ROLES.WORKER
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        workerType: worker.workerType,
        teamId: worker.teamId || null,
        hasBike: Boolean(worker.hasBike),
        status: worker.status,
        approvalStatus: workerApproval,
        isMpinSet: Boolean(worker.isMpinSet),
        serviceCategories: worker.serviceCategories || []
      },
      ...tokens
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

/**
 * Logout worker
 */
const logout = async (req, res) => {
  try {
    const { platform = 'web', token, fcmToken, clearAll = false } = req.body;
    const targetToken = fcmToken || token;

    if (req.user && req.user._id) {
      if (targetToken) {
        // Targeted removal of only this session's device token
        await Worker.findByIdAndUpdate(req.user._id, {
          $pull: { fcmTokens: { token: targetToken } }
        });
        console.log(`[AUTH] ✅ Targeted FCM token removed for worker: ${req.user._id}`);
      } else if (clearAll) {
        const updateQuery = platform === 'mobile'
          ? { $set: { fcmTokenMobile: [] } }
          : { $set: { fcmTokens: [] } };
        await Worker.findByIdAndUpdate(req.user._id, updateQuery);
        console.log(`[AUTH] ✅ ${platform} FCM tokens cleared for worker: ${req.user._id}`);
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

    // Check if worker exists
    const worker = await Worker.findById(decoded.userId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Check status
    if (!worker.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }

    // Generate new token pair
    const tokens = generateTokenPair({
      userId: worker._id,
      role: USER_ROLES.WORKER
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
 * Login worker with MPIN
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

    const worker = await Worker.findOne({ phone }).select('+mpin');
    
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    if (!worker.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
    }

    if (!worker.isMpinSet) {
      return res.status(400).json({ success: false, mpinNotSet: true, message: 'MPIN is not set for this account. Please login with OTP.' });
    }

    if (mpinService.isMpinLocked(worker)) {
      return res.status(429).json({ 
        success: false, 
        message: `Too many failed attempts. Try again after ${mpinService.MPIN_LOCKOUT_MINUTES} minutes.`,
        lockUntil: worker.mpinLockedUntil
      });
    }

    const isMatch = await mpinService.compareMpin(mpin, worker.mpin);
    if (!isMatch) {
      const { locked, remainingAttempts } = await mpinService.incrementMpinAttempts(worker);
      if (locked) {
        return res.status(429).json({ success: false, message: `Too many failed attempts. Account locked for ${mpinService.MPIN_LOCKOUT_MINUTES} minutes.` });
      }
      return res.status(401).json({ success: false, message: `Invalid MPIN. ${remainingAttempts} attempts remaining.` });
    }

    // Success - reset attempts
    await mpinService.resetMpinAttempts(worker);

    // GATEKEEPER 1: Check Admin Approval Status
    const workerApproval = worker.approvalStatus || (worker.isActive ? 'approved' : 'pending');
    if (workerApproval === 'pending') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_PENDING_APPROVAL',
        message: 'Your Worker account is registered and pending admin approval. Please wait for the admin to approve your account.'
      });
    }

    if (workerApproval === 'rejected') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_REJECTED',
        message: worker.rejectionReason
          ? `Your Worker application was rejected by admin. Reason: ${worker.rejectionReason}`
          : 'Your Worker application was rejected by admin. Please contact support.'
      });
    }

    // GATEKEEPER 2: Check Registration Fee
    if (worker.registrationFeeStatus !== 'PAID') {
      const jwt = require('jsonwebtoken');
      const preAuthToken = jwt.sign(
        { userId: worker._id, role: 'WORKER', isPreAuth: true },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
      );
      
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_FEE_REQUIRED',
        message: 'A one-time registration fee is required to activate your Worker account.',
        preAuthToken,
        role: 'WORKER'
      });
    }

    // Generate JWT tokens
    const tokens = generateTokenPair({
      userId: worker._id,
      role: USER_ROLES.WORKER
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        workerType: worker.workerType,
        teamId: worker.teamId || null,
        hasBike: Boolean(worker.hasBike),
        status: worker.status,
        approvalStatus: workerApproval,
        isMpinSet: true,
        serviceCategories: worker.serviceCategories || [],
        aadharVerified: Boolean(worker.aadhar?.document)
      },
      ...tokens
    });
  } catch (error) {
    console.error('Worker MPIN login error:', error);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

/**
 * Set or Change MPIN
 */
const setMpin = async (req, res) => {
  try {
    const workerId = req.user._id;
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

    const worker = await Worker.findById(workerId).select('+mpin');
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    if (worker.isMpinSet) {
      if (!currentMpin) {
        return res.status(400).json({ success: false, message: 'Current MPIN is required to change it' });
      }

      if (mpinService.isMpinLocked(worker)) {
        return res.status(429).json({ success: false, message: 'Too many failed attempts. Try again later.' });
      }

      const isMatch = await mpinService.compareMpin(currentMpin, worker.mpin);
      if (!isMatch) {
        await mpinService.incrementMpinAttempts(worker);
        return res.status(401).json({ success: false, message: 'Incorrect current MPIN' });
      }
    }

    worker.mpin = await mpinService.hashMpin(mpin);
    worker.isMpinSet = true;
    worker.mpinAttempts = 0;
    worker.mpinLockedUntil = null;
    await worker.save();

    res.status(200).json({ success: true, message: 'MPIN set successfully' });
  } catch (error) {
    console.error('Worker Set MPIN error:', error);
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

    const worker = await Worker.findOne({ phone }).select('+mpin');
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    worker.mpin = await mpinService.hashMpin(mpin);
    worker.isMpinSet = true;
    worker.mpinAttempts = 0;
    worker.mpinLockedUntil = null;
    await worker.save();

    res.status(200).json({ success: true, message: 'MPIN reset successfully. You can now login.' });
  } catch (error) {
    console.error('Worker Reset MPIN error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset MPIN' });
  }
};

/**
 * Get MPIN Status
 */
const getMpinStatus = async (req, res) => {
  try {
    const worker = await Worker.findById(req.user._id);
    res.status(200).json({
      success: true,
      isMpinSet: !!worker?.isMpinSet
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
  loginWithMpin,
  setMpin,
  resetMpin,
  getMpinStatus
};
