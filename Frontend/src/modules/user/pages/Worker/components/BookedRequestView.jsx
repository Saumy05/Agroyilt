import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  FiArrowLeft, FiCalendar, FiMapPin, FiPhone, FiNavigation, FiStar, FiClock, FiKey,
  FiEye, FiEyeOff, FiPlusCircle, FiUserPlus, FiAlertTriangle, FiHelpCircle, FiXCircle, FiCheck, FiChevronDown, FiChevronUp, FiCreditCard
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import workerBookingService from '../../../../../services/workerBookingService';
import { bookingService } from '../../../../../services/bookingService';
import disputeService from '../../../../../services/disputeService';
import WorkerPaymentBill from '../../../components/booking/WorkerPaymentBill';
import RatingModal from '../../../components/booking/RatingModal';
import DisputeModal from '../../../../../components/common/DisputeModal';
import ExtensionModal from '../../BookingTrack/components/ExtensionModal';
import AddWorkersModal from '../../BookingTrack/components/AddWorkersModal';
import DecreaseWorkerModal from '../../BookingTrack/components/DecreaseWorkerModal';
import FarmerWorkerQrModal from './FarmerWorkerQrModal';
import { workLength } from '../../../../../utils/workerPayment';

// One worker's journey through a job (per day for DAILY bookings)
const STEPS = ['On the way', 'Arrived', 'Working', 'Stopped', 'Done'];
const STEP_INDEX = { NOT_STARTED: -1, JOURNEY_STARTED: 0, ARRIVED: 1, IN_PROGRESS: 2, WORK_SUBMITTED: 3, COMPLETED: 4 };
const BOOKED_STATUS_LABEL = { confirmed: 'Confirmed', in_progress: 'In progress', partially_completed: 'In progress', completed: 'Completed' };

