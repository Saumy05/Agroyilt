import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft, FiNavigation, FiMapPin, FiCrosshair, FiPhone,
  FiUser, FiStar, FiShield, FiKey, FiCheckCircle, FiLoader,
  FiMaximize, FiMinimize, FiClock, FiRefreshCw, FiUsers,
  FiTool, FiAlertCircle, FiRadio, FiCheck, FiInfo,
  FiCamera, FiCopy, FiX, FiEye, FiChevronDown, FiChevronUp
} from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa';
import { GoogleMap, useJsApiLoader, OverlayView, InfoWindow } from '@react-google-maps/api';
import api from '../../../../services/api';
import { toastManager } from '../../../../utils/toastManager';
import { useSocket } from '../../../../context/SocketContext';
import LogoLoader from '../../../../components/common/LogoLoader';
import DailyTrackingView from './components/DailyTrackingView';
import ActiveWorkMonitoringHub from './components/ActiveWorkMonitoringHub';
import { rupees, paymentLineLabel } from '../../../../utils/workerPayment';
import DecreaseWorkerModal from './components/DecreaseWorkerModal';
import ExtensionModal from './components/ExtensionModal';
import AddWorkersModal from './components/AddWorkersModal';
import workerBookingService from '../../../../services/workerBookingService';
import { walletService } from '../../../../services/walletService';


