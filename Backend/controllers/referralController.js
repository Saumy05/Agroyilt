const referralService = require('../services/referralService');
const ReferralRewardConfig = require('../models/ReferralRewardConfig');
const ReferralAttribution = require('../models/ReferralAttribution');
const ReferralCode = require('../models/ReferralCode');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Worker = require('../models/Worker');

/**
 * Public: Validate referral code during onboarding / register
 */
exports.validateCode = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Referral code is required' });
    }

    const candidateUserId = req.user?.id || req.user?._id || null;
    const result = await referralService.validateReferralCode(code, candidateUserId);

    if (!result.isValid) {
      return res.status(400).json({
        success: false,
        message: result.message || 'Invalid referral code'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Valid referral code',
      data: result
    });
  } catch (error) {
    console.error('[validateCode error]:', error);
    return res.status(500).json({ success: false, message: 'Error validating referral code' });
  }
};

/**
 * Authenticated: Get my referral code, link, stats & history
 * Supports User (Farmer), Vendor, Worker
 */
exports.getMyReferral = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    // Determine model
    let userModel = 'User';
    if (req.user.role === 'vendor' || req.originalUrl.includes('vendor')) {
      userModel = 'Vendor';
    } else if (req.user.role === 'worker' || req.originalUrl.includes('worker')) {
      userModel = 'Worker';
    }

    const stats = await referralService.getUserReferralStats(userId, userModel);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[getMyReferral error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch referral details' });
  }
};

/**
 * Public: which roles currently have the referral program on (apps hide all referral UI when off)
 */
exports.getPublicStatus = async (req, res) => {
  try {
    const config = await referralService.getOrCreateConfig();
    const on = (role) => !!config.systemEnabled && !!config.roles?.[role]?.enabled;
    return res.status(200).json({
      success: true,
      data: { farmer: on('farmer'), vendor: on('vendor'), worker: on('worker') }
    });
  } catch (error) {
    console.error('[getPublicStatus error]:', error);
    // Fail closed: if we can't tell, treat the program as off
    return res.status(200).json({ success: true, data: { farmer: false, vendor: false, worker: false } });
  }
};

/**
 * Admin: Get referral system configuration & audit history
 */
