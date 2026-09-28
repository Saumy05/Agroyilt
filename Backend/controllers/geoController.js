/**
 * Geographic Management Controller
 * Handles CRUD for States, Districts, and Sub-Districts.
 *
 * New hierarchy: GLOBAL_INDIA → State → District → SubDistrict
 *
 * All city-based APIs remain for backward compatibility
 * but the authoritative scope is now State-based.
 */
const State = require('../models/State');
const District = require('../models/District');
const SubDistrict = require('../models/SubDistrict');
const mongoose = require('mongoose');

const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const errorResponse = (res, status, message) =>
  res.status(status).json({ success: false, message });

// ─────────────────────────────────────────────────────────────────────────────
// STATES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc  Get all states (Admin)
 * @route GET /api/admin/states
 */
exports.getAllStates = catchAsync(async (req, res) => {
  const { isActive, search } = req.query;
  const query = {};
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) query.nameNormalized = { $regex: search.trim().toLowerCase() };

  const states = await State.find(query)
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  res.json({ success: true, count: states.length, states });
});

/**
 * @desc  Get active states (Public)
 * @route GET /api/public/states
 */
exports.getActiveStates = catchAsync(async (req, res) => {
  const states = await State.find({ isActive: true })
    .select('name nameNormalized code displayOrder')
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  res.json({ success: true, count: states.length, states });
});

/**
 * @desc  Create state
 * @route POST /api/admin/states
 */
exports.createState = catchAsync(async (req, res) => {
  const { name, code, displayOrder } = req.body;
  if (!name || !name.trim()) return errorResponse(res, 400, 'State name is required');

  // Check for duplicate (case-insensitive)
  const exists = await State.findOne({ nameNormalized: name.trim().toLowerCase() });
  if (exists) return errorResponse(res, 409, `State "${name}" already exists`);

  const state = await State.create({
    name: name.trim(),
    code: (code || '').trim().toUpperCase(),
    displayOrder: displayOrder || 0,
    isActive: req.body.isActive !== false,
    createdBy: req.user._id
  });

  res.status(201).json({ success: true, message: 'State created successfully', state });
});

/**
 * @desc  Update state
 * @route PUT /api/admin/states/:id
 */
exports.updateState = catchAsync(async (req, res) => {
  const state = await State.findById(req.params.id);
  if (!state) return errorResponse(res, 404, 'State not found');

  const { name, code, displayOrder, isActive } = req.body;

  // Check duplicate if name changes
  if (name && name.trim().toLowerCase() !== state.nameNormalized) {
    const exists = await State.findOne({
      nameNormalized: name.trim().toLowerCase(),
      _id: { $ne: state._id }
    });
    if (exists) return errorResponse(res, 409, `State "${name}" already exists`);
  }

  if (name !== undefined) state.name = name.trim();
  if (code !== undefined) state.code = code.trim().toUpperCase();
  if (displayOrder !== undefined) state.displayOrder = displayOrder;
  if (isActive !== undefined) state.isActive = isActive;

  await state.save();
  res.json({ success: true, message: 'State updated successfully', state });
});

/**
 * @desc  Toggle state active status
 * @route PATCH /api/admin/states/:id/status
 */
exports.toggleStateStatus = catchAsync(async (req, res) => {
  const state = await State.findById(req.params.id);
  if (!state) return errorResponse(res, 404, 'State not found');

  state.isActive = !state.isActive;
  await state.save();

  res.json({
    success: true,
    message: `State ${state.isActive ? 'activated' : 'deactivated'} successfully`,
    state
  });
});

/**
 * @desc  Delete state (soft check: only if no dependent districts)
 * @route DELETE /api/admin/states/:id
 */
exports.deleteState = catchAsync(async (req, res) => {
  const state = await State.findById(req.params.id);
  if (!state) return errorResponse(res, 404, 'State not found');

  const districtCount = await District.countDocuments({ stateId: state._id });
  if (districtCount > 0) {
    return errorResponse(
      res,
      400,
      `Cannot delete state "${state.name}" — it has ${districtCount} district(s). Deactivate or reassign districts first.`
    );
  }

  await state.deleteOne();
  res.json({ success: true, message: 'State deleted successfully' });
});

// ─────────────────────────────────────────────────────────────────────────────
// DISTRICTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc  Get all districts (Admin)
 * @route GET /api/admin/districts
 */
