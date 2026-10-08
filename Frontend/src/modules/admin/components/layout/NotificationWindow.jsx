import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBell, FiCheck, FiX, FiChevronRight } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

// NotificationWindow now controlled by parent (AdminHeader)
const NotificationWindow = ({
  isOpen,
  onClose,
  position = 'right',
  notifications = [],
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete
}) => {
  const navigate = useNavigate();
  const windowRef = useRef(null);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (windowRef.current && !windowRef.current.contains(event.target)) {
        if (!event.target.closest('[data-notification-button]')) {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleNotificationClick = (notification) => {
    if (!notification.isRead && onMarkAsRead) {
      onMarkAsRead(notification._id || notification.id);
    }

    const type = (notification.type || '').toLowerCase();
    const relatedType = (notification.relatedType || '').toLowerCase();
    const title = (notification.title || '').toLowerCase();

    // Redirection logic for Admin
    if (relatedType === 'booking' || type.includes('booking')) {
      navigate('/admin/bookings');
    } else if (relatedType === 'soil' || type.includes('soil') || title.includes('soil')) {
      navigate('/admin/soil-tests');
    } else if (relatedType === 'scrap' || type.includes('scrap')) {
      navigate('/admin/scrap');
    } else if (type.includes('payment')) {
      navigate('/admin/payments');
    } else if (type.includes('kyc') || type.includes('verification')) {
      navigate('/admin/users/kyc');
    } else if (type.includes('withdraw') || type.includes('settlement')) {
      navigate('/admin/settlements');
    } else if (type.includes('store') || type.includes('shop')) {
      navigate('/admin/marketplace/store-approvals');
    }

    onClose();
  };

  const positionClasses = {
    right: 'right-0',
    left: 'left-0',
  };

  const cleanTitle = (title) => {
    if (!title) return '';
    return title.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{203C}\u{2049}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]+\s*/gu, '').trim();
  };

  const formatNotificationTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) {
      const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `Yesterday, ${timeStr}`;
    }
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-[9999] lg:hidden"
          />

          <motion.div
            ref={windowRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed lg:absolute ${positionClasses[position]} top-[calc(4rem-40px)] lg:top-full lg:-mt-[38px] right-[11px] lg:-right-[5px] z-[10000] w-[calc(100vw-2rem)] sm:w-96 max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 max-h-[calc(100vh-8rem)] flex flex-col overflow-hidden`}
            style={{ willChange: 'transform' }}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 p-3.5 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-gray-900 tracking-tight">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-extrabold rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllAsRead}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <FiX className="text-base" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-admin">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <FiBell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="font-bold text-sm text-gray-800">No notifications</p>
                  <p className="text-xs text-gray-400 mt-0.5">You're all caught up.</p>
                </div>
              ) : (
                <div className="p-2 space-y-1.5">
                  {notifications.map((n) => (
                    <div
                      key={n._id || n.id}
                      className={`p-2.5 rounded-xl border relative cursor-pointer transition-all hover:shadow-2xs ${
                        n.isRead ? 'bg-white border-gray-100' : 'bg-gradient-to-r from-emerald-50/40 via-white to-white border-emerald-200/80 shadow-2xs'
                      }`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Notification Icon */}
                        <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                          <FiBell className="w-4 h-4" />
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                            <p className={`text-xs truncate ${!n.isRead ? 'font-black text-gray-900' : 'font-bold text-gray-700'}`}>
                              {cleanTitle(n.title)}
                            </p>
                          </div>
                          <p className="text-[11px] text-gray-600 line-clamp-2 leading-snug">{n.message}</p>
                          <p className="text-[10px] text-gray-400 mt-1 font-medium">{formatNotificationTime(n.createdAt)}</p>
                        </div>

                        {/* Actions */}
                        <div className="absolute top-2.5 right-2 flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const id = n._id || n.id;
                              if (onDelete && id) onDelete(id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <FiX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationWindow;


