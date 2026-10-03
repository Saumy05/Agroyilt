'use strict';

/**
 * extensionController.js
 *
 * Handles HOURLY and DAILY Time Extensions for Independent Worker Bookings.
 *
 * Rules:
 * 1. HOURLY extension: dynamic minutes (e.g. 20m), price = original agreed hourly rate * (minutes / 60) + platform fee.
 * 2. DAILY extension: additional days (e.g. 1d), price = original agreed daily rate * days + platform fee.
 * 3. Worker accept/reject is evaluated FIRST. NO payment before worker acceptance.
 * 4. Workers who do not respond within extensionExpiryMinutes are marked EXPIRED (distinct from REJECTED).
 * 5. Farmer pays ONLY for workers who ACCEPTED.
 * 6. Multiple extensions allowed, but only one active extension in evaluation or payment at a time.
 * 7. Integer paise math internally.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const IndWorkerExtension = require('../../models/IndWorkerExtension');
const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
const Worker = require('../../models/Worker');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { getWorkerFinancialSettings } = require('../../services/workerFinancialService');
const { createOrder, verifyPayment } = require('../../services/razorpayService');
const { getIO } = require('../../sockets');

const { sendNotificationToUser, sendNotificationToWorker } = require('../../services/firebaseAdmin');

// Helpers for integer paise math
const toP = (inr) => Math.round(Number(inr) * 100);
const toINR = (p) => p / 100;

/** Emit socket safely */
const emitSafe = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (e) {
    console.warn('[Socket] emit failed (non-fatal):', e.message);
  }
};

/** Create notification helper */
const notify = async ({ recipientType, recipientId, type, title, message, relatedId, relatedType, data }) => {
  try {
    const deepLink = data?.link || (
      recipientType === 'user'
        ? (relatedId ? `/user/farmer-worker-request/${relatedId}/track` : '/user/my-bookings')
        : (relatedId ? `/worker/job/${relatedId}` : '/worker/jobs')
    );

    const notifDoc = {
      type,
      title,
      message,
      relatedId,
      relatedType,
      data: { ...(data || {}), link: deepLink }
    };
    if (recipientType === 'user') notifDoc.userId = recipientId;
    if (recipientType === 'worker') notifDoc.workerId = recipientId;

    let notif = null;
    try {
      notif = await Notification.create(notifDoc);
    } catch (dbErr) {
      console.warn('[Notification DB create non-fatal]:', dbErr?.message);
    }

    const payload = notif ? (notif.toObject ? notif.toObject() : notif) : {
      ...notifDoc,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date()
    };

    const broadcastPayload = {
      ...payload,
      link: deepLink,
      ...(data || {})
    };

    const idStr = recipientId.toString();
    const rooms = recipientType === 'user'
      ? [`user_${idStr}`, `user:${idStr}`]
      : [`worker_${idStr}`, `worker:${idStr}`];

    rooms.forEach(room => {
      emitSafe(room, 'notification', broadcastPayload);
      if (type) {
        emitSafe(room, type, broadcastPayload);
      }
      if (recipientType === 'user') {
        emitSafe(room, 'userNotificationsUpdated', { unreadCountIncrement: 1, notificationId: payload._id });
      } else if (recipientType === 'worker') {
        emitSafe(room, 'workerNotificationsUpdated', { unreadCountIncrement: 1, notificationId: payload._id });
      }
    });

    // FCM Push Notification Fallback
    try {
      if (recipientType === 'worker') {
        sendNotificationToWorker(recipientId, {
          title: title || 'Time Extension Alert',
          body: message || '',
          data: {
            type: type || 'notification',
            requestId: String(relatedId || ''),
            link: deepLink
          }
        }).catch(fcmErr => {
          if (process.env.NODE_ENV !== 'test') {
            console.warn('[FCM Worker Extension Notify Non-fatal]:', fcmErr?.message);
          }
        });
      } else if (recipientType === 'user') {
        sendNotificationToUser(recipientId, {
          title: title || 'AgroYilt Update',
          body: message || '',
          data: {
            type: type || 'notification',
            requestId: String(relatedId || ''),
            link: deepLink
          }
        }).catch(fcmErr => {
          if (process.env.NODE_ENV !== 'test') {
            console.warn('[FCM User Extension Notify Non-fatal]:', fcmErr?.message);
          }
        });
      }
    } catch (fcmSyncErr) {
      console.warn('[FCM Sync Extension Notify Non-fatal]:', fcmSyncErr?.message);
    }
  } catch (e) {
    console.warn('[Notification] failed (non-fatal):', e.message);
  }
};

