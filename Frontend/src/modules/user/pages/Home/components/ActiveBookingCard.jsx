import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiClock, FiMapPin, FiNavigation, FiChevronRight, FiCheckCircle, FiTool, FiShield } from 'react-icons/fi';
import { LuTractor } from 'react-icons/lu';
import { bookingService } from '../../../../../services/bookingService';

const ActiveBookingCard = () => {
  const navigate = useNavigate();
  const [activeBooking, setActiveBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchActiveBooking = async () => {
      try {
        const res = await bookingService.getUserBookings({ limit: 10, skipCache: true });
        if (isMounted && res?.success && Array.isArray(res.bookings)) {
          const activeStatuses = ['CONFIRMED', 'IN_PROGRESS', 'DISPATCHED', 'STARTED', 'JOURNEY_STARTED', 'VISITED', 'ASSIGNED', 'SEARCHING', 'REQUESTED'];
          const active = res.bookings.find(b => activeStatuses.includes((b.status || '').toUpperCase()));
          setActiveBooking(active || null);
        }
      } catch (err) {
        console.error('Error loading active booking in home:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchActiveBooking();
    return () => { isMounted = false; };
  }, []);

  if (loading || !activeBooking) return null;

  const status = (activeBooking.status || '').toUpperCase();
  const itemName = activeBooking.equipment?.name || activeBooking.service?.name || activeBooking.workerName || activeBooking.itemTitle || 'कृषि सेवा';
  const bookingId = activeBooking._id || activeBooking.id;

  const getStatusBadge = () => {
    switch (status) {
      case 'IN_PROGRESS':
        return { label: 'कार्य प्रगति पर है', color: 'bg-emerald-500 text-white', icon: FiTool };
      case 'STARTED':
      case 'JOURNEY_STARTED':
      case 'DISPATCHED':
        return { label: 'रास्ते में है (On the way)', color: 'bg-amber-500 text-white', icon: FiNavigation };
      case 'VISITED':
        return { label: 'खेत पर उपस्थित', color: 'bg-blue-500 text-white', icon: FiMapPin };
      case 'CONFIRMED':
      case 'ASSIGNED':
        return { label: 'बुकिंग कन्फर्म', color: 'bg-emerald-600 text-white', icon: FiCheckCircle };
      default:
        return { label: 'बुकिंग सक्रिय', color: 'bg-teal-600 text-white', icon: FiClock };
    }
  };

  const badge = getStatusBadge();
  const BadgeIcon = badge.icon;
  const isRental = activeBooking.bookingType === 'RENTAL' || activeBooking.rentalHandover;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-5 pt-1 pb-2"
    >
      <div
        onClick={() => navigate(`/user/booking/${bookingId}`)}
        className="w-full bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-3.5 shadow-md border border-slate-700/60 cursor-pointer hover:border-emerald-500/80 transition-all group"
      >
        <div className="flex items-center justify-between gap-3">
          {/* Left Icon */}
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 text-emerald-400">
            <LuTractor className="w-5 h-5 animate-pulse" />
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${badge.color}`}>
                <BadgeIcon className="w-2.5 h-2.5" />
                <span>{badge.label}</span>
              </span>
              {isRental && (
                <span className="text-[9.5px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-md border border-amber-400/30 flex items-center gap-1">
                  <FiShield className="w-2.5 h-2.5" />
                  <span>डिपॉजिट सुरक्षित</span>
                </span>
              )}
            </div>

            <h4 className="text-[13px] font-black text-white truncate">
              {itemName}
            </h4>
            <p className="text-[11px] font-semibold text-slate-300 truncate">
              बुकिंग ID: #{bookingId?.slice(-6).toUpperCase()} • विवरण एवं हैंडओवर ट्रैक करें
            </p>
          </div>

          {/* Action button */}
          <div className="shrink-0 flex items-center gap-1 bg-white/10 group-hover:bg-emerald-500 group-hover:text-white px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all">
            <span>देखें</span>
            <FiChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ActiveBookingCard;
