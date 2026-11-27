import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Import module routes
import LandingPage from '../modules/landing/LandingPage';
import BlogListing from '../modules/landing/pages/BlogListing';
import ArticleListing from '../modules/landing/pages/ArticleListing';
import BlogDetail from '../modules/landing/pages/BlogDetail';
import ArticleDetail from '../modules/landing/pages/ArticleDetail';
import AboutPage from '../modules/landing/pages/AboutPage';
import ServicesPage from '../modules/landing/pages/ServicesPage';
import WorkflowPage from '../modules/landing/pages/WorkflowPage';
import FAQPage from '../modules/landing/pages/FAQPage';
import { TermsPage, PrivacyPage } from '../modules/legal/LegalPage';
import { LocationPermissionChecker } from '../components/common';
import { isFlutterWebView } from '../utils/platformUtils';
import authStorage from '../utils/authStorage';
import LogoLoader from '../components/common/LogoLoader';
import { importOrReload } from '../utils/importOrReload';

// Each module is downloaded only when one of its pages is opened, so website visitors don't wait for app code
const lazyModule = (importFunc) => React.lazy(() => importOrReload(importFunc).catch(() => ({
  default: () => (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center">
      <p className="text-gray-700 font-semibold">Failed to load page. Please check your internet connection.</p>
      <button onClick={() => window.location.reload()} className="px-6 py-3 rounded-xl bg-green-700 text-white font-semibold">
        Refresh Page
      </button>
    </div>
  ),
})));

const UserRoutes = lazyModule(() => import('../modules/user/routes'));
const VendorRoutes = lazyModule(() => import('../modules/vendor/routes'));
const WorkerRoutes = lazyModule(() => import('../modules/worker/routes'));
const AdminRoutes = lazyModule(() => import('../modules/admin/routes'));
const MobileAppRoutes = lazyModule(() => import('../modules/app/routes')); // Mobile-only app module
const ReferralInvite = lazyModule(() => import('../modules/app/pages/ReferralInvite'));
const AppGuide = lazyModule(() => import('../modules/app/pages/AppGuide'));

const AppRoutes = () => {
  const location = useLocation();
  // Only the AgroYilt app's own WebView goes straight to the app entry screen; a phone browser sees the website
  const [inApp, setInApp] = React.useState(isFlutterWebView());

  // AppEntry verifies any stored login with the server before opening a dashboard
  const getMobileRedirect = () => '/app';

  React.useEffect(() => {
    // The WebView bridge can appear just after the page loads
    const onReady = () => setInApp(true);
    window.addEventListener('flutterInAppWebViewPlatformReady', onReady);
    return () => window.removeEventListener('flutterInAppWebViewPlatformReady', onReady);
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
    location.pathname.startsWith('/guide') ||
    location.pathname.startsWith('/r/') ||
    location.pathname.startsWith('/terms') ||
    location.pathname.startsWith('/privacy') ||
    [
      '/user/help-support',
      '/user/cancellation-policy',
      '/terms',
      '/support'
    ].includes(location.pathname);

  return (
    <>
      <React.Suspense fallback={<LogoLoader />}>
      <Routes>
        {/* Module Routes - High Priority */}
        <Route path="/user/*" element={<UserRoutes />} />
        <Route path="/vendor/*" element={<VendorRoutes />} />
        <Route path="/worker/*" element={<WorkerRoutes />} />
        <Route path="/admin/*" element={<AdminRoutes />} />

        {/* Shared referral link: Play Store on an Android phone, web registration elsewhere */}
        <Route path="/r/:code" element={<ReferralInvite />} />

        {/* Mobile App Routes (/app, /app/register, /app/login) */}
        <Route path="/app/*" element={<MobileAppRoutes />} />

        {/*
          Landing experience:
          - Any browser (desktop or phone) → shows the landing page
          - Flutter WebView (the app)      → redirects to /app (native-feel entry screen)
        */}
        <Route
          path="/"
          element={
            inApp
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
        <Route path="/guide" element={<AppGuide />} />
        <Route path="/guide/:role" element={<AppGuide />} />

        {/* Public utility URLs (Great for iOS/App Store) */}
        <Route path="/support" element={<Navigate to="/user/help-support" replace />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/terms/:role" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/privacy/:role" element={<PrivacyPage />} />

        {/* Referral / Universal Registration Entry */}
        <Route
          path="/register"
          element={<Navigate to={`/app/register${location.search}`} replace />}
        />

        {/* Fallback for any unknown user routes to go to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </React.Suspense>

      {!hideGlobalElements && (
        <>
          <LocationPermissionChecker />
        </>
      )}
    </>
  );
};

export default AppRoutes;
