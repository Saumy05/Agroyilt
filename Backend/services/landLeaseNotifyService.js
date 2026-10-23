'use strict';

const { createNotification } = require('../controllers/notificationControllers/notificationController');

/** Fire-and-forget: a failed notification must never fail (or roll back) a lease or payment action. */
const notifyLease = (userId, type, title, message, leaseId, data = {}) => {
  if (!userId) return;
  createNotification({
    userId,
    type,
    title,
    message,
    relatedId: leaseId,
    relatedType: 'LandLease',
    data, // e.g. { link: '/user/agreements/<id>' }: where tapping the notification goes
    pushData: data.link ? { link: data.link } : {}
  }).catch((err) => console.error('[landLeaseNotify] failed:', err && err.message));
};

module.exports = { notifyLease };
