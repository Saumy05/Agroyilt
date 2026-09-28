const Category = require('../../models/Category');
const State = require('../../models/State');
const District = require('../../models/District');
const SubDistrict = require('../../models/SubDistrict');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const { SERVICE_STATUS } = require('../../utils/constants');

const formatCategory = (cat) => ({
  id: cat._id,
  title: cat.title,
  slug: cat.slug,
  homeIconUrl: cat.homeIconUrl,
  homeBadge: cat.homeBadge,
  hasSaleBadge: cat.hasSaleBadge,
  showOnHome: cat.showOnHome,
  homeOrder: cat.homeOrder,
  description: cat.description,
  imageUrl: cat.imageUrl,
  status: cat.status,
  isPopular: cat.isPopular,
  parentCategory: cat.parentCategory
    ? {
        id: cat.parentCategory._id || cat.parentCategory.id || cat.parentCategory,
        title: cat.parentCategory.title || '',
        slug: cat.parentCategory.slug || ''
      }
    : null,
  parentCategories: Array.isArray(cat.parentCategories)
    ? cat.parentCategories.map((parent) => ({
        id: parent._id || parent.id || parent,
        title: parent.title || '',
        slug: parent.slug || ''
      }))
    : [],
  isAlwaysMain: cat.isAlwaysMain || false,
  scope: cat.scope || 'GLOBAL_INDIA',
  stateId: cat.stateId?._id ? cat.stateId._id.toString() : (cat.stateId ? cat.stateId.toString() : null),
  state: cat.stateId && typeof cat.stateId === 'object' && cat.stateId.name
    ? { id: cat.stateId._id, name: cat.stateId.name, code: cat.stateId.code }
    : null,
  districtId: cat.districtId?._id ? cat.districtId._id.toString() : (cat.districtId ? cat.districtId.toString() : null),
  district: cat.districtId && typeof cat.districtId === 'object' && cat.districtId.name
    ? { id: cat.districtId._id, name: cat.districtId.name }
    : null,
  subDistrictId: cat.subDistrictId?._id ? cat.subDistrictId._id.toString() : (cat.subDistrictId ? cat.subDistrictId.toString() : null),
  subDistrict: cat.subDistrictId && typeof cat.subDistrictId === 'object' && cat.subDistrictId.name
    ? { id: cat.subDistrictId._id, name: cat.subDistrictId.name }
    : null,
  city: cat.city || null,
  cityIds: cat.cityIds || [],
  trackingType: cat.trackingType || 'none',
  requiresDriver: cat.requiresDriver || false,
  sectionType: cat.sectionType || 'General',
  bookingType: cat.bookingType || 'VENDOR',
  metaTitle: cat.metaTitle,
  metaDescription: cat.metaDescription,
  createdAt: cat.createdAt,
  updatedAt: cat.updatedAt
});

/**
 * Validate geographic scope rules and hierarchy
 * Enforces strict relationships:
 * - GLOBAL_INDIA / GLOBAL: No geo IDs allowed
 * - STATE: stateId required, no district/subDistrict
 * - DISTRICT: stateId & districtId required, district must belong to state, no subDistrict
 * - SUB_DISTRICT: stateId, districtId, subDistrictId required, hierarchy verified
 */
