import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toastManager } from '../../utils/toastManager';
import authStorage, { normalizeRole } from '../../utils/authStorage';
import { verifySessionOnce } from '../../utils/verifySession';

/**
 * Protected Route Component
 * Strictly checks tab-isolated session storage for the specified role
 */
const ProtectedRoute = ({ children, userType = 'user', redirectTo = null }) => {
  const location = useLocation();
  const canonicalRole = normalizeRole(userType);

  const checkAuthSync = () => {
    return authStorage.isAuthenticated(canonicalRole);
  };

  // Synchronously initialize state so we don't flash a loading screen
  const [isAuth, setIsAuth] = useState(checkAuthSync);

  // Still verify on route change to catch session expiry dynamically
  useEffect(() => {
    const isAuthNow = checkAuthSync();
    if (isAuth !== isAuthNow) {
      setIsAuth(isAuthNow);
      if (!isAuthNow) {
        toastManager.error('Session expired. Please login again.');
      }
    }
  }, [location.pathname, userType]);

  // The token can look valid locally while the account is gone or suspended; ask the server once per login
  useEffect(() => {
    if (!isAuth) return undefined;
    let cancelled = false;
    verifySessionOnce(canonicalRole).then((ok) => {
      if (!cancelled && !ok) setIsAuth(false);
    });
    return () => { cancelled = true; };
  }, [isAuth, canonicalRole]);

  if (!isAuth) {
    // Determine redirect path
    const defaultRedirects = {
      user: '/app/login',
      vendor: '/app/login',
      worker: '/app/login',
      admin: '/admin/login'
    };

    const redirectPath = redirectTo || defaultRedirects[canonicalRole] || '/app/login';

    return <Navigate to={redirectPath} state={{ from: location, role: canonicalRole }} replace />;
  }

  return children;
};

export default ProtectedRoute;
