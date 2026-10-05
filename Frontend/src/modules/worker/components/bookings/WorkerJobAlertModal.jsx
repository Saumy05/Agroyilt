import React, { useState, useEffect } from 'react';
import {
  FiX,
  FiMapPin,
  FiClock,
  FiBriefcase,
  FiVolume2,
  FiVolumeX,
  FiCheck,
  FiCopy,
  FiCalendar,
  FiZap,
  FiArrowRight,
  FiCheckCircle
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { playAlertRing, stopAlertRing } from '../../../../utils/notificationSound';
import workerService from '../../../../services/workerService';
import { toastManager } from '../../../../utils/toastManager';

const WorkerJobAlertModal = ({ isOpen, jobId, onClose, onJobAccepted }) => {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  useEffect(() => {
    if (isOpen && jobId) {
      loadJobDetails();
      if (!isMuted) {
        try {
          playAlertRing(true);
        } catch (e) {}
      }
    } else {
      stopAlertRing();
      setJob(null);
    }
    return () => stopAlertRing();
  }, [isOpen, jobId, isMuted]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (!isOpen || !jobId) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [isOpen, jobId]);

  const loadJobDetails = async () => {
    try {
      setLoading(true);
      const res = await workerService.getJobById(jobId);
      if (res.success) {
        setJob(res.data);
      }
    } catch (error) {
      console.error(error);
      toastManager.error('Failed to load job details');
    } finally {
      setLoading(false);
    }
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

  const handleCopyAddress = (fullAddress) => {
    if (!fullAddress) return;
    try {
      navigator.clipboard.writeText(fullAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      toastManager.success('Address copied to clipboard');
    } catch {
      // Fallback
    }
  };

  const handleAccept = async () => {
    if (actionLoading) return;
    setActionLoading('accept');
    try {
      const res = await workerService.respondToJob(jobId, 'ACCEPTED');
      if (res.success) {
        stopAlertRing();
        toastManager.success('Job Accepted Successfully!');
        onJobAccepted && onJobAccepted(jobId);
        onClose();
      } else {
        toastManager.error(res.message || 'Failed to accept job');
      }
    } catch (error) {
      toastManager.error('Failed to accept job');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (actionLoading) return;
    setActionLoading('reject');
    try {
      const res = await workerService.respondToJob(jobId, 'REJECTED');
      if (res.success) {
        stopAlertRing();
        toastManager.success('Job Declined');
        onClose();
      } else {
        toastManager.error(res.message || 'Failed to reject job');
      }
    } catch (error) {
      toastManager.error('Failed to decline job');
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  const fullAddress = typeof job?.address === 'string'
    ? job.address
    : (job?.address?.addressLine1 || job?.location?.address || 'Address provided on assignment');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => stopAlertRing()}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="relative w-full max-w-[420px] bg-white rounded-[2rem] sm:rounded-[2.25rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.1)_inset] overflow-hidden flex flex-col max-h-[92vh] border border-slate-100/80"
        >
          {/* Header Section */}
          <div className="relative pt-6 pb-5 px-6 bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-950 text-white flex flex-col items-center text-center select-none overflow-hidden">
            {/* Ambient Radial Highlights */}
            <div className="absolute -top-16 -right-16 w-44 h-44 bg-white/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-teal-400/20 rounded-full blur-2xl pointer-events-none" />

            {/* Top Control Bar (Mute & Close) */}
            <div className="w-full flex items-center justify-between mb-2.5 z-20">
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

              <button
                type="button"
                onClick={() => {
                  stopAlertRing();
                  onClose();
                }}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all shadow-xs"
                aria-label="Close"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Glowing Briefcase Icon */}
            <div className="relative mb-3.5 z-10">
              <span className="absolute -inset-2 rounded-full bg-white/25 animate-ping opacity-40 pointer-events-none" />
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xl border border-white/35 flex items-center justify-center text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)] relative">
                <FiBriefcase className="w-8 h-8 text-white" />
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white shadow-xs" />
              </div>
            </div>

            <h2 className="relative z-10 text-white text-2xl font-black tracking-tight leading-tight">
              New Job Assigned!
            </h2>

            {/* Live Status Pill with Beacon */}
            <div className="relative z-10 inline-flex items-center gap-2 px-3.5 py-1 mt-2 bg-white/15 backdrop-blur-md rounded-full border border-white/25 text-[11px] font-extrabold text-white tracking-wider uppercase shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <span>Direct Job Assignment</span>
            </div>
          </div>

          {/* Body Section */}
          <div className="px-5 sm:px-6 py-4 flex flex-col bg-white flex-1 overflow-y-auto min-h-[220px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-slate-500">Retrieving job details...</p>
              </div>
            ) : job ? (
              <div className="space-y-3">
                {/* 1. Job Title & Customer Card */}
                <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-emerald-500/15 rounded-2xl p-4 border border-emerald-500/25 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xs border border-slate-200/80 shrink-0">
                      {job.serviceId?.iconUrl ? (
                        <img src={job.serviceId.iconUrl} alt="Service" className="w-8 h-8 object-contain" />
                      ) : (
                        <FiBriefcase className="w-6 h-6 text-emerald-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-base font-black text-slate-900 leading-snug truncate">
                          {job.serviceType || job.serviceId?.title || 'Agriculture Service'}
                        </h4>
                        <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" title="Verified" />
                      </div>
                      <p className="text-xs font-bold text-slate-600 mt-0.5">
                        Client: <span className="text-slate-900 font-extrabold">{job.customerName || job.userId?.name || 'Farmer Client'}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Specs (Schedule & Location) */}
                <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-3">
                  {/* Schedule */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-slate-200/80 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                      <FiCalendar className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Scheduled Date & Time</p>
                      <p className="text-xs font-bold text-slate-800 leading-snug mt-0.5">
                        {job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Today'} • {job.scheduledTime || 'Flexible'}
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-slate-200/60 w-full" />

                  {/* Location */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-slate-200/80 flex items-center justify-center text-rose-500 shrink-0 mt-0.5">
                      <FiMapPin className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Location</p>
                        <button
                          type="button"
                          onClick={() => handleCopyAddress(fullAddress)}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
                        >
                          <FiCopy size={10} /> {copiedAddress ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs font-bold text-slate-800 leading-snug mt-0.5 line-clamp-2">
                        {fullAddress}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-xs font-black text-rose-600">Failed to load job data.</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="px-5 sm:px-6 pb-6 pt-3 bg-white border-t border-slate-100 flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleReject}
              disabled={actionLoading !== null}
              className={`flex-1 py-3.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 rounded-2xl font-extrabold text-xs sm:text-sm active:scale-98 transition-all border border-slate-200 hover:border-rose-200 flex items-center justify-center gap-1.5 shadow-2xs ${actionLoading === 'reject' ? 'opacity-50' : ''}`}
            >
              <FiX size={15} />
              <span>{actionLoading === 'reject' ? 'Declining...' : 'Decline'}</span>
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={actionLoading !== null}
              className={`flex-[1.6] py-3.5 text-white rounded-2xl font-black text-xs sm:text-sm active:scale-98 transition-all shadow-lg bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/30 flex items-center justify-center gap-2 group ${actionLoading === 'accept' ? 'opacity-50' : ''}`}
            >
              {actionLoading === 'accept' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Accepting...</span>
                </>
              ) : (
                <>
                  <FiCheck size={16} />
                  <span>Accept Job</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default WorkerJobAlertModal;
