'use strict';

/**
 * Registration fee for offline (no-smartphone) team members.
 *
 * The admin's active WORKER registration fee applies to offline members too; the Team Leader pays it, from the
 * wallet or online through Razorpay. Until it is paid the member stays `isActive: false`, so dispatch and
 * selection (which only take active workers) skip them. Every payment is a RegistrationFeePayment record with
 * `paidByWorkerId` = the leader, and `markPaid` applies it exactly once (verify call and webhook share it).
 */

const Worker = require('../models/Worker');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const RegistrationFeeConfig = require('../models/RegistrationFeeConfig');
const RegistrationFeePayment = require('../models/RegistrationFeePayment');
const ledger = require('./ledgerService');

const DUPLICATE = 11000;

/** Active fee the admin set for workers (no config = free, as for an amount of 0). */
const getWorkerFee = async () => {
  const cfg = await RegistrationFeeConfig.findOne({ role: 'WORKER', isActive: true }).sort({ createdAt: -1 });
  return { amount: Number(cfg?.amount) || 0, currency: cfg?.currency || 'INR', version: cfg?.version || 1 };
};

const fail = (code, message) => ({ ok: false, code, message });

const findMember = (leaderId, memberId) =>
  Worker.findOne({ _id: memberId, managedByLeaderId: leaderId, isOfflineMember: true });

/** Shared checks before any payment starts. `done` = answer to return without a payment. */
const prepare = async (leaderId, memberId) => {
  const member = await findMember(leaderId, memberId);
  if (!member) return { done: fail(404, 'Offline member not found or not managed by you.') };
  if (member.registrationFeeStatus === 'PAID') return { done: fail(409, 'Registration fee is already paid for this member.') };
  const fee = await getWorkerFee();
  if (!(fee.amount > 0)) {
    // the admin made the fee free since this member was added: activate without a payment
    await Worker.updateOne({ _id: member._id }, { $set: { registrationFeeStatus: 'PAID', registrationFeeAmount: 0, registrationFeeVersion: fee.version, isActive: true } });
    return { done: { ok: true, free: true, message: 'Registration fee is free now. Member activated.' } };
  }
  const leader = await Worker.findById(leaderId).select('phone wallet.balance');
  return { member, fee, leader };
};

const newPaymentRecord = ({ member, leader, fee, leaderId, paymentMethod }) => new RegistrationFeePayment({
  accountId: member._id,
  roleModel: 'Worker',
  role: 'WORKER',
  mobileNumberNormalized: member.phone || leader?.phone || 'NA',
  status: 'PENDING',
  amount: fee.amount,
  currency: fee.currency,
  feeVersion: fee.version,
  paidByWorkerId: leaderId,
  paymentMethod
});

const emitWallet = (workerId, reason) => {
  try { require('./workerDuesService').emitWallet(workerId, reason); } catch (_) { /* best-effort */ }
};

/**
 * PENDING → PAID once, then activate the member. If the member was already paid for by another payment
 * (unique PAID index), this payment's amount goes back to the leader's wallet.
 */
const markPaid = async (paymentId, set = {}) => {
  let payment;
  try {
    payment = await RegistrationFeePayment.findOneAndUpdate(
      { _id: paymentId, status: 'PENDING' },
      { $set: { status: 'PAID', paidAt: new Date(), ...set } },
      { new: true }
    );
  } catch (err) {
    if (!err || err.code !== DUPLICATE) throw err;
    payment = await RegistrationFeePayment.findOneAndUpdate({ _id: paymentId, status: 'PENDING' }, { $set: { status: 'CANCELLED', ...set } }, { new: true });
    if (payment?.paidByWorkerId) {
      const key = `offline_member_fee_refund_${payment._id}`;
      await ledger.applyOnce({ ownerId: payment.paidByWorkerId, ownerModel: 'Worker', amount: payment.amount, key, reason: 'refund', referenceId: payment._id });
      await ledger.recordPassbookOnce(key, {
        workerId: payment.paidByWorkerId, type: 'refund', amount: payment.amount, status: 'completed', paymentMethod: 'wallet',
        description: `Registration fee ₹${payment.amount} returned (member's fee was already paid)`, referenceId: String(payment._id),
        metadata: { type: 'offline_member_registration_fee_refund', memberId: String(payment.accountId) }
      });
      emitWallet(payment.paidByWorkerId, 'registration_fee_refund');
    }
    return { applied: false, refunded: true, payment };
  }
  if (!payment) return { applied: false, payment: await RegistrationFeePayment.findById(paymentId) };

  await Worker.updateOne({ _id: payment.accountId }, {
    $set: {
      registrationFeeStatus: 'PAID', registrationFeeAmount: payment.amount, registrationFeeVersion: payment.feeVersion,
      registrationFeePaymentId: payment._id, isActive: true
    }
  });
  if (payment.paymentMethod === 'razorpay' && payment.paidByWorkerId) {
    await ledger.recordPassbookOnce(`offline_member_fee_${payment._id}`, {
      workerId: payment.paidByWorkerId, type: 'payment', amount: payment.amount, status: 'completed', paymentMethod: 'razorpay',
      description: 'Registration fee paid online for team member', referenceId: payment.gatewayPaymentId || String(payment._id),
      metadata: { type: 'offline_member_registration_fee', memberId: String(payment.accountId) }
    });
  }
  return { applied: true, payment };
};

