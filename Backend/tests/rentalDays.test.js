// Day-based machinery rentals: 24-hour days from pickup (period maths, validation, clashes, catalog availability).
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  rentalSpan, appInstantMs, validateSchedule, DAY_MS
} = require('../utils/timeSlotHelper');
const Booking = require('../models/Booking');

// ── helpers ───────────────────────────────────────────────────────────────
const rental = (over = {}) => ({
  rental_type: 'daily', fulfillmentMode: 'rental', scheduledDate: '2026-11-01',
  timeSlot: { start: '09:00', end: '09:00' }, estimatedDuration: 3, ...over
});
const ymd = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 10);

// Booking.find stub: serves `store` for the conflict query shape ($or of same-day + earlier day rentals)
let store = [];
const originalFind = Booking.find;
test.before(() => {
  Booking.find = (q) => {
    const rows = store.filter((b) => {
      const clauses = q.$or || [{ scheduledDate: q.scheduledDate }];
      return clauses.some((c) => {
        const sd = c.scheduledDate || {};
        const t = new Date(b.scheduledDate);
        const okDate = (!sd.$gte || t >= sd.$gte) && (!sd.$lte || t <= sd.$lte) && (!sd.$lt || t < sd.$lt);
        if (c.rental_type && b.rental_type !== c.rental_type) return false;
        if (c.fulfillmentMode && b.fulfillmentMode !== c.fulfillmentMode) return false;
        if (c.estimatedDuration && !(b.estimatedDuration >= 1)) return false;
        return okDate;
      });
    });
    return { select: () => Promise.resolve(rows) };
  };
});
test.after(() => { Booking.find = originalFind; });

// ── period maths ─────────────────────────────────────────────────────────
test('a day rental keeps the machine for days x 24 hours from pickup (app time)', () => {
  const span = rentalSpan(rental());
  assert.equal(span.startMs, Date.UTC(2026, 10, 1, 9, 0) - 330 * 60000); // 9:00 IST
  assert.equal(span.endMs - span.startMs, 3 * DAY_MS);
});

test('a late handover pushes the due time out (days run from the real handover)', () => {
  const span = rentalSpan(rental({ startedAt: new Date(Date.UTC(2026, 10, 1, 9, 0) - 330 * 60000 + 5 * 3600000) }));
  assert.equal(span.endMs, Date.UTC(2026, 10, 1, 9, 0) - 330 * 60000 + 5 * 3600000 + 3 * DAY_MS);
});

test('services, and day rentals with no day count, have no span', () => {
  assert.equal(rentalSpan(rental({ fulfillmentMode: 'service' })), null);
  assert.equal(rentalSpan(rental({ estimatedDuration: undefined })), null);
  assert.equal(rentalSpan(rental({ rental_type: 'hourly' })), null);
});

test('appInstantMs reads a date + clock time in app time', () => {
  assert.equal(new Date(appInstantMs('2026-10-30', '09:00')).toISOString(), '2026-10-30T03:30:00.000Z');
  assert.equal(appInstantMs('not-a-date', '09:00'), null);
});

// ── validation ───────────────────────────────────────────────────────────
test('same start and end time is refused unless it is a day rental', () => {
  const day = ymd(Date.now() + 5 * DAY_MS);
  const slot = { start: '09:00', end: '09:00' };
  assert.equal(validateSchedule(day, slot, undefined, { allowOvernight: true }).ok, false);
  assert.equal(validateSchedule(day, slot, undefined, { allowOvernight: true, sameTimeOk: true }).ok, true);
});

// ── clashes ──────────────────────────────────────────────────────────────
test('findVendorSlotConflict compares the whole rental period', async () => {
  const { findVendorSlotConflict } = require('../services/bookingSettlementService');
  store = [{ _id: 'a', equipmentId: 'e1', status: 'confirmed', ...rental({ scheduledDate: new Date('2026-11-01') }) }]; // out 1 Nov 9:00 -> 4 Nov 9:00
  const clash = (date, start, end, type, days) => findVendorSlotConflict(
    { scheduledDate: date, timeSlot: { start, end }, rental_type: type, estimatedDuration: days, equipmentId: 'e1', fulfillmentMode: 'rental' }, 'v1'
  );
  assert.ok(await clash('2026-11-03', '10:00', '12:00', 'hourly', 2), 'booking in the middle clashes');
  assert.ok(await clash('2026-11-04', '08:00', '09:00', 'hourly', 1), 'booking before the return clashes');
  assert.ok(await clash('2026-10-30', '09:00', '09:00', 'daily', 3), 'a rental running into it clashes');
  assert.ok(await clash('2026-11-02', '09:00', '09:00', 'daily', 1), 'a rental inside it clashes');
  assert.equal(await clash('2026-11-04', '10:00', '12:00', 'hourly', 2), null, 'after the return is free');
  assert.equal(await clash('2026-11-04', '09:00', '09:00', 'daily', 1), null, 'starting right at the return is free');
  assert.equal(await clash('2026-10-28', '09:00', '09:00', 'daily', 3), null, 'ending before it starts is free');
});

// ── catalog availability ─────────────────────────────────────────────────
test('getRentalAvailability: on rent now, back-to-back bookings, overdue, and a machine that is free', async () => {
  const { getRentalAvailability } = require('../services/equipmentAvailability');
  const now = Date.now();
  const mk = (offsetDays, days, status) => ({
    equipmentId: 'e1', scheduledDate: new Date(ymd(now + offsetDays * DAY_MS)), timeSlot: { start: '00:00', end: '00:00' },
    rental_type: 'daily', estimatedDuration: days, fulfillmentMode: 'rental', status
  });
  const run = async (rows) => {
    const original = Booking.find;
    Booking.find = () => ({ select: () => ({ lean: () => Promise.resolve(rows) }) });
    try { return (await getRentalAvailability([{ _id: 'e1' }])).get('e1'); } finally { Booking.find = original; }
  };

  assert.equal(await run([]), undefined, 'no bookings: nothing to report (free)');
  const out = await run([mk(0, 3, 'in_progress')]);
  assert.equal(out.busyNow, true);
  assert.ok(out.availableFrom);
  const later = await run([mk(5, 2, 'confirmed')]);
  assert.equal(later.busyNow, false, 'a later booking does not make it busy now');
  assert.equal(later.booked.length, 1);
  const chain = await run([mk(-1, 2, 'in_progress'), mk(1, 2, 'confirmed')]);
  assert.equal(chain.busyNow, true);
  assert.ok(new Date(chain.availableFrom).getTime() > new Date(out.availableFrom).getTime() - 1, 'free only after the second booking ends');
  const overdue = await run([mk(-5, 2, 'in_progress')]);
  assert.equal(overdue.busyNow, true);
  assert.equal(overdue.openEnded, true);
  assert.equal(overdue.availableFrom, null);
  assert.equal(await run([mk(-5, 2, 'confirmed')]), undefined, 'a booking that is already over is ignored');
});
