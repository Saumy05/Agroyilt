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

const extSvc = require('../../services/workerExtensionService');
const { hasTimeConflict, hasDailyConflict } = require('./farmerWorkerRequestController');

const oidOk = (v) => mongoose.Types.ObjectId.isValid(String(v)) && String(new mongoose.Types.ObjectId(String(v))) === String(v);
const MAX_EXT_DAYS = 30;
const MAX_EXT_MINUTES = 8 * 60;

/** Worker + farmer notifications once an extension has been applied to an assignment. */
exports._notifyExtensionApplied = async ({ ext, worker, assignment }) => {
  const isDaily = ext.bookingType === 'DAILY';
  const extDesc = isDaily ? `${ext.additionalDays} extra day(s)` : `${ext.extensionMinutes} extra minutes`;
  await notify({
    recipientType: 'worker', recipientId: worker.workerId, type: 'extension_confirmed',
    title: 'Extension Confirmed!', message: `Your booking has been extended by ${extDesc}. Extra earning: ₹${worker.extensionNetAmount}.`,
    relatedId: ext._id, relatedType: 'IndWorkerExtension', data: { assignmentId: assignment._id, extensionId: ext._id }
  });
  emitSafe(`worker_${worker.workerId}`, 'extension_confirmed', {
    extensionId: ext._id, assignmentId: assignment._id, grossAmount: worker.extensionGrossAmount, netAmount: worker.extensionNetAmount, serverTimestamp: new Date()
  });
};

const announceExtensionConfirmed = async (ext) => {
  const isDaily = ext.bookingType === 'DAILY';
  const extDesc = isDaily ? `${ext.additionalDays} extra day(s)` : `${ext.extensionMinutes} extra minutes`;
  const accepted = ext.workerExtensions.filter(w => w.status === 'ACCEPTED');
  await notify({
    recipientType: 'user', recipientId: ext.farmerId, type: 'extension_confirmed',
    title: ext.paymentMode === 'cash' ? '🎉 Extension Confirmed!' : '🎉 Extension Confirmed & Paid!',
    message: `Your extension of ${extDesc} has been confirmed for ${accepted.length} worker(s).`,
    relatedId: ext._id, relatedType: 'IndWorkerExtension',
    data: { extensionId: ext._id, requestId: ext.parentRequestId, link: `/user/farmer-worker-request/${ext.parentRequestId}/track` }
  });
  emitSafe(`booking_req:${ext.parentRequestId}`, 'extension_confirmed', {
    extensionId: ext._id, status: 'CONFIRMED', acceptedWorkers: accepted.map(w => w.workerId), serverTimestamp: new Date()
  });
};

exports._announceExtensionConfirmed = announceExtensionConfirmed;

/**
 * POST /api/user/farmer-worker-request/:id/extension
 * Body: { selectedWorkerIds: [], extensionMinutes: 30, additionalDays: 1 }
 */