const validateCategoryGeoScope = async (scope, stateId, districtId, subDistrictId) => {
  const normalizedScope = (!scope || scope === 'GLOBAL' || scope === 'GLOBAL_INDIA') ? 'GLOBAL_INDIA' : scope;

  if (!['GLOBAL_INDIA', 'STATE', 'DISTRICT', 'SUB_DISTRICT'].includes(normalizedScope)) {
    throw new Error(`Invalid scope: ${scope}. Must be one of GLOBAL_INDIA, STATE, DISTRICT, SUB_DISTRICT`);
  }

  if (normalizedScope === 'GLOBAL_INDIA') {
    if (stateId || districtId || subDistrictId) {
      throw new Error('Global (All India) categories cannot have state, district, or sub-district assignments');
    }
    return { valid: true, scope: 'GLOBAL_INDIA', stateId: null, districtId: null, subDistrictId: null };
  }

  if (normalizedScope === 'STATE') {
    if (!stateId) throw new Error('State selection is required for State Specific scope');
    if (districtId || subDistrictId) {
      throw new Error('State-scoped categories cannot have district or sub-district assignments');
    }
    if (!mongoose.Types.ObjectId.isValid(stateId)) throw new Error('Invalid state ID format');
    const state = await State.findById(stateId);
    if (!state) throw new Error('Selected state not found');
    if (state.isActive === false) throw new Error('Selected state is currently inactive in Geographic Management');
    return { valid: true, scope: 'STATE', stateId: state._id, districtId: null, subDistrictId: null };
  }

  if (normalizedScope === 'DISTRICT') {
    if (!districtId) throw new Error('District selection is required for District Specific scope');
    if (subDistrictId) {
      throw new Error('District-scoped categories cannot have sub-district assignments');
    }
    if (!mongoose.Types.ObjectId.isValid(districtId)) throw new Error('Invalid district ID format');

    const district = await District.findById(districtId);
    if (!district) throw new Error('Selected district not found');
    if (district.isActive === false) throw new Error('Selected district is currently inactive in Geographic Management');

    const resolvedStateId = district.stateId;
    if (!resolvedStateId) {
      throw new Error('The selected district does not have an associated parent state');
    }

    if (stateId && stateId.toString() !== resolvedStateId.toString()) {
      throw new Error('Selected district does not belong to the provided state');
    }

    const state = await State.findById(resolvedStateId);
    if (!state) throw new Error('Parent state for this district not found');
    if (state.isActive === false) throw new Error('Parent state for this district is currently inactive in Geographic Management');

    return { valid: true, scope: 'DISTRICT', stateId: state._id, districtId: district._id, subDistrictId: null };
  }

  if (normalizedScope === 'SUB_DISTRICT') {
    if (!subDistrictId) throw new Error('Sub-district selection is required for Sub-District Specific scope');
    if (!mongoose.Types.ObjectId.isValid(subDistrictId)) throw new Error('Invalid sub-district ID format');

    const subDistrict = await SubDistrict.findById(subDistrictId);
    if (!subDistrict) throw new Error('Selected sub-district not found');
    if (subDistrict.isActive === false) throw new Error('Selected sub-district is currently inactive in Geographic Management');

    if (!subDistrict.districtId) {
      throw new Error('Selected sub-district does not have an associated parent district');
    }

    if (districtId && districtId.toString() !== subDistrict.districtId.toString()) {
      throw new Error('Selected sub-district does not belong to the provided district');
    }

    const district = await District.findById(subDistrict.districtId);
    if (!district) throw new Error('Parent district for this sub-district not found');
    if (district.isActive === false) throw new Error('Parent district for this sub-district is currently inactive in Geographic Management');

    const resolvedStateId = subDistrict.stateId || district.stateId;
    if (!resolvedStateId) {
      throw new Error('Parent state could not be resolved for this sub-district');
    }

    if (stateId && stateId.toString() !== resolvedStateId.toString()) {
      throw new Error('Selected sub-district does not belong to the provided state');
    }

    const state = await State.findById(resolvedStateId);
    if (!state) throw new Error('Parent state for this sub-district not found');
    if (state.isActive === false) throw new Error('Parent state for this sub-district is currently inactive in Geographic Management');

    return { valid: true, scope: 'SUB_DISTRICT', stateId: state._id, districtId: district._id, subDistrictId: subDistrict._id };
  }
};

/**
 * RBAC Geographic Permission Checker for Admins
 */
