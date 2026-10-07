import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSearch,
  FiFilter,
  FiDownload,
  FiDollarSign,
  FiTrendingUp,
  FiTrendingDown,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiRefreshCw,
  FiCalendar,
  FiUser,
  FiShield,
  FiActivity,
  FiInfo,
  FiX,
  FiCheck
} from 'react-icons/fi';
import { adminTransactionService } from '../../../../services/adminTransactionService';
import toast from 'react-hot-toast';

const PaymentOverview = () => {
  // Financial Cards State
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalRefunds: 0,
    netRevenue: 0,
    grossCustomerPayments: 0,
    totalPlatformFees: 0,
    vendorCommission: 0,
    workerCommission: 0,
    userFarmerPlatformFees: 0,
    vendorPlatformFees: 0,
    workerPlatformFees: 0,
    totalWithdrawals: 0,
    totalReferralRewards: 0,
    totalVendorEarningsCredited: 0,
    totalWorkerEarningsCredited: 0
  });

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1
  });

  // Filters
  const [timeFilter, setTimeFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Reconciliation Modal State
  const [showReconModal, setShowReconModal] = useState(false);
  const [reconData, setReconData] = useState(null);
  const [reconLoading, setReconLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 450);
    return () => clearTimeout(timer);
  }, [search]);

  // Refetch when filters or pagination change
  useEffect(() => {
    fetchData();
  }, [
    pagination.page,
    debouncedSearch,
    timeFilter,
    customStartDate,
    customEndDate,
    roleFilter,
    statusFilter,
    categoryFilter
  ]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const filterParams = {
        timeFilter,
        startDate: timeFilter === 'custom' ? customStartDate : undefined,
        endDate: timeFilter === 'custom' ? customEndDate : undefined,
        role: roleFilter,
        status: statusFilter,
        category: categoryFilter,
        search: debouncedSearch
      };

      const [statsRes, txRes] = await Promise.all([
        adminTransactionService.getTransactionStats(filterParams),
        adminTransactionService.getAllTransactions({
          ...filterParams,
          page: pagination.page,
          limit: pagination.limit
        })
      ]);

      if (statsRes && statsRes.success && statsRes.data) {
        setStats(prev => ({ ...prev, ...statsRes.data }));
      }

      if (txRes && txRes.success) {
        setTransactions(txRes.data || []);
        if (txRes.pagination) {
          setPagination(prev => ({
            ...prev,
            total: txRes.pagination.total || 0,
            pages: txRes.pagination.pages || 1
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching financial analytics data:', error);
      toast.error('Failed to load financial data');
    } finally {
      setLoading(false);
    }
  };

  const handleRunReconciliation = async () => {
    try {
      setReconLoading(true);
      setShowReconModal(true);
      const res = await adminTransactionService.getReconciliationReport();
      if (res && res.success) {
        setReconData(res);
      } else {
        toast.error('Could not complete reconciliation');
      }
    } catch (err) {
      console.error('Reconciliation error:', err);
      toast.error('Failed to run reconciliation');
    } finally {
      setReconLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      toast.loading('Preparing financial export...', { id: 'csv-export' });

      const filterParams = {
        timeFilter,
        startDate: timeFilter === 'custom' ? customStartDate : undefined,
        endDate: timeFilter === 'custom' ? customEndDate : undefined,
        role: roleFilter,
        status: statusFilter,
        category: categoryFilter,
        search: debouncedSearch
      };

      const blob = await adminTransactionService.exportTransactionsCSV(filterParams);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `agroyilt_financial_analytics_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      toast.success('Financial CSV exported successfully!', { id: 'csv-export' });
    } catch (error) {
      console.error('Export CSV error:', error);
      toast.error('Failed to export CSV', { id: 'csv-export' });
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount || 0));
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'completed':
      case 'paid':
      case 'success':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <FiCheckCircle className="w-3 h-3 mr-1" />
            Completed
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <FiClock className="w-3 h-3 mr-1" />
            Pending
          </span>
        );
      case 'failed':
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <FiXCircle className="w-3 h-3 mr-1" />
            Failed
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
            <FiAlertCircle className="w-3 h-3 mr-1" />
            Refunded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  const getCategoryBadge = (category) => {
    switch (category) {
      case 'GROSS_CUSTOMER_PAYMENT':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Customer Payment</span>;
      case 'VENDOR_COMMISSION':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Vendor Commission</span>;
      case 'WORKER_COMMISSION':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">Worker Commission</span>;
      case 'PLATFORM_FEE':
      case 'USER_FARMER_FEE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Platform Fee</span>;
      case 'RECOGNIZED_REFUND':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Refund</span>;
      case 'WITHDRAWAL':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">Withdrawal Payout</span>;
      case 'EARNINGS_CREDIT':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Vendor Earning</span>;
      case 'WORKER_PAYMENT':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">Worker Earning</span>;
      case 'REFERRAL_REWARD':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-pink-50 text-pink-700 border border-pink-200">Referral Reward</span>;
      case 'SETTLEMENT':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">Cash Settlement</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-gray-50 text-gray-600 border border-gray-200">Transfer/Other</span>;
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'vendor':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800">Vendor</span>;
      case 'worker':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-teal-100 text-teal-800">Worker</span>;
      case 'user':
      case 'farmer':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-blue-800">Farmer</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-gray-100 text-gray-700">System</span>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Top Filter and Controls Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200/80 space-y-4">
        {/* Row 1: Time Filter Presets & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <FiCalendar className="w-3.5 h-3.5" />
              Period:
            </span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'last_7_days', label: 'Last 7 Days' },
              { id: 'last_30_days', label: 'Last 30 Days' },
              { id: 'this_month', label: 'This Month' },
              { id: 'previous_month', label: 'Prev Month' },
              { id: 'custom', label: 'Custom' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeFilter(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  timeFilter === t.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunReconciliation}
              className="px-3.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-blue-200 transition-colors"
              title="Audit and verify ledger integrity"
            >
              <FiShield className="w-3.5 h-3.5" />
              Ledger Audit
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              title="Refresh Analytics"
            >
              <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              <FiDownload className="w-3.5 h-3.5" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker (shown when 'custom' is active) */}
        {timeFilter === 'custom' && (
          <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 flex flex-wrap items-center gap-3 animate-fadeIn">
            <span className="text-xs font-bold text-emerald-900">Custom Date Range:</span>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-gray-500 font-semibold">From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-1 bg-white border border-gray-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-gray-500 font-semibold">To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-1 bg-white border border-gray-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Row 2: Search, Role, Status, and Category Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search reference, phone, name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          <div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Roles (Farmer, Vendor, Worker)</option>
              <option value="user">Farmer / User</option>
              <option value="vendor">Vendor</option>
              <option value="worker">Farm Worker</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed / Settled</option>
              <option value="pending">Pending Processing</option>
              <option value="failed">Failed / Cancelled</option>
            </select>
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Financial Categories</option>
              <option value="GROSS_CUSTOMER_PAYMENT">Customer Payments (Gross)</option>
              <option value="VENDOR_COMMISSION">Vendor Commissions</option>
              <option value="WORKER_COMMISSION">Worker Commissions</option>
              <option value="PLATFORM_FEE">Platform Fees</option>
              <option value="RECOGNIZED_REFUND">Recognized Refunds</option>
              <option value="WITHDRAWAL">Withdrawals / Payouts</option>
              <option value="EARNINGS_CREDIT">Vendor Earnings</option>
              <option value="WORKER_PAYMENT">Worker Earnings</option>
              <option value="REFERRAL_REWARD">Referral Rewards</option>
              <option value="SETTLEMENT">Cash Dues Settlements</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── ROW 1: PRIMARY RECOGNIZED REVENUE METRICS ── */}
      <div>
        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 pl-1">
          Recognized Platform Revenue (Net of Third-Party Earnings)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Total Revenue */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
            <div className="flex items-start justify-between relative z-10">
              <div>
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                  Total Recognized Revenue
                </span>
                <h2 className="text-3xl font-black text-gray-900 mt-1">
                  {formatCurrency(stats.totalRevenue)}
                </h2>
                <p className="text-xs text-gray-500 mt-1.5 font-medium">
                  Commissions + Platform & Onboarding Fees
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
                <FiDollarSign className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Card 2: Total Refunds */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-rose-100 relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
            <div className="flex items-start justify-between relative z-10">
              <div>
                <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                  Total Recognized Refunds
                </span>
                <h2 className="text-3xl font-black text-rose-600 mt-1">
                  {formatCurrency(stats.totalRefunds)}
                </h2>
                <p className="text-xs text-gray-500 mt-1.5 font-medium">
                  Processed customer returns affecting revenue
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shadow-sm">
                <FiTrendingDown className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Card 3: Net Revenue */}
          <div className="bg-gradient-to-br from-emerald-900 to-teal-950 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <div className="flex items-start justify-between relative z-10">
              <div>
                <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                  Net Recognized Revenue
                </span>
                <h2 className="text-3xl font-black text-white mt-1">
                  {formatCurrency(stats.netRevenue)}
                </h2>
                <p className="text-xs text-emerald-200/80 mt-1.5 font-medium">
                  Recognized Revenue − Recognized Refunds
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-emerald-300 shadow-sm">
                <FiTrendingUp className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: PLATFORM EARNINGS BREAKDOWN & GROSS PAYMENT ── */}
      <div>
        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 pl-1">
          Revenue Breakdown & Gross Customer Volumes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 4: Gross Customer Payments */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-blue-100 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                Gross Customer Payments
              </span>
              <span className="text-[9px] font-extrabold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full uppercase">
                GMV
              </span>
            </div>
            <h3 className="text-2xl font-black text-gray-900">
              {formatCurrency(stats.grossCustomerPayments)}
            </h3>
            <p className="text-[11px] text-gray-500 mt-1 leading-snug">
              Total customer transaction value (Gross inflow, not platform revenue)
            </p>
          </div>

          {/* Card 5: Total Platform Fees */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                Total Platform Fees
              </span>
              <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                PF
              </span>
            </div>
            <h3 className="text-2xl font-black text-gray-900">
              {formatCurrency(stats.totalPlatformFees)}
            </h3>
            <p className="text-[11px] text-gray-500 mt-1 leading-snug">
              Direct registration fees, visiting charges & platform service fees
            </p>
          </div>

          {/* Card 6: Total Vendor Commission */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-amber-100 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                Vendor Commission
              </span>
              <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
                VC
              </span>
            </div>
            <h3 className="text-2xl font-black text-gray-900">
              {formatCurrency(stats.vendorCommission)}
            </h3>
            <p className="text-[11px] text-gray-500 mt-1 leading-snug">
              Recognized take-rate from equipment & machinery bookings
            </p>
          </div>

          {/* Card 7: Total Worker Commission */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-teal-100 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">
                Worker Commission
              </span>
              <span className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-xs">
                WC
              </span>
            </div>
            <h3 className="text-2xl font-black text-gray-900">
              {formatCurrency(stats.workerCommission)}
            </h3>
            <p className="text-[11px] text-gray-500 mt-1 leading-snug">
              Recognized take-rate from farm labour & worker bookings
            </p>
          </div>
        </div>
      </div>

      {/* ── ROW 3: PLATFORM FEES ATTRIBUTED BY ROLE ── */}
      <div>
        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 pl-1">
          Revenue Attributed by Counterparty Role
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                Farmer / User Revenue
              </p>
              <h3 className="text-xl font-black text-gray-900 mt-1">
                {formatCurrency(stats.userFarmerPlatformFees)}
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Farmer onboarding fees, convenience fees & penalties
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FiUser className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                Vendor Platform Revenue
              </p>
              <h3 className="text-xl font-black text-gray-900 mt-1">
                {formatCurrency(stats.vendorPlatformFees)}
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Vendor commissions + owner onboarding fees
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <FiDollarSign className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                Worker Platform Revenue
              </p>
              <h3 className="text-xl font-black text-gray-900 mt-1">
                {formatCurrency(stats.workerPlatformFees)}
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Worker commissions + worker onboarding fees
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <FiActivity className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 4: SEGREGATED OPERATING LIABILITIES (NOT REVENUE) ── */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FiInfo className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Third-Party Earnings & Payout Liabilities (Not Platform Revenue)
            </h4>
          </div>
          <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
            Segregated Balances
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-xl border border-slate-200/80">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Withdrawals Completed</span>
            <p className="text-sm font-black text-gray-800 mt-0.5">{formatCurrency(stats.totalWithdrawals)}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200/80">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Vendor Earnings Credited</span>
            <p className="text-sm font-black text-gray-800 mt-0.5">{formatCurrency(stats.totalVendorEarningsCredited)}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200/80">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Worker Wages Credited</span>
            <p className="text-sm font-black text-gray-800 mt-0.5">{formatCurrency(stats.totalWorkerEarningsCredited)}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200/80">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Referral Rewards Distributed</span>
            <p className="text-sm font-black text-gray-800 mt-0.5">{formatCurrency(stats.totalReferralRewards)}</p>
          </div>
        </div>
      </div>

      {/* ── FINANCIAL TRANSACTIONS LEDGER TABLE ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Financial Transactions Ledger
            </h3>
            <p className="text-xs text-gray-500">
              Showing {transactions.length} of {pagination.total} canonical records matching filters
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-100">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Party & Role</th>
                <th className="py-3 px-4">Financial Category</th>
                <th className="py-3 px-4 text-right">Gross Amount</th>
                <th className="py-3 px-4 text-right">Revenue Impact</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Reference / Booking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-gray-400">
                    <FiRefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    Loading financial transactions...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-gray-400">
                    <FiInfo className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    No financial records found matching the selected filters.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const partyName = tx.userId?.name || tx.vendorId?.name || tx.workerId?.name || 'AgroYilt System';
                  const partyPhone = tx.userId?.phone || tx.vendorId?.phone || tx.workerId?.phone || '';
                  const bookingNo = tx.bookingId?.bookingNumber;

                  return (
                    <tr key={tx._id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-gray-900 block">{formatDate(tx.createdAt)}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{tx._id.slice(-8)}</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-900 truncate max-w-[120px]">{partyName}</span>
                          {getRoleBadge(tx.financialRole)}
                        </div>
                        {partyPhone && <span className="text-[10px] text-gray-400 block">{partyPhone}</span>}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {getCategoryBadge(tx.financialCategory)}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap font-bold text-gray-900">
                        {formatCurrency(tx.amount)}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {tx.revenueImpact > 0 ? (
                          <span className="font-black text-emerald-600">+{formatCurrency(tx.revenueImpact)}</span>
                        ) : tx.revenueImpact < 0 ? (
                          <span className="font-black text-rose-600">{formatCurrency(tx.revenueImpact)}</span>
                        ) : (
                          <span className="text-gray-400 font-semibold">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 uppercase text-[10px] font-bold text-gray-600">
                        {tx.paymentMethod || 'wallet'}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(tx.status)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-gray-500">
                        {bookingNo ? (
                          <span className="text-emerald-700 font-bold block">#{bookingNo}</span>
                        ) : null}
                        <span className="truncate max-w-[120px] block" title={tx.referenceId || ''}>
                          {tx.referenceId || 'N/A'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pagination.pages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Page <strong>{pagination.page}</strong> of <strong>{pagination.pages}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.min(pagination.pages, prev.page + 1) }))}
                disabled={pagination.page >= pagination.pages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── RECONCILIATION MODAL ── */}
      <AnimatePresence>
        {showReconModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-xl p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto"
            >
              <button
                onClick={() => setShowReconModal(false)}
                className="absolute top-5 right-5 p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FiShield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">Ledger Health & Reconciliation Audit</h3>
                  <p className="text-xs text-gray-500">Automated consistency check across gateway IDs & transactions</p>
                </div>
              </div>

              {reconLoading ? (
                <div className="py-12 text-center text-gray-400">
                  <FiRefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                  Running automated reconciliation audits...
                </div>
              ) : reconData ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl flex items-center gap-3 ${
                    reconData.isHealthy ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}>
                    {reconData.isHealthy ? (
                      <FiCheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
                    ) : (
                      <FiAlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                    )}
                    <div>
                      <h4 className="font-black text-sm">
                        {reconData.isHealthy ? 'Ledger is 100% Healthy & Consistent' : `${reconData.anomalyCount} Anomalies Detected`}
                      </h4>
                      <p className="text-xs mt-0.5 opacity-90">
                        {reconData.isHealthy
                          ? 'Zero duplicate provider references, zero orphan refunds, and zero negative ledger anomalies detected.'
                          : 'Potential duplicate reference IDs or missing transaction relations require manual review below.'}
                      </p>
                    </div>
                  </div>

                  {reconData.anomalies && reconData.anomalies.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Detected Items:</h5>
                      {reconData.anomalies.map((anom, idx) => (
                        <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-rose-600 uppercase">{anom.type}</span>
                            <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-gray-200">
                              {anom.severity}
                            </span>
                          </div>
                          <p className="text-gray-700 font-medium">{anom.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-3 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={() => setShowReconModal(false)}
                      className="px-5 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-colors"
                    >
                      Close Report
                    </button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PaymentOverview;