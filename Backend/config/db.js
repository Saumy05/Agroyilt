const mongoose = require('mongoose');

/**
 * Connect to MongoDB
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // One-time data-safety migration (idempotent): remove the TTL index that hard-deleted live worker bookings.
    require('../models/WorkerBookingRequest').dropLegacyTtlIndex();

    // Farm saves failed while this geo index existed on a non-GeoJSON field.
    require('../models/User').dropLegacyFarmGeoIndex();

    // The lease agreement wording the admin can edit: save the built-in templates if they are not there yet.
    require('../services/agreementDefaults').ensureDefaultTemplates().catch((err) => console.error('[agreementDefaults] seeding failed:', err.message));

  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;

