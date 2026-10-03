import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBriefcase, FiCheckCircle, FiClock, FiTrendingUp, FiChevronRight, FiUser, FiBell, FiMapPin, FiArrowRight } from 'react-icons/fi';
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
        const { totalEarnings, activeJobs, completedJobs, rating, recentJobs: apiRecentJobs } = statsRes.data;

        setStats(prev => ({
          ...prev,
          totalEarnings: totalEarnings || 0,
          thisMonthEarnings: totalEarnings || 0,
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

      <main className="pt-0">
        {/* Profile Card Section */}
        <div className="px-4 pt-3 pb-1">
          <div
            className="rounded-2xl p-3.5 cursor-pointer active:scale-98 transition-all duration-200 relative overflow-hidden shadow-sm"
            onClick={() => navigate('/worker/profile')}
            style={{
              background: themeColors.button,
              border: `1.5px solid rgba(255, 255, 255, 0.25)`,
            }}
          >
            {/* Decorative Pattern */}
            <div
              className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10"
              style={{
                background: `radial-gradient(circle, #FFFFFF 0%, transparent 70%)`,
                transform: 'translate(20px, -20px)',
              }}
            />

            <div className="relative z-10 flex items-center gap-3">
              {/* Profile Photo */}
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 overflow-hidden shadow-sm"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.button} 0%, ${themeColors.button}dd 100%)`,
                  border: `2px solid #FFFFFF`,
                }}
              >
                {workerProfile.photo ? (
                  <OptimizedImage
                    src={workerProfile.photo}
                    alt={workerProfile.name}
                    className="w-full h-full object-cover"
                    width={44}
                    height={44}
                  />
                ) : (
                  <FiUser className="w-5 h-5 text-white" />
                )}
              </div>

              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/90 mb-0.5 leading-none">
                  WELCOME !
                </p>
                <h2 className="text-base font-bold text-white truncate leading-tight">{workerProfile.name}</h2>
                
                {/* Status Toggle in Dashboard */}
                <div 
                  onClick={handleToggleStatus}
                  className="inline-flex items-center gap-1.5 mt-1 bg-black/20 hover:bg-black/30 transition-all backdrop-blur-md px-2.5 py-0.5 rounded-full cursor-pointer border border-white/20 active:scale-95"
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${workerProfile.status === 'ONLINE' ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.9)]' : 'bg-red-400'}`}></div>
                  <span className="text-[11px] font-bold text-white tracking-wide">
                    {isTogglingStatus ? 'UPDATING...' : (workerProfile.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE')}
                  </span>
                </div>
              </div>

              {/* Arrow Icon */}
              <div
                className="p-2 rounded-xl shrink-0 bg-white/25 backdrop-blur-sm border border-white/30"
              >
                <FiChevronRight className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Incomplete Profile Prompt */}
        {((!workerProfile.skills || workerProfile.skills.length === 0) ||
          (!workerProfile.address || Object.keys(workerProfile.address).length === 0)) && (
            <div className="px-4 pt-1 -mb-1">
              <div
                onClick={() => navigate('/worker/profile')}
                className="bg-orange-50 border-l-4 border-orange-500 p-3 rounded-r-xl shadow-sm cursor-pointer hover:bg-orange-100 transition-colors"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <FiClock className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="ml-2.5">
                    <p className="text-xs font-bold text-orange-700">Profile Incomplete</p>
                    <p className="text-[11px] text-orange-600">
                      Complete your profile (Address, Skills) to receive jobs.
                    </p>
                  </div>
                  <div className="ml-auto">
                    <FiArrowRight className="h-3.5 w-3.5 text-orange-500" />
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* Stats Cards - Compact & Native Mobile View */}
        <div className="px-4 pt-2.5">
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            {/* Card 1: This Month Earnings - Dark Blue Gradient */}
            <div
              onClick={() => navigate('/worker/jobs')}
              className="rounded-xl p-3 relative overflow-hidden cursor-pointer active:scale-95 transition-transform shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #001947 0%, #003b77 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <div className="relative z-10">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider truncate mb-0.5">This Month</p>
                    <p className="text-lg font-black text-white leading-tight tracking-tight">
                      {'\u20B9'}{stats.thisMonthEarnings.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm border border-white/20 shrink-0 ml-1.5">
                    <FaWallet className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-white/75">
                  <FiTrendingUp className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium">Earnings</span>
                </div>
              </div>
            </div>

            {/* Card 2: Pending Jobs - Light Blue Gradient */}
            <div
              onClick={() => navigate(pendingRequestsCount > 0 ? '/worker/booking-requests' : '/worker/jobs')}
              className="rounded-xl p-3 relative overflow-hidden cursor-pointer active:scale-95 transition-transform shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #406788 0%, #304a63 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <div className="relative z-10">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider truncate mb-0.5">Pending Jobs</p>
                    <p className="text-lg font-black text-white leading-tight tracking-tight">
                      {stats.pendingJobs}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm border border-white/20 shrink-0 ml-1.5">
                    <FiClock className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-white/75">
                  <FiClock className="w-3 h-3 text-amber-300" />
                  <span className="text-[10px] font-medium">Waiting</span>
                </div>
              </div>
            </div>

            {/* Card 3: Accepted Jobs - Light Blue Gradient */}
            <div
              onClick={() => navigate('/worker/jobs')}
              className="rounded-xl p-3 relative overflow-hidden cursor-pointer active:scale-95 transition-transform shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #406788 0%, #304a63 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <div className="relative z-10">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider truncate mb-0.5">Accepted</p>
                    <p className="text-lg font-black text-white leading-tight tracking-tight">
                      {stats.acceptedJobs}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm border border-white/20 shrink-0 ml-1.5">
                    <FiCheckCircle className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-white/75">
                  <FiBriefcase className="w-3 h-3 text-sky-300" />
                  <span className="text-[10px] font-medium">Active</span>
                </div>
              </div>
            </div>

            {/* Card 4: Completed Jobs - Dark Blue Gradient */}
            <div
              onClick={() => navigate('/worker/jobs')}
              className="rounded-xl p-3 relative overflow-hidden cursor-pointer active:scale-95 transition-transform shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #001947 0%, #003b77 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <div className="relative z-10">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider truncate mb-0.5">Completed</p>
                    <p className="text-lg font-black text-white leading-tight tracking-tight">
                      {stats.completedJobs}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm border border-white/20 shrink-0 ml-1.5">
                    <FiBriefcase className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-white/75">
                  <FiCheckCircle className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium">Done</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Farmer Work Requests Card (For All Workers) */}
        <div className="px-4 mt-1.5">
          <div 
            onClick={() => navigate('/worker/booking-requests')}
            className="relative overflow-hidden rounded-xl p-3 cursor-pointer shadow-sm active:scale-[0.98] transition-transform duration-200"
            style={{
              background: 'linear-gradient(135deg, #047857 0%, #065F46 100%)',
              color: '#fff'
            }}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm shrink-0">
                  <FiBriefcase size={18} color="#fff" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold truncate">Farmer Work Requests</h3>
                    {pendingRequestsCount > 0 && (
                      <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                        {pendingRequestsCount} NEW
                      </span>
                    )}
                  </div>
                  <p className="text-emerald-100 text-[11px] font-medium truncate">
                    {pendingRequestsCount > 0
                      ? `${pendingRequestsCount} new job request(s) waiting for your quote`
                      : 'View and quote on incoming farmer requests'}
                  </p>
                </div>
              </div>
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 ml-2">
                <FiArrowRight size={13} />
              </div>
            </div>
          </div>
        </div>

        {/* Group Booking Requests Card (For Team Leaders) */}
        {workerProfile.workerType === 'TEAM_LEADER' && (
          <div className="px-4 mt-1.5">
            <div 
              onClick={() => navigate('/worker/group-requests')}
              className="relative overflow-hidden rounded-xl p-3 cursor-pointer shadow-sm active:scale-[0.98] transition-transform duration-200"
              style={{
                background: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 100%)',
                color: '#fff'
              }}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm shrink-0">
                    <FiBriefcase size={18} color="#fff" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">Group Booking Requests</h3>
                    <p className="text-white/85 text-[11px] font-medium truncate">
                      Manage farmer group requests & team dispatch
                    </p>
                  </div>
                </div>
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 ml-2">
                  <FiArrowRight size={13} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Team Management Card (For all workers) - Compact Banner */}
        <div className="px-4 mt-1.5">
          <div 
            onClick={() => navigate('/worker/team')}
            className="relative overflow-hidden rounded-xl p-3 cursor-pointer shadow-sm active:scale-[0.98] transition-transform duration-200"
            style={{
              background: workerProfile.workerType === 'TEAM_LEADER' ? 'linear-gradient(135deg, #2E7D32 0%, #388E3C 100%)' : 'linear-gradient(135deg, #F57C00 0%, #FF9800 100%)',
              color: '#fff'
            }}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm shrink-0">
                  {workerProfile.workerType === 'TEAM_LEADER' ? (
                    <FiUser size={18} color="#fff" />
                  ) : (
                    <FiBriefcase size={18} color="#fff" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">
                    {workerProfile.workerType === 'TEAM_LEADER' ? 'Manage Your Team Roster' : 'My Team'}
                  </h3>
                  <p className="text-white/85 text-[11px] font-medium truncate">
                    {workerProfile.workerType === 'TEAM_LEADER' 
                      ? 'View member skills, status & recruit' 
                      : (workerProfile.teamId ? 'View your team leader' : 'Join or Create a team')}
                  </p>
                </div>
              </div>
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 ml-2">
                <FiArrowRight size={13} />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Jobs Section */}
        <div className="px-4 pt-3 pb-6">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base font-bold text-gray-800">Recent Jobs</h2>
            {recentJobs.length > 0 && (
              <button
                onClick={() => navigate('/worker/jobs')}
                className="px-3 py-1 rounded-lg font-bold text-xs transition-all duration-300 active:scale-95 text-white shadow-sm"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.button} 0%, ${themeColors.button}dd 100%)`,
                }}
              >
                View All
              </button>
            )}
          </div>
          {recentJobs.length > 0 ? (
            <div className="space-y-2.5">
              {recentJobs.map((job, index) => {
                // Alternating colors
                const isDarkBlue = index % 2 === 0;
                const accentColor = isDarkBlue ? '#001947' : '#406788';

                return (
                  <div
                    key={job.id}
                    onClick={() => navigate(`/worker/job/${job.id}`)}
                    className="bg-white rounded-xl shadow-sm cursor-pointer active:scale-98 transition-all duration-200 relative overflow-hidden border border-gray-100"
                  >
                    {/* Left accent border */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
                      style={{
                        background: `linear-gradient(180deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                      }}
                    />

                    {/* Compact Content */}
                    <div className="px-3 py-2 pl-3.5">
                      <div className="flex items-center gap-2.5">
                        {/* Profile Image Circle */}
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                          style={{
                            border: `2px solid ${accentColor}30`,
                            background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}08 100%)`,
                          }}
                        >
                          <FiUser className="w-4 h-4" style={{ color: accentColor }} />
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                          {/* Name and Service in one line */}
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-xs font-bold text-gray-800 truncate">{job.customerName}</p>
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                              style={{
                                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                                color: '#FFFFFF',
                              }}
                            >
                              {job.serviceType || 'Service'}
                            </span>
                          </div>

                          {/* Address, Time, Status in one line */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <div
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                              style={{
                                background: 'rgba(0, 166, 166, 0.08)',
                                border: '1px solid rgba(0, 166, 166, 0.15)',
                              }}
                            >
                              <FiMapPin className="w-2.5 h-2.5 shrink-0" style={{ color: themeColors.button }} />
                              <span className="font-medium text-gray-700 truncate max-w-[90px]">{job.location}</span>
                            </div>
                            <div
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                              style={{
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.15)',
                              }}
                            >
                              <FiClock className="w-2.5 h-2.5 shrink-0" style={{ color: '#F59E0B' }} />
                              <span className="font-medium text-gray-700">{job.time}</span>
                            </div>
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                background: `${accentColor}12`,
                                color: accentColor,
                                border: `1px solid ${accentColor}25`,
                              }}
                            >
                              {getStatusLabel(job.status)}
                            </span>
                          </div>
                        </div>

                        {/* Navigate Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/worker/job/${job.id}`);
                          }}
                          className="p-1.5 rounded-lg shrink-0 active:scale-95 transition-transform"
                          style={{
                            background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                          }}
                        >
                          <FiArrowRight className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="bg-white rounded-xl p-8 text-center shadow-md"
              style={{
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}
            >
              <FiBriefcase className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-600 font-semibold mb-2">No jobs assigned yet</p>
              <p className="text-sm text-gray-500">
                You'll see assigned jobs here when vendors assign work to you
              </p>
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


