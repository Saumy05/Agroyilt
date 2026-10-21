const Service = require('../models/Service');
const Category = require('../models/Category');

/**
 * Machinery GST is one rate for every machinery booking (Settings > Machinery Booking GST). Equipment types carry a copy
 * of it in `gstPercentage` for display and reports, so this keeps those copies equal to the setting.
 * Machinery = a rental / odometer / timestamp category, or an equipment type that has rental rates.
 * @returns {Promise<number>} how many equipment types were updated
 */
const syncMachineryGst = async (pct) => {
  const rate = Number(pct);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return 0;

  const cats = await Category.find({ $or: [{ fulfillmentMode: 'rental' }, { trackingType: { $in: ['odometer', 'timestamp'] } }] }).select('_id').lean();
  const result = await Service.updateMany(
    {
      gstPercentage: { $ne: rate },
      $or: [
        { categoryId: { $in: cats.map(c => c._id) } },
        { hourly_price: { $gt: 0 } }, { land_price: { $gt: 0 } }, { daily_price: { $gt: 0 } },
        { 'distance_pricing.enabled': true }
      ]
    },
    { $set: { gstPercentage: rate } }
  );
  return result.modifiedCount || 0;
};

module.exports = { syncMachineryGst };
