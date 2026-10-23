'use strict';

/**
 * Ends land leases whose term is over and whose money is fully settled.
 *
 * A lease is ended only when agreement.endDate has passed, every rent installment is paid and no crop-share
 * settlement is still open - unpaid dues keep the lease `leased` so the tenant can still pay them. Ending keeps the
 * tenant and every payment record (admin and both parties still read them) and sets the land to `inactive`, so it
 * no longer shows in the marketplace; the owner can list it again as a new listing.
 */

const LandLease = require('../models/LandLease');
const { notifyLease } = require('./landLeaseNotifyService');
const { runPeriodic: runAgreementJobs } = require('./leaseAgreementService');

const OPEN_SETTLEMENT = ['submitted', 'confirmed', 'processing'];

const endFinishedLeases = async () => {
  try {
    const finished = await LandLease.find({
      status: 'leased',
      'agreement.endDate': { $lt: new Date() },
      installments: { $not: { $elemMatch: { status: { $ne: 'paid' } } } },
      settlements: { $not: { $elemMatch: { status: { $in: OPEN_SETTLEMENT } } } }
    }).select('_id').lean();

    for (const { _id } of finished) {
      // atomic per lease: a payment or settlement landing in between makes the filter fail and the lease stays leased
      const lease = await LandLease.findOneAndUpdate(
        {
          _id,
          status: 'leased',
          installments: { $not: { $elemMatch: { status: { $ne: 'paid' } } } },
          settlements: { $not: { $elemMatch: { status: { $in: OPEN_SETTLEMENT } } } }
        },
        { $set: { status: 'inactive' } },
        { new: true }
      );
      if (!lease) continue;

      const msg = `"${lease.title}" का पट्टा पूरा हो गया (The lease has ended).`;
      notifyLease(lease.ownerId, 'land_lease_ended', 'पट्टा समाप्त (Lease ended)', msg, lease._id);
      notifyLease(lease.currentTenantId, 'land_lease_ended', 'पट्टा समाप्त (Lease ended)', msg, lease._id);
    }
    return finished.length;
  } catch (error) {
    console.error('[landLeaseScheduler] error:', error);
    return 0;
  }
};

const startLandLeaseScheduler = () => {
  setInterval(endFinishedLeases, 60 * 60 * 1000);
  setTimeout(endFinishedLeases, 20000);
  // agreements nobody signed lapse, reminders go out, and a lease start that failed is retried
  setInterval(runAgreementJobs, 30 * 60 * 1000);
  setTimeout(runAgreementJobs, 40000);
  console.log('✅ Land lease expiry scheduler initialized');
};

module.exports = { startLandLeaseScheduler, endFinishedLeases };
