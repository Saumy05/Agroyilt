const SupportTicket = require('../../models/SupportTicket');
const SupportMessage = require('../../models/SupportMessage');
const SupportQuery = require('../../models/SupportQuery');
const Dispute = require('../../models/Dispute');
const Booking = require('../../models/Booking');
const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
const AdminAuditLog = require('../../models/AdminAuditLog');
const { createNotification } = require('../notificationControllers/notificationController');
const claims = require('../../services/supportClaimService');

/**
 * Customers (farmers / vendors / workers) see support agents by FIRST NAME only.
 * Never expose an agent's full name or admin id; applied when reading, so older tickets are covered too.
 */
const supportFirstName = (name) => String(name || '').trim().split(/\s+/)[0] || null;

const toCustomerTicket = (ticket) => {
  const plain = typeof ticket.toObject === 'function' ? ticket.toObject() : { ...ticket };
  delete plain.assignedTo;
  plain.assignedAdminName = supportFirstName(plain.assignedAdminName);
  return plain;
};

const toCustomerMessage = (msg) => {
  const plain = typeof msg.toObject === 'function' ? msg.toObject() : { ...msg };
  if (plain.senderType !== 'ADMIN') return plain;
  delete plain.senderId;
  plain.senderName = supportFirstName(plain.senderName) || 'AgroYilt Support';
  return plain;
};

/**
 * Helper to determine user role and model
 */
const resolveSenderInfo = (req) => {
  const userId = req.user?._id || req.userId;
  let role = (req.userRole || req.user?.role || 'USER').toUpperCase();
  let model = 'User';

  if (role === 'VENDOR' || req.user?.businessName !== undefined) {
    role = 'VENDOR';
    model = 'Vendor';
  } else if (role === 'WORKER' || req.user?.serviceCategory !== undefined || req.user?.serviceCategories !== undefined) {
    role = 'WORKER';
    model = 'Worker';
  } else if (['ADMIN', 'SUPER_ADMIN'].includes(role) || req.user?.permissions !== undefined) {
    role = role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN';
    model = 'Admin';
  } else {
    role = 'USER';
    model = 'User';
  }

  const name = req.user?.name || req.body?.name || (role === 'VENDOR' ? 'Vendor Partner' : role === 'WORKER' ? 'Field Worker' : 'Farmer');
  const email = req.user?.email || req.body?.email || '';
  const phone = req.user?.phone || req.body?.phone || '';

  return { userId, role, model, name, email, phone };
};

/**
 * Customer / Partner: Create a new support ticket
 * POST /api/support/tickets
 */
const createTicket = async (req, res) => {
  try {
    const { subject, category, description, bookingId, bookingNumber, transactionId, attachments, priority } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Subject is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Description is required' });
    }

    const { userId, role, model, name, email, phone } = resolveSenderInfo(req);

    // Generate unique human-readable ticket number (e.g. AGY-2026-10245)
    const ticketNumber = await SupportTicket.generateTicketNumber();

    const ticket = await SupportTicket.create({
      ticketNumber,
      createdByUserId: userId,
      createdByModel: model,
      createdByRole: role,
      name,
      email,
      phone,
      subject: subject.trim(),
      category: category || 'OTHER',
      description: description.trim(),
      bookingId: bookingId || null,
      bookingNumber: bookingNumber || null,
      transactionId: transactionId || null,
      attachments: Array.isArray(attachments) ? attachments : [],
      status: 'OPEN',
      priority: priority || 'MEDIUM',
      lastMessage: description.trim(),
      lastMessageSender: 'USER',
      lastMessageAt: new Date(),
      unreadAdminCount: 1,
      unreadUserCount: 0
    });

    // Create initial conversation message
    await SupportMessage.create({
      ticketId: ticket._id,
      senderId: userId,
      senderRole: role,
      senderType: 'CUSTOMER',
      senderName: name,
      message: description.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      isInternalNote: false
    });

    // Sync legacy SupportQuery document for complete backward compatibility
    try {
      if (model === 'User') {
        await SupportQuery.create({
          userId,
          name,
          email: email || `${phone}@agroyilt.internal`,
          subject: subject.trim(),
          message: description.trim(),
          status: 'pending'
        });
      }
    } catch (legacyErr) {
      console.warn('[Support] Legacy sync notice:', legacyErr.message);
    }

    // Emit realtime event to admins
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        io.to('admin_global').emit('new_support_ticket', {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          role: ticket.createdByRole,
          name: ticket.name
        });
      }
    } catch (sockErr) {
      // Non-blocking
    }

    return res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully',
      data: ticket
    });
  } catch (error) {
    console.error('Create support ticket error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create support ticket. Please try again.'
    });
  }
};

/**
 * Customer / Partner: Get my support tickets (paginated)
 * GET /api/support/tickets/my
 */
