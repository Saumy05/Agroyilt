'use strict';

/**
 * Offline members have no phone or login, so their Team Leader runs their jobs for them
 * (journey, Start OTP, Stop Work, End OTP). The link is Worker.managedByLeaderId, never a name or a request field.
 */
const mongoose = require('mongoose');
const Worker = require('../models/Worker');
const IndWorkerAssignment = require('../models/IndWorkerAssignment');

/** The offline members this leader manages: [{ _id, name }] */
const managedOfflineMembers = (leaderId) =>
  Worker.find({ managedByLeaderId: leaderId, isOfflineMember: true }).select('_id name').lean();

/**
 * Worker an action on assignment :id is for. The caller's own id, unless the assignment belongs to an
 * offline member the caller manages. Anything else falls through to the caller's own id, so the usual
 * "assignment not found" applies.
 */
const actingWorkerId = async (req) => {
  const callerId = String(req.user._id);
  const id = req.params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return req.user._id;
  const a = await IndWorkerAssignment.findById(id).select('workerId').lean();
  if (!a || String(a.workerId) === callerId) return req.user._id;
  const member = await Worker.findOne({ _id: a.workerId, isOfflineMember: true, managedByLeaderId: callerId }).select('_id').lean();
  return member ? a.workerId : req.user._id;
};

module.exports = { managedOfflineMembers, actingWorkerId };
