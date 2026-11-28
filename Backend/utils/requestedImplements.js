const MAX_RATE = 50000;

const sanitizeSlug = (title = '') =>
  String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');

const buildAttachmentPricing = (raw = {}) => {
  const modes = ['hourly', 'per_minute', 'land_based', 'daily'];
  const out = {};

  for (const mode of modes) {
    const entry = raw?.[mode];
    const price = Number(entry?.price) || 0;
    if (!Number.isFinite(price) || price < 0 || price > MAX_RATE) {
      return { error: `Invalid ${mode.replace('_', ' ')} rate for requested attachment (must be 0-${MAX_RATE})` };
    }
    out[mode] = { price, isEnabled: price > 0 || !!entry?.isEnabled };
  }

  const dist = raw?.distance_based;
  const kmPrice = Number(dist?.price ?? dist?.perKmRate) || 0;
  const baseCharge = Number(dist?.baseCharge) || 0;
  const baseKm = Number(dist?.baseKm) || 0;
  if (!Number.isFinite(kmPrice) || kmPrice < 0 || kmPrice > MAX_RATE) {
    return { error: `Invalid distance-based rate for requested attachment (must be 0-${MAX_RATE})` };
  }
  if (!Number.isFinite(baseCharge) || baseCharge < 0 || baseCharge > MAX_RATE || !Number.isFinite(baseKm) || baseKm < 0) {
    return { error: 'Invalid base distance charge for requested attachment' };
  }

  out.distance_based = {
    price: kmPrice,
    perKmRate: kmPrice,
    baseCharge,
    baseKm,
    isEnabled: kmPrice > 0 || !!dist?.isEnabled
  };

  return { pricing: out };
};

const pricingSignature = (pricing = {}) =>
  JSON.stringify([
    Number(pricing?.hourly?.price) || 0,
    !!pricing?.hourly?.isEnabled,
    Number(pricing?.land_based?.price) || 0,
    !!pricing?.land_based?.isEnabled,
    Number(pricing?.daily?.price) || 0,
    !!pricing?.daily?.isEnabled,
    Number(pricing?.distance_based?.price) || 0,
    !!pricing?.distance_based?.isEnabled
  ]);

/**
 * Validates and normalizes vendor-requested custom attachments.
 * Rejected entries stay rejected only while untouched; editing name or pricing resets them to pending.
 */
const normalizeRequestedImplements = (rawList, { existingRequested = [] } = {}) => {
  if (rawList === undefined || rawList === null) return { requestedImplements: [] };
  if (!Array.isArray(rawList)) return { error: 'requestedImplements must be an array' };
  if (rawList.length > 25) return { error: 'You can request at most 25 custom attachments at once' };

  const existingById = new Map(
    (existingRequested || []).map((item) => [String(item._id), item])
  );
  const seenNames = new Set();
  const normalized = [];

  for (const rawItem of rawList) {
    const name = String(rawItem?.name || '').trim();
    if (name.length < 2 || name.length > 80) {
      return { error: 'Requested attachment name must be between 2 and 80 characters' };
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    const { pricing, error } = buildAttachmentPricing(rawItem?.pricing);
    if (error) return { error };

    const prev = rawItem?._id ? existingById.get(String(rawItem._id)) : null;
    const unchangedRejected = Boolean(
      prev &&
      prev.status === 'rejected' &&
      rawItem?.status === 'rejected' &&
      prev.name?.trim().toLowerCase() === key &&
      pricingSignature(prev.pricing) === pricingSignature(pricing)
    );

    normalized.push({
      ...(prev?._id ? { _id: prev._id } : {}),
      name,
      status: unchangedRejected ? 'rejected' : 'pending',
      adminRemarks: unchangedRejected ? (prev.adminRemarks || null) : null,
      pricing
    });
  }

  return { requestedImplements: normalized };
};

module.exports = {
  sanitizeSlug,
  buildAttachmentPricing,
  normalizeRequestedImplements
};
