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
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Profile" />

      <main className="px-4 pt-4 pb-6">
        {/* Profile Header Card */}
        <div
          className="rounded-2xl p-5 mb-4 shadow-xl relative overflow-hidden"
          style={{
            background: vendorTheme.button,
            border: `2px solid ${vendorTheme.button}`,
          }}
        >
          {/* Decorative Pattern */}
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10"
            style={{
              background: `radial-gradient(circle, ${vendorTheme.button} 0%, transparent 70%)`,
              transform: 'translate(30px, -30px)',
            }}
          />

          <div className="relative z-10">
            <div className="flex items-start gap-4">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'rgba(255, 255, 255, 0.3)',
                  border: '3px solid white',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                }}
              >
                {profile.photo ? (
                  <img
                    src={profile.photo}
                    alt={profile.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <FiUser className="w-10 h-10 text-white" />
                )}
              </div>
              <div className="flex-1 pr-12">
                <h2 className="text-xl font-bold text-white mb-0.5">{profile.name}</h2>
                {profile.serviceCategories && profile.serviceCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {profile.serviceCategories.map((cat, idx) => (
                      <span key={idx} className="text-xs text-white bg-white/20 px-2 py-0.5 rounded font-medium backdrop-blur-sm">
                        {cat}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mb-2"></div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-lg backdrop-blur-sm">
                    <FiStar className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
                    <span className="text-white text-sm font-bold">{profile.rating}</span>
                  </div>
                  <span className="text-white/60 text-xs">•</span>
                  <p className="text-sm text-white opacity-90 font-medium">{profile.completedJobs} Completed</p>
                  <span className="text-white/60 text-xs">•</span>
                  <p className="text-sm text-white opacity-90 font-medium">{profile.totalJobs} Total</p>
                </div>

                {/* Availability Toggle in Profile Header */}
                <div 
                  onClick={handleToggleStatus}
                  className="inline-flex items-center gap-1.5 mt-2 bg-white/20 hover:bg-white/30 transition-all backdrop-blur-md px-3 py-1 rounded-full cursor-pointer border border-white/30 active:scale-95"
                >
                  <div className={`w-2 h-2 rounded-full ${profile.status === 'ONLINE' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]' : 'bg-red-400'}`}></div>
                  <span className="text-xs font-bold text-white tracking-wide">
                    {isTogglingStatus ? 'UPDATING...' : (profile.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE')}
                  </span>
                </div>
              </div>
            </div>

            {/* Edit Profile Button - Absolute Positioned */}
            <button
              onClick={() => navigate('/worker/profile/edit')}
              className="absolute top-0 right-0 p-2.5 rounded-lg transition-all active:scale-95"
              style={{
                background: 'rgba(255, 255, 255, 0.25)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                border: '1.5px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              <FiEdit2 className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Profile Details */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3 className="font-bold text-gray-800 mb-4">Personal Information</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <FiPhone className="w-5 h-5" style={{ color: themeColors.icon }} />
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <p className="text-sm font-semibold text-gray-800">{profile.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FiMail className="w-5 h-5" style={{ color: themeColors.icon }} />
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="text-sm font-semibold text-gray-800">{profile.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FiMapPin className="w-5 h-5" style={{ color: themeColors.icon }} />
              <div>
                <p className="text-sm text-gray-600">Address</p>
                <p className="text-sm font-semibold text-gray-800">{profile.address}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Service Category & Skills */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3 className="font-bold text-gray-800 mb-4">Service Information</h3>
          <div className="space-y-3">


            {/* Skills */}
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg mt-0.5" style={{ background: `${themeColors.button}15` }}>
                <FiTag className="w-5 h-5" style={{ color: themeColors.button }} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Skills</p>
                {profile.skills && profile.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                        style={{
                          background: `linear-gradient(135deg, ${themeColors.button} 0%, ${themeColors.button}dd 100%)`,
                          color: '#FFFFFF',
                          boxShadow: `0 2px 6px ${themeColors.button}40`,
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm font-medium">Not set</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3 className="font-bold text-gray-800 mb-3">Statistics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Total Jobs</p>
              <p className="text-2xl font-bold text-gray-800">{profile.totalJobs}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-gray-800">{profile.completedJobs}</p>
            </div>
          </div>
        </div>

        {/* Refer & Earn Button */}
        <button
          onClick={() => navigate('/worker/referrals')}
          className="w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-md transition-all active:scale-95 mb-4 border border-orange-100 hover:border-orange-300"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
              <FiGift className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-left">
              <span className="font-bold text-gray-900 block text-sm">Refer & Earn</span>
              <span className="text-xs text-gray-500">Invite workers & earn cash rewards</span>
            </div>
          </div>
          <FiChevronRight className="w-5 h-5 text-gray-400" />
        </button>

        {/* Bank & Payout Details Button */}
        <button
          onClick={() => setShowBankModal(true)}
          className="w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-md transition-all active:scale-95 mb-4 border border-teal-100 hover:border-teal-300"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <FiCreditCard className="w-5 h-5 text-teal-600" />
            </div>
            <div className="text-left">
              <span className="font-bold text-gray-900 block text-sm">Bank Account & Payout Details</span>
              <span className="text-xs text-gray-500">View or update bank account for wage payouts</span>
            </div>
          </div>
          <FiChevronRight className="w-5 h-5 text-gray-400" />
        </button>

        {/* Settings Button */}
        <button
          onClick={() => navigate('/worker/settings')}
          className="w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-md transition-all active:scale-95 mb-4"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center gap-3">
            <FiEdit2 className="w-5 h-5" style={{ color: themeColors.button }} />
            <span className="font-semibold text-gray-800">Settings</span>
          </div>
          <FiChevronRight className="w-5 h-5 text-gray-400" />
        </button>

        {/* Help & Support Button */}
        <button
          onClick={() => navigate('/worker/help-support')}
          className="w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-md transition-all active:scale-95 mb-4"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center gap-3">
            <FiHelpCircle className="w-5 h-5" style={{ color: themeColors.button }} />
            <span className="font-semibold text-gray-800">Help & Support</span>
          </div>
          <FiChevronRight className="w-5 h-5 text-gray-400" />
        </button>

        {/* Logout Button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowLogoutModal(true);
          }}
          className="w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-md transition-all active:scale-95 cursor-pointer"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            cursor: 'pointer'
          }}
        >
          <div className="flex items-center gap-3">
            <FiLogOut className="w-5 h-5 text-red-500" />
            <span className="font-semibold text-red-500">Logout</span>
          </div>
          <FiChevronRight className="w-5 h-5 text-gray-400" />
        </button>
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

