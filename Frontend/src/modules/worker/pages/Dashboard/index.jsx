import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBriefcase, FiCheckCircle, FiClock, FiTrendingUp, FiChevronRight, FiUser, FiBell, FiMapPin, FiArrowRight, FiStar, FiUsers, FiLayers, FiArrowUpRight } from 'react-icons/fi';
import { FaWallet } from 'react-icons/fa';
import { workerTheme as themeColors, vendorTheme } from '../../../../theme';
import Header from '../../components/layout/Header';
import workerService from '../../../../services/workerService';
import workerRequestService from '../../../../services/workerRequestService';
import { registerFCMToken } from '../../../../services/pushNotificationService';
import { SkeletonProfileHeader, SkeletonDashboardStats, SkeletonList } from '../../../../components/common/SkeletonLoaders';
import OptimizedImage from '../../../../components/common/OptimizedImage';
import { useSocket } from '../../../../context/SocketContext';
import WorkerJobAlertModal from '../../components/bookings/WorkerJobAlertModal';
// WorkerBookingRequestAlertModal is handled globally in WorkerRoutes
import LogoLoader from '../../../../components/common/LogoLoader';
import authStorage from '../../../../utils/authStorage';
import { toastManager } from '../../../../utils/toastManager';


const Dashboard = () => {
  const navigate = useNavigate();

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Helper function to get status label
  const getStatusLabel = (status) => {
    const statusMap = {
      'PENDING': 'Pending',
      'ACCEPTED': 'Accepted',
      'REJECTED': 'Rejected',
      'COMPLETED': 'Completed',
      'ASSIGNED': 'Assigned',
      'VISITED': 'Visited',
      'WORK_DONE': 'Work Done',
    };
    return statusMap[status] || status;
  };

  const [stats, setStats] = useState({
    pendingJobs: 0,
    acceptedJobs: 0,
    completedJobs: 0,
    totalEarnings: 0,
    thisMonthEarnings: 0,
    rating: 0,
  });
  const [workerProfile, setWorkerProfile] = useState({
    name: 'Worker Name',
    phone: '+91 9876543210',
    photo: null,
    categories: [],
    skills: [],
    address: null,
    workerType: 'WORKER',
    teamId: null,
    status: 'OFFLINE',
  });
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const statusSeqRef = useRef(0);
  const [recentJobs, setRecentJobs] = useState([]);

  // Set background gradient
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient;

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socket = useSocket();

  const [alertJobId, setAlertJobId] = useState(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Fetch Dashboard Data Function
  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch Profile, Stats, Pending Requests, and Team Member Invites in parallel
      const [profileRes, statsRes, pendingRequestsRes, memberInvitesRes] = await Promise.all([
        workerService.getProfile(),
        workerService.getDashboardStats(),
        workerService.getPendingFarmerRequests().catch(() => ({ success: false, data: [] })),
        workerRequestService.getMemberInvites().catch(() => ({ success: false, data: [] }))
      ]);

      const pendingCount = (pendingRequestsRes?.data?.length || 0) + (memberInvitesRes?.data?.length || 0);
      setPendingRequestsCount(pendingCount);

      if (profileRes.success) {
        const profile = profileRes.worker;
        const rawStatus = String(profile?.status || '').toUpperCase();
        const normalizedStatus = (rawStatus === 'ONLINE' || rawStatus === 'AVAILABLE' || rawStatus === 'ACTIVE') ? 'ONLINE' : 'OFFLINE';
        setWorkerProfile({
          name: profile.name || 'Worker Name',
          phone: profile.phone || '',
          photo: profile.profilePhoto || null,
          categories: profile.serviceCategory ? [profile.serviceCategory] : (profile.serviceCategories || []),
          skills: profile.skills || [],
          address: profile.address,
          workerType: profile.workerType || 'WORKER',
          teamId: profile.teamId || null,
          status: normalizedStatus,
        });
        authStorage.updateUserData('worker', { status: normalizedStatus });
      }

      if (statsRes.success) {
        const { totalEarnings, thisMonthEarnings, activeJobs, completedJobs, rating, recentJobs: apiRecentJobs } = statsRes.data;

        setStats(prev => ({
          ...prev,
          totalEarnings: totalEarnings || 0,
          thisMonthEarnings: thisMonthEarnings || 0,
          pendingJobs: pendingCount > 0 ? pendingCount : (activeJobs || 0),
          acceptedJobs: activeJobs || 0,
          completedJobs: completedJobs || 0,
          rating: rating || 0
        }));

        // Use recent jobs from stats API
        if (apiRecentJobs && apiRecentJobs.length > 0) {
          setRecentJobs(apiRecentJobs.map(job => ({
            id: job._id,
            serviceType: job.serviceId?.title || job.serviceName || 'Service',
            customerName: job.userId?.name || 'Customer',
            location: job.address?.city || 'Location N/A',
            time: job.scheduledTime || 'N/A',
            status: job.status,
            price: job.finalAmount,
          })));
        }
      }

      // Priority 1: If there's any pending team member invitation, pop it up
      if (memberInvitesRes?.success && memberInvitesRes.data?.length > 0) {
        const inviteDoc = memberInvitesRes.data[0];
        if (inviteDoc && inviteDoc.requestId) {
          window.dispatchEvent(new CustomEvent('workerIncomingBooking', {
            detail: {
              data: {
                ...inviteDoc,
                requestType: 'TEAM_MEMBER_INVITATION',
                isTeamInvite: true
              },
              relatedId: inviteDoc.requestId
            }
          }));
        }
      } else if (pendingRequestsRes?.success && pendingRequestsRes.data?.length > 0) {
        // Priority 2: Regular farmer broadcast request
        const reqDoc = pendingRequestsRes.data[0];
        if (reqDoc && reqDoc._id && (reqDoc.minRate || reqDoc.maxRate || reqDoc.farmerOfferedRate)) {
          window.dispatchEvent(new CustomEvent('workerIncomingBooking', {
            detail: {
              data: {
                requestId:       reqDoc._id,
                farmerId:        reqDoc.farmerId,
                workTitle:       reqDoc.workTitle,
                workCategory:    reqDoc.workCategory,
                workDescription: reqDoc.workDescription,
                requiredSkills:  reqDoc.requiredSkills,
                requiredWorkers: reqDoc.requiredWorkers,
                scheduledDate:   reqDoc.scheduledDate,
                startTime:       reqDoc.startTime,
                endTime:         reqDoc.endTime,
                location:        reqDoc.location,
                minRate:         reqDoc.minRate,
                maxRate:         reqDoc.maxRate,
                rateUnit:        reqDoc.rateUnit,
                isFarmerBroadcast: true
              },
              relatedId: reqDoc._id
            }
          }));
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load dashboard data');
      setLoading(false);
    }
  };

  const handleToggleStatus = async (e) => {
    e?.stopPropagation?.(); // Prevent clicking the profile card
    if (isTogglingStatus) return;

    const isCurrentlyOnline = workerProfile.status === 'ONLINE';
    const newStatus = isCurrentlyOnline ? 'OFFLINE' : 'ONLINE';
    const prevStatus = workerProfile.status;
    const currentSeq = ++statusSeqRef.current;

    try {
      setIsTogglingStatus(true);
      // 1. Optimistic UI update
      setWorkerProfile(prev => ({ ...prev, status: newStatus }));
      authStorage.updateUserData('worker', { status: newStatus });

      // 2. Immediate backend API call
      const res = await workerService.updateAvailability(newStatus);
      if (currentSeq !== statusSeqRef.current) return;

      if (res.success) {
        // 3. Confirm auth storage & emit synchronization event
        authStorage.updateUserData('worker', { status: newStatus });
        window.dispatchEvent(new CustomEvent('workerStatusUpdated', { detail: { status: newStatus } }));
        toastManager.success(`You are now ${newStatus === 'ONLINE' ? 'Online' : 'Offline'}`);
      } else {
        throw new Error(res.message || 'Failed to update status');
      }
    } catch (err) {
      if (currentSeq !== statusSeqRef.current) return;
      console.error('Failed to toggle status:', err);
      // Rollback
      setWorkerProfile(prev => ({ ...prev, status: prevStatus }));
      authStorage.updateUserData('worker', { status: prevStatus });
      window.dispatchEvent(new CustomEvent('workerStatusUpdated', { detail: { status: prevStatus } }));
      toastManager.error(err.response?.data?.message || err.message || 'Failed to update status');
    } finally {
      if (currentSeq === statusSeqRef.current) {
        setIsTogglingStatus(false);
      }
    }
  };

  // Load real data from API
  useEffect(() => {
    fetchDashboardData();

    // Ask for notification permission and register FCM
    registerFCMToken('worker', true).catch(err => console.error('FCM registration failed:', err));

    // Listen for cross-component status & profile updates
    const handleStatusSync = (e) => {
      const s = e?.detail?.status;
      if (s === 'ONLINE' || s === 'OFFLINE') {
        setWorkerProfile(prev => {
          if (prev.status !== s) {
            return { ...prev, status: s };
          }
          return prev;
        });
      }
    };

    const handleProfileUpdate = () => {
      fetchDashboardData();
    };

    window.addEventListener('workerStatusUpdated', handleStatusSync);
    window.addEventListener('workerProfileUpdated', handleProfileUpdate);
    window.addEventListener('workerJobsUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('workerStatusUpdated', handleStatusSync);
      window.removeEventListener('workerProfileUpdated', handleProfileUpdate);
      window.removeEventListener('workerJobsUpdated', handleProfileUpdate);
    };
  }, []);

  // Socket Listener for Real-Time Status & New Jobs
  useEffect(() => {
    if (!socket) return;

    // Listen for real-time availability updates
    const handleSocketStatusUpdate = (data) => {
      const rawStatus = String(data?.status || '').toUpperCase();
      if (rawStatus) {
        const norm = (rawStatus === 'ONLINE' || rawStatus === 'AVAILABLE' || rawStatus === 'ACTIVE') ? 'ONLINE' : 'OFFLINE';
        setWorkerProfile(prev => ({ ...prev, status: norm }));
        authStorage.updateUserData('worker', { status: norm });
      }
    };

    const handleNotification = (notif) => {
      // Listen for new job assignments
      if ((notif.type === 'booking_created' || notif.type === 'job_assigned') && notif.relatedId) {
        setAlertJobId(notif.relatedId);
      }
    };

    socket.on('worker_status_updated', handleSocketStatusUpdate);
    socket.on('worker_availability_changed', handleSocketStatusUpdate);
    socket.on('notification', handleNotification);

    return () => {
      socket.off('worker_status_updated', handleSocketStatusUpdate);
      socket.off('worker_availability_changed', handleSocketStatusUpdate);
      socket.off('notification', handleNotification);
    };
  }, [socket]);

  if (loading) {
    return (
      <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
        <Header title="Dashboard" showBack={false} />
        <main className="px-4 py-4 space-y-6">
          <SkeletonProfileHeader />
          <SkeletonDashboardStats />
          <div className="space-y-4">
            <div className="h-6 w-32 bg-slate-200 rounded animate-pulse"></div>
            <SkeletonList count={3} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Dashboard" showBack={false} notificationCount={stats.pendingJobs} />

      <main className="pt-1">
        {/* Profile Card Section */}
        <div className="px-4 pt-2.5 pb-1">
          <div
            className="rounded-2xl p-4 cursor-pointer active:scale-[0.99] transition-all duration-200 relative overflow-hidden shadow-sm border"
            onClick={() => navigate('/worker/profile')}
            style={{
              background: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
            }}
          >
            {/* Subtle decorative glow orb */}
            <div
              className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, #86efac 0%, transparent 70%)',
              }}
            />

            <div className="relative z-10 flex items-center gap-3.5">
              {/* Profile Photo with live ring */}
              <div className="relative shrink-0">
                <div
                  className="w-13 h-13 rounded-full flex items-center justify-center overflow-hidden border-2 border-white/90 shadow-sm"
                  style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                  }}
                >
                  {workerProfile.photo ? (
                    <OptimizedImage
                      src={workerProfile.photo}
                      alt={workerProfile.name}
                      className="w-full h-full object-cover"
                      width={52}
                      height={52}
                    />
                  ) : (
                    <FiUser className="w-6 h-6 text-white" />
                  )}
                </div>
                {/* Live status dot */}
                <span
                  className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-emerald-900 transition-colors ${
                    workerProfile.status === 'ONLINE' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.9)]' : 'bg-zinc-400'
                  }`}
                />
              </div>

              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-200">
                    {workerProfile.workerType === 'TEAM_LEADER' ? 'TEAM LEADER' : 'FIELD SPECIALIST'}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-emerald-300/80" />
                  <span className="text-[10px] font-bold text-emerald-100 flex items-center gap-0.5">
                    ★ {stats.rating > 0 ? stats.rating.toFixed(1) : '5.0'}
                  </span>
                </div>
                <h2 className="text-base font-bold text-white truncate leading-tight">
                  {workerProfile.name}
                </h2>
                <p className="text-xs text-emerald-100/90 truncate font-medium mt-0.5">
                  {workerProfile.skills && workerProfile.skills.length > 0
                    ? workerProfile.skills.slice(0, 2).join(' • ')
                    : (workerProfile.categories && workerProfile.categories.length > 0 ? workerProfile.categories.slice(0, 2).join(' • ') : 'AgroYilt Verified Worker')}
                </p>
              </div>

              {/* Online/Offline interactive toggle button & Profile Chevron */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <button
                  onClick={handleToggleStatus}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all border shadow-xs active:scale-95 ${
                    workerProfile.status === 'ONLINE'
                      ? 'bg-emerald-400/25 text-emerald-100 border-emerald-300/50 hover:bg-emerald-400/35'
                      : 'bg-black/30 text-zinc-300 border-white/20 hover:bg-black/40'
                  }`}
                  title={workerProfile.status === 'ONLINE' ? 'Tap to go offline' : 'Tap to go online'}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      workerProfile.status === 'ONLINE'
                        ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.9)]'
                        : 'bg-zinc-400'
                    }`}
                  />
                  <span>{isTogglingStatus ? 'Updating...' : (workerProfile.status === 'ONLINE' ? 'Online' : 'Offline')}</span>
                </button>

                <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-white/15 backdrop-blur-md border border-white/25">
                  <FiChevronRight className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Incomplete Profile Prompt */}
        {((!workerProfile.skills || workerProfile.skills.length === 0) ||
          (!workerProfile.address || Object.keys(workerProfile.address).length === 0)) && (
            <div className="px-4 pt-2">
              <div
                onClick={() => navigate('/worker/profile')}
                className="bg-amber-50/90 border border-amber-200/90 p-3 rounded-xl shadow-xs cursor-pointer hover:bg-amber-100/80 transition-colors flex items-center gap-2.5 active:scale-[0.99]"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <FiClock className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-900">Complete Your Profile</p>
                  <p className="text-[11px] text-amber-700 truncate">
                    Add skills and address to unlock 3x more farmer booking requests.
                  </p>
                </div>
                <FiArrowRight className="h-4 w-4 text-amber-600 shrink-0" />
              </div>
            </div>
          )}

        {/* Primary Earnings & Wallet Overview Card */}
        <div className="px-4 pt-2.5">
          <div
            onClick={() => navigate('/worker/wallet')}
            className="rounded-2xl p-4 cursor-pointer active:scale-[0.99] transition-all duration-200 relative overflow-hidden text-white shadow-sm border border-emerald-700/40"
            style={{
              background: 'linear-gradient(135deg, #064e3b 0%, #047857 55%, #059669 100%)',
            }}
          >
            <div
              className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full opacity-15 pointer-events-none"
              style={{ background: 'radial-gradient(circle, #34d399 0%, transparent 70%)' }}
            />

            <div className="relative z-10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-200/90">
                    This Month's Earnings
                  </span>
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-100 text-[10px] font-bold border border-emerald-400/30 flex items-center gap-1">
                    <FiTrendingUp className="w-2.5 h-2.5" />
                    Active
                  </span>
                </div>
                <div className="flex items-baseline gap-2.5 mt-1">
                  <span className="text-2xl font-black tracking-tight text-white">
                    ₹{stats.thisMonthEarnings.toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-emerald-200/80">
                    • Total ₹{stats.totalEarnings.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                  <p className="text-[11px] font-bold text-emerald-100">My Wallet</p>
                  <p className="text-[10px] text-emerald-200/75">Withdraw</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/25 shadow-inner">
                  <FaWallet className="w-4 h-4 text-emerald-100" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Operations & Job Metrics Grid (2x2 Grid) */}
        <div className="px-4 pt-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            {/* Card 1: Pending Requests */}
            <div
              onClick={() => navigate(pendingRequestsCount > 0 ? '/worker/booking-requests' : '/worker/jobs')}
              className="bg-white rounded-xl p-3 border border-amber-200/80 shadow-xs active:scale-95 transition-all cursor-pointer hover:shadow-sm hover:border-amber-300"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-500 truncate">Pending Jobs</p>
                  <p className="text-xl font-black text-gray-900 leading-tight mt-0.5">
                    {stats.pendingJobs}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-amber-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-[10px] font-bold truncate">Requires Quote</span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 ml-1">
                  <FiClock className="w-4 h-4 text-amber-600" />
                </div>
              </div>
            </div>

            {/* Card 2: Active / Accepted */}
            <div
              onClick={() => navigate('/worker/jobs')}
              className="bg-white rounded-xl p-3 border border-sky-200/80 shadow-xs active:scale-95 transition-all cursor-pointer hover:shadow-sm hover:border-sky-300"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-500 truncate">Accepted</p>
                  <p className="text-xl font-black text-gray-900 leading-tight mt-0.5">
                    {stats.acceptedJobs}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-sky-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                    <span className="text-[10px] font-bold truncate">In Progress</span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0 ml-1">
                  <FiBriefcase className="w-4 h-4 text-sky-600" />
                </div>
              </div>
            </div>

            {/* Card 3: Completed */}
            <div
              onClick={() => navigate('/worker/jobs')}
              className="bg-white rounded-xl p-3 border border-emerald-200/80 shadow-xs active:scale-95 transition-all cursor-pointer hover:shadow-sm hover:border-emerald-300"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-500 truncate">Completed</p>
                  <p className="text-xl font-black text-gray-900 leading-tight mt-0.5">
                    {stats.completedJobs}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-emerald-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-bold truncate">Fulfilled</span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 ml-1">
                  <FiCheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
              </div>
            </div>

            {/* Card 4: Worker Rating */}
            <div
              onClick={() => navigate('/worker/profile')}
              className="bg-white rounded-xl p-3 border border-indigo-200/80 shadow-xs active:scale-95 transition-all cursor-pointer hover:shadow-sm hover:border-indigo-300"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-500 truncate">Rating</p>
                  <p className="text-xl font-black text-gray-900 leading-tight mt-0.5">
                    {stats.rating > 0 ? stats.rating.toFixed(1) : '5.0'}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-indigo-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span className="text-[10px] font-bold truncate">Top Performer</span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 ml-1">
                  <FiStar className="w-4 h-4 text-indigo-600" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Highlighted Live Opportunities Banner */}
        {pendingRequestsCount > 0 && (
          <div className="px-4 pt-2.5">
            <div
              onClick={() => navigate('/worker/booking-requests')}
              className="relative overflow-hidden rounded-xl p-3.5 cursor-pointer shadow-sm active:scale-[0.98] transition-transform duration-200 border border-emerald-600/30 text-white"
              style={{
                background: 'linear-gradient(135deg, #047857 0%, #065F46 100%)',
              }}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm shrink-0 border border-white/20">
                    <FiBriefcase size={20} color="#fff" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold truncate">Farmer Work Requests</h3>
                      <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse shadow-xs">
                        {pendingRequestsCount} NEW
                      </span>
                    </div>
                    <p className="text-emerald-100 text-[11px] font-medium truncate">
                      {pendingRequestsCount} new farm job request(s) waiting for your quote
                    </p>
                  </div>
                </div>
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0 ml-2">
                  <FiArrowRight size={14} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions & Field Operations Grid */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
              Field Operations & Services
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Action 1: Farmer Requests */}
            <div
              onClick={() => navigate('/worker/booking-requests')}
              className="bg-white p-3 rounded-xl shadow-xs border border-emerald-100/80 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2.5 hover:border-emerald-200 hover:shadow-sm"
            >
              <div className="w-8.5 h-8.5 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 text-emerald-700">
                <FiBriefcase className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-800 leading-tight">Farmer Requests</p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">
                  {pendingRequestsCount > 0 ? `${pendingRequestsCount} requests` : 'Quote & bid'}
                </p>
              </div>
            </div>

            {/* Action 2: Team Roster / My Crew */}
            <div
              onClick={() => navigate('/worker/team')}
              className="bg-white p-3 rounded-xl shadow-xs border border-blue-100/80 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2.5 hover:border-blue-200 hover:shadow-sm"
            >
              <div className="w-8.5 h-8.5 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 text-blue-700">
                <FiUsers className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-800 leading-tight">
                  {workerProfile.workerType === 'TEAM_LEADER' ? 'Team Roster' : 'My Team'}
                </p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">
                  {workerProfile.workerType === 'TEAM_LEADER' ? 'Dispatch & recruit' : 'Crew members'}
                </p>
              </div>
            </div>

            {/* Action 3: Group Booking Requests (if Team Leader) OR Assigned Jobs Map */}
            {workerProfile.workerType === 'TEAM_LEADER' ? (
              <div
                onClick={() => navigate('/worker/group-requests')}
                className="bg-white p-3 rounded-xl shadow-xs border border-indigo-100/80 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2.5 hover:border-indigo-200 hover:shadow-sm"
              >
                <div className="w-8.5 h-8.5 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 text-indigo-700">
                  <FiLayers className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-800 leading-tight">Group Bookings</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">
                    Manage dispatch
                  </p>
                </div>
              </div>
            ) : (
              <div
                onClick={() => navigate('/worker/jobs')}
                className="bg-white p-3 rounded-xl shadow-xs border border-teal-100/80 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2.5 hover:border-teal-200 hover:shadow-sm"
              >
                <div className="w-8.5 h-8.5 rounded-lg bg-teal-50 flex items-center justify-center shrink-0 text-teal-700">
                  <FiMapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-800 leading-tight">Field Map</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">
                    {stats.acceptedJobs} active on field
                  </p>
                </div>
              </div>
            )}

            {/* Action 4: Wallet & Payouts */}
            <div
              onClick={() => navigate('/worker/wallet')}
              className="bg-white p-3 rounded-xl shadow-xs border border-purple-100/80 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2.5 hover:border-purple-200 hover:shadow-sm"
            >
              <div className="w-8.5 h-8.5 rounded-lg bg-purple-50 flex items-center justify-center shrink-0 text-purple-700">
                <FaWallet className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-800 leading-tight">My Wallet</p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">
                  Passbook & payouts
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Jobs Section */}
        <div className="px-4 pt-3.5 pb-8">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-800">Recent Jobs</h2>
              {recentJobs.length > 0 && (
                <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded-full">
                  {recentJobs.length}
                </span>
              )}
            </div>
            {recentJobs.length > 0 && (
              <button
                onClick={() => navigate('/worker/jobs')}
                className="px-3 py-1 rounded-full font-bold text-xs transition-all duration-200 active:scale-95 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 flex items-center gap-1 shadow-2xs"
              >
                <span>View All</span>
                <FiChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {recentJobs.length > 0 ? (
            <div className="space-y-2.5">
              {recentJobs.map((job) => {
                const s = String(job.status || '').toUpperCase();
                const isDone = s === 'COMPLETED' || s === 'WORK_DONE';
                const isProgress = s === 'IN_PROGRESS' || s === 'VISITED' || s === 'ASSIGNED' || s === 'ACCEPTED';
                
                return (
                  <div
                    key={job.id}
                    onClick={() => navigate(`/worker/job/${job.id}`)}
                    className="bg-white rounded-xl shadow-xs hover:shadow-sm cursor-pointer active:scale-[0.99] transition-all duration-200 relative overflow-hidden border border-gray-100 hover:border-emerald-200"
                  >
                    <div className="p-3">
                      <div className="flex items-center gap-3">
                        {/* Profile / Service Avatar */}
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100/80 flex items-center justify-center shrink-0 text-emerald-700">
                          <FiBriefcase className="w-5 h-5" />
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <p className="text-xs font-bold text-gray-900 truncate">
                              {job.customerName}
                            </p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/60 shrink-0">
                              {job.serviceType || 'Agri Service'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-50 border border-slate-100 text-slate-600">
                              <FiMapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[90px]">{job.location}</span>
                            </div>

                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 border border-amber-100 text-amber-700">
                              <FiClock className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                              <span>{job.time}</span>
                            </div>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                isDone
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : isProgress
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isDone ? 'bg-emerald-500' : isProgress ? 'bg-sky-500' : 'bg-amber-500'
                                }`}
                              />
                              {getStatusLabel(job.status)}
                            </span>
                          </div>
                        </div>

                        {/* Right Arrow / Price */}
                        <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
                          {job.price && (
                            <span className="text-xs font-black text-gray-900">
                              ₹{job.price}
                            </span>
                          )}
                          <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-emerald-700 group-hover:bg-emerald-50 transition-colors">
                            <FiChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-7 text-center shadow-xs border border-gray-100">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <FiBriefcase className="w-6 h-6" />
              </div>
              <p className="text-gray-800 font-bold text-sm mb-1">No assigned jobs right now</p>
              <p className="text-xs text-gray-500 max-w-xs mx-auto mb-4">
                Keep your status online to receive alerts from local farmers looking for workers.
              </p>
              <button
                onClick={() => navigate('/worker/booking-requests')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs active:scale-95 transition-all inline-flex items-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
                }}
              >
                <FiBriefcase className="w-3.5 h-3.5" />
                <span>Browse Farmer Requests</span>
              </button>
            </div>
          )}
        </div>
      </main>


      <WorkerJobAlertModal
        isOpen={!!alertJobId}
        jobId={alertJobId}
        onClose={() => setAlertJobId(null)}
        onJobAccepted={(id) => {
          fetchDashboardData();
          navigate(`/worker/job/${id}`);
        }}
      />


    </div>
  );
};

export default Dashboard;


