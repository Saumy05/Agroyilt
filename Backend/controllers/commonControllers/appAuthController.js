const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');

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
      User.findOne({ phone: cleanPhone }).select('_id phone isActive isMpinSet').lean(),
      Vendor.findOne({ phone: cleanPhone }).select('_id phone isActive approvalStatus isMpinSet').lean(),
      Worker.findOne({ phone: cleanPhone }).select('_id phone isActive isMpinSet').lean(),
    ]);

    const roles = [];
    const mpinNotSetRoles = []; // accounts that must set an MPIN before they can log in
    if (user && user.isActive !== false) { roles.push('user'); if (!user.isMpinSet) mpinNotSetRoles.push('user'); }
    if (vendor) { roles.push('vendor'); if (!vendor.isMpinSet) mpinNotSetRoles.push('vendor'); }
    if (worker && worker.isActive !== false) { roles.push('worker'); if (!worker.isMpinSet) mpinNotSetRoles.push('worker'); }

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
      mpinNotSetRoles,
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

module.exports = { identifyRole };
