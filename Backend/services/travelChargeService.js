'use strict';
/**
 * Travel Charge Service
 *
 * What a farmer pays a vendor / worker for coming to the farm. Entirely admin-controlled (Settings > Travel Charges):
 *   outbound = max(0, km - freeKm)       x outboundPerKm
 *   return   = max(0, km - returnFreeKm) x returnPerKm      (only when returnEnabled)
 *   total    = outbound + return, limited to maxCharge when that is > 0
 * `km` is the road distance between the farmer's booking location and the vendor / worker's location.
 * All money maths is in integer paise.
 */
const Settings = require('../models/Settings');
const { routeDistanceKm } = require('./distanceTripService');

const toP = (inr) => Math.round(Number(inr || 0) * 100);
const toINR = (p) => p / 100;

const RULE_DEFAULTS = {
  enabled: false, freeKm: 3, outboundPerKm: 2, returnEnabled: false, returnFreeKm: 3, returnPerKm: 1, maxCharge: 0
};

const normalizeRule = (raw = {}) => {
  const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Math.max(0, Number(v)));
  return {
    enabled: Boolean(raw.enabled),
    freeKm: num(raw.freeKm, RULE_DEFAULTS.freeKm),
    outboundPerKm: num(raw.outboundPerKm, RULE_DEFAULTS.outboundPerKm),
    returnEnabled: Boolean(raw.returnEnabled),
    returnFreeKm: num(raw.returnFreeKm, raw.freeKm !== undefined ? num(raw.freeKm, RULE_DEFAULTS.freeKm) : RULE_DEFAULTS.returnFreeKm),
    returnPerKm: num(raw.returnPerKm, RULE_DEFAULTS.returnPerKm),
    maxCharge: num(raw.maxCharge, 0)
  };
};

/** The admin's rule for 'worker' or 'vendor' (machinery). Off when never configured. */
const getTravelRule = async (role) => {
  const settings = await Settings.findOne({ type: 'global' }).select('travelCharge').lean();
  const raw = settings?.travelCharge?.[role] || {};
  return normalizeRule(raw);
};

/** Pure: charge for a known distance under a rule. */
const calcTravelAmounts = (rule, km) => {
  const dist = Math.max(0, Number(km) || 0);
  if (!rule?.enabled || dist <= 0) {
    return { outboundAmount: 0, returnAmount: 0, total: 0, capped: false };
  }
  const outboundP = Math.round(Math.max(0, dist - rule.freeKm) * toP(rule.outboundPerKm));
  const returnP = rule.returnEnabled ? Math.round(Math.max(0, dist - rule.returnFreeKm) * toP(rule.returnPerKm)) : 0;
  let totalP = outboundP + returnP;
  let capped = false;
  const capP = toP(rule.maxCharge);
  if (capP > 0 && totalP > capP) { totalP = capP; capped = true; }
  return { outboundAmount: toINR(outboundP), returnAmount: toINR(returnP), total: toINR(totalP), capped };
};

// Road lookups are cached for a short while (key = both points rounded to ~100 m): a farmer's request page polls often
// and must not hit the maps service every time.
const ROUTE_TTL_MS = 10 * 60 * 1000;
const ROUTE_CACHE_MAX = 500;
const routeCache = new Map();
const routeKey = (a, b) => `${a.lat.toFixed(3)},${a.lng.toFixed(3)}|${b.lat.toFixed(3)},${b.lng.toFixed(3)}`;
const cachedRoute = async (a, b) => {
  const key = routeKey(a, b);
  const hit = routeCache.get(key);
  if (hit && Date.now() - hit.at < ROUTE_TTL_MS) return hit.route;
  const route = await routeDistanceKm(a, b);
  if (route) {
    if (routeCache.size >= ROUTE_CACHE_MAX) routeCache.delete(routeCache.keys().next().value);
    routeCache.set(key, { at: Date.now(), route });
  }
  return route;
};

const point = (p) => {
  if (!p) return null;
  if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) return { lat: Number(p.lat), lng: Number(p.lng) };
  if (Array.isArray(p.coordinates) && p.coordinates.length === 2) return { lat: Number(p.coordinates[1]), lng: Number(p.coordinates[0]) };
  return null;
};

/**
 * Travel charge for one vendor / worker coming to the farm.
 * @param {'worker'|'vendor'} role
 * @param {{lat,lng}} from  the vendor / worker's location
 * @param {{lat,lng}} to    the farmer's booking location
 * @param {object} [rule]   pass an already-loaded rule to avoid a settings read per worker
 * @returns {{applies:boolean, total:number, distanceKm:number|null, method:string|null, outboundAmount:number, returnAmount:number, capped:boolean, reason?:string, rule:object}}
 */
const computeTravelCharge = async ({ role, from, to, rule = null }) => {
  const r = rule || await getTravelRule(role);
  const none = (reason) => ({ applies: false, total: 0, distanceKm: null, method: null, outboundAmount: 0, returnAmount: 0, capped: false, reason, rule: r });
  if (!r.enabled) return none('disabled');

  const a = point(from);
  const b = point(to);
  if (!a || !b) return none('no_location');

  let route;
  try { route = await cachedRoute(a, b); } catch (_) { route = null; }
  if (!route) return none('no_location');

  const amounts = calcTravelAmounts(r, route.km);
  return {
    applies: amounts.total > 0,
    total: amounts.total,
    distanceKm: route.km,
    method: route.method,
    outboundAmount: amounts.outboundAmount,
    returnAmount: amounts.returnAmount,
    capped: amounts.capped,
    reason: amounts.total > 0 ? undefined : 'within_free_distance',
    rule: r
  };
};

/** A vendor's usable location: live position first, else the GeoJSON point (rejects the [0,0] default). */
const vendorPoint = (vendor) => {
  const live = point(vendor?.location);
  if (live && !(live.lat === 0 && live.lng === 0)) return live;
  const geo = point(vendor?.geoLocation);
  if (geo && !(geo.lat === 0 && geo.lng === 0)) return geo;
  return null;
};

module.exports = { vendorPoint, getTravelRule, normalizeRule, calcTravelAmounts, computeTravelCharge, RULE_DEFAULTS };
