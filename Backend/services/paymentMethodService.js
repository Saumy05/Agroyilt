'use strict';
/**
 * Payment Method Availability (cash / online) by area.
 *
 * Effective availability at a place = global default AND state rule AND district rule AND sub-district rule.
 * Rules only restrict (see models/PaymentMethodRule), so a child can never allow what its parent forbids.
 * Booking types are separate: 'worker' (labour hiring) and 'machinery' (vendor equipment).
 *
 * "cash"   : cash on service / pay at home
 * "online" : Razorpay, the in-app wallet and any other prepayment
 * Plan benefits are not a payment: they are never blocked here.
 */
const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const PaymentMethodRule = require('../models/PaymentMethodRule');
const State = require('../models/State');
const District = require('../models/District');
const SubDistrict = require('../models/SubDistrict');

const TYPES = ['worker', 'machinery'];
const CASH_METHODS = ['cash', 'pay_at_home', 'offline', 'cash_on_service'];
const NO_PAYMENT_METHODS = ['plan_benefit'];

const isId = (v) => v && mongoose.Types.ObjectId.isValid(String(v));
const bool = (v, d = true) => (v === undefined || v === null ? d : Boolean(v));

/** 'cash' | 'online' | null (null = not a payment choice, never blocked) */
const methodClass = (method) => {
  const m = String(method || '').toLowerCase();
  if (!m || NO_PAYMENT_METHODS.includes(m)) return null;
  return CASH_METHODS.includes(m) ? 'cash' : 'online';
};

/** The admin's global default for both booking types. */
const getGlobalDefaults = async () => {
  const s = await Settings.findOne({ type: 'global' }).select('workerCashPaymentEnabled paymentMethods').lean();
  const pm = s?.paymentMethods || {};
  return {
    worker:    { cash: bool(s?.workerCashPaymentEnabled), online: bool(pm.worker?.online) },
    machinery: { cash: bool(pm.machinery?.cash), online: bool(pm.machinery?.online) }
  };
};

/**
 * Walk up from the most specific id we have: [{level, areaId, name?}] ordered state -> district -> sub-district.
 * Missing parents are looked up (a sub-district knows its district and state).
 */
const resolveChain = async ({ stateId, districtId, subDistrictId } = {}) => {
  let sub = null; let dist = null; let st = null;
  if (isId(subDistrictId)) sub = await SubDistrict.findById(subDistrictId).select('name districtId stateId').lean();
  const dId = sub?.districtId || (isId(districtId) ? districtId : null);
  if (dId) dist = await District.findById(dId).select('name stateId').lean();
  const sId = sub?.stateId || dist?.stateId || (isId(stateId) ? stateId : null);
  if (sId) st = await State.findById(sId).select('name').lean();

  const chain = [];
  if (st) chain.push({ level: 'state', areaId: st._id, name: st.name });
  if (dist) chain.push({ level: 'district', areaId: dist._id, name: dist.name });
  if (sub) chain.push({ level: 'subDistrict', areaId: sub._id, name: sub.name });
  return chain;
};

const LEVEL_LABEL = { global: 'everywhere', state: 'State', district: 'District', subDistrict: 'Sub-district' };

/**
 * Pure: combine the global default with the rules on a chain.
 * @returns {{worker:{cash,online,blockedBy:{cash,online}}, machinery:{...}}}  blockedBy = the first level that switched it off
 */
const combine = (globals, rulesByKey, chain) => {
  const out = {};
  for (const type of TYPES) {
    const res = { cash: globals[type].cash, online: globals[type].online, blockedBy: { cash: null, online: null } };
    if (!globals[type].cash) res.blockedBy.cash = { level: 'global', name: null };
    if (!globals[type].online) res.blockedBy.online = { level: 'global', name: null };
    for (const node of chain) {
      const rule = rulesByKey.get(`${node.level}:${node.areaId}`);
      if (!rule) continue;
      for (const m of ['cash', 'online']) {
        if (res[m] && rule[type]?.[m] === false) {
          res[m] = false;
          res.blockedBy[m] = { level: node.level, name: node.name || null };
        }
      }
    }
    out[type] = res;
  }
  return out;
};

const loadRulesFor = async (chain) => {
  if (!chain.length) return new Map();
  const rules = await PaymentMethodRule.find({ $or: chain.map(n => ({ level: n.level, areaId: n.areaId })) }).lean();
  return new Map(rules.map(r => [`${r.level}:${r.areaId}`, r]));
};

/** What is allowed at this place, for both booking types. No usable location = the global default alone. */
const getAvailability = async (geo = {}) => {
  const [globals, chain] = await Promise.all([getGlobalDefaults(), resolveChain(geo)]);
  const rules = await loadRulesFor(chain);
  return combine(globals, rules, chain);
};

/** Where a farmer's booking is: ids on the booking address first, else the area saved on their profile. */
const geoForFarmer = async (userId, address = null) => {
  const User = require('../models/User');
  const fromAddress = {
    stateId: address?.stateId, districtId: address?.districtId, subDistrictId: address?.subDistrictId
  };
  if (isId(fromAddress.subDistrictId) || isId(fromAddress.districtId) || isId(fromAddress.stateId)) return fromAddress;
  const u = userId ? await User.findById(userId).select('districtId subDistrictId').lean() : null;
  return { districtId: u?.districtId || null, subDistrictId: u?.subDistrictId || null };
};

const areaText = (blockedBy) => {
  if (!blockedBy) return '';
  if (blockedBy.level === 'global') return ' right now';
  return ` in your area (${LEVEL_LABEL[blockedBy.level]}${blockedBy.name ? `: ${blockedBy.name}` : ''})`;
};

/**
 * Server-side gate used wherever a payment method is chosen.
 * @returns {{ok:boolean, message?:string, allowed?:{cash,online}}}
 */
const checkMethod = async ({ type, method, userId = null, address = null, geo = null }) => {
  const cls = methodClass(method);
  if (!cls) return { ok: true };
  try {
    const avail = await getAvailability(geo || await geoForFarmer(userId, address));
    const t = avail[type];
    if (t[cls]) return { ok: true, allowed: { cash: t.cash, online: t.online } };
    const label = cls === 'cash' ? 'Cash payment' : 'Online payment';
    const other = cls === 'cash' ? (t.online ? ' Please pay online.' : '') : (t.cash ? ' Please choose cash on service.' : '');
    return { ok: false, message: `${label} is not available${areaText(t.blockedBy[cls])}.${other}`, allowed: { cash: t.cash, online: t.online } };
  } catch (err) {
    // never lock farmers out because the rules could not be read: fall back to allowing
    console.warn('[paymentMethods] check skipped:', err.message);
    return { ok: true };
  }
};

module.exports = {
  TYPES, methodClass, getGlobalDefaults, resolveChain, combine, loadRulesFor, getAvailability, geoForFarmer, checkMethod, LEVEL_LABEL, isId, bool
};
