const Review = require('../../models/Review');
const Dispute = require('../../models/Dispute');
const Booking = require('../../models/Booking');

const farmerReviewController = {
  // Rate Booking
  rateBooking: async (req, res) => {
    try {
      const { bookingId, rating, reviewText, images } = req.body;
      const farmerId = req.user.id;

      const booking = await Booking.findOne({ _id: bookingId, userId: farmerId });
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

      if (booking.status !== 'completed') {
        return res.status(400).json({ success: false, message: 'Can only rate completed bookings' });
      }

      // Check if already reviewed
      const existingReview = await Review.findOne({ bookingId, userId: farmerId });
      if (existingReview) {
        return res.status(400).json({ success: false, message: 'You have already reviewed this booking' });
      }

      const review = new Review({
        bookingId,
        userId: farmerId,
        vendorId: booking.vendorId || undefined,
        workerId: booking.workerId || undefined,
        serviceId: booking.serviceId || undefined,
        rating,
        reviewText: reviewText || '',
        review: reviewText || '',
        images: images || [],
        status: 'approved' // Auto-approve or pending based on admin settings
      });

      await review.save();
      
      booking.rating = rating;
      booking.review = reviewText;
      booking.reviewedAt = new Date();
      await booking.save();

      // Update cumulative ratings across Vendor, Worker, and VendorEquipment
      const updateCumulativeRating = async (Model, docId, newRating) => {
        try {
          await Model.updateOne({ _id: docId }, [
            {
              $set: {
                rating: {
                  $round: [
                    {
                      $divide: [
                        { $add: [{ $multiply: [{ $ifNull: ['$rating', 0] }, { $ifNull: ['$totalReviews', 0] }] }, newRating] },
                        { $add: [{ $ifNull: ['$totalReviews', 0] }, 1] }
                      ]
                    },
                    2
                  ]
                },
                totalReviews: { $add: [{ $ifNull: ['$totalReviews', 0] }, 1] }
              }
            }
          ]);
        } catch (err) {
          console.error(`Error updating rating for ${Model.modelName}:`, err);
        }
      };

      if (booking.vendorId) {
        const Vendor = require('../../models/Vendor');
        await updateCumulativeRating(Vendor, booking.vendorId, rating);
      }

      if (booking.workerId) {
        const Worker = require('../../models/Worker');
        await updateCumulativeRating(Worker, booking.workerId, rating);
      }

      if (booking.equipmentId) {
        const VendorEquipment = require('../../models/VendorEquipment');
        await updateCumulativeRating(VendorEquipment, booking.equipmentId, rating);
      }

      res.status(201).json({ success: true, message: 'Review submitted successfully', data: review });
    } catch (error) {
      console.error('Error submitting review:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // File Complaint
  fileComplaint: async (req, res) => {
    try {
      const { bookingId, reason, description, attachments } = req.body;
      const farmerId = req.user.id;

      const booking = await Booking.findOne({ _id: bookingId, userId: farmerId });
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

      const dispute = new Dispute({
        bookingId,
        raisedBy: farmerId,
        raisedByRole: 'USER', // Farmer is User
        reason,
        description,
        attachments: attachments || [],
        status: 'pending'
      });

      await dispute.save();
      res.status(201).json({ success: true, message: 'Complaint filed successfully', data: dispute });
    } catch (error) {
      console.error('Error filing complaint:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
};

module.exports = farmerReviewController;
