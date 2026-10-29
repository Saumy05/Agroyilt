import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { isFlutterWebView } from '../../../utils/platformUtils';
import { importOrReload } from '../../../utils/importOrReload';

const AppEntry = lazy(() => importOrReload(() => import('../pages/AppEntry')));
const AppRegister = lazy(() => importOrReload(() => import('../pages/AppRegister')));
const AppLogin = lazy(() => importOrReload(() => import('../pages/AppLogin')));
const AppRegistrationFee = lazy(() => importOrReload(() => import('../pages/AppRegistrationFee')));
const AppGuide = lazy(() => importOrReload(() => import('../pages/AppGuide')));

const LoadingFallback = () => (
  <div style={{
    minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(160deg, #1B5E20 0%, #43A047 100%)',
  }}>
    <div style={{
      width: '36px', height: '36px',
      border: '3px solid rgba(255,255,255,0.3)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

/**
 * AppEntry is ONLY intended for the native Flutter mobile app container.
 * When a visitor in any regular browser (phone browser, desktop, or crawler from Google Search)
 * hits /app or /app/, they are redirected to the website landing page (/).
 */
const AppEntryRoute = () => {
  const [inApp, setInApp] = useState(isFlutterWebView());

  useEffect(() => {
    const onReady = () => setInApp(true);
    window.addEventListener('flutterInAppWebViewPlatformReady', onReady);
    return () => window.removeEventListener('flutterInAppWebViewPlatformReady', onReady);
  }, []);

  if (!inApp) {
    return <Navigate to="/" replace />;
  }

  return <AppEntry />;
};

const AppRoutes = () => (
  <Suspense fallback={<LoadingFallback />}>
    <Routes>
      <Route path="/" element={<AppEntryRoute />} />
      <Route path="/register" element={<AppRegister />} />
      <Route path="/login" element={<AppLogin />} />
      <Route path="/registration-fee" element={<AppRegistrationFee />} />
      <Route path="/guide" element={<AppGuide />} />
      {/* Catch-all → if someone enters an unknown subpath in browser, redirect to landing page */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
);

export default AppRoutes;
