import React, { useState, useEffect, memo, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiHome, FiCalendar, FiUser } from 'react-icons/fi';
import { HiHome, HiCalendar, HiUser } from 'react-icons/hi';
import { HiOutlineWallet, HiWallet } from 'react-icons/hi2';
import { motion, AnimatePresence } from 'framer-motion';
import { useKeyboardVisibility } from '../../../../hooks/useKeyboardVisibility';
import { vendorTheme as themeColors } from '../../../../theme';

// Agriculture-themed colors for each nav item matching User app
const navItemColors = {
  home: {
    defaultIcon: themeColors.brand.teal,     // #2E7D32
    activeIcon: '#1B5E20',
    primary: '#1B5E20',
    gradient: themeColors.gradient,
    bg: '#E3F2E1',
    shadow: 'rgba(46, 125, 50, 0.45)'
  },
  bookings: {
    defaultIcon: themeColors.brand.teal,
    activeIcon: '#1B5E20',
    primary: '#1B5E20',
    gradient: themeColors.gradient,
    bg: '#E3F2E1',
    shadow: 'rgba(46, 125, 50, 0.45)'
  },
  wallet: {
    defaultIcon: themeColors.brand.teal,
    activeIcon: '#1B5E20',
    primary: '#1B5E20',
    gradient: themeColors.gradient,
    bg: '#E3F2E1',
    shadow: 'rgba(46, 125, 50, 0.45)'
  },
  profile: {
    defaultIcon: themeColors.brand.teal,
    activeIcon: '#1B5E20',
    primary: '#1B5E20',
    gradient: themeColors.gradient,
    bg: '#E3F2E1',
    shadow: 'rgba(46, 125, 50, 0.45)'
  }
};

const BottomNav = memo(({ isGlobal = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const [pendingJobsCount, setPendingJobsCount] = useState(0);
  const { isKeyboardOpen, keyboardHeight } = useKeyboardVisibility();

  if (isGlobal) {
    window.__hasGlobalBottomNav = true;
  }

  if (!isGlobal && window.__hasGlobalBottomNav) {
    return null;
  }

  // Load pending jobs count from localStorage
  useEffect(() => {
    const updatePendingCount = () => {
      try {
        const acceptedBookings = JSON.parse(localStorage.getItem('vendorAcceptedBookings') || '[]');
        const activeJobs = acceptedBookings.filter(job => job.status === 'PENDING');
        setPendingJobsCount(activeJobs.length);
      } catch (error) {
        console.error('Error reading pending jobs:', error);
      }
    };

    updatePendingCount();
    window.addEventListener('storage', updatePendingCount);
    window.addEventListener('vendorJobsUpdated', updatePendingCount);

    return () => {
      window.removeEventListener('storage', updatePendingCount);
      window.removeEventListener('vendorJobsUpdated', updatePendingCount);
    };
  }, []);

  const navItems = useMemo(() => [
    { id: 'home', label: 'Home', icon: FiHome, filledIcon: HiHome, path: '/vendor/dashboard' },
    { id: 'bookings', label: 'Bookings', icon: FiCalendar, filledIcon: HiCalendar, path: '/vendor/jobs', badge: pendingJobsCount },
    { id: 'wallet', label: 'Wallet', icon: HiOutlineWallet, filledIcon: HiWallet, path: '/vendor/wallet' },
    { id: 'profile', label: 'Profile', icon: FiUser, filledIcon: HiUser, path: '/vendor/profile' },
  ], [pendingJobsCount]);

  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/vendor' || path === '/vendor/' || path.startsWith('/vendor/dashboard')) return 'home';
    if (path.startsWith('/vendor/jobs') || path.startsWith('/vendor/active-jobs')) return 'bookings';
    if (path.startsWith('/vendor/wallet') || path.startsWith('/vendor/earnings') || path.startsWith('/vendor/settlements')) return 'wallet';
    if (path.startsWith('/vendor/profile') || path.startsWith('/vendor/settings') || path.startsWith('/vendor/business-details')) return 'profile';
    return 'home';
  };

  const activeTab = getActiveTab();
  const activeIndex = navItems.findIndex(item => item.id === activeTab);
  const activeColor = navItemColors[activeTab] || navItemColors.home;

  // Update indicator position when active tab changes
  useEffect(() => {
    if (navRef.current) {
      const buttons = navRef.current.querySelectorAll('button');
      if (buttons[activeIndex]) {
        const button = buttons[activeIndex];
        const navRect = navRef.current.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();

        setIndicatorStyle({
          left: buttonRect.left - navRect.left + (buttonRect.width / 2) - 16,
          width: 32
        });
      }
    }
  }, [activeIndex, activeTab]);

  const handleTabClick = (path) => {
    if (location.pathname !== path) {
      navigate(path);
    }
  };

  // Hide nav when specific routes are active (booking alerts, maps)
  const hideNavRoutes = [
    '/vendor/booking-alert/',
    '/vendor/booking/',
  ];

  const shouldHideNav = hideNavRoutes.some(route =>
    location.pathname.includes(route) &&
    (location.pathname.includes('/map') || location.pathname.includes('/alert/'))
  );

  if (shouldHideNav) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 w-full"
      style={{
        WebkitBackfaceVisibility: 'hidden',
        bottom: isKeyboardOpen ? `-${keyboardHeight}px` : undefined,
      }}
    >
      <div
        className="w-full pb-2 pt-2 px-2"
        style={{
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.08)',
          borderTop: '1px solid rgba(229, 231, 235, 0.6)',
        }}
      >
        <div ref={navRef} className="flex items-center justify-around max-w-md mx-auto relative">
          {/* Animated Sliding Indicator */}
          <motion.div
            className="absolute -top-2 h-1 rounded-full"
            animate={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              background: activeColor?.gradient || navItemColors.home.gradient,
            }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 30
            }}
            style={{
              boxShadow: `0 2px 12px ${activeColor?.shadow || navItemColors.home.shadow}`,
            }}
          />

          {navItems.map((item) => {
            const IconComponent = activeTab === item.id ? item.filledIcon : item.icon;
            const isActive = activeTab === item.id;
            const itemColor = navItemColors[item.id] || navItemColors.home;

            return (
              <motion.button
                key={item.id}
                onClick={() => handleTabClick(item.path)}
                whileTap={{ scale: 0.9 }}
                className="flex flex-col items-center justify-center w-14 h-11 rounded-2xl transition-all duration-200 relative"
              >
                {/* Active Background Glow */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-1 rounded-xl"
                      style={{
                        background: itemColor.bg,
                      }}
                    />
                  )}
                </AnimatePresence>

                <div className="relative z-10 flex flex-col items-center justify-center">
                  <motion.div
                    className="relative mb-0.5"
                    animate={{
                      scale: isActive ? 1.1 : 1,
                      y: isActive ? -2 : 0
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <IconComponent
                      className="w-6 h-6 transition-colors duration-200"
                      style={{
                        color: isActive ? itemColor.activeIcon : itemColor.defaultIcon,
                      }}
                    />
                    {item.badge !== undefined && item.badge > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1.5 -right-2.5 bg-gradient-to-br from-red-500 to-red-600 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center border-2 border-white shadow-lg"
                      >
                        {item.badge > 9 ? '9+' : item.badge}
                      </motion.span>
                    )}
                  </motion.div>
                  <motion.span
                    animate={{
                      color: isActive ? itemColor.primary : '#6B7280',
                      fontWeight: isActive ? 600 : 500
                    }}
                    className="text-[10px]"
                  >
                    {item.label}
                  </motion.span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';
export default BottomNav;