/**
 * Check and auto-expire pending worker extensions past expiry
 */
const evaluateExtensionExpiry = async (extension) => {
  if (extension.status !== 'WORKER_EVALUATION' && extension.status !== 'REQUESTED') {
    return extension;
  }

  if (new Date() > new Date(extension.expiresAt)) {
    let hasChanges = false;
    let anyAccepted = false;

    extension.workerExtensions.forEach(w => {
      if (w.status === 'REQUESTED') {
        w.status = 'EXPIRED'; // Distinct from REJECTED
        w.respondedAt = new Date();
        hasChanges = true;
      } else if (w.status === 'ACCEPTED') {
        anyAccepted = true;
      }
    });

    if (anyAccepted) {
      extension.status = 'PAYMENT_PENDING';
      hasChanges = true;
    } else {
      extension.status = 'EXPIRED';
      hasChanges = true;
    }

    if (hasChanges) {
      await extension.save();
    }
  }

  return extension;
};

/**
 * POST /api/user/farmer-worker-request/:id/extension
 * Farmer creates an extension request for currently active workers
 * Body: { selectedWorkerIds: [], extensionMinutes: 30, additionalDays: 1 }
 */
exports.createExtension = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id } = req.params;
    const { selectedWorkerIds, extensionMinutes, additionalDays } = req.body;

    const request = await WorkerBookingRequest.findOne({ _id: id, farmerId });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Worker booking request not found' });
    }

    const isDaily = request.bookingType === 'DAILY';

    // Validate extension parameters
    if (isDaily) {
      if (!additionalDays || Number(additionalDays) < 1) {
        return res.status(400).json({ success: false, message: 'additionalDays must be at least 1 for DAILY extension' });
      }
    } else {
      if (!extensionMinutes || Number(extensionMinutes) < 5) {
        return res.status(400).json({ success: false, message: 'extensionMinutes must be at least 5 minutes for HOURLY extension' });
      }
    }

    // Check for existing active extensions (concurrency rule: no overlapping evaluation or payment pending)
    const existingActiveExtension = await IndWorkerExtension.findOne({
      parentRequestId: request._id,
      status: { $in: ['REQUESTED', 'WORKER_EVALUATION', 'PAYMENT_PENDING'] }
    });

    if (existingActiveExtension) {
      // Check if it should expire
      await evaluateExtensionExpiry(existingActiveExtension);
      if (['REQUESTED', 'WORKER_EVALUATION', 'PAYMENT_PENDING'].includes(existingActiveExtension.status)) {
        return res.status(409).json({
          success: false,
          message: 'An active extension request is already in progress. Please complete or wait for it to finish.'
        });
      }
    }

    // Validate selected workers
    if (!selectedWorkerIds || !Array.isArray(selectedWorkerIds) || selectedWorkerIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one worker to extend' });
    }

    // Fetch assignments
    const assignments = await IndWorkerAssignment.find({
      parentRequestId: request._id,
      workerId: { $in: selectedWorkerIds },
      assignmentStatus: 'CONFIRMED',
      settlementStatus: { $ne: 'SETTLED' }
    });

    if (assignments.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid active assignments found for selected workers' });
    }

    const settings = await getWorkerFinancialSettings();
    const expiryMinutes = settings.extensionExpiryMinutes || 30;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    const commissionRate = settings.workerCommissionPercentage || 10;

    const workerExtensions = [];

    for (const assign of assignments) {
      const agreedRate = Number(assign.agreedRate || 0);
      let grossPaise = 0;

      if (isDaily) {
        grossPaise = toP(agreedRate) * Number(additionalDays);
      } else {
        const hours = Number(extensionMinutes) / 60;
        grossPaise = Math.round(toP(agreedRate) * hours);
      }

      const commissionPaise = Math.floor((grossPaise * commissionRate) / 100);
      const netPaise = grossPaise - commissionPaise;

      workerExtensions.push({
        assignmentId: assign._id,
        workerId: assign.workerId,
        status: 'REQUESTED',
        agreedRate,
        rateUnit: isDaily ? 'daily' : 'hourly',
        extensionMinutes: isDaily ? null : Number(extensionMinutes),
        additionalDays: isDaily ? Number(additionalDays) : null,
        extensionGrossAmount: toINR(grossPaise),
        extensionCommissionAmount: toINR(commissionPaise),
        extensionNetAmount: toINR(netPaise)
      });
    }

    const extension = await IndWorkerExtension.create({
      parentRequestId: request._id,
      bookingType: isDaily ? 'DAILY' : 'HOURLY',
      farmerId,
      extensionMinutes: isDaily ? null : Number(extensionMinutes),
      additionalDays: isDaily ? Number(additionalDays) : null,
      status: 'WORKER_EVALUATION',
      expiresAt,
      workerExtensions,
      idempotencyKey: `ext_${request._id}_${Date.now()}`
    });

    // Link extension to request and assignments
    await WorkerBookingRequest.findByIdAndUpdate(request._id, {
      $push: { extensionIds: extension._id }
    });
    for (const assign of assignments) {
      await IndWorkerAssignment.findByIdAndUpdate(assign._id, {
        $push: { extensionIds: extension._id }
      });
    }

    // Notify each worker
    for (const w of workerExtensions) {
      const desc = isDaily
        ? `${additionalDays} extra day(s) for ₹${w.extensionGrossAmount}`
        : `${extensionMinutes} extra minutes for ₹${w.extensionGrossAmount}`;

      await notify({
        recipientType: 'worker',
        recipientId: w.workerId,
        type: 'extension_requested',
        title: 'Time Extension Request',
        message: `Farmer has requested a time extension of ${desc}. Please accept or reject within ${expiryMinutes} minutes.`,
        relatedId: extension._id,
        relatedType: 'IndWorkerExtension',
        data: {
          extensionId: extension._id,
          assignmentId: w.assignmentId,
          requestId: request._id,
          expiresAt
        }
      });

      emitSafe(`worker_${w.workerId}`, 'extension_requested', {
        extensionId: extension._id,
        assignmentId: w.assignmentId,
        requestId: request._id,
        bookingType: extension.bookingType,
        extensionMinutes: extension.extensionMinutes,
        additionalDays: extension.additionalDays,
        grossAmount: w.extensionGrossAmount,
        netAmount: w.extensionNetAmount,
        expiresAt
      });
    }

    emitSafe(`booking_req:${request._id}`, 'extension_created', {
      requestId: request._id,
      extensionId: extension._id,
      status: extension.status,
      expiresAt
    });

    return res.json({
      success: true,
      message: `Extension request sent to ${workerExtensions.length} worker(s). Awaiting their responses.`,
      data: extension
    });

  } catch (err) {
    console.error('[createExtension]', err);
    return res.status(500).json({ success: false, message: 'Failed to create extension: ' + err.message });
  }
};

