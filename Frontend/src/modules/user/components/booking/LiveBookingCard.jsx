import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiClock, FiMapPin, FiTool, FiCheckCircle, FiChevronRight, FiNavigation, FiX } from 'react-icons/fi';
import userBookingService from '../../../../services/bookingService';
import { userTheme } from '../../../../theme';
import RatingModal from './RatingModal';
import { toastManager } from '../../../../utils/toastManager';
import { useSocket } from '../../../../context/SocketContext';

const LiveBookingCard = ({ hasBottomNav }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const socket = useSocket();
  const [activeBooking, setActiveBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [tick, setTick] = useState(0);

  // Trigger re-renders every second while searching to update the elapsed time radius
  useEffect(() => {
    if (!activeBooking) return;
    const isSearching = ['SEARCHING', 'REQUESTED'].includes(activeBooking.status?.toUpperCase());
    if (!isSearching) return;

    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [activeBooking]);

  // Reset dismissed state when location changes (page changes)
  useEffect(() => {
    setIsDismissed(false);
  }, [location.pathname]);

  // Status mapping for UI
  const getStatusInfo = (booking) => {
    const status = booking?.status;
    switch (status?.toUpperCase()) {
      case 'ASSIGNED':
        return { label: 'Worker Assigned', icon: FiCheckCircle, color: 'bg-blue-500', sub: 'Worker will start journey soon' };
      case 'STARTED':
      case 'JOURNEY_STARTED':
        return { label: 'Worker on the Way', icon: FiNavigation, color: 'bg-orange-500', sub: 'Track location live', pulse: true };
      case 'VISITED':
        return { label: 'Reached & Started Work', icon: FiMapPin, color: 'bg-green-500', sub: 'At your location ? Work Started' };
      case 'IN_PROGRESS':
        return { label: 'Reached & Working', icon: FiTool, color: 'bg-purple-500', sub: 'Work successfully started' };
      case 'WORK_DONE':
        return { label: 'Work Completed', icon: FiCheckCircle, color: 'bg-green-600', sub: 'Review payment details' };
      // New Finding Status
      case 'REQUESTED':
      case 'SEARCHING': {
        const elapsedMs = Date.now() - new Date(booking.createdAt).getTime();
        const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
        
        let radius = 2;
        if (seconds >= 42) radius = 30;
        else if (seconds >= 35) radius = 20;
        else if (seconds >= 28) radius = 15;
        else if (seconds >= 21) radius = 10;
        else if (seconds >= 14) radius = 8;
        else if (seconds >= 7) radius = 5;

        const isWorker = booking.providerType === 'WORKER' || /labour|labor|worker|shramik|majdoor/i.test(booking.serviceCategory || '');
        return { label: isWorker ? 'Finding Nearby Workers' : 'Finding Nearby Vendors', icon: FiClock, color: 'bg-teal-500', sub: `Scanning within ${radius}km...`, pulse: true };
      }
      default:
        return null;
    }
  };

  useEffect(() => {
    fetchActiveBooking();

    if (socket) {
      socket.on('booking_updated', fetchActiveBooking);
      socket.on('notification', fetchActiveBooking);
    }

    // Poll every 30 seconds for updates
    const interval = setInterval(fetchActiveBooking, 30000);
    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('booking_updated', fetchActiveBooking);
        socket.off('notification', fetchActiveBooking);
      }
    };
  }, [socket]);

  const fetchActiveBooking = async () => {
    try {
      // Fetch bookings with active statuses
      // We manually fetch latest and check status on client or assume API supports status filter array
      // For now, getting all 'active' look-alikes by assuming 'current' sort order or specific API behaviour
      // Re-using getUserBookings with a broad status or custom logic if needed. 
      // Actually, relying on getUserBookings default which excludes 'SEARCHING'. 
      // We'll filter client side for the *most relevant* active one.

      const res = await userBookingService.getUserBookings({ limit: 5 });
      if (res.success && res.data.length > 0) {
        // Find the first booking that is in an active state (checking both cases to be safe)
        const ongoing = res.data.find(b => {
          const s = b.status?.toUpperCase();
          if (s === 'COMPLETED' || s === 'CANCELLED') return false;
          // Hide LiveBookingCard if status is WORK_DONE and review is already done or settlement completed
          if (s === 'WORK_DONE' && (b.rating || b.settlementStatus === 'completed' || b.workerPaymentStatus === 'paid')) return false;

          return ['ASSIGNED', 'STARTED', 'JOURNEY_STARTED', 'VISITED', 'IN_PROGRESS', 'WORK_DONE', 'SEARCHING', 'REQUESTED'].includes(s);
        });
        setActiveBooking(ongoing || null);
      }
    } catch (error) {
      // Failed to fetch active booking
    } finally {
      setLoading(false);
    }
  };

  // Auto-show rating modal ONLY when booking is fully completed AND paid
  useEffect(() => {
    const isCompleted = activeBooking?.status?.toLowerCase() === 'completed';
    const isPaid = ['success', 'paid', 'collected_by_vendor'].includes(activeBooking?.paymentStatus?.toLowerCase()) || activeBooking?.cashCollected === true;
    if (activeBooking && isCompleted && isPaid && !activeBooking.rating && !showRatingModal) {
      const dismissed = localStorage.getItem(`rating_dismissed_live_${activeBooking._id}`);
      if (!dismissed) {
        setShowRatingModal(true);
      }
    }
  }, [activeBooking]);

  const handleRateSubmit = async (ratingData) => {
    try {
      const response = await userBookingService.addReview(activeBooking._id || activeBooking.id, ratingData);
      if (response.success) {
        toastManager.success('Thank you for your rating!', {
          icon: '🌟',
          style: { borderRadius: '15px', background: '#333', color: '#fff' }
        });
        setShowRatingModal(false);
        fetchActiveBooking(); // Refresh to hide card or update state
      } else {
        toastManager.error(response.message || 'Failed to submit review');
      }
    } catch (error) {
      toastManager.error('Failed to submit review');
    }
  };

  if (!activeBooking || isDismissed) return null;

  const statusInfo = getStatusInfo(activeBooking);
  if (!statusInfo) return null;

  const Icon = statusInfo.icon;

  return (
    <AnimatePresence>
      <motion.div
        key="live-booking-card"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        onClick={() => {
          const status = activeBooking.status?.toUpperCase();
          // If worker is on the way, go to tracking map
          if (status === 'STARTED' || status === 'JOURNEY_STARTED') {
            navigate(`/user/booking/${activeBooking._id || activeBooking.id}/track`);
          } else if (status === 'SEARCHING' || status === 'REQUESTED') {
            navigate(`/user/booking-confirmation/${activeBooking._id || activeBooking.id}`);
          } else {
            navigate(`/user/booking/${activeBooking._id || activeBooking.id}`);
          }
        }}
        className={`fixed ${hasBottomNav ? 'bottom-24' : 'bottom-6'} left-4 right-4 z-50`}
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 flex items-center gap-4 relative overflow-hidden cursor-pointer active:scale-95 transition-transform group">

          {/* Close Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsDismissed(true);
            }}
            className="absolute top-1 right-1 p-1 bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 z-20 pointer-events-auto"
          >
            <FiX className="w-3 h-3" />
          </button>

          {/* Progress Bar Background */}
          <div className="absolute bottom-0 left-0 h-1 bg-gray-100 w-full">
            <motion.div
              className={`h-full ${statusInfo.color}`}
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </div>

          {/* Icon Box */}
          <div className={`w-12 h-12 rounded-full ${statusInfo.color} flex items-center justify-center shrink-0 relative`}>
            {statusInfo.pulse && (
              <div className={`absolute inset-0 rounded-full ${statusInfo.color} animate-ping opacity-50`}></div>
            )}
            <Icon className="text-white w-6 h-6 relative z-10" />
          </div>

          {/* Text Info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-gray-900 text-sm truncate">
              {statusInfo.label}
            </h4>
            <p className="text-xs text-gray-500 truncate">
              {statusInfo.sub} ? {activeBooking.serviceName}
            </p>
          </div>

          {/* Action Arrow or Pay Button */}
          {activeBooking.status?.toUpperCase() === 'WORK_DONE' && !activeBooking.cashCollected ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/user/booking/${activeBooking._id || activeBooking.id}`);
              }}
              className="px-4 py-2 bg-teal-600 text-white text-xs font-black rounded-xl shadow-lg shadow-teal-100 active:scale-95 transition-all"
            >
              PAY NOW
            </button>
          ) : (
            <div className="bg-gray-50 p-2 rounded-full">
              <FiChevronRight className="text-gray-400 w-5 h-5" />
            </div>
          )}

        </div>
      </motion.div>

      {/* Global Rating Modal */}
      <RatingModal
        key="rating-modal"
        isOpen={showRatingModal}
        onClose={() => {
          setShowRatingModal(false);
          if (activeBooking) {
            localStorage.setItem(`rating_dismissed_live_${activeBooking._id}`, 'true');
          }
        }}
        onSubmit={handleRateSubmit}
        bookingName={activeBooking.serviceName || 'Service'}
        workerName={activeBooking.workerId?.name || 'Worker'}
      />
    </AnimatePresence>
  );
};

export default LiveBookingCard;
