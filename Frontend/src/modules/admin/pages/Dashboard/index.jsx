import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FiUser, FiBriefcase, FiUsers, FiShoppingBag, FiDollarSign, FiActivity,
  FiAward, FiUserCheck, FiMapPin, FiShield, FiTrendingUp, FiCheckCircle, FiClock, FiPlusCircle
} from 'react-icons/fi';
import RevenueLineChart from '../../components/dashboard/RevenueLineChart';
import BookingsBarChart from '../../components/dashboard/BookingsBarChart';
import BookingStatusPieChart from '../../components/dashboard/BookingStatusPieChart';
import RevenueVsBookingsChart from '../../components/dashboard/RevenueVsBookingsChart';
import TimePeriodFilter from '../../components/dashboard/TimePeriodFilter';
import { formatCurrency } from '../../utils/adminHelpers';
import CustomerGrowthAreaChart from '../../components/dashboard/CustomerGrowthAreaChart';
import TopEquipment from '../../components/dashboard/TopEquipment';
import RecentBookings from '../../components/dashboard/RecentBookings';
import { getDashboardStats, getRevenueAnalytics } from '../../../../services/adminDashboardService';
import { toastManager } from '../../../../utils/toastManager';
import authStorage from '../../../../utils/authStorage';
import MySalaryHistoryModal from '../AdminManagement/MySalaryHistoryModal';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const currentAdmin = (() => {
    try { return authStorage.getUserData('admin') || {}; } catch { return {}; }
  })();
  const isSuperAdmin = currentAdmin.role === 'super_admin';

  const [period, setPeriod] = useState('month');
  const [showSalaryHistoryModal, setShowSalaryHistoryModal] = useState(false);
  const [revenueData, setRevenueData] = useState([]);
  const [recentBookingsList, setRecentBookingsList] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState({
    farmers: 0,
    vendors: 0,
    workers: 0,
    total: 0
  });
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalVendors: 0,
    totalWorkers: 0,
    totalTeamLeaders: 0,
    totalIndependentWorkers: 0,
    activeBookings: 0,
    completedBookings: 0,
    totalRevenue: 0,
    bookingRevenue: 0,
    soilTestRevenue: 0,
    ecommerceRevenue: 0,
    todayRevenue: 0,
    adminCompensation: null
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Calculate Date range based on Period
        let apiPeriod = 'monthly';
        let startDate = new Date();
        const endDate = new Date().toISOString();

        if (period === 'year') {
          apiPeriod = 'monthly';
          startDate.setFullYear(startDate.getFullYear() - 1);
        } else if (period === 'week') {
          apiPeriod = 'daily';
          startDate.setDate(startDate.getDate() - 7);
        } else if (period === 'month') {
          apiPeriod = 'daily';
          startDate.setDate(startDate.getDate() - 30);
        } else if (period === 'today') {
          apiPeriod = 'daily';
          startDate.setHours(0, 0, 0, 0); 
        } else {
          apiPeriod = 'daily';
          startDate.setDate(startDate.getDate() - 1);
        }

        const startISO = startDate.toISOString();

        // 2. Fetch Stats & Recent Bookings (Filtered by Date)
        const statsRes = await getDashboardStats({ startDate: startISO, endDate });
        if (statsRes.success) {
          const s = statsRes.data.stats;
          if (s.myRegistrations) {
            setMyRegistrations(s.myRegistrations);
          }
          setStats({
            totalUsers: s.totalUsers || 0,
            totalVendors: s.totalVendors || 0,
            totalWorkers: s.totalWorkers || 0,
            totalTeamLeaders: s.totalTeamLeaders || 0,
            totalIndependentWorkers: s.totalIndependentWorkers || 0,
            activeBookings: s.pendingBookings || 0,
            completedBookings: s.completedBookings || 0,
            totalRevenue: s.totalRevenue || 0,
            bookingRevenue: s.bookingRevenue || 0,
            soilTestRevenue: s.soilTestRevenue || 0,
            ecommerceRevenue: s.ecommerceRevenue || 0,
            todayRevenue: 0,
            adminCompensation: s.adminCompensation || null
          });
          setRecentBookingsList(statsRes.data.recentBookings || []);
        }

        // 3. Fetch Revenue Analytics based on Period
        const revRes = await getRevenueAnalytics({
          period: apiPeriod,
          startDate: startISO,
          endDate
        });

        if (revRes.success) {
          const mapped = revRes.data.revenueData.map(item => ({
            date: item.date,
            revenue: item.totalRevenue,
            bookingRevenue: item.bookingRevenue,
            soilTestRevenue: item.soilTestRevenue,
            ecommerceRevenue: item.ecommerceRevenue || 0,
            orders: item.bookings || 0
          }));
          mapped.sort((a, b) => new Date(a.date) - new Date(b.date));
          setRevenueData(mapped);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchData();
  }, [period]);

  const handleExportCsv = () => {
    try {
      const rows = revenueData.map((r) => ({
        date: r.date,
        bookings: r.orders,
        revenue: r.revenue,
      }));

      const headers = ['date', 'bookings', 'revenue'];
      const csv = [
        headers.join(','),
        ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin_dashboard_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('CSV export failed', e);
      toastManager.error('Export failed.');
    }
  };

  const onViewBooking = (booking) => {
    if (booking?._id || booking?.id) navigate(`/admin/bookings/${booking._id || booking.id}`);
  };

  const statsCards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(stats.totalRevenue || 0),
      change: 0,
      icon: FiDollarSign,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-green-500 to-emerald-600',
      cardBg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      iconBg: 'bg-white/20',
      link: '/admin/reports/revenue'
    },
    {
      title: 'Booking Revenue',
      value: formatCurrency(stats.bookingRevenue || 0),
      change: 0,
      icon: FiDollarSign,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-indigo-500 to-blue-600',
      cardBg: 'bg-gradient-to-br from-indigo-50 to-blue-50',
      iconBg: 'bg-white/20',
      link: '/admin/reports/revenue'
    },
    {
      title: 'Soil Test Revenue',
      value: formatCurrency(stats.soilTestRevenue || 0),
      change: 0,
      icon: FiDollarSign,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      cardBg: 'bg-gradient-to-br from-emerald-50 to-teal-50',
      iconBg: 'bg-white/20',
      link: '/admin/reports/revenue'
    },
    {
      title: 'E-commerce Revenue',
      value: formatCurrency(stats.ecommerceRevenue || 0),
      change: 0,
      icon: FiDollarSign,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-rose-500 to-pink-600',
      cardBg: 'bg-gradient-to-br from-rose-50 to-pink-50',
      iconBg: 'bg-white/20',
      link: '/admin/products/orders'
    },
    {
      title: 'Active Operations',
      value: (stats.activeBookings || 0).toLocaleString(),
      change: 0,
      icon: FiShoppingBag,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-blue-500 to-indigo-600',
      cardBg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
      iconBg: 'bg-white/20',
      link: '/admin/reports/bookings'
    },
    {
      title: 'Completed Bookings',
      value: (stats.completedBookings || 0).toLocaleString(),
      change: 0,
      icon: FiActivity,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-purple-500 to-violet-600',
      cardBg: 'bg-gradient-to-br from-purple-50 to-violet-50',
      iconBg: 'bg-white/20',
      link: '/admin/reports/bookings'
    },
    {
      title: 'Total Farmers',
      value: (stats.totalUsers || 0).toLocaleString(),
      change: 0,
      icon: FiUser,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-orange-500 to-amber-600',
      cardBg: 'bg-gradient-to-br from-orange-50 to-amber-50',
      iconBg: 'bg-white/20',
      link: '/admin/users/analytics'
    },
    {
      title: 'Equipment Owners',
      value: (stats.totalVendors || 0).toLocaleString(),
      change: 0,
      icon: FiBriefcase,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-teal-500 to-cyan-600',
      cardBg: 'bg-gradient-to-br from-teal-50 to-cyan-50',
      iconBg: 'bg-white/20',
      link: '/admin/vendors/analytics'
    },
    {
      title: 'Total Workers',
      value: (stats.totalWorkers || 0).toLocaleString(),
      change: 0,
      icon: FiUsers,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-blue-600 to-indigo-700',
      cardBg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
      iconBg: 'bg-white/20',
      link: '/admin/workers/all'
    },
    {
      title: 'Team Leaders',
      value: (stats.totalTeamLeaders || 0).toLocaleString(),
      change: 0,
      icon: FiAward,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-amber-500 to-orange-600',
      cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50',
      iconBg: 'bg-white/20',
      link: '/admin/workers/all'
    },
    {
      title: 'Independent Workers',
      value: (stats.totalIndependentWorkers || 0).toLocaleString(),
      change: 0,
      icon: FiUserCheck,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-cyan-600 to-blue-600',
      cardBg: 'bg-gradient-to-br from-cyan-50 to-blue-50',
      iconBg: 'bg-white/20',
      link: '/admin/workers/all'
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {!isSuperAdmin ? (
        /* ═══════════════════════════════════════════════════════════════════ */
        /* ── FIELD ADMIN DASHBOARD (Operations, Territory, Compensation) ─── */
        /* ═══════════════════════════════════════════════════════════════════ */
        <div className="space-y-5">
          {/* Header */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                  Field Administrator
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <FiMapPin className="w-3 h-3" />
                  {currentAdmin.districtName ? `District: ${currentAdmin.districtName}` : currentAdmin.cityName ? `City: ${currentAdmin.cityName}` : 'Assigned Territory'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                  Active
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                Welcome back, {currentAdmin.name || 'Admin'}! 👋
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Here is your territory operations, registrations, and compensation overview.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TimePeriodFilter
                selectedPeriod={period}
                onPeriodChange={setPeriod}
                onExport={handleExportCsv}
              />
            </div>
          </div>

          {/* Performance & Compensation Section (Hero Cards) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Card 1: My Compensation & Official Salary Status (Separated) */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between space-y-4">
              {/* Part 1: Compensation & Earnings (Calculated / Estimated) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 uppercase tracking-wider text-indigo-200">
                    Compensation &amp; Earnings
                  </span>
                  <span className="text-[11px] text-indigo-200">
                    Cycle: {stats.adminCompensation?.payFrequency || currentAdmin.salary?.payFrequency || 'Monthly'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-xs text-indigo-200 font-medium">Estimated / Current Payable</p>
                    <p className="text-3xl font-black text-emerald-400 mt-0.5">
                      ₹{(stats.adminCompensation?.estimatedCurrentCompensation || stats.adminCompensation?.totalEstimatedPayout || currentAdmin.salary?.baseSalary || 0).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30">
                    Accruing
                  </span>
                </div>
              </div>

              {/* Formula items */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/10 p-2.5 rounded-xl backdrop-blur-xs">
                  <p className="text-[10px] text-gray-300 font-medium">Base Salary</p>
                  <p className="text-base font-bold text-white mt-0.5">
                    ₹{(stats.adminCompensation?.baseSalary || currentAdmin.salary?.baseSalary || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white/10 p-2.5 rounded-xl backdrop-blur-xs">
                  <p className="text-[10px] text-emerald-300 font-medium">Earned Incentives</p>
                  <p className="text-base font-bold text-emerald-300 mt-0.5">
                    +₹{(stats.adminCompensation?.earnedIncentive || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-indigo-200/80">
                Incentive Rates: 👨‍🌾 ₹{stats.adminCompensation?.farmerIncentive || currentAdmin.salary?.farmerIncentive || 0} · 🚜 ₹{stats.adminCompensation?.vendorIncentive || currentAdmin.salary?.vendorIncentive || 0} · 👷 ₹{stats.adminCompensation?.workerIncentive || currentAdmin.salary?.workerIncentive || 0}
              </div>

              {/* Threshold & Registration Incentives Breakdown */}
              <div className="bg-white/10 p-3 rounded-xl backdrop-blur-xs space-y-2 border border-white/10 text-xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-200">
                  <span className="flex items-center gap-1">
                    <span>🎯</span> Minimum Registration Threshold
                  </span>
                  <span className="bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/30 text-[10px]">
                    Min Req: {stats.adminCompensation?.minRegistrationsThreshold || 0}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                  <div className="bg-black/20 p-1.5 rounded-lg">
                    <span className="text-gray-300 block">Combined Total</span>
                    <strong className="text-white text-xs">{stats.adminCompensation?.currentTotalRegistrations || (stats.adminCompensation?.curFarmers + stats.adminCompensation?.curVendors + stats.adminCompensation?.curWorkers) || 0}</strong>
                  </div>
                  <div className="bg-black/20 p-1.5 rounded-lg">
                    <span className="text-gray-300 block">Threshold</span>
                    <strong className="text-amber-300 text-xs">{stats.adminCompensation?.minRegistrationsThreshold || 0}</strong>
                  </div>
                  <div className="bg-black/20 p-1.5 rounded-lg">
                    <span className="text-gray-300 block">Eligible Count</span>
                    <strong className={(stats.adminCompensation?.qualifyingRegistrationsCount || 0) > 0 ? "text-emerald-300 text-xs" : "text-gray-400 text-xs"}>
                      {stats.adminCompensation?.qualifyingRegistrationsCount || 0}
                    </strong>
                  </div>
                </div>

                {(stats.adminCompensation?.registrationsRemainingToUnlock || 0) > 0 ? (
                  <p className="text-[10px] text-amber-300/90 text-center font-medium">
                    🔒 {stats.adminCompensation.registrationsRemainingToUnlock} more registrations needed to unlock incentives.
                  </p>
                ) : (stats.adminCompensation?.qualifyingRegistrationsCount || 0) > 0 ? (
                  <p className="text-[10px] text-emerald-300 text-center font-medium">
                    ✓ Threshold reached! {stats.adminCompensation.qualifyingRegistrationsCount} registrations earning incentives.
                  </p>
                ) : (
                  <p className="text-[10px] text-indigo-200/70 text-center">
                    {(stats.adminCompensation?.minRegistrationsThreshold || 0) === 0
                      ? '⚡ Zero threshold: All registrations are incentive eligible.'
                      : 'Accruing registrations toward threshold.'}
                  </p>
                )}

                {/* Role-wise earned incentives */}
                <div className="pt-1.5 border-t border-white/10 grid grid-cols-3 gap-1 text-[10px] text-indigo-100 text-center">
                  <div>
                    <span className="text-gray-400 block">👨‍🌾 Farmers</span>
                    <span className="font-bold text-white">₹{(stats.adminCompensation?.farmerIncentives || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">🚜 Eq. Owners</span>
                    <span className="font-bold text-white">₹{(stats.adminCompensation?.vendorIncentives || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">👷 Workers</span>
                    <span className="font-bold text-white">₹{(stats.adminCompensation?.workerIncentives || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Part 2: Official Salary Payment Status (SEPARATED FROM EARNINGS) */}
              <div className="pt-3 border-t border-white/15 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    {stats.adminCompensation?.monthName || 'Current Month'} Salary Status
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    stats.adminCompensation?.isPaid
                      ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/40'
                      : stats.adminCompensation?.isPartiallyPaid
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                        : 'bg-blue-400/20 text-blue-200 border border-blue-400/30'
                  }`}>
                    {stats.adminCompensation?.isPaid
                      ? 'PAID ✓'
                      : stats.adminCompensation?.isPartiallyPaid
                        ? 'PARTIALLY PAID'
                        : 'PENDING PAYMENT'}
                  </span>
                </div>

                {stats.adminCompensation?.isPaid ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-xs space-y-0.5">
                    <p className="font-bold text-emerald-300">
                      Paid: ₹{(stats.adminCompensation.paidThisMonth || 0).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-300">
                      Paid On: {new Date(stats.adminCompensation.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {stats.adminCompensation.utr && ` · UTR: ${stats.adminCompensation.utr}`}
                    </p>
                  </div>
                ) : stats.adminCompensation?.isPartiallyPaid ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl text-xs space-y-0.5">
                    <p className="font-bold text-amber-300">
                      Paid: ₹{(stats.adminCompensation.paidThisMonth || 0).toLocaleString()} · Remaining: ₹{(stats.adminCompensation.pendingSalary || 0).toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white/5 p-2 rounded-xl text-[11px] text-slate-300 flex items-center justify-between">
                    <span>Payable: ₹{(stats.adminCompensation?.estimatedCurrentCompensation || stats.adminCompensation?.totalEstimatedPayout || 0).toLocaleString()}</span>
                    <span className="text-[10px] text-indigo-300 italic">Awaiting disbursement</span>
                  </div>
                )}

                {/* History link */}
                <button
                  type="button"
                  onClick={() => setShowSalaryHistoryModal(true)}
                  className="w-full mt-1 py-1.5 px-3 bg-white/10 hover:bg-white/20 rounded-xl text-[11px] font-bold text-white transition text-center flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FiClock className="w-3.5 h-3.5" />
                  View Salary History &amp; Payslips
                </button>
              </div>
            </div>

            {/* Card 2: People Added by Me (Self-Attribution) */}
            <div className="bg-gradient-to-br from-indigo-700 via-blue-700 to-indigo-800 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 uppercase tracking-wider text-blue-100">
                    Self Attribution & Onboarding
                  </span>
                  <span className="text-[11px] text-blue-200">Personal Contribution</span>
                </div>
                <p className="text-xs text-blue-200 font-medium">Total People Added by You</p>
                <p className="text-3xl font-black text-white mt-1">
                  {myRegistrations.total} <span className="text-sm font-semibold text-blue-200">onboarded</span>
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-2 text-center text-xs">
                <button
                  onClick={() => navigate('/admin/users/all?createdByMe=true')}
                  className="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition cursor-pointer"
                >
                  <p className="text-base font-bold text-emerald-300">{myRegistrations.farmers}</p>
                  <p className="text-[10px] text-blue-100 mt-0.5">👨‍🌾 Farmers</p>
                </button>
                <button
                  onClick={() => navigate('/admin/vendors/all?createdByMe=true')}
                  className="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition cursor-pointer"
                >
                  <p className="text-base font-bold text-amber-300">{myRegistrations.vendors}</p>
                  <p className="text-[10px] text-blue-100 mt-0.5">🚜 Owners</p>
                </button>
                <button
                  onClick={() => navigate('/admin/workers/all?createdByMe=true')}
                  className="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition cursor-pointer"
                >
                  <p className="text-base font-bold text-purple-300">{myRegistrations.workers}</p>
                  <p className="text-[10px] text-blue-100 mt-0.5">👷 Workers</p>
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-blue-200">
                <span>Verified accounts under your credentials</span>
                <button
                  onClick={() => navigate('/admin/users/all?createdByMe=true')}
                  className="text-white underline font-semibold cursor-pointer"
                >
                  View My Registrations →
                </button>
              </div>
            </div>
          </div>

          {/* Territory Operations Section */}
          <div>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FiMapPin className="text-blue-600" />
              Territory Operations ({currentAdmin.districtName || currentAdmin.cityName || 'Assigned Territory'})
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div onClick={() => navigate('/admin/users/all')} className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs hover:shadow-md transition cursor-pointer">
                <span className="text-2xl">👨‍🌾</span>
                <p className="text-xs font-medium text-gray-500 mt-2">Farmers in Scope</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.totalUsers}</p>
              </div>
              <div onClick={() => navigate('/admin/vendors/all')} className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs hover:shadow-md transition cursor-pointer">
                <span className="text-2xl">🚜</span>
                <p className="text-xs font-medium text-gray-500 mt-2">Equipment Owners</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.totalVendors}</p>
              </div>
              <div onClick={() => navigate('/admin/workers/all')} className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs hover:shadow-md transition cursor-pointer">
                <span className="text-2xl">👷</span>
                <p className="text-xs font-medium text-gray-500 mt-2">Workers in Scope</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.totalWorkers}</p>
              </div>
              <div onClick={() => navigate('/admin/bookings/tracking')} className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs hover:shadow-md transition cursor-pointer">
                <span className="text-2xl">⚡</span>
                <p className="text-xs font-medium text-gray-500 mt-2">Active Operations</p>
                <p className="text-xl font-bold text-blue-600 mt-0.5">{stats.activeBookings}</p>
              </div>
              <div onClick={() => navigate('/admin/bookings/all')} className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs hover:shadow-md transition cursor-pointer">
                <span className="text-2xl">✅</span>
                <p className="text-xs font-medium text-gray-500 mt-2">Completed Bookings</p>
                <p className="text-xl font-bold text-emerald-600 mt-0.5">{stats.completedBookings}</p>
              </div>
            </div>
          </div>

          {/* Territory Bookings & Equipment Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BookingStatusPieChart bookings={recentBookingsList} />
            <TopEquipment bookings={recentBookingsList} periodLabel="Top Booked in Territory" />
          </div>

          {/* Recent Territory Bookings */}
          <div className="grid grid-cols-1 gap-4">
            <RecentBookings bookings={recentBookingsList} onViewBooking={onViewBooking} />
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════ */
        /* ── SUPER ADMIN MASTER DASHBOARD (Platform Financials & Growth) ──── */
        /* ═══════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="w-full">
              <TimePeriodFilter
                selectedPeriod={period}
                onPeriodChange={setPeriod}
                onExport={handleExportCsv}
              />
            </div>
          </div>

          {/* Super Admin Traceability Banner */}
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                  Super Admin Master Overview
                </span>
                <span className="text-xs text-blue-200">Platform-Wide Data</span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold flex items-center gap-2">
                <span>People Added by Me:</span>
                <span className="text-emerald-400 font-black">{myRegistrations.total}</span>
              </h2>
              <p className="text-xs text-blue-200 mt-0.5">
                Farmers, equipment owners &amp; workers onboarded directly under your Super Admin credentials
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <button
                onClick={() => navigate('/admin/users/all?createdByMe=true')}
                className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <span className="text-emerald-400 font-extrabold">{myRegistrations.farmers}</span>
                <span>Farmers</span>
              </button>
              <button
                onClick={() => navigate('/admin/vendors/all?createdByMe=true')}
                className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <span className="text-amber-400 font-extrabold">{myRegistrations.vendors}</span>
                <span>Equipment Owners</span>
              </button>
              <button
                onClick={() => navigate('/admin/workers/all?createdByMe=true')}
                className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <span className="text-purple-400 font-extrabold">{myRegistrations.workers}</span>
                <span>Workers</span>
              </button>
            </div>
          </div>

          {/* Super Admin Financial & Operations Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {statsCards.map((card, index) => {
              const Icon = card.icon;
              const isPositive = (card.change || 0) >= 0;

              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => card.link && navigate(card.link)}
                  className={`${card.cardBg} rounded-xl p-3 sm:p-4 shadow-sm border border-transparent hover:shadow-md transition-all duration-300 relative overflow-hidden cursor-pointer group`}
                >
                  <div className={`absolute top-0 right-0 w-24 h-24 ${card.bgColor} opacity-10 rounded-full -mr-12 -mt-12 group-hover:scale-110 transition-transform`} />

                  <div className="flex items-center justify-between mb-2 sm:mb-3 relative z-10">
                    <div className={`${card.bgColor} ${card.iconBg} p-1.5 sm:p-2 rounded-lg shadow-sm`}>
                      <Icon className={`${card.color} text-base sm:text-lg`} />
                    </div>
                    {card.change !== 0 && (
                      <div
                        className={`text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded-full ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                      >
                        {isPositive ? '+' : ''}
                        {Math.abs(card.change || 0)}%
                      </div>
                    )}
                  </div>

                  <div className="relative z-10">
                    <h3 className="text-gray-600 text-[10px] sm:text-xs font-medium mb-0.5">{card.title}</h3>
                    <p className="text-gray-800 text-lg sm:text-xl font-bold">{card.value}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Super Admin Platform Financial & Growth Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RevenueLineChart data={revenueData} period={period} />
            <BookingsBarChart data={revenueData} period={period} />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <BookingStatusPieChart bookings={recentBookingsList} />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <RevenueVsBookingsChart data={revenueData} period={period} />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <CustomerGrowthAreaChart timelineData={revenueData} bookings={recentBookingsList} period={period} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopEquipment
              bookings={recentBookingsList}
              periodLabel="Top Booked Equipment (Recent)"
            />
            <RecentBookings bookings={recentBookingsList} onViewBooking={onViewBooking} />
          </div>
        </div>
      )}

      {/* Field Admin Personal Salary History & Payslip Modal */}
      <MySalaryHistoryModal
        isOpen={showSalaryHistoryModal}
        onClose={() => setShowSalaryHistoryModal(false)}
      />
    </motion.div>
  );
};

export default AdminDashboard;
