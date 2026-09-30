import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiVolume2, FiGlobe, FiLogOut, FiShield } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { workerTheme as themeColors } from '../../../../theme';
import { workerAuthService } from '../../../../services/authService';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import workerService from '../../../../services/workerService';
import { registerFCMToken, removeFCMToken } from '../../../../services/pushNotificationService';
import BankDetailsSection from '../../../../components/common/BankDetailsSection';
import LogoutModal from '../../../../components/common/LogoutModal';

const Settings = () => {
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [settings, setSettings] = useState({
    notifications: true,
    soundAlerts: true,
    language: 'en',
  });

  const [loading, setLoading] = useState(true);

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
    const loadSettings = async () => {
      try {
        setLoading(true);
        const res = await workerService.getProfile();
        if (res.success && res.worker?.settings) {
          setSettings(res.worker.settings);
          // Sync with localStorage for legacy components
          localStorage.setItem('workerSettings', JSON.stringify(res.worker.settings));

          // Also sync workerData in tab-isolated session
          authStorage.updateUserData('worker', { settings: res.worker.settings });
        }
        setLoading(false);
      } catch (error) {
        console.error('Error loading settings:', error);
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const updateDBSettings = async (newSettings) => {
    try {
      const res = await workerService.updateProfile({ settings: newSettings });
      if (res.success) {
        localStorage.setItem('workerSettings', JSON.stringify(newSettings));

        // Also sync workerData in tab-isolated session
        authStorage.updateUserData('worker', { settings: newSettings });

        return true;
      }
    } catch (error) {
      console.error('Update settings failed:', error);
      toastManager.error('Failed to sync settings with server');
    }
    return false;
  };

  const handleToggle = async (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    await updateDBSettings(updated);

    // Handle FCM Token registration/removal if notifications toggled
    if (key === 'notifications') {
      if (updated.notifications) {
        // Turning ON
        try {
          await registerFCMToken('worker', true);
          toastManager.success('Notifications enabled');
        } catch (error) {
          console.error('Error enabling notifications:', error);
          toastManager.error('Failed to enable notifications');
        }
      } else {
        // Turning OFF
        try {
          await removeFCMToken('worker');
          toastManager.success('Notifications disabled');
        } catch (error) {
          console.error('Error disabling notifications:', error);
        }
      }
    }
  };

  const handleLanguageChange = async (lang) => {
    const updated = { ...settings, language: lang };
    setSettings(updated);
    await updateDBSettings(updated);
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
                <span className="text-gray-800">Push Notifications</span>
              </div>
              <button
                onClick={() => handleToggle('notifications')}
                className={`w-12 h-6 rounded-full transition-all ${settings.notifications ? '' : 'bg-gray-300'
                  }`}
                style={
                  settings.notifications
                    ? {
                      background: themeColors.button,
                    }
                    : {}
                }
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-all ${settings.notifications ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  style={{
                    marginTop: '2px',
                  }}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FiVolume2 className="w-5 h-5" style={{ color: themeColors.icon }} />
                <span className="text-gray-800">Sound Alerts</span>
              </div>
              <button
                onClick={() => handleToggle('soundAlerts')}
                className={`w-12 h-6 rounded-full transition-all ${settings.soundAlerts ? '' : 'bg-gray-300'
                  }`}
                style={
                  settings.soundAlerts
                    ? {
                      background: themeColors.button,
                    }
                    : {}
                }
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-all ${settings.soundAlerts ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  style={{
                    marginTop: '2px',
                  }}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Banking / Payout Details */}
        <div className="mb-6">
          <BankDetailsSection />
        </div>

         {/* Security Settings */}
         <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
          onClick={() => navigate('/worker/settings/mpin-setup')}
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

        {/* Logout */}
        <button
          onClick={() => setShowLogoutModal(true)}
          className="w-full bg-white rounded-xl p-4 flex items-center justify-center gap-3 shadow-md transition-all active:scale-95 cursor-pointer"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <FiLogOut className="w-5 h-5 text-red-500" />
          <span className="font-semibold text-red-500">Logout</span>
        </button>
      </main>

      {/* Logout Confirmation Modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => !isLoggingOut && setShowLogoutModal(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
        role="Worker"
      />

      <BottomNav />
    </div>
  );
};

export default Settings;

