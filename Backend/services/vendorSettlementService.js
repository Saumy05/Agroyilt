'use strict';

/**
 * A vendor paying their dues to the platform online (Razorpay).
 * The amount and the vendor come from the ORDER the server created, never from the client, and one gateway payment
 * clears dues at most once: the Settlement row (unique on the payment id) is the claim, so the app's verify call and the
 * gateway webhook can both arrive and whichever comes first wins.
 */

const Vendor = require('../models/Vendor');
const Settlement = require('../models/Settlement');
const Transaction = require('../models/Transaction');
const { getOrderDetails } = require('./razorpayService');

const ORDER_TYPE = 'vendor_settlement';

/**
 * @param {{orderId: string, paymentId: string, vendorId?: string}} args vendorId = the logged-in vendor (verify call); omit from the webhook
 * @returns {Promise<{ok: boolean, already?: boolean, code?: number, reason?: string, amount?: number}>}
 */
const applyCapturedPayment = async ({ orderId, paymentId, vendorId }) => {
  const orderRes = await getOrderDetails(orderId);
  if (!orderRes.success) return { ok: false, code: 500, reason: 'Could not read the payment order.' };
  const order = orderRes.order;

  if (order.notes?.type !== ORDER_TYPE || !order.notes?.vendorId) return { ok: false, code: 400, reason: 'Not a settlement order.' };
  if (vendorId && String(order.notes.vendorId) !== String(vendorId)) return { ok: false, code: 403, reason: 'This payment belongs to another vendor.' };

  const amount = Math.round(Number(order.amount) || 0) / 100;
  if (amount <= 0) return { ok: false, code: 400, reason: 'Invalid order amount.' };

  const vendor = await Vendor.findById(order.notes.vendorId);
  if (!vendor) return { ok: false, code: 404, reason: 'Vendor not found.' };

  const currentDues = vendor.wallet?.dues || 0;
  let settlement;
  try {
    settlement = await Settlement.create({
      vendorId: vendor._id,
      amount,
      balanceBefore: currentDues,
      balanceAfter: Math.max(0, currentDues - amount),
      paymentMethod: 'razorpay',
      paymentReference: paymentId,
      status: 'completed',
      adminNotes: 'Automated Razorpay Settlement'
    });
  } catch (e) {
    if (e.code === 11000) return { ok: true, already: true, amount };
    throw e;
  }

  try {
    vendor.wallet.dues = Math.max(0, currentDues - amount);
    vendor.wallet.totalSettled = (vendor.wallet.totalSettled || 0) + amount;

    const cashLimit = vendor.wallet.cashLimit || 10000;
    const netOwed = vendor.wallet.dues - (vendor.wallet.earnings || 0);
    if (vendor.wallet.isBlocked && netOwed <= cashLimit) {
      vendor.wallet.isBlocked = false;
      vendor.wallet.blockReason = null;
      vendor.wallet.blockedAt = null;
    }
    await vendor.save();

    await Transaction.create({
      vendorId: vendor._id,
      type: 'settlement',
      amount,
      status: 'completed',
      paymentMethod: 'razorpay',
      referenceId: paymentId,
      description: `Settlement of ₹${amount} paid via Razorpay`,
      metadata: { settlementId: settlement._id.toString() }
    });
  } catch (e) {
    // release the claim so a retry (or the webhook) can apply it
    await Settlement.deleteOne({ _id: settlement._id }).catch(() => {});
    throw e;
  }
  return { ok: true, amount };
};

/** Webhook entry: @returns {{handled: boolean, retry?: boolean, note?: string}} */
const handleCapturedPayment = async ({ orderId, paymentId, notes }) => {
  if (notes?.type !== ORDER_TYPE) return { handled: false };
  try {
    const r = await applyCapturedPayment({ orderId, paymentId });
    return { handled: true, retry: !r.ok && r.code === 500, note: r.ok ? (r.already ? 'Settlement already applied' : undefined) : r.reason };
  } catch (e) {
    console.error('[vendorSettlement webhook]', e);
    return { handled: true, retry: true, note: e.message };
  }
};

module.exports = { applyCapturedPayment, handleCapturedPayment, ORDER_TYPE };
