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
      .populate('categoryId', 'title slug')
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
    if (status === 'approved') {
      const existing = await VendorEquipment.findById(id).select('categoryId requestedCategoryName listingType');
      if (existing && !existing.categoryId && existing.requestedCategoryName) {
        const title = existing.requestedCategoryName.trim();
        const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let category = await Category.findOne({
          type: 'service',
          $or: [{ title: new RegExp(`^${escaped}$`, 'i') }, ...(slug ? [{ slug }] : [])]
        });
        if (!category) {
          category = await Category.create({
            title,
            slug: slug || undefined,
            type: 'service',
            status: 'active',
            showOnHome: false, // the admin decides later whether it appears on the home screen
            scope: 'GLOBAL_INDIA',
            fulfillmentMode: existing.listingType === 'rental' ? 'rental' : 'service',
            createdBy: req.user?._id || null
          });
          createdCategoryTitle = category.title;
        }
        categoryUpdate = { categoryId: category._id, requestedCategoryName: null };
      }
    }

    const equipment = await VendorEquipment.findByIdAndUpdate(
      id,
      { status, adminRemarks: remarks, ...categoryUpdate },
      { new: true }
    );

    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
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
