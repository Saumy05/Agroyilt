import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBriefcase, FiClock, FiCheckCircle, FiXCircle, FiMapPin, FiChevronRight, FiUser, FiSearch } from 'react-icons/fi';
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

  const getStatusColor = (status) => {
    const colors = {
      'pending': '#F59E0B',
      'searching': '#F59E0B',
      'requested': '#6366F1',
      'confirmed': '#3B82F6',
      'assigned': '#3B82F6',
      'visited': '#8B5CF6',
      'in_progress': '#F59E0B',
      'on_the_way': '#F59E0B',
      'journey_started': '#F59E0B',
      'work_done': '#10B981',
      'awaiting_payment': '#EF6820',
      'completed': '#10B981',
      'cancelled': '#EF4444',
      'rejected': '#EF4444',
    };
    return colors[status] || '#6B7280';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'pending': 'Pending',
      'confirmed': 'Assigned',
      'in_progress': 'In Progress',
      'on_the_way': 'On The Way',
      'journey_started': 'On The Way',
      'visited': 'Reached',
      'work_done': 'Work Done',
      'awaiting_payment': 'Awaiting Payment',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'rejected': 'Rejected',
    };
    return labels[status] || status;
  };

  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const filteredJobs = jobs.filter(job => {
    const status = (job.status || '').toLowerCase();

    let matchesFilter = false;
    if (filter === 'all') {
      matchesFilter = true;
    } else if (filter === 'confirmed') {
      matchesFilter = ['confirmed', 'assigned', 'pending'].includes(status);
    } else if (filter === 'in_progress') {
      matchesFilter = ['in_progress', 'started', 'reached', 'visited', 'work_done', 'on_the_way', 'journey_started', 'awaiting_payment'].includes(status);
    } else if (filter === 'completed') {
      matchesFilter = ['completed', 'worker_paid', 'paid'].includes(status);
    }

    const matchesSearch = searchQuery === '' ||
      job.serviceName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.userId?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="My Jobs" showSearch={true} onBack={() => navigate('/worker/dashboard')} />

      <main className="px-4 py-6">
        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-0"
              style={{ focusRingColor: themeColors.button }}
            />
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { id: 'all', label: 'All' },
            { id: 'confirmed', label: 'Pending' },
            { id: 'in_progress', label: 'Active' },
            { id: 'completed', label: 'Completed' },
          ].map((filterOption) => (
            <button
              key={filterOption.id}
              onClick={() => setFilter(filterOption.id)}
              className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all ${filter === filterOption.id
                ? 'text-white'
                : 'bg-white text-gray-700'
                }`}
              style={
                filter === filterOption.id
                  ? {
                    background: themeColors.button,
                    boxShadow: `0 2px 8px ${themeColors.button}40`,
                  }
                  : {
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }
              }
            >
              {filterOption.label}
            </button>
          ))}
        </div>

        {/* Jobs List */}
        {loading ? (
          <div className="py-2">
            <SkeletonList count={5} cardHeight="140px" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div
            className="bg-white rounded-xl p-8 text-center shadow-md"
            style={{
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }}
          >
            <FiBriefcase className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-600 font-semibold mb-2">No jobs found</p>
            <p className="text-sm text-gray-500">
              {searchQuery ? 'Try a different search term' : 'No jobs assigned at the moment'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => {
              const statusColor = getStatusColor(job.status);

              return (
                <div
                  key={job._id}
                  onClick={() => {
                    if (job.__type === 'IndWorkerAssignment') {
                      // Group/confirmed booking — navigate to DAILY tracking or assignment detail
                      navigate(`/worker/job/${job._id}`, { state: { fromJobs: true, isAssignment: true, assignmentData: job } });
                    } else {
                      navigate(`/worker/job/${job._id}`, { state: { fromJobs: true } });
                    }
                  }}
                  className="rounded-xl p-4 shadow-lg cursor-pointer active:scale-98 transition-all duration-200 relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%)',
                    boxShadow: `0 8px 24px ${hexToRgba(statusColor, 0.15)}, 0 4px 12px ${hexToRgba(statusColor, 0.1)}, 0 0 0 2px ${hexToRgba(statusColor, 0.2)}`,
                    border: `2px solid ${hexToRgba(statusColor, 0.3)}`,
                  }}
                >
                  {/* Left border accent */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                    style={{
                      background: `linear-gradient(180deg, ${statusColor} 0%, ${statusColor}dd 100%)`,
                    }}
                  />

                  <div className="relative z-10 pl-2">
                    {/* Header Section */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="p-1.5 rounded-lg"
                            style={{
                              background: `${statusColor}15`,
                            }}
                          >
                            <FiBriefcase className="w-4 h-4" style={{ color: statusColor }} />
                          </div>
                          <h3 className="font-bold text-gray-800 text-base">{job.serviceName || job.serviceId?.title || 'Farm Work'}</h3>
                        </div>
                        <div className="ml-8 mb-2">
                          <span
                            className="text-xs font-bold px-3 py-1.5 rounded-full"
                            style={{
                              background: `linear-gradient(135deg, ${statusColor} 0%, ${statusColor}dd 100%)`,
                              color: '#FFFFFF',
                              boxShadow: `0 2px 8px ${hexToRgba(statusColor, 0.3)}`,
                            }}
                          >
                            {getStatusLabel(job.status)}
                          </span>
                        </div>
                      </div>
                      <div
                        className="px-3 py-2 rounded-lg font-bold text-lg"
                        style={{
                          background: `linear-gradient(135deg, ${themeColors.button}15 0%, ${themeColors.button}10 100%)`,
                          color: themeColors.button,
                          border: `1px solid ${hexToRgba(themeColors.button, 0.2)}`,
                        }}
                      >
                        ₹{job.workerNetEarning || job.paymentSummary?.netEarning || (job.workerFinancials?.netEarnings ?? (job.finalAmount ? (job.providerType === 'WORKER' || job.bookingNumber?.startsWith('WRK-') ? Math.round(job.finalAmount * 0.9) : job.finalAmount) : 0))}
                      </div>
                    </div>

                    {/* Info Section */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="p-1 rounded" style={{ background: 'rgba(0, 0, 0, 0.03)' }}>
                          <FiUser className="w-4 h-4" style={{ color: statusColor }} />
                        </div>
                        <span className="text-gray-700 font-medium">{job.userId?.name || job.farmerName || 'Customer'}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <div className="p-1 rounded" style={{ background: 'rgba(0, 0, 0, 0.03)' }}>
                          <FiMapPin className="w-4 h-4" style={{ color: statusColor }} />
                        </div>
                        <span className="text-gray-700 font-medium truncate">{job.address?.addressLine1 || 'Address not available'}</span>
                      </div>

                      {(() => {
                        const statusLower = (job.status || '').toLowerCase();
                        const isCompleted = ['completed', 'work_done'].includes(statusLower);
                        const isActive = ['in_progress', 'journey_started', 'visited'].includes(statusLower);

                        const dateStr = job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString('en-IN', {
                          month: 'numeric',
                          day: 'numeric',
                          year: 'numeric'
                        }) : (job.createdAt ? new Date(job.createdAt).toLocaleDateString('en-IN') : 'N/A');

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
                          if (hours > 0) durationStr = `${hours}h ${mins}m ${secs}s`;
                          else if (mins > 0) durationStr = `${mins}m ${secs}s`;
                          else durationStr = `${secs}s`;
                        }

                        if (isCompleted) {
                          return (
                            <div className="flex items-start gap-2 text-xs">
                              <div className="p-1 rounded bg-emerald-50 text-emerald-600 shrink-0 mt-0.5">
                                <FiClock className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1 text-gray-700 font-medium">
                                  <span>{dateStr}</span>
                                  <span>•</span>
                                  <span className="font-bold text-emerald-800">
                                    {startTimeStr} {endTimeStr ? `→ ${endTimeStr}` : ''}
                                  </span>
                                  {durationStr && (
                                    <span className="bg-emerald-100/70 text-emerald-800 text-[10px] font-black px-1.5 py-0.5 rounded-md">
                                      {durationStr}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        if (isActive) {
                          return (
                            <div className="flex items-center gap-2 text-xs">
                              <div className="p-1 rounded bg-amber-50 text-amber-600 shrink-0">
                                <FiClock className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-amber-800 font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                                In Progress • Started at {startTimeStr || 'N/A'}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div className="flex items-center gap-2 text-sm">
                            <div className="p-1 rounded" style={{ background: 'rgba(0, 0, 0, 0.03)' }}>
                              <FiClock className="w-4 h-4" style={{ color: statusColor }} />
                            </div>
                            <span className="text-gray-700 font-medium">
                              {dateStr} • {startTimeStr || 'N/A'}
                            </span>
                          </div>
                        );
                      })()}
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
