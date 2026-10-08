import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBell, FiRefreshCw, FiCheck, FiCheckCircle, FiTrash2, FiFilter, FiUser, FiDollarSign, FiUserCheck } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { formatDistanceToNow } from 'date-fns';
import api from '../../../../services/api';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unread, read
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications', {
        params: { limit: 50 }
      });
      if (res.data.success) {
        setNotifications(res.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toastManager.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
    toastManager.success('Notifications refreshed');
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, isRead: true } : n)
      );
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      toastManager.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toastManager.error('Failed to mark all as read');
    }
  };

  const deleteNotification = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n._id !== id));
      toastManager.success('Notification deleted');
    } catch (error) {
      console.error('Error deleting notification:', error);
      toastManager.error('Failed to delete notification');
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
      hour12: true
    });
  };

  const getIcon = (type) => {
    switch (type) {
      case 'vendor_withdrawal_request':
        return <FiDollarSign className="text-white w-4 h-4" />;
      case 'vendor_approval_request':
        return <FiUserCheck className="text-white w-4 h-4" />;
      case 'vendor_cash_limit_exceeded':
        return <FiDollarSign className="text-white w-4 h-4" />;
      default:
        return <FiBell className="text-white w-4 h-4" />;
    }
  };

  const getGradient = (type) => {
    switch (type) {
      case 'vendor_withdrawal_request':
        return 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20';
      case 'vendor_approval_request':
        return 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20';
      case 'vendor_cash_limit_exceeded':
        return 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/20';
      default:
        return 'bg-gradient-to-br from-emerald-600 to-teal-700 shadow-emerald-600/20';
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'read') return n.isRead;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 max-w-4xl mx-auto"
    >
      {/* Header */}
      <div className="bg-white rounded-xl p-4 shadow-2xs border border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <FiBell className="text-lg" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900 tracking-tight">System Notifications</h1>
              <p className="text-xs text-gray-500">
                {unreadCount > 0 ? `${unreadCount} unread requests requiring attention` : 'All caught up!'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 shadow-2xs"
              disabled={refreshing}
              title="Refresh"
            >
              <FiRefreshCw className={`text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 border border-emerald-200/80 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
              >
                <FiCheckCircle className="text-sm text-emerald-600" />
                Mark All Read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  if (window.confirm('Are you sure you want to delete all notifications?')) {
                    try {
                      await api.delete('/notifications/delete-all');
                      setNotifications([]);
                      toastManager.success('All notifications cleared');
                    } catch (error) {
                      console.error('Error clearing notifications:', error);
                      toastManager.error('Failed to clear notifications');
                    }
                  }
                }}
                className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200/80 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
              >
                <FiTrash2 className="text-sm" />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
          {['all', 'unread', 'read'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                filter === f
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-gray-600 hover:bg-gray-100 border border-gray-200/80'
              }`}
            >
              {f} {f === 'all' ? `(${notifications.length})` : f === 'unread' ? `(${unreadCount})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl shadow-2xs border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-600 mx-auto"></div>
            <p className="text-xs text-gray-500 mt-2 font-medium">Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <FiBell className="text-3xl text-gray-300 mx-auto" />
            <p className="text-sm font-bold text-gray-800">No notifications found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <AnimatePresence>
              {filteredNotifications.map(notification => (
                <motion.div
                  key={notification._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`p-3 transition-all flex items-start gap-3 relative group ${
                    !notification.isRead ? 'bg-gradient-to-r from-emerald-50/40 via-white to-white' : 'hover:bg-gray-50/60'
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${getGradient(notification.type)}`}>
                    {getIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-12">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {!notification.isRead && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-2xs" title="Unread" />
                      )}
                      <p className={`text-xs sm:text-sm tracking-tight ${!notification.isRead ? 'font-black text-gray-950' : 'font-bold text-gray-800'}`}>
                        {cleanTitle(notification.title)}
                      </p>
                    </div>
                    <p className="text-[11px] sm:text-xs text-gray-600 leading-snug line-clamp-2">
                      {notification.message}
                    </p>

                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                      <span>{formatNotificationTime(notification.createdAt)}</span>
                      {!notification.isRead && (
                        <button
                          onClick={() => markAsRead(notification._id)}
                          className="text-emerald-700 font-bold hover:underline flex items-center gap-1"
                        >
                          <FiCheck className="w-3 h-3" /> Mark read
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                    <button
                      onClick={() => deleteNotification(notification._id)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shadow-2xs"
                      title="Delete"
                    >
                      <FiCheckCircle className="w-3.5 h-3.5 hidden" />
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default Notifications;