// Helper to format relative time
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return 'Location not available';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (diffSec < 10) return 'Live (Just now)';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour}h ago`;
};

// Status badge styling and configuration
const STATUS_CONFIG = {
  NOT_STARTED: {
    label: 'Waiting to Start',
    bgColor: 'bg-slate-100 text-slate-700 border-slate-200',
    dotColor: 'bg-slate-400',
    icon: FiClock,
    description: 'Worker has not started the journey yet'
  },
  JOURNEY_STARTED: {
    label: 'On the Way',
    bgColor: 'bg-blue-50 text-blue-700 border-blue-200',
    dotColor: 'bg-blue-500 animate-pulse',
    icon: FiNavigation,
    description: 'Worker is currently travelling to your farm'
  },
  ARRIVED: {
    label: 'Arrived at Farm',
    bgColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotColor: 'bg-emerald-500',
    icon: FiMapPin,
    description: 'Worker has reached your location. Share your OTP to begin work.'
  },
  OTP_VERIFIED: {
    label: 'OTP Verified',
    bgColor: 'bg-teal-50 text-teal-700 border-teal-200',
    dotColor: 'bg-teal-500',
    icon: FiShield,
    description: 'Visit OTP verified. Starting work.'
  },
  IN_PROGRESS: {
    label: 'Work In Progress',
    bgColor: 'bg-amber-50 text-amber-700 border-amber-200',
    dotColor: 'bg-amber-500 animate-pulse',
    icon: FiTool,
    description: 'Worker is actively working on your farm'
  },
  WORK_SUBMITTED: {
    label: 'Work Stopped',
    bgColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dotColor: 'bg-indigo-500',
    icon: FiKey,
    description: 'Worker has stopped. Check the work and share the End OTP.'
  },
  COMPLETED: {
    label: 'Work Completed',
    bgColor: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    dotColor: 'bg-emerald-600',
    icon: FiCheckCircle,
    description: 'Work completed successfully'
  },
  CANCELLED: {
    label: 'Cancelled',
    bgColor: 'bg-rose-50 text-rose-700 border-rose-200',
    dotColor: 'bg-rose-500',
    icon: FiAlertCircle,
    description: 'Assignment cancelled'
  }
};

const BookingTrack = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();

  const [trackingData, setTrackingData] = useState(null);
  const [workersMap, setWorkersMap] = useState({}); // Keyed by assignmentId
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [selectedProofModal, setSelectedProofModal] = useState(null);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [isAddWorkersModalOpen, setIsAddWorkersModalOpen] = useState(false);
  const [decreaseTargetWorker, setDecreaseTargetWorker] = useState(null);
  const [payingExtensionId, setPayingExtensionId] = useState(null);
  const [regeneratingVisitOtpId, setRegeneratingVisitOtpId] = useState(null);
  const [breakActionLoadingId, setBreakActionLoadingId] = useState(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const googleMapRef = useRef(null);
  const [activeInfoWindowWorker, setActiveInfoWindowWorker] = useState(null);
  const [showFarmInfoWindow, setShowFarmInfoWindow] = useState(false);

  const googleMapsLibraries = useMemo(() => ['places', 'geometry'], []);
  const { isLoaded: isMapScriptLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: googleMapsLibraries
  });

  // ── Reset state when booking ID changes ──
  useEffect(() => {
    setTrackingData(null);
    setWorkersMap({});
    setLoading(true);
    setRefreshing(false);
    setSelectedWorkerId(null);
    setIsFullScreen(false);
    setSelectedProofModal(null);
    setActiveInfoWindowWorker(null);
    setShowFarmInfoWindow(false);
  }, [id]);

  // 1. Fetch Authoritative Tracking Snapshot from REST API
  const fetchSnapshot = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      else setRefreshing(true);

      const res = await api.get(`/users/tracking/${id}`);
      if (res.data?.success && res.data?.data) {
        const data = res.data.data;
        setTrackingData(data);

        // Normalize worker assignments by assignmentId / bookingId
        const newMap = {};
        if (Array.isArray(data.workers)) {
          data.workers.forEach(w => {
            const key = w.assignmentId || w.bookingId || w.workerId;
            newMap[key] = w;
          });
        }
        setWorkersMap(newMap);

        if (data.workers?.length > 0) {
          const firstKey = data.workers[0].assignmentId || data.workers[0].bookingId || data.workers[0].workerId;
          setSelectedWorkerId(prev => prev || firstKey);
        }
      }
    } catch (err) {
      console.warn('[BookingTrack] Snapshot error:', err);
      // Fallback: try legacy booking service
      try {
        const fallbackRes = await api.get(`/users/bookings/${id}`);
        if (fallbackRes.data?.success && fallbackRes.data?.data) {
          const b = fallbackRes.data.data;
          const w = b.workerId || {};
          const singleWorker = {
            assignmentId: b._id,
            bookingId: b._id,
            bookingNumber: b.bookingNumber || `WRK-${b._id.slice(-6).toUpperCase()}`,
            workerId: w._id || b.workerId,
            workerName: w.name || 'Assigned Worker',
            workerPhone: w.phone || '',
            profilePhoto: w.profilePhoto || null,
            skills: w.skills || [],
            rating: w.rating || 5.0,
            agreedRate: b.agreedRate || b.finalAmount || 0,
            rateUnit: b.rateUnit || 'daily',
            journeyStatus: (b.status || '').toUpperCase() === 'JOURNEY_STARTED' ? 'JOURNEY_STARTED' :
              (b.status === 'in_progress' ? 'IN_PROGRESS' : (b.status === 'completed' ? 'COMPLETED' : 'NOT_STARTED')),
            currentLocation: b.liveLocation?.lat ? { lat: b.liveLocation.lat, lng: b.liveLocation.lng, heading: b.liveLocation.heading || 0 } : null,
            lastLocationAt: b.liveLocation?.updatedAt || null,
            visitOtp: b.visitOtp || null
          };

          setTrackingData({
            trackingId: id,
            workTitle: b.serviceName || 'Farm Work',
            workCategory: b.serviceCategory || 'Worker Service',
            destination: b.address ? {
              addressLine1: b.address.addressLine1 || '',
              city: b.address.city || '',
              lat: b.address.lat,
              lng: b.address.lng
            } : null,
            workers: [singleWorker]
          });
          setWorkersMap({ [b._id]: singleWorker });
          setSelectedWorkerId(prev => prev || b._id);
        }
      } catch {
        toastManager.error('Unable to load live tracking snapshot');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  const handleGenerateCompletionOtp = async (assignmentId) => {
    try {
      const res = await workerBookingService.generateCompletionOtp(id, assignmentId);
      if (res?.success) {
        toastManager.success(`Completion OTP: ${res.data?.completionOtp || res.completionOtp || 'Generated'}`);
        fetchSnapshot(false);
      } else {
        toastManager.error(res?.message || 'Failed to generate Completion OTP');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to generate Completion OTP');
    }
  };

  const handleRegenerateVisitOtp = async (assignmentId) => {
    try {
      setRegeneratingVisitOtpId(assignmentId);
      const res = await workerBookingService.regenerateVisitOtp(id, assignmentId);
      if (res?.success) {
        toastManager.success(`New Visit OTP generated: ${res.data?.visitOtp || 'Success'}`);
        fetchSnapshot(false);
      } else {
        toastManager.error(res?.message || 'Failed to regenerate Visit OTP');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to regenerate Visit OTP');
    } finally {
      setRegeneratingVisitOtpId(null);
    }
  };

  const handleStartBreak = async (assignmentId) => {
    try {
      setBreakActionLoadingId(assignmentId);
      const res = await workerBookingService.startBreak(id, assignmentId);
      if (res?.success) {
        toastManager.success('1-hour break started. Timer is active.');
        fetchSnapshot(false);
      } else {
        toastManager.error(res?.message || 'Failed to start break');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to start break');
    } finally {
      setBreakActionLoadingId(null);
    }
  };

  const handleResumeBreak = async (assignmentId) => {
    try {
      setBreakActionLoadingId(assignmentId);
      const res = await workerBookingService.resumeBreak(id, assignmentId);
      if (res?.success) {
        toastManager.success('Work resumed successfully.');
        fetchSnapshot(false);
      } else {
        toastManager.error(res?.message || 'Failed to resume work');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to resume work');
    } finally {
      setBreakActionLoadingId(null);
    }
  };

  // Initial Load & Regular Resync Interval (15s)
  useEffect(() => {
    fetchSnapshot(true);
    const interval = setInterval(() => {
      fetchSnapshot(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  // Tick clock every 5 seconds for relative timestamps
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);
    return () => clearInterval(clockInterval);
  }, []);

  // 2. Socket Connection & Real-Time Event Handlers
  useEffect(() => {
    if (!socket || !id) return;

    setSocketConnected(socket.connected);

    const onConnect = () => {
      setSocketConnected(true);
      socket.emit('join_tracking', id);
      fetchSnapshot(false); // Resync latest authoritative snapshot on reconnect
    };

    const onDisconnect = () => {
      setSocketConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Explicitly join tracking room
    socket.emit('join_tracking', id);

    // A. Worker Started Journey
    const handleJourneyStarted = (data) => {
      const targetId = data.assignmentId || data.bookingId || data.workerId;
      setWorkersMap(prev => {
        const existing = prev[targetId] || {};
        return {
          ...prev,
          [targetId]: {
            ...existing,
            ...data,
            journeyStatus: 'JOURNEY_STARTED',
            journeyStartedAt: data.journeyStartedAt || new Date().toISOString()
          }
        };
      });
      toastManager.info(`${data.workerName || 'Worker'} has started their journey!`);
    };

    // B. Worker Location Updated
    const handleLocationUpdated = (data) => {
      const targetId = data.assignmentId || data.bookingId || data.workerId;
      setWorkersMap(prev => {
        const existing = prev[targetId];
        if (!existing) return prev;
        return {
          ...prev,
          [targetId]: {
            ...existing,
            currentLocation: data.location || { lat: data.lat, lng: data.lng, heading: data.heading || 0 },
            lastLocationAt: data.lastLocationAt || new Date().toISOString()
          }
        };
      });
    };

    // C. Worker Arrived at Farm
    const handleArrived = (data) => {
      const targetId = data.assignmentId || data.bookingId || data.workerId;
      setWorkersMap(prev => {
        const existing = prev[targetId] || {};
        return {
          ...prev,
          [targetId]: {
            ...existing,
            ...data,
            journeyStatus: 'ARRIVED',
            arrivedAt: data.arrivedAt || new Date().toISOString()
          }
        };
      });
      toastManager.success(`${data.workerName || 'Worker'} has arrived at your farm!`);
    };

    // D. OTP Verified / Work Started
    const handleOtpVerified = (data) => {
      const targetId = data.assignmentId || data.bookingId || data.workerId;
      setWorkersMap(prev => {
        const existing = prev[targetId] || {};
        return {
          ...prev,
          [targetId]: {
            ...existing,
            ...data,
            journeyStatus: 'IN_PROGRESS',
            otpVerifiedAt: data.otpVerifiedAt || new Date().toISOString()
          }
        };
      });
      toastManager.success('Visit OTP verified. Work is in progress.');
    };

    // E. Work Completed
    const handleWorkCompleted = (data) => {
      const targetId = data.assignmentId || data.bookingId || data.workerId;
      setWorkersMap(prev => {
        const existing = prev[targetId] || {};
        return {
          ...prev,
          [targetId]: {
            ...existing,
            ...data,
            journeyStatus: 'COMPLETED',
            completedAt: data.completedAt || new Date().toISOString()
          }
        };
      });
      toastManager.success('Worker marked the job as completed!');
    };

    // E2. Worker tapped Stop Work → reload so the freshly issued End OTP appears
    const handleWorkStopped = () => {
      fetchSnapshot(false);
      toastManager.success('Worker has stopped work. Check the work, then share the End OTP.');
    };

    // F. Legacy single location fallback
    const handleLegacyLocation = (data) => {
      if (data.lat && data.lng) {
        const targetId = data.bookingId || data.workerId || id;
        setWorkersMap(prev => {
          const keys = Object.keys(prev);
          const matchedKey = keys.find(k => k === targetId) || keys[0];
          if (!matchedKey) return prev;
          return {
            ...prev,
            [matchedKey]: {
              ...prev[matchedKey],
              currentLocation: { lat: Number(data.lat), lng: Number(data.lng), heading: Number(data.heading || 0) },
              lastLocationAt: data.updatedAt || new Date().toISOString()
            }
          };
        });
      }
    };

    // G. Booking Completed / Parent Completed
    const handleBookingCompleted = (data) => {
      setTrackingData(prev => prev ? ({ ...prev, isParentCompleted: true, parentStatus: 'completed' }) : prev);
      toastManager.success('Booking completed and payments settled!');
      fetchSnapshot(false);
    };

    // H. Assignment Settled
    const handleAssignmentSettled = () => {
      fetchSnapshot(false);
    };

    // Register all socket listeners (unified & legacy)
    socket.on('worker_journey_started', handleJourneyStarted);
    socket.on('assignment_journey_started', handleJourneyStarted);
    socket.on('worker_location_updated', handleLocationUpdated);
    socket.on('assignment_location_updated', handleLocationUpdated);
    socket.on('worker_arrived', handleArrived);
    socket.on('assignment_arrived', handleArrived);
    socket.on('worker_otp_verified', handleOtpVerified);
    socket.on('worker_work_started', handleOtpVerified);
    socket.on('assignment_visit_otp_verified', handleOtpVerified);
    socket.on('assignment_work_started', handleOtpVerified);
    socket.on('worker_work_completed', handleWorkCompleted);
    socket.on('assignment_work_submitted', handleWorkStopped);
    socket.on('assignment_day_completed', () => fetchSnapshot(false));
    socket.on('live_location_update', handleLegacyLocation);
    socket.on('booking_completed', handleBookingCompleted);
    socket.on('assignment_completion_otp_verified', handleAssignmentSettled);
    socket.on('assignment_settled', handleAssignmentSettled);
    socket.on('assignment_cancelled', () => fetchSnapshot(false));
    socket.on('extension_requested', () => fetchSnapshot(false));
    socket.on('extension_status_changed', () => fetchSnapshot(false));
    socket.on('extension_confirmed', () => fetchSnapshot(false));
    socket.on('worker_decreased', () => fetchSnapshot(false));
    socket.on('daily_day_started', () => fetchSnapshot(false));
    socket.on('daily_visit_otp_verified', () => fetchSnapshot(false));
    socket.on('daily_completion_otp_verified', () => fetchSnapshot(false));
    socket.on('assignment_break_started', () => {
      fetchSnapshot(false);
      toastManager.info('1-hour lunch break started.');
    });
    socket.on('assignment_break_resumed', () => {
      fetchSnapshot(false);
      toastManager.success('Break finished — work resumed!');
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('worker_journey_started', handleJourneyStarted);
      socket.off('assignment_journey_started', handleJourneyStarted);
      socket.off('worker_location_updated', handleLocationUpdated);
      socket.off('assignment_location_updated', handleLocationUpdated);
      socket.off('worker_arrived', handleArrived);
      socket.off('assignment_arrived', handleArrived);
      socket.off('worker_otp_verified', handleOtpVerified);
      socket.off('worker_work_started', handleOtpVerified);
      socket.off('assignment_visit_otp_verified', handleOtpVerified);
      socket.off('assignment_work_started', handleOtpVerified);
      socket.off('worker_work_completed', handleWorkCompleted);
      socket.off('assignment_work_submitted', handleWorkStopped);
      socket.off('assignment_day_completed');
      socket.off('live_location_update', handleLegacyLocation);
      socket.off('booking_completed', handleBookingCompleted);
      socket.off('assignment_completion_otp_verified', handleAssignmentSettled);
      socket.off('assignment_settled', handleAssignmentSettled);
      socket.off('assignment_cancelled');
      socket.off('extension_requested');
      socket.off('extension_status_changed');
      socket.off('extension_confirmed');
      socket.off('worker_decreased');
      socket.off('daily_day_started');
      socket.off('daily_visit_otp_verified');
      socket.off('daily_completion_otp_verified');
      socket.off('assignment_break_started');
      socket.off('assignment_break_resumed');
      socket.emit('leave_tracking', id);
    };
  }, [socket, id, fetchSnapshot]);

  // wallet balance, only fetched while an extension is waiting for payment
  const [walletBalance, setWalletBalance] = useState(null);
  const pendingPayExtId = trackingData?.extensions?.find(e => e.status === 'PAYMENT_PENDING')?._id || null;
  useEffect(() => {
    if (!pendingPayExtId) return;
    walletService.getBalance()
      .then(r => setWalletBalance(Number(r?.data?.balance) || 0))
      .catch(() => setWalletBalance(null));
  }, [pendingPayExtId]);

  const handleExtensionWalletPayment = async (ext) => {
    try {
      setPayingExtensionId(ext._id);
      const res = await api.post(`/users/farmer-worker-request/${trackingData?.requestId || id}/extension/${ext._id}/pay-wallet`);
      if (res.data?.success) {
        toastManager.success('Paid from wallet. Schedule updated.');
        fetchSnapshot(false);
        walletService.getBalance().then(r => setWalletBalance(Number(r?.data?.balance) || 0)).catch(() => {});
      } else {
        toastManager.error(res.data?.message || 'Wallet payment failed');
      }
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 402 && data?.balance !== undefined) setWalletBalance(Number(data.balance));
      toastManager.error(data?.message || 'Wallet payment failed');
      fetchSnapshot(false);
    } finally {
      setPayingExtensionId(null);
    }
  };

  const handleExtensionPayment = async (ext) => {
    try {
      setPayingExtensionId(ext._id);
      const res = await api.post(`/users/farmer-worker-request/${trackingData?.requestId || id}/extension/${ext._id}/payment`);
      if (!res.data?.success) {
        toastManager.error(res.data?.message || 'Failed to initialize payment');
        return;
      }

      const { razorpayOrderId, orderId, amount, key } = res.data.data;
      const targetOrderId = razorpayOrderId || orderId;
      const options = {
        key: key || window.__RAZORPAY_KEY__ || 'rzp_test_placeholder',
        amount: Math.round(Number(amount) * 100),
        currency: 'INR',
        name: 'AgroYilt',
        description: `Extension - ${ext.bookingType === 'DAILY' ? `${ext.additionalDays} Day(s)` : `${ext.extensionMinutes} Mins`}`,
        order_id: targetOrderId,
        handler: async (response) => {
          try {
            const verifyRes = await api.post(
              `/users/farmer-worker-request/${trackingData?.requestId || id}/extension/${ext._id}/payment/verify`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              }
            );
            if (verifyRes.data?.success) {
              toastManager.success('Extension payment successful! Schedule updated.');
              fetchSnapshot(false);
            } else {
              toastManager.error(verifyRes.data?.message || 'Payment verification failed');
            }
          } catch (vErr) {
            toastManager.error(vErr.response?.data?.message || 'Verification failed');
          }
        },
        prefill: {
          name: trackingData?.farmerName || '',
          contact: trackingData?.farmerPhone || ''
        },
        theme: { color: '#059669' }
      };

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        toastManager.error('Razorpay SDK not ready. Please refresh.');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to process extension payment');
    } finally {
      setPayingExtensionId(null);
    }
  };

  // Derived array of workers from normalized map
  const workersList = useMemo(() => {
    return Object.values(workersMap);
  }, [workersMap]);

  // Dynamic status counters
  const counters = useMemo(() => {
    const total = workersList.length;
    const started = workersList.filter(w => ['JOURNEY_STARTED', 'ARRIVED', 'OTP_VERIFIED', 'IN_PROGRESS', 'WORK_SUBMITTED', 'COMPLETED'].includes(w.journeyStatus) || w.workStatus === 'IN_PROGRESS' || w.workStatus === 'SUBMITTED').length;
    const onJourney = workersList.filter(w => w.journeyStatus === 'JOURNEY_STARTED').length;
    const arrived = workersList.filter(w => w.journeyStatus === 'ARRIVED').length;
    const inProgress = workersList.filter(w => ['OTP_VERIFIED', 'IN_PROGRESS', 'WORK_SUBMITTED'].includes(w.journeyStatus) || w.workStatus === 'IN_PROGRESS' || w.workStatus === 'SUBMITTED').length;
    const completed = workersList.filter(w => w.journeyStatus === 'COMPLETED').length;
    const notStarted = workersList.filter(w => w.journeyStatus === 'NOT_STARTED').length;

    return { total, started, onJourney, arrived, inProgress, completed, notStarted };
  }, [workersList]);

  // Overall Completion Check
  const isAllCompleted = useMemo(() => {
    if (trackingData?.isParentCompleted || trackingData?.parentStatus === 'completed') return true;
    if (counters.total > 0 && counters.completed === counters.total) return true;
    return false;
  }, [trackingData, counters]);

  // Active Work Status Check
  const isWorkInProgress = useMemo(() => {
    return !isAllCompleted && (
      counters.inProgress > 0 ||
      trackingData?.parentStatus === 'in_progress' ||
      workersList.some(w => ['IN_PROGRESS', 'WORK_SUBMITTED'].includes(w.journeyStatus) || w.workStatus === 'IN_PROGRESS' || w.workStatus === 'SUBMITTED')
    );
  }, [isAllCompleted, counters.inProgress, trackingData?.parentStatus, workersList]);

  // Expand map by default if workers are traveling, otherwise keep compact during active work
  useEffect(() => {
    if (!isWorkInProgress && counters.onJourney > 0) {
      setIsMapExpanded(true);
    }
  }, [isWorkInProgress, counters.onJourney]);

  // Invalidate Google Map size on expand/collapse
  useEffect(() => {
    if (googleMapRef.current && isMapExpanded && window.google?.maps?.event) {
      setTimeout(() => {
        if (googleMapRef.current) {
          window.google.maps.event.trigger(googleMapRef.current, 'resize');
        }
      }, 200);
    }
  }, [isMapExpanded]);

  // Destination Farm location
  const destination = trackingData?.destination;

  // Safe default map center
  const defaultMapCenter = useMemo(() => {
    const isValidCoord = (lat, lng) => {
      const la = Number(lat);
      const lo = Number(lng);
      return isFinite(la) && isFinite(lo) && la !== 0 && lo !== 0;
    };
    const safeNum = (v, fallback) => { const n = Number(v); return isFinite(n) ? n : fallback; };

    const firstWorkerWithLoc = workersList.find(w =>
      isValidCoord(w.currentLocation?.lat, w.currentLocation?.lng)
    );
    return {
      lat: safeNum(destination?.lat, null) || safeNum(firstWorkerWithLoc?.currentLocation?.lat, null) || 22.7196,
      lng: safeNum(destination?.lng, null) || safeNum(firstWorkerWithLoc?.currentLocation?.lng, null) || 75.8577
    };
  }, [destination, workersList]);

  // Center & Fit bounds on all markers
  const handleCenterMap = useCallback(() => {
    if (!googleMapRef.current || !window.google) return;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    const safeDLat = Number(destination?.lat);
    const safeDLng = Number(destination?.lng);
    if (isFinite(safeDLat) && isFinite(safeDLng) && safeDLat !== 0 && safeDLng !== 0) {
      bounds.extend({ lat: safeDLat, lng: safeDLng });
      hasPoints = true;
    }

    workersList.forEach(w => {
      const wLat = Number(w.currentLocation?.lat);
      const wLng = Number(w.currentLocation?.lng);
      if (isFinite(wLat) && isFinite(wLng) && wLat !== 0 && wLng !== 0) {
        bounds.extend({ lat: wLat, lng: wLng });
        hasPoints = true;
      }
    });

    if (hasPoints) {
      googleMapRef.current.fitBounds(bounds, 60);
    } else {
      googleMapRef.current.panTo(defaultMapCenter);
      googleMapRef.current.setZoom(14);
    }
  }, [destination, workersList, defaultMapCenter]);

  // Auto-pan to selected worker
  useEffect(() => {
    if (!selectedWorkerId || !googleMapRef.current) return;
    const target = workersList.find(w =>
      (w.assignmentId === selectedWorkerId || w.bookingId === selectedWorkerId || w.workerId === selectedWorkerId)
    );
    if (target?.currentLocation?.lat && target?.currentLocation?.lng) {
      const pos = { lat: Number(target.currentLocation.lat), lng: Number(target.currentLocation.lng) };
      googleMapRef.current.panTo(pos);
      googleMapRef.current.setZoom(16);
      setActiveInfoWindowWorker(target);
    }
  }, [selectedWorkerId, workersList]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <LogoLoader text="Loading Live Tracking..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-800">
      {/* ── Top App Bar ── */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {!isAllCompleted && (
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all shrink-0"
                title="Back"
              >
                <FiArrowLeft size={20} />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="font-black text-base text-slate-800 truncate flex items-center gap-2">
                <FiNavigation className="text-emerald-600 shrink-0" />
                <span>
                  {isAllCompleted
                    ? 'Booking Completed'
                    : isWorkInProgress
                    ? 'Live Work Monitoring'
                    : 'Live Journey Tracking'}
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium truncate">
                {trackingData?.workTitle || 'Worker Booking'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Connection Indicator */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                socketConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${socketConnected ? (isWorkInProgress ? 'bg-emerald-500 animate-ping' : 'bg-emerald-500 animate-pulse') : 'bg-amber-500'}`} />
              <span className="hidden sm:inline">
                {socketConnected
                  ? isWorkInProgress
                    ? 'Live Work Active'
                    : 'Live Tracking'
                  : 'Reconnecting...'}
              </span>
              <FiRadio className="sm:hidden" />
            </div>

            {/* Manual Resync */}
            <button
              onClick={() => fetchSnapshot(false)}
              disabled={refreshing}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-all"
              title="Refresh"
            >
              <FiRefreshCw size={16} className={refreshing ? 'animate-spin text-emerald-600' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* ── Completion Celebration Banner ── */}
        {isAllCompleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl p-6 shadow-xl border border-emerald-500/30 text-center relative overflow-hidden"
          >
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3 text-white shadow-inner">
              <FiCheckCircle size={36} />
            </div>
            <h2 className="text-2xl font-black mb-1">Booking Completed Successfully!</h2>
            <p className="text-emerald-100 text-sm font-medium mb-4">
              All assigned workers have finished their tasks and payments are settled.
            </p>

            {/* Payment summary — the backend bill, same figures the workers saw */}
            {trackingData?.paymentSummary?.bill && (() => {
              const bill = trackingData.paymentSummary.bill;
              const isCash = bill.paymentMethod === 'cash';
              return (
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-4 text-left border border-white/10 space-y-2 text-xs">
                  {bill.lines.map((line, i) => (
                    <div key={i} className="flex justify-between font-medium text-emerald-100">
                      <span>{paymentLineLabel(line)}</span>
                      <span className="font-bold text-white">{rupees(line.total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-black text-white pt-1 border-t border-white/10">
                    <span>{isCash ? 'Paid in cash to workers' : 'Paid online'}</span>
                    <span>{rupees(isCash ? bill.cashPaid + bill.cashDue : bill.paidOnline)}</span>
                  </div>
                  {!isCash && bill.refund?.amount > 0 && (
                    <div className="flex justify-between font-bold text-yellow-300">
                      <span>Unused amount refunded to wallet</span>
                      <span>{rupees(bill.refund.amount)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate('/user', { replace: true })}
                className="bg-white text-emerald-800 font-black px-6 py-3 rounded-2xl shadow-lg hover:bg-emerald-50 active:scale-95 transition-all text-sm"
              >
                Return to Home
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Active Work Monitoring Hub (When work is IN PROGRESS) ── */}
        {isWorkInProgress && !isAllCompleted && (
          <ActiveWorkMonitoringHub
            trackingData={trackingData}
            workers={workersList}
            onOpenExtensionModal={() => setIsExtensionModalOpen(true)}
          />
        )}

        {/* ── Dynamic Summary & Progress Counters ── */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-600">
                {trackingData?.assignmentType === 'SMART_BROADCAST' ? 'Smart Broadcast Booking' :
                  (trackingData?.assignmentType === 'TEAM_LEADER' ? 'Team Leader Booking' : 'Direct Worker Hire')}
              </p>
              <h2 className="text-xl font-black text-slate-800">{trackingData?.workTitle || 'Farm Work'}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase border ${
                trackingData?.bookingType === 'DAILY'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                {trackingData?.bookingType === 'DAILY' ? 'Daily Schedule' : 'Hourly Booking'}
              </span>

              {!isAllCompleted && (
                <button
                  type="button"
                  id="farmer-extend-time-btn"
                  onClick={() => setIsExtensionModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 flex items-center gap-1 active:scale-95 transition-all shadow-xs"
                >
                  <FiClock size={13} />
                  <span>{trackingData?.bookingType === 'DAILY' ? 'Extend Days' : 'Extend Time'}</span>
                </button>
              )}

              <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-1.5 rounded-2xl border border-slate-100">
                <FiUsers className="text-slate-500" size={16} />
                <span className="text-sm font-black text-slate-700">{counters.total} Worker{counters.total !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          {/* Metric Status Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100">
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <FiNavigation size={11} className="text-blue-500" /> On Journey
              </p>
              <p className="text-lg font-black text-slate-800 mt-0.5">
                {counters.onJourney} <span className="text-xs text-slate-400 font-bold">/ {counters.total}</span>
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <FiMapPin size={11} className="text-emerald-500" /> Arrived
              </p>
              <p className="text-lg font-black text-slate-800 mt-0.5">
                {counters.arrived} <span className="text-xs text-slate-400 font-bold">/ {counters.total}</span>
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <FiTool size={11} className="text-amber-500" /> In Progress
              </p>
              <p className="text-lg font-black text-slate-800 mt-0.5">
                {counters.inProgress} <span className="text-xs text-slate-400 font-bold">/ {counters.total}</span>
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <FiCheckCircle size={11} className="text-emerald-600" /> Completed
              </p>
              <p className="text-lg font-black text-slate-800 mt-0.5">
                {counters.completed} <span className="text-xs text-slate-400 font-bold">/ {counters.total}</span>
              </p>
            </div>
          </div>
        </div>

        {/* ── Active Extension Banner ── */}
        {(() => {
          const activeExt = trackingData?.extensions?.find(e => ['WORKER_EVALUATION', 'PAYMENT_PENDING'].includes(e.status));
          if (!activeExt) return null;
          const isPendingPay = activeExt.status === 'PAYMENT_PENDING';
          const payableAmt = activeExt.totalPayableAmount ?? activeExt.totalPayable ?? activeExt.totalServiceAmount ?? activeExt.farmerTotalAmount ?? 0;

          return (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-black">
                  <FiClock size={20} />
                </div>
                <div>
                  <p className="text-xs font-black text-amber-900 uppercase">
                    {isPendingPay ? 'Extension Accepted — Payment Required' : 'Extension Request Sent'}
                  </p>
                  <p className="text-xs text-amber-700 font-medium">
                    {activeExt.bookingType === 'DAILY'
                      ? `${activeExt.additionalDays} extra day(s)`
                      : `${activeExt.extensionMinutes} extra minutes`}
                    {isPendingPay && ` • Payable: ₹${payableAmt}`}
                  </p>
                </div>
              </div>

              {isPendingPay ? (
                <div className="flex flex-col items-stretch gap-1.5">
                  <button
                    type="button"
                    id="pay-extension-wallet-btn"
                    disabled={payingExtensionId === activeExt._id || walletBalance === null || walletBalance < Number(payableAmt)}
                    onClick={() => handleExtensionWalletPayment(activeExt)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <FaRupeeSign size={11} />
                    <span>{payingExtensionId === activeExt._id ? 'Processing...' : `Pay ₹${payableAmt} from Wallet`}</span>
                  </button>
                  {walletBalance !== null && (
                    <span className={`text-[10px] font-bold text-center ${walletBalance >= Number(payableAmt) ? 'text-slate-500' : 'text-red-600'}`}>
                      Wallet ₹{walletBalance.toLocaleString('en-IN')}{walletBalance < Number(payableAmt) ? ` · ₹${(Number(payableAmt) - walletBalance).toLocaleString('en-IN')} more needed` : ''}
                    </span>
                  )}
                  <button
                    type="button"
                    id="pay-extension-now-btn"
                    disabled={payingExtensionId === activeExt._id}
                    onClick={() => handleExtensionPayment(activeExt)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <FaRupeeSign size={11} />
                    <span>{payingExtensionId === activeExt._id ? 'Processing...' : `Pay ₹${payableAmt} Online`}</span>
                  </button>
                </div>
              ) : (
                <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-amber-200/60 text-amber-800">
                  Workers Evaluating
                </span>
              )}
            </div>
          );
        })()}

        {/* ── Daily Schedule Tracking View (Multi-day attendance & decrease) ── */}
        {trackingData?.bookingType === 'DAILY' && (
          <DailyTrackingView
            trackingData={trackingData}
            workers={workersList}
            onDecreaseClick={(worker) => setDecreaseTargetWorker(worker)}
            onRequestExtensionClick={() => setIsExtensionModalOpen(true)}
            onAddWorkersClick={() => setIsAddWorkersModalOpen(true)}
            onGenerateCompletionOtp={handleGenerateCompletionOtp}
            onRegenerateVisitOtp={handleRegenerateVisitOtp}
            onStartBreak={handleStartBreak}
            onResumeBreak={handleResumeBreak}
            breakLoadingId={breakActionLoadingId}
          />
        )}

        {/* ── Interactive Live Map Section (Smart Collapsible) ── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <FiMapPin className="text-emerald-600" />
              <span>Farm Location Map {isWorkInProgress && '(Workers On Site)'}</span>
            </h4>
            {isWorkInProgress && (
              <button
                type="button"
                onClick={() => {
                  setIsMapExpanded(prev => !prev);
                  setTimeout(() => {
                    if (googleMapRef.current && window.google?.maps?.event) {
                      window.google.maps.event.trigger(googleMapRef.current, 'resize');
                    }
                  }, 150);
                }}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-xl transition-all flex items-center gap-1 border border-emerald-200 shadow-2xs cursor-pointer"
              >
                {isMapExpanded ? (
                  <><span>Hide Map</span> <FiChevronUp size={13} /></>
                ) : (
                  <><span>Show Live Map</span> <FiChevronDown size={13} /></>
                )}
              </button>
            )}
          </div>

          {/* Compact summary bar if map is collapsed during active work */}
          {isWorkInProgress && !isMapExpanded && !isFullScreen && (
            <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <FiMapPin size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800">Farm Location • Workers On Site</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {[destination?.addressLine1, destination?.city].filter(Boolean).join(', ') || 'Registered Farm Location'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMapExpanded(true);
                  setTimeout(() => {
                    if (googleMapRef.current && window.google?.maps?.event) {
                      window.google.maps.event.trigger(googleMapRef.current, 'resize');
                    }
                  }, 200);
                }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shrink-0 active:scale-95 cursor-pointer"
              >
                <FiMaximize size={13} />
                <span>Expand Map</span>
              </button>
            </div>
          )}

          <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden relative transition-all duration-300 ${
            isFullScreen
              ? 'fixed inset-0 z-50 rounded-none'
              : (isWorkInProgress && !isMapExpanded)
              ? 'h-0 opacity-0 pointer-events-none -m-0 p-0 border-0'
              : 'h-[320px] sm:h-[400px] opacity-100'
          }`}>
            {isMapScriptLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%', minHeight: '300px' }}
                center={defaultMapCenter}
                zoom={14}
                onLoad={(map) => {
                  googleMapRef.current = map;
                  handleCenterMap();
                }}
                onUnmount={() => {
                  googleMapRef.current = null;
                }}
                options={{
                  disableDefaultUI: true,
                  zoomControl: false,
                  mapTypeId: 'roadmap',
                  clickableIcons: false
                }}
              >
                {/* 1. Destination Farm Marker */}
                {destination?.lat && destination?.lng && isFinite(Number(destination.lat)) && isFinite(Number(destination.lng)) && (
                  <OverlayView
                    position={{ lat: Number(destination.lat), lng: Number(destination.lng) }}
                    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                  >
                    <div
                      onClick={() => setShowFarmInfoWindow(prev => !prev)}
                      style={{ position: 'absolute', transform: 'translate(-50%, -50%)', cursor: 'pointer', zIndex: 20 }}
                      title="Farm Destination"
                    >
                      <div style={{
                        background: '#059669',
                        color: 'white',
                        borderRadius: 9999,
                        width: 38,
                        height: 38,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(5,150,105,0.4)',
                        border: '3px solid white'
                      }}>
                        <FiMapPin size={18} />
                      </div>
                    </div>
                  </OverlayView>
                )}

                {showFarmInfoWindow && destination?.lat && destination?.lng && (
                  <InfoWindow
                    position={{ lat: Number(destination.lat), lng: Number(destination.lng) }}
                    onCloseClick={() => setShowFarmInfoWindow(false)}
                  >
                    <div style={{ padding: 4, fontSize: 12, color: '#0f172a' }}>
                      <div style={{ fontWeight: 800 }}>Farm Destination</div>
                      <div style={{ color: '#64748b', marginTop: 2 }}>
                        {destination?.addressLine1 || destination?.city || 'Farm Location'}
                      </div>
                    </div>
                  </InfoWindow>
                )}

                {/* 2. Worker Markers */}
                {workersList.map((w, idx) => {
                  const farmLat = Number(destination?.lat) || defaultMapCenter.lat;
                  const farmLng = Number(destination?.lng) || defaultMapCenter.lng;
                  let wLat = Number(w.currentLocation?.lat);
                  let wLng = Number(w.currentLocation?.lng);

                  if (!isFinite(wLat) || !isFinite(wLng) || wLat === 0 || wLng === 0) {
                    const angle = (idx * 2 * Math.PI) / Math.max(workersList.length, 1);
                    wLat = farmLat + 0.003 * Math.sin(angle);
                    wLng = farmLng + 0.003 * Math.cos(angle);
                  }

                  const isLive = w.journeyStatus === 'JOURNEY_STARTED';
                  const isArrived = w.journeyStatus === 'ARRIVED';
                  const isCompleted = w.journeyStatus === 'COMPLETED';
                  const pinColor = isCompleted ? '#059669' : (isArrived ? '#10B981' : (isLive ? '#2563EB' : '#64748B'));
                  const initial = w.workerName ? w.workerName.charAt(0).toUpperCase() : `${idx + 1}`;
                  const wKey = w.assignmentId || w.bookingId || w.workerId;
                  const isSelected = selectedWorkerId === wKey;

                  return (
                    <React.Fragment key={wKey || idx}>
                      <OverlayView
                        position={{ lat: wLat, lng: wLng }}
                        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                      >
                        <div
                          onClick={() => {
                            setSelectedWorkerId(wKey);
                            setActiveInfoWindowWorker(w);
                          }}
                          style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) scale(${isSelected ? 1.18 : 1})`,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            transition: 'transform 0.2s ease',
                            zIndex: isSelected ? 90 : 30
                          }}
                        >
                          {isLive && (
                            <div style={{
                              position: 'absolute',
                              width: 48,
                              height: 48,
                              borderRadius: 9999,
                              background: 'rgba(37,99,235,0.25)',
                              animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
                              top: -4
                            }} />
                          )}
                          <div style={{
                            background: pinColor,
                            color: 'white',
                            borderRadius: 9999,
                            width: 40,
                            height: 40,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: 14,
                            boxShadow: isSelected ? '0 0 16px rgba(245,158,11,0.7)' : '0 4px 14px rgba(0,0,0,0.25)',
                            border: isSelected ? '3px solid #F59E0B' : '3px solid white',
                          }}>
                            {initial}
                          </div>
                          <div style={{
                            background: 'white',
                            color: '#1E293B',
                            fontWeight: 800,
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 6,
                            marginTop: 3,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                            border: '1px solid #E2E8F0',
                            whiteSpace: 'nowrap'
                          }}>
                            {w.workerName?.split(' ')[0] || `Worker ${idx + 1}`}
                          </div>
                        </div>
                      </OverlayView>

                      {activeInfoWindowWorker && (activeInfoWindowWorker.assignmentId === w.assignmentId || activeInfoWindowWorker.workerId === w.workerId) && (
                        <InfoWindow
                          position={{ lat: wLat, lng: wLng }}
                          onCloseClick={() => setActiveInfoWindowWorker(null)}
                        >
                          <div style={{ fontFamily: 'inherit', fontSize: 12, lineHeight: 1.4, padding: 4 }}>
                            <div style={{ fontWeight: 800, fontSize: 13, color: '#0F172A' }}>{w.workerName}</div>
                            <div style={{ color: '#64748B', fontWeight: 600, marginTop: 2 }}>{STATUS_CONFIG[w.journeyStatus]?.label || w.journeyStatus}</div>
                            <div style={{ color: '#059669', fontWeight: 700, marginTop: 4 }}>Rate: ₹{w.agreedRate}/{w.rateUnit || 'day'}</div>
                            {w.distanceKm ? <div style={{ color: '#2563EB', fontWeight: 700, marginTop: 2 }}>Distance: {w.distanceKm} km</div> : null}
                            {!w.currentLocation?.lat && <div style={{ color: '#F59E0B', fontWeight: 600, fontSize: 10, marginTop: 2 }}>(Waiting for live GPS)</div>}
                          </div>
                        </InfoWindow>
                      )}
                    </React.Fragment>
                  );
                })}
              </GoogleMap>
            ) : (
              <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
                <FiLoader className="w-6 h-6 animate-spin text-emerald-600 mr-2" /> Loading Google Maps...
              </div>
            )}

            {/* Floating Map Controls */}
            <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
              <button
                onClick={handleCenterMap}
                className="w-10 h-10 rounded-2xl bg-white shadow-lg border border-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all"
                title="Re-center all workers"
              >
                <FiCrosshair size={18} />
              </button>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="w-10 h-10 rounded-2xl bg-white shadow-lg border border-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all"
                title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullScreen ? <FiMinimize size={18} /> : <FiMaximize size={18} />}
              </button>
            </div>

            {/* Map Status Badge Overlay */}
            <div className="absolute bottom-4 left-4 z-[400] bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-100 shadow-lg flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-700">
                {workersList.filter(w => w.currentLocation?.lat).length} of {counters.total} Workers Live on Map
              </span>
            </div>
          </div>
        </div>

        {/* ── Individual Worker Status List ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
              <FiUsers className="text-emerald-600" />
              <span>Assigned Workers ({workersList.length})</span>
            </h3>
            <span className="text-xs text-slate-400 font-bold">Independent Live Tracking</span>
          </div>

          {workersList.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-100">
              <FiUsers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-600">No worker assignments found</p>
            </div>
          ) : (
            workersList.map((worker, idx) => {
              const statusCfg = STATUS_CONFIG[
                // If workStatus is more specific than journeyStatus, prefer it
                (worker.workStatus === 'SUBMITTED' ? 'WORK_SUBMITTED' :
                  worker.workStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' :
                  worker.journeyStatus) || 'NOT_STARTED'
              ] || STATUS_CONFIG.NOT_STARTED;
              const StatusIcon = statusCfg.icon;
              const workerKey = worker.assignmentId || worker.bookingId || worker.workerId;
              const isSelected = selectedWorkerId === workerKey;
              const hasLiveGps = !!worker.currentLocation?.lat;

              return (
                <div
                  key={workerKey || idx}
                  onClick={() => setSelectedWorkerId(workerKey)}
                  className={`bg-white rounded-3xl border-2 transition-all p-4 sm:p-5 shadow-sm relative overflow-hidden ${
                    isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/10' : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    {/* Worker Initial / Photo */}
                    <div className="relative shrink-0">
                      {worker.profilePhoto ? (
                        <img
                          src={worker.profilePhoto}
                          alt={worker.workerName}
                          className="w-12 h-12 rounded-2xl object-cover border border-slate-100 shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-lg flex items-center justify-center shadow-md shadow-emerald-500/10">
                          {worker.workerName ? worker.workerName.charAt(0).toUpperCase() : `${idx + 1}`}
                        </div>
                      )}
                      <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${statusCfg.dotColor}`} />
                    </div>

                    {/* Main Worker Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <h4 className="font-black text-slate-800 text-base truncate">
                          {worker.workerName || `Worker ${idx + 1}`}
                        </h4>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2.5 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 ${statusCfg.bgColor}`}>
                            <StatusIcon size={13} />
                            {statusCfg.label}
                          </span>
                        </div>
                      </div>

                      {/* Meta Tags: Rating, Agreed Rate, Skills */}
                      <div className="flex items-center gap-2.5 flex-wrap text-xs font-bold text-slate-500 mt-1">
                        {worker.rating > 0 && (
                          <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">
                            <FiStar size={12} className="fill-amber-500" />
                            {worker.rating.toFixed(1)}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                          <FaRupeeSign size={10} />
                          {worker.agreedRate} / {worker.rateUnit || 'day'}
                        </span>
                        {worker.distanceKm !== null && worker.distanceKm !== undefined && (
                          <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">
                            {worker.distanceKm} km away
                          </span>
                        )}
                      </div>

                      {/* Location Freshness Indicator */}
                      <div className="flex items-center gap-1.5 mt-2.5 text-xs text-slate-400 font-semibold">
                        <FiRadio size={12} className={hasLiveGps || ['IN_PROGRESS', 'WORK_SUBMITTED', 'ARRIVED'].includes(worker.journeyStatus) || worker.workStatus === 'IN_PROGRESS' || worker.workStatus === 'SUBMITTED' ? 'text-emerald-500' : 'text-slate-300'} />
                        <span>
                          {['IN_PROGRESS', 'WORK_SUBMITTED'].includes(worker.journeyStatus) || worker.workStatus === 'IN_PROGRESS' || worker.workStatus === 'SUBMITTED' ? (
                            <strong className="text-emerald-700 font-bold">🟢 On Site — Working on Farm</strong>
                          ) : worker.journeyStatus === 'ARRIVED' ? (
                            <strong className="text-emerald-700 font-bold">🟢 On Site — Arrived at Farm</strong>
                          ) : worker.journeyStatus === 'COMPLETED' ? (
                            <strong className="text-slate-600 font-bold">✅ Work Completed</strong>
                          ) : hasLiveGps ? (
                            formatRelativeTime(worker.lastLocationAt)
                          ) : (
                            'Waiting for GPS location...'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Quick Phone Call Button */}
                    {worker.workerPhone && (
                      <a
                        href={`tel:${worker.workerPhone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center active:scale-95 transition-transform shrink-0"
                        title={`Call ${worker.workerName}`}
                      >
                        <FiPhone size={18} />
                      </a>
                    )}
                  </div>

                  {/* ── Visit OTP Banner for Farmer ── */}
                  {['JOURNEY_STARTED', 'ARRIVED'].includes(worker.journeyStatus) &&
                    worker.visitOtpStatus !== 'VERIFIED' &&
                    !['IN_PROGRESS', 'WORK_SUBMITTED', 'COMPLETED', 'CANCELLED'].includes(worker.journeyStatus) &&
                    !isAllCompleted && (
                    <div className={`mt-4 pt-3 border-t border-slate-100 ${worker.visitOtpStatus === 'LOCKED' ? 'bg-amber-50/70 border-amber-200' : 'bg-emerald-50/50'} -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 p-4 rounded-b-3xl flex flex-wrap items-center justify-between gap-3`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl ${worker.visitOtpStatus === 'LOCKED' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} flex items-center justify-center shrink-0`}>
                          <FiKey size={16} />
                        </div>
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-wider ${worker.visitOtpStatus === 'LOCKED' ? 'text-amber-800' : 'text-emerald-800'}`}>
                            {worker.visitOtpStatus === 'LOCKED' ? 'Visit OTP Locked (5 failed attempts)' : 'Visit Verification OTP'}
                          </p>
                          <p className={`text-xs ${worker.visitOtpStatus === 'LOCKED' ? 'text-amber-700 font-bold' : 'text-emerald-600 font-medium'}`}>
                            {worker.visitOtpStatus === 'LOCKED'
                              ? 'Generate a fresh OTP to unlock your worker'
                              : `Share this code with ${worker.workerName?.split(' ')[0]} upon arrival`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {worker.visitOtp && worker.visitOtpStatus !== 'LOCKED' && (
                          <div className="bg-white px-3.5 py-1.5 rounded-xl border border-emerald-200 shadow-sm">
                            <span className="font-mono font-black text-lg text-emerald-700 tracking-widest">
                              {worker.visitOtp}
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRegenerateVisitOtp(worker.assignmentId || worker.bookingId)}
                          disabled={regeneratingVisitOtpId === (worker.assignmentId || worker.bookingId)}
                          className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1.5"
                          title="Generate a fresh OTP code"
                        >
                          <FiRefreshCw className={`w-3.5 h-3.5 ${regeneratingVisitOtpId === (worker.assignmentId || worker.bookingId) ? 'animate-spin' : ''}`} />
                          <span>{worker.visitOtpStatus === 'LOCKED' ? 'Unlock & Re-issue' : 'New Code'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Work Proof Photo Button ── */}
                  {worker.completionProof?.fileUrl && (
                    <div className="mt-3 pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProofModal({
                            workerName: worker.workerName,
                            fileUrl: worker.completionProof.fileUrl,
                            notes: worker.completionProof.notes,
                            uploadedAt: worker.completionProof.uploadedAt
                          });
                        }}
                        className="w-full py-2.5 px-3 bg-gradient-to-r from-teal-50 to-emerald-50 hover:from-teal-100 hover:to-emerald-100 text-teal-800 border border-teal-200 rounded-2xl text-xs font-black flex items-center justify-between transition-all shadow-sm group"
                      >
                        <span className="flex items-center gap-2">
                          <FiCamera className="text-teal-600 w-4 h-4" />
                          <span>View Completed Work Proof</span>
                        </span>
                        <span className="bg-white px-2 py-0.5 rounded-lg text-[10px] font-bold text-teal-700 border border-teal-100 flex items-center gap-1 group-hover:scale-105 transition-transform">
                          <FiEye size={12} /> Open Photo
                        </span>
                      </button>
                    </div>
                  )}

                  {/* ── Working / Break Status for Farmer ── */}
                  {(worker.journeyStatus === 'IN_PROGRESS' || worker.workStatus === 'IN_PROGRESS') &&
                    !worker.completionOtp &&
                    worker.workStatus !== 'SUBMITTED' &&
                    !isAllCompleted && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {worker.breakStatus === 'ON_BREAK' ? (
                        <>
                          <div className="flex items-center gap-2 text-amber-800 font-bold">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                            <span>☕ 1-Hour Lunch Break Active (Auto-resumes in 60 mins)</span>
                          </div>
                          <button
                            type="button"
                            disabled={breakActionLoadingId === workerKey}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResumeBreak(workerKey);
                            }}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
                          >
                            {breakActionLoadingId === workerKey ? 'Resuming...' : 'Resume Early'}
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-slate-500 font-medium">
                            <FiClock className="w-4 h-4 text-amber-500 shrink-0" />
                            <span>{worker.workerName?.split(' ')[0]} is working. End OTP appears on <strong>Stop Work</strong>.</span>
                            {worker.breakDurationMinutes > 0 && (
                              <span className="text-amber-700 font-bold ml-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                ☕ Break: {worker.breakDurationMinutes}m
                              </span>
                            )}
                          </div>
                          {/* The 1-hour break is for daily bookings only */}
                          {trackingData?.bookingType === 'DAILY' && (
                            <button
                              type="button"
                              disabled={breakActionLoadingId === workerKey}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartBreak(workerKey);
                              }}
                              className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 transition-all active:scale-95 flex items-center gap-1 shadow-xs"
                            >
                              <span>{breakActionLoadingId === workerKey ? 'Pausing...' : '☕ 1-Hr Break'}</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Completion OTP Banner for Farmer ── */}
                  {worker.completionOtp &&
                    (
                      ['IN_PROGRESS', 'WORK_SUBMITTED', 'ARRIVED'].includes(worker.journeyStatus) ||
                      ['IN_PROGRESS', 'SUBMITTED'].includes(worker.workStatus)
                    ) &&
                    worker.completionStatus !== 'OTP_VERIFIED' &&
                    !['COMPLETED', 'CANCELLED'].includes(worker.journeyStatus) &&
                    !isAllCompleted && (
                    <div className="mt-3 pt-3 border-t border-slate-100 bg-emerald-50/70 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 p-4 rounded-b-3xl">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20">
                            <FiKey size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-900">End OTP</p>
                              <span className="text-[9px] font-bold bg-emerald-200/70 text-emerald-800 px-1.5 py-0.2 rounded-md">Unique</span>
                            </div>
                            <p className="text-xs text-emerald-700 font-medium leading-tight">
                              Share with {worker.workerName?.split(' ')[0]} only after verifying work
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="bg-white px-3.5 py-1.5 rounded-2xl border-2 border-emerald-300 shadow-sm">
                            <span className="font-mono font-black text-xl text-emerald-900 tracking-widest">
                              {worker.completionOtp}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard?.writeText(worker.completionOtp);
                              toastManager.success(`End OTP ${worker.completionOtp} copied!`);
                            }}
                            className="p-2.5 bg-white text-emerald-700 hover:bg-emerald-100 rounded-2xl border border-emerald-200 transition-colors shadow-sm active:scale-95"
                            title="Copy OTP"
                          >
                            <FiCopy size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

        {/* ── Farm Destination Details Card ── */}
        {destination && (
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
            <h4 className="text-xs font-black uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5">
              <FiMapPin className="text-emerald-600" />
              <span>Farm Destination</span>
            </h4>
            <p className="text-sm font-bold text-slate-800">
              {[destination.addressLine1, destination.city, destination.state, destination.pincode].filter(Boolean).join(', ') || 'Registered Farm Location'}
            </p>
          </div>
        )}
      </div>

      {/* ── Work Proof Photo Lightbox Modal ── */}
      {selectedProofModal && (
        <div 
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedProofModal(null)}
        >
          <div 
            className="bg-white rounded-3xl p-5 w-full max-w-md shadow-2xl overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <FiCamera size={16} />
                </div>
                <div>
                  <h4 className="font-black text-slate-800 text-sm">{selectedProofModal.workerName} - Work Proof</h4>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    {selectedProofModal.uploadedAt ? new Date(selectedProofModal.uploadedAt).toLocaleString('en-IN') : 'Uploaded upon completion'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedProofModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <FiX size={16} />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 aspect-video relative flex items-center justify-center">
              <img 
                src={selectedProofModal.fileUrl} 
                alt="Work Proof" 
                className="w-full h-full object-cover"
              />
            </div>

            {selectedProofModal.notes && (
              <div className="mt-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600">
                <span className="font-bold text-slate-700 block mb-0.5">Worker Notes:</span>
                {selectedProofModal.notes}
              </div>
            )}

            <button
              onClick={() => setSelectedProofModal(null)}
              className="mt-4 w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-teal-600/20 active:scale-95 transition-all"
            >
              Done / Close
            </button>
          </div>
        </div>
      )}

      {/* ── Decrease Worker Modal (DAILY only) ── */}
      <DecreaseWorkerModal
        isOpen={Boolean(decreaseTargetWorker)}
        onClose={() => setDecreaseTargetWorker(null)}
        worker={decreaseTargetWorker}
        requestId={trackingData?.requestId || id}
        onDecreased={() => fetchSnapshot(false)}
      />

      {/* ── Extension Request Modal (HOURLY & DAILY) ── */}
      <ExtensionModal
        isOpen={isExtensionModalOpen}
        onClose={() => setIsExtensionModalOpen(false)}
        requestId={trackingData?.requestId || id}
        bookingType={trackingData?.bookingType || 'HOURLY'}
        workers={workersList}
        onExtensionCreated={() => fetchSnapshot(false)}
      />

      {/* ── Add Extra Workers Modal ── */}
      <AddWorkersModal
        isOpen={isAddWorkersModalOpen}
        onClose={() => setIsAddWorkersModalOpen(false)}
        requestId={trackingData?.requestId || id}
        bookingType={trackingData?.bookingType || 'DAILY'}
        defaultRate={trackingData?.maxDailyRate || trackingData?.minDailyRate || 500}
        remainingDays={Math.max(1, (trackingData?.numberOfDays || 1) - (workersList[0]?.currentDayIndex || 1) + 1)}
        onWorkersAdded={() => fetchSnapshot(false)}
      />
    </div>
  );
};

export default BookingTrack;
