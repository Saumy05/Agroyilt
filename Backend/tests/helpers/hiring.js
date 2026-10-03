'use strict';
/** Fixtures + API drivers for the independent-worker hiring flow (farmer ⇄ worker). */
const h = require('./harness');

let n = 0;
const phone = (p) => `${p}${String(Date.now()).slice(-8)}${++n % 10}`.slice(0, 10);

const makeWorker = (over = {}) => h.M('Worker').create({
  name: `Worker${++n}`, phone: phone('7'), status: 'ONLINE', approvalStatus: 'approved', isActive: true, wallet: { balance: 0 }, ...over
});

const tomorrow = () => { const d = new Date(Date.now() + 86400000); d.setHours(0, 0, 0, 0); return d; };

/**
 * A request that is already in `awaiting_farmer_confirmation` with `workers` having accepted
 * (offered rate `rate`). Mirrors what workerRespondToFarmerRequest leaves behind.
 */
const makeRequest = async (farmer, workers, over = {}) => {
  const Req = h.M('WorkerBookingRequest');
  return Req.create({
    farmerId: farmer._id,
    workTitle: 'Harvest wheat', workDescription: 'Harvest wheat field A',
    bookingType: 'HOURLY', scheduledDate: tomorrow(), startTime: '09:00', endTime: '13:00', durationMinutes: 240, rateUnit: 'hourly',
    minRate: 100, maxRate: 150, requiredWorkers: Math.max(1, workers.length),
    requestType: 'independent_broadcast', bookingMode: 'INDEPENDENT_WORKERS',
    status: 'awaiting_farmer_confirmation',
    location: { city: 'Pune', lat: 18.5, lng: 73.8 },
    dispatchedTo: workers.map(w => ({ workerId: w._id, status: 'accepted', respondedAt: new Date() })),
    workerOffers: workers.map(w => ({ workerId: w._id, offeredRate: over.rate || 120, status: 'pending' })),
    expiresAt: new Date(Date.now() + 6 * 3600 * 1000),
    ...over
  });
};

const asFarmer = (api, farmer) => ({
  select: (id, ids) => api.post(`/api/users/farmer-worker-request/${id}/select-workers`).set(h.auth(farmer, 'USER')).send({ selectedWorkerIds: ids.map(String) }),
  createPayment: (id) => api.post(`/api/users/farmer-worker-request/${id}/create-payment`).set(h.auth(farmer, 'USER')).send({}),
  verify: (id, orderId, sig = 'valid_sig', pay = 'pay_1') => api.post(`/api/users/farmer-worker-request/${id}/verify-payment`).set(h.auth(farmer, 'USER')).send({ razorpay_order_id: orderId, razorpay_payment_id: pay, razorpay_signature: sig }),
  cash: (id) => api.post(`/api/users/farmer-worker-request/${id}/confirm-cash`).set(h.auth(farmer, 'USER')).send({}),
  cancel: (id) => api.post(`/api/users/farmer-worker-request/${id}/cancel`).set(h.auth(farmer, 'USER')).send({})
});

const asWorker = (api, worker) => ({
  get: (path) => api.get(`/api/workers/assignments${path}`).set(h.auth(worker, 'WORKER')),
  post: (path, body = {}) => api.post(`/api/workers/assignments${path}`).set(h.auth(worker, 'WORKER')).send(body),
  respond: (id, body) => api.patch(`/api/workers/farmer-request/${id}/respond`).set(h.auth(worker, 'WORKER')).send(body)
});

const farmerWalletBalance = async (farmer) => (await h.M('Wallet').findOne({ userId: farmer._id, userModel: 'User' }))?.balance || 0;

module.exports = { makeWorker, makeRequest, asFarmer, asWorker, tomorrow, farmerWalletBalance };

