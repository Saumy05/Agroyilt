/**
 * Indian Agricultural Land Measurement Utilities & Geodesic Calculators
 * Standard units:
 * 1 Acre = 4046.8564224 m² = 43,560 sq ft
 * 1 Hectare = 10,000 m² = 2.47105 Acres
 * 1 Acre = 40 Guntha
 */

export const REGIONAL_BIGHA_RATES = [
  { key: 'standard', name: 'Standard / Uttar Pradesh', rate: 1.613, desc: '1 Acre ≈ 1.61 Bigha (27,225 sq ft/bigha)' },
  { key: 'up_bihar', name: 'UP & Bihar', rate: 1.613, desc: '1 Acre ≈ 1.61 Bigha' },
  { key: 'rajasthan', name: 'Rajasthan (Pucca)', rate: 1.60, desc: '1 Acre ≈ 1.60 Bigha (27,225 sq ft)' },
  { key: 'mp', name: 'Madhya Pradesh', rate: 1.67, desc: '1 Acre ≈ 1.67 Bigha' },
  { key: 'punjab_haryana', name: 'Punjab & Haryana', rate: 1.0, desc: '1 Acre = 1 Killa / Pucca Bigha' },
  { key: 'gujarat', name: 'Gujarat (Vigha)', rate: 2.47, desc: '1 Acre ≈ 2.47 Vigha (16 Guntha/Vigha)' },
  { key: 'west_bengal', name: 'West Bengal', rate: 3.025, desc: '1 Acre ≈ 3.03 Bigha' },
  { key: 'maharashtra', name: 'Maharashtra', rate: 1.613, desc: 'Measured in Guntha (1 Acre = 40 Guntha)' }
];

const EARTH_RADIUS = 6378137; // meters (WGS84 authalic / mean radius)

/**
 * Calculates Haversine distance in meters between two lat/lng coordinates
 */
export function getHaversineDistance(p1, p2) {
  if (!p1 || !p2) return 0;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

/**
 * Calculates total perimeter of a polygon in meters
 */
export function calculatePolygonPerimeter(points) {
  if (!points || points.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    perimeter += getHaversineDistance(points[i], next);
  }
  return perimeter;
}

/**
 * Calculates spherical geodesic area of a polygon in square meters
 * using Gauss's area formula on a spherical Earth (matching Google Maps geometry).
 */
export function calculateGeodesicArea(points) {
  if (!points || points.length < 3) return 0;
  let total = 0;
  const len = points.length;

  for (let i = 0; i < len; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % len];
    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const lng1 = (p1.lng * Math.PI) / 180;
    const lng2 = (p2.lng * Math.PI) / 180;
    total += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

/**
 * Converts area in square meters into all Indian agricultural units
 */
export function convertArea(sqMeters, regionKey = 'standard') {
  const safeSqMeters = Math.max(0, parseFloat(sqMeters) || 0);
  const acres = safeSqMeters / 4046.8564224;
  const hectares = safeSqMeters / 10000;
  const sqFeet = safeSqMeters * 10.7639104;
  const guntha = acres * 40;

  const regionCfg =
    REGIONAL_BIGHA_RATES.find((r) => r.key === regionKey) || REGIONAL_BIGHA_RATES[0];
  const bigha = acres * regionCfg.rate;

  return {
    sqMeters: Math.round(safeSqMeters * 100) / 100,
    acres: Math.round(acres * 10000) / 10000,
    acresFormatted: Number(acres.toFixed(2)),
    bigha: Math.round(bigha * 1000) / 1000,
    bighaFormatted: Number(bigha.toFixed(2)),
    guntha: Math.round(guntha * 100) / 100,
    gunthaFormatted: Number(guntha.toFixed(1)),
    hectares: Math.round(hectares * 10000) / 10000,
    hectaresFormatted: Number(hectares.toFixed(2)),
    sqFeet: Math.round(sqFeet),
    regionKey,
    regionLabel: regionCfg.name,
    ratePerAcre: regionCfg.rate
  };
}

/**
 * Computes polygon centroid to position labels and center view
 */
export function calculatePolygonCenter(points) {
  if (!points || points.length === 0) return { lat: 28.6139, lng: 77.209 };
  let totalLat = 0;
  let totalLng = 0;
  points.forEach((p) => {
    totalLat += p.lat;
    totalLng += p.lng;
  });
  return {
    lat: totalLat / points.length,
    lng: totalLng / points.length
  };
}
