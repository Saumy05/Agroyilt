const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');

/**
 * Get Public Stats for Landing Page
 * GET /api/public/stats
 */
exports.getPublicStats = async (req, res) => {
    try {
        const farmerCount = await User.countDocuments({ role: 'user', isActive: true });
        const ownerCount = await Vendor.countDocuments({ approvalStatus: 'approved', isActive: true });
        const workerCount = await Worker.countDocuments({ 
            approvalStatus: 'approved', 
            isActive: true,
            isDeleted: { $ne: true }
        });

        res.status(200).json({
            success: true,
            data: {
                farmers: farmerCount,
                owners: ownerCount,
                workers: workerCount
            }
        });
    } catch (error) {
        console.error('Get public stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch platform stats'
        });
    }
};
