const AdminAuditLog = require('../models/AdminAuditLog');

/**
 * buildAdminScopeFilter
 * ─────────────────────
 * Builds a Mongoose query filter that restricts data to the admin's geographic scope.
 *
 * Strategy (in priority order):
 *   1. ObjectId match  — districtId / subDistrictId stored on the entity (most reliable)
 *   2. String fallback — address.district / districtName regex (for legacy records)
 *
 * Supported entityType values:
 *   'user', 'vendor', 'worker', 'booking', 'general'
 *
 * Returns {} for super_admin or GLOBAL scope (unrestricted).
 */
function buildAdminScopeFilter(admin, entityType = 'general') {
  // Super Admin, GLOBAL scope, and GLOBAL_INDIA scope → unrestricted
  if (!admin || admin.role === 'super_admin' || admin.scopeType === 'GLOBAL' || admin.scopeType === 'GLOBAL_INDIA') {
    return {};
  }

  const { scopeType, districtId, districtName, subDistrictId, subDistrictName, cityId, cityName } = admin;

  // ── NEW: STATE scope ──────────────────────────────────────────────────────────
  if (scopeType === 'STATE') {
    const conditions = [];
    if (admin.stateId) {
      conditions.push({ stateId: admin.stateId });
      conditions.push({ 'address.stateId': admin.stateId });
    }
    if (admin.stateName && admin.stateName.trim()) {
      const stateRegex = new RegExp(`^${escapeRegex(admin.stateName.trim())}$`, 'i');
      if (entityType === 'user') {
        conditions.push(
          { 'addresses.state': stateRegex },
          { stateName: stateRegex }
        );
      } else {
        conditions.push(
          { 'address.state': stateRegex },
          { stateName: stateRegex }
        );
      }
    }
    return conditions.length > 0 ? { $or: conditions } : {};
  }

  // ── LEGACY: CITY scope ────────────────────────────────────────────────────────────
  if (scopeType === 'CITY') {
    const conditions = [];
    if (cityId) {
      if (entityType === 'vendor') {
        conditions.push({ cityId }); // top-level cityId on Vendor
      }
      conditions.push({ 'address.cityId': cityId }); // address sub-object
    }
    if (cityName && cityName.trim()) {
      const cityRegex = new RegExp(`^${escapeRegex(cityName.trim())}$`, 'i');
      if (entityType === 'user') {
        conditions.push(
          { 'addresses.city': cityRegex },
          { 'farms.location.city': cityRegex }
        );
      } else {
        conditions.push(
          { 'address.city': cityRegex },
          { cityName: cityRegex }
        );
      }
    }
    return conditions.length > 0 ? { $or: conditions } : {};
  }

  // ── DISTRICT scope ───────────────────────────────────────────────────────────
  if (scopeType === 'DISTRICT') {
    const conditions = [];

    // Primary: ObjectId match
    if (districtId) {
      conditions.push({ districtId });           // top-level field (User/Vendor/Worker/Booking)
      conditions.push({ 'address.districtId': districtId }); // inside address sub-object
    }

    // Secondary: string fallback for legacy records
    if (districtName && districtName.trim()) {
      const distRegex = new RegExp(`^${escapeRegex(districtName.trim())}$`, 'i');
      if (entityType === 'user') {
        conditions.push(
          { 'addresses.district': distRegex },
          { districtName: distRegex }
        );
      } else if (entityType === 'booking') {
        conditions.push(
          { 'address.district': distRegex },
          { districtName: distRegex },
          { 'address.city': distRegex } // legacy bookings often stored district name in address.city
        );
      } else {
        conditions.push(
          { 'address.district': distRegex },
          { districtName: distRegex }
        );
      }
    }

    return conditions.length > 0 ? { $or: conditions } : {};
  }

  // ── SUB_DISTRICT scope ───────────────────────────────────────────────────────
  if (scopeType === 'SUB_DISTRICT') {
    const conditions = [];

    // Primary: ObjectId match
    if (subDistrictId) {
      conditions.push({ subDistrictId });
      conditions.push({ 'address.subDistrictId': subDistrictId });
    }

    // Secondary: string fallback
    if (subDistrictName && subDistrictName.trim()) {
      const subRegex = new RegExp(`^${escapeRegex(subDistrictName.trim())}$`, 'i');
      if (entityType === 'user') {
        conditions.push(
          { 'addresses.subDistrict': subRegex },
          { subDistrictName: subRegex }
        );
      } else {
        conditions.push(
          { 'address.subDistrict': subRegex },
          { subDistrictName: subRegex }
        );
      }
    }

    // Tertiary: fall back to district string if sub-district has no matches
    if (conditions.length === 0 && districtName && districtName.trim()) {
      const distRegex = new RegExp(`^${escapeRegex(districtName.trim())}$`, 'i');
      conditions.push({ 'address.district': distRegex });
    }

    return conditions.length > 0 ? { $or: conditions } : {};
  }

  return {};
}

/**
 * verifyResourceScope
 * ───────────────────
 * Call this in individual resource GET/PUT/DELETE endpoints to prevent IDOR
 * (Insecure Direct Object Reference) across geographic scopes.
 *
 * Returns true if the admin is allowed to access this resource, false otherwise.
 *
 * @param {Object} admin       - req.user (the authenticated admin)
 * @param {Object} resource    - the fetched Mongoose document (lean or Mongoose)
 * @param {string} entityType  - 'user' | 'vendor' | 'worker' | 'booking'
 */
