import React from 'react';
import {
  FiCalendar, FiClock, FiCheck, FiUsers, FiUserX,
  FiPlus, FiKey, FiAlertCircle, FiArrowRight, FiShield, FiCopy
} from 'react-icons/fi';

/**
 * DailyTrackingView
 *
 * Dedicated component for Farmer tracking screen when bookingType === 'DAILY'.
 * Displays multi-day progress, per-day Reach/Visit OTPs, Completion OTPs,
 * worker decrease actions, and extension controls.
 */
const DailyTrackingView = ({
  trackingData,
  workers = [],
  onDecreaseClick,
  onRequestExtensionClick,
  onAddWorkersClick,
  onGenerateCompletionOtp,
  onPayViaQrClick
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
              <p className="text-[11px] text-slate-500">Day {currentDay} of {totalDays} total days</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onPayViaQrClick && (
              <button
                type="button"
                id="pay-via-qr-btn"
                onClick={() => onPayViaQrClick()}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-2xl border border-indigo-200 flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <span>📲 Pay via QR</span>
              </button>
            )}

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
            const isArrived = w.journeyStatus === 'ARRIVED';
            const isJourneyStarted = w.journeyStatus === 'JOURNEY_STARTED';

            // OTPs
            const visitOtp = w.visitOtp || w.currentDayLog?.visitOtpCode;
            const completionOtp = w.completionOtp || w.currentDayLog?.completionOtpCode;

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
                  {(isJourneyStarted || isArrived) && visitOtp && (
                    <div className="mt-2 p-2.5 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FiKey className="text-purple-600" size={14} />
                        <span className="text-xs text-purple-900 font-bold">Today’s Reach OTP:</span>
                      </div>
                      <span className="text-base font-black font-mono tracking-widest text-purple-700 bg-white px-2.5 py-0.5 rounded-lg border border-purple-200">
                        {visitOtp}
                      </span>
                    </div>
                  )}

                  {/* Completion OTP Box */}
                  {isInProgress && completionOtp && (
                    <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FiShield className="text-emerald-600" size={14} />
                        <span className="text-xs text-emerald-900 font-bold">Today’s Completion OTP:</span>
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

                  {/* Generate Completion OTP Button if In Progress and not yet generated */}
                  {isInProgress && !completionOtp && onGenerateCompletionOtp && (
                    <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FiShield className="text-emerald-600" size={14} />
                        <span className="text-xs text-emerald-900 font-bold">Today’s Completion OTP:</span>
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
                <div className="flex justify-between items-center pt-1 flex-wrap gap-2">
                  {!isFinished && onPayViaQrClick && (
                    <button
                      type="button"
                      onClick={() => onPayViaQrClick(w)}
                      className="text-xs text-indigo-700 hover:text-indigo-800 font-bold flex items-center gap-1 hover:underline active:scale-95 transition-all"
                    >
                      <span>📲 Pay via Admin QR</span>
                    </button>
                  )}
                  {!isFinished && !isDecreased && (
                    <button
                      type="button"
                      onClick={() => onDecreaseClick(w)}
                      className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 hover:underline active:scale-95 transition-all ml-auto"
                    >
                      <FiUserX size={13} />
                      <span>Stop after today (Decrease)</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DailyTrackingView;
