'use strict';

/**
 * Cancellation of an independent-worker booking (farmer-initiated or system no-show).
 *
 *  - the parent moves to `cancelled` with ONE atomic guarded update (no race with payment / progress);
 *  - work already started or settled can never be cancelled this way;
 *  - only assignments that have not started are cancelled (a settled worker is never "un-paid");
 *  - the refund goes through the idempotent ledger (a double click / retry can never refund twice).
 */

const WorkerBookingRequest = require('../models/WorkerBookingRequest');
const IndWorkerAssignment = require('../models/IndWorkerAssignment');
const Booking = require('../models/Booking');
const settlement = require('./workerSettlementService');

const CANCELLABLE = ['pending', 'matching', 'awaiting_farmer_confirmation', 'accepted', 'confirmed'];
const toP = (inr) => Math.round(Number(inr) * 100);

/**
 * @param {object} p
 * @param {*} p.requestId
 * @param {*} [p.farmerId]  when given, the request must belong to this farmer
 * @param {'farmer'|'system'|'admin'} p.actor
 * @returns {{ok: boolean, code?: number, reason?: string, workerIds?: string[], refundAmount?: number, wasConfirmed?: boolean, request?: object}}
 */
const cancelWorkerBooking = async ({ requestId, farmerId = null, actor = 'farmer', actorId = null, reason = 'Cancelled' }) => {
  const filter = { _id: requestId };
  if (farmerId) filter.farmerId = farmerId;
  filter.requestType = { $in: ['independent_broadcast', 'team_leader'] };

  const request = await WorkerBookingRequest.findOne(filter);
  if (!request) return { ok: false, code: 404, reason: 'Request not found.' };

  if (['completed', 'cancelled', 'expired'].includes(request.status)) {
    return { ok: false, code: 409, reason: `Cannot cancel a request with status "${request.status}".` };
  }
  if (['in_progress', 'partially_completed'].includes(request.status)) {
    return { ok: false, code: 400, reason: 'Cannot cancel booking after work has already started. Please contact support.' };
  }
  if (request.paymentStatus === 'processing') {
    return { ok: false, code: 409, reason: 'A payment is being processed for this booking. Please try again in a moment.' };
  }

  const wasConfirmed = request.status === 'confirmed';
  let assignments = [];
  if (wasConfirmed) {
    assignments = await IndWorkerAssignment.find({ parentRequestId: request._id, assignmentStatus: { $ne: 'CANCELLED' } });
    // "started" is judged from real lifecycle fields (the old check compared against values that do not exist in the enums)
    const started = assignments.some(a => settlement.hasStarted(a) || a.completionStatus === 'OTP_VERIFIED' || a.settlementStatus !== 'PENDING' || a.assignmentStatus === 'COMPLETED');
    if (started) {
      return { ok: false, code: 400, reason: 'Cannot cancel booking after work has already started. Please contact support.' };
    }
  }

  // ── atomic claim ───────────────────────────────────────────────────────────
  const prev = await WorkerBookingRequest.findOneAndUpdate(
    { _id: request._id, status: { $in: CANCELLABLE }, paymentStatus: { $ne: 'processing' } },
    {
      $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: actor },
      $push: { auditLog: { at: new Date(), actor, actorId, event: 'cancelled', meta: { reason, wasConfirmed } } }
    },
    { new: false }
  );
  if (!prev) return { ok: false, code: 409, reason: 'The booking changed while cancelling. Please retry.' };

  const workerIds = new Set();
  let refundAmount = 0;

  if (wasConfirmed) {
    // only assignments that truly have not started
    await IndWorkerAssignment.updateMany(
      {
        parentRequestId: request._id, assignmentStatus: 'CONFIRMED', settlementStatus: 'PENDING',
        visitOtpStatus: { $ne: 'VERIFIED' }, completionStatus: 'PENDING', workedDays: { $in: [0, null] }
      },
      { $set: { assignmentStatus: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason, cancelledBy: actor } }
    );

    const stillOpen = await IndWorkerAssignment.countDocuments({ parentRequestId: request._id, assignmentStatus: { $in: ['CONFIRMED', 'COMPLETED'] } });
    if (stillOpen > 0) {
      // a worker started in the gap between our check and the claim → put the booking back
      await WorkerBookingRequest.updateOne({ _id: request._id, status: 'cancelled' }, { $set: { status: prev.status, cancelledAt: null, cancelledBy: null } });
      return { ok: false, code: 409, reason: 'A worker has just started work; the booking can no longer be cancelled.' };
    }

    if (Array.isArray(request.finalBookingIds) && request.finalBookingIds.length) {
      await Booking.updateMany(
        { _id: { $in: request.finalBookingIds }, status: { $nin: ['completed', 'cancelled'] } },
        { $set: { status: 'cancelled', cancellationReason: reason } }
      );
    }
    assignments.forEach(a => workerIds.add(String(a.workerId)));
    (request.finalWorkers || []).forEach(id => id && workerIds.add(String(id)));
    (request.selectedWorkerIds || []).forEach(id => id && workerIds.add(String(id)));

    // full refund of what the farmer paid online (nothing was worked, nothing was settled)
    if (settlement.isPaidOnline(request)) {
      const snap = request.financialSnapshot || {};
      const amount = Number(snap.totalPayable || snap.maximumWorkerAmount || 0);
      if (amount > 0) {
        const bookingRef = request.bookingNumber || `WRK-${request._id.toString().slice(-6).toUpperCase()}`;
        const res = await settlement.creditFarmerOnce({
          parent: request, amount, key: `cancel_refund_${request._id}`, reason: 'refund',
          description: `Full Refund for Cancelled ${request.workTitle || 'Worker'} Booking (#${bookingRef})`
        });
        if (res.applied || res.duplicate) {
          refundAmount = amount;
          await WorkerBookingRequest.updateOne({ _id: request._id }, { $set: { refundAmount: amount, refundCredited: true, refundCreditedAt: new Date() } });
        }
      }
    }
  } else {
    (request.dispatchedTo || []).forEach(d => d.workerId && workerIds.add(String(d.workerId)));
    (request.workerOffers || []).forEach(o => o.workerId && workerIds.add(String(o.workerId)));
    (request.selectedWorkerIds || []).forEach(id => id && workerIds.add(String(id)));
  }

  return { ok: true, request, workerIds: [...workerIds], refundAmount, wasConfirmed };
};

