import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiVolume2, FiGlobe, FiInfo, FiLogOut, FiTrash2, FiMapPin, FiShield } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { vendorTheme as themeColors } from '../../../../theme';
import { vendorAuthService } from '../../../../services/authService';
import { registerFCMToken, removeFCMToken } from '../../../../services/pushNotificationService';
import api from '../../../../services/api';
import authStorage from '../../../../utils/authStorage';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import BankDetailsSection from '../../../../components/common/BankDetailsSection';
import LogoutModal from '../../../../components/common/LogoutModal';

const Settings = () => {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [settings, setSettings] = useState({
    notifications: true,
    soundAlerts: true,
    language: 'en',
  });

  const handleSendTestNotification = async () => {
    console.log('[Test Notification] Send button clicked');
    console.log('[Test Notification] Current settings state:', settings);
    console.log('[Test Notification] Stored FCM token (web):', localStorage.getItem('fcm_token_vendor_web') ? 'Present (Hidden for security)' : 'Missing');
    console.log('[Test Notification] Stored FCM token (mobile):', localStorage.getItem('fcm_token_vendor_mobile') ? 'Present (Hidden for security)' : 'Missing');
    console.log('[Test Notification] Notification.permission:', typeof Notification !== 'undefined' ? Notification.permission : 'Not supported');
    console.log('[Test Notification] Vendor Access Token:', authStorage.getAccessToken('vendor') ? 'Present (Hidden for security)' : 'Missing');

    setSendingTest(true);
    try {
      console.log('[Test Notification] Sending API request to /fcm-tokens/test...');
      const response = await api.post('/fcm-tokens/test');
      console.log('[Test Notification] API response:', response.data);
      if (response.data.success) {
        toastManager.success('Test push notification sent successfully!');
      } else {
        console.warn('[Test Notification] Backend returned success false:', response.data.error);
        toastManager.error(response.data.error || 'Failed to send test notification');
      }
    } catch (error) {
      console.error('[Test Notification] Error sending test notification:', error);
      if (error.response) {
        console.error('[Test Notification] Error response status:', error.response.status);
        console.error('[Test Notification] Error response data:', error.response.data);
      }
      toastManager.error(error.response?.data?.error || 'Failed to send test notification');
    } finally {
      setSendingTest(false);
      console.log('[Test Notification] Finished flow');
    }
  };

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
    const loadSettings = () => {
      try {
        const savedSettings = JSON.parse(localStorage.getItem('vendorSettings') || '{}');
        if (Object.keys(savedSettings).length > 0) {
          setSettings(prev => ({ ...prev, ...savedSettings }));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleToggle = async (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    localStorage.setItem('vendorSettings', JSON.stringify(updated));

    // Handle FCM Token registration/removal if notifications toggled
    if (key === 'notifications') {
      if (updated.notifications) {
        // Turning ON
        try {
          await registerFCMToken('vendor', true);
          toastManager.success('Notifications enabled');
        } catch (error) {
          console.error('Error enabling notifications:', error);
          toastManager.error('Failed to enable notifications');
          // Revert toggle if failed? For now, we keep UI in sync with intent.
        }
      } else {
        // Turning OFF
        try {
          await removeFCMToken('vendor');
          toastManager.success('Notifications disabled');
        } catch (error) {
          console.error('Error disabling notifications:', error);
        }
      }
    }
  };

  const handleLanguageChange = (lang) => {
    const updated = { ...settings, language: lang };
    setSettings(updated);
    localStorage.setItem('vendorSettings', JSON.stringify(updated));
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await vendorAuthService.logout();
      toastManager.success('Logged out successfully');
      navigate('/vendor/login');
    } catch (error) {
      // Even if API call fails, clear local storage
      localStorage.removeItem('vendorAccessToken');
      localStorage.removeItem('vendorRefreshToken');
      localStorage.removeItem('vendorData');
      toastManager.success('Logged out successfully');
      navigate('/vendor/login');
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true);
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Settings" />

      <main className="px-4 py-6">
        {/* Notification Settings */}
        <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3 className="font-bold text-gray-800 mb-4">Notifications</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FiBell className="w-5 h-5" style={{ color: themeColors.icon }} />
                <div>
                  <p className="font-semibold text-gray-800">Push Notifications</p>
                  <p className="text-sm text-gray-600">Receive booking alerts</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle('notifications')}
                className={`relative w-12 h-6 rounded-full transition-colors ${settings.notifications ? 'bg-green-500' : 'bg-gray-300'
                  }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.notifications ? 'transform translate-x-6' : ''
                    }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FiVolume2 className="w-5 h-5" style={{ color: themeColors.icon }} />
                <div>
                  <p className="font-semibold text-gray-800">Sound Alerts</p>
                  <p className="text-sm text-gray-600">Play sound for new bookings</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle('soundAlerts')}
                className={`relative w-12 h-6 rounded-full transition-colors ${settings.soundAlerts ? 'bg-green-500' : 'bg-gray-300'
                  }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.soundAlerts ? 'transform translate-x-6' : ''
                    }`}
                />
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-center">
              <button
                type="button"
                onClick={handleSendTestNotification}
                disabled={sendingTest}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-white text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 hover:opacity-90"
                style={{
                  background: themeColors.button,
                  boxShadow: `0 2px 8px ${themeColors.button}30`,
                  cursor: 'pointer'
                }}
              >
                <FiBell className="w-4 h-4" />
                {sendingTest ? 'Sending...' : 'Test Push Notification'}
              </button>
            </div>
          </div>
        </div>

        {/* Banking Details */}
        <div className="mb-6">
          <BankDetailsSection />
        </div>

        {/* Address Management */}
        <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
          onClick={() => navigate('/vendor/address-management')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FiMapPin className="w-5 h-5" style={{ color: themeColors.icon }} />
              <div>
                <p className="font-semibold text-gray-800">Manage Address</p>
                <p className="text-sm text-gray-600">Set your business location</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* Security Settings */}
        <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
          onClick={() => navigate('/vendor/settings/mpin-setup')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FiShield className="w-5 h-5" style={{ color: themeColors.icon }} />
              <div>
                <p className="font-semibold text-gray-800">Set / Change MPIN</p>
                <p className="text-sm text-gray-600">Manage your 4-digit login pin</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* Language Settings */}
        <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <FiGlobe className="w-5 h-5" style={{ color: themeColors.icon }} />
            <h3 className="font-bold text-gray-800">Language</h3>
          </div>

          <div className="space-y-2">
            {[
              { code: 'en', name: 'English' },
              { code: 'hi', name: 'हिंदी' },
            ].map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`w-full py-3 px-4 rounded-lg text-left transition-all ${settings.language === lang.code
                  ? 'text-white'
                  : 'bg-gray-50 text-gray-700'
                  }`}
                style={
                  settings.language === lang.code
                    ? {
                      background: themeColors.button,
                      boxShadow: `0 2px 8px ${themeColors.button}40`,
                    }
                    : {}
                }
              >
                {lang.name}
              </button>
            ))}
          </div>
        </div>

        {/* About */}
        <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <FiInfo className="w-5 h-5" style={{ color: themeColors.icon }} />
            <h3 className="font-bold text-gray-800">About</h3>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-gray-600">App Version: 1.0.0</p>
            <p className="text-sm text-gray-600">Equipment Owner App</p>
          </div>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowLogoutModal(true);
          }}
          className="w-full py-4 rounded-xl font-semibold text-white mb-4 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          style={{
            background: themeColors.button,
            boxShadow: `0 4px 12px ${themeColors.button}40`,
            cursor: 'pointer'
          }}
        >
          <FiLogOut className="w-5 h-5" />
          Logout
        </button>

        {/* Delete Account */}
        <button
          onClick={handleDeleteAccount}
          className="w-full py-4 rounded-xl font-semibold text-red-600 border-2 border-red-600 transition-all active:scale-95 hover:bg-red-50"
        >
          <div className="flex items-center justify-center gap-2">
            <FiTrash2 className="w-5 h-5" />
            Delete Account
          </div>
        </button>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
                <FiTrash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Account?</h3>
              <p className="text-sm text-gray-500 text-center mb-6">
                Yeh action permanent hai. Aapka vendor account aur saara data delete ho jayega.
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
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-all disabled:opacity-60"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Logout Confirmation Modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => !isLoggingOut && setShowLogoutModal(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
        role="Vendor"
      />

      <BottomNav />
    </div>
  );
};

export default Settings;

