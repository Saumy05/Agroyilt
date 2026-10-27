const crypto = require('crypto');
const mongoose = require('mongoose');
const ReferralCode = require('../models/ReferralCode');
const ReferralRewardConfig = require('../models/ReferralRewardConfig');
const ReferralAttribution = require('../models/ReferralAttribution');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Worker = require('../models/Worker');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Transaction = require('../models/Transaction');
const { createNotification } = require('../controllers/notificationControllers/notificationController');

// Base alphabet for referral codes (omits ambiguous characters: 0, O, 1, I, L)
const SAFE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// Canonical qualification event rules
const QUALIFICATION_RULES = {
  ADMIN_APPROVAL: 'ADMIN_APPROVAL',
  REGISTRATION: 'REGISTRATION',
  REGISTRATION_FEE_PAYMENT: 'REGISTRATION_FEE_PAYMENT'
};

/**
 * Normalizes any qualification event string to canonical rule enum
 */
const normalizeQualificationEvent = (event) => {
  if (!event) return QUALIFICATION_RULES.ADMIN_APPROVAL;
  const str = event.toString().toUpperCase().trim();
  if (str === 'ADMIN_APPROVAL' || str === 'ON_APPROVAL' || str === 'APPROVAL') {
    return QUALIFICATION_RULES.ADMIN_APPROVAL;
  }
  if (str === 'REGISTRATION' || str === 'ON_REGISTRATION') {
    return QUALIFICATION_RULES.REGISTRATION;
  }
  if (
    str === 'REGISTRATION_FEE_PAYMENT' ||
    str === 'ON_REGISTRATION_FEE_PAYMENT' ||
    str === 'PAYMENT' ||
    str === 'FEE_PAYMENT'
  ) {
    return QUALIFICATION_RULES.REGISTRATION_FEE_PAYMENT;
  }
  return QUALIFICATION_RULES.ADMIN_APPROVAL;
};

/**
 * The one link a person shares: the site's /r/<CODE> page. It sends an Android phone to the Play Store with the code attached,
 * and everyone else to the web registration page with the code filled in. The site is the one the registration link lives on.
 */
const buildInviteLink = (config, code) => {
  let origin = 'https://agroyilt.com';
  try { origin = new URL(config.registrationUrl || origin).origin; } catch { /* keep the default */ }
  return `${origin}/r/${encodeURIComponent(code)}`;
};

/**
 * Get or initialize global referral reward config
 */
const getOrCreateConfig = async () => {
  let config = await ReferralRewardConfig.findOne({ type: 'global' });
  if (!config) {
    config = await ReferralRewardConfig.create({
      type: 'global',
      systemEnabled: false,
      showRewardStructure: true,
      registrationUrl: 'https://agroyilt.com/app/register',
      roles: {
        farmer: { enabled: false, rewardAmountPaise: 5000 },  // ₹50
        vendor: { enabled: false, rewardAmountPaise: 4000 },  // ₹40
        worker: { enabled: false, rewardAmountPaise: 5000 }   // ₹50
      },
      qualificationEvent: QUALIFICATION_RULES.ADMIN_APPROVAL,
      version: 1,
      auditHistory: []
    });
  }
  return config;
};

/**
 * Generate a unique non-sequential referral code
 * Format: AGRO + 5 characters (e.g., AGRO7K4P9)
 */
const generateUniqueReferralCode = async () => {
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const randomBytes = crypto.randomBytes(5);
    let codeBody = '';
    for (let i = 0; i < 5; i++) {
      codeBody += SAFE_ALPHABET[randomBytes[i] % SAFE_ALPHABET.length];
    }
    const fullCode = `AGRO${codeBody}`;

    const existing = await ReferralCode.findOne({ code: fullCode });
    if (!existing) {
      return fullCode;
    }
  }
  // Fallback to timestamp-based safe hash if loop exhausted
  return `AGRO${Date.now().toString(36).toUpperCase().slice(-5)}`;
};

/**
 * Get or create referral code for any eligible account (User/Farmer, Vendor, Worker)
 */