const time = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '');
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
/** "17:13" on a date → Date in the phone's time zone */
const atTime = (date, hhmm) => {
  if (!date || !hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};
const hhmmLabel = (hhmm) => (hhmm ? time(atTime(new Date(), hhmm)) : '');

const workerLine = (w, isDaily) => {
  switch (w.journeyStatus) {
    case 'JOURNEY_STARTED': return `On the way${w.distanceKm !== null && w.distanceKm !== undefined ? ` · ${w.distanceKm} km away` : ''}`;
    case 'ARRIVED': return 'Arrived · give the Start OTP';
    case 'IN_PROGRESS': return `Working since ${time(w.workStartedAt)}`;
    case 'WORK_SUBMITTED': return `Stopped ${time(w.workSubmittedAt)} · check the work, then give the End OTP`;
    case 'COMPLETED': return isDaily ? `All ${w.bookedDays || ''} days done` : `Done${w.completedAt ? ` at ${time(w.completedAt)}` : ''}`;
    case 'CANCELLED': return 'Removed from this booking';
    default: return isDaily ? 'Has not started today yet' : 'Has not left yet';
  }
};

/**
 * Request Details once workers are booked: codes to give in person, each worker's progress, the booked vs actual
 * schedule, the bill, and every action (extend, add/remove, cancel, report a problem, rate, help) on ONE page.
 */
const BookedRequestView = ({ request, onRefresh }) => {
  const navigate = useNavigate();
  const id = request._id;
  const isDaily = request.bookingType === 'DAILY';

  const [tracking, setTracking] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [showDone, setShowDone] = useState(false);
  const [modal, setModal] = useState(null); // 'extend' | 'add' | 'dispute' | { decrease: worker } | { rate: worker }
  const [qrModal, setQrModal] = useState(null); // { targetId, title, amount }
  const [rated, setRated] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`rated_workers_${id}`) || '{}'); } catch { return {}; }
  });
  const [cancelling, setCancelling] = useState(false);

  const loadTracking = useCallback(async () => {
    try {
      const res = await workerBookingService.getTrackingData(id);
      if (res?.success) setTracking(res.data);
    } catch { /* keep the last snapshot */ }
  }, [id]);

  const refreshAll = useCallback(() => { loadTracking(); onRefresh?.(); }, [loadTracking, onRefresh]);

  useEffect(() => {
    loadTracking();
    const live = request.status !== 'completed';
    const t = live ? setInterval(loadTracking, 15000) : null;
    window.addEventListener('userBookingsUpdated', refreshAll);
    window.addEventListener('userNotificationsUpdated', loadTracking);
    return () => {
      if (t) clearInterval(t);
      window.removeEventListener('userBookingsUpdated', refreshAll);
      window.removeEventListener('userNotificationsUpdated', loadTracking);
    };
  }, [loadTracking, refreshAll, request.status]);

  const workers = useMemo(() => (tracking?.workers || []).filter(w => w.journeyStatus !== 'CANCELLED'), [tracking]);
  const bill = request.paymentSummary?.bill;
  const cashFor = useMemo(() => {
    const m = {};
    (bill?.workers || []).forEach(w => { m[String(w.assignmentId)] = w; });
    return m;
  }, [bill]);

  // Codes the farmer gives in person: Start OTP while the worker is on the way / arrived, End OTP after Stop Work
  const codes = workers.flatMap(w => {
    if (['JOURNEY_STARTED', 'ARRIVED'].includes(w.journeyStatus) && w.visitOtp) {
      return [{ key: `${w.assignmentId}-start`, worker: w, kind: 'Start OTP', code: String(w.visitOtp), arrived: w.journeyStatus === 'ARRIVED' }];
    }
    if (w.journeyStatus === 'WORK_SUBMITTED' && w.completionOtp) {
      return [{ key: `${w.assignmentId}-end`, worker: w, kind: 'End OTP', code: String(w.completionOtp), arrived: true }];
    }
    return [];
  });

  const counts = workers.reduce((acc, w) => {
    const k = { JOURNEY_STARTED: 'On the way', ARRIVED: 'Arrived', IN_PROGRESS: 'Working', WORK_SUBMITTED: 'Stopped', COMPLETED: 'Done' }[w.journeyStatus] || 'Not started';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const active = workers.filter(w => w.journeyStatus !== 'COMPLETED');
  const done = workers.filter(w => w.journeyStatus === 'COMPLETED');
  const anyStarted = workers.some(w => ['IN_PROGRESS', 'WORK_SUBMITTED', 'COMPLETED'].includes(w.journeyStatus));
  const allDone = request.status === 'completed' || (workers.length > 0 && done.length === workers.length);
  const unrated = done.filter(w => !rated[w.bookingId]);

  // ── schedule: booked vs actual ──
  const extMinutes = Number(request.paymentSummary?.extensionsSummary?.totalExtensionMinutes) || 0;
  const bookedStart = isDaily ? null : atTime(request.scheduledDate, request.startTime);
  const firstStart = workers.map(w => w.workStartedAt).filter(Boolean).map(d => new Date(d)).sort((a, b) => a - b)[0] || null;
  const startDiff = bookedStart && firstStart ? Math.round((firstStart - bookedStart) / 60000) : null;
  const currentDay = Math.max(...workers.map(w => Number(w.currentDayIndex) || 1), 1);

  const rateWorker = async (worker, data) => {
    const res = await bookingService.addReview(worker.bookingId, data);
    if (res?.success === false) throw new Error(res.message || 'Could not save the rating');
    const next = { ...rated, [worker.bookingId]: true };
    setRated(next);
    try { localStorage.setItem(`rated_workers_${id}`, JSON.stringify(next)); } catch { /* per-device memory only */ }
    toast.success(`Thanks for rating ${worker.workerName}`);
    setModal(null);
  };

  const raiseProblem = async (data) => {
    const { bookingId: _ignored, ...rest } = data;
    const res = await disputeService.raiseDispute({ ...rest, workerRequestId: id });
    return res.data;
  };

  const cancelBooking = async () => {
    const msg = request.paymentMethod === 'cash'
      ? 'Cancel this booking? The workers will be told not to come.'
      : 'Cancel this booking? The workers will be told not to come and your payment is refunded to your wallet.';
    if (!window.confirm(msg)) return;
    try {
      setCancelling(true);
      await workerBookingService.cancelFarmerRequest(id);
      toast.success('Booking cancelled');
      navigate('/user/my-bookings', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'This booking can no longer be cancelled.');
    } finally {
      setCancelling(false);
    }
  };

  const statusLabel = BOOKED_STATUS_LABEL[request.status] || 'Booked';
  const card = 'bg-white rounded-3xl border border-slate-100 shadow-sm p-5';

  const renderWorker = (w) => {
    const step = STEP_INDEX[w.journeyStatus] ?? -1;
    const cash = cashFor[String(w.assignmentId)];
    return (
      <div key={w.assignmentId} className="py-4 first:pt-0 last:pb-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
            {(w.workerName || 'W').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900 truncate">
              {w.workerName}
              <span className="ml-1.5 text-xs font-semibold text-amber-600 inline-flex items-center gap-0.5"><FiStar size={11} /> {Number(w.rating || 5).toFixed(1)}</span>
            </p>
            <p className="text-xs text-slate-600">{workerLine(w, isDaily)}</p>
            {isDaily && w.journeyStatus !== 'COMPLETED' && (
              <p className="text-[11px] text-slate-500">Day {w.currentDayIndex || 1} of {w.bookedDays || request.numberOfDays || 1} · {w.workedDays || 0} done</p>
            )}
          </div>
          {w.workerPhone && (
            <a href={`tel:${w.workerPhone}`} aria-label={`Call ${w.workerName}`} className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shrink-0">
              <FiPhone size={17} />
            </a>
          )}
        </div>

        {w.journeyStatus !== 'COMPLETED' && (
          <div className="mt-3 flex items-start">
            {STEPS.map((label, i) => (
              <div key={label} className="flex-1 flex flex-col items-center relative">
                {i > 0 && <div className={`absolute top-2 right-1/2 w-full h-0.5 ${i <= step ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
                <div className={`relative z-10 w-4 h-4 rounded-full border-2 ${i < step ? 'bg-emerald-500 border-emerald-500' : i === step ? 'bg-white border-emerald-600' : 'bg-white border-slate-300'}`} />
                <span className={`mt-1 text-[10px] font-semibold ${i <= step ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {['JOURNEY_STARTED', 'ARRIVED'].includes(w.journeyStatus) && (
            <button type="button" onClick={() => navigate(`/user/booking/${id}/track`, { state: { fromHistory: true } })}
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5">
              <FiNavigation size={13} /> Track live
            </button>
          )}
          {cash && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`px-3 py-2 rounded-xl text-xs font-bold ${cash.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                {cash.status === 'paid' ? `Paid ₹${Number(cash.cashToPay).toLocaleString('en-IN')} cash` : `Pay ₹${Number(cash.cashToPay).toLocaleString('en-IN')} cash at the end`}
              </span>
              {cash.status !== 'paid' && ['IN_PROGRESS', 'WORK_SUBMITTED', 'COMPLETED'].includes(w.journeyStatus) && (
                <button
                  type="button"
                  onClick={() => setQrModal({ targetId: w.assignmentId, title: `${w.workerName} · UPI Payment`, amount: cash.cashToPay })}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
                >
                  <FiCreditCard size={13} /> Pay Online (UPI)
                </button>
              )}
            </div>
          )}
          {isDaily && !['COMPLETED'].includes(w.journeyStatus) && !w.isDecreased && (
            <button type="button" onClick={() => setModal({ decrease: w })}
              className="px-3 py-2 rounded-xl border border-amber-200 text-amber-800 text-xs font-bold">
              Stop after today
            </button>
          )}
          {w.journeyStatus === 'COMPLETED' && (
            rated[w.bookingId]
              ? <span className="px-3 py-2 rounded-xl bg-slate-50 text-slate-500 text-xs font-bold flex items-center gap-1"><FiCheck size={13} /> Rated</span>
              : <button type="button" onClick={() => setModal({ rate: w })}
                  className="px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5"><FiStar size={13} /> Rate {w.workerName}</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Helmet><title>{request.workTitle || 'Booking'} | AgroYilt</title></Helmet>

      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <button type="button" onClick={() => navigate('/user/my-bookings')} aria-label="Back to bookings"
            className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <FiArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-black text-slate-900 truncate">{request.workTitle}</h1>
            <p className="text-[11px] text-slate-500">#{String(id).slice(-8).toUpperCase()} · {request.paymentMethod === 'cash' ? 'Cash on service' : 'Paid online'}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-black shrink-0 ${allDone ? 'bg-violet-100 text-violet-800' : anyStarted ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Summary */}
        <div className={card}>
          <div className="space-y-2.5 text-sm">
            <p className="flex items-start gap-2.5 text-slate-800">
              <FiCalendar className="mt-0.5 text-emerald-600 shrink-0" />
              <span className="font-semibold">
                {isDaily
                  ? `From ${day(request.startDate)} · ${request.numberOfDays || 1} day${request.numberOfDays === 1 ? '' : 's'}${request.reportingTime ? ` · report by ${hhmmLabel(request.reportingTime)}` : ''}`
                  : `${day(request.scheduledDate)} · ${hhmmLabel(request.startTime)} – ${hhmmLabel(request.endTime)}`}
              </span>
            </p>
            <p className="flex items-start gap-2.5 text-slate-700">
              <FiMapPin className="mt-0.5 text-rose-500 shrink-0" />
              <span>{[request.location?.addressLine1, request.location?.city].filter(Boolean).join(', ') || 'Your farm'}</span>
            </p>
          </div>
          {workers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(counts).map(([k, n]) => (
                <span key={k} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">{n} {k.toLowerCase()}</span>
              ))}
            </div>
          )}
        </div>

        {/* Rate prompt once everyone is done */}
        {allDone && unrated.length > 0 && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-black text-amber-900">How did the work go?</p>
              <p className="text-xs text-amber-800">Rate {unrated.length === 1 ? unrated[0].workerName : `your ${unrated.length} workers`} — it helps other farmers.</p>
            </div>
            <button type="button" onClick={() => setModal({ rate: unrated[0] })} className="px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-black shrink-0">Rate</button>
          </div>
        )}

        {/* Codes to give in person */}
        {codes.length > 0 && (
          <div className="rounded-3xl border-2 border-emerald-500 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <FiKey className="text-emerald-700" />
              <h2 className="font-black text-slate-900">Codes to give in person</h2>
            </div>
            <p className="text-xs text-slate-600 mb-4">Show a code only when that worker is in front of you. Never send it on the phone.</p>
            <div className="space-y-3">
              {codes.map(c => (
                <div key={c.key} className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{c.worker.workerName} · {c.kind}</p>
                      <p className="text-[11px] text-slate-600">
                        {c.kind === 'End OTP' ? 'Check the work first' : c.arrived ? 'Has arrived' : 'Still on the way — wait until they reach you'}
                      </p>
                    </div>
                    <button type="button" onClick={() => setRevealed(r => ({ ...r, [c.key]: !r[c.key] }))}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 ${revealed[c.key] ? 'bg-slate-200 text-slate-700' : 'bg-emerald-600 text-white'}`}>
                      {revealed[c.key] ? <><FiEyeOff size={14} /> Hide</> : <><FiEye size={14} /> Show code</>}
                    </button>
                  </div>
                  {revealed[c.key] && (
                    <div className="mt-3 flex items-center justify-center gap-2" aria-label={`${c.kind} for ${c.worker.workerName}: ${c.code.split('').join(' ')}`}>
                      {c.code.split('').map((d, i) => (
                        <span key={i} className="w-12 h-14 rounded-xl bg-white border-2 border-emerald-400 text-emerald-900 font-mono font-black text-2xl flex items-center justify-center">{d}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workers */}
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-slate-900">Workers</h2>
            <button type="button" onClick={() => navigate(`/user/booking/${id}/track`, { state: { fromHistory: true } })}
              className="text-xs font-black text-emerald-700 flex items-center gap-1"><FiNavigation size={13} /> Live map</button>
          </div>
          {!tracking ? (
            <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">{active.map(renderWorker)}</div>
              {done.length > 0 && (
                <div className={active.length ? 'mt-4 pt-3 border-t border-slate-100' : ''}>
                  {active.length > 0 ? (
                    <button type="button" onClick={() => setShowDone(s => !s)} className="w-full flex items-center justify-between text-sm font-bold text-slate-600 py-1">
                      <span><FiCheck className="inline mr-1 text-emerald-600" /> Done ({done.length})</span>
                      {showDone ? <FiChevronUp /> : <FiChevronDown />}
                    </button>
                  ) : null}
                  {(showDone || active.length === 0) && <div className="divide-y divide-slate-100 mt-2">{done.map(renderWorker)}</div>}
                </div>
              )}
            </>
          )}
        </div>

        {/* Schedule: booked vs actual */}
        <div className={card}>
          <h2 className="font-black text-slate-900 mb-3 flex items-center gap-2"><FiClock className="text-emerald-600" /> Schedule</h2>
          <dl className="space-y-2 text-sm">
            {isDaily ? (
              <>
                <div className="flex justify-between gap-3"><dt className="text-slate-600">Booked</dt><dd className="font-semibold text-slate-900 text-right">{request.numberOfDays} days from {day(request.startDate)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-600">Report by</dt><dd className="font-semibold text-slate-900">{request.reportingTime ? hhmmLabel(request.reportingTime) : 'Not set'}</dd></div>
                {anyStarted && <div className="flex justify-between gap-3"><dt className="text-slate-600">Today</dt><dd className="font-semibold text-slate-900">Day {currentDay} of {request.numberOfDays}</dd></div>}
              </>
            ) : (
              <>
                <div className="flex justify-between gap-3"><dt className="text-slate-600">Booked</dt><dd className="font-semibold text-slate-900 text-right">{day(request.scheduledDate)}, {hhmmLabel(request.startTime)} – {hhmmLabel(request.endTime)}</dd></div>
                {extMinutes > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-600">Extra time</dt><dd className="font-semibold text-slate-900">+{workLength({ minutes: extMinutes })} (included above)</dd></div>}
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">Work started</dt>
                  <dd className="font-semibold text-slate-900 text-right">
                    {firstStart ? time(firstStart) : 'Not yet'}
                    {startDiff !== null && Math.abs(startDiff) >= 5 && (
                      <span className={`block text-[11px] ${startDiff > 0 ? 'text-rose-600' : 'text-blue-700'}`}>
                        {startDiff > 0 ? `${workLength({ minutes: startDiff })} late` : `${workLength({ minutes: -startDiff })} early`}
                      </span>
                    )}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {/* Payment */}
        {bill && (
          <div className={card}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="font-black text-slate-900">Payment</h2>
              {request.status !== 'completed' && request.paymentMethod === 'cash' && (
                <button
                  type="button"
                  onClick={() => setQrModal({
                    targetId: id,
                    title: `${request.workTitle || 'Worker Request'} · UPI Settlement`,
                    amount: bill.grandTotal || request.financialSnapshot?.totalPayable || 0
                  })}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                >
                  <FiCreditCard size={13} className="text-emerald-600" />
                  <span>Pay All Online (Admin UPI)</span>
                </button>
              )}
            </div>
            <WorkerPaymentBill bill={bill} />
          </div>
        )}

        {/* Actions */}
        <div className={card}>
          <h2 className="font-black text-slate-900 mb-3">Manage booking</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {!allDone && anyStarted && (
              <button type="button" onClick={() => setModal('extend')} className="p-3 rounded-2xl border border-slate-200 text-left">
                <FiPlusCircle className="text-emerald-600 mb-1" />
                <span className="block text-sm font-bold text-slate-900">{isDaily ? 'Add days' : 'Extend time'}</span>
                <span className="block text-[11px] text-slate-500">Workers accept first</span>
              </button>
            )}
            {isDaily && !allDone && (
              <button type="button" onClick={() => setModal('add')} className="p-3 rounded-2xl border border-slate-200 text-left">
                <FiUserPlus className="text-emerald-600 mb-1" />
                <span className="block text-sm font-bold text-slate-900">Add workers</span>
                <span className="block text-[11px] text-slate-500">For the remaining days</span>
              </button>
            )}
            <button type="button" onClick={() => setModal('dispute')} className="p-3 rounded-2xl border border-slate-200 text-left">
              <FiAlertTriangle className="text-amber-600 mb-1" />
              <span className="block text-sm font-bold text-slate-900">Report a problem</span>
              <span className="block text-[11px] text-slate-500">Our team will review it</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const bNum = request.bookingNumber || String(request._id || '').substring(0, 8);
                const title = request.workTitle || 'Worker Hiring';
                navigate(`/user/help-support?category=WORKER&bookingNumber=${encodeURIComponent(bNum)}&bookingId=${request._id}&subject=${encodeURIComponent(`Help with worker request #${bNum} (${title})`)}&openCreate=true`);
              }}
              className="p-3 rounded-2xl border border-slate-200 text-left hover:bg-slate-50 transition-colors"
            >
              <FiHelpCircle className="text-blue-600 mb-1" />
              <span className="block text-sm font-bold text-slate-900">Help</span>
              <span className="block text-[11px] text-slate-500">Call or chat with support</span>
            </button>
          </div>
          {request.status === 'confirmed' && !anyStarted && (
            <button type="button" disabled={cancelling} onClick={cancelBooking}
              className="mt-3 w-full py-3 rounded-2xl border-2 border-rose-100 bg-rose-50 text-rose-700 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60">
              <FiXCircle /> Cancel booking
            </button>
          )}
        </div>
      </div>

      {/* Existing popups, reused */}
      <ExtensionModal
        isOpen={modal === 'extend'}
        onClose={() => setModal(null)}
        requestId={id}
        bookingType={request.bookingType || 'HOURLY'}
        workers={workers}
        onExtensionCreated={refreshAll}
      />
      <AddWorkersModal
        isOpen={modal === 'add'}
        onClose={() => setModal(null)}
        requestId={id}
        bookingType={request.bookingType || 'DAILY'}
        defaultRate={request.maxDailyRate || request.minDailyRate || 500}
        remainingDays={Math.max(1, (request.numberOfDays || 1) - currentDay + 1)}
        onWorkersAdded={refreshAll}
      />
      <DecreaseWorkerModal
        isOpen={Boolean(modal?.decrease)}
        onClose={() => setModal(null)}
        worker={modal?.decrease}
        requestId={id}
        onDecreased={refreshAll}
      />
      <DisputeModal
        isOpen={modal === 'dispute'}
        onClose={() => setModal(null)}
        onSubmit={raiseProblem}
        bookingId={id}
      />
      <RatingModal
        isOpen={Boolean(modal?.rate)}
        onClose={() => setModal(null)}
        onSubmit={(data) => rateWorker(modal.rate, data)}
        bookingName={request.workTitle}
        workerName={modal?.rate?.workerName}
      />
      <FarmerWorkerQrModal
        isOpen={Boolean(qrModal)}
        onClose={() => setQrModal(null)}
        targetId={qrModal?.targetId}
        title={qrModal?.title}
        amount={qrModal?.amount}
        onSuccess={refreshAll}
      />
    </div>
  );
};

export default BookedRequestView;
