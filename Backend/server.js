// Server Entry Point
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const rateLimiter = require('./middleware/rateLimiter');

// Load environment variables
dotenv.config();

console.log('[Server Startup] NODE_ENV:', process.env.NODE_ENV);
console.log('[Server Startup] PORT:', process.env.PORT || 5000);
console.log('[Server Startup] MONGODB_URI:', process.env.MONGODB_URI ? 'Configured' : 'Missing');

// Connect to database
connectDB();

// Preload core Mongoose models to ensure schemas are registered for populate
require('./models/Admin');
require('./models/User');
require('./models/Vendor');
require('./models/Worker');
require('./models/State');
require('./models/District');
require('./models/SubDistrict');
require('./models/City');
require('./models/AdminAuditLog');
require('./models/Booking');
require('./models/Service');
require('./models/Category');
require('./models/Brand');
require('./models/Review');
require('./models/Product');
require('./models/VendorBill');
require('./models/SupportTicket');
require('./models/SupportMessage');

// Initialize Redis (if enabled)
const { initRedis } = require('./services/redisService');
initRedis();

// Initialize Weather Notification Scheduler (Agriculture Feature)
const { startWeatherScheduler } = require('./services/weatherNotificationService');
startWeatherScheduler();

// Initialize Booking Reminder Scheduler (Slot alerts)
const { startBookingReminderScheduler } = require('./services/bookingReminderService');
startBookingReminderScheduler();

// Initialize Requirement Expiry Scheduler (Bidding System)
const { startRequirementScheduler } = require('./services/requirementScheduler');
startRequirementScheduler();

// Initialize Express app
const app = express();
app.set('trust proxy', 1);

// Security middleware - allow cross-origin resource loading (images) for user app
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Dynamic CORS origin checker for Vercel, Render & local dev
const isOriginAllowed = (origin) => {
  if (!origin) return true; // Mobile apps, Postman, server-to-server

  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'https://agroyilt.com',
    'https://www.agroyilt.com',
    'https://agroyilt.vercel.app',
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    process.env.CORS_ORIGIN
  ].filter(Boolean);

  if (allowedOrigins.includes(origin)) return true;

  // Allow any Vercel deployment URL (e.g. agroyilt-tawny.vercel.app)
  if (origin.endsWith('.vercel.app') || origin.includes('vercel.app')) return true;

  // Allow localhost / local IP on any port
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;

  return true; // Fallback allow to guarantee no CORS blocks in production
};

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    callback(null, true); // Allow all valid web & mobile origins
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers']
}));

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// SEO Prerendering Middleware (for search engine bots)
// This serves rendered HTML to crawlers instead of empty JS bundle
const prerender = require('prerender-node');
if (process.env.PRERENDER_TOKEN) {
  app.use(prerender.set('prerenderToken', process.env.PRERENDER_TOKEN));
} else if (process.env.NODE_ENV === 'production') {
  app.use(prerender);
}



// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev', {
    skip: function (req, res) { return res.statusCode === 304 }
  }));
}

// Rate limiting
app.use('/api', rateLimiter);

// Health check route
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Agroyilt API is running',
    timestamp: new Date().toISOString()
  });
});

// Dynamic Root Logo & Favicon Compatibility Endpoints
const { getPublicLogo, getPublicFavicon } = require('./controllers/adminControllers/settingsController');
app.get('/logo.png', getPublicLogo);
app.get('/favicon.ico', getPublicFavicon);


// Quick Redis Test Route
app.get('/api/test/redis', async (req, res) => {
  try {
    const { getRedis, isRedisConnected } = require('./services/redisService');
    const redis = getRedis();

    if (!isRedisConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis is not connected or disabled',
        redisEnabled: process.env.REDIS_ENABLED === 'true',
        status: redis ? redis.status : 'no_instance'
      });
    }

    const testKey = `test:time:${Date.now()}`;
    const testValue = 'Hello from Redis!';

    // Test Set
    await redis.set(testKey, testValue, 'EX', 60);

    // Test Get
    const retrievedValue = await redis.get(testKey);

    // Test Delete
    const deleted = await redis.del(testKey);

    res.json({
      success: true,
      message: 'Redis is working correctly',
      testResults: {
        set: 'Retrieved value: ' + retrievedValue,
        match: retrievedValue === testValue,
        delete: deleted === 1 ? 'Success' : 'Failed'
      },
      connectionInfo: {
        status: redis.status,
        host: redis.options.host
      }
    });
  } catch (error) {
    console.error('[Redis Test Route] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Redis test failed',
      error: error.message
    });
  }
});

// API Routes

