'use strict';

/**
 * Single-shot confirmation of an independent-worker booking (online-paid or cash-on-service).
 *
 * Guarantees:
 *  - exactly one confirmation per request: an atomic findOneAndUpdate claim (paymentStatus -> 'processing')
 *    gates everything, so double taps / client+webhook races / cash+online mixes cannot create duplicates;
 *  - assignments carry a DETERMINISTIC idempotency key (parent+worker) backed by a unique index;
 *  - the amount actually charged (the order's amount) must equal the price snapshot it was created from;
 *  - selected workers are re-validated (active, unrestricted, not committed elsewhere) at confirm time;
 *  - any failure after the claim compensates: partial documents are removed, the claim is released and a
 *    captured online payment is refunded to the farmer's wallet (idempotently, once per gateway payment id).
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const WorkerBookingRequest = require('../models/WorkerBookingRequest');
const IndWorkerAssignment = require('../models/IndWorkerAssignment');
const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const ledger = require('./ledgerService');
const { issueOtp } = require('../utils/otpUtil');

const SELECTABLE = ['matching', 'awaiting_farmer_confirmation', 'pending'];
const STALE_CLAIM_MS = 2 * 60 * 1000;

const toP = (inr) => Math.round(Number(inr) * 100);
const toINR = (p) => p / 100;

const audit = (event, actor, actorId, meta) => ({ at: new Date(), actor, actorId: actorId || null, event, meta: meta || null });

const assignmentKey = (requestId, workerId) => `assign_${requestId}_${workerId}`;

// ── Refund of a captured payment that cannot be applied to a booking ─────────────────────────────
const refundCapturedPayment = async ({ request, paymentId, amountPaise, reason }) => {
  const key = `late_payment_refund_${paymentId}`;
  const amount = toINR(amountPaise);
  const res = await ledger.applyOnce({
    ownerId: request.farmerId, ownerModel: 'User', amount, key, reason: 'refund',
    referenceId: request._id.toString(), gatewayTransactionId: paymentId
  });
  if (res.applied) {
    await ledger.recordPassbookOnce(key, {
      userId: request.farmerId, type: 'refund', amount, status: 'completed', paymentMethod: 'wallet',
      description: `Refund of payment ${paymentId}: ${reason}`, referenceId: request._id.toString()
    });
  }
  return { refunded: res.applied || res.duplicate, amount };
};

// ── Worker validation at confirm time ────────────────────────────────────────────────────────────
const validateSelectedWorkers = async (request) => {
  // lazy: the conflict engine lives with the request controller
  const ctl = require('../controllers/workerControllers/farmerWorkerRequestController');
  const ids = (request.selectedWorkerIds || []).map(String);
  const workers = await Worker.find({ _id: { $in: ids } }).select('isActive isRestricted approvalStatus').lean();
  const byId = new Map(workers.map(w => [String(w._id), w]));
  const unavailable = [];

  for (const id of ids) {
    const w = byId.get(id);
    if (!w || w.isActive === false || w.isRestricted === true || ['rejected', 'suspended'].includes(w.approvalStatus)) {
      unavailable.push(id);
      continue;
    }
    const conflict = request.bookingType === 'DAILY'
      ? await ctl.hasDailyConflict(id, request.startDate, request.endDate, request._id, { committedOnly: true })
      : await ctl.hasTimeConflict(id, request.scheduledDate, request.startTime, request.endTime, request._id, { committedOnly: true });
    if (conflict) unavailable.push(id);
  }
  return unavailable;
};

// ── Document builders ────────────────────────────────────────────────────────────────────────────
const buildDocs = (request, { method, orderId, paymentId }) => {
  const isDaily = request.bookingType === 'DAILY';
  const isCash = method === 'cash';
  const snap = request.financialSnapshot || {};
  const commissionRate = snap.commissionRate ?? 10; // `?? 10` (not `|| 10`): an admin-configured 0% is honoured
  const rateUnit = isDaily ? 'daily' : (request.rateUnit || 'hourly');
  const assignmentDocs = [];
  const bookingDocs = [];

  [...new Set((request.selectedWorkerIds || []).map(String))].forEach((wId, idx) => {
    const offer = (request.workerOffers || []).find(o => String(o.workerId) === wId && o.status !== 'rejected' && o.status !== 'expired');
    const offeredRate = offer
      ? offer.offeredRate
      : (isDaily ? (request.minDailyRate || request.minRate || 0) : (request.minRate || 0));

    let grossPaise;
    let bookedDays = null;
    if (isDaily) {
      bookedDays = Number(request.numberOfDays) || 1;
      grossPaise = toP(offeredRate) * bookedDays;
    } else {
      grossPaise = Math.round(toP(offeredRate) * ((Number(request.durationMinutes) || 60) / 60));
    }
    const commissionPaise = Math.floor((grossPaise * commissionRate) / 100);
    const netPaise = grossPaise - commissionPaise;

    const visit = issueOtp();
    const a = {
      parentRequestId: request._id,
      bookingType: request.bookingType || 'HOURLY',
      farmerId: request.farmerId,
      workerId: wId,
      teamLeaderId: request.teamLeaderId || null,
      workerType: request.bookingMode === 'TEAM_LEADER' ? 'TEAM_MEMBER' : 'INDEPENDENT',
      agreedRate: offeredRate,
      rateUnit,
      creationIdempotencyKey: assignmentKey(request._id, wId),
      assignmentStatus: 'CONFIRMED',
      paymentMethod: isCash ? 'cash' : 'online',
      isCashBooking: isCash,
      journeyStatus: 'NOT_STARTED',
      visitOtpStatus: 'PENDING',
      workStatus: 'NOT_STARTED',
      completionStatus: 'PENDING',
      settlementStatus: 'PENDING',
      locationStatus: 'UNAVAILABLE',
      visitOtpCode: visit.code,
      visitOtpHash: visit.hash,
      visitOtpExpiresAt: visit.expiresAt,
      grossAmount: toINR(grossPaise),
      commissionRate,
      commissionAmount: toINR(commissionPaise),
      netEarning: toINR(netPaise),
      auditLog: [audit('assignment_created', 'system', null, { method, orderId: orderId || null, paymentId: paymentId || null })]
    };
    if (isDaily) {
      a.bookedDays = bookedDays;
      a.workedDays = 0;
      a.currentDayIndex = 1;
      a.isDecreased = false;
      a.dailyLogs = [{
        dayNumber: 1,
        date: request.startDate ? new Date(request.startDate) : new Date(),
        journeyStatus: 'NOT_STARTED',
        visitOtpCode: visit.code,
        visitOtpHash: visit.hash,
        visitOtpStatus: 'PENDING',
        visitOtpExpiresAt: visit.expiresAt,
        workStatus: 'NOT_STARTED'
      }];
    }
    assignmentDocs.push(a);

    const addr = request.location || {};
    bookingDocs.push({
      bookingNumber: `WRK-${Date.now()}-${idx}-${crypto.randomInt(1000, 10000)}`,
      userId: request.farmerId,
      workerId: wId,
      providerType: 'WORKER',
      workerRequestId: request._id,
      scheduledDate: isDaily ? (request.startDate || request.scheduledDate || new Date()) : (request.scheduledDate || new Date()),
      scheduledTime: isDaily ? '09:00' : (request.startTime || '09:00'),
      timeSlot: isDaily ? { start: '09:00', end: '17:00' } : { start: request.startTime || '09:00', end: request.endTime || '17:00' },
      serviceName: request.workTitle || 'Worker Service',
      serviceCategory: request.workCategory || 'Worker',
      basePrice: null,
      minRate: isDaily ? request.minDailyRate : request.minRate,
      maxRate: isDaily ? request.maxDailyRate : request.maxRate,
      agreedRate: offeredRate,
      rateUnit,
      finalAmount: toINR(grossPaise),
      visitOtp: visit.code,
      address: {
        addressLine1: addr.addressLine1 || addr.city || '',
        city: addr.city || '', state: addr.state || '', pincode: addr.pincode || '',
        lat: addr.lat || null, lng: addr.lng || null
      },
      status: 'confirmed',
      workerResponse: 'ACCEPTED',
      acceptedAt: new Date(),
      workerAcceptedAt: new Date(),
      paymentStatus: isCash ? 'pending' : 'success',
      paymentMethod: isCash ? 'cash' : 'online',
      // (no razorpayOrderId on the mirror Booking: the Booking-order payment routes must never match a worker-booking order)
      ...(isCash ? {} : { paymentId, razorpayPaymentId: paymentId }),
      notes: `${request.workTitle}: ${request.workDescription || ''}`.substring(0, 500)
    });
  });

  return { assignmentDocs, bookingDocs };
};

const releaseClaim = (requestId, paymentStatus) =>
  WorkerBookingRequest.updateOne(
    { _id: requestId, paymentStatus: 'processing' },
    { $set: { paymentStatus, confirmClaimedAt: null } }
  );

/** Remove everything a half-finished confirmation created (assignments are brand new, nothing is settled). */
const compensate = async (requestId) => {
  await IndWorkerAssignment.deleteMany({ parentRequestId: requestId, settlementStatus: 'PENDING', workStatus: 'NOT_STARTED', visitOtpStatus: 'PENDING' });
  await Booking.deleteMany({ workerRequestId: requestId, providerType: 'WORKER', status: 'confirmed' });
};

