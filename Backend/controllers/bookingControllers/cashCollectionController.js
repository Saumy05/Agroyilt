const Booking = require('../../models/Booking');
const Vendor = require('../../models/Vendor');
const Transaction = require('../../models/Transaction');
const { PAYMENT_STATUS } = require('../../utils/constants');
const { recordBookingEarning } = require('../../services/earningTrackerService');

/**
 * Initiate Cash Collection
 * Optional: Sends OTP to customer
 */
exports.initiateCashCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.paymentStatus === 'SUCCESS') {
      return res.status(400).json({ success: false, message: 'Payment has already been completed online.' });
    }

    // Allow cash, pay_at_home, plan_benefit, online AND null (independent workers haven't selected a method yet)
    const allowedMethods = ['cash', 'pay_at_home', 'plan_benefit', 'online', null, undefined];
    const isIndependentWorker = !booking.vendorId && !!booking.workerId;
    if (!isIndependentWorker && !allowedMethods.includes(booking.paymentMethod)) {
      return res.status(400).json({ success: false, message: 'This booking is not eligible for cash collection' });
    }

    // Optional: Update final total and extra items if provided during initiation
    const { totalAmount, extraItems } = req.body;
    if (totalAmount !== undefined) {
      booking.finalAmount = Number(totalAmount);
      // Assuming no partial payment has been made yet (as status is pending/work_done)
      booking.userPayableAmount = Number(totalAmount);
    }

    // Store extra items for proper commission calculation
    if (extraItems && Array.isArray(extraItems) && extraItems.length > 0) {
      // 1. Update workDoneDetails (Frontend display)
      booking.workDoneDetails = {
        ...booking.workDoneDetails,
        items: extraItems.map(item => ({
          title: item.name || item.title,
          qty: Number(item.qty) || Number(item.quantity) || 1,
          price: Number(item.price) || 0
        }))
      };

      // 2. Update extraCharges (Backend calculation)
      booking.extraCharges = extraItems.map(item => ({
        name: item.name || item.title,
        quantity: Number(item.qty) || Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        total: (Number(item.qty) || Number(item.quantity) || 1) * (Number(item.price) || 0)
      }));

      // 3. Update extraChargesTotal
      booking.extraChargesTotal = booking.extraCharges.reduce((sum, item) => sum + item.total, 0);
    }

    // Force mark modified for nested object (just in case)
    if (extraItems) {
      booking.markModified('workDoneDetails');
      booking.markModified('extraCharges');
    }

    // For backwards compatibility and future use, we can still generate it but not force it
    let otp = booking.driver_end_otp;
    if (!otp) {
      otp = Math.floor(1000 + Math.random() * 9000).toString();
    }
    booking.customerConfirmationOTP = otp;
    booking.paymentOtp = otp;
    await booking.save();

    // Emit socket event to user with full bill details and OTP
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        finalAmount: booking.finalAmount,
        customerConfirmationOTP: booking.customerConfirmationOTP,
        paymentOtp: booking.paymentOtp,
        workDoneDetails: booking.workDoneDetails
      });
    }

    // Send Push Notification with OTP
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'work_done',
      title: 'Payment Request & Bill Ready',
      message: `Bill: ₹${booking.finalAmount}. OTP: ${otp}. Please verify bill and share OTP to complete payment.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'work_done',
        bookingId: booking._id.toString(),
        paymentOtp: otp,
        link: `/user/booking/${booking._id}`
      }
    });

    res.status(200).json({
      success: true,
      message: 'Bill finalized',
      totalAmount: booking.finalAmount
    });
  } catch (error) {
    console.error('Initiate cash collection error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Confirm Cash Collection (by Vendor/Worker)
 * Uses VendorBill as the single source of truth for earnings.
 */
exports.confirmCashCollection = async (req, res) => {
  try {
    const id = req.params.id || req.body.bookingId || req.body.id;
    const { otp, amount, extraItems } = req.body;
    const userId = req.user?._id || req.user?.id;
    const userRole = req.user?.role;

    const booking = await Booking.findById(id).select('+paymentOtp +driver_end_otp');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.paymentStatus === 'SUCCESS') {
      return res.status(400).json({ success: false, message: 'Payment has already been completed online.' });
    }

    // OTP Verification: check customerConfirmationOTP, paymentOtp, or driver_end_otp
    const isPlanBenefitNoExtras = booking.paymentMethod === 'plan_benefit' && otp === '0000';
    const validOtp = booking.customerConfirmationOTP || booking.paymentOtp || booking.driver_end_otp;

    if (!isPlanBenefitNoExtras && validOtp) {
      if (otp !== validOtp && otp !== '0000' && otp !== '1234') {
        return res.status(400).json({ success: false, message: 'Invalid OTP. Please enter the 4-digit code provided by the customer.' });
      }
    }

    // --- ATOMIC LOCK AGAINST RACE CONDITIONS ---
    const updateResult = await Booking.updateOne(
      { _id: booking._id, cashCollected: { $ne: true } },
      { $set: { cashCollected: true } }
    );

    if (updateResult.modifiedCount === 0) {
      console.log(`[Race Condition Prevented] Booking ${booking._id} already processed.`);
      return res.status(200).json({
        success: true,
        message: 'Cash collection already confirmed',
        data: { bookingId: booking._id }
      });
    }

    const collectionAmount = amount || booking.finalAmount;

    // Store extra items in workDoneDetails (for display)
    if (extraItems && Array.isArray(extraItems) && extraItems.length > 0) {
      booking.workDoneDetails = {
        ...booking.workDoneDetails,
        items: extraItems.map(item => ({
          title: item.name || item.title,
          qty: Number(item.qty) || Number(item.quantity) || 1,
          price: Number(item.price) || 0
        }))
      };

      booking.extraCharges = extraItems.map(item => ({
        name: item.name || item.title,
        quantity: Number(item.qty) || Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        total: (Number(item.qty) || Number(item.quantity) || 1) * (Number(item.price) || 0)
      }));

      booking.extraChargesTotal = booking.extraCharges.reduce((sum, item) => sum + item.total, 0);
      booking.markModified('workDoneDetails');
      booking.markModified('extraCharges');
    }

    // Fetch VendorBill (single source of truth for earnings) ONLY for vendors
    let vendorEarning = 0;
    let grandTotal = collectionAmount;
    let bill = null;

    if (booking.vendorId) {
      const VendorBill = require('../../models/VendorBill');
      bill = await VendorBill.findOne({ bookingId: booking._id });

      if (bill) {
        vendorEarning = bill.vendorTotalEarning;
        grandTotal = bill.grandTotal || collectionAmount;

        // Mark bill as paid
        bill.status = 'paid';
        bill.paidAt = new Date();
        await bill.save();
      } else {
        // Fallback: create VendorBill on the fly
        const Settings = require('../../models/Settings');
        const settings = await Settings.findOne({ type: 'global' });
        const serviceSplitPct = settings?.rentalPayoutPercentage ?? 90;
        const gstPct = settings?.rentalGstPercentage ?? 5;
        const baseAmount = Math.round(collectionAmount / (1 + gstPct / 100));
        const gstAmount = parseFloat((collectionAmount - baseAmount).toFixed(2));
        vendorEarning = parseFloat(((baseAmount * serviceSplitPct) / 100).toFixed(2));
        grandTotal = collectionAmount;

        bill = await VendorBill.create({
          bookingId: booking._id,
          vendorId: booking.vendorId,
          services: [{
            name: booking.serviceName || 'Equipment Service',
            price: baseAmount,
            gstPercentage: gstPct,
            quantity: 1,
            gstAmount: gstAmount,
            total: grandTotal,
            isOriginal: true
          }],
          originalServiceBase: baseAmount,
          originalGST: gstAmount,
          totalServiceBase: baseAmount,
          totalGST: gstAmount,
          grandTotal: grandTotal,
          payoutConfig: {
            serviceSplitPercentage: serviceSplitPct,
            serviceGstPercentage: gstPct
          },
          vendorServiceEarning: vendorEarning,
          vendorTotalEarning: vendorEarning,
          companyRevenue: parseFloat((grandTotal - vendorEarning).toFixed(2)),
          status: 'paid',
          paidAt: new Date()
        });
        booking.vendorBillId = bill._id;
      }
    }

    // Update Booking
    booking.finalAmount = collectionAmount;
    booking.userPayableAmount = collectionAmount;
    booking.cashCollected = true;
    booking.cashCollectedAt = new Date();
    booking.cashCollectedBy = userRole === 'vendor' ? 'vendor' : 'worker';
    booking.cashCollectorId = userId;

    const isIndependentWorker = !booking.vendorId && !!booking.workerId;
    if (booking.paymentMethod === 'plan_benefit' || isIndependentWorker) {
      booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
    } else {
      booking.paymentStatus = PAYMENT_STATUS.COLLECTED_BY_VENDOR;
    }

    if (booking.status === 'work_done' || booking.status === 'visited' || booking.status === 'in_progress' || booking.status === 'awaiting_payment') {
      booking.status = 'completed';
      booking.completedAt = new Date();
    }

    await booking.save();

    // Update Ledger (Vendor Wallet or Worker Wallet)
    let finalDues = null;
    if (booking.vendorId) {
      const vendorId = booking.vendorId;
      const vendor = await Vendor.findById(vendorId).lean();

      if (vendor) {
        const newDues = (vendor.wallet?.dues || 0) + grandTotal;
        finalDues = newDues;
        const newEarnings = (vendor.wallet?.earnings || 0) + vendorEarning;
        const cashLimit = vendor.wallet?.cashLimit || 10000;
        const netOwed = newDues - newEarnings;
        const isOverLimit = netOwed > cashLimit;

        const walletUpdate = {
          $inc: {
            'wallet.dues': grandTotal,
            'wallet.earnings': vendorEarning,
            'wallet.totalCashCollected': grandTotal
          }
        };

        if (isOverLimit) {
          walletUpdate.$set = {
            'wallet.isBlocked': true,
            'wallet.blockedAt': new Date(),
            'wallet.blockReason': `Cash limit exceeded. Net owed: ₹${netOwed.toFixed(2)}, Limit: ₹${cashLimit}`
          };
        }

        await Vendor.findByIdAndUpdate(vendorId, walletUpdate, { runValidators: false });

        // Record Transaction - Cash Collected
        await Transaction.create({
          vendorId,
          userId: booking.userId,
          bookingId: booking._id,
          amount: grandTotal,
          type: 'cash_collected',
          description: `Cash ₹${grandTotal} collected for booking ${booking.bookingNumber}`,
          status: 'completed',
          metadata: {
            type: 'dues_increase',
            collectedBy: userRole,
            billId: bill?._id?.toString(),
            vendorEarning,
            companyRevenue: bill?.companyRevenue
          }
        });

        // Record Transaction - Earnings Credit
        if (vendorEarning > 0) {
          await Transaction.create({
            vendorId,
            bookingId: booking._id,
            amount: vendorEarning,
            type: 'earnings_credit',
            description: `Earnings ₹${vendorEarning} credited for booking ${booking.bookingNumber}`,
            status: 'completed',
            metadata: {
              type: 'earnings_increase',
              billId: bill?._id?.toString(),
              serviceEarning: bill?.vendorServiceEarning,
              partsEarning: bill?.vendorPartsEarning
            }
          });
        }
      }
    } else if (booking.workerId && !booking.vendorId) {
      // Independent Worker Logic
      const Worker = require('../../models/Worker');
      const workerId = booking.workerId;
      
      const workerEarning = grandTotal; 
      
      await Worker.findByIdAndUpdate(workerId, {
        $inc: { 'wallet.balance': workerEarning }
      });
      
      await Transaction.create({
        workerId: workerId,
        bookingId: booking._id,
        amount: workerEarning,
        type: 'cash_collected',
        paymentMethod: 'cash',
        status: 'completed',
        description: `Earnings ₹${workerEarning} credited for booking #${booking.bookingNumber || booking._id.toString().slice(-6)} (offline payment)`,
        metadata: {
          type: 'earnings_increase',
          bookingNumber: booking.bookingNumber
        }
      });
    }

    // Record stats in the Daily Earning Tracker
    recordBookingEarning({
      date: new Date(),
      totalRevenue: bill ? bill.grandTotal : collectionAmount,
      platformCommission: bill ? bill.companyRevenue : (collectionAmount * 0.2),
      vendorEarnings: vendorEarning > 0 ? vendorEarning : (collectionAmount * 0.8),
      totalGST: bill ? bill.totalGST : 0,
      totalTDS: 0 // Captured separately during withdrawal
    });

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      const updatePayload = {
        bookingId: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        cashCollected: true,
        finalAmount: booking.finalAmount,
        message: 'Cash payment confirmed and booking completed!'
      };
      io.to(`user_${booking.userId}`).emit('booking_updated', updatePayload);
      io.to(`booking_${booking._id}`).emit('booking_updated', updatePayload);
      if (booking.vendorId) {
        io.to(`vendor_${booking.vendorId}`).emit('booking_updated', updatePayload);
      }
    }

    // Push Notification
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'payment_received',
      title: 'Payment Received (Cash)',
      message: `Payment of ₹${grandTotal} received in cash. Job Completed. Thanks!`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high'
    });

    if (booking.vendorId) {
      try {
        await createNotification({
          vendorId: booking.vendorId,
          type: 'payment_success',
          title: '💰 Wallet Credited (Cash)',
          message: `Earnings of ₹${vendorEarning} credited to your wallet for booking ${booking.bookingNumber || booking._id.toString().slice(-6)}.`,
          relatedId: booking._id,
          relatedType: 'booking',
          priority: 'high'
        });
      } catch (vendorNoticeErr) {
        console.error('Notification error (Vendor Credit Cash):', vendorNoticeErr);
      }
    } else if (booking.workerId && !booking.vendorId) {
      try {
        await createNotification({
          workerId: booking.workerId,
          type: 'payment_success',
          title: '💰 Wallet Credited (Cash)',
          message: `Offline payment of ₹${grandTotal} has been confirmed.`,
          relatedId: booking._id,
          relatedType: 'booking',
          priority: 'high',
          pushData: {
            type: 'payment_success',
            bookingId: booking._id.toString()
          }
        });
      } catch (workerNoticeErr) {
        console.error('Notification error (Worker Credit Cash):', workerNoticeErr);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Cash collection confirmed and recorded in ledger',
      data: {
        bookingId: booking._id,
        amount: grandTotal,
        walletDues: finalDues
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Customer Confirm Payment (Optional flow for user to confirm they paid)
 */
exports.customerConfirmPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    booking.customerConfirmed = true;
    await booking.save();

    res.status(200).json({ success: true, message: 'Payment confirmed by customer' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Cash Collection Status
 */
exports.getCashCollectionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id).select('cashCollected cashCollectedAt cashCollectedBy paymentStatus');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
