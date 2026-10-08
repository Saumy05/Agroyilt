'use strict';

const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Worker = require('../models/Worker');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');

/**
 * Mask sensitive account number for standard UI display
 * e.g. "123456789012" -> "•••• •••• 9012"
 */
const maskAccountNumber = (acc) => {
  if (!acc || typeof acc !== 'string') return '';
  const clean = acc.trim();
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  return `•••• •••• ${last4}`;
};

/**
 * Normalize role string to Model name and role identifier
 */
const resolveRoleInfo = (rawRole) => {
  const role = (rawRole || '').toLowerCase().trim();
  if (role === 'farmer' || role === 'user') {
    return { modelName: 'User', roleKey: 'user', Model: User };
  }
  if (role === 'vendor') {
    return { modelName: 'Vendor', roleKey: 'vendor', Model: Vendor };
  }
  if (role === 'worker') {
    return { modelName: 'Worker', roleKey: 'worker', Model: Worker };
  }
  throw new Error(`Unsupported role: ${rawRole}`);
};

/**
 * Get Global Minimum Withdrawal Amount from Settings
 * Returns amount in integer paise and rupees
 */
const getGlobalMinimumWithdrawal = async () => {
  let settings = await Settings.findOne({ type: 'global' });
  if (!settings) {
    settings = await Settings.create({ type: 'global', minWithdrawalAmountPaise: 30000 });
  }
  const minPaise = settings.minWithdrawalAmountPaise ?? 30000; // default ₹300
  return {
    minWithdrawalAmountPaise: minPaise,
    minWithdrawalAmountINR: Math.round(minPaise / 100)
  };
};

/**
 * Update Global Minimum Withdrawal Amount in Settings
 */
const updateGlobalMinimumWithdrawal = async (amountINR) => {
  const numINR = Number(amountINR);
  if (isNaN(numINR) || numINR < 1) {
    throw new Error('Minimum withdrawal amount must be at least ₹1');
  }
  const minPaise = Math.round(numINR * 100);

  let settings = await Settings.findOne({ type: 'global' });
  if (!settings) {
    settings = await Settings.create({ type: 'global', minWithdrawalAmountPaise: minPaise });
  } else {
    settings.minWithdrawalAmountPaise = minPaise;
    await settings.save();
  }

  return {
    minWithdrawalAmountPaise: minPaise,
    minWithdrawalAmountINR: Math.round(minPaise / 100)
  };
};

/**
 * Get Withdrawable Balance and Banking status for User, Vendor, or Worker
 */
const getWithdrawableBalance = async (userId, rawRole) => {
  const { modelName, Model } = resolveRoleInfo(rawRole);
  const entity = await Model.findById(userId).select('wallet bankDetails isActive');

  if (!entity) {
    throw new Error(`${modelName} account not found`);
  }

  let availableINR = 0;
  let reservedINR = 0;

  if (modelName === 'Vendor') {
    availableINR = Number(entity.wallet?.earnings || 0);
    reservedINR = Number(entity.wallet?.reservedWithdrawal || 0);
  } else {
    // User or Worker: Check both Wallet collection and entity.wallet.balance
    const walletDoc = await Wallet.findOne({ userId, userModel: modelName });
    const walletBal = Number(walletDoc?.balance || 0);
    const entityBal = Number(entity.wallet?.balance || 0);
    availableINR = Math.max(walletBal, entityBal);
    reservedINR = Number(walletDoc?.reservedBalance || entity.wallet?.reservedWithdrawal || 0);

    // Keep both in sync if there's any discrepancy
    if (entity.wallet?.balance !== availableINR) {
      await Model.findByIdAndUpdate(userId, { 'wallet.balance': availableINR });
    }
    if (walletDoc && walletDoc.balance !== availableINR) {
      await Wallet.findByIdAndUpdate(walletDoc._id, { balance: availableINR });
    }
  }

  // Ensure non-negative numbers
  availableINR = Math.max(0, availableINR);
  reservedINR = Math.max(0, reservedINR);

  const availablePaise = Math.round(availableINR * 100);
  const reservedPaise = Math.round(reservedINR * 100);

  const minConfig = await getGlobalMinimumWithdrawal();

  const hasBankDetails = Boolean(
    entity.bankDetails &&
    entity.bankDetails.accountNumber &&
    entity.bankDetails.ifscCode &&
    entity.bankDetails.accountHolderName
  );

  const bankAccountMasked = hasBankDetails ? maskAccountNumber(entity.bankDetails.accountNumber) : '';

  return {
    success: true,
    data: {
      availableBalance: availableINR,
      withdrawableBalance: availableINR,
      balance: availableINR,
      availableBalancePaise: availablePaise,
      reservedBalance: reservedINR,
      reservedBalancePaise: reservedPaise,
      currency: 'INR',
      minWithdrawalAmount: minConfig.minWithdrawalAmountINR,
      minWithdrawalAmountPaise: minConfig.minWithdrawalAmountPaise,
      hasBankDetails,
      bankAccountMasked,
      bankDetails: hasBankDetails ? {
        accountHolderName: entity.bankDetails.accountHolderName,
        accountNumberMasked: bankAccountMasked,
        bankAccountMasked: bankAccountMasked,
        bankName: entity.bankDetails.bankName,
        branchName: entity.bankDetails.branchName,
        ifscCode: entity.bankDetails.ifscCode,
        ifsc: entity.bankDetails.ifscCode,
        upiId: entity.bankDetails.upiId
      } : null
    }
  };
};