const getOrCreateUserReferralCode = async (ownerId, ownerModel) => {
  if (!ownerId || !ownerModel) {
    throw new Error('Owner ID and Model are required');
  }

  let codeDoc = await ReferralCode.findOne({ ownerId, ownerModel });
  if (!codeDoc) {
    const newCode = await generateUniqueReferralCode();
    try {
      codeDoc = await ReferralCode.create({
        code: newCode,
        ownerId,
        ownerModel,
        isActive: true
      });
    } catch (err) {
      // In case of concurrent creation race, fetch existing
      if (err.code === 11000) {
        codeDoc = await ReferralCode.findOne({ ownerId, ownerModel });
      } else {
        throw err;
      }
    }
  }

  return codeDoc;
};

/**
 * Validate a referral code from frontend
 */
const validateReferralCode = async (code, candidateUserId = null) => {
  if (!code || typeof code !== 'string') {
    return { isValid: false, message: 'Referral code is required' };
  }

  const normalizedCode = code.trim().toUpperCase();
  const config = await getOrCreateConfig();

  if (!config.systemEnabled) {
    return { isValid: false, message: 'Referral program is currently paused' };
  }

  const referralCodeDoc = await ReferralCode.findOne({ code: normalizedCode });
  if (!referralCodeDoc || !referralCodeDoc.isActive) {
    return { isValid: false, message: 'Invalid or inactive referral code' };
  }

  // Prevent self-referral if candidate user ID is known
  if (candidateUserId && referralCodeDoc.ownerId.toString() === candidateUserId.toString()) {
    return { isValid: false, message: 'You cannot refer yourself' };
  }

  // Fetch referrer name (masked for privacy)
  let ownerName = 'AgroYilt User';
  try {
    if (referralCodeDoc.ownerModel === 'User') {
      const u = await User.findById(referralCodeDoc.ownerId).select('name');
      if (u?.name) ownerName = u.name;
    } else if (referralCodeDoc.ownerModel === 'Vendor') {
      const v = await Vendor.findById(referralCodeDoc.ownerId).select('name businessName');
      if (v?.name || v?.businessName) ownerName = v.name || v.businessName;
    } else if (referralCodeDoc.ownerModel === 'Worker') {
      const w = await Worker.findById(referralCodeDoc.ownerId).select('name');
      if (w?.name) ownerName = w.name;
    }
  } catch (e) {
    // Non-fatal, use default
  }

  return {
    isValid: true,
    code: normalizedCode,
    referrerName: ownerName,
    referrerRole: referralCodeDoc.ownerModel.toLowerCase()
  };
};

/**
 * Create attribution upon new user registration
 */
const createReferralAttribution = async ({
  referredUserId,
  referredModel,
  referredRole, // 'farmer', 'vendor', 'worker'
  referralCode,
  metadata = {}
}) => {
  if (!referralCode || !referredUserId || !referredModel) {
    return { success: false, message: 'Missing attribution parameters' };
  }

  const normalizedCode = referralCode.trim().toUpperCase();

  // Check if system is active
  const config = await getOrCreateConfig();
  if (!config.systemEnabled) {
    return { success: false, message: 'Referral program currently disabled' };
  }

  // Check role eligibility
  const normalizedRole = referredRole?.toLowerCase() || 'farmer';
  const roleConfig = config.roles[normalizedRole];
  if (!roleConfig || !roleConfig.enabled) {
    return { success: false, message: `Referral rewards not enabled for role ${normalizedRole}` };
  }

  // Prevent duplicate attribution: ONE REFERRER PER NEW ACCOUNT
  const existingAttribution = await ReferralAttribution.findOne({ referredUserId });
  if (existingAttribution) {
    return { success: false, message: 'User is already attributed to a referrer' };
  }

  // Validate referral code
  const codeDoc = await ReferralCode.findOne({ code: normalizedCode, isActive: true });
  if (!codeDoc) {
    return { success: false, message: 'Invalid referral code' };
  }

  // Self-referral check
  if (codeDoc.ownerId.toString() === referredUserId.toString()) {
    return { success: false, message: 'Self-referral is not allowed' };
  }

  const activeRule = normalizeQualificationEvent(config.qualificationEvent);

  // Create attribution record with snapshotted qualification rule
  const attribution = await ReferralAttribution.create({
    referredUserId,
    referredModel,
    referredRole: normalizedRole,
    referrerId: codeDoc.ownerId,
    referrerModel: codeDoc.ownerModel,
    referralCode: normalizedCode,
    status: 'pending_qualification',
    rewardStatus: 'unrewarded',
    qualificationRule: activeRule,
    metadata
  });

  // Increment totalReferred counter
  await ReferralCode.findByIdAndUpdate(codeDoc._id, { $inc: { totalReferred: 1 } });

  // If active qualification rule is REGISTRATION, trigger immediate qualification
  if (activeRule === QUALIFICATION_RULES.REGISTRATION) {
    try {
      await qualifyAndRewardReferral({
        referredUserId,
        event: QUALIFICATION_RULES.REGISTRATION
      });
    } catch (qualErr) {
      console.error('[createReferralAttribution] Immediate qualification error:', qualErr);
    }
  }

  return {
    success: true,
    attributionId: attribution._id,
    referrerId: codeDoc.ownerId
  };
};

