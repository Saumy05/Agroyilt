const mongoose = require('mongoose');
const VendorEquipment = require('../../models/VendorEquipment');
const Category = require('../../models/Category');
const { validationResult } = require('express-validator');
const { sanitizeSlug } = require('../../utils/requestedImplements');

const canCreateGlobalCategory = (user) =>
  !user || user.role === 'super_admin' || ['GLOBAL', 'GLOBAL_INDIA'].includes(user.scopeType);

const populateEquipmentQuery = (query) =>
  query
    .populate({
      path: 'vendorId',
      select: 'name email phone avatar businessName cityId address stateId districtId subDistrictId',
      populate: { path: 'cityId', select: 'name' }
    })
    .populate('cityIds', 'name')
    .populate('stateId', 'name code')
    .populate('districtId', 'name')
    .populate('subDistrictId', 'name')
    .populate('categoryId', 'title slug rentByUnit unitLabel')
    .populate('subCategoryIds', 'title')
    .populate('implements.subCategoryId', 'title');

const linkParentCategory = async (category, parentCategoryId) => {
  const pidStr = String(parentCategoryId);
  const existingParents = Array.isArray(category.parentCategories)
    ? category.parentCategories.map((p) => String(p))
    : [];
  let changed = false;
  if (!category.parentCategory) {
    category.parentCategory = parentCategoryId;
    changed = true;
  }
  if (!existingParents.includes(pidStr)) {
    category.parentCategories = [...(category.parentCategories || []), parentCategoryId];
    changed = true;
  }
  if (changed) await category.save();
};

/**
 * Get all equipment for management
 * GET /api/admin/equipment
 */
