const Booking = require('../models/Booking');
const { createNotification } = require('../controllers/notificationControllers/notificationController');

/**
 * Booking Reminder Service
 * Scans active and upcoming bookings to send real-time reminders when slot times are near.
 */

// Check upcoming bookings starting in the next 30 minutes
async function checkUpcomingSlotBookings() {
  try {
    const now = Date.now();
    // Query bookings that are scheduled/accepted and haven't had a start reminder sent
    const bookings = await Booking.find({
      status: { $in: ['scheduled', 'accepted'] },
      startReminderSent: { $ne: true }
    });

    for (const booking of bookings) {
      if (!booking.scheduledDate) continue;

      // Construct start Date object by merging scheduledDate and scheduledTime/timeSlot.start
      const startDateTime = new Date(booking.scheduledDate);
      const startStr = booking.timeSlot?.start || booking.scheduledTime || '';
      const match = startStr.match(/(\d{1,2}):(\d{2})/);
      
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        startDateTime.setHours(hours, minutes, 0, 0);
      } else {
        // Fallback to start of day if time cannot be parsed
        startDateTime.setHours(9, 0, 0, 0); // Default to 9:00 AM
      }

      const timeDiff = startDateTime.getTime() - now;
      
      // If start time is within 30 minutes (and in the future or very recent past e.g. -5 mins)
      if (timeDiff > -5 * 60 * 1000 && timeDiff <= 30 * 60 * 1000) {
        console.log(`[BookingReminder] Sending start reminder for booking ${booking.bookingNumber}`);
        
        // 1. Notify User
        await createNotification({
          userId: booking.userId,
          type: 'booking_approaching',
          title: '⏰ Booking Starting Soon!',
          message: `Your booking for ${booking.serviceName} is starting soon at ${startStr || 'scheduled time'}.`,
          relatedId: booking._id,
          relatedType: 'Booking',
          priority: 'high'
        });

        // 2. Notify Vendor (if assigned)
        if (booking.vendorId) {
          await createNotification({
            vendorId: booking.vendorId,
            type: 'booking_approaching',
            title: '⏰ Job Starting Soon!',
            message: `Your job for ${booking.serviceName} is scheduled to start soon at ${startStr || 'scheduled time'}.`,
            relatedId: booking._id,
            relatedType: 'Booking',
            priority: 'high'
          });
        }

        // Mark as sent
        booking.startReminderSent = true;
        await booking.save();
      }
    }
  } catch (error) {
    console.error('[BookingReminder] Error checking upcoming bookings:', error);
  }
}

// How far ahead the "ending soon" notice goes out. A day-long rental gets more notice so the farmer can arrange the return.
const END_REMINDER_LEAD_MS = 15 * 60 * 1000;
const RENTAL_DAILY_END_REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;

const leadLabel = (ms) => (ms >= 60 * 60 * 1000 ? `${Math.round(ms / 3600000)} hours` : `${Math.round(ms / 60000)} minutes`);

// How long the booking was booked for, in milliseconds
const bookedDurationMs = (booking) => {
  const duration = booking.estimatedDuration || 1;
  if (booking.rental_type === 'daily') return duration * 24 * 60 * 60 * 1000;
  if (booking.rental_type === 'monthly') return duration * 30 * 24 * 60 * 60 * 1000;
  return duration * 60 * 60 * 1000; // Default to hourly duration calculations
};

