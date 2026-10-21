const ONLINE_METHODS = ['online', 'razorpay', 'qr_online', 'wallet', 'upi'];
const PAID_STATUSES = ['success', 'paid', 'collected_by_vendor', 'collected_by_worker', 'plan_covered'];

/**
 * Payment state of a booking for list cards, from what the booking really holds:
 * 'paid' (online or cash), 'refunded', 'cancelled' or 'pending'.
 * A completed booking with nothing left to pay is never shown as pending.
 */
export const getPaymentState = (b) => {
  if (!b) return { state: 'pending', label: 'Payment Pending', isPaid: false };
  const status = String(b.paymentStatus || '').toLowerCase();
  const method = String(b.paymentMethod || b.farmerAmount?.paymentMethod || '').toLowerCase();
  const isOnline = ONLINE_METHODS.includes(method);
  const bookingStatus = String(b.status || '').toLowerCase();

  if (['cancelled', 'rejected'].includes(bookingStatus)) return { state: 'cancelled', label: 'Cancelled', isPaid: false };
  if (status === 'refunded') return { state: 'refunded', label: 'Refunded', isPaid: false };

  const paidFromData =
    PAID_STATUSES.includes(status) ||
    Boolean(b.cashCollected) ||
    method === 'plan_benefit' ||
    b.farmerAmount?.status === 'paid' ||
    // completed, money was taken, nothing left to pay
    (bookingStatus === 'completed' && Number(b.advancePaidAmount || 0) > 0 && Number(b.balanceDue || 0) <= 0);

  if (paidFromData) {
    const collectedInCash = status === 'collected_by_vendor' || Boolean(b.cashCollected) || (method === 'cash' && !isOnline);
    return collectedInCash
      ? { state: 'paid', label: 'Paid in Cash', vendorLabel: 'Cash Collected', isPaid: true, isCash: true }
      : { state: 'paid', label: isOnline || status === 'success' ? 'Paid Online' : 'Paid', vendorLabel: 'Payment Received', isPaid: true, isCash: false };
  }
  return { state: 'pending', label: method === 'cash' ? 'Pay in Cash' : 'Payment Pending', vendorLabel: 'Payment Pending', isPaid: false, isCash: method === 'cash' };
};

export const formatTimeOfDay = (d) => (d && !Number.isNaN(new Date(d).getTime())
  ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/am|pm/i, (m) => m.toUpperCase())
  : '');
const timeOf = formatTimeOfDay;
const dayOf = (d) => {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Actual start and end of a booking, recorded automatically when the work started and ended.
 * Returns e.g. "10:15 AM – 11:40 AM" ("22/10 10:15 AM – 23/10 09:00 AM" across days), or '' while nothing is recorded.
 */
export const getActualTimeRange = (b) => {
  if (!b) return '';
  const start = b.startedAt || b.serviceTimer?.startedAt || null;
  const end = b.completedAt || b.serviceTimer?.stoppedAt || null;
  const status = String(b.status || '').toLowerCase();
  if (!start || Number.isNaN(new Date(start).getTime())) return '';
  const showEnd = end && ['completed', 'work_done', 'returned'].includes(status) && !Number.isNaN(new Date(end).getTime());
  if (!showEnd) return `Started ${timeOf(start)}`;
  const crossDay = dayOf(start) !== dayOf(end);
  return crossDay ? `${dayOf(start)} ${timeOf(start)} – ${dayOf(end)} ${timeOf(end)}` : `${timeOf(start)} – ${timeOf(end)}`;
};
