import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import authStorage from '../../../../utils/authStorage';
import { toastManager } from '../../../../utils/toastManager';

/**
 * Lets an admin open a page only when their role has at least one of the permissions in `anyOf`.
 * Super admins always pass. This only keeps people out of pages: the server checks the same keys on every request.
 */
const PermissionRoute = ({ anyOf, children }) => {
  const admin = authStorage.getUserData('admin') || {};
  const allowed = admin.role === 'super_admin' || anyOf.some((key) => admin.permissions?.[key]);

  useEffect(() => {
    if (!allowed) toastManager.error('Your role does not have access to that page.');
  }, [allowed]);

  return allowed ? children : <Navigate to="/admin/dashboard" replace />;
};

export default PermissionRoute;
