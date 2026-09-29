const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
const Worker = require('../../models/Worker');
const Booking = require('../../models/Booking');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { getIO } = require('../../sockets');
const {
  getBookingScheduledExpiry,
  isBookingExpired,
  expireWorkerBookingRequest
} = require('../../services/workerBookingExpiryService');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse "HH:mm" into minutes from midnight */
const toMins = (t) => {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
};

/** Check if a worker has a conflicting booking on scheduledDate between startTime–endTime */
const hasTimeConflict = async (workerId, scheduledDate, startTime, endTime) => {
  const dateStart = new Date(scheduledDate);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStart);
  dateEnd.setHours(23, 59, 59, 999);

  // Check confirmed bookings
  const bookingConflict = await Booking.findOne({
    workerId,
    scheduledDate: { $gte: dateStart, $lte: dateEnd },
    status: { $nin: ['cancelled', 'rejected', 'expired'] },
    'timeSlot.start': { $lt: endTime },
    'timeSlot.end':   { $gt: startTime }
  });
  if (bookingConflict) return true;

  // Check accepted pending single-worker requests
  const requestConflict = await WorkerBookingRequest.findOne({
    workerId,
    scheduledDate: { $gte: dateStart, $lte: dateEnd },
    status: 'accepted',
    startTime: { $lt: endTime },
    endTime:   { $gt: startTime }
  });
  return !!requestConflict;
};

/** Emit socket event safely — never throw if IO unavailable */
const emitSafe = (room, event, data) => {
  try {
    const io = getIO();
    if (io) io.to(room).emit(event, data);
  } catch (e) {
    console.warn('[Socket] emit failed (non-fatal):', e.message);
  }
};

/** Create a Notification record + emit socket */
const notify = async ({ recipientType, recipientId, type, title, message, relatedId, relatedType, data }) => {
  try {
    const notifDoc = { type, title, message, relatedId, relatedType, data: data || {} };
    if (recipientType === 'user')   notifDoc.userId   = recipientId;
    if (recipientType === 'worker') notifDoc.workerId = recipientId;

    const notif = await Notification.create(notifDoc);

    const room = recipientType === 'user'
      ? `user_${recipientId}`
      : `worker_${recipientId}`;

    emitSafe(room, 'notification', notif);
    emitSafe(room, 'worker_booking_update', { requestId: relatedId, type });
  } catch (e) {
    console.warn('[Notify] failed (non-fatal):', e.message);
  }
};

// ─── Controllers ────────────────────────────────────────────────────────────

/**
 * GET /user/workers
 * List approved independent workers & team leaders for single-worker hire.
 */
exports.listWorkers = async (req, res) => {
  try {
    const { skill, minRating, maxRate, category } = req.query;

    const query = {
      approvalStatus: 'approved',
      status: { $in: ['active', 'online', 'ONLINE', 'ACTIVE', 'offline', 'OFFLINE'] } // Allow offline workers to receive future requests
    };
    if (skill)     query.skills = { $in: [new RegExp(skill, 'i')] };
    if (minRating) query.rating = { $gte: Number(minRating) };
    if (maxRate)   query.dailyRate = { $lte: Number(maxRate) };
    if (category)  query.serviceCategories = { $in: [new RegExp(category, 'i')] };

    const workers = await Worker.find(query)
      .select('name profilePhoto workerType skills serviceCategories rating totalJobs completedJobs dailyRate hourlyRate landRate address location teamId status')
      .populate('teamId', 'name memberCount')
      .sort({ rating: -1, completedJobs: -1 })
      .limit(50);

    return res.json({ success: true, data: workers });
  } catch (err) {
    console.error('[listWorkers]', err);
    return res.status(500).json({ success: false, message: 'Failed to load workers' });
  }
};

/**
 * POST /user/worker-request
 * Farmer creates a single-worker booking request.
 */
