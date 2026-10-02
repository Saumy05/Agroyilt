'use strict';

/**
 * farmerWorkerRequestController.js
 *
 * Farmer-First Worker Request System.
 * Backend auto-routes requests to Independent Workers or Team Leaders
 * based on Admin configuration â€” never trusting frontend routing hints.
 */

const WorkerBookingRequest  = require('../../models/WorkerBookingRequest');
const IndWorkerAssignment   = require('../../models/IndWorkerAssignment');
const Worker                = require('../../models/Worker');
const User                  = require('../../models/User');
const Team                  = require('../../models/Team');
const Booking               = require('../../models/Booking');
const WorkerGroupRequest    = require('../../models/WorkerGroupRequest');
const Notification          = require('../../models/Notification');
const Settings              = require('../../models/Settings');
const Wallet                = require('../../models/Wallet');
const WalletTransaction     = require('../../models/WalletTransaction');
const mongoose              = require('mongoose');
const crypto                = require('crypto');
const { getIO }             = require('../../sockets');
const { calculateDistance } = require('../../services/locationService');
const { sendNotificationToUser, sendNotificationToWorker } = require('../../services/firebaseAdmin');
const {
  getBookingScheduledExpiry,
  isBookingExpired,
  expireWorkerBookingRequest
} = require('../../services/workerBookingExpiryService');

// ─── Constants ────────────────────────────────────────────────────────────────

// Worker statuses that are considered "online/available" for auto-dispatch
const ONLINE_STATUSES = [
  'online', 'ONLINE',
  'active', 'ACTIVE',
  'available', 'AVAILABLE',
  'on_job', 'ON_JOB',
  'idle', 'IDLE',
  'free', 'FREE',
  'registered', 'REGISTERED'
];

// Request expires after 24 hours
const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "HH:mm" into minutes from midnight (0 to 1439) */
const toMins = (t) => {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Robust parser for various time formats to minutes from midnight (0 to 1439).
 * Supports "HH:mm", "H:mm", "HH:mm:ss", "hh:mm AM/PM", "h:mm am/pm".
 */
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const str = timeStr.trim();

  // 12-hour format with AM/PM (e.g., "02:30 PM", "2:30pm", "11:00 AM")
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const isPm = ampmMatch[3].toLowerCase() === 'pm';
    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  // 24-hour format (e.g., "14:30", "09:00", "9:00", "14:30:00")
  const match24 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  return null;
};

/**
 * Check if two time intervals [s1, e1] and [s2, e2] overlap.
 * Standard overlap rule: s1 < e2 && e1 > s2
 */
const doTimesOverlap = (start1, end1, start2, end2) => {
  if (start1 === null || end1 === null || start2 === null || end2 === null) return false;
  return (start1 < end2) && (end1 > start2);
};

/**
 * Extract distinct YYYY-MM-DD strings for a given date across UTC, IST (Asia/Kolkata), and local.
 * This guarantees timezone shifts between UTC database storage and IST Indian calendar days do not cause false misses.
 */
const getCalendarDateStrings = (dateInput) => {
  if (!dateInput) return [];
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return [];

  const set = new Set();
  try {
    set.add(d.toISOString().slice(0, 10)); // UTC YYYY-MM-DD
  } catch (e) {}

  try {
    const istStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    set.add(istStr);
  } catch (e) {}

  try {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    set.add(`${y}-${m}-${day}`);
  } catch (e) {}

  return Array.from(set);
};

/**
 * Check if two dates represent the exact same calendar day.
 */
const isSameCalendarDate = (date1, date2) => {
  if (!date1 || !date2) return false;

  if (typeof date1 === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date1.trim())) {
    const set2 = getCalendarDateStrings(date2);
    if (set2.includes(date1.trim())) return true;
  }
  if (typeof date2 === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date2.trim())) {
    const set1 = getCalendarDateStrings(date1);
    if (set1.includes(date2.trim())) return true;
  }

  const set1 = getCalendarDateStrings(date1);
  const set2 = getCalendarDateStrings(date2);

  for (const s of set1) {
    if (set2.includes(s)) return true;
  }
  return false;
};

/**
 * Safely extract start and end minutes from any booking/request doc.
 */
const extractDocTimeRange = (doc) => {
  let startStr = null;
  let endStr = null;

  if (doc.timeSlot) {
    if (typeof doc.timeSlot.start === 'string' && doc.timeSlot.start.trim()) {
      startStr = doc.timeSlot.start.trim();
    }
    if (typeof doc.timeSlot.end === 'string' && doc.timeSlot.end.trim()) {
      endStr = doc.timeSlot.end.trim();
    }
    if (!startStr && typeof doc.timeSlot.time === 'string' && doc.timeSlot.time.trim()) {
      startStr = doc.timeSlot.time.trim();
    }
  }

  if (!startStr && typeof doc.startTime === 'string' && doc.startTime.trim()) {
    startStr = doc.startTime.trim();
  }
  if (!endStr && typeof doc.endTime === 'string' && doc.endTime.trim()) {
    endStr = doc.endTime.trim();
  }

  if (!startStr && typeof doc.scheduledTime === 'string' && doc.scheduledTime.trim()) {
    const raw = doc.scheduledTime.trim();
    if (raw.includes('-')) {
      const parts = raw.split('-').map(p => p.trim());
      startStr = parts[0];
      endStr = parts[1];
    } else {
      startStr = raw;
    }
  }

  let startMins = parseTimeToMinutes(startStr);
  let endMins = parseTimeToMinutes(endStr);

  // If start is known but end is missing, compute end using duration or default 60 mins
  if (startMins !== null && endMins === null) {
    if (doc.durationMinutes && !isNaN(Number(doc.durationMinutes)) && Number(doc.durationMinutes) > 0) {
      endMins = startMins + Number(doc.durationMinutes);
    } else if (doc.estimatedDuration && !isNaN(Number(doc.estimatedDuration)) && Number(doc.estimatedDuration) > 0) {
      endMins = startMins + Math.round(Number(doc.estimatedDuration) * 60);
    } else {
      endMins = startMins + 60; // default 1 hour slot
    }
  }

  return {
    startMins,
    endMins,
    startStr: startStr || 'N/A',
    endStr: endStr || 'N/A'
  };
};

/** Safe socket emit helper with room check */
const emitSafe = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
      console.log(`[Socket Emit] Event '${event}' sent to room '${room}'`);
    }
  } catch (e) {
    console.warn(`[Socket Emit Warning] Could not emit to ${room}:`, e.message);
  }
};

/** Create a Notification doc + emit socket event + FCM fallback */
const notify = async ({
  recipientType, recipientId,
  type, title, message,
  relatedId, relatedType, data
}) => {
  try {
    const doc = { type, title, message, relatedId, relatedType, data: data || {} };
    if (recipientType === 'user')   doc.userId   = recipientId;
    if (recipientType === 'worker') doc.workerId = recipientId;

    let notif = null;
    try {
      notif = await Notification.create(doc);
    } catch (dbErr) {
      console.warn('[Notification DB Create Warning - Non-fatal]:', dbErr?.message);
    }

    const payload = notif ? (notif.toObject ? notif.toObject() : notif) : {
      ...doc,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date()
    };

    const broadcastPayload = {
      ...payload,
      ...(data || {}),
      requestId: relatedId,
      _id: relatedId,
      // Hoist critical fields to top level so frontend doesn't need to dig into .data
      workTitle:       data?.workTitle        || payload.title  || '',
      workCategory:    data?.workCategory     || '',
      workDescription: data?.workDescription  || '',
      farmerName:      data?.farmerName       || 'Farmer',
      farmerId:        data?.farmerId,
      requiredSkills:  data?.requiredSkills   || [],
      requiredWorkers: data?.requiredWorkers  || 1,
      scheduledDate:   data?.scheduledDate,
      startTime:       data?.startTime,
      endTime:         data?.endTime,
      location:        data?.location         || {},
      minRate:         data?.minRate          || 0,
      maxRate:         data?.maxRate          || 0,
      farmerOfferedRate: data?.farmerOfferedRate || data?.minRate || 0,
      rateUnit:        data?.rateUnit         || 'daily',
      isFarmerBroadcast: data?.isFarmerBroadcast !== undefined ? data.isFarmerBroadcast : true,
      data: data || {}
    };

    const idStr = recipientId.toString();
    const rooms = recipientType === 'user'
      ? [`user_${idStr}`, `user:${idStr}`]
      : [`worker_${idStr}`, `worker:${idStr}`];

    rooms.forEach(room => {
      // 1. Generic notification event
      emitSafe(room, 'notification', broadcastPayload);
      // 2. Specific type event (e.g. 'worker_booking_request')
      if (type) {
        emitSafe(room, type, broadcastPayload);
      }
      // 3. Explicit worker alert events (ONLY when the event is an actual booking request and not expired)
      if (recipientType === 'worker' && (type === 'worker_booking_request' || type === 'new_booking_request' || type === 'booking_request')) {
        const isExp = isBookingExpired(data).isExpired;
        if (isExp) {
          console.log(`[NOTIFY SUPPRESSED] Suppressing socket alert for expired booking ${relatedId}`);
          return;
        }
        emitSafe(room, 'worker_booking_request', broadcastPayload);
        emitSafe(room, 'new_booking_request', broadcastPayload);
        emitSafe(room, 'booking_request', broadcastPayload);
      }
      if (recipientType === 'worker' && type === 'group_booking_request') {
        const isExp = isBookingExpired(data).isExpired;
        if (isExp) {
          console.log(`[NOTIFY SUPPRESSED] Suppressing socket alert for expired group booking ${relatedId}`);
          return;
        }
        emitSafe(room, 'group_booking_request', broadcastPayload);
      }
      // 4. Booking update event for refreshing lists
      emitSafe(room, 'worker_booking_update', { requestId: relatedId, type, data });
    });

    // 5. FCM Push Notification Fallback (non-blocking, only for active/valid requests)
    try {
      if (recipientType === 'worker') {
        const isExp = isBookingExpired(data).isExpired;
        if (isExp) {
          console.log(`[FCM SUPPRESSED] Suppressing push alert for expired booking ${relatedId}`);
          return;
        }
        sendNotificationToWorker(recipientId, {
          title: title || '🌾 Work Alert',
          body: message || 'You have a new work request',
          data: {
            type: type || 'worker_booking_request',
            requestId: String(relatedId || ''),
            workTitle: String(broadcastPayload.workTitle || ''),
            farmerName: String(broadcastPayload.farmerName || '')
          }
        }).catch(fcmErr => {
          if (process.env.NODE_ENV !== 'test') {
            console.warn('[FCM Worker Notify Non-fatal]:', fcmErr?.message);
          }
        });
      } else if (recipientType === 'user') {
        sendNotificationToUser(recipientId, {
          title: title || 'AgroYilt Update',
          body: message || '',
          data: {
            type: type || 'notification',
            requestId: String(relatedId || '')
          }
        }).catch(fcmErr => {
          if (process.env.NODE_ENV !== 'test') {
            console.warn('[FCM User Notify Non-fatal]:', fcmErr?.message);
          }
        });
      }
    } catch (fcmSyncErr) {
      console.warn('[FCM Trigger Error Non-fatal]:', fcmSyncErr?.message);
    }
  } catch (e) {
    console.error('[notify error]:', e);
  }
};

/**
 * Check if a specific worker has an active conflicting booking on scheduledDate with overlapping time.
 *
 * Rules:
 * A. SAME WORKER: Only bookings/requests assigned to workerId
 * B. SAME DATE: Exactly matching calendar date (accounting for UTC/local/IST)
 * C. TIME OVERLAP: existingStart < requestedEnd && existingEnd > requestedStart
 * D. STATUS CHECK: Terminal statuses (cancelled, rejected, completed, work_done, settled, expired) do NOT block
 *
 * @param {string|ObjectId} workerId - Candidate worker ID
 * @param {Date|string} scheduledDate - Target work date
 * @param {string} startTime - Requested start time "HH:mm"
 * @param {string} endTime - Requested end time "HH:mm"
 * @param {string|ObjectId} [excludeRequestId=null] - Request ID to exclude from conflict check
 * @returns {Promise<boolean>} - true if conflict exists, false if available
 */
