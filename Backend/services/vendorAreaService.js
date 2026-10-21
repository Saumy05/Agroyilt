const State = require('../models/State');
const District = require('../models/District');
const SubDistrict = require('../models/SubDistrict');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s || '').trim().toLowerCase();

// "Majhgawan (मझगवां)" / "Juni Indore Tahsil" -> "majhgawan" / "juni indore": the part before any bracket, without tehsil / block words
const baseName = (s) => norm(String(s || '').replace(/\(.*?\)/g, ' '))
  .replace(/\b(tahsil|tehsil|taluka|taluk|block|mandal|sub[- ]?district)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
// the bracketed local-language part, e.g. "मझगवां"
const bracketName = (s) => norm((String(s || '').match(/\((.*?)\)/) || [])[1]);

const wholeWordIn = (haystack, needle) => Boolean(needle) && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(needle)}($|[^\\p{L}\\p{N}])`, 'u').test(haystack);

/**
 * Finds the State / District / Sub-district records that match a vendor's address, so the category lists (which are
 * scoped by these ids) work for vendors who picked an address themselves.
 * Conservative on purpose: it returns only what it is sure of, and each level is looked up inside the one above it.
 *
 * @param {object} address  the saved address ({ state, city, fullAddress, ... })
 * @param {object} [hints]  { district, subDistrict } as Google reported them for the picked place
 * @param {object} [known]  ids the vendor already has ({ stateId, districtId }) so a missing lower level can still be found
 */
const resolveAreaFromAddress = async (address = {}, hints = {}, known = {}) => {
  const full = norm(address.fullAddress);
  const area = {};

  // ── state ──
  let stateId = known.stateId || null;
  if (!stateId) {
    const stateName = norm(address.state);
    if (!stateName) return {};
    const state = await State.findOne({ name: new RegExp(`^\\s*${escapeRegex(stateName)}\\s*$`, 'i'), isActive: { $ne: false } }).select('name').lean();
    if (!state) return {};
    stateId = state._id;
    Object.assign(area, { stateId: state._id, stateName: state.name });
  }

  // ── district (inside that state) ──
  let districtId = known.districtId || null;
  if (!districtId) {
    const districts = await District.find({ stateId, isActive: { $ne: false } }).select('name').lean();
    const wanted = [norm(hints.district), norm(address.district), norm(address.city)].filter(Boolean).map(w => baseName(w) || w);
    let district = districts.find(d => wanted.includes(baseName(d.name)));
    if (!district && full) {
      const inFull = districts.filter(d => wholeWordIn(full, baseName(d.name)));
      if (inFull.length === 1) district = inFull[0];
    }
    if (district) {
      districtId = district._id;
      Object.assign(area, { districtId: district._id, districtName: district.name });
    }
  }
  if (!districtId) return area;

  // ── sub-district (inside that district) ──
  const subs = await SubDistrict.find({ districtId, isActive: { $ne: false } }).select('name').lean();
  if (subs.length) {
    const wanted = [hints.subDistrict, address.subDistrict, address.addressLine2].filter(Boolean).map(w => baseName(w)).filter(Boolean);
    let sub = subs.find(s => wanted.includes(baseName(s.name)) || (bracketName(s.name) && wanted.includes(bracketName(s.name))));
    if (!sub && full) {
      const inFull = subs.filter(s => wholeWordIn(full, baseName(s.name)) || wholeWordIn(full, bracketName(s.name)));
      if (inFull.length === 1) sub = inFull[0];
    }
    if (sub) Object.assign(area, { subDistrictId: sub._id, subDistrictName: sub.name });
  }
  return area;
};

/**
 * Fills the vendor's state / district / sub-district only where they are still empty
 * (an admin-assigned area is never overwritten).
 * @returns {Promise<object>} the fields that were filled ({} when nothing changed)
 */
const fillMissingVendorArea = async (vendor, hints = {}) => {
  if (!vendor || (vendor.stateId && vendor.districtId && vendor.subDistrictId)) return {};
  const found = await resolveAreaFromAddress(vendor.address || {}, hints, { stateId: vendor.stateId, districtId: vendor.districtId });
  const fill = {};
  ['stateId', 'stateName', 'districtId', 'districtName', 'subDistrictId', 'subDistrictName'].forEach((k) => {
    const idKey = k.replace('Name', 'Id');
    if (found[k] && !vendor[idKey]) fill[k] = found[k];
  });
  Object.entries(fill).forEach(([k, v]) => { vendor[k] = v; });
  return fill;
};

/**
 * Validates a State / District / Sub-district the vendor picked from the dropdowns and returns the fields to save.
 * A level left empty clears it and everything below it. Each level must belong to the one above it.
 * @returns {Promise<{ok: boolean, message?: string, fields?: object}>}
 */
const resolvePickedArea = async ({ stateId, districtId, subDistrictId } = {}) => {
  const mongoose = require('mongoose');
  const valid = (id) => id && mongoose.Types.ObjectId.isValid(id);
  const fields = { stateId: null, stateName: null, districtId: null, districtName: null, subDistrictId: null, subDistrictName: null };

  if (!valid(stateId)) return districtId || subDistrictId
    ? { ok: false, message: 'Choose a state first.' }
    : { ok: true, fields };
  const state = await State.findOne({ _id: stateId, isActive: { $ne: false } }).select('name').lean();
  if (!state) return { ok: false, message: 'That state is not available.' };
  Object.assign(fields, { stateId: state._id, stateName: state.name });

  if (!valid(districtId)) return subDistrictId
    ? { ok: false, message: 'Choose a district first.' }
    : { ok: true, fields };
  const district = await District.findOne({ _id: districtId, stateId: state._id, isActive: { $ne: false } }).select('name').lean();
  if (!district) return { ok: false, message: 'That district is not in the chosen state.' };
  Object.assign(fields, { districtId: district._id, districtName: district.name });

  if (!valid(subDistrictId)) return { ok: true, fields };
  const sub = await SubDistrict.findOne({ _id: subDistrictId, districtId: district._id, isActive: { $ne: false } }).select('name').lean();
  if (!sub) return { ok: false, message: 'That sub-district is not in the chosen district.' };
  Object.assign(fields, { subDistrictId: sub._id, subDistrictName: sub.name });
  return { ok: true, fields };
};

module.exports = { resolveAreaFromAddress, fillMissingVendorArea, resolvePickedArea };