/**
 * Get Saved Banking Details (Masked)
 */
const getBankDetails = async (userId, rawRole) => {
  const { modelName, Model } = resolveRoleInfo(rawRole);
  const entity = await Model.findById(userId).select('bankDetails');

  if (!entity) {
    throw new Error(`${modelName} not found`);
  }

  const b = entity.bankDetails;
  const hasBankDetails = Boolean(b && b.accountNumber && b.ifscCode && b.accountHolderName);

  return {
    success: true,
    data: {
      hasBankDetails,
      accountHolderName: b?.accountHolderName || '',
      accountNumberMasked: b?.accountNumber ? maskAccountNumber(b.accountNumber) : '',
      bankName: b?.bankName || '',
      branchName: b?.branchName || '',
      ifscCode: b?.ifscCode || '',
      ifsc: b?.ifscCode || '',
      upiId: b?.upiId || '',
      updatedAt: b?.updatedAt || null
    }
  };
};

/**
 * Save or Update Banking Details
 */
const updateBankDetails = async (arg1, arg2, bankData) => {
  let userId, rawRole;
  if (['vendor', 'farmer', 'worker', 'user'].includes(String(arg1 || '').toLowerCase().trim())) {
    rawRole = arg1;
    userId = arg2;
  } else {
    userId = arg1;
    rawRole = arg2;
  }
  const { modelName, Model } = resolveRoleInfo(rawRole);
  const { accountHolderName, accountNumber, bankName, branchName, upiId } = bankData;
  const rawIfsc = bankData.ifscCode || bankData.ifsc || '';

  // Validation
  if (!accountHolderName || typeof accountHolderName !== 'string' || accountHolderName.trim().length < 2) {
    throw new Error('Account holder name must be at least 2 characters');
  }

  const cleanAcc = (accountNumber || '').toString().trim();
  if (!/^\d{9,18}$/.test(cleanAcc)) {
    throw new Error('Account number must be between 9 and 18 digits');
  }

  const cleanIfsc = (rawIfsc || '').toString().trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
    throw new Error('Invalid IFSC code format (e.g., SBIN0001234)');
  }

  if (!bankName || typeof bankName !== 'string' || bankName.trim().length < 2) {
    throw new Error('Bank name is required');
  }

  let cleanUpi = null;
  if (upiId && typeof upiId === 'string' && upiId.trim() !== '') {
    cleanUpi = upiId.trim().toLowerCase();
    if (!/^[\w.-]+@[\w.-]+$/.test(cleanUpi)) {
      throw new Error('Invalid UPI ID format (e.g., username@bank)');
    }
  }

  const entity = await Model.findById(userId);
  if (!entity) {
    throw new Error(`${modelName} not found`);
  }

  entity.bankDetails = {
    accountHolderName: accountHolderName.trim(),
    accountNumber: cleanAcc,
    ifscCode: cleanIfsc,
    bankName: bankName.trim(),
    branchName: branchName ? branchName.trim() : null,
    upiId: cleanUpi,
    updatedAt: new Date()
  };

  await entity.save();

  return {
    success: true,
    message: 'Banking details saved successfully',
    data: {
      accountHolderName: entity.bankDetails.accountHolderName,
      accountNumberMasked: maskAccountNumber(cleanAcc),
      bankName: entity.bankDetails.bankName,
      branchName: entity.bankDetails.branchName,
      ifscCode: entity.bankDetails.ifscCode,
      ifsc: entity.bankDetails.ifscCode,
      upiId: entity.bankDetails.upiId
    }
  };
};

