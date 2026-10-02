const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');

const wb  = require('../../controllers/workerControllers/workerBookingController');
const gb  = require('../../controllers/workerControllers/groupBookingController');
const fwr = require('../../controllers/workerControllers/farmerWorkerRequestController');
const wsc = require('../../controllers/workerControllers/workerSettlementController');
const tc  = require('../../controllers/bookingControllers/trackingController');
const ext = require('../../controllers/workerControllers/extensionController');

// ── Public / User-auth routes ──────────────────────────────────────────────

// ── MULTI-WORKER LIVE TRACKING (NEW) ───────────────────────────────────────
router.get('/tracking/:id',                                  authenticate, tc.getTrackingSnapshot);
router.get('/booking/:id/tracking',                          authenticate, tc.getTrackingSnapshot);
router.get('/farmer-worker-request/:id/tracking',            authenticate, tc.getTrackingSnapshot);

// ── FARMER-FIRST BROADCAST REQUEST ROUTES (NEW) ────────────────────────────
router.post('/farmer-worker-request',                        authenticate, fwr.createFarmerRequest);
router.get('/farmer-worker-requests',                        authenticate, fwr.getMyFarmerRequests);
router.get('/farmer-worker-request/:id',                     authenticate, fwr.getFarmerRequestById);
router.post('/farmer-worker-request/:id/select-workers',     authenticate, fwr.farmerSelectWorkers);
router.post('/farmer-worker-request/:id/create-payment',     authenticate, fwr.createWorkerBookingPayment);
router.post('/farmer-worker-request/:id/verify-payment',     authenticate, fwr.verifyWorkerBookingPayment);
router.post('/farmer-worker-request/:id/confirm-cash',       authenticate, fwr.confirmWorkerBookingCash);
router.post('/farmer-worker-request/:id/confirm',            authenticate, fwr.confirmWorkerBookingCash);
router.post('/farmer-worker-request/:id/assignment/:assignmentId/completion-otp', authenticate, fwr.generateFarmerCompletionOtp);
router.delete('/farmer-worker-request/:id',                  authenticate, fwr.cancelFarmerRequest);

// ── DAILY BOOKING ROUTES ───────────────────────────────────────────────────
router.post('/farmer-worker-request/:id/decrease-worker',                                  authenticate, fwr.decreaseWorker);
router.post('/farmer-worker-request/:id/assignment/:assignmentId/daily-visit-otp',         authenticate, fwr.getOrCreateDailyVisitOtp);
router.post('/farmer-worker-request/:id/assignment/:assignmentId/daily-completion-otp',    authenticate, fwr.generateDailyCompletionOtp);

// ── EXTENSION ROUTES (FARMER) ───────────────────────────────────────────────
router.post('/farmer-worker-request/:id/extension',                                        authenticate, ext.createExtension);
router.post('/farmer-worker-request/:id/extension/:extensionId/create-payment',            authenticate, ext.createExtensionPayment);
router.post('/farmer-worker-request/:id/extension/:extensionId/payment',                   authenticate, ext.createExtensionPayment);
router.post('/farmer-worker-request/:id/extension/:extensionId/verify-payment',            authenticate, ext.verifyExtensionPayment);
router.post('/farmer-worker-request/:id/extension/:extensionId/payment/verify',            authenticate, ext.verifyExtensionPayment);

// Settlement
router.post('/booking/:id/worker-settlement', authenticate, wsc.processWorkerSettlement);

// ── Single worker discovery (kept for reference/profile browsing) ──────────
router.get('/workers',      authenticate, wb.listWorkers);

// ── Single worker request (legacy Farmer → specific Worker) ───────────────
router.post('/worker-request',                         authenticate, wb.createSingleRequest);
router.get('/worker-requests',                         authenticate, wb.getMyRequests);
router.get('/worker-request/:id',                      authenticate, wb.getRequestById);
router.patch('/worker-request/:id/respond',            authenticate, wb.farmerRespondToCounter);
router.delete('/worker-request/:id',                   authenticate, wb.cancelRequest);

// Group worker discovery
router.get('/team-leaders',           authenticate, gb.listTeamLeaders);
router.get('/team-leader/:leaderId',  authenticate, gb.getTeamLeaderDetail);

// Group request (Farmer → Team Leader)
router.post('/group-request',                          authenticate, gb.createGroupRequest);
router.get('/group-requests',                          authenticate, gb.getMyGroupRequests);
router.patch('/group-request/:id/respond',             authenticate, gb.farmerRespondToGroupCounter);
router.delete('/group-request/:id',                    authenticate, gb.cancelGroupRequest);

module.exports = router;
