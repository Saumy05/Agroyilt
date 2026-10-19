import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from '../components/layout/AdminLayout';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import ErrorBoundary from '../components/common/ErrorBoundary';
import PermissionRoute from '../components/common/PermissionRoute';
import useAppNotifications from '../../../hooks/useAppNotifications.jsx';

// Login page (not lazy loaded for faster initial access)
import Login from '../pages/login';

// Lazy load admin pages for code splitting
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Settings = lazy(() => import('../pages/Settings'));
const UserCategories = lazy(() => import('../pages/UserCategories'));
const Users = lazy(() => import('../pages/Users'));
const Workers = lazy(() => import('../pages/Workers'));
const Vendors = lazy(() => import('../pages/Vendors'));
const Bookings = lazy(() => import('../pages/Bookings'));
const BookingTracking = lazy(() => import('../pages/Bookings/Tracking'));
const BookingNotifications = lazy(() => import('../pages/Bookings/BookingNotifications'));
const BookingKmPhotos = lazy(() => import('../pages/Bookings/BookingKmPhotos'));
const BookingDetailsPage = lazy(() => import('../pages/Bookings/BookingDetailsPage'));
const KycVerification = lazy(() => import('../pages/Users/KycVerification'));
const Payments = lazy(() => import('../pages/Payments'));
const Reports = lazy(() => import('../pages/Reports'));
const Notifications = lazy(() => import('../pages/Notifications'));

const Withdrawals = lazy(() => import('../pages/Withdrawals'));
const Settlements = lazy(() => import('../pages/Settlements'));
const WorkerDues = lazy(() => import('../pages/Settlements/WorkerDues'));
const Reviews = lazy(() => import('../pages/Reviews'));
const Products = lazy(() => import('../pages/Products'));
import { SOIL_TESTING_ENABLED } from '../../../utils/featureFlags';
const SoilTesting = lazy(() => import('../pages/SoilTesting'));
const LandLeases = lazy(() => import('../pages/LandLeases'));
const Disputes = lazy(() => import('../pages/Disputes'));
const WebsiteSettings = lazy(() => import('../pages/WebsiteSettings'));
const EquipmentApproval = lazy(() => import('../pages/EquipmentApproval'));
const Support = lazy(() => import('../pages/Support'));
const Referrals = lazy(() => import('../pages/Referrals'));
const KisanSuvidha = lazy(() => import('../pages/KisanSuvidha'));


const AdminManagement = lazy(() => import('../pages/AdminManagement'));
const Roles = lazy(() => import('../pages/Roles'));
const MySalary = lazy(() => import('../pages/MySalary'));
const GeographicManagement = lazy(() => import('../pages/Geographic'));

// Loading fallback component
import LogoLoader from '../../../components/common/LogoLoader';

const LoadingFallback = () => (
  <LogoLoader />
);

const AdminRoutes = () => {
  // Enable global notifications for admin
  // Global notifications are now handled by SocketProvider at App level
  // useAppNotifications('admin');

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Login route - outside of layout (public) */}
          <Route path="/login" element={<PublicRoute userType="admin"><Login /></PublicRoute>} />

          {/* Protected routes - inside layout */}
          <Route path="/" element={
            <ProtectedRoute userType="admin">
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            {/* Farmers, Workers, Vendors and Bookings need the matching role permission (same keys the server checks) */}
            <Route path="users/*" element={<PermissionRoute anyOf={['users.view']}><Users /></PermissionRoute>} />
            <Route path="workers/*" element={<PermissionRoute anyOf={['workers.view']}><Workers /></PermissionRoute>} />
            <Route path="vendors/*" element={<PermissionRoute anyOf={['vendors.view', 'payments.view']}><Vendors /></PermissionRoute>} />
            <Route path="bookings" element={<PermissionRoute anyOf={['bookings.view']}><Bookings /></PermissionRoute>} />
            <Route path="bookings/:id" element={<PermissionRoute anyOf={['bookings.view', 'disputes.view']}><BookingDetailsPage /></PermissionRoute>} />
            <Route path="bookings/tracking" element={<PermissionRoute anyOf={['bookings.view']}><BookingTracking /></PermissionRoute>} />
            <Route path="bookings/notifications" element={<PermissionRoute anyOf={['bookings.view']}><BookingNotifications /></PermissionRoute>} />
            <Route path="bookings/km-photos" element={<PermissionRoute anyOf={['bookings.view']}><BookingKmPhotos /></PermissionRoute>} />
            <Route path="users/kyc" element={<PermissionRoute anyOf={['users.view']}><KycVerification /></PermissionRoute>} />
            <Route path="equipment-catalog/*" element={<UserCategories />} />
            <Route path="equipment-approvals/*" element={<EquipmentApproval />} />
            <Route path="payments/*" element={<Payments />} />
            <Route path="reports/*" element={<Reports />} />
            <Route path="notifications/*" element={<Notifications />} />

            <Route path="plans" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="products" element={<Products />} />
            <Route path="soil-tests" element={SOIL_TESTING_ENABLED ? <SoilTesting /> : <Navigate to="/admin/dashboard" replace />} />
            <Route path="land-leases" element={<LandLeases />} />
            <Route path="disputes" element={<Disputes />} />
            <Route path="withdrawals" element={<Withdrawals />} />
            <Route path="withdrawals/*" element={<Withdrawals />} />
            <Route path="settlements/worker-dues" element={<WorkerDues />} />
            <Route path="settlements/*" element={<Settlements />} />
            <Route path="manage-website/*" element={<WebsiteSettings />} />
            <Route path="kisan-suvidha" element={<KisanSuvidha />} />
            <Route path="support" element={<Support />} />
            <Route path="referrals" element={<Referrals />} />
            <Route path="settings/*" element={<Settings />} />
            <Route path="admin-management" element={<AdminManagement />} />
            <Route path="roles" element={<Roles />} />
            <Route path="admin-salaries" element={<Navigate to="/admin/admin-management" replace />} />
            <Route path="admin-payroll" element={<Navigate to="/admin/admin-management" replace />} />
            <Route path="my-salary" element={<MySalary />} />
            <Route path="geographic-management" element={<GeographicManagement />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};

export default AdminRoutes;