exports.getAllDistricts = catchAsync(async (req, res) => {
  const { stateId, isActive, search } = req.query;
  const query = {};
  if (stateId) {
    if (!mongoose.Types.ObjectId.isValid(stateId))
      return errorResponse(res, 400, 'Invalid stateId');
    query.stateId = stateId;
  }
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) query.nameNormalized = { $regex: search.trim().toLowerCase() };

  const districts = await District.find(query)
    .populate('stateId', 'name nameNormalized')
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  res.json({ success: true, count: districts.length, districts });
});

/**
 * @desc  Get active districts by state (Public)
 * @route GET /api/public/states/:stateId/districts
 */
exports.getDistrictsByState = catchAsync(async (req, res) => {
  const { stateId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(stateId))
    return errorResponse(res, 400, 'Invalid stateId');

  const districts = await District.find({ stateId, isActive: true })
    .select('name nameNormalized displayOrder stateId stateName')
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  res.json({ success: true, count: districts.length, districts });
});

/**
 * @desc  Create district
 * @route POST /api/admin/districts
 */
exports.createDistrict = catchAsync(async (req, res) => {
  const { name, stateId, displayOrder } = req.body;
  if (!name || !name.trim()) return errorResponse(res, 400, 'District name is required');
  if (!stateId) return errorResponse(res, 400, 'stateId is required');
  if (!mongoose.Types.ObjectId.isValid(stateId)) return errorResponse(res, 400, 'Invalid stateId');

  // Validate state exists
  const state = await State.findById(stateId);
  if (!state) return errorResponse(res, 404, 'State not found');

  // Unique within state
  const nameNorm = name.trim().toLowerCase();
  const exists = await District.findOne({ stateId, nameNormalized: nameNorm });
  if (exists) return errorResponse(res, 409, `District "${name}" already exists in ${state.name}`);

  const district = await District.create({
    name: name.trim(),
    stateId: state._id,
    stateName: state.name,
    displayOrder: displayOrder || 0,
    isActive: req.body.isActive !== false,
    createdBy: req.user._id
  });

  res.status(201).json({ success: true, message: 'District created successfully', district });
});

/**
 * @desc  Update district
 * @route PUT /api/admin/districts/:id
 */
exports.updateDistrict = catchAsync(async (req, res) => {
  const district = await District.findById(req.params.id);
  if (!district) return errorResponse(res, 404, 'District not found');

  const { name, stateId, displayOrder, isActive } = req.body;

  // Validate state if changing
  let state = null;
  if (stateId && stateId !== district.stateId?.toString()) {
    if (!mongoose.Types.ObjectId.isValid(stateId)) return errorResponse(res, 400, 'Invalid stateId');
    state = await State.findById(stateId);
    if (!state) return errorResponse(res, 404, 'State not found');
  }

  // Duplicate check within state
  const newStateId = state ? state._id : district.stateId;
  if (name && name.trim().toLowerCase() !== district.nameNormalized) {
    const exists = await District.findOne({
      stateId: newStateId,
      nameNormalized: name.trim().toLowerCase(),
      _id: { $ne: district._id }
    });
    if (exists) return errorResponse(res, 409, `District "${name}" already exists in this state`);
  }

  if (name !== undefined) district.name = name.trim();
  if (state) { district.stateId = state._id; district.stateName = state.name; }
  if (displayOrder !== undefined) district.displayOrder = displayOrder;
  if (isActive !== undefined) district.isActive = isActive;

  await district.save();
  res.json({ success: true, message: 'District updated successfully', district });
});

/**
 * @desc  Toggle district status
 * @route PATCH /api/admin/districts/:id/status
 */
exports.toggleDistrictStatus = catchAsync(async (req, res) => {
  const district = await District.findById(req.params.id);
  if (!district) return errorResponse(res, 404, 'District not found');

  district.isActive = !district.isActive;
  await district.save();

  res.json({
    success: true,
    message: `District ${district.isActive ? 'activated' : 'deactivated'} successfully`,
    district
  });
});

/**
 * @desc  Delete district (only if no dependent sub-districts)
 * @route DELETE /api/admin/districts/:id
 */
