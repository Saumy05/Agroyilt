const mongoose = require('mongoose');
const PayoutRequest = require('../../models/PayoutRequest');
const Wallet = require('../../models/Wallet');
const WalletTransaction = require('../../models/WalletTransaction');
const PaymentWebhookLog = require('../../models/PaymentWebhookLog');
const { notifySafe } = require('../../services/adminActionNotifier');

exports.getPendingPayouts = async (req, res) => {
  try {
    const status = req.query.status || 'requested';
    const payouts = await PayoutRequest.find({ status })
      .populate('vendorId', 'name mobile')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: payouts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch payouts' });
  }
};

exports.approvePayout = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const adminId = req.user.id;
    const { id } = req.params;

    const payoutReq = await PayoutRequest.findById(id).session(session);
    if (!payoutReq || payoutReq.status !== 'requested') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Invalid or already processed payout request' });
    }

    // Re-verify balance
    const wallet = await Wallet.findOne({ userId: payoutReq.vendorId, userModel: 'Vendor' }).session(session);
    if (!wallet || wallet.balance < payoutReq.amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Insufficient balance to approve this payout' });
    }

    // Debit Wallet Atomically
    wallet.balance -= payoutReq.amount;
    await wallet.save({ session });

    const debitTx = new WalletTransaction({
      walletId: wallet._id,
      type: 'debit',
      amount: payoutReq.amount,
      reason: 'payout',
      referenceId: payoutReq._id.toString(),
      idempotencyKey: `payout_debit_${payoutReq._id}`,
      status: 'completed'
    });
    await debitTx.save({ session });

    payoutReq.status = 'admin_approved';
    payoutReq.approvedBy = adminId;
    await payoutReq.save({ session });

    await session.commitTransaction();
    session.endSession();

    await notifySafe({
      vendorId: payoutReq.vendorId, type: 'payout_processed', relatedId: payoutReq._id, relatedType: 'payout',
      title: 'Payout approved', message: `Your payout of ₹${payoutReq.amount} was approved and is being sent to your account.`
    });

    // STUB: RazorpayX Payout API call should happen asynchronously here in a worker queue.
    // Stubbing this for now until RazorpayX is activated.
    setTimeout(async () => {
       try {
         // Fake processing delay
         await PayoutRequest.findByIdAndUpdate(payoutReq._id, { status: 'completed', processedAt: new Date() });
         console.log(`[Payout] Payout ${payoutReq._id} marked as completed via stub.`);
       } catch (e) {
         console.error('Stub payout error:', e);
       }
    }, 2000);

    res.status(200).json({ success: true, message: 'Payout approved successfully (RazorpayX stubbed)' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: 'Failed to approve payout' });
  }
};

exports.rejectPayout = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const payoutReq = await PayoutRequest.findOneAndUpdate(
      { _id: id, status: 'requested' },
      { status: 'admin_rejected', approvedBy: adminId, rejectionReason: reason || 'Rejected by admin' },
      { new: true }
    );

    if (!payoutReq) return res.status(404).json({ success: false, message: 'Payout not found or not pending' });

    await notifySafe({
      vendorId: payoutReq.vendorId, type: 'payout_rejected', relatedId: payoutReq._id, relatedType: 'payout',
      title: 'Payout not approved', message: `Your payout of ₹${payoutReq.amount} was not approved. Reason: ${payoutReq.rejectionReason}`
    });

    res.status(200).json({ success: true, message: 'Payout rejected successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to reject payout' });
  }
};

exports.getReconciliationReport = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);

    const successfulWebhooks = await PaymentWebhookLog.countDocuments({ 
      processedStatus: 'processed', 
      createdAt: { $gte: startOfDay } 
    });

    const failedWebhooks = await PaymentWebhookLog.countDocuments({ 
      processedStatus: 'failed', 
      createdAt: { $gte: startOfDay } 
    });

    const ledgerCredits = await WalletTransaction.aggregate([
      { $match: { type: 'credit', createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        date: startOfDay,
        webhooks: { successful: successfulWebhooks, failed: failedWebhooks },
        ledger: { 
          totalCreditsPaise: ledgerCredits[0]?.total || 0,
          creditCount: ledgerCredits[0]?.count || 0
        },
        mismatches: (successfulWebhooks !== (ledgerCredits[0]?.count || 0)) ? ['Webhook count does not match ledger credit count'] : []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
};
