'use strict';

/**
 * The break of a DAILY booking, in one place so the worker, the farmer, the admin and the database all show the same numbers.
 *
 * Rules
 *  - Each working day has ONE break allowance (60 minutes, assignment.breakMaxMinutes) that is shared by all the breaks of that day:
 *    take 20 minutes, resume, and the next break has 40 minutes left, not a fresh 60.
 *  - A running break resumes by itself when the day's allowance is used up.
 *  - Break time is kept exactly (fractional minutes), never rounded to whole minutes, so the work clock does not jump when work resumes.
 *  - The day's log (dailyLogs[n]) is the record; the assignment-level fields mirror TODAY and start again at 0 on a new day.
 *  - Work time = now − work start − break time used (finished breaks + the one running).
 */

const DEFAULT_MAX_MINUTES = 60;
const round4 = (n) => Math.round(n * 10000) / 10000;

const currentLog = (a) => (a.dailyLogs || []).find((l) => l.dayNumber === (a.currentDayIndex || 1)) || null;

/** The break fields of the day being worked (the day log for a daily booking, else the assignment). */
const dayBreakSource = (a) => {
  const log = a.bookingType === 'DAILY' ? currentLog(a) : null;
  return log || a;
};

/**
 * What the screens show for the current day. Pure: works on a document or a plain object; changes nothing.
 * @returns {{ breakStatus, breakStartedAt, breakDurationMinutes, breakMaxMinutes, remainingSeconds, expired, serverTime }}
 */
const breakView = (a, nowMs = Date.now()) => {
  const src = dayBreakSource(a);
  const max = Number(a.breakMaxMinutes) || DEFAULT_MAX_MINUTES;
  let done = Math.max(0, Number(src.breakDurationMinutes) || 0);
  let status = src.breakStatus || a.breakStatus || 'NOT_ON_BREAK';
  let startedAt = src.breakStartedAt || a.breakStartedAt || null;
  let expired = false;
  let remainingSeconds;

  if (status === 'ON_BREAK' && startedAt) {
    const runningMin = Math.max(0, (nowMs - new Date(startedAt).getTime()) / 60000);
    const left = Math.max(0, max - done);
    if (runningMin >= left) {
      // the day's allowance ran out while on break: it resumes by itself
      expired = true;
      done = round4(done + left);
      status = 'NOT_ON_BREAK';
      startedAt = null;
      remainingSeconds = 0;
    } else {
      remainingSeconds = Math.max(0, Math.floor((left - runningMin) * 60));
    }
  } else {
    status = 'NOT_ON_BREAK';
    startedAt = null;
    remainingSeconds = Math.max(0, Math.floor((max - done) * 60));
  }

  return {
    breakStatus: status, breakStartedAt: startedAt, breakDurationMinutes: round4(done), breakMaxMinutes: max,
    remainingSeconds, expired, serverTime: new Date(nowMs)
  };
};

/** Minutes this day's allowance still has when no break is running. */
const allowanceLeftMinutes = (a) => {
  const max = Number(a.breakMaxMinutes) || DEFAULT_MAX_MINUTES;
  const used = Math.max(0, Number(dayBreakSource(a).breakDurationMinutes) || 0);
  return Math.max(0, max - used);
};

/**
 * End the running break on a MONGOOSE document (the caller saves it). `elapsed` is exact and never more than the day's allowance.
 * @returns {number} the minutes this break lasted
 */
const endBreak = (a, actor, nowMs = Date.now()) => {
  const log = a.bookingType === 'DAILY' ? currentLog(a) : null;
  const src = log || a;
  const startedAt = src.breakStartedAt || a.breakStartedAt;
  const left = allowanceLeftMinutes(a);
  const elapsed = startedAt ? Math.min(left, Math.max(0, (nowMs - new Date(startedAt).getTime()) / 60000)) : 0;
  const total = round4((Number(src.breakDurationMinutes) || 0) + elapsed);

  a.breakStatus = 'NOT_ON_BREAK';
  a.breakStartedAt = null;
  a.lastBreakResumedBy = actor;
  // the assignment-level field mirrors today
  a.breakDurationMinutes = log ? total : round4((Number(a.breakDurationMinutes) || 0) + elapsed);
  if (log) {
    log.breakStatus = 'NOT_ON_BREAK';
    log.breakStartedAt = null;
    log.lastBreakResumedBy = actor;
    log.breakDurationMinutes = total;
  }
  return round4(elapsed);
};

