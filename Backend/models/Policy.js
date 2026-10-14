const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'vendor', 'worker'],
        required: true
    },
    type: {
        type: String,
        enum: ['terms', 'privacy'],
        required: true
    },
    content: {
        type: String,
        required: true,
        default: ''
    }
}, { timestamps: true });

// Ensure only one policy per role per type
policySchema.index({ role: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Policy', policySchema);
