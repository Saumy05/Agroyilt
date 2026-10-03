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
  const bellRef = useRef(null);
  const bellButtonRef = useRef(null);
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
      className="sticky top-0 z-40 w-full bg-white"
      style={{
        borderBottom: '2px solid rgba(156, 163, 175, 0.3)',
        borderBottomLeftRadius: '20px',
        borderBottomRightRadius: '20px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.08)',
      }}
    >
      <div className="px-4 py-3 flex items-center justify-between">
        {/* Left: Back button or Logo */}
        <div className="flex items-center gap-3">
          {showBack ? (
            <button
              onClick={handleBack}
              className="p-2 rounded-full hover:bg-white/30 transition-colors active:scale-95"
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
                    scale: 1.2,
                    duration: 0.3,
                    ease: 'power2.out',
                  });
                }
              }}
              onMouseLeave={() => {
                if (logoRef.current) {
                  gsap.to(logoRef.current, {
                    scale: 1.0,
                    duration: 0.3,
                    ease: 'power2.out',
                  });
                }
              }}
            >
              <Logo
                ref={logoRef}
                className="h-14 w-14 sm:h-16 sm:w-16 shadow-md border-2 border-white/80 transition-transform"
              />
            </div>
          )}
          {showBack && <h1 className="text-lg font-bold text-gray-800">{title || 'Worker'}</h1>}
        </div>

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
              ref={bellButtonRef}
              className="relative rounded-full cursor-pointer group active:scale-95 transition-transform duration-300"
              style={{
                width: '42px',
                height: '42px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '2px' // Spacing for border
              }}
              onMouseEnter={() => {
                if (bellButtonRef.current && bellRef.current) {
                  const btn = bellButtonRef.current.querySelector('button');

                  // Scale Wrapper
                  gsap.to(bellButtonRef.current, {
                    scale: 1.15,
                    duration: 0.3,
                    ease: 'power2.out',
                  });

                  // Shadow on inner button
                  if (btn) {
                    gsap.to(btn, {
                      boxShadow: count > 0
                        ? '0 6px 20px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
                        : `0 4px 12px ${themeColors.brand.teal}40`,
                      duration: 0.3,
                      ease: 'power2.out',
                    });
                  }

                  // Rotate Bell
                  gsap.to(bellRef.current, {
                    rotation: 15,
                    scale: 1.1,
                    duration: 0.3,
                    ease: 'power2.out',
                  });
                }
              }}
              onMouseLeave={() => {
                if (bellButtonRef.current && bellRef.current) {
                  const btn = bellButtonRef.current.querySelector('button');

                  gsap.to(bellButtonRef.current, {
                    scale: 1.0,
                    duration: 0.3,
                    ease: 'power2.out',
                  });

                  if (btn) {
                    gsap.to(btn, {
                      boxShadow: count > 0
                        ? '0 3px 12px rgba(239, 68, 68, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
                        : `0 2px 6px ${themeColors.brand.teal}26`,
                      duration: 0.3,
                      ease: 'power2.out',
                    });
                  }

                  gsap.to(bellRef.current, {
                    rotation: 0,
                    scale: 1.0,
                    duration: 0.3,
                    ease: 'power2.out',
                  });
                }
              }}
            >
              {/* 1. Animated Running Border */}
              <div
                className="absolute inset-[-2px] rounded-full z-0"
                style={{
                  background: themeColors.brand.conic,
                  animation: 'spin 2s linear infinite',
                  boxShadow: `0 0 8px ${themeColors.brand.orange}26`
                }}
              />

              {/* 2. White Mask (to hide center of conic gradient) */}
              <div className="absolute inset-[1px] rounded-full bg-white z-0" />

              {/* 3. Inner Button */}
              <button
                onClick={handleNotifications}
                className="relative z-10 w-full h-full rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  background: count > 0
                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.12) 100%)'
                    : 'linear-gradient(135deg, rgba(52, 121, 137, 0.1) 0%, rgba(187, 95, 54, 0.1) 100%)',
                  boxShadow: count > 0
                    ? '0 3px 12px rgba(239, 68, 68, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
                    : '0 2px 6px rgba(52, 121, 137, 0.15)',
                }}
              >
                {/* Define Gradient for Icon */}
                <svg width="0" height="0" className="absolute">
                  <linearGradient id="groo-bell-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={themeColors.brand.teal} />
                    <stop offset="50%" stopColor={themeColors.brand.yellow} />
                    <stop offset="100%" stopColor={themeColors.brand.orange} />
                  </linearGradient>
                </svg>

                <FiBell
                  ref={bellRef}
                  className="w-5 h-5 transition-all duration-300"
                  style={{
                    stroke: count > 0 ? '#EF4444' : 'url(#groo-bell-gradient)',
                    strokeWidth: '2.5',
                    color: 'transparent',
                    filter: count > 0
                      ? 'drop-shadow(0 2px 6px rgba(239, 68, 68, 0.4))'
                      : 'drop-shadow(0 1px 3px rgba(52, 121, 137, 0.3))',
                  }}
                />
              </button>
              {/* 4. Active Badge (Moved outside for robustness and to prevent clipping) */}
              {count > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 bg-gradient-to-br from-red-500 to-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center z-20"
                  style={{
                    minWidth: '20px',
                    height: '20px',
                    boxShadow: '0 3px 8px rgba(239, 68, 68, 0.5), 0 0 0 2px #fff',
                    border: '2px solid #fff'
                  }}
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
