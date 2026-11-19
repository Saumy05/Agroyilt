import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FiSearch, FiCalendar, FiClock, FiUser, FiTruck, 
  FiArrowRight, FiCheckCircle, FiXCircle, FiActivity,
  FiX, FiChevronLeft, FiChevronRight, FiShoppingBag
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { useNavigate } from 'react-router-dom';
import { adminUserService } from '../../../../services/adminUserService';
import { formatRentalReturn } from '../../../../utils/rentalReturn';

const STATUS_FILTERS = [
  { id: 'all', label: 'All Status' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' }
];

const getStatusConfig = (status) => {
  const configs = {
    pending: {
      label: 'Pending',
      icon: FiClock,
      className: 'bg-amber-50 text-amber-700 border border-amber-200/80',
    },
    confirmed: {
      label: 'Confirmed',
      icon: FiCheckCircle,
      className: 'bg-blue-50 text-blue-700 border border-blue-200/80',
    },
    ongoing: {
      label: 'Ongoing',
      icon: FiActivity,
      className: 'bg-purple-50 text-purple-700 border border-purple-200/80',
    },
    completed: {
      label: 'Completed',
      icon: FiCheckCircle,
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
    },
    cancelled: {
      label: 'Cancelled',
      icon: FiXCircle,
      className: 'bg-rose-50 text-rose-700 border border-rose-200/80',
    },
    rejected: {
      label: 'Rejected',
      icon: FiXCircle,
      className: 'bg-rose-50 text-rose-700 border border-rose-200/80',
    }
  };
  return configs[status] || {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown',
    icon: FiClock,
    className: 'bg-gray-50 text-gray-700 border border-gray-200/80',
  };
};

const cleanPersonName = (name) => {
  if (!name) return '';
  const trimmed = String(name).trim();
  const words = trimmed.split(/\s+/);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const firstHalf = words.slice(0, half).join(' ');
    const secondHalf = words.slice(half).join(' ');
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
      return firstHalf;
    }
  }
  return trimmed;
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

// In-memory cache for instant back navigation
let farmerBookingsCache = {
  data: {},
};