exports.createExtension = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id } = req.params;
    const { selectedWorkerIds } = req.body || {};
    if (!oidOk(id)) return res.status(404).json({ success: false, message: 'Worker booking request not found' });

    const request = await WorkerBookingRequest.findOne({ _id: id, farmerId });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Worker booking request not found' });
    }
    if (!['confirmed', 'in_progress', 'partially_completed'].includes(request.status)) {
      return res.status(409).json({ success: false, message: `Extensions are only possible on active bookings (status: ${request.status}).` });
    }

    const isDaily = request.bookingType === 'DAILY';
    let additionalDays = null; let extensionMinutes = null;
    if (isDaily) {
      additionalDays = Number(req.body.additionalDays);
      if (!Number.isInteger(additionalDays) || additionalDays < 1 || additionalDays > MAX_EXT_DAYS) {
        return res.status(400).json({ success: false, message: `additionalDays must be a whole number between 1 and ${MAX_EXT_DAYS}.` });
      }
    } else {
      extensionMinutes = Number(req.body.extensionMinutes);
      if (!Number.isInteger(extensionMinutes) || extensionMinutes < 5 || extensionMinutes > MAX_EXT_MINUTES) {
        return res.status(400).json({ success: false, message: `extensionMinutes must be a whole number between 5 and ${MAX_EXT_MINUTES}.` });
      }
    }

    if (!Array.isArray(selectedWorkerIds) || selectedWorkerIds.length === 0 || !selectedWorkerIds.every(oidOk)) {
      return res.status(400).json({ success: false, message: 'Please select at least one valid worker to extend' });
    }

    // an open extension that has timed out must not block a new one
    const open = await IndWorkerExtension.findOne({ parentRequestId: request._id, isActive: true });
    if (open) {
      const settled = await extSvc.closeEvaluationIfDone(open._id);
      if (settled && settled.isActive) {
        return res.status(409).json({ success: false, message: 'An active extension request is already in progress. Please complete or wait for it to finish.' });
      }
    }

    const assignments = await IndWorkerAssignment.find({
      parentRequestId: request._id,
      workerId: { $in: selectedWorkerIds },
      assignmentStatus: 'CONFIRMED',
      settlementStatus: 'PENDING',
      completionStatus: 'PENDING',
      isDecreased: { $ne: true }
    });
    if (assignments.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid active assignments found for selected workers' });
    }

    const settings = await getWorkerFinancialSettings();
    const expiryMinutes = settings.extensionExpiryMinutes || 30;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    const commissionRate = settings.workerCommissionPercentage ?? 10;

    const workerExtensions = assignments.map(assign => {
      const agreedRate = Number(assign.agreedRate || 0);
      const grossPaise = isDaily ? toP(agreedRate) * additionalDays : Math.round(toP(agreedRate) * (extensionMinutes / 60));
      const commissionPaise = Math.floor((grossPaise * commissionRate) / 100);
      return {
        assignmentId: assign._id, workerId: assign.workerId, status: 'REQUESTED', agreedRate,
        rateUnit: isDaily ? 'daily' : 'hourly', extensionMinutes: isDaily ? null : extensionMinutes, additionalDays: isDaily ? additionalDays : null,
        extensionGrossAmount: toINR(grossPaise), extensionCommissionAmount: toINR(commissionPaise), extensionNetAmount: toINR(grossPaise - commissionPaise)
      };
    });

    let extension;
    try {
      extension = await IndWorkerExtension.create({
        parentRequestId: request._id,
        bookingType: isDaily ? 'DAILY' : 'HOURLY',
        farmerId,
        extensionMinutes, additionalDays,
        status: 'WORKER_EVALUATION',
        isActive: true,
        paymentMode: request.paymentMethod === 'cash' ? 'cash' : 'online',
        expiresAt,
        workerExtensions,
        financialSnapshot: { commissionRate, platformChargeRate: Number(settings.workerPlatformChargePercentage) || 0, extensionExpiryMinutes: expiryMinutes, createdAt: new Date() },
        idempotencyKey: `ext_${request._id}_${new mongoose.Types.ObjectId()}`
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ success: false, message: 'An active extension request is already in progress. Please complete or wait for it to finish.' });
      }
      throw err;
    }

    await WorkerBookingRequest.updateOne({ _id: request._id }, { $push: { extensionIds: extension._id } });
    await IndWorkerAssignment.updateMany({ _id: { $in: assignments.map(a => a._id) } }, { $push: { extensionIds: extension._id } });

    for (const w of workerExtensions) {
      const desc = isDaily ? `${additionalDays} extra day(s) for ₹${w.extensionGrossAmount}` : `${extensionMinutes} extra minutes for ₹${w.extensionGrossAmount}`;
      await notify({
        recipientType: 'worker', recipientId: w.workerId, type: 'extension_requested', title: 'Time Extension Request',
        message: `Farmer has requested a time extension of ${desc}. Please accept or reject within ${expiryMinutes} minutes.`,
        relatedId: extension._id, relatedType: 'IndWorkerExtension',
        data: { extensionId: extension._id, assignmentId: w.assignmentId, requestId: request._id, expiresAt }
      });
      emitSafe(`worker_${w.workerId}`, 'extension_requested', {
        extensionId: extension._id, assignmentId: w.assignmentId, requestId: request._id, bookingType: extension.bookingType,
        extensionMinutes: extension.extensionMinutes, additionalDays: extension.additionalDays,
        grossAmount: w.extensionGrossAmount, netAmount: w.extensionNetAmount, expiresAt
      });
    }
    emitSafe(`booking_req:${request._id}`, 'extension_created', { requestId: request._id, extensionId: extension._id, status: extension.status, expiresAt });

    return res.json({ success: true, message: `Extension request sent to ${workerExtensions.length} worker(s). Awaiting their responses.`, data: extension });
  } catch (err) {
    console.error('[createExtension]', err);
    return res.status(500).json({ success: false, message: 'Failed to create extension: ' + err.message });
  }
};

/**
 * POST /api/worker/assignments/extension/:extensionId/respond   Body: { response: 'accept' | 'reject' }
 */
