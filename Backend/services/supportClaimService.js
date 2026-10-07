'use strict';

/**
 * Support ticket claiming.
 *
 * Unclaimed tickets sit in a shared queue; the first agent to claim one owns it. Only the owner (or a super admin)
 * may reply to or change the ticket; everyone else can read it. The number of open tickets one agent can hold is a
 * super-admin setting (Settings.supportMaxOpenClaims, default 5; super admin is exempt).
 */

const SupportTicket = require('../models/SupportTicket');
const Settings = require('../models/Settings');
const Admin = require('../models/Admin');

const DEFAULT_MAX_OPEN = 5;
// An URGENT ticket claimed but untouched this long goes back to the queue (a vendor may be stuck on the field).
const URGENT_STALE_MINUTES = 30;

// Statuses that need the owner's attention: they count toward the limit and show in "Assigned to me".
const ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_ADMIN'];
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const fail = (status, message) => Object.assign(new Error(message), { status });
const isSuperAdmin = (admin) => String(admin?.role || '').toLowerCase() === 'super_admin';
const sameId = (a, b) => !!a && !!b && String(a._id || a) === String(b._id || b);
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'another agent';

const getMaxOpen = async () => {
  const s = await Settings.findOne({ type: 'global' }).select('supportMaxOpenClaims').lean();
  const n = Math.floor(Number(s?.supportMaxOpenClaims));
  return n >= 1 ? n : DEFAULT_MAX_OPEN;
};

const countOpenClaims = (adminId) => SupportTicket.countDocuments({ assignedTo: adminId, status: { $in: ACTIVE_STATUSES } });

/** Lazy stale-claim rule: no cron needed, it runs whenever someone looks at the queue. */
const releaseStaleUrgent = () => SupportTicket.updateMany(
  {
    assignedTo: { $ne: null },
    priority: 'URGENT',
    status: 'OPEN', // OPEN = the owner has not replied yet
    claimedAt: { $lt: new Date(Date.now() - URGENT_STALE_MINUTES * 60000) }
  },
  { $set: { assignedTo: null, assignedAdminName: null, claimedAt: null } }
);

const notifyCustomer = async (ticket, admin) => {
  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    const recipient = ticket.createdByRole === 'VENDOR'
      ? { vendorId: ticket.createdByUserId }
      : ticket.createdByRole === 'WORKER' ? { workerId: ticket.createdByUserId } : { userId: ticket.createdByUserId };
    await createNotification({
      ...recipient,
      type: 'support_update',
      title: 'Support is on your request',
      message: `${firstName(admin.name)} from AgroYilt Support is now handling ticket #${ticket.ticketNumber}`,
      relatedId: ticket._id,
      relatedType: 'support_ticket',
      data: { ticketId: ticket._id.toString(), ticketNumber: ticket.ticketNumber, role: ticket.createdByRole }
    });
  } catch (e) { console.warn('[supportClaim] notify failed', e.message); }
};

/** Claim an unclaimed ticket. Atomic: of two agents clicking at once, exactly one wins. */
const claimTicket = async (ticketId, admin) => {
  if (!isSuperAdmin(admin)) {
    const [open, max] = await Promise.all([countOpenClaims(admin._id), getMaxOpen()]);
    if (open >= max) {
      throw fail(409, `You already have ${open} open tickets (limit ${max}). Resolve one or ask a supervisor.`);
    }
  }

  const ticket = await SupportTicket.findOneAndUpdate(
    { _id: ticketId, assignedTo: null, status: { $nin: ['RESOLVED', 'CLOSED'] } },
    { $set: { assignedTo: admin._id, assignedAdminName: admin.name || 'Support', claimedAt: new Date() } },
    { new: true }
  );
  if (ticket) {
    await notifyCustomer(ticket, admin);
    return ticket;
  }

  const current = await SupportTicket.findById(ticketId).select('assignedTo assignedAdminName status').lean();
  if (!current) throw fail(404, 'Ticket not found');
  if (['RESOLVED', 'CLOSED'].includes(current.status)) throw fail(400, 'This ticket is already closed.');
  if (sameId(current.assignedTo, admin._id)) throw fail(409, 'You already own this ticket.');
  throw fail(409, `Already claimed by ${firstName(current.assignedAdminName)}.`);
};

/** Owner (or super admin) puts the ticket back in the shared queue. */
const releaseTicket = async (ticketId, admin) => {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw fail(404, 'Ticket not found');
  if (!ticket.assignedTo) throw fail(400, 'This ticket is not claimed.');
  if (!isSuperAdmin(admin) && !sameId(ticket.assignedTo, admin._id)) {
    throw fail(403, `Only ${firstName(ticket.assignedAdminName)} or a supervisor can release this ticket.`);
  }
  ticket.assignedTo = null;
  ticket.assignedAdminName = null;
  ticket.claimedAt = null;
  await ticket.save();
  return ticket;
};

