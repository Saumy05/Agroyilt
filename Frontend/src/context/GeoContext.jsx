/**
 * GeoContext — Geographic Location Context
 * Replaces the old CityContext for service/catalog scope resolution.
 *
 * New scope hierarchy:
 *   GLOBAL_INDIA → State → District → SubDistrict
 *
 * This context:
 *   1. Fetches active states from /api/public/states
 *   2. Stores the user's selected/detected location (state/district/subDistrict)
 *   3. Exposes isGlobalIndia flag for when location cannot be determined
 *   4. Persists selection to localStorage
 */
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api, { apiCache } from '../services/api';

const GeoContext = createContext(null);

export const useGeo = () => useContext(GeoContext);

// ── localStorage keys ──────────────────────────────────────────────────────
const LS_STATE_ID   = 'geo_stateId';
const LS_STATE_NAME = 'geo_stateName';
const LS_DIST_ID    = 'geo_districtId';
const LS_DIST_NAME  = 'geo_districtName';
const LS_SUB_ID     = 'geo_subDistrictId';
const LS_SUB_NAME   = 'geo_subDistrictName';

export const GeoProvider = ({ children }) => {
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Current location selection
  const [selectedState, setSelectedState] = useState(() => {
    const id = localStorage.getItem(LS_STATE_ID);
    const name = localStorage.getItem(LS_STATE_NAME);
    return id && name ? { _id: id, name } : null;
  });
  const [selectedDistrict, setSelectedDistrict] = useState(() => {
    const id = localStorage.getItem(LS_DIST_ID);
    const name = localStorage.getItem(LS_DIST_NAME);
    return id && name ? { _id: id, name } : null;
  });
  const [selectedSubDistrict, setSelectedSubDistrict] = useState(() => {
    const id = localStorage.getItem(LS_SUB_ID);
    const name = localStorage.getItem(LS_SUB_NAME);
    return id && name ? { _id: id, name } : null;
  });

  /**
   * Whether the user's location is resolved to any known state.
   * If false, we fall back to GLOBAL_INDIA (show all-India catalog).
   */
  const isLocationResolved = Boolean(selectedState);

  /**
   * Load active states on mount.
   */
  useEffect(() => {
    const loadStates = async () => {
      try {
        setLoading(true);
        const response = await api.get('/public/states');
        if (response.data.success) {
          setStates(response.data.states || []);
        }
      } catch (err) {
        console.error('[GeoContext] Failed to load states:', err);
        setError('Failed to load geographic data');
      } finally {
        setLoading(false);
      }
    };
    loadStates();
  }, []);

  /**
   * Persist and set state selection.
   * Clears district/subDistrict when state changes.
   */
  const selectState = useCallback((state) => {
    setSelectedState(state);
    setSelectedDistrict(null);
    setSelectedSubDistrict(null);

    if (state) {
      localStorage.setItem(LS_STATE_ID, state._id);
      localStorage.setItem(LS_STATE_NAME, state.name);
    } else {
      localStorage.removeItem(LS_STATE_ID);
      localStorage.removeItem(LS_STATE_NAME);
    }
    localStorage.removeItem(LS_DIST_ID);
    localStorage.removeItem(LS_DIST_NAME);
    localStorage.removeItem(LS_SUB_ID);
    localStorage.removeItem(LS_SUB_NAME);

    // Invalidate public catalog cache so categories reload for new location
    if (apiCache && typeof apiCache.invalidatePrefix === 'function') {
      apiCache.invalidatePrefix('public:');
    }
  }, []);

  /**
   * Persist and set district selection.
   * Clears subDistrict when district changes.
   */
  const selectDistrict = useCallback((district) => {
    setSelectedDistrict(district);
    setSelectedSubDistrict(null);

    if (district) {
      localStorage.setItem(LS_DIST_ID, district._id);
      localStorage.setItem(LS_DIST_NAME, district.name);
    } else {
      localStorage.removeItem(LS_DIST_ID);
      localStorage.removeItem(LS_DIST_NAME);
    }
    localStorage.removeItem(LS_SUB_ID);
    localStorage.removeItem(LS_SUB_NAME);

    if (apiCache && typeof apiCache.invalidatePrefix === 'function') {
      apiCache.invalidatePrefix('public:');
    }
  }, []);

  /**
   * Persist and set sub-district selection.
   */
  const selectSubDistrict = useCallback((subDistrict) => {
    setSelectedSubDistrict(subDistrict);

    if (subDistrict) {
      localStorage.setItem(LS_SUB_ID, subDistrict._id);
      localStorage.setItem(LS_SUB_NAME, subDistrict.name);
    } else {
      localStorage.removeItem(LS_SUB_ID);
      localStorage.removeItem(LS_SUB_NAME);
    }

    if (apiCache && typeof apiCache.invalidatePrefix === 'function') {
      apiCache.invalidatePrefix('public:');
    }
  }, []);

  /**
   * Clear all location selection — returns to GLOBAL_INDIA (all-India) mode.
   */
  const clearLocation = useCallback(() => {
    setSelectedState(null);
    setSelectedDistrict(null);
    setSelectedSubDistrict(null);
    [LS_STATE_ID, LS_STATE_NAME, LS_DIST_ID, LS_DIST_NAME, LS_SUB_ID, LS_SUB_NAME]
      .forEach(k => localStorage.removeItem(k));
    if (apiCache && typeof apiCache.invalidatePrefix === 'function') {
      apiCache.invalidatePrefix('public:');
    }
  }, []);

  /**
   * Auto-detect location from a reverse-geocoded address string.
   * Matches state name from known states list (case-insensitive).
   * Returns true if a match was found.
   */
  const detectLocationFromAddress = useCallback((addressString) => {
    if (!addressString || !states.length) return false;
    const lower = addressString.toLowerCase();
    const matched = states.find(s =>
      lower.includes(s.name.toLowerCase()) ||
      lower.includes((s.nameNormalized || '').toLowerCase())
    );
    if (matched && (!selectedState || selectedState._id !== matched._id)) {
      selectState(matched);
      return true;
    }
    return false;
  }, [states, selectedState, selectState]);

  const value = {
    // State list
    states,
    loading,
    error,

    // Current selections
    selectedState,
    selectedDistrict,
    selectedSubDistrict,

    // True when no location is selected → fall back to GLOBAL_INDIA catalog
    isGlobalIndia: !isLocationResolved,
    isLocationResolved,

    // Actions
    selectState,
    selectDistrict,
    selectSubDistrict,
    clearLocation,
    detectLocationFromAddress,

    // ── Backward compatibility for any component still using useCity() ────────
    // These aliases allow a gradual migration without breaking existing consumers
    currentCity: selectedState
      ? { _id: selectedState._id, name: selectedState.name, isDefault: false }
      : null,
    cities: states.map(s => ({ _id: s._id, name: s.name, slug: s.nameNormalized || s.name.toLowerCase() })),
    selectCity: selectState,
  };

  return (
    <GeoContext.Provider value={value}>
      {children}
    </GeoContext.Provider>
  );
};

export default GeoContext;
