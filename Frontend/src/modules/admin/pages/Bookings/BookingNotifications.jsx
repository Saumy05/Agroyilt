import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FiBell, FiCheck, FiX, FiInfo, FiTrash2, FiShoppingBag,
  FiAlertTriangle, FiExternalLink, FiClock, FiCheckCircle,
  FiBox, FiArrowRight, FiRefreshCw
} from 'react-icons/fi';
import api from '../../../../services/api';
import { adminBookingService } from '../../../../services/adminBookingService';
import { refreshAdminCounts } from '../../utils/adminCounts';
import { toastManager } from '../../../../utils/toastManager';

const BookingNotifications = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('All Types');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Booking stats overview
  const [bookingStats, setBookingStats] = useState({
    awaiting: 0,
    confirmed: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    total: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStatusCounts = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await adminBookingService.getAllBookings({ limit: 1 });
      if (res.success && res.statusCounts) {
        setBookingStats({
          awaiting: res.statusCounts.awaiting || 0,
          confirmed: res.statusCounts.confirmed || 0,
          inProgress: res.statusCounts.inProgress || 0,
          completed: res.statusCounts.completed || 0,
          cancelled: res.statusCounts.cancelled || 0,
          total: res.pagination?.total || 0
        });
      }
    } catch (err) {
      console.error('Failed to load status counts in notifications:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchBookingNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filter !== 'All Types') params.filter = filter;
      const res = await api.get('/notifications/admin/bookings', { params });
      if (res.data?.success && Array.isArray(res.data.data)) {
        setNotifications(
          res.data.data.map((n) => ({
            id: n._id,
            title: n.title,
            message: n.message,
            time: n.createdAt,
            bookingId: n.data?.bookingId || n.data?.bookingNumber || n.data?.requestId || n.relatedId || 'Booking',
            type: n.type,
            unread: !n.isRead,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load booking notifications:', error);
      toastManager.error('Failed to load booking notifications');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchBookingNotifications();
    fetchStatusCounts();
  }, [fetchBookingNotifications, fetchStatusCounts]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const markAllRead = async () => {
    try {
      await api.put('/notifications/admin/bookings/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
      refreshAdminCounts();
      toastManager.success('All booking notifications marked as read');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toastManager.error('Failed to mark notifications as read');
    }
  };

  const deleteNotification = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      refreshAdminCounts();
    } catch (error) {
      console.error('Failed to delete notification:', error);
      toastManager.error('Failed to delete notification');
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
      refreshAdminCounts();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      toastManager.error('Failed to mark notification as read');
    }
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
      hour12: true,
    });
  };

  const getIcon = (type) => {
    if (type?.includes('cancel') || type?.includes('reject')) return <FiX className="text-white w-4 h-4" />;
    if (type?.includes('complete') || type?.includes('done')) return <FiCheck className="text-white w-4 h-4" />;
    if (type?.includes('payment') || type?.includes('due')) return <FiAlertTriangle className="text-white w-4 h-4" />;
    if (type?.includes('create') || type?.includes('request') || type?.includes('confirm')) return <FiShoppingBag className="text-white w-4 h-4" />;
    return <FiInfo className="text-white w-4 h-4" />;
  };

  const getGradient = (type) => {
    if (type?.includes('cancel') || type?.includes('reject')) return 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/20';
    if (type?.includes('complete') || type?.includes('done')) return 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20';
    if (type?.includes('payment') || type?.includes('due')) return 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20';
    if (type?.includes('create') || type?.includes('request') || type?.includes('confirm')) return 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20';
    return 'bg-gradient-to-br from-gray-500 to-slate-600 shadow-gray-500/20';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Live Booking Status Overview Strip */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl shadow-2xs border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-gray-800">Booking Status Overview</h2>
            <span className="text-[10px] text-gray-400 font-medium hidden sm:inline">• Live counts</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/bookings')}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <span>All Bookings</span>
            <FiArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Awaiting / Pending Acceptance */}
          <div
            onClick={() => navigate('/admin/bookings')}
            className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 hover:border-amber-300 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-amber-900">Pending</span>
              <div className="w-6 h-6 rounded-md bg-amber-200/60 flex items-center justify-center text-amber-700">
                <FiClock className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-lg sm:text-xl font-black text-amber-900">
              {statsLoading ? '...' : bookingStats.awaiting}
            </p>
            <p className="text-[10px] text-amber-700 font-medium">Abhi accept nahi hui</p>
          </div>

          {/* Accepted & Confirmed */}
          <div
            onClick={() => navigate('/admin/bookings')}
            className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 hover:border-blue-300 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-blue-900">Accepted</span>
              <div className="w-6 h-6 rounded-md bg-blue-200/60 flex items-center justify-center text-blue-700">
                <FiCheckCircle className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-lg sm:text-xl font-black text-blue-900">
              {statsLoading ? '...' : bookingStats.confirmed}
            </p>
            <p className="text-[10px] text-blue-700 font-medium">Accept ho chuki hai</p>
          </div>

          {/* In Progress */}
          <div
            onClick={() => navigate('/admin/bookings')}
            className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/80 hover:border-purple-300 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-purple-900">In Progress</span>
              <div className="w-6 h-6 rounded-md bg-purple-200/60 flex items-center justify-center text-purple-700">
                <FiBox className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-lg sm:text-xl font-black text-purple-900">
              {statsLoading ? '...' : bookingStats.inProgress}
            </p>
            <p className="text-[10px] text-purple-700 font-medium">Kaam chal raha hai</p>
          </div>

          {/* Total Orders */}
          <div
            onClick={() => navigate('/admin/bookings')}
            className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-800">Total Bookings</span>
              <div className="w-6 h-6 rounded-md bg-slate-200/70 flex items-center justify-center text-slate-700">
                <FiShoppingBag className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-lg sm:text-xl font-black text-slate-900">
              {statsLoading ? '...' : bookingStats.total}
            </p>
            <p className="text-[10px] text-slate-500 font-medium">Kul orders</p>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white p-3.5 rounded-xl shadow-2xs border border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer min-w-[140px]"
          >
            <option value="All Types">All Types</option>
            <option value="new_booking">New Bookings</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="payment_failed">Payment Issues</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-black px-2.5 py-1 rounded-md">
              {unreadCount} unread
            </span>
          )}
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            Mark All Read
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl shadow-2xs border border-gray-100 overflow-hidden divide-y divide-gray-100">
        {loading ? (
          <div className="p-8 text-center text-xs font-medium text-gray-500">Loading booking notifications...</div>
        ) : (
          <AnimatePresence>
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs font-medium text-gray-500">No booking notifications</div>
            ) : (
              notifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`p-3 flex items-start justify-between hover:bg-gray-50/60 transition-colors group relative ${
                    notification.unread ? 'bg-gradient-to-r from-blue-50/30 via-white to-white' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${getGradient(notification.type)}`}>
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {notification.unread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                        <h3 className={`text-xs sm:text-sm ${notification.unread ? 'font-black text-gray-950' : 'font-bold text-gray-800'}`}>
                          {cleanTitle(notification.title)}
                        </h3>
                        {notification.bookingId && notification.bookingId !== 'Booking' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/bookings/${notification.bookingId}`);
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-100 transition-colors cursor-pointer ml-1"
                            title="View Booking"
                          >
                            <span>{notification.bookingId}</span>
                            <FiExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] sm:text-xs text-gray-600 leading-snug">{notification.message}</p>
                      <div className="mt-1 text-[10px] text-gray-400 font-medium">
                        {formatNotificationTime(notification.time)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {notification.unread && (
                      <button
                        title="Mark as read"
                        onClick={() => markAsRead(notification.id)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <FiCheck className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notification.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
};

export default BookingNotifications;