// ── confirmed-booking fixtures ────────────────────────────────────────────────────────────────────
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Confirmed (cash or online) booking for `workers`, scheduled TODAY so work can start. Returns { request, assignments }. */
const confirmedBooking = async (ctx, farmer, workers, { cash = false, ...over } = {}) => {
  const r = await makeRequest(farmer, workers, { scheduledDate: today(), ...over });
  const F = asFarmer(ctx.api, farmer);
  const sel = await F.select(r._id, workers.map(w => w._id));
  if (sel.status !== 200) throw new Error('select failed ' + JSON.stringify(sel.body));
  if (cash) {
    const c = await F.cash(r._id);
    if (c.status !== 200) throw new Error('cash failed ' + JSON.stringify(c.body));
  } else {
    const o = await F.createPayment(r._id);
    const v = await F.verify(r._id, o.body.data.orderId, 'valid_sig', `pay_${r._id}`);
    if (v.status !== 200) throw new Error('verify failed ' + JSON.stringify(v.body));
  }
  const request = await h.M('WorkerBookingRequest').findById(r._id);
  const assignments = await h.M('IndWorkerAssignment').find({ parentRequestId: r._id }).select('+visitOtpHash').sort({ _id: 1 });
  return { request, assignments };
};

const secretOf = (assignmentId) => h.M('IndWorkerAssignment').findById(assignmentId).select('+visitOtpHash +completionOtpHash +dailyLogs.visitOtpHash +dailyLogs.completionOtpHash');

/** journey → arrived → visit OTP verified (worker side). */
const startWork = async (ctx, worker, assignment) => {
  const W = asWorker(ctx.api, worker);
  await W.post(`/${assignment._id}/start-journey`);
  await W.post(`/${assignment._id}/arrived`);
  const a = await secretOf(assignment._id);
  return W.post(`/${assignment._id}/verify-visit-otp`, { otp: a.visitOtpCode });
};

const farmerCompletionOtp = async (ctx, farmer, request, assignment) => {
  const res = await ctx.api.post(`/api/users/farmer-worker-request/${request._id}/assignment/${assignment._id}/completion-otp`).set(h.auth(farmer, 'USER')).send({});
  return res;
};

const workerWallet = async (worker) => (await h.M('Worker').findById(worker._id)).wallet?.balance || 0;

module.exports = { ...module.exports, today, confirmedBooking, secretOf, startWork, farmerCompletionOtp, workerWallet };

// ── DAILY fixtures ────────────────────────────────────────────────────────────────────────────────
const daysAgo = (n) => { const d = today(); d.setDate(d.getDate() - n); return d; };

/** Confirmed DAILY booking that started `startedDaysAgo` days ago (so every day is reachable). */
const confirmedDaily = async (ctx, farmer, workers, { days = 3, startedDaysAgo = 2, cash = false, rate = 550, max = 600 } = {}) => {
  const start = daysAgo(startedDaysAgo);
  const end = new Date(start); end.setDate(end.getDate() + days - 1);
  return confirmedBooking(ctx, farmer, workers, {
    cash, bookingType: 'DAILY', rateUnit: 'daily', startDate: start, endDate: end, numberOfDays: days,
    scheduledDate: null, startTime: null, endTime: null, durationMinutes: null,
    minDailyRate: rate, maxDailyRate: max, minRate: rate, maxRate: max, rate
  });
};

/** One full working day for `worker` on a DAILY assignment; returns the completion response. */
const workDay = async (ctx, farmer, worker, request, assignment) => {
  const W = asWorker(ctx.api, worker);
  await W.post(`/${assignment._id}/daily/start-day`);
  await W.post(`/${assignment._id}/daily/arrived`);
  const cur = await secretOf(assignment._id);
  const log = cur.dailyLogs.find(l => l.dayNumber === cur.currentDayIndex);
  const v = await W.post(`/${assignment._id}/daily/verify-visit-otp`, { otp: log.visitOtpCode });
  if (v.status !== 200) return v;
  const gen = await ctx.api.post(`/api/users/farmer-worker-request/${request._id}/assignment/${assignment._id}/daily-completion-otp`).set(h.auth(farmer, 'USER')).send({});
  if (gen.status !== 200) return gen;
  return W.post(`/${assignment._id}/daily/verify-completion-otp`, { otp: gen.body.data.completionOtp });
};

module.exports = { ...module.exports, daysAgo, confirmedDaily, workDay };
