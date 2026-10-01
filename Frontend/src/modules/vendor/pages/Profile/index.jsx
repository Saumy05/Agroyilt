import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiEdit2, FiMapPin, FiPhone, FiMail, FiBriefcase, FiStar, FiArrowRight, FiSettings, FiChevronRight, FiCreditCard, FiLogOut, FiTrash2, FiClock, FiCheckCircle, FiPackage, FiActivity, FiGift, FiX, FiHelpCircle } from 'react-icons/fi';
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
    { id: 'bank_details', label: 'Bank Account & Payout Details', icon: FiCreditCard, onClick: () => setShowBankModal(true) },
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
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Profile" />

      <main className="px-4 pt-3 pb-8 max-w-lg mx-auto space-y-3">
        {/* Profile Header Card with Phone & Email */}
        <div
          onClick={() => navigate('/vendor/profile/details')}
          className="rounded-2xl p-4 shadow-sm relative overflow-hidden cursor-pointer group active:scale-[0.99] transition-all duration-300"
          style={{
            background: themeColors.button,
            border: `1.5px solid ${themeColors.button}`,
            boxShadow: `0 6px 20px ${hexToRgba(themeColors.button, 0.25)}`,
          }}
        >
          {/* Decorative Patterns */}
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10"
            style={{
              background: `radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, transparent 70%)`,
              transform: 'translate(30px, -30px)',
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-8"
            style={{
              background: `radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%)`,
              transform: 'translate(-20px, 20px)',
            }}
          />

          <div className="relative z-10">
            <div className="flex items-center gap-3.5">
              {/* Profile Photo - Circle with Rating Below */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className="rounded-full flex items-center justify-center overflow-hidden"
                  style={{
                    background: 'rgba(255, 255, 255, 0.35)',
                    backdropFilter: 'blur(15px)',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2), inset 0 2px 4px rgba(255, 255, 255, 0.5)',
                    border: '2.5px solid rgba(255, 255, 255, 0.6)',
                    width: '64px',
                    height: '64px',
                  }}
                >
                  {profile.photo ? (
                    <img
                      src={profile.photo}
                      alt={profile.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FiUser className="w-8 h-8 text-white" />
                  )}
                </div>
                {/* Star Rating Below Photo */}
                {profile.rating > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 mt-1 rounded-full bg-white/25 backdrop-blur-sm">
                    <FiStar className="w-3 h-3 text-yellow-300" style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))' }} />
                    <span className="text-[11px] font-bold text-white">{profile.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* Name and Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <h2 className="text-base font-bold text-white leading-tight truncate">{profile.name}</h2>
                {profile.businessName && profile.businessName !== profile.name && (
                  <p className="text-white/90 text-xs mt-0.5 font-medium truncate">{profile.businessName}</p>
                )}

                {/* Phone and Email */}
                <div className="space-y-1 mt-1.5">
                  {profile.phone && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="p-1 rounded-md bg-white/15 backdrop-blur-sm flex-shrink-0">
                        <FiPhone className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-xs text-white/95 font-medium truncate">{profile.phone}</span>
                    </div>
                  )}
                  {profile.email && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="p-1 rounded-md bg-white/15 backdrop-blur-sm flex-shrink-0">
                        <FiMail className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-[11px] text-white/95 font-medium truncate" title={profile.email}>{profile.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Arrow Button Visual Cue */}
              <div
                className="p-2.5 rounded-xl flex-shrink-0 transition-all duration-300 group-hover:scale-105 group-hover:translate-x-0.5 self-center"
                style={{
                  background: 'rgba(255, 255, 255, 0.25)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                }}
              >
                <FiArrowRight className="w-4.5 h-4.5 text-white" style={{ fontWeight: 'bold' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Out of Stock Alert Banner */}
        {hasOutOfStockProducts && (
          <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-rose-500 flex items-center justify-center text-white flex-shrink-0">
              <FiPackage className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[11px] font-black text-rose-800 uppercase tracking-wider">Product Out of Stock</h4>
              <p className="text-[10px] font-bold text-rose-500 mt-0.5 leading-snug">One or more items in your store are out of stock.</p>
            </div>
            <button onClick={() => navigate('/vendor/store')} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[9px] font-black rounded-lg uppercase tracking-wider transition-all flex-shrink-0">
              Update
            </button>
          </div>
        )}

        {/* Three Cards Section - Horizontal */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Active Jobs */}
          <button
            onClick={() => navigate('/vendor/jobs')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl active:scale-95 transition-all duration-200 relative overflow-hidden bg-white shadow-xs border border-gray-100 hover:shadow-sm"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center mb-1.5"
              style={{
                backgroundColor: hexToRgba(themeColors.button, 0.1),
              }}
            >
              <FiBriefcase className="w-4.5 h-4.5" style={{ color: themeColors.button }} />
            </div>
            <span className="text-[11px] font-bold text-gray-800 text-center leading-tight">
              Field Operations
            </span>
          </button>

          {/* Wallet */}
          <button
            onClick={() => navigate('/vendor/wallet')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl active:scale-95 transition-all duration-200 relative overflow-hidden bg-white shadow-xs border border-gray-100 hover:shadow-sm"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center mb-1.5"
              style={{
                backgroundColor: hexToRgba(themeColors.button, 0.1),
              }}
            >
              <FaWallet className="w-4.5 h-4.5" style={{ color: themeColors.button }} />
            </div>
            <span className="text-[11px] font-bold text-gray-800 text-center leading-tight">
              Wallet
            </span>
          </button>

          {/* Machinery Fleet */}
          <button
            onClick={() => navigate('/vendor/equipment')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl active:scale-95 transition-all duration-200 relative overflow-hidden bg-white shadow-xs border border-gray-100 hover:shadow-sm"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center mb-1.5"
              style={{
                backgroundColor: hexToRgba(themeColors.button, 0.1),
              }}
            >
              <FaTractor className="w-4.5 h-4.5" style={{ color: themeColors.button }} />
            </div>
            <span className="text-[11px] font-bold text-gray-800 text-center leading-tight">
              Equipment Fleet
            </span>
          </button>
        </div>

        {/* Menu List Section */}
        <div className="space-y-2">
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.onClick) {
                    item.onClick();
                  } else if (item.path) {
                    navigate(item.path);
                  }
                }}
                className="w-full flex items-center justify-between p-3.5 bg-white rounded-2xl shadow-xs border border-gray-100/90 hover:border-teal-200 hover:shadow-xs transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-3.5">
                  {item.customIcon ? (
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: hexToRgba(themeColors.button, 0.1),
                        border: `1px solid ${hexToRgba(themeColors.button, 0.15)}`,
                      }}
                    >
                      <span className="text-sm font-bold" style={{ color: themeColors.button }}>{item.customIcon}</span>
                    </div>
                  ) : (
                    IconComponent && (
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative"
                        style={{ backgroundColor: hexToRgba(themeColors.button, 0.1) }}
                      >
                        <IconComponent className="w-5 h-5" style={{ color: themeColors.button }} />
                        {item.id === 12 && hasOutOfStockProducts && (
                          <>
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white shadow-sm animate-ping" style={{ animationDuration: '1.5s' }} />
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white shadow-sm" />
                          </>
                        )}
                      </div>
                    )
                  )}
                  <span className="text-sm font-semibold text-gray-800 text-left flex items-center gap-2">
                    {item.label}
                    {item.id === 12 && hasOutOfStockProducts && (
                      <span className="animate-pulse bg-rose-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm shadow-rose-500/20">
                        Out of Stock
                      </span>
                    )}
                  </span>
                </div>
                <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                  <FiChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Buttons: Logout & Delete */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowLogoutModal(true);
            }}
            className="w-full font-bold text-sm py-3 rounded-xl active:scale-[0.98] transition-all text-white flex items-center justify-center gap-2 cursor-pointer bg-red-500 hover:bg-red-600 shadow-sm"
          >
            <FiLogOut className="w-4.5 h-4.5" />
            Logout
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full font-semibold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 border border-red-300 text-red-500 hover:bg-red-50 active:scale-[0.98]"
          >
            <FiTrash2 className="w-4 h-4" />
            Delete Account
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

