'use strict';

/**
 * Time extensions (HOURLY minutes / DAILY extra days) for confirmed worker bookings.
 *
 *   REQUESTED/WORKER_EVALUATION  → workers answer (atomic per worker, only while open and unexpired)
 *   PAYMENT_PENDING              → set of accepting workers is now FROZEN; the farmer pays exactly that amount
 *   CONFIRMED                    → applied to each assignment exactly once (appliedExtensionIds), money matched
 *
 * Money rules: the paid order amount must equal the frozen total; a payment that cannot be applied (extension
 * expired/cancelled, or a worker's assignment already settled/cancelled) is refunded to the wallet, never kept.
 */

const IndWorkerExtension = require('../models/IndWorkerExtension');
const IndWorkerAssignment = require('../models/IndWorkerAssignment');
const WorkerBookingRequest = require('../models/WorkerBookingRequest');
const ledger = require('./ledgerService');
const { getWorkerFinancialSettings } = require('./workerFinancialService');

const OPEN = ['REQUESTED', 'WORKER_EVALUATION'];
const toP = (inr) => Math.round(Number(inr) * 100);
const toINR = (p) => p / 100;
const STALE_CLAIM_MS = 2 * 60 * 1000;

const addMinutes = (hhmm, minutes) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  const total = Math.min(23 * 60 + 59, (h * 60 + (m || 0)) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const refundExtensionAmount = async ({ ext, amountPaise, paymentId, reason, key }) => {
  const amount = toINR(amountPaise);
  if (!(amount > 0)) return { refunded: false };
  const res = await ledger.applyOnce({
    ownerId: ext.farmerId, ownerModel: 'User', amount, key, reason: 'refund',
    referenceId: ext._id.toString(), gatewayTransactionId: paymentId || null
  });
  if (res.applied) {
    await ledger.recordPassbookOnce(key, {
      userId: ext.farmerId, type: 'refund', amount, status: 'completed', paymentMethod: 'wallet',
      description: `Refund for extension: ${reason}`, referenceId: ext._id.toString()
    });
  }
  return { refunded: res.applied || res.duplicate, amount };
};

/** Totals for the accepting workers (platform fee on top). Pure. */
const computeTotals = async (ext) => {
  const settings = await getWorkerFinancialSettings();
  const platformRate = Number(settings.workerPlatformChargePercentage) || 0;
  const accepted = ext.workerExtensions.filter(w => w.status === 'ACCEPTED');
  const servicePaise = accepted.reduce((sum, w) => sum + toP(w.extensionGrossAmount), 0);
  const platformPaise = Math.round((servicePaise * platformRate) / 100);
  return { acceptedCount: accepted.length, platformRate, servicePaise, platformPaise, totalPaise: servicePaise + platformPaise };
};

/**
 * Move an extension whose evaluation is over to PAYMENT_PENDING / REJECTED / EXPIRED (atomic, forward-only),
 * freezing totals. Cash extensions are applied right away. Returns the fresh document.
 */
const closeEvaluationIfDone = async (extensionId, { force = false } = {}) => {
  const ext = await IndWorkerExtension.findById(extensionId);
  if (!ext || !OPEN.includes(ext.status)) return ext;

  const pending = ext.workerExtensions.some(w => w.status === 'REQUESTED');
  const expired = new Date() > new Date(ext.expiresAt);
  if (pending && !expired && !force) return ext;

  // workers who never answered are EXPIRED (distinct from REJECTED, for the audit trail)
  if (pending) {
    await IndWorkerExtension.updateOne(
      { _id: ext._id, status: { $in: OPEN } },
      { $set: { 'workerExtensions.$[w].status': 'EXPIRED', 'workerExtensions.$[w].respondedAt': new Date() } },
      { arrayFilters: [{ 'w.status': 'REQUESTED' }] }
    );
  }
  const fresh = await IndWorkerExtension.findById(ext._id);
  const t = await computeTotals(fresh);
  const anyAccepted = t.acceptedCount > 0;

  const next = anyAccepted ? 'PAYMENT_PENDING' : (fresh.workerExtensions.some(w => w.status === 'EXPIRED') ? 'EXPIRED' : 'REJECTED');
  const moved = await IndWorkerExtension.findOneAndUpdate(
    { _id: ext._id, status: { $in: OPEN } },
    {
      $set: {
        status: next, isActive: anyAccepted, acceptedWorkerCount: t.acceptedCount,
        totalServiceAmount: toINR(t.servicePaise), platformFeeRate: t.platformRate, platformFeeAmount: toINR(t.platformPaise),
        totalPayable: toINR(t.totalPaise), totalPayableAmount: toINR(t.totalPaise), farmerTotalAmount: toINR(t.totalPaise)
      }
    },
    { new: true }
  );
  const result = moved || (await IndWorkerExtension.findById(ext._id));

  if (moved && anyAccepted && moved.paymentMode === 'cash') {
    await applyExtension(moved._id, { actor: 'system' });
    // cash: nothing to collect online — the extension is final once applied (commission is taken at settlement)
    await IndWorkerExtension.updateOne({ _id: moved._id, status: 'PAYMENT_PENDING' }, { $set: { status: 'CONFIRMED', isActive: false, paidAt: new Date() } });
    return IndWorkerExtension.findById(ext._id);
  }
  return result;
};

/**
 * Apply every accepted worker's extension to its assignment exactly once. Returns the workers whose assignment could
 * no longer be extended (settled / cancelled / completed / decreased) so the caller can refund their share.
 */
const applyExtension = async (extensionId, { actor = 'system' } = {}) => {
  const ext = await IndWorkerExtension.findById(extensionId);
  const isDaily = ext.bookingType === 'DAILY';
  const unapplied = [];
  let appliedAny = false;

  for (const w of ext.workerExtensions.filter(x => x.status === 'ACCEPTED')) {
    const g = Number(w.extensionGrossAmount) || 0;
    const c = Number(w.extensionCommissionAmount) || 0;
    const n = Number(w.extensionNetAmount) || 0;
    const round2 = (field, v) => ({ $round: [{ $add: [{ $ifNull: [`$${field}`, 0] }, v] }, 2] });

    const upd = await IndWorkerAssignment.findOneAndUpdate(
      {
        _id: w.assignmentId, assignmentStatus: 'CONFIRMED', settlementStatus: 'PENDING', completionStatus: 'PENDING',
        isDecreased: { $ne: true }, appliedExtensionIds: { $ne: ext._id }
      },
      [{
        $set: {
          grossAmount: round2('grossAmount', g), commissionAmount: round2('commissionAmount', c), netEarning: round2('netEarning', n),
          ...(isDaily ? { bookedDays: { $add: [{ $ifNull: ['$bookedDays', 1] }, Number(w.additionalDays || ext.additionalDays || 0)] } } : {}),
          appliedExtensionIds: { $concatArrays: [{ $ifNull: ['$appliedExtensionIds', []] }, [ext._id]] }
        }
      }],
      { new: true }
    );
    if (upd) {
      appliedAny = true;
      try {
        await require('../controllers/workerControllers/extensionController')._notifyExtensionApplied({ ext, worker: w, assignment: upd });
      } catch (_) { /* notification is best effort */ }
    } else {
      // already applied by an earlier (crashed / retried) run → fine; otherwise it genuinely cannot be applied
      const already = await IndWorkerAssignment.exists({ _id: w.assignmentId, appliedExtensionIds: ext._id });
      if (!already) unapplied.push(w);
    }
  }

  // keep the parent's schedule truthful so conflict checks see the extended time
  if (appliedAny) {
    const parent = await WorkerBookingRequest.findById(ext.parentRequestId);
    if (parent && !(parent.auditLog || []).some(a => a.event === 'extension_applied' && a.meta && String(a.meta.extensionId) === String(ext._id))) {
      const $set = {};
      if (isDaily) {
        const days = Number(ext.additionalDays) || 0;
        if (parent.endDate) { const e = new Date(parent.endDate); e.setDate(e.getDate() + days); $set.endDate = e; }
        $set.numberOfDays = (parent.numberOfDays || 0) + days;
      } else {
        const mins = Number(ext.extensionMinutes) || 0;
        if (parent.endTime) $set.endTime = addMinutes(parent.endTime, mins);
        $set.durationMinutes = (parent.durationMinutes || 0) + mins;
      }
      await WorkerBookingRequest.updateOne(
        { _id: parent._id },
        { $set, $push: { auditLog: { at: new Date(), actor, event: 'extension_applied', meta: { extensionId: ext._id } } } }
      );
    }
  }
  return { unapplied, appliedAny };
};

/**
 * Single-shot confirmation of a paid extension (client verify + webhook share it).
 * @returns {{ok: boolean, code?: number, reason?: string, already?: boolean, extension?: object, refunded?: boolean}}
 */
const confirmExtensionPayment = async ({ extensionId, farmerId = null, orderId, paymentId, actor = 'farmer' }) => {
  const base = { _id: extensionId };
  if (farmerId) base.farmerId = farmerId;
  let ext = await IndWorkerExtension.findOne(base);
  if (!ext) return { ok: false, code: 404, reason: 'Extension not found or order mismatch' };

  let order = (ext.paymentOrders || []).find(o => o.orderId === orderId);
  if (!order && ext.razorpayOrderId === orderId && ext.totalPayable) order = { orderId, amountPaise: toP(ext.totalPayable) };
  if (!order) return { ok: false, code: 404, reason: 'Extension not found or order mismatch' };

  if (ext.status === 'CONFIRMED' && ext.paymentStatus === 'success') {
    if (ext.razorpayPaymentId === paymentId) return { ok: true, already: true, extension: ext };
    const r = await refundExtensionAmount({ ext, amountPaise: order.amountPaise, paymentId, reason: 'extension was already paid', key: `late_ext_refund_${paymentId}` });
    return { ok: false, code: 409, reason: 'Extension already paid; this payment was refunded to your wallet.', refunded: r.refunded };
  }

  const expected = toP(ext.totalPayable || 0);
  if (order.amountPaise !== expected) {
    const r = await refundExtensionAmount({ ext, amountPaise: order.amountPaise, paymentId, reason: 'amount no longer matches the extension', key: `late_ext_refund_${paymentId}` });
    return { ok: false, code: 409, reason: 'The extension price changed. The amount was refunded to your wallet.', refunded: r.refunded };
  }

  const claimed = await IndWorkerExtension.findOneAndUpdate(
    {
      _id: ext._id, status: 'PAYMENT_PENDING', paymentMode: { $ne: 'cash' },
      $or: [
        { paymentStatus: { $in: ['not_started', 'pending', 'failed'] }, confirmClaimedAt: null },
        { paymentStatus: 'processing', confirmClaimedAt: { $lt: new Date(Date.now() - STALE_CLAIM_MS) } }
      ]
    },
    { $set: { paymentStatus: 'processing', confirmClaimedAt: new Date(), razorpayPaymentId: paymentId } },
    { new: true }
  );
  if (!claimed) {
    const cur = await IndWorkerExtension.findById(ext._id);
    if (cur && cur.paymentStatus === 'processing') return { ok: false, code: 409, reason: 'Extension payment is already being processed.' };
    const r = await refundExtensionAmount({ ext, amountPaise: order.amountPaise, paymentId, reason: `extension is ${cur ? cur.status : 'unavailable'}`, key: `late_ext_refund_${paymentId}` });
    return { ok: false, code: 409, reason: `This extension can no longer be paid (status: ${cur ? cur.status : 'missing'}). Your payment was refunded to your wallet.`, refunded: r.refunded };
  }

  try {
    const { unapplied } = await applyExtension(claimed._id, { actor });

    // a worker whose assignment finished/cancelled meanwhile cannot be extended: give back that share
    let refundPaise = 0;
    for (const w of unapplied) {
      const share = toP(w.extensionGrossAmount) + Math.round((toP(w.extensionGrossAmount) * (claimed.platformFeeRate || 0)) / 100);
      refundPaise += share;
    }
    if (refundPaise > 0) {
      await refundExtensionAmount({ ext: claimed, amountPaise: refundPaise, paymentId, reason: 'a worker could no longer be extended', key: `ext_unapplied_refund_${claimed._id}` });
    }

    const done = await IndWorkerExtension.findOneAndUpdate(
      { _id: claimed._id, paymentStatus: 'processing' },
      { $set: { paymentStatus: 'success', status: 'CONFIRMED', isActive: false, paidAt: new Date(), confirmClaimedAt: null } },
      { new: true }
    );

    await ledger.recordPassbookOnce(`ext_payment_${paymentId}`, {
      userId: claimed.farmerId, amount: order.amountPaise / 100, type: 'booking_payment', paymentMethod: 'razorpay', status: 'completed',
      description: 'Online payment for worker booking extension', referenceId: paymentId,
      metadata: { extensionId: claimed._id, razorpayOrderId: orderId, razorpayPaymentId: paymentId }
    });
    return { ok: true, extension: done || claimed };
  } catch (err) {
    console.error('[confirmExtensionPayment] failed — claim left for a safe retry:', err);
    return { ok: false, code: 500, reason: 'Extension confirmation failed; it will be retried.' };
  }
};

module.exports = { closeEvaluationIfDone, applyExtension, confirmExtensionPayment, computeTotals, refundExtensionAmount, OPEN, toP, toINR };
