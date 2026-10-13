import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../services/api';

const FLUSH_EVERY_MS = 10000;
const MAX_BUFFER = 500;

/**
 * Streams the vendor's GPS fixes to the server while a per-km (trolley) trip is running.
 * The server converts them to road distance and keeps the running total, so the meter survives
 * app restarts. Fixes that fail to upload stay buffered and are retried.
 *
 * @param {{bookingId: string, enabled: boolean}} opts
 */
const useDistanceTracker = ({ bookingId, enabled }) => {
  const [live, setLive] = useState({ totalDistanceKm: 0, fare: 0, status: null });
  const [gpsError, setGpsError] = useState(null);
  const buffer = useRef([]);
  const sending = useRef(false);

  const flush = useCallback(async () => {
    if (!bookingId || sending.current || buffer.current.length === 0) return null;
    sending.current = true;
    const batch = buffer.current.splice(0, buffer.current.length);
    try {
      const res = await api.post(`/vendors/bookings/${bookingId}/distance/points`, { points: batch });
      const data = res.data?.data;
      if (data) setLive({ totalDistanceKm: data.totalDistanceKm, fare: data.fare, status: data.status });
      return data;
    } catch (err) {
      // 409 = trip is not running (any more): nothing to retry. Anything else: keep the fixes for the next round.
      if (err?.response?.status !== 409) buffer.current = [...batch, ...buffer.current].slice(-MAX_BUFFER);
      return null;
    } finally {
      sending.current = false;
    }
  }, [bookingId]);

  // Pick up the server's current total (e.g. after an app restart)
  useEffect(() => {
    if (!enabled || !bookingId) return;
    api.get(`/vendors/bookings/${bookingId}/distance`)
      .then((res) => { const d = res.data?.data; if (d) setLive({ totalDistanceKm: d.totalDistanceKm, fare: d.fare, status: d.status }); })
      .catch(() => {});
  }, [enabled, bookingId]);

  useEffect(() => {
    if (!enabled || !bookingId) return undefined;
    if (!navigator.geolocation) { setGpsError('GPS is not available on this device'); return undefined; }

    let wakeLock = null;
    try { navigator.wakeLock?.request('screen').then((l) => { wakeLock = l; }).catch(() => {}); } catch (_) { /* optional */ }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        buffer.current.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: pos.timestamp || Date.now(), accuracy: pos.coords.accuracy });
        if (buffer.current.length > MAX_BUFFER) buffer.current.shift();
      },
      (err) => setGpsError(err.code === 1 ? 'Location permission denied. Turn on GPS to measure distance.' : 'Unable to read GPS location'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    const timer = setInterval(flush, FLUSH_EVERY_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      try { wakeLock?.release(); } catch (_) { /* optional */ }
    };
  }, [enabled, bookingId, flush]);

  /** Fixes not yet confirmed by the server (sent along with the "complete" request so the last leg is billed). */
  const pendingPoints = useCallback(() => [...buffer.current], []);

  return { ...live, gpsError, flush, pendingPoints };
};

/** One-shot current position, used to anchor the start of a trip. */
export const getCurrentFix = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, ts: p.timestamp || Date.now(), accuracy: p.coords.accuracy }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
});

export default useDistanceTracker;
