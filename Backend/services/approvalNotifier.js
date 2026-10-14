const { sendAccountApprovedSMS } = require('./smsService');
const { sendAccountApprovedEmail } = require('./emailService');

/**
 * Tells a newly approved farmer / vendor / worker by SMS and email (the in-app + push notice is
 * created separately). Never throws, so a failing SMS or mail provider cannot fail the approval.
 * @param {Object} account
 * @param {'Farmer'|'Vendor'|'Worker'} account.roleLabel
 * @param {string} account.name
 * @param {string} account.phone
 * @param {string} [account.email]
 */
const notifyAccountApproved = async ({ roleLabel, name, phone, email }) => {
  const jobs = [
    phone ? sendAccountApprovedSMS(phone, name, roleLabel) : null,
    email ? sendAccountApprovedEmail(email, name, roleLabel) : null
  ].filter(Boolean);

  const results = await Promise.allSettled(jobs);
  results.forEach((r) => {
    if (r.status === 'rejected') console.error(`[ApprovalNotifier] ${roleLabel} approval notice failed:`, r.reason?.message || r.reason);
  });
  return results;
};

module.exports = { notifyAccountApproved };
