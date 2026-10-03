import React, { memo, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBell, FiSearch, FiMapPin, FiChevronDown, FiHelpCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { vendorTheme as themeColors } from '../../../../theme';
import Logo from '../../../../components/common/Logo';
import api from '../../../../services/api';
import authStorage from '../../../../utils/authStorage';

const Header = memo(({
  title,
  onBack,
  showBack = true,
  showSearch = false,
  showNotifications = true,
  notificationCount = 0
}) => {
  const navigate = useNavigate();
  const [count, setCount] = useState(notificationCount);

  // Sync prop changes
  useEffect(() => {
    if (typeof notificationCount !== 'undefined') {
      setCount(notificationCount);
    }
  }, [notificationCount]);

  // Fetch unread count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const res = await api.get('/notifications/vendor');
        if (res.data.success && typeof res.data.unreadCount === 'number') {
          setCount(res.data.unreadCount);
        }
      } catch (error) {
        // Silent fail
      }
    };

    if (showNotifications) {
      fetchUnreadCount();
      window.addEventListener('vendorNotificationsUpdated', fetchUnreadCount);
      const interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchUnreadCount();
        }
      }, 60000); // Poll every minute only if app is visible
      return () => {
        window.removeEventListener('vendorNotificationsUpdated', fetchUnreadCount);
        clearInterval(interval);
      };
    }
  }, [showNotifications]);

  // Extract vendor operating city
  const vendorCity = useMemo(() => {
    try {
      const vendorData = authStorage.getUserData('vendor') || {};
      if (vendorData.address) {
        if (typeof vendorData.address === 'object') {
          return vendorData.address.city || vendorData.address.district || vendorData.address.state || 'Service Hub';
        }
        if (typeof vendorData.address === 'string' && vendorData.address.trim()) {
          const parts = vendorData.address.split(',');
          return parts[parts.length > 2 ? parts.length - 2 : 0].trim() || 'Service Hub';
        }
      }
      return vendorData.businessName ? vendorData.businessName.split(' ')[0] + ' Hub' : 'Service Hub';
    } catch {
      return 'Service Hub';
    }
  }, []);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/vendor/dashboard'); // Fallback route if opened in new tab or hard refreshed
    }
  };

  const handleNotifications = () => {
    navigate('/vendor/notifications');
  };

  const handleLogoClick = () => {
    navigate('/vendor/dashboard');
  };

  return (
    <header
      className="sticky top-0 z-40 w-full backdrop-blur-xl shadow-[0_2px_12px_rgba(46,125,50,0.04)] transition-all"
      style={{
        background: 'linear-gradient(180deg, #F1F8E9 0%, rgba(255, 255, 255, 0.98) 100%)',
        borderBottom: '1px solid rgba(165, 214, 167, 0.4)',
      }}
    >
      <div className="px-4 py-2.5 flex items-center justify-between max-w-lg mx-auto">
        {/* Left: Back button or Logo */}
        <div className="flex items-center gap-2 shrink-0">
          {showBack ? (
            <motion.button
              onClick={handleBack}
              className="p-2 -ml-1.5 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
              whileTap={{ scale: 0.95 }}
            >
              <FiArrowLeft className="w-5 h-5 text-emerald-800" />
            </motion.button>
          ) : (
            <motion.div
              className="cursor-pointer"
              onClick={handleLogoClick}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Logo className="h-10 w-10 sm:h-11 sm:w-11" />
            </motion.div>
          )}
          {showBack && <h1 className="text-base font-bold text-gray-900 truncate max-w-[160px]">{title || 'Vendor'}</h1>}
        </div>

        {/* Center: Service Hub Location Selector (Dashboard only) */}
        {!showBack && (
          <div
            onClick={() => navigate('/vendor/address-management')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50/80 hover:bg-emerald-100/80 border border-emerald-200/60 cursor-pointer active:scale-95 transition-all max-w-[180px] shadow-2xs"
          >
            <FiMapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span className="text-xs font-bold text-emerald-900 truncate">
              {vendorCity}
            </span>
            <FiChevronDown className="w-3 h-3 text-emerald-600 shrink-0" />
          </div>
        )}

        {/* Right: Help Support & Notifications */}
        <div className="flex items-center gap-1.5">
          {!showBack && (
            <button
              onClick={() => navigate('/vendor/help-support')}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors active:scale-95"
              title="Help & Support"
            >
              <FiHelpCircle className="w-5 h-5" />
            </button>
          )}

          {showSearch && (
            <button
              className="p-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors active:scale-95"
              onClick={() => navigate('/vendor/jobs')}
            >
              <FiSearch className="w-5 h-5" />
            </button>
          )}

          {showNotifications && (
            <motion.div
              className="relative rounded-full cursor-pointer"
              style={{
                width: '38px',
                height: '38px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* Inner Button */}
              <motion.button
                onClick={handleNotifications}
                className="relative z-10 w-full h-full rounded-full flex items-center justify-center overflow-hidden border border-emerald-100/80"
                style={{
                  background: count > 0
                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(220, 38, 38, 0.08) 100%)'
                    : 'linear-gradient(135deg, rgba(46, 125, 50, 0.08) 0%, rgba(129, 199, 132, 0.08) 100%)',
                }}
              >
                <FiBell
                  className={`w-5 h-5 transition-colors ${
                    count > 0 ? 'text-red-500' : 'text-emerald-800'
                  }`}
                />
              </motion.button>

              {/* Active Badge */}
              {count > 0 && (
                <span
                  className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center z-20"
                  style={{
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 3px',
                    boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4), 0 0 0 2px #fff',
                    border: '1.5px solid #fff'
                  }}
                >
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </header>
  );
});

Header.displayName = 'VendorHeader';
export default Header;
