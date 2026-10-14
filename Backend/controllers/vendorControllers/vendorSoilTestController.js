const SoilTestRequest = require('../../models/SoilTestRequest');
const Admin = require('../../models/Admin');
const { createNotification } = require('../notificationControllers/notificationController');

/**
 * Vendor: Get all soil test requests assigned to me
 */
exports.getMyRequests = async (req, res) => {
    try {
        const requests = await SoilTestRequest.find({ vendorId: req.user._id })
            .populate('userId', 'name phoneNumber')
            .sort('-updatedAt');

        res.status(200).json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Vendor: Update status of an assigned request
 * Allowed: assigned -> sample_collected -> at_lab
 */
exports.updateRequestStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowedStatuses = ['sample_collected', 'at_lab'];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status. Allowed: sample_collected, at_lab' });
        }

        const request = await SoilTestRequest.findOne({
            _id: req.params.id,
            vendorId: req.user._id
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found or not assigned to you' });
        }

        request.status = status;
        await request.save();

        // Notify User about status update
        try {
            await createNotification({
                userId: request.userId,
                type: 'soil_test_status_updated',
                title: status === 'sample_collected' ? '🧪 Sample Collected' : '🔬 Sample Reached Lab',
                message: status === 'sample_collected'
                    ? 'Your soil sample has been collected. It is being sent to the lab.'
                    : 'Your soil sample has reached the lab. Results coming soon!',
                relatedId: request._id,
                relatedType: 'service',
                pushData: {
                    type: 'soil_test_status_updated',
                    requestId: request._id.toString(),
                    link: '/user/soil-testing'
                }
            });
        } catch (noticeErr) {
            console.error('Notification error (User Status Update):', noticeErr);
        }

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Vendor: Upload soil lab report
 */
exports.uploadReport = async (req, res) => {
    try {
        const { reportUrl } = req.body;

        if (!reportUrl) {
            return res.status(400).json({ success: false, message: 'Please provide report URL' });
        }

        const request = await SoilTestRequest.findOne({
            _id: req.params.id,
            vendorId: req.user._id
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found or not assigned to you' });
        }

        request.reportUrl = reportUrl;
        request.reportStatus = 'uploaded';
        request.reportDate = Date.now();

        if (request.status === 'sample_collected' || request.status === 'assigned') {
            request.status = 'at_lab';
        }

        await request.save();

        // Push Notification: Notify Admins that report is uploaded
        try {
            const admins = await Admin.find({ isActive: true });
            const notifications = admins.map(admin => createNotification({
                adminId: admin._id,
                type: 'soil_test_report_uploaded',
                title: 'Soil Report Uploaded',
                message: `Vendor ${req.user.name || 'A vendor'} has uploaded a soil report for request #${request._id.toString().slice(-6)}.`,
                relatedId: request._id,
                relatedType: 'service',
                pushData: {
                    type: 'soil_test_report_uploaded',
                    requestId: request._id.toString(),
                    link: '/admin/soil-tests'
                }
            }));
            await Promise.all(notifications);
        } catch (noticeErr) {
            console.error('Notification error (Admin Update):', noticeErr);
        }

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Vendor: Reject an assigned request
 */
exports.rejectRequest = async (req, res) => {
    try {
        const { reason } = req.body;
        const request = await SoilTestRequest.findOne({
            _id: req.params.id,
            vendorId: req.user._id
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found or not assigned to you' });
        }

        if (request.status !== 'assigned') {
            return res.status(400).json({ success: false, message: 'Cannot reject request in current status: ' + request.status });
        }

        // Add current vendor to rejection history
        if (!request.rejectedByVendors) request.rejectedByVendors = [];
        request.rejectedByVendors.push(req.user._id);

        // Update status for visibility to Admin & User
        request.status = 'cancelled';
        request.rejectionReason = reason || 'No reason provided';

        await request.save();

        // Push Notification: Notify the User that their request was rejected
        try {
            if (request.userId) {
                await createNotification({
                    userId: request.userId,
                    type: 'soil_test_rejected',
                    title: 'Soil Test Request Cancelled',
                    message: `Your soil test request has been cancelled by the assigned lab. Reason: ${reason || 'Not specified'}.`,
                    relatedId: request._id,
                    relatedType: 'service',
                    pushData: {
                        type: 'soil_test_rejected',
                        requestId: request._id.toString(),
                        link: '/user/soil-testing'
                    }
                });
            }
        } catch (noticeErr) {
            console.error('Notification error (User Rejection Update):', noticeErr);
        }

        // Push Notification: Notify Admins that request is rejected
        try {
            const admins = await Admin.find({ isActive: true });
            const notifications = admins.map(admin => createNotification({
                adminId: admin._id,
                type: 'soil_test_rejected_by_vendor',
                title: '🚫 Soil Test Rejected',
                message: `Vendor ${req.user.name || 'A vendor'} has rejected task #${request._id.toString().slice(-6)}. Reason: ${reason || 'Not specified'}`,
                relatedId: request._id,
                relatedType: 'service',
                pushData: {
                    type: 'soil_test_rejected_by_vendor',
                    requestId: request._id.toString(),
                    link: '/admin/soil-tests'
                }
            }));
            await Promise.all(notifications);
        } catch (noticeErr) {
            console.error('Notification error (Admin Rejection Update):', noticeErr);
        }

        res.status(200).json({ 
            success: true, 
            message: 'Request rejected successfully. It is now available for other vendors.' 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