const checkAdminGeoPermission = (admin, targetScope, targetStateId, targetDistrictId, targetSubDistrictId) => {
  if (!admin || admin.role === 'super_admin' || admin.scopeType === 'GLOBAL' || admin.scopeType === 'GLOBAL_INDIA') {
    return true; // unrestricted access
  }

  // Scoped admins cannot create or modify a Global category
  if (targetScope === 'GLOBAL_INDIA' || targetScope === 'GLOBAL') {
    throw new Error('Scoped admins do not have permission to manage Global (All India) categories');
  }

  if (admin.scopeType === 'STATE') {
    if (!targetStateId || targetStateId.toString() !== admin.stateId?.toString()) {
      throw new Error(`Admin is restricted to their assigned state (${admin.stateName || admin.stateId})`);
    }
  } else if (admin.scopeType === 'DISTRICT') {
    if (targetScope === 'STATE') {
      throw new Error('District-scoped admins cannot create state-wide categories');
    }
    if (!targetDistrictId || targetDistrictId.toString() !== admin.districtId?.toString()) {
      throw new Error(`Admin is restricted to their assigned district (${admin.districtName || admin.districtId})`);
    }
  } else if (admin.scopeType === 'SUB_DISTRICT') {
    if (targetScope === 'STATE' || targetScope === 'DISTRICT') {
      throw new Error('Sub-district-scoped admins cannot create state or district-wide categories');
    }
    if (!targetSubDistrictId || targetSubDistrictId.toString() !== admin.subDistrictId?.toString()) {
      throw new Error(`Admin is restricted to their assigned sub-district (${admin.subDistrictName || admin.subDistrictId})`);
    }
  }
  return true;
};

/**
 * Check duplicate slug within the same geographic scope
 */
const checkDuplicateSlug = async (slugToCheck, scope, stateId, districtId, subDistrictId, excludeId = null) => {
  const query = { slug: slugToCheck };
  if (excludeId) query._id = { $ne: excludeId };

  const existingCategories = await Category.find(query);
  for (const existing of existingCategories) {
    const existingScope = (!existing.scope || existing.scope === 'GLOBAL' || existing.scope === 'GLOBAL_INDIA') ? 'GLOBAL_INDIA' : existing.scope;
    
    // Global scopes conflict with everything sharing that slug
    if (scope === 'GLOBAL_INDIA' || existingScope === 'GLOBAL_INDIA') {
      return true;
    }
    // Matching State scope
    if (scope === 'STATE' && existingScope === 'STATE' && existing.stateId?.toString() === stateId?.toString()) {
      return true;
    }
    // Matching District scope
    if (scope === 'DISTRICT' && existingScope === 'DISTRICT' && existing.districtId?.toString() === districtId?.toString()) {
      return true;
    }
    // Matching Sub-district scope
    if (scope === 'SUB_DISTRICT' && existingScope === 'SUB_DISTRICT' && existing.subDistrictId?.toString() === subDistrictId?.toString()) {
      return true;
    }
  }
  return false;
};

/**
 * Get all categories
 * GET /api/admin/categories
 */
const getAllCategories = async (req, res) => {
  try {
    const { status, showOnHome, isPopular, stateId, districtId, subDistrictId, scope, cityId, search, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {};
    if (status) query.status = status;
    if (showOnHome !== undefined) query.showOnHome = showOnHome === 'true';
    if (isPopular !== undefined) query.isPopular = isPopular === 'true';
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
    }

    if (scope) {
      if (scope === 'GLOBAL' || scope === 'GLOBAL_INDIA') {
        query.scope = { $in: ['GLOBAL', 'GLOBAL_INDIA'] };
      } else {
        query.scope = scope;
      }
    }

    if (stateId && mongoose.Types.ObjectId.isValid(stateId)) {
      query.stateId = stateId;
    }
    if (districtId && mongoose.Types.ObjectId.isValid(districtId)) {
      query.districtId = districtId;
    }
    if (subDistrictId && mongoose.Types.ObjectId.isValid(subDistrictId)) {
      query.subDistrictId = subDistrictId;
    }

    // RBAC: If admin is geographically scoped, limit categories visible
    const admin = req.user;
    if (admin && admin.role !== 'super_admin' && admin.scopeType && !['GLOBAL', 'GLOBAL_INDIA'].includes(admin.scopeType)) {
      if (admin.scopeType === 'STATE' && admin.stateId) {
        query.$or = [
          { scope: { $in: ['GLOBAL', 'GLOBAL_INDIA'] } },
          { stateId: admin.stateId }
        ];
      } else if (admin.scopeType === 'DISTRICT' && admin.districtId) {
        query.$or = [
          { scope: { $in: ['GLOBAL', 'GLOBAL_INDIA'] } },
          { districtId: admin.districtId }
        ];
      } else if (admin.scopeType === 'SUB_DISTRICT' && admin.subDistrictId) {
        query.$or = [
          { scope: { $in: ['GLOBAL', 'GLOBAL_INDIA'] } },
          { subDistrictId: admin.subDistrictId }
        ];
      }
    }

    const totalCount = await Category.countDocuments(query);

    const categories = await Category.find(query)
      .populate('parentCategory', 'title slug')
      .populate('parentCategories', 'title slug')
      .populate('stateId', 'name code')
      .populate('districtId', 'name')
      .populate('subDistrictId', 'name')
      .select('-__v')
      .sort({ homeOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.status(200).json({
      success: true,
      count: categories.length,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalCount / limitNum)
      },
      categories: categories.map(formatCategory)
    });
  } catch (error) {
    console.error('Get all categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories. Please try again.'
    });
  }
};

