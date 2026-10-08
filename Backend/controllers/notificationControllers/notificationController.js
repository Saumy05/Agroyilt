const Notification = require('../../models/Notification');
const { validationResult } = require('express-validator');
const { sendNotificationToUser, sendNotificationToVendor, sendNotificationToWorker } = require('../../services/firebaseAdmin');

/**
 * Create notification (internal use)
 */
const createNotification = async ({
  userId = null,
  vendorId = null,
  workerId = null,
  adminId = null,
  recipientId = null,
  recipientModel = null,
  type,
  title,
  message,
  relatedId = null,
  relatedType = null,
  data = {},
  metadata = null,
  skipPush = false,
  pushData = {},
  priority = null
}) => {
  try {
    // If metadata is provided, assign or merge it into data
    if (metadata && Object.keys(data).length === 0) {
      data = metadata;
    }

    // Map legacy recipientId and recipientModel to standard fields
    if (recipientId && recipientModel) {
      const model = recipientModel.toLowerCase();
      if (model === 'user') userId = recipientId;
      else if (model === 'vendor') vendorId = recipientId;
      else if (model === 'worker') workerId = recipientId;
      else if (model === 'admin') adminId = recipientId;
    }
    // Check for duplicate notification within short window (5 seconds) to prevent spam
    const duplicateQuery = {
      type,
      title,
      createdAt: { $gt: new Date(Date.now() - 5000) }
    };

    if (userId) duplicateQuery.userId = userId;
    if (vendorId) duplicateQuery.vendorId = vendorId;
    if (workerId) duplicateQuery.workerId = workerId;
    if (adminId) duplicateQuery.adminId = adminId;
    if (relatedId) duplicateQuery.relatedId = relatedId;

    const existingNotification = await Notification.findOne(duplicateQuery);
    if (existingNotification) {
      console.log(`[Notification] Duplicate suppression: ${type} for ${relatedId}`);
      return existingNotification;
    }

    const notification = await Notification.create({
      userId,
      vendorId,
      workerId,
      adminId,
      type,
      title,
      message,
      relatedId,
      relatedType,
      data
    });

    // Check Socket Connectivity to prevent Duplicate Notifications (Push + Socket)
    let io = null;
    let room = null;
    let isOnline = false;

    try {
      const { getIO } = require('../../sockets');
      io = getIO();

      if (userId) room = `user_${userId.toString()}`;
      else if (vendorId) room = `vendor_${vendorId.toString()}`;
      else if (workerId) room = `worker_${workerId.toString()}`;
      else if (adminId) room = `admin_${adminId.toString()}`;

      if (io) {
        if (room) {
          io.to(room).emit('notification', notification);
          console.log(`[Notification]  Emitted socket notification to ${room}`);
        }
        if (adminId) {
          io.to('admin_global').emit('notification', notification);
        }
      }
    } catch (e) {
      console.log('Socket notification emit failed:', e.message);
    }

    // Send Push Notification (If not skipped)
    if (!skipPush) {
      // Prepare payload
      // Use explicit pushData if provided, otherwise merge generic data
      const payload = {
        title: title,
        body: message,
        priority: priority || pushData.priority || 'normal',
        data: {
          ...data,
          ...pushData,
          type: pushData.type || type, // Allow overriding type for push specifically
          relatedId: relatedId ? String(relatedId) : '',
          relatedType: relatedType ? String(relatedType) : '',
          notificationId: String(notification._id)
        }
      };

      // If dataOnly flag is in pushData, pass it
      if (pushData.dataOnly) {
        payload.dataOnly = true;
      }

      // Send to target
      try {
        if (userId) await sendNotificationToUser(userId, payload);
        if (vendorId) await sendNotificationToVendor(vendorId, payload);
        if (workerId) await sendNotificationToWorker(workerId, payload);
        if (adminId) {
          const { sendNotificationToAdmin } = require('../../services/firebaseAdmin');
          await sendNotificationToAdmin(adminId, payload);
        }
      } catch (pushError) {
        console.error('Auto-push notification failed:', pushError);
        // Do not fail the function, notification is saved in DB
      }
    }
    // Socket emission handled above in "isOnline" block for clarity, 
    // but technically if we wanted to emit even if offline (for when they reconnect? No, socket doesn't buffer like that usually)
    // we could keep it here. But logic above is cleaner: Online -> Socket, Offline -> Push.

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

/**
 * Get user notifications
 */
const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isRead, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { userId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get user notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications. Please try again.'
    });
  }
};

/**
 * Get vendor notifications
 */
const getVendorNotifications = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { isRead, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { vendorId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({ vendorId, isRead: false });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get vendor notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications. Please try again.'
    });
  }
};

