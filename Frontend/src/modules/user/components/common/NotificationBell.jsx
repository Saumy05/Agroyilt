import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell } from 'react-icons/fi';
import { gsap } from 'gsap';
import { themeColors } from '../../../../theme';
import api from '../../../../services/api';
import authStorage from '../../../../utils/authStorage';

const NotificationBell = ({ notificationCount = 0, size = 38 }) => {
  const navigate = useNavigate();
  const bellRef = useRef(null);
  const bellButtonRef = useRef(null);
  const [count, setCount] = useState(notificationCount);

  // Sync prop changes
  useEffect(() => {
    if (typeof notificationCount !== 'undefined') {
      setCount(notificationCount);
    }
  }, [notificationCount]);

  // Fetch unread count on mount
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const token = authStorage.getAccessToken('user');
        if (!token) return; // Not logged in, count 0

        const res = await api.get('/notifications/user');
        if (res.data.success && typeof res.data.unreadCount === 'number') {
          setCount(res.data.unreadCount);
        }
      } catch (error) {
        // Silent fail (e.g. 401 not logged in)
      }
    };

    fetchUnreadCount();
    window.addEventListener('userNotificationsUpdated', fetchUnreadCount);
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => {
      window.removeEventListener('userNotificationsUpdated', fetchUnreadCount);
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      ref={bellButtonRef}
      className="relative rounded-full cursor-pointer group active:scale-95 transition-transform duration-300 z-50 shrink-0"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '1px'
      }}
      onClick={(e) => {
        e.stopPropagation();
        navigate('/user/notifications');
      }}
      onMouseEnter={() => {
        if (bellButtonRef.current && bellRef.current) {
          const btn = bellButtonRef.current.querySelector('button');
          gsap.to(bellButtonRef.current, { scale: 1.1, duration: 0.3, ease: 'power2.out' });
          if (btn) {
            gsap.to(btn, {
              boxShadow: count > 0
                ? '0 6px 20px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
                : `0 4px 12px ${themeColors.brand.teal}40`,
              duration: 0.3,
              ease: 'power2.out',
            });
          }
          gsap.to(bellRef.current, { rotation: 15, scale: 1.1, duration: 0.3, ease: 'power2.out' });
        }
      }}
      onMouseLeave={() => {
        if (bellButtonRef.current && bellRef.current) {
          const btn = bellButtonRef.current.querySelector('button');
          gsap.to(bellButtonRef.current, { scale: 1.0, duration: 0.3, ease: 'power2.out' });
          if (btn) {
            gsap.to(btn, {
              boxShadow: count > 0
                ? '0 3px 12px rgba(239, 68, 68, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
                : `0 2px 6px ${themeColors.brand.teal}26`,
              duration: 0.3,
              ease: 'power2.out',
            });
          }
          gsap.to(bellRef.current, { rotation: 0, scale: 1.0, duration: 0.3, ease: 'power2.out' });
        }
      }}
    >
      {/* 1. Gradient Border */}
      <div
        className="absolute inset-[-2px] rounded-full z-0"
        style={{
          background: themeColors.brand.conic,
          boxShadow: `0 0 8px ${themeColors.brand.orange}26`
        }}
      />

      {/* 2. White Mask */}
      <div className="absolute inset-[1px] rounded-full bg-white z-0" />

      {/* 3. Inner Button */}
      <button
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
        <svg width="0" height="0" className="absolute">
          <linearGradient id="groo-bell-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={themeColors.brand.teal} />
            <stop offset="50%" stopColor={themeColors.brand.yellow} />
            <stop offset="100%" stopColor={themeColors.brand.orange} />
          </linearGradient>
        </svg>

        <FiBell
          ref={bellRef}
          className={`${size <= 38 ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300`}
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
          className="absolute -top-1 -right-1 bg-gradient-to-br from-red-500 to-red-600 text-white text-[9px] font-black rounded-full flex items-center justify-center z-20"
          style={{
            minWidth: size <= 38 ? '17px' : '20px',
            height: size <= 38 ? '17px' : '20px',
            boxShadow: '0 2px 6px rgba(239, 68, 68, 0.5), 0 0 0 2px #fff',
            border: '2px solid #fff'
          }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </div>
  );
};

export default NotificationBell;
