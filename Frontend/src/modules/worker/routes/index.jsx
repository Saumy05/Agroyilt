import React, { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import PageTransition from '../components/common/PageTransition';
import BottomNav from '../components/layout/BottomNav';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import WorkerBookingRequestAlertModal from '../components/bookings/WorkerBookingRequestAlertModal';
import workerService from '../../../services/workerService';
import workerRequestService from '../../../services/workerRequestService';
import { stopAlertRing } from '../../../utils/notificationSound';

// Lazy load wrapper with error handling
const lazyLoad = (importFunc) => {
  return lazy(() => {
    return Promise.resolve(importFunc()).catch((error) => {
      console.error('Failed to load worker page:', error);
      // Return a fallback component wrapped in a Promise
      return Promise.resolve({
        default: () => (
          <div className="flex items-center justify-center min-h-screen bg-white">
            <div className="text-center p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">Failed to load page</h2>
              <p className="text-gray-600 mb-4">Please refresh the page or try again later.</p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 hover:opacity-90"
                style={{ backgroundColor: '#3B82F6' }}
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

// Lazy load worker pages for code splitting
const Login = lazyLoad(() => import('../pages/login'));
const Signup = lazyLoad(() => import('../pages/signup'));
const ForgotMpin = lazyLoad(() => import('../pages/ForgotMpin'));
const Dashboard = lazyLoad(() => import('../pages/Dashboard'));
const AssignedJobs = lazyLoad(() => import('../pages/AssignedJobs'));
const JobDetails = lazyLoad(() => import('../pages/JobDetails'));
const Profile = lazyLoad(() => import('../pages/Profile'));
const EditProfile = lazyLoad(() => import('../pages/Profile/EditProfile'));
const Settings = lazyLoad(() => import('../pages/Settings'));
const MpinSetup = lazyLoad(() => import('../pages/MpinSetup'));
const Notifications = lazyLoad(() => import('../pages/Notifications'));
const JobMap = lazyLoad(() => import('../pages/JobMap'));
const JobTimeline = lazyLoad(() => import('../pages/JobTimeline'));
const Wallet = lazyLoad(() => import('../pages/Wallet'));
const Team = lazyLoad(() => import('../pages/Team'));
const WorkerBookingRequests = lazyLoad(() => import('../pages/AssignedJobs/WorkerBookingRequests'));
const WorkerGroupRequests = lazyLoad(() => import('../pages/AssignedJobs/WorkerGroupRequests'));
const WorkerReferrals = lazyLoad(() => import('../pages/Referrals'));
const HelpSupport = lazyLoad(() => import('../../user/pages/HelpSupport'));

// Lightweight loading fallback - no logo to avoid iOS rejection
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const WorkerRoutes = () => {
  const location = useLocation();
  const [incomingRequestData, setIncomingRequestData] = useState(null);
  const isFetchingRef = useRef(false);

  // Normalize request data from any source (socket or API) into the shape the modal expects
  const normalizeRequestData = (raw) => {
    if (!raw) return null;
    const isTeam = raw.isTeamInvite === true ||
                   raw.requestType === 'TEAM_MEMBER_INVITATION' ||
                   raw.requestType === 'group_member_request';

    return {
      requestId:       raw.requestId || raw._id || raw.id,
      _id:             raw.requestId || raw._id || raw.id,
      workTitle:       raw.workTitle || raw.job?.title || raw.serviceName || raw.title || '',
      workCategory:    raw.workCategory || raw.job?.category || raw.serviceCategory || '',
      workDescription: raw.workDescription || raw.job?.description || raw.description || '',
      farmerName:      raw.farmer?.name || raw.farmerName || 'Farmer',
      farmerId:        raw.farmer?.id || raw.farmerId,
      farmerPhone:     raw.farmer?.phone || raw.farmerPhone || '',
      farmerImage:     raw.farmer?.profileImage || raw.farmerImage || '',
      farmer:          raw.farmer || (raw.farmerName ? { name: raw.farmerName } : null),
      teamLeader:      raw.teamLeader || (raw.leaderName ? { name: raw.leaderName } : null),
      requiredSkills:  raw.requiredSkills || raw.job?.skills || [],
      requiredWorkers: raw.requiredWorkers || raw.job?.requiredWorkers || 1,
      scheduledDate:   raw.scheduledDate || raw.job?.date,
      startTime:       raw.startTime || raw.job?.startTime,
      endTime:         raw.endTime || raw.job?.endTime,
      location:        raw.location || raw.job?.location || {},
      minRate:         raw.minRate || raw.farmerOfferedRate || 0,
      maxRate:         raw.maxRate || raw.farmerOfferedRate || 0,
      offeredRate:     raw.offeredRate || raw.minRate || raw.farmerOfferedRate || 0,
      farmerOfferedRate: raw.farmerOfferedRate || raw.minRate || 0,
      rateUnit:        raw.rateUnit || raw.job?.rateUnit || 'daily',
      isFarmerBroadcast: raw.isFarmerBroadcast !== undefined ? raw.isFarmerBroadcast : !isTeam,
      // Team invite fields
      requestType:     isTeam ? 'TEAM_MEMBER_INVITATION' : (raw.requestType || null),
      isTeamInvite:    isTeam,
      bookingType:     raw.bookingType || raw.job?.bookingType || null,
      numberOfDays:    raw.numberOfDays || raw.job?.numberOfDays || null,
      startDate:       raw.startDate || raw.job?.startDate || null,
    };
  };

  // Fetch the latest pending request from the API and show modal
  const fetchAndShowPending = async () => {
    if (isFetchingRef.current) return;
    try {
      isFetchingRef.current = true;
      // Fetch member invites AND pending farmer requests in parallel
      const [memberInvitesRes, farmerRequestsRes] = await Promise.all([
        workerRequestService.getMemberInvites().catch(() => ({ success: false, data: [] })),
        workerService.getPendingFarmerRequests().catch(() => ({ success: false, data: [] }))
      ]);

      // Priority 1: Team Member Invitations (Accept / Decline Card)
      const invites = memberInvitesRes?.data || [];
      if (Array.isArray(invites) && invites.length > 0) {
        const normalized = normalizeRequestData(invites[0]);
        if (normalized?.requestId) {
          setIncomingRequestData(normalized);
          return;
        }
      }

      // Priority 2: Regular Farmer Requests
      const requests = farmerRequestsRes?.data || [];
      if (Array.isArray(requests) && requests.length > 0) {
        const normalized = normalizeRequestData(requests[0]);
        if (normalized?.requestId && normalized?.workTitle) {
          setIncomingRequestData(normalized);
        }
      }
    } catch (err) {
      console.warn('[WorkerRoutes] Failed to fetch pending requests:', err);
    } finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    const handleIncomingBooking = (e) => {
      console.log('[WorkerRoutes] Incoming booking request received');
      const raw = e.detail?.data || e.detail;
      const normalized = normalizeRequestData(raw);

      // If socket payload has enough data, use it directly
      if (normalized?.requestId && normalized?.workTitle) {
        setIncomingRequestData(normalized);
      } else {
        // Socket payload was incomplete — fall back to API
        console.warn('[WorkerRoutes] Socket payload incomplete, fetching from API...');
        fetchAndShowPending();
      }
    };

    // Also listen for workerJobsUpdated (fires after every socket event in SocketContext)
    // This is the fallback: if the modal isn't already open, check if there are pending requests
    const handleJobsUpdated = () => {
      if (!incomingRequestData) {
        fetchAndShowPending();
      }
    };

    const handleCancellation = (e) => {
      const detail = e.detail || {};
      const cancelledId = detail.requestId || detail.bookingId || detail._id;
      console.log('[WorkerRoutes] Booking cancellation event received');

      setIncomingRequestData(current => {
        if (!current) return null;
        const currentId = current.requestId || current._id || current.id;
        if (!cancelledId || String(currentId) === String(cancelledId)) {
          stopAlertRing();
          return null;
        }
        return current;
      });
    };

    window.addEventListener('workerIncomingBooking', handleIncomingBooking);
    window.addEventListener('workerJobsUpdated', handleJobsUpdated);
    window.addEventListener('workerBookingCancelled', handleCancellation);
    window.addEventListener('workerRequestCancelled', handleCancellation);
    return () => {
      window.removeEventListener('workerIncomingBooking', handleIncomingBooking);
      window.removeEventListener('workerJobsUpdated', handleJobsUpdated);
      window.removeEventListener('workerBookingCancelled', handleCancellation);
      window.removeEventListener('workerRequestCancelled', handleCancellation);
    };
  }, [incomingRequestData]);

  // Check if current route should hide bottom nav
  const shouldHideBottomNav =
    location.pathname === '/worker/login' ||
    location.pathname === '/worker/signup' ||
    location.pathname === '/worker/forgot-mpin' ||
    location.pathname.endsWith('/map');

  const shouldShowBottomNav = !shouldHideBottomNav;

  return (
    <ErrorBoundary>
      {/* Main content area - leaves space for bottom nav when needed */}
      <div className={shouldShowBottomNav ? "pb-24" : ""}>
        <Suspense fallback={<LoadingFallback />}>
          <PageTransition>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<PublicRoute userType="worker"><Login /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute userType="worker"><Signup /></PublicRoute>} />
              <Route path="/forgot-mpin" element={<PublicRoute userType="worker"><ForgotMpin /></PublicRoute>} />

              {/* Protected routes (auth required) */}
              <Route path="/" element={<ProtectedRoute userType="worker"><Navigate to="dashboard" replace /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute userType="worker"><Dashboard /></ProtectedRoute>} />
              <Route path="/jobs" element={<ProtectedRoute userType="worker"><AssignedJobs /></ProtectedRoute>} />
              <Route path="/job/:id" element={<ProtectedRoute userType="worker"><JobDetails /></ProtectedRoute>} />
              <Route path="/job/:id/map" element={<ProtectedRoute userType="worker"><JobMap /></ProtectedRoute>} />
              <Route path="/job/:id/timeline" element={<ProtectedRoute userType="worker"><JobTimeline /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute userType="worker"><Profile /></ProtectedRoute>} />
              <Route path="/profile/edit" element={<ProtectedRoute userType="worker"><EditProfile /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute userType="worker"><Settings /></ProtectedRoute>} />
              <Route path="/settings/mpin-setup" element={<ProtectedRoute userType="worker"><MpinSetup /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute userType="worker"><Notifications /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute userType="worker"><Wallet /></ProtectedRoute>} />
              <Route path="/team" element={<ProtectedRoute userType="worker"><Team /></ProtectedRoute>} />
              <Route path="/referrals" element={<ProtectedRoute userType="worker"><WorkerReferrals /></ProtectedRoute>} />
              <Route path="/booking-requests" element={<ProtectedRoute userType="worker"><WorkerBookingRequests /></ProtectedRoute>} />
              <Route path="/group-requests" element={<ProtectedRoute userType="worker"><WorkerGroupRequests /></ProtectedRoute>} />
              <Route path="/help-support" element={<ProtectedRoute userType="worker"><HelpSupport /></ProtectedRoute>} />
            </Routes>
          </PageTransition>
        </Suspense>
      </div>

      {/* Global Worker Booking Request Alert Modal */}
      <WorkerBookingRequestAlertModal
        isOpen={!!incomingRequestData}
        requestData={incomingRequestData}
        onClose={() => setIncomingRequestData(null)}
        onRequestResponded={() => {
          setIncomingRequestData(null);
          window.dispatchEvent(new Event('workerJobsUpdated'));
        }}
      />

      {/* BottomNav is OUTSIDE Suspense so it persists during page loads */}
      {shouldShowBottomNav && <BottomNav />}
    </ErrorBoundary>
  );
};

export default WorkerRoutes;
