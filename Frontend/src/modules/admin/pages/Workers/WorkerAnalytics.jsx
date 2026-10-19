import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FiUsers,
  FiAward,
  FiUserCheck,
  FiBriefcase,
  FiCheckCircle,
  FiDollarSign,
  FiStar,
  FiTrendingUp,
  FiClock,
  FiRefreshCw,
  FiActivity,
  FiAlertCircle,
  FiShield
} from 'react-icons/fi';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar
} from 'recharts';
import workerService from '../../services/workerService';
import LogoLoader from '../../../../components/common/LogoLoader';
import { toastManager } from '../../../../utils/toastManager';
import { formatCurrency } from '../../utils/adminHelpers';

const WorkerAnalytics = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30'); // '30', '90', '365'

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await workerService.getWorkerAnalytics({ period });
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (error) {
      console.error('Error fetching worker analytics:', error);
      toastManager.error('Failed to load worker analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-12 flex justify-center items-center min-h-[400px]">
        <LogoLoader />
      </div>
    );
  }

  const summary = data?.summary || {
    totalWorkers: 0,
    totalTeamLeaders: 0,
    totalIndependentWorkers: 0,
    approvedWorkers: 0,
    pendingWorkers: 0,
    suspendedWorkers: 0,
    rejectedWorkers: 0,
    totalJobs: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    inProgressJobs: 0,
    totalRevenue: 0,
    avgRating: 4.8
  };

  const workerTypeData = data?.workerTypeDistribution || [
    { name: 'Team Leaders', value: summary.totalTeamLeaders, color: '#f59e0b' },
    { name: 'Independent Workers', value: summary.totalIndependentWorkers, color: '#3b82f6' }
  ];

  const statusData = data?.statusDistribution || [
    { name: 'Approved', value: summary.approvedWorkers, color: '#10b981' },
    { name: 'Pending', value: summary.pendingWorkers, color: '#f59e0b' },
    { name: 'Suspended', value: summary.suspendedWorkers, color: '#ef4444' },
    { name: 'Rejected', value: summary.rejectedWorkers, color: '#64748b' }
  ];

  const monthlyTrends = data?.monthlyTrends || [];
  const skillsData = data?.skillsDistribution || [];
  const topWorkers = data?.topWorkers || [];

  const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];

  return (
    <div className="space-y-6">
      {/* Header with Period Filter & Refresh */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FiActivity className="text-blue-600" />
            Worker & Workforce Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Key performance metrics, workforce distribution, booking completion rates, and top performers.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="30">Last 30 Days</option>
            <option value="90">Last 3 Months</option>
            <option value="365">Last 1 Year</option>
          </select>

          <button
            onClick={fetchAnalytics}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
            title="Refresh Analytics"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Workforce Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/admin/workers/all')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/admin/workers/all'); }}
          title="Tap to see the records behind this number"
          className="cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] transition-transform bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg shadow-blue-500/10 relative overflow-hidden"
        >
          <div className="absolute right-0 top-0 w-28 h-28 bg-white/10 rounded-full -mr-8 -mt-8 pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-blue-100 uppercase tracking-wider">Total Workforce</span>
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
              <FiUsers />
            </div>
          </div>
          <h3 className="text-3xl font-black">{summary.totalWorkers}</h3>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-blue-100 font-semibold">
            <span>👑 {summary.totalTeamLeaders} Team Leaders</span>
            <span>👷 {summary.totalIndependentWorkers} Normal</span>
          </div>
        </motion.div>

        {/* Active & Verified Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => navigate('/admin/workers/all?status=approved')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/admin/workers/all?status=approved'); }}
          title="Tap to see the records behind this number"
          className="cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] transition-transform bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-5 text-white shadow-lg shadow-emerald-500/10 relative overflow-hidden"
        >
          <div className="absolute right-0 top-0 w-28 h-28 bg-white/10 rounded-full -mr-8 -mt-8 pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-emerald-100 uppercase tracking-wider">Approved & Active</span>
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
              <FiShield />
            </div>
          </div>
          <h3 className="text-3xl font-black">{summary.approvedWorkers}</h3>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-emerald-100 font-semibold">
            <span>⏳ {summary.pendingWorkers} Pending Approval</span>
            <span>🚫 {summary.suspendedWorkers} Suspended</span>
          </div>
        </motion.div>

        {/* Completed Jobs Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => navigate('/admin/workers/bookings?status=completed')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/admin/workers/bookings?status=completed'); }}
          title="Tap to see the records behind this number"
          className="cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] transition-transform bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-5 text-white shadow-lg shadow-amber-500/10 relative overflow-hidden"
        >
          <div className="absolute right-0 top-0 w-28 h-28 bg-white/10 rounded-full -mr-8 -mt-8 pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-100 uppercase tracking-wider">Completed Jobs</span>
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
              <FiCheckCircle />
            </div>
          </div>
          <h3 className="text-3xl font-black">{summary.completedJobs}</h3>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-amber-100 font-semibold">
            <span>Total Bookings: {summary.totalJobs}</span>
            <span>Active: {summary.inProgressJobs}</span>
          </div>
        </motion.div>

        {/* Avg Rating & Job Value Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => navigate('/admin/workers/bookings?status=completed')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/admin/workers/bookings?status=completed'); }}
          title="Tap to see the records behind this number"
          className="cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] transition-transform bg-gradient-to-br from-purple-500 to-violet-600 rounded-3xl p-5 text-white shadow-lg shadow-purple-500/10 relative overflow-hidden"
        >
          <div className="absolute right-0 top-0 w-28 h-28 bg-white/10 rounded-full -mr-8 -mt-8 pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-purple-100 uppercase tracking-wider">Avg Rating & Value</span>
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
              <FiStar />
            </div>
          </div>
          <h3 className="text-3xl font-black flex items-center gap-1.5">
            ⭐ {summary.avgRating} <span className="text-sm font-normal text-purple-200">/ 5.0</span>
          </h3>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-purple-100 font-semibold">
            <span>Total Job Value:</span>
            <span className="font-bold">{formatCurrency(summary.totalRevenue || 0)}</span>
          </div>
        </motion.div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Worker Type Distribution Donut Chart */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-slate-800">Worker Type Composition</h3>
            <p className="text-xs text-slate-500 mt-0.5">Team Leaders vs Independent Workers</p>
          </div>

          <div className="h-60 flex items-center justify-center my-3">
            {summary.totalWorkers > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={workerTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {workerTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-400 font-bold">No workers data available</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
            {workerTypeData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: item.color }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-700 truncate">{item.name}</p>
                  <p className="text-xs font-black text-slate-900">
                    {item.value} ({summary.totalWorkers ? Math.round((item.value / summary.totalWorkers) * 100) : 0}%)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Booking Trend Area Chart */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-800">Monthly Booking Fulfillment</h3>
              <p className="text-xs text-slate-500 mt-0.5">Total assignments vs Completed jobs over time</p>
            </div>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl">
              Last 6 Months
            </span>
          </div>

          <div className="h-64 mt-4">
            {monthlyTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="totalColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="completedColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="totalBookings" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#totalColor)" name="Total Bookings" />
                  <Area type="monotone" dataKey="completedBookings" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#completedColor)" name="Completed" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-bold">
                No monthly trends recorded yet
              </div>
            )}
          </div>

          <div className="flex items-center gap-6 justify-center pt-2 text-xs font-bold text-slate-600">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span> Total Bookings
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span> Completed Jobs
            </span>
          </div>
        </div>
      </div>

      {/* Skills Demand & Verification Status Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Skills Distribution Bar Chart */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-base font-black text-slate-800">Top Worker Skills & Specializations</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Distribution of registered skills among workforce</p>

          <div className="h-64">
            {skillsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={skillsData} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="skill" type="category" tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} width={100} />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 8, 8, 0]} name="Workers with Skill" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-bold">
                No skill metrics recorded yet
              </div>
            )}
          </div>
        </div>

        {/* Verification & Approval Breakdown */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-slate-800">Worker Approval & Account Status</h3>
            <p className="text-xs text-slate-500 mt-0.5">Verification status of workforce accounts</p>
          </div>

          <div className="grid grid-cols-2 gap-3 my-4">
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Approved</span>
              <span className="text-2xl font-black text-emerald-800">{summary.approvedWorkers}</span>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Pending Review</span>
              <span className="text-2xl font-black text-amber-800">{summary.pendingWorkers}</span>
            </div>
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block">Suspended</span>
              <span className="text-2xl font-black text-rose-800">{summary.suspendedWorkers}</span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Rejected</span>
              <span className="text-2xl font-black text-slate-800">{summary.rejectedWorkers}</span>
            </div>
          </div>

          <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-center gap-3">
            <FiShield className="text-blue-600 shrink-0 text-xl" />
            <p className="text-xs text-blue-900 font-medium leading-relaxed">
              Workers must be approved by admin with verified Aadhar documents before accepting farm assignments.
            </p>
          </div>
        </div>
      </div>

      {/* Top Performing Workers Table */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <FiAward className="text-amber-500" />
              Top Rated & Active Workers
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Top performing farm workers and team leaders by completed jobs and rating.</p>
          </div>
        </div>

        {topWorkers.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            No worker performance records yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-2">#</th>
                  <th className="pb-3">Worker Name</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Phone</th>
                  <th className="pb-3">Completed Jobs</th>
                  <th className="pb-3">Rating</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {topWorkers.map((worker, idx) => (
                  <tr key={worker._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 pl-2 font-bold text-slate-400">{idx + 1}</td>
                    <td className="py-3.5">
                      <div className="flex items-center gap-3">
                        {worker.profilePhoto || worker.profileImage ? (
                          <img
                            src={worker.profilePhoto || worker.profileImage}
                            alt={worker.name}
                            className="w-8 h-8 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {worker.name?.charAt(0) ?.toUpperCase() || 'W'}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-900">{worker.name}</p>
                          {worker.skills?.length > 0 && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{worker.skills.join(', ')}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5">
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          worker.workerType === 'TEAM_LEADER'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {worker.workerType === 'TEAM_LEADER' ? 'Team Leader' : 'Worker'}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-600 font-mono">{worker.phone}</td>
                    <td className="py-3.5 font-bold text-slate-900">{worker.completedJobs || worker.totalJobs || 0}</td>
                    <td className="py-3.5">
                      <span className="inline-flex items-center gap-1 font-bold text-amber-500">
                        <FiStar className="fill-amber-400" size={12} />
                        {worker.rating ? worker.rating.toFixed(1) : '5.0'}
                      </span>
                    </td>
                    <td className="py-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {worker.status || 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerAnalytics;