/** The fields that start a new working day with a fresh break allowance (the previous days stay in their logs). */
const newDayBreakReset = () => ({ breakStatus: 'NOT_ON_BREAK', breakStartedAt: null, breakDurationMinutes: 0 });

/**
 * Resume, by themselves, the breaks whose day allowance has run out. Called by the expiry scheduler so a forgotten break
 * does not stay "on break" until somebody opens a screen. Returns how many were resumed.
 */
const resumeExpiredBreaks = async () => {
  const IndWorkerAssignment = require('../models/IndWorkerAssignment');
  const candidates = await IndWorkerAssignment.find({
    bookingType: 'DAILY', assignmentStatus: 'CONFIRMED',
    $or: [{ breakStatus: 'ON_BREAK' }, { 'dailyLogs.breakStatus': 'ON_BREAK' }]
  }).limit(200);
  let resumed = 0;
  for (const a of candidates) {
    if (!breakView(a).expired) continue;
    const minutes = endBreak(a, 'system');
    a.auditLog.push({ at: new Date(), actor: 'system', event: 'break_auto_resumed', meta: { dayNumber: a.currentDayIndex || 1, minutes } });
    try {
      await a.save();
      resumed++;
    } catch (e) {
      console.error('[resumeExpiredBreaks]', e.message);
    }
  }
  return resumed;
};

/**
 * The timing of a worker booking for the admin: per working day, when work started and ended, the break used and the work time
 * (work = end or now − start − break). The same figures the worker and the farmer see.
 */
const timingForAdmin = (a, nowMs = Date.now()) => {
  const max = Number(a.breakMaxMinutes) || DEFAULT_MAX_MINUTES;
  const row = (day, startedAt, endedAt, breakMin, onBreakSince) => {
    const start = startedAt ? new Date(startedAt).getTime() : null;
    const end = endedAt ? new Date(endedAt).getTime() : null;
    const runningBreak = onBreakSince && !end ? Math.max(0, (nowMs - new Date(onBreakSince).getTime()) / 60000) : 0;
    const brk = round4(Math.min(max, (Number(breakMin) || 0) + runningBreak));
    const workMin = start ? Math.max(0, round4(((end || nowMs) - start) / 60000 - brk)) : null;
    return { day, workStartedAt: startedAt || null, workEndedAt: endedAt || null, breakMinutes: brk, workMinutes: workMin, onBreak: Boolean(onBreakSince) };
  };
  if (a.bookingType === 'DAILY') {
    return {
      bookingType: 'DAILY', breakAllowanceMinutes: max, serverTime: new Date(nowMs),
      days: (a.dailyLogs || []).filter((l) => l.workStartedAt || l.dayNumber <= (a.workedDays || 0) + 1).map((l) => row(
        l.dayNumber, l.workStartedAt, l.completedAt || l.completionOtpVerifiedAt, l.breakDurationMinutes,
        l.breakStatus === 'ON_BREAK' ? l.breakStartedAt : null
      ))
    };
  }
  return {
    bookingType: 'HOURLY', breakAllowanceMinutes: max, serverTime: new Date(nowMs),
    days: [row(1, a.workStartedAt, a.workSubmittedAt, a.breakDurationMinutes, a.breakStatus === 'ON_BREAK' ? a.breakStartedAt : null)]
  };
};

module.exports = { timingForAdmin, DEFAULT_MAX_MINUTES, breakView, allowanceLeftMinutes, endBreak, newDayBreakReset, resumeExpiredBreaks };
