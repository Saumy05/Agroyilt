import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

const AppEntry = lazy(() => import('../pages/AppEntry'));
const AppRegister = lazy(() => import('../pages/AppRegister'));
const AppLogin = lazy(() => import('../pages/AppLogin'));
const AppRegistrationFee = lazy(() => import('../pages/AppRegistrationFee'));
const AppGuide = lazy(() => import('../pages/AppGuide'));

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

const AppRoutes = () => (
  <Suspense fallback={<LoadingFallback />}>
    <Routes>
      <Route path="/" element={<AppEntry />} />
      <Route path="/register" element={<AppRegister />} />
      <Route path="/login" element={<AppLogin />} />
      <Route path="/registration-fee" element={<AppRegistrationFee />} />
      <Route path="/guide" element={<AppGuide />} />
      {/* Catch-all → entry screen */}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  </Suspense>
);

export default AppRoutes;
