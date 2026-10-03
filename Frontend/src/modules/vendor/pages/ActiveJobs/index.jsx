import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiBriefcase,
  FiMapPin,
  FiClock,
  FiUser,
  FiSearch,
  FiCalendar,
  FiChevronRight,
  FiX
} from 'react-icons/fi';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import { getBookings } from '../../services/bookingService';
import { ConfirmDialog } from '../../components/common';

const ActiveJobs = memo(() => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('in_progress');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

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

  // Format and deduplicate long addresses for clean display
  const formatAddress = useCallback((addr) => {
    if (!addr) return 'Location not specified';
    const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
    const seen = new Set();
    const deduped = [];
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        deduped.push(part);
      }
    }
    return deduped.slice(0, 3).join(', ') || addr;
  }, []);

  // Get status configuration with refined styling tokens
  const getStatusConfig = useCallback((status) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'IN_PROGRESS':
      case 'ON_THE_WAY':
      case 'JOURNEY_STARTED':
      case 'STARTED':
      case 'VISITED':
        return {
          label: 'In Progress',
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-200/70',
          dot: 'bg-blue-500',
          accent: '#3b82f6',
        };
      case 'ASSIGNED':
      case 'WORKER_ACCEPTED':
        return {
          label: 'Driver Assigned',
          bg: 'bg-indigo-50',
          text: 'text-indigo-700',
          border: 'border-indigo-200/70',
          dot: 'bg-indigo-500',
          accent: '#6366f1',
        };
      case 'COMPLETED':
      case 'PAID':
      case 'CLOSED':
      case 'WORK_DONE':
        return {
          label: 'Completed',
          bg: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-200/70',
          dot: 'bg-emerald-500',
          accent: '#10b981',
        };
      case 'ACCEPTED':
      case 'CONFIRMED':
        return {
          label: 'Confirmed',
          bg: 'bg-amber-50',
          text: 'text-amber-700',
          border: 'border-amber-200/70',
          dot: 'bg-amber-500',
          accent: '#f59e0b',
        };
      case 'AWAITING_PAYMENT':
      case 'SETTLEMENT_PENDING':
      case 'WORKER_PAID':
        return {
          label: 'Settlement Pending',
          bg: 'bg-orange-50',
          text: 'text-orange-700',
          border: 'border-orange-200/70',
          dot: 'bg-orange-500',
          accent: '#f97316',
        };
      default:
        return {
          label: (s.replace(/_/g, ' ') || 'Pending').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
          bg: 'bg-slate-50',
          text: 'text-slate-600',
          border: 'border-slate-200',
          dot: 'bg-slate-400',
          accent: '#94a3b8',
        };
    }
  }, []);

  // Duration label helper
  const getDurationLabel = useCallback((job) => {
    if (job.rental_type === 'daily') {
      return job.estimatedDuration ? `${job.estimatedDuration} Day${Number(job.estimatedDuration) > 1 ? 's' : ''}` : 'Daily';
    }
    if (job.rental_type === 'monthly') {
      return '1 Month';
    }
    if (job.rental_type === 'land_based') {
      return job.landSize ? `${job.landSize} Acres` : 'Land Based';
    }
    if (job.rental_type === 'hourly' || job.estimatedDuration) {
      return `${job.estimatedDuration || 1} Hr${Number(job.estimatedDuration || 1) > 1 ? 's' : ''}`;
    }
    return null;
  }, []);

  // Load and map jobs
  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getBookings();
      const jobsData = response.data || [];
      const mappedJobs = jobsData.map((job) => {
        const rawEarnings =
          job.vendorEarnings ||
          (job.finalAmount ? job.finalAmount * 0.9 : 0) ||
          (job.totalAmount ? job.totalAmount * 0.9 : 0) ||
          job.price ||
          0;

        return {
          id: job._id || job.id,
          serviceType: job.serviceId?.title || job.serviceType || 'Equipment Rental',
          user: {
            name: job.userId?.name || job.customerName || 'Farmer',
          },
          location: {
            address: job.address?.addressLine1 || job.location?.address || 'Address not available',
          },
          price: Number(rawEarnings).toFixed(2),
          status: job.status,
          paymentStatus: job.paymentStatus,
          assignedTo: job.workerId ? { name: job.workerId.name } : job.assignedAt ? { name: 'You (Self)' } : null,
          timeSlot: {
            date: job.scheduledDate
              ? new Date(job.scheduledDate).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Date',
            time: job.scheduledTime || 'Slot',
          },
          rental_type: job.rental_type,
          estimatedDuration: job.estimatedDuration,
          landSize: job.landSize,
          cropType: job.cropType,
          endDate: job.endDate,
          scheduledDate: job.scheduledDate,
        };
      });
      setJobs(mappedJobs);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    window.addEventListener('vendorJobsUpdated', loadJobs);
    return () => {
      window.removeEventListener('vendorJobsUpdated', loadJobs);
    };
  }, [loadJobs]);

  // Filter tabs definition
  const filterTabs = useMemo(
    () => [
      { id: 'in_progress', label: 'On Field' },
      { id: 'assigned', label: 'Driver Assigned' },
      { id: 'completed', label: 'Completed' },
      { id: 'all', label: 'All' },
    ],
    []
  );

  // Memoize filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const status = (job.status || '').toUpperCase();

      let matchesFilter = false;
      if (filter === 'all') {
        matchesFilter = true;
      } else if (filter === 'assigned') {
        matchesFilter =
          ['ASSIGNED', 'WORKER_ACCEPTED'].includes(status) ||
          (!!job.assignedTo && ['ACCEPTED', 'CONFIRMED'].includes(status));
      } else if (filter === 'in_progress') {
        matchesFilter = [
          'ACCEPTED',
          'CONFIRMED',
          'AWAITING_PAYMENT',
          'PENDING',
          'ASSIGNED',
          'WORKER_ACCEPTED',
          'STARTED',
          'JOURNEY_STARTED',
          'REACHED',
          'VISITED',
          'WORK_DONE',
          'IN_PROGRESS',
          'ON_THE_WAY',
        ].includes(status);
      } else if (filter === 'completed') {
        matchesFilter = ['COMPLETED', 'WORKER_PAID', 'SETTLEMENT_PENDING', 'PAID', 'CLOSED'].includes(status);
      }

      const matchesSearch =
        searchQuery === '' ||
        job.serviceType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.user?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.location?.address.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }, [jobs, filter, searchQuery]);

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Bookings" showSearch={false} />

      <main className="px-3.5 py-3">
        {/* Search Bar - Sleek & Compact */}
        <div className="mb-2.5">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search bookings by service, farmer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs md:text-sm bg-white rounded-xl border border-slate-200/90 text-slate-800 placeholder-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                aria-label="Clear search"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
          {filterTabs.map((tab) => {
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/20'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Jobs List */}
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] animate-pulse"
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="h-4 w-32 bg-slate-100 rounded"></div>
                  <div className="h-4 w-16 bg-slate-100 rounded"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-40 bg-slate-100 rounded"></div>
                  <div className="h-3 w-56 bg-slate-100 rounded"></div>
                  <div className="h-3 w-28 bg-slate-100 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-2.5">
              <FiBriefcase className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-slate-700 font-semibold text-sm mb-1">No bookings found</p>
            <p className="text-xs text-slate-400">
              {searchQuery ? 'Try adjusting your search query' : 'No field operations found under this filter'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredJobs.map((job) => {
              const statusConfig = getStatusConfig(job.status);
              const durationLabel = getDurationLabel(job);
              const isPaid = ['SUCCESS', 'PAID', 'paid', 'success'].includes(job.paymentStatus);
              const isCompleted = job.status?.toUpperCase() === 'COMPLETED';

              return (
                <div
                  key={job.id}
                  onClick={() => navigate(`/vendor/booking/${job.id}`)}
                  className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-slate-300 transition-all duration-150 p-3.5 relative overflow-hidden cursor-pointer active:scale-[0.99]"
                >
                  {/* Subtle left status accent */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ backgroundColor: statusConfig.accent }}
                  />

                  {/* Header Row: Service title + Status Pill & Price */}
                  <div className="flex items-start justify-between gap-2 mb-2 pl-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 text-sm leading-snug truncate">
                          {job.serviceType}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                          {statusConfig.label}
                        </span>
                      </div>
                    </div>

                    {/* Price / Estimated Payout */}
                    <div className="flex items-center gap-1 flex-shrink-0 text-right">
                      <div>
                        <div className="text-sm font-bold text-slate-900 leading-none">
                          ₹{Number(job.price || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {isCompleted ? 'Earned' : 'Est. Payout'}
                        </div>
                      </div>
                      <FiChevronRight className="w-4 h-4 text-slate-300 ml-0.5" />
                    </div>
                  </div>

                  {/* Core Information Section - Clean, Compact Hierarchy */}
                  <div className="space-y-1.5 text-xs text-slate-600 pl-1.5">
                    {/* Farmer & Driver Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <FiUser className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="font-medium text-slate-800 truncate">
                          {job.user?.name || 'Farmer'}
                        </span>
                      </div>

                      {job.assignedTo && (
                        <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md font-medium flex-shrink-0">
                          Driver: {job.assignedTo === 'SELF' ? 'Self' : job.assignedTo.name}
                        </span>
                      )}
                    </div>

                    {/* Location Row */}
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <FiMapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{formatAddress(job.location?.address)}</span>
                    </div>

                    {/* Schedule & Duration Chip Row */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <div className="flex items-center gap-1.5 text-slate-600 truncate">
                        <FiCalendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">
                          {job.timeSlot?.date} • {job.timeSlot?.time}
                        </span>
                      </div>

                      {durationLabel && (
                        <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md flex-shrink-0">
                          {durationLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Footer Row: Payment Status & Action Hint */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] pl-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          isPaid ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        />
                        {isPaid ? 'Payment Received' : 'Payment Pending'}
                      </span>
                    </div>

                    <span className="text-slate-400 text-[10px] flex items-center gap-0.5">
                      View details
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />

      <BottomNav />
    </div>
  );
});

export default ActiveJobs;