const getMyTickets = async (req, res) => {
  try {
    const userId = req.user?._id || req.userId;
    const { page = 1, limit = 20, status, category } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Strict IDOR protection: only tickets created by this authenticated user
    const filter = { createdByUserId: userId };
    if (status && status !== 'ALL') {
      filter.status = status.toUpperCase();
    }
    if (category && category !== 'ALL') {
      filter.category = category.toUpperCase();
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupportTicket.countDocuments(filter)
    ]);

    // Calculate unread count for user
    const unreadCount = await SupportTicket.aggregate([
      { $match: { createdByUserId: userId } },
      { $group: { _id: null, totalUnread: { $sum: '$unreadUserCount' } } }
    ]);

    return res.status(200).json({
      success: true,
      data: {
        tickets: tickets.map(toCustomerTicket),
        unreadCount: unreadCount[0]?.totalUnread || 0,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1
        }
      }
    });
  } catch (error) {
    console.error('Get my support tickets error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to load your support requests. Please try again.'
    });
  }
};

/**
 * Customer / Partner: Get single ticket detail + conversation
 * GET /api/support/tickets/:ticketId
 */
const getTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user?._id || req.userId;
    const role = (req.userRole || req.user?.role || '').toUpperCase();
    const isAdministrative = ['ADMIN', 'SUPER_ADMIN'].includes(role) || req.user?.permissions !== undefined;

    // Support lookup by MongoDB _id or human-readable ticketNumber
    const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }

    // Strict IDOR check: if not admin, must be ticket owner
    if (!isAdministrative && ticket.createdByUserId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this ticket' });
    }

    // Message query: NEVER show internal notes to customers
    const messageFilter = { ticketId: ticket._id };
    if (!isAdministrative) {
      messageFilter.isInternalNote = false;
    }

    const messages = await SupportMessage.find(messageFilter)
      .sort({ createdAt: 1 })
      .lean();

    // Mark as read when customer views their ticket
    if (!isAdministrative && ticket.unreadUserCount > 0) {
      ticket.unreadUserCount = 0;
      await ticket.save();

      await SupportMessage.updateMany(
        { ticketId: ticket._id, senderType: 'ADMIN', readAt: null },
        { $set: { readAt: new Date() } }
      );
    }

    return res.status(200).json({
      success: true,
      data: isAdministrative
        ? { ticket, messages }
        : { ticket: toCustomerTicket(ticket), messages: messages.map(toCustomerMessage) }
    });
  } catch (error) {
    console.error('Get ticket detail error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load ticket conversation'
    });
  }
};

/**
 * Customer / Partner: Reply to an existing ticket
 * POST /api/support/tickets/:ticketId/messages
 */
const addTicketMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message, attachments } = req.body;
    const { userId, role, name } = resolveSenderInfo(req);

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required' });
    }

    const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }

    // IDOR check: customer must own the ticket
    if (ticket.createdByUserId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'You are not authorized to reply to this ticket' });
    }

    if (ticket.status === 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'This ticket is closed. Please submit a new request or reopen the ticket.'
      });
    }

    const newMsg = await SupportMessage.create({
      ticketId: ticket._id,
      senderId: userId,
      senderRole: role,
      senderType: 'CUSTOMER',
      senderName: name,
      message: message.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      isInternalNote: false
    });

    // Transition status: if waiting for user, transition back to IN_PROGRESS
    if (ticket.status === 'WAITING_FOR_USER' || ticket.status === 'RESOLVED') {
      ticket.status = 'IN_PROGRESS';
    }

    ticket.lastMessage = message.trim();
    ticket.lastMessageSender = 'USER';
    ticket.lastMessageAt = new Date();
    ticket.unreadAdminCount = (ticket.unreadAdminCount || 0) + 1;
    await ticket.save();

    // Realtime notification to admins
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        io.to('admin_global').emit('support_user_reply', {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          message: newMsg
        });
      }
    } catch (sockErr) {
      // Non-blocking
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMsg
    });
  } catch (error) {
    console.error('Customer reply error:', error);
    return res.status(500).json({
      success: false,
      message: 'Your message could not be sent. Please check your internet connection and try again.'
    });
  }
};

/**
 * Customer / Partner: Reopen a resolved ticket
 * POST /api/support/tickets/:ticketId/reopen
 */
const reopenTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { reason } = req.body;
    const { userId, role, name } = resolveSenderInfo(req);

    const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (ticket.createdByUserId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'Only resolved or closed tickets can be reopened.'
      });
    }

    // Abuse prevention: limit reopen cycles
    if (ticket.reopenCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'This ticket has reached the maximum reopen limit. Please submit a new request.'
      });
    }

    ticket.status = 'IN_PROGRESS';
    ticket.reopenCount = (ticket.reopenCount || 0) + 1;
    ticket.lastMessage = reason ? `Reopened: ${reason.trim()}` : 'Ticket reopened by customer';
    ticket.lastMessageSender = 'USER';
    ticket.lastMessageAt = new Date();
    ticket.unreadAdminCount = (ticket.unreadAdminCount || 0) + 1;
    await ticket.save();

    const reopenMsg = await SupportMessage.create({
      ticketId: ticket._id,
      senderId: userId,
      senderRole: role,
      senderType: 'CUSTOMER',
      senderName: name,
      message: reason ? `[Ticket Reopened] ${reason.trim()}` : '[Ticket Reopened by Customer]',
      isInternalNote: false
    });

    return res.status(200).json({
      success: true,
      message: 'Ticket reopened successfully',
      data: { ticket: toCustomerTicket(ticket), message: reopenMsg }
    });
  } catch (error) {
    console.error('Reopen ticket error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reopen ticket'
    });
  }
};

/**
 * Customer / Partner: Get unread support count
 * GET /api/support/unread-count
 */
const getUnreadSupportCount = async (req, res) => {
  try {
    const userId = req.user?._id || req.userId;
    if (!userId) {
      return res.status(200).json({ success: true, unreadCount: 0 });
    }

    const result = await SupportTicket.aggregate([
      { $match: { createdByUserId: userId, unreadUserCount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$unreadUserCount' } } }
    ]);

    return res.status(200).json({
      success: true,
      unreadCount: result[0]?.total || 0
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    return res.status(200).json({ success: true, unreadCount: 0 });
  }
};

// ========================================================
// SUPER ADMIN SUPPORT TICKET MANAGEMENT
// ========================================================

/**
 * Admin: List all tickets with search, filters & pagination
 * GET /api/admin/support/tickets
 */
const getAdminTickets = async (req, res) => {
  try {
    const {
      status, role, category, priority, search, view, agent,
      page = 1, limit = 20
    } = req.query;

    // Untouched URGENT claims go back to the queue (lazy: runs whenever the queue is opened)
    await claims.releaseStaleUrgent().catch(() => {});

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    // Queue tabs: unassigned | mine | waiting. No view = everything (read-only overview).
    Object.assign(filter, claims.viewFilter(view, req.user) || {});
    // Supervisor filter: one agent's open and waiting tickets
    if (agent && claims.isSuperAdmin(req.user) && /^[0-9a-fA-F]{24}$/.test(String(agent))) {
      filter.assignedTo = agent;
      if (!status || status === 'ALL') filter.status = { $in: [...claims.ACTIVE_STATUSES, 'WAITING_FOR_USER'] };
    }
    if (status && status !== 'ALL' && !filter.status) {
      filter.status = status.toUpperCase();
    }
    if (role && role !== 'ALL') {
      filter.createdByRole = role.toUpperCase();
    }
    if (category && category !== 'ALL') {
      filter.category = category.toUpperCase();
    }
    if (priority && priority !== 'ALL') {
      filter.priority = priority.toUpperCase();
    }

    if (search && search.trim()) {
      const term = search.trim();
      filter.$or = [
        { ticketNumber: { $regex: term, $options: 'i' } },
        { subject: { $regex: term, $options: 'i' } },
        { name: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } }
      ];
    }

    const [tickets, total, statusStats] = await Promise.all([
      SupportTicket.find(filter)
        .populate('assignedTo', 'name email')
        .sort(view === 'unassigned' ? { createdAt: 1 } : { lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupportTicket.countDocuments(filter),
      SupportTicket.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const stats = {
      open: 0,
      in_progress: 0,
      waiting_for_user: 0,
      resolved: 0,
      closed: 0,
      total: 0
    };

    statusStats.forEach(item => {
      const key = (item._id || '').toLowerCase();
      if (stats[key] !== undefined) {
        stats[key] = item.count;
      }
      stats.total += item.count;
    });

    // Unclaimed queue: oldest first, URGENT/HIGH on top
    if (view === 'unassigned') {
      tickets.sort((a, b) => (claims.PRIORITY_RANK[a.priority] ?? 2) - (claims.PRIORITY_RANK[b.priority] ?? 2));
    }
    const queue = await claims.queueCounts(req.user);

    return res.status(200).json({
      success: true,
      data: {
        tickets: tickets.map((t) => ({ ...t, viewer: claims.viewerFlags(t, req.user) })),
        stats,
        queue,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1
        }
      }
    });
  } catch (error) {
    console.error('Admin get tickets error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch support tickets'
    });
  }
};

/**
 * Admin: Get complete ticket details + full conversation (including internal notes)
 * GET /api/admin/support/tickets/:ticketId
 */
const getAdminTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query)
      .populate('assignedTo', 'name email phone')
      .populate('bookingId')
      .populate('workerRequestId', 'bookingNumber status workTitle requiredWorkers totalAmount')
      .populate('disputeId', 'reason status priority resolutionType createdAt');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Admins see all messages including internal notes
    const messages = await SupportMessage.find({ ticketId: ticket._id })
      .sort({ createdAt: 1 })
      .lean();

    // Mark admin unread as read
    if (ticket.unreadAdminCount > 0) {
      ticket.unreadAdminCount = 0;
      await ticket.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        ticket,
        messages,
        viewer: claims.viewerFlags(ticket, req.user),
        queue: await claims.queueCounts(req.user)
      }
    });
  } catch (error) {
    console.error('Admin get ticket detail error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket conversation'
    });
  }
};

