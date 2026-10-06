import React, { useState, useEffect, useMemo } from 'react';
import {
  FiClock, FiCheckCircle, FiInfo, FiKey, FiPhone,
  FiCopy, FiAlertTriangle, FiUser, FiTool, FiChevronRight
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { toastManager } from '../../../../../utils/toastManager';

/**
 * ActiveWorkMonitoringHub
 *
 * Dedicated live work monitoring card rendered on the Farmer tracking screen
 * when workers have verified Visit OTP and work is actively IN PROGRESS.
 */
const ActiveWorkMonitoringHub = ({
  trackingData,
  workers = [],
  onOpenExtensionModal
}) => {
  const [elapsed, setElapsed] = useState('00:00:00');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Filter workers who are actively working on site
  const activeWorkers = useMemo(() => {
    return workers.filter(w =>
      ['IN_PROGRESS', 'WORK_SUBMITTED'].includes(w.journeyStatus) ||
      w.workStatus === 'IN_PROGRESS' ||
      w.workStatus === 'SUBMITTED'
    );
  }, [workers]);

  const primaryWorker = activeWorkers[0] || workers[0] || {};
  const workerNames = activeWorkers.map(w => w.workerName).filter(Boolean);
  const workerNamesDisplay = workerNames.length > 0
    ? (workerNames.length === 1 ? workerNames[0] : workerNames.join(', '))
    : (primaryWorker.workerName || 'Worker');

  // Determine earliest work start time
  const startTimestamp = useMemo(() => {
    let candidate = null;
    for (const w of activeWorkers) {
      const t = w.workStartedAt || w.otpVerifiedAt;
      if (t) {
        const timeVal = new Date(t).getTime();
        if (!isNaN(timeVal) && (!candidate || timeVal < candidate)) {
          candidate = timeVal;
        }
      }
    }
    if (!candidate && primaryWorker?.workStartedAt) {
      candidate = new Date(primaryWorker.workStartedAt).getTime();
    }
    if (!candidate && primaryWorker?.otpVerifiedAt) {
      candidate = new Date(primaryWorker.otpVerifiedAt).getTime();
    }
    return candidate || Date.now();
  }, [activeWorkers, primaryWorker]);

  // Duration in minutes (defaults to 60 for hourly, or derived from durationMinutes)
  const durationMinutes = Number(trackingData?.durationMinutes) || 60;
  const isDaily = trackingData?.bookingType === 'DAILY';

  // Live stopwatch ticking every 1 second
  useEffect(() => {
    const updateStopwatch = () => {
      const now = Date.now();
      const diffMs = Math.max(0, now - startTimestamp);
      const totalSecs = Math.floor(diffMs / 1000);
      setElapsedSeconds(totalSecs);

      const hours = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
      const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
      const secs = String(totalSecs % 60).padStart(2, '0');
      setElapsed(`${hours}:${mins}:${secs}`);
    };

    updateStopwatch();
    const interval = setInterval(updateStopwatch, 1000);
    return () => clearInterval(interval);
  }, [startTimestamp]);

  // Progress and schedule metrics
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const progressPercent = Math.min(100, Math.round((elapsedMinutes / durationMinutes) * 100));
  const isOvertime = !isDaily && elapsedMinutes > durationMinutes;
  const overtimeMinutes = isOvertime ? elapsedMinutes - durationMinutes : 0;

  const startDisplay = useMemo(() => {
    try {
      return new Date(startTimestamp).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return 'Recently';
    }
  }, [startTimestamp]);

  const endEstimatedDisplay = useMemo(() => {
    try {
      const endMs = startTimestamp + (durationMinutes * 60 * 1000);
      return new Date(endMs).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return '';
    }
  }, [startTimestamp, durationMinutes]);

  const slotDescription = isDaily
    ? `Day Schedule (${trackingData?.startTime || '09:00'} - ${trackingData?.endTime || '17:00'})`
    : `${durationMinutes >= 60 ? `${(durationMinutes / 60).toFixed(durationMinutes % 60 === 0 ? 0 : 1)} Hour` : `${durationMinutes} Mins`} (ends ~${endEstimatedDisplay})`;

  // Any worker with End OTP generated (worker tapped Stop Work)
  const workerWithEndOtp = activeWorkers.find(w => Boolean(w.completionOtp)) || (primaryWorker.completionOtp ? primaryWorker : null);

  const handleCopyEndOtp = (otp) => {
    if (otp && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(otp);
      toastManager.success(`End OTP ${otp} copied to clipboard!`);
    }
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-emerald-500/20 shadow-md p-5 sm:p-6 space-y-5 relative overflow-hidden transition-all animate-fadeIn">
      {/* Decorative top accent glow */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />

      {/* ── Hub Header: Active Work Status ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <FiTool className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Active Work in Progress
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1">
              {workerNamesDisplay} is actively working on your farm
            </h3>
          </div>
        </div>

        {/* Assigned Worker Quick Contact */}
        {primaryWorker.workerPhone && (
          <a
            href={`tel:${primaryWorker.workerPhone}`}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200/60 shadow-xs active:scale-95 transition-all shrink-0"
            title={`Call ${primaryWorker.workerName || 'Worker'}`}
          >
            <FiPhone className="w-4 h-4 text-emerald-600" />
            <span>Call Worker</span>
          </a>
        )}
      </div>

      {/* ── Two-Column Grid: Live Stopwatch + Schedule ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Left Card: Live Work Stopwatch */}
        <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 rounded-2xl p-4 sm:p-5 text-white shadow-lg shadow-orange-500/15 flex flex-col justify-between border border-amber-300/30 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse shadow-sm" />
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-100">
                Live Work Timer
              </span>
            </div>
            <span className="text-[10px] bg-black/20 text-amber-100 px-2 py-0.5 rounded-md font-bold">
              Real-time sync
            </span>
          </div>

          <div className="my-1">
            <p className="text-3xl sm:text-4xl font-mono font-black tracking-wider text-white drop-shadow-sm">
              {elapsed}
            </p>
          </div>

          <div className="flex items-center justify-between text-xs text-amber-100/90 pt-2 border-t border-white/20">
            <span className="text-[11px] font-semibold">Ticking with worker app</span>
            <span className="font-bold text-white text-[11px]">🟢 Active</span>
          </div>
        </div>

        {/* Right Card: Schedule & Duration Progress */}
        <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <FiClock className="w-3.5 h-3.5 text-emerald-600" />
                Schedule & Duration
              </span>
              <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {isDaily ? 'Daily Plan' : 'Hourly Slot'}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Started:</span>
                <span className="font-black text-slate-800">{startDisplay}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Slot:</span>
                <span className="font-bold text-slate-800 text-right">{slotDescription}</span>
              </div>
            </div>
          </div>

          {/* Progress Bar (Hourly) */}
          {!isDaily && (
            <div className="mt-3 pt-2.5 border-t border-slate-200/70">
              <div className="flex justify-between items-center text-[10px] font-bold mb-1">
                <span className="text-slate-500">{elapsedMinutes}m / {durationMinutes}m elapsed</span>
                {isOvertime ? (
                  <span className="text-rose-600 font-black animate-pulse flex items-center gap-1">
                    <FiAlertTriangle size={11} /> Overtime (+{overtimeMinutes}m)
                  </span>
                ) : (
                  <span className="text-emerald-700 font-black">
                    {Math.max(0, durationMinutes - elapsedMinutes)}m remaining
                  </span>
                )}
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOvertime
                      ? 'bg-rose-500'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, progressPercent))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Next Step: End OTP Card ── */}
      {workerWithEndOtp?.completionOtp ? (
        // STATE B: Worker has stopped work → OTP is ready to share
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-400 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20">
                <FiKey className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded-md">
                  Work Stopped — Ready for Inspection
                </span>
                <h4 className="text-sm font-black text-slate-900 mt-0.5">
                  Farmer Completion OTP
                </h4>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-700">
              Only share after inspecting work
            </span>
          </div>

          <p className="text-xs text-slate-600 font-medium">
            Inspect the work done by <strong className="text-slate-800">{workerWithEndOtp.workerName}</strong>. If satisfied, share this 4-digit End OTP to release payment and complete the job:
          </p>

          <div className="bg-white rounded-2xl p-3 sm:p-4 border-2 border-emerald-300 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              {String(workerWithEndOtp.completionOtp).split('').map((digit, i) => (
                <div
                  key={i}
                  className="w-10 h-12 sm:w-12 sm:h-14 rounded-xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900 font-mono font-black text-2xl flex items-center justify-center shadow-xs"
                >
                  {digit}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleCopyEndOtp(workerWithEndOtp.completionOtp)}
              className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            >
              <FiCopy size={14} />
              <span>Copy Code</span>
            </button>
          </div>
        </motion.div>
      ) : (
        // STATE A: Worker is actively working → Informative reassurance card
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 font-bold shadow-xs">
            <FiInfo className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-slate-700 mb-0.5 flex items-center gap-1.5">
              <span>Next Step: End OTP Verification</span>
            </p>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              When <strong className="text-slate-900">{workerNamesDisplay}</strong> finishes and taps <em>"Stop Work"</em> on their phone, your 4-digit End OTP will automatically appear right here for verification and completion.
            </p>
          </div>
        </div>
      )}

      {/* ── Extend Time Action Button ── */}
      {onOpenExtensionModal && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onOpenExtensionModal}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md shadow-emerald-600/20 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <FiClock className="w-4 h-4" />
            <span>Need More Time? Extend Booking (+30 min / +1 hr)</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ActiveWorkMonitoringHub;
