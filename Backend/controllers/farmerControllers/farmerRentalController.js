const RentalTransaction = require('../../models/RentalTransaction');
const VendorEquipment = require('../../models/VendorEquipment');
const Booking = require('../../models/Booking');

const farmerRentalController = {
  // Rent Equipment
  rentEquipment: async (req, res) => {
    try {
      const { equipmentId, startDate, endDate } = req.body;
      const farmerId = req.user.id;

      const equipment = await VendorEquipment.findById(equipmentId);
      if (!equipment) return res.status(404).json({ success: false, message: 'Equipment not found' });

      if (equipment.pricing?.rental_type !== 'daily' && equipment.pricing?.rental_type !== 'hourly') {
        return res.status(400).json({ success: false, message: 'Equipment is not available for rental' });
      }

      // Calculate days
      const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) || 1;
      const rentalAmount = (equipment.pricing?.daily?.price || 100) * days;
      const securityDeposit = equipment.pricing?.security_deposit || 0;

      const rental = new RentalTransaction({
        farmerId,
        equipmentId,
        vendorId: equipment.vendorId,
        startDate,
        endDate,
        rentalAmount,
        securityDeposit,
        status: 'reserved'
      });

      await rental.save();
      res.status(201).json({ success: true, message: 'Rental reserved successfully', data: rental });
    } catch (error) {
      console.error('Error renting equipment:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Get Rental Details (Supports RentalTransaction or Booking)
  getRentalDetails: async (req, res) => {
    try {
      const { id } = req.params;
      const farmerId = req.user.id;

      let rental = await RentalTransaction.findOne({ _id: id, farmerId })
        .populate('equipmentId')
        .populate('vendorId', 'name businessName phone profileImage');

      if (rental) {
        return res.status(200).json({ success: true, data: rental, type: 'RentalTransaction' });
      }

      // Check Booking model
      const booking = await Booking.findOne({ _id: id, userId: farmerId })
        .populate('equipmentId')
        .populate('vendorId', 'name businessName phone profileImage');

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Rental record not found' });
      }

      return res.status(200).json({
        success: true,
        type: 'Booking',
        data: {
          _id: booking._id,
          bookingNumber: booking.bookingNumber,
          equipmentId: booking.equipmentId,
          vendorId: booking.vendorId,
          farmerId: booking.userId,
          status: booking.status,
          rentalAmount: booking.finalAmount || booking.amount,
          securityDeposit: booking.equipmentId?.pricing?.security_deposit || 0,
          rentalHandover: booking.rentalHandover || {},
          damageReport: booking.damageReport || {},
          farmerConfirmedReturn: booking.rentalHandover?.farmerConfirmedReturn || false,
          vendorConfirmedReturn: booking.rentalHandover?.vendorConfirmedReturn || false,
          depositRefundStatus: booking.rentalHandover?.depositRefundStatus || 'pending'
        }
      });
    } catch (error) {
      console.error('Error fetching rental details:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Confirm Return (Farmer side)
  confirmReturn: async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const farmerId = req.user.id;

      // 1. Try finding RentalTransaction
      let rental = await RentalTransaction.findOne({ _id: id, farmerId });
      if (rental) {
        rental.farmerConfirmedReturn = true;
        if (notes) rental.handoverNotes = notes;

        if (rental.vendorConfirmedReturn) {
          rental.status = 'returned';
          if (!rental.damageReport?.reportedBy) {
            rental.depositRefundStatus = 'released'; // Auto-release deposit
          }
        }

        await rental.save();
        return res.status(200).json({
          success: true,
          message: 'Equipment return confirmed by farmer',
          data: rental
        });
      }

      // 2. Try finding Booking
      const booking = await Booking.findOne({ _id: id, userId: farmerId });
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Rental booking not found' });
      }

      if (!booking.rentalHandover) {
        booking.rentalHandover = {};
      }

      booking.rentalHandover.farmerConfirmedReturn = true;
      booking.rentalHandover.farmerConfirmedAt = new Date();
      if (notes) booking.rentalHandover.returnNotes = notes;

      if (booking.rentalHandover.vendorConfirmedReturn) {
        booking.rentalHandover.returnStatus = 'returned';
        if (!booking.damageReport?.reported) {
          booking.rentalHandover.depositRefundStatus = 'released';
        }
      } else {
        booking.rentalHandover.returnStatus = 'farmer_returned';
      }

      await booking.save();
      return res.status(200).json({
        success: true,
        message: 'Equipment return confirmed by farmer',
        data: {
          _id: booking._id,
          rentalHandover: booking.rentalHandover,
          damageReport: booking.damageReport
        }
      });
    } catch (error) {
      console.error('Error confirming return:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Report Damage (Farmer side)
  reportDamage: async (req, res) => {
    try {
      const { id } = req.params;
      const { description, photos, estimatedCost, severity } = req.body;
      const farmerId = req.user.id;

      if (!description?.trim()) {
        return res.status(400).json({ success: false, message: 'Description of damage is required' });
      }

      // 1. Try finding RentalTransaction
      let rental = await RentalTransaction.findOne({ _id: id, farmerId });
      if (rental) {
        if (rental.damageReport?.reportedBy) {
          return res.status(400).json({ success: false, message: 'A damage report already exists for this rental' });
        }

        rental.status = 'disputed';
        rental.depositRefundStatus = 'pending'; // Hold deposit
        rental.damageReport = {
          reportedBy: farmerId,
          reporterRole: 'User',
          description,
          photos: photos || [],
          estimatedCost: Number(estimatedCost) || 0,
          severity: severity || 'minor',
          reportedAt: new Date()
        };

        await rental.save();
        return res.status(200).json({
          success: true,
          message: 'Damage reported successfully. AgroYilt admin will review the claim.',
          data: rental
        });
      }

      // 2. Try finding Booking
      const booking = await Booking.findOne({ _id: id, userId: farmerId });
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Rental booking not found' });
      }

      if (booking.damageReport?.reported) {
        return res.status(400).json({ success: false, message: 'A damage report already exists for this booking' });
      }

      if (!booking.rentalHandover) {
        booking.rentalHandover = {};
      }

      booking.rentalHandover.returnStatus = 'disputed';
      booking.rentalHandover.depositRefundStatus = 'pending'; // Freezes deposit in escrow
      booking.damageReport = {
        reported: true,
        reportedBy: farmerId,
        reporterRole: 'User',
        description,
        photos: photos || [],
        estimatedCost: Number(estimatedCost) || 0,
        severity: severity || 'minor',
        reportedAt: new Date(),
        status: 'reported'
      };

      await booking.save();
      return res.status(200).json({
        success: true,
        message: 'Damage reported successfully. AgroYilt admin will review the claim.',
        data: {
          _id: booking._id,
          rentalHandover: booking.rentalHandover,
          damageReport: booking.damageReport
        }
      });
    } catch (error) {
      console.error('Error reporting damage:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
};

module.exports = farmerRentalController;