/**
 * Create Withdrawal Request with Atomic Balance Reservation
 */
const createWithdrawalRequest = async (userIdOrObj, rawRole, amountINR, clientNotes) => {
  let userId, rawRoleToUse, numINR, notes;
  if (typeof userIdOrObj === 'object' && userIdOrObj !== null && !userIdOrObj._bsontype) {
    userId = userIdOrObj.requesterId || userIdOrObj.userId;
    rawRoleToUse = userIdOrObj.requesterRole || userIdOrObj.role;
    numINR = Number(userIdOrObj.amountINR ?? userIdOrObj.amount);
    notes = userIdOrObj.notes ?? userIdOrObj.clientNotes;
  } else {
    userId = userIdOrObj;
    rawRoleToUse = rawRole;
    numINR = Number(amountINR);
    notes = clientNotes;
  }
  const { modelName, roleKey, Model } = resolveRoleInfo(rawRoleToUse);

  if (isNaN(numINR) || numINR <= 0) {
    throw new Error('Please enter a valid withdrawal amount');
  }

  const amountPaise = Math.round(numINR * 100);
  const minConfig = await getGlobalMinimumWithdrawal();

  // 1. Minimum amount validation
  if (amountPaise < minConfig.minWithdrawalAmountPaise) {
    throw new Error(`Minimum withdrawal amount is ₹${minConfig.minWithdrawalAmountINR}. Please enter ₹${minConfig.minWithdrawalAmountINR} or more to continue.`);
  }

  // 2. Fetch entity and verify banking details exist
  const entity = await Model.findById(userId);
  if (!entity) {
    throw new Error(`${modelName} account not found`);
  }
  if (!entity.isActive) {
    throw new Error('Account is deactivated or restricted. Cannot process withdrawal.');
  }

  const b = entity.bankDetails;
  if (!b || !b.accountNumber || !b.ifscCode || !b.accountHolderName) {
    throw new Error('Please add your banking details before requesting a withdrawal.');
  }

  // Determine workerType if role is Worker
  const workerType = modelName === 'Worker' ? (entity.workerType || 'WORKER') : null;

  // 3. Atomically Reserve Balance
  // We use findOneAndUpdate with balance check condition to prevent concurrent race conditions
  let updatedEntity = null;

  if (modelName === 'Vendor') {
    updatedEntity = await Vendor.findOneAndUpdate(
      { _id: userId, isActive: true, 'wallet.earnings': { $gte: numINR } },
      {
        $inc: {
          'wallet.earnings': -numINR,
          'wallet.reservedWithdrawal': numINR
        }
      },
      { new: true }
    );
  } else if (modelName === 'User') {
    const walletDoc = await Wallet.findOne({ userId, userModel: 'User' });
    const currentBal = Math.max(Number(walletDoc?.balance || 0), Number(entity.wallet?.balance || 0));
    if (currentBal >= numINR && entity.wallet?.balance !== currentBal) {
      await User.findByIdAndUpdate(userId, { 'wallet.balance': currentBal });
    }

    updatedEntity = await User.findOneAndUpdate(
      { _id: userId, isActive: true, 'wallet.balance': { $gte: numINR } },
      {
        $inc: {
          'wallet.balance': -numINR,
          'wallet.reservedWithdrawal': numINR
        }
      },
      { new: true }
    );
  } else if (modelName === 'Worker') {
    const walletDoc = await Wallet.findOne({ userId, userModel: 'Worker' });
    const currentBal = Math.max(Number(walletDoc?.balance || 0), Number(entity.wallet?.balance || 0));
    if (currentBal >= numINR && entity.wallet?.balance !== currentBal) {
      await Worker.findByIdAndUpdate(userId, { 'wallet.balance': currentBal });
    }

    updatedEntity = await Worker.findOneAndUpdate(
      { _id: userId, isActive: true, 'wallet.balance': { $gte: numINR } },
      {
        $inc: {
          'wallet.balance': -numINR,
          'wallet.reservedWithdrawal': numINR
        }
      },
      { new: true }
    );
  }

  if (!updatedEntity) {
    throw new Error('Insufficient withdrawable balance or another withdrawal request is currently in progress.');
  }

  // Sync Wallet collection atomically (in INR)
  try {
    await Wallet.findOneAndUpdate(
      { userId, userModel: modelName },
      {
        $inc: {
          balance: -numINR,
          reservedBalance: numINR
        }
      },
      { upsert: false }
    );
  } catch (wErr) {
    console.warn('[Withdrawal] Wallet sync warning (non-fatal):', wErr.message);
  }

  // 4. Create immutable snapshot of bank details
  const bankDetailsSnapshot = {
    accountHolderName: b.accountHolderName,
    accountNumber: b.accountNumber,
    accountNumberMasked: maskAccountNumber(b.accountNumber),
    ifscCode: b.ifscCode,
    bankName: b.bankName,
    branchName: b.branchName || null,
    upiId: b.upiId || null
  };

  // 5. Create Withdrawal record
  const withdrawal = await Withdrawal.create({
    requesterId: userId,
    requesterModel: modelName,
    requesterRole: roleKey,
    workerType,
    vendorId: modelName === 'Vendor' ? userId : null,
    amount: numINR,
    amountPaise,
    currency: 'INR',
    status: 'PENDING',
    bankDetailsSnapshot,
    bankDetails: {
      accountHolderName: b.accountHolderName,
      accountNumber: b.accountNumber,
      ifscCode: b.ifscCode,
      bankName: b.bankName,
      branchName: b.branchName || null,
      upiId: b.upiId || null
    },
    minimumLimitAtRequestPaise: minConfig.minWithdrawalAmountPaise,
    minimumLimitAtRequest: minConfig.minWithdrawalAmountINR,
    adminNotes: clientNotes || null,
    requestDate: new Date()
  });

  // 6. Record Pending Transaction in Ledger
  try {
    const txData = {
      type: 'withdrawal',
      amount: numINR,
      status: 'pending',
      paymentMethod: 'bank_transfer',
      description: `Withdrawal request #${withdrawal._id.toString().slice(-6).toUpperCase()} of ₹${numINR} submitted`,
      referenceId: withdrawal._id.toString(),
      metadata: {
        withdrawalId: withdrawal._id,
        role: roleKey,
        workerType,
        accountMasked: maskAccountNumber(b.accountNumber)
      }
    };
    if (modelName === 'User') txData.userId = userId;
    if (modelName === 'Vendor') txData.vendorId = userId;
    if (modelName === 'Worker') txData.workerId = userId;

    await Transaction.create(txData);

    const walletDoc = await Wallet.findOne({ userId, userModel: modelName });
    if (walletDoc) {
      await WalletTransaction.create({
        walletId: walletDoc._id,
        type: 'debit',
        amount: numINR,
        reason: 'payout',
        description: `Withdrawal to Bank (${maskAccountNumber(b.accountNumber)})`,
        referenceId: withdrawal._id.toString(),
        idempotencyKey: `wd_req_${withdrawal._id.toString()}`,
        status: 'pending'
      });
    }
  } catch (txErr) {
    console.warn('[Withdrawal] Ledger entry warning:', txErr.message);
  }

  // 7. Notify Admins
  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    const Admin = require('../models/Admin');
    const admins = await Admin.find({ isActive: true }).select('_id');
    const requesterName = entity.businessName || entity.name || 'User';

    for (const admin of admins) {
      await createNotification({
        adminId: admin._id,
        type: 'withdrawal_request',
        title: '💸 New Withdrawal Request',
        message: `${requesterName} (${roleKey.toUpperCase()}) requested withdrawal of ₹${numINR}`,
        relatedId: withdrawal._id,
        relatedType: 'withdrawal',
        data: {
          withdrawalId: withdrawal._id,
          requesterId: userId,
          role: roleKey,
          amount: numINR
        },
        pushData: {
          type: 'admin_alert',
          link: '/admin/withdrawals'
        }
      });
    }
  } catch (nErr) {
    console.warn('[Withdrawal] Admin notification failed:', nErr.message);
  }

  return {
    success: true,
    message: 'Withdrawal request submitted successfully',
    data: {
      withdrawalId: withdrawal._id,
      amount: withdrawal.amount,
      status: withdrawal.status,
      requestDate: withdrawal.requestDate,
      bankAccountMasked: maskAccountNumber(b.accountNumber)
    }
  };
};

