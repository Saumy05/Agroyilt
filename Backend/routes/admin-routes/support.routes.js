const express = require('express');
const router = express.Router();
const {
  getAdminTickets,
  getAdminTicketById,
  adminReplyTicket,
  adminUpdateStatus,
  adminUpdatePriority,
  adminAssignTicket,
  adminClaimTicket,
  adminReleaseTicket,
  getSupportTeam,
  convertToDispute,
  linkDispute,
  getAdminQueries,
  respondToQuery
} = require('../../controllers/commonControllers/supportController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

// Super Admin Support Ticket Management Endpoints
router.get('/team', authenticate, isAdmin, getSupportTeam);
router.get('/tickets', authenticate, isAdmin, getAdminTickets);
router.get('/tickets/:ticketId', authenticate, isAdmin, getAdminTicketById);
router.post('/tickets/:ticketId/messages', authenticate, isAdmin, adminReplyTicket);
router.patch('/tickets/:ticketId/status', authenticate, isAdmin, adminUpdateStatus);
router.patch('/tickets/:ticketId/priority', authenticate, isAdmin, adminUpdatePriority);
router.patch('/tickets/:ticketId/assign', authenticate, isAdmin, adminAssignTicket);
router.post('/tickets/:ticketId/claim', authenticate, isAdmin, adminClaimTicket);
router.post('/tickets/:ticketId/release', authenticate, isAdmin, adminReleaseTicket);

// Lane Bridging: Convert or Link Ticket to Dispute
router.post('/tickets/:ticketId/convert-to-dispute', authenticate, isAdmin, convertToDispute);
router.post('/tickets/:ticketId/link-dispute', authenticate, isAdmin, linkDispute);

// Legacy backward compatibility endpoints
router.get('/all', authenticate, isAdmin, getAdminQueries);
router.put('/respond/:id', authenticate, isAdmin, respondToQuery);

module.exports = router;
