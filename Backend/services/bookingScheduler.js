/**
 * Booking Scheduler Service
 * Handles 15-Minute Timeout for Single-Vendor Targeted Booking Requests
 * 
 * Flow:
 * - Farmer selects one vendor.
 * - Vendor has 15 minutes to accept or decline.
 * - If 15 minutes expire without vendor action, booking is marked REJECTED (timed out).
 * - Farmer is immediately notified via Socket.io and Push Notification with option to reselect another vendor.
 */

const Booking = require('../models/Booking');
const { BOOKING_STATUS } = require('../utils/constants');
const { createNotification } = require('../controllers/notificationControllers/notificationController');

class BookingScheduler {
  constructor(io) {
    this.io = io;
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('[BookingScheduler] Already running.');
      return;
    }

    this.isRunning = true;
    console.log('[BookingScheduler] Started - checking single-vendor timeouts every 30 seconds');

    // Run immediately on start
    this.processTimeouts();

    // Check every 30 seconds
    this.intervalId = setInterval(() => {
      this.processTimeouts();
    }, 30000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('[BookingScheduler] Stopped.');
    }
  }

  async processTimeouts() {
    try {
      const BookingRequest = require('../models/BookingRequest');
      const now = Date.now();
      const REQUEST_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes response window

      // Find single-vendor targeted bookings that have timed out
      // Supports waveStartedAt with createdAt as a reliable fallback
      const timedOutBookings = await Booking.find({
        status: BOOKING_STATUS.REQUESTED,
        vendorId: { $ne: null },
        $or: [
          { waveStartedAt: { $lt: new Date(now - REQUEST_TIMEOUT_MS) } },
          { waveStartedAt: null, createdAt: { $lt: new Date(now - REQUEST_TIMEOUT_MS) } }
        ]
      });

      for (const booking of timedOutBookings) {
        console.log(`[BookingScheduler] Booking ${booking.bookingNumber} timed out waiting for vendor ${booking.vendorId}`);
        booking.status = BOOKING_STATUS.REJECTED;
        booking.rejectionReason = 'Request expired: Vendor did not respond in time';
        booking.cancelledAt = new Date();
        booking.cancelledBy = 'system';
        booking.cancellationReason = 'Vendor response timed out';
        await booking.save();

        // Expire pending booking requests
        await BookingRequest.updateMany(
          { bookingId: booking._id, status: 'PENDING' },
          { status: 'EXPIRED', respondedAt: new Date() }
        );

        // Notify user via Socket.io so they can immediately reselect another available vendor
        if (this.io) {
          this.io.to(`user_${booking.userId}`).emit('vendor_rejected', {
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber,
            vendorId: booking.vendorId,
            reason: booking.rejectionReason,
            canReselect: true,
            message: 'The selected vendor did not respond in time. You can choose another available vendor.'
          });
          this.io.to(`user_${booking.userId}`).emit('booking_updated', {
            bookingId: booking._id,
            status: BOOKING_STATUS.REJECTED,
            rejectionReason: booking.rejectionReason,
            canReselect: true
          });
        }

        // Notify user via in-app & push notification
        await createNotification({
          userId: booking.userId,
          type: 'booking_rejected',
          title: 'Vendor Request Expired',
          message: `Your booking request for ${booking.bookingNumber} timed out. Tap to choose another available vendor.`,
          relatedId: booking._id,
          relatedType: 'booking',
          pushData: {
            type: 'vendor_rejected',
            bookingId: booking._id.toString(),
            canReselect: true,
            link: `/user/booking/${booking._id}`
          }
        });
      }
    } catch (error) {
      console.error('[BookingScheduler] Error processing timeouts:', error);
    }
  }

  // Alias for backward compatibility if called elsewhere
  processWaves() {
    return this.processTimeouts();
  }
}

// Singleton instance
let schedulerInstance = null;

const initializeScheduler = (io) => {
  if (!schedulerInstance) {
    schedulerInstance = new BookingScheduler(io);
    schedulerInstance.start();
  }
  return schedulerInstance;
};

const getScheduler = () => schedulerInstance;

module.exports = { BookingScheduler, initializeScheduler, getScheduler };
