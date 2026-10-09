import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiEdit2, FiMapPin, FiPhone, FiMail, FiBriefcase, FiStar, FiChevronRight, FiTag, FiLogOut, FiGift, FiCreditCard, FiX, FiHelpCircle } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { workerTheme as themeColors, vendorTheme } from '../../../../theme';
import { workerAuthService } from '../../../../services/authService';
import workerService from '../../../../services/workerService';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import LogoLoader from '../../../../components/common/LogoLoader';
import authStorage from '../../../../utils/authStorage';
import { useSocket } from '../../../../context/SocketContext';
import BankDetailsSection from '../../../../components/common/BankDetailsSection';
import LogoutModal from '../../../../components/common/LogoutModal';

const Profile = () => {
  const navigate = useNavigate();
  const socket = useSocket();
  // Initialize with empty/default values - will be loaded from localStorage
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const statusSeqRef = useRef(0);

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

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await workerAuthService.getProfile();
        if (response.success) {
          const workerData = response.worker;
          // Format address
          const addressString = workerData.address
            ? workerData.address.fullAddress || `${workerData.address.addressLine1 || ''} ${workerData.address.addressLine2 || ''} ${workerData.address.city || ''} ${workerData.address.state || ''} ${workerData.address.pincode || ''}`.trim() || 'Not set'
            : 'Not set';

          setProfile({
            name: workerData.name || 'Worker Name',
            phone: workerData.phone || '',
            email: workerData.email || '',
            gender: workerData.gender || 'male',
            address: addressString,
            rating: workerData.rating || 0,
            totalJobs: workerData.totalJobs || 0,
            completedJobs: workerData.completedJobs || 0,
            serviceCategories: workerData.serviceCategories || (workerData.serviceCategory ? [workerData.serviceCategory] : []),
            skills: workerData.skills || [],
            photo: workerData.profilePhoto || null,
            status: ((String(workerData.status || '').toUpperCase() === 'ONLINE') || (String(workerData.status || '').toUpperCase() === 'AVAILABLE') || (String(workerData.status || '').toUpperCase() === 'ACTIVE')) ? 'ONLINE' : 'OFFLINE',
            isPhoneVerified: workerData.isPhoneVerified || false,
            isEmailVerified: workerData.isEmailVerified || false
          });
          authStorage.updateUserData('worker', workerData);
        } else {
          setError(response.message || 'Failed to fetch profile');
          toastManager.error(response.message || 'Failed to fetch profile');
          // Fallback to tab session if API fails
          const localWorkerData = authStorage.getUserData('worker') || {};
          if (localWorkerData && Object.keys(localWorkerData).length > 0) {
            setProfile({
              name: localWorkerData.name || 'Worker Name',
              phone: localWorkerData.phone || '',
              email: localWorkerData.email || '',
              gender: localWorkerData.gender || 'male',
              address: 'Not set',
              rating: localWorkerData.rating || 0,
              totalJobs: localWorkerData.totalJobs || 0,
              completedJobs: localWorkerData.completedJobs || 0,
              serviceCategories: localWorkerData.serviceCategories || (localWorkerData.serviceCategory ? [localWorkerData.serviceCategory] : []),
              skills: localWorkerData.skills || [],
              photo: localWorkerData.profilePhoto || null
            });
            toast.info('Loaded profile from local storage (API failed)');
          }
        }
      } catch (err) {
        console.error('Error fetching worker profile:', err);
        setError(err.response?.data?.message || 'Failed to fetch profile');
        toastManager.error(err.response?.data?.message || 'Failed to fetch profile');
        // Fallback to tab session if API fails
        const localWorkerData = authStorage.getUserData('worker') || {};
        if (localWorkerData && Object.keys(localWorkerData).length > 0) {
          setProfile({
            name: localWorkerData.name || 'Worker Name',
            phone: localWorkerData.phone || '',
            email: localWorkerData.email || '',
            address: 'Not set',
            rating: localWorkerData.rating || 0,
            totalJobs: localWorkerData.totalJobs || 0,
            completedJobs: localWorkerData.completedJobs || 0,
            serviceCategories: localWorkerData.serviceCategories || (localWorkerData.serviceCategory ? [localWorkerData.serviceCategory] : []),
            skills: localWorkerData.skills || [],
            photo: localWorkerData.profilePhoto || null
          });
          toast.info('Loaded profile from local storage (API failed)');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();

    // Listen for cross-component status & profile updates
    const handleStatusSync = (e) => {
      const s = e?.detail?.status;
      if (s === 'ONLINE' || s === 'OFFLINE') {
        setProfile(prev => {
          if (prev && prev.status !== s) {
            return { ...prev, status: s };
          }
          return prev;
        });
      }
    };

    const handleProfileUpdate = () => {
      fetchProfile();
    };

    window.addEventListener('workerStatusUpdated', handleStatusSync);
    window.addEventListener('workerProfileUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('workerStatusUpdated', handleStatusSync);
      window.removeEventListener('workerProfileUpdated', handleProfileUpdate);
    };
  }, []);

  // Socket listener for real-time status updates
  useEffect(() => {
    if (!socket) return;

    const handleSocketStatusUpdate = (data) => {
      const rawStatus = String(data?.status || '').toUpperCase();
      if (rawStatus) {
        const norm = (rawStatus === 'ONLINE' || rawStatus === 'AVAILABLE' || rawStatus === 'ACTIVE') ? 'ONLINE' : 'OFFLINE';
        setProfile(prev => {
          if (prev) {
            return { ...prev, status: norm };
          }
          return prev;
        });
        authStorage.updateUserData('worker', { status: norm });
      }
    };

    socket.on('worker_status_updated', handleSocketStatusUpdate);
    socket.on('worker_availability_changed', handleSocketStatusUpdate);
    return () => {
      socket.off('worker_status_updated', handleSocketStatusUpdate);
      socket.off('worker_availability_changed', handleSocketStatusUpdate);
    };
  }, [socket]);

  // Instant availability toggle with optimistic UI, race protection & rollback
  const handleToggleStatus = async (e) => {
    e?.stopPropagation?.();
    if (isTogglingStatus || !profile) return;

    const isCurrentlyOnline = profile.status === 'ONLINE';
    const newStatus = isCurrentlyOnline ? 'OFFLINE' : 'ONLINE';
    const prevStatus = profile.status;
    const currentSeq = ++statusSeqRef.current;

    try {
      setIsTogglingStatus(true);
      // 1. Optimistic UI update
      setProfile(prev => ({ ...prev, status: newStatus }));
      authStorage.updateUserData('worker', { status: newStatus });

      // 2. Call backend
      const res = await workerService.updateAvailability(newStatus);
      if (currentSeq !== statusSeqRef.current) return;

      if (res.success) {
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
      setProfile(prev => ({ ...prev, status: prevStatus }));
      authStorage.updateUserData('worker', { status: prevStatus });
      window.dispatchEvent(new CustomEvent('workerStatusUpdated', { detail: { status: prevStatus } }));
      toastManager.error(err.response?.data?.message || err.message || 'Failed to update status');
    } finally {
      if (currentSeq === statusSeqRef.current) {
        setIsTogglingStatus(false);
      }
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await workerAuthService.logout();
      toastManager.success('Logged out successfully');
      navigate('/worker/login');
    } catch (error) {
      // Even if API call fails, clear local storage
      localStorage.removeItem('workerAccessToken');
      localStorage.removeItem('workerRefreshToken');
      localStorage.removeItem('workerData');
      toastManager.success('Logged out successfully');
      navigate('/worker/login');
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  if (isLoading) {
    return <LogoLoader />;
  }

  if (error && !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: themeColors.backgroundGradient }}>
        <div className="text-center p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error loading profile</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 hover:opacity-90"
            style={{ backgroundColor: themeColors.button }}
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Profile" />

      <main className="max-w-xl mx-auto px-4 pt-3 pb-6">
        {/* Profile Hero Card */}
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-2xl p-4 sm:p-5 mb-3 text-white shadow-lg relative overflow-hidden border border-emerald-500/25">
          {/* Ambient decorative glow */}
          <div className="absolute -top-12 -right-12 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-emerald-400/15 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10">
            {/* Top row: Avatar + Identity + Edit */}
            <div className="flex items-center gap-3.5">
              {/* Avatar with status indicator */}
              <div className="relative shrink-0">
                <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-white/20 border-2 border-white/60 p-0.5 flex items-center justify-center shadow-md backdrop-blur-md overflow-hidden">
                  {profile.photo ? (
                    <img
                      src={profile.photo}
                      alt={profile.name}
                      className="w-full h-full rounded-xl object-cover"
                    />
                  ) : (
                    <FiUser className="w-8 h-8 text-white" />
                  )}
                </div>
                <span
                  className={`w-3.5 h-3.5 rounded-full border-2 border-emerald-800 absolute -bottom-0.5 -right-0.5 shadow-xs ${
                    profile.status === 'ONLINE' ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                  title={profile.status === 'ONLINE' ? 'Online' : 'Offline'}
                />
              </div>

              {/* Name & Availability */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-white capitalize truncate leading-tight">
                    {profile.name}
                  </h2>
                  <button
                    onClick={() => navigate('/worker/profile/edit')}
                    className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-xs backdrop-blur-md shrink-0"
                    title="Edit Profile"
                  >
                    <FiEdit2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                </div>

                {profile.serviceCategories && profile.serviceCategories.length > 0 && (
                  <p className="text-emerald-100 text-xs font-medium truncate mt-0.5">
                    {profile.serviceCategories.join(' • ')}
                  </p>
                )}

                {/* Status Toggle Pill */}
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={handleToggleStatus}
                    disabled={isTogglingStatus}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 active:scale-95 transition-all backdrop-blur-md cursor-pointer"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        profile.status === 'ONLINE'
                          ? 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)] animate-pulse'
                          : 'bg-rose-300'
                      }`}
                    />
                    <span className="text-[10.5px] font-bold text-white tracking-wide uppercase">
                      {isTogglingStatus ? 'Updating...' : (profile.status === 'ONLINE' ? 'Online (Accepting Jobs)' : 'Offline')}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Guaranteed Non-Wrapping Stats Strip */}
            <div className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-white/15 text-center">
              <div className="bg-white/10 rounded-xl py-2 px-1 backdrop-blur-xs">
                <div className="flex items-center justify-center gap-1 text-amber-300">
                  <FiStar className="w-3.5 h-3.5 fill-amber-300" />
                  <span className="text-white text-xs sm:text-sm font-black">
                    {profile.rating ? Number(profile.rating).toFixed(1) : '5.0'}
                  </span>
                </div>
                <p className="text-[10px] text-emerald-100/80 font-medium mt-0.5 uppercase tracking-wider">Rating</p>
              </div>

              <div className="bg-white/10 rounded-xl py-2 px-1 backdrop-blur-xs">
                <p className="text-white text-xs sm:text-sm font-black">{profile.completedJobs || 0}</p>
                <p className="text-[10px] text-emerald-100/80 font-medium mt-0.5 uppercase tracking-wider">Completed</p>
              </div>

              <div className="bg-white/10 rounded-xl py-2 px-1 backdrop-blur-xs">
                <p className="text-white text-xs sm:text-sm font-black">{profile.totalJobs || 0}</p>
                <p className="text-[10px] text-emerald-100/80 font-medium mt-0.5 uppercase tracking-wider">Total Jobs</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Hub Shortcuts */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button
            onClick={() => navigate('/worker/jobs')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white border border-slate-100 shadow-xs hover:border-slate-200 active:scale-95 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
              <FiBriefcase className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-bold text-slate-800">My Jobs</span>
          </button>

          <button
            onClick={() => navigate('/worker/wallet')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white border border-slate-100 shadow-xs hover:border-slate-200 active:scale-95 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
              <FiCreditCard className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-bold text-slate-800">Wallet</span>
          </button>

          <button
            onClick={() => navigate('/worker/wallet/history')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white border border-slate-100 shadow-xs hover:border-slate-200 active:scale-95 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
              <FiTag className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-bold text-slate-800">Passbook</span>
          </button>
        </div>

        {/* Personal Information */}
        <div className="bg-white rounded-2xl p-4 mb-3 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Personal Information</h3>
            <button
              onClick={() => navigate('/worker/profile/edit')}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5"
            >
              <span>Edit</span>
              <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <FiPhone className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-medium text-slate-400">Phone</p>
                <p className="text-xs sm:text-sm font-bold text-slate-800">{profile.phone || 'Not set'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <FiMail className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-medium text-slate-400">Email</p>
                <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">{profile.email || 'Not set'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <FiUser className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-medium text-slate-400">Gender</p>
                <p className="text-xs sm:text-sm font-bold text-slate-800 capitalize">{profile.gender || 'Male'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                <FiMapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-medium text-slate-400">Address</p>
                <p className="text-xs sm:text-sm font-medium text-slate-800 leading-relaxed">{profile.address || 'Not set'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Service Information & Skills */}
        <div className="bg-white rounded-2xl p-4 mb-3 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Service & Skills</h3>
            <button
              onClick={() => navigate('/worker/profile/edit')}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5"
            >
              <span>Manage</span>
              <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 font-medium mb-2 uppercase tracking-wide">Registered Skills</p>
            {profile.skills && profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((skill, index) => (
                  <span
                    key={index}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60 flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>{skill}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-xs font-medium">No skills set</p>
            )}
          </div>
        </div>

        {/* Account Menu & Settings Group */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden mb-3">
          {/* Bank & Payout Details */}
          <button
            onClick={() => setShowBankModal(true)}
            className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <FiCreditCard className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-800 block text-xs sm:text-sm">Bank Account & Payout Details</span>
                <span className="text-[11px] text-slate-400">View or update account for wage payouts</span>
              </div>
            </div>
            <FiChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {/* Refer & Earn */}
          <button
            onClick={() => navigate('/worker/referrals')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <FiGift className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-800 block text-xs sm:text-sm">Refer & Earn</span>
                  <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60 uppercase">
                    Reward
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">Invite workers & earn cash rewards</span>
              </div>
            </div>
            <FiChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {/* Settings */}
          <button
            onClick={() => navigate('/worker/settings')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <FiEdit2 className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-800 text-xs sm:text-sm">Account Settings</span>
            </div>
            <FiChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {/* Help & Support */}
          <button
            onClick={() => navigate('/worker/help-support')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <FiHelpCircle className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-800 text-xs sm:text-sm">Help & Support</span>
            </div>
            <FiChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowLogoutModal(true);
            }}
            className="w-full p-3.5 flex items-center justify-between hover:bg-rose-50/50 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <FiLogOut className="w-4 h-4" />
              </div>
              <span className="font-bold text-rose-600 text-xs sm:text-sm">Logout</span>
            </div>
            <FiChevronRight className="w-4 h-4 text-rose-400 shrink-0" />
          </button>
        </div>
      </main>

      <BottomNav />

      {/* Bank & Payout Details Modal */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowBankModal(false)}
              className="absolute top-5 right-5 p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors z-10"
              title="Close"
            >
              <FiX className="w-5 h-5" />
            </button>
            <BankDetailsSection />
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => !isLoggingOut && setShowLogoutModal(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
        userName={profile?.name}
        role="Worker"
      />
    </div>
  );
};

export default Profile;

