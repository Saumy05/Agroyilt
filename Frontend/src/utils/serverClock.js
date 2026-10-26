/**
 * The work and break timers count from times the SERVER recorded, but the phone's own clock can be minutes off. Every payload that
 * carries `serverTime` calls syncServerClock, and the timers read nowMs() instead of Date.now(), so the worker, the farmer and the
 * admin all see the same seconds.
 */
let offsetMs = 0;

export const syncServerClock = (serverTime) => {
  const t = serverTime ? new Date(serverTime).getTime() : NaN;
  if (Number.isFinite(t)) offsetMs = t - Date.now();
};

export const nowMs = () => Date.now() + offsetMs;

/** 83.5 minutes -> "1h 23m 30s"-style short text, for break and work totals */
export const fmtMinutesExact = (minutes) => {
  const totalSec = Math.max(0, Math.round((Number(minutes) || 0) * 60));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return s ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
};