/**
 * POST /api/worker/assignments/extension/:extensionId/respond
 * Worker accepts or rejects an extension request
 * Body: { response: 'accept' | 'reject' }
 */
exports.respondToExtension = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { extensionId } = req.params;
    const { response } = req.body;

    if (!['accept', 'reject'].includes(response)) {
      return res.status(400).json({ success: false, message: 'Response must be either "accept" or "reject"' });
    }

    let extension = await IndWorkerExtension.findById(extensionId);
    if (!extension) {
      return res.status(404).json({ success: false, message: 'Extension not found' });
    }

    // Auto-expire check
    extension = await evaluateExtensionExpiry(extension);

    if (['CONFIRMED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(extension.status)) {
      return res.status(400).json({ success: false, message: `Extension evaluation is closed (status: ${extension.status})` });
    }

    const workerEntry = extension.workerExtensions.find(w => w.workerId.toString() === workerId.toString());
    if (!workerEntry) {
      return res.status(403).json({ success: false, message: 'You are not a requested worker for this extension' });
    }

    if (workerEntry.status !== 'REQUESTED') {
      return res.status(400).json({ success: false, message: `You have already responded to this extension (${workerEntry.status})` });
    }

    // Check expiry
    if (new Date() > new Date(extension.expiresAt)) {
      workerEntry.status = 'EXPIRED'; // Worker didn't respond in time
      workerEntry.respondedAt = new Date();
      await extension.save();
      return res.status(410).json({ success: false, message: 'Extension request has expired' });
    }

    // Set worker response
    workerEntry.status = response === 'accept' ? 'ACCEPTED' : 'REJECTED';
    workerEntry.respondedAt = new Date();

    // Check overall extension status
    const allResponded = extension.workerExtensions.every(w => w.status !== 'REQUESTED');
    const acceptedCount = extension.workerExtensions.filter(w => w.status === 'ACCEPTED').length;

    if (allResponded) {
      if (acceptedCount > 0) {
        extension.status = 'PAYMENT_PENDING';
      } else {
        extension.status = 'REJECTED';
      }
    } else {
      extension.status = 'WORKER_EVALUATION';
    }

    // Calculate snapshot totals for accepted workers
    const settings = await getWorkerFinancialSettings();
    const platformRate = Number(settings.workerPlatformChargePercentage) || 0;

    const acceptedPaise = extension.workerExtensions
      .filter(w => w.status === 'ACCEPTED')
      .reduce((sum, w) => sum + toP(w.extensionGrossAmount), 0);

    const platformPaise = Math.round((acceptedPaise * platformRate) / 100);
    const totalPayablePaise = acceptedPaise + platformPaise;

    extension.totalServiceAmount = toINR(acceptedPaise);
    extension.platformFeeRate = platformRate;
    extension.platformFeeAmount = toINR(platformPaise);
    extension.totalPayable = toINR(totalPayablePaise);
    extension.totalPayableAmount = toINR(totalPayablePaise);
    extension.farmerTotalAmount = toINR(totalPayablePaise);
    extension.acceptedWorkerCount = acceptedCount;

    await extension.save();

    // Socket notification to farmer
    emitSafe(`booking_req:${extension.parentRequestId}`, 'extension_worker_responded', {
      extensionId: extension._id,
      workerId,
      workerStatus: workerEntry.status,
      extensionStatus: extension.status,
      acceptedCount,
      totalPayableAmount: extension.totalPayableAmount,
      serverTimestamp: new Date()
    });

    // Notify farmer
    const workerDoc = await Worker.findById(workerId).select('name');
    await notify({
      recipientType: 'user',
      recipientId: extension.farmerId,
      type: 'extension_worker_response',
      title: response === 'accept' ? 'Worker Accepted Extension!' : 'Worker Declined Extension',
      message: `${workerDoc?.name || 'Worker'} has ${response === 'accept' ? 'ACCEPTED' : 'DECLINED'} the extension request.`,
      relatedId: extension._id,
      relatedType: 'IndWorkerExtension',
      data: { extensionId: extension._id, status: extension.status }
    });

    return res.json({
      success: true,
      message: `Extension ${response === 'accept' ? 'accepted' : 'declined'} successfully.`,
      data: extension
    });

  } catch (err) {
    console.error('[respondToExtension]', err);
    return res.status(500).json({ success: false, message: 'Failed to respond to extension: ' + err.message });
  }
};

