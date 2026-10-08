import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiBell,
  FiCheck,
  FiArrowLeft,
  FiTrash2,
  FiX,
  FiCheckCircle,
  FiDollarSign,
  FiHeadphones,
  FiClipboard,
  FiShoppingBag,
  FiChevronRight
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { themeColors } from '../../../../theme';
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
    // Optional: Set background color if needed, similar to Vendor
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient || '#f9fafb';

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

    // Listen for real-time updates (if implemented via window event or socket)
    const handleUpdate = () => fetchNotifications();
    window.addEventListener('userNotificationsUpdated', handleUpdate);

    return () => {
      window.removeEventListener('userNotificationsUpdated', handleUpdate);
    };
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await markAsRead(id);
      // Update local state to reflect change immediately
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error('Failed to mark as read', error);
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

    if (notif.data?.link) {
      navigate(notif.data.link);
      return;
    }

    const type = (notif.type || '').toLowerCase();
    const relatedType = (notif.relatedType || '').toLowerCase();
    const relatedId = notif.relatedId || notif.data?.bookingId || notif.bookingId;

    if (type.includes('support') || relatedType.includes('support')) {
      const tId = notif.data?.ticketId || notif.relatedId;
      navigate(`/user/help-support${tId ? `?ticketId=${tId}` : ''}`);
    } else if (type.includes('dispute') || relatedType.includes('dispute')) {
      if (relatedId) navigate(`/user/booking/${relatedId}`);
      else navigate('/user/my-bookings');
    } else if (type.includes('ecommerce') || type.includes('order')) {
      navigate('/user/my-agri-orders');
    } else if (type.includes('soil')) {
      navigate('/user/soil-testing');
    } else if (type.includes('wallet') || type.includes('refund')) {
      navigate('/user/wallet');
    } else if (
      relatedType === 'workerbookingrequest' ||
      notif.data?.requestId ||
      ['worker_booking', 'worker_request', 'day_completed', 'worker_arrived', 'worker_journey', 'worker_decreased', 'extra_worker', 'extension_'].some(k => type.includes(k))
    ) {
      const reqId = notif.data?.requestId || notif.relatedId;
      if (['worker_journey_started', 'worker_arrived', 'worker_work_submitted', 'day_completed'].some(k => type.includes(k))) {
        if (reqId) navigate(`/user/farmer-worker-request/${reqId}/track`);
        else navigate('/user/my-bookings');
      } else if (reqId) {
        navigate(`/user/farmer-worker-request/${reqId}`);
      } else {
        navigate('/user/my-bookings');
      }
    } else if (relatedType === 'booking' || ['booking', 'job', 'work', 'journey', 'trip', 'visit', 'vendor', 'cash', 'offline'].some(k => type.includes(k))) {
      if (relatedId) navigate(`/user/booking/${relatedId}`);
      else navigate('/user/my-bookings');
    } else if (relatedId) {
      navigate(`/user/booking/${relatedId}`);
    }
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'all') return true;

    const type = (notif.type || '').toLowerCase();

    if (filter === 'payments') {
      return ['payment_', 'refund_', 'wallet_', 'cash_payment', 'offline_payment', 'earnings_credit', 'decrease_refund', 'withdrawal'].some(prefix => type.includes(prefix));
    }

    if (filter === 'jobs') { // Mapped to 'Bookings' in UI
      return ['booking_', 'job_', 'worker_', 'visit_', 'work_', 'journey_', 'vendor_', 'soil_test_', 'trip_', 'timer_', 'service_timer_', 'cash_payment', 'offline_payment', 'day_completed', 'extension_'].some(prefix => type.includes(prefix));
    }

    if (filter === 'alerts') {
      return ['alert', 'general', 'security', 'account'].some(prefix => type.includes(prefix));
    }

    return type === filter;
  });

  const cleanTitle = (title) => {
    if (!title) return '';
    // Strip leading emojis like ✅, 📢, 🎧 so titles are clean next to icon badges
    return title.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{203C}\u{2049}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]+\s*/gu, '').trim();
  };

  const renderNotificationIcon = (originalType) => {
    const type = (originalType || '').toLowerCase();

    if (['payment', 'refund', 'wallet', 'withdrawal', 'credit'].some(t => type.includes(t))) {
      return <FiCheckCircle className="w-4 h-4 text-white" />;
    }
    if (['support', 'ticket'].some(t => type.includes(t))) {
      return <FiHeadphones className="w-4 h-4 text-white" />;
    }
    if (['worker', 'farmer', 'booking', 'job', 'work', 'visit', 'journey', 'vendor', 'scrap', 'soil_test'].some(t => type.includes(t))) {
      return <FiClipboard className="w-4 h-4 text-white" />;
    }
    if (['ecommerce', 'order', 'cart'].some(t => type.includes(t))) {
      return <FiShoppingBag className="w-4 h-4 text-white" />;
    }

    return <FiBell className="w-4 h-4 text-white" />;
  };

  const getNotificationGradient = (originalType) => {
    const type = (originalType || '').toLowerCase();

    if (['payment', 'refund', 'wallet', 'withdrawal', 'credit'].some(t => type.includes(t))) {
      return 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20';
    }
    if (['support', 'ticket'].some(t => type.includes(t))) {
      return 'bg-gradient-to-br from-teal-500 to-emerald-600 shadow-teal-500/20';
    }
    if (['worker', 'farmer', 'booking', 'job', 'work', 'visit', 'journey', 'vendor', 'scrap', 'soil_test'].some(t => type.includes(t))) {
      return 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20';
    }
    if (['ecommerce', 'order', 'cart'].some(t => type.includes(t))) {
      return 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-500/20';
    }

    return 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20';
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient || '#f9fafb' }}>
      {/* Header */}
      <div className="bg-white sticky top-0 z-50 border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-50 rounded-full transition-colors active:scale-95"
          >
            <FiArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-gray-900 tracking-tight">Notifications</h1>
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                {notifications.filter(n => !n.read).length} new
              </span>
            )}
          </div>
        </div>
      </div>

      <main className="px-3.5 py-4 max-w-2xl mx-auto space-y-3">
        {/* Filter Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { id: 'all', label: `All (${notifications.length})` },
            { id: 'jobs', label: 'Bookings' },
            { id: 'payments', label: 'Payments' },
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
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-scale-in">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
                <FiTrash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Clear All Notifications?</h3>
              <p className="text-sm text-gray-500 mt-2">This action cannot be undone.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearAll}
                className="py-3 rounded-xl font-bold text-white bg-red-500 shadow-lg shadow-red-500/30 active:scale-95 transition-all"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
