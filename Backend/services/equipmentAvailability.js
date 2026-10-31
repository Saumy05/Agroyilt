const Booking = require('../models/Booking');
const { BOOKING_STATUS } = require('../utils/constants');
const { parseSlotInterval, rentalSpan, appInstantMs, DAY_MS } = require('../utils/timeSlotHelper');

// How far back a day-based rental that is still out can have started (the booking limit is 60 rental days)
const LOOKBACK_DAYS = 62;

/**
 * Real period (ms) a rental booking keeps its machine. `endMs: null` = out past its time and not back yet,
 * so nobody knows when it will be free.
 */
const periodOf = (b, nowMs) => {
  let startMs;
  let endMs;
  const span = rentalSpan(b);
  if (span) {
    startMs = span.startMs;
    endMs = span.endMs;
    // Handed over late: the 24-hour days run from the real handover, so the machine is out until then
    if (b.startedAt) {
      const days = Math.floor(Number(b.estimatedDuration)) || 1;
      endMs = Math.max(endMs, new Date(b.startedAt).getTime() + days * DAY_MS);
    }
  } else {
    const interval = parseSlotInterval(b.timeSlot, b.scheduledTime, b.rental_type);
    const dayMs = appInstantMs(b.scheduledDate, '00:00');
    if (dayMs === null) return null;
    startMs = dayMs + interval.startMinutes * 60000;
    endMs = dayMs + interval.endMinutes * 60000;
  }
  const overdue = b.status === BOOKING_STATUS.IN_PROGRESS && endMs < nowMs;
  return { startMs, endMs: overdue ? null : endMs };
};

/**
 * For each rental machine: when it is booked / out, so the catalog and the booking screen can say so
 * before the farmer fills in a form that the server would refuse.
 *
 * Only accepted jobs count (a request the vendor has not accepted yet can still be declined), and a machine that
 * already came back (work done) is free. By-the-piece rentals have no stock count, so they are never "busy".
 *
 * @param {Array<{_id:any}>} equipmentList
 * @returns {Promise<Map<string,{busyNow:boolean,openEnded:boolean,availableFrom:string|null,booked:Array<{start:string,end:string|null}>}>>}
 */
const getRentalAvailability = async (equipmentList) => {
  const result = new Map();
  const ids = (equipmentList || []).map((e) => e._id).filter(Boolean);
  if (!ids.length) return result;

  const nowMs = Date.now();
  const { CONFLICT_STATUSES } = require('./bookingSettlementService');
  const statuses = CONFLICT_STATUSES.filter((s) => s !== BOOKING_STATUS.WORK_DONE);

  const bookings = await Booking.find({
    equipmentId: { $in: ids },
    fulfillmentMode: 'rental',
    status: { $in: statuses },
    scheduledDate: { $gte: new Date(nowMs - LOOKBACK_DAYS * DAY_MS) }
  }).select('equipmentId scheduledDate scheduledTime timeSlot rental_type estimatedDuration status startedAt unitsBooked fulfillmentMode').lean();

  const byEquipment = new Map();
  for (const b of bookings) {
    if (Number(b.unitsBooked) > 0) continue;
    const period = periodOf(b, nowMs);
    if (!period || (period.endMs !== null && period.endMs <= nowMs)) continue; // already over
    const key = String(b.equipmentId);
    if (!byEquipment.has(key)) byEquipment.set(key, []);
    byEquipment.get(key).push(period);
  }

  for (const [key, periods] of byEquipment) {
    periods.sort((a, b) => a.startMs - b.startMs);
    // Free from when? Follow back-to-back periods that start before the current one ends.
    let busyNow = false;
    let openEnded = false;
    let freeAt = nowMs;
    for (const p of periods) {
      if (p.startMs > freeAt) break; // a gap: the machine is free until this later booking
      busyNow = true;
      if (p.endMs === null) { openEnded = true; break; }
      freeAt = Math.max(freeAt, p.endMs);
    }
    result.set(key, {
      busyNow,
      openEnded,
      availableFrom: busyNow && !openEnded ? new Date(freeAt).toISOString() : null,
      booked: periods.slice(0, 20).map((p) => ({
        start: new Date(p.startMs).toISOString(),
        end: p.endMs === null ? null : new Date(p.endMs).toISOString()
      }))
    });
  }
  return result;
};

module.exports = { getRentalAvailability, periodOf };
