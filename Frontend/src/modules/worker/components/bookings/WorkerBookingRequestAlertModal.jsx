import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiMapPin, FiClock, FiBell, FiUser, FiCalendar, FiDollarSign, FiUsers, FiStar, FiCheck, FiShield, FiPhone, FiCheckCircle } from 'react-icons/fi';
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
  const [loadingAction, setLoadingAction] = useState(null);
  const [showRateInput, setShowRateInput] = useState(false);
  const [offeredRate, setOfferedRate] = useState(0);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [isTeamLeader, setIsTeamLeader] = useState(false);

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

  useEffect(() => {
    if (isOpen && requestData) {
      const validId = requestData.requestId || requestData._id || requestData.id;
      const hasWorkInfo = requestData.workTitle || requestData.workCategory ||
                          requestData.serviceName || requestData.title;
      if (!validId || !hasWorkInfo) {
        onClose();
        return;
      }

      if (!isExpired) {
        try {
          playAlertRing(true);
        } catch (e) {}
      } else {
        stopAlertRing();
      }
      setTimeLeft(60);
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

      // If request has expired, was already resolved, or no longer active:
      // Cleanly dismiss the modal, stop ringtone, and update UI state
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

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (timeLeft / 60) * circumference;

  const content = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]"
        >
          {/* ── HEADER SECTION ── */}
          <div className={`relative overflow-hidden p-6 flex flex-col items-center text-center ${
            isExpired
              ? 'bg-gradient-to-br from-slate-600 via-gray-700 to-slate-800'
              : isTeamInvite 
                ? 'bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-800' 
                : 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700'
          }`}>
            {/* Top Right Close Button */}
            <button
              onClick={() => {
                stopAlertRing();
                onClose();
              }}
              className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-white transition-all active:scale-95"
              aria-label="Close"
            >
              <FiX className="w-4 h-4" />
            </button>

            {/* Background Glows */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />

            {/* Icon */}
            <div className="relative mb-3">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30 shadow-inner">
                {isExpired ? (
                  <FiClock className="w-8 h-8 text-white" />
                ) : isTeamInvite ? (
                  <FiUsers className="w-8 h-8 animate-pulse text-white" />
                ) : (
                  <FiBell className="w-8 h-8 animate-bounce text-white" />
                )}
              </div>
              <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${isExpired ? 'bg-gray-400' : 'bg-emerald-400 animate-pulse'}`} />
            </div>

            <h2 className="relative z-10 text-white text-2xl font-black tracking-tight">
              {isExpired
                ? 'Booking Request Expired'
                : isTeamInvite 
                  ? 'Team Job Invitation!' 
                  : (isGroupReq && isTeamLeader ? 'Team Job Request!' : 'New Booking Request!')}
            </h2>
            <div className="relative z-10 px-4 py-1 mt-1 bg-white/20 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest">
              {isExpired
                ? 'EXPIRED / CLOSED'
                : isTeamInvite 
                  ? `Invited by ${requestData.teamLeader?.name || 'Team Leader'}` 
                  : (isGroupReq ? `${requestData.requiredWorkers || 4} Workers Needed` : 'Action Required')}
            </div>
          </div>

          {/* ── BODY SECTION ── */}
          <div className="px-6 py-5 min-h-[220px] flex flex-col bg-white flex-1 overflow-y-auto">
            {isTeamInvite ? (
              /* ── DEDICATED TEAM MEMBER INVITATION VIEW ── */
              <div className="space-y-3 mb-4">
                {/* Team Leader Banner */}
                <div className="bg-indigo-50/80 rounded-2xl p-3.5 border border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {requestData.teamLeader?.profilePicture ? (
                      <img 
                        src={requestData.teamLeader.profilePicture} 
                        alt="Leader" 
                        className="w-10 h-10 rounded-xl object-cover border border-indigo-200" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
                        {(requestData.teamLeader?.name || 'L').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-black text-indigo-950">
                          {requestData.teamLeader?.name || 'Your Team Leader'}
                        </h4>
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-indigo-200/80 text-indigo-800 rounded">
                          Leader
                        </span>
                      </div>
                      {requestData.teamLeader?.phone && (
                        <p className="text-[10px] text-indigo-600 font-semibold mt-0.5 flex items-center gap-1">
                          <FiPhone size={10} /> {requestData.teamLeader.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-indigo-700 bg-white px-2 py-1 rounded-lg border border-indigo-100 shadow-2xs">
                    Crew Job
                  </span>
                </div>

                {/* Guaranteed Rate Box - STRICT PRIVACY (Zero Budget Leakage) */}
                <div className="bg-emerald-50 rounded-2xl p-3.5 border border-emerald-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                      Your Guaranteed Pay
                    </p>
                    <p className="text-xl font-black text-emerald-950 mt-0.5">
                      ₹{teamInviteRate}
                      <span className="text-xs font-bold text-emerald-700 uppercase ml-1">
                        / {teamInviteUnit}
                      </span>
                    </p>
                    <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                      Fixed rate offered by team leader
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <FiDollarSign className="w-5 h-5" />
                  </div>
                </div>

                {/* Job Specs */}
                <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <FiUser size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Farmer / Work</p>
                      <p className="text-xs font-bold text-gray-800 truncate">
                        {requestData.farmerName || 'Farmer Client'} • <span className="text-blue-600">{requestData.workCategory || requestData.workTitle || 'Farm Work'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <FiCalendar size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Schedule</p>
                      <p className="text-xs font-bold text-gray-800">
                        {requestData.bookingType === 'DAILY'
                          ? `${requestData.numberOfDays || 1} Day(s) • Starts ${requestData.startDate ? new Date(requestData.startDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : (requestData.scheduledDate ? new Date(requestData.scheduledDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Soon')}`
                          : `${requestData.scheduledDate ? new Date(requestData.scheduledDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Today'} • ${requestData.startTime || 'Flexible'}${requestData.endTime ? ` - ${requestData.endTime}` : ''}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                      <FiMapPin size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Location</p>
                      <p className="text-xs font-bold text-gray-800 truncate">
                        {typeof requestData.location === 'object' && requestData.location !== null
                          ? [requestData.location.addressLine1, requestData.location.city, requestData.location.state].filter(Boolean).join(', ') || 'Farm Location'
                          : (requestData.location || 'Location Provided')}
                      </p>
                    </div>
                  </div>

                  {/* Skills Required if present */}
                  {Array.isArray(requestData.requiredSkills) && requestData.requiredSkills.length > 0 && (
                    <div className="pt-1 border-t border-gray-100 flex flex-wrap gap-1">
                      {requestData.requiredSkills.map((sk, i) => (
                        <span key={i} className="text-[8px] font-bold bg-white text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">
                          {sk}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── STANDARD WORKER OR TEAM LEADER VIEW ── */
              <div className="space-y-3 mb-4">
                {/* Farmer Row */}
                <div className="bg-gray-50 rounded-[2rem] p-4 border border-gray-100 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center text-xl shadow-sm border border-gray-100 text-blue-500">
                      <FiUser className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-gray-900 leading-none">{requestData.farmerName || 'Farmer'}</h4>
                      <p className="text-[11px] font-bold text-blue-600 mt-1 uppercase tracking-wider">{requestData.workCategory || requestData.workTitle || 'Farm Work'}</p>
                    </div>
                  </div>

                  <div className="h-px bg-gray-200/50 w-full" />

                  {/* Info Rows */}
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 bg-white rounded-xl shadow-xs border border-gray-100 text-emerald-500">
                        <FiDollarSign className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          {requestData.bookingType === 'DAILY' ? 'Daily Rate' : 'Hourly Rate'}
                        </p>
                        <p className="text-sm font-black text-gray-800">
                          ₹{requestData.minRate || requestData.farmerOfferedRate || 0}
                          {requestData.maxRate && requestData.maxRate > requestData.minRate ? ` - ₹${requestData.maxRate}` : ''}
                          <span className="text-[10px] text-gray-500 font-bold uppercase ml-1">
                            / {requestData.bookingType === 'DAILY' ? 'day' : 'hr'}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 bg-white rounded-xl shadow-xs border border-gray-100 text-blue-500">
                        <FiCalendar className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          {requestData.bookingType === 'DAILY' ? 'Daily Schedule' : 'Date & Time'}
                        </p>
                        <p className="text-xs font-bold text-gray-800">
                          {requestData.bookingType === 'DAILY'
                            ? `${requestData.numberOfDays || 1} Day(s) • Starts ${requestData.startDate ? new Date(requestData.startDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : (requestData.scheduledDate ? new Date(requestData.scheduledDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Soon')}`
                            : `${requestData.scheduledDate ? new Date(requestData.scheduledDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Today'} • ${requestData.startTime || 'Flexible'}${requestData.endTime ? ` - ${requestData.endTime}` : ''}`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 bg-white rounded-xl shadow-xs border border-gray-100 text-purple-500">
                        <FiMapPin className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location</p>
                        <p className="text-xs font-bold text-gray-800 truncate">
                          {typeof requestData.location === 'object' && requestData.location !== null
                            ? [requestData.location.addressLine1, requestData.location.city, requestData.location.state].filter(Boolean).join(', ') || 'Farmer Location'
                            : (requestData.location || 'Location Provided')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rate & Team Member Selection (when showRateInput is active) */}
                {showRateInput && (
                  <div className="space-y-3 mb-3 animate-fade-in">
                    {/* Rate Input */}
                    <div className="bg-emerald-50 rounded-2xl p-3.5 border border-emerald-100">
                      <label className="block text-[11px] font-black text-emerald-800 uppercase tracking-wider mb-1">
                        Your Required Rate / Worker (₹)
                      </label>
                      <input 
                        type="number" 
                        value={offeredRate}
                        onChange={(e) => setOfferedRate(e.target.value)}
                        min={requestData?.minRate || 0}
                        max={requestData?.maxRate || 0}
                        className="w-full bg-white border-2 border-emerald-200 rounded-xl px-3 py-2 text-base font-black text-emerald-900 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                      <p className="text-[10px] text-emerald-600 mt-1 font-bold">
                        Farmer's Budget: ₹{requestData?.minRate} - ₹{requestData?.maxRate}
                      </p>
                    </div>

                    {/* Team Member Selection for Team Leader */}
                    {isGroupReq && isTeamLeader && (
                      <div className="bg-blue-50/80 rounded-2xl p-3.5 border border-blue-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                            <FiUsers className="text-blue-600" /> Select Online Members
                          </span>
                          <span className="text-[10px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            {selectedMemberIds.length + 1} / {requestData.requiredWorkers || 4} Total
                          </span>
                        </div>

                        {teamMembers.length > 0 ? (
                          <>
                            <p className="text-[10px] text-blue-600 mb-2.5 font-medium">
                              Select {neededMembersCount} online member(s) matching farmer requirements:
                            </p>

                            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                              {teamMembers.map((member) => {
                                const isSelected = selectedMemberIds.includes(member._id);
                                const skills = Array.isArray(member.skills) ? member.skills : [];

                                return (
                                  <div
                                    key={member._id}
                                    onClick={() => toggleMemberSelection(member._id)}
                                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-white border-blue-500 shadow-xs'
                                        : 'bg-white/60 border-gray-200 opacity-60 hover:opacity-90'
                                    }`}
                                  >
                                    <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border text-white shrink-0 ${
                                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                                    }`}>
                                      {isSelected && <FiCheck size={10} className="stroke-[3]" />}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-bold text-gray-900 truncate">{member.name}</span>
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
                                        {member.rating > 0 && (
                                          <span className="text-[9px] font-bold text-amber-600 flex items-center gap-0.5">
                                            <FiStar size={8} className="fill-amber-500" /> {member.rating.toFixed(1)}
                                          </span>
                                        )}
                                      </div>

                                      {skills.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {skills.slice(0, 3).map((sk, i) => (
                                            <span key={i} className="text-[8px] font-bold bg-gray-100 text-gray-700 px-1 py-0.2 rounded border border-gray-200">
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
                          <div className="py-3 px-2 text-center bg-white rounded-xl border border-blue-100 mt-1">
                            <p className="text-xs font-bold text-slate-700">No Team Members Are Currently Online</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Please ask your members to open app and switch to Online status.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Expired notice banner */}
            {isExpired && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center my-3">
                <p className="text-xs font-black text-red-700">This booking request has expired.</p>
                <p className="text-[10px] font-bold text-red-500 mt-1">The scheduled booking window has already passed and this request is no longer actionable.</p>
              </div>
            )}

            {/* Timer Section - only shown for active non-expired requests */}
            {!isExpired && (
              <div className="flex items-center justify-between mt-auto pt-2">
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="20" cy="20" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="4" />
                      <circle
                        cx="20"
                        cy="20"
                        r={radius}
                        fill="none"
                        stroke={timeLeft > 15 ? (isTeamInvite ? '#4f46e5' : '#10b981') : '#ef4444'}
                        strokeWidth="4"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashoffset}
                        className="transition-all duration-1000 ease-linear"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className={`absolute text-[11px] font-black ${timeLeft > 15 ? (isTeamInvite ? 'text-indigo-600' : 'text-emerald-500') : 'text-red-500 animate-pulse'}`}>
                      {timeLeft}s
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-800">Act quickly!</p>
                    <p className="text-[9px] font-bold text-gray-400">Request will expire soon</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── ACTION BUTTONS ── */}
          <div className="px-6 pb-6 pt-2 bg-white flex gap-3 shrink-0">
            {isExpired ? (
              <button
                onClick={() => {
                  stopAlertRing();
                  onClose();
                }}
                className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black text-xs active:scale-95 transition-all border border-gray-300"
              >
                Dismiss Alert
              </button>
            ) : showRateInput ? (
              <>
                <button
                  onClick={handleReject}
                  disabled={loadingAction !== null}
                  className={`px-4 py-3.5 bg-red-50 text-red-600 rounded-2xl font-black text-xs active:scale-95 transition-all border border-red-200 hover:bg-red-100 ${loadingAction === 'reject' ? 'opacity-50' : ''}`}
                >
                  {loadingAction === 'reject' ? 'Declining...' : 'Decline'}
                </button>
                <button
                  onClick={() => setShowRateInput(false)}
                  disabled={loadingAction !== null}
                  className="px-4 py-3.5 bg-gray-50 text-gray-600 rounded-2xl font-black text-xs active:scale-95 transition-all border border-gray-200 hover:bg-gray-100"
                >
                  Back
                </button>
                <button
                  onClick={handleAccept}
                  disabled={loadingAction !== null}
                  className={`flex-1 py-3.5 text-white rounded-2xl font-black text-xs active:scale-95 transition-all shadow-lg bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-200 ${loadingAction === 'accept' ? 'opacity-50' : ''}`}
                >
                  {loadingAction === 'accept' ? 'Submitting...' : (isGroupReq && isTeamLeader ? `Submit (${selectedMemberIds.length + 1} Workers)` : 'Submit Rate')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleReject}
                  disabled={loadingAction !== null}
                  className={`flex-1 py-3.5 bg-gray-50 text-gray-600 rounded-2xl font-black text-xs active:scale-95 transition-all border border-gray-200 hover:bg-gray-100 ${loadingAction === 'reject' ? 'opacity-50' : ''}`}
                >
                  {loadingAction === 'reject' ? 'Declining...' : 'Decline'}
                </button>
                <button
                  onClick={handleAccept}
                  disabled={loadingAction !== null}
                  className={`flex-[2] py-3.5 text-white rounded-2xl font-black text-xs active:scale-95 transition-all shadow-lg ${
                    isTeamInvite 
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-200' 
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-200'
                  } ${loadingAction === 'accept' ? 'opacity-50' : ''}`}
                >
                  {isTeamInvite ? (
                    loadingAction === 'accept' ? 'Accepting...' : '✓ Accept Team Job'
                  ) : (
                    loadingAction === 'accept' ? 'Accepting...' : (isGroupReq && isTeamLeader ? 'Configure Team & Accept' : 'Accept Job')
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

