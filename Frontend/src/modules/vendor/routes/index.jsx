import React, { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import PageTransition from '../components/common/PageTransition';
import BottomNav from '../components/layout/BottomNav';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import CashLimitModal from '../components/common/CashLimitModal';
import { GlobalBookingAlertModal } from '../components/bookings';
import { SkeletonProfileHeader, SkeletonDashboardStats } from '../../../components/common/SkeletonLoaders';
import { VendorDashboardProvider } from '../../../context/VendorDashboardContext';


// Dynamic imports for code splitting (reduces initial bundle size and fixes massive load delay)
const Login = lazy(() => import('../pages/login'));
const Signup = lazy(() => import('../pages/signup'));
const ForgotMpin = lazy(() => import('../pages/ForgotMpin'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const BookingAlert = lazy(() => import('../pages/BookingAlert'));
const BookingAlerts = lazy(() => import('../pages/BookingAlerts'));
const BookingDetails = lazy(() => import('../pages/BookingDetails'));
const BookingTimeline = lazy(() => import('../pages/BookingTimeline'));
const ActiveJobs = lazy(() => import('../pages/ActiveJobs'));
// WorkersList, AddEditWorker, AssignWorker removed — Workers are independent users
const Earnings = lazy(() => import('../pages/Earnings'));
const Wallet = lazy(() => import('../pages/Wallet'));
const WithdrawalRequest = lazy(() => import('../pages/WithdrawalRequest'));
const Profile = lazy(() => import('../pages/Profile'));
const ProfileDetails = lazy(() => import('../pages/Profile/ProfileDetails'));
const EditProfile = lazy(() => import('../pages/Profile/EditProfile'));
const BookingMap = lazy(() => import('../pages/BookingMap'));
const Settings = lazy(() => import('../pages/Settings'));
const MpinSetup = lazy(() => import('../pages/MpinSetup'));
const AddressManagement = lazy(() => import('../pages/AddressManagement'));
const Notifications = lazy(() => import('../pages/Notifications'));
const SettlementRequest = lazy(() => import('../pages/Wallet/SettlementRequest'));
const SettlementHistory = lazy(() => import('../pages/Wallet/SettlementHistory'));
const MyRatings = lazy(() => import('../pages/MyRatings'));
const AboutGroo = lazy(() => import('../pages/AboutHomster'));
const BillingPage = lazy(() => import('../pages/BillingPage'));
const Maintenance = lazy(() => import('../pages/Maintenance'));
const VendorReferrals = lazy(() => import('../pages/Referrals'));
const Compliance = lazy(() => import('../pages/Compliance'));
const Analytics = lazy(() => import('../pages/Analytics'));
const MyStore = lazy(() => import('../pages/MyStore'));
const StoreRegistration = lazy(() => import('../pages/MyStore/StoreRegistration'));
const StoreOrders = lazy(() => import('../pages/MyStore/Orders'));
const SoilTesting = lazy(() => import('../pages/SoilTesting'));
const BusinessDetails = lazy(() => import('../pages/BusinessDetails'));
const EquipmentInventory = lazy(() => import('../pages/Equipment/EquipmentInventory'));
const AddEquipment = lazy(() => import('../pages/Equipment/AddEquipment'));
const BankDetails = lazy(() => import('../pages/BankDetails'));
const EditBankDetails = lazy(() => import('../pages/BankDetails/EditBankDetails'));
const HelpSupport = lazy(() => import('../../user/pages/HelpSupport'));

// Dashboard skeleton for initial page load instead of a spinner
const LoadingFallback = () => (
  <div className="min-h-screen bg-gray-50 pb-20">
    <div className="h-16 bg-white flex items-center px-4 justify-between shadow-sm">
      <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse"></div>
      <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
    </div>
    <div className="pt-2">
      <SkeletonProfileHeader />
      <SkeletonDashboardStats />
    </div>
  </div>
);

const VendorRoutes = () => {
  const location = useLocation();

  // PROACTIVE CLEANUP: Kill all orphaned ScrollTriggers from other modules
  // This prevents background animations (from Landing/User home) from crashing 
  // the Vendor panel when body styles or viewport sizes change.
  useEffect(() => {
    import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
      import('gsap').then(({ gsap }) => {
        // Configure safely before killing
        ScrollTrigger.config({
          ignoreMobileResize: true,
          autoRefreshEvents: "visibilitychange,DOMContentLoaded,load"
        });
        
        // Kill all matchMedia contexts globally
        let ctx = gsap.matchMedia();
        ctx.revert();
        if (ScrollTrigger.clearMatchMedia) ScrollTrigger.clearMatchMedia();

        // Kill all existing triggers
        ScrollTrigger.getAll().forEach(t => t.kill());
      });
    }).catch(() => {});
  }, []);

  // Check if current route should hide bottom nav (auth routes or map)
  // Check if current route should hide bottom nav (auth routes or map or booking alert)
  const shouldHideBottomNav = location.pathname === '/vendor/login' ||
    location.pathname === '/vendor/signup' ||
    location.pathname === '/vendor/forgot-mpin' ||
    location.pathname.endsWith('/map') ||
    location.pathname.includes('/booking-alert/') ||
    location.pathname.includes('/billing') ||
    location.pathname.includes('/bank-details/edit');

  const shouldShowBottomNav = !shouldHideBottomNav;

  return (
    <ErrorBoundary>
      <VendorDashboardProvider>
        {/* Main content area - leaves space for bottom nav when needed */}
        <div className={shouldShowBottomNav ? "pb-24" : ""}>
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<PublicRoute userType="vendor"><Login /></PublicRoute>} />
                <Route path="/signup" element={<PublicRoute userType="vendor"><Signup /></PublicRoute>} />
                <Route path="/forgot-mpin" element={<PublicRoute userType="vendor"><ForgotMpin /></PublicRoute>} />

                {/* Protected routes (auth required) */}
                <Route path="/" element={<ProtectedRoute userType="vendor"><Navigate to="dashboard" replace /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute userType="vendor"><Dashboard /></ProtectedRoute>} />
                <Route path="/booking-alerts" element={<ProtectedRoute userType="vendor"><BookingAlerts /></ProtectedRoute>} />
                <Route path="/booking-alert/:id" element={<ProtectedRoute userType="vendor"><BookingAlert /></ProtectedRoute>} />
                <Route path="/booking/:id" element={<ProtectedRoute userType="vendor"><BookingDetails /></ProtectedRoute>} />
                <Route path="/booking/:id/map" element={<ProtectedRoute userType="vendor"><BookingMap /></ProtectedRoute>} />
                <Route path="/booking/:id/billing" element={<ProtectedRoute userType="vendor"><BillingPage /></ProtectedRoute>} />
                <Route path="/booking/:id/timeline" element={<ProtectedRoute userType="vendor"><BookingTimeline /></ProtectedRoute>} />
                <Route path="/jobs" element={<ProtectedRoute userType="vendor"><ActiveJobs /></ProtectedRoute>} />
                {/* Worker routes removed — Workers are independent users, not Vendor-managed */}
                <Route path="/earnings" element={<ProtectedRoute userType="vendor"><Earnings /></ProtectedRoute>} />
                <Route path="/wallet" element={<ProtectedRoute userType="vendor"><Wallet /></ProtectedRoute>} />
                <Route path="/wallet/withdraw" element={<ProtectedRoute userType="vendor"><WithdrawalRequest /></ProtectedRoute>} />
                <Route path="/wallet/settle" element={<ProtectedRoute userType="vendor"><SettlementRequest /></ProtectedRoute>} />
                <Route path="/wallet/settlements" element={<ProtectedRoute userType="vendor"><SettlementHistory /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute userType="vendor"><Profile /></ProtectedRoute>} />
                <Route path="/profile/details" element={<ProtectedRoute userType="vendor"><ProfileDetails /></ProtectedRoute>} />
                <Route path="/profile/edit" element={<ProtectedRoute userType="vendor"><EditProfile /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute userType="vendor"><Settings /></ProtectedRoute>} />
                <Route path="/settings/mpin-setup" element={<ProtectedRoute userType="vendor"><MpinSetup /></ProtectedRoute>} />
                <Route path="/address-management" element={<ProtectedRoute userType="vendor"><AddressManagement /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute userType="vendor"><Notifications /></ProtectedRoute>} />
                <Route path="/my-ratings" element={<ProtectedRoute userType="vendor"><MyRatings /></ProtectedRoute>} />
                <Route path="/about-groo" element={<ProtectedRoute userType="vendor"><AboutGroo /></ProtectedRoute>} />
                <Route path="/maintenance" element={<ProtectedRoute userType="vendor"><Maintenance /></ProtectedRoute>} />
                <Route path="/referrals" element={<ProtectedRoute userType="vendor"><VendorReferrals /></ProtectedRoute>} />
                <Route path="/compliance" element={<ProtectedRoute userType="vendor"><Compliance /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute userType="vendor"><Analytics /></ProtectedRoute>} />
                <Route path="/store" element={<ProtectedRoute userType="vendor"><MyStore /></ProtectedRoute>} />
                <Route path="/store/registration" element={<ProtectedRoute userType="vendor"><StoreRegistration /></ProtectedRoute>} />
                <Route path="/store/orders" element={<ProtectedRoute userType="vendor"><StoreOrders /></ProtectedRoute>} />
                <Route path="/soil-tests" element={<ProtectedRoute userType="vendor"><SoilTesting /></ProtectedRoute>} />
                <Route path="/business-details" element={<ProtectedRoute userType="vendor"><BusinessDetails /></ProtectedRoute>} />
                <Route path="/equipment" element={<ProtectedRoute userType="vendor"><EquipmentInventory /></ProtectedRoute>} />
                <Route path="/equipment/add" element={<ProtectedRoute userType="vendor"><AddEquipment /></ProtectedRoute>} />
                <Route path="/equipment/edit/:id" element={<ProtectedRoute userType="vendor"><AddEquipment /></ProtectedRoute>} />
                <Route path="/bank-details" element={<ProtectedRoute userType="vendor"><BankDetails /></ProtectedRoute>} />
                <Route path="/bank-details/edit" element={<ProtectedRoute userType="vendor"><EditBankDetails /></ProtectedRoute>} />
                <Route path="/profile/bank-details" element={<ProtectedRoute userType="vendor"><BankDetails /></ProtectedRoute>} />
                <Route path="/profile/bank-details/edit" element={<ProtectedRoute userType="vendor"><EditBankDetails /></ProtectedRoute>} />
                <Route path="/help-support" element={<ProtectedRoute userType="vendor"><HelpSupport /></ProtectedRoute>} />
              </Routes>
            </PageTransition>
          </Suspense>
        </div>

        {/* BottomNav is OUTSIDE Suspense so it persists during page loads */}
        {shouldShowBottomNav && <BottomNav isGlobal={true} />}

        {/* Global Alert for Cash Limit */}
        {!shouldHideBottomNav && <CashLimitModal />}
        
        {/* Real-time Incoming Booking Popup (Global across all vendor tabs) */}
        <GlobalBookingAlertModal />

      </VendorDashboardProvider>
    </ErrorBoundary>
  );
};

export default VendorRoutes;