const FarmerBookings = () => {
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookings, setBookings] = useState(() => {
    return farmerBookingsCache.data['all__1']?.bookings || [];
  });
  const [loading, setLoading] = useState(() => !farmerBookingsCache.data['all__1']);
  const [pagination, setPagination] = useState(() => {
    return farmerBookingsCache.data['all__1']?.pagination || { page: 1, limit: 20, total: 0, pages: 1 };
  });
  const navigate = useNavigate();

  const loadBookings = async (page = 1) => {
    const cacheKey = `${filterStatus}_${searchQuery.trim()}_${page}`;
    const cached = farmerBookingsCache.data[cacheKey];

    if (cached) {
      setBookings(cached.bookings || []);
      setPagination(cached.pagination || pagination);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const params = {
        page,
        limit: pagination.limit,
        status: filterStatus === 'all' ? undefined : filterStatus,
        search: searchQuery.trim() || undefined
      };
      const response = await adminUserService.getAllUserBookings(params);
      if (response.success) {
        const data = response.data || [];
        const pag = response.pagination || { page: 1, limit: 20, total: data.length, pages: 1 };
        setBookings(data);
        setPagination(pag);
        farmerBookingsCache.data[cacheKey] = { bookings: data, pagination: pag };
      }
    } catch (error) {
      console.error('Error loading farmer bookings:', error);
      toastManager.error('Failed to load farmer bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings(1);
  }, [filterStatus, searchQuery]);

  return (
    <div className="space-y-3.5">
      {/* Compact Search & Status Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200/80 p-2.5 sm:p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          {/* Search Box */}
          <div className="relative w-full sm:w-64 md:w-72 shrink-0">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search farmer, phone, booking ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-gray-50/80 border border-gray-200 rounded-lg text-xs text-gray-800 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all font-normal"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
              >
                <FiX className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {STATUS_FILTERS.map((tab) => {
              const isActive = filterStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterStatus(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Total Bookings Count */}
        <span className="text-xs text-gray-500 font-medium whitespace-nowrap self-center ml-auto">
          {pagination.total} {pagination.total === 1 ? 'booking' : 'bookings'}
        </span>
      </div>

      {/* Bookings List */}
      <div>
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200/80 py-16 text-center shadow-2xs">
            <div className="w-7 h-7 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin mx-auto mb-2.5" />
            <p className="text-xs font-semibold text-gray-500">Loading farmer bookings...</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200/80 py-14 px-4 text-center shadow-2xs space-y-2.5">
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto border border-gray-100">
              <FiShoppingBag className="text-gray-300 text-xl" />
            </div>
            <p className="text-gray-800 font-bold text-sm">No bookings found</p>
            <p className="text-gray-400 text-xs max-w-sm mx-auto">
              {searchQuery || filterStatus !== 'all'
                ? 'No farmer bookings matched your search query or status filter.'
                : 'There are currently no farmer bookings recorded in the system.'}
            </p>
            {(searchQuery || filterStatus !== 'all') && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setFilterStatus('all'); }}
                className="mt-1 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold border border-emerald-200 transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {bookings.map((booking) => {
              const statusCfg = getStatusConfig(booking.status);
              const StatusIcon = statusCfg.icon;
              const title = booking.serviceName || booking.serviceId?.title || booking.equipmentId?.name || booking.bookedItems?.[0]?.card?.title || booking.serviceCategory || 'General Equipment';
              const farmerName = booking.userId?.name || 'Unknown Farmer';
              const hasOperator = Boolean(booking.workerId?.name);
              const operatorName = hasOperator ? cleanPersonName(booking.workerId.name) : null;
              const bookingNumber = booking.bookingNumber || booking._id?.slice(-6).toUpperCase();
              const rentalReturnText = formatRentalReturn(booking);

              return (
                <motion.div
                  key={booking._id}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-gray-200/80 p-3 sm:p-3.5 shadow-2xs hover:border-emerald-300 hover:shadow-xs transition-all group"
                >
                  {/* Top Line: Booking ID, Title, Status Badge & Price/Action */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md border border-gray-200/60 shrink-0">
                        #{bookingNumber}
                      </span>
                      <h3 className="font-bold text-gray-900 text-sm group-hover:text-emerald-700 transition-colors truncate">
                        {title}
                      </h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize shrink-0 ${statusCfg.className}`}>
                        <StatusIcon className="w-3 h-3" />
                        <span>{statusCfg.label}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-sm sm:text-base font-extrabold text-gray-900">
                        ₹{Number(booking.finalAmount || 0).toLocaleString('en-IN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/bookings/${booking._id}`)}
                        className="px-2.5 py-1 bg-gray-50 hover:bg-emerald-600 text-gray-700 hover:text-white rounded-lg text-xs font-medium border border-gray-200 hover:border-emerald-600 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>Details</span>
                        <FiArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>

                  {/* Bottom Line: Clean horizontal metadata strip */}
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-gray-600 mt-2 pt-2 border-t border-gray-100/80">
                    {/* Farmer */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <FiUser className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-gray-400 font-medium">Farmer:</span>
                      <span className="font-medium text-gray-800">{farmerName}</span>
                      {booking.userId?.phone && (
                        <span className="text-gray-400 text-[11px]">({booking.userId.phone})</span>
                      )}
                    </div>

                    <span className="text-gray-200 hidden sm:inline">•</span>

                    {/* Operator */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <FiTruck className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                      <span className="text-gray-400 font-medium">Operator:</span>
                      {hasOperator ? (
                        <>
                          <span className="font-medium text-gray-800">{operatorName}</span>
                          {booking.workerId?.phone && (
                            <span className="text-gray-400 text-[11px]">({booking.workerId.phone})</span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400 italic font-normal text-[11px]">Not assigned</span>
                      )}
                    </div>

                    <span className="text-gray-200 hidden sm:inline">•</span>

                    {/* Schedule Date & Slot */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <FiCalendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span className="text-gray-400 font-medium">Date:</span>
                      <span className="font-medium text-gray-800">{formatDate(booking.scheduledDate)}</span>
                      {booking.scheduledTime && (
                        <span className="text-gray-500 text-[11px]">({booking.scheduledTime})</span>
                      )}
                    </div>

                    {/* Rental Return / Duration */}
                    {rentalReturnText && (
                      <>
                        <span className="text-gray-200 hidden md:inline">•</span>
                        <div className="flex items-center gap-1.5 text-purple-700 font-medium shrink-0">
                          <FiClock className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                          <span>{rentalReturnText}</span>
                        </div>
                      </>
                    )}

                    {/* Booked Timestamp */}
                    {booking.createdAt && (
                      <span className="text-[11px] text-gray-400 ml-auto hidden lg:inline">
                        Booked {new Date(booking.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compact Pagination */}
      {!loading && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => loadBookings(pagination.page - 1)}
            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <FiChevronLeft className="w-3.5 h-3.5" />
          </button>
          
          {[...Array(pagination.pages)].map((_, i) => {
            const pageNum = i + 1;
            const isCurrent = pagination.page === pageNum;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => loadBookings(pageNum)}
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            disabled={pagination.page >= pagination.pages}
            onClick={() => loadBookings(pagination.page + 1)}
            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <FiChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FarmerBookings;