const hasTimeConflict = async (workerId, scheduledDate, startTime, endTime, excludeRequestId = null) => {
  try {
    if (!workerId || !scheduledDate || !startTime || !endTime) {
      console.warn(`[hasTimeConflict] Incomplete parameters: workerId=${workerId}, date=${scheduledDate}, start=${startTime}, end=${endTime}`);
      return false;
    }

    const reqStartMins = parseTimeToMinutes(startTime);
    const reqEndMins = parseTimeToMinutes(endTime);

    if (reqStartMins === null || reqEndMins === null) {
      console.warn(`[hasTimeConflict] Invalid time format for requested slot: start=${startTime}, end=${endTime}`);
      return false;
    }

    const targetDate = (scheduledDate instanceof Date) ? scheduledDate : new Date(scheduledDate);
    if (isNaN(targetDate.getTime())) {
      console.warn(`[hasTimeConflict] Invalid scheduledDate: ${scheduledDate}`);
      return false;
    }

    // 48h search window in MongoDB to ensure timezone shifts (UTC vs IST) are captured
    const windowStart = new Date(targetDate);
    windowStart.setDate(windowStart.getDate() - 1);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(targetDate);
    windowEnd.setDate(windowEnd.getDate() + 1);
    windowEnd.setHours(23, 59, 59, 999);

    const workerObjId = (typeof workerId === 'string' && mongoose.Types.ObjectId.isValid(workerId))
      ? new mongoose.Types.ObjectId(workerId)
      : workerId;

    const excludeObjId = (excludeRequestId && typeof excludeRequestId === 'string' && mongoose.Types.ObjectId.isValid(excludeRequestId))
      ? new mongoose.Types.ObjectId(excludeRequestId)
      : excludeRequestId;

    const reqDateDisplay = getCalendarDateStrings(targetDate)[0] || String(scheduledDate);

    // ── 1. Check Active Bookings ─────────────────────────────────────────────
    // Exclude terminal / inactive statuses: cancelled, rejected, completed, work_done, settled, expired
    const activeBookingStatuses = [
      'confirmed', 'CONFIRMED',
      'in_progress', 'IN_PROGRESS',
      'assigned', 'ASSIGNED',
      'accepted', 'ACCEPTED',
      'journey_started', 'JOURNEY_STARTED',
      'visited', 'VISITED',
      'on_the_way', 'ON_THE_WAY',
      'arrived', 'ARRIVED',
      'pending', 'PENDING'
    ];

    const bookings = await Booking.find({
      workerId: workerObjId,
      scheduledDate: { $gte: windowStart, $lte: windowEnd },
      status: { $in: activeBookingStatuses }
    }).select('_id bookingNumber scheduledDate scheduledTime timeSlot status workerRequestId durationMinutes estimatedDuration').lean();

    for (const b of bookings) {
      if (excludeObjId && b.workerRequestId && b.workerRequestId.toString() === excludeObjId.toString()) {
        continue;
      }

      if (!isSameCalendarDate(targetDate, b.scheduledDate)) {
        continue;
      }

      const { startMins, endMins, startStr, endStr } = extractDocTimeRange(b);
      if (doTimesOverlap(startMins, endMins, reqStartMins, reqEndMins)) {
        const existDateDisplay = getCalendarDateStrings(b.scheduledDate)[0] || String(b.scheduledDate);
        console.log(`[CONFLICT CHECK] Worker: ${workerId} | Requested: ${reqDateDisplay} ${startTime}-${endTime} | Existing Booking (${b.bookingNumber || b._id}): ${existDateDisplay} ${startStr}-${endStr} (Status: ${b.status}) | Conflict: true`);
        return true;
      }
    }

    // ── 2. Check Active WorkerBookingRequests ────────────────────────────────
    const activeReqStatuses = [
      'accepted', 'awaiting_farmer_confirmation', 'confirmed', 'in_progress', 'partially_completed'
    ];

    const reqQuery = {
      scheduledDate: { $gte: windowStart, $lte: windowEnd },
      status: { $in: activeReqStatuses },
      $or: [
        { workerId: workerObjId },
        { selectedWorkerIds: workerObjId },
        { finalWorkers: workerObjId },
        { 'dispatchedTo': { $elemMatch: { workerId: workerObjId, status: 'accepted' } } }
      ]
    };

    if (excludeObjId) {
      reqQuery._id = { $ne: excludeObjId };
    }

    const activeRequests = await WorkerBookingRequest.find(reqQuery)
      .select('_id scheduledDate startTime endTime status workTitle')
      .lean();

    for (const r of activeRequests) {
      if (!isSameCalendarDate(targetDate, r.scheduledDate)) {
        continue;
      }

      const { startMins, endMins, startStr, endStr } = extractDocTimeRange(r);
      if (doTimesOverlap(startMins, endMins, reqStartMins, reqEndMins)) {
        const existDateDisplay = getCalendarDateStrings(r.scheduledDate)[0] || String(r.scheduledDate);
        console.log(`[CONFLICT CHECK] Worker: ${workerId} | Requested: ${reqDateDisplay} ${startTime}-${endTime} | Existing Request (${r._id}): ${existDateDisplay} ${startStr}-${endStr} (Status: ${r.status}) | Conflict: true`);
        return true;
      }
    }

    // ── 3. Check Active WorkerGroupRequests ──────────────────────────────────
    const groupRequests = await WorkerGroupRequest.find({
      selectedWorkers: workerObjId,
      scheduledDate: { $gte: windowStart, $lte: windowEnd },
      status: { $in: ['confirmed', 'selection_pending', 'collecting_members'] }
    }).select('_id scheduledDate startTime endTime status workTitle').lean();

    for (const g of groupRequests) {
      if (!isSameCalendarDate(targetDate, g.scheduledDate)) {
        continue;
      }

      const { startMins, endMins, startStr, endStr } = extractDocTimeRange(g);
      if (doTimesOverlap(startMins, endMins, reqStartMins, reqEndMins)) {
        const existDateDisplay = getCalendarDateStrings(g.scheduledDate)[0] || String(g.scheduledDate);
        console.log(`[CONFLICT CHECK] Worker: ${workerId} | Requested: ${reqDateDisplay} ${startTime}-${endTime} | Existing GroupRequest (${g._id}): ${existDateDisplay} ${startStr}-${endStr} (Status: ${g.status}) | Conflict: true`);
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error(`[hasTimeConflict ERROR] Failed to evaluate conflict for worker ${workerId}:`, err);
    throw err;
  }
};

/** Load Admin settings from DB; never returns hardcoded defaults */
const loadAdminSettings = async () => {
  let settings = await Settings.findOne({ type: 'global' });
  if (!settings) {
    settings = await Settings.create({ type: 'global' });
  }
  return {
    maxIndependentWorkerRequest: settings.maxIndependentWorkerRequest ?? 5,
    workerSearchRadiusKm:        settings.workerSearchRadiusKm        ?? 50  // 50km default for rural India
  };
};

// ─── DAILY Conflict Engine ─────────────────────────────────────────────────────
/**
 * Check if a worker has an active DAILY booking that overlaps with the requested date range.
 *
 * DAILY conflict rule: existingStartDate <= requestedEndDate AND existingEndDate >= requestedStartDate
 * This is DATE-range overlap, NOT time overlap.
 *
 * @param {string|ObjectId} workerId
 * @param {Date} requestedStartDate  - DAILY start date
 * @param {Date} requestedEndDate    - DAILY end date (= startDate + numberOfDays - 1)
 * @param {string|ObjectId} [excludeRequestId=null]
 * @returns {Promise<boolean>}
 */
const hasDailyConflict = async (workerId, requestedStartDate, requestedEndDate, excludeRequestId = null) => {
  try {
    if (!workerId || !requestedStartDate || !requestedEndDate) {
      console.warn(`[hasDailyConflict] Incomplete parameters`);
      return false;
    }

    const rStart = new Date(requestedStartDate);
    const rEnd   = new Date(requestedEndDate);
    if (isNaN(rStart.getTime()) || isNaN(rEnd.getTime())) {
      console.warn(`[hasDailyConflict] Invalid date range`);
      return false;
    }

    const workerObjId = (typeof workerId === 'string' && mongoose.Types.ObjectId.isValid(workerId))
      ? new mongoose.Types.ObjectId(workerId)
      : workerId;

    const excludeObjId = (excludeRequestId && typeof excludeRequestId === 'string' && mongoose.Types.ObjectId.isValid(excludeRequestId))
      ? new mongoose.Types.ObjectId(excludeRequestId)
      : excludeRequestId;

    // Active DAILY statuses that block new bookings
    const activeStatuses = ['accepted', 'awaiting_farmer_confirmation', 'confirmed', 'matching', 'pending'];

    // Check WorkerBookingRequest (DAILY) for date-range overlap
    const reqQuery = {
      bookingType:  'DAILY',
      status:       { $in: activeStatuses },
      startDate:    { $lte: rEnd },    // existingStart <= requestedEnd
      endDate:      { $gte: rStart },  // existingEnd   >= requestedStart
      $or: [
        { selectedWorkerIds: workerObjId },
        { finalWorkers:      workerObjId },
        { 'dispatchedTo':    { $elemMatch: { workerId: workerObjId, status: 'accepted' } } }
      ]
    };
    if (excludeObjId) reqQuery._id = { $ne: excludeObjId };

    const conflictingRequest = await WorkerBookingRequest.findOne(reqQuery).select('_id startDate endDate status').lean();
    if (conflictingRequest) {
      console.log(`[DAILY CONFLICT] Worker ${workerId} has conflicting DAILY booking (requestId: ${conflictingRequest._id}) ` +
        `dates ${conflictingRequest.startDate?.toISOString?.()?.slice(0,10)} - ${conflictingRequest.endDate?.toISOString?.()?.slice(0,10)}`);
      return true;
    }

    // Check IndWorkerAssignment (DAILY confirmed) for date-range overlap
    const parentRequests = await WorkerBookingRequest.find({
      bookingType: 'DAILY',
      status:      { $in: ['confirmed', 'completed'] },
      startDate:   { $lte: rEnd },
      endDate:     { $gte: rStart }
    }).select('_id').lean();

    if (parentRequests.length > 0) {
      const parentIds = parentRequests.map(r => r._id);
      const conflictingAssignment = await IndWorkerAssignment.findOne({
        workerId:         workerObjId,
        bookingType:      'DAILY',
        assignmentStatus: { $ne: 'CANCELLED' },
        parentRequestId:  { $in: parentIds }
      }).select('_id').lean();

      if (conflictingAssignment && (!excludeObjId || !parentIds.some(id => id.toString() === excludeObjId?.toString()))) {
        console.log(`[DAILY CONFLICT] Worker ${workerId} has overlapping DAILY assignment ${conflictingAssignment._id}`);
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error(`[hasDailyConflict ERROR] Worker ${workerId}:`, err);
    throw err;
  }
};


/** Normalize skills: lowercase, trim, deduplicate */
const normalizeSkills = (skills) => {
  if (!Array.isArray(skills)) return [];
  return [...new Set(
    skills
      .map(s => (typeof s === 'string' ? s.trim().toLowerCase() : ''))
      .filter(Boolean)
  )];
};

/**
 * Check if worker skills match required skills.
 * If worker has 'ALL' (case-insensitive), it matches any required skills!
 * Otherwise, if requiredSkills is empty or any required skill matches worker skills / service categories, it matches.
 */
const isWorkerSkillMatch = (workerSkills = [], requiredSkills = [], workerCategories = []) => {
  if (!requiredSkills || requiredSkills.length === 0) return true;
  const wSkills = Array.isArray(workerSkills) ? workerSkills.map(s => String(s).trim().toLowerCase()) : [];
  if (wSkills.includes('all')) return true;

  const wCats = Array.isArray(workerCategories) ? workerCategories.map(c => String(c).trim().toLowerCase()) : [];
  const reqNormalized = requiredSkills.map(s => String(s).trim().toLowerCase()).filter(Boolean);

  if (reqNormalized.length === 0) return true;

  for (const req of reqNormalized) {
    const matched = wSkills.some(ws => ws === req || ws.includes(req) || req.includes(ws)) ||
                    wCats.some(wc => wc === req || wc.includes(req) || req.includes(wc));
    if (matched) return true;
  }
  return false;
};



const validateRequestPayload = (body) => {
  const {
    workCategory, workTitle, workDescription,
    requiredSkills, requiredWorkers,
    scheduledDate, startTime, endTime, rateUnit,
    location, minRate, maxRate
  } = body;

  const errors = [];

  if (!workTitle || workTitle.trim().length < 3)
    errors.push('Work title must be at least 3 characters.');
  if (!workDescription || workDescription.trim().length < 10)
    errors.push('Work description must be at least 10 characters.');

  const workerQty = parseInt(requiredWorkers, 10);
  if (!requiredWorkers || isNaN(workerQty) || workerQty < 1 || !Number.isInteger(workerQty))
    errors.push('Required workers must be a positive integer.');

  if (!scheduledDate)
    errors.push('Scheduled date is required.');
  else {
    const d = new Date(scheduledDate);
    if (isNaN(d.getTime()))  errors.push('Invalid scheduled date.');
    else if (d < new Date(new Date().setHours(0, 0, 0, 0)))
      errors.push('Scheduled date cannot be in the past.');
  }

  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime))
    errors.push('Start time must be in HH:mm format.');
  if (!endTime || !/^\d{2}:\d{2}$/.test(endTime))
    errors.push('End time must be in HH:mm format.');
  if (startTime && endTime && toMins(endTime) <= toMins(startTime))
    errors.push('End time must be after start time.');

  if (!location || (!location.city && !location.addressLine1))
    errors.push('Work location (city or address) is required.');

  // Validate rates
  const min = Number(minRate);
  const max = Number(maxRate);
  if (!minRate && !maxRate) {
    errors.push('Budget/rate is required.');
  } else {
    if (isNaN(min) || !isFinite(min) || min <= 0)
      errors.push('Minimum rate must be a positive finite number.');
    if (maxRate !== undefined && maxRate !== null && maxRate !== '') {
      if (isNaN(max) || !isFinite(max) || max <= 0)
        errors.push('Maximum rate must be a positive finite number.');
      if (min > max)
        errors.push('Minimum rate cannot exceed maximum rate.');
    }
  }

  return errors;
};

// ─── DAILY Request Payload Validator ──────────────────────────────────────────
/**
 * Validate DAILY booking payload.
 * DAILY: uses startDate + numberOfDays + endDate (backend computes endDate).
 * Does NOT require startTime/endTime (DAILY has no hourly timer).
 */
const validateDailyRequestPayload = (body) => {
  const {
    workTitle, workDescription, requiredWorkers,
    startDate, numberOfDays, location,
    minDailyRate, maxDailyRate
  } = body;

  const errors = [];

  if (!workTitle || workTitle.trim().length < 3)
    errors.push('Work title must be at least 3 characters.');
  if (!workDescription || workDescription.trim().length < 10)
    errors.push('Work description must be at least 10 characters.');

  const workerQty = parseInt(requiredWorkers, 10);
  if (!requiredWorkers || isNaN(workerQty) || workerQty < 1)
    errors.push('Required workers must be a positive integer.');

  // startDate validation
  if (!startDate)
    errors.push('Start date is required for DAILY booking.');
  else {
    const d = new Date(startDate);
    if (isNaN(d.getTime()))   errors.push('Invalid start date.');
    else if (d < new Date(new Date().setHours(0, 0, 0, 0)))
      errors.push('Start date cannot be in the past.');
  }

  // numberOfDays validation
  const numDays = parseInt(numberOfDays, 10);
  if (!numberOfDays || isNaN(numDays) || numDays < 1)
    errors.push('Number of days must be at least 1.');
  if (numDays > 365)
    errors.push('Number of days cannot exceed 365.');

  if (!location || (!location.city && !location.addressLine1))
    errors.push('Work location (city or address) is required.');

  // Rate validation for DAILY
  const minD = Number(minDailyRate);
  const maxD = Number(maxDailyRate);
  if (!minDailyRate && !maxDailyRate)
    errors.push('Daily rate budget is required (minDailyRate or maxDailyRate).');
  else {
    if (isNaN(minD) || !isFinite(minD) || minD <= 0)
      errors.push('Minimum daily rate must be a positive finite number.');
    if (maxDailyRate !== undefined && maxDailyRate !== null && maxDailyRate !== '') {
      if (isNaN(maxD) || !isFinite(maxD) || maxD <= 0)
        errors.push('Maximum daily rate must be a positive finite number.');
      if (minD > maxD)
        errors.push('Minimum daily rate cannot exceed maximum daily rate.');
    }
  }

  return errors;
};

// â”€â”€â”€ Controller: createFarmerRequest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * POST /api/user/farmer-worker-request
 * Farmer submits a job requirement. Backend auto-routes to Independent or Team Leader flow.
 * Supports HOURLY (scheduledDate + startTime + endTime) and DAILY (startDate + numberOfDays).
 */
exports.createFarmerRequest = async (req, res) => {
  try {
    const farmerId = req.user._id; // always from auth token

    // Detect booking type: DAILY if body contains startDate + numberOfDays, else HOURLY
    // Frontend hint is accepted but backend validates the type's required fields.
    const rawBookingType = (req.body.bookingType || '').toUpperCase();
    const isDaily = rawBookingType === 'DAILY' || (req.body.startDate && req.body.numberOfDays && !req.body.scheduledDate);
    const bookingType = isDaily ? 'DAILY' : 'HOURLY';

    const {
      workCategory, workTitle, workDescription,
      requiredSkills, additionalInstructions,
      requiredWorkers,
      // HOURLY fields
      scheduledDate, startTime, endTime, rateUnit,
      minRate, maxRate,
      // DAILY fields
      startDate, numberOfDays,
      minDailyRate, maxDailyRate,
      // common
      location
    } = req.body;

    // ── Validate per bookingType ─────────────────────────────────────────────
    const errors = isDaily
      ? validateDailyRequestPayload(req.body)
      : validateRequestPayload(req.body);
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const workerQty    = parseInt(requiredWorkers, 10);
    const normalSkills = normalizeSkills(requiredSkills);

    // ── Load Admin settings ────────────────────────────────────────────────
    const adminSettings = await loadAdminSettings();
    const { maxIndependentWorkerRequest, workerSearchRadiusKm } = adminSettings;

    // ── Routing decision (backend only) ────────────────────────────────────
    const requestType = workerQty <= maxIndependentWorkerRequest
      ? 'independent_broadcast'
      : 'team_leader';

    // ── HOURLY duplicate guard ────────────────────────────────────────────
    if (!isDaily) {
      const scheduledDateObj = new Date(scheduledDate);
      const dateStart = new Date(scheduledDateObj); dateStart.setHours(0, 0, 0, 0);
      const dateEnd   = new Date(dateStart);         dateEnd.setHours(23, 59, 59, 999);

      const existingActive = await WorkerBookingRequest.findOne({
        farmerId,
        bookingType:   'HOURLY',
        requestType:   'independent_broadcast',
        scheduledDate: { $gte: dateStart, $lte: dateEnd },
        startTime,
        status: { $in: ['pending', 'matching', 'awaiting_farmer_confirmation'] }
      });
      if (existingActive) {
        return res.status(409).json({
          success: false,
          message: 'You already have an active HOURLY worker request for this date and time.'
        });
      }
    }

    // ── DAILY duplicate guard ─────────────────────────────────────────────
    if (isDaily) {
      const sDate = new Date(startDate);
      const numD  = parseInt(numberOfDays, 10);
      const eDate = new Date(sDate);
      eDate.setDate(eDate.getDate() + numD - 1);
      eDate.setHours(23, 59, 59, 999);

      const existingDaily = await WorkerBookingRequest.findOne({
        farmerId,
        bookingType: 'DAILY',
        startDate:   { $lte: eDate },
        endDate:     { $gte: sDate },
        status: { $in: ['pending', 'matching', 'awaiting_farmer_confirmation'] }
      });
      if (existingDaily) {
        return res.status(409).json({
          success: false,
          message: 'You already have an active DAILY worker request overlapping these dates.'
        });
      }
    }

    // ── Build request document ─────────────────────────────────────────────
    let requestDoc = {
      farmerId,
      bookingType,
      workCategory:    workCategory?.trim() || '',
      workTitle:       workTitle.trim(),
      workDescription: workDescription.trim(),
      requiredSkills:  normalSkills,
      additionalInstructions: additionalInstructions?.trim() || '',
      requiredWorkers: workerQty,
      location: {
        addressLine1: location?.addressLine1 || '',
        city:         location?.city         || '',
        state:        location?.state        || '',
        pincode:      location?.pincode      || '',
        lat:  (location?.lat !== undefined && !isNaN(Number(location.lat))) ? Number(location.lat) : undefined,
        lng:  (location?.lng !== undefined && !isNaN(Number(location.lng))) ? Number(location.lng) : undefined
      },
      requestType,
      bookingMode: workerQty <= maxIndependentWorkerRequest ? 'INDEPENDENT_WORKERS' : 'TEAM_LEADER',
      independentWorkerLimitSnapshot: maxIndependentWorkerRequest,
      routingSnapshot: {
        maxIndependentWorkerRequest,
        workerSearchRadiusKm
      },
      status: 'matching',
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS)
    };

    if (isDaily) {
      const sDate  = new Date(startDate);
      const numD   = parseInt(numberOfDays, 10);
      const eDate  = new Date(sDate);
      eDate.setDate(eDate.getDate() + numD - 1);
      eDate.setHours(23, 59, 59, 999);
      const effMinDailyRate = Number(minDailyRate) || 0;
      const effMaxDailyRate = maxDailyRate ? Number(maxDailyRate) : effMinDailyRate;
      Object.assign(requestDoc, {
        rateUnit:     'daily',
        startDate:    sDate,
        endDate:      eDate,
        numberOfDays: numD,
        minDailyRate: effMinDailyRate,
        maxDailyRate: effMaxDailyRate,
        minRate:      effMinDailyRate,
        maxRate:      effMaxDailyRate
      });
    } else {
      const scheduledDateObj = new Date(scheduledDate);
      const effMinRate = Number(minRate) || 0;
      const effMaxRate = maxRate ? Number(maxRate) : effMinRate;

      let calcDurationMinutes = 60;
      if (startTime && endTime) {
        const [sH, sM] = startTime.split(':').map(Number);
        const [eH, eM] = endTime.split(':').map(Number);
        if (!isNaN(sH) && !isNaN(eH)) {
          let diffMinutes = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
          if (diffMinutes < 0) diffMinutes += 24 * 60;
          if (diffMinutes > 0) calcDurationMinutes = diffMinutes;
        }
      }

      Object.assign(requestDoc, {
        rateUnit:          'hourly',
        durationMinutes:   calcDurationMinutes,
        scheduledDate:     scheduledDateObj,
        startTime,
        endTime,
        minRate:           effMinRate,
        maxRate:           effMaxRate,
        farmerOfferedRate: effMinRate
      });
    }

    // Server-Side Scheduled Window Expiry:
    // A booking must never expire after its scheduled window has elapsed!
    const scheduledEnd = getBookingScheduledExpiry(requestDoc);
    if (scheduledEnd.getTime() <= Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create a booking request for a scheduled time window that has already passed.'
      });
    }
    requestDoc.expiresAt = new Date(Math.min(scheduledEnd.getTime(), Date.now() + REQUEST_TTL_MS));

    const newRequest = await WorkerBookingRequest.create(requestDoc);

    if (requestType === 'independent_broadcast') {
      if (isDaily) {
        await dispatchToIndependentWorkersForDaily({
          request: newRequest,
          requiredSkills: normalSkills,
          startDate: new Date(newRequest.startDate),
          endDate:   new Date(newRequest.endDate),
          workerLocation: location,
          radiusKm: workerSearchRadiusKm
        });
      } else {
        await dispatchToIndependentWorkers({
          request: newRequest,
          requiredSkills: normalSkills,
          scheduledDate: new Date(newRequest.scheduledDate),
          startTime: newRequest.startTime,
          endTime:   newRequest.endTime,
          workerLocation: location,
          radiusKm: workerSearchRadiusKm
        });
      }
    } else {
      await dispatchToTeamLeaders({
        request: newRequest,
        requiredSkills: normalSkills,
        requiredWorkers: workerQty,
        scheduledDate: newRequest.scheduledDate ? new Date(newRequest.scheduledDate) : null,
        startTime: newRequest.startTime,
        endTime:   newRequest.endTime,
        workerLocation: location,
        radiusKm: workerSearchRadiusKm
      });
    }

    const savedRequest = await WorkerBookingRequest.findById(newRequest._id);

    return res.status(201).json({
      success: true,
      message: requestType === 'independent_broadcast'
        ? `${bookingType} request created. Matching workers within ${workerSearchRadiusKm} km...`
        : `Request created. Searching for Team Leaders within ${workerSearchRadiusKm} km...`,
      data: savedRequest,
      routing: requestType,
      bookingType
    });

  } catch (err) {
    console.error('[createFarmerRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to create worker request.' });
  }
};