/**
 * Get Own Withdrawal History
 */
const getWithdrawalHistory = async (userId, rawRole, query = {}) => {
  const { page = 1, limit = 20, status } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = { requesterId: userId };
  if (status) {
    // Handle uppercase / lowercase status matching
    const upper = status.toUpperCase();
    const lower = status.toLowerCase();
    filter.status = { $in: [upper, lower] };
  }

  const [withdrawals, total] = await Promise.all([
    Withdrawal.find(filter)
      .sort({ requestDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Withdrawal.countDocuments(filter)
  ]);

  const sanitized = withdrawals.map(w => ({
    _id: w._id,
    amount: w.amount,
    currency: w.currency || 'INR',
    status: (w.status || 'PENDING').toUpperCase(),
    requestDate: w.requestDate || w.createdAt,
    completedAt: w.completedAt,
    rejectionReason: w.rejectionReason,
    paymentProof: w.status === 'COMPLETED' || w.status === 'approved' ? w.paymentProof : null,
    paymentReference: w.paymentReference || w.transactionReference,
    bankAccountMasked: w.bankDetailsSnapshot?.accountNumberMasked || maskAccountNumber(w.bankDetailsSnapshot?.accountNumber || w.bankDetails?.accountNumber),
    bankName: w.bankDetailsSnapshot?.bankName || w.bankDetails?.bankName
  }));

  return {
    success: true,
    data: sanitized,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  };
};

/**
 * Get Single Withdrawal Detail with IDOR protection
 */
const getWithdrawalDetail = async (withdrawalId, requesterId, requesterRole, isAdmin = false) => {
  const withdrawal = await Withdrawal.findById(withdrawalId).lean();
  if (!withdrawal) {
    throw new Error('Withdrawal request not found');
  }

  // If bankDetailsSnapshot is missing or incomplete, automatically pull from User/Vendor/Worker profile!
  let bankSnapshot = withdrawal.bankDetailsSnapshot || withdrawal.bankDetails;
  if (!bankSnapshot || !bankSnapshot.accountNumber) {
    try {
      const { Model } = resolveRoleInfo(withdrawal.requesterRole);
      const entity = await Model.findById(withdrawal.requesterId).select('bankDetails').lean();
      if (entity && entity.bankDetails && entity.bankDetails.accountNumber) {
        bankSnapshot = {
          accountHolderName: entity.bankDetails.accountHolderName,
          accountNumber: entity.bankDetails.accountNumber,
          accountNumberMasked: maskAccountNumber(entity.bankDetails.accountNumber),
          ifscCode: entity.bankDetails.ifscCode,
          ifsc: entity.bankDetails.ifscCode,
          bankName: entity.bankDetails.bankName,
          branchName: entity.bankDetails.branchName,
          upiId: entity.bankDetails.upiId
        };
        await Withdrawal.findByIdAndUpdate(withdrawalId, {
          bankDetailsSnapshot: bankSnapshot,
          bankDetails: bankSnapshot
        });
      }
    } catch (e) {
      console.warn('[Withdrawal] Failed to auto-populate missing bank snapshot:', e.message);
    }
  }

  // Authorization check
  if (!isAdmin && withdrawal.requesterId.toString() !== requesterId.toString()) {
    throw new Error('Unauthorized access to this withdrawal request');
  }

  // If requester is not admin, mask sensitive account number
  if (!isAdmin && bankSnapshot) {
    bankSnapshot.accountNumber = maskAccountNumber(bankSnapshot.accountNumber);
  }

  return {
    success: true,
    data: {
      ...withdrawal,
      bankDetailsSnapshot: bankSnapshot,
      bankDetails: bankSnapshot
    }
  };
};

/**
 * Admin Accept Withdrawal (PENDING -> ADMIN_ACCEPTED)
 */
const acceptWithdrawal = async (withdrawalId, adminId, adminNotes) => {
  const withdrawal = await Withdrawal.findOne({
    _id: withdrawalId,
    status: { $in: ['PENDING', 'pending'] }
  });

  if (!withdrawal) {
    throw new Error('Withdrawal request not found or not in PENDING state');
  }

  withdrawal.status = 'ADMIN_ACCEPTED';
  withdrawal.acceptedAt = new Date();
  withdrawal.acceptedBy = adminId;
  if (adminNotes) withdrawal.adminNotes = adminNotes;

  await withdrawal.save();

  return {
    success: true,
    message: 'Withdrawal accepted by admin for manual payout',
    data: withdrawal
  };
};

/**
 * Admin Mark Processing (ADMIN_ACCEPTED -> PROCESSING)
 */
const markProcessing = async (withdrawalId, adminId, adminNotes) => {
  const withdrawal = await Withdrawal.findOne({
    _id: withdrawalId,
    status: { $in: ['ADMIN_ACCEPTED', 'PENDING', 'pending'] }
  });

  if (!withdrawal) {
    throw new Error('Withdrawal request not found or cannot be marked as PROCESSING');
  }

  withdrawal.status = 'PROCESSING';
  withdrawal.processingAt = new Date();
  withdrawal.processingBy = adminId;
  if (adminNotes) withdrawal.adminNotes = adminNotes;

  await withdrawal.save();

  return {
    success: true,
    message: 'Withdrawal marked as processing',
    data: withdrawal
  };
};

/**
 * Admin Reject Withdrawal (PENDING / ADMIN_ACCEPTED / PROCESSING -> REJECTED)
 * Releases reserved balance back to user's available wallet atomically
 */
const rejectWithdrawal = async (withdrawalId, adminId, rejectionReason) => {
  if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length === 0) {
    throw new Error('Rejection reason is mandatory');
  }

  const withdrawal = await Withdrawal.findOne({
    _id: withdrawalId,
    status: { $in: ['PENDING', 'ADMIN_ACCEPTED', 'PROCESSING', 'pending'] }
  });

  if (!withdrawal) {
    throw new Error('Withdrawal request not found or cannot be rejected');
  }

  const { requesterId, requesterModel, amount, amountPaise } = withdrawal;
  const numINR = amount;

  // 1. Atomically restore balance
  const { Model } = resolveRoleInfo(withdrawal.requesterRole);

  if (requesterModel === 'Vendor') {
    await Vendor.findByIdAndUpdate(requesterId, {
      $inc: {
        'wallet.earnings': numINR,
        'wallet.reservedWithdrawal': -numINR
      }
    });
  } else {
    // User or Worker
    await Model.findByIdAndUpdate(requesterId, {
      $inc: {
        'wallet.balance': numINR,
        'wallet.reservedWithdrawal': -numINR
      }
    });
  }

  // Sync Wallet collection atomically (in INR)
  try {
    await Wallet.findOneAndUpdate(
      { userId: requesterId, userModel: requesterModel },
      {
        $inc: {
          balance: numINR,
          reservedBalance: -numINR
        }
      }
    );
  } catch (wErr) {
    console.warn('[Withdrawal] Wallet release sync warning:', wErr.message);
  }

  // 2. Update Withdrawal record
  withdrawal.status = 'REJECTED';
  withdrawal.rejectedAt = new Date();
  withdrawal.rejectedBy = adminId;
  withdrawal.rejectionReason = rejectionReason.trim();

  await withdrawal.save();

  // 3. Update Transaction / WalletTransaction status to rejected / reversed
  try {
    await Transaction.updateMany(
      { referenceId: withdrawal._id.toString(), type: 'withdrawal' },
      { $set: { status: 'cancelled', description: `Withdrawal rejected: ${rejectionReason.trim()}` } }
    );

    const walletDoc = await Wallet.findOne({ userId: requesterId, userModel: requesterModel });
    if (walletDoc) {
      await WalletTransaction.updateMany(
        { referenceId: withdrawal._id.toString(), reason: 'payout' },
        { $set: { status: 'reversed' } }
      );
    }
  } catch (tErr) {
    console.warn('[Withdrawal] Reversal transaction log warning:', tErr.message);
  }

  // 4. Notify Requester
  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    const notifPayload = {
      type: 'withdrawal_rejected',
      title: '❌ Withdrawal Request Rejected',
      message: `Your withdrawal request of ₹${numINR} was rejected. Reason: ${rejectionReason.trim()}. Balance has been restored.`,
      relatedId: withdrawal._id,
      relatedType: 'withdrawal',
      data: {
        withdrawalId: withdrawal._id,
        amount: numINR,
        reason: rejectionReason.trim()
      }
    };
    if (requesterModel === 'User') notifPayload.userId = requesterId;
    if (requesterModel === 'Vendor') notifPayload.vendorId = requesterId;
    if (requesterModel === 'Worker') notifPayload.workerId = requesterId;

    await createNotification(notifPayload);
  } catch (nErr) {
    console.warn('[Withdrawal] Requester rejection notification warning:', nErr.message);
  }

  return {
    success: true,
    message: 'Withdrawal rejected and balance restored to requester',
    data: withdrawal
  };
};