/**
 * Admin: Reply to ticket OR add internal note
 * POST /api/admin/support/tickets/:ticketId/messages
 */
const adminReplyTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message, isInternalNote = false, status, attachments } = req.body;
    const adminUser = req.user;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message cannot be empty' });
    }

    const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const senderName = adminUser.name || 'AgroYilt Support';
    const isInternal = Boolean(isInternalNote);

    // Replying to the customer needs ownership; internal notes stay open to the whole team
    if (!isInternal) {
      const guard = claims.actionGuard(ticket, adminUser);
      if (guard) return res.status(guard.status).json({ success: false, message: guard.message });
    } else if (ticket.assignedTo && String(ticket.assignedTo) === String(adminUser._id)) {
      ticket.claimedAt = new Date(); // owner activity keeps an URGENT claim from going stale
      await ticket.save();
    }

    const supportMsg = await SupportMessage.create({
      ticketId: ticket._id,
      senderId: adminUser._id,
      senderRole: 'ADMIN',
      senderType: isInternal ? 'INTERNAL_NOTE' : 'ADMIN',
      senderName,
      message: message.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      isInternalNote: isInternal
    });

    if (isInternal) {
      // Internal note: do not notify user, do not change user unread count
      if (AdminAuditLog && typeof AdminAuditLog.log === 'function') {
        await AdminAuditLog.log({
          adminId: adminUser._id,
          adminName: adminUser.name || 'Admin',
          adminEmail: adminUser.email || '',
          adminRole: adminUser.role || 'ADMIN',
          action: 'SUPPORT_TICKET_INTERNAL_NOTE',
          module: 'SUPPORT',
          targetId: ticket._id,
          targetModel: 'SupportTicket',
          targetName: ticket.ticketNumber,
          details: { message: message.trim() },
          req
        }).catch(err => console.warn('[AuditLog] Error:', err.message));
      }

      return res.status(201).json({
        success: true,
        message: 'Internal note added successfully',
        data: supportMsg
      });
    }

    // Public Admin Reply to customer
    ticket.lastMessage = message.trim();
    ticket.lastMessageSender = 'ADMIN';
    ticket.lastMessageAt = new Date();
    ticket.lastRepliedAt = new Date();
    ticket.unreadUserCount = (ticket.unreadUserCount || 0) + 1;

    // Status transition: if OPEN -> IN_PROGRESS, or custom status requested
    if (status && ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED'].includes(status.toUpperCase())) {
      ticket.status = status.toUpperCase();
      if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
        ticket.closedAt = new Date();
      }
    } else if (ticket.status === 'OPEN') {
      ticket.status = 'IN_PROGRESS';
    }

    await ticket.save();

    // 1. In-app Notification to customer
    const recipientKey = ticket.createdByRole === 'VENDOR'
      ? { vendorId: ticket.createdByUserId }
      : ticket.createdByRole === 'WORKER'
        ? { workerId: ticket.createdByUserId }
        : { userId: ticket.createdByUserId };

    await createNotification({
      ...recipientKey,
      type: 'support_ticket_reply',
      title: 'Support replied to your request',
      message: `${supportFirstName(adminUser.name) ? `${supportFirstName(adminUser.name)} from AgroYilt Support` : 'AgroYilt Support'} replied to ticket #${ticket.ticketNumber}`,
      relatedId: ticket._id,
      relatedType: 'support_ticket',
      data: {
        ticketId: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        role: ticket.createdByRole
      }
    });

    // 2. Realtime socket event to user
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        const room = `${ticket.createdByRole.toLowerCase()}_${ticket.createdByUserId.toString()}`;
        io.to(room).emit('ticket_reply', {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          message: toCustomerMessage(supportMsg),
          status: ticket.status
        });
      }
    } catch (sockErr) {
      // Non-blocking
    }

    // 3. Admin Audit Log
    if (AdminAuditLog && typeof AdminAuditLog.log === 'function') {
      await AdminAuditLog.log({
        adminId: adminUser._id,
        adminName: adminUser.name || 'Admin',
        adminEmail: adminUser.email || '',
        adminRole: adminUser.role || 'ADMIN',
        action: 'SUPPORT_TICKET_REPLIED',
        module: 'SUPPORT',
        targetId: ticket._id,
        targetModel: 'SupportTicket',
        targetName: ticket.ticketNumber,
        details: { message: message.trim(), newStatus: ticket.status },
        req
      }).catch(err => console.warn('[AuditLog] Error:', err.message));
    }

    return res.status(201).json({
      success: true,
      message: 'Response sent successfully',
      data: supportMsg,
      ticketStatus: ticket.status
    });
  } catch (error) {
    console.error('Admin reply error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send response'
    });
  }
};

