'use strict';

/**
 * Visit / completion OTP verification for IndWorkerAssignment (HOURLY and per-day DAILY).
 *
 * Security properties
 *  - the attempt is RESERVED with an atomic $inc *before* the code is compared, and the reservation is
 *    conditional on attempts < max — so N parallel guesses can never evaluate more than `max` codes;
 *  - expiry is enforced (an expired OTP is dead, not a standing credential);
 *  - comparison is constant-time against a keyed HMAC; plaintext is never used to authenticate
 *    (legacy rows without a hash fall back to a constant-time plaintext compare);
 *  - success is a conditional update, so exactly one caller wins and proceeds with side effects.
 */

const crypto = require('crypto');
const IndWorkerAssignment = require('../models/IndWorkerAssignment');
const { OTP_MAX_ATTEMPTS, otpMatches, issueOtp, OTP_MAX_REGENERATIONS } = require('../utils/otpUtil');

const SELECT_SECRETS = '+visitOtpHash +completionOtpHash +dailyLogs.visitOtpHash +dailyLogs.completionOtpHash +visitOtpCode +completionOtpCode +dailyLogs.visitOtpCode +dailyLogs.completionOtpCode';

const plainEq = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const matches = (input, hash, legacyPlain) => {
  if (hash) return otpMatches(input, hash);
  return !!legacyPlain && plainEq(input, legacyPlain);
};

const FIELDS = {
  visit:      { hash: 'visitOtpHash',      code: 'visitOtpCode',      attempts: 'visitOtpAttempts',      expires: 'visitOtpExpiresAt' },
  completion: { hash: 'completionOtpHash', code: 'completionOtpCode', attempts: 'completionOtpAttempts', expires: 'completionOtpExpiresAt' }
};

/**
 * @param {object} p
 * @param {'visit'|'completion'} p.kind
 * @param {number|null} p.dayNumber  DAILY day (null for HOURLY)
 * @param {object} p.verifiedSet     extra $set applied atomically with the verification (top-level or `dailyLogs.$.x` for daily)
 * @returns {{status: 'verified'|'already'|'invalid'|'locked'|'expired'|'not_found'|'bad_format', attemptsLeft?: number, assignment?: object}}
 */
