'use strict';

/**
 * "Extra worker" requests (a farmer adds workers to a running booking) are separate requests linked to the original one
 * (addOnOfRequestId). This puts the original booking's number and title next to them wherever someone sees the add-on:
 * the worker's alert, request list and job, and the admin lists, so nobody has to guess what it belongs to.
 */

const WorkerBookingRequest = require('../models/WorkerBookingRequest');
const { requestRef } = require('../utils/bookingRef');

const labelOf = (parent) => ({
  id: String(parent._id),
  bookingNumber: parent.bookingNumber || requestRef(parent._id),
  title: parent.workTitle || 'Farm work'
});

/** Map of original-request id -> { id, bookingNumber, title } for the given ids. */
const loadParentLabels = async (ids) => {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const parents = await WorkerBookingRequest.find({ _id: { $in: unique } }).select('bookingNumber workTitle').lean();
  return new Map(parents.map((p) => [String(p._id), labelOf(p)]));
};

/** The label of the booking this request is an extra worker for, or null. */
const addOnContext = async (request) => {
  if (!request || !request.addOnOfRequestId) return null;
  const map = await loadParentLabels([request.addOnOfRequestId]);
  return map.get(String(request.addOnOfRequestId)) || null;
};

/**
 * Plain copies of `items` with `addOnOf` filled in for the ones that are extra-worker requests.
 * @param {Array} items documents or plain objects
 * @param {(item) => *} parentIdOf how to read the original request's id from an item
 */
const attachAddOnOf = async (items, parentIdOf = (x) => x.addOnOfRequestId) => {
  const plain = (items || []).map((x) => (x && typeof x.toObject === 'function' ? x.toObject() : x));
  const labels = await loadParentLabels(plain.map(parentIdOf));
  return plain.map((x) => {
    const id = parentIdOf(x);
    const label = id ? labels.get(String(id)) : null;
    return label ? { ...x, addOnOf: label } : x;
  });
};

/** Like attachAddOnOf, for worker booking records (they point to their request through workerRequestId). */
const attachAddOnOfToBookings = async (bookings) => {
  const plain = (bookings || []).map((x) => (x && typeof x.toObject === 'function' ? x.toObject() : x));
  const requestIds = [...new Set(plain.map((b) => b.workerRequestId).filter(Boolean).map(String))];
  if (!requestIds.length) return plain;
  const reqs = await WorkerBookingRequest.find({ _id: { $in: requestIds }, addOnOfRequestId: { $ne: null } }).select('addOnOfRequestId').lean();
  const parentOf = new Map(reqs.map((r) => [String(r._id), r.addOnOfRequestId]));
  const labels = await loadParentLabels([...parentOf.values()]);
  return plain.map((b) => {
    const label = b.workerRequestId ? labels.get(String(parentOf.get(String(b.workerRequestId)))) : null;
    return label ? { ...b, addOnOf: label } : b;
  });
};

module.exports = { attachAddOnOfToBookings, addOnContext, attachAddOnOf, loadParentLabels };