/**
 * Get single category by ID
 * GET /api/admin/categories/:id
 */
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id)
      .populate('parentCategory', 'title slug')
      .populate('parentCategories', 'title slug')
      .populate('stateId', 'name code')
      .populate('districtId', 'name')
      .populate('subDistrictId', 'name')
      .select('-__v')
      .lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.status(200).json({
      success: true,
      category: formatCategory(category)
    });
  } catch (error) {
    console.error('Get category by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category. Please try again.'
    });
  }
};

/**
 * Create new category
 * POST /api/admin/categories
 */
const createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      title,
      slug,
      homeIconUrl,
      homeBadge,
      hasSaleBadge,
      showOnHome,
      homeOrder,
      description,
      imageUrl,
      status,
      isPopular,
      metaTitle,
      metaDescription,
      scope,
      stateId,
      districtId,
      subDistrictId,
      parentCategory,
      parentCategories,
      isAlwaysMain,
      trackingType,
      requiresDriver,
      sectionType,
      bookingType
    } = req.body;

    // Validate geographic scoping hierarchy
    let geoConfig;
    try {
      geoConfig = await validateCategoryGeoScope(scope, stateId, districtId, subDistrictId);
    } catch (geoErr) {
      return res.status(400).json({
        success: false,
        message: geoErr.message
      });
    }

    // RBAC: Check admin permissions for target geography
    try {
      checkAdminGeoPermission(req.user, geoConfig.scope, geoConfig.stateId, geoConfig.districtId, geoConfig.subDistrictId);
    } catch (permErr) {
      return res.status(403).json({
        success: false,
        message: permErr.message
      });
    }

    const slugToCheck = slug?.trim().toLowerCase() || title.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

    // Duplicate check
    const isDuplicate = await checkDuplicateSlug(
      slugToCheck,
      geoConfig.scope,
      geoConfig.stateId,
      geoConfig.districtId,
      geoConfig.subDistrictId
    );

    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: 'A category with this title or slug already exists for the selected geographic scope.'
      });
    }

    const category = await Category.create({
      title: title.trim(),
      slug: slug?.trim().toLowerCase() || undefined,
      homeIconUrl: homeIconUrl || null,
      homeBadge: homeBadge?.trim() || null,
      hasSaleBadge: Boolean(hasSaleBadge),
      showOnHome: showOnHome !== false,
      homeOrder: Number(homeOrder) || 0,
      description: description?.trim() || null,
      imageUrl: imageUrl || null,
      status: status || SERVICE_STATUS.ACTIVE,
      isPopular: Boolean(isPopular),
      metaTitle: metaTitle?.trim() || null,
      metaDescription: metaDescription?.trim() || null,
      parentCategory: Array.isArray(parentCategories) && parentCategories.length > 0 ? parentCategories[0] : (parentCategory || null),
      parentCategories: Array.isArray(parentCategories) ? parentCategories : (parentCategory ? [parentCategory] : []),
      isAlwaysMain: Boolean(isAlwaysMain),
      scope: geoConfig.scope,
      stateId: geoConfig.stateId,
      districtId: geoConfig.districtId,
      subDistrictId: geoConfig.subDistrictId,
      trackingType: trackingType || 'none',
      requiresDriver: Boolean(requiresDriver),
      sectionType: sectionType || 'General',
      bookingType: bookingType || 'VENDOR',
      createdBy: req.user?._id || req.userId || null
    });

    const createdCategory = await Category.findById(category._id)
      .populate('parentCategory', 'title slug')
      .populate('parentCategories', 'title slug')
      .populate('stateId', 'name code')
      .populate('districtId', 'name')
      .populate('subDistrictId', 'name')
      .select('-__v')
      .lean();

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category: formatCategory(createdCategory)
    });
  } catch (error) {
    console.error('Create category error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Category with this title or slug already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create category. Please try again.'
    });
  }
};

