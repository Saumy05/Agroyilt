const FAQ = require('../../models/FAQ');
const About = require('../../models/About');

// ==================== FAQ Controllers ====================

// @desc    Get all FAQs (Public & Admin)
exports.getFAQs = async (req, res) => {
    try {
        const query = req.user && req.user.role === 'admin' ? {} : { isActive: true };
        const faqs = await FAQ.find(query).sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: faqs.length, data: faqs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Create new FAQ (Admin)
exports.createFAQ = async (req, res) => {
    try {
        const faq = await FAQ.create(req.body);
        res.status(201).json({ success: true, data: faq });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Update FAQ (Admin)
exports.updateFAQ = async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
        res.status(200).json({ success: true, data: faq });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Delete FAQ (Admin)
exports.deleteFAQ = async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndDelete(req.params.id);
        if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// ==================== About Controllers ====================

// @desc    Get About Content (Public & Admin)
exports.getAbout = async (req, res) => {
    try {
        let about = await About.findOne();
        if (!about) {
            about = await About.create({ title: 'About Us', content: '<p>Welcome to Agroyilt.</p>' });
        }
        res.status(200).json({ success: true, data: about });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update About Content (Admin)
exports.updateAbout = async (req, res) => {
    try {
        let about = await About.findOne();
        if (about) {
            about = await About.findByIdAndUpdate(about._id, req.body, { new: true, runValidators: true });
        } else {
            about = await About.create(req.body);
        }
        res.status(200).json({ success: true, data: about });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

const AppGuide = require('../../models/AppGuide');

// ==================== App Guide Controllers ====================

// @desc    Get App Guide Content (Public & Admin)
exports.getAppGuide = async (req, res) => {
    try {
        let guide = await AppGuide.findOne();
        if (!guide) {
            guide = await AppGuide.create({ questions: [{ question: 'How to book?', answer: 'Select a machine and click book.' }] });
        }
        res.status(200).json({ success: true, data: guide });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update App Guide Content (Admin)
exports.updateAppGuide = async (req, res) => {
    try {
        let guide = await AppGuide.findOne();
        if (guide) {
            guide = await AppGuide.findByIdAndUpdate(guide._id, req.body, { new: true, runValidators: true });
        } else {
            guide = await AppGuide.create(req.body);
        }
        res.status(200).json({ success: true, data: guide });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

const Policy = require('../../models/Policy');
const DEFAULT_POLICIES = require('../../utils/defaultPolicies');

// ==================== Policy Controllers ====================

// @desc    Get Policy Content (Public)
exports.getPolicy = async (req, res) => {
    try {
        const { role, type } = req.params;
        const fallback = DEFAULT_POLICIES[role]?.[type];
        if (fallback === undefined) {
            return res.status(404).json({ success: false, message: 'Unknown policy' });
        }
        // Never return a blank document: use the starter text until an admin saves their own
        const policy = await Policy.findOne({ role, type });
        if (policy && policy.content && policy.content.trim()) {
            return res.status(200).json({ success: true, data: policy });
        }
        res.status(200).json({ success: true, data: { role, type, content: fallback, isDefault: true } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update Policy Content (Admin)
exports.updatePolicy = async (req, res) => {
    try {
        const { role, type, content } = req.body;
        if (!role || !type) {
            return res.status(400).json({ success: false, message: 'Role and type are required' });
        }
        if (DEFAULT_POLICIES[role]?.[type] === undefined) {
            return res.status(400).json({ success: false, message: 'Unknown role or document type' });
        }
        if (typeof content !== 'string' || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Policy content cannot be blank' });
        }
        let policy = await Policy.findOne({ role, type });
        if (policy) {
            policy = await Policy.findByIdAndUpdate(policy._id, { content }, { new: true, runValidators: true });
        } else {
            policy = await Policy.create({ role, type, content });
        }
        res.status(200).json({ success: true, data: policy });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};
