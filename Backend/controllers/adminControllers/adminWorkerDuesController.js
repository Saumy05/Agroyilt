'use strict';

/**
 * Admin side of worker dues: review payments workers made to the admin outside the app (cash / UPI),
 * and record one directly when the worker paid in person without using the app.
 * Dues only change through workerDuesService.applyDuesPayment (exactly once per payment).
 */

const mongoose = require('mongoose');
const Worker = require('../../models/Worker');
const WorkerDuesPayment = require('../../models/WorkerDuesPayment');
const duesSvc = require('../../services/workerDuesService');

/** GET /api/admin/settlements/worker-dues — payments waiting for review + workers who owe money */
exports.getWorkerDues = async (req, res) => {
  try {
    const [pending, workers, recent] = await Promise.all([
      WorkerDuesPayment.find({ method: 'offline', status: 'PENDING_REVIEW' })
        .populate('workerId', 'name phone outstandingDues isRestricted').sort({ createdAt: 1 }).lean(),
      Worker.find({ outstandingDues: { $gt: 0 } })
        .select('name phone outstandingDues isRestricted restrictionReason').sort({ outstandingDues: -1 }).limit(200).lean(),
      WorkerDuesPayment.find({ status: { $in: ['PAID', 'REJECTED'] } })
        .populate('workerId', 'name phone').sort({ updatedAt: -1 }).limit(50).lean()
    ]);
    const totalDues = workers.reduce((sum, w) => sum + (Number(w.outstandingDues) || 0), 0);
    return res.json({
      success: true,
      data: { pending, workers, recent, totals: { totalDues: Math.round(totalDues * 100) / 100, workersWithDues: workers.length, pendingReview: pending.length } }
    });
  } catch (error) {
    console.error('[getWorkerDues]', error);
    return res.status(500).json({ success: false, message: 'Failed to load worker dues' });
  }
};

/** POST /api/admin/settlements/worker-dues/:paymentId/approve — the admin received the money */
exports.approveWorkerDuesPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(paymentId)) return res.status(404).json({ success: false, message: 'Payment not found' });
    const r = await duesSvc.applyDuesPayment(paymentId, {
      fromStatus: 'PENDING_REVIEW',
      set: { reviewedBy: req.user?._id || null, reviewedAt: new Date(), adminNote: String(req.body?.adminNote || '').trim() || null }
    });
    if (!r.applied) return res.status(409).json({ success: false, message: `This payment is already ${String(r.payment?.status || 'missing').toLowerCase()}.` });
    return res.json({ success: true, message: 'Payment approved and dues updated', data: r.payment });
  } catch (error) {
    console.error('[approveWorkerDuesPayment]', error);
    return res.status(500).json({ success: false, message: 'Failed to approve payment' });
  }
};

/** POST /api/admin/settlements/worker-dues/:paymentId/reject — money not received; dues stay as they are */
exports.rejectWorkerDuesPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'A reason is required so the worker knows what went wrong.' });
    if (!mongoose.Types.ObjectId.isValid(paymentId)) return res.status(404).json({ success: false, message: 'Payment not found' });
    const rejected = await WorkerDuesPayment.findOneAndUpdate(
      { _id: paymentId, status: 'PENDING_REVIEW' },
      { $set: { status: 'REJECTED', reviewedBy: req.user?._id || null, reviewedAt: new Date(), adminNote: reason } },
      { new: true }
    );
    if (!rejected) return res.status(409).json({ success: false, message: 'This payment is no longer waiting for review.' });
    duesSvc.emitWallet(rejected.workerId, 'dues_payment_rejected');
    return res.json({ success: true, message: 'Payment rejected', data: rejected });
  } catch (error) {
    console.error('[rejectWorkerDuesPayment]', error);
    return res.status(500).json({ success: false, message: 'Failed to reject payment' });
  }
};

/** POST /api/admin/settlements/worker-dues/workers/:workerId/record — the worker paid the admin in person */
exports.recordWorkerDuesPayment = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { amount, mode, reference, adminNote } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(workerId)) return res.status(404).json({ success: false, message: 'Worker not found' });
    if (!['cash', 'upi'].includes(mode)) return res.status(400).json({ success: false, message: 'Mode must be cash or upi.' });
    const worker = await Worker.findById(workerId).select('outstandingDues');
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
    const dues = Math.round((Number(worker.outstandingDues) || 0) * 100) / 100;
    const value = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(value) || value < 1) return res.status(400).json({ success: false, message: 'Enter an amount of at least ₹1.' });
    if (value > dues) return res.status(400).json({ success: false, message: `Amount cannot be more than the worker's dues (₹${dues}).` });

    const payment = await WorkerDuesPayment.create({
      workerId, amount: value, method: 'offline', status: 'PENDING_REVIEW', offlineMode: mode,
      reference: String(reference || '').trim() || null, note: 'Recorded by admin'
    });
    const r = await duesSvc.applyDuesPayment(payment._id, {
      fromStatus: 'PENDING_REVIEW',
      set: { reviewedBy: req.user?._id || null, reviewedAt: new Date(), adminNote: String(adminNote || '').trim() || null }
    });
    return res.status(201).json({ success: true, message: 'Payment recorded and dues updated', data: r.payment });
  } catch (error) {
    console.error('[recordWorkerDuesPayment]', error);
    return res.status(500).json({ success: false, message: 'Failed to record payment' });
  }
};
