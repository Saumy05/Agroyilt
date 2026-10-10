import React, { lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import PageTransition from '../components/common/PageTransition';
import BottomNav from '../components/layout/BottomNav';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import useAppNotifications from '../../../hooks/useAppNotifications.jsx';

// Lazy load wrapper with error handling
const lazyLoad = (importFunc) => {
  return lazy(() => {
    return Promise.resolve(importFunc()).catch((error) => {
      return Promise.resolve({
        default: () => (
          <div className="flex items-center justify-center min-h-screen bg-white">
            <div className="text-center p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">Failed to load page</h2>
              <p className="text-gray-600 mb-4">Please refresh the page or try again later.</p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 hover:opacity-90"
                style={{ backgroundColor: '#00a6a6' }}
              >
                Refresh Page
              </button>
            </div>
          </div>
        ),
      });
    });
  });
};

// Lazy load all user pages for code splitting with error handling
const Home = lazyLoad(() => import('../pages/Home'));
const Rewards = lazyLoad(() => import('../pages/Rewards'));
const Account = lazyLoad(() => import('../pages/Account'));
const Native = lazyLoad(() => import('../pages/Native'));
const Cart = lazyLoad(() => import('../pages/Cart'));
const Checkout = lazyLoad(() => import('../pages/Checkout'));
const MyBookings = lazyLoad(() => import('../pages/MyBookings'));
const BookingDetails = lazyLoad(() => import('../pages/BookingDetails'));
const BookingTrack = lazyLoad(() => import('../pages/BookingTrack'));
const BookingConfirmation = lazyLoad(() => import('../pages/BookingConfirmation'));
const Settings = lazyLoad(() => import('../pages/Settings'));
const ManagePaymentMethods = lazyLoad(() => import('../pages/ManagePaymentMethods'));
const ManageAddresses = lazyLoad(() => import('../pages/ManageAddresses'));
const Wallet = lazyLoad(() => import('../pages/Wallet'));
const WalletHistory = lazyLoad(() => import('../pages/Wallet/WalletHistory'));
const MyPlan = lazyLoad(() => import('../pages/MyPlan'));
const PlanDetails = lazyLoad(() => import('../pages/MyPlan/PlanDetails'));
const MyRating = lazyLoad(() => import('../pages/MyRating'));
const AboutGroo = lazyLoad(() => import('../pages/AboutHomster'));
const HowToUse = lazyLoad(() => import('../pages/HowToUse'));
const UpdateProfile = lazyLoad(() => import('../pages/UpdateProfile'));
const Login = lazyLoad(() => import('../pages/login'));
const Signup = lazyLoad(() => import('../pages/signup'));
const MpinSetup = lazyLoad(() => import('../pages/MpinSetup'));
const ForgotMpin = lazyLoad(() => import('../pages/ForgotMpin'));
const Privacy = lazyLoad(() => import('../pages/Privacy'));

const Notifications = lazyLoad(() => import('../pages/Notifications'));
const FAQ = lazyLoad(() => import('../pages/FAQ'));
const HelpSupport = lazyLoad(() => import('../pages/HelpSupport'));
const CancellationPolicy = lazyLoad(() => import('../pages/CancellationPolicy'));
const WeatherReport = lazyLoad(() => import('../pages/WeatherReport'));
const Marketplace = lazyLoad(() => import('../pages/Marketplace'));
const MachineryExplorer = lazyLoad(() => import('../pages/Machinery/MachineryExplorer'));
const RentalCatalog = lazyLoad(() => import('../pages/Machinery/RentalCatalog'));
const AllMachineryCategories = lazyLoad(() => import('../pages/Machinery/AllMachineryCategories'));
const AllImplementsCategories = lazyLoad(() => import('../pages/Machinery/AllImplementsCategories'));
const WorkerExplorer = lazyLoad(() => import('../pages/Worker/WorkerExplorer'));
const SingleWorkerList = lazyLoad(() => import('../pages/Worker/SingleWorkerList'));
const TeamLeaderList = lazyLoad(() => import('../pages/Worker/TeamLeaderList'));
const WorkerRequestForm = lazyLoad(() => import('../pages/Worker/WorkerRequestForm'));
const GroupRequestForm = lazyLoad(() => import('../pages/Worker/GroupRequestForm'));
const MyWorkerRequests = lazyLoad(() => import('../pages/Worker/MyWorkerRequests'));
const FarmerRequestDetail = lazyLoad(() => import('../pages/Worker/FarmerRequestDetail'));
const WorkerSelectionPayment = lazyLoad(() => import('../pages/Worker/WorkerSelectionPayment'));

const MachineryCheckout = lazyLoad(() => import('../pages/Machinery/MachineryCheckout'));
const AvailableVendors = lazyLoad(() => import('../pages/Machinery/AvailableVendors'));
const EquipmentDetail = lazyLoad(() => import('../pages/Machinery/EquipmentDetail'));
const SoilTesting = lazyLoad(() => import('../pages/SoilTesting'));
const AgriMarket = lazyLoad(() => import('../pages/AgriMarket'));
const AgriProductDetail = lazyLoad(() => import('../pages/AgriMarket/ProductDetail'));
const MyAgriOrders = lazyLoad(() => import('../pages/AgriMarket/MyOrders'));
const AgriOrderPayment = lazyLoad(() => import('../pages/AgriMarket/OrderPayment'));
const AgriCart = lazyLoad(() => import('../pages/AgriMarket/AgriCart'));
const FieldAreaCalculator = lazyLoad(() => import('../pages/FieldAreaCalculator'));
const MandiBhav = lazyLoad(() => import('../pages/MandiBhav'));

// Lightweight loading fallback - no logo to avoid iOS rejection
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// Import Live Booking Card
import LiveBookingCard from '../components/booking/LiveBookingCard';

const UserRoutes = () => {
  const location = useLocation();

  // Pages where BottomNav should be shown
  const bottomNavPages = ['/user', '/user/', '/user/my-bookings', '/user/cart', '/user/account', '/user/weather'];
  const shouldShowBottomNav = bottomNavPages.includes(location.pathname);

  // Check if we hide the live booking card (e.g. if we are on the specific booking details or track page)
  const isBookingDetailsPage = location.pathname.match(/^\/user\/booking\/[a-zA-Z0-9]+(\/track)?$/);
  const isBookingConfirmationPage = location.pathname.includes('/booking-confirmation');

  // Check if we are on public pages (login/signup) where we shouldn't fetch bookings
  const isPublicPage = location.pathname.includes('/login') || 
                       location.pathname.includes('/signup') ||
                       location.pathname.includes('/forgot-mpin') ||
                       location.pathname.includes('/privacy') ||
                       location.pathname.includes('/faq') ||
                       location.pathname.includes('/help-support') ||
                       location.pathname.includes('/cancellation-policy');

  return (
    <ErrorBoundary>
      {/* Main content area - leaves space for bottom nav when needed */}
      <div className={shouldShowBottomNav ? "pb-24" : ""}>
        <Suspense fallback={<LoadingFallback />}>
          <PageTransition>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<PublicRoute userType="user"><Login /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute userType="user"><Signup /></PublicRoute>} />
              <Route path="/forgot-mpin" element={<PublicRoute userType="user"><ForgotMpin /></PublicRoute>} />

              {/* Protected routes (auth required) */}
              <Route path="/" element={<ProtectedRoute userType="user"><Home /></ProtectedRoute>} />
              <Route path="/home" element={<ProtectedRoute userType="user"><Home /></ProtectedRoute>} />
              <Route path="/native" element={<ProtectedRoute userType="user"><Native /></ProtectedRoute>} />

              <Route path="/rewards" element={<ProtectedRoute userType="user"><Rewards /></ProtectedRoute>} />
              <Route path="/account" element={<ProtectedRoute userType="user"><Account /></ProtectedRoute>} />
              <Route path="/cart" element={<ProtectedRoute userType="user"><Cart /></ProtectedRoute>} />
              <Route path="/checkout" element={<ProtectedRoute userType="user"><Checkout /></ProtectedRoute>} />
              <Route path="/my-bookings" element={<ProtectedRoute userType="user"><MyBookings /></ProtectedRoute>} />
              <Route path="/booking/:id" element={<ProtectedRoute userType="user"><BookingDetails /></ProtectedRoute>} />
              <Route path="/booking/:id/track" element={<ProtectedRoute userType="user"><BookingTrack /></ProtectedRoute>} />
              <Route path="/booking-confirmation/:id" element={<ProtectedRoute userType="user"><BookingConfirmation /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute userType="user"><Settings /></ProtectedRoute>} />
              <Route path="/settings/mpin-setup" element={<ProtectedRoute userType="user"><MpinSetup /></ProtectedRoute>} />
              <Route path="/manage-payment-methods" element={<ProtectedRoute userType="user"><ManagePaymentMethods /></ProtectedRoute>} />
              <Route path="/manage-addresses" element={<ProtectedRoute userType="user"><ManageAddresses /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute userType="user"><Wallet /></ProtectedRoute>} />
              <Route path="/wallet/history" element={<ProtectedRoute userType="user"><WalletHistory /></ProtectedRoute>} />
              <Route path="/my-plan" element={<Navigate to="/user/account" replace />} />
              <Route path="/my-plan/:id" element={<Navigate to="/user/account" replace />} />
              <Route path="/my-rating" element={<ProtectedRoute userType="user"><MyRating /></ProtectedRoute>} />
              <Route path="/about-groo" element={<ProtectedRoute userType="user"><AboutGroo /></ProtectedRoute>} />
              <Route path="/how-to-use" element={<ProtectedRoute userType="user"><HowToUse /></ProtectedRoute>} />
              <Route path="/update-profile" element={<ProtectedRoute userType="user"><UpdateProfile /></ProtectedRoute>} />
              <Route path="/privacy" element={<Privacy />} />

              <Route path="/notifications" element={<ProtectedRoute userType="user"><Notifications /></ProtectedRoute>} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/help-support" element={<HelpSupport />} />
              <Route path="/cancellation-policy" element={<CancellationPolicy />} />
              <Route path="/weather" element={<ProtectedRoute userType="user"><WeatherReport /></ProtectedRoute>} />
              <Route path="/marketplace" element={<ProtectedRoute userType="user"><Marketplace /></ProtectedRoute>} />
              <Route path="/machinery-explorer" element={<ProtectedRoute userType="user"><MachineryExplorer /></ProtectedRoute>} />
              <Route path="/field-area-calculator" element={<ProtectedRoute userType="user"><FieldAreaCalculator /></ProtectedRoute>} />
              <Route path="/mandi-bhav" element={<ProtectedRoute userType="user"><MandiBhav /></ProtectedRoute>} />
              <Route path="/kisan-suvidha" element={<ProtectedRoute userType="user"><MandiBhav /></ProtectedRoute>} />
              <Route path="/rentals" element={<ProtectedRoute userType="user"><RentalCatalog /></ProtectedRoute>} />
              <Route path="/machinery-categories" element={<ProtectedRoute userType="user"><AllMachineryCategories /></ProtectedRoute>} />
              <Route path="/machinery-implements" element={<ProtectedRoute userType="user"><AllImplementsCategories /></ProtectedRoute>} />
              <Route path="/worker-explorer" element={<ProtectedRoute userType="user"><WorkerExplorer /></ProtectedRoute>} />
              {/* Legacy browsable lists — kept for profile viewing but not primary flow */}
              <Route path="/workers" element={<ProtectedRoute userType="user"><SingleWorkerList /></ProtectedRoute>} />
              <Route path="/team-leaders" element={<ProtectedRoute userType="user"><TeamLeaderList /></ProtectedRoute>} />
              {/* Farmer-first: new standalone request form */}
              <Route path="/worker-request/new" element={<ProtectedRoute userType="user"><WorkerRequestForm /></ProtectedRoute>} />
              {/* Farmer-first: my requests list */}
              <Route path="/my-worker-requests" element={<ProtectedRoute userType="user"><MyWorkerRequests /></ProtectedRoute>} />
              {/* Farmer-first: request detail with confirm/reject partial */}
              <Route path="/farmer-worker-request/:id" element={<ProtectedRoute userType="user"><FarmerRequestDetail /></ProtectedRoute>} />
              <Route path="/farmer-worker-request/:id/track" element={<ProtectedRoute userType="user"><BookingTrack /></ProtectedRoute>} />
              <Route path="/worker-booking-payment/:id" element={<ProtectedRoute userType="user"><WorkerSelectionPayment /></ProtectedRoute>} />
              {/* Legacy: old request form with pre-selected worker (kept for backward compat) */}
              <Route path="/worker-request/:id" element={<ProtectedRoute userType="user"><WorkerRequestForm /></ProtectedRoute>} />
              <Route path="/group-request/:id" element={<ProtectedRoute userType="user"><GroupRequestForm /></ProtectedRoute>} />

              <Route path="/machinery/vendors" element={<ProtectedRoute userType="user"><AvailableVendors /></ProtectedRoute>} />
              <Route path="/machinery/available-vendors" element={<ProtectedRoute userType="user"><AvailableVendors /></ProtectedRoute>} />
              <Route path="/machinery/checkout" element={<ProtectedRoute userType="user"><MachineryCheckout /></ProtectedRoute>} />
              <Route path="/machinery/:id" element={<ProtectedRoute userType="user"><EquipmentDetail /></ProtectedRoute>} />
              <Route path="/soil-testing" element={<ProtectedRoute userType="user"><SoilTesting /></ProtectedRoute>} />
              <Route path="/agri-marketplace" element={<ProtectedRoute userType="user"><AgriMarket /></ProtectedRoute>} />
              <Route path="/agri-marketplace/:id" element={<ProtectedRoute userType="user"><AgriProductDetail /></ProtectedRoute>} />
              <Route path="/my-agri-orders" element={<ProtectedRoute userType="user"><MyAgriOrders /></ProtectedRoute>} />
              <Route path="/order-payment/:id" element={<ProtectedRoute userType="user"><AgriOrderPayment /></ProtectedRoute>} />
              <Route path="/agri-cart" element={<ProtectedRoute userType="user"><AgriCart /></ProtectedRoute>} />
            </Routes>
          </PageTransition>
        </Suspense>
      </div>

      {/* These components are OUTSIDE Suspense so they persist during page loads */}
      {!isBookingDetailsPage && !isBookingConfirmationPage && !isPublicPage && <LiveBookingCard hasBottomNav={shouldShowBottomNav} />}
      {shouldShowBottomNav && <BottomNav />}
    </ErrorBoundary>
  );
};

export default UserRoutes;
