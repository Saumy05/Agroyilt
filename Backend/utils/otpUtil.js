'use strict';

/**
 * Shared OTP primitives for the worker/farmer assignment flow.
 *  - CSPRNG generation (never Math.random)
 *  - keyed HMAC hashing (a bare SHA-256 of a 4-digit code is reversible in microseconds)
 *  - constant-time comparison; legacy unsalted SHA-256 hashes are still accepted so OTPs issued
 *    before this change keep working until they expire.
 */

const crypto = require('crypto');

const OTP_MAX_ATTEMPTS = 5;
const OTP_TTL_MS = 60 * 60 * 1000;
const OTP_MAX_REGENERATIONS = 5;

const secret = () => process.env.OTP_HMAC_SECRET || process.env.JWT_SECRET || 'agroyilt-dev-otp-secret';

const generateOtp = () => String(crypto.randomInt(1000, 10000));

const hashOtp = (otp) =>
  'h2:' + crypto.createHmac('sha256', secret()).update(String(otp).trim()).digest('hex');

const legacyHash = (otp) => crypto.createHash('sha256').update(String(otp).trim()).digest('hex');

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** True when `input` matches the stored hash (HMAC or legacy). Never compares plaintext. */
const otpMatches = (input, storedHash) => {
  if (!storedHash || input === undefined || input === null) return false;
  const candidate = String(storedHash).startsWith('h2:') ? hashOtp(input) : legacyHash(input);
  return safeEqual(candidate, storedHash);
};

/** { code, hash, expiresAt } for a freshly issued OTP. */
const issueOtp = (ttlMs = OTP_TTL_MS) => {
  const code = generateOtp();
  return { code, hash: hashOtp(code), expiresAt: new Date(Date.now() + ttlMs) };
};

module.exports = { OTP_MAX_ATTEMPTS, OTP_TTL_MS, OTP_MAX_REGENERATIONS, generateOtp, hashOtp, otpMatches, issueOtp };
