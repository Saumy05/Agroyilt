'use strict';

/**
 * Builds the agreement and the monthly rent schedule for a land lease at the moment the owner accepts an offer.
 * Money is INR rounded to 2 decimals. The last installment absorbs the rounding remainder so the schedule always
 * adds up to exactly the total rent.
 */

/** Days after the start in which an advance first installment must be paid before the owner may end the lease. */
const FIRST_PAYMENT_GRACE_DAYS = 3;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0); // 31 Jan + 1 month -> last day of Feb, not early March
  return d;
};

/** Split an amount into `parts` installments that sum to exactly `total`. */
const splitAmount = (total, parts) => {
  const base = Math.floor((total / parts) * 100) / 100;
  const amounts = Array(parts).fill(base);
  amounts[parts - 1] = round2(total - base * (parts - 1));
  return amounts;
};

const PAYMENT_SCHEDULES = ['monthly', 'quarterly', 'half-yearly', 'upfront', 'advance-monthly'];
const MIN_ADVANCE_PERCENT = 10;
const MAX_ADVANCE_PERCENT = 90;
const MONTHS_PER_PERIOD = { monthly: 1, quarterly: 3, 'half-yearly': 6 };

/**
 * The payment plan an owner submits with a fixed-rent listing, checked and tidied. Returns { error } for a bad one.
 * An advance plan needs a percentage; every other plan ignores it.
 */
const cleanPaymentPlan = (input) => {
  const schedule = input?.schedule || 'monthly';
  if (!PAYMENT_SCHEDULES.includes(schedule)) return { error: 'Choose how the rent should be paid (monthly, quarterly, half-yearly, upfront or advance + monthly).' };
  const plan = { schedule, advancePercent: null, chargeFirstOnStart: schedule === 'upfront' || schedule === 'advance-monthly' || input?.chargeFirstOnStart === true };
  if (schedule === 'advance-monthly') {
    const pct = Number(input?.advancePercent);
    if (!(pct >= MIN_ADVANCE_PERCENT && pct <= MAX_ADVANCE_PERCENT)) return { error: `Advance must be between ${MIN_ADVANCE_PERCENT}% and ${MAX_ADVANCE_PERCENT}% of the rent.` };
    plan.advancePercent = pct;
  }
  return { plan };
};

/**
 * The plan that applies to a lease. A listing made before plans existed is monthly; an offer that carries the older
 * "pay installment 1 at the start" promise keeps that promise.
 */
const planOf = (lease, offer) => {
  const p = lease?.paymentPlan || {};
  const schedule = PAYMENT_SCHEDULES.includes(p.schedule) ? p.schedule : 'monthly';
  const advancePercent = schedule === 'advance-monthly' ? Number(p.advancePercent) || MIN_ADVANCE_PERCENT : null;
  const chargeFirstOnStart = schedule === 'upfront' || schedule === 'advance-monthly' || !!p.chargeFirstOnStart || !!offer?.payFirstInstallmentOnStart;
  return { schedule, advancePercent, chargeFirstOnStart };
};

/**
 * The installments for a rent: how much each is and how many months after the start it falls due.
 * The amounts always add up to exactly `totalRent`.
 * @returns {{ monthOffset: number, amount: number }[]}
 */
const rentSchedule = (totalRent, durationMonths, plan = {}) => {
  const months = Math.max(1, Number(durationMonths) || 1);
  const schedule = plan.schedule || 'monthly';
  if (schedule === 'upfront' || months === 1) return [{ monthOffset: 0, amount: round2(totalRent) }];
  if (schedule === 'advance-monthly') {
    const advance = round2((totalRent * (Number(plan.advancePercent) || MIN_ADVANCE_PERCENT)) / 100);
    const rest = splitAmount(round2(totalRent - advance), months - 1);
    return [{ monthOffset: 0, amount: advance }, ...rest.map((amount, i) => ({ monthOffset: i + 1, amount }))];
  }
  const step = MONTHS_PER_PERIOD[schedule] || 1;
  const count = Math.ceil(months / step);
  return splitAmount(totalRent, count).map((amount, i) => ({ monthOffset: i * step, amount }));
};

const commissionSplit = (amount, commissionPercentage) => {
  const commission = round2((amount * (Number(commissionPercentage) || 0)) / 100);
  return { commission, ownerAmount: round2(amount - commission) };
};

/**
 * @param {object} lease    LandLease document
 * @param {object} offer    the accepted offer
 * @param {number} commissionPercentage platform commission frozen into the agreement
 * @returns {{agreement: object, installments: object[]}}
 */
const buildAgreement = (lease, offer, commissionPercentage = 0) => {
  const durationMonths = Math.max(1, Number(offer.durationMonths) || 12);
  const startDate = new Date(Math.max(Date.now(), new Date(lease.availableFrom).getTime()));
  const endDate = addMonths(startDate, durationMonths);

  const agreement = {
    startDate,
    endDate,
    durationMonths,
    agreedPrice: null,
    agreedShare: null,
    totalRent: null,
    commissionPercentage,
    paymentSchedule: 'monthly',
    advancePercent: null,
    advanceFirstInstallment: false,
    firstPaymentDueBy: null
  };
  let installments = [];

  if (lease.leaseType === 'fixed-rent') {
    agreement.agreedPrice = Number(offer.proposedPrice) || Number(lease.pricePerAcre);
    agreement.totalRent = round2(lease.sizeInAcres * agreement.agreedPrice * (durationMonths / 12));
    // The owner's plan (or the tenant's older promise) has installment 1 paid when the lease starts: it is charged then, and must be paid within 3 days of the start
    const plan = planOf(lease, offer);
    agreement.paymentSchedule = plan.schedule;
    agreement.advancePercent = plan.advancePercent;
    if (plan.chargeFirstOnStart) {
      agreement.advanceFirstInstallment = true;
      agreement.firstPaymentDueBy = new Date(startDate.getTime() + FIRST_PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000);
    }
    installments = rentSchedule(agreement.totalRent, durationMonths, plan).map(({ monthOffset, amount }, i) => ({
      number: i + 1,
      dueDate: addMonths(startDate, monthOffset),
      amount,
      ...commissionSplit(amount, commissionPercentage),
      status: 'pending'
    }));
  } else {
    agreement.agreedShare = Number(offer.proposedShare) || Number(lease.sharePercentage);
  }

  return { agreement, installments };
};

module.exports = {
  buildAgreement, commissionSplit, splitAmount, round2, addMonths, FIRST_PAYMENT_GRACE_DAYS,
  PAYMENT_SCHEDULES, MIN_ADVANCE_PERCENT, MAX_ADVANCE_PERCENT, cleanPaymentPlan, planOf, rentSchedule
};
