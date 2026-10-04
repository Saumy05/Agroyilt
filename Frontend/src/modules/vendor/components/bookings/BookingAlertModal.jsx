import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiMapPin, FiClock, FiDollarSign, FiArrowRight, FiBell, FiAlertCircle, FiMinimize2, FiUsers } from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { vendorTheme as themeColors } from '../../../../theme';
import { playAlertRing, stopAlertRing } from '../../../../utils/notificationSound';
import authStorage from '../../../../utils/authStorage';

const BookingAlertCard = ({ booking, onAccept, onReject, onAssign, initialTimeLeft = 60, servicePayoutPct = 70 }) => {
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);
  const [loadingAction, setLoadingAction] = useState(null);

  const handleAction = async (actionFn, actionType) => {
    if (loadingAction) return;
    setLoadingAction(actionType);
    const bookingId = booking?.id || booking?._id;
    localStorage.removeItem(`alert_start_${bookingId}`);
    try {
      if (actionFn) await actionFn(bookingId, actionType);
    } catch (error) {
      console.error(error);
    } finally {
      if (typeof window !== 'undefined') {
        setLoadingAction(null);
      }
    }
  };

  // The countdown follows the SERVER's expiry (15 min window). When it reaches zero the card only
  // disables itself — it never auto-rejects, because a vendor who was away from the phone must not
  // silently decline the farmer's booking (a targeted reject kills the request).
  const [windowSeconds, setWindowSeconds] = useState(initialTimeLeft);
  useEffect(() => {
    if (!booking) return;

    const serverExpiry = booking.expiresAt ? new Date(booking.expiresAt).getTime() : null;
    const computeRemaining = () => {
      if (serverExpiry) return Math.max(0, Math.floor((serverExpiry - Date.now()) / 1000));
      const sentAt = booking.sentAt || booking.createdAt;
      if (sentAt) {
        const elapsed = Math.floor((Date.now() - new Date(sentAt).getTime()) / 1000);
        return Math.max(0, 15 * 60 - elapsed);
      }
      return initialTimeLeft;
    };

    const first = computeRemaining();
    setWindowSeconds(Math.max(first, 1));
    setTimeLeft(first);

    const timer = setInterval(() => {
      const remaining = computeRemaining();
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [booking, initialTimeLeft]);

  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, timeLeft / Math.max(windowSeconds, 1)) * circumference;
  const dashoffset = circumference - progress;

  const isUrgent = timeLeft <= 15;
  const isWarning = timeLeft > 15 && timeLeft <= 60;
  const timerStrokeColor = isUrgent ? '#EF4444' : isWarning ? '#F59E0B' : '#059669';
  const timerTextColor = isUrgent ? 'text-red-500' : isWarning ? 'text-amber-600' : 'text-emerald-700';

  // Pricing synchronization with farmer checkout
  const isAgriService = !!(
    booking?.rental_type ||
    booking?.equipmentId ||
    booking?.selectedImplements?.length > 0 ||
    booking?.bookedItems?.some(item => 
      item.title?.toLowerCase().includes('tractor') || 
      item.title?.toLowerCase().includes('rotavator') || 
      item.title?.toLowerCase().includes('harvester')
    ) ||
    (booking?.serviceCategory && ['machinery', 'agriculture', 'equipment', 'farm equipment'].includes(booking?.serviceCategory?.toLowerCase()))
  );

  const gstRate = booking?.gstPercentage !== undefined && booking?.gstPercentage !== null 
    ? Number(booking.gstPercentage) 
    : (isAgriService ? 5 : 18);

  const baseAmt = Number(booking?.basePrice || booking?.price || booking?.amount || 0);
  const storedTax = booking?.tax !== undefined && booking?.tax !== null ? Number(booking.tax) : Math.round(baseAmt * (gstRate / 100));
  const visitingCharges = Number(booking?.visitingCharges || 0);

  const farmerPayable = Number(
    booking?.finalAmount || 
    booking?.totalAmount || 
    booking?.amount || 
    (baseAmt + storedTax + visitingCharges)
  );

  const vendorNetEarning = Math.round(baseAmt * (servicePayoutPct / 100));

  const format12Hour = (timeStr) => {
    if (!timeStr) return '';
    const trimmed = String(timeStr).trim();
    if (/am|pm/i.test(trimmed)) return trimmed;

    if (trimmed.includes('-') || trimmed.includes('–')) {
      const delimiter = trimmed.includes('–') ? '–' : '-';
      const [start, end] = trimmed.split(delimiter).map(t => format12Hour(t));
      return `${start} – ${end}`;
    }

    const parts = trimmed.split(':');
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10);
      const m = parts[1].slice(0, 2);
      if (isNaN(h)) return trimmed;
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${m} ${period}`;
    }
    return trimmed;
  };

  const formatScheduleDate = (rawDate) => {
    if (!rawDate) return '';
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return String(rawDate);

      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const isTomorrow = d.toDateString() === tomorrow.toDateString();

      const shortDate = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const fullDate = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

      if (isToday) return `Today, ${shortDate}`;
      if (isTomorrow) return `Tomorrow, ${shortDate}`;
      return fullDate;
    } catch {
      return String(rawDate);
    }
  };

  const rawDate = booking?.timeSlot?.date || booking?.scheduledDate || booking?.date || booking?.startDate;
  const formattedDate = formatScheduleDate(rawDate);

  const rawTime = booking?.timeSlot?.time || booking?.scheduledTime || booking?.time || booking?.slot || 
    (booking?.startTime && booking?.endTime ? `${booking.startTime} - ${booking.endTime}` : (booking?.startTime || ''));
  const formattedTime = format12Hour(rawTime);

  const scheduledDisplay = formattedDate && formattedTime
    ? `${formattedDate} • ${formattedTime}`
    : (formattedDate || formattedTime || 'Flexible / ASAP');

  return (
    <div className="bg-white w-[92vw] max-w-[340px] flex-none rounded-3xl overflow-hidden shadow-2xl relative flex flex-col font-sans border border-slate-100/90 mx-auto">
      {/* Header Section */}
      <div className="relative pt-3 pb-6 px-4 bg-gradient-to-br from-emerald-800 via-teal-800 to-green-900 flex flex-col items-center justify-center shrink-0">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute -top-6 -left-6 w-24 h-24 bg-white rounded-full"
          />
          <motion.div
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 5, repeat: Infinity }}
            className="absolute -bottom-6 -right-6 w-28 h-28 bg-white rounded-full"
          />
        </div>

        <div className="relative z-10 mb-1">
          <div className="w-8 h-8 bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 flex items-center justify-center shadow-md relative">
            <FiBell className="w-4 h-4 text-white animate-bounce" />
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-pulse" />
          </div>
        </div>

        <h2 className="relative z-10 text-white text-base font-black tracking-tight leading-tight">New Order Alert!</h2>
        <div className="relative z-10 px-2.5 py-0.5 mt-0.5 bg-white/20 backdrop-blur-md rounded-full border border-white/10 text-[8px] font-bold text-white uppercase tracking-wider">
          Action Required Immediately
        </div>
      </div>

      {/* Floating Countdown Ring (Overlaps header & body seam with z-30, completely unclipped) */}
      <div className="relative flex justify-center -my-8 z-30 pointer-events-none">
        <div className={`relative w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-xl p-0.5 border-2 border-white ring-2 ${isUrgent ? 'ring-red-500/30 shadow-red-500/20' : 'ring-emerald-900/10 shadow-emerald-900/10'}`}>
          <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="3.5" />
            <motion.circle
              cx="32" cy="32" r={radius} fill="none"
              stroke={timerStrokeColor} strokeWidth="3.5"
              strokeDasharray={circumference} strokeDashoffset={dashoffset}
              strokeLinecap="round" className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <div className="relative z-10 flex flex-col items-center justify-center text-center select-none">
            <span className={`font-black font-mono tracking-tight leading-none ${timeLeft >= 60 ? 'text-[13px]' : 'text-base'} ${timerTextColor}`}>
              {timeLeft >= 60 ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}` : timeLeft}
            </span>
            <span className={`text-[7.5px] font-extrabold uppercase tracking-wider block mt-1 leading-none ${isUrgent ? 'text-red-400' : 'text-slate-400'}`}>
              {timeLeft >= 60 ? 'Min Left' : 'Sec Left'}
            </span>
          </div>
          {isUrgent && <div className="absolute inset-0 rounded-full border-2 border-red-500/30 animate-ping pointer-events-none" />}
        </div>
      </div>

      {/* Body Section */}
      <div className="pt-9 px-3.5 pb-3 flex-1 space-y-2">
        {/* Pricing Metrics: Farmer Total & Vendor Net Share */}
        <div className="grid grid-cols-2 gap-2">
          {/* Farmer Collection */}
          <div className="bg-slate-50/90 py-2 px-1.5 rounded-xl border border-slate-200/90 flex flex-col justify-between items-center h-[82px] text-center">
            <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider leading-none">Collect from Farmer</span>
            <div className="text-base font-black text-slate-900 tracking-tight my-auto leading-none">
              ₹{farmerPayable.toLocaleString('en-IN')}
            </div>
            <span className="text-[8px] font-black text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200/60 leading-none">
              Incl. {gstRate}% GST
            </span>
          </div>

          {/* Vendor Share */}
          <div className="bg-emerald-50/60 py-2 px-1.5 rounded-xl border border-emerald-200/90 flex flex-col justify-between items-center h-[82px] text-center">
            <span className="text-[8.5px] font-black text-emerald-800 uppercase tracking-wider leading-none">Your Net Cut ({servicePayoutPct}%)</span>
            <div className="text-base font-black text-emerald-700 tracking-tight my-auto leading-none">
              ₹{vendorNetEarning.toLocaleString('en-IN')}
            </div>
            <span className="text-[8px] font-black text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded-full border border-slate-300/40 leading-none">
              Base ₹{baseAmt}
            </span>
          </div>
        </div>

        {/* Category & Urgent Badge Row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 border border-slate-200/80 px-2 py-1 rounded-lg flex items-center justify-center gap-1 shadow-2xs h-7">
            {booking?.categoryIcon ? (
              <img src={booking.categoryIcon} alt="Cat" className="w-3.5 h-3.5 object-contain" />
            ) : (
              <span className="text-[10px] text-amber-500 font-bold">⚡</span>
            )}
            <span className="text-[9.5px] font-black tracking-wider text-slate-700 uppercase truncate">
              {booking?.serviceCategory || booking?.categoryName || (booking?.categoryId && booking.categoryId.title) || 'Equipment'}
            </span>
          </div>
          <div className="bg-red-50 border border-red-200/70 px-2 py-1 rounded-lg flex items-center justify-center gap-1 shadow-2xs h-7">
            <FiBell className="w-3 h-3 text-red-500 animate-pulse shrink-0" />
            <span className="text-[9.5px] font-black tracking-wider text-red-600 uppercase truncate">
              Urgent Request
            </span>
          </div>
        </div>

        {/* Service / Equipment Details Card */}
        <div className="bg-white rounded-xl p-2.5 border border-emerald-200/80 shadow-2xs relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-green-600 rounded-full" />

          <div className="pl-2">
            <p className="text-[8.5px] font-black text-emerald-700 uppercase tracking-wider mb-0.5">Equipment & Task</p>
            <h4 className="text-xs font-black text-slate-900 leading-snug truncate">
              {booking?.serviceName || booking?.serviceType || 'Machinery Booking'}
            </h4>

            {/* Booked Items (e.g. Tractor + Rotavator) */}
            {booking?.bookedItems && booking.bookedItems.length > 0 && (
              <div className="space-y-0.5 my-1">
                {booking.bookedItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] py-0.2">
                    <span className="font-bold text-slate-700 truncate">• {item.title}</span>
                    <span className="text-[9.5px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded shrink-0">
                      {item.price > 0 ? `₹${item.price}` : 'Attached (₹0)'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Agriculture/Duration Badges */}
            {(booking?.landSize || booking?.cropType || booking?.chemicalUsed || booking?.estimatedDuration || booking?.rental_type) && (
              <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-emerald-50">
                {booking.rental_type === 'hourly' && booking.estimatedDuration ? (
                  <div className="bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                    <span className="text-[8.5px] text-emerald-700 font-bold uppercase">Duration:</span>
                    <span className="text-[10px] font-black text-emerald-950">{booking.estimatedDuration} Hr(s)</span>
                  </div>
                ) : booking.landSize ? (
                  <div className="bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                    <span className="text-[8.5px] text-emerald-700 font-bold uppercase">Area:</span>
                    <span className="text-[10px] font-black text-emerald-950">{booking.landSize} Acre(s)</span>
                  </div>
                ) : null}
                {booking.cropType && (
                  <div className="bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 flex items-center gap-1">
                    <span className="text-[8.5px] text-amber-700 font-bold uppercase">Crop:</span>
                    <span className="text-[10px] font-black text-amber-950">{booking.cropType}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Location & Scheduled Time */}
        <div className="bg-slate-50/80 rounded-xl p-2 border border-slate-100 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <FiMapPin className="text-emerald-600 w-3 h-3 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Farm Destination</span>
                <span className="text-emerald-700 font-black text-[9px]">
                  {(() => {
                    const distVal = booking?.location?.distance || booking?.distance;
                    if (distVal === undefined || distVal === null) return 'Near You';
                    if (typeof distVal === 'string' && (distVal.includes('km') || distVal.includes('m'))) return distVal;
                    const numDist = Number(distVal);
                    if (isNaN(numDist)) return 'Near You';
                    return numDist < 1 ? `${Math.round(numDist * 1000)} m` : `${numDist.toFixed(1)} km away`;
                  })()}
                </span>
              </div>
              <p className="text-[11px] font-bold text-slate-800 truncate leading-tight">
                {booking?.location?.address || booking?.address?.addressLine1 || 'Farm address provided'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200/50">
            <FiClock className="text-emerald-600 w-3 h-3 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block leading-none">Scheduled Time</span>
              <p className="text-[11px] font-bold text-slate-800 truncate leading-tight mt-0.5" title={scheduledDisplay}>
                {scheduledDisplay}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 pt-0.5">
          <button
            disabled={!!loadingAction}
            onClick={() => handleAction(onAccept, 'accept')}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white font-black text-xs shadow-md shadow-emerald-900/15 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:active:scale-100 cursor-pointer"
          >
            {loadingAction === 'accept' ? 'Accepting...' : 'Accept Order'} {loadingAction !== 'accept' && <FiArrowRight className="w-3.5 h-3.5" />}
          </button>

          <button
            disabled={!!loadingAction}
            onClick={() => handleAction(onReject, 'reject')}
            className="w-full py-1.5 rounded-xl bg-red-50 hover:bg-red-100/80 border border-red-100 text-red-600 font-bold text-[10.5px] active:scale-95 transition-all uppercase tracking-wider flex items-center justify-center gap-1 disabled:opacity-50 disabled:active:scale-100 cursor-pointer"
          >
            {loadingAction === 'reject' ? 'Declining...' : <><FiX className="w-3 h-3" /> Decline Order</>}
          </button>
        </div>
      </div>
    </div>
  );
};

const BookingAlertModal = ({ isOpen, booking, bookings, onAccept, onReject, onAssign, onMinimize, timeLeft = 60, servicePayoutPct: propPayoutPct }) => {
  const alertsArray = bookings || (booking ? [booking] : []);
  const [servicePayoutPct, setServicePayoutPct] = useState(propPayoutPct || 90);

  useEffect(() => {
    if (propPayoutPct) {
      setServicePayoutPct(propPayoutPct);
    }
  }, [propPayoutPct]);

  useEffect(() => {
    let isMounted = true;
    const fetchPayoutSettings = async () => {
      try {
        const token = authStorage.getAccessToken('vendor');
        if (!token) return;
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/vendors/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (isMounted && data.success && data.data?.global) {
          const globalSettings = data.data.global;
          const commission = globalSettings.bookingCommissionPercentage ?? (100 - (globalSettings.servicePayoutPercentage ?? 90));
          setServicePayoutPct(100 - commission);
        }
      } catch (error) {
        console.error('Error fetching global vendor settings in modal:', error);
      }
    };

    if (isOpen) {
      fetchPayoutSettings();
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && alertsArray.length > 0) {
      playAlertRing(true);
    } else {
      stopAlertRing();
    }
    return () => stopAlertRing();
  }, [isOpen, alertsArray.length]);

  // Lock background scrolling while modal is open
  const isAlertActive = isOpen && alertsArray.length > 0;
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

  if (!isOpen || alertsArray.length === 0) return null;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overscroll-contain">
        {onMinimize && (
          <button onClick={() => { stopAlertRing(); onMinimize(); }} className="absolute top-4 right-4 z-50 p-2 bg-black/20 hover:bg-black/30 backdrop-blur-md rounded-full text-white transition-all active:scale-95 cursor-pointer" title="Minimize Alert">
            <FiMinimize2 className="w-5 h-5" />
          </button>
        )}

        <div className="w-full flex items-center justify-center overflow-x-auto scrollbar-hide py-1">
          <div className="flex items-center justify-center gap-3 w-full max-w-sm">
            {alertsArray.filter(b => b).map(b => (
              <BookingAlertCard
                key={b?.id || b?._id || Math.random().toString()}
                booking={b}
                onAccept={onAccept}
                onReject={onReject}
                onAssign={onAssign}
                initialTimeLeft={timeLeft}
                servicePayoutPct={servicePayoutPct}
              />
            ))}
          </div>
        </div>

        {alertsArray.length > 1 && (
          <div className="mt-2 text-center text-white text-xs font-medium animate-pulse drop-shadow-lg">
            Swipe to see all {alertsArray.length} alerts →
          </div>
        )}
      </div>
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default BookingAlertModal;
