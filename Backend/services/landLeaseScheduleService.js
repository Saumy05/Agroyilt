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
    advanceFirstInstallment: false,
    firstPaymentDueBy: null
  };
  let installments = [];

  if (lease.leaseType === 'fixed-rent') {
    agreement.agreedPrice = Number(offer.proposedPrice) || Number(lease.pricePerAcre);
    agreement.totalRent = round2(lease.sizeInAcres * agreement.agreedPrice * (durationMonths / 12));
    // The farmer promised to pay installment 1 when the lease starts: it is charged then, and must be paid within 3 days of the start
    if (offer.payFirstInstallmentOnStart) {
      agreement.advanceFirstInstallment = true;
      agreement.firstPaymentDueBy = new Date(startDate.getTime() + FIRST_PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000);
    }
    installments = splitAmount(agreement.totalRent, durationMonths).map((amount, i) => ({
      number: i + 1,
      dueDate: addMonths(startDate, i),
      amount,
      ...commissionSplit(amount, commissionPercentage),
      status: 'pending'
    }));
  } else {
    agreement.agreedShare = Number(offer.proposedShare) || Number(lease.sharePercentage);
  }

  return { agreement, installments };
};

module.exports = { buildAgreement, commissionSplit, splitAmount, round2, addMonths, FIRST_PAYMENT_GRACE_DAYS };
