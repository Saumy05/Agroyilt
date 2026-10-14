'use strict';
/**
 * Admin: where cash / online payment is allowed (Settings > Payment Methods). Super Admin only.
 * A state switch gates its districts, a district switch gates its sub-districts; children can only restrict.
 * See services/paymentMethodService for the rule and models/PaymentMethodRule for the data.
 */
const Settings = require('../../models/Settings');
const PaymentMethodRule = require('../../models/PaymentMethodRule');
const State = require('../../models/State');
const District = require('../../models/District');
const SubDistrict = require('../../models/SubDistrict');
const pm = require('../../services/paymentMethodService');

const TYPE_LABEL = { worker: 'worker bookings', machinery: 'machinery bookings' };
const LEVELS = ['state', 'district', 'subDistrict'];
const MODEL_FOR = { state: State, district: District, subDistrict: SubDistrict };

const cleanPair = (input, current = {}) => ({
  cash: input?.cash === undefined ? pm.bool(current.cash) : Boolean(input.cash),
  online: input?.online === undefined ? pm.bool(current.online) : Boolean(input.online)
});

const plain = (d) => (d && d.toObject ? d.toObject() : d);

/** Chains (state > district > sub-district, with names) for a set of rule docs, resolved in bulk. */
const chainsForRules = async (rules) => {
  const subIds = rules.filter(r => r.level === 'subDistrict').map(r => r.areaId);
  const subs = subIds.length ? await SubDistrict.find({ _id: { $in: subIds } }).select('name districtId stateId').lean() : [];
  const subById = new Map(subs.map(s => [String(s._id), s]));
  const distIds = [...new Set([
    ...rules.filter(r => r.level === 'district').map(r => String(r.areaId)),
    ...subs.map(s => String(s.districtId))
  ])];
  const dists = distIds.length ? await District.find({ _id: { $in: distIds } }).select('name stateId').lean() : [];
  const distById = new Map(dists.map(d => [String(d._id), d]));
  const stateIds = [...new Set([
    ...rules.filter(r => r.level === 'state').map(r => String(r.areaId)),
    ...dists.map(d => String(d.stateId)).filter(Boolean),
    ...subs.map(s => String(s.stateId)).filter(Boolean)
  ])];
  const states = stateIds.length ? await State.find({ _id: { $in: stateIds } }).select('name').lean() : [];
  const stateById = new Map(states.map(s => [String(s._id), s]));

  return new Map(rules.map(r => {
    const chain = [];
    let sub = null; let dist = null; let st = null;
    if (r.level === 'subDistrict') sub = subById.get(String(r.areaId));
    if (r.level === 'district') dist = distById.get(String(r.areaId));
    if (sub) dist = distById.get(String(sub.districtId));
    if (r.level === 'state') st = stateById.get(String(r.areaId));
    else st = stateById.get(String((dist || sub)?.stateId));
    if (st) chain.push({ level: 'state', areaId: st._id, name: st.name });
    if (dist) chain.push({ level: 'district', areaId: dist._id, name: dist.name });
    if (sub) chain.push({ level: 'subDistrict', areaId: sub._id, name: sub.name });
    return [`${r.level}:${r.areaId}`, chain];
  }));
};

/**
 * Refuse a change that would leave some place with NO payment method for a booking type.
 * `globals` / `rules` are the state AFTER the change.
 */
const findDeadEnd = async (globals, rules) => {
  for (const type of pm.TYPES) {
    if (!globals[type].cash && !globals[type].online) return `At least one payment method must stay on for ${TYPE_LABEL[type]} everywhere.`;
  }
  const chains = await chainsForRules(rules);
  const byKey = new Map(rules.map(r => [`${r.level}:${r.areaId}`, r]));
  for (const r of rules) {
    const chain = chains.get(`${r.level}:${r.areaId}`) || [];
    const eff = pm.combine(globals, byKey, chain);
    for (const type of pm.TYPES) {
      if (!eff[type].cash && !eff[type].online) {
        const where = chain.map(n => n.name).filter(Boolean).join(' › ') || 'one of the areas';
        return `That would leave no payment method for ${TYPE_LABEL[type]} in ${where}. Keep cash or online on there.`;
      }
    }
  }
  return null;
};

