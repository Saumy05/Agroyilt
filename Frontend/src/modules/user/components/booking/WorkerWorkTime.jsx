import React from 'react';
import { FiClock } from 'react-icons/fi';
import { workLength } from '../../../../utils/workerPayment';

const time = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : null);

/**
 * How long the worker actually worked (Start OTP → Stop Work), from booking.workTime.
 * Worker bookings are priced up front, so this is information, not billing.
 */
const WorkerWorkTime = ({ workTime }) => {
  if (!workTime) return null;
  const isDaily = workTime.bookingType === 'DAILY';
  const started = Boolean(workTime.startedAt);
  const stopped = Boolean(workTime.stoppedAt);

  let headline = 'Work not started yet';
  if (started && !stopped) headline = `Working since ${time(workTime.startedAt)}`;
  if (started && stopped) headline = isDaily ? `Worked ${workTime.workedDays || 0} day(s)` : `Worked ${workLength({ minutes: workTime.minutes })}`;

  return (
    <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
        <FiClock className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Work Time</p>
        <p className="text-base font-black text-slate-900">{headline}</p>
        {started && !isDaily && (
          <p className="text-xs text-slate-500 mt-0.5">
            {time(workTime.startedAt)} – {stopped ? time(workTime.stoppedAt) : 'now'}
            {workTime.bookedMinutes ? ` · booked ${workLength({ minutes: workTime.bookedMinutes })}` : ''}
          </p>
        )}
        {started && isDaily && (
          <p className="text-xs text-slate-500 mt-0.5">
            {workTime.workedDays || 0} of {workTime.bookedDays || '?'} days done · {workLength({ minutes: workTime.minutes })} in total
          </p>
        )}
        <p className="text-[10px] text-slate-400 mt-1">For information only — the price was fixed when you booked.</p>
      </div>
    </div>
  );
};

export default WorkerWorkTime;
