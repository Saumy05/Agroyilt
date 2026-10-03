const Booking = require('../../models/Booking');
const VendorEquipment = require('../../models/VendorEquipment');
const Service = require('../../models/Service');
const mongoose = require('mongoose');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');

const farmerBookingController = {
  // Create Booking — thin adapter over the main booking engine so there is ONE set of rules
  // (vendor eligibility, server-side pricing, slot conflicts, 15-minute vendor alert, penalties).
  createBooking: async (req, res) => {
    const { machineryId, date, timeSlot, location, area, cropType } = req.body;
    if (!machineryId || !date || !timeSlot || !location) {
      return res.status(400).json({ success: false, message: 'machineryId, date, timeSlot and location are required' });
    }
    req.body = {
      serviceId: machineryId,
      equipmentId: machineryId,
      rental_type: area ? 'land_based' : 'hourly',
      landSize: area ? String(area) : undefined,
      cropType,
      scheduledDate: date,
      scheduledTime: timeSlot.start,
      timeSlot,
      address: location,
      serviceCategory: 'Agriculture',
      paymentMethod: req.body.paymentMethod || 'pay_at_home'
    };
    return require('../bookingControllers/userBookingController').createBooking(req, res);
  },

  // Get Booking History
  getBookingHistory: async (req, res) => {
    try {
      const { status, dateFrom, dateTo, page = 1, limit = 10 } = req.query;
      let query = { userId: req.user.id };

      if (status) query.status = status;
      if (dateFrom || dateTo) {
        query.scheduledDate = {};
        if (dateFrom) query.scheduledDate.$gte = new Date(dateFrom);
        if (dateTo) query.scheduledDate.$lte = new Date(dateTo);
      }

      const skip = (Number(page) - 1) * Number(limit);
      const bookings = await Booking.find(query)
        .populate('vendorId', 'name businessName phone rating')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await Booking.countDocuments(query);

      res.status(200).json({
        success: true,
        data: bookings,
        pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
      });
    } catch (error) {
      console.error('Error fetching booking history:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Cancel Booking — same refund / fee / state rules as the main endpoint
  cancelBooking: async (req, res) => {
    req.body = { cancellationReason: req.body.reason || req.body.cancellationReason };
    return require('../bookingControllers/userBookingController').cancelBooking(req, res);
  },

  // Request Extension
  requestExtension: async (req, res) => {
    try {
      const bookingId = req.params.id;
      const { requestedHours, reason } = req.body;

      const booking = await Booking.findOne({ _id: bookingId, userId: req.user.id });
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }

      if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
        return res.status(400).json({ success: false, message: 'Can only extend in-progress bookings' });
      }

      const hours = Number(requestedHours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        return res.status(400).json({ success: false, message: 'requestedHours must be between 0 and 24' });
      }
      if (booking.extensionRequests.some(r => r.status === 'pending')) {
        return res.status(400).json({ success: false, message: 'You already have a pending extension request' });
      }
      // Indicative only: the vendor's approval recomputes the charge from the rate card.
      const chargeAmount = hours * (booking.basePrice / (booking.estimatedDuration || 1));

      booking.extensionRequests.push({
        requestedHours: hours,
        chargeAmount,
        reason,
        status: 'pending'
      });

      await booking.save();
      res.status(200).json({ success: true, message: 'Extension requested successfully', data: booking });
    } catch (error) {
      console.error('Error requesting extension:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Approve Work Completion — the farmer's sign-off. It can never skip billing or payment:
  // completion happens only through the vendor's end-of-work and the payment steps.
  approveWorkCompletion: async (req, res) => {
    try {
      const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.id });
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }
      if (booking.status === BOOKING_STATUS.IN_PROGRESS) {
        return res.status(400).json({ success: false, message: 'The work is still in progress. The vendor must end the work and generate the bill first.' });
      }
      if (![BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
        return res.status(400).json({ success: false, message: `Nothing to approve while the booking is ${booking.status}` });
      }
      booking.customerConfirmed = true;
      await booking.save();
      res.status(200).json({ success: true, message: 'Work completion approved. Please complete the payment to close the booking.', data: { status: booking.status, balanceDue: booking.balanceDue } });
    } catch (error) {
      console.error('Error approving completion:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
};

module.exports = farmerBookingController;