/**
 * Get worker notifications
 */
const getWorkerNotifications = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { isRead, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { workerId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({ workerId, isRead: false });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get worker notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications. Please try again.'
    });
  }
};

/**
 * Get admin notifications
 */
const getAdminNotifications = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { isRead, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { adminId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({ adminId, isRead: false });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get admin notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications. Please try again.'
    });
  }
};

/**
 * Mark notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role
    let query = { _id: id };
    if (userRole === 'USER') query.userId = userId;
    else if (userRole === 'VENDOR') query.vendorId = userId;
    else if (userRole === 'WORKER') query.workerId = userId;
    else if (userRole === 'ADMIN') query.adminId = userId;

    const notification = await Notification.findOne(query);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read. Please try again.'
    });
  }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role
    let query = { isRead: false };
    if (userRole === 'USER') query.userId = userId;
    else if (userRole === 'VENDOR') query.vendorId = userId;
    else if (userRole === 'WORKER') query.workerId = userId;
    else if (userRole === 'ADMIN') query.adminId = userId;

    await Notification.updateMany(query, {
      isRead: true,
      readAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read. Please try again.'
    });
  }
};

/**
 * Delete notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role
    let query = { _id: id };
    if (userRole === 'USER') query.userId = userId;
    else if (userRole === 'VENDOR') query.vendorId = userId;
    else if (userRole === 'WORKER') query.workerId = userId;
    else if (userRole === 'ADMIN') query.adminId = userId;

    const notification = await Notification.findOneAndDelete(query);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification. Please try again.'
    });
  }
};

/**
 * Delete all notifications for the current user
 */
const deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role to ensure they only delete their own notifications
    let query = {};
    if (userRole === 'USER' || userRole === 'user') query.userId = userId;
    else if (userRole === 'VENDOR' || userRole === 'vendor') query.vendorId = userId;
    else if (userRole === 'WORKER' || userRole === 'worker') query.workerId = userId;
    else if (userRole === 'ADMIN' || userRole === 'admin' || userRole === 'super_admin') query.adminId = userId;
    else {
      console.log('Role mismatch in deleteAllNotifications:', userRole);
      return res.status(403).json({
        success: false,
        message: 'Invalid user role'
      });
    }

    const result = await Notification.deleteMany(query);

    res.status(200).json({
      success: true,
      message: 'All notifications deleted successfully',
      count: result.deletedCount
    });
  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete all notifications. Please try again.'
    });
  }
};

/**
 * Send Broadcast Custom Announcement Notification (Admin Only)
 */
const broadcastNotification = async (req, res) => {
  try {
    const { targetAudience = 'all', title, message, type = 'system_announcement', priority = 'normal' } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required'
      });
    }

    const User = require('../../models/User');
    const Vendor = require('../../models/Vendor');
    const Worker = require('../../models/Worker');
    const Admin = require('../../models/Admin');

    let recipientCount = 0;
    const notificationsToCreate = [];

    if (targetAudience === 'all' || targetAudience === 'users') {
      const users = await User.find({ isActive: { $ne: false } }).select('_id');
      users.forEach(u => {
        notificationsToCreate.push({ userId: u._id, title, message, type });
      });
      recipientCount += users.length;
    }

    if (targetAudience === 'all' || targetAudience === 'vendors') {
      const vendors = await Vendor.find({ isApproved: true }).select('_id');
      vendors.forEach(v => {
        notificationsToCreate.push({ vendorId: v._id, title, message, type });
      });
      recipientCount += vendors.length;
    }

    if (targetAudience === 'all' || targetAudience === 'workers') {
      const workers = await Worker.find({ isApproved: true }).select('_id');
      workers.forEach(w => {
        notificationsToCreate.push({ workerId: w._id, title, message, type });
      });
      recipientCount += workers.length;
    }

    if (targetAudience === 'all' || targetAudience === 'admins' || targetAudience.includes('admin')) {
      const admins = await Admin.find({ isActive: { $ne: false } }).select('_id');
      admins.forEach(a => {
        notificationsToCreate.push({ adminId: a._id, title, message, type });
      });
      recipientCount += admins.length;
    }

    if (notificationsToCreate.length > 0) {
      await Notification.insertMany(notificationsToCreate);
    }

    res.status(200).json({
      success: true,
      message: `Broadcast announcement dispatched successfully to ${recipientCount} recipient(s).`,
      recipientCount
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to broadcast notification. Please try again.'
    });
  }
};

module.exports = {
  createNotification,
  getUserNotifications,
  getVendorNotifications,
  getWorkerNotifications,
  getAdminNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  broadcastNotification
};

