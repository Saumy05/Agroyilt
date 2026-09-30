import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBell, FiMail, FiPhone, FiMessageCircle, FiShield, FiChevronRight, FiLogOut, FiTrash2 } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { toastManager } from '../../../../utils/toastManager';
import { themeColors } from '../../../../theme';
import { userAuthService } from '../../../../services/authService';
import { registerFCMToken, removeFCMToken } from '../../../../services/pushNotificationService';
import authStorage from '../../../../utils/authStorage';
import BottomNav from '../../components/layout/BottomNav';
import BankDetailsSection from '../../../../components/common/BankDetailsSection';
import { LogoutModal } from '../../../../components/common';

const Settings = () => {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for notification toggles
  const [notifications, setNotifications] = useState({
    push: true,
    email: true,
  });

  // Load user settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await userAuthService.getProfile();
      if (response.success && response.user?.settings) {
        setNotifications(prev => ({
          ...prev,
          push: response.user.settings.notifications ?? true
        }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleToggle = async (key) => {
    // Optimistic update
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));

    // Handle Push Toggle specifically
    if (key === 'push') {
      const newState = !notifications.push;
      const toastId = toastManager.info(newState ? 'Enabling notifications...' : 'Disabling notifications...');

      try {
        if (newState) {
          // Enable
          const { isFlutterWebView } = await import('../../../../services/pushNotificationService');
          const token = await registerFCMToken('user', true);
          if (!token) {
            if (isFlutterWebView()) {
              toastManager.error('Failed to enable. Please check mobile app notification permissions in your phone settings.', { id: toastId, duration: 5000 });
            } else {
              toastManager.error('Failed to enable. Check browser permissions.', { id: toastId });
            }
            // Revert state
            setNotifications(prev => ({ ...prev, push: false }));
            return;
          }
        } else {
          // Disable
          await removeFCMToken('user');
        }

        // Persist preference to backend
        await userAuthService.updateProfile({
          settings: { notifications: newState }
        });

        toastManager.success(newState ? 'Notifications enabled' : 'Notifications disabled', { id: toastId });

      } catch (error) {
        console.error('Error updating notification settings:', error);
        toastManager.error('Failed to update settings', { id: toastId });
        // Revert
        setNotifications(prev => ({ ...prev, push: !newState }));
      }
    }
  };

  const handlePrivacyClick = () => {
    navigate('/user/privacy');
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiArrowLeft className="w-5 h-5 text-black" />
            </button>
            <h1 className="text-xl font-bold text-black">Settings</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        {/* Order Related Messages Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-black mb-2">Order related messages</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Order related messages can't be turned off as they are important for service experience.
          </p>
        </div>

        {/* Notifications & Reminders Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-black mb-4">Notifications & reminders</h2>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Push Notifications */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  <FiBell className="w-5 h-5" style={{ color: themeColors.button }} />
                </div>
                <span className="text-sm font-medium text-black">Push Notifications</span>
              </div>
              <button
                onClick={() => handleToggle('push')}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${notifications.push ? 'bg-green-700' : 'bg-gray-300'
                  }`}
                style={notifications.push ? { backgroundColor: '#15803d' } : {}}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${notifications.push ? 'translate-x-6' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  <FiMail className="w-5 h-5" style={{ color: themeColors.button }} />
                </div>
                <span className="text-sm font-medium text-black">Email</span>
              </div>
              <button
                onClick={() => handleToggle('email')}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${notifications.email ? 'bg-green-700' : 'bg-gray-300'
                  }`}
                style={notifications.email ? { backgroundColor: '#15803d' } : {}}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${notifications.email ? 'translate-x-6' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Banking Details Section */}
        <div className="mb-6">
          <BankDetailsSection />
        </div>

        {/* Account Actions Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-black mb-4">Account</h2>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/user/settings/mpin-setup')}
              className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-50">
                  <FiShield className="w-5 h-5 text-blue-500" />
                </div>
                <div className="text-left">
                  <span className="text-sm font-medium text-black block">Set / Change MPIN</span>
                  <span className="text-xs text-gray-500">Manage your 4-digit login pin</span>
                </div>
              </div>
              <FiChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button
              onClick={() => setShowLogoutModal(true)}
              className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:bg-gray-50 active:scale-[0.98] transition-all cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50">
                <FiLogOut className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-sm font-medium text-red-600">Log Out</span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full bg-white rounded-xl border border-red-200 p-4 flex items-center gap-3 hover:bg-red-50 active:scale-[0.98] transition-all"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50">
                <FiTrash2 className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-left">
                <span className="text-sm font-medium text-red-600 block">Delete Account</span>
                <span className="text-xs text-red-400">Permanently remove your account & data</span>
              </div>
            </button>

          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
                <FiTrash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Account?</h3>
              <p className="text-sm text-gray-500 text-center mb-6">
                Yeh action permanent hai. Aapka account aur saara data delete ho jayega.
                Is number se dobara login karne ke liye aapko <strong>nayi registration</strong> karni padegi.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all"
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
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-all disabled:opacity-60"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Privacy & Data Section */}
        <div className="space-y-4 mb-6">
          <button
            onClick={handlePrivacyClick}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                <FiShield className="w-5 h-5" style={{ color: themeColors.button }} />
              </div>
              <span className="text-sm font-medium text-black">Privacy & data</span>
            </div>
            <FiChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          {/* Diagnostic Test Button */}
          <button
            onClick={async () => {
              try {
                const { registerFCMToken, isFlutterWebView } = await import('../../../../services/pushNotificationService');
                const toastId = toastManager.info('Attempting to register for notifications...');
                const inWebView = isFlutterWebView();

                // 1. Register Token (Optional inside WebView)
                let token = null;
                try {
                  token = await registerFCMToken('user', true);
                } catch (e) {
                  console.warn('FCM registration skipped or failed:', e);
                }

                if (!token && !inWebView) {
                  toastManager.error('Could not register. Check browser permissions.', { id: toastId });
                  return;
                }

                // 2. Send Test Notification from Backend
                toastManager.info('Sending test notification...', { id: toastId });

                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/fcm-tokens/test`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authStorage.getAccessToken('user')}`
                  }
                });

                const data = await response.json();

                if (data.success) {
                  toastManager.success(`Sent! Success: ${data.successCount}`, { id: toastId });
                } else {
                  toastManager.error(`Failed to send: ${data.message || 'Unknown error'}`, { id: toastId });
                }

              } catch (err) {
                toastManager.error('Test failed. See console.', { id: toastId });
                console.error(err);
              }
            }}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
              <FiBell className="w-5 h-5" style={{ color: themeColors.button }} />
            </div>
            <div className="text-left">
              <span className="text-sm font-medium text-black block">Test Push Notifications</span>
              <span className="text-xs text-gray-500">Tap to register & simulate alert</span>
            </div>
          </button>
        </div>
      </main>

      {/* Logout Confirmation Modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => !isLoggingOut && setShowLogoutModal(false)}
        onConfirm={async () => {
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
        }}
        isLoading={isLoggingOut}
        role="Farmer"
      />

      {/* BottomNav hidden on this page */}
    </div>
  );
};

export default Settings;
