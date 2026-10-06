'use strict';

/**
 * One card per farmer hiring request for the farmer's Bookings list: plain status words, which filter tab it belongs
 * to, whether the farmer must act, and the amount — from the same bill (buildFarmerBill) Request Details shows.
 *
 *   group: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'   (the Bookings filter tabs)
 */

const IndWorkerAssignment = require('../models/IndWorkerAssignment');
const IndWorkerExtension = require('../models/IndWorkerExtension');
const { buildFarmerBill } = require('./workerFinancialService');

const BOOKED = ['confirmed', 'in_progress', 'partially_completed', 'completed'];
const PAID = ['success', 'paid', 'PAID', 'SUCCESS'];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const buildCard = (r, assignments, extensions) => {
  const required = Number(r.requiredWorkers) || 1;
  const accepted = (r.workerOffers || []).filter(o => ['accepted', 'selected'].includes(o.status)).length
    || (r.dispatchedTo || []).filter(d => d.status === 'accepted').length;
  const selected = (r.selectedWorkerIds || []).length;
  const active = assignments.filter(a => ['CONFIRMED', 'COMPLETED'].includes(a.assignmentStatus));
  const done = active.filter(a => a.settlementStatus === 'SETTLED' || a.completionStatus === 'OTP_VERIFIED').length;

  let card;
  switch (r.status) {
    case 'pending':
    case 'matching':
      card = { label: 'Finding workers', group: 'pending', detail: `${accepted} of ${required} accepted` };
      break;
    case 'awaiting_farmer_confirmation':
      card = selected > 0
        ? { label: 'Confirm booking', group: 'pending', needsAction: true, detail: `${plural(selected, 'worker')} chosen · confirm and pay` }
        : { label: 'Choose workers', group: 'pending', needsAction: true, detail: `${plural(accepted, 'worker')} accepted` };
      break;
    case 'accepted':
    case 'confirmed':
      card = { label: 'Confirmed', group: 'confirmed', detail: plural(active.length || selected || required, 'worker') };
      break;
    case 'in_progress':
    case 'partially_completed':
      card = { label: 'In progress', group: 'in_progress', detail: active.length > 1 ? `${done} of ${active.length} workers done` : plural(active.length || 1, 'worker') };
      break;
    case 'completed':
      card = { label: 'Completed', group: 'completed', detail: plural(active.length || selected || required, 'worker') };
      break;
    case 'rejected':
      card = { label: 'No workers found', group: 'cancelled', detail: plural(required, 'worker') + ' needed' };
      break;
    case 'expired':
      card = { label: 'Expired', group: 'cancelled', detail: plural(required, 'worker') + ' needed' };
      break;
    default:
      card = { label: 'Cancelled', group: 'cancelled', detail: plural(required, 'worker') + ' needed' };
  }

  // amount: the bill once booked; the amount to confirm while choosing; the budget while still finding workers
  const snap = r.financialSnapshot || {};
  let amount = null;
  if (BOOKED.includes(r.status)) {
    const bill = buildFarmerBill(r, active, extensions, { isPaid: PAID.includes(r.paymentStatus) });
    if (bill?.paymentMethod === 'cash') {
      amount = bill.cashDue > 0 ? { label: 'Pay in cash', value: bill.cashDue } : { label: 'Paid in cash', value: bill.cashPaid };
    } else if (bill) {
      amount = { label: 'Paid online', value: bill.paidOnline || bill.total };
    }
  } else if (r.status === 'awaiting_farmer_confirmation' && Number(snap.totalPayable) > 0) {
    amount = { label: 'To confirm', value: Number(snap.totalPayable) };
  } else if (['pending', 'matching', 'awaiting_farmer_confirmation'].includes(r.status)) {
    const isDaily = r.bookingType === 'DAILY';
    const rate = Number(isDaily ? (r.maxDailyRate || r.maxRate) : r.maxRate) || 0;
    const units = isDaily ? (Number(r.numberOfDays) || 1) : (Number(r.durationMinutes) || 60) / 60;
    if (rate > 0) amount = { label: 'Budget up to', value: Math.round(rate * required * units) };
  } else if (Number(r.refundAmount) > 0) {
    amount = { label: 'Refunded', value: Number(r.refundAmount) };
  }

  return { ...card, needsAction: Boolean(card.needsAction), amount };
};

/** Adds `card` to each request (plain objects). Two queries for the whole list. */
const attachRequestCards = async (requests = []) => {
  const booked = requests.filter(r => BOOKED.includes(r.status)).map(r => r._id);
  const [assignments, extensions] = booked.length
    ? await Promise.all([
        IndWorkerAssignment.find({ parentRequestId: { $in: booked } }).populate('workerId', 'name').lean(),
        IndWorkerExtension.find({ parentRequestId: { $in: booked }, status: 'CONFIRMED' }).lean()
      ])
    : [[], []];
  for (const r of requests) {
    const id = String(r._id);
    try {
      r.card = buildCard(
        r,
        assignments.filter(a => String(a.parentRequestId) === id),
        extensions.filter(e => String(e.parentRequestId) === id)
      );
    } catch (e) {
      r.card = { label: r.status, group: 'pending', needsAction: false, amount: null };
    }
  }
  return requests;
};

module.exports = { attachRequestCards, buildCard };
