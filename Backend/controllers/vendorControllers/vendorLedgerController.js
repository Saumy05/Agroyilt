const Wallet = require('../../models/Wallet');
const WalletTransaction = require('../../models/WalletTransaction');
const PayoutRequest = require('../../models/PayoutRequest');
const Vendor = require('../../models/Vendor');

exports.getWalletBalance = async (req, res) => {
  try {
    const vendorId = req.user.id;
    let wallet = await Wallet.findOne({ userId: vendorId, userModel: 'Vendor' });
    
    if (!wallet) {
      wallet = await Wallet.create({ userId: vendorId, userModel: 'Vendor', balance: 0 });
    }

    res.status(200).json({ success: true, data: { balance: wallet.balance, currency: wallet.currency } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch balance' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { dateFrom, dateTo, type, page = 1, limit = 20 } = req.query;
    
    const wallet = await Wallet.findOne({ userId: vendorId, userModel: 'Vendor' });
    if (!wallet) return res.status(200).json({ success: true, data: [] });

    // 'failed' rows are idempotency guards for declined debits; they moved no money (admin views are separate)
    const query = { walletId: wallet._id, status: { $ne: 'failed' } };
    if (type) query.type = type;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const transactions = await WalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

exports.requestPayout = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { amount } = req.body; 

    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

    const pendingReq = await PayoutRequest.findOne({ vendorId, status: { $in: ['requested', 'processing'] } });
    if (pendingReq) {
      return res.status(400).json({ success: false, message: 'You already have a pending payout request' });
    }

    const wallet = await Wallet.findOne({ userId: vendorId, userModel: 'Vendor' });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const vendor = await Vendor.findById(vendorId).select('bankDetails');
    if (!vendor.bankDetails || !vendor.bankDetails.accountNumber) {
      return res.status(400).json({ success: false, message: 'Bank details not found in profile' });
    }

    const payoutReq = await PayoutRequest.create({
      vendorId,
      amount,
      bankDetailsSnapshot: vendor.bankDetails
    });

    res.status(201).json({ success: true, message: 'Payout requested successfully', data: payoutReq });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to request payout' });
  }
};

exports.getPayoutRequests = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const requests = await PayoutRequest.find({ vendorId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch payout requests' });
  }
};