/**
 * Admin Complete Withdrawal (ADMIN_ACCEPTED / PROCESSING -> COMPLETED)
 * Requires payment proof and finalizes wallet reservation
 */
const completeWithdrawal = async (withdrawalId, adminId, payload) => {
  const { paymentProofUrl, paymentProofPublicId, paymentProofMimeType, paymentReference, adminNotes } = payload;

  if (!paymentProofUrl || typeof paymentProofUrl !== 'string' || paymentProofUrl.trim().length === 0) {
    throw new Error('Payment proof is mandatory to complete a withdrawal');
  }

  const withdrawal = await Withdrawal.findOne({
    _id: withdrawalId,
    status: { $in: ['ADMIN_ACCEPTED', 'PROCESSING', 'PENDING', 'pending', 'approved'] }
  });

  if (!withdrawal) {
    throw new Error('Withdrawal request not found or not in an acceptable state for completion');
  }

  const { requesterId, requesterModel, amount, amountPaise } = withdrawal;
  const numINR = amount;

  const rawRole = (withdrawal.requesterRole || '').toLowerCase().trim();
  const effectiveRole = rawRole ||
    (withdrawal.requesterModel === 'Vendor' || withdrawal.vendorId ? 'vendor' :
     withdrawal.requesterModel === 'Worker' ? 'worker' : 'user');
  const reqModel = withdrawal.requesterModel || (effectiveRole === 'vendor' ? 'Vendor' : effectiveRole === 'worker' ? 'Worker' : 'User');
  const reqId = requesterId || withdrawal.vendorId;

  // 1. Finalize wallet reservation
  try {
    const { Model } = resolveRoleInfo(effectiveRole);

    if (reqId) {
      if (reqModel === 'Vendor') {
        await Vendor.findByIdAndUpdate(reqId, {
          $inc: {
            'wallet.reservedWithdrawal': -numINR,
            'wallet.totalWithdrawn': numINR
          }
        });
      } else if (Model) {
        await Model.findByIdAndUpdate(reqId, {
          $inc: {
            'wallet.reservedWithdrawal': -numINR,
            'wallet.totalWithdrawn': numINR
          }
        });
      }

      // Finalize Wallet collection reservation (in INR)
      await Wallet.findOneAndUpdate(
        { userId: reqId },
        {
          $inc: {
            reservedBalance: -numINR
          }
        }
      );
    }
  } catch (wErr) {
    console.warn('[Withdrawal] Wallet finalization warning:', wErr.message);
  }

  // 2. Mark Withdrawal COMPLETED
  withdrawal.status = 'COMPLETED';
  withdrawal.completedAt = new Date();
  withdrawal.completedBy = adminId;
  withdrawal.processedDate = new Date();
  withdrawal.processedBy = adminId;
  withdrawal.paymentProof = paymentProofUrl.trim();
  withdrawal.paymentProofPublicId = paymentProofPublicId || null;
  withdrawal.paymentProofMimeType = paymentProofMimeType || null;
  withdrawal.paymentReference = paymentReference ? paymentReference.trim() : null;
  withdrawal.transactionReference = paymentReference ? paymentReference.trim() : null;
  if (adminNotes) withdrawal.adminNotes = adminNotes;

  await withdrawal.save();

  // 3. Mark Transactions completed
  try {
    await Transaction.updateMany(
      { referenceId: withdrawal._id.toString(), type: 'withdrawal' },
      {
        $set: {
          status: 'completed',
          referenceId: paymentReference ? paymentReference.trim() : withdrawal._id.toString(),
          description: `Withdrawal payout completed. Ref: ${paymentReference || 'N/A'}`
        }
      }
    );

    if (reqId) {
      await WalletTransaction.updateMany(
        { referenceId: withdrawal._id.toString(), reason: 'payout' },
        {
          $set: {
            status: 'completed',
            gatewayTransactionId: paymentReference || null
          }
        }
      );
    }
  } catch (tErr) {
    console.warn('[Withdrawal] Transaction completion log warning:', tErr.message);
  }

  // 4. Notify Requester
  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    const notifPayload = {
      type: 'withdrawal_completed',
      title: '✅ Withdrawal Successful!',
      message: `Your withdrawal of ₹${numINR} has been completed. Ref: ${paymentReference || 'Manual Bank Transfer'}.`,
      relatedId: withdrawal._id,
      relatedType: 'withdrawal',
      data: {
        withdrawalId: withdrawal._id,
        amount: numINR,
        paymentReference: paymentReference || null,
        proofUrl: paymentProofUrl.length > 500 ? 'Receipt attached' : paymentProofUrl
      }
    };
    if (reqModel === 'User') notifPayload.userId = reqId;
    if (reqModel === 'Vendor') notifPayload.vendorId = reqId;
    if (reqModel === 'Worker') notifPayload.workerId = reqId;

    await createNotification(notifPayload);
  } catch (nErr) {
    console.warn('[Withdrawal] Completion notification warning:', nErr.message);
  }

  return {
    success: true,
    message: 'Withdrawal marked as COMPLETED and payment proof saved',
    data: withdrawal
  };
};

