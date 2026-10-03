const crypto = require('crypto');
const mongoose = require('mongoose');
const Wallet = require('../../models/Wallet');
const WalletTransaction = require('../../models/WalletTransaction');
const PaymentWebhookLog = require('../../models/PaymentWebhookLog');
const Booking = require('../../models/Booking');

exports.razorpayWebhook = async (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || (isProd ? null : 'test_secret'); // dev-only fallback
  const signature = req.headers['x-razorpay-signature'];

  // 1. Log incoming raw payload immediately
  const logEntry = new PaymentWebhookLog({
    provider: 'razorpay',
    eventType: req.body.event || 'unknown',
    rawPayload: req.body,
    signatureValid: false,
    processedStatus: 'received'
  });

  try {
    // We expect raw body for signature validation. If express.json() is parsing it, 
    // we need to use JSON.stringify or configure a custom middleware for raw body.
    // For this phase, assuming JSON.stringify works as the payload is clean.
    const expectedSignature = crypto
      .createHmac('sha256', secret || 'unset')
      .update(JSON.stringify(req.body))
      .digest('hex');

    // Fail closed: production without a configured secret, or ANY configured secret with a bad signature, is rejected.
    const mustVerify = isProd || !!process.env.RAZORPAY_WEBHOOK_SECRET;
    const validSignature = !!secret && typeof signature === 'string' && signature.length === expectedSignature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    if (!secret || (mustVerify && !validSignature)) {
      logEntry.errorDetails = secret ? 'Invalid signature' : 'Webhook secret not configured';
      await logEntry.save();
      return res.status(400).send('Invalid signature');
    }
    
    logEntry.signatureValid = true;

    // 3. Extract data and enforce Idempotency
    const event = req.body.event;
    
    if (event !== 'payment.captured') {
      logEntry.processedStatus = 'processed';
      logEntry.errorDetails = 'Ignored event type';
      await logEntry.save();
      return res.status(200).send('OK');
    }

    const paymentEntity = req.body.payload.payment.entity;
    const gatewayTransactionId = paymentEntity.id;

    // Check if this payment is for Registration Fee
    const isRegFee = paymentEntity.notes?.paymentType === 'REGISTRATION_FEE' || paymentEntity.notes?.paymentRecordId;
    if (isRegFee) {
      const RegistrationFeePayment = require('../../models/RegistrationFeePayment');
      const User = require('../../models/User');
      const Vendor = require('../../models/Vendor');
      const Worker = require('../../models/Worker');
      const referralService = require('../../services/referralService');

      let paymentRecord = null;
      if (paymentEntity.notes?.paymentRecordId) {
        paymentRecord = await RegistrationFeePayment.findById(paymentEntity.notes.paymentRecordId);
      }
      if (!paymentRecord && paymentEntity.order_id) {
        paymentRecord = await RegistrationFeePayment.findOne({ gatewayOrderId: paymentEntity.order_id });
      }

      if (paymentRecord) {
        if (paymentRecord.status !== 'PAID') {
          paymentRecord.status = 'PAID';
          paymentRecord.gatewayPaymentId = gatewayTransactionId;
          paymentRecord.paidAt = new Date();
          await paymentRecord.save();

          const getModel = (r) => (r === 'USER' ? User : r === 'VENDOR' ? Vendor : Worker);
          const Model = getModel(paymentRecord.role);
          const account = await Model.findById(paymentRecord.accountId);
          if (account) {
            account.registrationFeeStatus = 'PAID';
            account.registrationFeeAmount = paymentRecord.amount;
            account.registrationFeeVersion = paymentRecord.feeVersion;
            account.registrationFeePaymentId = paymentRecord._id;
            await account.save();
          }
        }

        // Trigger referral qualification (idempotent, concurrency-safe)
        await referralService.qualifyAndRewardReferral({
          referredUserId: paymentRecord.accountId,
          event: 'REGISTRATION_FEE_PAYMENT',
          paymentId: paymentRecord._id,
          gatewayPaymentId: gatewayTransactionId,
          paymentRecord
        });

        logEntry.processedStatus = 'processed';
        await logEntry.save();
        return res.status(200).send('OK');
      }
    }

    // ── Independent-worker bookings / extensions: same single-shot path as POST .../verify-payment ──
    // (covers the app dying after the farmer paid; whichever of verify / webhook arrives first wins)
    if (paymentEntity.order_id) {
      const workerOutcome = await require('../../services/workerPaymentWebhook').handleCapturedPayment({
        orderId: paymentEntity.order_id, paymentId: gatewayTransactionId, amountPaise: Number(paymentEntity.amount) || 0
      });
      if (workerOutcome.handled) {
        logEntry.processedStatus = workerOutcome.retry ? 'failed' : 'processed';
        if (workerOutcome.note) logEntry.errorDetails = workerOutcome.note;
        await logEntry.save();
        return res.status(workerOutcome.retry ? 500 : 200).send(workerOutcome.retry ? 'Retry' : 'OK');
      }
    }

    const bookingId = paymentEntity.notes?.bookingId; 
    
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      logEntry.processedStatus = 'failed';
      logEntry.errorDetails = 'No (valid) bookingId or registration fee details in payment notes';
      await logEntry.save();
      return res.status(200).send('OK'); // Return 200 so RP stops retrying
    }

    // ── Mark the booking paid through the SAME idempotent path as POST /payments/verify ──
    // (covers the app crashing after paying; whichever of verify/webhook arrives first wins)
    try {
      const { applyOnlinePayment } = require('../../services/bookingSettlementService');
      const Transaction = require('../../models/Transaction');
      if (mongoose.Types.ObjectId.isValid(bookingId)) {
        const claimed = await Booking.findOneAndUpdate(
          { _id: bookingId, processedPaymentIds: { $ne: gatewayTransactionId } },
          { $push: { processedPaymentIds: gatewayTransactionId } },
          { new: true }
        );
        if (claimed) {
          const amountRupees = Math.round(Number(paymentEntity.amount) || 0) / 100;
          const { booking: paidBooking } = await applyOnlinePayment(claimed._id, {
            amount: amountRupees, method: 'razorpay', paymentRef: gatewayTransactionId, io: req.app.get('io')
          });
          await Transaction.create({
            userId: paidBooking.userId, bookingId: paidBooking._id, amount: amountRupees, type: 'payment',
            paymentMethod: 'razorpay', status: 'completed',
            description: `Online payment for booking ${paidBooking.bookingNumber} (gateway webhook)`,
            referenceId: gatewayTransactionId
          });
        }
      }
    } catch (applyErr) {
      console.error('[Webhook] Failed to apply booking payment:', applyErr);
      logEntry.processedStatus = 'failed';
      logEntry.errorDetails = `apply failed: ${applyErr.message}`;
      await logEntry.save();
      return res.status(500).send('Internal Server Error'); // let Razorpay retry
    }

    const idempotencyKey = `razorpay_${event}_${gatewayTransactionId}`;

    const existingTx = await WalletTransaction.findOne({ idempotencyKey: idempotencyKey + '_vendor' });
    if (existingTx) {
      logEntry.processedStatus = 'ignored_duplicate';
      await logEntry.save();
      return res.status(200).send('OK');
    }

    // 4. Atomic Wallet Updates
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const booking = await Booking.findById(bookingId).session(session);
      if (!booking || !booking.vendorId) {
        // Nothing to credit on the vendor ledger (unknown booking / independent-worker job).
        // The booking payment itself was already applied above, so acknowledge to stop retries.
        await session.abortTransaction();
        session.endSession();
        logEntry.processedStatus = booking ? 'processed' : 'failed';
        logEntry.errorDetails = booking ? 'No vendor on booking: vendor ledger not credited' : 'Booking not found';
        await logEntry.save();
        return res.status(200).send('OK');
      }

      // Amounts in paise
      const totalAmountPaise = paymentEntity.amount; 
      const commissionPercent = parseInt(process.env.PLATFORM_COMMISSION_PERCENT || '10', 10);
      const commissionAmount = Math.floor((totalAmountPaise * commissionPercent) / 100);
      const vendorShare = totalAmountPaise - commissionAmount;

      let vendorWallet = await Wallet.findOne({ userId: booking.vendorId, userModel: 'Vendor' }).session(session);
      if (!vendorWallet) {
        vendorWallet = new Wallet({ userId: booking.vendorId, userModel: 'Vendor', balance: 0 });
      }

      const vendorTx = new WalletTransaction({
        walletId: vendorWallet._id,
        type: 'credit',
        amount: vendorShare,
        reason: 'booking_payment',
        referenceId: bookingId,
        gatewayTransactionId,
        idempotencyKey: idempotencyKey + '_vendor',
        status: 'completed'
      });
      await vendorTx.save({ session });
      
      vendorWallet.balance += vendorShare;
      await vendorWallet.save({ session });

      await session.commitTransaction();
      session.endSession();

      logEntry.processedStatus = 'processed';
      await logEntry.save();

      return res.status(200).send('OK');

    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      // A concurrent duplicate delivery of the same event can collide on the ledger write.
      // If the other delivery already recorded it, this one is a harmless duplicate.
      const isConflict = err.code === 112 || /write conflict|unable to acquire/i.test(err.message || '');
      if (isConflict) {
        // The winning delivery commits within a few ms; poll briefly for its ledger entry.
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise(r => setTimeout(r, 150));
          const done = await WalletTransaction.findOne({ idempotencyKey: idempotencyKey + '_vendor' });
          if (done) {
            logEntry.processedStatus = 'ignored_duplicate';
            await logEntry.save();
            return res.status(200).send('OK');
          }
        }
      }
      throw err;
    }
  } catch (error) {
    console.error('Webhook error:', error);
    logEntry.processedStatus = 'failed';
    logEntry.errorDetails = error.message;
    await logEntry.save();
    return res.status(500).send('Internal Server Error');
  }
};
