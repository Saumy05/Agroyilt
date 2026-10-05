import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPlay,
  FiPause,
  FiCheckCircle,
  FiAlertTriangle,
  FiClock,
  FiTool,
  FiCoffee,
  FiInfo,
  FiX,
  FiDollarSign,
  FiShield,
  FiActivity,
  FiKey,
  FiLock,
  FiXCircle
} from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa';
import { toastManager } from '../../utils/toastManager';
import { useSocket } from '../../context/SocketContext';
import { serviceTimerService } from '../../services/serviceTimerService';

// Pause reason presets with agriculture domain terms
const PAUSE_REASONS = [
  {
    id: 'machine_issue',
    icon: FiTool,
    titleEn: 'Machine Issue / Breakdown',
    titleHi: 'मशीन खराबी / ब्लेड जाम',
    desc: 'Engine stall, hydraulic issue, blade jam or breakdown',
    color: 'from-amber-500 to-red-500'
  },
  {
    id: 'refueling',
    icon: FiActivity,
    titleEn: 'Fuel / Maintenance',
    titleHi: 'डीजल / टायर / मेंटेनेंस',
    desc: 'Diesel refilling, air pressure, greasing',
    color: 'from-amber-500 to-yellow-500'
  },
  {
    id: 'obstacle',
    icon: FiAlertTriangle,
    titleEn: 'Field Obstacle / Jam',
    titleHi: 'खेत में रुकावट / पत्थर / पानी',
    desc: 'Stones, mud trap, field boundary wait',
    color: 'from-orange-500 to-amber-600'
  },
  {
    id: 'break',
    icon: FiCoffee,
    titleEn: 'Rest / Meal Break',
    titleHi: 'आराम / चाय-नाश्ता / लंच',
    desc: 'Operator or farmer rest break',
    color: 'from-emerald-500 to-teal-600'
  },
  {
    id: 'other',
    icon: FiInfo,
    titleEn: 'Other / Weather Issue',
    titleHi: 'अन्य कारण / मौसम',
    desc: 'Heavy rain, farmer instruction, etc.',
    color: 'from-blue-500 to-indigo-600'
  }
];

