import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiBell,
  FiRefreshCw,
  FiCheck,
  FiCheckCircle,
  FiTrash2,
  FiFilter,
  FiSearch,
  FiDollarSign,
  FiUserCheck,
  FiShoppingBag,
  FiAlertTriangle,
  FiActivity,
  FiChevronRight,
  FiCalendar,
  FiInbox,
  FiShield,
  FiUser,
  FiUsers,
  FiBriefcase
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { toastManager } from '../../../../utils/toastManager';
import authStorage from '../../../../utils/authStorage';
import api from '../../../../services/api';

// Demo notifications tagged with targetRole & modulePermission for role-based filtering
const INITIAL_DEMO_NOTIFICATIONS = [
  {
    _id: 'demo-1',
    title: 'Vendor Withdrawal Request',
    message: 'Ramesh Patel requested a withdrawal of ₹12,500 via UPI (Ref: WTH-9842)',
    type: 'vendor_withdrawal_request',
    relatedType: 'withdrawal',
    targetRole: 'Finance Admin',
    modulePermission: 'settlements.view',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString()
  },
  {
    _id: 'demo-2',
    title: 'New Store Approval Request',
    message: 'Green Agri Supermarket submitted shop documents for verification.',
    type: 'vendor_approval_request',
    relatedType: 'store',
    targetRole: 'Vendor Admin',
    modulePermission: 'marketplace.view',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString()
  },
  {
    _id: 'demo-3',
    title: 'Cash Limit Exceeded Warning',
    message: 'Vendor Vijay Kumar exceeded the maximum cash on hand limit of ₹25,000.',
    type: 'vendor_cash_limit_exceeded',
    relatedType: 'settlement',
    targetRole: 'Finance Admin',
    modulePermission: 'settlements.view',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString()
  },
  {
    _id: 'demo-4',
    title: 'New Tractor Booking Received',
    message: 'Customer Suresh Kumar booked John Deere 5050D for 3 days in Anand district.',
    type: 'booking_new',
    relatedType: 'booking',
    targetRole: 'Booking Admin',
    modulePermission: 'bookings.view',
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString()
  },
  {
    _id: 'demo-5',
    title: 'Soil Test Sample Assigned',
    message: 'Soil sample #ST-409 collected from Kheda lab awaiting test report upload.',
    type: 'soil_test_request',
    relatedType: 'soil',
    targetRole: 'Agronomist / Support Admin',
    modulePermission: 'soiltest.view',
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString()
  },
  {
    _id: 'demo-6',
    title: 'Worker Registration Verification',
    message: 'New worker Hraiya submitted Aadhaar for team leader verification.',
    type: 'worker_verification',
    relatedType: 'worker',
    targetRole: 'Worker Admin',
    modulePermission: 'workers.view',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
  }
];

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adminUser, setAdminUser] = useState(null);

  // Filter States
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'unread', 'read'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'withdrawals', 'approvals', 'bookings', 'cash_limit', 'soil'
  const [roleScopeFilter, setRoleScopeFilter] = useState('all_roles'); // 'my_role', 'all_roles'
  const [targetRoleFilter, setTargetRoleFilter] = useState('all'); // 'all', 'finance', 'vendor_admin', 'booking_admin', 'worker_admin'
  const [timeFilter, setTimeFilter] = useState('all'); // 'all', 'today', '7days', '30days'
  const [searchQuery, setSearchQuery] = useState('');

  // Load current admin user
  useEffect(() => {
    try {
      const data = authStorage.getUserData('admin');
      if (data) {
        setAdminUser(data);
      }
    } catch (e) {
      console.error('Failed to parse admin data:', e);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications', { params: { limit: 100 } });
      if (res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        setNotifications(res.data.data);
      } else {
        setNotifications(INITIAL_DEMO_NOTIFICATIONS);
      }
    } catch (error) {
      console.error('Error fetching admin notifications:', error);
      setNotifications(INITIAL_DEMO_NOTIFICATIONS);
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
      if (!id.startsWith('demo-')) {
        await api.put(`/notifications/${id}/read`);
      }
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, isRead: true } : n)
      );
    } catch (error) {
      console.error('Error marking notification read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all').catch(() => {});
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      toastManager.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const deleteNotification = async (id) => {
    try {
      if (!id.startsWith('demo-')) {
        await api.delete(`/notifications/${id}`);
      }
      setNotifications(prev => prev.filter(n => n._id !== id));
      toastManager.success('Notification deleted');
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const clearAllNotifications = async () => {
    if (window.confirm('Are you sure you want to clear all notifications?')) {
      try {
        await api.delete('/notifications/delete-all').catch(() => {});
        setNotifications([]);
        toastManager.success('All notifications cleared');
      } catch (error) {
        console.error('Error clearing notifications:', error);
      }
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

  const handleNotificationClick = (notification) => {
    markAsRead(notification._id);

    const type = (notification.type || '').toLowerCase();
    const relatedType = (notification.relatedType || '').toLowerCase();
    const title = (notification.title || '').toLowerCase();

    if (relatedType === 'booking' || type.includes('booking')) {
      navigate('/admin/bookings');
    } else if (relatedType === 'soil' || type.includes('soil') || title.includes('soil')) {
      navigate('/admin/soil-tests');
    } else if (type.includes('withdraw') || relatedType === 'withdrawal') {
      navigate('/admin/withdrawals');
    } else if (type.includes('approval') || relatedType === 'store') {
      navigate('/admin/marketplace/store-approvals');
    } else if (type.includes('cash_limit') || type.includes('settlement')) {
      navigate('/admin/settlements');
    } else if (type.includes('worker') || relatedType === 'worker') {
      navigate('/admin/workers');
    } else if (type.includes('kyc')) {
      navigate('/admin/users/kyc');
    } else {
      navigate('/admin/notifications');
    }
  };

  const getIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('withdraw')) return <FiDollarSign className="text-white w-4 h-4" />;
    if (t.includes('approval') || t.includes('kyc')) return <FiUserCheck className="text-white w-4 h-4" />;
    if (t.includes('cash_limit')) return <FiAlertTriangle className="text-white w-4 h-4" />;
    if (t.includes('booking')) return <FiShoppingBag className="text-white w-4 h-4" />;
    if (t.includes('soil')) return <FiActivity className="text-white w-4 h-4" />;
    if (t.includes('worker')) return <FiUser className="text-white w-4 h-4" />;
    return <FiBell className="text-white w-4 h-4" />;
  };

  const getGradient = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('withdraw')) return 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20';
    if (t.includes('approval') || t.includes('kyc')) return 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20';
    if (t.includes('cash_limit')) return 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20';
    if (t.includes('booking')) return 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-500/20';
    if (t.includes('soil')) return 'bg-gradient-to-br from-teal-500 to-emerald-600 shadow-teal-500/20';
    if (t.includes('worker')) return 'bg-gradient-to-br from-sky-500 to-blue-600 shadow-sky-500/20';
    return 'bg-gradient-to-br from-emerald-600 to-teal-700 shadow-emerald-600/20';
  };

  const getRoleBadgeColor = (targetRole) => {
    const role = (targetRole || '').toLowerCase();
    if (role.includes('finance')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (role.includes('vendor')) return 'bg-orange-50 text-orange-700 border-orange-200';
    if (role.includes('booking')) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (role.includes('worker')) return 'bg-sky-50 text-sky-700 border-sky-200';
    if (role.includes('agronomist') || role.includes('support')) return 'bg-teal-50 text-teal-700 border-teal-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  // Permission matching logic for logged-in admin
  const hasPermissionForNotification = (n) => {
    if (!adminUser) return true;
    if (adminUser.role === 'super_admin') return true;

    const perms = adminUser.permissions || {};
    const modulePerm = n.modulePermission;
    if (!modulePerm) return true;

    return !!perms[modulePerm];
  };

  // Filtered Notifications Computation
  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      // 1. Role Scope Filter (My Role vs All Roles)
      if (roleScopeFilter === 'my_role' && !hasPermissionForNotification(n)) {
        return false;
      }

      // 2. Status Filter
      if (statusFilter === 'unread' && n.isRead) return false;
      if (statusFilter === 'read' && !n.isRead) return false;

      // 3. Target Role Filter
      if (targetRoleFilter !== 'all') {
        const role = (n.targetRole || '').toLowerCase();
        if (targetRoleFilter === 'finance' && !role.includes('finance')) return false;
        if (targetRoleFilter === 'vendor_admin' && !role.includes('vendor')) return false;
        if (targetRoleFilter === 'booking_admin' && !role.includes('booking')) return false;
        if (targetRoleFilter === 'worker_admin' && !role.includes('worker')) return false;
      }

      // 4. Type Filter
      const t = (n.type || '').toLowerCase();
      if (typeFilter === 'withdrawals' && !t.includes('withdraw')) return false;
      if (typeFilter === 'approvals' && !(t.includes('approval') || t.includes('kyc'))) return false;
      if (typeFilter === 'bookings' && !t.includes('booking')) return false;
      if (typeFilter === 'cash_limit' && !t.includes('cash_limit')) return false;
      if (typeFilter === 'soil' && !t.includes('soil')) return false;
      if (typeFilter === 'worker' && !t.includes('worker')) return false;

      // 5. Time Filter
      if (timeFilter !== 'all' && n.createdAt) {
        const itemDate = new Date(n.createdAt);
        const now = new Date();
        if (timeFilter === 'today') {
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (itemDate < startOfDay) return false;
        } else if (timeFilter === '7days') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (itemDate < sevenDaysAgo) return false;
        } else if (timeFilter === '30days') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (itemDate < thirtyDaysAgo) return false;
        }
      }

      // 6. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (n.title || '').toLowerCase().includes(q);
        const msgMatch = (n.message || '').toLowerCase().includes(q);
        const roleMatch = (n.targetRole || '').toLowerCase().includes(q);
        if (!titleMatch && !msgMatch && !roleMatch) return false;
      }

      return true;
    });
  }, [notifications, statusFilter, typeFilter, roleScopeFilter, targetRoleFilter, timeFilter, searchQuery, adminUser]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 max-w-5xl mx-auto"
    >
      {/* Role & Admin Context Banner */}
      {adminUser && (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-md border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <FiShield className="text-lg" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-100">{adminUser.name || 'Admin'}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                  adminUser.role === 'super_admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {adminUser.role === 'super_admin' ? '⭐ Super Admin' : 'Scoped Admin'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {adminUser.role === 'super_admin'
                  ? 'Super Admin access — full visibility into all role notifications.'
                  : 'Role-wise notifications tailored to your assigned module permissions.'}
              </p>
            </div>
          </div>

          {/* Role Filter Toggle Pill */}
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setRoleScopeFilter('my_role')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                roleScopeFilter === 'my_role'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              My Role Alerts
            </button>
            <button
              onClick={() => setRoleScopeFilter('all_roles')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                roleScopeFilter === 'all_roles'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All System Roles
            </button>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white rounded-xl p-4 shadow-2xs border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <FiBell className="text-lg" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-gray-900 tracking-tight">System Notifications</h1>
                {unreadCount > 0 && (
                  <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-2xs">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Manage all system alerts, vendor requests, and withdrawal updates in real time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleRefresh}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 shadow-2xs text-gray-600"
              disabled={refreshing}
              title="Refresh"
            >
              <FiRefreshCw className={`text-base ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 border border-emerald-200/80 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <FiCheckCircle className="text-sm text-emerald-600" />
                Mark All Read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAllNotifications}
                className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200/80 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <FiTrash2 className="text-sm" />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Controls, Role Filters & Search Toolbar */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-lg">
            {[
              { key: 'all', label: 'All', count: notifications.length },
              { key: 'unread', label: 'Unread', count: unreadCount },
              { key: 'read', label: 'Read', count: notifications.length - unreadCount }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  statusFilter === tab.key
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Role Dropdown, Type & Time Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-48">
              <FiSearch className="absolute left-3 top-2.5 text-gray-400 text-xs" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notifications..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:border-emerald-500 shadow-2xs"
              />
            </div>

            {/* Target Role Selector */}
            <select
              value={targetRoleFilter}
              onChange={(e) => setTargetRoleFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
            >
              <option value="all">All Designed Roles</option>
              <option value="finance">Finance Admin</option>
              <option value="vendor_admin">Vendor Admin</option>
              <option value="booking_admin">Booking Admin</option>
              <option value="worker_admin">Worker Admin</option>
            </select>

            {/* Notification Type Selector */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
            >
              <option value="all">All Types</option>
              <option value="withdrawals">Withdrawals</option>
              <option value="approvals">Approvals & KYC</option>
              <option value="bookings">Bookings</option>
              <option value="worker">Worker Alerts</option>
              <option value="cash_limit">Cash Limit Alerts</option>
              <option value="soil">Soil Testing</option>
            </select>

            {/* Time Period Filter */}
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">This Month</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications Main List */}
      <div className="bg-white rounded-xl shadow-2xs border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-600 mx-auto"></div>
            <p className="text-xs text-gray-500 mt-2 font-medium">Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FiInbox className="text-4xl text-gray-300 mx-auto" />
            <p className="text-sm font-bold text-gray-800">No notifications found</p>
            <p className="text-xs text-gray-500">Try switching role scope or adjusting your search filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <AnimatePresence>
              {filteredNotifications.map(notification => (
                <motion.div
                  key={notification._id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-3 transition-all flex items-start gap-3 relative group cursor-pointer ${
                    !notification.isRead
                      ? 'bg-gradient-to-r from-emerald-50/40 via-white to-white'
                      : 'hover:bg-gray-50/70'
                  }`}
                >
                  {/* Icon Badge */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${getGradient(notification.type)}`}>
                    {getIcon(notification.type)}
                  </div>

                  {/* Content Area */}
                  <div className="flex-1 min-w-0 pr-14">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      {!notification.isRead && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-2xs" title="Unread" />
                      )}
                      <p className={`text-xs sm:text-sm tracking-tight ${!notification.isRead ? 'font-black text-gray-950' : 'font-bold text-gray-800'}`}>
                        {cleanTitle(notification.title)}
                      </p>

                      {/* Target Role Tag */}
                      {notification.targetRole && (
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${getRoleBadgeColor(notification.targetRole)} ml-1`}>
                          👤 {notification.targetRole}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs text-gray-600 leading-snug line-clamp-2">
                      {notification.message}
                    </p>

                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                      <span>{formatNotificationTime(notification.createdAt)}</span>
                      <span className="text-emerald-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                        View details <FiChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                    {!notification.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification._id);
                        }}
                        className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors shadow-2xs"
                        title="Mark as Read"
                      >
                        <FiCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification._id);
                      }}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shadow-2xs"
                      title="Delete Notification"
                    >
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
