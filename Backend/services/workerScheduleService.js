'use strict';

/**
 * When a worker may act on a booking, decided by SERVER time (phone clocks are not trusted):
 *   startAt          booked start — HOURLY: scheduledDate + startTime; DAILY day N: startDate + (N-1) days + reportingTime
 *   journeyOpensAt   startAt − workerJourneyWindowMinutes  (default 2 h): "Start Journey" before this is refused
 *   startOtpOpensAt  startAt − workerEarlyStartMinutes     (default 30 min): Start OTP before this is refused
 * Being late is never blocked here (late penalty / no-show handling deal with it).
 * Without a time (older DAILY bookings have no reportingTime) both open at midnight of the booked day, as before.
 */

const TZ_MIN = () => Number(process.env.APP_TZ_OFFSET_MINUTES ?? 330);
const DAY_MS = 86400000;

/** Midnight (app time zone) of the calendar day containing `d`. */
const dayStart = (d) => new Date(Math.floor((new Date(d).getTime() + TZ_MIN() * 60000) / DAY_MS) * DAY_MS - TZ_MIN() * 60000);

const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * @param parent      WorkerBookingRequest (scheduledDate, startTime, startDate, reportingTime, bookingType)
 * @param assignment  IndWorkerAssignment (bookingType)
 * @param dayIdx      DAILY day number (1-based)
 * @param settings    getWorkerFinancialSettings() result
 */
const computeStartWindows = (parent, assignment, dayIdx = 1, settings = {}) => {
  const isDaily = (assignment?.bookingType || parent?.bookingType) === 'DAILY';
  const base = isDaily ? parent?.startDate : parent?.scheduledDate;
  if (!base) return { startAt: null, journeyOpensAt: null, startOtpOpensAt: null };

  const day = new Date(dayStart(base).getTime() + (isDaily ? (Math.max(1, dayIdx) - 1) * DAY_MS : 0));
  const mins = minutesOf(isDaily ? parent?.reportingTime : parent?.startTime);
  if (mins === null) return { startAt: null, journeyOpensAt: day, startOtpOpensAt: day };

  const startAt = new Date(day.getTime() + mins * 60000);
  const journey = Number(settings.workerJourneyWindowMinutes ?? 120);
  const early = Number(settings.workerEarlyStartMinutes ?? 30);
  return {
    startAt,
    journeyOpensAt: new Date(startAt.getTime() - Math.max(0, journey) * 60000),
    startOtpOpensAt: new Date(startAt.getTime() - Math.max(0, early) * 60000)
  };
};

/** "7 Oct, 2:29 pm" in the app time zone (for messages). */
const formatAppTime = (d) => {
  const t = new Date(new Date(d).getTime() + TZ_MIN() * 60000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = t.getUTCHours();
  const m = String(t.getUTCMinutes()).padStart(2, '0');
  return `${t.getUTCDate()} ${months[t.getUTCMonth()]}, ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
};

module.exports = { computeStartWindows, formatAppTime, dayStart };
