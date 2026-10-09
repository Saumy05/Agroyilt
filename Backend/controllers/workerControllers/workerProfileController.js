const Worker = require('../../models/Worker');
const { validationResult } = require('express-validator');
const cloudinaryService = require('../../services/cloudinaryService');

/**
 * Get worker profile
 */
const getProfile = async (req, res) => {
  try {
    const workerId = req.user.id;

    const worker = await Worker.findById(workerId).select('-password -__v');

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    res.status(200).json({
      success: true,
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        serviceCategories: worker.serviceCategories || [],
        serviceCategory: worker.serviceCategories?.[0] || '', // Legacy support
        skills: worker.skills || [],
        hourlyRate: worker.hourlyRate || 0,
        dailyRate: worker.dailyRate || 0,
        landRate: worker.landRate || 0,
        customRates: worker.customRates || [],
        address: worker.address || null,
        rating: worker.rating || 0,
        totalJobs: worker.totalJobs || 0,
        completedJobs: worker.completedJobs || 0,
        status: (worker.status === 'ONLINE') ? 'ONLINE' : 'OFFLINE',
        isOnline: Boolean(worker.isOnline),
        profilePhoto: worker.profilePhoto || null,
        workerType: worker.workerType || 'WORKER',
        gender: worker.gender || 'male',
        hasBike: Boolean(worker.hasBike),
        drivingLicense: worker.drivingLicense || null,
        teamId: worker.teamId || null,
        settings: worker.settings || { notifications: true, language: 'en' },
        isPhoneVerified: worker.isPhoneVerified || false,
        isEmailVerified: worker.isEmailVerified || false,
        createdAt: worker.createdAt,
        updatedAt: worker.updatedAt
      }
    });
  } catch (error) {
    console.error('Get worker profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile. Please try again.'
    });
  }
};

