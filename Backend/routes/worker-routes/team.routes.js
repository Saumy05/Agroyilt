const express = require('express');
const router = express.Router();
const teamController = require('../../controllers/workerControllers/teamController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');

// Base path: /api/workers/team

// 1. Get my team (Worker or Team Leader)
router.get('/me', authenticate, isWorker, teamController.getMyTeam);

// 2. Team Leader: Search eligible workers
router.get('/eligible-workers', authenticate, isWorker, teamController.searchEligibleWorkers);

// 3. Team Requests (Incoming & Outgoing)
router.get('/requests', authenticate, isWorker, teamController.getRequests);

// 4. Send Team Request (Worker Join or Team Merge)
router.post('/requests', authenticate, isWorker, teamController.sendRequest);

// 5. Accept Request
router.post('/requests/:id/accept', authenticate, isWorker, teamController.acceptRequest);

// 6. Reject Request
router.post('/requests/:id/reject', authenticate, isWorker, teamController.rejectRequest);

// 7. Cancel Request (Sender)
router.post('/requests/:id/cancel', authenticate, isWorker, teamController.cancelRequest);

// 8. Leave Team (Worker)
router.post('/leave', authenticate, isWorker, teamController.leaveTeam);

// 9. Remove Member (Team Leader)
router.post('/remove', authenticate, isWorker, teamController.removeMember);

// 10. Public Profile DTO
router.get('/public-profile/:workerId', authenticate, isWorker, teamController.getPublicProfile);

// 11. Upgrade to Team Leader
router.post('/upgrade-to-leader', authenticate, isWorker, teamController.upgradeToLeader);

// 12. Add Offline Member (A6)
router.post('/offline-member', authenticate, isWorker, teamController.addOfflineMember);

module.exports = router;

