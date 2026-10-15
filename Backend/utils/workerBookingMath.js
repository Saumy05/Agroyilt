'use strict';

/**
 * The two numbers a worker booking is priced from, in ONE place: how long it is booked for and what each
 * selected worker was agreed at. The quote the farmer pays, the payment summary and the assignment all use these,
 * so the farmer is charged exactly what the workers quoted.
 */

/** Minutes an HOURLY request is booked for: the stored duration, else start→end, else an hour. */
const bookedMinutes = (request) => {
  const stored = Number(request?.durationMinutes);
  if (stored > 0) return stored;
  if (request?.startTime && request?.endTime) {
    const [sH, sM] = String(request.startTime).split(':').map(Number);
    const [eH, eM] = String(request.endTime).split(':').map(Number);
    if (!Number.isNaN(sH) && !Number.isNaN(eH)) {
      let diff = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
      if (diff < 0) diff += 24 * 60;
      if (diff > 0) return diff;
    }
  }
  return 60;
};

/**
 * The rate (₹ per hour, or per day for DAILY bookings) agreed with one worker:
 *   1. the rate frozen on the payment snapshot when the farmer selected them (unless `ignoreFrozen`),
 *   2. else the worker's live offer,
 *   3. else the farmer's minimum.
 */
const rateFor = (request, workerId, { ignoreFrozen = false } = {}) => {
  const id = String(workerId);
  if (!ignoreFrozen) {
    const frozen = (request?.financialSnapshot?.workerRates || []).find((r) => String(r.workerId) === id);
    if (frozen && Number(frozen.offeredRate) > 0) return Number(frozen.offeredRate);
  }
  const offer = (request?.workerOffers || []).find((o) => String(o.workerId?._id || o.workerId) === id && o.status !== 'rejected' && o.status !== 'expired');
  if (offer && Number(offer.offeredRate) > 0) return Number(offer.offeredRate);
  const isDaily = request?.bookingType === 'DAILY';
  return Number(isDaily ? (request?.minDailyRate || request?.minRate || 0) : (request?.minRate || 0));
};

module.exports = { bookedMinutes, rateFor };
