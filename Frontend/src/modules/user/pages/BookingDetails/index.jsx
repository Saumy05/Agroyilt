import React, { useState, useEffect, useMemo } from 'react';
import WorkerPaymentBill from '../../components/booking/WorkerPaymentBill';
import WorkerWorkTime from '../../components/booking/WorkerWorkTime';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { toastManager } from '../../../../utils/toastManager';
import useAppNotifications from '../../../../hooks/useAppNotifications';
import { themeColors } from '../../../../theme';
import {
  FiArrowLeft,
  FiMapPin,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiLoader,
  FiCalendar,
  FiPackage,
  FiEdit2,
  FiPhone,
  FiMail,
  FiKey,
  FiStar,
  FiAward,
  FiX,
  FiUser,
  FiChevronRight,
  FiSearch,
  FiHome,
  FiAlertCircle,
  FiHelpCircle,
  FiCamera,
  FiAlertTriangle,
  FiCheckSquare,
  FiDollarSign,
  FiRefreshCw
} from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa';
import { bookingService } from '../../../../services/bookingService';
import { paymentService } from '../../../../services/paymentService';
import { cartService } from '../../../../services/cartService';
import RatingModal from '../../components/booking/RatingModal';
import PaymentVerificationModal from '../../components/booking/PaymentVerificationModal';
import DisputeModal from '../../../../components/common/DisputeModal'; // NEW
import disputeService from '../../../../services/disputeService'; // NEW
import { ConfirmDialog } from '../../../../components/common';
import ReviewCard from '../../components/booking/ReviewCard';
import NotificationBell from '../../components/common/NotificationBell';
import ReselectVendorModal from '../../components/booking/ReselectVendorModal';
import api from '../../../../services/api';
import LiveServiceTimer from '../../../../components/common/LiveServiceTimer';

const toAssetUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};


