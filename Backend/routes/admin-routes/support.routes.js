const express = require('express');
const router = express.Router();
const {
  getAdminTickets,
  getAdminTicketById,
  adminReplyTicket,
  adminUpdateStatus,
  adminUpdatePriority,
  adminAssignTicket,
  getAdminQueries,
  respondToQuery
} = require('../../controllers/commonControllers/supportController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

// Super Admin Support Ticket Management Endpoints
router.get('/tickets', authenticate, isAdmin, getAdminTickets);
router.get('/tickets/:ticketId', authenticate, isAdmin, getAdminTicketById);
router.post('/tickets/:ticketId/messages', authenticate, isAdmin, adminReplyTicket);
router.patch('/tickets/:ticketId/status', authenticate, isAdmin, adminUpdateStatus);
router.patch('/tickets/:ticketId/priority', authenticate, isAdmin, adminUpdatePriority);
router.patch('/tickets/:ticketId/assign', authenticate, isAdmin, adminAssignTicket);

// Legacy backward compatibility endpoints
router.get('/all', authenticate, isAdmin, getAdminQueries);
router.put('/respond/:id', authenticate, isAdmin, respondToQuery);

module.exports = router;
