import { useEffect, useState } from 'react';
import api from '../services/api';

// Which land lease types the admin has switched on. Everything is on until the server says otherwise,
// so a slow or failed request never hides the feature.
const ALL_ON = { fixedRent: true, cropShare: true };

let cached = null;
let inflight = null;

const load = () => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api.get('/public/config')
      .then((res) => {
        const s = res.data?.settings || {};
        cached = { fixedRent: s.landLeaseFixedRentEnabled !== false, cropShare: s.landLeaseCropShareEnabled !== false };
        return cached;
      })
      .catch(() => ALL_ON)
      .finally(() => { inflight = null; });
  }
  return inflight;
};

export const useLeaseTypes = () => {
  const [types, setTypes] = useState(cached || ALL_ON);
  const [loaded, setLoaded] = useState(Boolean(cached));

  useEffect(() => {
    let alive = true;
    // Refetch each time a screen mounts so an admin change shows up without a reinstall
    cached = null;
    load().then((t) => { if (alive) { setTypes(t); setLoaded(true); } });
    return () => { alive = false; };
  }, []);

  return { ...types, anyEnabled: types.fixedRent || types.cropShare, loaded };
};