app.use('/api/public/cities', require('./routes/public-routes/city.routes.js'));
// New geographic hierarchy routes (State → District → SubDistrict)
app.use('/api/public', require('./routes/public-routes/geo.routes.js'));
app.use('/api/public/stats', require('./routes/public-routes/stats.routes.js'));
app.use('/api/fees', require('./routes/shared/registrationFeeRoutes.js'));


// User routes
app.use('/api/users/auth', require('./routes/user-routes/auth.routes'));
app.use('/api/users', require('./routes/user-routes/profile.routes'));
app.use('/api/user/wallet', require('./routes/user-routes/userWallet.routes'));
app.use('/api/users/bookings', require('./routes/user-routes/booking.routes'));
app.use('/api/users', require('./routes/user-routes/cart.routes'));
app.use('/api/users/requirements', require('./routes/user-routes/requirement.routes'));
app.use('/api/users', require('./routes/user-routes/workerBooking.routes'));



// Vendor routes
app.use('/api/vendors/auth', require('./routes/vendor-routes/auth.routes'));
app.use('/api/vendors', require('./routes/vendor-routes/profile.routes'));
app.use('/api/vendors', require('./routes/vendor-routes/settings.routes'));
app.use('/api/vendors', require('./routes/vendor-routes/wallet.routes'));
app.use('/api/vendors', require('./routes/vendor-routes/dashboard.routes'));
app.use('/api/vendors/ledger', require('./routes/vendor-routes/vendorLedger.routes'));
app.use('/api/vendors', require('./routes/vendor-routes/service.routes'));
app.use('/api/vendors/bookings', require('./routes/vendor-routes/booking.routes'));
// NOTE: Vendor Worker management removed — Workers are independent users, not Vendor-owned
app.use('/api/vendors', require('./routes/vendor-routes/vendorBill.routes'));

app.use('/api/vendors/maintenance', require('./routes/vendor-routes/maintenance.routes'));
app.use('/api/vendors/compliance', require('./routes/vendor-routes/compliance.routes'));
app.use('/api/vendors/equipment', require('./routes/vendor-routes/equipment.routes'));
app.use('/api/vendors/bids', require('./routes/vendor-routes/bid.routes'));
app.use('/api/vendors', require('./routes/vendor-routes/labour.routes'));
app.use('/api/vendors', require('./routes/vendor-routes/attendance.routes'));
app.use('/api', require('./routes/common-routes/qr.routes'));
// Worker routes
app.use('/api/workers/auth', require('./routes/worker-routes/auth.routes'));
app.use('/api/workers', require('./routes/worker-routes/profile.routes'));
app.use('/api/workers', require('./routes/worker-routes/job.routes'));
app.use('/api/workers', require('./routes/worker-routes/dashboard.routes'));
app.use('/api/workers/wallet', require('./routes/worker-routes/wallet.routes'));
app.use('/api/workers/team', require('./routes/worker-routes/team.routes'));
app.use('/api/workers', require('./routes/worker-routes/workerRequests.routes'));
app.use('/api/workers/assignments', require('./routes/worker-routes/assignment.routes'));
app.use('/api/workers', require('./routes/worker-routes/assignment.routes'));


// Mobile App Routes (unified login role detection & common FCM tokens)
app.use('/api/app', require('./routes/common-routes/appAuth.routes'));
app.use('/api/fcm-tokens', require('./routes/common-routes/fcmToken.routes'));

// Admin routes
app.use('/api/admin/auth', require('./routes/admin-routes/adminAuth.routes'));
// Geographic management routes (State → District → SubDistrict)
app.use('/api/admin', require('./routes/admin-routes/geoManagement.routes.js'));
app.use('/api/admin', require('./routes/admin-routes/dashboard.routes'));
app.use('/api/admin', require('./routes/admin-routes/userManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/vendorManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/workerManagement.routes'));
app.use('/api/admin/equipment', require('./routes/admin-routes/equipmentManagement.routes'));
app.use('/api/admin/reports', require('./routes/admin-routes/reportManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/categoryManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/brandManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/serviceManagement.routes'));

app.use('/api/admin', require('./routes/admin-routes/homePageManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/bookingManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/paymentManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/transactionManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/upload.routes'));
app.use('/api/admin', require('./routes/admin-routes/planManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/settings.routes'));
app.use('/api/admin', require('./routes/admin-routes/reviewManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/productManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/soilTest.routes'));
app.use('/api/admin', require('./routes/admin-routes/reportManagement.routes'));
app.use('/api/admin/disputes', require('./routes/admin-routes/disputeManagement.routes'));
app.use('/api/admin/settlements', require('./routes/admin-routes/settlementManagement.routes'));
app.use('/api/admin/website', require('./routes/admin-routes/websiteManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/adminPayout.routes'));
app.use('/api/admin/admins', require('./routes/admin-routes/adminManagement.routes'));
app.use('/api/admin/payroll', require('./routes/admin-routes/adminPayroll.routes'));
app.use('/api/image', require('./routes/admin-routes/image.routes'));
app.use('/api', require('./routes/admin-routes/upload.routes')); // Generic upload access

