/**
 * Firebase Notification Service
 * High-level service to orchestrate business-specific notifications
 */
const { sendNotificationToVendor } = require('./firebaseAdmin');

/**
 * Send a new booking request notification to a vendor
 * @param {Object} vendor - The Vendor Mongoose Document
 * @param {Object} bookingData - The Booking data object
 */
async function sendNewBookingNotification(vendor, bookingData, serviceNameFallback = '', locationFallback = '') {
  try {
    let vendorId = null;
    if (vendor) {
      if (typeof vendor === 'string') {
        vendorId = vendor;
      } else if (vendor._id || vendor.id) {
        vendorId = String(vendor._id || vendor.id);
      } else if (Array.isArray(vendor) && vendor[0]) {
        vendorId = vendor[0]._id || vendor[0].id || vendor[0].vendorId;
      }
    }

    if (!vendorId) {
      console.error('[FCM] Cannot send booking notification: Invalid vendor provided:', vendor);
      return;
    }

    // Support both object bookingData and legacy positional (vendor, bookingId, serviceName, location)
    let details = {};
    if (bookingData && typeof bookingData === 'object') {
      details = bookingData;
    } else {
      details = {
        bookingId: String(bookingData || ''),
        serviceName: serviceNameFallback || 'Service',
        location: locationFallback || ''
      };
    }

    const serviceName = details.serviceName || serviceNameFallback || 'Machinery / Service';

    const payload = {
      title: "New Booking Request",
      body: `You have a new service request for ${serviceName}!`,
      channelId: 'booking_alerts',
      priority: 'high',
      dataOnly: false,
      data: {
        type: "new_booking_request",
        notificationType: "new_booking",
        bookingId: String(details.bookingId || ""),
        bookingNumber: String(details.bookingNumber || ""),
        vendorId: String(vendorId),
        serviceName: String(serviceName),
        categoryName: String(details.categoryName || details.serviceCategory || ""),
        date: String(details.date || details.scheduledDate || ""),
        startTime: String(details.startTime || details.scheduledTime || ""),
        customerName: String(details.customerName || "Customer"),
        customerPhone: String(details.customerPhone || ""),
        price: String(details.price || ""),
        distance: String(details.distance || ""),
        // Required for frontend routing from background SW:
        link: `/vendor/booking-alert/${details.bookingId || ""}`,
        channelId: 'booking_alerts'
      }
    };

    // sendNotificationToVendor automatically loops through all vendor devices and fetches fresh tokens from DB
    await sendNotificationToVendor(vendorId, payload);

  } catch (error) {
    console.error(`[FCM] Failed to send new booking notification:`, error);
  }
}

module.exports = {
  sendNewBookingNotification
};
