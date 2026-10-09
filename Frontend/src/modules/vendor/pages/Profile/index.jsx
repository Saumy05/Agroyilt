import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiEdit2, FiMapPin, FiPhone, FiMail, FiBriefcase, FiStar, FiArrowRight, FiSettings, FiChevronRight, FiCreditCard, FiLogOut, FiTrash2, FiClock, FiCheckCircle, FiPackage, FiActivity, FiGift, FiX, FiHelpCircle, FiShield } from 'react-icons/fi';
import { FaWallet, FaTractor } from 'react-icons/fa';
import { toastManager } from '../../../../utils/toastManager';
import { vendorTheme as themeColors } from '../../../../theme';
import { vendorAuthService } from '../../../../services/authService';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import LogoLoader from '../../../../components/common/LogoLoader';
import vendorProductService from '../../services/vendorProductService';
import BankDetailsSection from '../../../../components/common/BankDetailsSection';
import LogoutModal from '../../../../components/common/LogoutModal';
import authStorage from '../../../../utils/authStorage';

const Profile = () => {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasOutOfStockProducts, setHasOutOfStockProducts] = useState(false);

  const menuItems = React.useMemo(() => [
    { id: 'bank_details', label: 'Bank Account & Payout Details', icon: FiCreditCard, path: '/vendor/bank-details' },
    { id: 'equipment', label: 'Machinery & Equipment Fleet', icon: FaTractor, path: '/vendor/equipment' },
    { id: 12, label: 'My Agri-Store (Supplies)', icon: FiPackage, path: '/vendor/store' },
    { id: 'referrals', label: 'Refer & Earn', icon: FiGift, path: '/vendor/referrals' },
    { id: 14, label: 'Business Profile & Registrations', icon: FiBriefcase, path: '/vendor/business-details' },
    { id: 5, label: 'My Ratings', icon: FiStar, path: '/vendor/my-ratings' },
    { id: 7, label: 'Manage Address', icon: FiMapPin, path: '/vendor/address-management' },
    { id: 8, label: 'Settings', icon: FiSettings, path: '/vendor/settings' },
    { id: 10, label: 'Maintenance Calendar', icon: FiClock, path: '/vendor/maintenance' },
    { id: 11, label: 'Legal Compliance', icon: FiCheckCircle, path: '/vendor/compliance' },
    { id: 13, label: 'Soil Test Requests', icon: FiActivity, path: '/vendor/soil-tests' },
    { id: 'help_support', label: 'Help & Support', icon: FiHelpCircle, path: '/vendor/help-support' },
    { id: 9, label: 'About Agroyilt', icon: null, customIcon: 'G', path: '/vendor/about-groo' },
  ], [profile, hasOutOfStockProducts]);

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
      // Load from tab-isolated session storage first for immediate display
      const storedVendorData = authStorage.getUserData('vendor') || {};
      if (storedVendorData && Object.keys(storedVendorData).length > 0) {
        setProfile({
          name: storedVendorData.name || 'Vendor Name',
          businessName: storedVendorData.businessName || null,
          phone: storedVendorData.phone || '',
          email: storedVendorData.email || '',
          address: storedVendorData.address ?
            (typeof storedVendorData.address === 'string' ? storedVendorData.address :
              `${storedVendorData.address.addressLine1 || ''} ${storedVendorData.address.addressLine2 || ''} ${storedVendorData.address.city || ''} ${storedVendorData.address.state || ''} ${storedVendorData.address.pincode || ''}`.trim() || 'Not set')
            : 'Not set',
          rating: storedVendorData.rating || 0,
          totalJobs: storedVendorData.totalJobs || 0,
          completionRate: storedVendorData.completionRate || 0,
          serviceCategory: storedVendorData.service || '',
          skills: [],
          photo: storedVendorData.profilePhoto || null,
          approvalStatus: storedVendorData.approvalStatus,
          isPhoneVerified: storedVendorData.isPhoneVerified || false,
          isEmailVerified: storedVendorData.isEmailVerified || false,
          shopDetails: storedVendorData.shopDetails || null
        });
        setIsLoading(false); // Show content immediately
      }

      setError(null);
      try {
        const response = await vendorAuthService.getProfile();
        if (response.success) {
          const vendorData = response.vendor;
          // Format address
          const addressString = vendorData.address
            ? (typeof vendorData.address === 'string' ? vendorData.address :
              `${vendorData.address.addressLine1 || ''} ${vendorData.address.addressLine2 || ''} ${vendorData.address.city || ''} ${vendorData.address.state || ''} ${vendorData.address.pincode || ''}`.trim() || 'Not set')
            : 'Not set';

          setProfile({
            name: vendorData.name || 'Vendor Name',
            businessName: vendorData.businessName || null,
            phone: vendorData.phone || '',
            email: vendorData.email || '',
            address: addressString,
            rating: vendorData.rating || 0,
            totalJobs: vendorData.totalJobs || 0,
            completionRate: vendorData.completionRate || 0,
            serviceCategory: vendorData.service || '',
            skills: [],
            photo: vendorData.profilePhoto || null,
            approvalStatus: vendorData.approvalStatus,
            isPhoneVerified: vendorData.isPhoneVerified || false,
            isEmailVerified: vendorData.isEmailVerified || false,
            shopDetails: vendorData.shopDetails || null
          });
          authStorage.updateUserData('vendor', vendorData);
        } else {
          if (!storedVendorData || Object.keys(storedVendorData).length === 0) {
            setError(response.message || 'Failed to fetch profile');
            toastManager.error(response.message || 'Failed to fetch profile');
          }
        }
      } catch (err) {
        console.error('Error fetching vendor profile:', err);
        if (!storedVendorData || Object.keys(storedVendorData).length === 0) {
          setError(err.response?.data?.message || 'Failed to fetch profile');
          toastManager.error(err.response?.data?.message || 'Failed to fetch profile');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
    window.addEventListener('vendorDataUpdated', fetchProfile);
    window.addEventListener('vendorProfileUpdated', fetchProfile);

    return () => {
      window.removeEventListener('vendorDataUpdated', fetchProfile);
      window.removeEventListener('vendorProfileUpdated', fetchProfile);
    };
  }, []);

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

      <main className="px-4 pt-3 pb-8 max-w-lg mx-auto">
        {/* Profile Hero Card */}
        <div
          onClick={() => navigate('/vendor/profile/details')}
          className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-2xl p-4 sm:p-5 text-white shadow-lg relative overflow-hidden border border-emerald-500/25 cursor-pointer group active:scale-[0.99] transition-all mb-3.5"
        >
          {/* Ambient Decorative Glow */}
          <div className="absolute -top-12 -right-12 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-emerald-400/15 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center gap-3.5">
              {/* Profile Photo with Rating Below */}
              <div className="flex flex-col items-center shrink-0">
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
                {profile.rating > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 mt-1.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/20">
                    <FiStar className="w-3 h-3 text-yellow-300 fill-yellow-300" />
                    <span className="text-[10.5px] font-bold text-white">{profile.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* Name & Contact Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base sm:text-lg font-black text-white leading-tight capitalize truncate">
                    {profile.businessName || profile.name}
                  </h2>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/vendor/profile/details');
                    }}
                    className="p-1 sm:px-2.5 sm:py-1 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-xs backdrop-blur-md shrink-0"
                    title="View Profile Details"
                  >
                    <span className="hidden sm:inline">Details</span>
                    <FiChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {profile.businessName && profile.businessName !== profile.name && (
                  <p className="text-emerald-100/90 text-xs font-medium truncate mt-0.5">{profile.name}</p>
                )}

                {/* Contact Pill Row */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {profile.phone && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-100 bg-white/15 px-2 py-0.5 rounded-lg border border-white/15">
                      <FiPhone className="w-3 h-3 text-emerald-200 shrink-0" />
                      <span>{profile.phone}</span>
                    </span>
                  )}
                  {profile.email && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-100 bg-white/15 px-2 py-0.5 rounded-lg border border-white/15 truncate max-w-[180px]" title={profile.email}>
                      <FiMail className="w-3 h-3 text-emerald-200 shrink-0" />
                      <span className="truncate">{profile.email}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Out of Stock Alert Banner */}
        {hasOutOfStockProducts && (
          <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3 shadow-xs mb-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500 flex items-center justify-center text-white shrink-0">
              <FiPackage className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[11px] font-black text-rose-800 uppercase tracking-wider">Product Out of Stock</h4>
              <p className="text-[10px] font-bold text-rose-500 mt-0.5 leading-snug">One or more items in your store are out of stock.</p>
            </div>
            <button onClick={() => navigate('/vendor/store')} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[9px] font-black rounded-lg uppercase tracking-wider transition-all shrink-0">
              Update
            </button>
          </div>
        )}

        {/* Three Hub Shortcuts - Horizontal */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <button
            onClick={() => navigate('/vendor/jobs')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl active:scale-95 transition-all duration-200 relative overflow-hidden bg-white shadow-xs border border-slate-100 hover:border-slate-200 group"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 bg-emerald-50 text-emerald-700 group-hover:scale-105 transition-transform">
              <FiBriefcase className="w-4.5 h-4.5" />
            </div>
            <span className="text-[11px] font-bold text-slate-800 text-center leading-tight">
              Field Operations
            </span>
          </button>

          <button
            onClick={() => navigate('/vendor/wallet')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl active:scale-95 transition-all duration-200 relative overflow-hidden bg-white shadow-xs border border-slate-100 hover:border-slate-200 group"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 bg-teal-50 text-teal-700 group-hover:scale-105 transition-transform">
              <FaWallet className="w-4.5 h-4.5" />
            </div>
            <span className="text-[11px] font-bold text-slate-800 text-center leading-tight">
              Wallet
            </span>
          </button>

          <button
            onClick={() => navigate('/vendor/equipment')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl active:scale-95 transition-all duration-200 relative overflow-hidden bg-white shadow-xs border border-slate-100 hover:border-slate-200 group"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 bg-amber-50 text-amber-700 group-hover:scale-105 transition-transform">
              <FaTractor className="w-4.5 h-4.5" />
            </div>
            <span className="text-[11px] font-bold text-slate-800 text-center leading-tight">
              Equipment Fleet
            </span>
          </button>
        </div>

        {/* Group 1: Fleet & Agri-Store Operations */}
        <div className="mb-3.5">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Fleet & Store</h3>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
            <button
              onClick={() => navigate('/vendor/equipment')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FaTractor className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Machinery & Equipment Fleet</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Manage tractors, harvesters & operators</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/store')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiPackage className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">My Agri-Store (Supplies)</span>
                    {hasOutOfStockProducts && (
                      <span className="animate-pulse bg-rose-500 text-white text-[8.5px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 shadow-xs">
                        Out of Stock
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Sell seeds, fertilizers, feeds & tools</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/maintenance')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiClock className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Maintenance Calendar</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Service schedules, oil changes & fitness</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/soil-tests')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiActivity className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Soil Test Requests</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Farmer soil sampling & health reports</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>
          </div>
        </div>

        {/* Group 2: Finance & Settlements */}
        <div className="mb-3.5">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Finance & Settlements</h3>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
            <button
              onClick={() => navigate('/vendor/wallet/settlements')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FaWallet className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Wallet Settlements & History</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Earnings passbook, dues & daily payouts</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/bank-details')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiCreditCard className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Bank Account & Payout Details</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Manage bank account for earnings transfer</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/referrals')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiGift className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Refer & Earn</span>
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded uppercase">Reward</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Invite fellow vendors & farmers for bonuses</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>
          </div>
        </div>

        {/* Group 3: Business & Compliance */}
        <div className="mb-3.5">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Business & KYC</h3>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
            <button
              onClick={() => navigate('/vendor/business-details')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiBriefcase className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Business Profile & Registrations</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">GSTIN, business registration & trade details</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/compliance')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiCheckCircle className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Legal Compliance</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Platform partner verification & legal checks</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/address-management')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiMapPin className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Manage Address & Base</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Machinery yard and workshop location</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/my-ratings')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-yellow-50 text-yellow-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiStar className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">My Ratings & Reviews</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Farmer customer ratings and feedback</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>
          </div>
        </div>

        {/* Group 4: Settings & Support */}
        <div className="mb-6">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Settings & Support</h3>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
            <button
              onClick={() => navigate('/vendor/settings')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiSettings className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Settings</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Security, password & app notifications</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/help-support')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiHelpCircle className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">Help & Support</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Dedicated 24/7 AgroYilt partner helpline</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              onClick={() => navigate('/vendor/about-groo')}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiShield className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs sm:text-sm text-slate-800 block truncate">About AgroYilt</span>
                  <span className="text-[11px] text-slate-400 font-medium block truncate">Platform terms, privacy & partner guidelines</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowLogoutModal(true);
              }}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-rose-50/50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FiLogOut className="w-4.5 h-4.5" />
                </div>
                <span className="font-bold text-xs sm:text-sm text-rose-600">Logout</span>
              </div>
              <FiChevronRight className="w-4 h-4 text-rose-400 shrink-0" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full mt-3 py-2 text-center text-xs font-bold text-rose-400 hover:text-rose-600 transition-colors"
          >
            Delete Account Permanently
          </button>
        </div>
      </main>

      <BottomNav />

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
              <FiTrash2 className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center mb-2">Delete Account?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Yeh action permanent hai. Aapka vendor account aur saara data delete ho jayega.
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
                    const response = await vendorAuthService.deleteAccount();
                    if (response.success) {
                      toastManager.success('Account deleted successfully.');
                      navigate('/vendor/login', { replace: true });
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
        onConfirm={async () => {
          setIsLoggingOut(true);
          try {
            await vendorAuthService.logout();
            toastManager.success('Logged out successfully');
            navigate('/vendor/login');
          } catch (error) {
            localStorage.removeItem('vendorAccessToken');
            localStorage.removeItem('vendorRefreshToken');
            localStorage.removeItem('vendorData');
            toastManager.success('Logged out successfully');
            navigate('/vendor/login');
          } finally {
            setIsLoggingOut(false);
            setShowLogoutModal(false);
          }
        }}
        isLoading={isLoggingOut}
        userName={profile?.businessName || profile?.name}
        role="Vendor"
      />
    </div>
  );
};

export default Profile;

