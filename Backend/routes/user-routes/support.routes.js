const express = require('express');
const router = express.Router();
const {
  createTicket,
  getMyTickets,
  getTicketById,
  addTicketMessage,
  reopenTicket,
  getUnreadSupportCount,
  submitQuery
} = require('../../controllers/commonControllers/supportController');
const { authenticate } = require('../../middleware/authMiddleware');

// Customer Support Ticket Routes (Accessible by User, Vendor, Worker)
router.post('/tickets', authenticate, createTicket);
router.get('/tickets/my', authenticate, getMyTickets);
router.get('/tickets/:ticketId', authenticate, getTicketById);
router.post('/tickets/:ticketId/messages', authenticate, addTicketMessage);
router.post('/tickets/:ticketId/reopen', authenticate, reopenTicket);
router.get('/unread-count', authenticate, getUnreadSupportCount);

// Legacy backward-compatibility route
router.post('/submit', authenticate, submitQuery);

module.exports = router;
