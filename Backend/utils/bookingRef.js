'use strict';

/**
 * ONE booking reference for a worker booking, the same on the farmer's screen, the worker's job, the admin panel and in the database.
 *
 * The farmer's request is the booking: its reference is made from its own id, so it can never differ between places and every
 * place can work it out even when nothing was stored:
 *     WRK-<yymmdd the request was made, IST>-<last 6 characters of its id>      e.g. WRK-261026-41487C
 * A worker's job (the booking record and the assignment) uses the same reference. When a request hires several workers each
 * job is numbered after it (…-1, …-2), so one booking is still one number to search for.
 *
 * Keep Frontend/src/utils/bookingRef.js identical.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');

/** Reference of a worker request, from its _id (string or ObjectId). */
const requestRef = (id) => {
  const hex = String(id || '').toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(hex)) return `WRK-${hex.slice(-6).toUpperCase()}`;
  const made = new Date(parseInt(hex.slice(0, 8), 16) * 1000 + IST_OFFSET_MS);
  const day = `${pad2(made.getUTCFullYear() % 100)}${pad2(made.getUTCMonth() + 1)}${pad2(made.getUTCDate())}`;
  return `WRK-${day}-${hex.slice(-6).toUpperCase()}`;
};

/** Reference of one worker's job under a request: the request's own when it hires one worker, else numbered. */
const jobRef = (parentRef, index, total) => (total > 1 ? `${parentRef}-${index + 1}` : parentRef);

module.exports = { requestRef, jobRef };
