import React, { useState, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  FiBell,
  FiCheck,
  FiX,
  FiFilter,
  FiTrash2,
  FiCheckCircle,
  FiHeadphones,
  FiClipboard,
  FiShoppingBag,
  FiChevronRight
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  formatNotificationTime
} from '../../services/notificationService';

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [filter, setFilter] = useState('all'); // all, alerts, jobs, payments

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

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await getNotifications();
      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Listen for real-time updates (if implemented via window event)
    const handleUpdate = () => fetchNotifications();
    window.addEventListener('vendorNotificationsUpdated', handleUpdate);

    return () => {
      window.removeEventListener('vendorNotificationsUpdated', handleUpdate);
    };
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await markAsRead(id);
      // Update local state to reflect change immediately
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
      toastManager.success('Notification marked as read');
    } catch (error) {
      console.error('Failed to mark as read', error);
      toastManager.error('Failed to mark as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toastManager.success('All marked as read');
    } catch (error) {
      console.error('Failed to mark all as read', error);
      toastManager.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      toastManager.success('Notification removed');
    } catch (error) {
      console.error('Failed to delete notification', error);
      toastManager.error('Failed to delete');
    }
  };

  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  const confirmClearAll = async () => {
    try {
      await deleteAllNotifications();
      setNotifications([]);
      toastManager.success('All notifications cleared');
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Failed to clear notifications', error);
      toastManager.error('Failed to clear');
      setShowClearConfirm(false);
    }
  };

  const handleNotificationClick = (notif) => {
    // Mark as read when clicked
    if (!notif.read) {
      handleMarkAsRead(notif.id);
    }

    // Extraction of path based on type or related metadata
    const type = (notif.type || '').toLowerCase();
    const relatedType = (notif.relatedType || '').toLowerCase();
    const relatedId = notif.relatedId || notif.bookingId || notif.itemId;

    if (relatedType === 'booking' || type.includes('booking') || type.includes('job') || type.includes('work')) {
      if (relatedId) navigate(`/vendor/booking/${relatedId}`);
      else navigate('/vendor/jobs');
    } else if (type.includes('soil')) {
      navigate('/vendor/soil-tests');
    } else if (type.includes('payment') || type.includes('wallet') || type.includes('payout')) {
      navigate('/vendor/wallet');
    } else if (type.includes('compliance')) {
      navigate('/vendor/compliance');
    } else if (type.includes('profile')) {
      navigate('/vendor/profile/details');
    } else if (type.includes('ecommerce') || type.includes('order')) {
      navigate('/vendor/store/orders');
    } else if (type.includes('dispute') || relatedType === 'dispute') {
      const bId = notif.data?.bookingId || notif.bookingId;
      if (bId) navigate(`/vendor/booking/${bId}`);
      else navigate('/vendor/jobs');
    }
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'all') return true;

    const type = (notif.type || '').toLowerCase();

    if (filter === 'payments') {
      return ['payment_', 'payout_', 'wallet_', 'refund_'].some(prefix => type.includes(prefix));
    }

    if (filter === 'jobs') {
      return ['booking_', 'job_', 'worker_', 'visit_', 'work_', 'journey_', 'vendor_'].some(prefix => type.includes(prefix));
    }

    if (filter === 'alerts') {
      return ['alert', 'general', 'security', 'account'].some(prefix => type.includes(prefix));
    }

    return type === filter;
  });

  const cleanTitle = (title) => {
    if (!title) return '';
    return title.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{203C}\u{2049}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]+\s*/gu, '').trim();
  };

  const renderNotificationIcon = (originalType) => {
    const type = (originalType || '').toLowerCase();

    if (['payment', 'refund', 'wallet', 'payout', 'credit'].some(t => type.includes(t))) {
      return <FiCheckCircle className="w-4 h-4 text-white" />;
    }
    if (['support', 'ticket'].some(t => type.includes(t))) {
      return <FiHeadphones className="w-4 h-4 text-white" />;
    }
    if (['booking', 'job', 'work', 'visit', 'journey', 'vendor'].some(t => type.includes(t))) {
      return <FiClipboard className="w-4 h-4 text-white" />;
    }
    if (['ecommerce', 'order', 'cart'].some(t => type.includes(t))) {
      return <FiShoppingBag className="w-4 h-4 text-white" />;
    }

    return <FiBell className="w-4 h-4 text-white" />;
  };

  const getNotificationGradient = (originalType) => {
    const type = (originalType || '').toLowerCase();

    if (['payment', 'refund', 'wallet', 'payout', 'credit'].some(t => type.includes(t))) {
      return 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20';
    }
    if (['support', 'ticket'].some(t => type.includes(t))) {
      return 'bg-gradient-to-br from-teal-500 to-emerald-600 shadow-teal-500/20';
    }
    if (['booking', 'job', 'work', 'visit', 'journey', 'vendor'].some(t => type.includes(t))) {
      return 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20';
    }
    if (['ecommerce', 'order', 'cart'].some(t => type.includes(t))) {
      return 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-500/20';
    }

    return 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20';
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Notifications" />

      <main className="px-3.5 py-4 max-w-2xl mx-auto space-y-3">
        {/* Filter Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { id: 'all', label: `All (${notifications.length})` },
            { id: 'jobs', label: 'Rentals & Bookings' },
            { id: 'payments', label: 'Payouts & Earnings' },
          ].map((filterOption) => (
            <button
              key={filterOption.id}
              onClick={() => setFilter(filterOption.id)}
              className={`px-3.5 py-1.5 rounded-full font-bold text-xs whitespace-nowrap transition-all ${
                filter === filterOption.id
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-white text-gray-600 border border-gray-200/80 hover:bg-gray-50 shadow-2xs'
              }`}
            >
              {filterOption.label}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        {notifications.length > 0 && (
          <div className="flex items-center justify-between px-1 pt-0.5 pb-0.5">
            <span className="text-[11px] font-semibold text-gray-400">
              Showing {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 transition-colors flex items-center gap-1"
              >
                <FiCheck className="w-3 h-3" />
                Mark All Read
              </button>
              <button
                onClick={handleClearAll}
                className="text-[11px] font-bold text-red-500 hover:text-red-700 transition-colors flex items-center gap-1"
              >
                <FiTrash2 className="w-3 h-3" />
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Notifications List */}
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow-2xs border border-gray-100 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 shrink-0"></div>
                  <div className="flex-1 space-y-1.5 py-0.5">
                    <div className="h-3.5 w-1/3 bg-gray-100 rounded"></div>
                    <div className="h-3 w-4/5 bg-gray-100 rounded"></div>
                    <div className="h-2 w-1/4 bg-gray-50 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-2xs space-y-2.5">
            <div className="w-12 h-12 mx-auto bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <FiBell className="w-6 h-6" />
            </div>
            <div>
              <p className="text-gray-900 font-bold text-sm">No Notifications</p>
              <p className="text-xs text-gray-500 mt-0.5">You are all caught up! Check back later for updates.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`group relative bg-white rounded-xl p-3 transition-all cursor-pointer border ${
                  !notif.read
                    ? 'border-emerald-200/90 bg-gradient-to-r from-emerald-50/40 via-white to-white shadow-xs'
                    : 'border-gray-100 hover:border-gray-200 shadow-2xs hover:shadow-xs'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Icon Badge */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs ${getNotificationGradient(notif.type)}`}>
                    {renderNotificationIcon(notif.type)}
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 min-w-0 pr-14">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-2xs" title="Unread" />
                      )}
                      <h3 className={`text-xs sm:text-sm tracking-tight text-gray-900 leading-tight truncate ${!notif.read ? 'font-black text-gray-950' : 'font-bold'}`}>
                        {cleanTitle(notif.title)}
                      </h3>
                    </div>

                    <p className="text-[11px] sm:text-xs text-gray-600 leading-snug line-clamp-2">
                      {notif.message}
                    </p>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                      <span>{formatNotificationTime(notif.createdAt || notif.time)}</span>
                      <span className="text-emerald-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                        View details <FiChevronRight className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Top Right */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                  {!notif.read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(notif.id);
                      }}
                      className="p-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors shadow-2xs"
                      title="Mark as read"
                    >
                      <FiCheck className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDelete(e, notif.id)}
                    className="p-1 rounded-lg bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors shadow-2xs"
                    title="Delete"
                  >
                    <FiX className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />

      {/* Confirmation Modal */}
      {showClearConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-scale-in">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
                <FiTrash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-black text-slate-800">Clear All Notifications?</h3>
              <p className="text-xs font-bold text-slate-400 mt-2">This action cannot be undone.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="py-3.5 rounded-2xl font-black text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[10px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearAll}
                className="py-3.5 rounded-2xl font-black text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20 active:scale-95 transition-all uppercase tracking-widest text-[10px]"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Notifications;
