const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
        required: true,
        index: true
    },
    equipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VendorEquipment',
        required: true,
        index: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    reason: {
        type: String,
        enum: ['Routine Checkup', 'Repair', 'Servicing', 'Breakdown', 'Other'],
        default: 'Routine Checkup'
    },
    note: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['active', 'cancelled'],
        default: 'active'
    }
}, {
    timestamps: true
});

// Index to prevent overlapping maintenance slots for same equipment
maintenanceSchema.index({ equipmentId: 1, vendorId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Maintenance', maintenanceSchema);
