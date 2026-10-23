// A farmer can keep up to 5 saved addresses, one of them the default (the server enforces the same limit).
export const MAX_SAVED_ADDRESSES = 5;

const hasCoordinates = (a) =>
  a?.lat != null && a?.lng != null && Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lng));

/** Addresses that can be used for a booking: only those with coordinates (travel charge and radius matching need them). */
export const usableAddresses = (list) => (Array.isArray(list) ? list : []).filter(hasCoordinates);

/** The default address among usable ones, else the first. */
export const pickDefaultAddress = (usable) => usable.find(a => a.isDefault) || usable[0] || null;

export const addressKey = (a) => String(a?._id || a?.id || `${a?.lat},${a?.lng}`);

/** House number + street line, as one line of text. */
export const addressText = (a) => [a?.addressLine2, a?.addressLine1].filter(Boolean).join(', ');

/** The shape the booking forms work with. */
export const toBookingAddress = (a) => ({
  addressLine1: a.addressLine1 || '',
  addressLine2: a.addressLine2 || '',
  city: a.city || '',
  state: a.state || '',
  pincode: a.pincode || '',
  lat: Number(a.lat),
  lng: Number(a.lng)
});

/** The full address list with `addr` added as the new default (every other address stays, no longer the default). */
export const withNewDefault = (allAddresses, addr) => [
  ...(allAddresses || []).map(a => ({ ...a, isDefault: false })),
  { type: (allAddresses || []).length === 0 ? 'home' : 'other', ...addr, isDefault: true }
];
