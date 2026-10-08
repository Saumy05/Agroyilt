import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiBriefcase, 
  FiClock, 
  FiCheckCircle, 
  FiXCircle, 
  FiMapPin, 
  FiChevronRight, 
  FiUser, 
  FiSearch,
  FiX,
  FiCalendar
} from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import workerService from '../../../../services/workerService';
import { SkeletonList } from '../../../../components/common/SkeletonLoaders';

const AssignedJobs = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, confirmed, in_progress, completed
  const [searchQuery, setSearchQuery] = useState('');

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = '#F8FAFC'; // Clean soft background

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await workerService.getAssignedJobs();
      if (response.success) {
        setJobs([...response.data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      }
      setLoading(false);
    } catch (err) {
      console.error('Fetch jobs error:', err);
      setError('Failed to load assigned jobs');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();

    const handleUpdate = () => {
      fetchJobs();
    };
    window.addEventListener('workerJobsUpdated', handleUpdate);

    return () => {
      window.removeEventListener('workerJobsUpdated', handleUpdate);
    };
  }, []);

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'completed':
      case 'work_done':
        return {
          label: 'Completed',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
          dot: 'bg-emerald-500',
          accent: '#10B981'
        };
      case 'in_progress':
      case 'on_the_way':
      case 'journey_started':
      case 'visited':
        return {
          label: s === 'visited' ? 'Reached' : 'In Progress',
          bg: 'bg-amber-50 text-amber-700 border-amber-200/80',
          dot: 'bg-amber-500 animate-ping',
          accent: '#F59E0B'
        };
      case 'confirmed':
      case 'assigned':
        return {
          label: 'Assigned',
          bg: 'bg-blue-50 text-blue-700 border-blue-200/80',
          dot: 'bg-blue-500',
          accent: '#3B82F6'
        };
      case 'pending':
      case 'searching':
      case 'requested':
        return {
          label: 'Pending',
          bg: 'bg-purple-50 text-purple-700 border-purple-200/80',
          dot: 'bg-purple-500',
          accent: '#8B5CF6'
        };
      case 'cancelled':
      case 'rejected':
        return {
          label: 'Cancelled',
          bg: 'bg-rose-50 text-rose-700 border-rose-200/80',
          dot: 'bg-rose-500',
          accent: '#EF4444'
        };
      default:
        return {
          label: status || 'Unknown',
          bg: 'bg-slate-50 text-slate-700 border-slate-200/80',
          dot: 'bg-slate-400',
          accent: '#64748B'
        };
    }
  };

  // Counts for filter pills
  const counts = useMemo(() => {
    const total = jobs.length;
    let pending = 0;
    let active = 0;
    let completed = 0;

    jobs.forEach(job => {
      const s = (job.status || '').toLowerCase();
      if (['confirmed', 'assigned', 'pending', 'searching', 'requested'].includes(s)) pending++;
      else if (['in_progress', 'on_the_way', 'journey_started', 'visited'].includes(s)) active++;
      else if (['completed', 'work_done'].includes(s)) completed++;
    });

    return { total, pending, active, completed };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const status = (job.status || '').toLowerCase();

      let matchesFilter = false;
      if (filter === 'all') {
        matchesFilter = true;
      } else if (filter === 'confirmed') {
        matchesFilter = ['confirmed', 'assigned', 'pending', 'searching', 'requested'].includes(status);
      } else if (filter === 'in_progress') {
        matchesFilter = ['in_progress', 'on_the_way', 'journey_started', 'visited'].includes(status);
      } else if (filter === 'completed') {
        matchesFilter = ['completed', 'work_done'].includes(status);
      }

      const matchesSearch = searchQuery === '' ||
        job.serviceName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.serviceId?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.userId?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.farmerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.bookingNumber?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }, [jobs, filter, searchQuery]);

  return (
    <div className="min-h-screen pb-32 bg-slate-50/60">
      <Header title="My Jobs" showSearch={false} onBack={() => navigate('/worker/dashboard')} />

      <main className="px-4 py-4 max-w-lg mx-auto">
        {/* Search Bar */}
        <div className="mb-3.5">
          <div className="relative flex items-center">
            <FiSearch className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by work, farmer or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-white rounded-xl border border-slate-200/80 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { id: 'all', label: 'All', count: counts.total },
            { id: 'confirmed', label: 'Pending', count: counts.pending },
            { id: 'in_progress', label: 'Active', count: counts.active },
            { id: 'completed', label: 'Completed', count: counts.completed },
          ].map((item) => {
            const isActive = filter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-semibold text-xs whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/25'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <span>{item.label}</span>
                {item.count > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Jobs List */}
        {loading ? (
          <div className="py-2">
            <SkeletonList count={4} cardHeight="150px" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-xs mt-2">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center">
              <FiBriefcase className="w-7 h-7" />
            </div>
            <h3 className="text-slate-800 font-bold text-base mb-1">No jobs found</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4">
              {searchQuery ? `No jobs matching "${searchQuery}"` : 'No assigned farm work under this tab right now.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => {
              const badge = getStatusBadge(job.status);
              const statusLower = (job.status || '').toLowerCase();
              const isCompleted = ['completed', 'work_done'].includes(statusLower);
              const isActive = ['in_progress', 'journey_started', 'visited'].includes(statusLower);

              // Financial payout calculation
              const earningAmount = job.workerNetEarning || job.paymentSummary?.netEarning || (
                job.workerFinancials?.netEarnings ?? (
                  job.finalAmount 
                    ? (job.providerType === 'WORKER' || job.bookingNumber?.startsWith('WRK-') ? Math.round(job.finalAmount * 0.9) : job.finalAmount) 
                    : 0
                )
              );

              // Date formatting
              const dateStr = job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString('en-IN', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              }) : (job.createdAt ? new Date(job.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A');

              // Time formatting
              let startTimeStr = job.scheduledTime || '';
              let startDate = null;
              if (job.startedAt) startDate = new Date(job.startedAt);
              else if (job.inProgressAt) startDate = new Date(job.inProgressAt);
              else if (job.createdAt) startDate = new Date(job.createdAt);

              if (!startTimeStr && startDate) {
                startTimeStr = startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
              }

              let endDate = null;
              let endTimeStr = '';
              if (isCompleted) {
                if (job.completedAt) endDate = new Date(job.completedAt);
                else if (job.workDoneAt) endDate = new Date(job.workDoneAt);
                else if (job.updatedAt) endDate = new Date(job.updatedAt);

                if (endDate) {
                  endTimeStr = endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                }
              }

              let durationStr = null;
              if (isCompleted && endDate && startDate && endDate >= startDate) {
                const diffMs = endDate.getTime() - startDate.getTime();
                const totalSecs = Math.floor(diffMs / 1000);
                const hours = Math.floor(totalSecs / 3600);
                const mins = Math.floor((totalSecs % 3600) / 60);
                const secs = totalSecs % 60;
                if (hours > 0) durationStr = `${hours}h ${mins}m`;
                else if (mins > 0) durationStr = `${mins}m ${secs}s`;
                else durationStr = `${secs}s`;
              }

              return (
                <div
                  key={job._id}
                  onClick={() => {
                    if (job.__type === 'IndWorkerAssignment') {
                      navigate(`/worker/job/${job._id}`, { state: { fromJobs: true, isAssignment: true, assignmentData: job } });
                    } else {
                      navigate(`/worker/job/${job._id}`, { state: { fromJobs: true } });
                    }
                  }}
                  className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99] group relative overflow-hidden"
                >
                  {/* Left status color accent line */}
                  <div 
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" 
                    style={{ backgroundColor: badge.accent }} 
                  />

                  {/* Header Row: Title + Status + Price */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                          <FiBriefcase className="w-4 h-4" />
                        </div>
                        <h3 className="font-bold text-slate-800 text-[15px] truncate">
                          {job.serviceName || job.serviceId?.title || 'Farm Work'}
                        </h3>
                      </div>
                      
                      {/* Status Badge Pill */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                        {job.bookingNumber && (
                          <span className="text-[11px] font-medium text-slate-400">
                            #{job.bookingNumber}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Net Payout Price */}
                    <div className="text-right shrink-0">
                      <div className="text-lg font-black text-slate-900 tracking-tight">
                        ₹{earningAmount}
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">
                        Net Payout
                      </span>
                    </div>
                  </div>

                  {/* Details Section */}
                  <div className="space-y-2 pt-2.5 border-t border-slate-100/80 text-xs text-slate-600">
                    {/* Farmer/Customer */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                          <FiUser className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold text-slate-700 truncate">
                          {job.userId?.name || job.farmerName || 'Customer'}
                        </span>
                      </div>
                      <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>

                    {/* Address / Location */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                        <FiMapPin className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-slate-500 truncate">
                        {job.address?.addressLine1 || job.address?.city || 'Address not available'}
                      </span>
                    </div>

                    {/* Date & Time Schedule */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                        <FiClock className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-slate-600">{dateStr}</span>
                        {startTimeStr && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-slate-800">
                              {startTimeStr} {endTimeStr ? `→ ${endTimeStr}` : ''}
                            </span>
                          </>
                        )}
                        {durationStr && (
                          <span className="ml-1 px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                            {durationStr}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default AssignedJobs;
