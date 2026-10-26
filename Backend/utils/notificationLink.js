'use strict';

/**
 * Where tapping a farmer's push notification should open in the app. Mirrors what the in-app notification list does
 * (Frontend modules/user/pages/Notifications), so a push tap and a list tap land on the same page.
 * Used only when the sender did not give a `link` of its own. Returns null when there is no sensible page.
 */
const userNotificationLink = ({ type, relatedType, relatedId, data = {} } = {}) => {
  const t = String(type || '').toLowerCase();
  const rt = String(relatedType || '').toLowerCase();
  const id = relatedId ? String(relatedId) : (data.bookingId ? String(data.bookingId) : '');

  if (t.startsWith('land_lease')) {
    const sub = ['land_lease_offer_rejected', 'land_lease_offer_accepted'].includes(t) ? 'offers' : 'listings';
    const pay = ['land_lease_payment', 'land_lease_settlement', 'land_lease_offer_accepted', 'land_lease_ended', 'land_lease_agreement_executed'].includes(t);
    const params = new URLSearchParams({ tab: 'my-leases', sub });
    if (pay && id) params.set('pay', id);
    return `/user/land-lease?${params.toString()}`;
  }
  if (t.includes('support') || rt.includes('support')) {
    const ticketId = data.ticketId || id;
    return `/user/help-support${ticketId ? `?ticketId=${ticketId}` : ''}`;
  }
  if (t.includes('dispute') || rt.includes('dispute')) return id ? `/user/booking/${id}` : '/user/my-bookings';
  if (t.includes('soil')) return '/user/soil-testing';
  if (t.includes('wallet') || t.includes('refund')) return '/user/wallet';

  const requestId = data.requestId || (rt === 'workerbookingrequest' ? id : '');
  if (requestId || ['worker_booking', 'worker_request', 'day_completed', 'worker_arrived', 'worker_journey', 'worker_decreased', 'extra_worker', 'extension_'].some(k => t.includes(k))) {
    const tracking = ['worker_journey_started', 'worker_arrived', 'worker_work_submitted', 'day_completed'].some(k => t.includes(k));
    if (!requestId) return '/user/my-bookings';
    return tracking ? `/user/farmer-worker-request/${requestId}/track` : `/user/farmer-worker-request/${requestId}`;
  }
  if (rt === 'booking' || ['booking', 'job', 'work', 'journey', 'trip', 'visit', 'vendor', 'cash', 'offline'].some(k => t.includes(k))) {
    return id ? `/user/booking/${id}` : '/user/my-bookings';
  }
  return id ? `/user/booking/${id}` : null;
};

module.exports = { userNotificationLink };
