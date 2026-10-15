const Booking = require('../../models/Booking');
const Dispute = require('../../models/Dispute');
const svc = require('../../services/paymentDefaultService');

const caller = (req) => ({ id: String(req.user?.id || req.user?._id || ''), role: String(req.user?.role || '').toUpperCase() });
const send = (res, error, fallback) => {
  if (!error.status) console.error(`[paymentDefault] ${fallback}:`, error);
  res.status(error.status || 500).json({ success: false, message: error.status ? error.message : fallback, ...(error.code ? { code: error.code } : {}) });
};

/** POST /api/bookings/payment-default/:id/report: the vendor says the farmer will not pay the final bill. */
exports.reportNonPayment = async (req, res) => {
  try {
    const me = caller(req);
    if (me.role !== 'VENDOR') return res.status(403).json({ success: false, message: 'Only the assigned vendor can report this.' });
    const booking = await Booking.findById(req.params.id).select('vendorId bookingNumber');
    if (!booking || String(booking.vendorId) !== me.id) return res.status(404).json({ success: false, message: 'Booking not found' });

    const { reason, notes } = req.body || {};
    const { dispute, due } = await svc.reportNonPayment({ bookingId: booking._id, vendorId: booking.vendorId, reason, notes });

    try {
      const io = require('../../sockets').getIO();
      if (io) {
        io.to('admin_global').emit('new_dispute', {
          disputeId: dispute._id, bookingDomain: dispute.bookingDomain, reason: dispute.reason, priority: dispute.priority,
          raisedByRole: dispute.raisedByRole, bookingRef: booking.bookingNumber || booking._id.toString(), createdAt: dispute.createdAt
        });
        io.to(`vendor_${booking.vendorId}`).emit('booking_updated', { bookingId: booking._id, paymentDispute: { isActive: true } });
      }
    } catch (e) { /* non-fatal */ }

    res.status(200).json({ success: true, message: 'Reported. Support will contact the farmer and decide.', data: { disputeId: dispute._id, due } });
  } catch (error) { send(res, error, 'Failed to report non-payment'); }
};

/** GET /api/bookings/payment-default/my-dues: what the farmer owes. */
exports.getMyDues = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await svc.getDues(caller(req).id) });
  } catch (error) { send(res, error, 'Failed to load dues'); }
};

/** POST /api/bookings/payment-default/pay-wallet: the farmer clears dues from the wallet. */
exports.payDuesFromWallet = async (req, res) => {
  try {
    const out = await svc.payDuesFromWallet(caller(req).id);
    const message = out.paid > 0
      ? (out.total > 0 ? `₹${out.paid} paid. ₹${out.total} still due.` : 'Dues cleared. You can book again.')
      : 'Your wallet balance is not enough to pay these dues.';
    res.status(200).json({ success: true, message, data: out });
  } catch (error) { send(res, error, 'Failed to pay dues'); }
};

/** PATCH /api/admin/disputes/:id/mark-dues-paid: admin records dues collected outside the app. */
exports.adminMarkDuesPaid = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });
    const admin = req.user || {};
    const adminName = admin.name || admin.email || 'Admin';
    const closed = await svc.markDuesPaid(dispute, { adminName });

    dispute.auditLog.push({
      performedBy: admin.id || admin._id, adminName, action: 'DUES_MARKED_PAID',
      previousStatus: dispute.status, newStatus: dispute.status,
      notes: String(req.body?.note || '').slice(0, 500) || `Dues of ₹${closed.amount} recorded as paid`,
      metadata: { amount: closed.amount }, timestamp: new Date()
    });
    await dispute.save();

    try {
      const AdminAuditLog = require('../../models/AdminAuditLog');
      await AdminAuditLog.log({
        adminId: admin.id || admin._id, adminName, adminEmail: admin.email || '', adminRole: admin.role || 'admin',
        action: 'DISPUTE_DUES_MARKED_PAID', module: 'DISPUTE_MANAGEMENT', targetId: dispute._id, targetModel: 'Dispute',
        description: `Admin recorded ₹${closed.amount} dues as paid for dispute ${dispute._id}`, metadata: { disputeId: dispute._id, amount: closed.amount }
      });
    } catch (e) { console.warn('[adminMarkDuesPaid] audit log failed', e.message); }

    res.status(200).json({ success: true, message: `Dues of ₹${closed.amount} recorded as paid.`, data: { amount: closed.amount } });
  } catch (error) { send(res, error, 'Failed to record dues payment'); }
};