exports.respondToExtension = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { extensionId } = req.params;
    const { response } = req.body || {};

    if (!['accept', 'reject'].includes(response)) {
      return res.status(400).json({ success: false, message: 'Response must be either "accept" or "reject"' });
    }
    if (!oidOk(extensionId)) return res.status(404).json({ success: false, message: 'Extension not found' });

    const found = await IndWorkerExtension.findById(extensionId);
    if (!found) return res.status(404).json({ success: false, message: 'Extension not found' });
    const mine = found.workerExtensions.find(w => String(w.workerId) === String(workerId));
    if (!mine) return res.status(403).json({ success: false, message: 'You are not a requested worker for this extension' });

    // time-box the evaluation before answering (also finalises a timed-out extension)
    const current = await extSvc.closeEvaluationIfDone(extensionId);
    if (!extSvc.OPEN.includes(current.status)) {
      return res.status(400).json({ success: false, message: `Extension evaluation is closed (status: ${current.status})` });
    }
    const myNow = current.workerExtensions.find(w => String(w.workerId) === String(workerId));
    if (myNow.status !== 'REQUESTED') {
      return res.status(400).json({ success: false, message: `You have already responded to this extension (${myNow.status})` });
    }

    // a worker may only take on extra time they are actually free for
    if (response === 'accept') {
      const parent = await WorkerBookingRequest.findById(current.parentRequestId);
      if (parent) {
        const busy = current.bookingType === 'DAILY'
          ? await hasDailyConflict(workerId, new Date(new Date(parent.endDate).getTime() + 86400000), new Date(new Date(parent.endDate).getTime() + current.additionalDays * 86400000), parent._id)
          : await hasTimeConflict(workerId, parent.scheduledDate, parent.endTime, extSvcAddMinutes(parent.endTime, current.extensionMinutes), parent._id);
        if (busy) return res.status(409).json({ success: false, message: 'You have a conflicting booking for the extended time. Cannot accept.' });
      }
    }

    // atomic per-worker answer: only while open, unexpired and still unanswered (parallel answers cannot clobber each other)
    const answered = await IndWorkerExtension.findOneAndUpdate(
      { _id: extensionId, status: { $in: extSvc.OPEN }, expiresAt: { $gt: new Date() }, workerExtensions: { $elemMatch: { workerId, status: 'REQUESTED' } } },
      { $set: { 'workerExtensions.$.status': response === 'accept' ? 'ACCEPTED' : 'REJECTED', 'workerExtensions.$.respondedAt': new Date() } },
      { new: true }
    );
    if (!answered) {
      return res.status(409).json({ success: false, message: 'This extension can no longer be answered.' });
    }

    const closed = await extSvc.closeEvaluationIfDone(extensionId);
    const acceptedCount = closed.workerExtensions.filter(w => w.status === 'ACCEPTED').length;
    const workerEntry = closed.workerExtensions.find(w => String(w.workerId) === String(workerId));

    emitSafe(`booking_req:${closed.parentRequestId}`, 'extension_worker_responded', {
      extensionId: closed._id, workerId, workerStatus: workerEntry.status, extensionStatus: closed.status,
      acceptedCount, totalPayableAmount: closed.totalPayableAmount, serverTimestamp: new Date()
    });
    const workerDoc = await Worker.findById(workerId).select('name');
    await notify({
      recipientType: 'user', recipientId: closed.farmerId, type: 'extension_worker_response',
      title: response === 'accept' ? 'Worker Accepted Extension!' : 'Worker Declined Extension',
      message: `${workerDoc?.name || 'Worker'} has ${response === 'accept' ? 'ACCEPTED' : 'DECLINED'} the extension request.`,
      relatedId: closed._id, relatedType: 'IndWorkerExtension', data: { extensionId: closed._id, status: closed.status }
    });
    if (closed.status === 'CONFIRMED') await announceExtensionConfirmed(closed);

    return res.json({ success: true, message: `Extension ${response === 'accept' ? 'accepted' : 'declined'} successfully.`, data: closed });
  } catch (err) {
    console.error('[respondToExtension]', err);
    return res.status(500).json({ success: false, message: 'Failed to respond to extension: ' + err.message });
  }
};
const extSvcAddMinutes = (hhmm, minutes) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + (m || 0) + (Number(minutes) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * POST /api/user/farmer-worker-request/:id/extension/:extensionId/create-payment
 */
exports.createExtensionPayment = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id, extensionId } = req.params;
    if (!oidOk(id) || !oidOk(extensionId)) return res.status(404).json({ success: false, message: 'Extension not found' });

    let extension = await IndWorkerExtension.findOne({ _id: extensionId, parentRequestId: id, farmerId });
    if (!extension) return res.status(404).json({ success: false, message: 'Extension not found' });

    extension = await extSvc.closeEvaluationIfDone(extension._id);
    if (extension.paymentMode === 'cash') {
      return res.status(400).json({ success: false, message: 'This extension is part of a cash booking and has no online payment.' });
    }
    if (extension.status !== 'PAYMENT_PENDING') {
      const stillWaiting = extSvc.OPEN.includes(extension.status);
      return res.status(stillWaiting ? 409 : 400).json({
        success: false,
        message: stillWaiting ? 'Workers are still responding to this extension.' : `This extension cannot be paid (status: ${extension.status}).`
      });
    }
    if (['success', 'processing'].includes(extension.paymentStatus)) {
      return res.status(409).json({ success: false, message: 'This extension is already paid or being processed.' });
    }

    // totals were frozen when evaluation closed; nothing can change them any more
    const totalPaise = toP(extension.totalPayable);
    if (!(totalPaise > 0)) return res.status(400).json({ success: false, message: 'No workers have accepted this extension' });

    const existing = (extension.paymentOrders || []).find(o => o.orderId === extension.razorpayOrderId && o.amountPaise === totalPaise);
    if (existing) {
      return res.json({
        success: true,
        data: {
          orderId: existing.orderId, razorpayOrderId: existing.orderId, amount: totalPaise, currency: 'INR', key: process.env.RAZORPAY_KEY_ID || '',
          totalPayable: extension.totalPayableAmount, acceptedWorkerCount: extension.acceptedWorkerCount, platformFee: extension.platformFeeAmount
        }
      });
    }

    const orderRes = await createOrder(extension.totalPayable, 'INR', `ext_${extension._id}`);
    if (!orderRes.success) {
      return res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }
    const attached = await IndWorkerExtension.findOneAndUpdate(
      { _id: extension._id, status: 'PAYMENT_PENDING', paymentStatus: { $in: ['not_started', 'pending', 'failed'] } },
      {
        $set: { razorpayOrderId: orderRes.orderId, paymentStatus: 'pending' },
        $push: { paymentOrders: { orderId: orderRes.orderId, amountPaise: Math.round(Number(orderRes.amount) || totalPaise), createdAt: new Date() } }
      },
      { new: true }
    );
    if (!attached) return res.status(409).json({ success: false, message: 'The extension changed while creating the order. Please retry.' });

    return res.json({
      success: true,
      data: {
        orderId: orderRes.orderId, razorpayOrderId: orderRes.orderId, amount: orderRes.amount, currency: orderRes.currency,
        key: process.env.RAZORPAY_KEY_ID || '', totalPayable: extension.totalPayableAmount,
        acceptedWorkerCount: extension.acceptedWorkerCount, platformFee: extension.platformFeeAmount
      }
    });
  } catch (err) {
    console.error('[createExtensionPayment]', err);
    return res.status(500).json({ success: false, message: 'Failed to initiate extension payment: ' + err.message });
  }
};