/**
 * Core confirm. `method`: 'online' | 'cash'.
 * online needs { orderId, paymentId } (signature already verified by the caller / webhook).
 * @returns {{ ok: boolean, code?: number, reason?: string, already?: boolean, refunded?: boolean, request?, assignments?, bookings? }}
 */
const confirmRequest = async ({ requestId, farmerId = null, method, orderId = null, paymentId = null, actor = 'farmer' }) => {
  const isCash = method === 'cash';
  const base = { _id: requestId };
  if (farmerId) base.farmerId = farmerId;

  const request = await WorkerBookingRequest.findOne(base);
  if (!request) return { ok: false, code: 404, reason: 'Request not found.' };

  let order = null;
  if (!isCash) {
    order = (request.paymentOrders || []).find(o => o.orderId === orderId);
    // pre-migration orders have no paymentOrders entry: they were priced from the snapshot of that time
    if (!order && request.razorpayOrderId === orderId && request.financialSnapshot?.totalPayable) {
      order = { orderId, amountPaise: toP(request.financialSnapshot.totalPayable) };
    }
    if (!order) return { ok: false, code: 404, reason: 'Invalid payment verification request.' };

    if (request.paymentStatus === 'success') {
      if (request.razorpayPaymentId === paymentId) return { ok: true, already: true, request };
      // a second, different payment for an already-paid booking → give it back
      const r = await refundCapturedPayment({ request, paymentId, amountPaise: order.amountPaise, reason: 'booking was already paid' });
      return { ok: false, code: 409, reason: 'Booking already paid; this payment was refunded to your wallet.', refunded: r.refunded };
    }

    const expected = toP(request.financialSnapshot?.totalPayable || 0);
    if (!expected || order.amountPaise !== expected) {
      const r = await refundCapturedPayment({ request, paymentId, amountPaise: order.amountPaise, reason: 'price changed after the payment order was created' });
      await WorkerBookingRequest.updateOne({ _id: request._id, paymentStatus: { $in: ['pending', 'failed'] } }, { $set: { paymentStatus: 'pending' } });
      return { ok: false, code: 409, reason: 'The booking price changed after this payment was started. The amount was refunded to your wallet; please pay again.', refunded: r.refunded };
    }
  } else if (request.paymentStatus === 'success') {
    return { ok: false, code: 409, reason: 'Booking already paid online.' };
  }

  // ── atomic claim ───────────────────────────────────────────────────────────
  // A claim older than STALE_CLAIM_MS belongs to a crashed run: it can be taken over (everything below is
  // idempotent — deterministic assignment keys, adopt-on-duplicate — so re-running it is safe).
  const claimFilter = {
    _id: request._id,
    status: { $in: SELECTABLE },
    'selectedWorkerIds.0': { $exists: true },
    $or: [
      { paymentStatus: { $in: isCash ? ['not_started', 'pending', 'failed'] : ['pending', 'failed'] }, confirmClaimedAt: null },
      { paymentStatus: 'processing', confirmClaimedAt: { $lt: new Date(Date.now() - STALE_CLAIM_MS) } }
    ]
  };
  const prevPaymentStatus = request.paymentStatus === 'processing' ? 'pending' : request.paymentStatus;
  const claimed = await WorkerBookingRequest.findOneAndUpdate(
    claimFilter,
    { $set: { paymentStatus: 'processing', confirmClaimedAt: new Date() } },
    { new: true }
  );

  if (!claimed) {
    const cur = await WorkerBookingRequest.findById(request._id).lean();
    if (cur && cur.paymentStatus === 'success' && (isCash || cur.razorpayPaymentId === paymentId)) return { ok: true, already: true, request: cur };
    if (cur && cur.paymentStatus === 'processing') return { ok: false, code: 409, inProgress: true, reason: 'Confirmation is already in progress.' };
    let refunded = false;
    if (!isCash) {
      const r = await refundCapturedPayment({ request, paymentId, amountPaise: order.amountPaise, reason: `booking is ${cur ? cur.status : 'unavailable'}` });
      refunded = r.refunded;
    }
    return { ok: false, code: 409, reason: `This booking can no longer be confirmed (status: ${cur ? cur.status : 'missing'}).${refunded ? ' Your payment was refunded to your wallet.' : ''}`, refunded };
  }

  // ── re-validate workers ────────────────────────────────────────────────────
  try {
    const unavailable = await validateSelectedWorkers(claimed);
    if (unavailable.length) {
      await releaseClaim(claimed._id, prevPaymentStatus);
      let refunded = false;
      if (!isCash) refunded = (await refundCapturedPayment({ request: claimed, paymentId, amountPaise: order.amountPaise, reason: 'a selected worker became unavailable' })).refunded;
      return { ok: false, code: 409, reason: 'One or more selected workers are no longer available. Please re-select workers.' + (refunded ? ' Your payment was refunded to your wallet.' : ''), unavailable, refunded };
    }

    // ── create documents (idempotent by deterministic key) ───────────────────
    const { assignmentDocs, bookingDocs } = buildDocs(claimed, { method, orderId, paymentId });
    // ordered:false → on a re-run the rows that already exist (deterministic keys) are skipped and the MISSING
    // ones are still written; then everything is read back by key (adopt, never duplicate).
    try {
      await IndWorkerAssignment.insertMany(assignmentDocs, { ordered: false });
    } catch (err) {
      const onlyDuplicates = err && (err.code === 11000 || (Array.isArray(err.writeErrors) && err.writeErrors.length > 0 && err.writeErrors.every(w => w.code === 11000)));
      if (!onlyDuplicates) throw err;
    }
    const assignments = await IndWorkerAssignment.find({
      parentRequestId: claimed._id, assignmentStatus: { $ne: 'CANCELLED' },
      creationIdempotencyKey: { $in: assignmentDocs.map(a => a.creationIdempotencyKey) }
    });
    let bookings = await Booking.find({ workerRequestId: claimed._id, providerType: 'WORKER' });
    if (bookings.length === 0) bookings = await Booking.insertMany(bookingDocs);

    const byWorker = new Map(bookings.map(b => [String(b.workerId), b]));
    for (const a of assignments) {
      const b = byWorker.get(String(a.workerId));
      if (b && !a.legacyBookingId) await IndWorkerAssignment.updateOne({ _id: a._id }, { $set: { legacyBookingId: b._id } });
    }

    const selected = (claimed.selectedWorkerIds || []).map(String);
    const finalized = await WorkerBookingRequest.findOneAndUpdate(
      { _id: claimed._id, paymentStatus: 'processing' },
      {
        $set: {
          status: 'confirmed',
          paymentStatus: isCash ? 'pending' : 'success',
          paymentMethod: isCash ? 'cash' : 'online',
          confirmClaimedAt: null,
          confirmedAt: new Date(),
          farmerAcceptedPartial: selected.length < claimed.requiredWorkers,
          acceptedWorkersCount: selected.length,
          finalWorkers: claimed.selectedWorkerIds,
          assignmentIds: assignments.map(a => a._id),
          finalBookingIds: bookings.map(b => b._id),
          refundAmount: 0, refundCredited: false, refundCreditedAt: null,
          ...(isCash ? {} : { razorpayPaymentId: paymentId, razorpayOrderId: orderId }),
          'workerOffers.$[sel].status': 'selected',
          'workerOffers.$[oth].status': 'rejected',
          'memberInvitations.$[pend].status': 'member_expired'
        },
        $push: { auditLog: audit(isCash ? 'confirmed_cash' : 'confirmed_online', actor, farmerId || claimed.farmerId, { orderId, paymentId }) }
      },
      {
        new: true,
        arrayFilters: [
          { 'sel.workerId': { $in: claimed.selectedWorkerIds } },
          { 'oth.workerId': { $nin: claimed.selectedWorkerIds } },
          { 'pend.status': { $in: ['member_pending', 'pending'] } }
        ]
      }
    );
    if (!finalized) throw new Error('confirmation claim was lost');

    if (!isCash) {
      await ledger.recordPassbookOnce(`worker_booking_payment_${paymentId}`, {
        userId: claimed.farmerId, amount: order.amountPaise / 100, type: 'booking_payment', paymentMethod: 'razorpay', status: 'completed',
        description: `Online payment for worker booking "${claimed.workTitle}"`, referenceId: paymentId,
        metadata: { workerRequestId: claimed._id, razorpayOrderId: orderId, razorpayPaymentId: paymentId }
      });
    }

    // ── optimistic double-booking guard (insert-then-verify, deterministic tie-break) ──
    const ctl = require('../controllers/workerControllers/farmerWorkerRequestController');
    for (const wId of selected) {
      const clash = claimed.bookingType === 'DAILY'
        ? await ctl.hasDailyConflict(wId, claimed.startDate, claimed.endDate, claimed._id, { committedOnly: true })
        : await ctl.hasTimeConflict(wId, claimed.scheduledDate, claimed.startTime, claimed.endTime, claimed._id, { committedOnly: true });
      if (clash) {
        const rival = await findCommittedRival(claimed, wId);
        // the lower _id (earlier request) keeps the worker; the other rolls back
        if (!rival || String(rival._id) < String(claimed._id)) {
          await rollbackConfirmed(finalized, { method, order, paymentId, reason: 'a selected worker was confirmed for an overlapping job at the same moment' });
          return { ok: false, code: 409, reason: 'A selected worker was booked elsewhere at the same moment. Please re-select workers.' + (isCash ? '' : ' Your payment was refunded to your wallet.'), refunded: !isCash };
        }
      }
    }

    return { ok: true, request: finalized, assignments, bookings };
  } catch (err) {
    console.error('[confirmRequest] failed after claim, compensating:', err);
    await compensate(claimed._id).catch(() => {});
    await releaseClaim(claimed._id, prevPaymentStatus).catch(() => {});
    if (!isCash && order) await refundCapturedPayment({ request: claimed, paymentId, amountPaise: order.amountPaise, reason: 'booking could not be completed' }).catch(() => {});
    return { ok: false, code: 500, reason: 'Booking confirmation failed' + (isCash ? '' : '; your payment was refunded to your wallet.'), refunded: !isCash };
  }
};

