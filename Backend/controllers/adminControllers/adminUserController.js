const User = require('../../models/User');
const Admin = require('../../models/Admin');
const Booking = require('../../models/Booking');
const { validationResult } = require('express-validator');
const { buildAdminScopeFilter, auditAdminAction, verifyResourceScope, extractAdminScopeFields } = require('../../utils/adminScopeHelper');

/**
 * Get all users with filters and pagination
 */
const getAllUsers = async (req, res) => {
  try {
    const {
      search,
      isActive,
      isPhoneVerified,
      isEmailVerified,
      approvalStatus,
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    if (isPhoneVerified !== undefined) {
      query.isPhoneVerified = isPhoneVerified === 'true';
    }
    if (isEmailVerified !== undefined) {
      query.isEmailVerified = isEmailVerified === 'true';
    }

    if (approvalStatus && approvalStatus !== 'all') {
      if (approvalStatus === 'approved') {
        query.approvalStatus = { $in: ['approved', null] };
      } else {
        query.approvalStatus = approvalStatus;
      }
    }

    // Search by name, phone, or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter for people added by this specific admin
    if (req.query.createdByMe === 'true' && req.user?._id) {
      query.createdByAdmin = req.user._id;
    }

    // Apply Geographic Scope Filter for scoped Admins
    const scopeFilter = buildAdminScopeFilter(req.user, 'user');
    const finalQuery = Object.keys(scopeFilter).length > 0
      ? { $and: [query, scopeFilter] }
      : query;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch users, total count, and myRegistrations in parallel with .lean()
    const [users, total, myCount] = await Promise.all([
      User.find(finalQuery)
        .select('-password -mpin')
        .populate('createdByAdmin', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(finalQuery),
      req.user?._id ? User.countDocuments({ createdByAdmin: req.user._id }) : 0
    ]);

    res.status(200).json({
      success: true,
      data: users,
      counts: {
        total,
        myRegistrations: myCount
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users. Please try again.'
    });
  }
};

/**
 * Get user details
 */
const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password').populate('createdByAdmin', 'name email role');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // IDOR protection: verify user is within admin's geographic scope
    if (!verifyResourceScope(req.user, user.toObject ? user.toObject() : user, 'user')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This user is outside your assigned geographic scope.'
      });
    }

    // Get user booking stats
    const bookingStats = await Booking.aggregate([
      {
        $match: { userId: user._id }
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          completedBookings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          totalSpent: {
            $sum: {
              $cond: [
                { $eq: ['$paymentStatus', 'success'] },
                '$finalAmount',
                0
              ]
            }
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        user,
        stats: bookingStats[0] || {
          totalBookings: 0,
          completedBookings: 0,
          totalSpent: 0
        }
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details. Please try again.'
    });
  }
};

/**
 * Block/unblock user
 */
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = isActive !== undefined ? isActive : !user.isActive;
    await user.save();

    await auditAdminAction(
      req,
      user.isActive ? 'ACTIVATE_USER' : 'BLOCK_USER',
      'USER_MANAGEMENT',
      `${user.isActive ? 'Activated' : 'Blocked'} farmer "${user.name}" (${user.phone})`,
      user._id,
      'User',
      user.name
    );

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'blocked'} successfully`,
      data: user
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status. Please try again.'
    });
  }
};

/**
 * Delete user (soft delete)
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Farmer not found'
      });
    }

    await auditAdminAction(
      req,
      'DELETE_USER',
      'USER_MANAGEMENT',
      `Deleted farmer "${user.name}" (${user.phone})`,
      user._id,
      'User',
      user.name
    );

    res.status(200).json({
      success: true,
      message: 'Farmer deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete farmer. Please try again.'
    });
  }
};

/**
 * View user bookings
 */
const getUserBookings = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { userId: id };
    if (status) {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings
    const bookings = await Booking.find(query)
      .populate('vendorId', 'name businessName')
      .populate('serviceId', 'title iconUrl')
      .populate('workerId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user bookings. Please try again.'
    });
  }
};

/**
 * View user wallet transactions
 */
const getUserWalletTransactions = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('wallet');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get wallet transactions from bookings
    const transactions = await Booking.find({
      userId: id,
      paymentMethod: 'wallet',
      paymentStatus: 'success'
    })
      .select('bookingNumber finalAmount createdAt')
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      data: {
        balance: user.wallet.balance || 0,
        transactions
      }
    });
  } catch (error) {
    console.error('Get user wallet transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet transactions. Please try again.'
    });
  }
};

/**
 * Get all user bookings with filters and pagination
 */
const getAllUserBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    // Search by user name or phone
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const userIds = users.map(u => u._id);
      query.userId = { $in: userIds };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(query)
      .populate('userId', 'name phone email')
      .populate('workerId', 'name phone')
      .populate('serviceId', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user bookings'
    });
  }
};

/**
 * Update User KYC Status (for Equipment Owners)
 */
const updateKycStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.kyc_status = status;
    await user.save();

    res.status(200).json({
      success: true,
      message: `KYC status updated to ${status}`,
      data: user
    });
  } catch (error) {
    console.error('Update KYC status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update KYC status' });
  }
};

/**
 * Add a new user directly (Admin)
 */
const addUser = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone are required'
      });
    }

    // Validate 10-digit Indian mobile number
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    const indianMobileRegex = /^[6-9]\d{9}$/;
    if (!cleanPhone || cleanPhone.length !== 10 || !indianMobileRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone: cleanPhone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists'
      });
    }

    // Create user with admin traceability + geographic scope
    const userCity = req.body.city || req.user?.cityName || '';
    const userDistrict = req.body.district || req.user?.districtName || '';
    const userSubDistrict = req.body.subDistrict || req.user?.subDistrictName || '';

    // Auto-assign admin's scope fields (Phase 4: scope enforcement on create)
    const scopeFields = extractAdminScopeFields(req.user);

    const isSuperAdmin = req.user?.role === 'super_admin';
    const userData = {
      name: name.trim(),
      phone: cleanPhone,
      email: email || null,
      isPhoneVerified: true, // Auto verify since admin is adding
      isActive: true,
      approvalStatus: 'approved',
      approvalDate: new Date(),
      ...scopeFields, // auto-assign districtId/subDistrictId from creating admin's scope
      createdByAdmin: req.user?._id || null,
      createdByType: isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
      creationSource: isSuperAdmin ? 'SUPER_ADMIN_CREATED' : 'ADMIN_CREATED',
      createdByAdminSnapshot: req.user ? {
        adminId: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      } : null
    };

    if (userCity || userDistrict || userSubDistrict) {
      userData.addresses = [{
        addressLine1: req.body.address || '',
        city: userCity,
        district: userDistrict,
        subDistrict: userSubDistrict,
        state: req.body.state || 'Maharashtra',
        pincode: req.body.pincode || '',
        isDefault: true
      }];
    }

    const user = await User.create(userData);

    await auditAdminAction(
      req,
      'CREATE_USER',
      'USER_MANAGEMENT',
      `Registered new farmer "${user.name}" (${user.phone})`,
      user._id,
      'User',
      user.name
    );

    res.status(201).json({
      success: true,
      message: 'Farmer added successfully',
      data: user
    });
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add farmer'
    });
  }
};

/**
 * Approve or Reject Farmer (User)
 */
const updateApprovalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalStatus, rejectionReason } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid approval status. Must be approved, rejected, or pending.'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Farmer not found'
      });
    }

    user.approvalStatus = approvalStatus;
    if (approvalStatus === 'approved') {
      user.approvalDate = new Date();
      user.rejectionReason = null;
    } else if (approvalStatus === 'rejected') {
      user.rejectionReason = rejectionReason || 'Registration rejected by admin';
    }

    await user.save();

    await auditAdminAction(
      req,
      approvalStatus === 'approved' ? 'APPROVE_USER' : approvalStatus === 'rejected' ? 'REJECT_USER' : 'UPDATE_APPROVAL_USER',
      'USER_MANAGEMENT',
      `Farmer "${user.name}" (${user.phone}) application ${approvalStatus}${approvalStatus === 'rejected' ? ': ' + user.rejectionReason : ''}`,
      user._id,
      'User',
      user.name
    );

    // Trigger Referral Reward Qualification if user was referred
    if (approvalStatus === 'approved') {
      try {
        const referralService = require('../../services/referralService');
        await referralService.qualifyAndRewardReferral({
          referredUserId: user._id,
          event: 'approval'
        });
      } catch (refErr) {
        console.error('Referral qualification error for approved farmer:', refErr);
      }
    }

    // Send notification to user
    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      if (approvalStatus === 'approved') {
        await createNotification({
          userId: user._id,
          type: 'farmer_approved',
          title: '🌾 Account Approved!',
          message: 'Your Farmer account has been approved by admin. You can now login and book services.',
          relatedId: user._id,
          relatedType: 'user'
        });
      } else if (approvalStatus === 'rejected') {
        await createNotification({
          userId: user._id,
          type: 'farmer_rejected',
          title: '❌ Account Application Update',
          message: `Your account application was not approved. Reason: ${user.rejectionReason}`,
          relatedId: user._id,
          relatedType: 'user'
        });
      }
    } catch (notifErr) {
      console.error('Notification error on farmer approval update:', notifErr);
    }

    res.status(200).json({
      success: true,
      message: `Farmer ${approvalStatus} successfully`,
      data: user
    });
  } catch (error) {
    console.error('Update farmer approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update farmer approval status'
    });
  }
};

module.exports = {
  getAllUsers,
  getUserDetails,
  toggleUserStatus,
  deleteUser,
  getUserBookings,
  getUserWalletTransactions,
  getAllUserBookings,
  updateKycStatus,
  addUser,
  updateApprovalStatus
};
