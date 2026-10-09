const Vendor = require('../../models/Vendor');
const { generateOTP, hashOTP, storeOTP, verifyOTP, checkRateLimit } = require('../../utils/redisOtp.util');
const { generateTokenPair, verifyRefreshToken, generateVerificationToken, verifyVerificationToken } = require('../../utils/tokenService');
const { sendOTP: sendSMSOTP } = require('../../services/smsService');
const cloudinaryService = require('../../services/cloudinaryService');
const { USER_ROLES, VENDOR_STATUS } = require('../../utils/constants');
const { validationResult } = require('express-validator');
const mpinService = require('../../utils/mpinService');

/**
 * Send OTP for vendor registration/login
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

    // If this is a forgot MPIN attempt, verify vendor exists first
    if (purpose === 'forgotMpin') {
      const vendorExists = await Vendor.findOne({ phone });
      if (!vendorExists) {
        return res.status(404).json({
          success: false,
          message: 'Vendor not found with this number'
        });
      }
    }

    // 1. Check existing vendor status based on purpose
    const existingVendor = await Vendor.findOne({ phone });

    // If registering, prevent OTP if vendor already exists
    if (purpose === 'register') {
      if (existingVendor) {
        if (existingVendor.approvalStatus === VENDOR_STATUS.PENDING) {
          return res.status(400).json({
            success: false,
            message: 'Your vendor account is already registered and is currently pending admin approval.'
          });
        }
        if (existingVendor.approvalStatus === VENDOR_STATUS.REJECTED || existingVendor.approvalStatus === VENDOR_STATUS.SUSPENDED) {
          return res.status(403).json({
            success: false,
            message: 'This account has been restricted or rejected. Please contact support.'
          });
        }
        return res.status(400).json({
          success: false,
          message: 'A vendor account with this phone number already exists. Please login instead.'
        });
      }
    } else {
      // If logging in or general flow, prevent OTP if restricted or pending
      if (existingVendor) {
        if (existingVendor.approvalStatus === VENDOR_STATUS.PENDING) {
          return res.status(403).json({
            success: false,
            isPending: true,
            message: 'Your account is currently under review. Please wait for admin approval.',
            vendor: { adminApproval: 'pending' }
          });
        }
        if (existingVendor.approvalStatus === VENDOR_STATUS.REJECTED || existingVendor.approvalStatus === VENDOR_STATUS.SUSPENDED) {
          return res.status(403).json({ success: false, message: 'Account restricted.' });
        }
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

    // Log OTP in development mode
    if (process.env.NODE_ENV === 'development' || process.env.USE_DEFAULT_OTP === 'true') {
      console.log(`[DEV] Vendor OTP for ${phone}: ${otp}`);
    }

    if (!smsResult.success) {
      console.warn(`[OTP] SMS failed for vendor ${phone}, but OTP stored`);
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
 * Verify OTP and Check Vendor Status (Unified Login/Signup Entry)
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

    // 2. Check if vendor exists
    // 2. Check if vendor exists
    const vendor = await Vendor.findOne({ phone });

    // NEW FLOW: Always return a verification token.
    const verificationToken = generateVerificationToken(phone);

    return res.status(200).json({
      success: true,
      isNewUser: !vendor,
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
 * Register vendor with Verification Token (Service/Category Removed)
 */
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    // Ignore service validation error if present (since removed)
    const validErrors = errors.array().filter(e => e.path !== 'service');

    if (validErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validErrors
      });
    }

    // verificationToken handling
    const { name, email, verificationToken, aadhar, pan, businessName, service, labDetails, shopDetails, gender } = req.body;
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

    // Check existing
    const normalizedEmail = (email && typeof email === 'string' && email.trim() !== '')
      ? email.trim().toLowerCase()
      : undefined;

    const query = [{ phone }];
    if (normalizedEmail) {
      query.push({ email: normalizedEmail });
    }
    const existing = await Vendor.findOne({ $or: query });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Vendor already exists. Login.' });
    }

    // Upload documents concurrently
    const uploadBase64 = async (dataStr, folder) => {
      if (!dataStr || !dataStr.startsWith('data:')) return dataStr;
      const res = await cloudinaryService.uploadFile(dataStr, { folder });
      return res.success ? res.url : null;
    };

    let aadharUrl = req.body.aadharDocument || null;
    let aadharBackUrl = req.body.aadharBackDocument || null;
    let panUrl = req.body.panDocument || null;
    let otherUrls = req.body.otherDocuments || [];
    let parsedLabDetails = labDetails ? (typeof labDetails === 'string' ? JSON.parse(labDetails) : labDetails) : null;
    let parsedShopDetails = shopDetails ? (typeof shopDetails === 'string' ? JSON.parse(shopDetails) : shopDetails) : null;

    const pAadhar = uploadBase64(aadharUrl, 'vendors/documents');
    const pAadharBack = uploadBase64(aadharBackUrl, 'vendors/documents');
    const pPan = uploadBase64(panUrl, 'vendors/documents');
    const pOthers = Promise.all(otherUrls.map(doc => uploadBase64(doc, 'vendors/documents/others')));

    let pLabCert = Promise.resolve(null);
    if (parsedLabDetails && parsedLabDetails.certificationDocument) {
      pLabCert = uploadBase64(parsedLabDetails.certificationDocument, 'vendors/documents/lab');
    }

    let pShopLicense = Promise.resolve(null);
    if (parsedShopDetails && parsedShopDetails.licenseDocument) {
      pShopLicense = uploadBase64(parsedShopDetails.licenseDocument, 'vendors/documents/shop');
    }

    const [finalAadhar, finalAadharBack, finalPan, finalOthers, finalLabCert, finalShopLicense] = await Promise.all([
      pAadhar, pAadharBack, pPan, pOthers, pLabCert, pShopLicense
    ]);

    aadharUrl = finalAadhar || aadharUrl;
    aadharBackUrl = finalAadharBack || aadharBackUrl;
    panUrl = finalPan || panUrl;
    otherUrls = finalOthers;
    
    if (parsedLabDetails && parsedLabDetails.certificationDocument) {
      parsedLabDetails.certificationDocument = finalLabCert;
    }
    if (parsedShopDetails && parsedShopDetails.licenseDocument) {
      parsedShopDetails.licenseDocument = finalShopLicense;
    }

    const vendorData = {
      name, phone,
      gender: (gender && ['male', 'female', 'other'].includes(String(gender).toLowerCase())) ? String(gender).toLowerCase() : null,
      businessName,
      service: Array.isArray(service) ? service : (service ? [service] : []),
      aadhar: {
        number: aadhar,
        document: aadharUrl,
        backDocument: aadharBackUrl
      },
      otherDocuments: otherUrls,
      approvalStatus: VENDOR_STATUS.PENDING,
      isPhoneVerified: true,
      isMpinSet: false
    };

    if (parsedLabDetails) vendorData.labDetails = parsedLabDetails;
    if (parsedShopDetails) {
      parsedShopDetails.storeApprovalStatus = 'pending';
      vendorData.shopDetails = parsedShopDetails;
    }

    if (normalizedEmail) {
      vendorData.email = normalizedEmail;
    }

    if (pan || panUrl) {
      vendorData.pan = {};
      if (pan) vendorData.pan.number = pan;
      if (panUrl) vendorData.pan.document = panUrl;
    }

    const vendor = await Vendor.create(vendorData);

    // Process Referral Attribution if referral code provided
    const referralCode = req.body.referralCode || req.body.ref;
    if (referralCode) {
      try {
        const referralService = require('../../services/referralService');
        await referralService.createReferralAttribution({
          referredUserId: vendor._id,
          referredModel: 'Vendor',
          referredRole: 'vendor',
          referralCode,
          metadata: { ip: req.ip, userAgent: req.headers['user-agent'] }
        });
      } catch (refErr) {
        console.error('Referral attribution error for vendor:', refErr);
      }
    }

    // Auto-create unique referral code for this new vendor
    try {
      const referralService = require('../../services/referralService');
      await referralService.getOrCreateUserReferralCode(vendor._id, 'Vendor');
    } catch (e) {
      console.error('Auto-generate referral code error for vendor:', e);
    }

    // Notify Admins
    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      const Admin = require('../../models/Admin');
      const admins = await Admin.find({ isActive: true }).select('_id');
      for (const admin of admins) {
        await createNotification({
          adminId: admin._id,
          type: 'vendor_approval_request',
          title: '👤 New Vendor Registration',
          message: `${vendor.name} (${vendor.phone}) has registered`,
          relatedId: vendor._id,
          relatedType: 'vendor',
          data: { vendorId: vendor._id, vendorName: vendor.name, phone: vendor.phone },
          pushData: { type: 'admin_alert', link: '/admin/vendors/all' }
        });
      }
    } catch (e) { console.error('Notify error', e); }

    const tokens = generateTokenPair({
      userId: vendor._id,
      role: USER_ROLES.VENDOR
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Pending approval.',
      vendor: {
        id: vendor._id,
        name: vendor.name,
        email: vendor.email,
        phone: vendor.phone,
        approvalStatus: vendor.approvalStatus
      },
      ...tokens
    });

  } catch (error) {
    console.error('Vendor registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Registration failed.',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Login vendor with OTP
 * DEPRECATED: Normal login must use MPIN.
 */
const login = async (req, res) => {
  return res.status(400).json({ success: false, message: 'OTP login is disabled. Please login using MPIN.' });
};

/**
 * Logout vendor
 */
const logout = async (req, res) => {
  try {
    const { platform = 'web', token, fcmToken, clearAll = false } = req.body;
    const targetToken = fcmToken || token;

    if (req.user && req.user._id) {
      if (targetToken) {
        // Targeted removal of only this session's device token
        await Vendor.findByIdAndUpdate(req.user._id, {
          $pull: { fcmTokens: { token: targetToken } }
        });
        console.log(`[AUTH] ✅ Targeted FCM token removed for vendor: ${req.user._id}`);
      } else if (clearAll) {
        const updateQuery = platform === 'mobile'
          ? { $set: { fcmTokenMobile: [] } }
          : { $set: { fcmTokens: [] } };
        await Vendor.findByIdAndUpdate(req.user._id, updateQuery);
        console.log(`[AUTH] ✅ ${platform} FCM tokens cleared for vendor: ${req.user._id}`);
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

    // Check if vendor exists
    const vendor = await Vendor.findById(decoded.userId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Check status
    if (vendor.approvalStatus !== 'APPROVED' || !vendor.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }

    // Generate new token pair
    const tokens = generateTokenPair({
      userId: vendor._id,
      role: USER_ROLES.VENDOR
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
 * Delete vendor account permanently
 * After deletion, the phone number will be treated as a new vendor on next login attempt
 */
const deleteAccount = async (req, res) => {
  try {
    const vendorId = req.user._id;

    // Find the vendor first
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Permanently delete the vendor document from MongoDB
    await Vendor.findByIdAndDelete(vendorId);

    console.log(`[AUTH] ✅ Vendor account permanently deleted: ${vendorId} (phone: ${vendor.phone})`);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully. You will need to register again to use the app.'
    });
  } catch (error) {
    console.error('Delete vendor account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account. Please try again.'
    });
  }
};

/**
 * Login vendor with MPIN
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

    const vendor = await Vendor.findOne({ phone }).select('+mpin');
    
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (vendor.approvalStatus === VENDOR_STATUS.PENDING) {
      return res.status(403).json({ success: false, message: 'Your account is pending admin approval.' });
    }
    if (vendor.approvalStatus === VENDOR_STATUS.REJECTED || vendor.approvalStatus === VENDOR_STATUS.SUSPENDED) {
      return res.status(403).json({ success: false, message: 'Account restricted.' });
    }
    if (!vendor.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
    }

    if (!vendor.isMpinSet) {
      // Return a special flag to force MPIN setup
      return res.status(400).json({ 
        success: false, 
        mpinNotSet: true, 
        requiresMpinSetup: true,
        message: 'MPIN is not set for this account. Please setup your MPIN.',
        vendor: { phone: vendor.phone }
      });
    }

    if (mpinService.isMpinLocked(vendor)) {
      return res.status(429).json({ 
        success: false, 
        message: `Too many failed attempts. Try again after ${mpinService.MPIN_LOCKOUT_MINUTES} minutes.`,
        lockUntil: vendor.mpinLockedUntil
      });
    }

    const isMatch = await mpinService.compareMpin(mpin, vendor.mpin);
    if (!isMatch) {
      const { locked, remainingAttempts } = await mpinService.incrementMpinAttempts(vendor);
      if (locked) {
        return res.status(429).json({ success: false, message: `Too many failed attempts. Account locked for ${mpinService.MPIN_LOCKOUT_MINUTES} minutes.` });
      }
      return res.status(401).json({ success: false, message: `Invalid MPIN. ${remainingAttempts} attempts remaining.` });
    }

    // Success - reset attempts
    await mpinService.resetMpinAttempts(vendor);

    // GATEKEEPER: Check Registration Fee
    if (vendor.registrationFeeStatus !== 'PAID') {
      const jwt = require('jsonwebtoken');
      const preAuthToken = jwt.sign(
        { userId: vendor._id, role: 'VENDOR', isPreAuth: true },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
      );
      
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_FEE_REQUIRED',
        message: 'A one-time registration fee is required to activate your Vendor account.',
        preAuthToken,
        role: 'VENDOR'
      });
    }

    // Generate JWT tokens
    const tokens = generateTokenPair({
      userId: vendor._id,
      role: USER_ROLES.VENDOR
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      vendor: {
        id: vendor._id,
        name: vendor.name,
        email: vendor.email,
        phone: vendor.phone,
        businessName: vendor.businessName,
        service: vendor.service,
        approvalStatus: vendor.approvalStatus
      },
      ...tokens
    });
  } catch (error) {
    console.error('Vendor MPIN login error:', error);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

/**
 * Set or Change MPIN
 */
const setMpin = async (req, res) => {
  try {
    const vendorId = req.user._id;
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

    const vendor = await Vendor.findById(vendorId).select('+mpin');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (vendor.isMpinSet) {
      if (!currentMpin) {
        return res.status(400).json({ success: false, message: 'Current MPIN is required to change it' });
      }

      if (mpinService.isMpinLocked(vendor)) {
        return res.status(429).json({ success: false, message: 'Too many failed attempts. Try again later.' });
      }

      const isMatch = await mpinService.compareMpin(currentMpin, vendor.mpin);
      if (!isMatch) {
        await mpinService.incrementMpinAttempts(vendor);
        return res.status(401).json({ success: false, message: 'Incorrect current MPIN' });
      }
    }

    vendor.mpin = await mpinService.hashMpin(mpin);
    vendor.isMpinSet = true;
    vendor.mpinAttempts = 0;
    vendor.mpinLockedUntil = null;
    await vendor.save();

    res.status(200).json({ success: true, message: 'MPIN set successfully' });
  } catch (error) {
    console.error('Vendor Set MPIN error:', error);
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

    const vendor = await Vendor.findOne({ phone }).select('+mpin');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    vendor.mpin = await mpinService.hashMpin(mpin);
    vendor.isMpinSet = true;
    vendor.mpinAttempts = 0;
    vendor.mpinLockedUntil = null;
    await vendor.save();

    res.status(200).json({ success: true, message: 'MPIN reset successfully. You can now login.' });
  } catch (error) {
    console.error('Vendor Reset MPIN error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset MPIN' });
  }
};

/**
 * Get MPIN Status
 */
const getMpinStatus = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user._id);
    res.status(200).json({
      success: true,
      isMpinSet: !!vendor?.isMpinSet
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