exports.createSingleRequest = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const {
      workerId, workCategory, workTitle, workDescription,
      requiredSkills, additionalInstructions,
      scheduledDate, startTime, endTime, rateUnit,
      location, farmerOfferedRate
    } = req.body;

    // Validate required fields
    if (!workerId || !scheduledDate || !startTime || !endTime || farmerOfferedRate === undefined) {
      return res.status(400).json({ success: false, message: 'workerId, scheduledDate, startTime, endTime, and farmerOfferedRate are required.' });
    }
    if (toMins(endTime) <= toMins(startTime)) {
      return res.status(400).json({ success: false, message: 'End time must be after start time.' });
    }
    const scheduledDateObj = new Date(scheduledDate);
    if (isNaN(scheduledDateObj.getTime()) || scheduledDateObj < new Date(new Date().setHours(0,0,0,0))) {
      return res.status(400).json({ success: false, message: 'Invalid or past scheduled date.' });
    }
    if (Number(farmerOfferedRate) <= 0) {
      return res.status(400).json({ success: false, message: 'Offered rate must be greater than 0.' });
    }

    // Validate worker
    const worker = await Worker.findById(workerId);
    if (!worker || !worker.isActive || worker.approvalStatus !== 'approved') {
      return res.status(404).json({ success: false, message: 'Worker not found or not available.' });
    }

    // Prevent duplicate pending request
    const duplicate = await WorkerBookingRequest.findOne({
      farmerId, workerId, status: 'pending',
      scheduledDate: { $gte: new Date(scheduledDate).setHours(0,0,0,0), $lte: new Date(scheduledDate).setHours(23,59,59,999) }
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'You already have a pending request to this worker for this date.' });
    }

    // Check worker availability
    if (await hasTimeConflict(workerId, scheduledDate, startTime, endTime)) {
      return res.status(409).json({ success: false, message: 'Worker is not available for the selected time.' });
    }

    // Snapshot worker's current rate
    const workerRate = rateUnit === 'hourly' ? (worker.hourlyRate || 0) : (worker.dailyRate || 0);

    const scheduledEnd = getBookingScheduledExpiry({
      bookingType: rateUnit === 'daily' ? 'DAILY' : 'HOURLY',
      scheduledDate: scheduledDateObj,
      startTime,
      endTime
    });
    if (scheduledEnd.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: 'Cannot create a booking request for a scheduled time window that has already passed.' });
    }
    const expiresAt = new Date(Math.min(scheduledEnd.getTime(), Date.now() + 24 * 60 * 60 * 1000));

    // Create the request
    const request = await WorkerBookingRequest.create({
      farmerId,
      workerId,
      workCategory:   workCategory || '',
      workTitle:      workTitle || '',
      workDescription: workDescription || '',
      requiredSkills:  requiredSkills || [],
      additionalInstructions: additionalInstructions || '',
      scheduledDate:  scheduledDateObj,
      startTime, endTime,
      rateUnit:       rateUnit || 'daily',
      location:       location || {},
      workerRate,
      farmerOfferedRate: Number(farmerOfferedRate),
      expiresAt,
      negotiation: [{
        by: 'farmer',
        rate: Number(farmerOfferedRate),
        message: `Farmer's opening offer: ₹${farmerOfferedRate}`
      }]
    });

    // Notify worker
    // Fetch farmer name for better UI
    const farmer = await User.findById(farmerId).select('name');
    await notify({
      recipientType: 'worker', recipientId: workerId,
      type: 'worker_booking_request',
      title: 'New Work Request',
      message: `You have a new booking request for ${workTitle || workCategory || 'work'} on ${scheduledDateObj.toDateString()}.`,
      relatedId: request._id, relatedType: 'worker_booking_request',
      data: { 
        requestId: request._id,
        farmerName: farmer?.name || 'Farmer',
        farmerOfferedRate: request.farmerOfferedRate,
        workCategory: request.workCategory || request.workTitle || 'Work',
        scheduledDate: request.scheduledDate,
        startTime: request.startTime,
        location: request.location?.city || request.location?.addressLine1 || 'Farm Location'
      }
    });

    return res.status(201).json({ success: true, message: 'Request sent to worker.', data: request });
  } catch (err) {
    console.error('[createSingleRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to send request.' });
  }
};

/**
 * GET /user/worker-requests
 * Farmer gets their own single worker requests.
 */
exports.getMyRequests = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;
    const query = { farmerId };
    if (status) query.status = status;

    const requests = await WorkerBookingRequest.find(query)
      .populate('workerId', 'name profilePhoto skills dailyRate hourlyRate rating workerType')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    return res.json({ success: true, data: requests });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load requests.' });
  }
};

/**
 * GET /user/worker-request/:id
 * Farmer gets a single request by ID.
 */
