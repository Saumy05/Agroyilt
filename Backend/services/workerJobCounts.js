'use strict';

/**
 * Jobs a worker has been hired for / finished, counted from the real records.
 * The counters kept on the Worker document are not updated by the farmer-hiring flow, so they stay at 0 for those jobs.
 *  - farmer jobs: IndWorkerAssignment (cancelled ones do not count; done = completed or settled)
 *  - other jobs (vendor team / older bookings): Booking, leaving out the mirror bookings of farmer jobs (counted above)
 * The stored counter still wins when it is higher, so nothing counted elsewhere ever drops.
 */
const IndWorkerAssignment = require('../models/IndWorkerAssignment');
const Booking = require('../models/Booking');

const workerJobCounts = async (worker) => {
  const workerId = worker._id;
  const [hired, finished, otherTotal, otherDone] = await Promise.all([
    IndWorkerAssignment.countDocuments({ workerId, assignmentStatus: { $in: ['CONFIRMED', 'COMPLETED'] } }),
    IndWorkerAssignment.countDocuments({ workerId, $or: [{ assignmentStatus: 'COMPLETED' }, { settlementStatus: 'SETTLED' }] }),
    Booking.countDocuments({ workerId, status: { $nin: ['cancelled', 'rejected'] }, workerRequestId: { $in: [null] }, bookingNumber: { $not: /^WRK-/ } }),
    Booking.countDocuments({ workerId, status: { $in: ['completed', 'work_done'] }, workerRequestId: { $in: [null] }, bookingNumber: { $not: /^WRK-/ } })
  ]);
  return {
    totalJobs: Math.max(Number(worker.totalJobs) || 0, hired + otherTotal),
    completedJobs: Math.max(Number(worker.completedJobs) || 0, finished + otherDone)
  };
};

module.exports = { workerJobCounts };
