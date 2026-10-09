import React, { useState, useEffect } from 'react';
import { FiClock, FiAlertTriangle, FiPhone } from 'react-icons/fi';

/**
 * RentalTimer - Countdown & Overdue/Overtime Timer for active machinery rentals.
 * Used on both Farmer and Vendor booking details pages.
 *
 * @param {Object} props
 * @param {Object} props.booking - Booking document
 * @param {'farmer'|'vendor'} props.role - Viewer role
 */
export const RentalTimer = ({ booking, role = 'farmer' }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isOverdue, setIsOverdue] = useState(false);
  const [overdueMs, setOverdueMs] = useState(0);

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
      const now = Date.now();
      const remaining = targetMs - now;
      if (remaining <= 0) {
        setTimeLeft(0);
        setIsOverdue(true);
        setOverdueMs(Math.abs(remaining));
      } else {
        setTimeLeft(remaining);
        setIsOverdue(false);
        setOverdueMs(0);
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

  const rate = booking.equipmentId?.pricing?.hourly?.price || booking.basePrice || 25;
  const unitLabel = booking.rental_type === 'hourly' ? 'hr' : booking.rental_type === 'daily' ? 'day' : 'month';

  const formatTime = (ms) => {
    const totalSecs = Math.floor(ms / 1000);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h ${mins}m ${secs}s`;
    }
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const overdueUnits = booking.rental_type === 'daily'
    ? Math.max(1, Math.ceil(overdueMs / 86400000))
    : Math.max(1, Math.ceil(overdueMs / 3600000));
  const estimatedExtraCost = overdueUnits * rate;

  if (isOverdue) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4 text-amber-900 shadow-sm transition-all duration-300 space-y-2.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
            <FiAlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">
                {role === 'vendor' ? 'Rental Overdue — Return Pending' : 'Rental Overdue — Extra Time'}
              </h4>
              <span className="text-[10px] font-black bg-amber-200/80 text-amber-900 px-1.5 py-0.2 rounded uppercase">
                Active
              </span>
            </div>
            <p className="text-base font-black text-amber-800 font-mono mt-0.5">
              +{formatTime(overdueMs)} Overtime
            </p>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-xs rounded-xl p-2.5 border border-amber-200/60 text-xs space-y-1">
          <div className="flex justify-between items-center font-bold text-amber-900">
            <span>Accruing Rate:</span>
            <span className="font-mono">₹{rate}/{unitLabel}</span>
          </div>
          <div className="flex justify-between items-center text-amber-800 font-bold border-t border-amber-100 pt-1">
            <span>Estimated Extra Charge:</span>
            <span className="font-mono text-orange-700">+₹{estimatedExtraCost.toFixed(2)}</span>
          </div>
        </div>

        <p className="text-[11px] text-amber-800/90 leading-relaxed font-medium">
          {role === 'vendor'
            ? 'The agreed rental duration has elapsed. Once the farmer returns the equipment, verify return condition to generate final bill including overtime.'
            : 'The agreed rental return time has passed. Extra time will be charged upon return at the listed rate until the owner confirms your Return.'}
        </p>

        {role === 'vendor' && booking.userId?.phone ? (
          <div className="pt-0.5 flex items-center gap-2">
            <a
              href={`tel:${booking.userId.phone}`}
              className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <FiPhone className="w-3.5 h-3.5" />
              <span>Call Farmer ({booking.userId?.name || 'Customer'})</span>
            </a>
          </div>
        ) : role === 'farmer' && booking.vendorId?.phone ? (
          <div className="pt-0.5 flex items-center gap-2">
            <a
              href={`tel:${booking.vendorId.phone}`}
              className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <FiPhone className="w-3.5 h-3.5" />
              <span>Call Owner ({booking.vendorId?.name || 'Owner'})</span>
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  // Active Normal Countdown
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 text-emerald-950 shadow-sm transition-all duration-300 space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
          <FiClock className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900">
              {role === 'vendor' ? 'Equipment Rented (In Use)' : 'Rental Active'}
            </h4>
            <span className="text-[10px] font-black bg-emerald-200 text-emerald-800 px-1.5 py-0.2 rounded uppercase">
              Running
            </span>
          </div>
          <p className="text-base font-black text-emerald-800 font-mono mt-0.5">
            {formatTime(timeLeft)} Remaining
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center text-[11px] font-medium text-emerald-800/90 pt-1 border-t border-emerald-100">
        <span>Duration: {booking.estimatedDuration || 1} {unitLabel}(s)</span>
        <span>Rate: ₹{rate}/{unitLabel}</span>
      </div>
    </div>
  );
};

export default RentalTimer;