// User routes additions
app.use('/api/user/soil-test', require('./routes/user-routes/soilTest.routes'));
app.use('/api/user/ecommerce', require('./routes/user-routes/product.routes.js'));
app.use('/api/user/ecommerce-cart', require('./routes/user-routes/ecommerceCart.routes'));

// Vendor Wallet/Ledger routes
// Vendor Wallet/Ledger routes
// WARNING: This mounts at /api/vendors, meaning routes inside are relative to that.
// e.g., router.post('/withdrawal') becomes /api/vendors/withdrawal
app.use('/api/vendors', require('./routes/vendor-routes/vendorWallet.routes'));
app.use('/api/vendors/store', require('./routes/vendor-routes/productManagement.routes'));
app.use('/api/vendors/shop', require('./routes/vendor-routes/shop.routes'));
app.use('/api/vendors/soil-test', require('./routes/vendor-routes/soilTest.routes'));

// Booking routes
app.use('/api/bookings', require('./routes/booking-routes/userBooking.routes'));
app.use('/api/bookings/cash', require('./routes/booking-routes/cashCollection.routes'));
app.use('/api/tracking', require('./routes/booking-routes/tracking.routes'));
app.use('/api/users/tracking', require('./routes/booking-routes/tracking.routes'));
app.use('/api/user/tracking', require('./routes/booking-routes/tracking.routes'));

// Payment routes
app.use('/api/payments', require('./routes/payment-routes/payment.routes'));

// Notification routes
app.use('/api/notifications', require('./routes/notification.routes'));

// Support routes
app.use('/api/support', require('./routes/user-routes/support.routes'));
app.use('/api/admin/support', require('./routes/admin-routes/support.routes'));

// Dispute routes (Common)
app.use('/api/disputes', require('./routes/common-routes/dispute.routes'));

// Withdrawal routes (Common: User, Vendor, Worker, Admin)
app.use('/api/withdrawals', require('./routes/common-routes/withdrawal.routes'));

// Referral routes
app.use('/api/referrals', require('./routes/common-routes/referral.routes'));
app.use('/api/admin/referrals', require('./routes/admin-routes/referralManagement.routes'));

// Public routes (no authentication required)
app.use('/api/content', require('./routes/contentRoutes'));
app.use('/api/webhooks', require('./routes/common-routes/webhook.routes'));
app.use('/api/public/website', require('./routes/public-routes/website.routes'));
app.use('/api/public', require('./routes/public-routes/catalog.routes'));
app.use('/api/public', require('./routes/public-routes/plan.routes'));
app.use('/api/public', require('./routes/public-routes/config.routes'));
app.use('/api/products', require('./routes/public-routes/product.routes'));
app.use('/api/weather', require('./routes/common-routes/weather.routes'));
app.use('/api/availabilities', require('./routes/common-routes/availability.routes'));
app.use('/api/public/equipment', require('./routes/public-routes/equipment.routes'));
app.use('/api/v1/translate', require('./routes/common-routes/translation.routes'));

// SEO Dynamic Sitemap
app.use('/', require('./routes/common-routes/sitemap.routes'));

// Chatbot routes
app.use('/api/chat', require('./routes/common-routes/chat.routes'));

// Farmer routes (User Panel - Agriculture module)
app.use('/api/farmer', require('./routes/farmer-routes/index'));

// 404 handler
app.use((req, res) => {
  console.log(`[404 HANDLER] Route not found - Method: ${req.method}, Path: ${req.path}, OriginalUrl: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    method: req.method,
    path: req.path
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize Socket.io
let server;
if (process.env.VERCEL !== '1' && !process.env.VERCEL_ENV) {
  const PORT = process.env.PORT || 5000;
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });

  // Initialize Socket.io
  const { initializeSocket, getIO } = require('./sockets');
  initializeSocket(server);

  // Make io instance available in request
  app.set('io', getIO());

  // Initialize Booking Scheduler for Wave-Based Alerting
  const { initializeScheduler } = require('./services/bookingScheduler');
  initializeScheduler(getIO());
  console.log('[Server] Booking Scheduler initialized for wave-based alerting');

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    server.close(() => {
      process.exit(1);
    });
  });
} else {
  // For Vercel, create HTTP server for Socket.io
  const http = require('http');
  server = http.createServer(app);
  const { initializeSocket } = require('./sockets');
  initializeSocket(server);
}

module.exports = app;

