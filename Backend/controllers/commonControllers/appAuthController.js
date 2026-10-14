const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');
const mpinService = require('../../utils/mpinService');

/**
 * POST /api/app/identify-role
 * Given a phone number, checks which role(s) have an account registered.
 * Used by the unified mobile login screen to auto-detect the user's role
 * before sending OTP.
 *
 * Request body: { phone: "9876543210" }
 * Response:     { success: true, roles: ["user"] }  or  { roles: ["vendor", "worker"] } etc.
 */
const identifyRole = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'A valid 10-digit phone number is required.',
      });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // Run all 3 lookups in parallel for speed
    const [user, vendor, worker] = await Promise.all([
      User.findOne({ phone: cleanPhone }).select('_id phone isActive').lean(),
      Vendor.findOne({ phone: cleanPhone }).select('_id phone isActive approvalStatus').lean(),
      Worker.findOne({ phone: cleanPhone }).select('_id phone isActive').lean(),
    ]);

    const roles = [];
    if (user && user.isActive !== false) roles.push('user');
    if (vendor) roles.push('vendor');
    if (worker && worker.isActive !== false) roles.push('worker');

    if (roles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No account found for this phone number. Please register first.',
        roles: [],
      });
    }

    return res.status(200).json({
      success: true,
      roles,
      // If exactly one role, include a hint for the client
      primaryRole: roles.length === 1 ? roles[0] : null,
    });
  } catch (error) {
    console.error('[identifyRole] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not identify account. Please try again.',
    });
  }
};

const ROLE_MODELS = [
  ['user', User, (doc) => doc.isActive !== false],
  ['vendor', Vendor, () => true],
  ['worker', Worker, (doc) => doc.isActive !== false],
];

/**
 * POST /api/app/verify-mpin
 * Checks a phone + MPIN against every account on that phone WITHOUT logging anyone in, so the
 * login screen can open the right account directly, or ask which one only when the MPIN
 * really fits more than one. The role-specific login endpoint still runs afterwards and
 * applies its own approval / fee / lock rules.
 *
 * Request body: { phone, mpin }
 * 200 { roles }                       MPIN fits these accounts
 * 400 { mpinNotSet, roles }           none of the accounts has an MPIN yet (roles = accounts to set one for)
 * 401 { message, remainingAttempts }  MPIN fits no account
 * 404                                 no account on this phone
 * 429                                 every account with an MPIN is locked
 */
const verifyMpin = async (req, res) => {
  try {
    const cleanPhone = String(req.body.phone || '').replace(/\D/g, '');
    const mpin = req.body.mpin;
    if (cleanPhone.length !== 10 || !mpinService.validateMpinFormat(mpin)) {
      return res.status(400).json({ success: false, message: 'A 10-digit phone number and a 4-digit MPIN are required.' });
    }

    const found = [];
    for (const [role, Model, isEligible] of ROLE_MODELS) {
      const doc = await Model.findOne({ phone: cleanPhone }).select('+mpin');
      if (doc && isEligible(doc)) found.push({ role, doc });
    }

    if (found.length === 0) {
      return res.status(404).json({ success: false, message: 'No account found for this phone number. Please register first.', roles: [] });
    }

    const withMpin = found.filter(({ doc }) => doc.isMpinSet && doc.mpin);
    if (withMpin.length === 0) {
      return res.status(400).json({
        success: false,
        mpinNotSet: true,
        message: 'MPIN is not set for this account. Please set up your MPIN.',
        roles: found.map(({ role }) => role)
      });
    }

    const open = withMpin.filter(({ doc }) => !mpinService.isMpinLocked(doc));
    if (open.length === 0) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again after ${mpinService.MPIN_LOCKOUT_MINUTES} minutes.`
      });
    }

    const matched = [];
    for (const entry of open) {
      if (await mpinService.compareMpin(mpin, entry.doc.mpin)) matched.push(entry.role);
    }
    if (matched.length > 0) {
      return res.status(200).json({ success: true, roles: matched });
    }

    // Wrong for every account. Only now count a failed attempt: a correct MPIN for one account
    // must never push a different account of the same person towards a lockout.
    let remainingAttempts = mpinService.MPIN_MAX_ATTEMPTS;
    let anyOpen = false;
    for (const { doc } of open) {
      const result = await mpinService.incrementMpinAttempts(doc);
      remainingAttempts = Math.min(remainingAttempts, result.remainingAttempts);
      if (!result.locked) anyOpen = true;
    }
    if (!anyOpen) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Account locked for ${mpinService.MPIN_LOCKOUT_MINUTES} minutes.`
      });
    }
    return res.status(401).json({
      success: false,
      message: `Invalid MPIN. ${remainingAttempts} attempts remaining.`,
      remainingAttempts
    });
  } catch (error) {
    console.error('[verifyMpin] Error:', error);
    return res.status(500).json({ success: false, message: 'Could not verify MPIN. Please try again.' });
  }
};

module.exports = { identifyRole, verifyMpin };
