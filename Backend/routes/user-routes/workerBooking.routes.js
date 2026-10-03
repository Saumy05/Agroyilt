const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isUser } = require('../../middleware/roleMiddleware');

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
router.post('/farmer-worker-request',                        authenticate, isUser, fwr.createFarmerRequest);
router.get('/farmer-worker-requests',                        authenticate, isUser, fwr.getMyFarmerRequests);
router.get('/farmer-worker-request/:id',                     authenticate, isUser, fwr.getFarmerRequestById);
router.post('/farmer-worker-request/:id/select-workers',     authenticate, isUser, fwr.farmerSelectWorkers);
router.post('/farmer-worker-request/:id/create-payment',     authenticate, isUser, fwr.createWorkerBookingPayment);
router.post('/farmer-worker-request/:id/verify-payment',     authenticate, isUser, fwr.verifyWorkerBookingPayment);
router.post('/farmer-worker-request/:id/confirm-cash',       authenticate, isUser, fwr.confirmWorkerBookingCash);
router.post('/farmer-worker-request/:id/confirm',            authenticate, isUser, fwr.confirmWorkerBookingCash);
router.post('/farmer-worker-request/:id/assignment/:assignmentId/completion-otp', authenticate, isUser, fwr.generateFarmerCompletionOtp);
router.delete('/farmer-worker-request/:id',                  authenticate, isUser, fwr.cancelFarmerRequest);
router.post('/farmer-worker-request/:id/cancel',             authenticate, isUser, fwr.cancelFarmerRequest);

// ── DAILY BOOKING ROUTES ───────────────────────────────────────────────────
router.post('/farmer-worker-request/:id/decrease-worker',                                  authenticate, isUser, fwr.decreaseWorker);
router.post('/farmer-worker-request/:id/add-workers',                                      authenticate, isUser, fwr.addExtraWorkers);
router.post('/farmer-worker-request/:id/assignment/:assignmentId/daily-visit-otp',         authenticate, isUser, fwr.getOrCreateDailyVisitOtp);
router.post('/farmer-worker-request/:id/assignment/:assignmentId/daily-completion-otp',    authenticate, isUser, fwr.generateDailyCompletionOtp);
router.post('/farmer-worker-request/:id/assignment/:assignmentId/regenerate-visit-otp',    authenticate, isUser, fwr.regenerateVisitOtp);

// ── EXTENSION ROUTES (FARMER) ───────────────────────────────────────────────
router.get('/farmer-worker-request/:id/extensions',                                        authenticate, isUser, ext.getExtensions);
router.post('/farmer-worker-request/:id/extension',                                        authenticate, isUser, ext.createExtension);
router.post('/farmer-worker-request/:id/extension/:extensionId/create-payment',            authenticate, isUser, ext.createExtensionPayment);
router.post('/farmer-worker-request/:id/extension/:extensionId/payment',                   authenticate, isUser, ext.createExtensionPayment);
router.post('/farmer-worker-request/:id/extension/:extensionId/verify-payment',            authenticate, isUser, ext.verifyExtensionPayment);
router.post('/farmer-worker-request/:id/extension/:extensionId/payment/verify',            authenticate, isUser, ext.verifyExtensionPayment);

// Settlement
router.post('/booking/:id/worker-settlement', authenticate, isUser, wsc.processWorkerSettlement);

// ── Single worker discovery (kept for reference/profile browsing) ──────────
router.get('/workers',      authenticate, wb.listWorkers);

// ── Single worker request (legacy Farmer → specific Worker) ───────────────
router.post('/worker-request',                         authenticate, isUser, wb.createSingleRequest);
router.get('/worker-requests',                         authenticate, isUser, wb.getMyRequests);
router.get('/worker-request/:id',                      authenticate, isUser, wb.getRequestById);
router.patch('/worker-request/:id/respond',            authenticate, isUser, wb.farmerRespondToCounter);
router.delete('/worker-request/:id',                   authenticate, isUser, wb.cancelRequest);

// Group worker discovery
router.get('/team-leaders',           authenticate, gb.listTeamLeaders);
router.get('/team-leader/:leaderId',  authenticate, gb.getTeamLeaderDetail);

// Group request (Farmer → Team Leader)
router.post('/group-request',                          authenticate, isUser, gb.createGroupRequest);
router.get('/group-requests',                          authenticate, isUser, gb.getMyGroupRequests);
router.patch('/group-request/:id/respond',             authenticate, isUser, gb.farmerRespondToGroupCounter);
router.delete('/group-request/:id',                    authenticate, isUser, gb.cancelGroupRequest);

module.exports = router;
