import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiBriefcase,
  FiSearch,
  FiCalendar,
  FiClock,
  FiUser,
  FiPhone,
  FiMapPin,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiExternalLink,
  FiCopy,
  FiCheck,
  FiX,
  FiEye,
  FiLayers,
  FiAward,
  FiDollarSign,
  FiStar,
  FiImage
} from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import workerService from '../../services/workerService';
import LogoLoader from '../../../../components/common/LogoLoader';
import { toastManager } from '../../../../utils/toastManager';
import { to12HourText } from '../../../../utils/bookingDisplay';

// What a farmer's open request is waiting on
const OPEN_REQUEST_STATUS = {
  pending: { label: 'Waiting for workers', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  matching: { label: 'Finding workers', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  awaiting_farmer_confirmation: { label: 'Waiting for farmer to select & pay', bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  // requests that ended without a booking (Cancelled Requests tab)
  cancelled: { label: 'Cancelled', bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  expired: { label: 'Expired (no one took it)', bg: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  rejected: { label: 'No worker accepted', bg: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' }
};

// Both request tabs show requests, not bookings
const REQUEST_TABS = ['open_requests', 'cancelled_requests'];

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

const WorkerBookings = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || 'all'); // e.g. opened from an Analytics card
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, pages: 1 });
  const [stats, setStats] = useState({ total: 0, completed: 0, inProgress: 0, pending: 0, cancelled: 0, openRequests: 0 });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchBookings = async (page = 1) => {
    try {
      setLoading(true);

      if (REQUEST_TABS.includes(filterStatus)) {
        const reqRes = await workerService.getOpenWorkerRequests({
          page,
          limit: pagination.limit,
          search: debouncedSearch.trim() || undefined,
          scope: filterStatus === 'cancelled_requests' ? 'closed' : undefined
        });
        if (reqRes.success) {
          setRequests(reqRes.data || []);
          if (reqRes.pagination) setPagination(reqRes.pagination);
        }
        // Keep the tab counts fresh too (cheap: limit 1)
        const statRes = await workerService.getAllWorkerJobs({ page: 1, limit: 1 });
        if (statRes.success && statRes.stats) setStats(statRes.stats);
        return;
      }

      const res = await workerService.getAllWorkerJobs({
        page,
        limit: pagination.limit,
        status: filterStatus === 'all' ? undefined : filterStatus,
        search: debouncedSearch.trim() || undefined
      });

      if (res.success) {
        setBookings(res.data || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
        if (res.stats) {
          setStats(res.stats);
        }
      }
    } catch (error) {
      console.error('Failed to fetch worker bookings:', error);
      toastManager.error('Failed to load worker bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings(1);
  }, [filterStatus, debouncedSearch]);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toastManager.success('Booking ID copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'completed':
      case 'work_done':
        return {
          label: 'Completed / Work Done',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500'
        };
      case 'in_progress':
      case 'started':
      case 'journey_started':
        return {
          label: 'In Progress',
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          dot: 'bg-indigo-500'
        };
      case 'confirmed':
      case 'accepted':
        return {
          label: 'Confirmed / Accepted',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          dot: 'bg-blue-500'
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500'
        };
      case 'awaiting_payment':
      case 'pending':
        return {
          label: 'Awaiting Payment',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500'
        };
      default:
        return {
          label: (status || 'Unknown').replace(/_/g, ' ').toUpperCase(),
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          dot: 'bg-slate-400'
        };
    }
  };

  const statusTabs = [
    { key: 'all', label: 'All Bookings', count: stats.total },
    { key: 'in_progress', label: 'In Progress / Active', count: stats.inProgress },
    { key: 'completed', label: 'Work Done / Completed', count: stats.completed },
    { key: 'awaiting_payment', label: 'Awaiting Payment', count: stats.pending },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
    { key: 'open_requests', label: 'Open Requests', count: stats.openRequests },
    { key: 'cancelled_requests', label: 'Cancelled Requests', count: stats.closedRequests },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-500/20 shrink-0">
            <FiBriefcase />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Bookings</p>
            <h4 className="text-2xl font-black text-slate-800">{stats.total || bookings.length}</h4>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-emerald-500/20 shrink-0">
            <FiCheckCircle />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completed</p>
            <h4 className="text-2xl font-black text-slate-800">{stats.completed}</h4>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-indigo-500/20 shrink-0">
            <FiClock />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">In Progress</p>
            <h4 className="text-2xl font-black text-slate-800">{stats.inProgress}</h4>
          </div>
        </div>

        <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-rose-500/20 shrink-0">
            <FiXCircle />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cancelled</p>
            <h4 className="text-2xl font-black text-slate-800">{stats.cancelled}</h4>
          </div>
        </div>
      </div>

      {/* Filter and Search Container */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
            <input
              type="text"
              placeholder={REQUEST_TABS.includes(filterStatus) ? 'Search by Farmer name, Phone, or Work title...' : 'Search by Booking #, Farmer name, Worker name, Phone, or Service...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <FiX />
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
          {statusTabs.map((tab) => {
            const isActive = filterStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterStatus(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bookings List */}
      {loading ? (
        <div className="flex justify-center py-20 bg-white rounded-3xl border border-slate-200">
          <LogoLoader />
        </div>
      ) : REQUEST_TABS.includes(filterStatus) ? (
        requests.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300 p-6">
            <h3 className="text-lg font-black text-slate-800">{filterStatus === 'cancelled_requests' ? 'No cancelled requests' : 'No open requests'}</h3>
            <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
              {filterStatus === 'cancelled_requests'
                ? 'Farmer requests that were cancelled, expired, or that no worker accepted will appear here.'
                : 'Farmer requests that are still waiting for workers or for the farmer to pay will appear here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.map((r) => {
              const st = OPEN_REQUEST_STATUS[r.status] || OPEN_REQUEST_STATUS.pending;
              const isDaily = r.bookingType === 'DAILY';
              const dateText = isDaily
                ? [formatDate(r.startDate), r.numberOfDays ? `${r.numberOfDays} day${r.numberOfDays > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')
                : [formatDate(r.scheduledDate), r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : r.startTime].filter(Boolean).join(' · ');
              const minRate = isDaily ? r.minDailyRate : r.minRate;
              const maxRate = isDaily ? r.maxDailyRate : r.maxRate;
              return (
                <motion.div
                  key={r._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 text-sm truncate">{r.workTitle || r.workCategory || 'Farm Labor Request'}</p>
                      {r.bookingNumber && <p className="text-[11px] font-mono font-bold text-slate-500">#{r.bookingNumber}</p>}
                      {r.addOnOf && (
                        <p className="text-[11px] font-bold text-amber-800">➕ Extra worker for “{r.addOnOf.title}” (#{r.addOnOf.bookingNumber})</p>
                      )}
                      <p className="text-[11px] text-slate-400 font-medium">
                        Requested {r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border text-right ${st.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`}></span>
                      {st.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 bg-slate-50/80 rounded-2xl p-3 border border-slate-100">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shrink-0">
                      {r.farmerId?.name?.charAt(0)?.toUpperCase() || 'F'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{r.farmerId?.name || 'Farmer'}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <FiPhone size={11} className="text-slate-400" />
                        {r.farmerId?.phone || 'No phone'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <FiCalendar className="text-slate-400 shrink-0" />
                      <span>{dateText || 'Flexible'}</span>
                      <span className="ml-auto font-bold text-slate-700">{r.requiredWorkers} worker{r.requiredWorkers > 1 ? 's' : ''} needed</span>
                    </div>
                    {(r.location?.addressLine1 || r.location?.city) && (
                      <div className="flex items-center gap-1.5 truncate">
                        <FiMapPin className="text-slate-400 shrink-0" />
                        <span className="truncate">{[r.location.addressLine1, r.location.city, r.location.state].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                  </div>

                  {filterStatus === 'cancelled_requests' && (
                    <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                      {r.status === 'cancelled' ? 'Cancelled' : r.status === 'expired' ? 'Expired' : 'Closed'}
                      {r.cancelledBy ? ` by ${r.cancelledBy}` : ''} on {new Date(r.cancelledAt || r.updatedAt || r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {r.rejectionReason ? ` · ${r.rejectionReason}` : ''}
                    </p>
                  )}

                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 text-center">
                    {[
                      ['Notified', r.dispatchedWorkersCount],
                      ['Accepted', r.acceptedWorkersCount],
                      ['Rejected', r.rejectedWorkersCount],
                      ['Budget', minRate || maxRate ? `₹${minRate ?? maxRate}${maxRate && maxRate !== minRate ? `–${maxRate}` : ''}` : '—']
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                        <p className="text-sm font-black text-slate-800">{value ?? 0}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )
      ) : bookings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300 p-6">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
            <FiBriefcase className="text-3xl" />
          </div>
          <h3 className="text-lg font-black text-slate-800">No worker bookings found</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
            {searchQuery || filterStatus !== 'all'
              ? 'Try adjusting your search query or status filter.'
              : 'Assigned bookings for workers will appear here.'}
          </p>
          {(searchQuery || filterStatus !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('all');
              }}
              className="mt-4 px-5 py-2 bg-blue-50 text-blue-600 font-bold text-xs rounded-xl hover:bg-blue-100 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bookings.map((booking) => {
            const statusInfo = getStatusBadge(booking.status);
            const isTeamLeader = booking.workerId?.workerType === 'TEAM_LEADER';
            const bookingIdDisplay = booking.bookingNumber || `#${booking._id.slice(-6).toUpperCase()}`;

            return (
              <motion.div
                key={booking._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar: Booking ID & Status */}
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                        <FiBriefcase size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-slate-900 text-sm tracking-tight">{bookingIdDisplay}</span>
                          {booking.addOnOf && (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-md" title={booking.addOnOf.title}>
                              Extra worker for #{booking.addOnOf.bookingNumber}
                            </span>
                          )}
                          <button
                            onClick={() => handleCopy(booking.bookingNumber || booking._id, booking._id)}
                            className="text-slate-400 hover:text-blue-600 transition-colors p-0.5"
                            title="Copy ID"
                          >
                            {copiedId === booking._id ? <FiCheck className="text-emerald-500" size={14} /> : <FiCopy size={14} />}
                          </button>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {booking.createdAt ? new Date(booking.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                        </span>
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusInfo.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`}></span>
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* Parties Grid (Farmer & Worker) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 border-b border-slate-100">
                    {/* Farmer Block */}
                    <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <FiUser className="text-blue-500" /> Farmer / Customer
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shrink-0">
                          {booking.userId?.name?.charAt(0) ?.toUpperCase() || 'F'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{booking.userId?.name || 'Customer'}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <FiPhone size={11} className="text-slate-400" />
                            {booking.userId?.phone || 'No phone'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Worker / Team Leader Block */}
                    <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <FiAward className={isTeamLeader ? 'text-amber-500' : 'text-blue-500'} /> Assigned Worker
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                            isTeamLeader ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {isTeamLeader ? 'Leader' : 'Worker'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {booking.workerId?.profilePhoto || booking.workerId?.profileImage ? (
                          <img
                            src={booking.workerId?.profilePhoto || booking.workerId?.profileImage}
                            alt={booking.workerId?.name}
                            className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                              isTeamLeader ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {booking.workerId?.name?.charAt(0) ?.toUpperCase() || 'W'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{booking.workerId?.name || 'Unassigned'}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <FiPhone size={11} className="text-slate-400" />
                            {booking.workerId?.phone || 'No phone'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Service & Schedule Details */}
                  <div className="py-3 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        <FiLayers className="text-blue-600" />
                        {booking.serviceId?.title || booking.serviceName || 'Farm Labor Service'}
                      </span>
                      {booking.cropType && (
                        <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-lg border border-emerald-100">
                          🌾 {booking.cropType} {booking.landSize ? `(${booking.landSize})` : ''}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <FiCalendar className="text-slate-400 shrink-0" />
                        <span>
                          {booking.scheduledDate ? new Date(booking.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Flexible'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FiClock className="text-slate-400 shrink-0" />
                        <span>{booking.scheduledTime || booking.timeSlot?.time || 'Day Shift'}</span>
                      </div>
                    </div>

                    {booking.address?.city && (
                      <div className="flex items-center gap-1.5 text-slate-500 truncate">
                        <FiMapPin className="text-slate-400 shrink-0" />
                        <span className="truncate">
                          {[booking.address.addressLine1, booking.address.city, booking.address.state].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: Price & View Details Action */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 mt-1">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Amount</span>
                    <span className="text-base font-black text-slate-900">
                      ₹{(booking.finalAmount || booking.basePrice || 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedBooking(booking)}
                      className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <FiEye size={14} />
                      View Details
                    </button>
                    <button
                      onClick={() => navigate(`/admin/bookings/${booking._id}`)}
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                      title="Open full booking page"
                    >
                      <FiExternalLink size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && pagination.pages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-4">
          <button
            onClick={() => fetchBookings(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {[...Array(pagination.pages)].map((_, i) => (
            <button
              key={i}
              onClick={() => fetchBookings(i + 1)}
              className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
                pagination.page === i + 1
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => fetchBookings(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* View Details Modal */}
      <AnimatePresence>
        {selectedBooking && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black tracking-tight">Worker Booking Details</h3>
                    <span className="text-xs bg-white/20 text-white px-2.5 py-0.5 rounded-full font-mono font-bold">
                      {selectedBooking.bookingNumber || `#${selectedBooking._id.slice(-6).toUpperCase()}`}
                    </span>
                    {selectedBooking.addOnOf && (
                      <span className="text-[11px] bg-amber-400/30 text-amber-100 px-2.5 py-0.5 rounded-full font-bold">
                        Extra worker for #{selectedBooking.addOnOf.bookingNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Booked on {selectedBooking.createdAt ? new Date(selectedBooking.createdAt).toLocaleString('en-IN') : 'N/A'}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedBooking(null)}
                  className="p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors"
                >
                  <FiX size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700">
                {/* Status & Service Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Service Booked</p>
                    <h4 className="text-base font-black text-slate-900">
                      {selectedBooking.serviceId?.title || selectedBooking.serviceName || 'Farm Labor'}
                    </h4>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                      getStatusBadge(selectedBooking.status).bg
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${getStatusBadge(selectedBooking.status).dot}`}></span>
                    {getStatusBadge(selectedBooking.status).label}
                  </span>
                </div>

                {/* Farmer & Worker Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Farmer Card */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <FiUser className="text-blue-600" /> Farmer Details
                      </span>
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-900">{selectedBooking.userId?.name || 'Customer'}</h5>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <FiPhone size={12} className="text-slate-400" /> {selectedBooking.userId?.phone || 'N/A'}
                      </p>
                      {selectedBooking.userId?.email && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{selectedBooking.userId?.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Worker Card */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <FiAward className="text-amber-500" /> Worker Details
                      </span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {selectedBooking.workerId?.workerType === 'TEAM_LEADER' ? 'Team Leader' : 'Worker'}
                      </span>
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-900">{selectedBooking.workerId?.name || 'Unassigned'}</h5>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <FiPhone size={12} className="text-slate-400" /> {selectedBooking.workerId?.phone || 'N/A'}
                      </p>
                      {selectedBooking.workerId?.email && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{selectedBooking.workerId.email}</p>
                      )}
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                        {selectedBooking.workerId?.rating > 0 && (
                          <div><dt className="text-slate-400 font-medium">Rating</dt><dd className="font-bold text-slate-800">{Number(selectedBooking.workerId.rating).toFixed(1)} / 5</dd></div>
                        )}
                        {(selectedBooking.workerId?.completedJobs != null || selectedBooking.workerId?.totalJobs != null) && (
                          <div><dt className="text-slate-400 font-medium">Jobs</dt><dd className="font-bold text-slate-800">{selectedBooking.workerId.completedJobs ?? 0} done · {selectedBooking.workerId.totalJobs ?? 0} total</dd></div>
                        )}
                        {selectedBooking.workerId?.experienceYears > 0 && (
                          <div><dt className="text-slate-400 font-medium">Experience</dt><dd className="font-bold text-slate-800">{selectedBooking.workerId.experienceYears} yr</dd></div>
                        )}
                        {selectedBooking.workerId?.gender && (
                          <div><dt className="text-slate-400 font-medium">Gender</dt><dd className="font-bold text-slate-800 capitalize">{String(selectedBooking.workerId.gender).toLowerCase()}</dd></div>
                        )}
                        {(selectedBooking.workerId?.hourlyRate > 0 || selectedBooking.workerId?.dailyRate > 0) && (
                          <div><dt className="text-slate-400 font-medium">Own rates</dt><dd className="font-bold text-slate-800">{[selectedBooking.workerId.hourlyRate > 0 && `₹${selectedBooking.workerId.hourlyRate}/hr`, selectedBooking.workerId.dailyRate > 0 && `₹${selectedBooking.workerId.dailyRate}/day`].filter(Boolean).join(' · ')}</dd></div>
                        )}
                        {selectedBooking.workerId?.approvalStatus && (
                          <div><dt className="text-slate-400 font-medium">Approval</dt><dd className="font-bold text-slate-800 capitalize">{selectedBooking.workerId.approvalStatus}</dd></div>
                        )}
                      </dl>
                      {selectedBooking.workerId?.isOfflineMember && (
                        <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1 inline-block">Offline member (no app)</p>
                      )}
                      {(selectedBooking.workerId?.address?.fullAddress || selectedBooking.workerId?.address?.city) && (
                        <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1">
                          <FiMapPin className="text-slate-400 mt-0.5 shrink-0" size={12} />
                          {selectedBooking.workerId.address.fullAddress || [selectedBooking.workerId.address.addressLine1, selectedBooking.workerId.address.city, selectedBooking.workerId.address.state, selectedBooking.workerId.address.pincode].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {selectedBooking.workerId?.serviceCategories?.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1.5">Categories: {selectedBooking.workerId.serviceCategories.map(c => c?.title || c?.name || c).join(', ')}</p>
                      )}
                      {selectedBooking.workerId?.skills?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {selectedBooking.workerId.skills.map((sk, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                              {sk}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Farm & Schedule Details */}
                <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white">
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">Schedule & Farm Details</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block font-medium">Scheduled Date</span>
                      <span className="font-bold text-slate-800">
                        {selectedBooking.scheduledDate
                          ? new Date(selectedBooking.scheduledDate).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })
                          : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Time Slot</span>
                      <span className="font-bold text-slate-800">
                        {selectedBooking.timeSlot?.start && selectedBooking.timeSlot?.end
                          ? `${to12HourText(selectedBooking.timeSlot.start)} - ${to12HourText(selectedBooking.timeSlot.end)}`
                          : (to12HourText(selectedBooking.scheduledTime) || 'Day Shift')}
                      </span>
                    </div>
                    {/* Worker bookings are priced by the hour or the day: no land size or crop (those belong to machinery jobs) */}
                    <div>
                      <span className="text-slate-400 block font-medium">Booking Type</span>
                      <span className="font-bold text-slate-800">{String(selectedBooking.rateUnit || selectedBooking.rental_type || '').toLowerCase().startsWith('hour') ? 'Hourly' : 'Daily'}</span>
                    </div>
                    {selectedBooking.agreedRate > 0 && (
                      <div>
                        <span className="text-slate-400 block font-medium">Agreed Rate</span>
                        <span className="font-bold text-slate-800">₹{Number(selectedBooking.agreedRate).toLocaleString('en-IN')} / {String(selectedBooking.rateUnit || '').toLowerCase().startsWith('hour') ? 'hr' : 'day'}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400 block font-medium">Payment Method</span>
                      <span className="font-bold text-slate-800 uppercase">{selectedBooking.paymentMethod || 'Online'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Payment Status</span>
                      <span className="font-bold text-emerald-600 uppercase">{selectedBooking.paymentStatus || 'Pending'}</span>
                    </div>
                  </div>

                  {/* Location */}
                  {selectedBooking.address && (
                    <div className="pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-400 block font-medium">Farm Location</span>
                      <p className="font-medium text-slate-700 mt-0.5 flex items-start gap-1">
                        <FiMapPin className="text-red-500 mt-0.5 shrink-0" />
                        {[
                          selectedBooking.address.addressLine1,
                          selectedBooking.address.addressLine2,
                          selectedBooking.address.landmark,
                          selectedBooking.address.city,
                          selectedBooking.address.state,
                          selectedBooking.address.pincode
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Rating / Review if present */}
                {selectedBooking.rating && (
                  <div className="border border-amber-200 bg-amber-50/60 rounded-2xl p-4 space-y-1">
                    <div className="flex items-center gap-1 text-amber-500 font-bold text-sm">
                      <FiStar className="fill-amber-400" />
                      <span>{selectedBooking.rating} / 5 Stars</span>
                    </div>
                    {selectedBooking.review && (
                      <p className="text-xs text-slate-700 italic">"{selectedBooking.review}"</p>
                    )}
                  </div>
                )}

                {/* Work Photos if completed */}
                {selectedBooking.workPhotos && selectedBooking.workPhotos.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <FiImage /> Work Completion Photos
                    </h5>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedBooking.workPhotos.map((photoUrl, idx) => (
                        <a key={idx} href={photoUrl} target="_blank" rel="noreferrer" className="rounded-xl overflow-hidden border border-slate-200 aspect-video hover:opacity-90">
                          <img src={photoUrl} alt={`Work proof ${idx + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const id = selectedBooking._id;
                    setSelectedBooking(null);
                    navigate(`/admin/bookings/${id}`);
                  }}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-colors flex items-center gap-1.5"
                >
                  Open Full Admin Page <FiExternalLink />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkerBookings;