// â”€â”€â”€ Dispatch to Independent Workers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// ════════════════════════════════════════════════════════════════════════════
// SMART DISPATCH ENGINE — Implements A1, A2, A3, A4, A7
// ════════════════════════════════════════════════════════════════════════════

/**
 * A3: Compute LIVE available member count for a team leader on a given date range.
 * "Available" means the member has no active assignment on that date.
 * @returns {Promise<number>} — count of available members (NOT including the leader themselves)
 */
async function getLiveTeamCapacity(leaderId, bookingType, schedule) {
  try {
    const leader = await Worker.findById(leaderId).select('teamId').lean();
    if (!leader?.teamId) return 0;

    // All members of this team (excluding leader)
    const members = await Worker.find({
      teamId:   leader.teamId,
      _id:      { $ne: leaderId },
      isActive: { $ne: false }
    }).select('_id').lean();

    if (!members.length) return 0;
    const memberIds = members.map(m => m._id);
    const busySet = new Set();

    if (bookingType === 'DAILY') {
      const { startDate, endDate } = schedule;
      const busyRequests = await WorkerBookingRequest.find({
        bookingType: 'DAILY',
        startDate:   { $lte: new Date(endDate) },
        endDate:     { $gte: new Date(startDate) },
        status:      { $in: ['confirmed', 'in_progress', 'pending', 'awaiting_farmer_confirmation'] },
        $or: [
          { selectedWorkerIds: { $in: memberIds } },
          { finalWorkers:      { $in: memberIds } },
          { dispatchedTo: { $elemMatch: { workerId: { $in: memberIds }, status: 'accepted' } } }
        ]
      }).select('selectedWorkerIds finalWorkers dispatchedTo').lean();

      for (const r of busyRequests) {
        for (const id of (r.selectedWorkerIds || [])) busySet.add(id.toString());
        for (const id of (r.finalWorkers      || [])) busySet.add(id.toString());
        for (const d  of (r.dispatchedTo      || [])) {
          if (d.status === 'accepted') busySet.add(d.workerId.toString());
        }
      }
    } else {
      // HOURLY — individual time-conflict check per member
      const { scheduledDate, startTime, endTime } = schedule;
      for (const m of members) {
        const conflict = await hasTimeConflict(m._id, scheduledDate, startTime, endTime);
        if (conflict) busySet.add(m._id.toString());
      }
    }

    return Math.max(0, members.length - busySet.size);
  } catch (err) {
    console.error('[getLiveTeamCapacity]', err);
    return 0;
  }
}

/**
 * Build a MongoDB query for Workers matching required skills.
 */
function buildSkillQuery(requiredSkills, extra = {}) {
  const base = {
    $or: [
      { approvalStatus: { $in: ['approved', 'APPROVED', 'pending', 'PENDING'] } },
      { approvalStatus: { $exists: false } }
    ],
    isActive: { $ne: false },
    ...extra
  };

  if (!requiredSkills || !requiredSkills.length) return base;

  const regex = requiredSkills.map(s => new RegExp(`^${s}$`, 'i'));
  const words = requiredSkills
    .flatMap(s => (typeof s === 'string' ? s.split(/[\s,]+/) : []))
    .filter(w => w && w.length > 2);
  words.forEach(w => regex.push(new RegExp(w, 'i')));

  return {
    ...base,
    $and: [{
      $or: [
        { skills:             { $in: regex } },
        { primaryService:     { $in: regex } },
        { serviceCategory:    { $in: regex } },
        { serviceCategories:  { $in: regex } }
      ]
    }]
  };
}

/**
 * A2: Sort workers into 3 distance waves.
 * Wave 0: 0-5 km, Wave 1: 5-15 km, Wave 2: 15+ km
 */
function sortIntoWaves(workers, farmLat, farmLng) {
  if (farmLat === undefined || farmLng === undefined ||
      isNaN(Number(farmLat)) || isNaN(Number(farmLng))) {
    return [workers, [], []]; // No location — all in one wave
  }

  const wave0 = [], wave1 = [], wave2 = [];
  for (const w of workers) {
    const lat = Number(w.location?.lat);
    const lng = Number(w.location?.lng);
    if (isNaN(lat) || isNaN(lng)) {
      wave1.push(w); // No coords — mid bucket
      continue;
    }
    const dist = calculateDistance({ lat: Number(farmLat), lng: Number(farmLng) }, { lat, lng });
    w._distKm = dist;
    if      (dist <=  5) wave0.push(w);
    else if (dist <= 15) wave1.push(w);
    else                  wave2.push(w);
  }

  wave0.sort((a, b) => (a._distKm || 0) - (b._distKm || 0));
  wave1.sort((a, b) => (a._distKm || 0) - (b._distKm || 0));
  wave2.sort((a, b) => (a._distKm || 0) - (b._distKm || 0));
  return [wave0, wave1, wave2];
}

/**
 * Persist a dispatch wave to DB + fire FCM/socket notifications.
 * @param {Object}  request
 * @param {Array}   workers
 * @param {string}  farmerName
 * @param {boolean} isSubsequentWave — if true, appends to existing dispatchedTo
 */
async function dispatchWave(request, workers, farmerName, isSubsequentWave = false) {
  if (!workers.length) return;

  const newEntries = workers.map(w => ({ workerId: w._id, status: 'pending' }));

  if (isSubsequentWave) {
    await WorkerBookingRequest.findByIdAndUpdate(request._id, {
      $push: { dispatchedTo: { $each: newEntries } },
      $inc:  { dispatchedWorkersCount: workers.length, eligibleWorkersCount: workers.length }
    });
  } else {
    await WorkerBookingRequest.findByIdAndUpdate(request._id, {
      $set: {
        eligibleWorkersCount:   workers.length,
        dispatchedWorkersCount: workers.length,
        dispatchedTo:           newEntries,
        status:                 'pending'
      }
    });
  }

  // Build notification payload
  const notifData = {
    requestId:        request._id,
    _id:              request._id,
    farmerId:         request.farmerId,
    farmerName,
    workTitle:        request.workTitle,
    workCategory:     request.workCategory,
    workDescription:  request.workDescription,
    requiredSkills:   request.requiredSkills,
    requiredWorkers:  request.requiredWorkers,
    location:         request.location,
    rateUnit:         request.rateUnit,
    isFarmerBroadcast: true
  };

  if (request.bookingType === 'DAILY') {
    Object.assign(notifData, {
      bookingType:  'DAILY',
      startDate:    request.startDate,
      endDate:      request.endDate,
      numberOfDays: request.numberOfDays,
      minRate:      request.minDailyRate,
      maxRate:      request.maxDailyRate
    });
  } else {
    Object.assign(notifData, {
      scheduledDate:     request.scheduledDate,
      startTime:         request.startTime,
      endTime:           request.endTime,
      minRate:           request.minRate,
      maxRate:           request.maxRate,
      farmerOfferedRate: request.farmerOfferedRate || request.minRate
    });
  }

  for (const w of workers) {
    const isLeader = ['TEAM_LEADER', 'team_leader', 'LEADER', 'leader'].includes(w.workerType);
    await notify({
      recipientType: 'worker',
      recipientId:   w._id,
      type:          isLeader ? 'group_booking_request' : 'worker_booking_request',
      title:         isLeader ? '🌾 New Group Work Request' : '🌾 New Work Request',
      message:       `A farmer needs ${request.requiredWorkers} worker(s) for ${request.workTitle}`,
      relatedId:     request._id,
      relatedType:   'WorkerBookingRequest',
      data:          notifData
    });
  }
}

/**
 * A7: After delayMs, if no Team Leader has accepted, auto-fall back to independent worker pool.
 */
async function scheduleTeamLeaderFallback(request, normalSkills, radiusKm, delayMs = 30 * 60 * 1000) {
  setTimeout(async () => {
    try {
      const fresh = await WorkerBookingRequest.findById(request._id).lean();
      if (!fresh) return;

      const terminalStatuses = ['accepted', 'awaiting_farmer_confirmation', 'confirmed', 'cancelled', 'expired', 'rejected', 'completed'];
      if (terminalStatuses.includes(fresh.status)) return;

      const anyAccepted = (fresh.dispatchedTo || []).some(d => d.status === 'accepted');
      if (anyAccepted) return;

      console.log(`[FALLBACK A7] No TL accepted request ${request._id} after ${delayMs / 60000}min — re-dispatching to independent workers.`);

      await WorkerBookingRequest.findByIdAndUpdate(request._id, {
        bookingMode:  'INDEPENDENT_WORKERS',
        requestType:  'independent_broadcast',
        dispatchedTo: [],
        status:       'matching'
      });

      const updatedReq = await WorkerBookingRequest.findById(request._id);
      if (!updatedReq) return;

      if (updatedReq.bookingType === 'DAILY') {
        await dispatchToIndependentWorkersForDaily({
          request: updatedReq, requiredSkills: normalSkills,
          startDate: updatedReq.startDate, endDate: updatedReq.endDate,
          workerLocation: updatedReq.location, radiusKm
        });
      } else {
        await dispatchToIndependentWorkers({
          request: updatedReq, requiredSkills: normalSkills,
          scheduledDate: updatedReq.scheduledDate,
          startTime: updatedReq.startTime, endTime: updatedReq.endTime,
          workerLocation: updatedReq.location, radiusKm
        });
      }
    } catch (err) {
      console.error('[scheduleTeamLeaderFallback ERROR]', err);
    }
  }, delayMs);
}

// ─── A1+A2: Dispatch to Independent Workers (HOURLY) ──────────────────────────
async function dispatchToIndependentWorkers({
  request, requiredSkills, scheduledDate, startTime, endTime,
  workerLocation, radiusKm
}) {
  try {
    if (isBookingExpired(request).isExpired) {
      console.log(`[DISPATCH CANCELLED] Request ${request._id} has already expired.`);
      await expireWorkerBookingRequest(request, 'Expired before worker dispatch');
      return;
    }

    // A1: Equal pool — all active workers + free Team Leaders (no workerType filter)
    let candidates = await Worker.find(buildSkillQuery(requiredSkills))
      .select('_id name workerType skills primaryService serviceCategory serviceCategories location address status fcmTokens approvalStatus isActive teamId')
      .lean();

    if (!candidates.length) {
      candidates = await Worker.find({ isActive: { $ne: false } })
        .select('_id name workerType skills primaryService serviceCategory serviceCategories location address status fcmTokens approvalStatus isActive teamId')
        .lean();
    }

    // Filter by HOURLY time conflict
    const available = [];
    for (const w of candidates) {
      try {
        const conflict = await hasTimeConflict(w._id, scheduledDate, startTime, endTime, request._id);
        if (!conflict) available.push(w);
      } catch (_) {}
    }

    let farmerName = 'Farmer';
    try {
      const f = await User.findById(request.farmerId).select('name').lean();
      if (f?.name) farmerName = f.name;
    } catch (_) {}

    // A2: Wave-wise dispatch by proximity
    const [wave0, wave1, wave2] = sortIntoWaves(available, workerLocation?.lat, workerLocation?.lng);
    console.log(`[HOURLY DISPATCH] Wave0(0-5km): ${wave0.length} | Wave1(5-15km): ${wave1.length} | Wave2(15km+): ${wave2.length}`);

    // Dispatch wave 0 immediately (or fallback to next if empty)
    const firstWave = wave0.length ? wave0 : wave1.length ? wave1 : wave2;
    await dispatchWave(request, firstWave, farmerName, false);

    // Wave 1 after 10 minutes (only if wave0 ran first)
    if (wave0.length && wave1.length) {
      setTimeout(async () => {
        const fresh = await WorkerBookingRequest.findById(request._id).lean();
        if (!fresh || ['confirmed', 'awaiting_farmer_confirmation', 'cancelled', 'expired', 'rejected'].includes(fresh.status)) return;
        if ((fresh.dispatchedTo || []).filter(d => d.status === 'accepted').length >= request.requiredWorkers) return;
        console.log(`[HOURLY DISPATCH] Wave1 — dispatching ${wave1.length} more for request ${request._id}`);
        await dispatchWave(request, wave1, farmerName, true);
      }, 10 * 60 * 1000);
    }

    // Wave 2 after 20 minutes
    if (wave2.length && (wave0.length || wave1.length)) {
      setTimeout(async () => {
        const fresh = await WorkerBookingRequest.findById(request._id).lean();
        if (!fresh || ['confirmed', 'awaiting_farmer_confirmation', 'cancelled', 'expired', 'rejected'].includes(fresh.status)) return;
        if ((fresh.dispatchedTo || []).filter(d => d.status === 'accepted').length >= request.requiredWorkers) return;
        console.log(`[HOURLY DISPATCH] Wave2 — dispatching ${wave2.length} more for request ${request._id}`);
        await dispatchWave(request, wave2, farmerName, true);
      }, 20 * 60 * 1000);
    }

  } catch (err) {
    console.error('[dispatchToIndependentWorkers]', err);
    await WorkerBookingRequest.findByIdAndUpdate(request._id, { status: 'pending' });
  }
}

// ─── A1+A2: Dispatch to Independent Workers (DAILY) ───────────────────────────
async function dispatchToIndependentWorkersForDaily({
  request, requiredSkills, startDate, endDate, workerLocation, radiusKm
}) {
  try {
    if (isBookingExpired(request).isExpired) {
      console.log(`[DISPATCH CANCELLED] DAILY Request ${request._id} has already expired.`);
      await expireWorkerBookingRequest(request, 'Expired before worker dispatch');
      return;
    }

    // A1: Equal pool
    let candidates = await Worker.find(buildSkillQuery(requiredSkills))
      .select('_id name workerType skills primaryService serviceCategory serviceCategories location address status fcmTokens approvalStatus isActive teamId')
      .lean();

    if (!candidates.length) {
      candidates = await Worker.find({ isActive: { $ne: false } })
        .select('_id name workerType skills primaryService serviceCategory serviceCategories location address status fcmTokens approvalStatus isActive teamId')
        .lean();
    }

    const available = [];
    for (const w of candidates) {
      try {
        const conflict = await hasDailyConflict(w._id, startDate, endDate, request._id);
        if (!conflict) available.push(w);
      } catch (_) {}
    }

    let farmerName = 'Farmer';
    try {
      const f = await User.findById(request.farmerId).select('name').lean();
      if (f?.name) farmerName = f.name;
    } catch (_) {}

    // A2: Wave-wise dispatch
    const [wave0, wave1, wave2] = sortIntoWaves(available, workerLocation?.lat, workerLocation?.lng);
    console.log(`[DAILY DISPATCH] Wave0(0-5km): ${wave0.length} | Wave1(5-15km): ${wave1.length} | Wave2(15km+): ${wave2.length}`);

    const firstWave = wave0.length ? wave0 : wave1.length ? wave1 : wave2;
    await dispatchWave(request, firstWave, farmerName, false);

    if (wave0.length && wave1.length) {
      setTimeout(async () => {
        const fresh = await WorkerBookingRequest.findById(request._id).lean();
        if (!fresh || ['confirmed', 'awaiting_farmer_confirmation', 'cancelled', 'expired', 'rejected'].includes(fresh.status)) return;
        if ((fresh.dispatchedTo || []).filter(d => d.status === 'accepted').length >= request.requiredWorkers) return;
        await dispatchWave(request, wave1, farmerName, true);
      }, 10 * 60 * 1000);
    }

    if (wave2.length && (wave0.length || wave1.length)) {
      setTimeout(async () => {
        const fresh = await WorkerBookingRequest.findById(request._id).lean();
        if (!fresh || ['confirmed', 'awaiting_farmer_confirmation', 'cancelled', 'expired', 'rejected'].includes(fresh.status)) return;
        if ((fresh.dispatchedTo || []).filter(d => d.status === 'accepted').length >= request.requiredWorkers) return;
        await dispatchWave(request, wave2, farmerName, true);
      }, 20 * 60 * 1000);
    }

  } catch (err) {
    console.error('[dispatchToIndependentWorkersForDaily]', err);
    await WorkerBookingRequest.findByIdAndUpdate(request._id, { status: 'pending' });
  }
}