export const LiveServiceTimer = ({
  booking,
  role = 'farmer', // 'farmer' or 'vendor'
  onStatusChange = () => {},
  onStartClick
}) => {
  const socket = useSocket();
  const bookingId = booking?._id;

  // Dynamic domain label & emoji for agriculture & equipment categories
  const serviceLabel = useMemo(() => {
    const name = booking?.serviceName || booking?.equipmentId?.name || booking?.categoryId?.name || '';
    if (/tractor/i.test(name)) return 'Tractor';
    if (/harvester/i.test(name)) return 'Harvester';
    if (/rotavator/i.test(name)) return 'Rotavator';
    if (/tiller/i.test(name)) return 'Tiller';
    if (/drone/i.test(name)) return 'Drone';
    if (/labour|worker|team/i.test(name)) return 'Farm Worker';
    if (/machinery|equipment/i.test(name) || booking?.rental_type) return 'Equipment';
    return name || 'Equipment';
  }, [booking]);

  const serviceEmoji = useMemo(() => {
    const l = serviceLabel.toLowerCase();
    if (l.includes('tractor')) return '🚜';
    if (l.includes('harvester')) return '🌾';
    if (l.includes('rotavator')) return '🚜';
    if (l.includes('tiller')) return '🌱';
    if (l.includes('drone')) return '🛸';
    if (l.includes('worker') || l.includes('labour')) return '🧑‍🌾';
    return '⚙️';
  }, [serviceLabel]);

  // Local synchronized timer state
  const [timerData, setTimerData] = useState({
    status: booking?.serviceTimer?.status || 'NOT_STARTED',
    accumulatedActiveSeconds: booking?.serviceTimer?.accumulatedActiveSeconds || 0,
    accumulatedPausedSeconds: booking?.serviceTimer?.accumulatedPausedSeconds || 0,
    liveActiveSeconds: booking?.serviceTimer?.accumulatedActiveSeconds || 0,
    livePausedSeconds: booking?.serviceTimer?.accumulatedPausedSeconds || 0,
    currentSessionStartedAt: booking?.serviceTimer?.currentSessionStartedAt || null,
    currentPauseStartedAt: booking?.serviceTimer?.currentPauseStartedAt || null,
    lastPausedBy: booking?.serviceTimer?.lastPausedBy || null,
    lastPauseReason: booking?.serviceTimer?.lastPauseReason || null,
    lastPauseNotes: booking?.serviceTimer?.lastPauseNotes || null,
    resumeOtp: booking?.serviceTimer?.resumeOtp || booking?.resumeOtp || null,
    ratePerMinute: booking?.serviceTimer?.ratePerMinute || 15,
    adminBaseCharge: booking?.serviceTimer?.adminBaseCharge || booking?.visitingCharges || 0,
    billingSummary: booking?.serviceTimer?.billingSummary || null
  });

  const [loadingAction, setLoadingAction] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeOtpInput, setResumeOtpInput] = useState('');
  const [selectedReason, setSelectedReason] = useState('machine_issue');
  const [pauseNotes, setPauseNotes] = useState('');
  const [endOtp, setEndOtp] = useState('');
  const [isPartialEnd, setIsPartialEnd] = useState(false);
  const [partialReasonText, setPartialReasonText] = useState('');

  // 0. Synchronize with parent booking prop updates
  useEffect(() => {
    if (booking?.serviceTimer) {
      setTimerData(prev => ({
        ...prev,
        status: booking.serviceTimer.status || prev.status,
        accumulatedActiveSeconds: booking.serviceTimer.accumulatedActiveSeconds ?? prev.accumulatedActiveSeconds ?? 0,
        accumulatedPausedSeconds: booking.serviceTimer.accumulatedPausedSeconds ?? prev.accumulatedPausedSeconds ?? 0,
        currentSessionStartedAt: booking.serviceTimer.currentSessionStartedAt ?? prev.currentSessionStartedAt,
        currentPauseStartedAt: booking.serviceTimer.currentPauseStartedAt ?? prev.currentPauseStartedAt,
        lastPausedBy: booking.serviceTimer.lastPausedBy ?? prev.lastPausedBy,
        lastPauseReason: booking.serviceTimer.lastPauseReason ?? prev.lastPauseReason,
        lastPauseNotes: booking.serviceTimer.lastPauseNotes ?? prev.lastPauseNotes,
        resumeOtp: booking.serviceTimer.resumeOtp ?? booking.resumeOtp ?? prev.resumeOtp,
        ratePerMinute: booking.serviceTimer.ratePerMinute || prev.ratePerMinute,
        adminBaseCharge: booking.serviceTimer.adminBaseCharge ?? prev.adminBaseCharge,
        billingSummary: booking.serviceTimer.billingSummary || prev.billingSummary
      }));
    }
  }, [booking?.serviceTimer, booking?.resumeOtp]);

  // 1. Fetch authoritative status from backend on mount
  useEffect(() => {
    if (!bookingId) return;

    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const res = await serviceTimerService.getStatus(bookingId);
        if (res?.success && res.data && isMounted) {
          setTimerData(prev => ({
            ...prev,
            ...res.data,
            accumulatedActiveSeconds: res.data.accumulatedActiveSeconds ?? prev.accumulatedActiveSeconds ?? 0,
            accumulatedPausedSeconds: res.data.accumulatedPausedSeconds ?? prev.accumulatedPausedSeconds ?? 0,
          }));
        }
      } catch (err) {
        // If not started yet or 404, fallback to booking object
        console.warn('[LiveServiceTimer] Initial status fetch note:', err?.message || err);
      }
    };

    fetchStatus();

    // Join tracking/booking room for real-time socket events
    if (socket && socket.connected) {
      socket.emit('join_tracking', bookingId);
    }

    return () => {
      isMounted = false;
    };
  }, [bookingId, socket]);

  // 2. Listen to Socket.IO real-time timer updates
  useEffect(() => {
    if (!socket) return;

    const handleTimerUpdate = (payload) => {
      if (payload?.bookingId?.toString() === bookingId?.toString()) {
        console.log('⚡ [LiveServiceTimer] Socket update received:', payload.action, payload.status);
        setTimerData(prev => ({
          ...prev,
          status: payload.status,
          accumulatedActiveSeconds: payload.accumulatedActiveSeconds ?? prev.accumulatedActiveSeconds ?? 0,
          accumulatedPausedSeconds: payload.accumulatedPausedSeconds ?? prev.accumulatedPausedSeconds ?? 0,
          liveActiveSeconds: payload.accumulatedActiveSeconds ?? prev.liveActiveSeconds,
          livePausedSeconds: payload.accumulatedPausedSeconds ?? prev.livePausedSeconds,
          currentSessionStartedAt: payload.currentSessionStartedAt,
          currentPauseStartedAt: payload.currentPauseStartedAt,
          lastPausedBy: payload.lastPausedBy,
          lastPauseReason: payload.lastPauseReason,
          lastPauseNotes: payload.lastPauseNotes,
          resumeOtp: payload.status === 'RUNNING' ? null : (payload.resumeOtp !== undefined ? payload.resumeOtp : prev.resumeOtp),
          ratePerMinute: payload.ratePerMinute || prev.ratePerMinute,
          adminBaseCharge: payload.adminBaseCharge ?? prev.adminBaseCharge,
          billingSummary: payload.billingSummary || prev.billingSummary
        }));

        if (payload.action === 'PAUSE') {
          toastManager.info(
            payload.performedBy === role
              ? 'You paused the service.'
              : `Service was PAUSED by ${payload.performedBy === 'vendor' ? `${serviceLabel} Operator` : 'Farmer'}`
          );
        } else if (payload.action === 'RESUME') {
          toastManager.success(
            payload.performedBy === role
              ? 'You resumed the service.'
              : `Service was RESUMED by ${payload.performedBy === 'vendor' ? `${serviceLabel} Operator` : 'Farmer'}`
          );
        } else if (payload.action === 'END' || payload.action === 'PARTIAL_END') {
          toastManager.success('Service work ended. Final bill generated.');
          onStatusChange();
        }
      }
    };

    socket.on('service_timer_updated', handleTimerUpdate);

    return () => {
      socket.off('service_timer_updated', handleTimerUpdate);
    };
  }, [socket, bookingId, role, onStatusChange]);

  // 3. High-precision ticker for real-time seconds ticking
  useEffect(() => {
    if (timerData.status !== 'RUNNING' && timerData.status !== 'PAUSED') return;

    const interval = setInterval(() => {
      const now = Date.now();

      if (timerData.status === 'RUNNING' && timerData.currentSessionStartedAt) {
        const startMs = new Date(timerData.currentSessionStartedAt).getTime();
        const deltaSec = Math.max(0, Math.floor((now - startMs) / 1000));
        setTimerData(prev => ({
          ...prev,
          liveActiveSeconds: (prev.accumulatedActiveSeconds || 0) + deltaSec
        }));
      } else if (timerData.status === 'PAUSED' && timerData.currentPauseStartedAt) {
        const pauseMs = new Date(timerData.currentPauseStartedAt).getTime();
        const deltaSec = Math.max(0, Math.floor((now - pauseMs) / 1000));
        setTimerData(prev => ({
          ...prev,
          livePausedSeconds: (prev.accumulatedPausedSeconds || 0) + deltaSec
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timerData.status, timerData.currentSessionStartedAt, timerData.currentPauseStartedAt, timerData.accumulatedActiveSeconds, timerData.accumulatedPausedSeconds]);

  // Calculations
  const activeSecs = Math.max(0, timerData.liveActiveSeconds || 0);
  const pausedSecs = Math.max(0, timerData.livePausedSeconds || 0);
  const activeMinutes = Math.max(activeSecs > 0 ? 1 : 0, Math.ceil(activeSecs / 60));
  const pausedMinutes = Math.floor(pausedSecs / 60);

  const ratePerMinute = timerData.ratePerMinute || 15;
  const adminBase = timerData.adminBaseCharge || 0;
  const timeCharges = activeMinutes * ratePerMinute;
  const estimatedTotal = adminBase + timeCharges;

  // Format seconds to HH:MM:SS
  const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Handlers
  const handleStartTimer = async () => {
    // If work has not started (handover OTP not verified yet), open the Start OTP modal directly
    if (booking?.status?.toLowerCase() !== 'in_progress' && onStartClick) {
      onStartClick();
      return;
    }

    try {
      setLoadingAction(true);
      const res = await serviceTimerService.start(bookingId);
      if (res?.success) {
        if (res.data) {
          setTimerData(prev => ({
            ...prev,
            ...res.data,
            accumulatedActiveSeconds: res.data.accumulatedActiveSeconds ?? 0,
            accumulatedPausedSeconds: res.data.accumulatedPausedSeconds ?? 0,
            liveActiveSeconds: res.data.accumulatedActiveSeconds ?? 0,
            livePausedSeconds: res.data.accumulatedPausedSeconds ?? 0
          }));
        }
        toastManager.success('Service Timer Started!');
        if (onStatusChange) onStatusChange();
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || '';
      // If error indicates handover OTP / work not started, route to OTP verification modal
      if ((msg.toLowerCase().includes('otp') || msg.toLowerCase().includes('work has started') || msg.toLowerCase().includes('handover')) && onStartClick) {
        onStartClick();
        return;
      }
      toastManager.error(msg || 'Failed to start service timer');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConfirmPause = async () => {
    try {
      setLoadingAction(true);
      const res = await serviceTimerService.pause(bookingId, {
        reason: selectedReason,
        notes: pauseNotes
      });
      if (res?.success) {
        if (res.data) {
          setTimerData(prev => ({
            ...prev,
            ...res.data,
            accumulatedActiveSeconds: res.data.accumulatedActiveSeconds ?? prev.accumulatedActiveSeconds ?? 0,
            accumulatedPausedSeconds: res.data.accumulatedPausedSeconds ?? prev.accumulatedPausedSeconds ?? 0,
            liveActiveSeconds: res.data.accumulatedActiveSeconds ?? prev.liveActiveSeconds,
            livePausedSeconds: res.data.accumulatedPausedSeconds ?? prev.livePausedSeconds
          }));
        }
        setShowPauseModal(false);
        setPauseNotes('');
        toastManager.info('Service timer paused. Downtime will NOT be charged.');
        if (onStatusChange) onStatusChange();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to pause service');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleResumeClick = () => {
    if (role === 'vendor') {
      // If the farmer paused, vendor can resume freely (no OTP needed)
      if (timerData.lastPausedBy === 'farmer') {
        handleConfirmResume(null, true); // skip OTP check
        return;
      }
      setResumeOtpInput('');
      setShowResumeModal(true);
    } else {
      handleConfirmResume();
    }
  };

  const handleConfirmResume = async (otpOverride = null, farmerPaused = false) => {
    try {
      setLoadingAction(true);
      const otpToSend = farmerPaused ? null : (role === 'vendor' ? (otpOverride || resumeOtpInput) : null);
      if (role === 'vendor' && !farmerPaused && !otpToSend) {
        toastManager.error('Please enter the 4-digit Resume OTP from the farmer');
        setLoadingAction(false);
        return;
      }

      const res = await serviceTimerService.resume(bookingId, { otp: otpToSend });
      if (res?.success) {
        if (res.data) {
          setTimerData(prev => ({
            ...prev,
            ...res.data,
            accumulatedActiveSeconds: res.data.accumulatedActiveSeconds ?? prev.accumulatedActiveSeconds ?? 0,
            accumulatedPausedSeconds: res.data.accumulatedPausedSeconds ?? prev.accumulatedPausedSeconds ?? 0,
            liveActiveSeconds: res.data.accumulatedActiveSeconds ?? prev.liveActiveSeconds,
            livePausedSeconds: res.data.accumulatedPausedSeconds ?? prev.livePausedSeconds
          }));
        }
        setShowResumeModal(false);
        setResumeOtpInput('');
        toastManager.success('Service work resumed successfully!');
        if (onStatusChange) onStatusChange();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to resume service. Invalid OTP.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConfirmEnd = async () => {
    try {
      if (role === 'vendor') {
        const cleanOtp = (endOtp || '').toString().trim();
        if (!cleanOtp || cleanOtp.length !== 4) {
          toastManager.error('Please enter the 4-digit Completion OTP from the farmer');
          return;
        }
      }
      setLoadingAction(true);
      const res = await serviceTimerService.end(bookingId, {
        isPartial: isPartialEnd,
        reason: partialReasonText || (isPartialEnd ? 'Breakdown partial finish' : 'Completed'),
        end_otp: role === 'vendor' ? endOtp.toString().trim() : null
      });
      if (res?.success) {
        setShowEndModal(false);
        setEndOtp('');
        toastManager.success(isPartialEnd ? 'Ended with partial bill' : 'Service completed successfully!');
        if (onStatusChange) onStatusChange();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to end service');
    } finally {
      setLoadingAction(false);
    }
  };

  const activeReasonObj = useMemo(() => {
    return PAUSE_REASONS.find(r => r.id === timerData.lastPauseReason) || PAUSE_REASONS[0];
  }, [timerData.lastPauseReason]);

  // If cancelled or rejected, return clean cancelled card
  if (['cancelled', 'rejected'].includes(booking?.status?.toLowerCase()) || timerData.status === 'CANCELLED') {
    return (
      <div className="bg-gradient-to-br from-red-50 via-rose-50/60 to-white rounded-3xl p-5 border border-red-200/80 shadow-xs space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-2xs">
            <FiXCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-black text-red-950 text-sm">Booking Cancelled</h4>
            <p className="text-[11px] text-red-700 font-medium">
              {booking?.cancellationReason 
                ? `Customer cancelled: "${booking.cancellationReason}"` 
                : 'This service was cancelled by the customer. Live timer and field operations are closed.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If completed, show clean summary card
  if (timerData.status === 'COMPLETED' || booking?.status === 'completed') {
    const summary = timerData.billingSummary || {
      totalActiveMinutes: activeMinutes,
      totalPausedMinutes: pausedMinutes,
      adminBaseCharge: adminBase,
      timeCharge: timeCharges,
      finalPayable: estimatedTotal,
      isPartialEnd: false
    };

    return (
      <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-white rounded-3xl p-5 border border-emerald-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-200">
              <FiCheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-black text-gray-900 text-sm">
                {summary.isPartialEnd ? '⚠️ Service Ended (Partial Bill)' : `${serviceEmoji} ${serviceLabel} Service Completed`}
              </h4>
              <p className="text-[11px] text-emerald-700 font-medium">
                Accurate minute-based billing • No idle charge
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full uppercase tracking-wider">
            Verified
          </span>
        </div>

        {/* Breakdown statistics */}
        <div className="grid grid-cols-3 gap-2.5 text-center">
          <div className="bg-white/80 backdrop-blur-sm p-3 rounded-2xl border border-emerald-100">
            <p className="text-[10px] uppercase font-bold text-gray-400">Active Work</p>
            <p className="text-base font-black text-emerald-800 mt-0.5">{summary.totalActiveMinutes} mins</p>
          </div>
          <div className="bg-white/80 backdrop-blur-sm p-3 rounded-2xl border border-emerald-100">
            <p className="text-[10px] uppercase font-bold text-gray-400">Downtime</p>
            <p className="text-base font-black text-amber-700 mt-0.5">{summary.totalPausedMinutes} mins</p>
            <span className="text-[9px] font-bold text-emerald-600 block">₹0 Free</span>
          </div>
          <div className="bg-white/80 backdrop-blur-sm p-3 rounded-2xl border border-emerald-100">
            <p className="text-[10px] uppercase font-bold text-gray-400">Final Bill</p>
            <p className="text-base font-black text-gray-900 mt-0.5">₹{summary.finalPayable}</p>
          </div>
        </div>

        {summary.partialEndReason && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
            <strong>Note:</strong> {summary.partialEndReason}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-md shadow-gray-100 transition-all duration-300">
      {/* Top Banner indicating status */}
      <div className={`px-4 py-2.5 flex items-center justify-between border-b ${
        timerData.status === 'RUNNING'
          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
          : timerData.status === 'PAUSED'
            ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white animate-pulse'
            : 'bg-slate-100 text-slate-700'
      }`}>
        <div className="flex items-center gap-1.5">
          {timerData.status === 'RUNNING' && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
          )}
          {timerData.status === 'PAUSED' && <FiPause className="w-3.5 h-3.5 text-white" />}
          {timerData.status === 'NOT_STARTED' && <FiClock className="w-3.5 h-3.5" />}

          <span className="text-[10px] font-black uppercase tracking-wider">
            {timerData.status === 'RUNNING' && '🟢 Service Active'}
            {timerData.status === 'PAUSED' && `⏸️ Paused by ${timerData.lastPausedBy === 'vendor' ? `${serviceLabel} Operator` : 'Farmer'}`}
            {timerData.status === 'NOT_STARTED' && `${serviceEmoji} ${serviceLabel} Ready`}
          </span>
        </div>

        <div className="text-[10px] font-bold opacity-90">
          ₹{ratePerMinute}/min
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        {/* Main Digital Stopwatch Display */}
        <div className="text-center py-1">
          <p className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-0.5">
            Active Billable Work Time
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className={`text-4xl sm:text-5xl font-black font-mono tracking-wider ${
              timerData.status === 'RUNNING'
                ? 'text-emerald-950'
                : timerData.status === 'PAUSED'
                  ? 'text-amber-900'
                  : 'text-gray-400'
            }`}>
              {formatTime(activeSecs)}
            </span>
          </div>
          <p className="text-xs text-emerald-700 font-bold mt-1">
            {activeMinutes} Billable Minutes Elapsed
          </p>
        </div>

        {/* Paused Banner Alert (If Paused) */}
        {timerData.status === 'PAUSED' && (
          <div className="space-y-3">
            <div className="bg-amber-50/90 border border-amber-300/80 rounded-2xl p-4 space-y-2 text-amber-950">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <activeReasonObj.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-black text-xs">{activeReasonObj.titleEn}</h5>
                    <p className="text-[11px] text-amber-700 font-medium">{activeReasonObj.titleHi}</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-black bg-amber-200/80 px-2 py-0.5 rounded-lg text-amber-900">
                  Paused: {formatTime(pausedSecs)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-white/70 p-2 rounded-xl">
                <FiShield className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span><strong>Trust Guarantee:</strong> The farmer is NOT charged for this downtime.</span>
              </div>
            </div>

            {/* Farmer Work-Resume OTP Card (Shown securely to Farmer ONLY when vendor paused) */}
            {role === 'farmer' && (
              timerData.lastPausedBy === 'farmer' ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-emerald-900 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <FiPlay className="w-4 h-4 fill-current" />
                    </div>
                    <div>
                      <h5 className="font-bold text-xs text-emerald-950">You Paused This Work</h5>
                      <p className="text-[11px] text-emerald-700">Ready to continue? Click 'Resume Work' below, or the operator can resume once work restarts.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 rounded-2xl p-4 text-white shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                        <FiKey className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h5 className="font-black text-xs uppercase tracking-wider">Farmer Work-Resume OTP</h5>
                        <p className="text-[11px] text-amber-100">काम दोबारा शुरू करने का गुप्त कोड</p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-black/25 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                      Anti-Fraud
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-2 py-1">
                    {timerData.resumeOtp ? (
                      String(timerData.resumeOtp).split('').map((digit, i) => (
                        <div
                          key={i}
                          className="w-12 h-14 bg-white/20 backdrop-blur-md border border-white/40 rounded-xl flex items-center justify-center text-3xl font-black font-mono shadow-inner"
                        >
                          {digit}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 bg-white/20 rounded-xl font-mono font-bold text-sm">
                        Waiting for OTP...
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-center text-amber-100 font-medium bg-black/20 py-1.5 px-3 rounded-xl border border-white/10">
                    🔒 Share this 4-digit OTP with the operator <strong>ONLY</strong> when you are ready to resume work. The timer will not resume billing without this code.
                  </p>
                </div>
              )
            )}
          </div>
        )}

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-gray-50/80 p-3 rounded-2xl border border-gray-100 text-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Base Mobilization</span>
            <span className="text-sm font-black text-gray-800">₹{adminBase}</span>
          </div>
          <div className="bg-gray-50/80 p-3 rounded-2xl border border-gray-100 text-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Running Work</span>
            <span className="text-sm font-black text-emerald-700">₹{timeCharges}</span>
          </div>
          <div className="bg-emerald-50/80 p-3 rounded-2xl border border-emerald-200/80 text-center">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Current Total</span>
            <span className="text-sm font-black text-emerald-900">₹{estimatedTotal}</span>
          </div>
        </div>

        {/* Farmer Completion OTP Card - anti-fraud guarantee */}
        {role === 'farmer' && ['RUNNING', 'PAUSED'].includes(timerData.status) && (timerData.driver_end_otp || booking?.driver_end_otp) && (
          <div className="bg-gradient-to-r from-teal-700 via-emerald-700 to-green-700 rounded-2xl p-3.5 text-white shadow-md flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                <FiKey className="w-4 h-4 text-white" />
              </div>
              <div>
                <h5 className="font-black text-xs uppercase tracking-wider">Service Completion OTP (समाप्ति ओटीपी)</h5>
                <p className="text-[10px] text-teal-100">Share with operator ONLY when work is finished</p>
              </div>
            </div>
            <div className="flex items-center gap-1 font-mono font-black text-xl tracking-[0.2em] bg-black/25 px-3 py-1.5 rounded-xl border border-white/20 text-emerald-200">
              {timerData.driver_end_otp || booking?.driver_end_otp}
            </div>
          </div>
        )}

        {/* Action Controls for Both Farmer and Vendor */}
        <div className="pt-2">
          {timerData.status === 'NOT_STARTED' && (
            <button
              onClick={handleStartTimer}
              disabled={loadingAction}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 shadow-md shadow-emerald-900/10 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <FiPlay className="w-4 h-4 fill-current" />
              <span>{booking?.status?.toLowerCase() !== 'in_progress' ? 'Start Service (Verify OTP)' : 'Start Work Timer'}</span>
            </button>
          )}

          {timerData.status === 'RUNNING' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowPauseModal(true)}
                disabled={loadingAction}
                className="py-2.5 px-3 rounded-xl font-bold text-amber-900 bg-amber-100/80 hover:bg-amber-200 border border-amber-300 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 text-xs"
              >
                <FiPause className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                Pause
              </button>

              <button
                onClick={() => {
                  setIsPartialEnd(false);
                  setShowEndModal(true);
                }}
                disabled={loadingAction}
                className="py-2.5 px-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 text-xs"
              >
                <FiCheckCircle className="w-3.5 h-3.5 shrink-0" />
                Finish Work
              </button>
            </div>
          )}

          {timerData.status === 'PAUSED' && (
            <div className="space-y-2">
              {role === 'vendor' ? (
                <button
                  onClick={handleResumeClick}
                  disabled={loadingAction}
                  className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-md shadow-emerald-200 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs"
                >
                  {timerData.lastPausedBy === 'farmer'
                    ? <FiPlay className="w-3.5 h-3.5 fill-current shrink-0" />
                    : <FiKey className="w-3.5 h-3.5 shrink-0" />
                  }
                  {timerData.lastPausedBy === 'farmer' ? 'Resume Work' : 'Enter Resume OTP'}
                </button>
              ) : (
                <button
                  onClick={() => handleConfirmResume()}
                  disabled={loadingAction}
                  className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-md shadow-emerald-200 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <FiPlay className="w-3.5 h-3.5 fill-current shrink-0" />
                  Resume Work
                </button>
              )}

              <button
                onClick={() => {
                  setIsPartialEnd(true);
                  setShowEndModal(true);
                }}
                disabled={loadingAction}
                className="w-full py-2 rounded-xl font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5"
              >
                <FiAlertTriangle className="w-3 h-3 shrink-0" />
                {serviceLabel} can't continue? End with Partial Bill
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ PAUSE REASON MODAL (Both can select) ═══════ */}
      <AnimatePresence>
        {showPauseModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-base font-black text-gray-900">Pause Work Session</h3>
                  <p className="text-xs text-gray-500">Why is the {serviceLabel.toLowerCase()} stopping? Timer will stop billing.</p>
                </div>
                <button
                  onClick={() => setShowPauseModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>

              {/* Reasons List */}
              <div className="space-y-2">
                {PAUSE_REASONS.map((r) => {
                  const Icon = r.icon;
                  const isSelected = selectedReason === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedReason(r.id)}
                      className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3.5 transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-400/30 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${r.color} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-gray-900">{r.titleEn}</p>
                          <span className="text-[10px] font-bold text-gray-500">{r.titleHi}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{r.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Optional Notes */}
              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">
                  Additional Notes (Optional / विवरण)
                </label>
                <input
                  type="text"
                  value={pauseNotes}
                  onChange={(e) => setPauseNotes(e.target.value)}
                  placeholder="e.g. Hydraulic pipe repair, 15 mins expected"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Confirm Pause Button */}
              <button
                onClick={handleConfirmPause}
                disabled={loadingAction}
                className="w-full py-4 rounded-2xl font-black text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-200 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <FiPause className="w-4 h-4" />
                Confirm Pause (रोकें)
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════ END / PARTIAL BILL MODAL ═══════ */}
      <AnimatePresence>
        {showEndModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-base font-black text-gray-900">
                    {isPartialEnd ? '⚠️ End with Partial Bill (खराबी के कारण अंत)' : '🏁 Finish Work & Generate Bill'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {isPartialEnd
                      ? 'The farmer will ONLY be billed for work already done.'
                      : 'Final transparent bill based on exact working minutes.'}
                  </p>
                </div>
                <button
                  onClick={() => setShowEndModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>

              {/* Itemized Calculation Preview */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200/80 space-y-2.5">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Base Mobilization Fee (Admin managed):</span>
                  <span className="font-bold text-gray-900">₹{adminBase}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Actual Work Done ({activeMinutes} mins × ₹{ratePerMinute}/min):</span>
                  <span className="font-bold text-gray-900">₹{timeCharges}</span>
                </div>
                <div className="flex justify-between text-xs text-amber-700 bg-amber-50 p-2 rounded-xl">
                  <span>Breakdown Downtime ({pausedMinutes} mins):</span>
                  <span className="font-black text-emerald-700">₹0 (Free)</span>
                </div>
                <div className="border-t pt-2 flex justify-between items-center text-sm font-black text-gray-900">
                  <span>Total Payable:</span>
                  <span className="text-lg text-emerald-700">₹{estimatedTotal}</span>
                </div>
              </div>

              {/* Partial / Breakdown Toggle */}
              <div className="flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors">
                <label className="text-xs font-bold text-gray-700 cursor-pointer flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isPartialEnd}
                    onChange={(e) => setIsPartialEnd(e.target.checked)}
                    className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500 cursor-pointer"
                  />
                  <span>Machine breakdown / Partial work (खराबी या अधूरा काम)</span>
                </label>
                {isPartialEnd && (
                  <span className="text-[10px] font-black uppercase text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                    Partial Billing
                  </span>
                )}
              </div>

              {isPartialEnd && (
                <div>
                  <label className="text-[11px] font-bold text-gray-700 block mb-1">
                    Reason for premature end (खराबी या रुकने का कारण):
                  </label>
                  <input
                    type="text"
                    value={partialReasonText}
                    onChange={(e) => setPartialReasonText(e.target.value)}
                    placeholder={`e.g. Major ${serviceLabel.toLowerCase()} breakdown, cannot operate further`}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              )}

              {/* If Vendor is ending, verify End OTP from farmer */}
              {role === 'vendor' && (
                <div>
                  <label className="text-[11px] font-bold text-gray-700 block mb-1">
                    Farmer End OTP (किसान का समाप्ति ओटीपी) <span className="text-red-500">*</span>:
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={endOtp}
                    onChange={(e) => setEndOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Enter 4-digit code from Farmer"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-center font-mono font-black text-xl tracking-[0.25em] focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-sm placeholder:tracking-normal"
                  />
                  <p className="text-[10px] text-gray-500 mt-1 text-center font-medium">
                    Farmer must provide the 4-digit code shown on their booking screen to approve bill and completion.
                  </p>
                </div>
              )}

              <button
                onClick={handleConfirmEnd}
                disabled={loadingAction || (role === 'vendor' && (!endOtp || endOtp.trim().length !== 4))}
                className={`w-full py-4 rounded-2xl font-black text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                  isPartialEnd
                    ? 'bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 shadow-red-200'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 shadow-emerald-200'
                }`}
              >
                <FiCheckCircle className="w-5 h-5" />
                {isPartialEnd ? 'Confirm Partial Bill End (बिल समाप्त करें)' : 'Confirm & Complete (बिल बनाएं)'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════ RESUME WORK OTP MODAL (Vendor input) ═══════ */}
      <AnimatePresence>
        {showResumeModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between border-b pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shadow-amber-200">
                    <FiKey className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-900 leading-tight">Enter Customer Resume OTP</h3>
                    <p className="text-[10px] text-gray-500">किसान का रिज़्यूम ओटीपी दर्ज करें</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowResumeModal(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Ask the farmer for the 4-digit Resume OTP shown on their screen.
                </p>

                <div>
                  <label className="text-[11px] font-bold text-gray-700 block mb-1">
                    Farmer Resume OTP:
                  </label>
                  <input
                    type="number"
                    value={resumeOtpInput}
                    onChange={(e) => setResumeOtpInput(e.target.value.slice(0, 4))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && resumeOtpInput.length === 4) {
                        handleConfirmResume();
                      }
                    }}
                    placeholder="••••"
                    autoFocus
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-amber-300 text-center font-mono font-black text-2xl tracking-[0.5em] focus:border-amber-500 focus:ring-4 focus:ring-amber-200 focus:outline-none"
                  />
                </div>
              </div>

              <button
                onClick={() => handleConfirmResume()}
                disabled={loadingAction || resumeOtpInput.length < 4}
                className="w-full py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-200 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <FiPlay className="w-4 h-4 fill-current shrink-0" />
                Verify & Resume Work
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LiveServiceTimer;
