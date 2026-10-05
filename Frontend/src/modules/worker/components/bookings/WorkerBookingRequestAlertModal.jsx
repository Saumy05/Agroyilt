import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  FiX,
  FiMapPin,
  FiClock,
  FiBell,
  FiUser,
  FiCalendar,
  FiUsers,
  FiStar,
  FiCheck,
  FiShield,
  FiPhone,
  FiCheckCircle,
  FiVolume2,
  FiVolumeX,
  FiCopy,
  FiArrowRight,
  FiZap,
  FiMinus,
  FiPlus,
  FiChevronRight
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { playAlertRing, stopAlertRing } from '../../../../utils/notificationSound';
import workerService from '../../../../services/workerService';
import workerRequestService from '../../../../services/workerRequestService';
import api from '../../../../services/api';
import { toastManager } from '../../../../utils/toastManager';

// Canonical date/time expiry check using Indian Standard Time (IST)
const isPastScheduledTime = (data) => {
  if (!data) return false;
  if (data.isExpired || data.status === 'expired' || data.status === 'cancelled' || data.status === 'completed') {
    return true;
  }
  try {
    const isDaily = Boolean(data.startDate || data.bookingType === 'DAILY' || data.rateUnit === 'daily');
    const now = Date.now();

    if (isDaily) {
      const dateSource = data.endDate || data.startDate;
      if (dateSource) {
        const d = new Date(dateSource);
        if (!isNaN(d.getTime())) {
          const istStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
          const expiryTime = new Date(`${istStr}T23:59:59.999+05:30`).getTime();
          if (now >= expiryTime) return true;
        }
      }
    } else {
      const dateSource = data.scheduledDate || data.date || data.startDate;
      if (dateSource) {
        const d = new Date(dateSource);
        if (!isNaN(d.getTime())) {
          const istStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
          let targetDateStr = istStr;
          let targetHours = 23;
          let targetMinutes = 59;

          if (data.endTime && typeof data.endTime === 'string') {
            const match = data.endTime.trim().match(/^(\d{1,2}):(\d{2})/);
            if (match) {
              targetHours = parseInt(match[1], 10);
              targetMinutes = parseInt(match[2], 10);
              if (data.startTime && typeof data.startTime === 'string') {
                const sMatch = data.startTime.trim().match(/^(\d{1,2}):(\d{2})/);
                if (sMatch) {
                  const sMins = parseInt(sMatch[1], 10) * 60 + parseInt(sMatch[2], 10);
                  const eMins = targetHours * 60 + targetMinutes;
                  if (eMins < sMins) {
                    const nextDay = new Date(`${istStr}T12:00:00+05:30`);
                    nextDay.setDate(nextDay.getDate() + 1);
                    targetDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(nextDay);
                  }
                }
              }
            }
          }
          const hh = String(targetHours).padStart(2, '0');
          const mm = String(targetMinutes).padStart(2, '0');
          const scheduledExpiryTime = new Date(`${targetDateStr}T${hh}:${mm}:00+05:30`).getTime();
          if (now >= scheduledExpiryTime) return true;
        }
      }
    }
  } catch (e) {
    // Fallback on error
  }
  return false;
};

