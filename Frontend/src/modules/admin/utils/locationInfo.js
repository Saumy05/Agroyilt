const clean = (v) => (v == null ? '' : String(v).trim());
const isCoord = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

/**
 * Registered (static) location of a farmer / worker / vendor, from whichever fields that role stores:
 * farmers -> addresses[] + farms[].location, workers -> address, vendors -> address + shopDetails.shopLocation.
 * Admin geo scope (subDistrictName / districtName) is preferred for the headline since it is what admins filter by.
 */
export const getLocationInfo = (entity) => {
  if (!entity) return { area: '', detail: '', mapUrl: null };

  const addr = entity.address
    || entity.addresses?.find((a) => a.isDefault)
    || entity.addresses?.[0]
    || entity.farms?.[0]?.location
    || {};

  const scope = [entity.subDistrictName, entity.districtName].map(clean).filter(Boolean).join(', ');
  const area = scope || [addr.city, addr.state].map(clean).filter(Boolean).join(', ');
  const detail = clean(addr.fullAddress)
    || [addr.addressLine1, addr.city, addr.state, addr.pincode].map(clean).filter(Boolean).join(', ');

  const coords = [entity.shopDetails?.shopLocation, addr, ...(entity.farms || []).map((f) => f.location)].find(isCoord);
  const query = coords ? `${coords.lat},${coords.lng}` : encodeURIComponent(detail || area);
  const mapUrl = query ? `https://www.google.com/maps/search/?api=1&query=${query}` : null;

  return { area, detail, mapUrl };
};