// Dynamic Countdown Timer & Alert for active machinery rentals (Customer side)
const RentalTimer = ({ booking }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!booking) return;
    const isTimeBased = booking.rental_type === 'hourly' || booking.rental_type === 'daily' || booking.rental_type === 'monthly';
    const isActive = booking.status?.toLowerCase() === 'in_progress';

    if (!isTimeBased || !isActive || !booking.startedAt) return;

    const startedTime = new Date(booking.startedAt).getTime();
    const duration = booking.estimatedDuration || 1;
    // Calculate total duration in milliseconds
    const durationMs = booking.rental_type === 'hourly'
      ? duration * 60 * 60 * 1000
      : duration * 24 * 60 * 60 * 1000;

    const targetMs = startedTime + durationMs;

    const updateTimer = () => {
      const remaining = targetMs - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
        setIsExpired(true);
      } else {
        setTimeLeft(remaining);
        setIsExpired(false);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [booking]);

  if (!booking) return null;
  const isTimeBased = booking.rental_type === 'hourly' || booking.rental_type === 'daily' || booking.rental_type === 'monthly';
  const isActive = booking.status?.toLowerCase() === 'in_progress';

  if (!isTimeBased || !isActive || !booking.startedAt) return null;

  // Format timeLeft in HH:MM:SS or Days Hours Mins
  const formatTime = () => {
    const totalSecs = Math.floor(timeLeft / 1000);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);

    if (booking.rental_type === 'hourly') {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      if (days > 0) {
        return `${days} Day(s) ${remainingHours} Hour(s) ${mins} Min(s)`;
      }
      return `${remainingHours} Hour(s) ${mins} Min(s) ${secs} Sec(s)`;
    }
  };

  return (
    <div className={`p-4 rounded-2xl border flex items-center gap-3.5 shadow-sm transition-all duration-300 ${
      isExpired
        ? 'bg-orange-50 border-orange-200 text-orange-700 animate-pulse'
        : 'bg-teal-50 border-teal-100 text-teal-700'
    }`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
        isExpired ? 'bg-orange-500 text-white' : 'bg-teal-500 text-white'
      }`}>
        <FiClock className="w-5 h-5 animate-spin" style={{ animationDuration: isExpired ? '1.5s' : '8s' }} />
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-black uppercase tracking-wider mb-0.5">
          {isExpired ? 'Rental Time Completed' : 'Rental In-Progress'}
        </h4>
        <p className="text-xs font-semibold opacity-95">
          {isExpired
            ? 'Your rental duration has ended. The driver will collect the equipment soon.'
            : `Time Remaining: ${formatTime()}`}
        </p>
      </div>
    </div>
  );
};

const BookingDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false); // NEW
  const [showReselectModal, setShowReselectModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

  // Edge case detection: Check if farmer came from "My Requests" / "My Bookings" history
  const isFromHistory = Boolean(
    location.state?.fromHistory ||
    location.state?.fromRequests ||
    location.state?.fromList ||
    searchParams.get('source') === 'history' ||
    searchParams.get('source') === 'requests' ||
    searchParams.get('from') === 'my_bookings'
  );

  const [stayOnPage, setStayOnPage] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  const [supportInfo, setSupportInfo] = useState({
    email: 'agroyilt@gmail.com',
    phone: '+91 91177 04450'
  });

  const [farmerFinalAmount, setFarmerFinalAmount] = useState('');
  const [confirmingAmount, setConfirmingAmount] = useState(false);
  const [isEditingAmount, setIsEditingAmount] = useState(false);

  const socket = useAppNotifications();

  const isPaid = ['success', 'paid', 'collected_by_vendor'].includes(booking?.paymentStatus?.toLowerCase());
  const isBookingCompleted = booking?.status?.toLowerCase() === 'completed';
  const showCompletionExit = Boolean(isBookingCompleted && isPaid && !isFromHistory && !stayOnPage);
  // Worker bookings never leave on their own: the farmer must be able to check the final amount
  const autoRedirect = showCompletionExit && booking?.providerType !== 'WORKER';

  const isAgri = useMemo(() => {
    if (!booking) return false;
    const catStr = `${booking.serviceCategory || ''} ${booking.categoryTitle || ''} ${booking.serviceName || ''} ${booking.categoryId?.title || ''} ${booking.categoryId?.name || ''}`.toLowerCase();
    const typeStr = `${booking.bookingType || ''} ${booking.providerType || ''}`.toLowerCase();
    return (
      /tractor|rotavator|harvester|tiller|cultivator|agriculture|agri|machinery|equipment|drone/.test(catStr) ||
      typeStr.includes('machinery') ||
      Boolean(booking.equipmentId)
    );
  }, [booking]);

  const serviceLabel = useMemo(() => {
    if (!booking) return 'Equipment';
    const name = `${booking.serviceName || ''} ${booking.equipmentId?.name || ''} ${booking.categoryTitle || ''} ${booking.categoryId?.name || ''} ${booking.categoryId?.title || ''} ${booking.serviceCategory || ''}`;
    if (/tractor/i.test(name)) return 'Tractor';
    if (/harvester/i.test(name)) return 'Harvester';
    if (/rotavator/i.test(name)) return 'Rotavator';
    if (/tiller/i.test(name)) return 'Tiller';
    if (/drone/i.test(name)) return 'Drone';
    if (/labour|worker|team/i.test(name)) return 'Farm Worker';
    if (/machinery|equipment/i.test(name) || booking.rental_type) return 'Equipment';
    return booking.serviceName || 'Equipment';
  }, [booking]);

  // A worker of a farmer hiring request: that job lives on Request Details (old links / notifications land here)
  useEffect(() => {
    if (booking?.providerType === 'WORKER' && booking.parentRequestId &&
        ['independent_broadcast', 'team_leader'].includes(booking.parentRequestType)) {
      navigate(`/user/farmer-worker-request/${booking.parentRequestId}`, { replace: true });
    }
  }, [booking, navigate]);

  // Auto-redirect timer when work is completed and paid in active live flow
  useEffect(() => {
    if (!autoRedirect) return;

    if (redirectCountdown <= 0) {
      navigate('/user', { replace: true });
      return;
    }

    const timer = setInterval(() => {
      setRedirectCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRedirect, redirectCountdown, navigate]);

  // Fetch support settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await api.get('/public/config');
        if (response.data?.success && response.data?.settings) {
          const { supportEmail, supportPhone } = response.data.settings;
          setSupportInfo({
            email: supportEmail || 'agroyilt@gmail.com',
            phone: supportPhone || '+91 91177 04450'
          });
        }
      } catch (error) {
        console.error('Failed to fetch support settings:', error);
        setSupportInfo({
          email: 'agroyilt@gmail.com',
          phone: '+91 91177 04450'
        });
      }
    };
    fetchSettings();
  }, []);

  // Function to load booking
  const loadBooking = async () => {
    try {
      // Don't set loading true on refresh to avoid flicker
      const response = await bookingService.getById(id);
      if (response.success) {
        const data = { ...response.data };

        // If this booking belongs to an independent worker request, redirect to multi-worker tracking hub or request details
        const parentId = data.parentRequestId || data.workerRequestId;
        const parentIdStr = typeof parentId === 'object' ? parentId?._id || parentId?.id : parentId;
        if (parentIdStr && (data.providerType === 'WORKER' || (data.bookingNumber && data.bookingNumber.startsWith('WRK-')))) {
          if (['journey_started', 'visited', 'in_progress', 'started'].includes(data.status?.toLowerCase())) {
            navigate(`/user/booking/${parentIdStr}/track`, { replace: true });
            return;
          }
        }

        // Calculate notional display values for plan_benefit
        if (data.paymentMethod === 'plan_benefit') {
          if (!data.tax) data.tax = (data.basePrice || 0) * 0.18;
          if (!data.visitingCharges && !data.visitationFee) data.visitingCharges = 49;
        }
        setBooking(data);
      } else {
        toastManager.error(response.message || 'Booking not found');
        navigate('/user/my-bookings', { replace: true });
      }
    } catch (error) {
      // Failed to load booking details
      // toastManager.error('Failed to load booking details'); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadBooking();
    }
  }, [id, navigate]);

  // Auto-show rating modal ONLY when booking is fully completed AND payment is settled
  useEffect(() => {
    if (booking) {
      const isCompleted = booking.status?.toLowerCase() === 'completed';
      const isPaid = ['success', 'paid', 'collected_by_vendor'].includes(booking.paymentStatus?.toLowerCase()) || booking.cashCollected === true;
      const isRated = !!booking.rating;
      const isDismissed = localStorage.getItem(`rating_dismissed_${id}`);

      // Show rating modal only if completed AND paid AND not yet rated or dismissed
      if (isCompleted && isPaid && !isRated && !isDismissed) {
        setShowRatingModal(true);
      }
    }
  }, [booking, id]);

  // Handle Payment Modal Visibility - Only auto-open ONCE per session AND if payment is PENDING
  useEffect(() => {
    // Check if payment is already done (success or collected)
    const isPaymentDone = booking?.paymentStatus === 'success' || booking?.cashCollected === true;
    const hasOtp = Boolean(booking?.customerConfirmationOTP || booking?.paymentOtp);

    // Open logic: 
    // 1. Has verification/payment OTP (Work is done)
    // 2. Payment is NOT done (Pending)
    // 3. Haven't shown modal automatically in this session yet
    const hasShown = booking ? sessionStorage.getItem(`payment_modal_shown_${booking._id}`) : false;

    if (booking && hasOtp && !isPaymentDone && !hasShown) {
      setShowPaymentModal(true);
      sessionStorage.setItem(`payment_modal_shown_${booking._id}`, 'true');
    }
    // Close logic:
    // If payment becomes done or OTP missing, close it.
    else if (!hasOtp || isPaymentDone) {
      setShowPaymentModal(false);
    }
  }, [booking]);

  // Socket Listener for Real-time Updates
  useEffect(() => {
    if (socket && id) {
      // Handler for booking updates
      const handleUpdate = (data) => {
        // Check if update relates to this booking
        if (data.bookingId === id || data.relatedId === id || data.data?.bookingId === id) {

          // Instant UI update for critical fields (status, OTPs, amounts)
          setBooking(prev => {
            if (!prev) return prev;
            const newData = { ...prev, ...(data.data || data) };

            // Calculate notional display values for plan_benefit
            if (newData.paymentMethod === 'plan_benefit') {
              if (!newData.tax) newData.tax = (newData.basePrice || 0) * 0.18;
              if (!newData.visitingCharges && !newData.visitationFee) newData.visitingCharges = 49;
            }
            return newData;
          });

          // Fetch full data to ensure consistency
          loadBooking();

          if (data.message) {
            toastManager.info(data.message, { 
              icon: '🔔',
              id: `booking_update:${id}:${data.status || data.message}`
            });
          }
        }
      };

      socket.on('booking_updated', handleUpdate);
      socket.on('notification', handleUpdate);

      return () => {
        socket.off('booking_updated', handleUpdate);
        socket.off('notification', handleUpdate);
      };
    }
  }, [socket, id]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'confirmed':
        return <FiCheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress':
      case 'journey_started':
        return <FiLoader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'visited':
        return <FiMapPin className="w-5 h-5 text-teal-600" />;
      case 'completed':
        return <FiCheckCircle className="w-5 h-5 text-green-600" />;
      case 'cancelled':
        return <FiXCircle className="w-5 h-5 text-red-500" />;
      case 'awaiting_payment':
      case 'work_done':
        return <FiClock className="w-5 h-5 text-orange-500" />;
      case 'requested':
      case 'searching':
        return <FiSearch className="w-5 h-5 text-amber-500 animate-pulse" />;
      default:
        return <FiClock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'in_progress':
      case 'journey_started':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'visited':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'completed':
        return 'bg-gray-50 text-gray-700 border-gray-200';
      case 'cancelled':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'awaiting_payment':
      case 'work_done':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'requested':
      case 'searching':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'confirmed': return 'Confirmed';
      case 'journey_started': return isAgri ? 'Equipment En Route' : 'Agent En Route';
      case 'visited': return isAgri ? 'Equipment Arrived' : 'Agent Arrived';
      case 'in_progress': return isAgri ? 'Equipment Working' : 'In Progress';
      case 'work_done': return 'Work Completed'; // Payment Pending
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'requested':
      case 'searching': {
        const isWorker = booking?.providerType === 'WORKER' || /labour|labor|worker|shramik|majdoor/i.test(booking?.serviceCategory || '');
        return isAgri ? 'Finding Driver' : (isWorker ? 'Finding Worker' : 'Finding Expert');
      }
      default: return status?.replace('_', ' ') || 'Pending';
    }
  };

  // ... (keep handle methods same) ...

  const handleCancelBooking = async () => {
    // Check if journey has started to determine if a fee applies
    const journeyStarted = ['journey_started', 'visited', 'in_progress'].includes(booking.status?.toLowerCase());
    const cancellationFee = booking.visitingCharges || 49;

    const modalTitle = journeyStarted ? 'Cancellation Fee Applies' : 'Cancel Booking';
    const modalMessage = journeyStarted
      ? `The service agent has already started their journey. Cancelling now will incur a fee of ₹${cancellationFee}, which will be deducted from your wallet or refund amount. Do you want to proceed?`
      : 'Are you sure you want to cancel this booking? You will receive a full refund if applicable. This action cannot be undone.';

    setConfirmDialog({
      isOpen: true,
      title: modalTitle,
      message: modalMessage,
      type: 'danger',
      onConfirm: async () => {
        try {
          const response = await bookingService.cancel(booking._id || booking.id, 'Cancelled by user');
          if (response.success) {
            toastManager.success('Booking cancelled successfully');
            loadBooking();
          } else {
            toastManager.error(response.message || 'Failed to cancel booking');
          }
        } catch (error) {
          toastManager.error('Failed to cancel booking. Please try again.');
        }
      }
    });
  };

  const handleWalletPayment = async () => {
    if (paying) return;
    try {
      setPaying(true);
      toastManager.info('Processing wallet payment...');
      const res = await paymentService.processWalletPayment(booking._id || booking.id);
      toastManager.dismiss();
      if (res.success) {
        toastManager.success('Payment successful via AgroYilt Wallet!');
        loadBooking();
      } else {
        toastManager.error(res.message || 'Wallet payment failed');
      }
    } catch (err) {
      toastManager.dismiss();
      toastManager.error(err.response?.data?.message || 'Wallet payment failed');
    } finally {
      setPaying(false);
    }
  };

  const handleOnlinePayment = async () => {
    if (paying) return;

    try {
      setPaying(true);
      toastManager.info('Creating payment order...');
      const orderResponse = await paymentService.createOrder(booking._id || booking.id);
      toastManager.dismiss();

      if (!orderResponse.success) {
        toastManager.error(orderResponse.message || 'Failed to create payment order');
        setPaying(false);
        return;
      }

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: Math.round(orderResponse.data.amount * 100),
        currency: orderResponse.data.currency || 'INR',
        order_id: orderResponse.data.orderId,
        name: 'Groo',
        description: `Payment for ${booking.serviceName}`,
        handler: async function (response) {
          toastManager.info('Verifying payment...');
          const verifyResponse = await paymentService.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });
          toastManager.dismiss();

          if (verifyResponse.success) {
            toastManager.success('Payment successful!');
            loadBooking();
          } else {
            toastManager.error('Payment verification failed');
          }
          setPaying(false);
        },
        modal: {
          onhighlight: function () { },
          ondismiss: function () {
            setPaying(false);
          }
        },
        prefill: {
          name: booking.userId?.name || 'User',
          contact: booking.userId?.phone || ''
        },
        theme: {
          color: themeColors.button
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      toastManager.dismiss();
      toastManager.error('Failed to process payment');
      setPaying(false);
    }
  };

  const handlePayAtHome = async () => {
    try {
      toastManager.info('Confirming request...');
      let response;
      const isWorkDoneOrDone = ['work_done', 'awaiting_payment', 'completed'].includes(booking?.status?.toLowerCase()) || Boolean(booking?.finalAmount);
      if (isWorkDoneOrDone || (booking.workerId && !booking.vendorId)) {
        response = await bookingService.selectOfflinePayment(booking._id || booking.id);
      } else {
        response = await paymentService.confirmPayAtHome(booking._id || booking.id);
      }
      toastManager.dismiss();

      if (response.success) {
        toastManager.success('Offline payment selected! Provide the OTP to complete cash payment.');
        loadBooking();
      } else {
        toastManager.error(response.message || 'Failed to confirm booking');
      }
    } catch (error) {
      toastManager.dismiss();
      toastManager.error('Failed to process request');
    }
  };

  const handleConfirmFinalAmount = async () => {
    if (!farmerFinalAmount || isNaN(farmerFinalAmount)) {
      toastManager.error('Please enter a valid amount');
      return;
    }
    const amount = Number(farmerFinalAmount);
    if (amount < (booking.minRate || 0) || amount > (booking.maxRate || Infinity)) {
      toastManager.error(`Amount must be between ₹${booking.minRate} and ₹${booking.maxRate}`);
      return;
    }

    try {
      setConfirmingAmount(true);
      const response = await bookingService.confirmFinalAmount(booking._id || booking.id, { finalAmount: amount });
      if (response.success) {
        toastManager.success('Final amount confirmed!');
        loadBooking();
      } else {
        toastManager.error(response.message || 'Failed to confirm amount');
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to confirm amount');
    } finally {
      setConfirmingAmount(false);
      setIsEditingAmount(false);
    }
  };


  const handleRateSubmit = async (ratingData) => {
    try {
      const response = await bookingService.addReview(booking._id || booking.id, ratingData);
      if (response.success) {
        toastManager.success('Thank you for your feedback!');
        setShowRatingModal(false);
        loadBooking();
      } else {
        toastManager.error(response.message || 'Failed to submit review');
      }
    } catch (error) {
      toastManager.error('Failed to submit review');
    }
  };


  const getAddressString = (address) => {
    if (typeof address === 'string') return address;
    if (address && typeof address === 'object') {
      return `${address.addressLine1 || ''}${address.addressLine2 ? `, ${address.addressLine2}` : ''}, ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}`;
    }
    return 'N/A';
  };

  const handleRaiseDispute = async (disputeData) => {
    try {
      const response = await disputeService.raiseDispute(disputeData);
      return response;
    } catch (err) {
      toastManager.error(err?.message || 'Failed to raise dispute');
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 pb-32">
        {/* Skeleton Header */}
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-gray-100">
          <div className="px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse"></div>
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
        </header>
        {/* Skeleton Body */}
        <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-24 animate-pulse"></div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-32 animate-pulse"></div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-48 animate-pulse"></div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-64 animate-pulse"></div>
        </main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center relative bg-white">
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
        </div>
        <div className="text-center relative z-10 px-6">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-6">
            <FiSearch className="w-10 h-10 text-gray-300" />
          </div>
          <p className="text-gray-500 font-bold">Booking not found</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-6 px-8 py-3 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all"
          >
            Go to My Bookings
          </button>
        </div>
      </div>
    );
  }

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

  // --- Payment Breakdown Calculations ---
  // Default values from booking (fallback)
  const isPlanBenefit = booking.paymentMethod === 'plan_benefit';
  const bill = booking.bill;

  // Base Logic (Services)
  // Use bill.originalServiceBase if available, else timer subtotal, else fallback to totalServiceBase, else booking.basePrice
  const hasServiceTimer = Boolean(
    booking.serviceTimer && (
      booking.serviceTimer.billingSummary?.subtotal ||
      (booking.serviceTimer.accumulatedActiveSeconds && booking.serviceTimer.accumulatedActiveSeconds > 0) ||
      booking.serviceTimer.status === 'COMPLETED'
    )
  );
  const timerBase = booking.serviceTimer?.billingSummary?.subtotal;

  const originalBase = bill 
    ? (bill.originalServiceBase || bill.totalServiceBase || 0) 
    : ((hasServiceTimer && timerBase) ? timerBase : (parseFloat(booking.basePrice) || 0));

  // Extra Services & Parts from vendor bill (if available)
  const allBillServices = bill?.services || [];
  const services = allBillServices.filter(s => !s.isOriginal);
  const originalServiceFromBill = allBillServices.find(s => s.isOriginal);
  const parts = bill?.parts || [];
  const customItems = bill?.customItems || [];

  let extraServiceBase = 0;
  let extraServiceGST = 0;
  services.forEach(s => {
    // s.price is UNIT BASE PRICE. s.total is INCLUSIVE.
    const qty = parseFloat(s.quantity) || 1;
    const base = (parseFloat(s.price) || 0) * qty;
    const gst = parseFloat(s.gstAmount) || 0;
    extraServiceBase += base;
    extraServiceGST += gst;
  });

  let partsBase = 0;
  let partsGST = 0;
  parts.forEach(p => {
    const qty = parseFloat(p.quantity) || 1;
    partsBase += ((parseFloat(p.price) || 0) * qty);
    partsGST += (parseFloat(p.gstAmount) || 0);
  });
  customItems.forEach(c => {
    const qty = parseFloat(c.quantity) || 1;
    partsBase += ((parseFloat(c.price) || 0) * qty);
    partsGST += (parseFloat(c.gstAmount) || 0);
  });

  // Use bill.originalGST if available, else fallback to totalGST
  const originalGST = bill ? (bill.originalGST || bill.totalGST || 0) : (originalBase * 0.18);
  const totalGST = originalGST + extraServiceGST + partsGST;

  const serviceGstPercent = bill
    ? (bill.payoutConfig?.serviceGstPercentage ?? bill.services?.[0]?.gstPercentage ?? 18)
    : 18;
  const partsGstPercent = bill
    ? (bill.payoutConfig?.partsGstPercentage ?? bill.parts?.[0]?.gstPercentage ?? bill.customItems?.[0]?.gstPercentage ?? 18)
    : 18;

  // Final Total
  const hasBill = !!bill;
  const finalTotal = bill?.grandTotal || (booking.finalAmount || booking.totalAmount || 0);

  // --------------------------------------

  return (
    <div className="min-h-screen pb-32 relative bg-white">
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
          <div className="flex items-center gap-4">
            {showCompletionExit ? (
              <button
                onClick={() => navigate('/user')}
                title="Go to Home"
                className="w-10 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
              >
                <FiHome className="w-5 h-5 text-white" />
              </button>
            ) : (
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/[0.02] active:scale-95 transition-all"
              >
                <FiArrowLeft className="w-5 h-5 text-gray-800" />
              </button>
            )}
            <div className="flex-1">
              <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Booking Details</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                ID: <span className="font-mono">{booking.bookingNumber || booking._id?.slice(-8).toUpperCase()}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>

        <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
          {/* Live Completion Countdown / Action Banner */}
          {showCompletionExit && (
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 rounded-3xl p-5 text-white shadow-xl shadow-emerald-900/10 space-y-3 relative overflow-hidden animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white shrink-0">
                    <FiCheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-base tracking-tight">Work Completed! 🎉</h3>
                    <p className="text-xs text-emerald-100 font-medium">
                      {autoRedirect ? (
                        <>Redirecting to Home in <span className="font-black text-white bg-white/20 px-1.5 py-0.5 rounded-md font-mono">{redirectCountdown}s</span></>
                      ) : 'Check the final amount below'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {autoRedirect && (
              <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-white h-full transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${(redirectCountdown / 5) * 100}%` }}
                />
              </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => navigate('/user')}
                  className="flex-1 py-2.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl font-black text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <FiHome className="w-4 h-4" />
                  Go to Home Now
                </button>
                <button
                  onClick={() => setStayOnPage(true)}
                  className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs border border-white/20 active:scale-95 transition-all"
                >
                  View Details
                </button>
              </div>
            </div>
          )}

          {/* Worker bookings: real work time (price is fixed). Machinery: live play/pause billing timer */}
          {booking.providerType === 'WORKER' ? (
            <div className="mb-4">
              <WorkerWorkTime workTime={booking.workTime} />
            </div>
          ) : (booking.serviceTimer || booking.equipmentId || booking.rental_type || ['in_progress', 'visited', 'completed'].includes(booking.status?.toLowerCase())) ? (
            <div className="mb-4">
              <LiveServiceTimer
                booking={booking}
                role="farmer"
                onStatusChange={loadBooking}
              />
            </div>
          ) : (
            <RentalTimer booking={booking} />
          )}


          {/* Visual Progress Stepper */}
          {['cancelled', 'rejected', 'vendor_rejected', 'timed_out'].includes(booking.status?.toLowerCase()) ? (
            <div className="bg-red-50 rounded-2xl p-5 border border-red-100 space-y-3">
              <div className="flex items-start gap-3 text-red-700">
                <FiXCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-black text-sm">Booking {booking.status.toLowerCase().replace('_', ' ')}</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    {booking.rejectionReason || 'The selected vendor was unable to take this booking.'}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                We never automatically switch vendors. You can pick another qualified available vendor for this work:
              </p>
              <button
                onClick={() => setShowReselectModal(true)}
                className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-700/25 transition-all cursor-pointer"
              >
                <FiRefreshCw size={13} />
                <span>Select Another Available Vendor</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="flex justify-between relative z-10">
                {/* Step 1: Booked */}
                <div className="flex flex-col items-center gap-2 w-1/4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${['pending', 'requested', 'searching', 'confirmed', 'assigned', 'journey_started', 'visited', 'in_progress', 'work_done', 'completed'].includes(booking.status?.toLowerCase())
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                    <FiCheckCircle className="w-4 h-4" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center">Booked</p>
                </div>

                {/* Step 2: Assigned / Handover Prep */}
                <div className="flex flex-col items-center gap-2 w-1/4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    ['assigned', 'journey_started', 'visited', 'in_progress', 'work_done', 'completed'].includes(booking.status?.toLowerCase()) ||
                    ((booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) && ['confirmed', 'accepted'].includes(booking.status?.toLowerCase())) ||
                    (['confirmed', 'accepted'].includes(booking.status?.toLowerCase()) && (booking.serviceCategory?.toLowerCase() === 'machinery' || booking.categoryTitle?.toLowerCase() === 'machinery'))
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                    2
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center">
                    {(booking.serviceCategory?.toLowerCase() === 'machinery' || booking.categoryTitle?.toLowerCase() === 'machinery' || booking.providerType === 'MACHINERY')
                      ? 'Dispatched'
                      : ((booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) ? 'Handover' : 'Assigned')}
                  </p>
                </div>

                {/* Step 3: In Progress */}
                <div className="flex flex-col items-center gap-2 w-1/4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${['journey_started', 'visited', 'in_progress', 'work_done', 'completed'].includes(booking.status?.toLowerCase())
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                    3
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center">
                    {(booking.serviceCategory?.toLowerCase() === 'machinery' || booking.categoryTitle?.toLowerCase() === 'machinery' || booking.providerType === 'MACHINERY')
                      ? 'Field Work'
                      : 'Started'}
                  </p>
                </div>

                {/* Step 4: Done */}
                <div className="flex flex-col items-center gap-2 w-1/4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${['work_done', 'completed'].includes(booking.status?.toLowerCase())
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                    4
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center">Completed</p>
                </div>
              </div>
              {/* Connect lines */}
              <div className="absolute top-[4.5rem] left-[15%] right-[15%] h-0.5 bg-gray-100 -z-0">
                <div className="h-full bg-teal-500 transition-all duration-1000" style={{
                  width:
                    ['work_done', 'completed'].includes(booking.status?.toLowerCase()) ? '100%' :
                      ['journey_started', 'visited', 'in_progress'].includes(booking.status?.toLowerCase()) ? '66%' :
                        (['assigned'].includes(booking.status?.toLowerCase()) || (['confirmed', 'accepted'].includes(booking.status?.toLowerCase()) && (booking.requiresDriver === false || booking.categoryId?.requiresDriver === false || booking.serviceCategory?.toLowerCase() === 'machinery'))) ? '33%' : '0%'
                }}></div>
              </div>
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center justify-center">
            <div className={`px-4 py-2 rounded-full flex items-center gap-2 shadow-sm border ${getStatusColor(booking.status)}`}>
              {getStatusIcon(booking.status)}
              <span className="text-xs font-black uppercase tracking-wider">{getStatusLabel(booking.status)}</span>
            </div>
          </div>

          {/* Targeted Vendor / Searching State Card */}
          {!booking.workerId && !booking.assignedTo && ['requested', 'searching'].includes(booking.status?.toLowerCase()) && (
            <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full -translate-y-16 translate-x-16 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity"></div>

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 shadow-sm">
                    <FiSearch className="w-6 h-6 text-amber-500 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 leading-tight">
                      {booking.vendorId ? 'Waiting for Vendor Confirmation' : 'Finding Your Expert'}
                    </h3>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">
                      {booking.vendorId ? 'Request Sent' : 'Search in Progress'}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-4 leading-relaxed font-medium">
                  {booking.vendorId ? (
                    <>Your booking request was sent directly to <span className="font-bold text-gray-900">{booking.vendorId?.businessName || booking.vendorId?.name || 'the selected vendor'}</span>. You will receive an immediate confirmation once they accept.</>
                  ) : (
                    <>We've sent your request to verified experts in your area. You'll be notified automatically as soon as someone accepts.</>
                  )}
                </p>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping"></span>
                    <span>{booking.vendorId ? 'Vendor has 15 minutes to respond' : 'Awaiting response...'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Service Partner Card */}
          {(booking.workerId || booking.assignedTo || booking.vendorId) && ['accepted', 'confirmed', 'assigned', 'journey_started', 'visited', 'in_progress', 'work_done'].includes(booking.status?.toLowerCase()) && (
            <div className="bg-white rounded-2xl p-3.5 shadow-[0_4px_16px_rgb(0,0,0,0.04)] border border-gray-100 transition-all hover:shadow-[0_4px_16px_rgb(0,0,0,0.08)]">
              <div className="flex justify-between items-center mb-3">
                {['accepted', 'confirmed', 'assigned', 'journey_started', 'visited', 'in_progress'].includes(booking.status?.toLowerCase()) ? (
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <p className="text-[10px] font-bold text-green-600 tracking-wider uppercase">TRACKING LIVE</p>
                  </div>
                ) : (
                  <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Your Partner</p>
                )}

                <button
                  onClick={() => navigate(`/user/booking/${booking._id || booking.id}/track`)}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
                >
                  Map View <FiChevronRight className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-gray-100 to-gray-50 shrink-0">
                  <div className="w-full h-full rounded-full overflow-hidden relative bg-white">
                    {(booking.workerId?.profileImage || booking.workerId?.profilePhoto || booking.assignedTo?.profileImage || booking.assignedTo?.profilePhoto || booking.vendorId?.profileImage || booking.vendorId?.profilePhoto) ? (
                      <>
                        <img
                          src={toAssetUrl(booking.workerId?.profileImage || booking.workerId?.profilePhoto || booking.assignedTo?.profileImage || booking.assignedTo?.profilePhoto || booking.vendorId?.profileImage || booking.vendorId?.profilePhoto)}
                          alt="Professional"
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.querySelector('.fallback-icon').style.display = 'block'; }}
                        />
                        <FiUser className="w-8 h-8 text-gray-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fallback-icon hidden" />
                      </>
                    ) : (
                      <FiUser className="w-8 h-8 text-gray-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-sm truncate">
                    {booking.workerId?.name || booking.assignedTo?.name || booking.vendorId?.name || 'Service Partner'}
                  </h3>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="flex items-center gap-0.5 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100">
                      <FiStar className="w-2.5 h-2.5 text-yellow-500 fill-current" />
                      <span className="text-[10px] font-bold text-yellow-700">
                        {(booking.workerId?.rating || booking.assignedTo?.rating || booking.vendorId?.rating || 0) > 0
                          ? (booking.workerId?.rating || booking.assignedTo?.rating || booking.vendorId?.rating).toFixed(1)
                          : 'New'}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      <FiCheckCircle className="w-2.5 h-2.5 text-emerald-600" />
                      Verified
                    </span>
                  </div>
                </div>

                {/* Quick Call Action */}
                {(booking.workerId?.phone || booking.assignedTo?.phone || booking.vendorId?.phone) && (
                  <a
                    href={`tel:${booking.workerId?.phone || booking.assignedTo?.phone || booking.vendorId?.phone}`}
                    className="w-8 h-8 bg-green-50 text-green-600 rounded-full flex items-center justify-center hover:bg-green-100 transition-colors active:scale-95 border border-green-100 shrink-0"
                  >
                    <FiPhone className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Arrival/Start OTP Card - Show during early stages until verified */}
          {(booking.arrivalOTP || booking.visitOtp || booking.driver_start_otp || (['confirmed', 'accepted'].includes(booking.status?.toLowerCase()) && (booking.requiresDriver === false || booking.categoryId?.requiresDriver === false))) && ['confirmed', 'accepted', 'assigned', 'journey_started', 'visited'].includes(booking.status?.toLowerCase()) && (
            <div className="relative overflow-hidden rounded-2xl shadow-md border border-blue-100 mb-4 active:scale-[0.99] transition-all">
              {/* Animated gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 opacity-95"></div>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)]"></div>

              <div className="relative z-10 p-4 flex flex-col items-center">
                {(() => {
                  // Logic to prioritize correct OTP
                  let otpValue = null;
                  let otpTitle = '';
                  let otpDesc = '';

                  if (booking.status?.toLowerCase() === 'journey_started' && booking.visitOtp) {
                    otpValue = booking.visitOtp;
                    otpTitle = 'Arrival OTP';
                    otpDesc = 'Share when professional arrives';
                  } else if (booking.driver_start_otp && ['visited', 'confirmed', 'accepted', 'assigned'].includes(booking.status?.toLowerCase())) {
                    otpValue = booking.driver_start_otp;
                    otpTitle = isAgri ? 'Start Service OTP' : ((booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) ? 'Handover OTP' : 'Verification OTP');
                    otpDesc = isAgri ? 'Share with operator to start field work & live timer' : ((booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) ? 'Share for equipment handover' : 'Share to start work');
                  } else {
                    otpValue = booking.arrivalOTP || booking.visitOtp || booking.driver_start_otp;
                    otpTitle = 'Verification OTP';
                    otpDesc = 'Share when professional reaches';
                  }

                  return (
                    <>
                      <div className="flex items-center gap-2.5 w-full mb-3">
                        <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
                          <FiMapPin className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white tracking-tight leading-tight">
                            {otpTitle}
                          </h3>
                          <p className="text-[10px] text-blue-100 font-medium leading-tight">
                            {otpDesc}
                          </p>
                        </div>
                      </div>

                      {/* OTP Display */}
                      <div className="flex justify-center gap-2 mb-3">
                        {(() => {
                          if (!otpValue) return (
                            <div className="py-1.5 px-3 bg-white/10 rounded-lg border border-white/20">
                              <p className="text-xs text-white font-bold animate-pulse">Generating code...</p>
                            </div>
                          );

                          return String(otpValue).split('').map((digit, idx) => (
                            <div
                              key={idx}
                              className="w-11 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border-2 border-white/40 shadow-md"
                            >
                              <span className="text-2xl font-black text-white drop-shadow-md">{digit}</span>
                            </div>
                          ));
                        })()}
                      </div>

                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          toastManager.info('Refreshing latest OTP...');
                          await loadBooking();
                        }}
                        className="flex items-center gap-1 text-[10px] text-white/90 hover:text-white mb-2.5 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all border border-white/20"
                      >
                        <FiRefreshCw className="w-3 h-3" />
                        <span className="font-semibold">Refresh Code</span>
                      </button>

                      <div className="w-full bg-white/10 backdrop-blur-md rounded-lg p-2 border border-white/20">
                        <div className="flex items-center justify-center gap-1.5 text-white text-[11px]">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.5)] shrink-0"></span>
                          <p className="font-medium text-center">
                            {isAgri 
                              ? (['journey_started', 'visited'].includes(booking.status?.toLowerCase())
                                  ? `${serviceLabel} & operator en route` 
                                  : `${serviceLabel} & operator ready to start`)
                              : ((booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) 
                                ? 'Ready for equipment handover' 
                                : 'Waiting for professional to arrive')}
                          </p>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Professional Arrived Notification - Only after OTP verified */}
          {booking?.status?.toLowerCase() === 'visited' && (
            <div className="relative overflow-hidden rounded-2xl shadow-md mb-3 active:scale-[0.98] transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-700 opacity-95"></div>
              <div className="relative z-10 p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
                  <FiCheckCircle className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Professional Arrived</h3>
                  <p className="text-[11px] text-teal-50 font-medium">Expert is at your location and starting the work.</p>
                </div>
              </div>
            </div>
          )}

          {/* Waiting for Vendor to initiate Payment */}
          {!booking.vendorBillId && !booking.customerConfirmationOTP && ['work_done'].includes(booking.status?.toLowerCase()) && !booking.cashCollected && booking.paymentStatus !== 'success' && (
            <div className="bg-white rounded-3xl p-6 shadow-lg border border-teal-100 mb-6 flex items-center gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 rounded-full -translate-y-12 translate-x-12 blur-2xl"></div>
              <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center shrink-0 border border-teal-100">
                <FiLoader className="w-6 h-6 text-teal-600 animate-spin" />
              </div>
              <div className="relative z-10">
                <h3 className="font-bold text-gray-900">Finalizing Bill</h3>
                <p className="text-sm text-gray-500">Professional is finalizing payment details. Please wait a moment...</p>
              </div>
            </div>
          )}

          {/* Plan Covered Card - Show for plan_benefit bookings (before OTP is sent) */}
          {(booking.paymentStatus === 'plan_covered' || (booking.paymentMethod === 'plan_benefit' && booking.paymentStatus !== 'success')) &&
            ['visited', 'in_progress', 'work_done', 'completed'].includes(booking.status?.toLowerCase()) &&
            !booking.customerConfirmationOTP && (
              <div className="relative overflow-hidden rounded-3xl shadow-lg border border-emerald-100 mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-600 to-green-700 opacity-95"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)]"></div>

                <div className="relative z-10 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                      <FiCheckCircle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white tracking-tight">
                        {booking.status?.toLowerCase() === 'work_done' ? 'Finalizing Bill' : 'Plan Benefit Active'}
                      </h3>
                      <p className="text-xs font-medium text-emerald-100">
                        {booking.status?.toLowerCase() === 'work_done' ? 'Vendor preparing final bill' : 'Base service covered by your plan'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                    <div className="flex items-center gap-3 mb-2">
                      <FiCheckCircle className="w-5 h-5 text-emerald-200" />
                      <span className="font-bold text-white">Base Service Covered</span>
                    </div>
                    <p className="text-sm text-emerald-100 leading-relaxed">
                      Your base service fee is covered by your membership plan. {booking.status?.toLowerCase() === 'work_done' ? 'The vendor is preparing the final bill for any additional charges.' : 'You may only need to pay for extra parts or services.'}
                    </p>
                  </div>

                  {booking.status?.toLowerCase() === 'work_done' && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-white/80">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <span className="text-xs font-medium">Waiting for vendor to finalize...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Worker bookings: what the farmer pays this worker, from the backend (same figure the worker collects) */}
          {booking.providerType === 'WORKER' && booking.farmerAmount && ['work_done', 'completed'].includes(booking.status?.toLowerCase()) && (
            <div className={`rounded-3xl border p-5 mb-4 flex items-center justify-between gap-3 ${
              booking.farmerAmount.status === 'paid' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  booking.farmerAmount.status === 'paid' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {booking.farmerAmount.status === 'paid' ? <FiCheckCircle className="w-5 h-5" /> : <span className="font-black">₹</span>}
                </div>
                <div className="min-w-0">
                  <p className={`font-black text-base ${booking.farmerAmount.status === 'paid' ? 'text-emerald-900' : 'text-amber-900'}`}>
                    {booking.farmerAmount.paymentMethod === 'cash'
                      ? (booking.farmerAmount.status === 'paid' ? 'Paid in cash' : 'Pay in cash')
                      : (booking.farmerAmount.status === 'paid' ? 'Paid online' : 'Payment pending')}
                  </p>
                  <p className="text-xs text-slate-600">
                    {booking.farmerAmount.paymentMethod === 'cash'
                      ? `To ${booking.workerId?.name || 'the worker'} · includes platform fee and extra time`
                      : 'Paid when you booked · see the breakdown below'}
                  </p>
                </div>
              </div>
              <span className={`text-2xl font-black shrink-0 ${booking.farmerAmount.status === 'paid' ? 'text-emerald-800' : 'text-amber-800'}`}>
                ₹{Number(booking.farmerAmount.total || 0).toLocaleString('en-IN')}
              </span>
            </div>
          )}

          {/* Payment Card - Show when work is done AND bill is finalized (OTP exists) or paid */}
          {booking.providerType !== 'WORKER' && (booking.vendorBillId || booking.customerConfirmationOTP || booking.paymentStatus === 'success' || booking.status?.toLowerCase() === 'completed') && ['work_done', 'completed'].includes(booking.status?.toLowerCase()) && !booking.cashCollected && (
            <div
              onClick={() => setShowPaymentModal(true)}
              className={`relative overflow-hidden rounded-3xl shadow-lg border cursor-pointer active:scale-[0.98] transition-all ${booking.paymentStatus === 'success' ? 'border-green-100' : 'border-orange-100'
                }`}>
              {/* Animated gradient background */}
              <div className={`absolute inset-0 opacity-95 ${booking.paymentStatus === 'success'
                ? 'bg-gradient-to-br from-green-500 via-green-600 to-emerald-700'
                : 'bg-gradient-to-br from-orange-500 via-orange-600 to-red-600'
                }`}></div>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)]"></div>

              <div className="relative z-10 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                    {booking.paymentStatus === 'success' ? (
                      <FiCheckCircle className="w-6 h-6 text-white" />
                    ) : (
                      <FaRupeeSign className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">
                      {booking.paymentStatus === 'success' ? (booking.providerType === 'WORKER' ? 'Payment Confirmed' : 'Payment Received') : 'Final Payment'}
                    </h3>
                    <p className={`text-xs font-medium ${booking.paymentStatus === 'success' ? 'text-green-50' : 'text-orange-100'}`}>
                      {booking.paymentStatus === 'success' ? (booking.providerType === 'WORKER' ? 'Worker job payment confirmed' : 'Transaction verified successfully') : 'Final amount after service completion'}
                    </p>
                  </div>
                </div>

                {/* Action Button for Online Payment - Only show if not paid */}
                {!isPaid && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowPaymentModal(true); }}
                      className="w-full py-4 mb-4 bg-white text-orange-600 rounded-2xl font-black text-sm shadow-xl hover:bg-orange-50 active:scale-95 transition-all flex items-center justify-center gap-2 group cursor-pointer"
                    >
                      <FaRupeeSign className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                      Pay Now
                      <FiChevronRight className="w-4 h-4" />
                    </button>

                    {(booking.customerConfirmationOTP || booking.paymentOtp) && (
                      <div className="flex flex-col items-center mb-6">
                        <p className="text-[10px] font-bold text-orange-100 uppercase tracking-[0.2em] mb-3 opacity-90">Cash Payment Verification Code</p>
                        <div className="flex justify-center gap-2">
                          {String(booking.customerConfirmationOTP || booking.paymentOtp || '0000').split('').map((digit, idx) => (
                            <div
                              key={idx}
                              className="w-12 h-14 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/30 shadow-lg"
                            >
                              <span className="text-2xl font-black text-white">{digit}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-orange-50 mt-3 font-medium bg-black/10 px-3 py-1 rounded-full backdrop-blur-sm">
                          Share this code with the operator / vendor ONLY when paying cash
                        </p>
                      </div>
                    )}
                  </>
                )}

                <div className={`backdrop-blur-sm rounded-xl p-4 border ${booking.paymentStatus === 'success' ? 'bg-white/10 border-white/10' : 'bg-white/15 border-white/20'
                  }`}>
                  <div className="flex items-center gap-3 text-white">
                    {booking.paymentStatus === 'success' ? (
                      <FiCheckCircle className="w-5 h-5 text-green-200" />
                    ) : (
                      <FiClock className="w-5 h-5 text-orange-200" />
                    )}
                    <div className="text-sm">
                      {booking.paymentStatus === 'success'
                        ? (
                          booking.paymentMethod === 'plan_benefit'
                            ? <p className="font-medium">Covered by your Membership Plan</p>
                            : <p className="font-medium">{booking.providerType === 'WORKER' ? 'Worker payment was sent at booking time.' : 'Booking completed successfully. Thank you for choosing us!'}</p>
                        )
                        : <p className="font-medium">Total Amount: <span className="text-lg font-black ml-1">₹{(booking.finalAmount || booking.totalAmount || 0).toLocaleString('en-IN')}</span></p>
                      }
                      {booking.paymentStatus !== 'success' && <p className="text-[10px] text-orange-100 mt-0.5 opacity-80">Pay online above or prepare cash for the professional.</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════ AGRICULTURE: TRIP FLOW DETAILS (KM Photos) ══════ */}
          {(booking.start_kilometer_photo || booking.end_kilometer_photo) && (
            <section className="bg-white rounded-3xl p-6 shadow-[0_8px_30_rgb(0,0,0,0.04)] border border-gray-100 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 uppercase tracking-wider">
                <FiCamera className="text-teal-600" />
                {(booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) ? 'Handover Evidence' : 'Equipment Trip Evidence'}
              </h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Arrival / Handover Photo */}
                {booking.start_kilometer_photo && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">
                      {(booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) ? 'Handover Photo' : 'Arrival KM Photo'}
                    </p>
                    <div className="aspect-square rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 group relative">
                      <img
                        src={booking.start_kilometer_photo.startsWith('http') ? booking.start_kilometer_photo : toAssetUrl(booking.start_kilometer_photo)}
                        alt="Start Photo"
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                        onClick={() => window.open(booking.start_kilometer_photo.startsWith('http') ? booking.start_kilometer_photo : toAssetUrl(booking.start_kilometer_photo), '_blank')}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">View Full</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Completion / Return Photo */}
                {booking.end_kilometer_photo && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">
                      {(booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) ? 'Return Photo' : 'Completion KM Photo'}
                    </p>
                    <div className="aspect-square rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 group relative">
                      <img
                        src={booking.end_kilometer_photo.startsWith('http') ? booking.end_kilometer_photo : toAssetUrl(booking.end_kilometer_photo)}
                        alt="End Photo"
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                        onClick={() => window.open(booking.end_kilometer_photo.startsWith('http') ? booking.end_kilometer_photo : toAssetUrl(booking.end_kilometer_photo), '_blank')}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">View Full</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Trip Summary if both photos exist */}
              {booking.start_kilometer_photo && booking.end_kilometer_photo && (
                <div className="bg-teal-50 rounded-xl p-3 flex items-center gap-3">
                  <FiCheckSquare className="text-teal-600 w-5 h-5 shrink-0" />
                  <p className="text-[11px] font-medium text-teal-800">
                    {(booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) 
                      ? "The equipment's handover and return have been documented with photos. Please verify the condition."
                      : "The equipment's usage has been verified via KM photos. You can raise a dispute if you notice any discrepancy."
                    }
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Agriculture Completion OTP - Share only when work is done */}
          {['in_progress', 'work_done'].includes(booking.status?.toLowerCase()) && booking.driver_end_otp && (
            <div className="bg-gradient-to-br from-teal-600 to-emerald-700 rounded-2xl p-4 shadow-md relative overflow-hidden mb-4">
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-10 translate-x-10 blur-xl"></div>

              <div className="relative z-10">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
                    <FiKey className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm text-white font-bold leading-tight">
                      {isAgri 
                        ? 'Field Service Completion OTP' 
                        : ((booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) ? 'Return Verification' : 'Completion Verification')}
                    </h3>
                    <p className="text-teal-50 text-[10px] font-medium opacity-80 uppercase tracking-wider leading-tight">
                      {isAgri ? 'Service End OTP' : ((booking.requiresDriver === false || booking.categoryId?.requiresDriver === false) ? 'Return OTP' : 'Verification OTP')}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 justify-center mb-3">
                  {String(booking.driver_end_otp).split('').map((digit, idx) => (
                    <div key={idx} className="w-11 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/30">
                      <span className="text-2xl font-black text-white">{digit}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-center mb-2">
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      toastManager.info('Refreshing completion OTP...');
                      await loadBooking();
                    }}
                    className="flex items-center gap-1 text-[10px] text-white/90 hover:text-white px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all border border-white/20"
                  >
                    <FiRefreshCw className="w-3 h-3" />
                    <span className="font-semibold">Refresh Code</span>
                  </button>
                </div>

                <p className="text-center text-[10px] text-teal-100 font-medium bg-black/10 rounded-lg py-1.5 px-2.5 border border-white/5 leading-relaxed">
                  {isAgri
                    ? `Share with the ${serviceLabel.toLowerCase()} operator ONLY after field work finishes to stop the live timer.`
                    : ((booking.requiresDriver === false || booking.categoryId?.requiresDriver === false)
                        ? "Share ONLY after equipment is returned and you've verified its condition."
                        : "Share ONLY after equipment has finished and you've verified the work.")
                  }
                </p>
              </div>
            </div>
          )}

          {/* Location & Time Section */}
          <section className="space-y-4">
            {/* Map Preview - Improved overlay for better usability */}
            {booking.address && (
              <>
                <div className="group relative rounded-3xl overflow-hidden shadow-sm border border-gray-200 bg-gray-100 h-48">
                  {(() => {
                    let mapQuery = '';
                    if (typeof booking.address === 'object' && booking.address.lat && booking.address.lng) {
                      mapQuery = `${booking.address.lat},${booking.address.lng}`;
                    } else {
                      const addrStr = typeof booking.address === 'string'
                        ? booking.address
                        : `${booking.address?.addressLine1 || ''}, ${booking.address?.city || ''}`;
                      mapQuery = encodeURIComponent(addrStr);
                    }
                    return (
                      <iframe
                        className="w-full h-full opacity-80 group-hover:opacity-100 transition-opacity"
                        frameBorder="0"
                        style={{ border: 0, pointerEvents: 'none' }}
                        src={`https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`}
                        allowFullScreen
                        tabIndex="-1"
                        title="Location"
                      />
                    )
                  })()}

                  {/* Floating Info */}
                  <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
                    <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-sm border border-white/50 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59₹30,246,0.5)]"></span>
                      <span className="text-xs font-bold text-gray-700">Destination</span>
                    </div>
                  </div>

                  {/* Track Button Overlay - Always visible but distinct */}
                  <div className="absolute inset-0 flex items-center justify-center bg-transparent pointer-events-none">
                    <div className="pointer-events-auto bg-white text-gray-900 px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all border border-gray-100" onClick={() => navigate(`/user/booking/${booking.parentRequestId || booking._id || booking.id}/track`)}>
                      <FiMapPin className="w-4 h-4 text-red-500" /> View on Map
                    </div>
                  </div>
                </div>

                {/* Dedicated Track Button */}
                {['confirmed', 'assigned', 'journey_started', 'visited', 'in_progress'].includes(booking.status?.toLowerCase()) && (
                  <button
                    onClick={() => navigate(`/user/booking/${booking.parentRequestId || booking._id || booking.id}/track`)}
                    className="w-full py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-2xl font-bold shadow-lg shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-3 hover:shadow-xl"
                  >
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <FiMapPin className="w-4 h-4 text-white" />
                    </div>
                    Track Service Agent
                  </button>
                )}
              </>
            )}

            <div className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center shrink-0">
                  <FiMapPin className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">Service Address</p>
                  <p className="text-sm font-medium text-gray-900 leading-relaxed">{getAddressString(booking.address)}</p>
                </div>
              </div>
              <div className="w-full h-px bg-gray-50 mb-4"></div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <FiCalendar className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">Slot</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(booking.scheduledDate)}
                  </p>
                  <p className="text-sm text-gray-500">{booking.scheduledTime || booking.timeSlot?.start || 'N/A'}</p>

                  {/* Rental Type Details */}
                  {booking.rental_type && booking.rental_type !== 'hourly' && (
                    <div className="mt-2 space-y-1">
                      <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                        {booking.rental_type === 'daily' ? 'Daily Rental' : booking.rental_type === 'land_based' ? 'Land Based' : booking.rental_type === 'monthly' ? 'Monthly Rental' : booking.rental_type}
                      </span>
                      {booking.rental_type === 'daily' && booking.estimatedDuration && (
                        <p className="text-sm font-semibold text-gray-700">
                          📅 {booking.estimatedDuration} Day{booking.estimatedDuration > 1 ? 's' : ''}
                          {booking.endDate ? (
                            <span className="text-gray-500"> · Ends {new Date(booking.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          ) : booking.scheduledDate && booking.estimatedDuration > 1 ? (() => {
                            const end = new Date(booking.scheduledDate);
                            end.setDate(end.getDate() + Number(booking.estimatedDuration) - 1);
                            return <span className="text-gray-500"> · Ends {end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>;
                          })() : null}
                        </p>
                      )}
                      {booking.rental_type === 'monthly' && (
                        <p className="text-sm font-semibold text-gray-700">
                          📅 1 Month
                          {booking.endDate && (
                            <span className="text-gray-500"> · Ends {new Date(booking.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          )}
                        </p>
                      )}
                      {booking.rental_type === 'land_based' && booking.landSize && (
                        <p className="text-sm font-semibold text-gray-700">🗺️ Area: {booking.landSize}</p>
                      )}
                      {booking.cropType && (
                        <p className="text-xs text-gray-500">🌾 Crop: {booking.cropType}</p>
                      )}
                    </div>
                  )}
                  {booking.rental_type === 'hourly' && booking.estimatedDuration && (
                    <p className="text-sm font-semibold text-gray-700 mt-1">⏱ {booking.estimatedDuration} Hour{booking.estimatedDuration > 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Service Details */}
          <section className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 bg-gray-50/50">
              <h3 className="font-bold text-gray-900">Order Summary</h3>
            </div>

            <div className="p-5 space-y-4">
              {/* 1. Service Category */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0 border border-teal-100 overflow-hidden">
                  {booking.categoryIcon ? (
                    <img src={booking.categoryIcon} alt="" className="w-6 h-6 object-contain" />
                  ) : (
                    <FiPackage className="w-5 h-5 text-teal-400" />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Service Category</p>
                  <p className="text-sm font-bold text-gray-800">{booking.serviceCategory || booking.serviceName || 'Service'}</p>
                </div>
              </div>

              {/* 2. Brand */}
              {(() => {
                const brandName = booking.brandName || booking.bookedItems?.[0]?.brandName;
                const brandIcon = booking.brandIcon || booking.bookedItems?.[0]?.brandIcon;
                if (!brandName) return null;
                return (
                  <div className="flex items-center gap-3 pt-3 border-t border-dashed border-gray-100">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                      {brandIcon ? (
                        <img src={brandIcon} alt={brandName} className="w-7 h-7 object-contain" />
                      ) : (
                        <span className="text-lg font-black text-slate-400">{brandName.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brand</p>
                      <p className="text-sm font-bold text-gray-800">{brandName}</p>
                    </div>
                  </div>
                );
              })()}

              {/* 3. Service Cards */}
              {booking.bookedItems && booking.bookedItems.length > 0 && (
                <div className="pt-3 border-t border-dashed border-gray-100 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Services Booked</p>
                  {booking.bookedItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start bg-gray-50 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">×{item.quantity}</span>
                          <span className="text-sm font-semibold text-gray-900 truncate">{item.card?.title || 'Service'}</span>
                        </div>
                        {item.card?.subtitle && <p className="text-xs text-gray-400 mt-0.5 ml-8 line-clamp-1">{item.card.subtitle}</p>}
                        {item.card?.duration && <p className="text-xs text-gray-400 mt-0.5 ml-8">⏱ {item.card.duration}</p>}
                        
                        {/* Dynamic Agri & Rental Info */}
                        {booking.rental_type && (
                          <div className="ml-8 mt-2 space-y-1">
                            <span className="text-[10px] font-black tracking-widest uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 inline-block mb-1">
                              {booking.rental_type.replace('_', ' ')}
                            </span>
                            
                            {booking.rental_type === 'land_based' && booking.landSize && (
                              <p className="text-xs text-gray-500 font-medium">Area: <span className="text-gray-900 font-bold">{booking.landSize}{typeof booking.landSize === 'string' && booking.landSize.match(/[a-zA-Z]/) ? '' : ' Acres'}</span></p>
                            )}
                            
                            {booking.rental_type === 'hourly' && booking.estimatedDuration && (
                              <p className="text-xs text-gray-500 font-medium">Duration: <span className="text-gray-900 font-bold">{booking.estimatedDuration} Hours</span></p>
                            )}
                            
                            {/* Days parameter is sometimes mapped to estimatedDuration logic based on the rentalt type */}
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
              )}
            </div>
          </section>

          {/* Payment Summary - Professional Card */}
          <section className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                <div className={`p-2 rounded-lg ${booking.paymentMethod === 'plan_benefit' ? 'bg-amber-100' : 'bg-green-50'}`}>
                  {booking.paymentMethod === 'plan_benefit' ? (
                    <FiAward className="w-5 h-5 text-amber-600" />
                  ) : (
                    <FaRupeeSign className="w-5 h-5 text-green-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">
                    {booking.paymentMethod === 'plan_benefit' ? 'Membership Benefit' : 'Payment Summary'}
                  </h3>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                {hasBill ? (
                  // NEW DETAILED BREAKDOWN
                  <div className="space-y-4">
                    {/* Services Section */}
                    <div>
                      <h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                        <FiCheckCircle className="w-3.5 h-3.5" /> Services
                      </h4>
                      <div className="space-y-2 pl-1">
                        {/* Original Base */}
                        <div className="flex justify-between items-center text-gray-600">
                          <span>
                            Original Booking : {
                              originalServiceFromBill?.name ||
                              (booking.serviceTimer?.billingSummary
                                ? `${booking.serviceName || 'Machinery Service'} (${booking.serviceTimer.billingSummary.totalActiveMinutes} Mins Work, ${booking.serviceTimer.billingSummary.totalPausedMinutes || 0} Mins Downtime Free)`
                                : (booking.serviceName || 'Service')
                              )
                            }
                          </span>
                          {isPlanBenefit ? (
                            <div className="flex items-center gap-2">
                              <span className="line-through text-gray-400 text-xs">₹{originalBase.toLocaleString('en-IN')}</span>
                              <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">FREE</span>
                            </div>
                          ) : (
                            <span className="font-medium text-gray-900">₹{originalBase.toLocaleString('en-IN')}</span>
                          )}
                        </div>

                        {/* Extra Services */}
                        {services.map((s, i) => (
                          <div key={i} className="flex justify-between items-center text-gray-600">
                            <span>{s.name} <span className="text-gray-400 text-xs">x{s.quantity}</span></span>
                            <span className="font-mono text-xs">₹{((parseFloat(s.price) || 0) * (parseFloat(s.quantity) || 1)).toFixed(2)}</span>
                          </div>
                        ))}

                        {/* Service GST */}
                        <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                          <span>GST ({serviceGstPercent}%)</span>
                          <span className="font-mono">₹{(originalGST + extraServiceGST).toFixed(2)}</span>
                        </div>

                        {/* Service Subtotal */}
                        <div className="flex justify-between font-bold text-gray-800 pt-1">
                          <span>Total Service</span>
                          <span>₹{(originalBase + extraServiceBase + originalGST + extraServiceGST).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Parts Section */}
                    {(parts.length > 0 || customItems.length > 0) && (
                      <div>
                        <h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 mt-4">
                          <FiPackage className="w-3.5 h-3.5 text-orange-500" /> Parts & Material
                        </h4>
                        <div className="space-y-2 pl-1">
                          {parts.map((p, i) => (
                            <div key={`p-${i}`} className="flex justify-between items-center text-gray-600">
                              <span>{p.name} <span className="text-gray-400 text-xs">x{p.quantity}</span></span>
                              <span className="font-mono text-xs">₹{(p.price * p.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                          {customItems.map((c, i) => (
                            <div key={`c-${i}`} className="flex justify-between items-center text-gray-600">
                              <div>
                                <span>{c.name} <span className="text-gray-400 text-xs">x{c.quantity}</span></span>
                                {c.hsnCode && <span className="block text-[9px] text-gray-400">HSN: {c.hsnCode}</span>}
                              </div>
                              <span className="font-mono text-xs">₹{(c.price * c.quantity).toFixed(2)}</span>
                            </div>
                          ))}

                          {/* Parts GST */}
                          <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                            <span>GST ({partsGstPercent}%)</span>
                            <span className="font-mono">₹{partsGST.toFixed(2)}</span>
                          </div>

                          {/* Parts Subtotal */}
                          <div className="flex justify-between font-bold text-gray-800 pt-1">
                            <span>Total Parts</span>
                            <span>₹{(partsBase + partsGST).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visiting Charges */}
                    {(booking.visitingCharges > 0 || bill?.visitingCharges > 0) && (
                      <div className="mt-4 pt-2 border-t border-gray-100">
                        <div className="flex justify-between text-xs font-bold text-gray-600">
                          <span className="flex items-center gap-2 uppercase tracking-wide">
                            <FiClock className="w-3.5 h-3.5 text-blue-400" /> Visiting Charges
                          </span>
                          <span className="font-mono">₹{(bill?.visitingCharges || booking.visitingCharges || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* Transport Charges */}
                    {bill?.transportCharges > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="flex justify-between text-xs font-bold text-gray-600">
                          <span className="flex items-center gap-2 uppercase tracking-wide">
                            <FiPackage className="w-3.5 h-3.5 text-blue-400" /> Transport Charges
                          </span>
                          <span className="font-mono">₹{(bill.transportCharges).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    <div className="pt-4 mt-2 border-t-2 border-gray-100 flex justify-between items-center">
                      <span className="font-bold text-gray-900 text-lg">Grand Total</span>
                      <span className="font-black text-teal-700 text-2xl">
                        ₹{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ) : booking.paymentSummary?.bill ? (
                  // INDEPENDENT WORKER BOOKING - line-by-line bill from the backend (same figures the workers see)
                  <WorkerPaymentBill bill={booking.paymentSummary.bill} />
                ) : (booking.providerType === 'WORKER' || booking.paymentSummary || booking.workerRequestId || (booking.bookingNumber && booking.bookingNumber.startsWith('WRK-'))) ? (
                  // INDEPENDENT WORKER BOOKING - AUTHORITATIVE FARMER PAYMENT BREAKDOWN
                  <div className="space-y-3.5">
                    {/* Selected Workers */}
                    <div className="flex justify-between items-center text-gray-700">
                      <span className="font-medium text-sm">Workers Selected</span>
                      <span className="font-bold text-gray-900 bg-gray-100 px-2.5 py-0.5 rounded-full text-xs">
                        {booking.paymentSummary?.selectedWorkerCount || 1}
                      </span>
                    </div>

                    {/* Maximum Rate per Worker */}
                    <div className="flex justify-between items-center text-gray-700">
                      <span className="font-medium text-sm">Maximum Rate / Worker</span>
                      <span className="font-bold text-gray-900">
                        ₹{(booking.paymentSummary?.maxRatePerWorker || booking.maxRate || booking.agreedRate || booking.finalAmount || 0).toLocaleString('en-IN')}
                        <span className="text-xs text-gray-400 font-normal ml-1">/{booking.rateUnit || 'day'}</span>
                      </span>
                    </div>

                    {/* Worker Payment Reserve */}
                    <div className="flex justify-between items-center text-gray-700">
                      <div>
                        <span className="font-medium text-sm">Worker Payment Reserve</span>
                        <span className="block text-[11px] text-gray-400">
                          ₹{(booking.paymentSummary?.maxRatePerWorker || booking.maxRate || 0).toLocaleString('en-IN')} × {booking.paymentSummary?.selectedWorkerCount || 1}
                        </span>
                      </div>
                      <span className="font-bold text-gray-900">
                        ₹{(booking.paymentSummary?.workerReserveAmount || (booking.paymentSummary?.maxRatePerWorker || 0) * (booking.paymentSummary?.selectedWorkerCount || 1)).toLocaleString('en-IN')}
                      </span>
                    </div>

                    {/* Platform Fee */}
                    <div className="flex justify-between items-center text-gray-600">
                      <span className="text-sm">Platform Fee</span>
                      <span className="font-medium text-gray-900">
                        +₹{(booking.paymentSummary?.platformFeeAmount || booking.platformFeeAmount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-dashed border-gray-200 my-2" />

                    {/* Total Paid (Upfront) */}
                    <div className="flex justify-between items-center bg-teal-50/60 p-3 rounded-2xl border border-teal-100">
                      <div>
                        <span className="font-bold text-teal-900 text-sm block">Total Initial Paid</span>
                        <span className="text-[10px] text-teal-700 font-medium">Reserve + Platform Fee</span>
                      </div>
                      <span className="text-xl font-black text-teal-700">
                        ₹{(booking.paymentSummary?.totalPaidAmount || booking.farmerPaidAmount || booking.totalAmount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>

                    {/* ── TIME EXTENSION BREAKDOWN (If extensions exist) ── */}
                    {(() => {
                      const extSum = booking.paymentSummary?.extensionsSummary;
                      const hasExt = Boolean(extSum?.hasExtension || (booking.confirmedExtensions && booking.confirmedExtensions.length > 0));
                      if (!hasExt) return null;

                      const totalExtMins = extSum?.totalExtensionMinutes || 0;
                      const totalExtDays = extSum?.totalAdditionalDays || 0;
                      const durationLabel = totalExtDays > 0 ? `+${totalExtDays} Day(s)` : `+${totalExtMins} Mins`;
                      const extGross = extSum?.totalExtensionGrossAmount || 0;
                      const extFee = extSum?.totalExtensionPlatformFee || 0;
                      const extTotalPaid = extSum?.totalExtensionPaidAmount || (extGross + extFee);

                      return (
                        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 space-y-2.5 mt-2">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1.5">
                              <FiClock className="w-4 h-4 text-amber-600" />
                              <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                                Time Extension Added
                              </span>
                            </div>
                            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                              {durationLabel}
                            </span>
                          </div>

                          <div className="space-y-1.5 text-xs text-amber-950 pt-1 border-t border-amber-200/60">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Worker Extension Pay:</span>
                              <span className="font-bold text-gray-900">₹{Number(extGross).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Extension Platform Fee:</span>
                              <span className="font-medium text-gray-900">+₹{Number(extFee).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-amber-200 font-bold">
                              <span className="text-amber-900">Total Extension Paid:</span>
                              <span className="text-sm font-black text-amber-800">₹{Number(extTotalPaid).toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Post-Completion Breakdown: Actual Worker Amount & Refund */}
                    {(() => {
                      const isExpired = (booking.status || '').toLowerCase() === 'expired';
                      const isCancelled = ['cancelled', 'rejected'].includes((booking.status || '').toLowerCase());
                      const isTerminal = isExpired || isCancelled;
                      const wasPaid = ['paid', 'success', 'PAID', 'SUCCESS'].includes(
                        booking.paymentStatus || booking.paymentSummary?.paymentStatus || ''
                      );

                      if (isTerminal && !wasPaid) {
                        return (
                          <div className="pt-2 space-y-2.5">
                            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2.5">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-xs text-gray-700 uppercase tracking-wide">
                                  {isExpired ? 'Booking Expired' : 'Booking Cancelled'}
                                </span>
                                <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-gray-200 text-gray-700 border border-gray-300">
                                  {isExpired ? 'Expired' : 'Cancelled'}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs text-gray-600 pt-1.5 border-t border-gray-200/60">
                                <span>Actual Worker Settlement:</span>
                                <span className="font-bold text-gray-800">₹0 (No work performed)</span>
                              </div>
                              <div className="flex justify-between items-center text-xs text-gray-600">
                                <span>Payment Charged:</span>
                                <span className="font-bold text-gray-800">₹0 (Unpaid)</span>
                              </div>
                              <p className="text-[11px] text-gray-500 leading-relaxed pt-1.5 border-t border-gray-200/60">
                                {isExpired
                                  ? 'This booking expired before confirmation. No payment was deducted from your account or wallet.'
                                  : 'This booking was cancelled. No payment was deducted from your account or wallet.'}
                              </p>
                            </div>
                          </div>
                        );
                      }

                      if (isTerminal && wasPaid) {
                        const refundVal = Number(booking.paymentSummary?.refundAmount ?? (booking.paymentSummary?.totalPaidAmount || booking.finalAmount || booking.totalAmount || 0));
                        return (
                          <div className="pt-2 space-y-2.5">
                            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 space-y-2.5">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Refund Status</span>
                                <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                                  booking.paymentSummary?.refundStatus === 'REFUNDED' || booking.refundCredited
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}>
                                  {booking.paymentSummary?.refundStatus === 'REFUNDED' || booking.refundCredited ? 'REFUNDED' : 'REFUND INITIATED'}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs text-gray-600 pt-1.5 border-t border-emerald-200/60">
                                <span>Actual Worker Settlement:</span>
                                <span className="font-bold text-gray-800">₹0 (No work performed)</span>
                              </div>
                              <div className="flex justify-between items-center text-xs text-gray-600">
                                <span>Refund Amount:</span>
                                <span className="font-black text-emerald-700 text-sm">
                                  ₹{refundVal.toLocaleString('en-IN')} (Full Refund)
                                </span>
                              </div>
                              <p className="text-[11px] text-emerald-700 leading-relaxed pt-1.5 border-t border-emerald-200/60">
                                {booking.paymentSummary?.refundStatus === 'REFUNDED' || booking.refundCredited
                                  ? 'The full payment has been refunded to your AgroYilt wallet.'
                                  : 'The full payment is being refunded to your AgroYilt wallet.'}
                              </p>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="pt-2 space-y-2.5">
                          {/* Actual Worker Amount */}
                          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 space-y-2">
                            <div className="flex justify-between items-center text-gray-700">
                              <div>
                                <span className="text-sm font-bold text-gray-900 block">Actual Worker Settlement</span>
                                {booking.paymentSummary?.extensionsSummary?.hasExtension && (
                                  <span className="text-[11px] text-gray-500">
                                    Base (₹{Number(booking.paymentSummary.extensionsSummary.baseActualWorkerAmount).toLocaleString('en-IN')}) + Extension (₹{Number(booking.paymentSummary.extensionsSummary.extensionWorkerAmount).toLocaleString('en-IN')})
                                  </span>
                                )}
                              </div>
                              <span className="font-black text-gray-900 text-base">
                                {booking.paymentSummary?.actualWorkerAmount !== null && booking.paymentSummary?.actualWorkerAmount !== undefined ? (
                                  `₹${Number(booking.paymentSummary.actualWorkerAmount).toLocaleString('en-IN')}`
                                ) : (
                                  <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                    Pending / Work In Progress
                                  </span>
                                )}
                              </span>
                            </div>

                            {booking.paymentSummary?.extensionsSummary?.hasExtension && (
                              <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-200/60 flex justify-between">
                                <span>Base Shift Actual Pay:</span>
                                <span className="font-semibold text-gray-700">₹{Number(booking.paymentSummary.extensionsSummary.baseActualWorkerAmount).toLocaleString('en-IN')}</span>
                              </div>
                            )}
                          </div>

                          {/* Refund Amount & Status */}
                          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Refund Status</span>
                              </div>
                              <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                                booking.paymentSummary?.refundStatus === 'REFUNDED'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : booking.paymentSummary?.refundStatus === 'PENDING'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-gray-100 text-gray-600 border-gray-200'
                              }`}>
                                {booking.paymentSummary?.refundStatus || (booking.refundCredited ? 'REFUNDED' : 'PENDING')}
                              </span>
                            </div>

                            <div className="flex justify-between items-center pt-1 border-t border-emerald-100">
                              <div>
                                <span className="text-sm font-bold text-emerald-900 block">Refund Amount</span>
                                <span className="text-[10px] text-emerald-700">
                                  Unused portion of initial worker reserve
                                </span>
                              </div>
                              <span className="text-base font-black text-emerald-700">
                                {booking.paymentSummary?.refundAmount !== null && booking.paymentSummary?.refundAmount !== undefined ? (
                                  `₹${Number(booking.paymentSummary.refundAmount).toLocaleString('en-IN')}`
                                ) : (
                                  <span className="text-xs font-medium text-emerald-600 italic">Pending Settlement</span>
                                )}
                              </span>
                            </div>

                            <p className="text-[10px] text-emerald-600 leading-tight">
                              {booking.paymentSummary?.refundStatus === 'REFUNDED'
                                ? 'Unused reserve has been credited to your AgroYilt wallet.'
                                : 'Unused worker reserve will be automatically credited to your wallet once work is completed.'}
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Payment Reference ID(s) */}
                    <div className="space-y-1 pt-1 text-xs text-gray-500">
                      {(booking.paymentSummary?.paymentReference || booking.paymentId) && (
                        <div className="flex justify-between items-center">
                          <span>Initial Payment Reference</span>
                          <span className="font-mono text-gray-700">{booking.paymentSummary?.paymentReference || booking.paymentId}</span>
                        </div>
                      )}
                      {booking.paymentSummary?.extensionsSummary?.items?.map((ext, idx) => (
                        ext.paymentReference && (
                          <div key={idx} className="flex justify-between items-center text-[11px]">
                            <span>Extension Payment Ref</span>
                            <span className="font-mono text-gray-700">{ext.paymentReference}</span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                ) : (
                  // OLD SIMPLE BREAKDOWN (Fallback - Vendor/Service flow)
                  <>
                    {/* Base Items */}
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Base Service Price</span>
                      {booking.paymentMethod === 'plan_benefit' ? (
                        <div className="flex items-center gap-2">
                          <span className="line-through text-gray-400 text-xs">₹{(booking.basePrice || 0).toLocaleString('en-IN')}</span>
                          <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE</span>
                        </div>
                      ) : (
                        <span className="font-medium text-gray-900">₹{(booking.basePrice || 0).toLocaleString('en-IN')}</span>
                      )}
                    </div>

                    {/* Attached Implements */}
                    {Array.isArray(booking.selectedImplements) && booking.selectedImplements.length > 0 && (
                      <div className="bg-emerald-50/70 rounded-xl p-2.5 border border-emerald-200/80 space-y-1.5 my-2">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Attached Implements (शामिल उपकरण)</span>
                        {booking.selectedImplements.map((impl, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-gray-700">
                            <span>🚜 {impl.name || impl.title || 'Implement'}</span>
                            <span className="font-mono font-medium text-emerald-800">
                              +₹{impl.pricing?.hourly?.price ? `${impl.pricing.hourly.price}/hr` : (impl.price || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {(booking.tax > 0 || booking.paymentMethod === 'plan_benefit') && (
                      <div className="flex justify-between items-center text-gray-600">
                        <span>
                          GST ({booking.basePrice - booking.discount > 0 
                            ? Math.round((booking.tax * 100) / (booking.basePrice - booking.discount)) 
                            : 18}%)
                        </span>
                        {booking.paymentMethod === 'plan_benefit' ? (
                          <div className="flex items-center gap-2">
                            <span className="line-through text-gray-400 text-xs">₹{(booking.tax || 0).toLocaleString('en-IN')}</span>
                            <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE</span>
                          </div>
                        ) : (
                          <span className="font-medium text-gray-900">₹{(booking.tax || 0).toLocaleString('en-IN')}</span>
                        )}
                      </div>
                    )}

                    <div className="flex justify-between items-center text-gray-600">
                      <span>Convenience Fee</span>
                      {booking.paymentMethod === 'plan_benefit' ? (
                        <div className="flex items-center gap-2">
                          <span className="line-through text-gray-400 text-xs">₹{(booking.visitingCharges || booking.visitationFee || 0).toLocaleString('en-IN')}</span>
                          <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE</span>
                        </div>
                      ) : (
                        <span className={`font-medium ${(booking.visitingCharges || booking.visitationFee || 0) === 0 ? 'text-gray-400 font-normal italic' : 'text-gray-900'}`}>
                          {(booking.visitingCharges || booking.visitationFee || 0) === 0 
                            ? 'Not Added' 
                            : `₹${(booking.visitingCharges || booking.visitationFee || 0).toLocaleString('en-IN')}`}
                        </span>
                      )}
                    </div>

                    {booking.paymentMethod !== 'plan_benefit' && booking.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600">Discount</span>
                        <span className="font-medium text-green-600">-₹{booking.discount.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    {booking.extraCharges && booking.extraCharges.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Extra Charges</p>
                        <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                          {booking.extraCharges.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-gray-700 text-sm">
                              <span className="flex items-center gap-2">
                                <span className="text-xs font-bold bg-white border px-1.5 rounded text-gray-500">x{item.quantity || 1}</span>
                                <span>{item.name}</span>
                              </span>
                              <span className="font-medium">+₹{(item.total || item.price || 0).toLocaleString('en-IN')}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold text-blue-600 pt-2 mt-2 border-t border-gray-200">
                            <span>Total Extras</span>
                            <span>+₹{(booking.extraChargesTotal || 0).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="pt-4 mt-2 border-t border-gray-100 flex justify-between items-center">
                      <span className="font-bold text-gray-900 text-lg">Total Bill</span>
                      <span className="font-black text-gray-900 text-xl">
                        ₹{(booking.paymentMethod === 'plan_benefit'
                          ? (booking.userPayableAmount || booking.extraChargesTotal || 0)
                          : (booking.finalAmount || booking.totalAmount || 0)
                        ).toLocaleString('en-IN')}
                      </span>
                    </div>

                    {Number(booking.advancePaidAmount) > 0 && (
                      <div className="flex justify-between text-sm pt-2 text-emerald-700">
                        <span className="font-medium">Advance Paid Online</span>
                        <span className="font-bold">-₹{Number(booking.advancePaidAmount).toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    {Number(booking.advancePaidAmount) > 0 && (booking.balanceDue > 0 || booking.paymentStatus === 'partial') && (
                      <div className="pt-2 mt-1 border-t border-dashed border-gray-200 flex justify-between items-center text-amber-900">
                        <span className="font-bold text-base">Remaining Balance Due</span>
                        <span className="font-black text-xl text-amber-600">
                          ₹{(booking.balanceDue !== undefined && booking.balanceDue !== null && Number(booking.balanceDue) > 0
                            ? Number(booking.balanceDue)
                            : Math.max(0, (Number(booking.finalAmount) || 0) - Number(booking.advancePaidAmount))
                          ).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Payment Status Footer */}
            <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Payment Status</span>
              <span className={`px-2.5 py-1 rounded-md text-xs font-bold capitalize ${booking.paymentStatus === 'success' ? 'bg-green-100 text-green-700' :
                booking.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-800' :
                booking.paymentStatus === 'pending' || booking.paymentStatus === 'plan_covered' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}>
                {booking.paymentStatus === 'success' ? 'Paid' :
                  booking.paymentStatus === 'partial' ? 'Partially Paid (Balance Due)' :
                  booking.paymentStatus === 'plan_covered' ? 'Processing Bill' :
                    booking.paymentStatus || 'Pending'}
              </span>
            </div>
          </section>

          {/* Action Card for Payment — shows when online payment is pending or bill is awaiting payment */}
          {booking.paymentStatus !== 'success' && booking.paymentMethod !== 'plan_benefit' && !['cancelled', 'rejected'].includes(booking.status) && (
            booking.status === 'awaiting_payment' || 
            booking.status === 'work_done' ||
            ['online', 'razorpay'].includes(booking.paymentMethod)
          ) && (
            <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 p-6 space-y-4">
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <FiDollarSign className="w-8 h-8 text-orange-600" />
                </div>
                <h3 className="text-lg font-bold text-black">
                  {booking.paymentStatus === 'partial' || (booking.advancePaidAmount > 0 && booking.balanceDue > 0)
                    ? 'Remaining Balance Due'
                    : 'Payment Required'}
                </h3>
                <p className="text-sm text-gray-500">
                  {booking.paymentStatus === 'partial' || (booking.advancePaidAmount > 0 && booking.balanceDue > 0)
                    ? `Service completed. Please pay the remaining balance of ₹${(booking.balanceDue || Math.max(0, (booking.finalAmount || 0) - (booking.advancePaidAmount || 0))).toLocaleString('en-IN')} to settle.`
                    : !booking.vendorId && booking.workerId
                    ? `The worker has completed the job. Pay ₹${(booking.finalAmount || booking.totalAmount || booking.basePrice || 0).toLocaleString('en-IN')} to settle.`
                    : 'The service is complete. Please choose a payment method to settle the bill.'}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleOnlinePayment}
                  disabled={paying}
                  className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
                  style={{ background: themeColors.button }}
                >
                  <FiDollarSign className="w-5 h-5" />
                  Pay Online (Razorpay/UPI) - ₹{(
                    booking.paymentStatus === 'partial' || (booking.advancePaidAmount > 0 && booking.balanceDue > 0)
                      ? (booking.balanceDue || Math.max(0, (booking.finalAmount || 0) - (booking.advancePaidAmount || 0)))
                      : (booking.finalAmount || booking.totalAmount || booking.basePrice || 0)
                  ).toLocaleString('en-IN')}
                </button>

                <button
                  onClick={handleWalletPayment}
                  disabled={paying}
                  className="w-full py-3.5 rounded-xl font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-2 active:scale-95 transition-transform hover:bg-emerald-100"
                >
                  <FiCheckSquare className="w-5 h-5 text-emerald-600" />
                  Pay with AgroYilt Wallet
                </button>

                <button
                  onClick={handlePayAtHome}
                  disabled={paying}
                  className="w-full py-3.5 rounded-xl font-bold text-gray-700 bg-gray-100 flex items-center justify-center gap-2 active:scale-95 transition-transform hover:bg-gray-200"
                >
                  <FiHome className="w-5 h-5" />
                  Pay Offline (Cash to Operator)
                </button>
              </div>
              
              {/* Show OTP for Offline / Cash Payment */}
              {(booking.customerConfirmationOTP || booking.paymentOtp) && (
                <div className="mt-4 p-4 bg-teal-50 border border-teal-200 rounded-2xl text-center">
                   <p className="text-sm font-bold text-teal-800 mb-1">Cash Payment Confirmation OTP</p>
                   <p className="text-xs text-teal-600 mb-2">Share this OTP with the operator / vendor ONLY after paying cash</p>
                   <div className="text-3xl tracking-[0.5em] font-black text-teal-600">{booking.customerConfirmationOTP || booking.paymentOtp}</div>
                </div>
              )}
            </div>
          )}

          {/* If farmer confirmed amount but work not done yet, show waiting message */}
          {false && ['visited', 'in_progress', 'journey_started'].includes(booking.status) && !booking.vendorId && booking.workerId && booking.finalAmount > 0 && !isEditingAmount && (
            <div className="bg-blue-50 border border-blue-200 rounded-3xl p-6 text-center">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <FiClock className="w-7 h-7 text-blue-600 animate-spin" style={{ animationDuration: '4s' }} />
              </div>
              <h3 className="text-base font-bold text-blue-800">Amount Confirmed ✓</h3>
              <p className="text-sm text-blue-600 mt-1 mb-4">
                You've confirmed <span className="font-black">₹{booking.finalAmount}</span>. Waiting for the worker to complete the job.
              </p>
              <button
                onClick={() => {
                  setFarmerFinalAmount(booking.finalAmount);
                  setIsEditingAmount(true);
                }}
                className="px-6 py-2 bg-white border border-blue-200 text-blue-600 font-bold rounded-xl shadow-sm hover:bg-blue-50 active:scale-95 transition-all text-sm flex items-center gap-2 mx-auto"
              >
                <FiEdit2 className="w-4 h-4" /> Edit Amount
              </button>
            </div>
          )}

          {/* Action Card for Confirming Final Amount (Independent Worker) */}
          {false && ['visited', 'in_progress', 'journey_started', 'accepted', 'confirmed'].includes(booking.status) && !booking.vendorId && booking.workerId && (!booking.finalAmount || isEditingAmount) && (
            <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 p-6 space-y-4">
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <FiCheckSquare className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-black">Confirm Final Amount</h3>
                <p className="text-sm text-gray-500">
                  Please discuss and confirm the final payable amount with the worker (must be between ₹{booking.minRate} and ₹{booking.maxRate}). This must be done before the worker completes the job.
                </p>
              </div>

              <div className="space-y-3">
                <input
                  type="number"
                  placeholder={`Amount (₹${booking.minRate} - ₹${booking.maxRate})`}
                  value={farmerFinalAmount}
                  onChange={(e) => setFarmerFinalAmount(e.target.value)}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 text-lg font-bold text-center"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleConfirmFinalAmount}
                    disabled={confirmingAmount}
                    className="flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform disabled:opacity-50"
                    style={{ background: themeColors.button }}
                  >
                    {confirmingAmount ? 'Confirming...' : 'Confirm Final Amount'}
                  </button>
                  {isEditingAmount && (
                    <button
                      onClick={() => setIsEditingAmount(false)}
                      className="px-6 py-4 rounded-xl font-bold text-gray-700 bg-gray-100 flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            {/* Support */}
            {/* Support */}
            <button
              onClick={() => {
                const phone = supportInfo.phone || '+919999999999';
                if (phone) {
                  // Use native anchor click for better WebView compatibility
                  const link = document.createElement('a');
                  link.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                } else {
                  toastManager.error('Support phone number not available');
                }
              }}
              className="col-span-1 flex flex-col items-center justify-center gap-2 p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors active:scale-95"
            >
              <FiPhone className="w-6 h-6 text-gray-700" />
              <span className="text-sm font-bold text-gray-700">Call Support</span>
            </button>
            <button
              onClick={() => {
                const email = supportInfo.email || 'help@groo.in';
                const link = document.createElement('a');
                link.href = `mailto:${email}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="col-span-1 flex flex-col items-center justify-center gap-2 p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors active:scale-95"
            >
              <FiMail className="w-6 h-6 text-gray-700" />
              <span className="text-sm font-bold text-gray-700">Email Help</span>
            </button>

            {/* Direct Support Request Link */}
            <button
              onClick={() => {
                const bNum = booking.bookingNumber || (booking._id || id).substring(0, 8);
                const title = booking.serviceName || 'Equipment Order';
                navigate(`/user/help-support?category=BOOKING&bookingNumber=${encodeURIComponent(bNum)}&bookingId=${id}&subject=${encodeURIComponent(`Help with booking #${bNum} (${title})`)}&openCreate=true`);
              }}
              className="col-span-2 p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-2xl hover:bg-emerald-100/70 transition-all active:scale-98 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <FiHelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-xs sm:text-sm font-bold text-emerald-950">Need Help with this Order?</span>
                  <span className="block text-[11px] text-emerald-700 font-medium">Submit quick support request or request callback</span>
                </div>
              </div>
              <FiChevronRight className="w-4 h-4 text-emerald-600 shrink-0" />
            </button>

            {/* Raise Dispute Button */}
            {['completed', 'work_done', 'cancelled'].includes(booking.status?.toLowerCase()) && (
              <button
                onClick={() => setShowDisputeModal(true)}
                className="col-span-2 py-4 rounded-2xl text-amber-600 font-bold text-sm bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-colors active:scale-95 flex items-center justify-center gap-2"
              >
                <FiAlertTriangle className="w-4 h-4" />
                Report Issue / Raise Dispute
              </button>
            )}

            {/* Cancel */}
            {!['cancelled', 'completed', 'work_done'].includes(booking.status?.toLowerCase()) && (
              <button
                onClick={handleCancelBooking}
                className="col-span-2 py-4 rounded-2xl text-red-600 font-bold text-sm bg-red-50 border border-red-100 hover:bg-red-100 transition-colors active:scale-95"
              >
                Cancel Booking
              </button>
            )}
          </div>

          {/* Rate & Review (Conditional) */}
          {/* Rate & Review (Conditional) */}
          <ReviewCard
            booking={booking}
            onWriteReview={() => setShowRatingModal(true)}
          />

        </main>

        {/* Rating Modal */}
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => {
            setShowRatingModal(false);
            localStorage.setItem(`rating_dismissed_${id}`, 'true');
          }}
          onSubmit={handleRateSubmit}
          bookingName={booking.serviceName || booking.serviceCategory || 'Service'}
          workerName={booking.workerId?.name || (booking.assignedTo?.name === 'You (Self)' ? 'Service Provider' : (booking.assignedTo?.name || 'Worker'))}
        />

        {/* Dispute Modal */}
        <DisputeModal
          isOpen={showDisputeModal}
          onClose={() => setShowDisputeModal(false)}
          onSubmit={handleRaiseDispute}
          bookingId={id}
        />

        {/* Payment Verification Modal */}
        <PaymentVerificationModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          booking={booking}
          onPayOnline={handleOnlinePayment}
        />

        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type}
        />

        <ReselectVendorModal
          isOpen={showReselectModal}
          onClose={() => setShowReselectModal(false)}
          booking={booking}
          onVendorSelected={(newBooking) => {
            if (newBooking) {
              setBooking(newBooking);
            }
          }}
        />
      </div>
    </div>
  );
};

export default BookingDetails;

