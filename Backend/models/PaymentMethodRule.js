const mongoose = require('mongoose');

/**
 * Where cash / online payment is allowed, per area (State > District > Sub-district).
 *
 * A rule only ever RESTRICTS: a method is available at a place only when it is on at the global default AND on in
 * every rule above it (state, then district, then sub-district). A child can therefore never switch on something its
 * parent has switched off. No rule for an area = inherit from the parent.
 *
 * Booking types are independent: `worker` (labour hiring) and `machinery` (vendor equipment bookings).
 */
const methodPairSchema = new mongoose.Schema({
  cash:   { type: Boolean, default: true },
  online: { type: Boolean, default: true }
}, { _id: false });

const paymentMethodRuleSchema = new mongoose.Schema({
  level:  { type: String, enum: ['state', 'district', 'subDistrict'], required: true },
  areaId: { type: mongoose.Schema.Types.ObjectId, required: true },
  worker:    { type: methodPairSchema, default: () => ({}) },
  machinery: { type: methodPairSchema, default: () => ({}) },
  updatedBy: {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    email:   { type: String, default: null }
  },
  history: [{
    _id: false,
    at: { type: Date, default: Date.now },
    adminEmail: { type: String, default: null },
    worker:    { cash: Boolean, online: Boolean },
    machinery: { cash: Boolean, online: Boolean }
  }]
}, { timestamps: true });

paymentMethodRuleSchema.index({ level: 1, areaId: 1 }, { unique: true });

module.exports = mongoose.model('PaymentMethodRule', paymentMethodRuleSchema);