const globalsToApi = (g) => ({
  worker: { cash: g.worker.cash, online: g.worker.online },
  machinery: { cash: g.machinery.cash, online: g.machinery.online }
});

const allRules = () => PaymentMethodRule.find({}).lean();

/** GET /api/admin/payment-rules?stateId=&districtId=  → the next level down, with each area's own rule and effective result */
exports.getOverview = async (req, res) => {
  try {
    const { stateId, districtId } = req.query;
    const globals = await pm.getGlobalDefaults();
    const rules = await allRules();
    const byKey = new Map(rules.map(r => [`${r.level}:${r.areaId}`, r]));

    let childLevel = 'state';
    let parents = [];
    let children = [];
    if (pm.isId(districtId)) {
      const d = await District.findById(districtId).select('name stateId').lean();
      if (!d) return res.status(404).json({ success: false, message: 'District not found' });
      const st = await State.findById(d.stateId).select('name').lean();
      parents = [
        ...(st ? [{ level: 'state', areaId: st._id, name: st.name }] : []),
        { level: 'district', areaId: d._id, name: d.name }
      ];
      childLevel = 'subDistrict';
      children = await SubDistrict.find({ districtId, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean();
    } else if (pm.isId(stateId)) {
      const st = await State.findById(stateId).select('name').lean();
      if (!st) return res.status(404).json({ success: false, message: 'State not found' });
      parents = [{ level: 'state', areaId: st._id, name: st.name }];
      childLevel = 'district';
      children = await District.find({ stateId, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean();
    } else {
      children = await State.find({ isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean();
    }

    const parentEffective = pm.combine(globals, byKey, parents);

    // how many customised areas sit under each child (so the admin can see where overrides live)
    const customised = new Map();
    if (childLevel !== 'subDistrict') {
      const chains = await chainsForRules(rules);
      for (const r of rules) {
        const chain = chains.get(`${r.level}:${r.areaId}`) || [];
        const node = chain.find(n => n.level === childLevel);
        if (node && String(node.areaId) !== String(r.areaId)) {
          customised.set(String(node.areaId), (customised.get(String(node.areaId)) || 0) + 1);
        }
      }
    }

    res.json({
      success: true,
      global: globalsToApi(globals),
      path: parents.map(p => ({ level: p.level, id: p.areaId, name: p.name })),
      childLevel,
      parentEffective: { worker: { cash: parentEffective.worker.cash, online: parentEffective.worker.online }, machinery: { cash: parentEffective.machinery.cash, online: parentEffective.machinery.online } },
      children: children.map(c => {
        const rule = byKey.get(`${childLevel}:${c._id}`) || null;
        const eff = pm.combine(globals, byKey, [...parents, { level: childLevel, areaId: c._id, name: c.name }]);
        return {
          id: c._id, name: c.name,
          rule: rule ? { worker: rule.worker, machinery: rule.machinery } : null,
          effective: { worker: { cash: eff.worker.cash, online: eff.worker.online }, machinery: { cash: eff.machinery.cash, online: eff.machinery.online } },
          customisedBelow: customised.get(String(c._id)) || 0
        };
      })
    });
  } catch (err) {
    console.error('[paymentRules.getOverview]', err);
    res.status(500).json({ success: false, message: 'Failed to load payment rules' });
  }
};

/** PUT /api/admin/payment-rules/global  { worker:{cash,online}, machinery:{cash,online} } */
exports.saveGlobal = async (req, res) => {
  try {
    const current = await pm.getGlobalDefaults();
    const next = {
      worker: cleanPair(req.body?.worker, current.worker),
      machinery: cleanPair(req.body?.machinery, current.machinery)
    };
    const msg = await findDeadEnd(next, await allRules());
    if (msg) return res.status(400).json({ success: false, message: msg });

    const settings = (await Settings.findOne({ type: 'global' })) || (await Settings.create({ type: 'global' }));
    settings.workerCashPaymentEnabled = next.worker.cash; // the existing worker-cash switch stays the source of truth
    settings.paymentMethods = {
      worker: { online: next.worker.online },
      machinery: { cash: next.machinery.cash, online: next.machinery.online }
    };
    await settings.save();
    res.json({ success: true, global: globalsToApi(next) });
  } catch (err) {
    console.error('[paymentRules.saveGlobal]', err);
    res.status(500).json({ success: false, message: 'Failed to save' });
  }
};

/** PUT /api/admin/payment-rules/area  { level, areaId, worker?:{cash,online}, machinery?:{cash,online} } */
exports.saveArea = async (req, res) => {
  try {
    const { level, areaId } = req.body || {};
    if (!LEVELS.includes(level) || !pm.isId(areaId)) {
      return res.status(400).json({ success: false, message: 'level and areaId are required' });
    }
    const area = await MODEL_FOR[level].findById(areaId).select('name').lean();
    if (!area) return res.status(404).json({ success: false, message: 'Area not found' });

    const existing = await PaymentMethodRule.findOne({ level, areaId });
    const prev = existing ? plain(existing) : {};
    const nextRule = {
      level, areaId,
      worker: cleanPair(req.body.worker, prev.worker),
      machinery: cleanPair(req.body.machinery, prev.machinery)
    };

    // validate the world as it would be after this change
    const others = (await allRules()).filter(r => !(r.level === level && String(r.areaId) === String(areaId)));
    const msg = await findDeadEnd(await pm.getGlobalDefaults(), [...others, nextRule]);
    if (msg) return res.status(400).json({ success: false, message: msg });

    const doc = existing || new PaymentMethodRule({ level, areaId });
    doc.worker = nextRule.worker;
    doc.machinery = nextRule.machinery;
    doc.updatedBy = { adminId: req.user?._id || null, email: req.user?.email || null };
    doc.history.push({ at: new Date(), adminEmail: req.user?.email || null, worker: nextRule.worker, machinery: nextRule.machinery });
    if (doc.history.length > 20) doc.history = doc.history.slice(-20);
    await doc.save();
    res.json({ success: true, rule: { level, areaId, worker: doc.worker, machinery: doc.machinery } });
  } catch (err) {
    console.error('[paymentRules.saveArea]', err);
    res.status(500).json({ success: false, message: 'Failed to save' });
  }
};

/** DELETE /api/admin/payment-rules/area/:level/:areaId  → inherit from the parent again */
exports.resetArea = async (req, res) => {
  try {
    const { level, areaId } = req.params;
    if (!LEVELS.includes(level) || !pm.isId(areaId)) return res.status(400).json({ success: false, message: 'Invalid area' });
    await PaymentMethodRule.deleteOne({ level, areaId });
    res.json({ success: true });
  } catch (err) {
    console.error('[paymentRules.resetArea]', err);
    res.status(500).json({ success: false, message: 'Failed to reset' });
  }
};

/** GET /api/users/payment-methods?districtId=&subDistrictId=  (farmer) → what they may use where they are booking */
exports.getMyAvailability = async (req, res) => {
  try {
    const { districtId, subDistrictId, stateId } = req.query;
    const hasGeo = pm.isId(districtId) || pm.isId(subDistrictId) || pm.isId(stateId);
    const geo = hasGeo ? { stateId, districtId, subDistrictId } : await pm.geoForFarmer(req.user?._id || req.user?.id);
    const a = await pm.getAvailability(geo);
    const pick = (t) => ({ cash: a[t].cash, online: a[t].online });
    res.json({ success: true, worker: pick('worker'), machinery: pick('machinery') });
  } catch (err) {
    console.error('[paymentRules.getMyAvailability]', err);
    // fail open: the booking endpoints still enforce the rules
    res.json({ success: true, worker: { cash: true, online: true }, machinery: { cash: true, online: true } });
  }
};