// ─── A3+A4+A7: Dispatch to Team Leaders ───────────────────────────────────────
async function dispatchToTeamLeaders({
  request, requiredSkills, requiredWorkers,
  scheduledDate, startTime, endTime,
  workerLocation, radiusKm
}) {
  try {
    if (isBookingExpired(request).isExpired) {
      console.log(`[DISPATCH CANCELLED] Team Leader Request ${request._id} has already expired.`);
      await expireWorkerBookingRequest(request, 'Expired before leader dispatch');
      return;
    }

    const leaderQuery = {
      $or: [
        { approvalStatus: { $in: ['approved', 'APPROVED', 'pending', 'PENDING'] } },
        { approvalStatus: { $exists: false } }
      ],
      isActive:   { $ne: false },
      workerType: { $in: ['TEAM_LEADER', 'team_leader', 'LEADER', 'leader'] }
    };

    let leaders = await Worker.find(leaderQuery)
      .select('_id name skills workerType location status teamId fcmTokens')
      .populate('teamId', 'name memberCount status')
      .lean();

    if (!leaders.length) {
      console.warn(`[DISPATCH] No Team Leaders found in DB for request ${request._id}`);
    }

    const farmLat    = workerLocation?.lat;
    const farmLng    = workerLocation?.lng;
    const bType      = request.bookingType || 'HOURLY';
    const schedule   = bType === 'DAILY'
      ? { startDate: request.startDate, endDate: request.endDate }
      : { scheduledDate, startTime, endTime };

    const eligibleLeaders = [];

    for (const leader of leaders) {
      if (!leader.teamId || leader.teamId.status !== 'ACTIVE') continue;

      // A3: Live capacity check
      const liveCapacity   = await getLiveTeamCapacity(leader._id, bType, schedule);
      const totalDeployable = liveCapacity + 1; // +1 for the leader themselves

      if (totalDeployable < requiredWorkers) {
        console.log(`[TL DISPATCH] Leader ${leader._id}: live capacity ${totalDeployable} < needed ${requiredWorkers} — skipped`);
        continue;
      }

      // A4: Right-sized matching — don't send small jobs to very large teams
      const maxAllowed = Math.max(requiredWorkers * 2, requiredWorkers + 2);
      if (totalDeployable > maxAllowed) {
        console.log(`[TL DISPATCH] Leader ${leader._id}: team too large (${totalDeployable}) for ${requiredWorkers}-person job — skipped`);
        continue;
      }

      // Radius check
      if (farmLat !== undefined && farmLng !== undefined &&
          !isNaN(Number(farmLat)) && !isNaN(Number(farmLng)) &&
          leader.location?.lat && leader.location?.lng) {
        const dist = calculateDistance(
          { lat: Number(farmLat), lng: Number(farmLng) },
          { lat: Number(leader.location.lat), lng: Number(leader.location.lng) }
        );
        if (dist > radiusKm) {
          console.log(`[TL DISPATCH] Leader ${leader._id}: ${dist.toFixed(1)}km > radius ${radiusKm}km — skipped`);
          continue;
        }
        leader._distKm = dist;
      }

      leader._liveCapacity = totalDeployable;
      eligibleLeaders.push(leader);
    }

    eligibleLeaders.sort((a, b) => (a._distKm || 999) - (b._distKm || 999));
    console.log(`[TL DISPATCH] Eligible leaders (live capacity, right-sized): ${eligibleLeaders.length}`);

    let farmerName = 'Farmer';
    try {
      const f = await User.findById(request.farmerId).select('name').lean();
      if (f?.name) farmerName = f.name;
    } catch (_) {}

    await dispatchWave(request, eligibleLeaders, farmerName, false);

    // A7: Fallback to independent workers after 30 minutes if no TL accepts
    scheduleTeamLeaderFallback(request, requiredSkills, radiusKm, 30 * 60 * 1000);

  } catch (err) {
    console.error('[dispatchToTeamLeaders]', err);
    await WorkerBookingRequest.findByIdAndUpdate(request._id, { status: 'pending' });
  }
}


// â”€â”€â”€ Controller: getMyFarmerRequests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * GET /api/user/farmer-worker-requests
 * Farmer's own broadcast requests (paginated).
 */
exports.getMyFarmerRequests = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const skip  = (page - 1) * limit;

    const filter = {
      farmerId,
      requestType: { $in: ['independent_broadcast', 'team_leader'] }
    };
    if (req.query.status) filter.status = req.query.status;

    const [requests, total] = await Promise.all([
      WorkerBookingRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('dispatchedTo.workerId', 'name profilePhoto skills rating')
        .lean(),
      WorkerBookingRequest.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: requests,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[getMyFarmerRequests]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch requests.' });
  }
};


/**
 * GET /api/user/farmer-worker-request/:id
 */
exports.getFarmerRequestById = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const request  = await WorkerBookingRequest.findOne({
      _id: req.params.id,
      farmerId,
      requestType: { $in: ['independent_broadcast', 'team_leader'] }
    })
      .populate('dispatchedTo.workerId', 'name profilePhoto skills rating location status phone')
      .populate('workerOffers.workerId', 'name profilePhoto skills experience rating location status phone serviceCategory')
      .populate('finalWorkers',          'name profilePhoto skills rating phone')
      .populate({
        path: 'assignmentIds',
        populate: {
          path: 'workerId',
          select: 'name phone profilePicture skills rating averageRating primaryService experience'
        }
      });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    const { buildFarmerPaymentSummary } = require('../../services/workerFinancialService');
    let assignments = request.assignmentIds || [];
    if (!assignments.length) {
      assignments = await IndWorkerAssignment.find({
        parentRequestId: request._id,
        assignmentStatus: { $ne: 'CANCELLED' }
      }).populate('workerId', 'name phone profilePicture skills rating averageRating primaryService experience');
    }

    const IndWorkerExtension = require('../../models/IndWorkerExtension');
    let confirmedExtensions = [];
    try {
      confirmedExtensions = await IndWorkerExtension.find({
        parentRequestId: request._id,
        status: 'CONFIRMED'
      }).populate('workerExtensions.workerId', 'name phone profilePicture');
    } catch (extErr) {}

    const requestData = request.toObject ? request.toObject() : { ...request };

    // SECTION 22: Farmer panel must ONLY see Team Leader + member_accepted
    if (request.bookingMode === 'TEAM_LEADER' || request.requestType === 'team_leader') {
      const leaderIdStr = request.teamLeaderId ? request.teamLeaderId.toString() : null;
      const acceptedMemberIdStrs = Array.isArray(request.memberInvitations)
        ? request.memberInvitations
            .filter(inv => inv.status === 'member_accepted')
            .map(inv => inv.workerId.toString())
        : [];

      requestData.workerOffers = (requestData.workerOffers || []).filter(o => {
        const oIdStr = (o.workerId?._id || o.workerId)?.toString();
        if (leaderIdStr && oIdStr === leaderIdStr) return true;
        return acceptedMemberIdStrs.includes(oIdStr) || o.status === 'accepted';
      });
    }

    requestData.paymentSummary = buildFarmerPaymentSummary(request, assignments, null, confirmedExtensions);
    requestData.confirmedExtensions = confirmedExtensions;

    return res.json({ success: true, data: requestData });
  } catch (err) {
    console.error('[getFarmerRequestById]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch request.' });
  }
};

// â”€â”€â”€ Controller: getWorkerPendingFarmerRequests (worker-side) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * GET /api/workers/farmer-requests/pending
 * Returns all active farmer broadcast requests where this worker is pending.
 */
exports.getWorkerPendingFarmerRequests = async (req, res) => {
  try {
    const workerId = req.user._id;
    
    // Find requests that are pending AND where this worker is in dispatchedTo with 'pending' status
    // Exclude expired requests and requests where worker has already submitted an offer
    const pendingRequests = await WorkerBookingRequest.find({
      status: { $in: ['pending', 'matching'] },
      expiresAt: { $gt: new Date() },
      dispatchedTo: {
        $elemMatch: {
          workerId: workerId,
          status: 'pending'
        }
      },
      'workerOffers.workerId': { $ne: workerId }
    }).sort({ createdAt: -1 });

    // Server-side authoritative expiry validation:
    // Filter out and auto-expire any request whose scheduled window has already completely elapsed
    const now = new Date();
    const validPendingRequests = [];

    for (const reqDoc of pendingRequests) {
      const evalResult = isBookingExpired(reqDoc, now);
      if (evalResult.isExpired) {
        // Asynchronously transition to expired in database
        expireWorkerBookingRequest(reqDoc, evalResult.reason).catch(e => console.warn('[AutoExpire Error]:', e.message));
      } else {
        validPendingRequests.push(reqDoc);
      }
    }

    return res.json({ success: true, data: validPendingRequests });
  } catch (err) {
    console.error('[getWorkerPendingFarmerRequests]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch pending requests.' });
  }
};

/**
 * GET /api/workers/farmer-requests/member-invites
 * GET /api/workers/group-requests/member-invites
 * Returns all active, pending invitations for the authenticated worker.
 */
exports.getMemberInvites = async (req, res) => {
  try {
    const workerId = req.user._id;

    // 1. Check WorkerBookingRequest (Farmer broadcast routed to Team Leader)
    const bookingRequests = await WorkerBookingRequest.find({
      'memberInvitations': {
        $elemMatch: {
          workerId: workerId,
          status: { $in: ['member_pending', 'pending'] }
        }
      },
      status: { $nin: ['cancelled', 'expired', 'completed', 'rejected'] },
      expiresAt: { $gt: new Date() }
    })
      .populate('teamLeaderId', 'name phone profilePicture profilePhoto rating')
      .populate('farmerId', 'name phone profilePicture avatar profilePhoto')
      .sort({ createdAt: -1 })
      .lean();

    // 2. Check WorkerGroupRequest (Direct group booking to Team Leader)
    const groupRequests = await WorkerGroupRequest.find({
      'memberRequests': {
        $elemMatch: {
          workerId: workerId,
          status: { $in: ['member_pending', 'pending'] }
        }
      },
      status: { $in: ['collecting_members', 'selection_pending'] },
      expiresAt: { $gt: new Date() }
    })
      .populate('teamLeaderId', 'name phone profilePicture profilePhoto rating')
      .populate('farmerId', 'name phone profilePicture avatar profilePhoto')
      .sort({ createdAt: -1 })
      .lean();

    const normalizedInvites = [];
    const now = new Date();

    // Map bookingRequests (filtering out expired)
    for (const br of bookingRequests) {
      const evalResult = isBookingExpired(br, now);
      if (evalResult.isExpired) {
        expireWorkerBookingRequest(br, evalResult.reason).catch(e => console.warn('[AutoExpire Error]:', e.message));
        continue;
      }

      const invite = (br.memberInvitations || []).find(
        m => m.workerId?.toString() === workerId.toString() && (m.status === 'member_pending' || m.status === 'pending')
      );
      if (!invite) continue;

      normalizedInvites.push({
        requestId:       br._id.toString(),
        offerId:         invite._id ? invite._id.toString() : `${br._id}_${workerId}`,
        requestType:     'TEAM_MEMBER_INVITATION',
        isTeamInvite:    true,
        status:          'member_pending',
        source:          'WorkerBookingRequest',
        teamLeader: {
          id:     br.teamLeaderId?._id?.toString() || '',
          name:   br.teamLeaderId?.name || 'Team Leader',
          phone:  br.teamLeaderId?.phone || '',
          rating: br.teamLeaderId?.rating || 0
        },
        farmer: {
          id:           br.farmerId?._id?.toString() || '',
          name:         br.farmerId?.name || 'Farmer',
          phone:        br.farmerId?.phone || '',
          profileImage: br.farmerId?.profilePicture || br.farmerId?.avatar || br.farmerId?.profilePhoto || ''
        },
        job: {
          title:        br.workTitle || br.workCategory || 'Farm Work',
          category:     br.workCategory || '',
          description:  br.workDescription || '',
          skills:       br.requiredSkills || [],
          date:         br.bookingType === 'DAILY' ? br.startDate : br.scheduledDate,
          startTime:    br.startTime || '',
          endTime:      br.endTime || '',
          duration:     br.bookingType === 'DAILY' ? `${br.numberOfDays || 1} day(s)` : `${br.durationMinutes || 60} mins`,
          location:     typeof br.location === 'object' && br.location !== null
                          ? [br.location.addressLine1, br.location.city, br.location.state].filter(Boolean).join(', ') || 'Farmer Location'
                          : (br.location || 'Location Provided'),
          bookingType:  br.bookingType || 'HOURLY',
          numberOfDays: br.numberOfDays || null,
          startDate:    br.startDate || null,
          requiredWorkers: br.requiredWorkers || 1
        },
        offeredRate:  invite.offeredRate || br.farmerOfferedRate || br.minRate || 0,
        rateUnit:     invite.rateUnit || br.rateUnit || (br.bookingType === 'DAILY' ? 'daily' : 'hourly'),
        createdAt:    invite.invitedAt || br.createdAt
      });
    }

    // Map groupRequests
    for (const gr of groupRequests) {
      const evalResult = isBookingExpired(gr, now);
      if (evalResult.isExpired) {
        if (gr.status !== 'expired') {
          WorkerGroupRequest.findByIdAndUpdate(gr._id, { status: 'expired' }).catch(() => {});
        }
        continue;
      }

      const invite = (gr.memberRequests || []).find(
        m => m.workerId?.toString() === workerId.toString() && (m.status === 'member_pending' || m.status === 'pending')
      );
      if (!invite) continue;

      normalizedInvites.push({
        requestId:       gr._id.toString(),
        offerId:         invite._id ? invite._id.toString() : `${gr._id}_${workerId}`,
        requestType:     'TEAM_MEMBER_INVITATION',
        isTeamInvite:    true,
        status:          'member_pending',
        source:          'WorkerGroupRequest',
        teamLeader: {
          id:     gr.teamLeaderId?._id?.toString() || '',
          name:   gr.teamLeaderId?.name || 'Team Leader',
          phone:  gr.teamLeaderId?.phone || '',
          rating: gr.teamLeaderId?.rating || 0
        },
        farmer: {
          id:           gr.farmerId?._id?.toString() || '',
          name:         gr.farmerId?.name || 'Farmer',
          phone:        gr.farmerId?.phone || '',
          profileImage: gr.farmerId?.profilePicture || gr.farmerId?.avatar || gr.farmerId?.profilePhoto || ''
        },
        job: {
          title:        gr.workTitle || gr.workCategory || 'Farm Work',
          category:     gr.workCategory || '',
          description:  gr.workDescription || '',
          skills:       gr.requiredSkills || [],
          date:         gr.bookingType === 'DAILY' ? gr.startDate : gr.scheduledDate,
          startTime:    gr.startTime || '',
          endTime:      gr.endTime || '',
          duration:     gr.bookingType === 'DAILY' ? `${gr.numberOfDays || 1} day(s)` : `${gr.durationMinutes || 60} mins`,
          location:     typeof gr.location === 'object' && gr.location !== null
                          ? [gr.location.addressLine1, gr.location.city, gr.location.state].filter(Boolean).join(', ') || 'Farmer Location'
                          : (gr.location || 'Location Provided'),
          bookingType:  gr.bookingType || 'HOURLY',
          numberOfDays: gr.numberOfDays || null,
          startDate:    gr.startDate || null,
          requiredWorkers: gr.requiredWorkers || 1
        },
        offeredRate:  gr.agreedRatePerWorker || gr.farmerOfferedRatePerWorker || gr.leaderRate || 0,
        rateUnit:     gr.rateUnit || (gr.bookingType === 'DAILY' ? 'daily' : 'hourly'),
        createdAt:    gr.createdAt
      });
    }

    return res.json({ success: true, data: normalizedInvites });
  } catch (err) {
    console.error('[getMemberInvites]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch member invitations.' });
  }
};

/**
 * PATCH /api/workers/farmer-request/:id/member-respond
 * PATCH /api/workers/group-request/:id/member-respond
 * Authenticated team member accepts or declines an invitation.
 * body: { action: 'accept' | 'reject' }
 */
