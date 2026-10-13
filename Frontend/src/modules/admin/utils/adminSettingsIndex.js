// Individual settings that the admin search can jump to.
// `view` is the Settings page view, `field` is the input's `name` attribute.
export const ADMIN_SETTINGS_INDEX = [
  { label: 'Vendor Commission', view: 'financial', field: 'bookingCommissionPercentage', keywords: 'platform cut fee percentage vendor booking' },
  { label: 'Worker Commission', view: 'financial', field: 'workerCommissionPercentage', keywords: 'platform cut fee percentage worker earnings' },
  { label: 'Land Lease Commission', view: 'financial', field: 'landLeaseCommissionPercentage', keywords: 'landowner rent crop share percentage' },
  { label: 'Worker Booking Platform Fee', view: 'financial', field: 'workerPlatformChargePercentage', keywords: 'charge percentage worker booking' },
  { label: 'Machinery Booking GST', view: 'financial', field: 'rentalGstPercentage', keywords: 'tax gst rental tractor harvester' },
  { label: 'Cancellation Penalty', view: 'financial', field: 'cancellationPenalty', keywords: 'cancel fine charge' },
  { label: 'Worker Late-Arrival Penalty', view: 'financial', field: 'workerPenaltyEnabled', keywords: 'late fine grace period per minute cap hourly' },
  { label: 'Vendor Cash Limit', view: 'financial', field: 'vendorCashLimit', keywords: 'cash wallet limit vendor' },
  { label: 'Worker Dues Limit', view: 'financial', field: 'maxWorkerDues', keywords: 'owes blocked unblocked platform fees' },
  { label: 'Allow cash payment for worker bookings', view: 'financial', field: 'workerCashPaymentEnabled', keywords: 'cash online payment worker toggle' },
  { label: 'Minimum Withdrawal Amount', view: 'financial', field: 'minWithdrawalAmount', keywords: 'withdraw payout minimum paise' },
  { label: 'Max Independent Workers per Request', view: 'system', field: 'maxIndependentWorkerRequest', keywords: 'team leader dispatch routing' },
  { label: 'Worker Search Radius (km)', view: 'system', field: 'workerSearchRadiusKm', keywords: 'dispatch nearby matching distance' },
  { label: 'Extension Expiry (mins)', view: 'system', field: 'extensionExpiryMinutes', keywords: 'extension request accept time' },
  { label: 'Start Journey Opens (minutes before start)', view: 'system', field: 'workerJourneyWindowMinutes', keywords: 'on the way job start timing' },
  { label: 'Start OTP Opens (minutes before start)', view: 'system', field: 'workerEarlyStartMinutes', keywords: 'early start job start timing' },
  { label: 'Open Tickets per Support Agent', view: 'system', field: 'supportMaxOpenClaims', keywords: 'support desk claim limit' },
];

export const settingRoute = (s) => `/admin/settings?view=${s.view}&field=${s.field}`;
