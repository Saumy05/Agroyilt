const AdminPayroll = require('../../models/AdminPayroll');
const Admin = require('../../models/Admin');
const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');
const AdminAuditLog = require('../../models/AdminAuditLog');
const { getActorInfo, getAuditContext } = require('../../utils/adminScopeHelper');
const { calculateAdminCombinedIncentives } = require('../../utils/adminIncentiveHelper');

// ────────────────────────────────────────────────────────────────────────────
// Helper: Get human-readable territory display
// ────────────────────────────────────────────────────────────────────────────
const getAdminTerritoryDisplay = (admin) => {
  if (!admin) return 'Global';
  if (admin.role === 'super_admin' || admin.scopeType === 'GLOBAL') return 'Global Access';
  if (admin.scopeType === 'SUB_DISTRICT') {
    return [admin.subDistrictName, admin.districtName, admin.cityName].filter(Boolean).join(', ') || 'Sub-District';
  }
  if (admin.scopeType === 'DISTRICT') {
    return [admin.districtName, admin.cityName].filter(Boolean).join(', ') || 'District';
  }
  if (admin.scopeType === 'CITY') {
    return admin.cityName || 'City Level';
  }
  return 'Territory Scoped';
};

// ────────────────────────────────────────────────────────────────────────────
// POST /api/admin/payroll/generate
// Super Admin generates monthly payroll for all eligible admins or a specific admin
// Idempotent: Does not duplicate existing records, preserves locked historical calculations.
// ────────────────────────────────────────────────────────────────────────────
const generateMonthlyPayroll = async (req, res) => {
  try {
    const { month: reqMonth, year: reqYear, adminId } = req.body;

    const now = new Date();
    const month = reqMonth ? Number(reqMonth) : (now.getMonth() + 1);
    const year = reqYear ? Number(reqYear) : now.getFullYear();

    if (month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: 'Invalid month (must be 1 - 12)' });
    }
    if (year < 2020 || year > 2100) {
      return res.status(400).json({ success: false, message: 'Invalid year' });
    }

    const payrollMonth = `${year}-${String(month).padStart(2, '0')}`;
    const cycleStartDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const cycleEndDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Find eligible admins
    const adminQuery = { isActive: true };
    if (adminId) {
      adminQuery._id = adminId;
    } else {
      // Exclude primary super admin if they don't have base salary and no registrations, or include all field admins
      adminQuery.role = { $in: ['admin', 'super_admin'] };
    }

    const eligibleAdmins = await Admin.find(adminQuery).lean();

    if (!eligibleAdmins || eligibleAdmins.length === 0) {
      return res.status(404).json({ success: false, message: 'No eligible administrators found for payroll generation' });
    }

    const results = [];
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const adm of eligibleAdmins) {
      // Check existing payroll for this admin and month
      const existing = await AdminPayroll.findOne({ adminId: adm._id, payrollMonth });

      // If already paid or locked, do not mutate financial calculation
      if (existing && (existing.isLocked || existing.status === 'PAID')) {
        results.push(existing);
        skippedCount++;
        continue;
      }

      // Snapshot salary configuration
      const baseSalary = Number(adm.salary?.baseSalary) >= 0 ? Number(adm.salary.baseSalary) : 0;
      const farmerIncentiveRate = Number(adm.salary?.farmerIncentive) >= 0 ? Number(adm.salary.farmerIncentive) : 0;
      const vendorIncentiveRate = Number(adm.salary?.vendorIncentive) >= 0 ? Number(adm.salary.vendorIncentive) : 0;
      const workerIncentiveRate = Number(adm.salary?.workerIncentive) >= 0 ? Number(adm.salary.workerIncentive) : 0;
      const minRegistrationsThreshold = Number(adm.salary?.minRegistrationsForIncentive) >= 0 ? Number(adm.salary.minRegistrationsForIncentive) : 0;

      const salaryConfigSnapshot = {
        baseSalary,
        payFrequency: adm.salary?.payFrequency || 'monthly',
        farmerIncentiveRate,
        vendorIncentiveRate,
        workerIncentiveRate,
        minRegistrationsForIncentive: minRegistrationsThreshold,
        effectiveFrom: adm.salary?.effectiveFrom || adm.createdAt,
        bankDetails: adm.salary?.bankDetails || {}
      };

      // Authoritative, scope-aware incentive calculation across combined registrations
      const calcResult = await calculateAdminCombinedIncentives(adm, {
        startDate: cycleStartDate,
        endDate: cycleEndDate,
        persist: true,
        payrollMonth
      });

      const farmerCount = calcResult.counts.farmers;
      const vendorCount = calcResult.counts.vendors;
      const workerCount = calcResult.counts.workers;
      const totalRegistrationsCount = calcResult.totalCombinedRegistrations;
      const qualifyingRegistrationsCount = calcResult.qualifyingRegistrationsCount;

      const farmerIncentives = calcResult.incentives.farmerIncentivesEarned;
      const vendorIncentives = calcResult.incentives.vendorIncentivesEarned;
      const workerIncentives = calcResult.incentives.workerIncentivesEarned;
      const totalIncentives = calcResult.incentives.totalIncentivesEarned;

      // Itemized incentive items for full traceability & audit
      const incentiveItems = calcResult.items
        .filter(item => item.matchesCycle)
        .map(item => ({
          sourceType: item.registeredUserRole === 'FARMER'
            ? 'FARMER_REGISTRATION'
            : item.registeredUserRole === 'VENDOR'
              ? 'VENDOR_REGISTRATION'
              : 'WORKER_REGISTRATION',
          sourceId: item.registeredUserId,
          sourceName: item.registeredUserName,
          sourcePhone: item.registeredUserPhone,
          rate: item.rate,
          quantity: 1,
          amount: item.incentiveAmount,
          isThresholdLocked: item.isThresholdLocked,
          registeredAt: item.registeredAt
        }));

      // Keep existing bonuses or deductions if updating a draft/pending record
      const bonus = existing ? (existing.bonus || 0) : 0;
      const deductions = existing ? (existing.deductions || 0) : 0;
      const adjustments = existing ? (existing.adjustments || []) : [];
      const grossPayable = baseSalary + totalIncentives + bonus;
      const netPayable = Math.max(0, grossPayable - deductions);
      const paidAmount = existing ? (existing.paidAmount || 0) : 0;
      const remainingAmount = Math.max(0, netPayable - paidAmount);

      const payrollData = {
        adminId: adm._id,
        adminName: adm.name,
        adminEmail: adm.email,
        adminScopeType: adm.scopeType || 'GLOBAL',
        adminTerritory: getAdminTerritoryDisplay(adm),
        payrollMonth,
        year,
        month,
        cycleStartDate,
        cycleEndDate,
        salaryConfigSnapshot,
        baseSalary,
        farmerCount,
        farmerIncentives,
        vendorCount,
        vendorIncentives,
        workerCount,
        workerIncentives,
        totalIncentives,
        minRegistrationsThreshold,
        totalRegistrationsCount,
        qualifyingRegistrationsCount,
        incentiveItems,
        bonus,
        deductions,
        adjustments,
        grossPayable,
        netPayable,
        paidAmount,
        remainingAmount,
        status: existing ? existing.status : 'PENDING_REVIEW',
        isLocked: false,
        generatedBy: req.user._id,
        generatedByName: req.user.name,
        calculatedAt: new Date()
      };

      if (existing) {
        Object.assign(existing, payrollData);
        await existing.save();
        results.push(existing);
        updatedCount++;
      } else {
        const created = await AdminPayroll.create(payrollData);
        results.push(created);
        createdCount++;
      }
    }

    // Write audit log
    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'PAYROLL_GENERATED',
      module: 'PAYROLL',
      targetId: req.user._id,
      targetModel: 'AdminPayroll',
      targetName: `Payroll ${payrollMonth}`,
      description: `Generated payroll for ${payrollMonth}: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped (locked/paid).`,
      metadata: { payrollMonth, year, month, createdCount, updatedCount, skippedCount }
    });

    res.status(200).json({
      success: true,
      message: `Payroll for ${payrollMonth} generated successfully`,
      data: {
        payrollMonth,
        createdCount,
        updatedCount,
        skippedCount,
        totalProcessed: results.length,
        payrolls: results
      }
    });
  } catch (error) {
    console.error('Generate payroll error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate payroll', error: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/payroll
// Super Admin fetches monthly payroll records with filtering, searching, and KPI summary
// ────────────────────────────────────────────────────────────────────────────
const getPayrolls = async (req, res) => {
  try {
    const {
      month,
      year,
      payrollMonth,
      status,
      adminId,
      scopeType,
      search,
      page = 1,
      limit = 25
    } = req.query;

    const query = {};

    if (payrollMonth) {
      query.payrollMonth = payrollMonth;
    } else {
      if (year) query.year = Number(year);
      if (month) query.month = Number(month);
    }

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (adminId) {
      query.adminId = adminId;
    }

    if (scopeType && scopeType !== 'ALL') {
      query.adminScopeType = scopeType;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { adminName: regex },
        { adminEmail: regex },
        { 'payments.transactionReference': regex }
      ];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [payrolls, totalCount, allMonthlyRecords] = await Promise.all([
      AdminPayroll.find(query)
        .sort({ netPayable: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AdminPayroll.countDocuments(query),
      // Summary stats computed across all matching records (not just current page)
      AdminPayroll.find(query).select('netPayable totalIncentives paidAmount remainingAmount status').lean()
    ]);

    // KPI Summary
    let totalLiability = 0;
    let totalIncentives = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let paidCount = 0;
    let partiallyPaidCount = 0;
    let pendingCount = 0;
    let approvedCount = 0;

    allMonthlyRecords.forEach(r => {
      totalLiability += (r.netPayable || 0);
      totalIncentives += (r.totalIncentives || 0);
      totalPaid += (r.paidAmount || 0);
      totalPending += (r.remainingAmount || 0);

      if (r.status === 'PAID') paidCount++;
      else if (r.status === 'PARTIALLY_PAID') partiallyPaidCount++;
      else if (r.status === 'APPROVED') approvedCount++;
      else pendingCount++;
    });

    res.status(200).json({
      success: true,
      data: {
        payrolls,
        summary: {
          totalAdmins: totalCount,
          totalLiability,
          totalIncentives,
          totalPaid,
          totalPending,
          paidCount,
          partiallyPaidCount,
          pendingCount,
          approvedCount
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Get payrolls error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payroll records' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/payroll/:id
// Super Admin or authorized Admin views complete payroll calculation & payment breakdown
// ────────────────────────────────────────────────────────────────────────────
const getPayrollById = async (req, res) => {
  try {
    const { id } = req.params;
    const payroll = await AdminPayroll.findById(id).lean();

    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }

    // Role check: field admins can only view their own payroll
    if (req.user.role !== 'super_admin' && String(payroll.adminId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view this payroll record' });
    }

    // Fetch associated Admin details for live status & contact info
    const adminDoc = await Admin.findById(payroll.adminId).select('name email phone profilePhoto salary').lean();

    res.status(200).json({
      success: true,
      data: {
        ...payroll,
        currentAdminProfile: adminDoc
      }
    });
  } catch (error) {
    console.error('Get payroll by id error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payroll details' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/payroll/:id/status
// Enforce strict state machine transitions:
// DRAFT -> PENDING_REVIEW -> APPROVED -> READY_FOR_PAYMENT
// ────────────────────────────────────────────────────────────────────────────
const updatePayrollStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const payroll = await AdminPayroll.findById(id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }

    const currentStatus = payroll.status;

    // Disallow arbitrary state manipulation
    const allowedTransitions = {
      'DRAFT': ['PENDING_REVIEW', 'CANCELLED'],
      'PENDING_REVIEW': ['APPROVED', 'CANCELLED', 'DRAFT'],
      'APPROVED': ['READY_FOR_PAYMENT', 'PENDING_REVIEW', 'CANCELLED'],
      'READY_FOR_PAYMENT': ['CANCELLED', 'APPROVED'],
      'PARTIALLY_PAID': ['CANCELLED'],
      'PAID': ['REVERSED'],
      'CANCELLED': ['PENDING_REVIEW'],
      'REVERSED': ['PENDING_REVIEW']
    };

    if (!allowedTransitions[currentStatus] || !allowedTransitions[currentStatus].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid state transition from "${currentStatus}" to "${status}"`
      });
    }

    payroll.status = status;
    if (notes) payroll.notes = notes;

    if (status === 'APPROVED') {
      payroll.approvedBy = req.user._id;
      payroll.approvedByName = req.user.name;
      payroll.approvedAt = new Date();
      payroll.isLocked = true; // Calculation is locked once approved
      payroll.lockedAt = new Date();
    }

    await payroll.save();

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'PAYROLL_STATUS_CHANGED',
      module: 'PAYROLL',
      targetId: payroll._id,
      targetModel: 'AdminPayroll',
      targetName: `${payroll.adminName} - ${payroll.payrollMonth}`,
      description: `Changed payroll status for "${payroll.adminName}" (${payroll.payrollMonth}) from ${currentStatus} to ${status}`,
      metadata: { fromStatus: currentStatus, toStatus: status, notes }
    });

    res.status(200).json({
      success: true,
      message: `Payroll status updated to ${status}`,
      data: payroll
    });
  } catch (error) {
    console.error('Update payroll status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payroll status' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /api/admin/payroll/:id/adjustment
// Super Admin adds an approved bonus, deduction, or adjustment with mandatory reason
// ────────────────────────────────────────────────────────────────────────────
const addPayrollAdjustment = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, reason } = req.body;

    if (!type || !['BONUS', 'DEDUCTION', 'CORRECTION'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid adjustment type (BONUS, DEDUCTION, CORRECTION)' });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Adjustment amount must be a positive number' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Adjustment reason is required' });
    }

    const payroll = await AdminPayroll.findById(id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }

    if (payroll.status === 'PAID') {
      return res.status(400).json({ success: false, message: 'Cannot add adjustments to an already paid payroll. Use payment correction or reversal.' });
    }

    // Apply adjustment
    payroll.adjustments.push({
      type,
      amount: numAmount,
      reason: reason.trim(),
      addedBy: req.user._id,
      addedByName: req.user.name,
      addedAt: new Date()
    });

    if (type === 'BONUS') {
      payroll.bonus = (payroll.bonus || 0) + numAmount;
    } else if (type === 'DEDUCTION') {
      payroll.deductions = (payroll.deductions || 0) + numAmount;
    } else if (type === 'CORRECTION') {
      // General correction adjustment
      payroll.bonus = (payroll.bonus || 0) + numAmount;
    }

    payroll.grossPayable = payroll.baseSalary + payroll.totalIncentives + payroll.bonus;
    payroll.netPayable = Math.max(0, payroll.grossPayable - payroll.deductions);
    payroll.remainingAmount = Math.max(0, payroll.netPayable - payroll.paidAmount);

    await payroll.save();

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'SALARY_ADJUSTMENT_CREATED',
      module: 'PAYROLL',
      targetId: payroll._id,
      targetModel: 'AdminPayroll',
      targetName: `${payroll.adminName} - ${payroll.payrollMonth}`,
      description: `Added ${type} of ₹${numAmount} for "${payroll.adminName}": "${reason}"`,
      metadata: { type, amount: numAmount, reason, newNetPayable: payroll.netPayable }
    });

    res.status(200).json({
      success: true,
      message: 'Adjustment recorded successfully',
      data: payroll
    });
  } catch (error) {
    console.error('Add payroll adjustment error:', error);
    res.status(500).json({ success: false, message: 'Failed to record adjustment' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /api/admin/payroll/:id/payment
// Super Admin records an external manual payment (Bank transfer, UPI, Cash, Cheque)
// Validates payment amount, handles partial payments, stores UTR & proof, marks PAID
// ────────────────────────────────────────────────────────────────────────────
const recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      amount,
      paymentDate,
      paymentMethod,
      transactionReference,
      bankReference,
      chequeNumber,
      chequeBank,
      chequeDate,
      cashReceiverName,
      cashVoucherNumber,
      paymentProofUrl,
      paymentProofFileName,
      notes,
      adjustmentReason
    } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero' });
    }

    if (!paymentDate) {
      return res.status(400).json({ success: false, message: 'Payment date is required' });
    }

    const validMethods = ['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'OTHER'];
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Valid payment method is required (BANK_TRANSFER, UPI, CASH, CHEQUE, OTHER)' });
    }

    // Method-specific required fields
    if ((paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'UPI') && !transactionReference?.trim()) {
      return res.status(400).json({ success: false, message: `Transaction/UTR reference is required for ${paymentMethod}` });
    }

    if (paymentMethod === 'CHEQUE') {
      if (!chequeNumber?.trim()) return res.status(400).json({ success: false, message: 'Cheque number is required' });
      if (!chequeBank?.trim()) return res.status(400).json({ success: false, message: 'Cheque bank is required' });
    }

    if (!paymentProofUrl || !paymentProofUrl.trim()) {
      return res.status(400).json({ success: false, message: 'Payment proof screenshot/receipt is required' });
    }

    const payroll = await AdminPayroll.findById(id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }

    if (payroll.status === 'PAID' && payroll.remainingAmount <= 0) {
      return res.status(400).json({ success: false, message: 'This payroll is already fully paid. Use Reverse Payment if a correction is needed.' });
    }

    // Payment Amount Validation:
    // If entered payment amount differs from remaining payable amount, require explicit adjustment reason
    const remainingBeforePayment = payroll.remainingAmount;
    const isMismatched = numAmount !== remainingBeforePayment;

    if (isMismatched && (!adjustmentReason || !adjustmentReason.trim())) {
      return res.status(400).json({
        success: false,
        requiresReason: true,
        message: `Payment amount (₹${numAmount.toLocaleString()}) differs from the payable balance (₹${remainingBeforePayment.toLocaleString()}). Please confirm the adjustment reason.`
      });
    }

    const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const newPaymentRecord = {
      paymentId,
      amount: numAmount,
      paymentDate: new Date(paymentDate),
      paymentMethod,
      transactionReference: transactionReference?.trim() || '',
      bankReference: bankReference?.trim() || '',
      chequeNumber: chequeNumber?.trim() || '',
      chequeBank: chequeBank?.trim() || '',
      chequeDate: chequeDate ? new Date(chequeDate) : null,
      cashReceiverName: cashReceiverName?.trim() || '',
      cashVoucherNumber: cashVoucherNumber?.trim() || '',
      paymentProofUrl: paymentProofUrl.trim(),
      paymentProofFileName: paymentProofFileName || 'Payment_Proof',
      notes: notes?.trim() || '',
      adjustmentReason: adjustmentReason?.trim() || '',
      recordedBy: req.user._id,
      recordedByName: req.user.name,
      recordedAt: new Date(),
      status: 'SUCCESS'
    };

    payroll.payments.push(newPaymentRecord);
    payroll.paidAmount = (payroll.paidAmount || 0) + numAmount;
    payroll.remainingAmount = Math.max(0, payroll.netPayable - payroll.paidAmount);
    payroll.lastPaymentDate = new Date(paymentDate);
    payroll.isLocked = true; // Lock record upon recording payment

    // Determine final payment status
    if (payroll.remainingAmount <= 0) {
      payroll.status = 'PAID';
    } else {
      payroll.status = 'PARTIALLY_PAID';
    }

    await payroll.save();

    // Audit Log entry
    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: payroll.status === 'PAID' ? 'PAYMENT_MARKED_PAID' : 'PAYMENT_RECORDED',
      module: 'PAYROLL',
      targetId: payroll._id,
      targetModel: 'AdminPayroll',
      targetName: `${payroll.adminName} - ${payroll.payrollMonth}`,
      description: `Super Admin recorded payment of ₹${numAmount.toLocaleString()} via ${paymentMethod} (UTR: ${transactionReference || 'N/A'}). Status: ${payroll.status}`,
      metadata: {
        paymentId,
        amount: numAmount,
        paymentMethod,
        transactionReference,
        status: payroll.status,
        remainingAmount: payroll.remainingAmount,
        adjustmentReason: adjustmentReason || ''
      }
    });

    res.status(200).json({
      success: true,
      message: payroll.status === 'PAID' ? 'Salary marked as PAID successfully' : 'Partial payment recorded successfully',
      data: payroll
    });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to record payment', error: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /api/admin/payroll/:id/reverse-payment
// Super Admin reverses an existing payment with mandatory reason and full audit trail
// ────────────────────────────────────────────────────────────────────────────
const reversePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentId, reason } = req.body;

    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'Payment ID is required to reverse' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Mandatory reason is required for financial payment reversal' });
    }

    const payroll = await AdminPayroll.findById(id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }

    const payment = payroll.payments.find(p => p.paymentId === paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found on this payroll' });
    }

    if (payment.status === 'REVERSED') {
      return res.status(400).json({ success: false, message: 'This payment has already been reversed' });
    }

    // Mark payment reversed
    payment.status = 'REVERSED';
    payment.reversedAt = new Date();
    payment.reversedBy = req.user._id;
    payment.reversedByName = req.user.name;
    payment.reversalReason = reason.trim();

    // Adjust paid amount and remaining amount
    payroll.paidAmount = Math.max(0, (payroll.paidAmount || 0) - payment.amount);
    payroll.remainingAmount = Math.max(0, payroll.netPayable - payroll.paidAmount);

    if (payroll.paidAmount === 0) {
      payroll.status = 'APPROVED'; // Reverts to Approved/Ready for payment
    } else {
      payroll.status = 'PARTIALLY_PAID';
    }

    await payroll.save();

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'PAYMENT_REVERSED',
      module: 'PAYROLL',
      targetId: payroll._id,
      targetModel: 'AdminPayroll',
      targetName: `${payroll.adminName} - ${payroll.payrollMonth}`,
      description: `Reversed payment of ₹${payment.amount.toLocaleString()} for "${payroll.adminName}". Reason: "${reason.trim()}"`,
      metadata: {
        paymentId,
        reversedAmount: payment.amount,
        reversalReason: reason.trim(),
        newStatus: payroll.status,
        remainingAmount: payroll.remainingAmount
      }
    });

    res.status(200).json({
      success: true,
      message: 'Payment reversed successfully',
      data: payroll
    });
  } catch (error) {
    console.error('Reverse payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to reverse payment' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/payroll/my-history
// Field Admin fetches their own personal salary records, payslips, and payment status
// ────────────────────────────────────────────────────────────────────────────
const getMyPayrollHistory = async (req, res) => {
  try {
    const adminId = req.user._id;

    const payrolls = await AdminPayroll.find({ adminId })
      .sort({ year: -1, month: -1 })
      .lean();

    // Live current month compensation preview
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentPayrollMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    const currentRecord = payrolls.find(p => p.payrollMonth === currentPayrollMonth);

    // Current month registration attribution counts with per-admin threshold
    const cycleStartDate = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
    const cycleEndDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    const adminDoc = await Admin.findById(adminId).lean();
    const calcResult = await calculateAdminCombinedIncentives(adminDoc, {
      startDate: cycleStartDate,
      endDate: cycleEndDate,
      persist: false
    });

    const baseSalary = adminDoc?.salary?.baseSalary || 0;
    const farmerIncentiveRate = adminDoc?.salary?.farmerIncentive || 0;
    const vendorIncentiveRate = adminDoc?.salary?.vendorIncentive || 0;
    const workerIncentiveRate = adminDoc?.salary?.workerIncentive || 0;
    const minRegistrationsThreshold = calcResult.minRegistrationsThreshold;

    const currentTotalRegistrations = calcResult.totalCombinedRegistrations;
    const isThresholdMet = calcResult.isThresholdMet;
    const qualifyingCount = calcResult.qualifyingRegistrationsCount;
    const registrationsRemainingToUnlock = calcResult.registrationsRemainingToUnlock;
    const currentFarmers = calcResult.counts.farmers;
    const currentVendors = calcResult.counts.vendors;
    const currentWorkers = calcResult.counts.workers;
    const liveEarnedIncentives = calcResult.incentives.totalIncentivesEarned;
    const liveEstimatedTotal = baseSalary + liveEarnedIncentives;

    res.status(200).json({
      success: true,
      data: {
        payrolls,
        currentMonthSummary: {
          payrollMonth: currentPayrollMonth,
          monthName: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
          baseSalary,
          farmerIncentiveRate,
          vendorIncentiveRate,
          workerIncentiveRate,
          minRegistrationsThreshold,
          currentTotalRegistrations,
          isThresholdMet,
          qualifyingCount,
          registrationsRemainingToUnlock,
          currentFarmers,
          currentVendors,
          currentWorkers,
          liveEarnedIncentives,
          liveEstimatedTotal,
          payrollStatus: currentRecord ? currentRecord.status : 'PENDING_REVIEW',
          paidAmount: currentRecord ? currentRecord.paidAmount : 0,
          remainingAmount: currentRecord ? currentRecord.remainingAmount : liveEstimatedTotal,
          lastPayment: currentRecord?.payments?.filter(p => p.status === 'SUCCESS').slice(-1)[0] || null
        }
      }
    });
  } catch (error) {
    console.error('Get my payroll history error:', error);
    res.status(500).json({ success: false, message: 'Failed to load personal salary history' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/payroll/:id/proof/:paymentId
// Securely returns payment proof only to authorized Super Admins or the admin owner
// ────────────────────────────────────────────────────────────────────────────
const getPaymentProof = async (req, res) => {
  try {
    const { id, paymentId } = req.params;

    const payroll = await AdminPayroll.findById(id).lean();
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }

    // Authorization check
    const isSuper = req.user.role === 'super_admin';
    const isOwner = String(payroll.adminId) === String(req.user._id);

    if (!isSuper && !isOwner) {
      return res.status(403).json({ success: false, message: 'Access denied: You are not authorized to view this payment proof' });
    }

    const payment = payroll.payments.find(p => p.paymentId === paymentId);
    if (!payment || !payment.paymentProofUrl) {
      return res.status(404).json({ success: false, message: 'Payment proof not found' });
    }

    res.status(200).json({
      success: true,
      proofUrl: payment.paymentProofUrl,
      fileName: payment.paymentProofFileName || 'Payment_Proof',
      paymentMethod: payment.paymentMethod,
      amount: payment.amount,
      utr: payment.transactionReference
    });
  } catch (error) {
    console.error('Get payment proof error:', error);
    res.status(500).json({ success: false, message: 'Failed to access payment proof' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/payroll/export/csv
// Super Admin exports reconciliation statement as CSV
// ────────────────────────────────────────────────────────────────────────────
const exportPayrollReconciliation = async (req, res) => {
  try {
    const { month, year, status } = req.query;

    const query = {};
    if (year) query.year = Number(year);
    if (month) query.month = Number(month);
    if (status && status !== 'ALL') query.status = status;

    const records = await AdminPayroll.find(query).sort({ payrollMonth: -1, netPayable: -1 }).lean();

    const headers = [
      'Payroll Month',
      'Admin Name',
      'Admin Email',
      'Territory',
      'Base Salary (INR)',
      'Farmers Onboarded',
      'Farmer Incentives (INR)',
      'Vendors Onboarded',
      'Vendor Incentives (INR)',
      'Workers Onboarded',
      'Worker Incentives (INR)',
      'Total Incentives (INR)',
      'Bonus (INR)',
      'Deductions (INR)',
      'Net Payable (INR)',
      'Paid Amount (INR)',
      'Remaining Balance (INR)',
      'Payment Status',
      'Payment Date',
      'Payment Method',
      'UTR Reference',
      'Recorded By'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const csvRows = records.map(r => {
      const lastPayment = r.payments?.filter(p => p.status === 'SUCCESS').slice(-1)[0];
      return [
        escapeCsv(r.payrollMonth),
        escapeCsv(r.adminName),
        escapeCsv(r.adminEmail),
        escapeCsv(r.adminTerritory),
        r.baseSalary || 0,
        r.farmerCount || 0,
        r.farmerIncentives || 0,
        r.vendorCount || 0,
        r.vendorIncentives || 0,
        r.workerCount || 0,
        r.workerIncentives || 0,
        r.totalIncentives || 0,
        r.bonus || 0,
        r.deductions || 0,
        r.netPayable || 0,
        r.paidAmount || 0,
        r.remainingAmount || 0,
        escapeCsv(r.status),
        lastPayment?.paymentDate ? escapeCsv(new Date(lastPayment.paymentDate).toISOString().split('T')[0]) : '""',
        escapeCsv(lastPayment?.paymentMethod || 'N/A'),
        escapeCsv(lastPayment?.transactionReference || 'N/A'),
        escapeCsv(lastPayment?.recordedByName || 'N/A')
      ].join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');

    await AdminAuditLog.log({
      ...getActorInfo(req.user),
      ...getAuditContext(req),
      action: 'EXPORT_PAYROLL_RECONCILIATION',
      module: 'PAYROLL',
      targetId: req.user._id,
      targetModel: 'AdminPayroll',
      targetName: 'Payroll Reconciliation Export',
      description: `Super Admin exported payroll reconciliation statement (${records.length} records)`
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="agroyilt_payroll_reconciliation_${Date.now()}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Export payroll reconciliation error:', error);
    res.status(500).json({ success: false, message: 'Failed to export payroll reconciliation' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/payroll/admin-salary-list
// Super Admin gets all field admins with salary config, bank/UPI details,
// live current-month earned amounts, and latest payroll record status.
// This enables manual payment WITHOUT needing to generate payroll first.
// ────────────────────────────────────────────────────────────────────────────
const getAdminSalaryList = async (req, res) => {
  try {
    const { search } = req.query;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentPayrollMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const cycleStartDate = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
    const cycleEndDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    // Fetch all field admins (including super_admin if they have salary config)
    const adminQuery = { isActive: true, role: 'admin' };
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      adminQuery.$or = [{ name: regex }, { email: regex }, { cityName: regex }, { districtName: regex }];
    }

    const admins = await Admin.find(adminQuery)
      .select('name email role scopeType cityName districtName subDistrictName profilePhoto salary isActive lastLogin createdAt')
      .lean();

    // Fetch all current month payroll records for these admins in one query
    const adminIds = admins.map(a => a._id);
    const currentMonthPayrolls = await AdminPayroll.find({
      adminId: { $in: adminIds },
      payrollMonth: currentPayrollMonth
    }).lean();
    const payrollMap = {};
    currentMonthPayrolls.forEach(p => { payrollMap[String(p.adminId)] = p; });

    // Build enriched list with live earnings
    const list = await Promise.all(admins.map(async (adm) => {
      const baseSalary = Number(adm.salary?.baseSalary) || 0;
      const farmerRate = Number(adm.salary?.farmerIncentive) || 0;
      const vendorRate = Number(adm.salary?.vendorIncentive) || 0;
      const workerRate = Number(adm.salary?.workerIncentive) || 0;

      const calcResult = await calculateAdminCombinedIncentives(adm, {
        startDate: cycleStartDate,
        endDate: cycleEndDate,
        persist: false
      });

      const farmerCount = calcResult.counts.farmers;
      const vendorCount = calcResult.counts.vendors;
      const workerCount = calcResult.counts.workers;
      const farmerIncentives = calcResult.incentives.farmerIncentivesEarned;
      const vendorIncentives = calcResult.incentives.vendorIncentivesEarned;
      const workerIncentives = calcResult.incentives.workerIncentivesEarned;
      const totalIncentives = calcResult.incentives.totalIncentivesEarned;
      const liveEstimatedTotal = baseSalary + totalIncentives;

      const existingPayroll = payrollMap[String(adm._id)];

      return {
        _id: adm._id,
        name: adm.name,
        email: adm.email,
        profilePhoto: adm.profilePhoto,
        territory: getAdminTerritoryDisplay(adm),
        scopeType: adm.scopeType,
        isActive: adm.isActive,
        lastLogin: adm.lastLogin,
        createdAt: adm.createdAt,
        salary: {
          baseSalary,
          farmerIncentiveRate: farmerRate,
          vendorIncentiveRate: vendorRate,
          workerIncentiveRate: workerRate,
          minRegistrationsForIncentive: calcResult.minRegistrationsThreshold,
          status: adm.salary?.status || 'ACTIVE',
          bankDetails: adm.salary?.bankDetails || {}
        },
        currentMonth: {
          payrollMonth: currentPayrollMonth,
          minRegistrationsThreshold: calcResult.minRegistrationsThreshold,
          totalCombinedRegistrations: calcResult.totalCombinedRegistrations,
          qualifyingRegistrationsCount: calcResult.qualifyingRegistrationsCount,
          registrationsRemainingToUnlock: calcResult.registrationsRemainingToUnlock,
          isThresholdMet: calcResult.isThresholdMet,
          farmerCount,
          vendorCount,
          workerCount,
          farmerIncentives,
          vendorIncentives,
          workerIncentives,
          totalIncentives,
          liveEstimatedTotal
        },
        payrollRecord: existingPayroll ? {
          _id: existingPayroll._id,
          status: existingPayroll.status,
          netPayable: existingPayroll.netPayable,
          paidAmount: existingPayroll.paidAmount,
          remainingAmount: existingPayroll.remainingAmount,
          isLocked: existingPayroll.isLocked,
          payments: existingPayroll.payments || []
        } : null
      };
    }));

    res.status(200).json({
      success: true,
      data: {
        admins: list,
        currentPayrollMonth,
        totalAdmins: list.length
      }
    });
  } catch (error) {
    console.error('Get admin salary list error:', error);
    res.status(500).json({ success: false, message: 'Failed to load admin salary list' });
  }
};

module.exports = {
  generateMonthlyPayroll,
  getPayrolls,
  getPayrollById,
  updatePayrollStatus,
  addPayrollAdjustment,
  recordPayment,
  reversePayment,
  getMyPayrollHistory,
  getPaymentProof,
  exportPayrollReconciliation,
  getAdminSalaryList
};