/**
 * Admin: Update ticket status
 * PATCH /api/admin/support/tickets/:ticketId/status
 */
const adminUpdateStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;
    const adminUser = req.user;

    const validStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'WAITING_FOR_ADMIN', 'RESOLVED', 'CLOSED'];
    if (!status || !validStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: `Valid status required: ${validStatuses.join(', ')}`
      });
    }

    const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const guard = claims.actionGuard(ticket, adminUser);
    if (guard) return res.status(guard.status).json({ success: false, message: guard.message });

    const oldStatus = ticket.status;
    const newStatus = status.toUpperCase();

    ticket.status = newStatus;
    if (newStatus === 'RESOLVED' || newStatus === 'CLOSED') {
      ticket.closedAt = new Date();
    } else {
      ticket.closedAt = null;
    }

    await ticket.save();

    // Create system message in conversation
    await SupportMessage.create({
      ticketId: ticket._id,
      senderId: adminUser._id,
      senderRole: 'ADMIN',
      senderType: 'ADMIN',
      senderName: 'System',
      message: `Ticket status updated from ${oldStatus} to ${newStatus}`,
      isInternalNote: false
    });

    // Notify user of status change
    const recipientKey = ticket.createdByRole === 'VENDOR'
      ? { vendorId: ticket.createdByUserId }
      : ticket.createdByRole === 'WORKER'
        ? { workerId: ticket.createdByUserId }
        : { userId: ticket.createdByUserId };

    await createNotification({
      ...recipientKey,
      type: 'support_ticket_status',
      title: 'Support Request Status Updated',
      message: `Your support request #${ticket.ticketNumber} is now ${newStatus.replace(/_/g, ' ').toLowerCase()}.`,
      relatedId: ticket._id,
      relatedType: 'support_ticket',
      data: {
        ticketId: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        status: newStatus
      }
    });

    // Audit log
    if (AdminAuditLog && typeof AdminAuditLog.log === 'function') {
      await AdminAuditLog.log({
        adminId: adminUser._id,
        adminName: adminUser.name || 'Admin',
        adminEmail: adminUser.email || '',
        adminRole: adminUser.role || 'ADMIN',
        action: 'SUPPORT_TICKET_STATUS_CHANGED',
        module: 'SUPPORT',
        targetId: ticket._id,
        targetModel: 'SupportTicket',
        targetName: ticket.ticketNumber,
        details: { oldStatus, newStatus },
        req
      }).catch(err => console.warn('[AuditLog] Error:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: `Ticket status changed to ${newStatus}`,
      data: ticket
    });
  } catch (error) {
    console.error('Update status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update ticket status'
    });
  }
};

/**
 * Admin: Update ticket priority
 * PATCH /api/admin/support/tickets/:ticketId/priority
 */
const adminUpdatePriority = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { priority } = req.body;
    const adminUser = req.user;

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    if (!priority || !validPriorities.includes(priority.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Valid priority required: LOW, MEDIUM, HIGH, URGENT' });
    }

    const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const guard = claims.actionGuard(ticket, adminUser);
    if (guard) return res.status(guard.status).json({ success: false, message: guard.message });

    ticket.priority = priority.toUpperCase();
    await ticket.save();

    if (AdminAuditLog && typeof AdminAuditLog.log === 'function') {
      await AdminAuditLog.log({
        adminId: adminUser._id,
        adminName: adminUser.name || 'Admin',
        adminEmail: adminUser.email || '',
        adminRole: adminUser.role || 'ADMIN',
        action: 'SUPPORT_TICKET_PRIORITY_CHANGED',
        module: 'SUPPORT',
        targetId: ticket._id,
        targetModel: 'SupportTicket',
        targetName: ticket.ticketNumber,
        details: { newPriority: ticket.priority },
        req
      }).catch(err => console.warn('[AuditLog] Error:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: `Priority updated to ${ticket.priority}`,
      data: ticket
    });
  } catch (error) {
    console.error('Update priority error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update priority' });
  }
};

/**
 * Admin: Assign ticket to an admin
 * PATCH /api/admin/support/tickets/:ticketId/assign
 */
/**
 * Super admin: what each support agent is holding
 * GET /api/admin/support/team
 */
