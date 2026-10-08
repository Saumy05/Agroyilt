import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiCheck, FiBriefcase, FiChevronRight, FiTrash2, FiX } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import workerService from '../../../../services/workerService';
import { toastManager } from '../../../../utils/toastManager';

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

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
      const response = await workerService.getNotifications();
      if (response.success) {
        setNotifications(response.data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const handleUpdate = () => {
      fetchNotifications();
    };
    window.addEventListener('workerNotificationsUpdated', handleUpdate);

    return () => {
      window.removeEventListener('workerNotificationsUpdated', handleUpdate);
    };
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      const response = await workerService.markNotificationAsRead(id);
      if (response.success) {
        setNotifications(notifications.map(n =>
          n._id === id ? { ...n, isRead: true } : n
        ));
      }
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await workerService.markAllNotificationsAsRead();
      if (response.success) {
        setNotifications(notifications.map(n => ({ ...n, isRead: true })));
        toastManager.success('All marked as read');
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
      toastManager.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      const response = await workerService.deleteNotification(id);
      if (response.success) {
        setNotifications(prev => prev.filter(n => n._id !== id));
        toastManager.success('Notification removed');
      }
    } catch (err) {
      console.error('Delete failed', err);
      toastManager.error('Failed to delete');
    }
  };

  const handleClearAll = () => {
    if (notifications.length === 0) return;
    setShowClearConfirm(true);
  };

  const confirmClearAll = async () => {
    try {
      const response = await workerService.deleteAllNotifications();
      if (response.success) {
        setNotifications([]);
        toastManager.success('All notifications cleared');
      }
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Failed to clear', error);
      toastManager.error('Failed to clear');
      setShowClearConfirm(false);
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.isRead) {
      handleMarkAsRead(notif._id);
    }

    if (notif.data?.link) {
      navigate(notif.data.link);
      return;
    }

    const type = (notif.type || '').toLowerCase();
    const relatedType = (notif.relatedType || '').toLowerCase();
    const targetId = notif.relatedId || notif.data?.assignmentId || notif.data?.bookingId || notif.data?.requestId;

    if (type.includes('team')) {
      navigate('/worker/team');
    } else if (type === 'group_booking_request' || type === 'group_member_request') {
      navigate('/worker/group-requests');
    } else if (['worker_booking_request', 'new_booking_request', 'job_request', 'extra_worker_dispatch'].includes(type)) {
      navigate('/worker/booking-requests');
    } else if (type.includes('wallet') || ['assignment_settled', 'earnings_credit', 'payment_received', 'payout_processed', 'cash_collected'].includes(type)) {
      navigate('/worker/wallet');
    } else if (type.includes('support') || relatedType.includes('support')) {
      navigate('/worker/help-support');
    } else if (targetId) {
      navigate(`/worker/job/${targetId}`);
    } else {
      navigate('/worker/jobs');
    }
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'all') return true;
    const t = (notif.type || '').toLowerCase();
    if (filter === 'team') return t.includes('team');
    if (filter === 'job') return t.includes('job') || t.includes('booking') || t.includes('work') || t.includes('journey') || t.includes('extension') || t.includes('day_completed');
    if (filter === 'payment') return t.includes('payment') || t.includes('wallet') || t.includes('settled') || t.includes('earning') || t.includes('cash');
    return true;
  });

  const cleanTitle = (title) => {
    if (!title) return '';
    return title.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{203C}\u{2049}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]+\s*/gu, '').trim();
  };

  const getNotificationIcon = (type = '') => {
    const t = type.toLowerCase();
    if (t.includes('team')) return <span className="text-sm font-bold">👥</span>;
    if (t.includes('payment') || t.includes('wallet') || t.includes('settled') || t.includes('earning')) return <span className="text-sm font-black">₹</span>;
    if (t.includes('job') || t.includes('booking') || t.includes('work') || t.includes('journey') || t.includes('extension')) return <FiBriefcase className="w-4 h-4" />;
    return <FiBell className="w-4 h-4" />;
  };

  const getNotificationGradient = (type = '') => {
    const t = type.toLowerCase();
    if (t.includes('team')) return 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-500/20';
    if (t.includes('payment') || t.includes('wallet') || t.includes('settled') || t.includes('earning')) return 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20';
    if (t.includes('job') || t.includes('booking') || t.includes('work') || t.includes('journey') || t.includes('extension')) return 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20';
    return 'bg-gradient-to-br from-emerald-600 to-teal-700 shadow-emerald-600/20';
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

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
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Notifications" />

      <main className="px-3.5 py-4 max-w-2xl mx-auto space-y-3">
        {/* Filter Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { id: 'all', label: `All (${notifications.length})` },
            { id: 'job', label: 'Jobs & Requests' },
            { id: 'team', label: 'Team' },
            { id: 'payment', label: 'Earnings & Payments' },
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
              {notifications.some(n => !n.isRead) && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 transition-colors flex items-center gap-1"
                >
                  <FiCheck className="w-3 h-3" />
                  Mark Read
                </button>
              )}
              <button
                onClick={handleClearAll}
                className="text-[11px] font-bold text-red-500 hover:text-red-700 transition-colors flex items-center gap-1"
              >
                <FiTrash2 className="w-3 h-3" /> Clear All
              </button>
            </div>
          </div>
        )}

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
              <p className="text-xs text-gray-500 mt-0.5">You will see notifications here when you receive job assignments or payments.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredNotifications.map((notif) => {
              const isUnread = !notif.isRead;

              return (
                <div
                  key={notif._id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`group relative bg-white rounded-xl p-3 transition-all cursor-pointer border ${
                    isUnread
                      ? 'border-emerald-200/90 bg-gradient-to-r from-emerald-50/40 via-white to-white shadow-xs'
                      : 'border-gray-100 hover:border-gray-200 shadow-2xs hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Icon Badge */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs ${getNotificationGradient(notif.type)}`}>
                      {getNotificationIcon(notif.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-14">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-2xs" title="Unread" />
                        )}
                        <h3 className={`text-xs sm:text-sm tracking-tight text-gray-900 leading-tight truncate ${isUnread ? 'font-black text-gray-950' : 'font-bold'}`}>
                          {cleanTitle(notif.title)}
                        </h3>
                      </div>

                      <p className="text-[11px] sm:text-xs text-gray-600 leading-snug line-clamp-2">
                        {notif.message}
                      </p>

                      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                        <span>{formatTime(notif.createdAt)}</span>
                        <span className="text-emerald-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                          View details <FiChevronRight className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Top Right */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                    {isUnread && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(notif._id);
                        }}
                        className="p-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors shadow-2xs"
                        title="Mark as read"
                      >
                        <FiCheck className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, notif._id)}
                      className="p-1 rounded-lg bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors shadow-2xs"
                      title="Delete"
                    >
                      <FiX className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
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
