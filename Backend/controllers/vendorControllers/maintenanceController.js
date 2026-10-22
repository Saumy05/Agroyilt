const Maintenance = require('../../models/Maintenance');
const VendorEquipment = require('../../models/VendorEquipment');
const { validationResult } = require('express-validator');

/**
 * Get all maintenance schedules for a vendor
 */
const getMaintenanceSchedules = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const schedules = await Maintenance.find({ vendorId, status: 'active' })
            .populate('equipmentId', 'name')
            .sort({ startDate: 1 });

        res.status(200).json({
            success: true,
            data: schedules
        });
    } catch (error) {
        console.error('Get maintenance schedules error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch maintenance schedules' });
    }
};

/**
 * Add a new maintenance schedule (Block dates)
 */
const addMaintenanceSchedule = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { equipmentId, startDate, endDate, reason, note } = req.body;

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (!equipmentId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
            return res.status(400).json({ success: false, message: 'Select equipment and a valid date range' });
        }

        // Only the vendor's own machines can be scheduled
        const owned = await VendorEquipment.exists({ _id: equipmentId, vendorId });
        if (!owned) {
            return res.status(404).json({ success: false, message: 'Equipment not found' });
        }

        // Basic overlap check
        const overlap = await Maintenance.findOne({
            vendorId,
            equipmentId,
            status: 'active',
            $or: [
                { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
            ]
        });

        if (overlap) {
            return res.status(400).json({
                success: false,
                message: 'Maintenance already scheduled for the selected dates'
            });
        }

        const maintenance = await Maintenance.create({
            vendorId,
            equipmentId,
            startDate,
            endDate,
            reason,
            note
        });

        res.status(201).json({
            success: true,
            message: 'Maintenance scheduled! This equipment will be blocked for these dates.',
            data: maintenance
        });
    } catch (error) {
        console.error('Add maintenance error:', error);
        res.status(500).json({ success: false, message: 'Failed to schedule maintenance' });
    }
};

/**
 * Cancel/Remove a maintenance schedule
 */
const deleteMaintenanceSchedule = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params;

        const maintenance = await Maintenance.findOne({ _id: id, vendorId });
        if (!maintenance) {
            return res.status(404).json({ success: false, message: 'Maintenance record not found' });
        }

        maintenance.status = 'cancelled';
        await maintenance.save();

        res.status(200).json({
            success: true,
            message: 'Maintenance schedule removed. Equipment is now available.'
        });
    } catch (error) {
        console.error('Delete maintenance error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove maintenance schedule' });
    }
};

module.exports = {
    getMaintenanceSchedules,
    addMaintenanceSchedule,
    deleteMaintenanceSchedule
};