exports.getAllEquipment = async (req, res) => {
  try {
    const { status, vendorId, stateId, districtId, subDistrictId } = req.query;
    const query = {};
    if (status === 'archived' || req.query.isDeleted === 'true') {
      query.isDeleted = true;
    } else {
      query.isDeleted = { $ne: true };
      if (status === 'pending') {
        query.$or = [{ status: 'pending' }, { 'requestedImplements.status': 'pending' }];
      } else if (status) {
        query.status = status;
      }
    }
    if (vendorId) query.vendorId = vendorId;
    if (stateId) query.stateId = stateId;
    if (districtId) query.districtId = districtId;
    if (subDistrictId) query.subDistrictId = subDistrictId;

    const equipment = await populateEquipmentQuery(VendorEquipment.find(query)).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: equipment.length,
      data: equipment
    });
  } catch (error) {
    console.error('Fetch Admin Equipment Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Approve or Reject Equipment
 * PATCH /api/admin/equipment/:id/status
 */
exports.updateEquipmentStatus = async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const { id } = req.params;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // A listing that only has a requested (not yet created) category can't go live: farmers browse by category.
    // Approving it creates that category (or links the existing one with the same name), as the admin expects.
    let categoryUpdate = {};
    let createdCategoryTitle = null;
    let finalStatus = status;
    if (status === 'approved') {
      const existing = await VendorEquipment.findById(id).select('categoryId requestedCategoryName listingType vendorId name');
      let category = null;
      if (existing && !existing.categoryId && existing.requestedCategoryName) {
        const title = existing.requestedCategoryName.trim();
        const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        category = await Category.findOne({
          type: 'service',
          $or: [{ title: new RegExp(`^${escaped}$`, 'i') }, ...(slug ? [{ slug }] : [])]
        });
        if (!category) {
          // Same rule as the category form: only an all-India admin may create an all-India category
          if (!canCreateGlobalCategory(req.user)) {
            return res.status(403).json({
              success: false,
              message: `The category "${title}" does not exist yet. Ask a super admin to approve this one so the category can be created.`
            });
          }
          const rental = existing.listingType === 'rental';
          const byUnit = rental && Boolean(req.body.rentByUnit);
          category = await Category.create({
            title,
            slug: slug || undefined,
            type: 'service',
            status: 'active',
            scope: 'GLOBAL_INDIA',
            fulfillmentMode: rental ? 'rental' : 'service',
            rentByUnit: byUnit,
            unitLabel: byUnit ? (String(req.body.unitLabel || '').trim() || 'piece') : null,
            createdBy: req.user?._id || null
          });
          createdCategoryTitle = category.title;
        }
        categoryUpdate = { categoryId: category._id, requestedCategoryName: null };
      } else if (existing?.categoryId) {
        category = await Category.findById(existing.categoryId).select('rentByUnit unitLabel');
      }

    }

    const before = await VendorEquipment.findById(id).select('status').lean();
    const equipment = await VendorEquipment.findByIdAndUpdate(
      id,
      { status: finalStatus, adminRemarks: remarks, ...categoryUpdate },
      { new: true }
    );

    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }

    // Tell the vendor when their listing's status actually changes (the by-the-piece "enter your stock" notice below covers that case)
    if (before && before.status !== equipment.status) {
      const notice = {
        approved: { type: 'equipment_approved', title: 'Your machine is approved', message: `"${equipment.name}" is approved and now visible to farmers for booking.` },
        rejected: { type: 'equipment_rejected', title: 'Your machine was not approved', message: `"${equipment.name}" was rejected.${remarks ? ` Reason: ${remarks}` : ''} You can edit the listing and submit it again.` },
        pending: { type: 'equipment_reopened', title: 'Your machine is back in review', message: `"${equipment.name}" has been moved back to review. We will let you know once it is decided.` }
      }[equipment.status];
      if (notice) {
        try {
          await require('../notificationControllers/notificationController').createNotification({
            vendorId: equipment.vendorId,
            ...notice,
            relatedId: equipment._id,
            relatedType: 'equipment'
          });
        } catch (e) {
          console.error('Equipment status notification failed:', e.message);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: createdCategoryTitle
        ? `Equipment approved. New category "${createdCategoryTitle}" was created.`
        : `Equipment ${status} successfully`,
      data: equipment
    });
  } catch (error) {
    console.error('Update Equipment Status Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Delete Equipment (Admin Only - soft delete)
 */
exports.deleteEquipment = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const equipment = await VendorEquipment.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isDeleted: true,
          status: 'inactive',
          deletedAt: new Date(),
          deletedBy: req.user?._id || null,
          deletedReason: reason || 'Deleted by admin'
        }
      },
      { new: true }
    );
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }
    res.status(200).json({ success: true, message: 'Equipment deleted (archived) successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Restore Equipment (Admin Only)
 */
exports.restoreEquipment = async (req, res) => {
  try {
    const equipment = await VendorEquipment.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isDeleted: false,
          status: 'approved',
          deletedAt: null,
          deletedBy: null,
          deletedReason: null
        }
      },
      { new: true }
    );
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }
    res.status(200).json({ success: true, message: 'Equipment restored successfully', data: equipment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Update Equipment (Admin Only)
 */
exports.updateEquipment = async (req, res) => {
  try {
    const equipment = await VendorEquipment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    res.status(200).json({ success: true, message: 'Updated successfully', data: equipment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Approve, map to an existing attachment, or reject a vendor-requested custom attachment.
 * PATCH /api/admin/equipment/:id/requested-implements/:reqId
 */
exports.reviewRequestedImplement = async (req, res) => {
  try {
    const { id, reqId } = req.params;
    const { action, targetCategoryId, title: customTitle, remarks } = req.body || {};

    if (!['approve', 'map', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action (must be approve, map, or reject)' });
    }
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(reqId)) {
      return res.status(400).json({ success: false, message: 'Invalid equipment or attachment request ID' });
    }

    const equipment = await VendorEquipment.findById(id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }

    const reqImpl = equipment.requestedImplements.id(reqId);
    if (!reqImpl) {
      return res.status(404).json({ success: false, message: 'Requested attachment not found' });
    }

    let notice = null;
    let resolvedTitle = reqImpl.name;

    if (action === 'reject') {
      const reason = String(remarks || '').trim() || 'Rejected by admin';
      reqImpl.status = 'rejected';
      reqImpl.adminRemarks = reason;
      notice = {
        type: 'equipment_rejected',
        title: 'Custom attachment rejected',
        message: `Requested attachment "${reqImpl.name}" for "${equipment.name}" was rejected. Reason: ${reason}`
      };
    } else {
      if (!equipment.categoryId) {
        return res.status(400).json({
          success: false,
          message: 'Approve the requested main category first before approving custom attachments.'
        });
      }

      let category = null;
      if (action === 'map') {
        if (!targetCategoryId || !mongoose.Types.ObjectId.isValid(targetCategoryId)) {
          return res.status(400).json({ success: false, message: 'Please select an existing attachment category to link' });
        }
        category = await Category.findById(targetCategoryId);
        if (!category) {
          return res.status(404).json({ success: false, message: 'Target category not found' });
        }
        await linkParentCategory(category, equipment.categoryId);
      } else {
        const title = String(customTitle || reqImpl.name || '').trim();
        if (title.length < 2 || title.length > 80) {
          return res.status(400).json({ success: false, message: 'Attachment title must be between 2 and 80 characters' });
        }
        const slug = sanitizeSlug(title);
        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        category = await Category.findOne({
          type: 'service',
          $or: [{ title: new RegExp(`^${escaped}$`, 'i') }, ...(slug ? [{ slug }] : [])]
        });

        if (category) {
          await linkParentCategory(category, equipment.categoryId);
        } else {
          if (!canCreateGlobalCategory(req.user)) {
            return res.status(403).json({
              success: false,
              message: `The attachment "${title}" does not exist yet. Ask a super admin to approve this one so it can be created.`
            });
          }
          category = await Category.create({
            title,
            slug: slug || `impl-${Date.now().toString(36)}`,
            type: 'service',
            status: 'active',
            scope: 'GLOBAL_INDIA',
            showOnHome: true,
            fulfillmentMode: equipment.listingType === 'rental' ? 'rental' : 'service',
            trackingType: 'none',
            parentCategory: equipment.categoryId,
            parentCategories: [equipment.categoryId],
            createdBy: req.user?._id || null
          });
        }
      }

      resolvedTitle = category.title || resolvedTitle;
      const catIdStr = String(category._id);
      const existingImpl = (equipment.implements || []).find(
        (impl) => String(impl.subCategoryId) === catIdStr
      );
      if (existingImpl) {
        existingImpl.pricing = reqImpl.pricing;
      } else {
        equipment.implements.push({ subCategoryId: category._id, pricing: reqImpl.pricing });
      }
      if (!(equipment.subCategoryIds || []).some((sid) => String(sid) === catIdStr)) {
        equipment.subCategoryIds.push(category._id);
      }
      equipment.requestedImplements.pull(reqImpl._id);

      notice = {
        type: 'equipment_approved',
        title: 'Custom attachment approved',
        message: `Your requested attachment "${resolvedTitle}" for "${equipment.name}" is approved and live with your configured rates.`
      };
    }

    await equipment.save();

    if (notice) {
      try {
        await require('../notificationControllers/notificationController').createNotification({
          vendorId: equipment.vendorId,
          ...notice,
          relatedId: equipment._id,
          relatedType: 'equipment'
        });
      } catch (e) {
        console.error('Requested attachment notification failed:', e.message);
      }
    }

    const updated = await populateEquipmentQuery(VendorEquipment.findById(equipment._id));
    res.status(200).json({
      success: true,
      message: action === 'reject'
        ? `Attachment "${resolvedTitle}" rejected`
        : `Attachment "${resolvedTitle}" ${action === 'map' ? 'linked' : 'approved'} successfully`,
      data: updated
    });
  } catch (error) {
    console.error('Review Requested Implement Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