/**
 * POST /api/user/farmer-worker-request/:id/extension/:extensionId/verify-payment
 */
exports.verifyExtensionPayment = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { id, extensionId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!oidOk(id) || !oidOk(extensionId)) return res.status(404).json({ success: false, message: 'Extension not found or order mismatch' });
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment details are required.' });
    }
    if (!verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const owned = await IndWorkerExtension.exists({ _id: extensionId, parentRequestId: id, farmerId });
    if (!owned) return res.status(404).json({ success: false, message: 'Extension not found or order mismatch' });

    const result = await extSvc.confirmExtensionPayment({ extensionId, farmerId, orderId: razorpay_order_id, paymentId: razorpay_payment_id });
    if (!result.ok) {
      return res.status(result.code || 400).json({ success: false, message: result.reason, refunded: !!result.refunded });
    }
    if (!result.already) await announceExtensionConfirmed(result.extension);
    return res.json({
      success: true,
      message: result.already ? 'Extension payment already verified' : 'Extension payment verified and applied successfully.',
      data: result.extension
    });
  } catch (err) {
    console.error('[verifyExtensionPayment]', err);
    return res.status(500).json({ success: false, message: 'Failed to verify extension payment: ' + err.message });
  }
};

/**
 * GET /api/user/farmer-worker-request/:id/extensions  — the booking's own farmer only.
 */
exports.getExtensions = async (req, res) => {
  try {
    const { id } = req.params;
    if (!oidOk(id)) return res.status(404).json({ success: false, message: 'Worker booking request not found' });

    const owned = await WorkerBookingRequest.exists({ _id: id, farmerId: req.user._id });
    if (!owned) return res.status(404).json({ success: false, message: 'Worker booking request not found' });

    const open = await IndWorkerExtension.find({ parentRequestId: id, isActive: true }).select('_id');
    for (const e of open) await extSvc.closeEvaluationIfDone(e._id);

    const extensions = await IndWorkerExtension.find({ parentRequestId: id, farmerId: req.user._id })
      .populate('workerExtensions.workerId', 'name phone profilePicture')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: extensions });
  } catch (err) {
    console.error('[getExtensions]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch extensions: ' + err.message });
  }
};
