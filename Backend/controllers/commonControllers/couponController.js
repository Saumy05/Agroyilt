const Coupon = require('../../models/Coupon');

/**
 * Validate and compute discount for a coupon code
 * POST /api/coupons/validate
 * Public / Authenticated User
 */
exports.validateCoupon = async (req, res) => {
  try {
    const { code, bookingAmount = 0, categoryId = null, serviceId = null } = req.body;
    const userId = req.user?._id || req.user?.id || null;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid coupon code'
      });
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode, isDeleted: { $ne: true } });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: `Coupon code "${cleanCode}" is invalid or does not exist`
      });
    }

    // Check validity rules
    const validation = coupon.isValidForOrder(userId, Number(bookingAmount) || 0, categoryId, serviceId);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    // Calculate discount amount
    const discountAmount = coupon.calculateDiscount(Number(bookingAmount) || 0);

    return res.status(200).json({
      success: true,
      message: `Coupon "${coupon.code}" applied! You save ₹${discountAmount.toLocaleString('en-IN')}`,
      coupon: {
        _id: coupon._id,
        code: coupon.code,
        title: coupon.title,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscountAmount: coupon.maxDiscountAmount
      }
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate coupon',
      error: error.message
    });
  }
};

/**
 * Get active and currently valid festival/promotional coupons for users
 * GET /api/coupons/available
 */
exports.getAvailableCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isDeleted: { $ne: true },
      isActive: true,
      startDate: { $lte: now },
      $or: [
        { endDate: null },
        { endDate: { $gte: now } }
      ]
    })
      .select('code title description discountType discountValue minOrderAmount maxDiscountAmount endDate')
      .sort({ createdAt: -1 })
      .lean();

    // Filter out coupons that exceeded usageLimit
    const available = coupons.filter(c => !c.usageLimit || c.usageCount < c.usageLimit);

    return res.status(200).json({
      success: true,
      coupons: available
    });
  } catch (error) {
    console.error('Error fetching available coupons:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch available coupons',
      error: error.message
    });
  }
};

/**
 * Admin: Get all coupons and aggregate metrics
 * GET /api/admin/coupons
 */
exports.getAdminCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate('applicableCategories', 'title')
      .populate('applicableServices', 'title')
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    let totalRedemptions = 0;
    let totalDiscountDisbursed = 0;
    let activeCount = 0;

    const nonDeleted = coupons.filter(c => !c.isDeleted);
    nonDeleted.forEach(coupon => {
      totalRedemptions += (coupon.usageCount || 0);
      if (Array.isArray(coupon.usedBy)) {
        coupon.usedBy.forEach(u => {
          totalDiscountDisbursed += (u.discountApplied || 0);
        });
      }

      const isDateValid = (!coupon.endDate || new Date(coupon.endDate) >= now) &&
                          (!coupon.startDate || new Date(coupon.startDate) <= now);
      const isLimitValid = !coupon.usageLimit || (coupon.usageCount < coupon.usageLimit);
      coupon.isLive = coupon.isActive && isDateValid && isLimitValid;

      if (coupon.isLive) {
        activeCount++;
      }
    });

    return res.status(200).json({
      success: true,
      coupons,
      stats: {
        totalCoupons: nonDeleted.length,
        activeCoupons: activeCount,
        totalRedemptions,
        totalDiscountDisbursed: Math.round(totalDiscountDisbursed)
      }
    });
  } catch (error) {
    console.error('Error fetching admin coupons:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons',
      error: error.message
    });
  }
};

/**
 * Admin: Create a new promotional/festival coupon
 * POST /api/admin/coupons
 */
exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      title,
      description = '',
      discountType = 'PERCENTAGE',
      discountValue,
      minOrderAmount = 0,
      maxDiscountAmount = null,
      startDate = new Date(),
      endDate = null,
      usageLimit = null,
      userLimit = 1,
      applicableCategories = [],
      applicableServices = [],
      isActive = true
    } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Coupon title / festival name is required' });
    }

    const numValue = Number(discountValue);
    if (isNaN(numValue) || numValue <= 0) {
      return res.status(400).json({ success: false, message: 'Discount value must be greater than 0' });
    }

    if (discountType === 'PERCENTAGE' && numValue > 100) {
      return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100%' });
    }

    const cleanCode = code.trim().toUpperCase();

    // Check duplicate
    const existing = await Coupon.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Coupon code "${cleanCode}" already exists. Please choose a unique code.`
      });
    }

    const newCoupon = await Coupon.create({
      code: cleanCode,
      title: title.trim(),
      description: description.trim(),
      discountType,
      discountValue: numValue,
      minOrderAmount: Number(minOrderAmount) || 0,
      maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      userLimit: Number(userLimit) || 1,
      applicableCategories: Array.isArray(applicableCategories) ? applicableCategories : [],
      applicableServices: Array.isArray(applicableServices) ? applicableServices : [],
      isActive: Boolean(isActive)
    });

    return res.status(201).json({
      success: true,
      message: `Coupon "${cleanCode}" created successfully`,
      coupon: newCoupon
    });
  } catch (error) {
    console.error('Error creating coupon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create coupon',
      error: error.message
    });
  }
};

/**
 * Admin: Update coupon details
 * PUT /api/admin/coupons/:id
 */
exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      title,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit,
      userLimit,
      applicableCategories,
      applicableServices,
      isActive
    } = req.body;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    if (code && code.trim()) {
      const cleanCode = code.trim().toUpperCase();
      if (cleanCode !== coupon.code) {
        const duplicate = await Coupon.findOne({ code: cleanCode, _id: { $ne: id } });
        if (duplicate) {
          return res.status(400).json({ success: false, message: `Coupon code "${cleanCode}" already in use` });
        }
        coupon.code = cleanCode;
      }
    }

    if (title !== undefined) coupon.title = title.trim();
    if (description !== undefined) coupon.description = description.trim();
    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) {
      const num = Number(discountValue);
      if (isNaN(num) || num <= 0) {
        return res.status(400).json({ success: false, message: 'Discount value must be greater than 0' });
      }
      if ((discountType || coupon.discountType) === 'PERCENTAGE' && num > 100) {
        return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100%' });
      }
      coupon.discountValue = num;
    }
    if (minOrderAmount !== undefined) coupon.minOrderAmount = Number(minOrderAmount) || 0;
    if (maxDiscountAmount !== undefined) coupon.maxDiscountAmount = maxDiscountAmount ? Number(maxDiscountAmount) : null;
    if (startDate !== undefined) coupon.startDate = startDate ? new Date(startDate) : new Date();
    if (endDate !== undefined) coupon.endDate = endDate ? new Date(endDate) : null;
    if (usageLimit !== undefined) coupon.usageLimit = usageLimit ? Number(usageLimit) : null;
    if (userLimit !== undefined) coupon.userLimit = Number(userLimit) || 1;
    if (applicableCategories !== undefined) coupon.applicableCategories = applicableCategories;
    if (applicableServices !== undefined) coupon.applicableServices = applicableServices;
    if (isActive !== undefined) coupon.isActive = Boolean(isActive);

    await coupon.save();

    return res.status(200).json({
      success: true,
      message: 'Coupon updated successfully',
      coupon
    });
  } catch (error) {
    console.error('Error updating coupon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update coupon',
      error: error.message
    });
  }
};

/**
 * Admin: Toggle coupon active/inactive status
 * PATCH /api/admin/coupons/:id/toggle
 */
exports.toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    return res.status(200).json({
      success: true,
      message: `Coupon "${coupon.code}" is now ${coupon.isActive ? 'active' : 'inactive'}`,
      coupon
    });
  } catch (error) {
    console.error('Error toggling coupon status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle coupon status',
      error: error.message
    });
  }
};

/**
 * Admin: Soft Delete a coupon (preserves past booking receipts and financial audits)
 * DELETE /api/admin/coupons/:id
 */
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    coupon.isDeleted = true;
    coupon.isActive = false;
    coupon.deletedAt = new Date();
    await coupon.save();

    return res.status(200).json({
      success: true,
      message: `Coupon "${coupon.code}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete coupon',
      error: error.message
    });
  }
};

/**
 * Admin: Restore a soft-deleted coupon
 * PATCH /api/admin/coupons/:id/restore
 */
exports.restoreCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    coupon.isDeleted = false;
    coupon.isActive = true;
    coupon.deletedAt = null;
    await coupon.save();

    return res.status(200).json({
      success: true,
      message: `Coupon "${coupon.code}" restored successfully`,
      coupon
    });
  } catch (error) {
    console.error('Error restoring coupon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to restore coupon',
      error: error.message
    });
  }
};
