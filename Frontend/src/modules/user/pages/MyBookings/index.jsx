import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FiArrowLeft,
  FiClock,
  FiMapPin,
  FiCalendar,
  FiChevronRight,
  FiSearch,
  FiUsers,
  FiAlertCircle,
  FiBriefcase,
  FiX
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import NotificationBell from '../../components/common/NotificationBell';
import { motion } from 'framer-motion';
import { bookingService } from '../../../../services/bookingService';
import { apiCache } from '../../../../utils/apiCache';
import workerBookingService from '../../../../services/workerBookingService';

const FILTERS = [
  { id: 'all', label: 'All Orders' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

// statuses of machinery/vendor orders that are still waiting on someone (shown under "Pending")
const PENDING_BOOKING_STATUSES = 'pending,requested,searching,awaiting_payment';

const MyBookings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  // farmer hiring requests (one card per request, from the backend with status words + amount)
  const [workerRequests, setWorkerRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(() => (FILTERS.some(f => f.id === searchParams.get('filter')) ? searchParams.get('filter') : 'all'));
  const [searchQuery, setSearchQuery] = useState('');

  const bookingsCacheRef = useRef({});
  const activeRequestIdRef = useRef(0);

  const loadBookings = useCallback(async (isSilent = false) => {
    const requestId = ++activeRequestIdRef.current;

    // Fast-path: If cached data exists for this filter, immediately render it (0ms latency!)
    if (bookingsCacheRef.current[filter]) {
      setBookings(bookingsCacheRef.current[filter]);
      if (bookingsCacheRef.current.__requests) setWorkerRequests(bookingsCacheRef.current.__requests);
      if (!isSilent) setLoading(false);
    } else if (!isSilent) {
      setLoading(true);
    }

    try {
      const params = { limit: 50, excludeWorkerRequests: true };
      if (isSilent) params.skipCache = true;
      if (filter !== 'all') {
        if (filter === 'in_progress') {
          // For Machinery/Farm orders, "In Progress" means anything from journey started to operation
          params.status = 'journey_started,visited,in_progress';
        } else if (filter === 'pending') {
          params.status = PENDING_BOOKING_STATUSES;
        } else {
          params.status = filter;
        }
      }
      const [response, requestsRes] = await Promise.all([
        bookingService.getUserBookings(params),
        workerBookingService.getMyFarmerRequests({ limit: 50, withCards: true }).catch(() => null)
      ]);

      if (requestId !== activeRequestIdRef.current) return;
      if (requestsRes?.success) {
        bookingsCacheRef.current.__requests = requestsRes.data || [];
        setWorkerRequests(requestsRes.data || []);
      }

      // Race-condition guard: Discard response if a newer filter was clicked in between
      if (requestId !== activeRequestIdRef.current) return;

      if (response?.success) {
        const data = response.data || [];
        bookingsCacheRef.current[filter] = data;
        setBookings(data);
      } else {
        if (!isSilent) toastManager.error(response?.message || 'Failed to load bookings');
      }
    } catch (error) {
      if (!isSilent && requestId === activeRequestIdRef.current) {
        toastManager.error('Failed to load bookings. Please try again.');
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [filter]);

  useEffect(() => {
    loadBookings(false);

    let debounceTimer = null;
    const handleUpdate = () => {
      // Invalidate cache and silently refresh in the background without UI flicker
      apiCache.invalidatePrefix('/users/bookings');
      delete bookingsCacheRef.current[filter];
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadBookings(true);
      }, 300);
    };

    window.addEventListener('userBookingsUpdated', handleUpdate);

    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('userBookingsUpdated', handleUpdate);
    };
  }, [loadBookings, filter]);

  // Unified status styling matching the vendor app design system
  const getUnifiedStatusConfig = (status, group) => {
    const s = (status || group || '').toUpperCase();
    switch (s) {
      case 'PENDING':
      case 'REQUESTED':
      case 'SEARCHING':
        return {
          label: 'Pending',
          bg: 'bg-amber-50',
          text: 'text-amber-700 font-bold',
          border: 'border-amber-200/80',
          dot: 'bg-amber-500',
          accent: '#f59e0b',
        };
      case 'AWAITING_PAYMENT':
        return {
          label: 'Awaiting Payment',
          bg: 'bg-amber-50',
          text: 'text-amber-800 font-bold',
          border: 'border-amber-300',
          dot: 'bg-amber-600 animate-pulse',
          accent: '#d97706',
        };
      case 'CONFIRMED':
      case 'ASSIGNED':
      case 'ACCEPTED':
        return {
          label: 'Confirmed',
          bg: 'bg-blue-50',
          text: 'text-blue-700 font-bold',
          border: 'border-blue-200/80',
          dot: 'bg-blue-500',
          accent: '#3b82f6',
        };
      case 'IN_PROGRESS':
      case 'IN-PROGRESS':
      case 'JOURNEY_STARTED':
      case 'VISITED':
        return {
          label: s === 'JOURNEY_STARTED' ? 'On The Way' : s === 'VISITED' ? 'Arrived' : 'In Progress',
          bg: 'bg-emerald-50',
          text: 'text-emerald-700 font-bold',
          border: 'border-emerald-200/80',
          dot: 'bg-emerald-500 animate-pulse',
          accent: '#10b981',
        };
      case 'COMPLETED':
      case 'WORK_DONE':
        return {
          label: 'Completed',
          bg: 'bg-slate-50',
          text: 'text-slate-700 font-semibold',
          border: 'border-slate-200',
          dot: 'bg-slate-400',
          accent: '#64748b',
        };
      case 'CANCELLED':
      case 'REJECTED':
      case 'TIMED_OUT':
        return {
          label: s === 'CANCELLED' ? 'Cancelled' : 'Rejected',
          bg: 'bg-rose-50',
          text: 'text-rose-700 font-bold',
          border: 'border-rose-200/70',
          dot: 'bg-rose-400',
          accent: '#f43f5e',
        };
      default:
        return {
          label: (s.replace(/_/g, ' ') || 'Pending').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
          bg: 'bg-slate-50',
          text: 'text-slate-600 font-medium',
          border: 'border-slate-200',
          dot: 'bg-slate-400',
          accent: '#94a3b8',
        };
    }
  };

  const handleBookingClick = (booking) => {
    navigate(`/user/booking/${booking._id || booking.id}`);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getAddressString = (address) => {
    if (typeof address === 'string') return address;
    if (address && typeof address === 'object') {
      const parts = [
        address.addressLine1,
        address.addressLine2,
        address.city
      ].filter(Boolean);
      return parts.join(', ');
    }
    return 'Detailed Address';
  };

  // ── Farmer hiring requests ───────────────────────────────────────────────
  const requestMatchesSearch = (r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return [r._id, r.workTitle, r.workCategory, r.location?.city, r.location?.addressLine1]
      .some(v => String(v || '').toLowerCase().includes(q));
  };
  const visibleRequests = workerRequests.filter(r => (filter === 'all' || r.card?.group === filter) && requestMatchesSearch(r));
  const actionRequests = filter === 'all' ? visibleRequests.filter(r => r.card?.needsAction) : [];

  const requestWhen = (r) => {
    if (r.bookingType === 'DAILY') {
      const days = Number(r.numberOfDays) || 1;
      return `From ${formatDate(r.startDate || r.scheduledDate)} · ${days} day${days === 1 ? '' : 's'}${r.reportingTime ? ` · ${r.reportingTime}` : ''}`;
    }
    return `${formatDate(r.scheduledDate)}${r.startTime ? ` · ${r.startTime}` : ''}`;
  };

  // Modern Vendor-styled Request Card
  const renderRequestCard = (r, compact = false) => {
    const statusConfig = getUnifiedStatusConfig(r.card?.group || r.status, r.card?.group);
    if (r.card?.needsAction) {
      statusConfig.label = r.card.label || 'Action Required';
      statusConfig.dot = 'bg-amber-500 animate-ping';
      statusConfig.accent = '#f59e0b';
    } else if (r.card?.label) {
      statusConfig.label = r.card.label;
    }

    const isExpired = (r.status || '').toLowerCase() === 'expired';
    const isCancelled = ['cancelled', 'rejected', 'expired'].includes((r.card?.group || r.status || '').toLowerCase());
    const amountVal = Number(
      r.card?.amount?.value ?? 
      (r.paymentSummary?.totalPayable || r.financialSnapshot?.totalPayable || r.totalAmount || r.estimatedCost || 0)
    );
    const amountLabel = isExpired ? 'Expired' : (isCancelled ? 'Cancelled' : (r.card?.amount?.label || 'Pay in Cash'));

    const durationLabel = r.bookingType === 'DAILY'
      ? `${Number(r.numberOfDays) || 1} Day${(Number(r.numberOfDays) || 1) > 1 ? 's' : ''}`
      : `${r.durationHours || 1} Hr${Number(r.durationHours || 1) > 1 ? 's' : ''}`;

    return (
      <div
        key={`req-${r._id}`}
        onClick={() => navigate(`/user/farmer-worker-request/${r._id}`)}
        className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-slate-300 transition-all duration-150 p-3.5 relative overflow-hidden cursor-pointer active:scale-[0.99]"
      >
        {/* Subtle left status accent */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: statusConfig.accent }}
        />

        {/* Header Row: Category Badge + Status Pill & Price */}
        <div className="flex items-start justify-between gap-2 mb-2 pl-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50/90 border border-emerald-200/60 px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                <FiUsers className="w-3 h-3" /> Workers{r.workCategory ? ` · ${r.workCategory}` : ''}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                {statusConfig.label}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 text-sm leading-snug truncate">
              {r.workTitle || 'Worker Hiring'}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
              {r.card?.detail || `${r.numberOfWorkers || 1} worker${(r.numberOfWorkers || 1) > 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Price / Estimated Cost */}
          <div className="flex items-center gap-1 flex-shrink-0 text-right">
            <div>
              {amountVal > 0 ? (
                <div className={`text-sm font-black leading-none ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  ₹{Number(amountVal).toLocaleString('en-IN')}
                </div>
              ) : (
                <div className="text-sm font-bold text-slate-400 leading-none">
                  ₹0
                </div>
              )}
              <div className={`text-[10px] mt-1 font-medium ${isCancelled ? 'text-rose-500 font-semibold' : 'text-slate-400'}`}>
                {amountVal > 0 ? (isExpired ? 'Expired' : (isCancelled ? 'Cancelled' : amountLabel)) : 'No Charge'}
              </div>
            </div>
            <FiChevronRight className="w-4 h-4 text-slate-300 ml-0.5" />
          </div>
        </div>

        {/* Core Information Section - Clean, Compact Hierarchy */}
        <div className="space-y-1.5 text-xs text-slate-600 pl-1.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-slate-600 truncate">
              <FiCalendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">{requestWhen(r)}</span>
            </div>
            {durationLabel && (
              <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md flex-shrink-0">
                {durationLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-slate-500">
            <FiMapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{getAddressString(r.location)}</span>
          </div>
        </div>

        {/* Footer Row: Action button or Status */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] pl-1.5">
          {r.card?.needsAction ? (
            <div className="flex items-center justify-between w-full">
              <span className="text-amber-800 font-bold flex items-center gap-1.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                {r.card?.detail || 'Worker applied — Action required'}
              </span>
              <button
                type="button"
                className="text-white bg-amber-600 hover:bg-amber-700 active:scale-95 transition-all font-bold text-xs px-2.5 py-1 rounded-lg shadow-xs flex items-center gap-1 cursor-pointer"
              >
                {r.card?.label || 'Select Workers'} →
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    isCancelled ? 'text-slate-400' : 'text-emerald-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isCancelled ? 'bg-slate-400' : 'bg-emerald-500'
                    }`}
                  />
                  {isCancelled ? 'Request Cancelled' : amountLabel}
                </span>
              </div>
              <span className="text-slate-400 text-[10px] flex items-center gap-0.5">
                View details →
              </span>
            </>
          )}
        </div>
      </div>
    );
  };

  // Modern Vendor-styled Booking Card (Equipment & Farm Services)
  const renderBookingCard = (booking) => {
    const statusConfig = getUnifiedStatusConfig(booking.status);
    const isCancelled = ['cancelled', 'rejected'].includes((booking.status || '').toLowerCase());
    const isPaid = (booking.farmerAmount?.status === 'paid') || ['paid', 'success'].includes((booking.paymentStatus || '').toLowerCase());
    const isCash = booking.farmerAmount?.paymentMethod === 'cash' || booking.paymentMethod === 'cash';
    
    const amountVal = booking.farmerAmount?.total ?? (booking.finalAmount || booking.totalAmount || 0);
    const paymentSubtitle = isCancelled
      ? 'Cancelled'
      : isPaid
      ? (isCash ? 'Paid in Cash' : 'Paid Online')
      : (isCash ? 'Pay in Cash' : 'Payment Pending');

    const durationLabel = booking.rental_type === 'daily'
      ? `${booking.estimatedDuration || 1} Day${Number(booking.estimatedDuration) > 1 ? 's' : ''}`
      : booking.rental_type === 'hourly'
      ? `${booking.estimatedDuration || 1} Hr${Number(booking.estimatedDuration) > 1 ? 's' : ''}`
      : booking.rental_type === 'land_based'
      ? `${booking.landSize || 1} Acres`
      : null;

    const itemsSummary = booking.bookedItems && booking.bookedItems.length > 0
      ? booking.bookedItems.map(item => item.card?.title || item.title).filter(Boolean).join(', ')
      : null;

    const bookingNum = booking.bookingNumber || (booking._id || booking.id || '').substring(0, 8);

    return (
      <div
        key={booking._id || booking.id}
        onClick={() => handleBookingClick(booking)}
        className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-slate-300 transition-all duration-150 p-3.5 relative overflow-hidden cursor-pointer active:scale-[0.99]"
      >
        {/* Subtle left status accent */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: statusConfig.accent }}
        />

        {/* Header Row: Category Badge + Status Pill & Price */}
        <div className="flex items-start justify-between gap-2 mb-2 pl-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50/90 border border-blue-200/60 px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                <FiBriefcase className="w-3 h-3" /> {booking.serviceCategory || 'Equipment Rental'}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                {statusConfig.label}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 text-sm leading-snug truncate">
              {booking.serviceName || 'Equipment Order'}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
              {itemsSummary ? itemsSummary : `#${bookingNum}`}
            </p>
          </div>

          {/* Price / Total Amount */}
          <div className="flex items-center gap-1 flex-shrink-0 text-right">
            <div>
              {amountVal > 0 ? (
                <div className={`text-sm font-black leading-none ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  ₹{Number(amountVal).toLocaleString('en-IN')}
                </div>
              ) : (
                <div className="text-sm font-bold text-slate-400 leading-none">
                  ₹0
                </div>
              )}
              <div className={`text-[10px] mt-1 font-medium ${isCancelled ? 'text-rose-500 font-semibold' : 'text-slate-400'}`}>
                {amountVal > 0 ? paymentSubtitle : 'No Charge'}
              </div>
            </div>
            <FiChevronRight className="w-4 h-4 text-slate-300 ml-0.5" />
          </div>
        </div>

        {/* Core Information Section - Clean, Compact Hierarchy */}
        <div className="space-y-1.5 text-xs text-slate-600 pl-1.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-slate-600 truncate">
              <FiCalendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">
                {formatDate(booking.scheduledDate)}
                {booking.scheduledTime || booking.timeSlot?.start ? ` • ${booking.scheduledTime || booking.timeSlot?.start}` : ''}
              </span>
            </div>
            {durationLabel && (
              <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md flex-shrink-0">
                {durationLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-slate-500">
            <FiMapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{getAddressString(booking.address)}</span>
          </div>
        </div>

        {/* Footer Row: Payment Status & View Details */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] pl-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                isCancelled ? 'text-slate-400' : isPaid ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isCancelled ? 'bg-slate-400' : isPaid ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {isCancelled ? 'Order Cancelled' : isPaid ? (isCash ? 'Paid in Cash' : 'Paid Online') : (isCash ? 'Pay in Cash' : 'Payment Pending')}
            </span>
          </div>
          <span className="text-slate-400 text-[10px] flex items-center gap-0.5">
            View details →
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-24 relative bg-slate-50/50">
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(at 0% 0%, rgba(52, 121, 137, 0.08) 0%, transparent 60%), radial-gradient(at 100% 100%, rgba(187, 95, 54, 0.05) 0%, transparent 60%)'
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Modern Glass Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-slate-200/80 px-4 py-3 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-xs border border-slate-200/80 active:scale-95 transition-all"
            >
              <FiArrowLeft className="w-4 h-4 text-slate-700" />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight">My Farm Orders</h1>
              <p className="text-[11px] text-slate-500 font-medium">Track your machinery & workers</p>
            </div>
          </div>
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-xs border border-slate-200/80 relative">
            <NotificationBell />
          </div>
        </header>

        {/* Filter Tabs */}
        <div className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-[57px] z-20 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
          <div className="flex gap-1.5 px-3.5 py-2.5 overflow-x-auto no-scrollbar scroll-smooth">
            {FILTERS.map((tab) => {
              const isActive = filter === tab.id;
              const badgeCount = tab.id === 'pending' ? workerRequests.filter(r => r.card?.needsAction).length : 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 active:scale-95 flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-emerald-800 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50'
                  }`}
                >
                  <span>{tab.label}</span>
                  {badgeCount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-tight ${
                        isActive ? 'bg-white text-emerald-900' : 'bg-amber-500 text-white animate-pulse'
                      }`}
                    >
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bookings & Requests Main List */}
        <main className="px-3.5 py-3 max-w-lg mx-auto w-full">
          {/* Sleek Compact Search Bar */}
          {(!loading || bookings.length > 0 || workerRequests.length > 0) && (
            <div className="mb-2.5">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search orders (ID, category, service, address)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs md:text-sm bg-white rounded-xl border border-slate-200/90 text-slate-800 placeholder-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all font-medium"
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
          )}

          {/* Skeleton Loader */}
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] animate-pulse"
                >
                  <div className="flex justify-between items-center mb-2.5">
                    <div className="h-4 w-36 bg-slate-100 rounded"></div>
                    <div className="h-4 w-16 bg-slate-100 rounded"></div>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="h-3 w-48 bg-slate-100 rounded"></div>
                    <div className="h-3 w-56 bg-slate-100 rounded"></div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-between items-center">
                    <div className="h-3 w-24 bg-slate-100 rounded"></div>
                    <div className="h-3 w-16 bg-slate-100 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (() => {
            const filteredBookings = bookings.filter(booking => {
              if (!searchQuery.trim()) return true;
              const query = searchQuery.toLowerCase();
              
              const matchesId = (booking.bookingNumber || booking._id || booking.id || '').toLowerCase().includes(query);
              const matchesCategory = (booking.serviceCategory || '').toLowerCase().includes(query);
              const matchesName = (booking.serviceName || '').toLowerCase().includes(query);
              
              const matchesItems = booking.bookedItems?.some(item => 
                (item.title || item.card?.title || '').toLowerCase().includes(query)
              );
              
              const addressStr = getAddressString(booking.address).toLowerCase();
              const matchesAddress = addressStr.includes(query);
              
              return matchesId || matchesCategory || matchesName || matchesItems || matchesAddress;
            });

            // Unified chronological list: newest first
            const actionIds = new Set(actionRequests.map(r => String(r._id)));
            const combined = [
              ...filteredBookings.map(b => ({ kind: 'booking', at: new Date(b.createdAt || b.scheduledDate || 0).getTime(), item: b })),
              ...visibleRequests.filter(r => !actionIds.has(String(r._id)))
                .map(r => ({ kind: 'request', at: new Date(r.createdAt || 0).getTime(), item: r }))
            ].sort((x, y) => y.at - x.at);

            if (combined.length === 0 && actionRequests.length === 0) {
              return (
                <div className="bg-white rounded-xl p-8 text-center border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] my-4">
                  <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-2.5">
                    <FiBriefcase className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="text-slate-800 font-semibold text-sm mb-1">No Orders Found</h3>
                  <p className="text-slate-500 text-xs max-w-xs mx-auto leading-relaxed">
                    {searchQuery.trim()
                      ? `No orders matching "${searchQuery}" were found.`
                      : filter === 'all'
                        ? "You haven't booked any farm machinery or workers yet."
                        : `No ${filter.replace('_', ' ')} orders found under this tab.`}
                  </p>
                </div>
              );
            }

            return (
              <>
                {/* Needs Your Action Priority Section */}
                {actionRequests.length > 0 && (
                  <section className="mb-3.5">
                    <h2 className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FiAlertCircle className="w-3.5 h-3.5 text-amber-600" /> Needs your action
                    </h2>
                    <div className="space-y-2.5">
                      {actionRequests.map(r => renderRequestCard(r, true))}
                    </div>
                  </section>
                )}

                {actionRequests.length > 0 && combined.length > 0 && (
                  <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Your orders</h2>
                )}

                {/* Main Cards List */}
                <div className="space-y-2.5">
                  {combined.map(({ kind, item }) => (
                    <motion.div
                      key={kind === 'request' ? `req-${item._id}` : (item._id || item.id)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {kind === 'request' ? renderRequestCard(item) : renderBookingCard(item)}
                    </motion.div>
                  ))}
                </div>
              </>
            );
          })()}
        </main>
      </div>
    </div>
  );
};

export default MyBookings;