exports.memberRespondToRequest = async (req, res) => {
  try {
    const workerId = req.user._id.toString();
    const { action } = req.body;
    const requestId = req.params.id;

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be "accept" or "reject".' });
    }

    const workerDoc = await Worker.findById(workerId).select('name phone skills rating profilePicture profilePhoto');
    if (!workerDoc) {
      return res.status(404).json({ success: false, message: 'Worker profile not found.' });
    }

    const newStatus = action === 'accept' ? 'member_accepted' : 'member_rejected';
    const respondedAt = new Date();

    // 1. Try finding in WorkerBookingRequest
    const bookingReq = await WorkerBookingRequest.findOne({
      _id: requestId,
      'memberInvitations.workerId': workerId
    });

    if (bookingReq) {
      const expiryEval = isBookingExpired(bookingReq);
      const isTerminal = ['cancelled', 'rejected', 'expired'].includes(bookingReq.status);

      if (expiryEval.isExpired || isTerminal) {
        if (!isTerminal) {
          await expireWorkerBookingRequest(bookingReq, expiryEval.reason);
        }

        if (action === 'reject') {
          await WorkerBookingRequest.updateOne(
            { _id: bookingReq._id, 'memberInvitations.workerId': workerId },
            {
              $set: {
                'memberInvitations.$.status': 'member_rejected',
                'memberInvitations.$.respondedAt': new Date()
              }
            }
          );
          return res.json({
            success: true,
            message: 'Invitation has expired and has been dismissed.',
            isExpired: true
          });
        }

        return res.status(410).json({
          success: false,
          message: `This request is no longer active (${bookingReq.status || 'expired'}).`,
          isExpired: true
        });
      }

      if (bookingReq.paymentStatus === 'success' || bookingReq.status === 'confirmed') {
        return res.status(409).json({ success: false, message: 'Farmer has already completed payment. Invitation expired.' });
      }

      const invite = bookingReq.memberInvitations.find(m => m.workerId.toString() === workerId);
      if (!invite) {
        return res.status(404).json({ success: false, message: 'Invitation not found for this worker.' });
      }
      if (invite.status === 'member_accepted' && action === 'accept') {
        return res.json({ success: true, message: 'You have already accepted this invitation.', data: bookingReq });
      }
      if (invite.status === 'member_rejected') {
        if (action === 'reject') {
          return res.json({ success: true, message: 'You have already declined this invitation.' });
        }
        return res.status(400).json({ success: false, message: 'You have already declined this invitation.' });
      }
      if (invite.status === 'member_expired') {
        if (action === 'reject') {
          return res.json({ success: true, message: 'Invitation was expired and has been dismissed.', isExpired: true });
        }
        return res.status(410).json({ success: false, message: 'This invitation has expired.' });
      }

      // Conflict re-check upon accepting
      if (action === 'accept') {
        const conflict = bookingReq.bookingType === 'DAILY'
          ? await hasDailyConflict(workerId, bookingReq.startDate, bookingReq.endDate, bookingReq._id)
          : await hasTimeConflict(workerId, bookingReq.scheduledDate, bookingReq.startTime, bookingReq.endTime, bookingReq._id);

        if (conflict) {
          invite.status = 'member_rejected';
          invite.respondedAt = respondedAt;
          await bookingReq.save();
          return res.status(409).json({ success: false, message: 'You have a conflicting booking for this time slot.' });
        }
      }

      // Atomically update invitation status
      invite.status = newStatus;
      invite.respondedAt = respondedAt;

      // Also sync to workerOffers so Farmer selection sees accepted worker
      let existingOffer = bookingReq.workerOffers.find(o => o.workerId.toString() === workerId);
      if (action === 'accept') {
        if (existingOffer) {
          existingOffer.status = 'accepted';
          existingOffer.offeredRate = invite.offeredRate;
          existingOffer.submittedAt = respondedAt;
        } else {
          bookingReq.workerOffers.push({
            workerId: workerId,
            offeredRate: invite.offeredRate,
            status: 'accepted',
            submittedAt: respondedAt
          });
        }
      } else {
        if (existingOffer) {
          existingOffer.status = 'rejected';
        }
      }

      // Check if all needed workers have now accepted
      const acceptedMembersCount = (bookingReq.memberInvitations || []).filter(m => m.status === 'member_accepted').length;
      const totalAccepted = 1 + acceptedMembersCount; // Leader + accepted members
      bookingReq.acceptedWorkersCount = totalAccepted;

      if (totalAccepted >= bookingReq.requiredWorkers) {
        bookingReq.status = 'awaiting_farmer_confirmation';
      }

      await bookingReq.save();

      const rawLeaderId = invite.leaderId || bookingReq.teamLeaderId;
      const leaderId = (rawLeaderId?._id || rawLeaderId)?.toString();
      const rawFarmerId = bookingReq.farmerId || bookingReq.userId;
      const farmerId = (rawFarmerId?._id || rawFarmerId)?.toString();

      // Real-time update to Team Leader
      if (leaderId) {
        emitSafe(`worker_${leaderId}`, 'team_member_response', {
          requestId: bookingReq._id,
          memberId: workerId,
          memberName: workerDoc.name,
          status: action === 'accept' ? 'accepted' : 'declined',
          respondedAt
        });
        emitSafe(`worker:${leaderId}`, 'team_member_response', {
          requestId: bookingReq._id,
          memberId: workerId,
          memberName: workerDoc.name,
          status: action === 'accept' ? 'accepted' : 'declined',
          respondedAt
        });
        emitSafe(`worker_${leaderId}`, 'workerJobsUpdated', {});
        emitSafe(`worker:${leaderId}`, 'workerJobsUpdated', {});
      }

      // Real-time update to Farmer (ONLY if accepted!)
      if (action === 'accept' && farmerId) {
        emitSafe(`user_${farmerId}`, 'team_member_status_updated', {
          requestId: bookingReq._id,
          member: {
            _id: workerId,
            name: workerDoc.name,
            phone: workerDoc.phone,
            rating: workerDoc.rating || 0,
            skills: workerDoc.skills || [],
            profilePhoto: workerDoc.profilePicture || workerDoc.profilePhoto || ''
          },
          status: 'accepted',
          message: `${workerDoc.name} has accepted and is ready!`
        });
        emitSafe(`user:${farmerId}`, 'team_member_status_updated', {
          requestId: bookingReq._id,
          member: {
            _id: workerId,
            name: workerDoc.name,
            phone: workerDoc.phone,
            rating: workerDoc.rating || 0,
            skills: workerDoc.skills || [],
            profilePhoto: workerDoc.profilePicture || workerDoc.profilePhoto || ''
          },
          status: 'accepted',
          message: `${workerDoc.name} has accepted and is ready!`
        });
        emitSafe(`user_${farmerId}`, 'userBookingsUpdated', {});
        emitSafe(`user:${farmerId}`, 'userBookingsUpdated', {});

        if (totalAccepted >= bookingReq.requiredWorkers) {
          notify({
            recipientType: 'user',
            recipientId:   farmerId,
            type:          'worker_booking_accepted',
            title:         '✅ Team Ready!',
            message:       `Your team of ${totalAccepted} workers has accepted and is ready for payment.`,
            relatedId:     bookingReq._id,
            relatedType:   'WorkerBookingRequest',
            data: { requestId: bookingReq._id, acceptedCount: totalAccepted, requiredWorkers: bookingReq.requiredWorkers }
          }).catch(() => {});
        }
      }

      return res.json({
        success: true,
        message: action === 'accept' ? 'Team job invitation accepted!' : 'Team job invitation declined.',
        data: { status: newStatus }
      });
    }

    // 2. Try finding in WorkerGroupRequest
    const groupReq = await WorkerGroupRequest.findOne({
      _id: requestId,
      'memberRequests.workerId': workerId
    });

    if (groupReq) {
      if (['cancelled', 'rejected', 'expired'].includes(groupReq.status)) {
        return res.status(410).json({ success: false, message: `This request is no longer active (${groupReq.status}).` });
      }
      if (groupReq.paymentStatus === 'success' || groupReq.status === 'confirmed') {
        return res.status(409).json({ success: false, message: 'Farmer has already completed payment. Invitation expired.' });
      }

      const invite = groupReq.memberRequests.find(m => m.workerId.toString() === workerId);
      if (!invite) {
        return res.status(404).json({ success: false, message: 'Invitation not found for this worker.' });
      }
      if (['accepted', 'member_accepted'].includes(invite.status) && action === 'accept') {
        return res.json({ success: true, message: 'You have already accepted this invitation.', data: groupReq });
      }
      if (['rejected', 'member_rejected'].includes(invite.status)) {
        return res.status(400).json({ success: false, message: 'You have already declined this invitation.' });
      }

      invite.status = action === 'accept' ? 'accepted' : 'rejected';
      invite.respondedAt = respondedAt;
      await groupReq.save();

      // Real-time to Team Leader
      emitSafe(`worker_${groupReq.teamLeaderId}`, 'team_member_response', {
        requestId: groupReq._id,
        memberId: workerId,
        memberName: workerDoc.name,
        status: action === 'accept' ? 'accepted' : 'declined',
        respondedAt
      });
      emitSafe(`worker_${groupReq.teamLeaderId}`, 'workerJobsUpdated', {});

      // Real-time to Farmer if accepted
      if (action === 'accept') {
        emitSafe(`user_${groupReq.farmerId}`, 'team_member_status_updated', {
          requestId: groupReq._id,
          member: {
            _id: workerId,
            name: workerDoc.name,
            phone: workerDoc.phone,
            rating: workerDoc.rating || 0,
            skills: workerDoc.skills || []
          },
          status: 'accepted',
          message: `${workerDoc.name} has accepted and is ready!`
        });
        emitSafe(`user_${groupReq.farmerId}`, 'userBookingsUpdated', {});
      }

      return res.json({
        success: true,
        message: action === 'accept' ? 'Team job invitation accepted!' : 'Team job invitation declined.',
        data: { status: invite.status }
      });
    }

    return res.status(404).json({ success: false, message: 'Invitation not found for this worker.' });
  } catch (err) {
    console.error('[memberRespondToRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to process response.' });
  }
};

// â”€â”€â”€ Controller: workerRespondToFarmerRequest (worker-side) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * PATCH /api/workers/farmer-request/:id/respond
 * Worker accepts or rejects a farmer broadcast request.
 */
exports.workerRespondToFarmerRequest = async (req, res) => {
  try {
    const workerId = req.user._id; // middleware always sets req.user (worker logged in as worker)
    const { action } = req.body;   // 'accept' | 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be "accept" or "reject".' });
    }

    const request = await WorkerBookingRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    // Authoritative Server-Side Expiry Check:
    // Check both scheduled window completion and database expiry status
    const expiryEval = isBookingExpired(request);
    const isTerminal = ['cancelled', 'expired', 'completed'].includes(request.status);

    if (expiryEval.isExpired || isTerminal) {
      // Ensure backend status is transitioned to expired
      if (!isTerminal) {
        await expireWorkerBookingRequest(request, expiryEval.reason);
      }

      if (action === 'reject') {
        // Worker clicked Decline on an expired or stale card.
        // Idempotently mark this worker's dispatch entry as rejected/expired and return success
        // so the frontend alert modal cleanly dismisses, stops the alarm sound, and updates jobs.
        await WorkerBookingRequest.updateOne(
          { _id: request._id, 'dispatchedTo.workerId': workerId },
          {
            $set: {
              'dispatchedTo.$.status': 'rejected',
              'dispatchedTo.$.respondedAt': new Date()
            }
          }
        );

        return res.json({
          success: true,
          message: 'Booking request has expired and has been dismissed from your alerts.',
          isExpired: true
        });
      }

      // If trying to accept an expired request:
      return res.status(410).json({
        success: false,
        message: 'Booking request has expired and can no longer be accepted.',
        isExpired: true
      });
    }

    // Only broadcast requests handled here
    if (!['independent_broadcast', 'team_leader'].includes(request.requestType)) {
      return res.status(400).json({ success: false, message: 'Invalid request type for this endpoint.' });
    }

    // Verify this worker was dispatched to, or auto-register if open broadcast
    let entry = request.dispatchedTo.find(
      d => d.workerId.toString() === workerId.toString()
    );
    if (!entry) {
      entry = { workerId, status: 'pending', respondedAt: null };
      request.dispatchedTo.push(entry);
      await request.save();
    }

    // Idempotent check: if worker already accepted, return success
    if (entry.status === 'accepted' && action === 'accept') {
      return res.json({ success: true, message: 'You have already accepted this request.', data: request });
    }

    // Idempotent check: if worker already rejected and declines again, return success
    if (entry.status === 'rejected' && action === 'reject') {
      return res.json({ success: true, message: 'You have already declined this request.', data: request });
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    
    // Add or update workerOffers if accepted
    let updateObj = {
        $set: {
          'dispatchedTo.$.status':      newStatus,
          'dispatchedTo.$.respondedAt': new Date()
        }
    };
    
    let offersToAdd = [];
    let invitationsToCreate = [];
    let eligibleMembers = [];
    let acceptingWorker = null;
    let offeredRate = 0;

    if (action === 'accept') {
        offeredRate = Number(req.body.offeredRate);
        const maxBudget = Number(request.maxRate || request.farmerOfferedRate || request.minRate || 0);

        if (!offeredRate || isNaN(offeredRate)) {
            offeredRate = maxBudget;
        }

        // STRICT VALIDATION: Worker cannot exceed Farmer's maximum budget
        if (maxBudget > 0 && offeredRate > maxBudget) {
            return res.status(400).json({
                success: false,
                message: `Your rate offer (₹${offeredRate}) cannot exceed the Farmer's maximum budget of ₹${maxBudget}.`
            });
        }

        const isTeamLeaderReq = request.requestType === 'team_leader' || request.bookingMode === 'TEAM_LEADER';
        acceptingWorker = await Worker.findById(workerId);

        if (isTeamLeaderReq && acceptingWorker && acceptingWorker.workerType === 'TEAM_LEADER' && acceptingWorker.teamId) {
            // Include Leader himself in workerOffers as accepted
            offersToAdd.push({
                workerId: workerId,
                offeredRate: offeredRate,
                status: 'accepted',
                submittedAt: new Date()
            });

            updateObj['$set']['teamLeaderId'] = workerId;

            // Process selected memberIds from frontend
            let memberIdsToProcess = [];
            if (Array.isArray(req.body.memberIds) && req.body.memberIds.length > 0) {
                memberIdsToProcess = req.body.memberIds;
            } else {
                // Fallback: Find active members from leader's team
                const neededMembersCount = Math.max(0, (request.requiredWorkers || 1) - 1);
                if (neededMembersCount > 0) {
                    const fallbackMembers = await Worker.find({
                        teamId: acceptingWorker.teamId,
                        _id: { $ne: workerId },
                        isActive: { $ne: false }
                    }).limit(neededMembersCount).select('_id');
                    memberIdsToProcess = fallbackMembers.map(m => m._id);
                }
            }

            if (memberIdsToProcess.length > 0) {
                const candidates = await Worker.find({
                    _id: { $in: memberIdsToProcess },
                    teamId: acceptingWorker.teamId,
                    isActive: { $ne: false }
                });

                for (const tm of candidates) {
                    // 1. Check online status (offline members are deployable by their leader)
                    const tmStatus = String(tm.status || '').toUpperCase();
                    if (!tm.isOfflineMember && !ONLINE_STATUSES.includes(tmStatus)) {
                        console.log(`[TEAM DISPATCH] Member ${tm._id} (${tm.name}) is not online (${tmStatus}). Skipped.`);
                        continue;
                    }

                    // 2. Check skill matching (including 'ALL')
                    const skillMatched = isWorkerSkillMatch(tm.skills, request.requiredSkills, tm.serviceCategories);
                    if (!skillMatched) {
                        console.log(`[TEAM DISPATCH] Member ${tm._id} (${tm.name}) skills do not match required skills. Skipped.`);
                        continue;
                    }

                    // 3. Check time conflicts
                    const hasConflict = request.bookingType === 'DAILY'
                        ? await hasDailyConflict(tm._id, request.startDate, request.endDate, request._id)
                        : await hasTimeConflict(tm._id, request.scheduledDate, request.startTime, request.endTime, request._id);

                    if (hasConflict) {
                        console.log(`[TEAM DISPATCH] Member ${tm._id} (${tm.name}) has time conflict. Skipped.`);
                        continue;
                    }

                    eligibleMembers.push(tm);
                    invitationsToCreate.push({
                        workerId: tm._id,
                        leaderId: workerId,
                        offeredRate: offeredRate,
                        rateUnit: request.rateUnit || (request.bookingType === 'DAILY' ? 'daily' : 'hourly'),
                        status: tm.isOfflineMember ? 'member_accepted' : 'member_pending',
                        respondedAt: tm.isOfflineMember ? new Date() : undefined,
                        invitedAt: new Date()
                    });
                }
            }

            if (invitationsToCreate.length > 0) {
                updateObj['$push'] = {
                    workerOffers: { $each: offersToAdd },
                    memberInvitations: { $each: invitationsToCreate }
                };
            } else {
                updateObj['$push'] = {
                    workerOffers: { $each: offersToAdd }
                };
            }
        } else {
            offersToAdd.push({
                workerId: workerId,
                offeredRate: offeredRate,
                status: 'pending'
            });
            updateObj['$push'] = {
                workerOffers: { $each: offersToAdd }
            };
        }
    }

    await WorkerBookingRequest.updateOne(
      {
        _id: request._id,
        'dispatchedTo.workerId': workerId
      },
      updateObj
    );

    // If team leader dispatched member invitations, send notifications and sockets NOW
    if (action === 'accept' && invitationsToCreate && invitationsToCreate.length > 0) {
      let farmerDoc = null;
      try {
        if (request.farmerId) {
          farmerDoc = await User.findById(request.farmerId).select('name phone profilePicture avatar profilePhoto').lean();
        }
      } catch (e) {}

      const farmerName = farmerDoc?.name || 'Farmer';
      const farmerPhone = farmerDoc?.phone || '';
      const farmerPhoto = farmerDoc?.profilePicture || farmerDoc?.avatar || farmerDoc?.profilePhoto || '';

      for (const tm of eligibleMembers) {
        if (tm.isOfflineMember) {
          // Offline members have no app/phone; skip socket & push notifications
          continue;
        }
        const invitePayload = {
          requestId:    request._id.toString(),
          offerId:      `${request._id}_${tm._id}`,
          requestType:  'TEAM_MEMBER_INVITATION',
          isTeamInvite: true,
          status:       'member_pending',
          source:       'WorkerBookingRequest',
          teamLeader: {
            id:     workerId.toString(),
            name:   acceptingWorker.name || 'Team Leader',
            phone:  acceptingWorker.phone || '',
            rating: acceptingWorker.rating || 0
          },
          farmer: {
            id:           request.farmerId.toString(),
            name:         farmerName,
            phone:        farmerPhone,
            profileImage: farmerPhoto
          },
          job: {
            title:        request.workTitle || request.workCategory || 'Farm Work',
            category:     request.workCategory || '',
            description:  request.workDescription || '',
            skills:       request.requiredSkills || [],
            date:         request.bookingType === 'DAILY' ? request.startDate : request.scheduledDate,
            startTime:    request.startTime || '',
            endTime:      request.endTime || '',
            duration:     request.bookingType === 'DAILY' ? `${request.numberOfDays || 1} day(s)` : `${request.durationMinutes || 60} mins`,
            location:     typeof request.location === 'object' && request.location !== null
                            ? [request.location.addressLine1, request.location.city, request.location.state].filter(Boolean).join(', ') || 'Farmer Location'
                            : (request.location || 'Location Provided'),
            bookingType:  request.bookingType || 'HOURLY',
            numberOfDays: request.numberOfDays || null,
            startDate:    request.startDate || null,
            requiredWorkers: request.requiredWorkers || 1
          },
          offeredRate:  offeredRate,
          rateUnit:     request.rateUnit || (request.bookingType === 'DAILY' ? 'daily' : 'hourly')
        };

        // 1. Emit dedicated real-time socket events
        emitSafe(`worker_${tm._id}`, 'team_member_invitation', invitePayload);
        emitSafe(`worker_${tm._id}`, 'group_member_request', invitePayload);
        emitSafe(`worker_${tm._id}`, 'workerJobsUpdated', {});

        // 2. Send push notification fallback (FCM)
        sendNotificationToWorker(
          tm._id,
          'New Team Job Invitation',
          `You have been invited by ${acceptingWorker.name || 'your Team Leader'}. Tap to view the job.`,
          {
            type: 'TEAM_MEMBER_INVITATION',
            requestId: request._id.toString()
          }
        ).catch(fcmErr => console.warn('[FCM] Invite notification failed:', fcmErr.message));

        // 3. In-app Notification doc
        Notification.create({
          workerId: tm._id,
          type: 'team_member_invitation',
          title: '👥 New Team Job Invitation',
          message: `You have been invited by ${acceptingWorker.name || 'your Team Leader'} for ${request.workTitle || 'Farm Work'}.`,
          relatedId: request._id,
          relatedType: 'WorkerBookingRequest',
          data: { requestId: request._id }
        }).catch(() => {});
      }

      // Notify Team Leader about dispatch summary
      emitSafe(`worker_${workerId}`, 'team_invitations_dispatched', {
        requestId: request._id,
        dispatchedCount: invitationsToCreate.length
      });
    }

    const updated = await WorkerBookingRequest.findById(request._id);
    const isTeamLeader = updated.bookingMode === 'TEAM_LEADER' || updated.requestType === 'team_leader';

    let acceptedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;

    if (isTeamLeader) {
      const acceptedMembers = (updated.memberInvitations || []).filter(m => m.status === 'member_accepted').length;
      acceptedCount = 1 + acceptedMembers; // Leader + accepted members
      rejectedCount = (updated.memberInvitations || []).filter(m => m.status === 'member_rejected').length;
      pendingCount  = (updated.memberInvitations || []).filter(m => m.status === 'member_pending').length;
    } else {
      acceptedCount = updated.dispatchedTo.filter(d => d.status === 'accepted').length;
      rejectedCount = updated.dispatchedTo.filter(d => d.status === 'rejected').length;
      pendingCount  = updated.dispatchedTo.filter(d => d.status === 'pending').length;
    }

    // Update aggregated counts
    updated.acceptedWorkersCount = acceptedCount;
    updated.rejectedWorkersCount = rejectedCount;

    // ── Check if we have enough acceptances ────────────────────────────────
    if (action === 'accept') {
      // Final availability re-check for this worker (branch by booking type)
      let conflict = false;
      if (updated.bookingType === 'DAILY') {
        conflict = await hasDailyConflict(workerId, updated.startDate, updated.endDate, request._id);
      } else {
        conflict = await hasTimeConflict(workerId, updated.scheduledDate, updated.startTime, updated.endTime, request._id);
      }
      if (conflict) {
        // Rollback this worker's acceptance
        await WorkerBookingRequest.updateOne(
          { _id: request._id, 'dispatchedTo.workerId': workerId },
          { $set: { 'dispatchedTo.$.status': 'rejected', 'dispatchedTo.$.respondedAt': new Date() } }
        );
        return res.status(409).json({
          success: false,
          message: 'You have a conflicting booking for this time slot. Cannot accept.'
        });
      }

      if (acceptedCount >= updated.requiredWorkers) {
        // Full required count reached — notify farmer
        updated.status = 'awaiting_farmer_confirmation';
        await updated.save();

        await notify({
          recipientType: 'user',
          recipientId:   updated.farmerId,
          type:          'worker_booking_accepted',
          title:         '✅ Workers Available!',
          message:       `${acceptedCount} worker(s) accepted your request for ${updated.workTitle}`,
          relatedId:     updated._id,
          relatedType:   'WorkerBookingRequest',
          data: { requestId: updated._id, acceptedCount, requiredWorkers: updated.requiredWorkers }
        });
      } else if (pendingCount === 0 && !isTeamLeader) {
        // All workers responded, but fewer than required accepted
        updated.status = 'awaiting_farmer_confirmation';
        await updated.save();

        await notify({
          recipientType: 'user',
          recipientId:   updated.farmerId,
          type:          'worker_booking_partial',
          title:         '⚠️ Partial Worker Availability',
          message:       `Only ${acceptedCount} of ${updated.requiredWorkers} requested workers are available for ${updated.workTitle}`,
          relatedId:     updated._id,
          relatedType:   'WorkerBookingRequest',
          data: { requestId: updated._id, acceptedCount, requiredWorkers: updated.requiredWorkers }
        });
      } else {
        // Still waiting for more workers — save & emit live progress to farmer
        await updated.save();
        try {
          const io = getIO();
          const farmerRoom = `user_${updated.farmerId}`;
          io.to(farmerRoom).emit('worker_request_progress', {
            requestId:       updated._id,
            acceptedCount,
            rejectedCount,
            pendingCount,
            requiredWorkers: updated.requiredWorkers,
            status:          updated.status
          });
        } catch (_) { /* socket not critical */ }
      }
    } else {
      // Worker rejected
      if (pendingCount === 0) {
        // All responded, check if we have enough
        if (acceptedCount > 0) {
          updated.status = 'awaiting_farmer_confirmation';
          await updated.save();
          await notify({
            recipientType: 'user',
            recipientId:   updated.farmerId,
            type:          'worker_booking_partial',
            title:         '⚠️ Partial Worker Availability',
            message:       `Only ${acceptedCount} of ${updated.requiredWorkers} workers accepted for ${updated.workTitle}`,
            relatedId:     updated._id,
            relatedType:   'WorkerBookingRequest',
            data: { requestId: updated._id, acceptedCount, requiredWorkers: updated.requiredWorkers }
          });
        } else {
          // No one accepted
          updated.status = 'rejected';
          await updated.save();
          await notify({
            recipientType: 'user',
            recipientId:   updated.farmerId,
            type:          'worker_request_no_match',
            title:         '❌ No Workers Available',
            message:       `No workers accepted your request for ${updated.workTitle}. Please try again later.`,
            relatedId:     updated._id,
            relatedType:   'WorkerBookingRequest',
            data: { requestId: updated._id }
          });
        }
      } else {
        await updated.save();
      }
    }

    return res.json({
      success: true,
      message: `Successfully ${action}ed the request.`,
      data: { acceptedCount, rejectedCount, pendingCount, requiredWorkers: updated.requiredWorkers }
    });

  } catch (err) {
    console.error('[workerRespondToFarmerRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to process response.' });
  }
};