const getSupportTeam = async (req, res) => {
  try {
    if (!claims.isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Only a super admin can see the team overview.' });
    }
    return res.status(200).json({ success: true, data: await claims.teamOverview() });
  } catch (error) {
    console.error('Support team overview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load the team overview' });
  }
};

/** Resolve :ticketId (mongo id or AGY- number) to the ticket's _id */
const resolveTicketId = async (ticketId) => {
  const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
  const t = await SupportTicket.findOne(query).select('_id').lean();
  return t?._id || null;
};

const auditClaim = (req, action, ticket, details = {}) => {
  if (!AdminAuditLog || typeof AdminAuditLog.log !== 'function') return Promise.resolve();
  const a = req.user;
  return AdminAuditLog.log({
    adminId: a._id, adminName: a.name || 'Admin', adminEmail: a.email || '', adminRole: a.role || 'ADMIN',
    action, module: 'SUPPORT', targetId: ticket._id, targetModel: 'SupportTicket', targetName: ticket.ticketNumber,
    details, req
  }).catch(err => console.warn('[AuditLog] Error:', err.message));
};

const claimResponse = (res, ticket, message) => res.status(200).json({ success: true, message, data: ticket });
const claimError = (res, error, fallback) => {
  if (!error.status) console.error(fallback, error);
  return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : fallback });
};

/**
 * Admin: claim an unclaimed ticket (first agent wins)
 * POST /api/admin/support/tickets/:ticketId/claim
 */
const adminClaimTicket = async (req, res) => {
  try {
    const id = await resolveTicketId(req.params.ticketId);
    if (!id) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const ticket = await claims.claimTicket(id, req.user);
    await auditClaim(req, 'SUPPORT_TICKET_CLAIMED', ticket);
    return claimResponse(res, ticket, 'Ticket claimed');
  } catch (error) {
    return claimError(res, error, 'Failed to claim ticket');
  }
};

/**
 * Admin: put a claimed ticket back in the shared queue (owner or super admin)
 * POST /api/admin/support/tickets/:ticketId/release
 */
const adminReleaseTicket = async (req, res) => {
  try {
    const id = await resolveTicketId(req.params.ticketId);
    if (!id) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const ticket = await claims.releaseTicket(id, req.user);
    await auditClaim(req, 'SUPPORT_TICKET_RELEASED', ticket);
    return claimResponse(res, ticket, 'Ticket returned to the queue');
  } catch (error) {
    return claimError(res, error, 'Failed to release ticket');
  }
};

/**
 * Admin: reassign a ticket to another agent (owner or super admin)
 * PATCH /api/admin/support/tickets/:ticketId/assign   body: { adminId }
 */
const adminAssignTicket = async (req, res) => {
  try {
    const id = await resolveTicketId(req.params.ticketId);
    if (!id) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const ticket = await claims.reassignTicket(id, req.user, req.body?.adminId);
    await auditClaim(req, 'SUPPORT_TICKET_ASSIGNED', ticket, { assignedTo: ticket.assignedTo, assignedAdminName: ticket.assignedAdminName });
    return claimResponse(res, ticket, `Ticket assigned to ${ticket.assignedAdminName}`);
  } catch (error) {
    return claimError(res, error, 'Failed to assign ticket');
  }
};

// ========================================================
// LANE BRIDGING: TICKET <-> DISPUTE CONVERSION & LINKING
// ========================================================

/**
 * Admin: Convert a Support Ticket to a Dispute (Lane Bridging)
 * POST /api/admin/support/tickets/:ticketId/convert-to-dispute
 */
