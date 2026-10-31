// Day-based machinery rentals: every day is 24 hours from pickup. These helpers say when the machine is due back.
// All clock times are shown in Indian time, the same zone the server uses to work the return time out.
const DAY_MS = 86400000;
const APP_TIME_ZONE = 'Asia/Kolkata';
// Fixed UTC offset of APP_TIME_ZONE ("+05:30"), for turning a picked date + time into one exact moment
const APP_UTC_OFFSET = '+05:30';

/** True for a rental (not a service) booked by the day. Accepts a booking or a socket payload. */
export const isDayRental = (b) => (
  Boolean(b) && (b.rental_type || b.rentalType) === 'daily' && b.fulfillmentMode === 'rental'
);

/** The exact moment of a picked "YYYY-MM-DD" date and "HH:mm" time, in app time. Invalid Date when either is missing. */
export const appInstant = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00${APP_UTC_OFFSET}`);

/** "YYYY-MM-DD" and "HH:mm" of a moment, in app time. */
export const appDateParts = (d) => ({
  date: d.toLocaleDateString('en-CA', { timeZone: APP_TIME_ZONE }),
  time: d.toLocaleTimeString('en-GB', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false })
});

/** "Mon, 2 Nov · 9:00 AM" */
export const formatAppDateTime = (d) => {
  const date = d.toLocaleDateString('en-IN', { timeZone: APP_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { timeZone: APP_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
  return `${date} · ${time}`;
};

/**
 * When a day rental is due back: the server's return time, pushed later when the machine was handed over late
 * (the 24-hour days then run from the real handover). Null when it cannot be worked out or this is not a day rental.
 */
export const getRentalReturnAt = (b) => {
  if (!isDayRental(b)) return null;
  const planned = b.endDate ? new Date(b.endDate) : null;
  let due = planned && !isNaN(planned.getTime()) ? planned : null;
  const days = Math.floor(Number(b.estimatedDuration));
  if (b.startedAt && days >= 1) {
    const handedOver = new Date(b.startedAt).getTime();
    if (!isNaN(handedOver)) {
      const fromHandover = new Date(handedOver + days * DAY_MS);
      if (!due || fromHandover > due) due = fromHandover;
    }
  }
  return due;
};

/** "Return Mon, 2 Nov · 9:00 AM" (or "Return by" before the handover), or null. */
export const formatRentalReturn = (b) => {
  const due = getRentalReturnAt(b);
  if (!due) return null;
  return `${b.startedAt ? 'Due back' : 'Return by'} ${formatAppDateTime(due)}`;
};
