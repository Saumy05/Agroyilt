'use strict';
const h = require('./harness');

/** A standard world: settings, one farmer, one vendor with a tractor. */
const world = async (ctx, over = {}) => {
  await h.make.settings(over.settings || {});
  const farmer = await h.make.farmer(over.farmer || {});
  const vendor = await h.make.vendor(over.vendor || {});
  const cat = await h.make.category();
  const eq = await h.make.equipment(vendor, cat, over.equipment || {});
  const asFarmer = (r) => r.set(h.auth(farmer, 'USER'));
  const asVendor = (r, v = vendor) => r.set(h.auth(v, 'VENDOR'));
  return { ...ctx, farmer, vendor, cat, eq, asFarmer, asVendor };
};

const createBooking = async (w, over = {}, farmer = w.farmer) => {
  const res = await w.api.post('/api/user/bookings').set(h.auth(farmer, 'USER')).send(h.bookingPayload(w.eq, over));
  return res;
};

const newBooking = async (w, over = {}, farmer = w.farmer) => {
  const res = await createBooking(w, over, farmer);
  if (res.status !== 201) throw new Error(`createBooking failed ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.data._id;
};

const secret = (id, fields = '+visitOtp +paymentOtp') => h.M('Booking').findById(id).select(fields);

const accept = (w, id, vendor = w.vendor) => w.asVendor(w.api.post(`/api/vendors/bookings/${id}/accept`), vendor);

/** accept → journey → visit OTP → handover OTP: leaves the booking IN_PROGRESS with a running timer. */
const toInProgress = async (w, id) => {
  let r;
  const cur = await h.M('Booking').findById(id).select('status');
  if (cur.status === 'requested' || cur.status === 'searching') {
    r = await accept(w, id); if (r.status !== 200) throw new Error('accept ' + JSON.stringify(r.body));
  }
  r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/start`)); if (r.status !== 200) throw new Error('start ' + JSON.stringify(r.body));
  let b = await secret(id);
  r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/visit/verify`)).send({ otp: b.visitOtp });
  if (r.status !== 200) throw new Error('visit ' + JSON.stringify(r.body));
  b = await secret(id);
  r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/trip/start`)).send({ start_kilometer_photo: 'http://p/1.jpg', driver_start_otp: b.driver_start_otp });
  if (r.status !== 200) throw new Error('trip/start ' + JSON.stringify(r.body));
  return secret(id);
};

/** Pretend the timer has been running for `minutes`. */
const ageTimer = (id, minutes) =>
  h.M('Booking').updateOne({ _id: id }, { $set: { 'serviceTimer.currentSessionStartedAt': new Date(Date.now() - minutes * 60000) } });

const endTrip = async (w, id, extra = {}) => {
  const b = await secret(id, '+paymentOtp');
  return w.asVendor(w.api.post(`/api/vendors/bookings/${id}/trip/end`)).send({ end_kilometer_photo: 'http://p/2.jpg', driver_end_otp: b.driver_end_otp, ...extra });
};

const vendorWallet = async (vendor) => (await h.M('Vendor').findById(vendor._id).select('wallet')).wallet;
const userWallet = async (u) => (await h.M('User').findById(u._id).select('wallet')).wallet;
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/** Every OTP-ish value present in a JSON blob. */
const OTP_KEYS = ['paymentOtp', 'customerConfirmationOTP', 'driver_end_otp', 'driver_start_otp', 'visitOtp', 'resumeOtp'];
const leakedOtps = (payload, realOtps) => {
  const text = JSON.stringify(payload ?? {});
  return realOtps.filter(o => o && text.includes(`"${o}"`));
};

module.exports = { world, createBooking, newBooking, secret, accept, toInProgress, ageTimer, endTrip, vendorWallet, userWallet, sum, leakedOtps, OTP_KEYS };