exports.getRequestById = async (req, res) => {
  try {
    const request = await WorkerBookingRequest.findOne({
      _id: req.params.id, farmerId: req.user._id
    })
      .populate('workerId', 'name profilePhoto skills dailyRate hourlyRate rating workerType address')
      .populate('finalBookingId', 'status finalAmount');

    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    return res.json({ success: true, data: request });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load request.' });
  }
};

/**
 * PATCH /user/worker-request/:id/respond
 * Farmer responds to a counter offer from the worker.
 * body: { action: 'accept' | 'reject' | 'counter', rate? }
 */
exports.farmerRespondToCounter = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { action, rate, message } = req.body;

    const request = await WorkerBookingRequest.findOne({ _id: req.params.id, farmerId });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}.` });
    }
    // The last negotiation step must have been by the worker
    const lastStep = request.negotiation[request.negotiation.length - 1];
    if (!lastStep || lastStep.by !== 'worker') {
      return res.status(400).json({ success: false, message: 'No worker counter offer to respond to.' });
    }

    if (action === 'accept') {
      request.agreedRate = lastStep.rate;
      request.status = 'accepted';
      request.negotiation.push({ by: 'farmer', rate: lastStep.rate, message: 'Farmer accepted worker offer.' });

      await request.save();
      await notify({
        recipientType: 'worker', recipientId: request.workerId,
        type: 'worker_booking_accepted',
        title: 'Your Rate Accepted',
        message: `Farmer accepted your rate of ₹${lastStep.rate}. Work confirmed!`,
        relatedId: request._id, relatedType: 'worker_booking_request'
      });
      return res.json({ success: true, message: 'Rate accepted. Request confirmed.', data: request });

    } else if (action === 'reject') {
      request.status = 'rejected';
      request.rejectionReason = 'Farmer rejected worker counter offer.';
      await request.save();
      await notify({
        recipientType: 'worker', recipientId: request.workerId,
        type: 'worker_booking_rejected',
        title: 'Offer Rejected',
        message: `Farmer rejected your counter offer. Request closed.`,
        relatedId: request._id, relatedType: 'worker_booking_request'
      });
      return res.json({ success: true, message: 'Counter offer rejected.', data: request });

    } else if (action === 'counter') {
      if (!rate || Number(rate) <= 0) {
        return res.status(400).json({ success: false, message: 'Valid counter rate required.' });
      }
      request.negotiation.push({ by: 'farmer', rate: Number(rate), message: message || '' });
      await request.save();
      await notify({
        recipientType: 'worker', recipientId: request.workerId,
        type: 'worker_booking_counter',
        title: 'Counter Offer Received',
        message: `Farmer counter offered ₹${rate} for your services.`,
        relatedId: request._id, relatedType: 'worker_booking_request'
      });
      return res.json({ success: true, message: 'Counter offer sent.', data: request });

    } else {
      return res.status(400).json({ success: false, message: 'Invalid action. Use accept, reject, or counter.' });
    }
  } catch (err) {
    console.error('[farmerRespondToCounter]', err);
    return res.status(500).json({ success: false, message: 'Failed to respond.' });
  }
};

/**
 * DELETE /user/worker-request/:id
 * Farmer cancels a pending request.
 */
exports.cancelRequest = async (req, res) => {
  try {
    const request = await WorkerBookingRequest.findOne({ _id: req.params.id, farmerId: req.user._id });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (!['pending'].includes(request.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a ${request.status} request.` });
    }
    request.status = 'cancelled';
    await request.save();

    if (request.workerId) {
      await Worker.findByIdAndUpdate(request.workerId, { status: 'ONLINE' });

      await notify({
        recipientType: 'worker',
        recipientId: request.workerId,
        type: 'worker_request_cancelled',
        title: '❌ Request Cancelled',
        message: 'The farmer has cancelled their work request.',
        relatedId: request._id,
        relatedType: 'worker_booking_request',
        data: { requestId: request._id }
      });

      const cancelPayload = {
        requestId: request._id,
        message: 'The farmer has cancelled their work request.'
      };

      emitSafe(`worker_${request.workerId}`, 'worker_request_cancelled', cancelPayload);
      emitSafe(`worker:${request.workerId}`, 'worker_request_cancelled', cancelPayload);
      emitSafe(`worker_${request.workerId}`, 'worker_booking_cancelled', cancelPayload);
      emitSafe(`worker:${request.workerId}`, 'worker_booking_cancelled', cancelPayload);
    }

    return res.json({ success: true, message: 'Request cancelled.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to cancel request.' });
  }
};

