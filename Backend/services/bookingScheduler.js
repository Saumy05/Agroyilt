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
    this.workerExpiryIntervalId = null;
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

    // ── Proactive Worker Request Expiry Scanner ──────────────────────────────
    // Runs every 2 minutes. Finds farmer broadcast requests that have passed
    // their scheduled window without being confirmed, and notifies the farmer.
    this.processWorkerRequestExpiries();
    this.workerExpiryIntervalId = setInterval(() => {
      this.processWorkerRequestExpiries();
    }, 2 * 60 * 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.workerExpiryIntervalId) {
      clearInterval(this.workerExpiryIntervalId);
      this.workerExpiryIntervalId = null;
    }
    this.isRunning = false;
    console.log('[BookingScheduler] Stopped.');
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

  /**
   * Proactive Worker Booking Request Expiry Scanner
   * Scans for stale farmer broadcast requests (pending/matching) that passed their
   * `expiresAt` or scheduled window. Expires them and notifies the farmer proactively
   * instead of relying on lazy expiry on the next farmer API call.
   */
  async processWorkerRequestExpiries() {
    try {
      const WorkerBookingRequest = require('../models/WorkerBookingRequest');
      const { isBookingExpired, expireWorkerBookingRequest } = require('./workerBookingExpiryService');

      const now = new Date();

      // Find stale pending/matching requests that are past their expiresAt window
      const staleRequests = await WorkerBookingRequest.find({
        status: { $in: ['pending', 'matching'] },
        expiresAt: { $lt: now }
      }).limit(50).lean();  // Cap at 50 per cycle to avoid blocking

      if (staleRequests.length > 0) {
        console.log(`[BookingScheduler] Found ${staleRequests.length} stale worker requests to expire proactively.`);
      }

      for (const reqDoc of staleRequests) {
        try {
          const evalResult = isBookingExpired(reqDoc, now);
          if (evalResult.isExpired) {
            // Load the full document to allow save() in expiry service
            const fullDoc = await WorkerBookingRequest.findById(reqDoc._id);
            if (fullDoc && !['expired', 'cancelled', 'completed', 'confirmed'].includes(fullDoc.status)) {
              await expireWorkerBookingRequest(fullDoc, evalResult.reason || 'Scheduled window elapsed');
              console.log(`[BookingScheduler] Proactively expired worker request ${reqDoc._id} (${reqDoc.workTitle}).`);
            }
          }
        } catch (singleErr) {
          console.error(`[BookingScheduler] Error expiring worker request ${reqDoc._id}:`, singleErr.message);
        }
      }
    } catch (err) {
      // Non-fatal — log and continue
      console.error('[BookingScheduler] processWorkerRequestExpiries error:', err.message);
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