const convertToDispute = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const adminUser = req.user;
    const {
      bookingDomain = 'VENDOR_BOOKING',
      bookingId,
      bookingNumber,
      workerRequestId,
      reason,
      description,
      priority
    } = req.body;

    const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (ticket.disputeId) {
      const existing = await Dispute.findById(ticket.disputeId).lean();
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `This ticket is already linked to Dispute #${existing._id}`,
          data: { disputeId: existing._id, dispute: existing }
        });
      }
    }

    // Resolve booking based on domain
    let vendorBooking = null;
    let workerReq = null;

    if (bookingDomain === 'VENDOR_BOOKING') {
      const bId = bookingId || ticket.bookingId;
      const bNum = (bookingNumber || ticket.bookingNumber || '').trim();
      if (bId) {
        vendorBooking = await Booking.findById(bId);
      } else if (bNum) {
        vendorBooking = await Booking.findOne({ bookingNumber: bNum });
      }

      if (!vendorBooking) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid Machinery Booking ID or Booking Number'
        });
      }
    } else if (bookingDomain === 'WORKER_BOOKING') {
      const wId = workerRequestId || ticket.workerRequestId;
      const wNum = (bookingNumber || ticket.bookingNumber || '').trim();
      if (wId) {
        workerReq = await WorkerBookingRequest.findById(wId);
      } else if (wNum) {
        workerReq = await WorkerBookingRequest.findOne({ bookingNumber: wNum });
      }

      if (!workerReq) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid Worker Booking Request ID or Booking Number'
        });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid bookingDomain. Must be VENDOR_BOOKING or WORKER_BOOKING' });
    }

    // Determine raiser model & role
    const raiserId = ticket.createdByUserId;
    const raiserModel = ['User', 'Vendor', 'Worker'].includes(ticket.createdByModel) ? ticket.createdByModel : 'User';
    const raiserRole = ticket.createdByRole === 'VENDOR' ? 'VENDOR' : (ticket.createdByRole === 'WORKER' ? 'WORKER' : 'FARMER');

    // Check if an open dispute already exists for this booking & user
    const dupQuery = {
      raisedBy: raiserId,
      bookingDomain
    };
    if (bookingDomain === 'VENDOR_BOOKING') dupQuery.vendorBookingId = vendorBooking._id;
    if (bookingDomain === 'WORKER_BOOKING') dupQuery.workerRequestId = workerReq._id;

    let dispute = await Dispute.findOne({
      ...dupQuery,
      status: { $nin: ['RESOLVED', 'DISMISSED', 'resolved', 'dismissed'] }
    });

    const isNew = !dispute;

    const validReasons = [
      'Quality Issue', 'Delay / Late Arrival', 'Payment Dispute', 'No Show',
      'Poor Driver Behavior', 'OTP Refusal', 'Work Not Completed', 'Worker Absent',
      'Underpayment', 'Overbilling', 'Other'
    ];
    const validatedReason = validReasons.includes(reason) ? reason : 'Other';
    const validatedPriority = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)
      ? priority
      : (['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(ticket.priority) ? ticket.priority : 'HIGH');

    const descText = (description || ticket.description || '').trim() || `${ticket.subject}: ${ticket.description}`;

    if (dispute) {
      // Link to existing dispute
      dispute.sourceTicketId = ticket._id;
      dispute.sourceTicketNumber = ticket.ticketNumber;
      dispute.auditLog.push({
        performedBy: adminUser._id,
        adminName: adminUser.name || 'Admin',
        action: 'LINKED_TO_SUPPORT_TICKET',
        notes: `Lane Bridging: Linked to Support Ticket #${ticket.ticketNumber}`,
        timestamp: new Date()
      });
      await dispute.save();
    } else {
      // Transfer attachments as evidence
      const evidence = (ticket.attachments || []).map((url, idx) => ({
        uploadedBy: raiserId,
        uploaderModel: raiserModel,
        uploaderRole: raiserRole,
        url,
        fileType: 'image',
        caption: `Transferred from Support Ticket #${ticket.ticketNumber} (Attachment ${idx + 1})`,
        uploadedAt: new Date()
      }));

      dispute = await Dispute.create({
        bookingDomain,
        vendorBookingId: bookingDomain === 'VENDOR_BOOKING' ? vendorBooking._id : null,
        workerRequestId: bookingDomain === 'WORKER_BOOKING' ? workerReq._id : null,
        raisedBy: raiserId,
        raisedByModel: raiserModel,
        raisedByRole: raiserRole,
        reason: validatedReason,
        description: descText,
        evidence,
        attachments: ticket.attachments || [],
        status: 'OPEN',
        priority: validatedPriority,
        sourceTicketId: ticket._id,
        sourceTicketNumber: ticket.ticketNumber,
        auditLog: [{
          performedBy: adminUser._id,
          adminName: adminUser.name || 'Admin',
          action: 'CONVERTED_FROM_SUPPORT_TICKET',
          previousStatus: 'TICKET',
          newStatus: 'OPEN',
          notes: `Lane Bridging: Converted from Support Ticket #${ticket.ticketNumber} ("${ticket.subject}")`,
          timestamp: new Date()
        }]
      });
    }

    // Update the support ticket
    ticket.disputeId = dispute._id;
    ticket.convertedToDispute = true;
    ticket.convertedAt = new Date();
    ticket.convertedBy = adminUser._id;
    if (bookingDomain === 'VENDOR_BOOKING') {
      ticket.bookingId = vendorBooking._id;
      ticket.bookingNumber = vendorBooking.bookingNumber || ticket.bookingNumber;
    } else {
      ticket.workerRequestId = workerReq._id;
      ticket.bookingNumber = workerReq.bookingNumber || ticket.bookingNumber;
    }

    if (ticket.status === 'OPEN') {
      ticket.status = 'IN_PROGRESS';
    }
    await ticket.save();

    // Create system message in conversation thread
    await SupportMessage.create({
      ticketId: ticket._id,
      senderId: adminUser._id,
      senderRole: 'ADMIN',
      senderType: 'ADMIN',
      senderName: 'System',
      message: `⚔️ [Lane Bridged] Ticket converted to Dispute #${dispute._id} (${dispute.reason}). Legal & financial investigation is active in Dispute Management.`,
      isInternalNote: false
    });

    // Notify customer
    const recipientKey = ticket.createdByRole === 'VENDOR'
      ? { vendorId: ticket.createdByUserId }
      : ticket.createdByRole === 'WORKER'
        ? { workerId: ticket.createdByUserId }
        : { userId: ticket.createdByUserId };

    await createNotification({
      ...recipientKey,
      type: 'dispute_update',
      title: 'Dispute Case Opened',
      message: `Your support request #${ticket.ticketNumber} has been transitioned to an official Dispute case (#${dispute._id}). Our arbitration team will review the booking.`,
      relatedId: dispute._id,
      relatedType: 'Dispute',
      data: { disputeId: dispute._id.toString(), ticketId: ticket._id.toString() }
    });

    // Notify admin socket room
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        io.to('admin_global').emit('new_dispute', {
          disputeId: dispute._id,
          bookingDomain: dispute.bookingDomain,
          reason: dispute.reason,
          priority: dispute.priority,
          raisedByRole: dispute.raisedByRole,
          sourceTicketNumber: ticket.ticketNumber,
          createdAt: dispute.createdAt
        });
      }
    } catch (_) {}

    // Audit log
    if (AdminAuditLog && typeof AdminAuditLog.log === 'function') {
      await AdminAuditLog.log({
        adminId: adminUser._id,
        adminName: adminUser.name || 'Admin',
        adminEmail: adminUser.email || '',
        adminRole: adminUser.role || 'ADMIN',
        action: 'SUPPORT_TICKET_CONVERTED_TO_DISPUTE',
        module: 'SUPPORT',
        targetId: ticket._id,
        targetModel: 'SupportTicket',
        targetName: ticket.ticketNumber,
        details: { disputeId: dispute._id, bookingDomain, isNew },
        req
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: isNew ? 'Ticket successfully converted to Dispute' : 'Ticket linked to existing open Dispute',
      data: {
        ticket,
        dispute
      }
    });

  } catch (error) {
    console.error('Convert to dispute error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to convert ticket to dispute'
    });
  }
};

