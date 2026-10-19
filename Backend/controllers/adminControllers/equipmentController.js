const VendorEquipment = require('../../models/VendorEquipment');
const Category = require('../../models/Category');
const { validationResult } = require('express-validator');

/**
 * Get all equipment for management
 * GET /api/admin/equipment
 */
exports.getAllEquipment = async (req, res) => {
  try {
    const { status, vendorId, stateId, districtId, subDistrictId } = req.query;
    const query = {};
    if (status) query.status = status;
    if (vendorId) query.vendorId = vendorId;
    if (stateId) query.stateId = stateId;
    if (districtId) query.districtId = districtId;
    if (subDistrictId) query.subDistrictId = subDistrictId;

    const equipment = await VendorEquipment.find(query)
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
      .populate('implements.subCategoryId', 'title')
      .sort({ createdAt: -1 });

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
    let waitingForStock = null; // by-the-piece category, but the vendor has not said how many pieces they have
    if (status === 'approved') {
      const existing = await VendorEquipment.findById(id).select('categoryId requestedCategoryName listingType totalUnits vendorId name');
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
          const a = req.user;
          if (a && a.role !== 'super_admin' && !['GLOBAL', 'GLOBAL_INDIA'].includes(a.scopeType)) {
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

      // By-the-piece category: the machine goes live only once the vendor has entered their stock
      if (category?.rentByUnit && !existing.totalUnits) {
        finalStatus = 'pending';
        waitingForStock = category.unitLabel || 'piece';
      }
    }

    const equipment = await VendorEquipment.findByIdAndUpdate(
      id,
      { status: finalStatus, adminRemarks: remarks, ...categoryUpdate },
      { new: true }
    );

    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }

    if (waitingForStock) {
      try {
        await require('../notificationControllers/notificationController').createNotification({
          vendorId: equipment.vendorId,
          type: 'general',
          title: 'One more step to list your machine',
          message: `"${equipment.name}" is in a category rented by the ${waitingForStock}. Open it and enter how many ${waitingForStock}s you have; we will then approve it.`,
          relatedId: equipment._id,
          relatedType: 'equipment'
        });
      } catch (e) {
        console.error('Stock-needed notification failed:', e.message);
      }
    }

    res.status(200).json({
      success: true,
      message: waitingForStock
        ? `${createdCategoryTitle ? `Category "${createdCategoryTitle}" created. ` : ''}Not approved yet: the vendor must first enter how many ${waitingForStock}s they have.`
        : createdCategoryTitle
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
 * Delete Equipment (Admin Only)
 */
exports.deleteEquipment = async (req, res) => {
  try {
    const equipment = await VendorEquipment.findByIdAndDelete(req.params.id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    res.status(200).json({ success: true, message: 'Deleted successfully' });
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
