'use strict';

/**
 * Gateway-webhook entry for payments belonging to independent-worker bookings and their extensions.
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
  return { handled: false };
};

module.exports = { handleCapturedPayment };
