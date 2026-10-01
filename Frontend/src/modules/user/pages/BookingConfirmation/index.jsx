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
  FiRefreshCw
} from 'react-icons/fi';
import { bookingService } from '../../../../services/bookingService';
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
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const getAddressString = (address) => {
    if (typeof address === 'string') return address;
    if (address && typeof address === 'object') {
      return `${address.addressLine1 || ''}${address.addressLine2 ? `, ${address.addressLine2}` : ''}, ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}`;
    }
    return 'N/A';
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
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/40 border-b border-black/[0.03] px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/[0.02]"
            >
              <FiArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Booking Sent</h1>
          </div>
          <NotificationBell />
        </header>

        <main className="px-4 py-6">
          {(() => {
            const isWorker = booking?.providerType === 'WORKER' || 
                             /labour|labor|worker|shramik|majdoor/i.test(booking?.serviceCategory || '') ||
                             booking?.bookedItems?.some(i => (i.card?.title || '').toLowerCase().includes('worker') || (i.card?.title || '').toLowerCase().includes('independent'));
            return (
              <>
                {/* Searching Animation - Show at top when searching for worker/vendor */}
                {isSearching && (
                  <div className="bg-white rounded-2xl shadow-md border border-gray-100 mb-4 overflow-hidden">
                    <SearchingAnimation isWorker={isWorker} />
                  </div>
                )}

                {/* Success Icon - Show when confirmed */}
                {!isSearching && ['confirmed', 'assigned', 'journey_started', 'work_in_progress', 'visited', 'work_done', 'completed'].includes(booking?.status?.toLowerCase()) && (
                  <div className="flex flex-col items-center justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                      <FiCheckCircle className="w-12 h-12 text-green-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-black mb-2">Booking Confirmed!</h1>
                    <p className="text-sm text-gray-600 text-center">
                      Your booking has been confirmed. We'll send you updates via SMS.
                    </p>
                  </div>
                )}

                {/* Request Sent Icon - Targeted Single-Vendor flow */}
                {!isSearching && booking?.status?.toLowerCase() === 'requested' && (
                  <div className="flex flex-col items-center justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mb-4 border border-amber-100 shadow-sm">
                      <FiBell className="w-10 h-10 text-amber-500 animate-pulse" />
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 mb-2 italic tracking-tight">REQUEST SENT!</h1>
                    <p className="text-sm text-gray-600 text-center max-w-[280px] font-medium leading-relaxed">
                      Your booking request has been sent to <span className="font-bold text-gray-900">{booking.vendorId?.businessName || booking.vendorId?.name || 'your chosen vendor'}</span>. Waiting for their confirmation.
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-700">
                      <FiClock size={12} />
                      <span>15-min response window</span>
                    </div>
                  </div>
                )}

                {/* Failure Icon - Show when expired/cancelled/rejected with Reselect Vendor CTA */}
                {!isSearching && ['expired', 'cancelled', 'rejected', 'failed', 'timeout', 'vendor_rejected'].includes(booking?.status?.toLowerCase()) && (
                  <div className="flex flex-col items-center justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
                      <FiXCircle className="w-12 h-12 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Vendor Declined / Unavailable</h1>
                    <p className="text-sm text-gray-600 text-center max-w-[280px] mb-2 font-medium">
                      {booking?.rejectionReason || 'The selected vendor was unable to take your booking request at this time.'}
                    </p>
                    <p className="text-xs text-slate-400 text-center max-w-[260px] mb-5">
                      We never auto-assign other vendors. Please pick another qualified available vendor below:
                    </p>
                    <div className="flex flex-col gap-2.5 w-full max-w-xs">
                      <button
                        onClick={() => setShowReselectModal(true)}
                        className="w-full px-6 py-3.5 bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-700/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FiRefreshCw size={14} />
                        <span>Select Another Vendor</span>
                      </button>
                      <button
                        onClick={() => navigate('/user/machinery-explorer')}
                        className="w-full px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <span>View Machinery Catalog</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Booking ID Card */}
                <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Booking ID</p>
                      <p className="text-base font-bold text-black">{booking.bookingNumber || booking._id || booking.id}</p>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full ${
                      ['rejected', 'vendor_rejected', 'cancelled', 'timeout', 'expired'].includes(booking?.status?.toLowerCase())
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : (isSearching || booking?.status?.toLowerCase() === 'requested')
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-green-50 text-green-700 border border-green-200'
                    }`}>
                      <span className="text-sm font-semibold">
                        {['rejected', 'vendor_rejected', 'cancelled', 'timeout', 'expired'].includes(booking?.status?.toLowerCase())
                          ? 'Vendor Unavailable'
                          : isSearching
                          ? (isWorker ? 'Finding Worker...' : 'Awaiting Response...')
                          : (booking?.status?.toLowerCase() === 'requested' ? 'Request Sent' : 'Confirmed')}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Service Details Card */}
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 mb-4">
            <h3 className="text-base font-bold text-black mb-3">Service Details</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  <FiMapPin className="w-4 h-4" style={{ color: themeColors.button }} />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1">Service Address</p>
                  <p className="text-sm text-gray-700">{getAddressString(booking.address)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  <FiCalendar className="w-4 h-4" style={{ color: themeColors.button }} />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1">Date & Time</p>
                  <p className="text-sm text-gray-700">
                    {formatDate(booking.scheduledDate)} ? {booking.scheduledTime || booking.timeSlot?.start || 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Service Summary Card */}
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 mb-4">
            <h3 className="text-base font-bold text-black mb-4">Order Summary</h3>
            <div className="space-y-3">
              {/* Service Category */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  {booking.categoryIcon ? (
                    <img src={booking.categoryIcon} alt="" className="w-5 h-5 object-contain" />
                  ) : (
                    <FiPackage className="w-4 h-4" style={{ color: themeColors.button }} />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Service Category</p>
                  <p className="text-sm font-bold text-gray-800">{booking.serviceCategory || booking.serviceName || 'Service'}</p>
                </div>
              </div>

              {/* Brand */}
              {(() => {
                const brandName = booking.brandName || booking.bookedItems?.[0]?.brandName;
                const brandIcon = booking.brandIcon || booking.bookedItems?.[0]?.brandIcon;
                if (!brandName) return null;
                return (
                  <div className="flex items-center gap-3 pt-3 border-t border-dashed border-gray-100">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                      {brandIcon ? (
                        <img src={brandIcon} alt={brandName} className="w-6 h-6 object-contain" />
                      ) : (
                        <span className="text-base font-black text-slate-400">{brandName.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brand</p>
                      <p className="text-sm font-bold text-gray-800">{brandName}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Service Cards */}
              {booking.bookedItems && booking.bookedItems.length > 0 ? (
                <div className="pt-3 border-t border-dashed border-gray-100 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Services Booked</p>
                  {booking.bookedItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start bg-gray-50 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded border"
                            style={{ color: themeColors.button, backgroundColor: 'rgba(0₹66₹66,0.08)', borderColor: 'rgba(0₹66₹66,0.2)' }}>
                            ×{item.quantity}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 truncate">{item.card?.title || 'Service'}</span>
                        </div>
                        {item.card?.subtitle && <p className="text-xs text-gray-400 mt-0.5 ml-8 line-clamp-1">{item.card.subtitle}</p>}
                        {item.card?.duration && <p className="text-xs text-gray-400 mt-0.5 ml-8">⏱ {item.card.duration}</p>}
                        
                        {/* Dynamic Agri & Rental Info */}
                        {booking.rental_type && (
                          <div className="ml-8 mt-2 space-y-1">
                            <span className="text-[10px] font-black tracking-widest uppercase text-teal-600 bg-teal-50 px-2 py-0.5 rounded border border-teal-100 inline-block mb-1">
                              {booking.rental_type.replace('_', ' ')}
                            </span>
                            
                            {booking.rental_type === 'land_based' && booking.landSize && (
                              <p className="text-xs text-gray-500 font-medium">Area: <span className="text-gray-900 font-bold">{booking.landSize}{typeof booking.landSize === 'string' && booking.landSize.match(/[a-zA-Z]/) ? '' : ' Acres'}</span></p>
                            )}
                            
                            {booking.rental_type === 'hourly' && booking.estimatedDuration && (
                              <p className="text-xs text-gray-500 font-medium">Duration: <span className="text-gray-900 font-bold">{booking.estimatedDuration} Hours</span></p>
                            )}
                            
                            {['daily', 'monthly'].includes(booking.rental_type) && booking.estimatedDuration && (
                              <p className="text-xs text-gray-500 font-medium">Duration: <span className="text-gray-900 font-bold">{booking.estimatedDuration} Days</span></p>
                            )}
                            
                            {booking.cropType && (
                              <p className="text-xs text-gray-500 font-medium">Crop: <span className="text-gray-900">{booking.cropType}</span></p>
                            )}
                          </div>
                        )}
                        
                      </div>
                      <span className="text-sm font-bold text-gray-900 ml-3 shrink-0">₹{((item.card?.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Payment Summary - Professional Card */}
          <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 mb-6 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: themeColors.gradient || themeColors.button }}></div>

            <div className="flex items-center gap-2 mb-4">
              <div className={`p-2 rounded-lg ${booking.paymentMethod === 'plan_benefit' ? 'bg-amber-100' : 'bg-slate-100'}`}>
                {booking.paymentMethod === 'plan_benefit' ? (
                  <FiPackage className="w-5 h-5 text-amber-600" />
                ) : (
                  <FiDollarSign className="w-5 h-5 text-slate-600" />
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-900">Payment Summary</h3>
            </div>

            <div className="space-y-3">
              {/* Base Price */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">Base Price</span>
                {booking.paymentMethod === 'plan_benefit' ? (
                  <div className="flex items-center gap-2">
                    <span className="line-through text-slate-400 text-xs">₹{(booking.basePrice || 0).toLocaleString('en-IN')}</span>
                    <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE ✓</span>
                  </div>
                ) : (
                  <span className="font-medium text-slate-900">₹{(booking.basePrice || 0).toLocaleString('en-IN')}</span>
                )}
              </div>

              {/* Discount */}
              {booking.paymentMethod !== 'plan_benefit' && booking.discount > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-green-600 font-medium">Discount</span>
                  <span className="font-medium text-green-600">-₹{booking.discount.toLocaleString('en-IN')}</span>
                </div>
              )}

              {/* Tax */}
              {(booking.tax > 0 || booking.paymentMethod === 'plan_benefit') && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">
                    GST ({booking.basePrice - booking.discount > 0 
                      ? Math.round((booking.tax * 100) / (booking.basePrice - booking.discount)) 
                      : 18}%)
                  </span>
                  {booking.paymentMethod === 'plan_benefit' ? (
                    <div className="flex items-center gap-2">
                      <span className="line-through text-slate-400 text-xs">₹{(booking.tax || 0).toLocaleString('en-IN')}</span>
                      <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE ✓</span>
                    </div>
                  ) : (
                    <span className="font-medium text-slate-700">₹{(booking.tax || 0).toLocaleString('en-IN')}</span>
                  )}
                </div>
              )}

              {/* Convenience Fee */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Convenience Fee</span>
                {booking.paymentMethod === 'plan_benefit' ? (
                  <div className="flex items-center gap-2">
                    <span className="line-through text-slate-400 text-xs">₹{(booking.visitingCharges || booking.visitationFee || 0).toLocaleString('en-IN')}</span>
                    <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE ✓</span>
                  </div>
                ) : (
                  <span className={`font-medium ${(booking.visitingCharges || booking.visitationFee || 0) === 0 ? 'text-slate-400 font-normal italic' : 'text-slate-700'}`}>
                    {(booking.visitingCharges || booking.visitationFee || 0) === 0 
                      ? 'Not Added' 
                      : `₹${(booking.visitingCharges || booking.visitationFee || 0).toLocaleString('en-IN')}`}
                  </span>
                )}
              </div>

              {/* Total */}
              <div className="border-t border-slate-200 pt-4 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-slate-900">Total Paid</span>
                  <span className="text-xl font-black text-slate-900">
                    ₹{(booking.paymentMethod === 'plan_benefit' ? 0 : (booking.finalAmount || booking.totalAmount || 0)).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Success Badge */}
            {(booking.paymentId || booking.paymentMethod === 'plan_benefit') && (
              <div className={`mt-4 pt-3 border-t border-dashed ${booking.paymentMethod === 'plan_benefit' ? 'border-amber-200' : 'border-slate-200'}`}>
                <div className={`flex items-center gap-2 border rounded-lg p-3 ${booking.paymentMethod === 'plan_benefit' ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-200'}`}>
                  <FiCheckCircle className={`w-5 h-5 shrink-0 ${booking.paymentMethod === 'plan_benefit' ? 'text-amber-600' : 'text-green-600'}`} />
                  <div>
                    <p className={`text-sm font-bold ${booking.paymentMethod === 'plan_benefit' ? 'text-amber-700' : 'text-green-700'}`}>
                      {booking.paymentMethod === 'plan_benefit' ? 'Membership Benefit Applied' : 'Payment Successful'}
                    </p>
                    {booking.paymentId && <p className="text-xs text-green-600">ID: {booking.paymentId}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {isSearching && (
              <button
                onClick={() => setConfirmDialog(true)}
                className="w-full py-3 rounded-lg text-base font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-all mb-4"
              >
                Cancel Booking Request
              </button>
            )}

            <button
              onClick={handleViewDetails}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold text-white transition-all"
              style={{ backgroundColor: themeColors.button }}
            >
              View Full Details
              <FiArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={handleGoHome}
              className="w-full py-3 rounded-lg text-base font-semibold bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-all"
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