/**
 * Qualify referral and credit reward to Referrer
 * Called upon approval, registration, or registration fee payment verification
 */
const qualifyAndRewardReferral = async ({
  referredUserId,
  event = 'ADMIN_APPROVAL',
  paymentId = null,
  gatewayPaymentId = null,
  paymentRecord = null
}) => {
  if (!referredUserId) return { success: false, message: 'Missing user ID' };

  // Fetch attribution
  const attribution = await ReferralAttribution.findOne({ referredUserId });
  if (!attribution) {
    return { success: false, message: 'No referral attribution found for this user' };
  }

  // Idempotency: Do not reward if already qualified or rewarded
  if (attribution.status === 'qualified' || attribution.rewardStatus === 'rewarded') {
    return { success: true, message: 'Referral already rewarded', attribution };
  }

  if (attribution.status === 'reversed' || attribution.status === 'rejected') {
    return { success: false, message: 'Referral status does not allow reward' };
  }

  // Self-referral protection check
  if (attribution.referrerId.toString() === referredUserId.toString()) {
    attribution.status = 'rejected';
    attribution.metadata = { ...attribution.metadata, rejectReason: 'self_referral' };
    await attribution.save();
    return { success: false, message: 'Self-referral is not allowed' };
  }

  // Get active config
  const config = await getOrCreateConfig();
  if (!config.systemEnabled) {
    return { success: false, message: 'Referral system disabled' };
  }

  // Compare incoming event against target qualification rule (snapshotted on attribution, or active fallback)
  const activeRule = normalizeQualificationEvent(config.qualificationEvent);
  const targetRule = attribution.qualificationRule
    ? normalizeQualificationEvent(attribution.qualificationRule)
    : activeRule;
  const incomingEvent = normalizeQualificationEvent(event);

  if (incomingEvent !== targetRule) {
    return {
      success: false,
      message: `Referral not qualified: target rule is ${targetRule}, received event ${incomingEvent}`
    };
  }

  // Verification specifically required for REGISTRATION_FEE_PAYMENT rule
  let verifiedPaymentId = paymentId || null;
  let verifiedPaymentRef = gatewayPaymentId || null;

  if (targetRule === QUALIFICATION_RULES.REGISTRATION_FEE_PAYMENT) {
    const RegistrationFeePayment = require('../models/RegistrationFeePayment');
    let payment = paymentRecord;

    if (!payment) {
      if (verifiedPaymentId) {
        payment = await RegistrationFeePayment.findById(verifiedPaymentId);
      } else {
        payment = await RegistrationFeePayment.findOne({
          accountId: referredUserId,
          status: 'PAID'
        }).sort({ createdAt: -1 });
      }
    }

    if (!payment || payment.status !== 'PAID') {
      return {
        success: false,
        message: 'Valid paid registration fee payment required to qualify referral'
      };
    }

    // Verify payment belongs to this referred user
    if (payment.accountId.toString() !== referredUserId.toString()) {
      return {
        success: false,
        message: 'Registration fee payment does not belong to the referred user'
      };
    }

    // Verify payment amount is greater than zero
    if (!payment.amount || payment.amount <= 0) {
      return {
        success: false,
        message: 'Invalid registration fee payment amount'
      };
    }

    verifiedPaymentId = payment._id;
    verifiedPaymentRef = payment.gatewayPaymentId || payment.gatewayOrderId || payment._id.toString();
  }

  const role = attribution.referredRole;
  const roleConfig = config.roles[role];
  if (!roleConfig || !roleConfig.enabled) {
    return { success: false, message: `Referral rewards currently disabled for ${role}` };
  }

  // Calculate reward amount in Paise (SINGLE SOURCE OF TRUTH)
  const rewardAmountPaise = Number(roleConfig.rewardAmountPaise) || 0;
  if (rewardAmountPaise <= 0) {
    return { success: false, message: 'Reward amount is 0' };
  }
  const rewardAmountRupees = Math.round(rewardAmountPaise / 100);

  // ATOMIC LOCK: Transition status from pending_qualification to qualified
  // Guarantees concurrency safety and idempotency across API retries and webhooks
  const updatedAttribution = await ReferralAttribution.findOneAndUpdate(
    {
      _id: attribution._id,
      status: 'pending_qualification',
      rewardStatus: 'unrewarded'
    },
    {
      $set: {
        status: 'qualified',
        rewardStatus: 'rewarded',
        rewardAmountPaise,
        rewardAmount: rewardAmountRupees,
        rewardedRole: role,
        rewardConfigId: config._id,
        rewardConfigVersion: config.version,
        qualificationRule: targetRule,
        qualificationEvent: incomingEvent,
        qualifiedAt: new Date(),
        rewardedAt: new Date(),
        paymentId: verifiedPaymentId,
        paymentReference: verifiedPaymentRef
      }
    },
    { new: true }
  );

  if (!updatedAttribution) {
    return {
      success: true,
      message: 'Referral already rewarded by concurrent transaction',
      attribution
    };
  }

  const referrerId = attribution.referrerId;
  const referrerModel = attribution.referrerModel;
  let creditSuccess = false;
  const idempotencyKey = `ref_reward_${attribution._id}`;

  try {
    if (referrerModel === 'User') {
      // 1. Farmer / User
      let wallet = await Wallet.findOne({ userId: referrerId, userModel: 'User' });
      if (!wallet) {
        wallet = await Wallet.create({ userId: referrerId, userModel: 'User', balance: 0, currency: 'INR' });
      }

      const prevBalance = wallet.balance || 0;
      wallet.balance = prevBalance + rewardAmountRupees;
      await wallet.save();

      // Sync User model
      await User.findByIdAndUpdate(referrerId, { 'wallet.balance': wallet.balance });

      // Create WalletTransaction with unique idempotencyKey
      await WalletTransaction.create({
        walletId: wallet._id,
        type: 'credit',
        amount: rewardAmountRupees,
        reason: 'referral_reward',
        referenceId: attribution._id.toString(),
        idempotencyKey,
        status: 'completed'
      });

      // Create Transaction record for passbook
      await Transaction.create({
        userId: referrerId,
        type: 'referral_reward',
        amount: rewardAmountRupees,
        status: 'completed',
        paymentMethod: 'wallet',
        description: `Referral reward for inviting a new ${role.toUpperCase()}`,
        balanceBefore: prevBalance,
        balanceAfter: wallet.balance,
        referenceId: attribution._id.toString(),
        metadata: {
          referredUserId: attribution.referredUserId,
          referredRole: role,
          rewardPaise: rewardAmountPaise,
          qualificationRule: targetRule
        }
      });
      creditSuccess = true;

    } else if (referrerModel === 'Vendor') {
      // 2. Vendor
      const vendor = await Vendor.findById(referrerId);
      if (vendor) {
        const prevEarnings = vendor.wallet?.earnings || 0;
        const newEarnings = prevEarnings + rewardAmountRupees;

        await Vendor.findByIdAndUpdate(referrerId, {
          'wallet.earnings': newEarnings
        });

        await Transaction.create({
          vendorId: referrerId,
          type: 'referral_reward',
          amount: rewardAmountRupees,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Referral bonus for inviting a new ${role.toUpperCase()}`,
          balanceBefore: prevEarnings,
          balanceAfter: newEarnings,
          referenceId: attribution._id.toString(),
          metadata: {
            referredUserId: attribution.referredUserId,
            referredRole: role,
            rewardPaise: rewardAmountPaise,
            qualificationRule: targetRule
          }
        });
        creditSuccess = true;
      }

    } else if (referrerModel === 'Worker') {
      // 3. Worker
      const worker = await Worker.findById(referrerId);
      if (worker) {
        const prevBalance = worker.wallet?.balance || 0;
        const newBalance = prevBalance + rewardAmountRupees;

        await Worker.findByIdAndUpdate(referrerId, {
          'wallet.balance': newBalance
        });

        await Transaction.create({
          workerId: referrerId,
          type: 'referral_reward',
          amount: rewardAmountRupees,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Referral reward for inviting a new ${role.toUpperCase()}`,
          balanceBefore: prevBalance,
          balanceAfter: newBalance,
          referenceId: attribution._id.toString(),
          metadata: {
            referredUserId: attribution.referredUserId,
            referredRole: role,
            rewardPaise: rewardAmountPaise,
            qualificationRule: targetRule
          }
        });
        creditSuccess = true;
      }
    }
  } catch (walletErr) {
    console.error('[qualifyAndRewardReferral] Wallet credit failed:', walletErr);
    if (walletErr.code === 11000) {
      creditSuccess = true; // Duplicate key on wallet transaction indicates already credited
    } else {
      return { success: false, message: 'Failed to credit wallet: ' + walletErr.message };
    }
  }

  if (!creditSuccess) {
    return { success: false, message: 'Referrer account not found or unsupported model' };
  }

  // Update ReferralCode statistics
  await ReferralCode.findOneAndUpdate(
    { code: attribution.referralCode },
    {
      $inc: {
        totalQualified: 1,
        totalEarnedPaise: rewardAmountPaise
      }
    }
  );

  // Send Notification to Referrer
  try {
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    const notifPayload = {
      type: 'referral_reward',
      title: '🎉 Referral Reward Credited!',
      message: `You earned ₹${rewardAmountRupees} as a referral bonus! A new ${roleLabel} joined using your code.`,
      relatedId: attribution._id,
      relatedType: 'referral'
    };

    if (referrerModel === 'User') {
      notifPayload.userId = referrerId;
    } else if (referrerModel === 'Vendor') {
      notifPayload.vendorId = referrerId;
    } else if (referrerModel === 'Worker') {
      notifPayload.workerId = referrerId;
    }
    await createNotification(notifPayload);
  } catch (notifErr) {
    console.error('Failed to notify referrer:', notifErr);
  }

  return {
    success: true,
    rewardAmountRupees,
    rewardAmountPaise,
    attribution: updatedAttribution
  };
};