/**
 * POST /api/user/farmer-worker-request/:id/extension/:extensionId/create-payment
 * Farmer initiates payment for accepted extension workers
 */
exports.createExtensionPayment = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id, extensionId } = req.params;

    let extension = await IndWorkerExtension.findOne({
      _id: extensionId,
      parentRequestId: id,
      farmerId
    });

    if (!extension) {
      return res.status(404).json({ success: false, message: 'Extension not found' });
    }

    extension = await evaluateExtensionExpiry(extension);

    const acceptedWorkers = extension.workerExtensions.filter(w => w.status === 'ACCEPTED');
    if (acceptedWorkers.length === 0) {
      return res.status(400).json({ success: false, message: 'No workers have accepted this extension' });
    }

    // Recalculate amount authoritatively on backend
    const settings = await getWorkerFinancialSettings();
    const platformRate = Number(settings.workerPlatformChargePercentage) || 0;

    const acceptedPaise = acceptedWorkers.reduce((sum, w) => sum + toP(w.extensionGrossAmount), 0);
    const platformPaise = Math.round((acceptedPaise * platformRate) / 100);
    const totalPayablePaise = acceptedPaise + platformPaise;
    const totalPayable = toINR(totalPayablePaise);

    extension.totalServiceAmount = toINR(acceptedPaise);
    extension.platformFeeRate = platformRate;
    extension.platformFeeAmount = toINR(platformPaise);
    extension.totalPayable = totalPayable;
    extension.totalPayableAmount = totalPayable;
    extension.farmerTotalAmount = totalPayable;
    extension.status = 'PAYMENT_PENDING';

    const orderRes = await createOrder(totalPayable, 'INR', `ext_${extension._id}`);
    if (!orderRes.success) {
      return res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }

    extension.razorpayOrderId = orderRes.orderId;
    await extension.save();

    return res.json({
      success: true,
      data: {
        orderId: orderRes.orderId,
        razorpayOrderId: orderRes.orderId,
        amount: orderRes.amount,
        currency: orderRes.currency,
        key: process.env.RAZORPAY_KEY_ID || '',
        totalPayable: extension.totalPayableAmount,
        acceptedWorkerCount: acceptedWorkers.length,
        platformFee: extension.platformFeeAmount
      }
    });

  } catch (err) {
    console.error('[createExtensionPayment]', err);
    return res.status(500).json({ success: false, message: 'Failed to initiate extension payment: ' + err.message });
  }
};

