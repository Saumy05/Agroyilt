'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const wac = require('../../controllers/workerControllers/workerAssignmentController');
const ext = require('../../controllers/workerControllers/extensionController');

// Worker Assignment Lifecycle Routes
router.get('/my-assignments',             authenticate, isWorker, wac.getMyAssignments);
router.get('/:id',                        authenticate, wac.getAssignmentDetails);
router.post('/:id/start-journey',         authenticate, isWorker, wac.startJourney);
router.post('/:id/arrived',               authenticate, isWorker, wac.markArrived);
router.post('/:id/verify-visit-otp',      authenticate, isWorker, wac.verifyVisitOtp);
router.post('/:id/start-break',           authenticate, isWorker, wac.startBreak);
router.post('/:id/resume-break',          authenticate, isWorker, wac.resumeBreak);
router.post('/:id/cancel',                authenticate, isWorker, wac.workerWithdraw);
router.post('/:id/submit-proof',          authenticate, isWorker, wac.submitProof);
router.post('/:id/verify-completion-otp', authenticate, isWorker, wac.verifyCompletionOtp);
router.patch('/:id/location',             authenticate, isWorker, wac.updateLocation);

// Dedicated DAILY Lifecycle Routes
router.post('/:id/daily/start-day',             authenticate, isWorker, wac.startDailyDay);
router.post('/:id/daily/arrived',               authenticate, isWorker, wac.markDailyArrived);
router.post('/:id/daily/verify-visit-otp',      authenticate, isWorker, wac.verifyDailyVisitOtp);
router.post('/:id/daily/submit-proof',          authenticate, isWorker, wac.submitProof);
router.post('/:id/daily/verify-completion-otp', authenticate, isWorker, wac.verifyDailyCompletionOtp);

// Worker Extension Response
router.post('/extension/:extensionId/respond', authenticate, isWorker, ext.respondToExtension);

module.exports = router;
