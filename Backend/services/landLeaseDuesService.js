'use strict';

/**
 * Unpaid rent on a land lease: reminders, and the owner's way to end the lease.
 *
 *  - Reminders: the tenant is told when an installment falls due, and again (with the owner) 3 days later if still unpaid.
 *  - Ending for non-payment, in two cases:
 *      1. the tenant promised to pay installment 1 at the start (advance) and it is still unpaid 3 days after the start:
 *         the owner may end the lease at once;
 *      2. two or more installments are overdue (one, when the rent is paid quarterly or half-yearly, because the installments
 *         are far apart): the owner gives a 15-day notice. If the overdue rent is still unpaid when
 *         the notice runs out, the lease ends; if the tenant pays it in time, the notice lapses.
 *    An ended lease becomes `inactive` (the tenant and every payment record stay; unpaid rent can still be paid to the owner).
 */

const LandLease = require('../models/LandLease');
const LeaseAgreement = require('../models/LeaseAgreement');
const { notifyLease } = require('./landLeaseNotifyService');
const { audit } = require('./leaseAgreementService');

const NOTICE_DAYS = 15;
const LATE_AFTER_DAYS = 3;
const OVERDUE_FOR_NOTICE = 2;
const SPARSE_SCHEDULES = ['quarterly', 'half-yearly'];
/** How many overdue installments let the owner give notice: one when installments are months apart, otherwise two. */
const overdueForNotice = (lease) => (SPARSE_SCHEDULES.includes(lease.agreement?.paymentSchedule) ? 1 : OVERDUE_FOR_NOTICE);
const DAY = 24 * 60 * 60 * 1000;

const payLink = (leaseId) => ({ link: `/user/land-lease/${leaseId}/payments` });
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Installments whose due date has passed and that nobody is paying right now. */
const overdueInstallments = (lease, now = new Date()) =>
  (lease.installments || []).filter(i => i.status === 'pending' && new Date(i.dueDate) <= now);

/**
 * Whether the owner can end this lease for unpaid rent now.
 * @returns {{ eligible: boolean, immediate?: boolean, reason?: string, overdue: number, overdueAmount: number, noticeOpen?: boolean }}
 */
const endEligibility = (lease, now = new Date()) => {
  const overdue = overdueInstallments(lease, now);
  const base = { eligible: false, overdue: overdue.length, overdueAmount: Math.round(overdue.reduce((t, i) => t + i.amount, 0) * 100) / 100 };
  if (lease.status !== 'leased' || lease.leaseType !== 'fixed-rent') return base;
  if (lease.terminationNotice?.status === 'open') return { ...base, noticeOpen: true };

  const first = (lease.installments || [])[0];
  const by = lease.agreement?.firstPaymentDueBy;
  if (lease.agreement?.advanceFirstInstallment && first && first.status === 'pending' && by && now > new Date(by)) {
    return { ...base, eligible: true, immediate: true, reason: 'first_installment' };
  }
  if (overdue.length >= overdueForNotice(lease)) return { ...base, eligible: true, immediate: false, reason: 'overdue_installments' };
  return base;
};

/** Ends the lease for unpaid rent. Safe to call twice. */
const endLease = async (leaseId, { immediate = false } = {}) => {
  const now = new Date();
  const lease = await LandLease.findOneAndUpdate(
    { _id: leaseId, status: 'leased' },
    {
      $set: {
        status: 'inactive', endedReason: 'non_payment',
        'terminationNotice.status': 'executed', 'terminationNotice.reason': 'non_payment', 'terminationNotice.immediate': immediate,
        ...(immediate ? { 'terminationNotice.givenAt': now, 'terminationNotice.endsAt': now } : {})
      }
    },
    { new: true }
  );
  if (!lease) return null;

  if (lease.agreementId) {
    await LeaseAgreement.updateOne({ _id: lease.agreementId }, { $push: { auditTrail: audit('lease_ended_non_payment', { role: 'system', details: 'Lease ended for unpaid rent' }) } }).catch(() => {});
  }
  const heading = 'पट्टा समाप्त (Lease ended)';
  notifyLease(lease.currentTenantId, 'land_lease_terminated', heading, `"${lease.title}" का पट्टा किराया न देने के कारण समाप्त कर दिया गया। बकाया किराया अब भी देय है।`, lease._id, payLink(lease._id));
  notifyLease(lease.ownerId, 'land_lease_terminated', heading, `"${lease.title}" का पट्टा किराया न मिलने के कारण समाप्त हो गया। आप भूमि दोबारा सूचीबद्ध कर सकते हैं।`, lease._id);
  return lease;
};

/**
 * The owner ends (or starts the notice to end) the lease for unpaid rent.
 * @returns {Promise<{ ok: true, ended: boolean, endsAt?: Date, lease } | { ok: false, status: number, message: string }>}
 */