/**
 * Update category
 * PUT /api/admin/categories/:id
 */
const updateCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const {
      title,
      slug,
      homeIconUrl,
      homeBadge,
      hasSaleBadge,
      showOnHome,
      homeOrder,
      description,
      imageUrl,
      status,
      isPopular,
      metaTitle,
      metaDescription,
      scope,
      stateId,
      districtId,
      subDistrictId,
      parentCategory,
      parentCategories,
      isAlwaysMain,
      trackingType,
      requiresDriver,
      sectionType,
      bookingType
    } = req.body;

    // Check RBAC permission for existing category
    try {
      checkAdminGeoPermission(req.user, category.scope, category.stateId, category.districtId, category.subDistrictId);
    } catch (permErr) {
      return res.status(403).json({
        success: false,
        message: `Permission denied: ${permErr.message}`
      });
    }

    // Determine target geographic fields
    const targetScope = scope !== undefined ? scope : category.scope;
    let targetStateId = stateId !== undefined ? stateId : category.stateId;
    let targetDistrictId = districtId !== undefined ? districtId : category.districtId;
    let targetSubDistrictId = subDistrictId !== undefined ? subDistrictId : category.subDistrictId;

    // Handle scope switches or direct updates so old stale parent IDs are never retained
    if (scope !== undefined && scope !== category.scope) {
      if (scope === 'GLOBAL' || scope === 'GLOBAL_INDIA') {
        targetStateId = null;
        targetDistrictId = null;
        targetSubDistrictId = null;
      } else if (scope === 'STATE') {
        targetDistrictId = null;
        targetSubDistrictId = null;
      } else if (scope === 'DISTRICT') {
        targetSubDistrictId = null;
        if (districtId !== undefined && stateId === undefined) {
          targetStateId = null;
        }
      } else if (scope === 'SUB_DISTRICT') {
        if (subDistrictId !== undefined && districtId === undefined) {
          targetDistrictId = null;
        }
        if (subDistrictId !== undefined && stateId === undefined) {
          targetStateId = null;
        }
      }
    } else {
      // Same scope: if district changed but stateId wasn't sent, do not check against old stateId
      if (category.scope === 'DISTRICT' && districtId !== undefined && districtId !== category.districtId?.toString() && stateId === undefined) {
        targetStateId = null;
      }
      // If subdistrict changed, do not check against old district/state
      if (category.scope === 'SUB_DISTRICT' && subDistrictId !== undefined && subDistrictId !== category.subDistrictId?.toString()) {
        if (districtId === undefined) targetDistrictId = null;
        if (stateId === undefined) targetStateId = null;
      }
    }

    // Validate geographic scoping hierarchy if any geo field is being modified
    let geoConfig;
    try {
      geoConfig = await validateCategoryGeoScope(targetScope, targetStateId, targetDistrictId, targetSubDistrictId);
    } catch (geoErr) {
      return res.status(400).json({
        success: false,
        message: geoErr.message
      });
    }

    // Check RBAC permission for target geography
    try {
      checkAdminGeoPermission(req.user, geoConfig.scope, geoConfig.stateId, geoConfig.districtId, geoConfig.subDistrictId);
    } catch (permErr) {
      return res.status(403).json({
        success: false,
        message: permErr.message
      });
    }

    // Duplicate slug check if title, slug, or scope changed
    if (title || slug || scope !== undefined || stateId !== undefined || districtId !== undefined || subDistrictId !== undefined) {
      const slugToCheck = slug?.trim().toLowerCase() || (title ? title.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-') : category.slug);

      const isDuplicate = await checkDuplicateSlug(
        slugToCheck,
        geoConfig.scope,
        geoConfig.stateId,
        geoConfig.districtId,
        geoConfig.subDistrictId,
        id
      );

      if (isDuplicate) {
        return res.status(400).json({
          success: false,
          message: 'A category with this title or slug already exists for the selected geographic scope.'
        });
      }
    }

    if (title !== undefined) category.title = title.trim();
    if (slug !== undefined) category.slug = slug.trim().toLowerCase();
    if (homeIconUrl !== undefined) category.homeIconUrl = homeIconUrl || null;
    if (homeBadge !== undefined) category.homeBadge = homeBadge?.trim() || null;
    if (hasSaleBadge !== undefined) category.hasSaleBadge = Boolean(hasSaleBadge);
    if (showOnHome !== undefined) category.showOnHome = showOnHome !== false;
    if (homeOrder !== undefined) category.homeOrder = Number(homeOrder) || 0;
    if (description !== undefined) category.description = description?.trim() || null;
    if (imageUrl !== undefined) category.imageUrl = imageUrl || null;
    if (status !== undefined) category.status = status;
    if (isPopular !== undefined) category.isPopular = Boolean(isPopular);
    if (metaTitle !== undefined) category.metaTitle = metaTitle?.trim() || null;
    if (metaDescription !== undefined) category.metaDescription = metaDescription?.trim() || null;

    // Parent logic
    if (parentCategories !== undefined) {
      const pCats = Array.isArray(parentCategories) ? parentCategories : (parentCategories ? [parentCategories] : []);
      category.parentCategories = pCats;
      category.parentCategory = pCats.length > 0 ? pCats[0] : null;
      category.markModified('parentCategories');
      category.markModified('parentCategory');
    } else if (parentCategory !== undefined) {
      if (parentCategory) {
        category.parentCategory = parentCategory;
        category.parentCategories = [parentCategory];
      } else {
        category.parentCategory = null;
        category.parentCategories = [];
      }
      category.markModified('parentCategories');
      category.markModified('parentCategory');
    }

    if (isAlwaysMain !== undefined) category.isAlwaysMain = Boolean(isAlwaysMain);
    if (trackingType !== undefined) category.trackingType = trackingType;
    if (requiresDriver !== undefined) category.requiresDriver = Boolean(requiresDriver);
    if (sectionType !== undefined) category.sectionType = sectionType;
    if (bookingType !== undefined) category.bookingType = bookingType;

    // Apply validated geographic scope
    category.scope = geoConfig.scope;
    category.stateId = geoConfig.stateId;
    category.districtId = geoConfig.districtId;
    category.subDistrictId = geoConfig.subDistrictId;

    await category.save();

    const updatedCategory = await Category.findById(category._id)
      .populate('parentCategory', 'title slug')
      .populate('parentCategories', 'title slug')
      .populate('stateId', 'name code')
      .populate('districtId', 'name')
      .populate('subDistrictId', 'name')
      .select('-__v')
      .lean();

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      category: formatCategory(updatedCategory)
    });
  } catch (error) {
    console.error('Update category error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Category with this title or slug already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update category. Please try again.'
    });
  }
};

/**
 * Delete category
 * DELETE /api/admin/categories/:id
 */
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Also delete all associated services (equipment models) for this category
    const Service = require('../../models/Service');
    await Service.deleteMany({ categoryId: id });

    res.status(200).json({
      success: true,
      message: 'Category and associated equipment deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category'
    });
  }
};

/**
 * Update category order
 * PATCH /api/admin/categories/:id/order
 */
const updateCategoryOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { homeOrder } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    category.homeOrder = homeOrder;
    await category.save();

    res.status(200).json({
      success: true,
      message: 'Order updated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update order'
    });
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryOrder
};
