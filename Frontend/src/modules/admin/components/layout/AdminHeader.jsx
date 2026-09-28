import { useState, useEffect } from 'react';
import { FiMenu, FiBell, FiLogOut } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../Button';
import NotificationWindow from './NotificationWindow';
import { adminAuthService } from '../../../../services/authService';
import authStorage from '../../../../utils/authStorage';

const AdminHeader = ({ onMenuClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [adminData, setAdminData] = useState(null);

  useEffect(() => {
    const data = authStorage.getUserData('admin');
    if (data) {
      setAdminData(data);
    }
  }, []);

  const handleLogout = async () => {
    try {
      await adminAuthService.logout();
      toast.success('Logged out successfully');
      navigate('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Even if API call fails, clear session and redirect
      authStorage.clearAuthSession('admin');
      toast.success('Logged out successfully');
      navigate('/admin/login');
    }
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  // Get page info from pathname
  const getPageInfo = (pathname) => {
    const mappings = [
      { path: '/admin/dashboard', title: 'Dashboard', description: "Welcome back! Here's your business overview." },
      { path: '/admin/users/all', title: 'All Farmers', description: 'Manage registered farmers and their activity' },
      { path: '/admin/users/bookings', title: 'Farmer Bookings', description: 'Track farmer booking history' },
      { path: '/admin/users/analytics', title: 'Farmer Analytics', description: 'Analyze farmer behavior and growth' },
      { path: '/admin/users/registration-fees', title: 'Farmer Registration Fees', description: 'Monitor and track registration fee payments from farmers' },
      { path: '/admin/users/transactions', title: 'Farmer Transactions', description: 'Monitor farmer financial transactions' },
      { path: '/admin/users', title: 'Farmers', description: 'Manage registered farmers and their activity' },
      { path: '/admin/workers/all', title: 'All Workers', description: 'Manage farm workers and team leaders' },
      { path: '/admin/workers/bookings', title: 'Worker Bookings', description: 'Track worker booking assignments' },
      { path: '/admin/workers/analytics', title: 'Worker Analytics', description: 'Analyze farm worker metrics' },
      { path: '/admin/workers/registration-fees', title: 'Worker Registration Fees', description: 'Monitor registration fee payments from workers' },
      { path: '/admin/workers', title: 'Workers', description: 'Manage farm workers, team leaders, and registrations' },
      { path: '/admin/vendors/all', title: 'All Equipment Owners', description: 'Manage equipment owners and their activity' },
      { path: '/admin/vendors/analytics', title: 'Owner Analytics', description: 'Analyze equipment owner performance' },
      { path: '/admin/vendors/bookings', title: 'Owner Bookings', description: 'Track equipment owner booking history' },
      { path: '/admin/vendors/payments', title: 'Owner Payments', description: 'Manage equipment owner earnings and payouts' },
      { path: '/admin/vendors/registration-fees', title: 'Owner Registration Fees', description: 'Monitor registration fee payments from equipment owners' },
      { path: '/admin/vendors', title: 'Equipment Owners', description: 'Manage equipment owner registrations and performance' },
      { path: '/admin/bookings', title: 'Bookings', description: 'Track and manage agriculture equipment bookings' },
      { path: '/admin/bookings/notifications', title: 'Order Notifications', description: 'Track booking alerts and updates' },
      { path: '/admin/equipment-catalog', title: 'Equipment Catalog', description: 'Manage agricultural equipment, categories, and brands' },
      { path: '/admin/payments/users', title: 'Farmer Transactions', description: 'Monitor farmer financial transactions' },
      { path: '/admin/payments/workers', title: 'Worker Payments', description: 'Monitor farm worker earnings, payouts, and settlements' },
      { path: '/admin/payments/vendors', title: 'Owner Transactions', description: 'Monitor equipment owner earnings and payouts' },
      { path: '/admin/payments/revenue', title: 'Admin Revenue', description: 'Track platform commissions and income' },
      { path: '/admin/payments/reports', title: 'Payment Report', description: 'Analyze payment data and financial insights' },
      { path: '/admin/payments', title: 'Payments & Settlements', description: 'Monitor transactions and revenue' },
      { path: '/admin/reports', title: 'Reports', description: 'Analyze platform performance with data insights' },
      { path: '/admin/notifications', title: 'Notifications', description: 'Stay updated with platform activities' },
      { path: '/admin/settings', title: 'Settings', description: 'Configure platform preferences' },
      { path: '/admin/withdrawals', title: 'Withdrawals', description: 'Manage and process payout requests for Farmers, Equipment Owners, and Workers' },
      { path: '/admin/settlements/pending', title: 'Pending Settlements', description: 'Review and approve owner cash settlements' },
      { path: '/admin/settlements/vendors', title: 'Owner Balances', description: 'Monitor owner dues and credit limits' },
      { path: '/admin/settlements/history', title: 'Settlement History', description: 'View past transaction records' },
      { path: '/admin/settlements', title: 'Settlements', description: 'Manage financial settlements' },
      { path: '/admin/reviews', title: 'Reviews', description: 'Manage platform reviews and ratings' },
      { path: '/admin/disputes', title: 'Disputes', description: 'Review and resolve complaints from Farmers and Owners' },
      { path: '/admin/marketplace', title: 'Agri Marketplace', description: 'Manage agricultural products (Seeds, Fertilizers) and marketplace listings' },
      { path: '/admin/products/orders', title: 'Global Marketplace Orders', description: 'Monitor all marketplace sales and fulfillment' },
      { path: '/admin/products', title: 'Machinery Management', description: 'Approve and manage heavy equipment, tractors, and machinery' },
      { path: '/admin/soil-tests', title: 'Soil Testing', description: 'Manage and monitor soil testing requests' },
      { path: '/admin/admin-management', title: 'Admin Management', description: 'Configure admins, track lead attribution & record monthly salary' },
    ];

    const match = mappings.find(m => pathname === m.path || pathname.startsWith(m.path + '/'));

    if (match) return match;

    const path = pathname.split('/').pop() || 'dashboard';
    return {
      title: path.charAt(0).toUpperCase() + path.slice(1),
      description: `Manage your ${path} here.`
    };
  };

  const { title, description } = getPageInfo(location.pathname);

  // Notification Logic
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      // Import api dynamically if needed or just use fetch with auth headers
      // Since we don't have api imported, let's use adminAuthService's axios instance if available, or just fetch
      // Assuming api.js handles interceptors. Let's import api at top.
      const { default: api } = await import('../../../../services/api');
      const res = await api.get('/notifications/admin');
      if (res.data.success) {
        setNotifications(res.data.data);
        setUnreadCount(res.data.unreadCount);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const handleUpdate = () => fetchNotifications();
    window.addEventListener('adminNotificationsUpdated', handleUpdate);
    // Poll every 30 seconds as fallback
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      window.removeEventListener('adminNotificationsUpdated', handleUpdate);
      clearInterval(interval);
    };
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      const { default: api } = await import('../../../../services/api');
      await api.put(`/notifications/${id}/read`);
      // Optimistic update
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const { default: api } = await import('../../../../services/api');
      await api.put(`/notifications/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      const { default: api } = await import('../../../../services/api');
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n._id !== id));
      // If deleted was unread, decrease count? We don't know easily without checking.
      // Ideally re-fetch or check current state
      fetchNotifications();
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  return (
    <header
      className="bg-white fixed top-0 left-0 right-0 z-30 transition-all duration-300 lg:left-[278px] border-b border-gray-100 shadow-sm"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="flex items-center justify-between px-4 lg:px-6 py-6">
        {/* Left: Menu Button & Page Title */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <Button
            onClick={onMenuClick}
            variant="icon"
            className="lg:hidden text-gray-700 shrink-0"
            icon={FiMenu}
          />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-800 mb-0.5 sm:mb-1 truncate">{title}</h1>
            <p className="text-[10px] sm:text-xs text-gray-500 font-medium truncate hidden sm:block">{description}</p>
          </div>
        </div>

        {/* Right: Notifications & Logout */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Notifications */}
          <div className="relative">
            <Button
              data-notification-button
              onClick={toggleNotifications}
              variant="icon"
              className="text-gray-700 hover:bg-gray-50"
              icon={FiBell}
            />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold border-2 border-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}

            <NotificationWindow
              isOpen={showNotifications}
              onClose={() => setShowNotifications(false)}
              position="right"
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={handleMarkAllAsRead}
              onDelete={handleDelete}
            />
          </div>

          {/* Admin Profile Section */}
          <div
            onClick={() => navigate('/admin/settings')}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-gray-50 transition-all cursor-pointer group"
          >
            <div className="flex flex-col items-end hidden md:flex">
              <span className="text-[13px] font-extrabold text-gray-800 leading-tight">{adminData?.name || 'Admin'}</span>
              <span className="text-[9px] text-gray-500 font-medium">{adminData?.email || 'Administrator'}</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-blue-600/20 group-hover:scale-105 transition-transform border-2 border-white">
              {adminData?.name ? adminData.name.charAt(0).toUpperCase() : 'A'}
            </div>
          </div>

          {/* Logout Button */}
          <Button
            onClick={handleLogout}
            variant="ghost"
            icon={FiLogOut}
            size="sm"
            className="text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 border border-gray-200 ml-1 px-2 sm:px-3"
          >
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;