const WorkerBookingRequestAlertModal = ({ isOpen, requestData, onClose, onRequestResponded }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [alertTimeout, setAlertTimeout] = useState(60); // admin-configurable timeout in seconds
  const [loadingAction, setLoadingAction] = useState(null);
  const [showRateInput, setShowRateInput] = useState(false);
  const [offeredRate, setOfferedRate] = useState(0);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [isTeamLeader, setIsTeamLeader] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const isExpired = isPastScheduledTime(requestData);

  // isTeamInvite = this worker is a TEAM MEMBER receiving an invitation from their leader
  const isTeamInvite = Boolean(
    requestData?.requestType === 'group_member_request' ||
    requestData?.requestType === 'TEAM_MEMBER_INVITATION' ||
    requestData?.isTeamInvite === true
  );

  const neededMembersCount = Math.max(0, (Number(requestData?.requiredWorkers) || 1) - 1);
  const isGroupReq = !isTeamInvite && (
    Number(requestData?.requiredWorkers) > 1 ||
    requestData?.bookingMode === 'TEAM_LEADER' ||
    requestData?.requestType === 'team_leader'
  );

  const teamInviteRate = Number(
    requestData?.offeredRate ||
    requestData?.farmerOfferedRate ||
    requestData?.minRate ||
    0
  );
  const teamInviteUnit = requestData?.rateUnit || (requestData?.bookingType === 'DAILY' ? 'day' : 'hr');

  // Estimate total earnings based on rate and shift duration
  const estimatedEarnings = useMemo(() => {
    if (!requestData) return null;
    const isDaily = Boolean(requestData.startDate || requestData.bookingType === 'DAILY' || requestData.rateUnit === 'daily');
    const rate = Number(requestData.minRate || requestData.farmerOfferedRate || requestData.offeredRate || 0);
    if (!rate) return null;

    if (isDaily) {
      const days = Number(requestData.numberOfDays) || 1;
      return {
        amount: Math.round(rate * days),
        duration: `${days} ${days === 1 ? 'Day' : 'Days'}`,
        isDaily: true
      };
    }

    if (requestData.startTime && requestData.endTime) {
      const sMatch = String(requestData.startTime).trim().match(/^(\d{1,2}):(\d{2})/);
      const eMatch = String(requestData.endTime).trim().match(/^(\d{1,2}):(\d{2})/);
      if (sMatch && eMatch) {
        let sMins = parseInt(sMatch[1], 10) * 60 + parseInt(sMatch[2], 10);
        let eMins = parseInt(eMatch[1], 10) * 60 + parseInt(eMatch[2], 10);
        if (eMins < sMins) eMins += 24 * 60; // Overnight
        const hours = (eMins - sMins) / 60;
        if (hours > 0) {
          return {
            amount: Math.round(rate * hours),
            duration: `${hours % 1 === 0 ? hours : hours.toFixed(1)} Hrs`,
            isDaily: false
          };
        }
      }
    }
    return null;
  }, [requestData]);

  // Formatted location strings
  const locationDetails = useMemo(() => {
    if (!requestData) return { primary: 'Location Provided', full: '' };
    if (typeof requestData.location === 'object' && requestData.location !== null) {
      const loc = requestData.location;
      const parts = [loc.addressLine1, loc.city, loc.state].filter(Boolean);
      return {
        primary: loc.city || loc.addressLine1 || 'Farm Location',
        full: parts.join(', ') || 'Farm Location'
      };
    }
    const locStr = String(requestData.location || 'Location Provided');
    const firstPart = locStr.split(',')[0].trim();
    return {
      primary: firstPart || locStr,
      full: locStr
    };
  }, [requestData]);

  useEffect(() => {
    if (isOpen && requestData) {
      const validId = requestData.requestId || requestData._id || requestData.id;
      const hasWorkInfo = requestData.workTitle || requestData.workCategory ||
                          requestData.serviceName || requestData.title;
      if (!validId || !hasWorkInfo) {
        onClose();
        return;
      }

      if (!isExpired && !isMuted) {
        try {
          playAlertRing(true);
        } catch (e) {}
      } else {
        stopAlertRing();
      }

      // Fetch admin-configured alert timeout (non-blocking, falls back to 60s)
      api.get('/public/config').then(res => {
        const t = Number(res.data?.settings?.workerAlertTimeoutSeconds);
        if (!isNaN(t) && t >= 10) {
          setAlertTimeout(t);
          setTimeLeft(t);
        } else {
          setTimeLeft(60);
        }
      }).catch(() => {
        setTimeLeft(60);
      });

      setOfferedRate(requestData.minRate || requestData.farmerOfferedRate || 0);

      // Only check team if NOT a team invite
      if (!isTeamInvite) {
        const loadTeamData = async () => {
          try {
            const res = await api.get('/workers/team/me');
            if (res.data?.success && res.data.team) {
              setIsTeamLeader(true);
              const rawMembers = res.data.members || [];
              
              // STRICT FILTER: Only show ONLINE / ACTIVE members
              const onlineOnlyMembers = rawMembers.filter(m => {
                const st = String(m.status || '').trim().toUpperCase();
                return ['ONLINE', 'ACTIVE', 'AVAILABLE', 'IDLE', 'FREE', 'ON_JOB'].includes(st);
              });

              setTeamMembers(onlineOnlyMembers);

              // Auto-select up to neededMembersCount online members by default
              if (onlineOnlyMembers.length > 0 && neededMembersCount > 0) {
                const defaultSelected = onlineOnlyMembers.slice(0, neededMembersCount).map(m => m._id);
                setSelectedMemberIds(defaultSelected);
              }
            }
          } catch (err) {
            console.error('[WorkerBookingAlertModal] Failed to load team:', err);
          }
        };

        loadTeamData();
      }

      let timer = null;
      if (!isExpired) {
        timer = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              handleTimeout();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }

      return () => {
        if (timer) clearInterval(timer);
        stopAlertRing();
      };
    } else {
      stopAlertRing();
    }
    return () => stopAlertRing();
  }, [isOpen, requestData, neededMembersCount, isTeamInvite, isExpired]);

  // Lock background scroll when modal is open
  const isAlertActive = isOpen && !!requestData;
  useEffect(() => {
    if (!isAlertActive) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [isAlertActive]);

  const targetRequestId = requestData?.requestId || requestData?._id || requestData?.id;

  useEffect(() => {
    if (!isOpen) return;
    const handleCancelEvent = (e) => {
      const detail = e.detail || {};
      const cId = detail.requestId || detail.bookingId || detail._id;
      if (!cId || String(cId) === String(targetRequestId)) {
        stopAlertRing();
        onClose && onClose();
      }
    };

    window.addEventListener('workerBookingCancelled', handleCancelEvent);
    window.addEventListener('workerRequestCancelled', handleCancelEvent);
    return () => {
      window.removeEventListener('workerBookingCancelled', handleCancelEvent);
      window.removeEventListener('workerRequestCancelled', handleCancelEvent);
    };
  }, [isOpen, targetRequestId, onClose]);

  const handleTimeout = () => {
    stopAlertRing();
    onClose();
  };

  const toggleMute = () => {
    if (isMuted) {
      playAlertRing(true);
      setIsMuted(false);
    } else {
      stopAlertRing();
      setIsMuted(true);
    }
  };

  const handleCopyAddress = (e) => {
    e.stopPropagation();
    if (!locationDetails.full) return;
    try {
      navigator.clipboard.writeText(locationDetails.full);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      toastManager.success('Address copied to clipboard');
    } catch {
      // Fallback
    }
  };

  const toggleMemberSelection = (memberId) => {
    setSelectedMemberIds(prev => {
      if (prev.includes(memberId)) {
        return prev.filter(id => id !== memberId);
      }
      if (prev.length >= neededMembersCount) {
        toastManager.error(`You only need to select ${neededMembersCount} members for this ${requestData.requiredWorkers}-worker job.`);
        return prev;
      }
      return [...prev, memberId];
    });
  };

  const handleAccept = async () => {
    if (!targetRequestId) {
      toastManager.error('Request ID missing');
      return;
    }

    if (loadingAction) return;

    // Team Member Accepting Leader's Job Invitation
    if (isTeamInvite) {
      setLoadingAction('accept');
      try {
        const res = await workerRequestService.memberRespondToRequest(targetRequestId, 'accept');
        if (res.success) {
          stopAlertRing();
          toastManager.success('Team Job Accepted! You are confirmed for this crew.');
          onRequestResponded && onRequestResponded();
          window.dispatchEvent(new Event('workerJobsUpdated'));
          onClose();
        } else {
          toastManager.error(res.message || 'Failed to accept team job');
        }
      } catch (error) {
        const errStatus = error?.response?.status;
        const errMsg = error?.response?.data?.message || error?.message || 'Failed to accept team job';
        toastManager.error(errMsg);
        if (errStatus === 409 || errStatus === 410 || errMsg.toLowerCase().includes('expired') || errMsg.toLowerCase().includes('already')) {
          stopAlertRing();
          onClose();
          window.dispatchEvent(new Event('workerJobsUpdated'));
        }
      } finally {
        setLoadingAction(null);
      }
      return;
    }

    // Normal Worker or Team Leader flow
    const needsConfiguration = (requestData?.isFarmerBroadcast && requestData?.maxRate && requestData?.maxRate > requestData?.minRate) ||
                              (isGroupReq && isTeamLeader && teamMembers.length > 0);

    if (!showRateInput && needsConfiguration) {
      setShowRateInput(true);
      return;
    }

    const maxBudget = Number(requestData?.maxRate || requestData?.farmerOfferedRate || requestData?.minRate || 0);
    const numericRate = Number(offeredRate) || maxBudget;

    if (maxBudget > 0 && numericRate > maxBudget) {
      toastManager.error(`Offered rate cannot exceed farmer's maximum budget of ₹${maxBudget}`);
      return;
    }

    setLoadingAction('accept');
    try {
      const payload = {
        offeredRate: numericRate,
        ...(isGroupReq && isTeamLeader && selectedMemberIds.length > 0 ? { memberIds: selectedMemberIds } : {})
      };
      const res = requestData.isFarmerBroadcast
        ? await workerService.respondToFarmerRequest(targetRequestId, 'accept', payload)
        : await workerService.respondToRequest(targetRequestId, 'accept');

      if (res.success) {
        stopAlertRing();
        toastManager.success(isGroupReq ? 'Team Proposal Submitted!' : 'Booking Request Accepted!');
        onRequestResponded && onRequestResponded();
        window.dispatchEvent(new Event('workerJobsUpdated'));
        onClose();
      } else {
        toastManager.error(res.message || 'Failed to accept request');
      }
    } catch (error) {
      const errStatus = error?.response?.status;
      const errMsg = error?.response?.data?.message || error?.message || 'Failed to accept request';
      toastManager.error(errMsg);
      if (errStatus === 410 || errStatus === 409 ||
          errMsg.toLowerCase().includes('expired') ||
          errMsg.toLowerCase().includes('already') ||
          errMsg.toLowerCase().includes('cancelled')) {
        stopAlertRing();
        onRequestResponded && onRequestResponded();
        window.dispatchEvent(new Event('workerJobsUpdated'));
        onClose();
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReject = async () => {
    if (!targetRequestId) {
      stopAlertRing();
      onClose();
      return;
    }
    if (loadingAction) return;
    setLoadingAction('reject');
    try {
      let res;
      if (isTeamInvite) {
        res = await workerRequestService.memberRespondToRequest(targetRequestId, 'reject');
      } else {
        res = requestData.isFarmerBroadcast
          ? await workerService.respondToFarmerRequest(targetRequestId, 'reject')
          : await workerService.respondToRequest(targetRequestId, 'reject');
      }

      stopAlertRing();
      toastManager.success(isTeamInvite ? 'Team Job Declined' : 'Request Declined');
      onRequestResponded && onRequestResponded();
      window.dispatchEvent(new Event('workerJobsUpdated'));
      onClose();
    } catch (error) {
      const errStatus = error?.response?.status;
      const errMsg = error?.response?.data?.message || error?.message || 'Failed to decline request';

      if (errStatus === 410 || errStatus === 409 || errStatus === 404 ||
          errMsg.toLowerCase().includes('expired') ||
          errMsg.toLowerCase().includes('already') ||
          errMsg.toLowerCase().includes('not found') ||
          errMsg.toLowerCase().includes('cancelled')) {
        stopAlertRing();
        toastManager.success('Request has been dismissed.');
        onRequestResponded && onRequestResponded();
        window.dispatchEvent(new Event('workerJobsUpdated'));
        onClose();
      } else {
        toastManager.error(errMsg);
      }
    } finally {
      setLoadingAction(null);
    }
  };

  if (!isOpen || !requestData) return null;

  // Urgency color logic
  const timerRatio = Math.max(0, Math.min(1, timeLeft / Math.max(1, alertTimeout)));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - timerRatio * circumference;

  const timerColor = timeLeft > 20
    ? '#10b981' // Vibrant Emerald
    : timeLeft > 10
      ? '#f59e0b' // Warning Amber
      : '#ef4444'; // Urgent Crimson

  const content = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4">
        {/* Dark Modern Glass Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            // Stop sound if worker clicks outside, but don't accidentally reject
            stopAlertRing();
          }}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 24 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="relative w-full max-w-[420px] bg-white rounded-[2rem] sm:rounded-[2.25rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.1)_inset] overflow-hidden flex flex-col max-h-[92vh] border border-slate-100/80"
        >
          {/* ── TOP HERO HEADER ── */}
          <div className={`relative overflow-hidden pt-6 pb-5 px-6 flex flex-col items-center text-center select-none ${
            isExpired
              ? 'bg-gradient-to-br from-slate-700 via-zinc-800 to-slate-900 text-white'
              : isTeamInvite 
                ? 'bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 text-white' 
                : 'bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-950 text-white'
          }`}>
            {/* Ambient Radial Lights */}
            <div className="absolute -top-16 -right-16 w-44 h-44 bg-white/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-teal-400/20 rounded-full blur-2xl pointer-events-none" />

            {/* Top Control Bar (Mute & Close) */}
            <div className="w-full flex items-center justify-between mb-2.5 z-20">
              {/* Mute Audio Button */}
              {!isExpired ? (
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all backdrop-blur-md active:scale-95 border ${
                    isMuted
                      ? 'bg-red-500/20 border-red-300/40 text-red-100 hover:bg-red-500/30'
                      : 'bg-white/15 border-white/20 text-white hover:bg-white/25'
                  }`}
                  title={isMuted ? 'Unmute alert ring' : 'Mute alert ring'}
                >
                  {isMuted ? <FiVolumeX className="w-3.5 h-3.5" /> : <FiVolume2 className="w-3.5 h-3.5 animate-pulse" />}
                  <span className="text-[11px]">{isMuted ? 'Muted' : 'Sound On'}</span>
                </button>
              ) : <div />}

              {/* Dismiss / Close Button */}
              <button
                type="button"
                onClick={() => {
                  stopAlertRing();
                  onClose();
                }}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all shadow-xs"
                aria-label="Close alert"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Glowing Center Bell / Radar Icon */}
            <div className="relative mb-3.5 z-10">
              {/* Animated Radar Pulse Rings */}
              {!isExpired && (
                <span className="absolute -inset-2 rounded-full bg-white/25 animate-ping opacity-40 pointer-events-none" />
              )}

              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xl border border-white/35 flex items-center justify-center text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)] relative">
                {isExpired ? (
                  <FiClock className="w-8 h-8 text-white/90" />
                ) : isTeamInvite ? (
                  <FiUsers className="w-8 h-8 text-white" />
                ) : (
                  <FiBell className="w-8 h-8 text-white" />
                )}

                {/* Status Dot */}
                <div
                  className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-xs ${
                    isExpired ? 'bg-slate-400' : 'bg-emerald-400'
                  }`}
                />
              </div>
            </div>

            {/* Header Titles */}
            <h2 className="relative z-10 text-white text-2xl font-black tracking-tight leading-tight">
              {isExpired
                ? 'Booking Request Expired'
                : isTeamInvite 
                  ? 'Team Job Invitation!' 
                  : (isGroupReq && isTeamLeader ? 'Team Crew Request!' : 'New Booking Request!')}
            </h2>

            {/* Live Status Pill with Beacon */}
            <div className="relative z-10 inline-flex items-center gap-2 px-3.5 py-1 mt-2 bg-white/15 backdrop-blur-md rounded-full border border-white/25 text-[11px] font-extrabold text-white tracking-wider uppercase shadow-xs">
              {!isExpired && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
              )}
              <span>
                {isExpired
                  ? 'Expired / Closed'
                  : isTeamInvite 
                    ? `Invited by ${requestData.teamLeader?.name || 'Leader'}` 
                    : (isGroupReq ? `${requestData.requiredWorkers || 4} Workers Needed` : 'Action Required')}
              </span>
            </div>

            {/* Animated Bottom Depletion Bar */}
            {!isExpired && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                <div
                  className="h-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${timerRatio * 100}%`,
                    backgroundColor: timerColor,
                    boxShadow: `0 0 10px ${timerColor}`
                  }}
                />
              </div>
            )}
          </div>

          {/* ── BODY CONTENT AREA ── */}
          <div className="px-5 sm:px-6 py-4 flex flex-col bg-white flex-1 overflow-y-auto min-h-[220px]">
            {isTeamInvite ? (
              /* ── DEDICATED TEAM MEMBER INVITATION VIEW ── */
              <div className="space-y-3 mb-2">
                {/* Team Leader Banner */}
                <div className="bg-indigo-50/80 rounded-2xl p-3.5 border border-indigo-100 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-3">
                    {requestData.teamLeader?.profilePicture ? (
                      <img 
                        src={requestData.teamLeader.profilePicture} 
                        alt="Leader" 
                        className="w-11 h-11 rounded-xl object-cover border border-indigo-200 shadow-xs" 
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black text-base shadow-xs">
                        {(requestData.teamLeader?.name || 'L').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-black text-indigo-950">
                          {requestData.teamLeader?.name || 'Your Team Leader'}
                        </h4>
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-indigo-200/90 text-indigo-900 rounded">
                          Leader
                        </span>
                      </div>
                      {requestData.teamLeader?.phone && (
                        <a
                          href={`tel:${requestData.teamLeader.phone}`}
                          className="text-xs text-indigo-600 font-bold mt-0.5 inline-flex items-center gap-1 hover:underline"
                        >
                          <FiPhone size={11} /> {requestData.teamLeader.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-100 shadow-2xs">
                    Crew Job
                  </span>
                </div>

                {/* Guaranteed Rate Box */}
                <div className="bg-gradient-to-br from-emerald-50 via-teal-50/60 to-emerald-50/30 rounded-2xl p-4 border border-emerald-200/80 flex items-center justify-between shadow-xs">
                  <div>
                    <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                      <FiShield className="w-3 h-3" /> Guaranteed Payment
                    </p>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-3xl font-black text-emerald-950 tracking-tight">
                        ₹{teamInviteRate}
                      </span>
                      <span className="text-xs font-bold text-emerald-700 uppercase">
                        / {teamInviteUnit}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                      Fixed rate offered by team leader
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-300/40 text-emerald-700 flex items-center justify-center font-bold text-xl shadow-2xs">
                    ₹
                  </div>
                </div>

                {/* Job Specs */}
                <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-100 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                      <FiUser size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Farmer / Work</p>
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {requestData.farmerName || 'Farmer Client'} • <span className="text-blue-600 font-extrabold">{requestData.workCategory || requestData.workTitle || 'Farm Work'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
                      <FiCalendar size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Schedule</p>
                      <p className="text-xs font-bold text-slate-800">
                        {requestData.bookingType === 'DAILY'
                          ? `${requestData.numberOfDays || 1} Day(s) • Starts ${requestData.startDate ? new Date(requestData.startDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : (requestData.scheduledDate ? new Date(requestData.scheduledDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Soon')}`
                          : `${requestData.scheduledDate ? new Date(requestData.scheduledDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Today'} • ${requestData.startTime || 'Flexible'}${requestData.endTime ? ` - ${requestData.endTime}` : ''}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100 mt-0.5">
                      <FiMapPin size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Location</p>
                        <button
                          type="button"
                          onClick={handleCopyAddress}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                        >
                          <FiCopy size={10} /> {copiedAddress ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs font-bold text-slate-800 leading-snug line-clamp-2">
                        {locationDetails.full}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── STANDARD WORKER OR TEAM LEADER VIEW ── */
              <div className="space-y-3 mb-2">
                {/* 1. HERO EARNINGS / RATE BANNER */}
                <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-emerald-500/15 rounded-2xl p-4 border border-emerald-500/25 shadow-2xs relative overflow-hidden">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-600/10 text-emerald-800 border border-emerald-600/20">
                          <FiZap className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                          {requestData.bookingType === 'DAILY' ? 'Daily Pay Rate' : 'Hourly Pay Rate'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1.5">
                        <span className="text-3xl font-black text-emerald-950 tracking-tight">
                          ₹{requestData.minRate || requestData.farmerOfferedRate || 0}
                        </span>
                        {requestData.maxRate && requestData.maxRate > requestData.minRate && (
                          <span className="text-base font-bold text-emerald-800">
                            – ₹{requestData.maxRate}
                          </span>
                        )}
                        <span className="text-xs font-extrabold text-emerald-700 uppercase">
                          / {requestData.bookingType === 'DAILY' ? 'day' : 'hr'}
                        </span>
                      </div>
                      {requestData.maxRate && requestData.maxRate > requestData.minRate && (
                        <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                          Negotiable rate within farmer's budget
                        </p>
                      )}
                    </div>

                    {/* Estimated Total Pill if available */}
                    {estimatedEarnings ? (
                      <div className="text-right bg-white/90 backdrop-blur-xs px-3 py-2 rounded-xl border border-emerald-200/80 shadow-2xs">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Est. Payout</p>
                        <p className="text-base font-black text-emerald-800">₹{estimatedEarnings.amount}</p>
                        <p className="text-[10px] font-bold text-slate-500">for {estimatedEarnings.duration}</p>
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-emerald-600/10 border border-emerald-600/20 text-emerald-700 flex items-center justify-center font-bold text-xl shadow-2xs">
                        ₹
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. FARMER & JOB DETAILS CARD */}
                <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-3">
                  {/* Farmer profile row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center shadow-xs border border-slate-200/80 text-emerald-600 font-black text-lg">
                        {(requestData.farmerName || 'F').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-black text-slate-900 leading-snug">
                            {requestData.farmerName || 'Farmer Client'}
                          </h4>
                          <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" title="Verified Farmer" />
                        </div>
                        <span className="inline-block mt-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/70">
                          {requestData.workCategory || requestData.workTitle || 'Farm Work'}
                        </span>
                      </div>
                    </div>

                    {isGroupReq && (
                      <div className="text-right">
                        <span className="text-[10px] font-extrabold uppercase px-2 py-1 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
                          {requestData.requiredWorkers || 4} Workers
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-slate-200/60 w-full" />

                  {/* Schedule Row */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-slate-200/80 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                      <FiCalendar className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        {requestData.bookingType === 'DAILY' ? 'Daily Schedule' : 'Date & Time'}
                      </p>
                      <p className="text-xs font-bold text-slate-800 leading-snug mt-0.5">
                        {requestData.bookingType === 'DAILY'
                          ? `${requestData.numberOfDays || 1} Day(s) • Starts ${requestData.startDate ? new Date(requestData.startDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : (requestData.scheduledDate ? new Date(requestData.scheduledDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Soon')}`
                          : `${requestData.scheduledDate ? new Date(requestData.scheduledDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Today'} • ${requestData.startTime || 'Flexible'}${requestData.endTime ? ` - ${requestData.endTime}` : ''}`}
                      </p>
                    </div>
                  </div>

                  {/* Location Row */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-slate-200/80 flex items-center justify-center text-rose-500 shrink-0 mt-0.5">
                      <FiMapPin className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Location</p>
                        <button
                          type="button"
                          onClick={handleCopyAddress}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
                        >
                          <FiCopy size={10} /> {copiedAddress ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs font-bold text-slate-800 leading-snug mt-0.5 line-clamp-2">
                        {locationDetails.full}
                      </p>
                    </div>
                  </div>

                  {/* Skills badges if provided */}
                  {Array.isArray(requestData.requiredSkills) && requestData.requiredSkills.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/50 flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Skills:</span>
                      {requestData.requiredSkills.map((sk, i) => (
                        <span key={i} className="text-[9px] font-bold bg-white text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                          {sk}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. CONFIGURATION DRAWER (Rate negotiation & Team Selection) */}
                {showRateInput && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 pt-2"
                  >
                    {/* Rate Input Card */}
                    <div className="bg-emerald-50/90 rounded-2xl p-4 border border-emerald-200 shadow-2xs">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                          Your Required Rate (₹ / {requestData.bookingType === 'DAILY' ? 'day' : 'hr'})
                        </label>
                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                          Max: ₹{requestData?.maxRate || requestData?.minRate || 0}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => setOfferedRate(prev => Math.max(Number(requestData?.minRate || 0), Number(prev) - 10))}
                          className="w-10 h-10 rounded-xl bg-white border border-emerald-300 text-emerald-800 flex items-center justify-center font-bold active:scale-95 shadow-2xs"
                        >
                          <FiMinus size={14} />
                        </button>

                        <div className="relative flex-1">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-emerald-700 text-lg">₹</span>
                          <input 
                            type="number" 
                            value={offeredRate}
                            onChange={(e) => setOfferedRate(e.target.value)}
                            min={requestData?.minRate || 0}
                            max={requestData?.maxRate || 0}
                            className="w-full bg-white border-2 border-emerald-300 rounded-xl pl-8 pr-3 py-2 text-lg font-black text-emerald-950 focus:outline-none focus:border-emerald-600 transition-colors shadow-inner"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setOfferedRate(prev => Math.min(Number(requestData?.maxRate || 9999), Number(prev) + 10))}
                          className="w-10 h-10 rounded-xl bg-white border border-emerald-300 text-emerald-800 flex items-center justify-center font-bold active:scale-95 shadow-2xs"
                        >
                          <FiPlus size={14} />
                        </button>
                      </div>

                      <p className="text-[10px] text-emerald-700 mt-2 font-semibold">
                        Farmer Budget Range: ₹{requestData?.minRate} – ₹{requestData?.maxRate}
                      </p>
                    </div>

                    {/* Team Member Selection for Team Leader */}
                    {isGroupReq && isTeamLeader && (
                      <div className="bg-blue-50/90 rounded-2xl p-4 border border-blue-200 shadow-2xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-black uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                            <FiUsers className="text-blue-600" /> Select Crew Members
                          </span>
                          <span className="text-[10px] font-black text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                            {selectedMemberIds.length + 1} / {requestData.requiredWorkers || 4} Confirmed
                          </span>
                        </div>

                        {teamMembers.length > 0 ? (
                          <>
                            <p className="text-[11px] text-blue-700 mb-2.5 font-medium">
                              Select {neededMembersCount} online member(s) to dispatch for this job:
                            </p>

                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                              {teamMembers.map((member) => {
                                const isSelected = selectedMemberIds.includes(member._id);
                                const skills = Array.isArray(member.skills) ? member.skills : [];

                                return (
                                  <div
                                    key={member._id}
                                    onClick={() => toggleMemberSelection(member._id)}
                                    className={`flex items-start gap-3 p-2.5 rounded-xl border-2 transition-all cursor-pointer select-none ${
                                      isSelected
                                        ? 'bg-white border-blue-600 shadow-xs'
                                        : 'bg-white/70 border-slate-200 opacity-70 hover:opacity-100'
                                    }`}
                                  >
                                    <div className={`w-5 h-5 rounded-md mt-0.5 flex items-center justify-center border text-white shrink-0 transition-colors ${
                                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
                                    }`}>
                                      {isSelected && <FiCheck size={12} className="stroke-[3]" />}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-black text-slate-900 truncate">{member.name}</span>
                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                                        </span>
                                        {member.rating > 0 && (
                                          <span className="text-[10px] font-bold text-amber-600 flex items-center gap-0.5">
                                            <FiStar size={9} className="fill-amber-500" /> {member.rating.toFixed(1)}
                                          </span>
                                        )}
                                      </div>

                                      {skills.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                          {skills.slice(0, 3).map((sk, i) => (
                                            <span key={i} className="text-[8px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                              {sk}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="py-3 px-3 text-center bg-white rounded-xl border border-blue-100 mt-1">
                            <p className="text-xs font-bold text-slate-700">No Team Members Are Currently Online</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Ask your crew members to open their app and switch to Online status.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}

            {/* Expired notice banner */}
            {isExpired && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center my-3">
                <p className="text-xs font-black text-rose-800">This booking request has expired.</p>
                <p className="text-[10px] font-bold text-rose-600 mt-1">The scheduled booking window has already passed and this request is no longer actionable.</p>
              </div>
            )}

            {/* 4. COUNTDOWN TIMER ROW */}
            {!isExpired && (
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="relative w-11 h-11 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="22" cy="22" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
                      <circle
                        cx="22"
                        cy="22"
                        r={radius}
                        fill="none"
                        stroke={timerColor}
                        strokeWidth="3.5"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashoffset}
                        className="transition-all duration-1000 ease-linear"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span
                      className="absolute text-xs font-black"
                      style={{ color: timerColor }}
                    >
                      {timeLeft}s
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 leading-none">
                      {timeLeft <= 10 ? 'Hurry! Expiring now' : 'Act quickly!'}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      Auto-dismisses in {timeLeft} seconds
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80">
                    Live Broadcast
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── ACTION BUTTONS ── */}
          <div className="px-5 sm:px-6 pb-6 pt-3 bg-white border-t border-slate-100 flex items-center gap-3 shrink-0">
            {isExpired ? (
              <button
                type="button"
                onClick={() => {
                  stopAlertRing();
                  onClose();
                }}
                className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-xs sm:text-sm active:scale-98 transition-all border border-slate-200"
              >
                Dismiss Alert
              </button>
            ) : showRateInput ? (
              <>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={loadingAction !== null}
                  className={`px-4 py-3.5 bg-rose-50 text-rose-600 rounded-2xl font-extrabold text-xs active:scale-98 transition-all border border-rose-200 hover:bg-rose-100 ${loadingAction === 'reject' ? 'opacity-50' : ''}`}
                >
                  {loadingAction === 'reject' ? 'Declining...' : 'Decline'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRateInput(false)}
                  disabled={loadingAction !== null}
                  className="px-4 py-3.5 bg-slate-100 text-slate-700 rounded-2xl font-extrabold text-xs active:scale-98 transition-all border border-slate-200 hover:bg-slate-200"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={loadingAction !== null}
                  className={`flex-1 py-3.5 text-white rounded-2xl font-black text-xs sm:text-sm active:scale-98 transition-all shadow-lg bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/25 flex items-center justify-center gap-1.5 ${loadingAction === 'accept' ? 'opacity-50' : ''}`}
                >
                  {loadingAction === 'accept' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <FiCheck size={16} />
                      <span>
                        {isGroupReq && isTeamLeader ? `Submit (${selectedMemberIds.length + 1} Workers)` : 'Submit Offer'}
                      </span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={loadingAction !== null}
                  className={`flex-1 py-3.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 rounded-2xl font-extrabold text-xs sm:text-sm active:scale-98 transition-all border border-slate-200 hover:border-rose-200 flex items-center justify-center gap-1.5 shadow-2xs ${loadingAction === 'reject' ? 'opacity-50' : ''}`}
                >
                  <FiX size={15} />
                  <span>{loadingAction === 'reject' ? 'Declining...' : 'Decline'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={loadingAction !== null}
                  className={`flex-[1.6] py-3.5 text-white rounded-2xl font-black text-xs sm:text-sm active:scale-98 transition-all shadow-lg flex items-center justify-center gap-2 group ${
                    isTeamInvite 
                      ? 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-slate-900 shadow-indigo-500/25 hover:from-indigo-500' 
                      : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/30'
                  } ${loadingAction === 'accept' ? 'opacity-50' : ''}`}
                >
                  {loadingAction === 'accept' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Accepting...</span>
                    </>
                  ) : isTeamInvite ? (
                    <>
                      <FiCheck size={16} />
                      <span>Accept Team Job</span>
                    </>
                  ) : isGroupReq && isTeamLeader ? (
                    <>
                      <span>Configure Team</span>
                      <FiChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                    </>
                  ) : (
                    <>
                      <FiCheck size={16} />
                      <span>Accept Job</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default WorkerBookingRequestAlertModal;
