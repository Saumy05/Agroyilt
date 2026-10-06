import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBell, FiSearch } from 'react-icons/fi';
import { gsap } from 'gsap';
import { workerTheme as themeColors } from '../../../../theme';
import { animateLogo } from '../../../../utils/gsapAnimations';
import Logo from '../../../../components/common/Logo';
import api from '../../../../services/api';

const Header = ({
  title,
  onBack,
  showBack = true,
  showSearch = false,
  showNotifications = true,
  notificationCount = 0
}) => {
  const navigate = useNavigate();
  const logoRef = useRef(null);
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
        const res = await api.get('/notifications/worker');
        if (res.data.success && typeof res.data.unreadCount === 'number') {
          setCount(res.data.unreadCount);
        }
      } catch (error) {
        // Silent fail
      }
    };

    if (showNotifications) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 60000); // Poll every minute

      const handleUpdate = () => {
        fetchUnreadCount();
      };
      window.addEventListener('workerNotificationsUpdated', handleUpdate);

      return () => {
        clearInterval(interval);
        window.removeEventListener('workerNotificationsUpdated', handleUpdate);
      };
    }
  }, [showNotifications]);

  useEffect(() => {
    if (logoRef.current && !showBack) {
      animateLogo(logoRef.current);
      gsap.fromTo(logoRef.current,
        {
          opacity: 0,
          scale: 0.8,
          y: -10
        },
        {
          opacity: 1,
          scale: 1.0,
          y: 0,
          duration: 0.6,
          ease: 'back.out(1.7)'
        }
      );
    }
  }, [showBack]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const handleNotifications = () => {
    navigate('/worker/notifications');
  };

  const handleLogoClick = () => {
    navigate('/worker/dashboard');
  };

  return (
    <header
      className="sticky top-0 z-40 w-full backdrop-blur-xl transition-all"
      style={{
        background: 'linear-gradient(180deg, #F1F8E9 0%, rgba(255, 255, 255, 0.96) 100%)',
        borderBottom: '1px solid rgba(165, 214, 167, 0.45)',
        boxShadow: '0 2px 14px rgba(46, 125, 50, 0.05)',
      }}
    >
      <div className="px-4 py-2.5 flex items-center justify-between max-w-lg mx-auto">
        {/* Left: Back button or Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          {showBack ? (
            <button
              onClick={handleBack}
              className="p-2 -ml-1 rounded-full hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
            >
              <FiArrowLeft className="w-5 h-5" style={{ color: themeColors.button }} />
            </button>
          ) : (
            <div
              className="cursor-pointer"
              onClick={handleLogoClick}
              onMouseEnter={() => {
                if (logoRef.current) {
                  gsap.to(logoRef.current, {
                    scale: 1.08,
                    duration: 0.25,
                    ease: 'power2.out',
                  });
                }
              }}
              onMouseLeave={() => {
                if (logoRef.current) {
                  gsap.to(logoRef.current, {
                    scale: 1.0,
                    duration: 0.25,
                    ease: 'power2.out',
                  });
                }
              }}
            >
              <Logo
                ref={logoRef}
                className="h-10 w-10 sm:h-11 sm:w-11 object-contain transition-transform"
              />
            </div>
          )}
          {showBack && <h1 className="text-base font-bold text-gray-900 truncate max-w-[170px]">{title || 'Worker'}</h1>}
        </div>

        {/* Center: Operating Hub / City Indicator (Dashboard only) */}
        {!showBack && (
          <div
            onClick={() => navigate('/worker/profile')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50/90 hover:bg-emerald-100/90 border border-emerald-200/70 cursor-pointer active:scale-95 transition-all max-w-[190px] shadow-2xs"
            title="Worker Operating Area"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-emerald-900 truncate">
              Worker Hub
            </span>
            <span className="text-[10px] font-extrabold text-emerald-700 uppercase bg-emerald-100/80 px-1.5 py-0.2 rounded-sm shrink-0">
              Active
            </span>
          </div>
        )}

        {/* Right: Search and Notifications */}
        <div className="flex items-center gap-2">
          {showSearch && (
            <button
              className="p-2 rounded-full hover:bg-white/30 transition-colors active:scale-95"
              onClick={() => navigate('/worker/jobs')}
            >
              <FiSearch className="w-5 h-5" style={{ color: themeColors.button }} />
            </button>
          )}
          {showNotifications && (
            <div
              className="relative cursor-pointer group active:scale-95 transition-transform"
              onClick={handleNotifications}
            >
              <button
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 border border-emerald-100 bg-white hover:bg-emerald-50/60 shadow-2xs"
                title="Notifications"
              >
                <FiBell className="w-5 h-5 text-gray-700 group-hover:text-emerald-700 transition-colors" />
              </button>

              {count > 0 && (
                <span
                  className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center z-20 px-1.5 py-0.5 shadow-sm border-2 border-white animate-pulse"
                  style={{ minWidth: '19px', height: '19px' }}
                >
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
