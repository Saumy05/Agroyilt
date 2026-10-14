const bcrypt = require('bcryptjs');

/**
 * Shared utility for MPIN-related operations (hashing, comparison, lockout)
 */

const MPIN_MAX_ATTEMPTS = 5;
const MPIN_LOCKOUT_MINUTES = 15;

/**
 * Validates if the MPIN is exactly 4 digits
 * @param {string} mpin 
 * @returns {boolean}
 */
const validateMpinFormat = (mpin) => {
  return typeof mpin === 'string' && /^\d{4}$/.test(mpin);
};

/**
 * Hashes the MPIN using bcrypt
 * @param {string} mpin 
 * @returns {Promise<string>}
 */
const hashMpin = async (mpin) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(mpin, salt);
};

/**
 * Compares plain MPIN with hashed MPIN
 * @param {string} plainMpin 
 * @param {string} hashedMpin 
 * @returns {Promise<boolean>}
 */
const compareMpin = async (plainMpin, hashedMpin) => {
  if (!hashedMpin) return false;
  return bcrypt.compare(plainMpin, hashedMpin);
};

/**
 * Writes only the given MPIN fields. entity.save() would re-validate the whole record, so any
 * account with an incomplete profile (e.g. a vendor with no Aadhar on file) could never set,
 * reset or even use an MPIN. Keeps the in-memory entity in sync with what was stored.
 * @param {Object} entity - User, Vendor, or Worker document
 * @param {Object} fields - MPIN fields to $set
 */
const persistMpinFields = async (entity, fields) => {
  Object.assign(entity, fields);
  await entity.constructor.updateOne({ _id: entity._id }, { $set: fields });
};

/**
 * Stores a new MPIN for the account and clears any failed-attempt lockout.
 * @param {Object} entity - User, Vendor, or Worker document
 * @param {string} plainMpin - Already format-validated 4-digit MPIN
 */
const setMpin = async (entity, plainMpin) => {
  await persistMpinFields(entity, {
    mpin: await hashMpin(plainMpin),
    isMpinSet: true,
    mpinAttempts: 0,
    mpinLockedUntil: null
  });
};

/**
 * Handles failed MPIN attempt logic (increments attempts, applies lockout if needed)
 * @param {Object} entity - User, Vendor, or Worker instance
 * @returns {Object} - Result object { locked: boolean, remainingAttempts: number, lockUntil: Date|null }
 */
const incrementMpinAttempts = async (entity) => {
  // If previous lockout window has expired, start counting from zero again
  const lockExpired = entity.mpinLockedUntil && entity.mpinLockedUntil <= new Date();
  const attempts = (lockExpired ? 0 : (entity.mpinAttempts || 0)) + 1;
  let locked = false;
  let lockUntil = lockExpired ? null : (entity.mpinLockedUntil || null);

  if (attempts >= MPIN_MAX_ATTEMPTS) {
    locked = true;
    lockUntil = new Date(Date.now() + MPIN_LOCKOUT_MINUTES * 60 * 1000);
  }

  await persistMpinFields(entity, { mpinAttempts: attempts, mpinLockedUntil: lockUntil });

  return {
    locked,
    remainingAttempts: Math.max(0, MPIN_MAX_ATTEMPTS - attempts),
    lockUntil
  };
};

/**
 * Resets MPIN attempts to 0 (called on successful login or password reset)
 * @param {Object} entity - User, Vendor, or Worker instance
 */
const resetMpinAttempts = async (entity) => {
  if (entity.mpinAttempts > 0 || entity.mpinLockedUntil !== null) {
    await persistMpinFields(entity, { mpinAttempts: 0, mpinLockedUntil: null });
  }
};

/**
 * Checks if the entity is currently locked out from MPIN login
 * @param {Object} entity - User, Vendor, or Worker instance
 * @returns {boolean} - true if locked out
 */
const isMpinLocked = (entity) => {
  if (entity.mpinLockedUntil) {
    if (entity.mpinLockedUntil > new Date()) {
      return true;
    }
    // Lockout has expired -> clear fields
    persistMpinFields(entity, { mpinLockedUntil: null, mpinAttempts: 0 }).catch(() => {});
  }
  return false;
};

module.exports = {
  MPIN_MAX_ATTEMPTS,
  MPIN_LOCKOUT_MINUTES,
  validateMpinFormat,
  hashMpin,
  setMpin,
  compareMpin,
  incrementMpinAttempts,
  resetMpinAttempts,
  isMpinLocked
};