/**
 * Admin: Link an existing Dispute to a Support Ticket
 * POST /api/admin/support/tickets/:ticketId/link-dispute
 */
const linkDispute = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { disputeId } = req.body;
    const adminUser = req.user;

    if (!disputeId) {
      return res.status(400).json({ success: false, message: 'disputeId is required' });
    }

    const query = ticketId.startsWith('AGY-') ? { ticketNumber: ticketId.toUpperCase() } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    ticket.disputeId = dispute._id;
    ticket.convertedToDispute = true;
    ticket.convertedAt = ticket.convertedAt || new Date();
    ticket.convertedBy = ticket.convertedBy || adminUser._id;
    await ticket.save();

    dispute.sourceTicketId = ticket._id;
    dispute.sourceTicketNumber = ticket.ticketNumber;
    dispute.auditLog.push({
      performedBy: adminUser._id,
      adminName: adminUser.name || 'Admin',
      action: 'LINKED_TO_SUPPORT_TICKET',
      notes: `Lane Bridging: Linked to Support Ticket #${ticket.ticketNumber}`,
      timestamp: new Date()
    });
    await dispute.save();

    await SupportMessage.create({
      ticketId: ticket._id,
      senderId: adminUser._id,
      senderRole: 'ADMIN',
      senderType: 'ADMIN',
      senderName: 'System',
      message: `⚔️ [Lane Bridged] Ticket linked to Dispute #${dispute._id} (${dispute.reason}).`,
      isInternalNote: false
    });

    return res.status(200).json({
      success: true,
      message: 'Ticket and Dispute successfully linked',
      data: { ticket, dispute }
    });
  } catch (error) {
    console.error('Link dispute error:', error);
    return res.status(500).json({ success: false, message: 'Failed to link dispute' });
  }
};

// ========================================================
// LEGACY BACKWARD COMPATIBILITY HANDLERS
// ========================================================

const submitQuery = async (req, res) => {
  // Delegate directly to the new createTicket controller
  return createTicket(req, res);
};

const getAdminQueries = async (req, res) => {
  return getAdminTickets(req, res);
};

const respondToQuery = async (req, res) => {
  const { id } = req.params;
  req.params.ticketId = id;
  req.body.isInternalNote = false;
  return adminReplyTicket(req, res);
};

module.exports = {
  // Customer & Partner endpoints
  createTicket,
  getMyTickets,
  getTicketById,
  addTicketMessage,
  reopenTicket,
  getUnreadSupportCount,

  // Super Admin endpoints
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

  // Legacy compatibility exports
  submitQuery,
  getAdminQueries,
  respondToQuery
};
