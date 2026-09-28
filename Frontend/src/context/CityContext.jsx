/**
 * CityContext — BACKWARD COMPATIBILITY SHIM
 *
 * The City-based geographic scope has been migrated to State/District/SubDistrict.
 * This file now re-exports from GeoContext to prevent breaking any components
 * that still import useCity() or CityProvider directly.
 *
 * MIGRATION STATUS: COMPLETED
 * New code should import from: '../../../../context/GeoContext'
 * using useGeo() instead of useCity().
 *
 * This shim will be removed once all consumers have been updated.
 */
export { useGeo as useCity, GeoProvider as CityProvider } from './GeoContext';
