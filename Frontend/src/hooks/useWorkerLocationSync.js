import { useEffect, useRef } from 'react';
import workerService from '../services/workerService';
import flutterBridge from '../utils/flutterBridge';
import authStorage from '../utils/authStorage';

const MIN_SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const MIN_DISTANCE_METERS = 50; // Only sync if moved at least 50m

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * useWorkerLocationSync Hook
 * Automatically fetches and syncs the worker's real live GPS coordinates
 * to the backend on app launch and when returning to foreground.
 */
export function useWorkerLocationSync(enabled = true) {
  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef(0);
  const lastCoordsRef = useRef(null);

  const syncLocation = async (force = false) => {
    // Only run for authenticated workers
    const token = authStorage.getAccessToken('worker');
    if (!token || !enabled || isSyncingRef.current) return;

    const now = Date.now();
    if (!force && now - lastSyncTimeRef.current < MIN_SYNC_INTERVAL_MS) {
      return;
    }

    isSyncingRef.current = true;
    try {
      let coords = null;

      // 1. Try native Flutter bridge first (works in Android APK wrapper)
      if (flutterBridge && flutterBridge.isFlutter) {
        try {
          const nativeLoc = await flutterBridge.getCurrentLocation();
          if (nativeLoc && nativeLoc.latitude && nativeLoc.longitude) {
            coords = { lat: Number(nativeLoc.latitude), lng: Number(nativeLoc.longitude) };
          }
        } catch (e) {
          console.warn('[useWorkerLocationSync] Native bridge location failed, falling back to browser GPS:', e.message);
        }
      }

      // 2. Fallback to browser Geolocation API
      if (!coords && typeof navigator !== 'undefined' && navigator.geolocation) {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => {
              console.warn('[useWorkerLocationSync] Browser GPS error:', err.message);
              resolve(null);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
          );
        });
      }

      if (!coords || isNaN(coords.lat) || isNaN(coords.lng)) {
        return;
      }

      // Guard: Ignore dummy New Delhi fallback
      const isDelhiFallback =
        Math.abs(coords.lat - 28.6139) < 0.05 &&
        Math.abs(coords.lng - 77.209) < 0.05;
      if (isDelhiFallback) {
        console.warn('[useWorkerLocationSync] Suppressed dummy New Delhi location report');
        return;
      }

      // Check distance threshold
      if (
        !force &&
        lastCoordsRef.current &&
        calculateDistanceMeters(
          lastCoordsRef.current.lat,
          lastCoordsRef.current.lng,
          coords.lat,
          coords.lng
        ) < MIN_DISTANCE_METERS
      ) {
        lastSyncTimeRef.current = now;
        return;
      }

      // Send to backend
      await workerService.updateLocation(coords.lat, coords.lng);
      console.log(`[useWorkerLocationSync] ✅ Worker location auto-synced: lat=${coords.lat}, lng=${coords.lng}`);

      lastSyncTimeRef.current = now;
      lastCoordsRef.current = coords;
    } catch (err) {
      console.warn('[useWorkerLocationSync] Failed to sync worker location:', err.message);
    } finally {
      isSyncingRef.current = false;
    }
  };

  useEffect(() => {
    if (!enabled) return;

    // 1. Initial sync on mount
    syncLocation(true);

    // 2. Sync when app returns to foreground / unlocks
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncLocation(false);
      }
    };

    const handleFocus = () => syncLocation(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // 3. Periodic background sync every 5 minutes while app is open
    const intervalId = setInterval(() => {
      syncLocation(false);
    }, 5 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
  }, [enabled]);

  return { syncLocation };
}

export default useWorkerLocationSync;

