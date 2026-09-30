import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Import module routes
import LandingPage from '../modules/landing/LandingPage';
import UserRoutes from '../modules/user/routes';
import VendorRoutes from '../modules/vendor/routes';
import WorkerRoutes from '../modules/worker/routes';
import AdminRoutes from '../modules/admin/routes';
import MobileAppRoutes from '../modules/app/routes'; // Mobile-only app module
import BlogListing from '../modules/landing/pages/BlogListing';
import ArticleListing from '../modules/landing/pages/ArticleListing';
import BlogDetail from '../modules/landing/pages/BlogDetail';
import ArticleDetail from '../modules/landing/pages/ArticleDetail';
import AboutPage from '../modules/landing/pages/AboutPage';
import ServicesPage from '../modules/landing/pages/ServicesPage';
import WorkflowPage from '../modules/landing/pages/WorkflowPage';
import FAQPage from '../modules/landing/pages/FAQPage';
import { LocationPermissionChecker } from '../components/common';
import { isMobileApp } from '../utils/platformUtils';
import authStorage from '../utils/authStorage';

const AppRoutes = () => {
  const location = useLocation();
  const [isMobile, setIsMobile] = React.useState(isMobileApp());

  const getMobileRedirect = () => {
    if (authStorage.isAuthenticated('user')) return '/user';
    if (authStorage.isAuthenticated('vendor')) return '/vendor';
    if (authStorage.isAuthenticated('worker')) return '/worker';
    return '/app';
  };

  React.useEffect(() => {
    const handleResize = () => setIsMobile(isMobileApp());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    // console.log(' Current Route Path:', location.pathname);
  }, [location.pathname]);

  const isAdminRoute = location.pathname.startsWith('/admin');
  const isVendorRoute = location.pathname.startsWith('/vendor');
  const isWorkerRoute = location.pathname.startsWith('/worker');
  const isAppRoute = location.pathname.startsWith('/app');

  const hideGlobalElements =
    isAdminRoute ||
    isVendorRoute ||
    isWorkerRoute ||
    isAppRoute ||
    [
      '/user/privacy',
      '/user/help-support',
      '/user/cancellation-policy',
      '/privacy',
      '/terms',
      '/support'
    ].includes(location.pathname);

  return (
    <>
      <Routes>
        {/* Module Routes - High Priority */}
        <Route path="/user/*" element={<UserRoutes />} />
        <Route path="/vendor/*" element={<VendorRoutes />} />
        <Route path="/worker/*" element={<WorkerRoutes />} />
        <Route path="/admin/*" element={<AdminRoutes />} />

        {/* Mobile App Routes (/app, /app/register, /app/login) */}
        <Route path="/app/*" element={<MobileAppRoutes />} />

        {/*
          Landing experience:
          - Desktop browser  → shows the existing landing page
          - Mobile browser   → redirects to /app (native-feel entry screen)
          - Flutter WebView  → redirects to /app (native-feel entry screen)
        */}
        <Route
          path="/"
          element={
            isMobile
              ? <Navigate to={getMobileRedirect()} replace />
              : <LandingPage />
          }
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/workflow" element={<WorkflowPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/blogs" element={<BlogListing />} />
        <Route path="/blogs/:id" element={<BlogDetail />} />
        <Route path="/articles" element={<ArticleListing />} />
        <Route path="/articles/:id" element={<ArticleDetail />} />

        {/* Public utility URLs (Great for iOS/App Store) */}
        <Route path="/privacy" element={<Navigate to="/user/privacy" replace />} />
        <Route path="/support" element={<Navigate to="/user/help-support" replace />} />
        <Route path="/terms" element={<Navigate to="/user/cancellation-policy" replace />} />

        {/* Referral / Universal Registration Entry */}
        <Route
          path="/register"
          element={<Navigate to={`/app/register${location.search}`} replace />}
        />

        {/* Fallback for any unknown user routes to go to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!hideGlobalElements && (
        <>
          <LocationPermissionChecker />
        </>
      )}
    </>
  );
};

export default AppRoutes;
