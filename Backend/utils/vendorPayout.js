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
  return round2(((booking?.finalAmount || 0) * (100 - getVendorPayoutPercentage(settings))) / 100);
};

const getVendorEarning = (bill, booking, settings) => {
  if (bill) return bill.vendorTotalEarning || 0;
  return round2(((booking?.finalAmount || 0) * getVendorPayoutPercentage(settings)) / 100);
};

module.exports = { getVendorPayoutPercentage, getPlatformEarning, getVendorEarning };