exports.getAdminSettings = async (req, res) => {
  try {
    const config = await referralService.getOrCreateConfig();

    return res.status(200).json({
      success: true,
      data: {
        systemEnabled: config.systemEnabled,
        registrationUrl: config.registrationUrl || 'https://agroyilt.com/app/register',
        qualificationEvent: config.qualificationEvent,
        version: config.version,
        roles: {
          farmer: {
            enabled: config.roles.farmer.enabled,
            rewardAmount: Math.round(config.roles.farmer.rewardAmountPaise / 100),
            rewardAmountPaise: config.roles.farmer.rewardAmountPaise
          },
          vendor: {
            enabled: config.roles.vendor.enabled,
            rewardAmount: Math.round(config.roles.vendor.rewardAmountPaise / 100),
            rewardAmountPaise: config.roles.vendor.rewardAmountPaise
          },
          worker: {
            enabled: config.roles.worker.enabled,
            rewardAmount: Math.round(config.roles.worker.rewardAmountPaise / 100),
            rewardAmountPaise: config.roles.worker.rewardAmountPaise
          }
        },
        auditHistory: config.auditHistory.slice(-50).reverse()
      }
    });
  } catch (error) {
    console.error('[getAdminSettings error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

/**
 * Admin: Update referral system configuration
 */
exports.updateAdminSettings = async (req, res) => {
  try {
    const { systemEnabled, qualificationEvent, roles, registrationUrl } = req.body;
    const adminId = req.user.id || req.user._id;
    const adminEmail = req.user.email || 'admin@agroyilt.com';

    const config = await referralService.getOrCreateConfig();
    const audits = [];

    // System toggle audit
    if (systemEnabled !== undefined && systemEnabled !== config.systemEnabled) {
      audits.push({
        adminId,
        adminEmail,
        role: 'system',
        field: 'systemEnabled',
        oldValue: config.systemEnabled,
        newValue: systemEnabled,
        timestamp: new Date()
      });
      config.systemEnabled = systemEnabled;
    }

    // Registration link URL audit
    if (registrationUrl !== undefined && registrationUrl.trim() && registrationUrl.trim() !== (config.registrationUrl || '')) {
      const cleanUrl = registrationUrl.trim();
      audits.push({
        adminId,
        adminEmail,
        role: 'system',
        field: 'registrationUrl',
        oldValue: config.registrationUrl || 'https://agroyilt.com/app/register',
        newValue: cleanUrl,
        timestamp: new Date(),
        notes: `Updated registration link to ${cleanUrl}`
      });
      config.registrationUrl = cleanUrl;
    }

    if (qualificationEvent) {
      const canonicalEvent = referralService.normalizeQualificationEvent(qualificationEvent);
      if (canonicalEvent !== config.qualificationEvent) {
        audits.push({
          adminId,
          adminEmail,
          role: 'system',
          field: 'qualificationEvent',
          oldValue: config.qualificationEvent,
          newValue: canonicalEvent,
          timestamp: new Date()
        });
        config.qualificationEvent = canonicalEvent;
      }
    }

    // Role rewards audit & updates (stored strictly in paise)
    if (roles) {
      ['farmer', 'vendor', 'worker'].forEach((roleName) => {
        if (roles[roleName]) {
          const roleInput = roles[roleName];

          // Check reward amount in Rupees converted to Paise
          if (roleInput.rewardAmount !== undefined) {
            const newPaise = Math.round(Number(roleInput.rewardAmount) * 100);
            const oldPaise = config.roles[roleName].rewardAmountPaise;

            if (newPaise !== oldPaise) {
              audits.push({
                adminId,
                adminEmail,
                role: roleName,
                field: 'rewardAmountPaise',
                oldValue: oldPaise,
                newValue: newPaise,
                timestamp: new Date(),
                notes: `Changed from ₹${oldPaise / 100} to ₹${newPaise / 100}`
              });
              config.roles[roleName].rewardAmountPaise = newPaise;
            }
          }

          if (roleInput.enabled !== undefined && roleInput.enabled !== config.roles[roleName].enabled) {
            audits.push({
              adminId,
              adminEmail,
              role: roleName,
              field: 'enabled',
              oldValue: config.roles[roleName].enabled,
              newValue: roleInput.enabled,
              timestamp: new Date()
            });
            config.roles[roleName].enabled = roleInput.enabled;
          }
        }
      });
    }

    if (audits.length > 0) {
      config.version += 1;
      config.auditHistory.push(...audits);
      await config.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Referral settings updated successfully',
      data: {
        version: config.version,
        systemEnabled: config.systemEnabled,
        registrationUrl: config.registrationUrl,
        qualificationEvent: config.qualificationEvent,
        roles: config.roles
      }
    });
  } catch (error) {
    console.error('[updateAdminSettings error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to update referral settings' });
  }
};

/**
 * Admin: Get referral dashboard statistics and attributions table
 */
exports.getAdminAttributions = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = {};
    if (role && role !== 'all') query.referredRole = role.toLowerCase();
    if (status && status !== 'all') query.status = status;
    if (search) {
      query.$or = [
        { referralCode: new RegExp(search.trim(), 'i') }
      ];
    }

    const [attributions, totalCount, totalQualifiedCount, totalRewardSum] = await Promise.all([
      ReferralAttribution.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ReferralAttribution.countDocuments(query),
      ReferralAttribution.countDocuments({ status: 'qualified' }),
      ReferralAttribution.aggregate([
        { $match: { rewardStatus: 'rewarded' } },
        { $group: { _id: null, totalPaise: { $sum: '$rewardAmountPaise' } } }
      ])
    ]);

    // Populate user names
    const populated = await Promise.all(attributions.map(async (attr) => {
      let referrerName = 'N/A';
      let referrerPhone = '';
      let referredName = 'N/A';
      let referredPhone = '';

      try {
        if (attr.referrerModel === 'User') {
          const u = await User.findById(attr.referrerId).select('name phone').lean();
          if (u) { referrerName = u.name; referrerPhone = u.phone; }
        } else if (attr.referrerModel === 'Vendor') {
          const v = await Vendor.findById(attr.referrerId).select('name businessName phone').lean();
          if (v) { referrerName = v.businessName || v.name; referrerPhone = v.phone; }
        } else if (attr.referrerModel === 'Worker') {
          const w = await Worker.findById(attr.referrerId).select('name phone').lean();
          if (w) { referrerName = w.name; referrerPhone = w.phone; }
        }

        if (attr.referredModel === 'User') {
          const u = await User.findById(attr.referredUserId).select('name phone').lean();
          if (u) { referredName = u.name; referredPhone = u.phone; }
        } else if (attr.referredModel === 'Vendor') {
          const v = await Vendor.findById(attr.referredUserId).select('name businessName phone').lean();
          if (v) { referredName = v.businessName || v.name; referredPhone = v.phone; }
        } else if (attr.referredModel === 'Worker') {
          const w = await Worker.findById(attr.referredUserId).select('name phone').lean();
          if (w) { referredName = w.name; referredPhone = w.phone; }
        }
      } catch (e) {
        // ignore
      }

      return {
        ...attr,
        referrerName,
        referrerPhone,
        referredName,
        referredPhone,
        rewardAmountRupees: attr.rewardAmount || Math.round((attr.rewardAmountPaise || 0) / 100)
      };
    }));

    const totalPaidPaise = totalRewardSum[0]?.totalPaise || 0;

    return res.status(200).json({
      success: true,
      data: {
        attributions: populated,
        pagination: {
          total: totalCount,
          page: Number(page),
          pages: Math.ceil(totalCount / Number(limit))
        },
        stats: {
          totalAttributions: totalCount,
          totalQualified: totalQualifiedCount,
          totalPaidRupees: Math.round(totalPaidPaise / 100)
        }
      }
    });
  } catch (error) {
    console.error('[getAdminAttributions error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch attributions' });
  }
};

/**
 * Admin: Reverse a referral reward
 */
exports.reverseReward = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id || req.user._id;

    const result = await referralService.reverseReferralReward({
      attributionId: id,
      adminId,
      reason
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Referral reward reversed successfully'
    });
  } catch (error) {
    console.error('[reverseReward error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to reverse reward' });
  }
};
