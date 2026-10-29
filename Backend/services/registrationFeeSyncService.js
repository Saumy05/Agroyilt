const RegistrationFeeConfig = require('../models/RegistrationFeeConfig');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Worker = require('../models/Worker');

const MODELS = { USER: User, VENDOR: Vendor, WORKER: Worker };

/**
 * Activate every account still UNPAID for a role whose registration fee is now free (no active
 * config counts as free, same as an amount of 0). They would otherwise only flip to PAID/₹0 the
 * next time they log in (initiatePayment), leaving the DB and the admin lists out of step.
 * Offline workers held inactive for the fee are re-activated, like offlineMemberFeeService does.
 * With `dryRun` it only counts. Returns { skipped } when the fee is not free, else { matched, modified }.
 */
const activateFreeRegistrations = async (role, { dryRun = false } = {}) => {
  const Model = MODELS[role];
  if (!Model) throw new Error(`Unknown role: ${role}`);

  const cfg = await RegistrationFeeConfig.findOne({ role, isActive: true }).sort({ createdAt: -1 });
  if (Number(cfg?.amount) > 0) return { role, skipped: true };

  const filter = { registrationFeeStatus: { $ne: 'PAID' } };
  if (dryRun) return { role, matched: await Model.countDocuments(filter), modified: 0 };

  const version = cfg?.version || 1;
  // offline members are held inactive until their fee is settled; grab them before the status flips
  const heldIds = role === 'WORKER'
    ? await Worker.distinct('_id', { ...filter, isOfflineMember: true, isActive: false })
    : [];

  const set = { registrationFeeStatus: 'PAID', registrationFeeAmount: 0, registrationFeeVersion: version };
  const result = await Model.updateMany(filter, { $set: set });
  if (heldIds.length) await Worker.updateMany({ _id: { $in: heldIds } }, { $set: { isActive: true } });

  return { role, matched: result.matchedCount, modified: result.modifiedCount };
};

/**
 * Checks whether an account satisfies the registration fee requirement.
 * If already 'PAID', returns { isPaid: true }.
 * If the registration fee is 0 (or no active fee config), auto-approves the account to 'PAID' (₹0) and returns { isPaid: true, autoApprovedFree: true }.
 * Otherwise, returns { isPaid: false, amount, version }.
 */
const ensureRegistrationFeeStatus = async (account, role) => {
  if (account.registrationFeeStatus === 'PAID') {
    return { isPaid: true };
  }

  const cfg = await RegistrationFeeConfig.findOne({ role, isActive: true }).sort({ createdAt: -1 });
  const amount = Number(cfg?.amount) || 0;

  if (!cfg || amount <= 0) {
    account.registrationFeeStatus = 'PAID';
    account.registrationFeeAmount = 0;
    account.registrationFeeVersion = cfg?.version || 1;
    await account.save();
    return { isPaid: true, autoApprovedFree: true };
  }

  return { isPaid: false, amount, version: cfg.version };
};

module.exports = { activateFreeRegistrations, ensureRegistrationFeeStatus };