/**
 * POST /api/user/farmer-worker-request/:id/extension/:extensionId/verify-payment
 * Farmer verifies payment signature for extension
 */
exports.verifyExtensionPayment = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id, extensionId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const extension = await IndWorkerExtension.findOne({
      _id: extensionId,
      parentRequestId: id,
      farmerId,
      razorpayOrderId: razorpay_order_id
    });

    if (!extension) {
      return res.status(404).json({ success: false, message: 'Extension not found or order mismatch' });
    }

    if (extension.paymentStatus === 'success' && extension.status === 'CONFIRMED') {
      return res.json({ success: true, message: 'Extension payment already verified', data: extension });
    }

    const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      extension.paymentStatus = 'failed';
      await extension.save();
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    extension.paymentStatus = 'success';
    extension.razorpayPaymentId = razorpay_payment_id;
    extension.status = 'CONFIRMED';
    extension.paidAt = new Date();
    await extension.save();

    const isDaily = extension.bookingType === 'DAILY';
    const acceptedWorkers = extension.workerExtensions.filter(w => w.status === 'ACCEPTED');

    // Apply extension to accepted worker assignments
    for (const w of acceptedWorkers) {
      const assign = await IndWorkerAssignment.findById(w.assignmentId);
      if (assign) {
        if (isDaily) {
          assign.bookedDays = (assign.bookedDays || 1) + Number(extension.additionalDays);
        }

        const toP = (inr) => Math.round(Number(inr) * 100);
        const toINR = (p) => p / 100;

        assign.grossAmount = toINR(toP(assign.grossAmount) + toP(w.extensionGrossAmount));
        assign.commissionAmount = toINR(toP(assign.commissionAmount) + toP(w.extensionCommissionAmount));
        assign.netEarning = toINR(toP(assign.netEarning) + toP(w.extensionNetAmount));

        await assign.save();

        // Notify worker
        const extDesc = isDaily ? `${extension.additionalDays} extra day(s)` : `${extension.extensionMinutes} extra minutes`;
        await notify({
          recipientType: 'worker',
          recipientId: w.workerId,
          type: 'extension_confirmed',
          title: 'Extension Confirmed & Paid!',
          message: `Your booking has been extended by ${extDesc}. Extra earning: ₹${w.extensionNetAmount}.`,
          relatedId: extension._id,
          relatedType: 'IndWorkerExtension',
          data: { assignmentId: assign._id, extensionId: extension._id }
        });

        emitSafe(`worker_${w.workerId}`, 'extension_confirmed', {
          extensionId: extension._id,
          assignmentId: assign._id,
          grossAmount: w.extensionGrossAmount,
          netAmount: w.extensionNetAmount,
          serverTimestamp: new Date()
        });
      }
    }

    // Notify farmer of confirmed extension
    const extDesc = isDaily ? `${extension.additionalDays} extra day(s)` : `${extension.extensionMinutes} extra minutes`;
    await notify({
      recipientType: 'user',
      recipientId:   extension.farmerId,
      type:          'extension_confirmed',
      title:         '🎉 Extension Confirmed & Paid!',
      message:       `Your extension of ${extDesc} has been confirmed for ${acceptedWorkers.length} worker(s).`,
      relatedId:     extension._id,
      relatedType:   'IndWorkerExtension',
      data: {
        extensionId: extension._id,
        requestId:   id,
        link:        `/user/farmer-worker-request/${id}/track`
      }
    });

    emitSafe(`booking_req:${id}`, 'extension_confirmed', {
      extensionId: extension._id,
      status: 'CONFIRMED',
      acceptedWorkers: acceptedWorkers.map(w => w.workerId),
      serverTimestamp: new Date()
    });

    return res.json({
      success: true,
      message: 'Extension payment verified and applied successfully.',
      data: extension
    });

  } catch (err) {
    console.error('[verifyExtensionPayment]', err);
    return res.status(500).json({ success: false, message: 'Failed to verify extension payment: ' + err.message });
  }
};

/**
 * GET /api/user/farmer-worker-request/:id/extensions
 * Fetch all extensions for a booking request
 */
exports.getExtensions = async (req, res) => {
  try {
    const { id } = req.params;
    const extensions = await IndWorkerExtension.find({ parentRequestId: id })
      .populate('workerExtensions.workerId', 'name phone profilePicture')
      .sort({ createdAt: -1 });

    // Check expiry on all pending
    for (let ext of extensions) {
      await evaluateExtensionExpiry(ext);
    }

    return res.json({
      success: true,
      data: extensions
    });
  } catch (err) {
    console.error('[getExtensions]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch extensions: ' + err.message });
  }
};
