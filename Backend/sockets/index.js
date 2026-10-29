// Socket.io initialization
const { Server } = require('socket.io');
const { authenticateSocket } = require('../middleware/authMiddleware');

let io = null;

const initializeSocket = (server) => {
  io = new Server(server, {
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
      origin: (origin, callback) => {
        callback(null, true);
      },
      credentials: true,
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
  });

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify token using the same method as HTTP middleware
      const { verifyAccessToken } = require('../utils/tokenService');
      const decoded = verifyAccessToken(token);

      socket.userId = decoded.userId;
      socket.userRole = decoded.role;

      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected (User: ${socket.userId}, Role: ${socket.userRole})`);

    const normalizedRole = (socket.userRole || '').toUpperCase();

    // Join user-specific room for notifications
    if (normalizedRole === 'USER') {
      const uId = socket.userId.toString();
      socket.join(`user_${uId}`);
      socket.join(`user:${uId}`);
    } else if (normalizedRole === 'VENDOR') {
      const room = `vendor_${socket.userId.toString()}`;
      socket.join(room);
      socket.join(`vendor:${socket.userId.toString()}`);
      console.log(`[SOCKET SERVER] ✅ VENDOR ${socket.userId} auto-joined room: ${room}`);
      // Update vendor online status
      updateVendorOnlineStatus(socket.userId, true, socket.id);
    } else if (normalizedRole === 'WORKER') {
      const wId = socket.userId.toString();
      socket.join(`worker_${wId}`);
      socket.join(`worker:${wId}`);
      console.log(`[SOCKET SERVER] ✅ WORKER ${socket.userId} auto-joined rooms: worker_${wId} & worker:${wId}`);
      // Update worker online status
      updateWorkerOnlineStatus(socket.userId, true, socket.id);
    } else if (normalizedRole === 'ADMIN' || normalizedRole === 'SUPER_ADMIN') {
      socket.join(`admin_${socket.userId.toString()}`);
      socket.join('admin_global');
      console.log(`[SOCKET SERVER]  ADMIN ${socket.userId} joined room: admin_${socket.userId} & admin_global`);
    }

    // Explicit Room Join Events (Fallback/Frontend Initiated with security verification)
    socket.on('join_admin_room', (adminId) => {
      const role = (socket.userRole || '').toUpperCase();
      if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && socket.userId?.toString() === adminId?.toString()) {
        socket.join(`admin_${adminId.toString()}`);
        socket.join('admin_global');
      }
    });

    socket.on('join_vendor_room', (vendorId) => {
      const role = (socket.userRole || '').toUpperCase();
      if (role === 'VENDOR' && socket.userId?.toString() === vendorId?.toString()) {
        const vId = vendorId.toString();
        socket.join(`vendor_${vId}`);
        socket.join(`vendor:${vId}`);
      }
    });

    socket.on('join_user_room', (userId) => {
      const role = (socket.userRole || '').toUpperCase();
      if (role === 'USER' && socket.userId?.toString() === userId?.toString()) {
        const uId = userId.toString();
        socket.join(`user_${uId}`);
        socket.join(`user:${uId}`);
      }
    });

    socket.on('join_worker_room', (workerId) => {
      const role = (socket.userRole || '').toUpperCase();
      if (role === 'WORKER' && socket.userId?.toString() === workerId?.toString()) {
        const wId = workerId.toString();
        socket.join(`worker_${wId}`);
        socket.join(`worker:${wId}`);
      }
    });

    // Live Tracking Events (Multi-Worker & Single Provider)
    socket.on('join_tracking', async (trackingId) => {
      if (!trackingId) return;
      const tId = trackingId.toString();
      socket.join(`booking_${tId}`);
      socket.join(`booking:${tId}`);
      socket.join(`booking_req_${tId}`);
      socket.join(`booking_req:${tId}`);
      console.log(`[Socket] User ${socket.userId} (${socket.userRole}) joined tracking for booking_${tId} & booking_req:${tId}`);

      // If trackingId is a WorkerBookingRequest or Booking with siblings, join related booking rooms
      try {
        const Booking = require('../models/Booking');
        const WorkerBookingRequest = require('../models/WorkerBookingRequest');

        const parentReq = await WorkerBookingRequest.findById(tId).select('finalBookingIds assignmentIds');
        if (parentReq) {
          if (parentReq.finalBookingIds) {
            parentReq.finalBookingIds.forEach(bId => {
              socket.join(`booking_${bId.toString()}`);
              socket.join(`booking:${bId.toString()}`);
            });
          }
          if (parentReq.assignmentIds) {
            parentReq.assignmentIds.forEach(aId => {
              socket.join(`assignment_${aId.toString()}`);
              socket.join(`assignment:${aId.toString()}`);
            });
          }
        } else {
          const singleBooking = await Booking.findById(tId).select('workerRequestId');
          if (singleBooking?.workerRequestId) {
            socket.join(`booking_req_${singleBooking.workerRequestId.toString()}`);
            socket.join(`booking_req:${singleBooking.workerRequestId.toString()}`);
          }
        }
      } catch (e) {
        // Non-fatal room join helper
      }

      // Disconnect Recovery: Send last known location from Redis if available
      try {
        const { getLiveLocation } = require('../services/redisService');
        const cachedLocation = await getLiveLocation(tId);
        if (cachedLocation) {
          socket.emit('live_location_update', cachedLocation);
        }
      } catch (error) {
        console.error('[Socket] Error fetching cached location:', error);
      }
    });

    socket.on('join_booking_req', (requestId) => {
      if (!requestId) return;
      const rId = requestId.toString();
      socket.join(`booking_req_${rId}`);
      socket.join(`booking_req:${rId}`);
      console.log(`[Socket] User ${socket.userId} joined room booking_req:${rId}`);
    });

    // Worker leaves tracking room when navigating away
    socket.on('leave_tracking', (trackingId) => {
      if (!trackingId) return;
      const tId = trackingId.toString();
      socket.leave(`booking_${tId}`);
      socket.leave(`booking:${tId}`);
      socket.leave(`booking_req_${tId}`);
      socket.leave(`booking_req:${tId}`);
    });

    // Vendor acknowledges receiving booking alert
    socket.on('booking_alert_received', async (data) => {
      try {
        const BookingRequest = require('../models/BookingRequest');
        await BookingRequest.findOneAndUpdate(
          { bookingId: data.bookingId, vendorId: socket.userId },
          { status: 'VIEWED', viewedAt: new Date(), socketDelivered: true }
        );
        console.log(`[Socket] Vendor ${socket.userId} viewed booking ${data.bookingId}`);
      } catch (error) {
        console.error('[Socket] Error updating booking request:', error);
      }
    });

    // Worker/Vendor sets availability
    socket.on('set_availability', async (data) => {
      try {
        const Vendor = require('../models/Vendor');
        const Worker = require('../models/Worker');

        if (socket.userRole === 'VENDOR') {
          await Vendor.findByIdAndUpdate(socket.userId, {
            availability: data.status // 'AVAILABLE', 'BUSY', etc.
          });
        } else if (socket.userRole === 'WORKER') {
          await Worker.findByIdAndUpdate(socket.userId, {
            status: data.status // 'ONLINE', 'BUSY', etc.
          });
        }
        console.log(`[Socket] ${socket.userRole} ${socket.userId} set availability to ${data.status}`);
      } catch (error) {
        console.error('[Socket] Error setting availability:', error);
      }
    });

    // Rate limiting map for location updates
    const locationUpdateTimestamps = new Map();

    socket.on('update_location', async (data) => {
      // data: { bookingId, requestId, lat, lng, heading }
      if (!data || !data.bookingId) return;

      const lat = parseFloat(data.lat);
      const lng = parseFloat(data.lng);
      const heading = parseFloat(data.heading) || 0;

      // Validate coordinates bounds
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return;
      }

      // Rate limiting: max 1 update per 2 seconds per worker
      const rateLimitKey = `${socket.userId}:${data.bookingId}`;
      const lastUpdate = locationUpdateTimestamps.get(rateLimitKey) || 0;
      const now = Date.now();
      if (now - lastUpdate < 2000) {
        return; // Skip too-frequent update
      }
      locationUpdateTimestamps.set(rateLimitKey, now);

      const serverTime = new Date();

      // Multi-worker standard payload
      const multiWorkerLocationPayload = {
        bookingId: data.bookingId.toString(),
        requestId: data.requestId ? data.requestId.toString() : null,
        assignmentId: data.bookingId.toString(),
        workerId: socket.userId.toString(),
        location: {
          lat,
          lng,
          heading
        },
        lastLocationAt: serverTime,
        serverTime
      };

      // Legacy single provider payload
      const legacyPayload = {
        lat,
        lng,
        heading,
        workerId: socket.userId.toString(),
        bookingId: data.bookingId.toString(),
        role: socket.userRole,
        updatedAt: serverTime
      };

      // 1. Broadcast multi-worker event to booking room
      socket.to(`booking_${data.bookingId}`).emit('worker_location_updated', multiWorkerLocationPayload);
      socket.to(`booking_${data.bookingId}`).emit('live_location_update', legacyPayload);

      // If this booking belongs to a parent request, also broadcast to request room
      if (data.requestId) {
        socket.to(`booking_req_${data.requestId}`).emit('worker_location_updated', multiWorkerLocationPayload);
      }

      // 2. Cache in Redis with TTL for disconnect recovery
      try {
        const { setLiveLocation, setVendorLocation } = require('../services/redisService');
        await setLiveLocation(data.bookingId, legacyPayload, 45); // 45 second TTL

        if (socket.userRole === 'VENDOR') {
          await setVendorLocation(socket.userId, lat, lng);
        }
      } catch (error) {
        // Non-fatal redis error
      }

      // 3. Save latest location to Database atomically
      try {
        const Vendor = require('../models/Vendor');
        const Worker = require('../models/Worker');
        const Booking = require('../models/Booking');

        const updateData = {
          location: {
            lat,
            lng,
            heading,
            updatedAt: serverTime
          },
          geoLocation: {
            type: 'Point',
            coordinates: [lng, lat]
          }
        };

        if (socket.userRole === 'VENDOR') {
          await Vendor.findByIdAndUpdate(socket.userId, updateData);
        } else if (socket.userRole === 'WORKER') {
          await Worker.findByIdAndUpdate(socket.userId, updateData);
        }

        // Atomically update specific Booking live location
        const updatedBooking = await Booking.findOneAndUpdate(
          {
            _id: data.bookingId,
            $or: [
              { 'liveLocation.updatedAt': { $lte: serverTime } },
              { 'liveLocation.updatedAt': null },
              { 'liveLocation': null }
            ]
          },
          {
            $set: {
              liveLocation: {
                lat,
                lng,
                heading,
                updatedAt: serverTime
              }
            }
          },
          { new: true }
        ).select('userId workerRequestId');

        // Broadcast to Farmer's personal room if parent request room wasn't explicitly joined
        if (updatedBooking) {
          if (updatedBooking.workerRequestId && !data.requestId) {
            socket.to(`booking_req_${updatedBooking.workerRequestId}`).emit('worker_location_updated', {
              ...multiWorkerLocationPayload,
              requestId: updatedBooking.workerRequestId.toString()
            });
          }
          if (updatedBooking.userId) {
            socket.to(`user_${updatedBooking.userId}`).emit('worker_location_updated', multiWorkerLocationPayload);
          }
        }
      } catch (error) {
        console.error('[Socket] Error saving live location:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected (Role: ${socket.userRole || 'UNKNOWN'}, SocketId: ${socket.id})`);
      // Update online connectivity status
      if (socket.userRole === 'VENDOR') {
        updateVendorOnlineStatus(socket.userId, false, socket.id);
      } else if (socket.userRole === 'WORKER') {
        updateWorkerOnlineStatus(socket.userId, false, socket.id);
      }
    });
  });

  console.log('Socket.io initialized successfully');
};

