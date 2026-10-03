const Booking = require('../../models/Booking');
const GroupBooking = require('../../models/GroupBooking');
const Razorpay = require('razorpay');

// Ensure Razorpay instance is safely initialized
let razorpayInstance = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

const farmerBookingPaymentController = {
  // Pay for Booking
  payForBooking: async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.query; // 'booking' or 'group_booking'

      if (!razorpayInstance) {
        return res.status(500).json({ success: false, message: 'Payment gateway not configured' });
      }

      let amountToPay = 0;
      let receiptId = '';
      let paidBooking = null;

      if (type === 'group_booking') {
        const groupBooking = await GroupBooking.findOne({ _id: id, 'participants.farmerId': req.user.id });
        if (!groupBooking) return res.status(404).json({ success: false, message: 'Group booking not found' });
        
        const participant = groupBooking.participants.find(p => p.farmerId.toString() === req.user.id);
        amountToPay = participant.shareAmount;
        receiptId = `gb_${groupBooking._id}_${req.user.id}`;
      } else {
        const booking = await Booking.findOne({ _id: id, userId: req.user.id });
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
        if (['cancelled', 'rejected', 'completed'].includes(booking.status)) {
          return res.status(400).json({ success: false, message: `Cannot pay for a booking that is ${booking.status}` });
        }
        if (['success', 'collected_by_vendor', 'refunded'].includes(booking.paymentStatus) || booking.cashCollected) {
          return res.status(400).json({ success: false, message: 'This booking is already paid' });
        }

        // After the final bill only the balance is owed; before it, the booking total
        amountToPay = booking.balanceDue > 0 ? booking.balanceDue : booking.finalAmount;
        receiptId = `bk_${booking._id}`;
        paidBooking = booking;
      }

      const options = {
        amount: Math.round(amountToPay * 100), // amount in the smallest currency unit (paise)
        currency: "INR",
        receipt: receiptId,
      };

      if (!(amountToPay > 0)) {
        return res.status(400).json({ success: false, message: 'Nothing to pay' });
      }
      options.notes = paidBooking ? { bookingId: paidBooking._id.toString(), userId: String(req.user.id) } : undefined;

      const order = await razorpayInstance.orders.create(options);

      // Remember the order so /payments/verify and the gateway webhook can find the booking
      if (paidBooking) {
        await Booking.updateOne(
          { _id: paidBooking._id },
          {
            $set: { razorpayOrderId: order.id, [`razorpayOrderAmounts.${order.id}`]: amountToPay },
            $addToSet: { razorpayOrderIds: order.id }
          }
        );
      }

      // Note: Payment confirmation MUST rely SOLELY on the verified Razorpay webhook.
      // We do not update the DB status here.

      res.status(200).json({
        success: true,
        data: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          keyId: process.env.RAZORPAY_KEY_ID
        }
      });
    } catch (error) {
      console.error('Error initiating payment:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Get Payment History
  getPaymentHistory: async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const skip = (Number(page) - 1) * Number(limit);
      
      // Fetch bookings with paid status
      const bookings = await Booking.find({ 
        userId: req.user.id,
        paymentStatus: 'COMPLETED'
      })
      .select('bookingNumber finalAmount paymentStatus razorpayPaymentId createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

      const total = await Booking.countDocuments({ 
        userId: req.user.id,
        paymentStatus: 'COMPLETED'
      });

      res.status(200).json({
        success: true,
        data: bookings,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching payment history:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
};

module.exports = farmerBookingPaymentController;
