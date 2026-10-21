/**
 * Vendor's share (%) of a booking's service base, driven by "Vendor Commission" in admin settings.
 * Every vendor billing path (machinery timer, self-job, manual bill) and the vendor app read it from here.
 * Falls back to the legacy rentalPayoutPercentage for settings documents saved before the commission field existed.
 */
const getVendorPayoutPercentage = (settings) => {
  const commission = Number(settings?.bookingCommissionPercentage);
  if (settings?.bookingCommissionPercentage != null && Number.isFinite(commission) && commission >= 0 && commission <= 100) {
    return 100 - commission;
  }
  return settings?.rentalPayoutPercentage ?? 90;
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Platform's own earning on a booking: what it keeps after paying the vendor, excluding GST collected for the government.
 * Bookings without a bill (legacy) fall back to the current Vendor Commission on the booking amount.
 */
const getPlatformEarning = (bill, booking, settings) => {
  if (bill) return round2((bill.companyRevenue || 0) - (bill.totalGST || 0));
  // no bill yet: the platform fee inside the total is the platform's in full, the commission applies to the rest
  const fee = Number(booking?.platformFee) || 0;
  return round2((((booking?.finalAmount || 0) - fee) * (100 - getVendorPayoutPercentage(settings))) / 100 + fee);
};

const getVendorEarning = (bill, booking, settings) => {
  if (bill) return bill.vendorTotalEarning || 0;
  return round2((((booking?.finalAmount || 0) - (Number(booking?.platformFee) || 0)) * getVendorPayoutPercentage(settings)) / 100);
};

/**
 * Platform fee (%) the farmer pays on top of a machinery booking, from "Machinery Platform Fee" in admin settings.
 * 0 when unset, so nothing is charged until the admin turns it on.
 */
const getPlatformFeePercentage = (settings) => {
  const pct = Number(settings?.machineryPlatformFeePercentage);
  return Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct : 0;
};

/** The platform fee is a share of the service base (before GST, excluding visiting / travel / penalty charges). */
const computePlatformFee = (serviceBase, pct) => round2(((Number(serviceBase) || 0) * (Number(pct) || 0)) / 100);

/**
 * Rate frozen on the booking when it was made. Bookings made before the fee existed carry no rate and are never charged
 * (changing the setting must not add a fee to a job the farmer already booked).
 */
const getBookingPlatformFeePercentage = (booking) => {
  const pct = Number(booking?.platformFeePercentage);
  return Number.isFinite(pct) && pct > 0 ? pct : 0;
};

/**
 * What the vendor is expected to earn on a booking that has no final bill yet: the commission split applies to the
 * service price before GST; the travel charge is the vendor's in full; GST and the platform fee are not the vendor's.
 */
const estimateVendorEarning = (booking, payoutPct) => round2(
  ((Number(booking?.basePrice) || 0) * (Number(payoutPct) || 0)) / 100 + (Number(booking?.travelCharge) || 0)
);

module.exports = {
  getVendorPayoutPercentage, getPlatformEarning, getVendorEarning, estimateVendorEarning,
  getPlatformFeePercentage, computePlatformFee, getBookingPlatformFeePercentage
};