exports.deleteDistrict = catchAsync(async (req, res) => {
  const district = await District.findById(req.params.id);
  if (!district) return errorResponse(res, 404, 'District not found');

  const subCount = await SubDistrict.countDocuments({ districtId: district._id });
  if (subCount > 0) {
    return errorResponse(
      res,
      400,
      `Cannot delete district "${district.name}" — it has ${subCount} sub-district(s). Delete or reassign them first.`
    );
  }

  await district.deleteOne();
  res.json({ success: true, message: 'District deleted successfully' });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUB-DISTRICTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc  Get all sub-districts (Admin)
 * @route GET /api/admin/sub-districts
 */
exports.getAllSubDistricts = catchAsync(async (req, res) => {
  const { districtId, stateId, isActive, search } = req.query;
  const query = {};
  if (districtId) {
    if (!mongoose.Types.ObjectId.isValid(districtId))
      return errorResponse(res, 400, 'Invalid districtId');
    query.districtId = districtId;
  }
  if (stateId) {
    if (!mongoose.Types.ObjectId.isValid(stateId))
      return errorResponse(res, 400, 'Invalid stateId');
    query.stateId = stateId;
  }
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) query.nameNormalized = { $regex: search.trim().toLowerCase() };

  const subDistricts = await SubDistrict.find(query)
    .populate({
      path: 'districtId',
      select: 'name stateId stateName',
      populate: { path: 'stateId', select: 'name' }
    })
    .populate('stateId', 'name')
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  res.json({ success: true, count: subDistricts.length, subDistricts });
});

/**
 * @desc  Get active sub-districts by district (Public)
 * @route GET /api/public/districts/:districtId/sub-districts
 */
exports.getSubDistrictsByDistrict = catchAsync(async (req, res) => {
  const { districtId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(districtId))
    return errorResponse(res, 400, 'Invalid districtId');

  const subDistricts = await SubDistrict.find({ districtId, isActive: true })
    .select('name nameNormalized displayOrder districtId districtName stateId stateName')
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  res.json({ success: true, count: subDistricts.length, subDistricts });
});

/**
 * @desc  Create sub-district
 * @route POST /api/admin/sub-districts
 */
exports.createSubDistrict = catchAsync(async (req, res) => {
  const { name, districtId, displayOrder } = req.body;
  if (!name || !name.trim()) return errorResponse(res, 400, 'Sub-district name is required');
  if (!districtId) return errorResponse(res, 400, 'districtId is required');
  if (!mongoose.Types.ObjectId.isValid(districtId)) return errorResponse(res, 400, 'Invalid districtId');

  // Validate district + its state
  const district = await District.findById(districtId).populate('stateId', 'name');
  if (!district) return errorResponse(res, 404, 'District not found');

  // Unique within district
  const nameNorm = name.trim().toLowerCase();
  const exists = await SubDistrict.findOne({ districtId, nameNormalized: nameNorm });
  if (exists) return errorResponse(res, 409, `Sub-district "${name}" already exists in ${district.name}`);

  const subDistrict = await SubDistrict.create({
    name: name.trim(),
    districtId: district._id,
    districtName: district.name,
    stateId: district.stateId ? district.stateId._id || district.stateId : null,
    stateName: district.stateId ? district.stateId.name || district.stateName : district.stateName || '',
    displayOrder: displayOrder || 0,
    isActive: req.body.isActive !== false,
    createdBy: req.user._id
  });

  res.status(201).json({ success: true, message: 'Sub-district created successfully', subDistrict });
});

/**
 * @desc  Update sub-district
 * @route PUT /api/admin/sub-districts/:id
 */
exports.updateSubDistrict = catchAsync(async (req, res) => {
  const subDistrict = await SubDistrict.findById(req.params.id);
  if (!subDistrict) return errorResponse(res, 404, 'Sub-district not found');

  const { name, districtId, displayOrder, isActive } = req.body;

  // Validate new district if changing
  let district = null;
  if (districtId && districtId !== subDistrict.districtId?.toString()) {
    if (!mongoose.Types.ObjectId.isValid(districtId)) return errorResponse(res, 400, 'Invalid districtId');
    district = await District.findById(districtId).populate('stateId', 'name');
    if (!district) return errorResponse(res, 404, 'District not found');
  }

  const targetDistrictId = district ? district._id : subDistrict.districtId;
  if (name && name.trim().toLowerCase() !== subDistrict.nameNormalized) {
    const exists = await SubDistrict.findOne({
      districtId: targetDistrictId,
      nameNormalized: name.trim().toLowerCase(),
      _id: { $ne: subDistrict._id }
    });
    if (exists) return errorResponse(res, 409, `Sub-district "${name}" already exists in this district`);
  }

  if (name !== undefined) subDistrict.name = name.trim();
  if (district) {
    subDistrict.districtId = district._id;
    subDistrict.districtName = district.name;
    subDistrict.stateId = district.stateId ? district.stateId._id || district.stateId : null;
    subDistrict.stateName = district.stateId ? district.stateId.name || '' : '';
  }
  if (displayOrder !== undefined) subDistrict.displayOrder = displayOrder;
  if (isActive !== undefined) subDistrict.isActive = isActive;

  await subDistrict.save();
  res.json({ success: true, message: 'Sub-district updated successfully', subDistrict });
});

/**
 * @desc  Toggle sub-district status
 * @route PATCH /api/admin/sub-districts/:id/status
 */
exports.toggleSubDistrictStatus = catchAsync(async (req, res) => {
  const subDistrict = await SubDistrict.findById(req.params.id);
  if (!subDistrict) return errorResponse(res, 404, 'Sub-district not found');

  subDistrict.isActive = !subDistrict.isActive;
  await subDistrict.save();

  res.json({
    success: true,
    message: `Sub-district ${subDistrict.isActive ? 'activated' : 'deactivated'} successfully`,
    subDistrict
  });
});

/**
 * @desc  Delete sub-district
 * @route DELETE /api/admin/sub-districts/:id
 */
exports.deleteSubDistrict = catchAsync(async (req, res) => {
  const subDistrict = await SubDistrict.findById(req.params.id);
  if (!subDistrict) return errorResponse(res, 404, 'Sub-district not found');

  await subDistrict.deleteOne();
  res.json({ success: true, message: 'Sub-district deleted successfully' });
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION HELPER (exported for use in other controllers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateGeoScope
 * Validates that a given scope combination is internally consistent.
 * Throws an Error with descriptive message if invalid.
 *
 * @param {string} scopeLevel  - GLOBAL_INDIA | STATE | DISTRICT | SUB_DISTRICT
 * @param {string|null} stateId
 * @param {string|null} districtId
 * @param {string|null} subDistrictId
 */
exports.validateGeoScope = async (scopeLevel, stateId, districtId, subDistrictId) => {
  if (!['GLOBAL_INDIA', 'STATE', 'DISTRICT', 'SUB_DISTRICT'].includes(scopeLevel)) {
    throw new Error(`Invalid scopeLevel: ${scopeLevel}. Must be one of GLOBAL_INDIA, STATE, DISTRICT, SUB_DISTRICT`);
  }

  if (scopeLevel === 'GLOBAL_INDIA') {
    // No geographic IDs required
    return { valid: true };
  }

  if (scopeLevel === 'STATE') {
    if (!stateId) throw new Error('stateId is required for STATE scope');
    if (!mongoose.Types.ObjectId.isValid(stateId)) throw new Error('Invalid stateId');
    const state = await State.findById(stateId);
    if (!state) throw new Error('State not found');
    return { valid: true, state };
  }

  if (scopeLevel === 'DISTRICT') {
    if (!stateId) throw new Error('stateId is required for DISTRICT scope');
    if (!districtId) throw new Error('districtId is required for DISTRICT scope');
    if (!mongoose.Types.ObjectId.isValid(districtId)) throw new Error('Invalid districtId');
    const district = await District.findById(districtId);
    if (!district) throw new Error('District not found');
    // Validate hierarchy: district must belong to the given state
    if (district.stateId && district.stateId.toString() !== stateId.toString()) {
      throw new Error('District does not belong to the provided state');
    }
    return { valid: true, district };
  }

  if (scopeLevel === 'SUB_DISTRICT') {
    if (!stateId) throw new Error('stateId is required for SUB_DISTRICT scope');
    if (!districtId) throw new Error('districtId is required for SUB_DISTRICT scope');
    if (!subDistrictId) throw new Error('subDistrictId is required for SUB_DISTRICT scope');
    if (!mongoose.Types.ObjectId.isValid(subDistrictId)) throw new Error('Invalid subDistrictId');
    const subDistrict = await SubDistrict.findById(subDistrictId);
    if (!subDistrict) throw new Error('Sub-district not found');
    // Validate hierarchy: sub-district must belong to the given district
    if (subDistrict.districtId.toString() !== districtId.toString()) {
      throw new Error('Sub-district does not belong to the provided district');
    }
    // And district must belong to the given state
    if (subDistrict.stateId && subDistrict.stateId.toString() !== stateId.toString()) {
      throw new Error('Sub-district does not belong to the provided state');
    }
    return { valid: true, subDistrict };
  }
};
