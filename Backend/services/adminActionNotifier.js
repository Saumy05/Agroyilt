/**
 * Sends an in-app + push notification for an admin or system action (block, settlement, cancellation...).
 * Never throws: a notification problem must not fail or roll back the action itself.
 */
const notifySafe = async (payload) => {
  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    return await createNotification(payload);
  } catch (e) {
    console.warn(`[notify] ${payload?.type || 'notification'} failed:`, e.message);
    return null;
  }
};

module.exports = { notifySafe };
