import React, { useRef, useEffect, useState, memo, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiHome, FiBriefcase, FiUser } from 'react-icons/fi';
import { HiHome, HiBriefcase, HiUser } from 'react-icons/hi';
import { IoWalletOutline, IoWallet } from 'react-icons/io5';
import { FiBell } from 'react-icons/fi';
import { gsap } from 'gsap';
import { useKeyboardVisibility } from '../../../../hooks/useKeyboardVisibility';
import { workerTheme as themeColors } from '../../../../theme';
import api from '../../../../services/api';

const BottomNav = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const iconRefs = useRef({});
  const activeAnimations = useRef({});
  const [pendingJobsCount, setPendingJobsCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const { isKeyboardOpen, keyboardHeight } = useKeyboardVisibility();

  // Load counts
  useEffect(() => {
    const updatePendingCount = () => {
      try {
        // Count pending assigned jobs (waiting for accept/reject)
        const assignedJobs = JSON.parse(localStorage.getItem('workerAssignedJobs') || '[]');
        const pendingJobs = assignedJobs.filter(job =>
          job.workerStatus === 'PENDING'
        );
        setPendingJobsCount(pendingJobs.length);
      } catch (error) {
        console.error('Error reading pending jobs:', error);
      }
    };

    const fetchUnreadCount = async () => {
      try {
        const res = await api.get('/notifications/worker');
        if (res.data.success && typeof res.data.unreadCount === 'number') {
          setUnreadNotificationsCount(res.data.unreadCount);
        }
      } catch (error) {
        // Silent fail
      }
    };

    updatePendingCount();
    fetchUnreadCount();

    window.addEventListener('storage', updatePendingCount);
    window.addEventListener('workerJobsUpdated', updatePendingCount);

    const interval = setInterval(fetchUnreadCount, 60000);

    return () => {
      window.removeEventListener('storage', updatePendingCount);
      window.removeEventListener('workerJobsUpdated', updatePendingCount);
      clearInterval(interval);
    };
  }, []);

  const navItems = useMemo(() => {
    return [
      { path: '/worker/dashboard', icon: FiHome, activeIcon: HiHome, label: 'Home' },
      { path: '/worker/jobs', icon: FiBriefcase, activeIcon: HiBriefcase, label: 'Jobs', badge: pendingJobsCount },
      { path: '/worker/wallet', icon: IoWalletOutline, activeIcon: IoWallet, label: 'Wallet' },
      { path: '/worker/notifications', icon: FiBell, activeIcon: FiBell, label: 'Alerts', badge: unreadNotificationsCount },
      { path: '/worker/profile', icon: FiUser, activeIcon: HiUser, label: 'Profile' },
    ];
  }, [pendingJobsCount, unreadNotificationsCount]);

  const handleNavClick = (path) => {
    if (location.pathname !== path) {
      navigate(path);
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-emerald-100/80 px-2 pb-[env(safe-area-inset-bottom,20px)] pt-1.5 z-[60] shadow-[0_-4px_24px_rgba(46,125,50,0.06)]"
      style={{
        WebkitBackfaceVisibility: 'hidden',
        bottom: isKeyboardOpen ? `-${keyboardHeight}px` : undefined,
      }}
    >
      <div className="flex items-center justify-around px-2 py-1.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === '/worker/dashboard' && location.pathname === '/worker');
          const IconComponent = isActive ? item.activeIcon : item.icon;

          return (
            <button
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              className="flex flex-col items-center justify-center relative w-16 h-13 rounded-xl transition-all duration-300 group"
              style={{
                // No inline background here
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  gsap.to(e.currentTarget, { scale: 1.05, duration: 0.2 });
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  gsap.to(e.currentTarget, { scale: 1.0, duration: 0.2 });
                }
              }}
            >
              {/* Active Indicator Bar - Sleek Emerald Pill */}
              {isActive && (
                <div
                  className="absolute -top-1.5 w-7 h-1 rounded-full bg-emerald-600 shadow-[0_2px_8px_rgba(46,125,50,0.4)]"
                />
              )}

              {/* Active Background - Very Subtle Teal Tint */}
              {isActive && (
                <div
                  className="absolute inset-0 rounded-xl scale-90"
                  style={{ backgroundColor: `${themeColors.brand.teal}0A` }}
                />
              )}

              <div className="relative z-10 flex flex-col items-center justify-center">
                <div className="relative mb-0.5">
                  <IconComponent
                    ref={(el) => {
                      iconRefs.current[item.path] = el;
                    }}
                    className={`w-6 h-6 transition-all duration-300 ${isActive ? 'scale-110' : 'text-gray-400 group-hover:text-gray-600'}`}
                    style={{
                      color: isActive ? themeColors.button : '#9CA3AF',
                      filter: isActive ? `drop-shadow(0 2px 4px ${themeColors.brand.teal}1A)` : 'none'
                    }}
                  />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="absolute bg-gradient-to-br from-red-500 to-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center"
                      style={{
                        top: '-6px',
                        right: '-8px',
                        minWidth: '18px',
                        height: '18px',
                        padding: '0 4px',
                        fontSize: '10px',
                        lineHeight: '18px',
                        border: '2px solid white',
                        boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
                        zIndex: 50,
                      }}
                    >
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] transition-colors duration-300 ${isActive ? 'font-bold' : 'font-medium text-gray-500'}`}
                  style={{
                    color: isActive ? themeColors.button : '#6B7280',
                  }}
                >
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';
export default BottomNav;