/** Pay from the leader's wallet. Refused (nothing moves) when the balance is short. */
const payFromWallet = async ({ leaderId, memberId }) => {
  const { member, fee, leader, done } = await prepare(leaderId, memberId);
  if (done) return done;
  const short = () => fail(402, `Wallet balance is low. ₹${fee.amount} is needed for the registration fee — pay online instead.`);
  if ((Number(leader?.wallet?.balance) || 0) < fee.amount) return short();

  const payment = newPaymentRecord({ member, leader, fee, leaderId, paymentMethod: 'wallet' });
  await payment.save();

  const key = `offline_member_fee_${payment._id}`;
  const wallet = await ledger.ensureWallet(leaderId, 'Worker');
  await WalletTransaction.create({
    walletId: wallet._id, type: 'debit', amount: fee.amount, reason: 'registration_fee',
    referenceId: String(payment._id), idempotencyKey: key, status: 'pending'
  });
  // guarded debit: only moves when the balance covers the whole fee
  const debited = await Worker.findOneAndUpdate(
    { _id: leaderId, 'wallet.balance': { $gte: fee.amount } },
    { $inc: { 'wallet.balance': -fee.amount } }
  );
  if (!debited) {
    await WalletTransaction.updateOne({ idempotencyKey: key }, { $set: { status: 'failed' } });
    await RegistrationFeePayment.updateOne({ _id: payment._id }, { $set: { status: 'FAILED' } });
    return short();
  }
  await Wallet.updateOne({ _id: wallet._id }, [{ $set: { balance: { $max: [0, { $subtract: [{ $ifNull: ['$balance', 0] }, fee.amount] }] } } }]);
  await WalletTransaction.updateOne({ idempotencyKey: key }, { $set: { status: 'completed' } });
  await ledger.recordPassbookOnce(key, {
    workerId: leaderId, type: 'debit', amount: fee.amount, status: 'completed', paymentMethod: 'wallet',
    description: `Registration fee for team member ${member.name}`, referenceId: String(payment._id),
    metadata: { type: 'offline_member_registration_fee', memberId: String(member._id) }
  });

  const r = await markPaid(payment._id);
  emitWallet(leaderId, 'registration_fee');
  if (r.refunded) return fail(409, 'Registration fee was already paid for this member. The amount is back in your wallet.');
  return { ok: true, message: `Registration fee ₹${fee.amount} paid from wallet. ${member.name} is now active.`, payment: r.payment };
};

/** Razorpay order for the fee (amount fixed here from the admin config, not by the client). */
const createOnlineOrder = async ({ leaderId, memberId }) => {
  const { member, fee, leader, done } = await prepare(leaderId, memberId);
  if (done) return done;

  const payment = newPaymentRecord({ member, leader, fee, leaderId, paymentMethod: 'razorpay' });
  const { createOrder } = require('./razorpayService');
  const order = await createOrder(fee.amount, fee.currency, `reg_fee_OFFLINE_${Date.now()}`, {
    paymentType: 'REGISTRATION_FEE', role: 'WORKER', accountId: String(member._id),
    paymentRecordId: String(payment._id), paidByWorkerId: String(leaderId)
  });
  if (!order.success) return fail(502, 'Could not start the payment. Please try again.');

  payment.gatewayOrderId = order.orderId;
  await payment.save();
  return {
    ok: true,
    data: { paymentRecordId: payment._id, orderId: order.orderId, amount: fee.amount, currency: fee.currency, key: process.env.RAZORPAY_KEY_ID }
  };
};

const verifyOnline = async ({ leaderId, orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return fail(400, 'Payment details are missing.');
  const payment = await RegistrationFeePayment.findOne({ gatewayOrderId: orderId, paidByWorkerId: leaderId });
  if (!payment) return fail(404, 'Payment not found.');

  const { verifyPayment } = require('./razorpayService');
  if (!verifyPayment(orderId, paymentId, signature)) return fail(400, 'Payment could not be verified.');

  const r = await markPaid(payment._id, { gatewayPaymentId: paymentId });
  if (r.refunded) return fail(409, 'Registration fee was already paid for this member. The amount is back in your wallet.');
  if (!r.applied && r.payment?.status !== 'PAID') return fail(409, 'This payment can no longer be applied.');
  return { ok: true, message: r.applied ? 'Registration fee paid. Member is now active.' : 'This payment was already applied.', payment: r.payment };
};

module.exports = { getWorkerFee, markPaid, payFromWallet, createOnlineOrder, verifyOnline };
