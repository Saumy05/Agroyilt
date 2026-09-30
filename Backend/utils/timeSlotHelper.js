/**
 * Shared Time Slot & Interval Overlap Utility
 * Supports 24-hour ('HH:mm', 'H:mm') and 12-hour ('h:mm a', 'hh:mm a') time formats.
 * Converts time strings into minutes from midnight for robust interval overlap checks.
 */

/**
 * Parses any standard time string into minutes from midnight (0 - 1439).
 * Returns null if string cannot be parsed.
 * 
 * Examples:
 *  "09:00" -> 540
 *  "9:00" -> 540
 *  "01:00 PM" -> 780
 *  "1:00 pm" -> 780
 *  "12:00 AM" -> 0
 *  "12:00 PM" -> 720
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const str = timeStr.trim();
  if (!str) return null;

  // Match 12-hour format: "09:00 AM", "9:30 pm", "1:15 PM", "12:00 PM", "12:30 AM"
  const match12 = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridian = match12[3].toLowerCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;

    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  // Match 24-hour format: "09:00", "9:00", "14:30", "23:59"
  const match24 = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  return null;
}

/**
 * Extracts normalized [startMinutes, endMinutes] interval for a booking or requested slot.
 * If rentalType is daily or monthly, or no specific hours are given, treats slot as full day (0 to 1440).
 */
function parseSlotInterval(timeSlot, scheduledTime, rentalType) {
  const isFullDay = rentalType === 'daily' || rentalType === 'monthly';

  let startStr = '';
  let endStr = '';

  if (timeSlot) {
    if (typeof timeSlot === 'string') {
      const parts = timeSlot.split('-').map(s => s.trim());
      startStr = parts[0] || '';
      endStr = parts[1] || '';
    } else if (typeof timeSlot === 'object') {
      startStr = timeSlot.start || '';
      endStr = timeSlot.end || '';
    }
  }

  if (!startStr && scheduledTime) {
    if (typeof scheduledTime === 'string') {
      if (scheduledTime.includes('-')) {
        const parts = scheduledTime.split('-').map(s => s.trim());
        startStr = parts[0] || '';
        endStr = parts[1] || '';
      } else {
        startStr = scheduledTime;
      }
    }
  }

  if (isFullDay) {
    return {
      startMinutes: 0,
      endMinutes: 1440,
      isFullDay: true,
      rawStart: startStr,
      rawEnd: endStr
    };
  }

  let startMin = parseTimeToMinutes(startStr);
  let endMin = parseTimeToMinutes(endStr);

  if (startMin !== null && endMin !== null) {
    if (endMin <= startMin) endMin = startMin + 60; // minimum 1 hour window
    return {
      startMinutes: startMin,
      endMinutes: endMin,
      isFullDay: false,
      rawStart: startStr,
      rawEnd: endStr
    };
  }

  if (startMin !== null && endMin === null) {
    // If only start is known, default to 2-hour work block
    return {
      startMinutes: startMin,
      endMinutes: Math.min(1440, startMin + 120),
      isFullDay: false,
      rawStart: startStr,
      rawEnd: endStr
    };
  }

  // Default fallback: full day
  return {
    startMinutes: 0,
    endMinutes: 1440,
    isFullDay: true,
    rawStart: startStr,
    rawEnd: endStr
  };
}

/**
 * Checks if two intervals overlap:
 * Overlap condition: startA < endB && endA > startB
 * Accepts either parsed slot objects { startMinutes, endMinutes } or raw time strings/objects.
 */
function isIntervalOverlapping(slotA, slotB) {
  const intA = (slotA && typeof slotA.startMinutes === 'number') ? slotA : parseSlotInterval(slotA);
  const intB = (slotB && typeof slotB.startMinutes === 'number') ? slotB : parseSlotInterval(slotB);
  return intA.startMinutes < intB.endMinutes && intA.endMinutes > intB.startMinutes;
}

module.exports = {
  parseTimeToMinutes,
  parseSlotInterval,
  isIntervalOverlapping
};