/**
 * Update worker profile
 */
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const workerId = req.user.id;
    const { name, serviceCategories, serviceCategory, skills, hourlyRate, dailyRate, landRate, customRates, address, status, profilePhoto, gender } = req.body;

    const worker = await Worker.findById(workerId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Update fields
    if (name) worker.name = name.trim();
    if (gender && ['male', 'female', 'other'].includes(String(gender).toLowerCase())) {
      worker.gender = String(gender).toLowerCase();
    }

    // Handle categories: prefer array, fallback to single legacy string
    if (serviceCategories && Array.isArray(serviceCategories)) {
      worker.serviceCategories = serviceCategories;
    } else if (serviceCategory) {
      worker.serviceCategories = [serviceCategory.trim()];
    }

    if (skills && Array.isArray(skills)) worker.skills = skills;
    if (hourlyRate !== undefined) worker.hourlyRate = Number(hourlyRate) || 0;
    if (dailyRate !== undefined) worker.dailyRate = Number(dailyRate) || 0;
    if (landRate !== undefined) worker.landRate = Number(landRate) || 0;
    if (customRates && Array.isArray(customRates)) worker.customRates = customRates;
    if (address) {
      worker.address = {
        addressLine1: address.addressLine1 || worker.address?.addressLine1 || '',
        addressLine2: address.addressLine2 || worker.address?.addressLine2 || '',
        city: address.city || worker.address?.city || '',
        state: address.state || worker.address?.state || '',
        pincode: address.pincode || worker.address?.pincode || '',
        landmark: address.landmark || worker.address?.landmark || '',
        fullAddress: address.fullAddress || worker.address?.fullAddress || ''
      };
    }
    // Strict status validation if status is provided in profile payload
    if (status !== undefined) {
      if (status !== 'ONLINE' && status !== 'OFFLINE') {
        return res.status(400).json({
          success: false,
          message: "Invalid status value. Worker availability status must be either 'ONLINE' or 'OFFLINE'."
        });
      }
      worker.status = status;
    }

    // Update profile photo - upload to Cloudinary if it's a base64 string
    if (profilePhoto !== undefined) {
      if (profilePhoto && profilePhoto.startsWith('data:')) {
        const uploadRes = await cloudinaryService.uploadFile(profilePhoto, { folder: 'workers/profiles' });
        if (uploadRes.success) {
          worker.profilePhoto = uploadRes.url;
        }
      } else {
        worker.profilePhoto = profilePhoto;
      }
    }

    if (req.body.settings) {
      worker.settings = {
        notifications: req.body.settings.notifications !== undefined ? req.body.settings.notifications : (worker.settings?.notifications ?? true),
        soundAlerts: req.body.settings.soundAlerts !== undefined ? req.body.settings.soundAlerts : (worker.settings?.soundAlerts ?? true),
        language: req.body.settings.language || worker.settings?.language || 'en'
      };
    }

    if (req.body.location && req.body.location.lat !== undefined && req.body.location.lng !== undefined) {
      const lat = Number(req.body.location.lat);
      const lng = Number(req.body.location.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        worker.location = {
          lat,
          lng,
          updatedAt: new Date()
        };
      }
    }

    await worker.save();

    // Broadcast real-time availability update via Socket.IO if status was updated
    if (status !== undefined) {
      try {
        const { getIO } = require('../../sockets');
        const io = getIO();
        if (io) {
          const minimalPayload = {
            workerId: worker._id.toString(),
            status: worker.status
          };
          io.to(`worker_${worker._id.toString()}`).emit('worker_status_updated', minimalPayload);
          io.to(`worker:${worker._id.toString()}`).emit('worker_status_updated', minimalPayload);
        }
      } catch (socketErr) {
        // Non-blocking socket broadcast
      }
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        serviceCategories: worker.serviceCategories,
        serviceCategory: worker.serviceCategories?.[0] || '',
        skills: worker.skills,
        hourlyRate: worker.hourlyRate,
        dailyRate: worker.dailyRate,
        landRate: worker.landRate,
        customRates: worker.customRates,
        address: worker.address,
        rating: worker.rating,
        totalJobs: worker.totalJobs,
        completedJobs: worker.completedJobs,
        status: worker.status,
        isOnline: Boolean(worker.isOnline),
        profilePhoto: worker.profilePhoto,
        settings: worker.settings,
        isPhoneVerified: worker.isPhoneVerified,
        isEmailVerified: worker.isEmailVerified
      }
    });
  } catch (error) {
    console.error('Update worker profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile. Please try again.'
    });
  }
};

/**
 * Update worker availability status (ONLINE / OFFLINE)
 * Dedicated endpoint. Authenticated worker only. Strictly validates value.
 */
const updateAvailability = async (req, res) => {
  try {
    const workerId = req.user.id || req.user._id;
    const { status } = req.body;

    if (!status || (status !== 'ONLINE' && status !== 'OFFLINE')) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Worker availability status must be either 'ONLINE' or 'OFFLINE'."
      });
    }

    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.status = status;
    await worker.save();

    // Broadcast minimal status change event over Socket.IO
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        const minimalPayload = {
          workerId: worker._id.toString(),
          status: worker.status
        };
        io.to(`worker_${worker._id.toString()}`).emit('worker_status_updated', minimalPayload);
        io.to(`worker:${worker._id.toString()}`).emit('worker_status_updated', minimalPayload);
      }
    } catch (socketErr) {
      // Non-blocking socket broadcast
    }

    return res.status(200).json({
      success: true,
      message: `Availability updated to ${worker.status}`,
      status: worker.status
    });
  } catch (error) {
    console.error('Update worker availability error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update availability. Please try again.'
    });
  }
};

/**
 * Update worker real-time location
 */
const updateLocation = async (req, res) => {
  try {
    const workerId = req.user.id || req.user._id;
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
    }

    // Update only the location field for performance
    await Worker.findByIdAndUpdate(workerId, {
      location: { lat, lng, updatedAt: new Date() }
    });

    res.status(200).json({ success: true, message: 'Location updated' });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateAvailability,
  updateLocation
};