// a committed request (other than `request`) that overlaps for this worker
const findCommittedRival = async (request, workerId) => {
  const q = {
    _id: { $ne: request._id },
    status: { $in: ['confirmed', 'in_progress', 'partially_completed'] },
    finalWorkers: new mongoose.Types.ObjectId(String(workerId))
  };
  if (request.bookingType === 'DAILY') Object.assign(q, { bookingType: 'DAILY', startDate: { $lte: request.endDate }, endDate: { $gte: request.startDate } });
  else Object.assign(q, { scheduledDate: request.scheduledDate });
  return WorkerBookingRequest.findOne(q).sort({ _id: 1 }).select('_id').lean();
};

const rollbackConfirmed = async (request, { method, order, paymentId, reason }) => {
  // the documents were created moments ago and nothing has happened on them: remove them (a CANCELLED row
  // would keep the deterministic idempotency key and block the farmer's re-confirmation)
  await compensate(request._id);
  await WorkerBookingRequest.updateOne({ _id: request._id }, {
    $set: { status: 'awaiting_farmer_confirmation', paymentStatus: 'pending', finalWorkers: [], assignmentIds: [], finalBookingIds: [], confirmedAt: null },
    $push: { auditLog: audit('confirmation_rolled_back', 'system', null, { reason }) }
  });
  if (method !== 'cash' && order) await refundCapturedPayment({ request, paymentId, amountPaise: order.amountPaise, reason });
};

module.exports = { confirmRequest, refundCapturedPayment, validateSelectedWorkers, SELECTABLE, assignmentKey, audit, toP, toINR };
