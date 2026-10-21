// Mirrors Backend/services/distanceTripService.js calcDistanceFare: 0-baseKm costs baseCharge, each extra km costs perKmRate.
const round2 = (n) => Math.round(n * 100) / 100;

export const calcDistanceFare = (pricing, km) => {
  const baseKm = Number(pricing?.baseKm) || 0;
  const baseCharge = Number(pricing?.baseCharge) || 0;
  const perKm = Number(pricing?.perKmRate) || 0;
  const dist = Math.max(0, Number(km) || 0);
  return round2(baseCharge + Math.max(0, dist - baseKm) * perKm);
};

// Approx bill the farmer would see before booking: fare for the estimated km plus GST and the platform fee. Never charged as-is.
export const estimateDistanceBill = (pricing, km, gstPercentage = 5, platformFeePercentage = 0) => {
  if (!pricing || !(Number(km) > 0)) return null;
  const fare = calcDistanceFare(pricing, km);
  const tax = Math.round(fare * (Number(gstPercentage) || 0) / 100);
  const platformFee = round2(fare * (Number(platformFeePercentage) || 0) / 100);
  return { fare, tax, platformFee, total: round2(fare + tax + platformFee) };
};
