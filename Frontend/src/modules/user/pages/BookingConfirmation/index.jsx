import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { toastManager } from '../../../../utils/toastManager';
import { themeColors } from '../../../../theme';
import {
  FiCheckCircle,
  FiMapPin,
  FiClock,
  FiCalendar,
  FiPackage,
  FiDollarSign,
  FiHome,
  FiArrowRight,
  FiLoader,
  FiArrowLeft,
  FiBell,
  FiXCircle,
  FiRefreshCw,
  FiCreditCard
} from 'react-icons/fi';
import { bookingService } from '../../../../services/bookingService';
import { paymentService } from '../../../../services/paymentService';
import { useSocket } from '../../../../context/SocketContext';
import NotificationBell from '../../components/common/NotificationBell';
import ConfirmDialog from '../../../../components/common/ConfirmDialog';
import ReselectVendorModal from '../../components/booking/ReselectVendorModal';

// Inline Searching Animation Component
const SearchingAnimation = ({ isWorker }) => {
  const [dots, setDots] = useState('.');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '.' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-8 px-6 relative">
      {/* Map-like Background (Subtle) */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="w-full h-full" style={{
          backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}></div>
      </div>

      {/* Central Radar Animation */}
      <div className="relative w-48 h-48 flex items-center justify-center mb-6">
        {/* Outer Ripples */}
        <div className="absolute inset-0 rounded-full border-2 opacity-20 animate-ping"
          style={{ borderColor: themeColors.brand.teal, animationDuration: '3s' }}></div>
        <div className="absolute inset-4 rounded-full border opacity-40 animate-ping"
          style={{ borderColor: themeColors.brand.teal, animationDuration: '3s', animationDelay: '0.6s' }}></div>

        {/* Rotating Scanner Gradient */}
        <div className="absolute inset-0 rounded-full animate-spin opacity-30"
          style={{
            background: `conic-gradient(transparent 180deg, ${themeColors.brand.teal})`,
            animationDuration: '4s'
          }}></div>

        {/* Center Core */}
        <div className="relative z-10 w-20 h-20 bg-white rounded-full shadow-lg flex items-center justify-center p-1">
          <div className="w-full h-full rounded-full flex items-center justify-center relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${themeColors.brand.teal}15, ${themeColors.brand.teal}05)` }}>
            <div className="w-3 h-3 rounded-full shadow-lg animate-pulse"
              style={{ backgroundColor: themeColors.brand.teal }}></div>
            <div className="absolute w-full h-full animate-pulse opacity-30 rounded-full"
              style={{ backgroundColor: themeColors.brand.teal }}></div>
          </div>
        </div>

        {/* Floating Dots Animation */}
        <div className="absolute top-8 right-8 w-2 h-2 rounded-full animate-bounce opacity-50" style={{ backgroundColor: themeColors.brand.orange, animationDelay: '0.2s' }}></div>
        <div className="absolute bottom-6 left-6 w-2 h-2 rounded-full animate-bounce opacity-50" style={{ backgroundColor: themeColors.brand.yellow, animationDelay: '1.5s' }}></div>
      </div>

      {/* Status Text */}
      <div className="text-center relative z-20">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Finding nearby {isWorker ? 'independent workers' : 'experts'}</h3>
        <p className="text-gray-500 text-sm max-w-[240px] mx-auto leading-relaxed">
          Connecting you with the best available {isWorker ? 'workers' : 'service providers'}{dots}
        </p>
      </div>

      {/* Bottom Pill */}
      <div className="mt-4">
        <div className="px-4 py-1.5 bg-gray-50 rounded-full border border-gray-100 text-xs font-medium text-gray-400">
          Process runs in background
        </div>
      </div>
    </div>
  );
};

const BookingConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const socket = useSocket();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(!location.state?.noVendorsFound);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [showReselectModal, setShowReselectModal] = useState(false);
  const [paying, setPaying] = useState(false);

  const handleOnlinePayment = async () => {
    if (paying || !booking) return;

    try {
      setPaying(true);
      toastManager.info('Initializing Razorpay payment...');
      const orderResponse = await paymentService.createOrder(booking._id || booking.id);

      if (!orderResponse.success) {
        toastManager.error(orderResponse.message || 'Failed to create payment order');
        setPaying(false);
        return;
      }

      const razorpayKey = orderResponse.data?.key || import.meta.env.VITE_RAZORPAY_KEY_ID;
      const options = {
        key: razorpayKey,
        amount: Math.round(orderResponse.data.amount * 100),
        currency: orderResponse.data.currency || 'INR',
        order_id: orderResponse.data.orderId,
        name: 'Agroyilt',
        description: `Payment for ${booking.serviceName || 'Booking'}`,
        handler: async function (response) {
          try {
            toastManager.info('Verifying payment...');
            const verifyResponse = await paymentService.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            if (verifyResponse.success) {
              toastManager.success('Payment successful!');
              // Reload booking
              const refetch = await bookingService.getById(id);
              if (refetch.success) {
                setBooking(refetch.data);
              }
            } else {
              toastManager.error('Payment verification failed');
            }
          } catch (e) {
            toastManager.error('Failed to verify payment');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: function () {
            setPaying(false);
          }
        },
        prefill: {
          name: booking.userId?.name || 'Farmer',
          contact: booking.userId?.phone || ''
        },
        theme: {
          color: themeColors.button
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', function (resp) {
        toastManager.error(`Payment failed: ${resp.error?.description || 'Transaction unsuccessful'}`);
        setPaying(false);
      });
      razorpay.open();
    } catch (error) {
      toastManager.error('Failed to initialize payment');
      setPaying(false);
    }
  };

  useEffect(() => {
    const loadBooking = async () => {
      try {
        setLoading(true);
        const response = await bookingService.getById(id);
        if (response.success) {
          const data = { ...response.data };
          // Calculate notional display values for plan_benefit
          if (data.paymentMethod === 'plan_benefit') {
            if (!data.tax) data.tax = (data.basePrice || 0) * 0.18;
            if (!data.visitingCharges && !data.visitationFee) data.visitingCharges = 49;
          }
          setBooking(data);

          // We are actively searching/waiting ONLY if status is requested or searching
          const currentStatus = data.status?.toLowerCase();
          setIsSearching(['requested', 'searching'].includes(currentStatus));
        } else {
          toastManager.error(response.message || 'Booking not found');
          navigate('/user/my-bookings');
        }
      } catch (error) {
        toastManager.error('Failed to load booking details');
        navigate('/user/my-bookings');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadBooking();
    }
  }, [id, navigate]);

  // Real-time socket event listeners for instant status updates
  useEffect(() => {
    if (!socket || !id) return;

    const handleVendorRejected = (data) => {
      if ((data.bookingId || data.id)?.toString() === id.toString()) {
        console.log('[Socket] Vendor rejected booking:', data);
        setBooking(prev => ({
          ...prev,
          status: 'rejected',
          rejectionReason: data.reason || 'Selected vendor declined the booking request.'
        }));
        setIsSearching(false);
        toastManager.error(data.message || 'Selected vendor declined the request.');
        setShowReselectModal(true);
      }
    };

    const handleBookingAccepted = (data) => {
      if ((data.bookingId || data.id)?.toString() === id.toString()) {
        console.log('[Socket] Booking accepted by vendor:', data);
        setBooking(prev => ({
          ...prev,
          status: 'confirmed'
        }));
        setIsSearching(false);
        toastManager.success('Booking confirmed by vendor!');
      }
    };

    const handleBookingUpdated = (data) => {
      if ((data.bookingId || data.id)?.toString() === id.toString()) {
        console.log('[Socket] Booking updated:', data);
        setBooking(prev => ({
          ...prev,
          status: data.status,
          rejectionReason: data.rejectionReason || prev?.rejectionReason
        }));
        const newStatus = data.status?.toLowerCase();
        setIsSearching(['requested', 'searching'].includes(newStatus));
        if (['rejected', 'vendor_rejected', 'timed_out'].includes(newStatus)) {
          setShowReselectModal(true);
        }
      }
    };

    socket.on('vendor_rejected', handleVendorRejected);
    socket.on('booking_accepted', handleBookingAccepted);
    socket.on('booking_updated', handleBookingUpdated);

    return () => {
      socket.off('vendor_rejected', handleVendorRejected);
      socket.off('booking_accepted', handleBookingAccepted);
      socket.off('booking_updated', handleBookingUpdated);
    };
  }, [socket, id]);

  // Poll for vendor acceptance as fallback
  useEffect(() => {
    if (!isSearching || !id) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await bookingService.getById(id);
        if (response.success) {
          const updatedBooking = { ...response.data };

          if (updatedBooking.paymentMethod === 'plan_benefit') {
            if (!updatedBooking.tax) updatedBooking.tax = (updatedBooking.basePrice || 0) * 0.18;
            if (!updatedBooking.visitingCharges && !updatedBooking.visitationFee) updatedBooking.visitingCharges = 49;
          }

          setBooking(updatedBooking);
          const currentStatus = updatedBooking.status?.toLowerCase();
          const stillAwaiting = ['requested', 'searching'].includes(currentStatus);
          setIsSearching(stillAwaiting);
          if (!stillAwaiting) {
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [isSearching, id]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return String(dateString);
      return date.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return String(dateString);
    }
  };

  const formatTimeSlot = (timeStr, timeSlot) => {
    const raw = timeStr || (timeSlot?.start ? `${timeSlot.start}${timeSlot.end ? ` - ${timeSlot.end}` : ''}` : '');
    if (!raw) return '';
    const cleaned = String(raw).trim().replace(/-$/, '').trim();

    const to12Hour = (str) => {
      const trimmed = str.trim();
      if (/am|pm/i.test(trimmed)) return trimmed;
      const parts = trimmed.split(':');
      if (parts.length >= 2) {
        const h = parseInt(parts[0], 10);
        const m = parts[1].slice(0, 2);
        if (isNaN(h)) return trimmed;
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m} ${period}`;
      }
      return trimmed;
    };

    if (cleaned.includes('-') || cleaned.includes('–')) {
      const delimiter = cleaned.includes('–') ? '–' : '-';
      const [start, end] = cleaned.split(delimiter);
      if (start && end) {
        return `${to12Hour(start)} – ${to12Hour(end)}`;
      }
      if (start) return to12Hour(start);
    }
    return to12Hour(cleaned);
  };

  const getAddressString = (address) => {
    if (!address) return 'N/A';
    if (typeof address === 'string') return address;
    const line1 = (address.addressLine1 || '').trim();
    const line2 = (address.addressLine2 || '').trim();
    const city = (address.city || '').trim();
    const state = (address.state || '').trim();
    const pincode = (address.pincode || '').trim();

    // If line1 already contains city/pincode from reverse geocoding, avoid duplicating
    if (line1 && (line1.includes(city) || (pincode && line1.includes(pincode)))) {
      return line2 ? `${line2}, ${line1}` : line1;
    }

    const parts = [
      line1,
      line2,
      city,
      state ? (pincode ? `${state} - ${pincode}` : state) : pincode
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'N/A';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FiLoader className="w-12 h-12 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading booking details...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Booking not found</p>
          <button
            onClick={() => navigate('/user/my-bookings')}
            className="mt-4 px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: themeColors.button }}
          >
            Go to My Bookings
          </button>
        </div>
      </div>
    );
  }

  const handleViewDetails = () => {
    navigate(`/user/booking/${booking._id || booking.id}`);
  };

  const handleGoHome = () => {
    navigate('/user', { replace: true });
  };

  const handleCancelBooking = async () => {
    try {
      setLoading(true);
      await bookingService.cancel(booking._id || booking.id, { reason: 'Cancelled during uncertain vendor search' });
      toastManager.success('Booking cancelled successfully');
      navigate('/user');
    } catch (error) {
      console.error(error);
      toastManager.error('Failed to cancel booking');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20 relative bg-white">
      {/* Refined Brand Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#347989'}25 0%, transparent 70%),
              radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#D68F35'}20 0%, transparent 70%),
              radial-gradient(at 100% 100%, ${themeColors?.brand?.orange || '#BB5F36'}15 0%, transparent 75%),
              radial-gradient(at 0% 100%, ${themeColors?.brand?.teal || '#347989'}10 0%, transparent 70%),
              radial-gradient(at 50% 50%, ${themeColors?.brand?.teal || '#347989'}03 0%, transparent 100%),
              #FFFFFF
            `
          }}
        />
        {/* Elegant Dot Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(${themeColors?.brand?.teal || '#347989'} 0.8px, transparent 0.8px)`,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Modern Glassmorphism Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-black/[0.04] px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-xs border border-slate-200/80 active:scale-95 transition-transform"
            >
              <FiArrowLeft className="w-4 h-4 text-gray-800" />
            </button>
            <h1 className="text-base font-black text-gray-900 tracking-tight">
              {['rejected', 'vendor_rejected', 'cancelled', 'timeout', 'expired'].includes(booking?.status?.toLowerCase())
                ? 'Vendor Unavailable'
                : ['confirmed', 'assigned', 'journey_started', 'work_in_progress', 'visited', 'work_done', 'completed'].includes(booking?.status?.toLowerCase())
                ? 'Booking Confirmed'
                : 'Booking Request Sent'}
            </h1>
          </div>
          <NotificationBell />
        </header>

        <main className="px-3.5 py-4 max-w-lg mx-auto space-y-2.5">
          {(() => {
            const isWorker = booking?.providerType === 'WORKER' || 
                             /labour|labor|worker|shramik|majdoor/i.test(booking?.serviceCategory || '') ||
                             booking?.bookedItems?.some(i => (i.card?.title || '').toLowerCase().includes('worker') || (i.card?.title || '').toLowerCase().includes('independent'));
            return (
              <>
                {/* Searching Animation - Show at top when searching for worker/vendor */}
                {isSearching && (
                  <div className="bg-white rounded-2xl shadow-xs border border-gray-100 overflow-hidden">
                    <SearchingAnimation isWorker={isWorker} />
                  </div>
                )}

                {/* Success Hero Card - Show when confirmed */}
                {!isSearching && ['confirmed', 'assigned', 'journey_started', 'work_in_progress', 'visited', 'work_done', 'completed'].includes(booking?.status?.toLowerCase()) && (
                  <div className="bg-gradient-to-b from-emerald-50/90 via-teal-50/40 to-white rounded-2xl p-5 border border-emerald-200/80 shadow-xs text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-green-600" />
                    <div className="w-14 h-14 rounded-2xl bg-white border border-emerald-100 shadow-sm flex items-center justify-center text-emerald-600 mx-auto mb-2.5">
                      <FiCheckCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">Booking Confirmed!</h2>
                    <p className="text-xs text-slate-600 mt-1 max-w-[280px] mx-auto font-medium">
                      Your booking has been confirmed by the vendor. We'll send you live updates as they arrive.
                    </p>
                  </div>
                )}

                {/* Request Sent Hero Card - Targeted Single-Vendor flow */}
                {!isSearching && booking?.status?.toLowerCase() === 'requested' && (
                  <div className="bg-gradient-to-b from-amber-50/90 via-amber-50/40 to-white rounded-2xl p-5 border border-amber-200/80 shadow-xs text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                    <div className="w-14 h-14 rounded-2xl bg-white border border-amber-100 shadow-sm flex items-center justify-center text-amber-500 mx-auto mb-2.5">
                      <FiBell className="w-7 h-7 animate-pulse" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">Request Sent to Vendor!</h2>
                    <p className="text-xs text-slate-600 mt-1 max-w-[280px] mx-auto font-medium leading-relaxed">
                      Your request has been sent to <span className="font-bold text-slate-900">{booking.vendorId?.businessName || booking.vendorId?.name || 'your chosen vendor'}</span>. Waiting for their confirmation.
                    </p>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100/70 border border-amber-200 rounded-full text-[11px] font-bold text-amber-800">
                      <FiClock size={12} />
                      <span>15-min response window</span>
                    </div>
                  </div>
                )}

                {/* Failure Hero Card - Show when expired/cancelled/rejected with Reselect Vendor CTA */}
                {!isSearching && ['expired', 'cancelled', 'rejected', 'failed', 'timeout', 'vendor_rejected'].includes(booking?.status?.toLowerCase()) && (
                  <div className="bg-gradient-to-b from-rose-50/90 via-red-50/40 to-white rounded-2xl p-5 border border-rose-200/80 shadow-xs text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-400 via-red-500 to-amber-500" />

                    <div className="relative mx-auto w-14 h-14 rounded-2xl bg-white border border-rose-100 shadow-sm flex items-center justify-center text-rose-500 mb-2.5">
                      <FiXCircle className="w-8 h-8" />
                      <div className="absolute -inset-1 rounded-2xl border border-rose-400/20 animate-pulse pointer-events-none" />
                    </div>

                    <h2 className="text-lg font-black text-slate-900 tracking-tight">
                      Vendor Declined / Unavailable
                    </h2>

                    <div className="inline-flex items-center gap-1.5 bg-rose-100/70 border border-rose-200/80 rounded-full px-3 py-1 my-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      <span className="text-[11px] font-bold text-rose-900 leading-none">
                        {booking?.rejectionReason || 'Vendor did not respond within the time window'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 max-w-[280px] mx-auto leading-relaxed mb-3.5 font-medium">
                      We never auto-assign other vendors without your permission. You can choose another nearby vendor in 1 tap:
                    </p>

                    <div className="flex flex-col gap-2 w-full max-w-xs mx-auto">
                      <button
                        onClick={() => setShowReselectModal(true)}
                        className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 hover:from-emerald-700 hover:to-teal-900 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FiRefreshCw className="w-3.5 h-3.5" />
                        <span>Select Another Vendor</span>
                      </button>
                      <button
                        onClick={() => navigate('/user/machinery-explorer')}
                        className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>View Machinery Catalog</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Booking ID & Status Bar */}
                <div className="bg-white rounded-xl shadow-xs border border-gray-100/90 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Booking ID</p>
                    <p className="text-sm font-mono font-black text-gray-900 tracking-tight mt-0.5">
                      {booking.bookingNumber || booking._id || booking.id}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 capitalize ${
                    ['rejected', 'vendor_rejected', 'cancelled', 'timeout', 'expired'].includes(booking?.status?.toLowerCase())
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : (isSearching || booking?.status?.toLowerCase() === 'requested')
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {['rejected', 'vendor_rejected', 'cancelled', 'timeout', 'expired'].includes(booking?.status?.toLowerCase())
                      ? 'Vendor Unavailable'
                      : isSearching
                      ? (isWorker ? 'Finding Worker...' : 'Awaiting Response...')
                      : (booking?.status?.toLowerCase() === 'requested' ? 'Request Sent' : 'Confirmed')}
                  </span>
                </div>
              </>
            );
          })()}

          {/* Service Details Card */}
          <div className="bg-white rounded-xl shadow-xs border border-gray-100/90 p-3.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 pb-1.5 border-b border-gray-100">
              Service Details
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-teal-50 text-teal-700">
                  <FiMapPin className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Service Address</p>
                  <p className="text-xs font-semibold text-gray-800 leading-snug mt-0.5">
                    {getAddressString(booking.address)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 text-blue-700">
                  <FiCalendar className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Date & Time</p>
                  <p className="text-xs font-bold text-gray-800 mt-0.5">
                    {formatDate(booking.scheduledDate)}
                  </p>
                  {formatTimeSlot(booking.scheduledTime, booking.timeSlot) && (
                    <p className="text-xs text-gray-600 font-medium mt-0.5 flex items-center gap-1.5">
                      <FiClock className="w-3 h-3 text-amber-500" />
                      <span>{formatTimeSlot(booking.scheduledTime, booking.timeSlot)}</span>
                      {booking.estimatedDuration && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                          {booking.estimatedDuration} {booking.rental_type === 'daily' ? 'Days' : 'Hr'} scope
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Order Summary Card */}
          <div className="bg-white rounded-xl shadow-xs border border-gray-100/90 p-3.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 pb-1.5 border-b border-gray-100">
              Order Summary
            </h3>
            <div className="space-y-2.5">
              {/* Service Category */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-teal-50 text-teal-700 border border-teal-100/60">
                  {booking.categoryIcon ? (
                    <img src={booking.categoryIcon} alt="" className="w-4 h-4 object-contain" />
                  ) : (
                    <FiPackage className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</p>
                  <p className="text-xs font-bold text-gray-800">{booking.serviceCategory || booking.serviceName || 'Service'}</p>
                </div>
              </div>

              {/* Services Booked */}
              {booking.bookedItems && booking.bookedItems.length > 0 && (
                <div className="pt-2 border-t border-dashed border-gray-100 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Booked Equipment</p>
                  {booking.bookedItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start bg-slate-50/80 rounded-xl p-2.5 border border-slate-100">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[11px] font-bold px-1.5 py-0.5 rounded border"
                            style={{ color: themeColors.button, backgroundColor: 'rgba(0, 166, 166, 0.08)', borderColor: 'rgba(0, 166, 166, 0.2)' }}
                          >
                            ×{item.quantity}
                          </span>
                          <span className="text-xs font-bold text-gray-900 truncate">{item.card?.title || booking.serviceName || 'Service'}</span>
                        </div>

                        {/* Dynamic Agri & Rental Info */}
                        {booking.rental_type && (
                          <div className="ml-6 mt-1.5 flex flex-wrap gap-1">
                            <span className="text-[9px] font-black tracking-wider uppercase text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100 capitalize">
                              {booking.rental_type.replace('_', ' ')}
                            </span>
                            {booking.rental_type === 'land_based' && booking.landSize && (
                              <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                🌾 {booking.landSize}{typeof booking.landSize === 'string' && booking.landSize.match(/[a-zA-Z]/) ? '' : ' Acres'}
                              </span>
                            )}
                            {booking.estimatedDuration && (
                              <span className="text-[9px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                ⏱ {booking.estimatedDuration} {booking.rental_type === 'daily' ? 'Days' : 'Hours'}
                              </span>
                            )}
                            {booking.cropType && (
                              <span className="text-[9px] font-bold text-purple-800 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                                🌱 {booking.cropType}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-black text-gray-900 ml-2 shrink-0">
                        ₹{((item.card?.price || booking.basePrice || 0) * (item.quantity || 1)).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Payment Summary */}
          <div className="bg-white rounded-xl shadow-xs border border-gray-100/90 p-3.5 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: themeColors.gradient || themeColors.button }}></div>

            <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${booking.paymentMethod === 'plan_benefit' ? 'bg-amber-100' : 'bg-slate-100'}`}>
                  {booking.paymentMethod === 'plan_benefit' ? (
                    <FiPackage className="w-4 h-4 text-amber-600" />
                  ) : (
                    <FiDollarSign className="w-4 h-4 text-slate-600" />
                  )}
                </div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Payment Summary</h3>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                {booking.paymentMethod === 'cash' ? 'Cash on Service' : (booking.paymentMethod?.replace('_', ' ') || 'Pay on Service')}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {/* Base Price */}
              <div className="flex justify-between items-center text-slate-600">
                <span>Base Service Scope</span>
                {booking.paymentMethod === 'plan_benefit' ? (
                  <div className="flex items-center gap-1.5">
                    <span className="line-through text-slate-400 text-[11px]">₹{(booking.basePrice || 0).toLocaleString('en-IN')}</span>
                    <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">FREE ✓</span>
                  </div>
                ) : (
                  <span className="font-semibold text-slate-900">₹{(booking.basePrice || 0).toLocaleString('en-IN')}</span>
                )}
              </div>

              {/* Discount */}
              {booking.paymentMethod !== 'plan_benefit' && booking.discount > 0 && (
                <div className="flex justify-between items-center text-emerald-600">
                  <span>Discount</span>
                  <span className="font-semibold">-₹{booking.discount.toLocaleString('en-IN')}</span>
                </div>
              )}

              {/* GST */}
              {(booking.tax > 0 || typeof booking.gstPercentage === 'number' || booking.paymentMethod === 'plan_benefit') && (
                <div className="flex justify-between items-center text-slate-600">
                  <span>
                    GST ({typeof booking.gstPercentage === 'number' ? booking.gstPercentage : (booking.basePrice > 0 ? Math.round((booking.tax * 100) / booking.basePrice) : 5)}%)
                  </span>
                  {booking.paymentMethod === 'plan_benefit' ? (
                    <div className="flex items-center gap-1.5">
                      <span className="line-through text-slate-400 text-[11px]">₹{(booking.tax || 0).toLocaleString('en-IN')}</span>
                      <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">FREE ✓</span>
                    </div>
                  ) : (
                    <span className="font-semibold text-slate-900">₹{(booking.tax || 0).toLocaleString('en-IN')}</span>
                  )}
                </div>
              )}

              {/* Conveyance Fee */}
              <div className="flex justify-between items-center text-slate-600">
                <span>Conveyance & Mobilization</span>
                {booking.paymentMethod === 'plan_benefit' ? (
                  <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">FREE ✓</span>
                ) : (
                  <span className={`font-medium ${(booking.visitingCharges || booking.visitationFee || 0) === 0 ? 'text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-bold' : 'text-slate-700'}`}>
                    {(booking.visitingCharges || booking.visitationFee || 0) === 0 
                      ? 'FREE' 
                      : `₹${(booking.visitingCharges || booking.visitationFee || 0).toLocaleString('en-IN')}`}
                  </span>
                )}
              </div>

              {/* Total */}
              <div className="border-t border-slate-100 pt-2.5 mt-1 flex justify-between items-center">
                <span className="font-bold text-slate-900 text-sm">
                  {booking.paymentStatus === 'success' || booking.paymentMethod === 'plan_benefit' ? 'Total Paid' : 'Total Payable'}
                </span>
                <span className="text-lg font-black text-slate-900">
                  ₹{(booking.paymentMethod === 'plan_benefit' ? 0 : (booking.finalAmount || booking.totalAmount || 0)).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Reassurance Notice when rejected */}
            {['rejected', 'vendor_rejected', 'cancelled', 'timeout', 'expired'].includes(booking?.status?.toLowerCase()) && (
              <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200/80">
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 text-[11px] text-slate-600 leading-relaxed flex items-center gap-2">
                  <FiCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>No payment was charged. When you select another vendor, your rate lock remains guaranteed.</span>
                </div>
              </div>
            )}

            {/* Payment Pending Banner + Pay Online with Razorpay Button */}
            {booking.paymentStatus !== 'success' && booking.paymentMethod === 'online' && !['rejected', 'vendor_rejected', 'cancelled', 'timeout', 'expired'].includes(booking?.status?.toLowerCase()) && (
              <div className="mt-3 pt-3 border-t border-dashed border-slate-200">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-2.5 flex items-start gap-2.5">
                  <FiClock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-black text-amber-900 uppercase tracking-wide">Advance Payment Pending</p>
                    <p className="text-[10px] text-amber-700 mt-0.5 font-medium leading-relaxed">
                      Complete payment securely via Razorpay to lock in your machinery reservation.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleOnlinePayment}
                  disabled={paying}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <FiCreditCard className="w-4 h-4" />
                  {paying ? 'Connecting to Razorpay...' : `Pay ₹${(booking.finalAmount || booking.totalAmount || 0).toLocaleString('en-IN')} Online with Razorpay`}
                </button>
              </div>
            )}

            {/* Payment Success Badge */}
            {(booking.paymentId || booking.paymentStatus === 'success' || booking.paymentMethod === 'plan_benefit') && (
              <div className={`mt-3 pt-2.5 border-t border-dashed ${booking.paymentMethod === 'plan_benefit' ? 'border-amber-200' : 'border-slate-200'}`}>
                <div className={`flex items-center gap-2 border rounded-lg p-2.5 ${booking.paymentMethod === 'plan_benefit' ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-200'}`}>
                  <FiCheckCircle className={`w-4 h-4 shrink-0 ${booking.paymentMethod === 'plan_benefit' ? 'text-amber-600' : 'text-green-600'}`} />
                  <div>
                    <p className={`text-xs font-bold ${booking.paymentMethod === 'plan_benefit' ? 'text-amber-700' : 'text-green-700'}`}>
                      {booking.paymentMethod === 'plan_benefit' ? 'Membership Benefit Applied' : 'Payment Successful'}
                    </p>
                    {booking.paymentId && <p className="text-[10px] text-green-600">ID: {booking.paymentId}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            {isSearching && (
              <button
                onClick={() => setConfirmDialog(true)}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 active:scale-95 transition-all"
              >
                Cancel Booking Request
              </button>
            )}

            <button
              onClick={handleViewDetails}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all active:scale-95 shadow-sm"
              style={{ backgroundColor: themeColors.button }}
            >
              <span>View Full Booking Details</span>
              <FiArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleGoHome}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
            >
              Back to Home
            </button>
          </div>
        </main>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog}
        onClose={() => setConfirmDialog(false)}
        onConfirm={handleCancelBooking}
        title="Cancel Booking Request"
        message="Are you sure you want to cancel this booking search?"
        confirmLabel="Yes, Cancel"
        cancelLabel="No, Keep It"
        type="danger"
      />

      <ReselectVendorModal
        isOpen={showReselectModal}
        onClose={() => setShowReselectModal(false)}
        booking={booking}
        onVendorSelected={(newBooking) => {
          if (newBooking) {
            setBooking(newBooking);
            setIsSearching(true);
          }
        }}
      />
    </div>
  );
};

export default BookingConfirmation;
