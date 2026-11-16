const mongoose = require('mongoose');

/**
 * Coupon Model
 * Represents promotional discount codes and festival offers (e.g. Diwali, Dussehra, New Year)
 * used during booking checkout.
 */
const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Coupon title / festival name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  discountType: {
    type: String,
    enum: ['PERCENTAGE', 'FLAT'],
    default: 'PERCENTAGE',
    required: true
  },
  discountValue: {
    type: Number,
    required: [true, 'Discount value is required'],
    min: [0, 'Discount value cannot be negative']
  },
  minOrderAmount: {
    type: Number,
    default: 0,
    min: [0, 'Minimum order amount cannot be negative']
  },
  maxDiscountAmount: {
    type: Number,
    default: null,
    min: [0, 'Maximum discount amount cannot be negative']
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: null
  },
  usageLimit: {
    type: Number,
    default: null, // null = unlimited
    min: [1, 'Usage limit must be at least 1']
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  userLimit: {
    type: Number,
    default: 1, // Times a single user can use this coupon
    min: [1, 'User limit must be at least 1']
  },
  usedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    },
    discountApplied: {
      type: Number,
      default: 0
    },
    usedAt: {
      type: Date,
      default: Date.now
    }
  }],
  applicableCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  applicableServices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Helper instance method to check if coupon is valid for a given user & order amount
couponSchema.methods.isValidForOrder = function(userId, orderAmount = 0, categoryId = null, serviceId = null) {
  const now = new Date();

  if (this.isDeleted) {
    return { valid: false, message: 'This coupon is no longer available' };
  }

  if (!this.isActive) {
    return { valid: false, message: 'This coupon is currently inactive' };
  }

  if (this.startDate && new Date(this.startDate) > now) {
    return { valid: false, message: 'This coupon is not active yet' };
  }

  if (this.endDate && new Date(this.endDate) < now) {
    return { valid: false, message: 'This coupon has expired' };
  }

  if (this.usageLimit && this.usageCount >= this.usageLimit) {
    return { valid: false, message: 'This coupon has reached its maximum total usage limit' };
  }

  if (this.minOrderAmount && orderAmount < this.minOrderAmount) {
    return { 
      valid: false, 
      message: `Minimum order amount of ₹${this.minOrderAmount} required to use this coupon` 
    };
  }

  // Check per-user limit
  if (userId) {
    const userUsages = this.usedBy.filter(u => u.userId && u.userId.toString() === userId.toString()).length;
    if (this.userLimit && userUsages >= this.userLimit) {
      return { 
        valid: false, 
        message: `You have already used this coupon ${this.userLimit} time(s)` 
      };
    }
  }

  // Check category restriction if specified
  if (this.applicableCategories && this.applicableCategories.length > 0 && categoryId) {
    const isCatMatch = this.applicableCategories.some(c => c.toString() === categoryId.toString());
    if (!isCatMatch) {
      return { valid: false, message: 'This coupon is not applicable to the selected category' };
    }
  }

  // Check service restriction if specified
  if (this.applicableServices && this.applicableServices.length > 0 && serviceId) {
    const isSvcMatch = this.applicableServices.some(s => s.toString() === serviceId.toString());
    if (!isSvcMatch) {
      return { valid: false, message: 'This coupon is not applicable to the selected service' };
    }
  }

  return { valid: true };
};

// Helper instance method to calculate discount amount
couponSchema.methods.calculateDiscount = function(orderAmount = 0) {
  let discount = 0;
  if (this.discountType === 'PERCENTAGE') {
    discount = Math.round((orderAmount * this.discountValue) / 100);
    if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
      discount = this.maxDiscountAmount;
    }
  } else {
    // FLAT discount
    discount = Math.min(this.discountValue, orderAmount);
  }
  return Math.max(0, discount);
};

// Static helper to auto-seed initial festival coupons if collection is empty
couponSchema.statics.seedDefaultCoupons = async function() {
  try {
    const count = await this.countDocuments();
    if (count === 0) {
      console.log('[Coupons] Seeding initial promotional festival coupons...');
      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

      await this.create([
        {
          code: 'DIWALI50',
          title: 'Diwali Festival Dhamaka 20% Off',
          description: 'Special Diwali festive discount on machinery rentals and farm services',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          minOrderAmount: 1000,
          maxDiscountAmount: 500,
          startDate: new Date(),
          endDate: oneYearLater,
          usageLimit: 1000,
          userLimit: 1,
          isActive: true
        },
        {
          code: 'WELCOME100',
          title: 'Welcome First Booking Discount',
          description: 'Flat ₹100 off on your first booking with AgroYilt',
          discountType: 'FLAT',
          discountValue: 100,
          minOrderAmount: 500,
          maxDiscountAmount: null,
          startDate: new Date(),
          endDate: oneYearLater,
          usageLimit: 5000,
          userLimit: 1,
          isActive: true
        }
      ]);
      console.log('[Coupons] Default festival coupons seeded successfully');
    }
  } catch (err) {
    console.error('[Coupons] Error seeding default coupons:', err.message);
  }
};

module.exports = mongoose.model('Coupon', couponSchema);