/**
 * Reverse a reward (Admin action)
 */
const reverseReferralReward = async ({ attributionId, adminId, reason }) => {
  const attribution = await ReferralAttribution.findById(attributionId);
  if (!attribution) {
    return { success: false, message: 'Attribution record not found' };
  }

  if (attribution.rewardStatus !== 'rewarded') {
    return { success: false, message: 'Reward was not granted or is already reversed' };
  }

  const rewardRupees = attribution.rewardAmount || Math.round(attribution.rewardAmountPaise / 100);
  const referrerId = attribution.referrerId;
  const referrerModel = attribution.referrerModel;

  // Safely debit referrer's balance / earnings
  try {
    if (referrerModel === 'User') {
      const wallet = await Wallet.findOne({ userId: referrerId, userModel: 'User' });
      if (wallet) {
        const prevBal = wallet.balance || 0;
        wallet.balance = Math.max(0, prevBal - rewardRupees);
        await wallet.save();
        await User.findByIdAndUpdate(referrerId, { 'wallet.balance': wallet.balance });

        await Transaction.create({
          userId: referrerId,
          type: 'referral_reversal',
          amount: rewardRupees,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Referral reward reversed by admin: ${reason || 'N/A'}`,
          balanceBefore: prevBal,
          balanceAfter: wallet.balance,
          referenceId: attribution._id.toString()
        });
      }
    } else if (referrerModel === 'Vendor') {
      const vendor = await Vendor.findById(referrerId);
      if (vendor) {
        const prev = vendor.wallet?.earnings || 0;
        const next = Math.max(0, prev - rewardRupees);
        await Vendor.findByIdAndUpdate(referrerId, { 'wallet.earnings': next });

        await Transaction.create({
          vendorId: referrerId,
          type: 'referral_reversal',
          amount: rewardRupees,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Referral bonus reversed: ${reason || 'N/A'}`,
          balanceBefore: prev,
          balanceAfter: next,
          referenceId: attribution._id.toString()
        });
      }
    } else if (referrerModel === 'Worker') {
      const worker = await Worker.findById(referrerId);
      if (worker) {
        const prev = worker.wallet?.balance || 0;
        const next = Math.max(0, prev - rewardRupees);
        await Worker.findByIdAndUpdate(referrerId, { 'wallet.balance': next });

        await Transaction.create({
          workerId: referrerId,
          type: 'referral_reversal',
          amount: rewardRupees,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Referral reward reversed: ${reason || 'N/A'}`,
          balanceBefore: prev,
          balanceAfter: next,
          referenceId: attribution._id.toString()
        });
      }
    }
  } catch (err) {
    console.error('[reverseReferralReward] Error debiting referrer:', err);
    return { success: false, message: 'Failed to reverse wallet amount: ' + err.message };
  }

  // Update attribution
  attribution.status = 'reversed';
  attribution.rewardStatus = 'reversed';
  attribution.reversalReason = reason || 'Reversed by admin';
  attribution.reversedAt = new Date();
  attribution.reversedBy = adminId;
  await attribution.save();

  // Decrement totalQualified and totalEarnedPaise on ReferralCode
  await ReferralCode.findOneAndUpdate(
    { code: attribution.referralCode },
    {
      $inc: {
        totalQualified: -1,
        totalEarnedPaise: -attribution.rewardAmountPaise
      }
    }
  );

  return { success: true, message: 'Referral reward reversed successfully' };
};

/**
 * Get stats & referral history for a user (Farmer, Vendor, or Worker)
 */
const getUserReferralStats = async (userId, userModel) => {
  const codeDoc = await getOrCreateUserReferralCode(userId, userModel);
  const config = await getOrCreateConfig();

  // Fetch recent attributions
  const attributions = await ReferralAttribution.find({ referrerId: userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Populate names if possible
  const formattedHistory = await Promise.all(attributions.map(async (item) => {
    let name = 'New User';
    try {
      if (item.referredModel === 'User') {
        const u = await User.findById(item.referredUserId).select('name phone').lean();
        if (u) name = u.name || `User (${u.phone?.slice(-4) || '****'})`;
      } else if (item.referredModel === 'Vendor') {
        const v = await Vendor.findById(item.referredUserId).select('name businessName phone').lean();
        if (v) name = v.businessName || v.name || 'Vendor';
      } else if (item.referredModel === 'Worker') {
        const w = await Worker.findById(item.referredUserId).select('name phone').lean();
        if (w) name = w.name || 'Worker';
      }
    } catch (e) {
      // fallback
    }

    return {
      id: item._id,
      name,
      role: item.referredRole,
      status: item.status,
      rewardStatus: item.rewardStatus,
      rewardAmount: item.rewardAmount || Math.round((item.rewardAmountPaise || 0) / 100),
      createdAt: item.createdAt,
      rewardedAt: item.rewardedAt
    };
  }));

  const pendingCount = attributions.filter(a => a.status === 'pending_qualification').length;
  const qualifiedCount = codeDoc.totalQualified || 0;
  const totalEarned = Math.round((codeDoc.totalEarnedPaise || 0) / 100);

  const getRoleRewardRupees = (roleKey) => {
    const role = config.roles?.[roleKey];
    if (!role) return 0;
    const paise = typeof role.rewardAmountPaise === 'number' ? role.rewardAmountPaise : 0;
    return Math.max(0, Math.round(paise / 100));
  };

  const rolesData = {
    farmer: {
      enabled: !!config.roles?.farmer?.enabled,
      rewardAmount: getRoleRewardRupees('farmer')
    },
    vendor: {
      enabled: !!config.roles?.vendor?.enabled,
      rewardAmount: getRoleRewardRupees('vendor')
    },
    worker: {
      enabled: !!config.roles?.worker?.enabled,
      rewardAmount: getRoleRewardRupees('worker')
    }
  };

  return {
    referralCode: codeDoc.code,
    registerLink: config.registrationUrl || 'https://agroyilt.com/app/register',
    inviteLink: buildInviteLink(config, codeDoc.code),
    totalReferred: codeDoc.totalReferred || 0,
    totalQualified: qualifiedCount,
    pendingQualifications: pendingCount,
    totalEarnedRupees: totalEarned,
    showRewardStructure: config.showRewardStructure !== false,
    roles: rolesData,
    rates: {
      farmer: rolesData.farmer.enabled ? rolesData.farmer.rewardAmount : 0,
      vendor: rolesData.vendor.enabled ? rolesData.vendor.rewardAmount : 0,
      worker: rolesData.worker.enabled ? rolesData.worker.rewardAmount : 0
    },
    systemEnabled: config.systemEnabled,
    history: formattedHistory
  };
};

module.exports = {
  QUALIFICATION_RULES,
  normalizeQualificationEvent,
  getOrCreateConfig,
  generateUniqueReferralCode,
  getOrCreateUserReferralCode,
  validateReferralCode,
  createReferralAttribution,
  qualifyAndRewardReferral,
  reverseReferralReward,
  getUserReferralStats
};
