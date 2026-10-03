'use strict';

/**
 * Integration-test harness for the farmer ⇄ vendor booking flow.
 *
 * Real: Express routers, auth middleware, controllers, services, Mongoose models, MongoDB (in-memory).
 * Stubbed: Razorpay, Firebase push, email, and the Socket.io server (replaced by a recorder so tests
 * can assert exactly what each room was sent — e.g. that no OTP ever reaches a vendor room).
 *
 * Needs a `mongod` binary: set MONGOMS_SYSTEM_BINARY, or it falls back to /opt/homebrew/bin/mongod
 * and finally to mongodb-memory-server's own download.
 */

const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.APP_TZ_OFFSET_MINUTES = '330';
if (!process.env.MONGOMS_SYSTEM_BINARY) {
  for (const candidate of ['/opt/homebrew/bin/mongod', '/usr/local/bin/mongod', '/usr/bin/mongod']) {
    if (fs.existsSync(candidate)) { process.env.MONGOMS_SYSTEM_BINARY = candidate; break; }
  }
}

const root = path.resolve(__dirname, '..', '..');
const abs = (p) => require.resolve(path.join(root, p));

// ───────────────────────── stubs (must be installed BEFORE controllers load) ─────────────────────────

const stub = (modulePath, exportsObj) => {
  const id = abs(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports: exportsObj, children: [], paths: [] };
};
const noopModule = () => new Proxy({}, { get: (_t, prop) => (prop === '__esModule' ? false : async () => ({ success: true })) });

/** Records every socket emit as { room, event, payload }. */
const fakeIo = {
  emitted: [],
  to(room) {
    return { emit: (event, payload) => fakeIo.emitted.push({ room, event, payload }) };
  },
  reset() { this.emitted.length = 0; },
  sentTo(roomPrefix) { return this.emitted.filter(e => String(e.room).startsWith(roomPrefix)); }
};

let orderSeq = 0;
const razorpayState = { validSignature: 'valid_sig' };

stub('services/razorpayService.js', {
  createOrder: async (amount, currency = 'INR') => ({
    success: true, orderId: `order_test_${++orderSeq}`, amount: Math.round(amount * 100), currency
  }),
  verifyPayment: (_orderId, _paymentId, signature) => signature === razorpayState.validSignature,
  refundPayment: async () => ({ success: true })
});
stub('services/firebaseAdmin.js', noopModule());
stub('services/firebaseNotificationService.js', noopModule());
stub('services/emailService.js', noopModule());
stub('sockets/index.js', { getIO: () => fakeIo, initializeSocket: () => fakeIo });

// ───────────────────────── boot ─────────────────────────

const mongoose = require('mongoose');
const express = require('express');
const supertest = require('supertest');
const { MongoMemoryServer, MongoMemoryReplSet } = require('mongodb-memory-server');

let mongod;
let server;

/** `replSet: true` for code paths that use multi-document transactions (the raw gateway webhook). */
const boot = async ({ replSet = false } = {}) => {
  mongod = replSet
    ? await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    : await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // register every model the controllers touch
  for (const m of ['User', 'Vendor', 'Worker', 'Service', 'Category', 'VendorEquipment', 'Booking', 'BookingRequest',
    'VendorBill', 'Transaction', 'Settings', 'Notification', 'Review', 'Cart', 'Plan', 'PlatformEarning', 'IndWorkerAssignment',
    'WorkerBookingRequest', 'Brand', 'District', 'SubDistrict', 'State', 'City']) {
    try { require(path.join(root, 'models', m)); } catch (e) { /* optional */ }
  }

  const app = express();
  app.use(express.json());
  app.set('io', fakeIo);
  app.use('/api/vendors/bookings', require(path.join(root, 'routes/vendor-routes/booking.routes')));
  app.use('/api/vendors/equipment', require(path.join(root, 'routes/vendor-routes/equipment.routes')));
  app.use('/api/bookings/service-timer', require(path.join(root, 'routes/booking-routes/serviceTimer.routes')));
  app.use('/api/bookings/cash', require(path.join(root, 'routes/booking-routes/cashCollection.routes')));
  app.use('/api/bookings', require(path.join(root, 'routes/booking-routes/userBooking.routes')));
  app.use('/api/payments', require(path.join(root, 'routes/payment-routes/payment.routes')));
  app.use('/api/farmer', require(path.join(root, 'routes/farmer-routes/index')));
  // independent-worker hiring flow (farmer ⇄ worker)
  app.use('/api/users', require(path.join(root, 'routes/user-routes/workerBooking.routes')));
  app.use('/api/workers', require(path.join(root, 'routes/worker-routes/workerRequests.routes')));
  app.use('/api/workers', require(path.join(root, 'routes/worker-routes/job.routes')));
  app.use('/api/workers/assignments', require(path.join(root, 'routes/worker-routes/assignment.routes')));
  app.use('/api/webhooks', require(path.join(root, 'routes/common-routes/webhook.routes')));
  // the real user booking router (create/cancel/reschedule/review/reselect)
  app.use('/api/user/bookings', require(path.join(root, 'routes/user-routes/booking.routes')));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ success: false, message: err.message }));

  // Build every unique/partial index before the first test (idempotency guarantees depend on them)
  await Promise.all(mongoose.modelNames().map(n => mongoose.model(n).init().catch(() => {})));

  // One persistent listener (supertest's per-request ephemeral servers cause sporadic ECONNRESET on newer Node)
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  server.keepAliveTimeout = 0;
  return { app, api: supertest.agent(server) };
};