// ─── Controller: farmerConfirmPartial ─────────────────────────────────────

/**
 * POST /api/user/farmer-worker-request/:id/confirm
 * Farmer confirms the partial available worker count and creates bookings.
 */
exports.legacyFarmerConfirmRequest = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { accept } = req.body; // boolean: true = accept available, false = reject

    const request = await WorkerBookingRequest.findOne({
      _id: req.params.id,
      farmerId,
      status: 'awaiting_farmer_confirmation',
      requestType: { $in: ['independent_broadcast', 'team_leader'] }
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found or not in confirmation state.'
      });
    }

    if (request.expiresAt < new Date()) {
      await WorkerBookingRequest.findByIdAndUpdate(request._id, { status: 'expired' });
      return res.status(410).json({ success: false, message: 'This request has expired.' });
    }

    if (accept === false || accept === 'false') {
      // Farmer rejects — cancel everything
      await WorkerBookingRequest.findByIdAndUpdate(request._id, {
        status: 'cancelled',
        rejectionReason: 'Farmer rejected partial availability'
      });

      // Notify accepted workers that request was cancelled
      const acceptedWorkers = request.dispatchedTo.filter(d => d.status === 'accepted');
      for (const entry of acceptedWorkers) {
        await notify({
          recipientType: 'worker',
          recipientId:   entry.workerId,
          type:          'worker_request_cancelled',
          title:         '❌ Request Cancelled',
          message:       `The farmer cancelled the work request for ${request.workTitle}.`,
          relatedId:     request._id,
          relatedType:   'WorkerBookingRequest',
          data: { requestId: request._id }
        });
      }

      return res.json({ success: true, message: 'Request cancelled.' });
    }

    // Farmer accepts partial / available workers
    const acceptedEntries = request.dispatchedTo.filter(d => d.status === 'accepted');
    const stillAvailable = [];

    for (const entry of acceptedEntries) {
      const conflict = await hasTimeConflict(
        entry.workerId, request.scheduledDate, request.startTime, request.endTime, request._id
      );
      if (!conflict) {
        stillAvailable.push(entry.workerId);
      }
    }

    if (stillAvailable.length === 0) {
      await WorkerBookingRequest.findByIdAndUpdate(request._id, {
        status: 'rejected',
        rejectionReason: 'All accepted workers became unavailable'
      });
      return res.status(409).json({
        success: false,
        message: 'Unfortunately, all accepted workers are no longer available. Please create a new request.'
      });
    }

    // Create bookings for all still-available workers
    const bookingDocs = stillAvailable.map((wId, idx) => ({
      bookingNumber: `WRK-${Date.now()}-${idx}`,
      userId:        farmerId,
      workerId:      wId,
      providerType:  'WORKER',
      workerRequestId: request._id,
      scheduledDate: request.scheduledDate,
      scheduledTime: request.startTime,
      timeSlot: {
        start: request.startTime,
        end:   request.endTime
      },
      serviceName:     request.workTitle,
      serviceCategory: request.workCategory || 'Worker',
      basePrice:    null,
      minRate:      request.minRate,
      maxRate:      request.maxRate || request.minRate,
      finalAmount:  null,
      totalAmount:  null,
      address: {
        addressLine1: request.location?.addressLine1 || request.location?.city || '',
        city:         request.location?.city || '',
        state:        request.location?.state || '',
        pincode:      request.location?.pincode || '',
        lat:          request.location?.lat || null,
        lng:          request.location?.lng || null,
      },
      agreedRate:  request.minRate,
      rateUnit:    request.rateUnit || 'hourly',
      status:      'confirmed',
      paymentMethod: null,
      notes:       `${request.workTitle}: ${request.workDescription || ''}`.substring(0, 500)
    }));

    const createdBookings = await Booking.insertMany(bookingDocs);
    const bookingIds = createdBookings.map(b => b._id);

    // Update request
    await WorkerBookingRequest.findByIdAndUpdate(request._id, {
      status:              'confirmed',
      finalWorkers:        stillAvailable,
      finalBookingIds:     bookingIds,
      farmerAcceptedPartial: stillAvailable.length < request.requiredWorkers,
      acceptedWorkersCount: stillAvailable.length
    });

    // Notify all confirmed workers
    for (const wId of stillAvailable) {
      await notify({
        recipientType: 'worker',
        recipientId:   wId,
        type:          'worker_booking_confirmed',
        title:         '🎉 Booking Confirmed!',
        message:       `Your booking for ${request.workTitle} on ${new Date(request.scheduledDate).toLocaleDateString()} has been confirmed.`,
        relatedId:     request._id,
        relatedType:   'WorkerBookingRequest',
        data: {
          requestId: request._id,
          bookingIds,
          workTitle: request.workTitle,
          scheduledDate: request.scheduledDate,
          startTime: request.startTime,
          endTime: request.endTime
        }
      });
    }

    // Notify workers who were accepted but lost their slot
    const lostWorkers = acceptedEntries
      .filter(e => !stillAvailable.some(id => id.toString() === e.workerId.toString()))
      .map(e => e.workerId);

    for (const wId of lostWorkers) {
      await notify({
        recipientType: 'worker',
        recipientId:   wId,
        type:          'worker_request_slot_lost',
        title:         '⚠️ Booking Slot Lost',
        message:       `Unfortunately, you were not selected for ${request.workTitle} due to availability conflict.`,
        relatedId:     request._id,
        relatedType:   'WorkerBookingRequest',
        data: { requestId: request._id }
      });
    }

    return res.json({
      success:      true,
      message:      `Booking confirmed for ${stillAvailable.length} worker(s).`,
      data: {
        confirmedWorkers: stillAvailable.length,
        bookingIds
      }
    });

  } catch (err) {
    console.error('[farmerConfirmRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to confirm request.' });
  }
};

// ─── Controller: cancelFarmerRequest ──────────────────────────────────────

/**
 * DELETE /api/user/farmer-worker-request/:id
 */
exports.cancelFarmerRequest = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const request = await WorkerBookingRequest.findOne({
      _id: req.params.id,
      farmerId,
      requestType: { $in: ['independent_broadcast', 'team_leader'] }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    if (['completed', 'cancelled', 'expired'].includes(request.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot cancel a request with status "${request.status}".`
      });
    }

    // ── If Request was Confirmed & Paid: Process Automated Wallet Refund ──
    if (request.status === 'confirmed' || request.paymentStatus === 'success') {
      const assignments = await IndWorkerAssignment.find({
        parentRequestId: request._id,
        assignmentStatus: { $ne: 'CANCELLED' }
      });

      const anyWorkStarted = assignments.some(a => a.journeyStatus === 'IN_PROGRESS' || a.journeyStatus === 'COMPLETED' || a.visitOtpStatus === 'VERIFIED');
      if (anyWorkStarted) {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel booking after work has already started. Please contact support.'
        });
      }

      // 1. Cancel all worker assignments and legacy bookings
      await IndWorkerAssignment.updateMany(
        { parentRequestId: request._id },
        { assignmentStatus: 'CANCELLED', workStatus: 'CANCELLED' }
      );
      if (request.finalBookingIds?.length > 0) {
        await Booking.updateMany(
          { _id: { $in: request.finalBookingIds } },
          { status: 'cancelled', cancellationReason: 'Farmer cancelled booking' }
        );
      }

      // 2. Free assigned workers — Gather all worker IDs across finalWorkers, selectedWorkerIds, and assignments
      const allAssignedWorkerIds = new Set();
      if (Array.isArray(request.finalWorkers)) {
        request.finalWorkers.forEach(id => id && allAssignedWorkerIds.add(id.toString()));
      }
      if (Array.isArray(request.selectedWorkerIds)) {
        request.selectedWorkerIds.forEach(id => id && allAssignedWorkerIds.add(id.toString()));
      }
      assignments.forEach(a => {
        if (a.workerId) allAssignedWorkerIds.add(a.workerId.toString());
      });
      const workerIdList = Array.from(allAssignedWorkerIds);

      if (workerIdList.length > 0) {
        await Worker.updateMany(
          { _id: { $in: workerIdList } },
          { status: 'ONLINE' }
        );
      }

      // 3. Process Wallet Refund
      const snap = request.financialSnapshot || {};
      const refundAmount = Number(snap.totalPayable || snap.maximumWorkerAmount || 0);

      if (refundAmount > 0 && !request.refundCredited) {
        let farmerWallet = await Wallet.findOne({ userId: farmerId, userModel: 'User' });
        if (!farmerWallet) {
          farmerWallet = await Wallet.create({ userId: farmerId, userModel: 'User', balance: 0 });
        }

        const prevBalance = farmerWallet.balance || 0;
        farmerWallet.balance = prevBalance + refundAmount;
        await farmerWallet.save();

        // Sync User model
        await User.findByIdAndUpdate(farmerId, { 'wallet.balance': farmerWallet.balance });

        const bookingRef = request.bookingNumber || `WRK-${request._id.toString().slice(-6).toUpperCase()}`;
        const refundKey = `cancel_refund_${request._id.toString()}`;

        // Log WalletTransaction
        await WalletTransaction.create({
          walletId: farmerWallet._id,
          type: 'credit',
          amount: refundAmount,
          reason: 'refund',
          referenceId: request._id.toString(),
          gatewayTransactionId: request.razorpayPaymentId || null,
          idempotencyKey: refundKey,
          status: 'completed'
        });

        // Log unified Transaction
        await Transaction.create({
          userId: farmerId,
          type: 'refund',
          amount: refundAmount,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Full Refund for Cancelled ${request.workTitle || 'Worker'} Booking (#${bookingRef})`,
          balanceBefore: prevBalance,
          balanceAfter: farmerWallet.balance,
          referenceId: request._id.toString()
        });

        request.refundAmount = refundAmount;
        request.refundCredited = true;
        request.refundCreditedAt = new Date();

        // Emit real-time wallet balance update
        emitSafe(`user_${farmerId}`, 'wallet_balance_updated', {
          balance: farmerWallet.balance,
          refundAmount,
          type: 'credit',
          message: `₹${refundAmount} refunded for cancelled booking`
        });
        emitSafe(`user:${farmerId}`, 'wallet_balance_updated', {
          balance: farmerWallet.balance,
          refundAmount,
          type: 'credit',
          message: `₹${refundAmount} refunded for cancelled booking`
        });
      }

      request.status = 'cancelled';
      await request.save();

      // Notify Farmer of cancellation & refund
      await notify({
        recipientType: 'user',
        recipientId: farmerId,
        type: 'booking_cancelled',
        title: 'Booking Cancelled & Refunded',
        message: refundAmount > 0
          ? `Your booking for ${request.workTitle} has been cancelled. ₹${refundAmount} has been credited back to your AgroYilt Wallet.`
          : `Your booking for ${request.workTitle} has been cancelled.`,
        relatedId: request._id,
        relatedType: 'WorkerBookingRequest',
        data: { requestId: request._id, refundAmount }
      });

      // Notify and emit cancellation to all assigned workers
      for (const wId of workerIdList) {
        await notify({
          recipientType: 'worker',
          recipientId: wId,
          type: 'worker_booking_cancelled',
          title: '❌ Booking Cancelled',
          message: `Booking for ${request.workTitle || 'Worker Service'} has been cancelled by the farmer.`,
          relatedId: request._id,
          relatedType: 'WorkerBookingRequest',
          data: {
            requestId: request._id,
            bookingNumber: request.bookingNumber || `WRK-${request._id.toString().slice(-6).toUpperCase()}`,
            workTitle: request.workTitle
          }
        });

        const cancelPayload = {
          requestId: request._id,
          bookingId: request._id,
          workTitle: request.workTitle,
          message: `Booking for "${request.workTitle || 'Worker Service'}" has been cancelled by the farmer.`
        };

        emitSafe(`worker_${wId}`, 'worker_booking_cancelled', cancelPayload);
        emitSafe(`worker:${wId}`, 'worker_booking_cancelled', cancelPayload);
        emitSafe(`worker_${wId}`, 'job_cancelled', cancelPayload);
        emitSafe(`worker:${wId}`, 'job_cancelled', cancelPayload);
        emitSafe(`worker_${wId}`, 'booking_cancelled', cancelPayload);
        emitSafe(`worker:${wId}`, 'booking_cancelled', cancelPayload);
        emitSafe(`worker_${wId}`, 'worker_booking_update', { requestId: request._id, type: 'worker_booking_cancelled' });
        emitSafe(`worker:${wId}`, 'worker_booking_update', { requestId: request._id, type: 'worker_booking_cancelled' });
      }

      // Broadcast to request and live tracking rooms
      emitSafe(`booking_req:${request._id}`, 'worker_booking_cancelled', { requestId: request._id });
      emitSafe(`farmer_worker_request_${request._id}`, 'worker_booking_cancelled', { requestId: request._id });

      return res.json({
        success: true,
        message: refundAmount > 0
          ? `Booking cancelled. ₹${refundAmount} has been refunded to your wallet.`
          : 'Booking cancelled successfully.'
      });
    }

    // ── If Request was Pending / Matching (Unpaid) ──
    await WorkerBookingRequest.findByIdAndUpdate(request._id, { status: 'cancelled' });

    // Collect ALL workers who were dispatched to, or accepted, or submitted offers
    const targetWorkerIds = new Set();
    if (Array.isArray(request.dispatchedTo)) {
      request.dispatchedTo.forEach(d => {
        if (d.workerId) targetWorkerIds.add(d.workerId.toString());
      });
    }
    if (Array.isArray(request.workerOffers)) {
      request.workerOffers.forEach(o => {
        if (o.workerId) targetWorkerIds.add(o.workerId.toString());
      });
    }
    if (Array.isArray(request.selectedWorkerIds)) {
      request.selectedWorkerIds.forEach(id => {
        if (id) targetWorkerIds.add(id.toString());
      });
    }

    // Notify all targeted workers and emit real-time cancellation events
    for (const wId of targetWorkerIds) {
      await notify({
        recipientType: 'worker',
        recipientId: wId,
        type: 'worker_request_cancelled',
        title: '❌ Request Cancelled',
        message: `Work request for ${request.workTitle || 'Farm Work'} has been cancelled by the farmer.`,
        relatedId: request._id,
        relatedType: 'WorkerBookingRequest',
        data: {
          requestId: request._id,
          workTitle: request.workTitle
        }
      });

      const cancelPayload = {
        requestId: request._id,
        workTitle: request.workTitle,
        message: `Work request for "${request.workTitle || 'Farm Work'}" has been cancelled by the farmer.`
      };

      emitSafe(`worker_${wId}`, 'worker_request_cancelled', cancelPayload);
      emitSafe(`worker:${wId}`, 'worker_request_cancelled', cancelPayload);
      emitSafe(`worker_${wId}`, 'worker_booking_cancelled', cancelPayload);
      emitSafe(`worker:${wId}`, 'worker_booking_cancelled', cancelPayload);
      emitSafe(`worker_${wId}`, 'worker_booking_update', { requestId: request._id, type: 'worker_request_cancelled' });
      emitSafe(`worker:${wId}`, 'worker_booking_update', { requestId: request._id, type: 'worker_request_cancelled' });
    }

    // Broadcast to room
    emitSafe(`booking_req:${request._id}`, 'worker_request_cancelled', { requestId: request._id });
    emitSafe(`farmer_worker_request_${request._id}`, 'worker_request_cancelled', { requestId: request._id });

    return res.json({ success: true, message: 'Request cancelled successfully.' });
  } catch (err) {
    console.error('[cancelFarmerRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel request.' });
  }
};