// ─── Worker-side controllers ────────────────────────────────────────────────

/**
 * GET /worker/booking-requests
 * Worker gets their incoming requests.
 */
exports.getWorkerIncomingRequests = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { status } = req.query;
    const query = { workerId };
    if (status) query.status = status;

    const requests = await WorkerBookingRequest.find(query)
      .populate('farmerId', 'name phone profilePhoto')
      .sort({ createdAt: -1 });

    const now = new Date();
    const validRequests = [];
    for (const r of requests) {
      const evalRes = isBookingExpired(r, now);
      if (evalRes.isExpired) {
        expireWorkerBookingRequest(r, evalRes.reason).catch(() => {});
        if (!status) {
          r.status = 'expired';
          validRequests.push(r);
        } else if (status === 'expired') {
          validRequests.push(r);
        }
      } else {
        validRequests.push(r);
      }
    }

    return res.json({ success: true, data: validRequests });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load requests.' });
  }
};

/**
 * PATCH /worker/booking-request/:id/respond
 * Worker accepts, rejects, or counter-offers a single request.
 * body: { action: 'accept' | 'reject' | 'counter', rate?, message? }
 */
exports.workerRespondToRequest = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { action, rate, message } = req.body;

    const request = await WorkerBookingRequest.findOne({ _id: req.params.id, workerId });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });

    const expiryEval = isBookingExpired(request);
    const isTerminal = ['cancelled', 'expired', 'completed'].includes(request.status);

    if (expiryEval.isExpired || isTerminal) {
      if (!isTerminal) {
        request.status = 'expired';
        await request.save();
      }
      if (action === 'reject') {
        return res.json({ success: true, message: 'Request has expired and has been dismissed.', isExpired: true });
      }
      return res.status(410).json({ success: false, message: 'This request has expired.', isExpired: true });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}.` });
    }

    if (action === 'accept') {
      // Use the last negotiation rate (last farmer offer or last accepted rate)
      const lastStep = request.negotiation[request.negotiation.length - 1];
      const agreedRate = lastStep?.rate || request.farmerOfferedRate;

      // Final availability check before accepting
      if (await hasTimeConflict(workerId, request.scheduledDate, request.startTime, request.endTime)) {
        return res.status(409).json({ success: false, message: 'You have a conflicting booking for this time. Cannot accept.' });
      }

      request.agreedRate = agreedRate;
      request.status = 'accepted';
      request.negotiation.push({ by: 'worker', rate: agreedRate, message: 'Worker accepted.' });
      await request.save();

      await notify({
        recipientType: 'user', recipientId: request.farmerId,
        type: 'worker_booking_accepted',
        title: 'Worker Accepted!',
        message: `Your work request has been accepted at ₹${agreedRate}/${request.rateUnit}.`,
        relatedId: request._id, relatedType: 'worker_booking_request'
      });
      return res.json({ success: true, message: 'Request accepted.', data: request });

    } else if (action === 'reject') {
      request.status = 'rejected';
      request.rejectionReason = message || 'Worker rejected the request.';
      await request.save();

      await notify({
        recipientType: 'user', recipientId: request.farmerId,
        type: 'worker_booking_rejected',
        title: 'Request Declined',
        message: `The worker has declined your work request. Try another worker.`,
        relatedId: request._id, relatedType: 'worker_booking_request'
      });
      return res.json({ success: true, message: 'Request rejected.', data: request });

    } else if (action === 'counter') {
      if (!rate || Number(rate) <= 0) {
        return res.status(400).json({ success: false, message: 'Valid counter rate required.' });
      }
      request.negotiation.push({ by: 'worker', rate: Number(rate), message: message || '' });
      await request.save();

      await notify({
        recipientType: 'user', recipientId: request.farmerId,
        type: 'worker_booking_counter',
        title: 'Counter Offer',
        message: `Worker has countered with ₹${rate}/${request.rateUnit}. Respond to proceed.`,
        relatedId: request._id, relatedType: 'worker_booking_request'
      });
      return res.json({ success: true, message: 'Counter offer sent.', data: request });

    } else {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }
  } catch (err) {
    console.error('[workerRespondToRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to respond.' });
  }
};
