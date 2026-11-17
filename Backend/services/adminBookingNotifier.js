const Notification = require('../models/Notification');
const Admin = require('../models/Admin');
const { getIO } = require('../sockets');

/**
 * Service to notify admins about platform booking lifecycle events.
 * Creates notifications scoped to active admins with clear 3rd-person messages,
 * and emits real-time alerts to the admin socket room.
 */

const getActiveAdmins = async () => {
  try {
    return await Admin.find({ isActive: { $ne: false } }).select('_id');
  } catch (err) {
    console.error('[AdminBookingNotifier] Error fetching active admins:', err);
    return [];
  }
};

const notifyAdmins = async ({ type, title, message, bookingId, bookingNumber, data = {} }) => {
  try {
    const admins = await getActiveAdmins();
    if (!admins.length) return;

    const notifData = {
      bookingId: bookingId ? String(bookingId) : undefined,
      bookingNumber: bookingNumber || undefined,
      ...data
    };

    const notificationsToCreate = admins.map(adm => ({
      adminId: adm._id,
      type,
      title,
      message,
      relatedId: bookingId || null,
      relatedType: 'Booking',
      data: notifData,
      isRead: false
    }));

    const created = await Notification.insertMany(notificationsToCreate);

    // Real-time broadcast to admin sockets
    try {
      const io = getIO();
      if (io) {
        created.forEach(n => {
          io.to(`admin_${n.adminId}`).emit('notification', n);
        });
        io.to('admin_global').emit('booking_notification', {
          type,
          title,
          message,
          bookingId: String(bookingId),
          bookingNumber,
          createdAt: new Date()
        });
      }
    } catch (socketErr) {
      // Non-fatal if socket server isn't up
    }

    return created;
  } catch (err) {
    console.error('[AdminBookingNotifier] Failed to notify admins:', err);
  }
};

/**
 * New equipment / machinery booking created
 */
const notifyBookingCreated = async ({ booking, customerName, serviceTitle }) => {
  if (!booking) return;
  const bookingNumber = booking.bookingNumber || String(booking._id).slice(-8).toUpperCase();
  const title = '🚜 New Equipment Booking';
  const customer = customerName || (booking.userId?.name) || 'A farmer';
  const service = serviceTitle || (booking.equipmentId?.name) || (booking.serviceId?.title) || 'Equipment Service';
  const amount = booking.totalAmount ? `₹${booking.totalAmount}` : '';
  const message = `Booking ${bookingNumber} placed by ${customer} for ${service}${amount ? ` (${amount})` : ''}.`;

  return notifyAdmins({
    type: 'booking_created',
    title,
    message,
    bookingId: booking._id,
    bookingNumber,
    data: { amount: booking.totalAmount }
  });
};

/**
 * Worker booking confirmed
 */
const notifyWorkerBookingConfirmed = async ({ booking, request, customerName, workerCount, amount }) => {
  const bId = booking?._id || request?._id;
  const bookingNumber = booking?.bookingNumber || request?.bookingNumber || (bId ? String(bId).slice(-8).toUpperCase() : '');
  const title = '👷 Worker Booking Confirmed';
  const customer = customerName || 'Farmer';
  const count = workerCount || 1;
  const total = amount ? ` (₹${amount})` : '';
  const workTitle = request?.workTitle || booking?.serviceName || 'Farm Labor';
  const message = `Booking ${bookingNumber} confirmed for ${count} worker(s) by ${customer} for "${workTitle}"${total}.`;

  return notifyAdmins({
    type: 'worker_booking_confirmed',
    title,
    message,
    bookingId: bId,
    bookingNumber,
    data: { amount, workerCount: count }
  });
};

/**
 * Booking cancelled
 */
const notifyBookingCancelled = async ({ booking, reason, cancelledBy }) => {
  if (!booking) return;
  const bookingNumber = booking.bookingNumber || String(booking._id).slice(-8).toUpperCase();
  const title = '❌ Booking Cancelled';
  const by = cancelledBy ? ` by ${cancelledBy}` : '';
  const why = reason ? `: ${reason}` : '';
  const message = `Booking ${bookingNumber} was cancelled${by}${why}.`;

  return notifyAdmins({
    type: 'booking_cancelled',
    title,
    message,
    bookingId: booking._id,
    bookingNumber,
    data: { reason, cancelledBy }
  });
};

/**
 * Booking completed
 */
const notifyBookingCompleted = async ({ booking, totalAmount }) => {
  if (!booking) return;
  const bookingNumber = booking.bookingNumber || String(booking._id).slice(-8).toUpperCase();
  const title = '✅ Booking Completed';
  const amount = totalAmount || booking.totalAmount;
  const message = `Booking ${bookingNumber} was successfully completed${amount ? ` for ₹${amount}` : ''}.`;

  return notifyAdmins({
    type: 'booking_completed',
    title,
    message,
    bookingId: booking._id,
    bookingNumber,
    data: { totalAmount: amount }
  });
};

/**
 * Payment issue / default
 */
const notifyBookingPaymentIssue = async ({ booking, error, amount }) => {
  if (!booking) return;
  const bookingNumber = booking.bookingNumber || String(booking._id).slice(-8).toUpperCase();
  const title = '⚠️ Booking Payment Issue';
  const message = `Payment failed or defaulted for Booking ${bookingNumber}${amount ? ` (₹${amount})` : ''}. ${error || ''}`.trim();

  return notifyAdmins({
    type: 'payment_failed',
    title,
    message,
    bookingId: booking._id,
    bookingNumber,
    data: { error, amount }
  });
};

module.exports = {
  notifyBookingCreated,
  notifyWorkerBookingConfirmed,
  notifyBookingCancelled,
  notifyBookingCompleted,
  notifyBookingPaymentIssue,
  notifyAdmins
};
