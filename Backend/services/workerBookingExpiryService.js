'use strict';

/**
 * workerBookingExpiryService.js
 *
 * Authoritative Server-Side Expiry Engine for Worker Bookings:
 * - WorkerBookingRequest (Independent broadcasts, Team Leader requests, Direct requests)
 * - WorkerGroupRequest (Direct group bookings to Team Leader)
 * - IndWorkerAssignment (Child assignments)
 *
 * Uses the canonical Indian Standard Time (IST, Asia/Kolkata) timezone
 * via standard Intl.DateTimeFormat to prevent timezone drift, midnight wrap bugs,
 * and ensure database state remains the single source of truth.
 */

const mongoose             = require('mongoose');
const WorkerBookingRequest = require('../models/WorkerBookingRequest');
const WorkerGroupRequest   = require('../models/WorkerGroupRequest');
const IndWorkerAssignment  = require('../models/IndWorkerAssignment');
const Worker               = require('../models/Worker');
const User                 = require('../models/User');
const Wallet               = require('../models/Wallet');
const WalletTransaction    = require('../models/WalletTransaction');
const Transaction          = require('../models/Transaction');
const Notification         = require('../models/Notification');
const { getIO }            = require('../sockets');

// Safe emit helper to avoid crashes when socket is disconnected or room is missing
const emitSafe = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (err) {
    // Non-fatal socket error
  }
};

/**
 * Robust parser for various time formats to { hours, minutes }.
 * Supports "HH:mm", "H:mm", "HH:mm:ss", "hh:mm AM/PM", "h:mm am/pm".
 */
const parseTimeParts = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const str = timeStr.trim();

  // 12-hour format with AM/PM (e.g., "02:30 PM", "2:30pm", "11:00 AM")
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toLowerCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (period === 'am' && hours === 12) hours = 0;
    if (period === 'pm' && hours !== 12) hours += 12;
    return { hours, minutes };
  }

  // 24-hour format (e.g., "22:05", "09:30", "23:03:00")
  const match24 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  return null;
};

/**
 * Extracts the calendar date string in IST (Asia/Kolkata) as "YYYY-MM-DD".
 */
const getIstDateString = (dateInput) => {
  if (!dateInput) return null;
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  } catch (e) {
    return d.toISOString().slice(0, 10);
  }
};

/**
 * Adds days to a "YYYY-MM-DD" date string and returns the new "YYYY-MM-DD" string in IST.
 */
const addDaysToIstDate = (istDateStr, daysToAdd) => {
  if (!istDateStr) return null;
  // Parse in IST at noon to avoid boundary shifts
  const d = new Date(`${istDateStr}T12:00:00+05:30`);
  d.setDate(d.getDate() + daysToAdd);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
};

/**
 * Calculates the exact scheduled completion Date object for a booking/request.
 * Returns a JS Date representing the precise instant the scheduled booking window ends.
 *
 * @param {Object} request - WorkerBookingRequest or WorkerGroupRequest document or plain object
 * @returns {Date} Date object of scheduled window end
 */