/**
 * Confirmed bookings whose scheduled window ended long ago with NO work started (worker never showed / nobody
 * acted) are cancelled and fully refunded; ones with started-but-unfinished work are only flagged for support.
 */
const NO_SHOW_GRACE_MS = 24 * 60 * 60 * 1000;
const autoCancelNoShows = async () => {
  const { getBookingScheduledExpiry } = require('./workerBookingExpiryService');
  const out = { cancelled: 0, flagged: 0 };
  const cands = await WorkerBookingRequest.find({ status: 'confirmed', confirmedAt: { $lt: new Date(Date.now() - NO_SHOW_GRACE_MS) } }).limit(100);
  for (const r of cands) {
    const end = getBookingScheduledExpiry(r).getTime();
    if (Date.now() < end + NO_SHOW_GRACE_MS) continue;
    const res = await cancelWorkerBooking({ requestId: r._id, actor: 'system', reason: 'Worker no-show: the booking was never started' });
    if (res.ok) {
      out.cancelled++;
      try {
        const { announceCancellation } = require('../controllers/workerControllers/farmerWorkerRequestController');
        await announceCancellation({ request: res.request, workerIds: res.workerIds, refundAmount: res.refundAmount, wasConfirmed: true, by: 'system' });
      } catch (e) { console.warn('[autoCancelNoShows] announce failed:', e.message); }
    } else if (res.code === 400) {
      out.flagged++;
      await WorkerBookingRequest.updateOne({ _id: r._id, 'auditLog.event': { $ne: 'overdue_flagged' } }, { $push: { auditLog: { at: new Date(), actor: 'system', event: 'overdue_flagged', meta: { reason: res.reason } } } });
    }
  }
  return out;
};

module.exports = { cancelWorkerBooking, autoCancelNoShows, CANCELLABLE };
