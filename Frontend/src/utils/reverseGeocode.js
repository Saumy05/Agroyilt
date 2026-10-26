/**
 * Name of the place at a map point (village, tehsil, district, state, PIN code), from Google's geocoder.
 * Google's names are a best guess for Indian villages and tehsils, so callers should let the user correct them.
 * Resolves to null when nothing could be found; never throws.
 */

const firstOf = (results, types) => {
  for (const r of results) {
    const found = (r.address_components || []).find((c) => types.some((t) => (c.types || []).includes(t)));
    if (found) return found.long_name;
  }
  return '';
};

const toPlace = (results) => {
  if (!Array.isArray(results) || results.length === 0) return null;
  const place = {
    village: firstOf(results, ['sublocality_level_1', 'sublocality', 'neighborhood', 'locality']),
    tehsil: firstOf(results, ['administrative_area_level_3', 'locality']),
    district: firstOf(results, ['administrative_area_level_2']),
    state: firstOf(results, ['administrative_area_level_1']),
    pincode: firstOf(results, ['postal_code'])
  };
  return Object.values(place).some(Boolean) ? place : null;
};

export const reverseGeocode = async (lat, lng) => {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const latlng = { lat: Number(lat), lng: Number(lng) };

  try {
    if (window.google?.maps?.Geocoder) {
      const results = await new Promise((resolve) => {
        new window.google.maps.Geocoder().geocode({ location: latlng }, (res, status) => resolve(status === 'OK' ? res : []));
      });
      return toPlace(results);
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latlng.lat},${latlng.lng}&language=en&key=${apiKey}`);
    const data = await response.json();
    return data.status === 'OK' ? toPlace(data.results) : null;
  } catch {
    return null;
  }
};