const getBookingScheduledExpiry = (request) => {
  if (!request) {
    return new Date(0); // If null/undefined, consider expired
  }

  const isDaily = (
    request.bookingType === 'DAILY' ||
    request.rateUnit === 'daily' ||
    Boolean(request.startDate)
  );

  if (isDaily) {
    // ── DAILY BOOKING ────────────────────────────────────────────────────────
    let endIstStr = null;

    if (request.endDate) {
      endIstStr = getIstDateString(request.endDate);
    } else if (request.startDate) {
      const startIstStr = getIstDateString(request.startDate);
      const numDays = Math.max(1, parseInt(request.numberOfDays, 10) || 1);
      endIstStr = addDaysToIstDate(startIstStr, numDays - 1);
    }

    if (endIstStr) {
      // The daily booking window ends at 23:59:59.999 IST on the final day
      return new Date(`${endIstStr}T23:59:59.999+05:30`);
    }
  } else {
    // ── HOURLY BOOKING ───────────────────────────────────────────────────────
    const dateSource = request.scheduledDate || request.date || request.startDate;
    const startIstStr = getIstDateString(dateSource);

    if (startIstStr) {
      const endParts = parseTimeParts(request.endTime);
      const startParts = parseTimeParts(request.startTime);

      let targetHours = 23;
      let targetMinutes = 59;
      let targetDateStr = startIstStr;

      if (endParts) {
        targetHours = endParts.hours;
        targetMinutes = endParts.minutes;

        // Check if shift wraps past midnight (e.g. 22:05 -> 02:00)
        if (startParts) {
          const startMins = startParts.hours * 60 + startParts.minutes;
          const endMins = endParts.hours * 60 + endParts.minutes;
          if (endMins < startMins) {
            targetDateStr = addDaysToIstDate(startIstStr, 1);
          }
        }
      } else if (startParts && request.durationMinutes) {
        // Compute end time from startTime + durationMinutes
        const totalMins = startParts.hours * 60 + startParts.minutes + (parseInt(request.durationMinutes, 10) || 60);
        const dayOffset = Math.floor(totalMins / 1440);
        const remMins = totalMins % 1440;
        targetHours = Math.floor(remMins / 60);
        targetMinutes = remMins % 60;
        if (dayOffset > 0) {
          targetDateStr = addDaysToIstDate(startIstStr, dayOffset);
        }
      }

      const hh = String(targetHours).padStart(2, '0');
      const mm = String(targetMinutes).padStart(2, '0');
      return new Date(`${targetDateStr}T${hh}:${mm}:00+05:30`);
    }
  }

  // Fallback to explicit expiresAt or createdAt + 24 hours
  if (request.expiresAt) {
    const exp = new Date(request.expiresAt);
    if (!isNaN(exp.getTime())) return exp;
  }

  if (request.createdAt) {
    const created = new Date(request.createdAt);
    if (!isNaN(created.getTime())) {
      return new Date(created.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  return new Date(Date.now() + 24 * 60 * 60 * 1000);
};

/**
 * Checks if a booking request is currently expired according to server time.
 * A request is considered expired if:
 * 1. Its status is already 'expired', 'cancelled', or 'completed'
 * 2. Its scheduled booking window has completely passed (now >= scheduledExpiry)
 * 3. Its explicit request TTL expiresAt has passed (now >= expiresAt)
 *
 * @param {Object} request
 * @param {Date} [now=new Date()]
 * @returns {{ isExpired: boolean, scheduledEnd: Date, effectiveExpiry: Date, reason: string }}
 */
const isBookingExpired = (request, now = new Date()) => {
  if (!request) {
    return { isExpired: true, scheduledEnd: new Date(0), effectiveExpiry: new Date(0), reason: 'Request does not exist' };
  }

  const nowMs = now.getTime();

  // Terminal database statuses
  if (['cancelled', 'expired', 'completed', 'rejected'].includes(request.status)) {
    return {
      isExpired: true,
      scheduledEnd: getBookingScheduledExpiry(request),
      effectiveExpiry: request.expiresAt ? new Date(request.expiresAt) : new Date(0),
      reason: `Request has terminal status "${request.status}"`
    };
  }

  const scheduledEnd = getBookingScheduledExpiry(request);
  const scheduledEndMs = scheduledEnd.getTime();

  // A CONFIRMED (paid / committed) booking is not a "request" any more: its schedule window passing must never
  // expire it, cancel its assignments or refund it. Overdue confirmed bookings are handled by autoCancelNoShows().
  if (['confirmed', 'in_progress', 'partially_completed'].includes(request.status)) {
    return { isExpired: false, scheduledEnd, effectiveExpiry: scheduledEnd, reason: 'Booking is confirmed' };
  }

  // If the scheduled window has already completely passed
  if (nowMs >= scheduledEndMs) {
    return {
      isExpired: true,
      scheduledEnd,
      effectiveExpiry: scheduledEnd,
      reason: 'Scheduled booking window has elapsed'
    };
  }

  // If explicit request TTL expiresAt is set and has passed
  if (request.expiresAt) {
    const expiresAtDate = new Date(request.expiresAt);
    if (!isNaN(expiresAtDate.getTime()) && nowMs >= expiresAtDate.getTime()) {
      return {
        isExpired: true,
        scheduledEnd,
        effectiveExpiry: expiresAtDate,
        reason: 'Request acceptance TTL has elapsed'
      };
    }
  }

  const effectiveExpiryMs = request.expiresAt
    ? Math.min(scheduledEndMs, new Date(request.expiresAt).getTime())
    : scheduledEndMs;

  return {
    isExpired: false,
    scheduledEnd,
    effectiveExpiry: new Date(effectiveExpiryMs),
    reason: 'Active'
  };
};

/**
 * Atomically marks a WorkerBookingRequest as expired in MongoDB,
 * cancels orphaned assignments/invites, clears active alerts via Socket.IO,
 * notifies the farmer, and handles any refund safety if applicable.
 *
 * @param {string|Object} requestOrId
 * @param {string} [reason='Booking request expired because the scheduled window has passed.']
 * @returns {Promise<Object|null>} Updated request document
 */
const expireWorkerBookingRequest = async (requestOrId, reason = 'Booking request expired because the scheduled window has passed.') => {
  try {
    const requestId = (requestOrId && requestOrId._id) ? requestOrId._id : requestOrId;
    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) return null;

    const request = await WorkerBookingRequest.findById(requestId);
    if (!request) return null;

    // Idempotency: if already terminal, do not duplicate actions
    if (['expired', 'cancelled', 'completed'].includes(request.status)) {
      return request;
    }

    // Expiry applies ONLY to a request that is still being filled and has not been paid for.
    if (!['pending', 'matching', 'awaiting_farmer_confirmation', 'accepted', 'requested'].includes(request.status) ||
        ['success', 'processing'].includes(request.paymentStatus)) {
      return request;
    }

    console.log(`[ExpiryService] Expiring WorkerBookingRequest ${request._id} (Status was: ${request.status})`);

    // 1. Mark request as expired
    request.status = 'expired';
    request.rejectionReason = reason;

    // 2. Mark all pending dispatched workers as expired
    if (Array.isArray(request.dispatchedTo)) {
      request.dispatchedTo.forEach(d => {
        if (d.status === 'pending') {
          d.status = 'expired';
          d.respondedAt = new Date();
        }
      });
    }

    // 3. Mark all pending member invitations as member_expired
    if (Array.isArray(request.memberInvitations)) {
      request.memberInvitations.forEach(m => {
        if (m.status === 'member_pending' || m.status === 'pending') {
          m.status = 'member_expired';
          m.respondedAt = new Date();
        }
      });
    }

    // (An unpaid request has no assignments and nothing to refund — those steps used to run here and cancelled
    //  paid, running jobs; confirmed bookings are now filtered out above.)

    await request.save();

    // 6. Collect worker IDs to dismiss alerts
    const workerIdsToNotify = new Set();
    if (Array.isArray(request.dispatchedTo)) {
      request.dispatchedTo.forEach(d => d.workerId && workerIdsToNotify.add(d.workerId.toString()));
    }
    if (Array.isArray(request.memberInvitations)) {
      request.memberInvitations.forEach(m => m.workerId && workerIdsToNotify.add(m.workerId.toString()));
    }
    if (request.workerId) {
      workerIdsToNotify.add(request.workerId.toString());
    }

    const cancelPayload = {
      requestId: request._id,
      bookingId: request._id,
      workTitle: request.workTitle || 'Worker Request',
      message: 'Booking request has expired because the scheduled window has passed.',
      status: 'expired'
    };

    // 7. Emit cancellation/dismissal socket events to all workers so active alert modals close immediately
    for (const wId of workerIdsToNotify) {
      emitSafe(`worker_${wId}`, 'worker_booking_cancelled', cancelPayload);
      emitSafe(`worker:${wId}`, 'worker_booking_cancelled', cancelPayload);
      emitSafe(`worker_${wId}`, 'workerRequestCancelled', cancelPayload);
      emitSafe(`worker:${wId}`, 'workerRequestCancelled', cancelPayload);
      emitSafe(`worker_${wId}`, 'worker_booking_update', { requestId: request._id, type: 'worker_booking_expired' });
      emitSafe(`worker:${wId}`, 'worker_booking_update', { requestId: request._id, type: 'worker_booking_expired' });
      emitSafe(`worker_${wId}`, 'workerJobsUpdated', {});
      emitSafe(`worker:${wId}`, 'workerJobsUpdated', {});
    }

    // 8. Notify Farmer about expiration
    if (request.farmerId) {
      const farmerIdStr = request.farmerId.toString();
      emitSafe(`user_${farmerIdStr}`, 'worker_booking_cancelled', cancelPayload);
      emitSafe(`user:${farmerIdStr}`, 'worker_booking_cancelled', cancelPayload);
      emitSafe(`user_${farmerIdStr}`, 'userBookingsUpdated', {});
      emitSafe(`user:${farmerIdStr}`, 'userBookingsUpdated', {});

      const link = `/user/farmer-worker-request/${request._id}`;
      Notification.create({
        userId: request.farmerId,
        type: 'worker_request_expired',
        title: '🌾 Booking Request Expired',
        message: `Your booking request for "${request.workTitle || 'Workers'}" expired because no worker accepted before the scheduled time.`,
        relatedId: request._id,
        relatedType: 'WorkerBookingRequest',
        data: { requestId: request._id, link }
      }).then(notif => {
        const payload = notif.toObject ? notif.toObject() : notif;
        emitSafe(`user_${farmerIdStr}`, 'notification', { ...payload, link });
        emitSafe(`user:${farmerIdStr}`, 'notification', { ...payload, link });
        emitSafe(`user_${farmerIdStr}`, 'userNotificationsUpdated', { unreadCountIncrement: 1 });
        emitSafe(`user:${farmerIdStr}`, 'userNotificationsUpdated', { unreadCountIncrement: 1 });
      }).catch(err => {
        console.warn('[Expiry Notification non-fatal]:', err?.message);
      });
    }

    // 9. Broadcast to shared booking request rooms
    emitSafe(`booking_req:${request._id}`, 'worker_booking_cancelled', cancelPayload);
    emitSafe(`farmer_worker_request_${request._id}`, 'worker_booking_cancelled', cancelPayload);

    return request;
  } catch (err) {
    console.error('[ExpiryService] Error expiring request:', err);
    return null;
  }
};

/**
 * Scans MongoDB for any active/pending worker booking requests that have passed their
 * scheduled booking window or accept TTL and transitions them to 'expired'.
 */
const checkAndExpireWorkerRequests = async () => {
  try {
    const now = new Date();

    // 1. WorkerBookingRequest: Find pending / matching requests
    const candidateRequests = await WorkerBookingRequest.find({
      status: { $in: ['pending', 'matching', 'awaiting_farmer_confirmation'] }
    });

    let expiredCount = 0;
    for (const req of candidateRequests) {
      const evalResult = isBookingExpired(req, now);
      if (evalResult.isExpired) {
        await expireWorkerBookingRequest(req, evalResult.reason);
        expiredCount++;
      }
    }

    // 2. WorkerGroupRequest: Find collecting_members / selection_pending
    const candidateGroupRequests = await WorkerGroupRequest.find({
      status: { $in: ['collecting_members', 'selection_pending', 'pending'] }
    });

    for (const grp of candidateGroupRequests) {
      const evalResult = isBookingExpired(grp, now);
      if (evalResult.isExpired) {
        grp.status = 'expired';
        await grp.save();
        expiredCount++;

        // Notify leader and members
        const leaderId = grp.teamLeaderId?.toString();
        if (leaderId) {
          emitSafe(`worker_${leaderId}`, 'worker_booking_cancelled', {
            requestId: grp._id,
            message: 'Group booking request expired.'
          });
          emitSafe(`worker_${leaderId}`, 'workerJobsUpdated', {});
        }
      }
    }

    if (expiredCount > 0) {
      console.log(`[ExpiryService] Processed and expired ${expiredCount} stale worker booking request(s).`);
    }

    // 3. Confirmed bookings nobody started (worker no-show) → cancel + refund; flag started-but-overdue ones.
    try { await require('./workerBookingCancelService').autoCancelNoShows(); }
    catch (e) { console.error('[ExpiryService] no-show sweep failed:', e.message); }

    // 4. Money safety net: retry settlements stuck in FAILED/PROCESSING and refunds that never landed.
    try { await require('./workerSettlementService').reconcile(); }
    catch (e) { console.error('[ExpiryService] settlement reconcile failed:', e.message); }
  } catch (err) {
    console.error('[ExpiryService] Error in checkAndExpireWorkerRequests:', err);
  }
};

/**
 * Initializes the background scheduler to periodically check and auto-expire stale worker bookings.
 */
const startWorkerBookingExpiryScheduler = () => {
  // Check every 60 seconds
  setInterval(() => {
    checkAndExpireWorkerRequests();
  }, 60 * 1000);

  // Initial check on server startup (delayed 5s to allow DB connection)
  setTimeout(() => {
    checkAndExpireWorkerRequests();
  }, 5000);

  console.log(' Worker Booking Expiry Scheduler Initialized (checks every 60s)');
};

module.exports = {
  getBookingScheduledExpiry,
  isBookingExpired,
  expireWorkerBookingRequest,
  checkAndExpireWorkerRequests,
  startWorkerBookingExpiryScheduler,
  getIstDateString,
  addDaysToIstDate
};
