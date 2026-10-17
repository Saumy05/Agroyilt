const Product = require('../../models/Product');

/**
 * Admin: Get all products (Central Store + Approved Vendor Products)
 * Includes both admin-added products and vendor products that have been approved
 */
const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find({
            $or: [
                { vendorId: null },                           // Admin/Central Store products
                { vendorId: { $ne: null }, approvalStatus: 'approved' } // Approved Vendor products
            ]
        })
        .populate('categoryId', 'title')
        .populate({ 
            path: 'vendorId', 
            select: 'name businessName phone profilePhoto cityId',
            populate: { path: 'cityId', select: 'name' }
        })
        .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
};

/**
 * Admin: Get all vendor submitted products
 */
const getVendorProducts = async (req, res) => {
    try {
        const { approvalStatus, type } = req.query;
        const query = { vendorId: { $ne: null } };
        if (approvalStatus) query.approvalStatus = approvalStatus;
        if (type) query.type = type;

        const products = await Product.find(query)
            .populate('categoryId', 'title')
            .populate({ 
                path: 'vendorId', 
                select: 'name businessName phone profilePhoto cityId',
                populate: { path: 'cityId', select: 'name' }
            })
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch vendor products' });
    }
};

/**
 * Admin: Approve vendor product & set tax/commission
 */
const approveProduct = async (req, res) => {
    try {
        const { commissionPercentage, gstPercentage } = req.body;
        
        const product = await Product.findOneAndUpdate(
            { _id: req.params.id, vendorId: { $ne: null } },
            { 
                approvalStatus: 'approved', 
                rejectionReason: null,
                commissionPercentage: Number(commissionPercentage) || 0,
                gstPercentage: Number(gstPercentage) || 5,
                status: 'active'
            },
            { new: true }
        );

        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.status(200).json({ success: true, message: 'Product approved. Now live on marketplace.', data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to approve product' });
    }
};

/**
 * Admin: Reject vendor product
 */
const rejectProduct = async (req, res) => {
    try {
        const { reason } = req.body;
        const product = await Product.findOneAndUpdate(
            { _id: req.params.id, vendorId: { $ne: null } },
            { 
                approvalStatus: 'rejected', 
                rejectionReason: reason || 'Not meeting platform standards',
                status: 'inactive'
            },
            { new: true }
        );
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.status(200).json({ success: true, message: 'Product rejected.', data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to reject product' });
    }
};

/**
 * Admin: Create/Update/Delete (Central Store)
 */
const createProduct = async (req, res) => {
    try {
        const product = new Product({ ...req.body, vendorId: null, approvalStatus: 'approved' });
        await product.save();
        res.status(201).json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.status(200).json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update product' });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.status(200).json({ success: true, message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
};

module.exports = {
    getAllProducts,
    getVendorProducts,
    approveProduct,
    rejectProduct,
    createProduct,
    updateProduct,
    deleteProduct
};