// ============================================================================
// NEW INDEPENDENT WORKER PAYMENT FLOW
// ============================================================================
const { createOrder, verifyPayment } = require('../../services/razorpayService');
const { getWorkerFinancialSettings } = require('../../services/workerFinancialService');

exports.farmerSelectWorkers = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { selectedWorkerIds } = req.body; 

    if (!selectedWorkerIds || !Array.isArray(selectedWorkerIds) || selectedWorkerIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one worker.' });
    }

    const request = await WorkerBookingRequest.findOne({
      _id: req.params.id,
      farmerId,
      status: { $in: ['matching', 'awaiting_farmer_confirmation'] },
      requestType: { $in: ['independent_broadcast', 'team_leader'] }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found or not in a selectable state.' });
    }
    if (request.expiresAt < new Date()) {
      return res.status(410).json({ success: false, message: 'This request has expired.' });
    }

    // Validate selected workers (Section 23: only leader and member_accepted workers are selectable)
    const isTeamLeader = request.bookingMode === 'TEAM_LEADER' || request.requestType === 'team_leader';
    const leaderIdStr = request.teamLeaderId ? request.teamLeaderId.toString() : null;
    const acceptedMemberIdStrs = Array.isArray(request.memberInvitations)
      ? request.memberInvitations
          .filter(inv => inv.status === 'member_accepted')
          .map(inv => inv.workerId.toString())
      : [];

    const validWorkerIds = request.workerOffers
      .filter(offer => {
        if (!['pending', 'selected', 'accepted'].includes(offer.status)) return false;
        if (isTeamLeader) {
          const oId = offer.workerId.toString();
          return (leaderIdStr && oId === leaderIdStr) || acceptedMemberIdStrs.includes(oId) || offer.status === 'accepted';
        }
        return true;
      })
      .map(offer => offer.workerId.toString());

    for (const wId of selectedWorkerIds) {
      if (!validWorkerIds.includes(wId.toString())) {
        return res.status(400).json({ success: false, message: 'One or more selected workers are invalid, pending acceptance, or not confirmed.' });
      }
    }

    const settings = await getWorkerFinancialSettings();
    const isDaily = request.bookingType === 'DAILY';

    // Formula per specification:
    // HOURLY: (maxRate || minRate) * workers * (durationMinutes / 60) + platformFees
    // DAILY:  (maxDailyRate || minDailyRate || maxRate || minRate) * workers * numberOfDays + platformFees
    // If maxRate is not given by farmer, fallback to minRate.
    let baseRate = 0;
    let maxWorkerAmount = 0;

    const toP = (inr) => Math.round(Number(inr) * 100);
    const toINR = (p) => p / 100;

    if (isDaily) {
      baseRate = Number(request.maxDailyRate || request.minDailyRate || request.maxRate || request.minRate || 0);
      const days = Number(request.numberOfDays) || 1;
      const totalWorkerPaise = toP(baseRate) * selectedWorkerIds.length * days;
      maxWorkerAmount = toINR(totalWorkerPaise);
    } else {
      baseRate = Number(request.maxRate || request.minRate || 0);
      let durationHours = 1;
      if (request.durationMinutes && Number(request.durationMinutes) > 0) {
        durationHours = Number(request.durationMinutes) / 60;
      } else if (request.startTime && request.endTime) {
        const [sH, sM] = request.startTime.split(':').map(Number);
        const [eH, eM] = request.endTime.split(':').map(Number);
        if (!isNaN(sH) && !isNaN(eH)) {
          let diffMinutes = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
          if (diffMinutes < 0) diffMinutes += 24 * 60;
          if (diffMinutes > 0) durationHours = diffMinutes / 60;
        }
      }
      const totalWorkerPaise = Math.round(toP(baseRate) * selectedWorkerIds.length * durationHours);
      maxWorkerAmount = toINR(totalWorkerPaise);
    }

    const platformRate = Number(settings.workerPlatformChargePercentage) || 0;
    const platformPaise = Math.round((toP(maxWorkerAmount) * platformRate) / 100);
    const platformCharge = toINR(platformPaise);
    const totalPayable = toINR(toP(maxWorkerAmount) + platformPaise);

    request.selectedWorkerIds = selectedWorkerIds;
    request.paymentStatus = 'pending';
    request.financialSnapshot = {
      maximumBudget: baseRate,
      selectedWorkerCount: selectedWorkerIds.length,
      maximumWorkerAmount: maxWorkerAmount,
      platformChargeRate: platformRate,
      platformChargeAmount: platformCharge,
      totalPayable: totalPayable,
      commissionRate: settings.workerCommissionPercentage,
      currency: 'INR',
      bookingType: request.bookingType || 'HOURLY',
      numberOfDays: isDaily ? (Number(request.numberOfDays) || 1) : null,
      durationMinutes: !isDaily ? (Number(request.durationMinutes) || 60) : null,
      createdAt: new Date()
    };
    
    request.workerOffers.forEach(offer => {
       if (selectedWorkerIds.includes(offer.workerId.toString())) {
         offer.status = 'selected';
       }
    });

    await request.save();

    return res.json({
      success: true,
      message: 'Workers selected. Please proceed to payment.',
      data: {
        financials: request.financialSnapshot,
        paymentStatus: request.paymentStatus
      }
    });
  } catch (err) {
    console.error('[farmerSelectWorkers]', err); require('fs').writeFileSync('C:/Users/hp/Desktop/Appzeto/AgroYilt/backend/error_log.txt', err.stack);
    return res.status(500).json({ success: false, message: 'Failed to select workers.' });
  }
};

exports.createWorkerBookingPayment = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const request = await WorkerBookingRequest.findOne({
      _id: req.params.id,
      farmerId,
      paymentStatus: 'pending'
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found or workers not selected yet.' });
    }

    const { totalPayable, currency } = request.financialSnapshot;

    const orderRes = await createOrder(totalPayable, currency, `req_${request._id}`);
    if (!orderRes.success) {
      return res.status(500).json({ success: false, message: 'Failed to create payment order.' });
    }

    request.razorpayOrderId = orderRes.orderId;
    await request.save();

    return res.json({
      success: true,
      data: {
        orderId: orderRes.orderId,
        amount: orderRes.amount,
        currency: orderRes.currency,
        financials: request.financialSnapshot
      }
    });
  } catch (err) {
    console.error('[createWorkerBookingPayment]', err);
    return res.status(500).json({ success: false, message: 'Failed to initialize payment.' });
  }
};

exports.verifyWorkerBookingPayment = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const request = await WorkerBookingRequest.findOne({
      _id: req.params.id,
      farmerId,
      razorpayOrderId: razorpay_order_id,
      paymentStatus: 'pending'
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Invalid payment verification request.' });
    }

    const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      request.paymentStatus = 'failed';
      await request.save();
      return res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }

    request.paymentStatus = 'success';
    request.razorpayPaymentId = razorpay_payment_id;
    request.status = 'confirmed';
    request.farmerAcceptedPartial = request.selectedWorkerIds.length < request.requiredWorkers;
    request.acceptedWorkersCount = request.selectedWorkerIds.length;
    request.finalWorkers = request.selectedWorkerIds;
    
    request.workerOffers.forEach(offer => {
       if (!request.selectedWorkerIds.some(wId => wId.toString() === offer.workerId.toString())) {
         offer.status = 'rejected';
       } else {
         offer.status = 'selected';
       }
    });

    const assignmentDocs = [];
    const bookingDocs = [];
    const otpExpiryDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const isDaily = request.bookingType === 'DAILY';

    for (const [idx, wId] of request.selectedWorkerIds.entries()) {
      const offer = request.workerOffers.find(o => o.workerId.toString() === wId.toString());
      const offeredRate = offer 
        ? offer.offeredRate 
        : (isDaily ? (request.minDailyRate || request.minRate || 0) : (request.minRate || 0));
      
      // ── Paise-based financial calculation (integer math, no floating-point) ──
      const toP   = (inr) => Math.round(Number(inr) * 100);
      const toINR = (p)   => p / 100;

      const commissionRate  = request.financialSnapshot?.commissionRate || 10;
      let grossPaise = 0;
      let rateUnit = isDaily ? 'daily' : (request.rateUnit || 'hourly');
      let bookedDays = null;

      if (isDaily) {
        bookedDays = Number(request.numberOfDays) || 1;
        grossPaise = toP(offeredRate) * bookedDays;
      } else {
        const durationHours = (Number(request.durationMinutes) || 60) / 60;
        grossPaise = Math.round(toP(offeredRate) * durationHours);
      }

      const commissionPaise = Math.floor((grossPaise * commissionRate) / 100); // floor protects worker
      const netPaise        = grossPaise - commissionPaise;

      const commissionAmount = toINR(commissionPaise);
      const netEarning       = toINR(netPaise);

      // 4-digit visit OTP for this worker assignment
      const rawVisitOtp = Math.floor(1000 + Math.random() * 9000).toString();
      const visitOtpHash = crypto.createHash('sha256').update(rawVisitOtp).digest('hex');

      // Create dedicated IndWorkerAssignment document
      const assignmentDoc = {
        parentRequestId: request._id,
        bookingType: request.bookingType || 'HOURLY',
        farmerId,
        workerId: wId,
        teamLeaderId: request.teamLeaderId || null,
        workerType: request.bookingMode === 'TEAM_LEADER' ? 'TEAM_MEMBER' : 'INDEPENDENT',
        agreedRate: offeredRate,
        rateUnit,
        creationIdempotencyKey: `assign_${request._id}_${wId}_${Date.now()}`,
        assignmentStatus: 'CONFIRMED',
        journeyStatus: 'NOT_STARTED',
        visitOtpStatus: 'PENDING',
        workStatus: 'NOT_STARTED',
        completionStatus: 'PENDING',
        settlementStatus: 'PENDING',
        locationStatus: 'UNAVAILABLE',
        visitOtpCode: rawVisitOtp,
        visitOtpHash,
        visitOtpExpiresAt: otpExpiryDate,
        grossAmount: toINR(grossPaise),
        commissionRate,
        commissionAmount,
        netEarning
      };

      if (isDaily) {
        assignmentDoc.bookedDays = bookedDays;
        assignmentDoc.workedDays = 0;
        assignmentDoc.currentDayIndex = 1;
        assignmentDoc.isDecreased = false;
        assignmentDoc.dailyLogs = [{
          dayNumber: 1,
          date: request.startDate ? new Date(request.startDate) : new Date(),
          journeyStatus: 'NOT_STARTED',
          visitOtpCode: rawVisitOtp,
          visitOtpHash,
          visitOtpStatus: 'PENDING',
          visitOtpExpiresAt: otpExpiryDate,
          workStatus: 'NOT_STARTED'
        }];
      }

      assignmentDocs.push(assignmentDoc);

      // Also create legacy Booking doc for backward compatibility
      bookingDocs.push({
        bookingNumber: `WRK-${Date.now()}-${idx}`,
        userId: farmerId,
        workerId: wId,
        providerType: 'WORKER',
        workerRequestId: request._id,
        scheduledDate: isDaily ? (request.startDate || request.scheduledDate) : request.scheduledDate,
        scheduledTime: isDaily ? '09:00' : request.startTime,
        timeSlot: isDaily ? { start: '09:00', end: '17:00' } : { start: request.startTime, end: request.endTime },
        serviceName: request.workTitle,
        serviceCategory: request.workCategory || 'Worker',
        basePrice: null,
        minRate: isDaily ? request.minDailyRate : request.minRate,
        maxRate: isDaily ? request.maxDailyRate : request.maxRate,
        agreedRate: offeredRate,
        rateUnit,
        workerOfferedRate: offeredRate,
        workerGrossEarning: toINR(grossPaise),
        commissionRate: commissionRate,
        commissionAmount: commissionAmount,
        workerNetEarning: netEarning,
        finalAmount: toINR(grossPaise), 
        totalAmount: toINR(grossPaise),
        farmerPaidAmount: request.financialSnapshot?.totalPayable || toINR(grossPaise),
        platformFeeAmount: request.financialSnapshot?.platformChargeAmount || 0,
        platformFeeRate: request.financialSnapshot?.platformChargeRate || 0,
        visitOtp: rawVisitOtp,
        address: {
          addressLine1: request.location?.addressLine1 || request.location?.city || '',
          city: request.location?.city || '',
          state: request.location?.state || '',
          pincode: request.location?.pincode || '',
          lat: request.location?.lat || null,
          lng: request.location?.lng || null,
        },
        status: 'confirmed',
        paymentStatus: 'success',
        paymentMethod: 'online',
        paymentId: razorpay_payment_id,
        notes: `${request.workTitle}: ${request.workDescription || ''}`.substring(0, 500)
      });
    }

    // Insert Assignments and Bookings
    const createdAssignments = await IndWorkerAssignment.insertMany(assignmentDocs);
    const createdBookings = await Booking.insertMany(bookingDocs);

    // Link legacy booking IDs into assignments
    for (let i = 0; i < createdAssignments.length; i++) {
      if (createdBookings[i]) {
        createdAssignments[i].legacyBookingId = createdBookings[i]._id;
        await createdAssignments[i].save();
      }
    }

    request.assignmentIds = createdAssignments.map(a => a._id);
    request.finalBookingIds = createdBookings.map(b => b._id);
    request.refundAmount = null;
    request.refundCredited = false;
    request.refundCreditedAt = null;

    // Section 25: Expire any remaining unresponded member invitations
    if (Array.isArray(request.memberInvitations)) {
      for (const inv of request.memberInvitations) {
        if (inv.status === 'member_pending' || inv.status === 'pending') {
          inv.status = 'member_expired';
          emitSafe(`worker_${inv.workerId}`, 'workerBookingCancelled', {
            requestId: request._id,
            message: 'This team job invitation has expired because booking was finalized.'
          });
        }
      }
    }

    await request.save();

    // Notify each worker
    for (const a of createdAssignments) {
      await notify({
        recipientType: 'worker',
        recipientId: a.workerId,
        type: 'worker_booking_confirmed',
        title: 'Booking Confirmed & Paid!',
        message: `Your booking for ${request.workTitle} has been confirmed. You will earn ?${a.netEarning}.`,
        relatedId: request._id,
        relatedType: 'WorkerBookingRequest',
        data: { assignmentId: a._id, requestId: request._id }
      });
    }

    // Emit socket event to parent request room
    emitSafe(`booking_req:${request._id}`, 'booking_confirmed', {
      requestId: request._id,
      assignmentIds: request.assignmentIds,
      totalWorkers: request.assignmentIds.length,
      serverTimestamp: new Date()
    });

    return res.json({
      success: true,
      message: 'Payment verified and worker assignments created.',
      data: {
        requestId: request._id,
        assignmentIds: request.assignmentIds,
        bookingIds: request.finalBookingIds
      }
    });

  } catch (err) {
    console.error('[verifyWorkerBookingPayment]', err);
    return res.status(500).json({ success: false, message: 'Payment verification failed: ' + err.message });
  }
};

/**
 * Confirm Worker Booking with Cash on Service (Pay on Completion)
 * POST /api/user/farmer-worker-request/:id/confirm-cash
 */
