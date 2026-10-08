import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBell, FiCheck, FiX, FiInfo, FiTrash2, FiShoppingBag, FiAlertTriangle } from 'react-icons/fi';

const BookingNotifications = () => {
  const [filter, setFilter] = useState('All Types');
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: 'New Booking Received',
      message: 'Booking #ORD-001 has been placed by John Doe',
      time: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      bookingId: 'ORD-001',
      type: 'new_booking',
      unread: true,
    },
    {
      id: 2,
      title: 'Booking Cancelled',
      message: 'Booking #ORD-002 has been cancelled by customer',
      time: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      bookingId: 'ORD-002',
      type: 'cancelled',
      unread: true,
    },
    {
      id: 3,
      title: 'Payment Failed',
      message: 'Payment for Booking #ORD-003 has failed',
      time: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      bookingId: 'ORD-003',
      type: 'payment_failed',
      unread: false,
    }
  ]);

  const unreadCount = notifications.filter(n => n.unread).length;

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, unread: false })));
  };

  const deleteNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const markAsRead = (id) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, unread: false } : n));
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
      case 'new_booking': return <FiShoppingBag className="text-white w-4 h-4" />;
      case 'cancelled': return <FiX className="text-white w-4 h-4" />;
      case 'payment_failed': return <FiAlertTriangle className="text-white w-4 h-4" />;
      default: return <FiInfo className="text-white w-4 h-4" />;
    }
  };

  const getGradient = (type) => {
    switch (type) {
      case 'new_booking': return 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20';
      case 'cancelled': return 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/20';
      case 'payment_failed': return 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20';
      default: return 'bg-gradient-to-br from-gray-500 to-slate-600 shadow-gray-500/20';
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
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
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs"
          >
            Mark All Read
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl shadow-2xs border border-gray-100 overflow-hidden divide-y divide-gray-100">
        <AnimatePresence>
          {notifications.filter(n => filter === 'All Types' || n.type === filter).length === 0 ? (
            <div className="p-8 text-center text-xs font-medium text-gray-500">No booking notifications</div>
          ) : (
            notifications.filter(n => filter === 'All Types' || n.type === filter).map((notification) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`p-3 flex items-start justify-between hover:bg-gray-50/60 transition-colors group relative ${notification.unread ? 'bg-gradient-to-r from-blue-50/30 via-white to-white' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${getGradient(notification.type)}`}>
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {notification.unread && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      )}
                      <h3 className={`text-xs sm:text-sm ${notification.unread ? 'font-black text-gray-950' : 'font-bold text-gray-800'}`}>
                        {cleanTitle(notification.title)}
                      </h3>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 ml-1">
                        {notification.bookingId}
                      </span>
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
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <FiCheck className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default BookingNotifications;