/** Owner (or super admin) hands the ticket to another active agent. The name is read from the Admin record. */
const reassignTicket = async (ticketId, admin, targetAdminId) => {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw fail(404, 'Ticket not found');
  if (['RESOLVED', 'CLOSED'].includes(ticket.status)) throw fail(400, 'This ticket is already closed.');
  // Only the owner or a super admin can hand a ticket on; a non-owner must claim it (and pass the limit) instead.
  const guard = actionGuard(ticket, admin);
  if (guard) throw fail(guard.status, guard.message);

  const target = targetAdminId ? await Admin.findById(targetAdminId).select('name isActive').lean() : admin;
  if (!target || target.isActive === false) throw fail(400, 'That agent is not available.');

  ticket.assignedTo = target._id;
  ticket.assignedAdminName = target.name || 'Support';
  ticket.claimedAt = new Date();
  await ticket.save();
  await notifyCustomer(ticket, target);
  return ticket;
};

/** null when the admin may act on the ticket; otherwise { status, message }. Reading is never restricted. */
const actionGuard = (ticket, admin) => {
  if (isSuperAdmin(admin)) return null;
  if (!ticket.assignedTo) return { status: 409, message: 'Claim this ticket first.' };
  if (!sameId(ticket.assignedTo, admin._id)) {
    return { status: 403, message: `Claimed by ${firstName(ticket.assignedAdminName)}. Only they or a supervisor can act on it.` };
  }
  return null;
};

/** Tab filters for the admin queue. */
const viewFilter = (view, admin) => {
  switch (view) {
    case 'unassigned': return { assignedTo: null, status: { $in: ACTIVE_STATUSES } };
    case 'mine': return { assignedTo: admin._id, status: { $in: ACTIVE_STATUSES } };
    case 'waiting': return { assignedTo: admin._id, status: 'WAITING_FOR_USER' };
    default: return null;
  }
};

const queueCounts = async (admin) => {
  const [unassigned, mine, waiting, max] = await Promise.all([
    SupportTicket.countDocuments(viewFilter('unassigned', admin)),
    SupportTicket.countDocuments(viewFilter('mine', admin)),
    SupportTicket.countDocuments(viewFilter('waiting', admin)),
    getMaxOpen()
  ]);
  return { unassigned, mine, waiting, maxOpen: max, unlimited: isSuperAdmin(admin) };
};

/**
 * Supervisor overview: what each agent is holding. Agents are active admins with the support-reply permission,
 * plus anyone (e.g. a super admin) who currently holds tickets.
 */
const teamOverview = async () => {
  const held = [...ACTIVE_STATUSES, 'WAITING_FOR_USER'];
  const [maxOpen, rows] = await Promise.all([
    getMaxOpen(),
    SupportTicket.aggregate([
      { $match: { assignedTo: { $ne: null }, status: { $in: held } } },
      {
        $group: {
          _id: '$assignedTo',
          open: { $sum: { $cond: [{ $in: ['$status', ACTIVE_STATUSES] }, 1, 0] } },
          waiting: { $sum: { $cond: [{ $eq: ['$status', 'WAITING_FOR_USER'] }, 1, 0] } },
          urgent: { $sum: { $cond: [{ $and: [{ $eq: ['$priority', 'URGENT'] }, { $in: ['$status', ACTIVE_STATUSES] }] }, 1, 0] } },
          // OPEN = claimed but not replied to yet; the oldest one is who to nudge
          oldestUnrepliedAt: { $min: { $cond: [{ $eq: ['$status', 'OPEN'] }, '$claimedAt', null] } }
        }
      }
    ])
  ]);
  const byId = Object.fromEntries(rows.map((r) => [String(r._id), r]));
  const agents = await Admin.find({
    isActive: { $ne: false },
    $or: [{ 'permissions.support.reply': true }, { _id: { $in: rows.map((r) => r._id) } }]
  }).select('name role').lean();

  return {
    maxOpen,
    agents: agents
      .map((a) => {
        const r = byId[String(a._id)] || {};
        const superAdmin = isSuperAdmin(a);
        return {
          adminId: a._id,
          name: a.name,
          role: a.role,
          open: r.open || 0,
          waiting: r.waiting || 0,
          urgent: r.urgent || 0,
          oldestUnrepliedAt: r.oldestUnrepliedAt || null,
          unlimited: superAdmin,
          atLimit: !superAdmin && (r.open || 0) >= maxOpen
        };
      })
      .sort((a, b) => b.open - a.open || String(a.name).localeCompare(String(b.name)))
  };
};

const viewerFlags = (ticket, admin) => ({
  isOwner: sameId(ticket.assignedTo, admin._id),
  canAct: actionGuard(ticket, admin) === null
});

module.exports = {
  ACTIVE_STATUSES, PRIORITY_RANK, URGENT_STALE_MINUTES,
  isSuperAdmin, getMaxOpen, countOpenClaims, releaseStaleUrgent,
  claimTicket, releaseTicket, reassignTicket, actionGuard, viewFilter, queueCounts, viewerFlags, teamOverview
};
