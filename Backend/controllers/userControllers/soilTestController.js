const SoilTestRequest = require('../../models/SoilTestRequest');
const Admin = require('../../models/Admin');
const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Transaction = require('../../models/Transaction');
const { createNotification } = require('../notificationControllers/notificationController');
const { createOrder, verifyPayment } = require('../../services/razorpayService');
const onlinePaymentService = require('../../services/onlinePaymentService');

/**
 * User: Create Soil Test Request
 */
const createSoilTestRequest = async (req, res) => {
    try {
        const { landSize, location, latitude, longitude, cropType, testType, phoneNumber } = req.body;

        const newRequest = new SoilTestRequest({
            userId: req.user.id,
            landSize,
            location,
            latitude,
            longitude,
            cropType,
            testType,
            phoneNumber
        });

        await newRequest.save();

        // Notify Admins
        try {
            const admins = await Admin.find({ isActive: true });
            const notifications = admins.map(admin => createNotification({
                adminId: admin._id,
                type: 'soil_test_request',
                title: '🌾 New Soil Test Request',
                message: `Farmer ${req.user.name || 'A user'} has requested a soil test for ${landSize} land.`,
                relatedId: newRequest._id,
                relatedType: 'service',
                pushData: {
                    type: 'soil_test_request',
                    requestId: newRequest._id.toString(),
                    farmerName: req.user.name,
                    link: '/admin/soil-tests'
                }
            }));
            await Promise.all(notifications);
        } catch (noticeErr) {
            console.error('[SoilTest] Notification error:', noticeErr);
        }

        res.status(201).json({
            success: true,
            message: 'Soil test request submitted successfully!',
            data: newRequest
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * User: Get my soil test requests
 */
const getMySoilTestRequests = async (req, res) => {
    try {
        const requests = await SoilTestRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: requests
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * User: Pay for Soil Test Report
 */
const payForSoilTestReport = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentMethod } = req.body; // 'wallet' or 'online'
        const userId = req.user.id;

        const request = await SoilTestRequest.findById(id);
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
        if (request.paymentStatus === 'paid') return res.status(400).json({ success: false, message: 'Already paid' });
        if (request.reportStatus !== 'approved') return res.status(400).json({ success: false, message: 'Report is not approved yet' });

        const amount = request.totalAmount || 0;
        if (amount === 0) {
            // Free report
            request.paymentStatus = 'paid';
            request.paymentMethod = 'free';
            await request.save();
            return res.status(200).json({ success: true, message: 'Report is free. Access granted.', isFree: true });
        }

        if (paymentMethod === 'wallet') {
            try {
                const user = await User.findById(userId);
                const currentBalance = user.wallet?.balance || 0;

                if (currentBalance < amount) {
                    return res.status(400).json({ success: false, message: 'Insufficient wallet balance', needsOnlinePayment: true });
                }

                // Initialize wallet if missing
                if (!user.wallet) user.wallet = { balance: 0 };
                
                user.wallet.balance = currentBalance - amount;
                await user.save();

                // Record User Txn
                await Transaction.create({
                    userId: user._id, 
                    type: 'debit', 
                    amount: amount, 
                    status: 'completed',
                    paymentMethod: 'wallet', 
                    description: 'Paid for Soil Test Report',
                    balanceBefore: currentBalance,
                    balanceAfter: user.wallet.balance, 
                    referenceId: request._id.toString()
                });

                // Credit Vendor Wallet
                if (request.vendorId && request.vendorEarning > 0) {
                    const vendor = await Vendor.findById(request.vendorId);
                    if (vendor) {
                        const vendorPrevEarnings = vendor.wallet?.earnings || 0;
                        if (!vendor.wallet) vendor.wallet = { earnings: 0, dues: 0 };
                        
                        vendor.wallet.earnings = vendorPrevEarnings + request.vendorEarning;
                        await vendor.save();

                        // Record Vendor Txn
                        await Transaction.create({
                            vendorId: vendor._id, 
                            type: 'credit', 
                            amount: request.vendorEarning, 
                            status: 'completed',
                            paymentMethod: 'system', 
                            description: 'Earnings from Soil Test Report',
                            balanceBefore: vendorPrevEarnings,
                            balanceAfter: vendor.wallet.earnings, 
                            referenceId: request._id.toString()
                        });

                        // Push Notification: Notify Vendor about credit
                        try {
                            await createNotification({
                                vendorId: vendor._id,
                                type: 'soil_test_payment_received',
                                title: '💰 Payment Received',
                                message: `You have earned ₹${request.vendorEarning} for the completed soil test (ID: ${request._id.toString().slice(-6)}).`,
                                relatedId: request._id,
                                relatedType: 'service',
                                pushData: {
                                    type: 'soil_test_payment_received',
                                    requestId: request._id.toString(),
                                    amount: request.vendorEarning,
                                    link: '/vendor/soil-tests'
                                }
                            });
                        } catch (noticeErr) {
                            console.error('Notification error (Vendor Credit):', noticeErr);
                        }
                    }
                }

                request.paymentStatus = 'paid';
                request.paymentMethod = 'wallet';
                request.transactionId = `WLT_${Date.now()}`;
                await request.save();

                return res.status(200).json({ success: true, message: 'Payment successful via Wallet', paid: true });
            } catch (wErr) {
                console.error("Wallet Payment Error:", wErr);
                return res.status(500).json({ success: false, message: 'Wallet payment failed: ' + wErr.message });
            }
        }

        // Online (Razorpay)
        try {
            const shortId = request._id.toString().slice(-6);
            const orderResult = await createOrder(amount, 'INR', `SOIL_${shortId}_${Date.now()}`, { type: 'soil_test', userId: userId.toString(), requestId: request._id.toString() });
            
            if (!orderResult.success) {
                return res.status(500).json({ success: false, message: 'Failed to create payment order: ' + (orderResult.error || 'Unknown Razorpay Error') });
            }

            return res.status(200).json({
                success: true,
                data: {
                    orderId: orderResult.orderId,
                    amount: orderResult.amount / 100,
                    currency: orderResult.currency,
                    key: process.env.RAZORPAY_KEY_ID
                }
            });
        } catch (oErr) {
            console.error("Online Payment Init Error:", oErr);
            return res.status(500).json({ success: false, message: 'Online payment init failed: ' + oErr.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * User: Verify Razorpay Payment for Soil Test
 */
const verifySoilTestPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const userId = req.user.id;

        const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
        if (!isValid) return res.status(400).json({ success: false, message: 'Invalid payment signature' });

        // price + user come from the order the server created; one payment unlocks the report once (the webhook may have got there first)
        const result = await onlinePaymentService.applySoilTestPayment({
            orderId: razorpay_order_id, paymentId: razorpay_payment_id, userId, requestId: id
        });
        if (!result.ok) return res.status(result.code || 400).json({ success: false, message: result.reason });

        res.status(200).json({
            success: true,
            message: 'Payment verified successfully and report unlocked!'
        });
    } catch (error) {
        console.error("Payment Verify Catch Err:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateSoilTestRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { landSize, location, latitude, longitude, cropType, testType, phoneNumber } = req.body;

        const request = await SoilTestRequest.findById(id);
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
        
        if (request.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (request.status !== 'pending' || request.vendorId) {
            return res.status(400).json({ success: false, message: 'Cannot edit request as it has already been assigned to a lab.' });
        }

        request.landSize = landSize !== undefined ? landSize : request.landSize;
        request.location = location !== undefined ? location : request.location;
        request.latitude = latitude !== undefined ? latitude : request.latitude;
        request.longitude = longitude !== undefined ? longitude : request.longitude;
        request.cropType = cropType !== undefined ? cropType : request.cropType;
        request.testType = testType !== undefined ? testType : request.testType;
        request.phoneNumber = phoneNumber !== undefined ? phoneNumber : request.phoneNumber;

        await request.save();

        res.status(200).json({
            success: true,
            message: 'Soil test request updated successfully!',
            data: request
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const deleteSoilTestRequest = async (req, res) => {
    try {
        const { id } = req.params;

        const request = await SoilTestRequest.findById(id);
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

        if (request.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (request.status !== 'pending' || request.vendorId) {
            return res.status(400).json({ success: false, message: 'Cannot delete request as it has already been assigned to a lab.' });
        }

        await SoilTestRequest.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Soil test request deleted successfully!'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createSoilTestRequest,
    getMySoilTestRequests,
    payForSoilTestReport,
    verifySoilTestPayment,
    updateSoilTestRequest,
    deleteSoilTestRequest
};
