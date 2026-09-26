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
  FiX
} from 'react-icons/fi';
import { MdAccountBalanceWallet } from 'react-icons/md';
import NotificationBell from '../../components/common/NotificationBell';
import { useSocket } from '../../../../context/SocketContext';
import authStorage from '../../../../utils/authStorage';
import BankDetailsSection from '../../../../components/common/BankDetailsSection';
import api from '../../../../services/api';

const Account = () => {
  const navigate = useNavigate();
  const socket = useSocket();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
    }
  };

  const MenuItem = ({ icon: Icon, label, onClick, color = "text-gray-900", badge }) => (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group mb-3"
      style={{ '--hover-border': `${themeColors.brand.teal}30` }}
    >
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors`}
          style={{
            backgroundColor: color === 'text-red-500' ? '#FEF2F2' : '#F8FAFC',
            color: color === 'text-red-500' ? '#EF4444' : 'inherit'
          }}
          onMouseEnter={(e) => {
            if (color !== 'text-red-500') e.currentTarget.style.backgroundColor = `${themeColors.brand.teal}15`;
          }}
          onMouseLeave={(e) => {
            if (color !== 'text-red-500') e.currentTarget.style.backgroundColor = '#F8FAFC';
          }}
        >
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <span className={`font-semibold ${color}`}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">
            {badge}
          </span>
        )}
        <FiChevronRight className="w-5 h-5 text-gray-300 group-hover:text-teal-500 transition-colors" />
      </div>
    </motion.button>
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
          className="px-4 pt-6 max-w-lg mx-auto"
        >
          {/* Elevated Profile Card */}
          <motion.div
            variants={itemVariants}
            className="bg-white rounded-[28px] p-5 shadow-[0_32px_64px_-16px_rgba(52₹21₹37,0.15)] mb-8 relative overflow-hidden border border-white"
          >
            {/* Vivid Brand Accents */}
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full -mr-20 -mt-20 blur-3xl opacity-[0.2]"
              style={{ backgroundColor: themeColors.brand.yellow }}
            ></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full -ml-24 -mb-24 blur-3xl opacity-[0.2]"
              style={{ backgroundColor: themeColors.brand.teal }}
            ></div>

            <div className="flex items-center gap-4 relative z-10">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl p-1 bg-white shadow-xl rotate-2">
                  {userProfile.profilePhoto ? (
                    <img
                      src={userProfile.profilePhoto}
                      alt={userProfile.name}
                      className="w-full h-full rounded-[14px] object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-[14px] flex items-center justify-center text-white font-black text-2xl"
                      style={{ background: themeColors.gradient }}>
                      {getInitials()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => navigate('/user/update-profile')}
                  className="absolute -bottom-1 -right-1 p-1.5 bg-gray-900 text-white rounded-[8px] border-2 border-white shadow-lg active:scale-95 transition-transform"
                >
                  <FiEdit3 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-black text-gray-900 truncate mb-1">
                  {userProfile.name}
                </h2>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">
                    {userProfile.phone ? formatPhoneNumber(userProfile.phone) : 'No phone linked'}
                  </p>
                </div>
                <button
                  onClick={() => navigate('/user/update-profile')}
                  className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-wider rounded-xl transition-colors"
                >
                  Edit Profile
                </button>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions Grid */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => navigate('/user/wallet')}
              className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"
                style={{ backgroundColor: `${themeColors.brand.teal}15`, color: themeColors.brand.teal }}
              >
                <MdAccountBalanceWallet className="w-5 h-5" />
              </div>
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Balance</span>
              <p className={`text-lg font-black mt-0.5 ${userProfile.walletBalance < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                ₹{Math.abs(userProfile.walletBalance || 0).toLocaleString('en-IN')}
                {userProfile.walletBalance < 0 && <span className="text-xs font-normal ml-1">(Penalty)</span>}
              </p>
            </button>
            <button
              onClick={() => navigate('/user/rewards')}
              className="bg-gray-900 p-4 rounded-3xl shadow-lg shadow-gray-200 hover:shadow-xl transition-all text-left relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black opacity-50"></div>
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div className="w-10 h-10 bg-white/10 text-yellow-400 rounded-2xl flex items-center justify-center mb-3 backdrop-blur-sm group-hover:scale-110 transition-transform">
                  <FiGift className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-white/60 font-bold uppercase tracking-wider">Rewards</span>
                  <p className="text-lg font-black text-white mt-0.5">Refer & Earn</p>
                </div>
              </div>
            </button>
          </motion.div>

          {/* Activity */}
          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pl-2">Activity</h3>
            <MenuItem
              icon={FiClipboard}
              label="My Bookings"
              onClick={() => navigate('/user/my-bookings')}
            />
            <MenuItem
              icon={FiStar}
              label="My Ratings"
              onClick={() => navigate('/user/my-rating')}
            />
          </motion.div>

          {/* Finance & Payouts */}
          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pl-2">Finance & Payouts</h3>
            <MenuItem
              icon={FiCreditCard}
              label="Bank Account & Payout Details"
              onClick={() => setShowBankModal(true)}
            />
            <MenuItem
              icon={MdAccountBalanceWallet}
              label="Wallet & History"
              onClick={() => navigate('/user/wallet')}
            />
          </motion.div>

          {/* Preferences */}
          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pl-2">Preferences</h3>
            <MenuItem
              icon={FiMapPin}
              label="Manage Addresses"
              onClick={() => navigate('/user/manage-addresses')}
            />

            <MenuItem
              icon={FiSettings}
              label="Settings"
              onClick={() => navigate('/user/settings')}
            />
          </motion.div>

          {/* Support & Legal */}
          <motion.div variants={itemVariants} className="mb-8">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pl-2">Support & More</h3>
            <MenuItem
              icon={FiHeadphones}
              label="Help & Support"
              badge={supportUnreadCount > 0 ? `${supportUnreadCount} New` : null}
              onClick={() => navigate('/user/help-support')}
            />
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/user/about-groo')}
              className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group mb-3"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 transition-colors group-hover:bg-opacity-80"
                  style={{ color: themeColors.brand.teal }}>
                  <span className="font-bold">G</span>
                </div>
                <span className="font-semibold text-gray-900">About Agroyilt</span>
              </div>
              <FiChevronRight className="w-5 h-5 text-gray-300 group-hover:text-teal-500 transition-colors" />
            </motion.button>
            <div className="h-4"></div>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 p-4 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-red-200 transition-all mb-3"
            >
              <FiLogOut className="w-5 h-5" />
              <span>Log out</span>
            </motion.button>

            {/* Delete Account Button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 p-4 bg-white border-2 border-red-300 text-red-500 font-black uppercase tracking-wider rounded-2xl transition-all hover:bg-red-50"
            >
              <FiTrash2 className="w-5 h-5" />
              <span>Delete Account</span>
            </motion.button>
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
    </div>
  );
};

export default Account;