exports.confirmWorkerBookingCash = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const request = await WorkerBookingRequest.findOne({
      _id: req.params.id,
      farmerId,
      status: { $in: ['awaiting_farmer_confirmation', 'matching', 'pending'] }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found or not in confirmable state.' });
    }

    if (!Array.isArray(request.selectedWorkerIds) || request.selectedWorkerIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No workers selected for booking. Please select workers first.' });
    }

    request.paymentMethod = 'cash';
    request.paymentStatus = 'pending';
    request.status = 'confirmed';
    request.farmerAcceptedPartial = request.selectedWorkerIds.length < request.requiredWorkers;
    request.acceptedWorkersCount = request.selectedWorkerIds.length;
    request.finalWorkers = request.selectedWorkerIds;

    request.workerOffers.forEach(offer => {
      if (!request.selectedWorkerIds.some(wId => wId.toString() === offer.workerId.toString())) {
        offer.status = 'rejected';
      } else {
        offer.status = 'selected';
      }
    });

    const assignmentDocs = [];
    const bookingDocs = [];
    const otpExpiryDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const isDaily = request.bookingType === 'DAILY';

    for (const [idx, wId] of request.selectedWorkerIds.entries()) {
      const offer = request.workerOffers.find(o => o.workerId.toString() === wId.toString());
      const offeredRate = offer 
        ? offer.offeredRate 
        : (isDaily ? (request.minDailyRate || request.minRate || 0) : (request.minRate || 0));

      const toP   = (inr) => Math.round(Number(inr) * 100);
      const toINR = (p)   => p / 100;

      const commissionRate  = request.financialSnapshot?.commissionRate || 10;
      let grossPaise = 0;
      let rateUnit = isDaily ? 'daily' : (request.rateUnit || 'hourly');
      let bookedDays = null;

      if (isDaily) {
        bookedDays = Number(request.numberOfDays) || 1;
        grossPaise = toP(offeredRate) * bookedDays;
      } else {
        const durationHours = (Number(request.durationMinutes) || 60) / 60;
        grossPaise = Math.round(toP(offeredRate) * durationHours);
      }

      const commissionPaise = Math.floor((grossPaise * commissionRate) / 100);
      const netPaise        = grossPaise - commissionPaise;
      const commissionAmount = toINR(commissionPaise);
      const netEarning       = toINR(netPaise);

      // 4-digit visit OTP for this worker assignment
      const rawVisitOtp = Math.floor(1000 + Math.random() * 9000).toString();
      const visitOtpHash = crypto.createHash('sha256').update(rawVisitOtp).digest('hex');

      const assignmentDoc = {
        parentRequestId: request._id,
        bookingType: request.bookingType || 'HOURLY',
        farmerId,
        workerId: wId,
        teamLeaderId: request.teamLeaderId || null,
        workerType: request.bookingMode === 'TEAM_LEADER' ? 'TEAM_MEMBER' : 'INDEPENDENT',
        agreedRate: offeredRate,
        rateUnit,
        creationIdempotencyKey: `assign_${request._id}_${wId}_${Date.now()}`,
        assignmentStatus: 'CONFIRMED',
        paymentMethod: 'cash',
        journeyStatus: 'NOT_STARTED',
        visitOtpStatus: 'PENDING',
        workStatus: 'NOT_STARTED',
        completionStatus: 'PENDING',
        settlementStatus: 'PENDING',
        locationStatus: 'UNAVAILABLE',
        visitOtpCode: rawVisitOtp,
        visitOtpHash,
        visitOtpExpiresAt: otpExpiryDate,
        grossAmount: toINR(grossPaise),
        commissionRate,
        commissionAmount,
        netEarning
      };

      if (isDaily) {
        assignmentDoc.bookedDays = bookedDays;
        assignmentDoc.workedDays = 0;
        assignmentDoc.currentDayIndex = 1;
        assignmentDoc.isDecreased = false;
        assignmentDoc.dailyLogs = [{
          dayNumber: 1,
          date: request.startDate ? new Date(request.startDate) : new Date(),
          journeyStatus: 'NOT_STARTED',
          visitOtpCode: rawVisitOtp,
          visitOtpHash,
          visitOtpStatus: 'PENDING',
          visitOtpExpiresAt: otpExpiryDate,
          workStatus: 'NOT_STARTED'
        }];
      }

      assignmentDocs.push(assignmentDoc);

      bookingDocs.push({
        bookingNumber: `WRK-${Date.now()}-${idx}`,
        userId: farmerId,
        workerId: wId,
        providerType: 'WORKER',
        workerRequestId: request._id,
        scheduledDate: isDaily ? (request.startDate || request.scheduledDate) : request.scheduledDate,
        scheduledTime: isDaily ? '09:00' : request.startTime,
        timeSlot: isDaily ? { start: '09:00', end: '17:00' } : { start: request.startTime, end: request.endTime },
        serviceName: request.workTitle,
        serviceCategory: request.workCategory || 'Worker',
        basePrice: null,
        minRate: isDaily ? request.minDailyRate : request.minRate,
        maxRate: isDaily ? request.maxDailyRate : request.maxRate,
        agreedRate: offeredRate,
        rateUnit,
        workerOfferedRate: offeredRate,
        workerGrossEarning: toINR(grossPaise),
        commissionRate: commissionRate,
        commissionAmount: commissionAmount,
        workerNetEarning: netEarning,
        finalAmount: toINR(grossPaise), 
        totalAmount: toINR(grossPaise),
        farmerPaidAmount: 0,
        platformFeeAmount: request.financialSnapshot?.platformChargeAmount || 0,
        platformFeeRate: request.financialSnapshot?.platformChargeRate || 0,
        visitOtp: rawVisitOtp,
        address: {
          addressLine1: request.location?.addressLine1 || request.location?.city || '',
          city: request.location?.city || '',
          state: request.location?.state || '',
          pincode: request.location?.pincode || '',
          lat: request.location?.lat || null,
          lng: request.location?.lng || null,
        },
        status: 'confirmed',
        paymentStatus: 'pending',
        paymentMethod: 'cash',
        notes: `${request.workTitle}: ${request.workDescription || ''}`.substring(0, 500)
      });
    }

    const createdAssignments = await IndWorkerAssignment.insertMany(assignmentDocs);
    const createdBookings = await Booking.insertMany(bookingDocs);

    for (let i = 0; i < createdAssignments.length; i++) {
      if (createdBookings[i]) {
        createdAssignments[i].legacyBookingId = createdBookings[i]._id;
        await createdAssignments[i].save();
      }
    }

    request.assignmentIds = createdAssignments.map(a => a._id);
    request.finalBookingIds = createdBookings.map(b => b._id);

    if (Array.isArray(request.memberInvitations)) {
      for (const inv of request.memberInvitations) {
        if (inv.status === 'member_pending' || inv.status === 'pending') {
          inv.status = 'member_expired';
          emitSafe(`worker_${inv.workerId}`, 'workerBookingCancelled', {
            requestId: request._id,
            message: 'This team job invitation has expired because booking was finalized.'
          });
        }
      }
    }

    await request.save();

    for (const a of createdAssignments) {
      await notify({
        recipientType: 'worker',
        recipientId:   a.workerId,
        type:          'worker_booking_confirmed',
        title:         '🎉 Booking Confirmed (Cash on Service)!',
        message:       `You have been booked for ${request.workTitle}. Payment will be collected in cash directly from customer upon completion.`,
        relatedId:     a._id,
        relatedType:   'IndWorkerAssignment',
        data: {
          assignmentId:  a._id,
          requestId:     request._id,
          bookingType:   request.bookingType,
          scheduledDate: isDaily ? request.startDate : request.scheduledDate,
          startTime:     request.startTime,
          paymentMethod: 'cash'
        }
      });

      emitSafe(`worker_${a.workerId}`, 'assignment_confirmed', {
        assignmentId: a._id,
        requestId: request._id,
        bookingType: request.bookingType,
        paymentMethod: 'cash',
        serverTimestamp: new Date()
      });
      emitSafe(`worker_${a.workerId}`, 'workerJobsUpdated', {});
    }

    emitSafe(`user_${farmerId}`, 'booking_confirmed', {
      requestId: request._id,
      assignmentIds: createdAssignments.map(a => a._id),
      bookingIds: createdBookings.map(b => b._id),
      status: 'confirmed',
      paymentMethod: 'cash',
      serverTimestamp: new Date()
    });
    emitSafe(`user_${farmerId}`, 'userBookingsUpdated', {});

    return res.json({
      success: true,
      message: 'Booking confirmed with Cash on Service.',
      data: {
        requestId: request._id,
        bookingIds: createdBookings.map(b => b._id),
        assignmentIds: createdAssignments.map(a => a._id),
        paymentMethod: 'cash',
        paymentStatus: 'pending',
        confirmedWorkersCount: createdAssignments.length
      }
    });
  } catch (err) {
    console.error('[confirmWorkerBookingCash]', err);
    return res.status(500).json({ success: false, message: 'Failed to confirm booking with cash: ' + err.message });
  }
};

/**
 * Unified Parent Tracking Data
 * GET /api/user/farmer-worker-request/:id/tracking
 */
exports.getWorkerBookingTrackingData = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id } = req.params;

    const request = await WorkerBookingRequest.findOne({
      _id: id,
      farmerId
    })
      .populate({
        path: 'assignmentIds',
        populate: {
          path: 'workerId',
          select: 'name phone profilePicture skills rating averageRating primaryService experience'
        }
      })
      .populate({
        path: 'selectedWorkerIds',
        select: 'name phone profilePicture skills rating averageRating primaryService experience'
      });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Worker booking request not found.' });
    }

    let assignments = await IndWorkerAssignment.find({
      parentRequestId: request._id,
      assignmentStatus: { $ne: 'CANCELLED' }
    }).populate('workerId', 'name phone profilePicture skills rating averageRating primaryService experience');

    // Ensure each active assignment has completion and visit OTPs ready
    for (let assign of assignments) {
      if (assign.bookingType === 'DAILY') {
        const dayIdx = assign.currentDayIndex || 1;
        let dayLog = assign.dailyLogs?.find(l => l.dayNumber === dayIdx);
        if (!dayLog) {
          const rawVisitOtp = Math.floor(1000 + Math.random() * 9000).toString();
          const visitOtpHash = crypto.createHash('sha256').update(rawVisitOtp).digest('hex');
          assign.dailyLogs.push({
            dayNumber: dayIdx,
            date: new Date(),
            journeyStatus: 'NOT_STARTED',
            visitOtpCode: rawVisitOtp,
            visitOtpHash,
            visitOtpStatus: 'PENDING',
            visitOtpExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            workStatus: 'NOT_STARTED'
          });
          await assign.save();
          dayLog = assign.dailyLogs?.find(l => l.dayNumber === dayIdx);
        }

        // If today's completion OTP is not generated yet, pre-generate it
        if (dayLog && !dayLog.completionOtpCode && dayLog.workStatus !== 'COMPLETED') {
          const rawCompletionOtp = Math.floor(1000 + Math.random() * 9000).toString();
          dayLog.completionOtpCode = rawCompletionOtp;
          dayLog.completionOtpHash = crypto.createHash('sha256').update(rawCompletionOtp).digest('hex');
          dayLog.completionOtpExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
          await assign.save();
        }
      } else {
        // HOURLY completion OTP
        if (!assign.completionOtpCode && assign.completionStatus !== 'OTP_VERIFIED') {
          const rawCompletionOtp = Math.floor(1000 + Math.random() * 9000).toString();
          const completionOtpHash = crypto.createHash('sha256').update(rawCompletionOtp).digest('hex');
          assign.completionOtpCode = rawCompletionOtp;
          assign.completionOtpHash = completionOtpHash;
          assign.completionOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await assign.save();
        }
      }
    }

    // Fetch extensions for this booking
    const extensions = await IndWorkerExtension.find({
      parentRequestId: request._id
    }).populate('workerExtensions.workerId', 'name phone profilePicture').sort({ createdAt: -1 });

    const { buildFarmerPaymentSummary } = require('../../services/workerFinancialService');
    const confirmedExts = (extensions || []).filter(e => e.status === 'CONFIRMED');
    const requestData = request.toObject ? request.toObject() : { ...request };
    requestData.paymentSummary = buildFarmerPaymentSummary(request, assignments, null, confirmedExts);
    requestData.confirmedExtensions = confirmedExts;

    return res.json({
      success: true,
      data: {
        request: requestData,
        assignments,
        extensions
      }
    });
  } catch (err) {
    console.error('[getWorkerBookingTrackingData]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch tracking data: ' + err.message });
  }
};

/**
 * Farmer generates or retrieves Completion OTP for a specific assignment
 * POST /api/user/farmer-worker-request/:id/assignment/:assignmentId/completion-otp
 */
exports.generateFarmerCompletionOtp = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id, assignmentId } = req.params;

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      parentRequestId: id,
      farmerId
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    // Generate 4-digit completion OTP
    const rawCompletionOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const completionOtpHash = crypto.createHash('sha256').update(rawCompletionOtp).digest('hex');

    assignment.completionOtpCode = rawCompletionOtp;
    assignment.completionOtpHash = completionOtpHash;
    assignment.completionOtpExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    assignment.completionOtpAttempts = 0;
    await assignment.save();

    return res.json({
      success: true,
      message: 'Completion OTP generated successfully.',
      data: {
        assignmentId: assignment._id,
        completionOtp: rawCompletionOtp,
        expiresAt: assignment.completionOtpExpiresAt
      }
    });
  } catch (err) {
    console.error('[generateFarmerCompletionOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate completion OTP.' });
  }
};

/**
 * Farmer decreases an individual worker on a DAILY booking
 * POST /api/user/farmer-worker-request/:id/decrease-worker
 * Body: { assignmentId, reason }
 */
exports.decreaseWorker = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id } = req.params;
    const { assignmentId, reason } = req.body;

    if (!assignmentId) {
      return res.status(400).json({ success: false, message: 'assignmentId is required' });
    }

    const request = await WorkerBookingRequest.findOne({ _id: id, farmerId });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Worker booking request not found' });
    }

    if (request.bookingType !== 'DAILY') {
      return res.status(400).json({ success: false, message: 'Worker decrease is only applicable for DAILY bookings' });
    }

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      parentRequestId: request._id,
      farmerId,
      assignmentStatus: 'CONFIRMED'
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Active assignment not found' });
    }

    if (assignment.isDecreased) {
      return res.status(400).json({ success: false, message: 'This worker has already been marked as decreased' });
    }

    // Set decrease flags - current day will be finished, but future days stopped
    assignment.isDecreased = true;
    assignment.decreasedAt = new Date();
    assignment.decreaseReason = reason || 'Decreased by farmer';
    await assignment.save();

    // Socket update
    emitSafe(`booking_req:${request._id}`, 'assignment_decreased', {
      requestId: request._id,
      assignmentId: assignment._id,
      workerId: assignment.workerId,
      isDecreased: true,
      decreasedAt: assignment.decreasedAt,
      serverTimestamp: new Date()
    });

    // Notify worker
    await notify({
      recipientType: 'worker',
      recipientId: assignment.workerId,
      type: 'worker_decreased',
      title: 'Booking Update: Schedule Concluded',
      message: 'The farmer has concluded this job after today. Your current day work will be settled upon today’s completion.',
      relatedId: request._id,
      relatedType: 'WorkerBookingRequest',
      data: { assignmentId: assignment._id }
    });

    return res.json({
      success: true,
      message: 'Worker marked for decrease. Settlement will occur upon current day completion.',
      data: assignment
    });
  } catch (err) {
    console.error('[decreaseWorker]', err);
    return res.status(500).json({ success: false, message: 'Failed to decrease worker: ' + err.message });
  }
};

/**
 * Farmer retrieves or creates fresh Visit/Reach OTP for a worker for a specific day (DAILY booking)
 * POST /api/user/farmer-worker-request/:id/assignment/:assignmentId/daily-visit-otp
 */
exports.getOrCreateDailyVisitOtp = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id, assignmentId } = req.params;
    const { dayNumber } = req.body;

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      parentRequestId: id,
      farmerId
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const targetDay = dayNumber ? Number(dayNumber) : (assignment.currentDayIndex || 1);
    let log = assignment.dailyLogs?.find(l => l.dayNumber === targetDay);

    if (!log) {
      const rawVisitOtp = Math.floor(1000 + Math.random() * 9000).toString();
      const visitOtpHash = crypto.createHash('sha256').update(rawVisitOtp).digest('hex');
      const otpExpiryDate = new Date(Date.now() + 60 * 60 * 1000);

      assignment.dailyLogs.push({
        dayNumber: targetDay,
        date: new Date(),
        journeyStatus: 'NOT_STARTED',
        visitOtpCode: rawVisitOtp,
        visitOtpHash,
        visitOtpStatus: 'PENDING',
        visitOtpExpiresAt: otpExpiryDate,
        workStatus: 'NOT_STARTED'
      });
      await assignment.save();
      log = assignment.dailyLogs.find(l => l.dayNumber === targetDay);
    } else if (!log.visitOtpCode && log.visitOtpStatus !== 'VERIFIED') {
      const rawVisitOtp = Math.floor(1000 + Math.random() * 9000).toString();
      log.visitOtpCode = rawVisitOtp;
      log.visitOtpHash = crypto.createHash('sha256').update(rawVisitOtp).digest('hex');
      log.visitOtpStatus = 'PENDING';
      log.visitOtpExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await assignment.save();
    }

    return res.json({
      success: true,
      data: {
        assignmentId: assignment._id,
        dayNumber: targetDay,
        visitOtp: log.visitOtpCode,
        visitOtpStatus: log.visitOtpStatus,
        expiresAt: log.visitOtpExpiresAt
      }
    });
  } catch (err) {
    console.error('[getOrCreateDailyVisitOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve daily visit OTP: ' + err.message });
  }
};

/**
 * Farmer generates Completion OTP for a worker for a specific day (DAILY booking)
 * POST /api/user/farmer-worker-request/:id/assignment/:assignmentId/daily-completion-otp
 */
exports.generateDailyCompletionOtp = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id, assignmentId } = req.params;
    const { dayNumber } = req.body;

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      parentRequestId: id,
      farmerId
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const targetDay = dayNumber ? Number(dayNumber) : (assignment.currentDayIndex || 1);
    let log = assignment.dailyLogs?.find(l => l.dayNumber === targetDay);

    if (!log) {
      return res.status(400).json({ success: false, message: `Day ${targetDay} has not been started yet` });
    }

    const rawCompletionOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const completionOtpHash = crypto.createHash('sha256').update(rawCompletionOtp).digest('hex');

    log.completionOtpCode = rawCompletionOtp;
    log.completionOtpHash = completionOtpHash;
    log.completionOtpExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    log.completionOtpAttempts = 0;
    await assignment.save();

    return res.json({
      success: true,
      message: `Day ${targetDay} Completion OTP generated.`,
      data: {
        assignmentId: assignment._id,
        dayNumber: targetDay,
        completionOtp: rawCompletionOtp,
        expiresAt: log.completionOtpExpiresAt
      }
    });
  } catch (err) {
    console.error('[generateDailyCompletionOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate completion OTP: ' + err.message });
  }
};

exports.hasTimeConflict = hasTimeConflict;
exports.parseTimeToMinutes = parseTimeToMinutes;
exports.doTimesOverlap = doTimesOverlap;
exports.isSameCalendarDate = isSameCalendarDate;
exports.getCalendarDateStrings = getCalendarDateStrings;
exports.extractDocTimeRange = extractDocTimeRange;