function verifyResourceScope(admin, resource, entityType = 'general') {
  // Super admins and GLOBAL_INDIA can access everything
  if (!admin || admin.role === 'super_admin' || admin.scopeType === 'GLOBAL' || admin.scopeType === 'GLOBAL_INDIA') {
    return true;
  }

  const { scopeType } = admin;

  // NEW: STATE scope
  if (scopeType === 'STATE') {
    if (admin.stateId) {
      const resourceStateId = resource.stateId || resource.address?.stateId;
      if (resourceStateId && resourceStateId.toString() === admin.stateId.toString()) return true;
    }
    if (admin.stateName) {
      const adminState = admin.stateName.trim().toLowerCase();
      const resState = (resource.stateName || resource.address?.state || '').toLowerCase();
      if (resState && resState === adminState) return true;
      for (const a of resource.addresses || []) {
        if ((a.state || '').toLowerCase() === adminState) return true;
      }
    }
    return false;
  }

  // LEGACY: CITY scope
  if (scopeType === 'CITY') {
    // City check: match via cityId or city string
    if (admin.cityId) {
      const resourceCityId = resource.cityId || resource.address?.cityId;
      if (resourceCityId && resourceCityId.toString() === admin.cityId.toString()) return true;
    }
    if (admin.cityName) {
      const adminCity = admin.cityName.trim().toLowerCase();
      const addresses = resource.addresses || [];
      for (const a of addresses) {
        if ((a.city || '').toLowerCase() === adminCity) return true;
      }
      const addrCity = (resource.address?.city || resource.cityName || '').toLowerCase();
      if (addrCity === adminCity) return true;
    }
    return false;
  }

  // DISTRICT scope
  if (scopeType === 'DISTRICT') {
    if (admin.districtId) {
      const resDistrictId = resource.districtId || resource.address?.districtId;
      if (resDistrictId && resDistrictId.toString() === admin.districtId.toString()) return true;
    }
    // Also allow: resource was created by this admin (traceability)
    if (resource.createdByAdmin && resource.createdByAdmin.toString() === admin._id.toString()) {
      return true;
    }
    // String fallback
    if (admin.districtName) {
      const adminDist = admin.districtName.trim().toLowerCase();
      const resDist = (resource.districtName || resource.address?.district || '').toLowerCase();
      if (resDist && resDist === adminDist) return true;
      // also allow address.city for legacy bookings
      if (entityType === 'booking' && (resource.address?.city || '').toLowerCase() === adminDist) {
        return true;
      }
      // user addresses array
      for (const a of resource.addresses || []) {
        if ((a.district || '').toLowerCase() === adminDist) return true;
      }
    }
    return false;
  }

  // SUB_DISTRICT scope
  if (scopeType === 'SUB_DISTRICT') {
    if (admin.subDistrictId) {
      const resSubId = resource.subDistrictId || resource.address?.subDistrictId;
      if (resSubId && resSubId.toString() === admin.subDistrictId.toString()) return true;
    }
    // Also allow: resource was created by this admin
    if (resource.createdByAdmin && resource.createdByAdmin.toString() === admin._id.toString()) {
      return true;
    }
    // String fallback
    if (admin.subDistrictName) {
      const adminSub = admin.subDistrictName.trim().toLowerCase();
      const resSub = (resource.subDistrictName || resource.address?.subDistrict || '').toLowerCase();
      if (resSub && resSub === adminSub) return true;
      for (const a of resource.addresses || []) {
        if ((a.subDistrict || '').toLowerCase() === adminSub) return true;
      }
    }
    return false;
  }

  return true; // unknown scope → allow (fail-open, let role checks handle)
}

/**
 * extractAdminScopeFields
 * ────────────────────────
 * Returns the scope fields to auto-assign to a newly created user/vendor/worker
 * based on the creating admin's scope.
 */
function extractAdminScopeFields(admin) {
  if (!admin || admin.role === 'super_admin' || admin.scopeType === 'GLOBAL' || admin.scopeType === 'GLOBAL_INDIA') return {};

  return {
    stateId: admin.stateId || null,
    stateName: admin.stateName || null,
    districtId: admin.districtId || null,
    districtName: admin.districtName || null,
    subDistrictId: admin.subDistrictId || null,
    subDistrictName: admin.subDistrictName || null
  };
}

function escapeRegex(text) {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Audit helper for recording admin operations
 */
async function auditAdminAction(req, action, module, description, targetId = null, targetModel = null, targetName = null, metadata = null) {
  try {
    const admin = req.user;
    if (!admin) return;

    await AdminAuditLog.log({
      adminId: admin._id || admin.id,
      adminName: admin.name,
      adminEmail: admin.email,
      adminRole: admin.role,
      action,
      module,
      description,
      targetId,
      targetModel,
      targetName,
      metadata,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers ? req.headers['user-agent'] : null
    });
  } catch (err) {
    console.error('auditAdminAction error:', err.message);
  }
}

module.exports = {
  buildAdminScopeFilter,
  verifyResourceScope,
  extractAdminScopeFields,
  auditAdminAction
};
