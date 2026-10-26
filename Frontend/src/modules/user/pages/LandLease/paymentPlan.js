// How a fixed-rent lease is paid. Mirrors Backend/services/landLeaseScheduleService.js (the server builds the real schedule).

export const PAYMENT_PLAN_OPTIONS = [
  { value: 'monthly', label: 'Monthly', hint: 'Equal installment every month' },
  { value: 'quarterly', label: 'Quarterly', hint: 'Every 3 months' },
  { value: 'half-yearly', label: 'Half-yearly', hint: 'Every 6 months' },
  { value: 'upfront', label: 'Full upfront', hint: 'Whole rent when the lease starts' },
  { value: 'advance-monthly', label: 'Advance + monthly', hint: 'Part upfront, rest monthly' }
];

export const MIN_ADVANCE_PERCENT = 10;
export const MAX_ADVANCE_PERCENT = 90;

const MONTHS_PER_PERIOD = { monthly: 1, quarterly: 3, 'half-yearly': 6 };
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** The plan of a listing; listings made before plans existed are monthly. */
export const planOfLand = (land) => {
  const p = land?.paymentPlan || {};
  const schedule = PAYMENT_PLAN_OPTIONS.some((o) => o.value === p.schedule) ? p.schedule : 'monthly';
  return {
    schedule,
    advancePercent: schedule === 'advance-monthly' ? Number(p.advancePercent) || MIN_ADVANCE_PERCENT : null,
    chargeFirstOnStart: schedule === 'upfront' || schedule === 'advance-monthly' || !!p.chargeFirstOnStart
  };
};

const split = (total, parts) => {
  const base = Math.floor((total / parts) * 100) / 100;
  const amounts = Array(parts).fill(base);
  amounts[parts - 1] = round2(total - base * (parts - 1));
  return amounts;
};

/** The installment amounts for a rent, in order. */
export const rentInstallments = (totalRent, durationMonths, plan) => {
  const months = Math.max(1, Number(durationMonths) || 1);
  const schedule = plan?.schedule || 'monthly';
  if (schedule === 'upfront' || months === 1) return [round2(totalRent)];
  if (schedule === 'advance-monthly') {
    const advance = round2((totalRent * (Number(plan.advancePercent) || MIN_ADVANCE_PERCENT)) / 100);
    return [advance, ...split(round2(totalRent - advance), months - 1)];
  }
  return split(totalRent, Math.ceil(months / MONTHS_PER_PERIOD[schedule]));
};

/** One line for a listing card: "Paid monthly", "25% advance + monthly", ... */
export const planLabel = (plan) => {
  switch (plan?.schedule) {
    case 'quarterly': return 'Paid every 3 months';
    case 'half-yearly': return 'Paid every 6 months';
    case 'upfront': return 'Full rent upfront';
    case 'advance-monthly': return `${plan.advancePercent}% advance + monthly`;
    default: return 'Paid monthly';
  }
};

const inrText = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/** "₹25,000 × 4 payments", "₹12,500 now, then ₹4,167 × 11 months" ... for a list of installment amounts. */
export const describeInstallments = (amounts, plan) => {
  if (!amounts.length) return '';
  if (amounts.length === 1) return `${inrText(amounts[0])} in one payment`;
  if (plan?.schedule === 'advance-monthly') return `${inrText(amounts[0])} advance, then ${inrText(amounts[1])} × ${amounts.length - 1} months`;
  return `${inrText(amounts[0])} × ${amounts.length} payments`;
};
