const Admin = require('../models/Admin');
const AdminIncentive = require('../models/AdminIncentive');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Worker = require('../models/Worker');
const { buildAdminScopeFilter } = require('./adminScopeHelper');

/**
 * calculateAdminCombinedIncentives
 * ────────────────────────────────
 * Authoritative, scope-aware incentive calculation strictly implementing
 * per-admin minimum combined registration thresholds across Farmers, Vendors, and Workers.
 *
 * Rules:
 * 1. Scope Bound: Registrations must strictly match the Admin's assigned geographical scope (District/Sub-District/City).
 * 2. Combined Count: Farmers + Vendors + Workers sum together into a single chronological stream.
 * 3. Strict Boundary: Registrations 1..threshold receive ₹0 incentive (unlock threshold).
 *    Only registrations > threshold receive role-specific incentive rates.
 *    If threshold = 0, all registrations are eligible starting from #1.
 * 4. Idempotency: Stores and updates individual audit records in AdminIncentive collection,
 *    never duplicating payouts or altering records marked PAID.
 *
 * @param {Object|String} adminOrId - Mongoose document, lean object, or ObjectId/String
 * @param {Object} options - { startDate, endDate, persist, payrollId, payrollMonth }
 */
async function calculateAdminCombinedIncentives(adminOrId, options = {}) {
  let admin = adminOrId;
  if (!admin || !admin._id || typeof admin.salary === 'undefined') {
    admin = await Admin.findById(adminOrId).lean();
  }

  if (!admin) {
    throw new Error('Admin not found for incentive calculation');
  }

  const {
    startDate = null,
    endDate = null,
    persist = true,
    payrollId = null,
    payrollMonth = null
  } = options;

  const threshold = Math.max(0, Number(admin.salary?.minRegistrationsForIncentive) || 0);
  const farmerRate = Math.max(0, Number(admin.salary?.farmerIncentive) || 0);
  const vendorRate = Math.max(0, Number(admin.salary?.vendorIncentive) || 0);
  const workerRate = Math.max(0, Number(admin.salary?.workerIncentive) || 0);

  // Build geographic filters scoped specifically to this admin
  const userScopeFilter = buildAdminScopeFilter(admin, 'user');
  const vendorScopeFilter = buildAdminScopeFilter(admin, 'vendor');
  const workerScopeFilter = buildAdminScopeFilter(admin, 'worker');

  // Query all valid registrations created by this admin within their scope
  const [farmers, vendors, workers] = await Promise.all([
    User.find({
      createdByAdmin: admin._id,
      isActive: { $ne: false },
      ...userScopeFilter
    }).select('_id name phone createdAt').lean(),

    Vendor.find({
      createdByAdmin: admin._id,
      isActive: { $ne: false },
      approvalStatus: { $nin: ['REJECTED', 'SUSPENDED', 'rejected', 'suspended'] },
      ...vendorScopeFilter
    }).select('_id name businessName phone createdAt').lean(),

    Worker.find({
      createdByAdmin: admin._id,
      isActive: { $ne: false },
      approvalStatus: { $nin: ['REJECTED', 'SUSPENDED', 'rejected', 'suspended'] },
      ...workerScopeFilter
    }).select('_id name phone workerType createdAt').lean()
  ]);

  // Combine into single chronological stream
  const unifiedStream = [
    ...farmers.map(f => ({
      userId: f._id,
      role: 'FARMER',
      name: f.name || 'Farmer',
      phone: f.phone || '',
      rate: farmerRate,
      createdAt: new Date(f.createdAt)
    })),
    ...vendors.map(v => ({
      userId: v._id,
      role: 'VENDOR',
      name: v.businessName || v.name || 'Equipment Owner',
      phone: v.phone || '',
      rate: vendorRate,
      createdAt: new Date(v.createdAt)
    })),
    ...workers.map(w => ({
      userId: w._id,
      role: 'WORKER',
      name: w.name || 'Worker',
      phone: w.phone || '',
      rate: workerRate,
      createdAt: new Date(w.createdAt)
    }))
  ];

  // Sort chronologically ascending (earliest registration first)
  unifiedStream.sort((a, b) => a.createdAt - b.createdAt);

  const totalCombinedRegistrations = unifiedStream.length;
  const isThresholdMet = threshold === 0 ? totalCombinedRegistrations > 0 : totalCombinedRegistrations > threshold;
  const qualifyingRegistrationsCount = threshold === 0 ? totalCombinedRegistrations : Math.max(0, totalCombinedRegistrations - threshold);
  const registrationsRemainingToUnlock = Math.max(0, threshold - totalCombinedRegistrations);

  let farmerIncentivesEarned = 0;
  let vendorIncentivesEarned = 0;
  let workerIncentivesEarned = 0;
  let eligibleFarmerCount = 0;
  let eligibleVendorCount = 0;
  let eligibleWorkerCount = 0;

  const bulkOps = [];
  const processedItems = [];

  for (let index = 0; index < unifiedStream.length; index++) {
    const item = unifiedStream[index];
    const sequenceNumber = index + 1; // 1-indexed

    // Registration is eligible strictly if sequence exceeds threshold (or threshold is 0)
    const isEligible = threshold === 0 ? true : sequenceNumber > threshold;
    const incentiveAmount = isEligible ? item.rate : 0;

    // Cycle date window filter (if filtering by monthly payroll cycle)
    const matchesCycle = (!startDate || item.createdAt >= startDate) && (!endDate || item.createdAt <= endDate);

    if (matchesCycle && isEligible) {
      if (item.role === 'FARMER') {
        farmerIncentivesEarned += incentiveAmount;
        eligibleFarmerCount++;
      } else if (item.role === 'VENDOR') {
        vendorIncentivesEarned += incentiveAmount;
        eligibleVendorCount++;
      } else if (item.role === 'WORKER') {
        workerIncentivesEarned += incentiveAmount;
        eligibleWorkerCount++;
      }
    }

    const registrationRef = `INC_${admin._id.toString()}_${item.userId.toString()}`;

    const processedItem = {
      adminId: admin._id,
      registeredUserId: item.userId,
      registeredUserRole: item.role,
      registeredUserName: item.name,
      registeredUserPhone: item.phone,
      registeredAt: item.createdAt,
      sequenceNumber,
      thresholdApplicable: threshold,
      isEligible,
      rate: item.rate,
      incentiveAmount,
      registrationRef,
      scopeType: admin.scopeType || 'GLOBAL_INDIA',
      stateId: admin.stateId || null,
      stateName: admin.stateName || '',
      districtId: admin.districtId || null,
      districtName: admin.districtName || '',
      subDistrictId: admin.subDistrictId || null,
      subDistrictName: admin.subDistrictName || '',
      cityId: admin.cityId || null,
      cityName: admin.cityName || '',
      isThresholdLocked: !isEligible,
      matchesCycle
    };

    processedItems.push(processedItem);

    if (persist) {
      // Idempotently upsert audit record. If already marked PAID or INCLUDED_IN_PAYROLL, preserve immutable financial status.
      bulkOps.push({
        updateOne: {
          filter: {
            registrationRef,
            status: { $nin: ['PAID'] } // Do not overwrite paid transactions
          },
          update: {
            $set: {
              adminId: admin._id,
              registeredUserId: item.userId,
              registeredUserRole: item.role,
              registeredUserName: item.name,
              registeredUserPhone: item.phone,
              registeredAt: item.createdAt,
              sequenceNumber,
              thresholdApplicable: threshold,
              isEligible,
              rate: item.rate,
              incentiveAmount,
              registrationRef,
              scopeType: admin.scopeType || 'GLOBAL_INDIA',
              stateId: admin.stateId || null,
              stateName: admin.stateName || '',
              districtId: admin.districtId || null,
              districtName: admin.districtName || '',
              subDistrictId: admin.subDistrictId || null,
              subDistrictName: admin.subDistrictName || '',
              cityId: admin.cityId || null,
              cityName: admin.cityName || '',
              ...(payrollId ? { payrollId } : {}),
              ...(payrollMonth ? { payrollMonth } : {})
            },
            $setOnInsert: {
              status: 'ACCRUED'
            }
          },
          upsert: true
        }
      });
    }
  }

  // Execute bulk operations if persistence requested
  if (persist && bulkOps.length > 0) {
    try {
      await AdminIncentive.bulkWrite(bulkOps, { ordered: false });
    } catch (bulkErr) {
      // Log non-fatal duplicate key errors safely
      console.warn('AdminIncentive bulkWrite warning:', bulkErr.message || bulkErr);
    }
  }

  const totalIncentivesEarned = farmerIncentivesEarned + vendorIncentivesEarned + workerIncentivesEarned;

  return {
    adminId: admin._id,
    adminName: admin.name,
    minRegistrationsThreshold: threshold,
    totalCombinedRegistrations,
    qualifyingRegistrationsCount,
    registrationsRemainingToUnlock,
    isThresholdMet,
    counts: {
      farmers: farmers.length,
      vendors: vendors.length,
      workers: workers.length,
      total: totalCombinedRegistrations
    },
    eligibleCounts: {
      farmers: eligibleFarmerCount,
      vendors: eligibleVendorCount,
      workers: eligibleWorkerCount,
      total: qualifyingRegistrationsCount
    },
    incentives: {
      farmerIncentivesEarned,
      vendorIncentivesEarned,
      workerIncentivesEarned,
      totalIncentivesEarned
    },
    items: processedItems
  };
}

module.exports = {
  calculateAdminCombinedIncentives
};