const verifyOtp = async ({ assignmentId, workerId, kind, dayNumber = null, otp, verifiedSet = {} }) => {
  const input = String(otp ?? '').trim();
  if (!/^\d{4}$/.test(input)) return { status: 'bad_format' };

  const F = FIELDS[kind];
  const now = new Date();
  const daily = dayNumber !== null && dayNumber !== undefined;

  // ── 1. reserve an attempt (atomic, conditional) ─────────────────────────────
  let reserveFilter; let reserveInc;
  if (!daily) {
    reserveFilter = kind === 'visit'
      ? { visitOtpStatus: 'PENDING', [F.attempts]: { $lt: OTP_MAX_ATTEMPTS }, [F.expires]: { $gt: now } }
      : { completionStatus: 'PENDING', [F.attempts]: { $lt: OTP_MAX_ATTEMPTS }, [F.expires]: { $gt: now } };
    reserveInc = { [F.attempts]: 1 };
  } else {
    const elem = kind === 'visit'
      ? { dayNumber, visitOtpStatus: 'PENDING', [F.attempts]: { $lt: OTP_MAX_ATTEMPTS }, [F.expires]: { $gt: now } }
      : { dayNumber, workStatus: { $ne: 'COMPLETED' }, [F.attempts]: { $lt: OTP_MAX_ATTEMPTS }, [F.expires]: { $gt: now } };
    reserveFilter = { dailyLogs: { $elemMatch: elem } };
    reserveInc = { [`dailyLogs.$.${F.attempts}`]: 1 };
  }

  const reserved = await IndWorkerAssignment.findOneAndUpdate(
    { _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED', ...reserveFilter },
    { $inc: reserveInc },
    { new: true }
  ).select(SELECT_SECRETS);

  if (!reserved) return diagnose({ assignmentId, workerId, kind, dayNumber, daily, now });

  const holder = daily ? reserved.dailyLogs.find(l => l.dayNumber === dayNumber) : reserved;
  const attemptsNow = holder[F.attempts] || 0;

  // DAILY completion may legitimately be issued at assignment level (hourly endpoint) — accept either hash
  const hash = holder[F.hash] || (daily && kind === 'completion' ? reserved[F.hash] : null);
  const plain = holder[F.code] || (daily && kind === 'completion' ? reserved[F.code] : null);

  if (!matches(input, hash, plain)) {
    const left = Math.max(0, OTP_MAX_ATTEMPTS - attemptsNow);
    if (left === 0) await lock({ assignmentId, kind, dayNumber, daily });
    return { status: left === 0 ? 'locked' : 'invalid', attemptsLeft: left };
  }

  // ── 2. success: exactly one winner ──────────────────────────────────────────
  let winFilter; let winSet;
  if (!daily) {
    winFilter = kind === 'visit' ? { visitOtpStatus: 'PENDING' } : { completionStatus: 'PENDING' };
    winSet = kind === 'visit' ? { visitOtpStatus: 'VERIFIED', visitOtpVerifiedAt: now } : { completionStatus: 'OTP_VERIFIED', completionOtpVerifiedAt: now };
  } else {
    const elem = kind === 'visit' ? { dayNumber, visitOtpStatus: 'PENDING' } : { dayNumber, workStatus: { $ne: 'COMPLETED' } };
    winFilter = { dailyLogs: { $elemMatch: elem } };
    winSet = kind === 'visit'
      ? { 'dailyLogs.$.visitOtpStatus': 'VERIFIED', 'dailyLogs.$.visitOtpVerifiedAt': now }
      : { 'dailyLogs.$.workStatus': 'COMPLETED', 'dailyLogs.$.completionOtpVerifiedAt': now, 'dailyLogs.$.completedAt': now };
  }
  const won = await IndWorkerAssignment.findOneAndUpdate(
    { _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED', ...winFilter },
    { $set: { ...winSet, ...verifiedSet } },
    { new: true }
  );
  if (!won) return { status: 'already' };
  return { status: 'verified', assignment: won };
};

const lock = async ({ assignmentId, kind, dayNumber, daily }) => {
  if (!daily) {
    if (kind === 'visit') await IndWorkerAssignment.updateOne({ _id: assignmentId, visitOtpStatus: 'PENDING' }, { $set: { visitOtpStatus: 'LOCKED' } });
    return;
  }
  if (kind === 'visit') {
    await IndWorkerAssignment.updateOne({ _id: assignmentId, dailyLogs: { $elemMatch: { dayNumber, visitOtpStatus: 'PENDING' } } }, { $set: { 'dailyLogs.$.visitOtpStatus': 'EXPIRED' } });
  }
};

const diagnose = async ({ assignmentId, workerId, kind, dayNumber, daily, now }) => {
  const a = await IndWorkerAssignment.findOne({ _id: assignmentId, workerId });
  if (!a || a.assignmentStatus !== 'CONFIRMED') return { status: 'not_found' };
  const F = FIELDS[kind];
  const holder = daily ? a.dailyLogs.find(l => l.dayNumber === dayNumber) : a;
  if (!holder) return { status: 'not_found' };

  const done = kind === 'visit'
    ? holder.visitOtpStatus === 'VERIFIED'
    : (daily ? holder.workStatus === 'COMPLETED' : a.completionStatus === 'OTP_VERIFIED');
  if (done) return { status: 'already' };
  if ((holder[F.attempts] || 0) >= OTP_MAX_ATTEMPTS) { await lock({ assignmentId, kind, dayNumber, daily }); return { status: 'locked', attemptsLeft: 0 }; }
  if (!holder[F.expires] || holder[F.expires] <= now) return { status: 'expired' };
  if (kind === 'visit' && ['LOCKED', 'EXPIRED'].includes(holder.visitOtpStatus)) return { status: 'locked', attemptsLeft: 0 };
  return { status: 'not_found' };
};

/** Issue a fresh OTP on `doc` (assignment or daily-log subdocument): resets attempts and status. */
const stampOtp = (holder, kind, ttlMs) => {
  const { code, hash, expiresAt } = issueOtp(ttlMs);
  const F = FIELDS[kind];
  holder[F.code] = code; holder[F.hash] = hash; holder[F.expires] = expiresAt; holder[F.attempts] = 0;
  if (kind === 'visit') holder.visitOtpStatus = 'PENDING';
  return { code, expiresAt };
};

module.exports = { verifyOtp, stampOtp, SELECT_SECRETS, OTP_MAX_ATTEMPTS, OTP_MAX_REGENERATIONS };
