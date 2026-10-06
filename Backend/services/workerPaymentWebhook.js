'use strict';

/**
 * Gateway-webhook entry for payments belonging to independent-worker bookings, their extensions and worker dues.
 * Matches by order id (WorkerBookingRequest.paymentOrders / IndWorkerExtension.razorpayOrderId) and runs the
 * SAME idempotent confirmation as the client's verify call, so a payment captured while the app was closed
 * is never lost and a duplicate delivery is harmless.
 */

const WorkerBookingRequest = require('../models/WorkerBookingRequest');
const IndWorkerExtension = require('../models/IndWorkerExtension');

/** @returns {{handled: boolean, retry?: boolean, note?: string}} */
const handleCapturedPayment = async ({ orderId, paymentId, amountPaise }) => {
  const request = await WorkerBookingRequest.findOne({
    $or: [{ 'paymentOrders.orderId': orderId }, { razorpayOrderId: orderId }]
  }).select('_id farmerId');

  if (request) {
    const confirmSvc = require('./workerBookingConfirmService');
    const result = await confirmSvc.confirmRequest({ requestId: request._id, farmerId: request.farmerId, method: 'online', orderId, paymentId, actor: 'webhook' });
    if (result.ok && !result.already) {
      try {
        const { announceConfirmation } = require('../controllers/workerControllers/farmerWorkerRequestController');
        await announceConfirmation({ request: result.request, assignments: result.assignments, bookings: result.bookings, method: 'online' });
      } catch (e) { console.warn('[workerPaymentWebhook] announce failed:', e.message); }
    }
    // 500 = unexpected failure → let the gateway retry; business refusals (409) are final and already refunded
    return { handled: true, retry: result.code === 500 || !!result.inProgress, note: result.ok ? undefined : result.reason };
  }

  const ext = await IndWorkerExtension.findOne({ $or: [{ 'paymentOrders.orderId': orderId }, { razorpayOrderId: orderId }] }).select('_id parentRequestId farmerId');
  if (ext) {
    const extSvc = require('./workerExtensionService');
    const result = await extSvc.confirmExtensionPayment({ extensionId: ext._id, farmerId: ext.farmerId, orderId, paymentId, actor: 'webhook' });
    if (result.ok && !result.already) {
      try { await require('../controllers/workerControllers/extensionController')._announceExtensionConfirmed(result.extension); }
      catch (e) { console.warn('[workerPaymentWebhook] announce failed:', e.message); }
    }
    return { handled: true, retry: result.code === 500, note: result.ok ? undefined : result.reason };
  }

  // a worker paying their dues online (the order amount was fixed by the server when it was created)
  const WorkerDuesPayment = require('../models/WorkerDuesPayment');
  const dues = await WorkerDuesPayment.findOne({ razorpayOrderId: orderId, method: 'online' }).select('_id amount status razorpayPaymentId');
  if (dues) {
    if (amountPaise && amountPaise !== Math.round(Number(dues.amount) * 100)) {
      return { handled: true, note: `Dues payment amount mismatch (${amountPaise} paise for order ${orderId})` };
    }
    const r = await require('./workerDuesService').applyDuesPayment(dues._id, { fromStatus: 'CREATED', set: { razorpayPaymentId: paymentId } });
    return { handled: true, note: r.applied ? undefined : `Dues payment already ${r.payment?.status}` };
  }
  return { handled: false };
};

module.exports = { handleCapturedPayment };
