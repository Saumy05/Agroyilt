'use strict';

const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const Worker = require('../../models/Worker');
const User = require('../../models/User');
const WorkerSettlement = require('../../models/WorkerSettlement');
const Transaction = require('../../models/Transaction');
const { getWorkerFinancialSettings, addWorkerDues } = require('../../services/workerFinancialService');

exports.processWorkerSettlement = async (req, res) => {
  // A booking backed by an IndWorkerAssignment is settled ONLY through the assignment lifecycle (atomic, ledger-keyed).
  // This legacy farmer-triggered path would pay the same job a second time, so it is closed for such bookings.
  try {
    const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
    if (mongoose.Types.ObjectId.isValid(req.params.id) && await IndWorkerAssignment.exists({ legacyBookingId: req.params.id })) {
      return res.status(409).json({ success: false, message: 'This booking is settled through the worker assignment flow.' });
    }
  } catch (e) { /* fall through to the legacy checks */ }

  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const farmerId = req.user._id;
    const { id: bookingId } = req.params;
    const { otp } = req.body;

    const booking = await Booking.findOne({
      _id: bookingId,
      userId: farmerId,
      providerType: 'WORKER',
      status: { $in: ['confirmed', 'in_progress', 'work_done'] }
    }).session(session);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Worker booking not found or not in settlable state.' });
    }

    if (booking.settlementStatus === 'completed') {
      return res.status(409).json({ success: false, message: 'Settlement already completed for this booking.' });
    }

    const expectedOtp = booking.customerConfirmationOTP || booking.paymentOtp || booking.driver_end_otp;
    const submittedOtp = otp ? otp.toString().trim() : '';
    if (!expectedOtp || !submittedOtp || submittedOtp !== expectedOtp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Invalid OTP provided. Please enter the code from the customer.' });
    }

    const settings = await getWorkerFinancialSettings();
    const idempotencyKey = `settle_${bookingId}`;

    const existingSettlement = await WorkerSettlement.findOne({ idempotencyKey }).session(session);
    if (existingSettlement) {
       await session.abortTransaction();
       return res.json({ success: true, message: 'Settlement already processed.', data: existingSettlement });
    }

    // Financial calculations
    const workerNet = booking.workerNetEarning;
    const commission = booking.commissionAmount;
    
    // Farmer refund calculation
    // Farmer paid maxRate upfront (plus platform charge, but platform charge isn't refunded).
    // The unused portion is maxRate - workerOfferedRate.
    const farmerUnused = booking.maxRate - booking.workerOfferedRate;

    let cashDuesRecorded = false;
    let farmerWalletCredited = false;

    // 1. Credit Worker Wallet (Online payments) OR Record Dues (Cash)
    if (booking.paymentMethod === 'online') {
       await Worker.findByIdAndUpdate(booking.workerId, {
         $inc: { 'wallet.balance': workerNet }
       }, { session });

       await Transaction.create([{
         workerId: booking.workerId,
         bookingId: booking._id,
         type: 'earnings_credit',
         amount: workerNet,
         status: 'completed',
         paymentMethod: 'wallet',
         description: `Earnings for booking ${booking.bookingNumber}`,
         referenceId: idempotencyKey,
       }], { session });

    } else if (booking.paymentMethod === 'cash') {
       // Worker collected full amount in cash, so they owe the platform the commission
       await addWorkerDues(booking.workerId, commission, session);
       cashDuesRecorded = true;
    }

    // 2. Refund Farmer Unused Amount
    if (farmerUnused > 0 && booking.paymentMethod === 'online') {
       await User.findByIdAndUpdate(farmerId, {
         $inc: { 'wallet.balance': farmerUnused }
       }, { session });

       await Transaction.create([{
         userId: farmerId,
         bookingId: booking._id,
         type: 'refund',
         amount: farmerUnused,
         status: 'completed',
         paymentMethod: 'wallet',
         description: `Unused budget refund for booking ${booking.bookingNumber}`,
         referenceId: idempotencyKey,
       }], { session });

       farmerWalletCredited = true;
       booking.farmerUnusedAmountCredited = true;
       booking.farmerUnusedAmount = farmerUnused;
    }

    // 3. Create Settlement Record
    const settlement = await WorkerSettlement.create([{
      bookingId: booking._id,
      workerId: booking.workerId,
      farmerId: booking.userId,
      requestId: booking.workerRequestId,
      grossAmount: booking.workerGrossEarning,
      commissionRate: booking.commissionRate,
      commissionAmount: booking.commissionAmount,
      netAmount: booking.workerNetEarning,
      paymentMethod: booking.paymentMethod,
      cashDuesRecorded,
      farmerUnusedAmount: farmerUnused,
      farmerWalletCredited,
      idempotencyKey,
      status: 'completed'
    }], { session });

    // 4. Update Booking
    booking.settlementStatus = 'completed';
    booking.settlementAt = new Date();
    booking.settlementIdempotencyKey = idempotencyKey;
    booking.status = 'completed'; // Mark job as done
    booking.paymentStatus = 'success';
    await booking.save({ session });

    await session.commitTransaction();

    return res.json({
      success: true,
      message: 'Settlement processed successfully.',
      data: settlement[0]
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('[processWorkerSettlement]', error);
    return res.status(500).json({ success: false, message: 'Failed to process settlement.' });
  } finally {
    session.endSession();
  }
};
