import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBriefcase, FiUsers, FiBell, FiArrowRight, FiUser, FiClock, FiMapPin, FiCheckCircle, FiTrendingUp, FiChevronRight, FiAlertTriangle, FiCalendar, FiBarChart2, FiActivity, FiShoppingBag, FiTruck } from 'react-icons/fi';
import { FaWallet } from 'react-icons/fa';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import { vendorDashboardService } from '../../services/dashboardService';
import { toastManager } from '../../../../utils/toastManager';
import { io } from 'socket.io-client';
import maintenanceService from '../../services/maintenanceService';
import { isWithinInterval, parseISO } from 'date-fns';

import { registerFCMToken } from '../../../../services/pushNotificationService';
import LogoLoader from '../../../../components/common/LogoLoader';
import StatsCards from './components/StatsCards';
import { useVendorDashboard } from '../../../../context/VendorDashboardContext';
// PendingBookings import removed


const SOCKET_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';

const Dashboard = memo(() => {
  const navigate = useNavigate();

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const {
    stats,
    vendorProfile,
    recentJobs,
    pendingBookings,
    activeAlertBookings,
    setActiveAlertBookings,
    loading,
    error,
    loadDashboardData
  } = useVendorDashboard();

  // Set background gradient
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

  // Memoize quickActions to prevent recreation on every render
  const quickActions = useMemo(() => [
    {
      title: 'Machinery Fleet',
      icon: FiTruck,
      color: '#0284C7', // Sky blue
      bgLight: '#E0F2FE',
      path: '/vendor/equipment',
      subtitle: 'Manage fleet',
    },
    {
      title: 'Field Operations',
      icon: FiBriefcase,
      color: '#0D9488', // Teal
      bgLight: '#CCFBF1',
      path: '/vendor/jobs',
      subtitle: `${stats.activeJobs} on field`,
    },
    {
      title: 'Equipment Care',
      icon: FiCalendar,
      color: '#10B981', // Emerald
      bgLight: '#D1FAE5',
      path: '/vendor/maintenance',
      subtitle: stats.machinesInMaintenance > 0 ? `${stats.machinesInMaintenance} in care` : 'Maintenance',
    },
    {
      title: 'Soil Testing',
      icon: FiActivity,
      color: '#0891B2', // Cyan
      bgLight: '#CFFAFE',
      path: '/vendor/soil-tests',
      subtitle: 'Manage tests',
    },
    {
      title: 'Agri Market',
      icon: FiShoppingBag,
      color: '#E11D48', // Rose
      bgLight: '#FFE4E6',
      path: '/vendor/store/orders',
      subtitle: `₹${(stats.ecommerceEarnings || 0).toLocaleString()} store`,
    },
    {
      title: 'Analytics',
      icon: FiBarChart2,
      color: '#7C3AED', // Violet
      bgLight: '#EDE9FE',
      path: '/vendor/analytics',
      subtitle: 'Equipment ROI',
    },
  ], [stats.activeJobs, stats.machinesInMaintenance, stats.ecommerceEarnings]);

  const getStatusStyle = (status) => {
    const s = String(status).toLowerCase();
    if (s.includes('confirm') || s.includes('accept') || s.includes('done') || s.includes('complete')) {
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500'
      };
    }
    if (s.includes('progress') || s.includes('journey') || s.includes('visit') || s.includes('assign')) {
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500'
      };
    }
    if (s.includes('reject') || s.includes('cancel')) {
      return {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500'
      };
    }
    return {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      dot: 'bg-blue-500'
    };
  };

  const getStatusLabel = (status) => {
    const s = String(status).toLowerCase();
    const labels = {
      'requested': 'New Order',
      'searching': 'Finding Hub',
      'accepted': 'Accepted',
      'confirmed': 'Order Confirmed',
      'assigned': 'Driver Assigned',
      'journey_started': 'Heading to Farm',
      'visited': 'At Farm',
      'in_progress': 'Operating',
      'work_done': 'Work Completed',
      'completed': 'Job Done',
      'worker_paid': 'Driver Paid',
      'settlement_pending': 'Settlement',
      'cancelled': 'Cancelled',
      'rejected': 'Rejected'
    };
    return labels[s] || status;
  };

  const [isOnline, setIsOnline] = useState(() => localStorage.getItem('vendorOnlineStatus') !== 'false');

  const handleToggleOnline = (e) => {
    e?.stopPropagation();
    const nextStatus = !isOnline;
    setIsOnline(nextStatus);
    localStorage.setItem('vendorOnlineStatus', String(nextStatus));
    if (nextStatus) {
      toastManager.success('You are Online • Ready to receive new booking alerts');
    } else {
      toastManager.info('You are Offline • New booking alerts paused');
    }
  };

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen pb-20 flex items-center justify-center" style={{ background: themeColors.backgroundGradient }}>
        <div className="text-center px-6">
          <FiAlertTriangle className="text-amber-400 w-12 h-12 mb-3 mx-auto" />
          <h2 className="text-white text-xl font-semibold mb-2">Failed to Load Dashboard</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => loadDashboardData(true, true)}
            className="bg-white text-gray-900 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Dashboard" showBack={false} notificationCount={stats.pendingAlerts} />

      <main className="pt-1">
        {/* Profile Card Section with Online/Offline Availability Toggle */}
        <div className="px-4 pt-2 pb-1">
          <div
            className="rounded-2xl p-3.5 cursor-pointer active:scale-[0.99] transition-all duration-200 relative overflow-hidden shadow-xs hover:shadow-sm"
            onClick={() => navigate('/vendor/profile')}
            style={{
              background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #388e3c 100%)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            {/* Subtle light glow overlay */}
            <div
              className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-20 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)',
              }}
            />

            <div className="relative z-10 flex items-center gap-3">
              {/* Profile Photo */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden relative shadow-sm"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '2px solid rgba(255, 255, 255, 0.85)',
                }}
              >
                {vendorProfile.photo ? (
                  <img
                    src={vendorProfile.photo}
                    alt={vendorProfile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FiUser className="w-6 h-6 text-white" />
                )}
                {/* Online status indicator dot */}
                <span
                  className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-white rounded-full transition-colors ${
                    isOnline ? 'bg-emerald-400' : 'bg-gray-400'
                  }`}
                />
              </div>

              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-200/90">
                    Welcome back
                  </span>
                  <span className="inline-block w-1 h-1 rounded-full bg-emerald-300"></span>
                  <span className="text-[10px] font-semibold text-emerald-100/90">
                    ★ {stats.rating > 0 ? stats.rating.toFixed(1) : '5.0'}
                  </span>
                </div>
                <h2 className="text-base font-bold text-white truncate leading-tight">{vendorProfile.name}</h2>
                <p className="text-xs text-white/85 truncate font-medium mt-0.5">{vendorProfile.businessName}</p>
              </div>

              {/* Interactive Online/Offline Switch & Chevron */}
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <button
                  onClick={handleToggleOnline}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-all border shadow-xs ${
                    isOnline
                      ? 'bg-emerald-400/25 text-emerald-100 border-emerald-300/40 hover:bg-emerald-400/35'
                      : 'bg-black/30 text-gray-300 border-white/20 hover:bg-black/40'
                  }`}
                  title={isOnline ? 'Tap to go offline' : 'Tap to go online'}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'
                    }`}
                  />
                  <span>{isOnline ? 'Online' : 'Offline'}</span>
                </button>

                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'rgba(255, 255, 255, 0.18)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                  }}
                >
                  <FiChevronRight className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Incomplete Profile Prompt */}
        {(!vendorProfile.service || vendorProfile.service.length === 0) && (
          <div className="px-4 pt-2">
            <div
              onClick={() => navigate('/vendor/profile')}
              className="bg-amber-50/90 border border-amber-200 p-3 rounded-xl shadow-xs cursor-pointer hover:bg-amber-100/70 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <FiClock className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-800">Inventory Incomplete</p>
                  <p className="text-[11px] text-amber-700 truncate">
                    Add equipment to start receiving rental bookings.
                  </p>
                </div>
                <FiArrowRight className="h-4 w-4 text-amber-600 flex-shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* Compliance Alerts Section */}
        {stats.complianceAlerts && stats.complianceAlerts.length > 0 && (
          <div className="px-4 pt-2">
            <div
              onClick={() => navigate('/vendor/compliance')}
              className="bg-rose-50/90 border border-rose-200 p-3 rounded-xl shadow-xs cursor-pointer hover:bg-rose-100/70 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
                  <FiAlertTriangle className="h-4 w-4 text-rose-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-rose-800">Compliance Alert</p>
                  <p className="text-[11px] text-rose-700 truncate">
                    {stats.complianceAlerts[0].message}
                    {stats.complianceAlerts.length > 1 && ` (+${stats.complianceAlerts.length - 1} more)`}
                  </p>
                </div>
                <FiArrowRight className="h-4 w-4 text-rose-600 flex-shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* Stats & Operations Overview */}
        <StatsCards stats={stats} />

        {/* Services & Quick Actions Grid (No text truncation) */}
        <div className="px-4 py-1">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Services & Operations
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((action, index) => (
              <div
                key={index}
                onClick={() => navigate(action.path)}
                className="bg-white p-2.5 rounded-xl shadow-xs border border-emerald-100/60 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2.5 hover:border-emerald-200 hover:shadow-sm"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: action.bgLight }}
                >
                  <action.icon className="w-4 h-4" style={{ color: action.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-800 leading-tight">
                    {action.title}
                  </p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">
                    {action.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Jobs - List View */}
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Recent Bookings</h2>
              <p className="text-[11px] text-gray-400 font-medium">Latest incoming customer requests</p>
            </div>
            {recentJobs.length > 0 && (
              <button
                onClick={() => navigate('/vendor/jobs')}
                className="px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 active:scale-95 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
              >
                View All
              </button>
            )}
          </div>

          {recentJobs.length > 0 ? (
            <div className="space-y-2.5">
              {recentJobs.map((job) => {
                const statusStyle = getStatusStyle(job.status);
                const timeText = job.timeSlot?.time && job.timeSlot.time !== 'Time not set' ? job.timeSlot.time : (job.time || 'Scheduled');
                const rawDate = job.timeSlot?.date || job.scheduledDate;
                let dateText = '';
                if (rawDate) {
                  try {
                    const d = new Date(rawDate);
                    dateText = !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : String(rawDate);
                  } catch {
                    dateText = String(rawDate);
                  }
                }
                const payoutAmount = job.vendorEarnings || job.price;

                return (
                  <div
                    key={job.id}
                    onClick={() => {
                      if (['REQUESTED', 'SEARCHING'].includes(job.status?.toUpperCase())) {
                        setActiveAlertBookings([job]);
                      } else {
                        navigate(`/vendor/booking/${job.id}`);
                      }
                    }}
                    className="bg-white rounded-2xl shadow-xs cursor-pointer active:scale-[0.99] transition-all duration-200 relative overflow-hidden border border-emerald-100/70 p-3 hover:border-emerald-300 hover:shadow-[0_4px_16px_rgba(46,125,50,0.08)]"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-emerald-100/70 border-2 border-emerald-200 flex items-center justify-center flex-shrink-0 text-emerald-800 font-black text-sm shadow-2xs">
                        {job.customerName ? job.customerName.charAt(0).toUpperCase() : <FiUser className="w-4 h-4" />}
                      </div>

                      {/* Main Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{job.customerName || 'Customer'}</p>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 flex-shrink-0 border border-emerald-200/60">
                              {job.serviceType || 'Equipment'}
                            </span>
                          </div>

                          {payoutAmount && Number(payoutAmount) > 0 && (
                            <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex-shrink-0">
                              ₹{Number(payoutAmount).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {/* Location & Time Tags */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          {job.location && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 border border-gray-100 max-w-[140px]">
                              <FiMapPin className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
                              <span className="text-[10px] font-medium text-gray-600 truncate">{job.location}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 border border-gray-100">
                            <FiClock className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />
                            <span className="text-[10px] font-medium text-gray-600">
                              {timeText} {dateText ? `• ${dateText}` : ''}
                            </span>
                          </div>

                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`}></span>
                            <span>{getStatusLabel(job.status)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Chevron Action */}
                      <div className="self-center pl-1">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50/70 hover:bg-emerald-100 flex items-center justify-center text-emerald-700 border border-emerald-200/60 transition-colors">
                          <FiArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-6 shadow-xs text-center border border-gray-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
                <FiBriefcase className="w-6 h-6" />
              </div>
              <p className="text-xs text-gray-700 font-bold mb-0.5">No Active Bookings</p>
              <p className="text-[11px] text-gray-400">New customer requests will show up here</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
});

export default Dashboard;
