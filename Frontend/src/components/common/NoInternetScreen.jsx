import React, { useCallback, useEffect, useState } from 'react';
import { FiWifiOff, FiRefreshCw } from 'react-icons/fi';

/**
 * Full-screen "No internet connection" page, shown over the whole app while the device is offline.
 * It covers an app that is already open or opened from cache; a page that cannot be loaded at all is the
 * native WebView's error page, which only the app shell can replace.
 */
const NoInternetScreen = () => {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // navigator.onLine can lag, so Retry makes a real request before hiding the screen
  const retry = useCallback(async () => {
    setChecking(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      await fetch(`${window.location.origin}/robots.txt?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setChecking(false);
    }
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px', textAlign: 'center',
        background: 'linear-gradient(160deg, #1B5E20 0%, #2E7D32 35%, #388E3C 65%, #43A047 100%)',
        color: '#fff', fontFamily: "'Inter', 'Segoe UI', sans-serif"
      }}
    >
      <div style={{
        width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24
      }}>
        <FiWifiOff size={44} />
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>No internet connection</h1>
      <p style={{ margin: '0 0 28px', fontSize: '0.92rem', opacity: 0.9, maxWidth: 300, lineHeight: 1.5 }}>
        Please check your mobile data or Wi-Fi and try again.
      </p>
      <button
        type="button"
        onClick={retry}
        disabled={checking}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '14px 32px',
          borderRadius: 14, border: 'none', background: '#fff', color: '#1B5E20',
          fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', opacity: checking ? 0.7 : 1
        }}
      >
        <FiRefreshCw size={18} style={checking ? { animation: 'agro-spin 0.8s linear infinite' } : undefined} />
        {checking ? 'Checking...' : 'Try again'}
      </button>
      <style>{'@keyframes agro-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
};

export default NoInternetScreen;
