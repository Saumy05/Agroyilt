const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');

const wb  = require('../../controllers/workerControllers/workerBookingController');
const gb  = require('../../controllers/workerControllers/groupBookingController');
const fwr = require('../../controllers/workerControllers/farmerWorkerRequestController');

// ── Worker-side single booking request routes ──────────────────────────────
router.get('/booking-requests',              authenticate, isWorker, wb.getWorkerIncomingRequests);
router.patch('/booking-request/:id/respond', authenticate, isWorker, wb.workerRespondToRequest);

// ── Worker-side: respond to farmer broadcast request (NEW) ─────────────────
router.get('/farmer-requests/pending',         authenticate, isWorker, fwr.getWorkerPendingFarmerRequests);
router.get('/farmer-requests/member-invites',  authenticate, isWorker, fwr.getMemberInvites);
router.patch('/farmer-request/:id/respond',    authenticate, isWorker, fwr.workerRespondToFarmerRequest);
router.patch('/farmer-request/:id/member-respond', authenticate, isWorker, fwr.memberRespondToRequest);

// ── Team Leader group booking routes ──────────────────────────────────────
router.get('/group-requests',                         authenticate, isWorker, gb.getLeaderGroupRequests);
router.get('/group-requests/member-invites',          authenticate, isWorker, fwr.getMemberInvites);
router.patch('/group-request/:id/respond',            authenticate, isWorker, gb.leaderRespondToRequest);
router.post('/group-request/:id/dispatch-members',   authenticate, isWorker, gb.dispatchToMembers);
router.get('/group-request/:id/members',              authenticate, isWorker, gb.getMemberResponses);
router.patch('/group-request/:id/select-workers',     authenticate, isWorker, gb.leaderSelectWorkers);
router.patch('/group-request/:id/member-respond',     authenticate, isWorker, fwr.memberRespondToRequest);

module.exports = router;
