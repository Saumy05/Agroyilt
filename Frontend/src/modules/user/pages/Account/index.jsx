import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toastManager } from '../../../../utils/toastManager';
import { themeColors } from '../../../../theme';
import { userAuthService } from '../../../../services/authService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiUser,
  FiEdit3,
  FiClipboard,
  FiHeadphones,
  FiFileText,
  FiStar,
  FiMapPin,
  FiCreditCard,
  FiSettings,
  FiChevronRight,
  FiBell,
  FiShoppingBag,
  FiLogOut,
  FiGift,
  FiShield,
  FiZap,
  FiCheckCircle,
  FiTrash2,
  FiX,
  FiLayers
} from 'react-icons/fi';
import { MdAccountBalanceWallet } from 'react-icons/md';
import NotificationBell from '../../components/common/NotificationBell';
import { useSocket } from '../../../../context/SocketContext';
import authStorage from '../../../../utils/authStorage';
import BankDetailsSection from '../../../../components/common/BankDetailsSection';
import { LogoutModal } from '../../../../components/common';
import api from '../../../../services/api';

const Account = () => {
  const navigate = useNavigate();
  const socket = useSocket();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userProfile, setUserProfile] = useState({
    name: 'Verified Farmer',
    phone: '',
    email: '',
    isPhoneVerified: false,
    isEmailVerified: false,
    walletBalance: 0,
    plans: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);

  // Fetch user profile from database
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // First check current tab session
        const userData = authStorage.getUserData('user');
        if (userData) {
          setUserProfile({
            name: userData.name || 'Verified Farmer',
            phone: userData.phone || '',
            email: userData.email || '',
            isPhoneVerified: userData.isPhoneVerified || false,
            isEmailVerified: userData.isEmailVerified || false,
            profilePhoto: userData.profilePhoto || '',
            walletBalance: userData.wallet?.balance ?? 0
          });
        }

        // Fetch fresh data from API
        const response = await userAuthService.getProfile();
        if (response.success && response.user) {
          authStorage.updateUserData('user', response.user);
          setUserProfile({
            name: response.user.name || 'Verified Farmer',
            phone: response.user.phone || '',
            email: response.user.email || '',
            isPhoneVerified: response.user.isPhoneVerified || false,
            isEmailVerified: response.user.isEmailVerified || false,
            profilePhoto: response.user.profilePhoto || '',
            walletBalance: response.user.wallet?.balance ?? 0,
            plans: response.user.plans
          });
        }
      } catch (error) {
        // Use session data if API fails
        const userData = authStorage.getUserData('user');
        if (userData) {
          setUserProfile({
            name: userData.name || 'Verified Farmer',
            phone: userData.phone || '',
            email: userData.email || '',
            isPhoneVerified: userData.isPhoneVerified || false,
            isEmailVerified: userData.isEmailVerified || false
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Fetch support unread count
  useEffect(() => {
    const fetchSupportUnread = async () => {
      try {
        const res = await api.get('/support/unread-count');
        if (res.data?.success) {
          setSupportUnreadCount(res.data.unreadCount || 0);
        }
      } catch (err) {
        // Non-blocking
      }
    };
    fetchSupportUnread();
  }, []);

  // Listen for real-time wallet balance updates
  useEffect(() => {
    if (!socket) return;

    const handleWalletUpdate = (data) => {
      if (data && data.balance !== undefined) {
        setUserProfile(prev => ({
          ...prev,
          walletBalance: data.balance
        }));
      }
    };

    socket.on('wallet_balance_updated', handleWalletUpdate);
    socket.on('wallet_updated', handleWalletUpdate);

    return () => {
      socket.off('wallet_balance_updated', handleWalletUpdate);
      socket.off('wallet_updated', handleWalletUpdate);
    };
  }, [socket]);

  // Format phone number for display
  const formatPhoneNumber = (phone) => {
    if (!phone) return '';
    if (phone.startsWith('+91')) return phone;
    if (phone.length === 10) return `+91 ${phone}`;
    return phone;
  };

  // Get initials for avatar
  const getInitials = () => {
    if (userProfile.name && userProfile.name !== 'Verified Farmer') {
      const names = userProfile.name.split(' ');
      if (names.length >= 2) {
        return (names[0][0] + names[1][0]).toUpperCase();
      }
      return names[0][0].toUpperCase();
    }
    if (userProfile.phone) {
      return userProfile.phone.slice(-2);
    }
    return 'VF';
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await userAuthService.logout();
      toastManager.success('Logged out successfully');
      navigate('/user/login');
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userData');
      toastManager.success('Logged out successfully');
      navigate('/user/login');
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  const MenuItem = ({ icon: Icon, label, onClick, color = 'text-slate-800', iconBg = 'bg-slate-100 text-slate-600', badge, subtitle }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3.5 sm:p-4 hover:bg-slate-50/80 transition-colors text-left group"
    >
      <div className="flex items-center gap-3.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${iconBg}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div>
          <span className={`font-bold text-xs sm:text-sm block ${color}`}>{label}</span>
          {subtitle && <span className="text-[11px] text-slate-400 font-medium">{subtitle}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-bold rounded-full border border-rose-200/60">
            {badge}
          </span>
        )}
        <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 relative bg-white">
      {/* Refined Brand Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#347989'}25 0%, transparent 70%),
              radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#D68F35'}20 0%, transparent 70%),
              radial-gradient(at 100% 100%, ${themeColors?.brand?.orange || '#BB5F36'}15 0%, transparent 75%),
              radial-gradient(at 0% 100%, ${themeColors?.brand?.teal || '#347989'}10 0%, transparent 70%),
              radial-gradient(at 50% 50%, ${themeColors?.brand?.teal || '#347989'}03 0%, transparent 100%),
              #FFFFFF
            `
          }}
        />
        {/* Elegant Dot Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(${themeColors?.brand?.teal || '#347989'} 0.8px, transparent 0.8px)`,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Premium Transparent Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/40 border-b border-black/[0.03] px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate(-1)}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/[0.02]"
            >
              <FiArrowLeft className="w-5 h-5 text-gray-800" />
            </motion.button>
            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Account</h1>
          </div>
          <NotificationBell />
        </header>

        <motion.main
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="px-4 pt-4 max-w-lg mx-auto"
        >
          {/* Profile Hero Card */}
          <motion.div
            variants={itemVariants}
            className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-2xl p-4 sm:p-5 text-white shadow-lg relative overflow-hidden border border-emerald-500/25 mb-4"
          >
            {/* Ambient decorative glow */}
            <div className="absolute -top-12 -right-12 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-emerald-400/15 rounded-full blur-xl pointer-events-none" />

            <div className="flex items-center gap-3.5 relative z-10">
              <div className="relative shrink-0">
                <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-white/20 border-2 border-white/60 p-0.5 flex items-center justify-center shadow-md backdrop-blur-md overflow-hidden">
                  {userProfile.profilePhoto ? (
                    <img
                      src={userProfile.profilePhoto}
                      alt={userProfile.name}
                      className="w-full h-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-xl flex items-center justify-center text-white font-black text-xl bg-white/15">
                      {getInitials()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => navigate('/user/update-profile')}
                  className="absolute -bottom-1 -right-1 p-1 bg-white text-emerald-800 rounded-lg shadow-sm border border-emerald-100 hover:scale-105 active:scale-95 transition-transform"
                  title="Update Photo"
                >
                  <FiEdit3 className="w-3 h-3" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-white capitalize truncate leading-tight">
                    {userProfile.name}
                  </h2>
                  <button
                    onClick={() => navigate('/user/update-profile')}
                    className="px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-xs backdrop-blur-md shrink-0"
                  >
                    <span>Edit</span>
                    <FiChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-emerald-100/90 text-xs font-medium mt-0.5">
                  {userProfile.phone ? formatPhoneNumber(userProfile.phone) : 'No phone linked'}
                </p>

                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-100 bg-white/15 px-2 py-0.5 rounded-full border border-white/20">
                    <FiShield className="w-3 h-3 text-emerald-200" />
                    <span>Verified AgroYilt Member</span>
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions Grid (Harmonious Dual Cards) */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 mb-4">
            {/* Wallet Balance Card */}
            <button
              onClick={() => navigate('/user/wallet')}
              className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs hover:border-slate-200 hover:shadow-sm transition-all text-left group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <MdAccountBalanceWallet className="w-4.5 h-4.5" />
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                  Wallet
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Available</span>
              <p className={`text-base sm:text-lg font-black mt-0.5 tracking-tight ${
                userProfile.walletBalance < 0 ? 'text-rose-600' : 'text-slate-900'
              }`}>
                ₹{Math.abs(userProfile.walletBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[11px] font-bold text-emerald-700 group-hover:text-emerald-800 flex items-center gap-0.5 mt-1">
                <span>Passbook & Top-up</span>
                <FiChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>

            {/* Refer & Earn Card */}
            <button
              onClick={() => navigate('/user/rewards')}
              className="bg-gradient-to-br from-amber-50 to-orange-50/60 p-3.5 rounded-2xl border border-amber-200/60 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all text-left group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                  <FiGift className="w-4.5 h-4.5" />
                </div>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded">
                  Earn ₹50
                </span>
              </div>
              <span className="text-[10px] text-amber-700/80 font-bold uppercase tracking-wider block">Rewards</span>
              <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5 tracking-tight">
                Refer & Earn
              </p>
              <span className="text-[11px] font-bold text-amber-700 group-hover:text-amber-800 flex items-center gap-0.5 mt-1">
                <span>Invite Friends</span>
                <FiChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>
          </motion.div>

          {/* Group 1: Bookings & Activity */}
          <motion.div variants={itemVariants} className="mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Activity</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
              <MenuItem
                icon={FiShoppingBag}
                iconBg="bg-emerald-50 text-emerald-700"
                label="My Bookings"
                subtitle="Track current & past machine bookings"
                onClick={() => navigate('/user/my-bookings')}
              />
              <MenuItem
                icon={FiStar}
                iconBg="bg-amber-50 text-amber-600"
                label="My Ratings"
                subtitle="Reviews given to operators & equipment"
                onClick={() => navigate('/user/my-rating')}
              />
              <MenuItem
                icon={FiLayers}
                iconBg="bg-teal-50 text-teal-700"
                label="Land Lease & Theka (भूमि पट्टा)"
                subtitle="Farmland rental listings, offers & records"
                onClick={() => navigate('/user/land-lease')}
              />
            </div>
          </motion.div>

          {/* Group 2: Finance & Passbook */}
          <motion.div variants={itemVariants} className="mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Finance & Passbook</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
              <MenuItem
                icon={MdAccountBalanceWallet}
                iconBg="bg-teal-50 text-teal-700"
                label="Wallet Passbook & History"
                subtitle="View statements, refunds & top-ups"
                onClick={() => navigate('/user/wallet/history')}
              />
              <MenuItem
                icon={FiCreditCard}
                iconBg="bg-blue-50 text-blue-700"
                label="Bank Account & Payout Details"
                subtitle="Linked accounts for refund withdrawals"
                onClick={() => setShowBankModal(true)}
              />
            </div>
          </motion.div>

          {/* Group 3: Preferences */}
          <motion.div variants={itemVariants} className="mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Preferences</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
              <MenuItem
                icon={FiMapPin}
                iconBg="bg-purple-50 text-purple-700"
                label="Manage Addresses"
                subtitle="Delivery and farm location points"
                onClick={() => navigate('/user/manage-addresses')}
              />
              <MenuItem
                icon={FiSettings}
                iconBg="bg-slate-100 text-slate-700"
                label="Settings"
                subtitle="Security, notifications & preferences"
                onClick={() => navigate('/user/settings')}
              />
            </div>
          </motion.div>

          {/* Group 4: Support & Account */}
          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Support & Account</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
              <MenuItem
                icon={FiHeadphones}
                iconBg="bg-cyan-50 text-cyan-700"
                label="Help & Support"
                subtitle="Chat with support team"
                badge={supportUnreadCount > 0 ? `${supportUnreadCount} New` : null}
                onClick={() => navigate('/user/help-support')}
              />
              <MenuItem
                icon={FiShield}
                iconBg="bg-emerald-50 text-emerald-700"
                label="About AgroYilt"
                subtitle="App info, policies & terms"
                onClick={() => navigate('/user/about-groo')}
              />
              <MenuItem
                icon={FiLogOut}
                iconBg="bg-rose-50 text-rose-600"
                label="Log Out"
                color="text-rose-600"
                onClick={() => setShowLogoutModal(true)}
              />
            </div>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full mt-3 py-2 text-center text-xs font-bold text-rose-400 hover:text-rose-600 transition-colors"
            >
              Delete Account Permanently
            </button>
          </motion.div>

          <motion.div variants={itemVariants} className="text-center pb-8">
            <p className="text-xs font-medium text-gray-400">Version 7.6.27 R547</p>
          </motion.div>

        </motion.main>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
              <FiTrash2 className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center mb-2">Delete Account?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Yeh action permanent hai. Aapka account aur saara data delete ho jayega.
              Is number se dobara login karne ke liye aapko <strong>nayi registration</strong> karni padegi.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    const response = await userAuthService.deleteAccount();
                    if (response.success) {
                      toastManager.success('Account deleted successfully.');
                      navigate('/user/login', { replace: true });
                    } else {
                      toastManager.error(response.message || 'Failed to delete account.');
                      setIsDeleting(false);
                      setShowDeleteConfirm(false);
                    }
                  } catch (error) {
                    toastManager.error('Failed to delete account. Please try again.');
                    setIsDeleting(false);
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={isDeleting}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all disabled:opacity-60"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        userName={userProfile?.name}
        role="Farmer"
      />
    </div>
  );
};

export default Account;