// Check in-progress hourly/daily bookings ending soon
async function checkEndingSlotBookings() {
  try {
    const now = Date.now();
    // Query in-progress bookings that haven't had an end reminder sent
    const bookings = await Booking.find({
      status: 'in_progress',
      endReminderSent: { $ne: true }
    });

    for (const booking of bookings) {
      if (!booking.startedAt) continue;

      const startedTime = new Date(booking.startedAt).getTime();
      const isRental = booking.fulfillmentMode === 'rental';
      const durationMs = bookedDurationMs(booking);

      const leadMs = isRental && booking.rental_type === 'daily' ? RENTAL_DAILY_END_REMINDER_LEAD_MS : END_REMINDER_LEAD_MS;
      const endDateTime = startedTime + durationMs;
      const timeDiff = endDateTime - now;

      // If slot is ending within the lead time (and hasn't ended more than 5 minutes ago)
      if (timeDiff > -5 * 60 * 1000 && timeDiff <= leadMs) {
        console.log(`[BookingReminder] Sending end reminder for booking ${booking.bookingNumber}`);
        const lead = leadLabel(leadMs);
        const pieces = Number(booking.unitsBooked) > 0 ? ` (${booking.unitsBooked} pcs)` : '';

        // 1. Notify User
        await createNotification({
          userId: booking.userId,
          type: 'booking_ending',
          title: isRental ? '⏳ Return Your Rental Soon' : '⏳ Rental Slot Ending Soon',
          message: isRental
            ? `Your rental for ${booking.serviceName}${pieces} ends in about ${lead}. Please return it on time: any extra time you keep it is billed at the same rate.`
            : `Your rental for ${booking.serviceName} is ending in ${lead}.`,
          relatedId: booking._id,
          relatedType: 'Booking',
          priority: 'high'
        });

        // 2. Notify Vendor
        if (booking.vendorId) {
          await createNotification({
            vendorId: booking.vendorId,
            type: 'booking_ending',
            title: '⏳ Rental Slot Ending Soon',
            message: `Your rental slot for ${booking.serviceName} is ending in ${lead}. Please prepare for collection.`,
            relatedId: booking._id,
            relatedType: 'Booking',
            priority: 'high'
          });
        }

        // Mark as sent
        booking.endReminderSent = true;
        await booking.save();
      }
    }
  } catch (error) {
    console.error('[BookingReminder] Error checking ending bookings:', error);
  }
}

// A rental kept past its booked time plus the grace period is now billed for the extra time: tell both sides once
async function checkOverdueRentals() {
  try {
    const { RENTAL_HOUR_GRACE_MS, RENTAL_DAY_GRACE_MS } = require('./bookingSettlementService');
    const now = Date.now();
    const bookings = await Booking.find({
      status: 'in_progress',
      fulfillmentMode: 'rental',
      overdueNoticeSent: { $ne: true },
      startedAt: { $ne: null }
    });

    for (const booking of bookings) {
      const graceMs = booking.rental_type === 'hourly' ? RENTAL_HOUR_GRACE_MS : RENTAL_DAY_GRACE_MS;
      const billedFrom = new Date(booking.startedAt).getTime() + bookedDurationMs(booking) + graceMs;
      if (now < billedFrom) continue;

      const unit = booking.rental_type === 'hourly' ? 'hour' : 'day';
      const pieces = Number(booking.unitsBooked) > 0 ? ` (${booking.unitsBooked} pcs)` : '';
      await createNotification({
        userId: booking.userId,
        type: 'booking_overdue',
        title: '⚠️ Rental Time Is Over',
        message: `Your rental for ${booking.serviceName}${pieces} has gone past its booked time. Each extra ${unit} you keep it is now added to your bill. Please return it as soon as you can.`,
        relatedId: booking._id,
        relatedType: 'Booking',
        priority: 'high'
      });
      if (booking.vendorId) {
        await createNotification({
          vendorId: booking.vendorId,
          type: 'booking_overdue',
          title: '⚠️ Rental Not Returned',
          message: `${booking.serviceName}${pieces} is past its booked time. The extra ${unit}s are added to the bill automatically when you close the rental.`,
          relatedId: booking._id,
          relatedType: 'Booking',
          priority: 'high'
        });
      }
      booking.overdueNoticeSent = true;
      await booking.save();
    }
  } catch (error) {
    console.error('[BookingReminder] Error checking overdue rentals:', error);
  }
}

/**
 * Start the Scheduler
 */
function startBookingReminderScheduler() {
  // Check every 5 minutes
  setInterval(async () => {
    try {
      await checkUpcomingSlotBookings();
      await checkEndingSlotBookings();
      await checkOverdueRentals();
    } catch (err) {
      console.error('[BookingReminderScheduler] Error in run loop:', err);
    }
  }, 5 * 60 * 1000);

  // Run immediate initial checks on startup (delayed slightly to allow DB/Socket connections to stabilize)
  setTimeout(() => {
    checkUpcomingSlotBookings();
    checkEndingSlotBookings();
    checkOverdueRentals();
  }, 10000);

  console.log('✅ Booking Reminder Scheduler Initialized');
}

module.exports = {
  startBookingReminderScheduler
};
