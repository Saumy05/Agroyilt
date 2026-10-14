import { useEffect, useState } from 'react';
import referralService from '../services/referralService';

// Referral UI is admin-controlled and off by default: hidden until the server confirms it is on for the role.
// One shared request per page load; role is 'farmer' | 'vendor' | 'worker' (omit for "any role").
const OFF = { farmer: false, vendor: false, worker: false };
let cached = null;
let inflight = null;

const loadStatus = () => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = referralService.getPublicStatus()
      .then(res => { cached = { ...OFF, ...(res?.data || {}) }; return cached; })
      .catch(() => OFF)
      .finally(() => { inflight = null; });
  }
  return inflight;
};

export function useReferralEnabled(role) {
  const [status, setStatus] = useState(cached);

  useEffect(() => {
    let alive = true;
    loadStatus().then(s => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);

  const loaded = status !== null;
  const enabled = loaded && (role ? !!status[role] : Object.values(status).some(Boolean));
  return { enabled, loaded };
}

export default useReferralEnabled;