const giveNotice = async ({ leaseId, ownerId }) => {
  const lease = await LandLease.findOne({ _id: leaseId, ownerId });
  if (!lease) return { ok: false, status: 404, message: 'Land lease not found or you are not the owner.' };
  const e = endEligibility(lease);
  if (e.noticeOpen) return { ok: false, status: 409, message: 'A notice is already running for this lease.' };
  if (!e.eligible) {
    return { ok: false, status: 400, message: 'The lease can be ended for unpaid rent only when the first installment due at the start is more than 3 days late, or the rent is overdue (two installments, or one when it is paid quarterly or half-yearly).' };
  }
  if (e.immediate) {
    const ended = await endLease(lease._id, { immediate: true });
    return ended ? { ok: true, ended: true, lease: ended } : { ok: false, status: 409, message: 'The lease was just changed. Refresh and check.' };
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + NOTICE_DAYS * DAY);
  const noticed = await LandLease.findOneAndUpdate(
    { _id: lease._id, status: 'leased', 'terminationNotice.status': { $ne: 'open' } },
    { $set: { terminationNotice: { status: 'open', reason: 'non_payment', immediate: false, givenAt: now, endsAt } } },
    { new: true }
  );
  if (!noticed) return { ok: false, status: 409, message: 'The lease was just changed. Refresh and check.' };
  notifyLease(lease.currentTenantId, 'land_lease_notice', '⚠️ पट्टा समाप्ति का नोटिस (Notice to end the lease)',
    `"${lease.title}": बकाया किराया ₹${e.overdueAmount} ${fmt(endsAt)} तक न देने पर पट्टा समाप्त हो जाएगा।`, lease._id, payLink(lease._id));
  return { ok: true, ended: false, endsAt, lease: noticed };
};

/** Reminders, and finishing notices that ran out (or that the tenant answered by paying). */
const runPeriodic = async () => {
  const now = new Date();
  let due = 0; let late = 0; let ended = 0; let cleared = 0;
  try {
    const leases = await LandLease.find({
      status: 'leased',
      installments: { $elemMatch: { status: 'pending', dueDate: { $lte: now } } }
    }).select('title ownerId currentTenantId installments').lean();

    for (const lease of leases) {
      for (const i of overdueInstallments(lease, now)) {
        if (!i.dueReminderSentAt) {
          const claimed = await LandLease.updateOne(
            { _id: lease._id, installments: { $elemMatch: { _id: i._id, dueReminderSentAt: null } } },
            { $set: { 'installments.$.dueReminderSentAt': now } }
          );
          if (claimed.modifiedCount === 1) {
            notifyLease(lease.currentTenantId, 'land_lease_payment_due', '💰 किराया देय (Rent due)',
              `"${lease.title}" की किस्त ${i.number} (₹${i.amount}) देय है। कृपया भुगतान करें।`, lease._id, payLink(lease._id));
            due++;
          }
        }
        if (!i.lateReminderSentAt && now.getTime() - new Date(i.dueDate).getTime() >= LATE_AFTER_DAYS * DAY) {
          const claimed = await LandLease.updateOne(
            { _id: lease._id, installments: { $elemMatch: { _id: i._id, lateReminderSentAt: null } } },
            { $set: { 'installments.$.lateReminderSentAt': now } }
          );
          if (claimed.modifiedCount === 1) {
            notifyLease(lease.currentTenantId, 'land_lease_payment_overdue', '⚠️ किराया बकाया (Rent overdue)',
              `"${lease.title}" की किस्त ${i.number} (₹${i.amount}) ${LATE_AFTER_DAYS} दिन से अधिक देर से है।`, lease._id, payLink(lease._id));
            notifyLease(lease.ownerId, 'land_lease_payment_overdue', 'किराया बकाया (Rent overdue)',
              `"${lease.title}" की किस्त ${i.number} (₹${i.amount}) अभी तक नहीं मिली।`, lease._id, payLink(lease._id));
            late++;
          }
        }
      }
    }

    const noticed = await LandLease.find({ status: 'leased', 'terminationNotice.status': 'open' }).select('title ownerId currentTenantId installments terminationNotice').lean();
    for (const lease of noticed) {
      if (overdueInstallments(lease, now).length === 0) {
        const res = await LandLease.updateOne({ _id: lease._id, 'terminationNotice.status': 'open' }, { $set: { 'terminationNotice.status': 'cleared' } });
        if (res.modifiedCount === 1) {
          cleared++;
          notifyLease(lease.ownerId, 'land_lease_notice', 'बकाया चुका दिया (Overdue rent paid)', `"${lease.title}" का बकाया किराया चुका दिया गया, नोटिस समाप्त।`, lease._id);
        }
      } else if (new Date(lease.terminationNotice.endsAt) <= now) {
        if (await endLease(lease._id)) ended++;
      }
    }
  } catch (err) {
    console.error('[landLeaseDues] periodic job error:', err);
  }
  return { due, late, ended, cleared };
};

module.exports = { endEligibility, giveNotice, endLease, runPeriodic, overdueInstallments, NOTICE_DAYS };
