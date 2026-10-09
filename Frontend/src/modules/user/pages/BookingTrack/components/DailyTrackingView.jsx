import React, { useState, useEffect } from 'react';
import {
  FiCalendar, FiClock, FiCheck, FiUsers, FiUserX,
  FiPlus, FiKey, FiAlertCircle, FiArrowRight, FiShield, FiCopy,
  FiCoffee, FiPlay, FiPause
} from 'react-icons/fi';

const BreakCountdown = ({ breakStartedAt, breakMaxMinutes = 60, onComplete }) => {
  const [remainingSecs, setRemainingSecs] = useState(0);

  useEffect(() => {
    if (!breakStartedAt) return;
    const startMs = new Date(breakStartedAt).getTime();
    const totalMs = (breakMaxMinutes || 60) * 60 * 1000;

    const tick = () => {
      const elapsedMs = Date.now() - startMs;
      const leftMs = Math.max(0, totalMs - elapsedMs);
      const secs = Math.floor(leftMs / 1000);
      setRemainingSecs(secs);
      if (secs <= 0 && onComplete) onComplete();
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [breakStartedAt, breakMaxMinutes, onComplete]);

  const mins = String(Math.floor(remainingSecs / 60)).padStart(2, '0');
  const secs = String(remainingSecs % 60).padStart(2, '0');

  return (
    <span className="font-mono font-black text-amber-900 text-sm tracking-wider">
      {mins}:{secs}
    </span>
  );
};

/**
 * DailyTrackingView
 *
 * Dedicated component for Farmer tracking screen when bookingType === 'DAILY'.
 * Displays multi-day progress, 9-hour daily shift info, break controls & timer,
 * per-day Reach/Visit OTPs, Completion OTPs, worker decrease actions, and extension controls.
 */
const DailyTrackingView = ({
  trackingData,
  workers = [],
  onDecreaseClick,
  onRequestExtensionClick,
  onAddWorkersClick,
  onGenerateCompletionOtp,
  onRegenerateVisitOtp,
  onStartBreak,
  onResumeBreak,
  breakLoadingId
}) => {
  const totalDays = Number(trackingData?.numberOfDays) || 1;
  const currentDay = Math.max(1, Math.max(...workers.map(w => w.currentDayIndex || 1)));

  return (
    <div className="space-y-4">
      {/* ── Multi-Day Progress Banner ─────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm">
              <FiCalendar size={16} />
            </span>
            <div>
              <h3 className="font-black text-slate-800 text-sm">Daily Schedule Progress</h3>
              <p className="text-[11px] text-slate-500">
                Day {currentDay} of {totalDays} total days • 9-Hr Shift (8 hrs work + 1 hr lunch break)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">

            {onAddWorkersClick && (
              <button
                type="button"
                id="add-extra-workers-btn"
                onClick={onAddWorkersClick}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-2xl border border-amber-200 flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <FiUsers size={14} className="text-amber-700" />
                <span>+ Add Workers</span>
              </button>
            )}

            <button
              type="button"
              id="request-daily-extension-btn"
              onClick={onRequestExtensionClick}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-2xl border border-emerald-200 flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
            >
              <FiPlus size={14} />
              <span>Extend Days</span>
            </button>
          </div>
        </div>

        {/* Day timeline bubbles */}
        <div className="flex items-center gap-2 overflow-x-auto py-2">
          {Array.from({ length: totalDays }).map((_, idx) => {
            const dayNum = idx + 1;
            const isPast = dayNum < currentDay;
            const isCurrent = dayNum === currentDay;
            const isFuture = dayNum > currentDay;

            return (
              <div
                key={dayNum}
                className={`flex-1 min-w-[70px] p-2.5 rounded-2xl border text-center transition-all ${
                  isCurrent
                    ? 'border-emerald-500 bg-emerald-50 shadow-xs'
                    : isPast
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                <span className={`text-[10px] font-black uppercase block ${
                  isCurrent ? 'text-emerald-700' : 'text-slate-400'
                }`}>
                  Day {dayNum}
                </span>
                <span className={`text-xs font-black ${
                  isCurrent ? 'text-emerald-900' : 'text-slate-600'
                }`}>
                  {isPast ? 'Done' : isCurrent ? 'Active' : 'Upcoming'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Active Workers Daily Attendance List ──────────────────────────── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
            <FiUsers size={16} className="text-emerald-600" /> Today's Worker Attendance
          </h3>
          <span className="text-[11px] font-bold text-slate-400">
            {workers.filter(w => !w.isDecreased).length} active workers
          </span>
        </div>

        <div className="space-y-3">
          {workers.map((w) => {
            const isDecreased = Boolean(w.isDecreased);
            const isFinished = w.journeyStatus === 'COMPLETED' || w.settlementStatus === 'SETTLED';
            const isInProgress = w.journeyStatus === 'IN_PROGRESS' || w.workStatus === 'IN_PROGRESS';
            // worker tapped Stop Work for today → the End OTP can be shared
            const isStopped = !isFinished && (w.journeyStatus === 'WORK_SUBMITTED' || w.workStatus === 'SUBMITTED');
            const isArrived = w.journeyStatus === 'ARRIVED';
            const isJourneyStarted = w.journeyStatus === 'JOURNEY_STARTED';

            // OTPs (the server sends them to the farmer only when they may be shared)
            const visitOtp = w.visitOtp;
            const completionOtp = w.completionOtp;

            return (
              <div
                key={w.assignmentId || w.workerId}
                className={`p-4 rounded-3xl border transition-all ${
                  isDecreased
                    ? 'bg-amber-50/40 border-amber-200'
                    : isFinished
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                {/* Worker Top Bar */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center font-bold text-slate-600 text-sm">
                      {w.profilePhoto ? (
                        <img src={w.profilePhoto} alt={w.workerName} className="w-full h-full object-cover" />
                      ) : (
                        w.workerName?.charAt(0) || 'W'
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-sm text-slate-900">{w.workerName}</h4>
                        {isDecreased && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                            Ending Today
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {w.workerPhone ? `${w.workerPhone} • ` : ''}Rate: ₹{w.agreedRate}/day
                      </p>
                    </div>
                  </div>

                  {/* Days worked badge */}
                  <span className="text-[11px] font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                    {w.workedDays || 0} / {w.bookedDays || totalDays} days
                  </span>
                </div>

                {/* Status Indicator */}
                <div className="bg-slate-50 rounded-2xl p-3 mb-3 border border-slate-100">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-500 font-medium">Day Status:</span>
                    <span className={`font-black uppercase text-[10px] px-2 py-0.5 rounded-full ${
                      isFinished
                        ? 'bg-emerald-100 text-emerald-800'
                        : isStopped
                        ? 'bg-indigo-100 text-indigo-800'
                        : isInProgress
                        ? 'bg-blue-100 text-blue-800'
                        : isArrived
                        ? 'bg-purple-100 text-purple-800'
                        : isJourneyStarted
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {w.journeyStatus?.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Reach OTP Box */}
                  {(isJourneyStarted || isArrived) && (visitOtp || w.visitOtpStatus === 'LOCKED') && (
                    <div className="mt-2 p-2.5 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FiKey className="text-purple-600" size={14} />
                        <span className="text-xs text-purple-900 font-bold">
                          {w.visitOtpStatus === 'LOCKED' ? 'Reach OTP Locked:' : 'Today’s Reach OTP:'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {visitOtp && w.visitOtpStatus !== 'LOCKED' && (
                          <span className="text-base font-black font-mono tracking-widest text-purple-700 bg-white px-2.5 py-0.5 rounded-lg border border-purple-200">
                            {visitOtp}
                          </span>
                        )}
                        {onRegenerateVisitOtp && (
                          <button
                            type="button"
                            onClick={() => onRegenerateVisitOtp(w.assignmentId || w.bookingId)}
                            className="px-2.5 py-1 bg-white hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-lg border border-purple-200 transition-all active:scale-95 shadow-xs"
                            title="Regenerate Visit OTP"
                          >
                            {w.visitOtpStatus === 'LOCKED' ? 'Unlock OTP' : 'New Code'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Break Status / Active Break Card */}
                  {isInProgress && !isStopped && w.breakStatus === 'ON_BREAK' && (
                    <div className="mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-fadeIn">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                          <FiCoffee size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-amber-900">☕ 1-Hour Lunch Break Active</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-200/70 text-amber-900 rounded-full">
                              Started by {w.lastBreakStartedBy === 'worker' ? 'Worker' : 'You'}
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-700 flex items-center gap-1.5 mt-0.5">
                            <span>Remaining:</span>
                            <BreakCountdown
                              breakStartedAt={w.breakStartedAt}
                              breakMaxMinutes={w.breakMaxMinutes || 60}
                              onComplete={() => onResumeBreak && onResumeBreak(w.assignmentId || w.bookingId)}
                            />
                            <span className="text-amber-600 text-[10px]">• Auto-resumes after 60 mins</span>
                          </p>
                        </div>
                      </div>

                      {onResumeBreak && (
                        <button
                          type="button"
                          disabled={breakLoadingId === (w.assignmentId || w.bookingId)}
                          onClick={() => onResumeBreak(w.assignmentId || w.bookingId)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1.5 shrink-0 justify-center"
                        >
                          <FiPlay size={13} />
                          <span>{breakLoadingId === (w.assignmentId || w.bookingId) ? 'Resuming...' : 'Resume Work Early'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Working now hint & Start Break button */}
                  {isInProgress && !isStopped && w.breakStatus !== 'ON_BREAK' && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div className="text-[11px] text-slate-500 font-medium">
                        <span>Working actively. Today’s End OTP appears when {w.workerName?.split(' ')[0] || 'worker'} taps Stop Work.</span>
                        {w.breakDurationMinutes > 0 && (
                          <span className="text-amber-700 font-bold ml-1.5 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            ☕ Break taken: {w.breakDurationMinutes}m
                          </span>
                        )}
                      </div>

                      {onStartBreak && (
                        <button
                          type="button"
                          disabled={breakLoadingId === (w.assignmentId || w.bookingId)}
                          onClick={() => onStartBreak(w.assignmentId || w.bookingId)}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 transition-all active:scale-95 flex items-center gap-1.5 shadow-xs"
                          title="Pause for 1-hour lunch / rest break"
                        >
                          <FiCoffee size={13} className="text-amber-700" />
                          <span>{breakLoadingId === (w.assignmentId || w.bookingId) ? 'Pausing...' : '☕ 1-Hr Lunch Break'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* End OTP Box */}
                  {isStopped && completionOtp && (
                    <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FiShield className="text-emerald-600" size={14} />
                        <span className="text-xs text-emerald-900 font-bold">Today’s End OTP:</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-black font-mono tracking-widest text-emerald-700 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-200">
                          {completionOtp}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(completionOtp);
                          }}
                          className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors"
                          title="Copy OTP"
                        >
                          <FiCopy size={13} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Generate End OTP if the worker stopped and none was issued yet */}
                  {isStopped && !completionOtp && onGenerateCompletionOtp && (
                    <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FiShield className="text-emerald-600" size={14} />
                        <span className="text-xs text-emerald-900 font-bold">Today’s End OTP:</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onGenerateCompletionOtp(w.assignmentId || w.bookingId)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
                      >
                        Generate OTP
                      </button>
                    </div>
                  )}
                </div>

                {/* Worker Action Buttons */}
                {!isFinished && !isDecreased && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => onDecreaseClick(w)}
                      className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 hover:underline active:scale-95 transition-all"
                    >
                      <FiUserX size={13} />
                      <span>Stop after today (Decrease)</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DailyTrackingView;