const shutdown = async () => {
  if (server) await new Promise(r => server.close(r));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
};

const clearDb = async () => {
  const cols = await mongoose.connection.db.collections();
  for (const c of cols) await c.deleteMany({});
};

// ───────────────────────── factories ─────────────────────────

const { generateAccessToken } = require(path.join(root, 'utils/tokenService'));
const M = (n) => require(path.join(root, 'models', n));

let seq = 0;
const uniq = () => `${Date.now()}${++seq}`;

const token = (doc, role) => generateAccessToken({ userId: String(doc._id), role });
const auth = (doc, role) => ({ Authorization: `Bearer ${token(doc, role)}` });

const make = {
  async settings(over = {}) {
    return M('Settings').findOneAndUpdate(
      { type: 'global' },
      { $set: { type: 'global', visitedCharges: 49, cancellationPenalty: 49, rentalGstPercentage: 5, rentalPayoutPercentage: 90, serviceGstPercentage: 18, servicePayoutPercentage: 70, partsPayoutPercentage: 10, ...over } },
      { upsert: true, new: true }
    );
  },
  async farmer(over = {}) {
    return M('User').create({ name: 'Farmer', phone: `9${String(uniq()).slice(-9)}`, wallet: { balance: 0, penalty: 0 }, ...over });
  },
  async vendor(over = {}) {
    return M('Vendor').create({
      name: 'Vendor', phone: `8${String(uniq()).slice(-9)}`, businessName: 'Vendor Co',
      aadhar: { number: '123412341234', document: 'x', backDocument: 'y' },
      approvalStatus: 'approved', isActive: true, ...over
    });
  },
  async category(over = {}) {
    return M('Category').create({ title: 'Agriculture', slug: `agri-${uniq()}`, requiresDriver: true, ...over });
  },
  async equipment(vendor, category, over = {}) {
    return M('VendorEquipment').create({
      name: 'Tractor', vendorId: vendor._id, categoryId: category._id, status: 'active',
      pricing: { hourly: { isEnabled: true, price: 600 }, land_based: { isEnabled: true, price: 800 }, daily: { isEnabled: true, price: 4000 } },
      ...over
    });
  },
  async service(category, over = {}) {
    return M('Service').create({ title: 'AC Repair', slug: `svc-${uniq()}`, basePrice: 500, categoryIds: [category._id], ...over });
  }
};

// future date helper (default: +2 days)
const dateIn = (days = 2) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const bookingPayload = (equipment, over = {}) => ({
  serviceId: String(equipment._id),
  equipmentId: String(equipment._id),
  vendorId: String(equipment.vendorId),
  rental_type: 'hourly',
  scheduledDate: dateIn(2),
  scheduledTime: '09:00',
  timeSlot: { start: '09:00', end: '11:00' },
  address: { addressLine1: 'Farm Rd', city: 'Pune', state: 'MH', pincode: '411001', lat: 18.52, lng: 73.85 },
  paymentMethod: 'pay_at_home',
  serviceCategory: 'Agriculture',
  ...over
});

const get = (doc, Model) => M(Model).findById(doc._id || doc);

module.exports = { boot, shutdown, clearDb, make, auth, token, dateIn, bookingPayload, fakeIo, razorpayState, M, get, mongoose };