// Helper function to update vendor online status
const updateVendorOnlineStatus = async (vendorId, isOnline, socketId) => {
  try {
    const Vendor = require('../models/Vendor');
    const { setVendorOnline, setVendorAvailability } = require('../services/redisService');

    // A deactivated / suspended vendor must never show as online (e.g. reconnecting with an old token)
    if (isOnline) {
      const vendor = await Vendor.findById(vendorId).select('isActive approvalStatus').lean();
      if (!vendor || vendor.isActive === false || ['suspended', 'rejected'].includes(vendor.approvalStatus)) {
        return;
      }
    }

    const updateData = {
      isOnline,
      currentSocketId: socketId,
      availability: isOnline ? 'AVAILABLE' : 'OFFLINE'
    };

    if (!isOnline) {
      updateData.lastSeenAt = new Date();
    }

    // Update MongoDB
    await Vendor.findByIdAndUpdate(vendorId, updateData);

    // Update Redis cache (fast lookup)
    await setVendorOnline(vendorId, isOnline);

    console.log(`[Socket] Vendor ${vendorId} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  } catch (error) {
    console.error('[Socket] Error updating vendor online status:', error);
  }
};

// Helper function to update worker online socket connectivity
// IMPORTANT: Does NOT modify worker.status (worker.status is intentional business availability)
const updateWorkerOnlineStatus = async (workerId, isOnline, socketId) => {
  try {
    const Worker = require('../models/Worker');

    if (isOnline) {
      // A deactivated / suspended / rejected worker must never show as online (e.g. reconnecting with an old token)
      const worker = await Worker.findById(workerId).select('isActive approvalStatus').lean();
      if (!worker || worker.isActive === false || ['suspended', 'rejected'].includes(worker.approvalStatus)) {
        return;
      }
      // Socket connected: mark isOnline = true and record active socket ID
      await Worker.findByIdAndUpdate(workerId, {
        isOnline: true,
        currentSocketId: socketId
      });
      console.log(`[Socket] Worker ${workerId} connected (socketId: ${socketId})`);
    } else {
      // Socket disconnecting:
      // Multi-socket handling: check if the worker still has other active sockets in room
      const wId = workerId.toString();
      let hasOtherSockets = false;
      if (io) {
        const room = io.sockets.adapter.rooms.get(`worker_${wId}`);
        if (room && room.size > 0) {
          hasOtherSockets = true;
        }
      }

      if (hasOtherSockets) {
        console.log(`[Socket] Worker ${wId} socket ${socketId} disconnected, but remaining sockets are active in room.`);
        return;
      }

      // Check if the disconnecting socket is the current/active socket in DB
      const currentWorker = await Worker.findById(workerId).select('currentSocketId');
      if (currentWorker && currentWorker.currentSocketId && socketId && currentWorker.currentSocketId !== socketId) {
        console.log(`[Socket] Worker ${wId} disconnecting socket (${socketId}) does not match current active socket (${currentWorker.currentSocketId}). Keeping isOnline: true.`);
        return;
      }

      // Safe to mark as disconnected (NEVER touch worker.status!)
      await Worker.findByIdAndUpdate(workerId, {
        isOnline: false,
        currentSocketId: null,
        lastSeenAt: new Date()
      });

      console.log(`[Socket] Worker ${wId} all sockets disconnected (isOnline: false)`);
    }
  } catch (error) {
    console.error('[Socket] Error updating worker online status:', error);
  }
};

// Take a vendor offline and drop their live sockets (admin deactivate / suspend)
const forceVendorOffline = async (vendorId) => {
  const id = vendorId.toString();
  try {
    const Vendor = require('../models/Vendor');
    const { setVendorOnline } = require('../services/redisService');

    await Vendor.findByIdAndUpdate(id, {
      isOnline: false,
      availability: 'OFFLINE',
      currentSocketId: null,
      lastSeenAt: new Date()
    });
    await setVendorOnline(id, false);

    if (io) {
      io.to(`vendor:${id}`).emit('account_deactivated', {
        message: 'Your account has been deactivated. Please contact support.'
      });
      io.in(`vendor:${id}`).disconnectSockets(true);
    }
  } catch (error) {
    console.error('[Socket] Error forcing vendor offline:', error);
  }
};

// Take a worker offline and drop their live sockets (admin deactivate / suspend / reject).
// Only an ONLINE business status is reset; a worker mid-job keeps their status.
const forceWorkerOffline = async (workerId) => {
  const id = workerId.toString();
  try {
    const Worker = require('../models/Worker');

    await Worker.findByIdAndUpdate(id, {
      isOnline: false,
      currentSocketId: null,
      lastSeenAt: new Date()
    });
    await Worker.updateOne({ _id: id, status: 'ONLINE' }, { $set: { status: 'OFFLINE' } });

    if (io) {
      io.to(`worker:${id}`).emit('account_deactivated', {
        message: 'Your account has been deactivated. Please contact support.'
      });
      io.to('admin_global').emit('worker_status_updated', {
        workerId: id,
        status: 'OFFLINE'
      });
      io.in(`worker:${id}`).disconnectSockets(true);
    }
  } catch (error) {
    console.error('[Socket] Error forcing worker offline:', error);
  }
};

// Get io instance for emitting notifications
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = { initializeSocket, getIO, forceVendorOffline, forceWorkerOffline };

