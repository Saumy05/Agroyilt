/**
 * Admin list filter on the registration fee, as a Mongo query fragment.
 *   PAID   - paid a real fee (amount > 0)
 *   FREE   - activated at ₹0 (a free period, or the fee was turned off)
 *   UNPAID - not paid; also matches docs that predate the field
 * Returns {} for anything else so it can be spread into a query.
 */
const registrationFeeQuery = (value) => {
  switch (value) {
    case 'PAID': return { registrationFeeStatus: 'PAID', registrationFeeAmount: { $gt: 0 } };
    case 'FREE': return { registrationFeeStatus: 'PAID', registrationFeeAmount: { $not: { $gt: 0 } } };
    case 'UNPAID': return { registrationFeeStatus: { $ne: 'PAID' } };
    default: return {};
  }
};

module.exports = { registrationFeeQuery };