/**
 * Admin List All Withdrawals with Filtering and Pagination
 */
const getAdminWithdrawals = async (query = {}) => {
  const {
    page = 1,
    limit = 20,
    status,
    role,
    workerType,
    search,
    dateFrom,
    dateTo
  } = query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const filter = {};

  if (status && status !== 'all') {
    const upper = status.toUpperCase();
    const lower = status.toLowerCase();
    filter.status = { $in: [upper, lower] };
  }

  if (role && role !== 'all') {
    const r = role.toLowerCase().trim();
    if (r === 'farmer' || r === 'user') {
      filter.requesterModel = 'User';
    } else if (r === 'vendor') {
      filter.requesterModel = 'Vendor';
    } else if (r === 'worker') {
      filter.requesterModel = 'Worker';
    }
  }

  if (workerType && workerType !== 'all') {
    filter.workerType = workerType.toUpperCase();
  }

  if (dateFrom || dateTo) {
    filter.requestDate = {};
    if (dateFrom) filter.requestDate.$gte = new Date(dateFrom);
    if (dateTo) filter.requestDate.$lte = new Date(dateTo);
  }

  const [withdrawals, total] = await Promise.all([
    Withdrawal.find(filter)
      .populate('requesterId', 'name businessName phone email workerType')
      .populate('vendorId', 'name businessName phone email')
      .populate('acceptedBy', 'name email')
      .populate('completedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ requestDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Withdrawal.countDocuments(filter)
  ]);

  // Format response for admin
  const formatted = withdrawals.map(w => {
    const entity = w.requesterId || w.vendorId || {};
    return {
      _id: w._id,
      amount: w.amount,
      amountPaise: w.amountPaise,
      currency: w.currency || 'INR',
      status: (w.status || 'PENDING').toUpperCase(),
      requesterRole: w.requesterRole || (w.vendorId ? 'vendor' : 'user'),
      requesterModel: w.requesterModel || (w.vendorId ? 'Vendor' : 'User'),
      workerType: w.workerType || entity.workerType || null,
      requester: {
        _id: entity._id,
        name: entity.name || entity.businessName || 'Unknown',
        businessName: entity.businessName || '',
        phone: entity.phone || '',
        email: entity.email || ''
      },
      bankDetailsSnapshot: w.bankDetailsSnapshot || w.bankDetails || {},
      bankDetails: w.bankDetailsSnapshot || w.bankDetails || {},
      bankAccountMasked: w.bankDetailsSnapshot?.accountNumberMasked || maskAccountNumber(w.bankDetailsSnapshot?.accountNumber || w.bankDetails?.accountNumber),
      requestDate: w.requestDate || w.createdAt,
      acceptedAt: w.acceptedAt,
      acceptedBy: w.acceptedBy,
      processingAt: w.processingAt,
      completedAt: w.completedAt,
      completedBy: w.completedBy,
      rejectedAt: w.rejectedAt,
      rejectedBy: w.rejectedBy,
      rejectionReason: w.rejectionReason,
      paymentProof: w.paymentProof,
      paymentReference: w.paymentReference || w.transactionReference,
      adminNotes: w.adminNotes,
      minimumLimitAtRequest: w.minimumLimitAtRequest || Math.round((w.minimumLimitAtRequestPaise || 30000) / 100)
    };
  });

  return {
    success: true,
    data: formatted,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  };
};

module.exports = {
  maskAccountNumber,
  getGlobalMinimumWithdrawal,
  updateGlobalMinimumWithdrawal,
  getWithdrawableBalance,
  getBankDetails,
  updateBankDetails,
  createWithdrawalRequest,
  getWithdrawalHistory,
  getWithdrawalDetail,
  acceptWithdrawal,
  markProcessing,
  rejectWithdrawal,
  completeWithdrawal,
  getAdminWithdrawals
};
