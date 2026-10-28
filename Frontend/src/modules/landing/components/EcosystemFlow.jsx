import React, { useRef, useState, useMemo } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  HiOutlineUser, HiOutlineTruck, HiOutlineShieldCheck,
  HiOutlineCurrencyDollar, HiOutlineLocationMarker, HiOutlineStar
} from 'react-icons/hi';
import { FiZap, FiSmartphone, FiCheckCircle, FiBox } from 'react-icons/fi';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

// ─────────────── STATIC DATA (never needs updating) ───────────────

const JOURNEY_STEPS = [
  {
    id: 1,
    actor: 'Farmer',
    icon: <HiOutlineUser size={22} />,
    action: 'Registers & Requests',
    detail: 'Signs up via mobile OTP, selects service type, location & date.',
    color: '#22c55e',
    bg: 'from-green-500 to-green-700',
    side: 'left',
  },
  {
    id: 2,
    actor: 'AgroYilt Platform',
    icon: <FiZap size={22} />,
    action: 'Verifies & Matches',
    detail: 'AI matches request to nearest available, verified equipment owner.',
    color: '#f59e0b',
    bg: 'from-yellow-400 to-orange-500',
    side: 'right',
  },
  {
    id: 3,
    actor: 'Owner',
    icon: <HiOutlineTruck size={22} />,
    action: 'Accepts & Dispatches',
    detail: 'Equipment owner gets notified, confirms, and sends machine to farm.',
    color: '#3b82f6',
    bg: 'from-blue-500 to-blue-700',
    side: 'left',
  },
  {
    id: 4,
    actor: 'AgroYilt GPS',
    icon: <HiOutlineLocationMarker size={22} />,
    action: 'Tracks in Real-Time',
    detail: 'Live GPS tracking for both farmer & owner. Transparent proof of work.',
    color: '#a855f7',
    bg: 'from-purple-500 to-purple-700',
    side: 'right',
  },
  {
    id: 5,
    actor: 'Admin',
    icon: <HiOutlineShieldCheck size={22} />,
    action: 'Approves Completion',
    detail: 'Image & speedometer proof verified by AgroYilt before releasing payment.',
    color: '#06b6d4',
    bg: 'from-cyan-500 to-cyan-700',
    side: 'left',
  },
  {
    id: 6,
    actor: 'Owner',
    icon: <HiOutlineCurrencyDollar size={22} />,
    action: 'Receives Payment',
    detail: 'Secure escrow payment directly transferred to owner\'s wallet.',
    color: '#10b981',
    bg: 'from-emerald-500 to-teal-600',
    side: 'right',
  },
];

const ECOSYSTEM_ROLES = [
  {
    role: 'Farmer',
    icon: <HiOutlineUser size={26} />,
    color: '#22c55e',
    bg: 'from-green-500 to-green-700',
    points: ['Books via App', 'GPS Tracked Work', 'Pay Per Use', 'Crop Advisory'],
  },
  {
    role: 'AgroYilt Platform',
    icon: <FiZap size={26} />,
    color: '#f59e0b',
    bg: 'from-yellow-400 to-orange-500',
    points: ['AI Matching', 'Escrow Payments', 'KYC Verification', 'Analytics'],
  },
  {
    role: 'Equipment Owner',
    icon: <HiOutlineTruck size={26} />,
    color: '#3b82f6',
    bg: 'from-blue-500 to-blue-700',
    points: ['Get Bookings', 'Direct Earnings', 'Fleet Management', 'Rating System'],
  },
];

// ─────────────── SUB-COMPONENTS ───────────────

// Flowing dot animation on the center timeline
const TimelinePulse = () => (
  <motion.div
    className="w-2 h-2 bg-yellow-400 rounded-full"
    animate={{ y: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
    style={{ position: 'absolute', left: '50%', top: 0, translateX: '-50%' }}
  />
);

const JourneyStep = ({ step, idx, t }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const [hovered, setHovered] = useState(false);
  const isLeft = step.side === 'left';

  return (
    <div ref={ref} className="relative w-full">
      {/* MOBILE VIEW (< md): Left-aligned line, node on left, card on right */}
      <div className="flex md:hidden items-start w-full relative pl-11 sm:pl-14">
        {/* Mobile Node */}
        <div className="absolute left-5 sm:left-6 -translate-x-1/2 top-2 z-10">
          <div
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center font-black text-[11px] sm:text-xs shadow-md"
            style={{ borderColor: step.color, color: step.color, background: '#111827' }}
          >
            {String(idx + 1).padStart(2, '0')}
          </div>
        </div>

        {/* Mobile Card */}
        <div className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center space-x-2.5 mb-1.5 relative z-10">
            <div
              className={`w-7 h-7 rounded-lg bg-gradient-to-br ${step.bg} flex items-center justify-center text-white flex-shrink-0 text-sm`}
            >
              {step.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: step.color }}>{t(step.actor)}</p>
              <p className="text-white font-black text-xs leading-tight truncate">{t(step.action)}</p>
            </div>
          </div>
          <p className="text-gray-400 text-[11px] sm:text-xs leading-relaxed relative z-10">{t(step.detail)}</p>
        </div>
      </div>

      {/* DESKTOP VIEW (md+): Center line, alternating left & right */}
      <div className="hidden md:flex items-center w-full">
        {/* LEFT SIDE */}
        <div className="flex-1 flex justify-end pr-8">
          {isLeft && (
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: idx * 0.1, duration: 0.5, ease: [0.34, 1.2, 0.64, 1] }}
              onHoverStart={() => setHovered(true)}
              onHoverEnd={() => setHovered(false)}
              whileHover={{ scale: 1.02 }}
              className="max-w-xs w-full bg-gray-800 border border-gray-700 rounded-2xl p-4 cursor-default relative overflow-hidden"
            >
              <motion.div
                animate={{ opacity: hovered ? 0.12 : 0 }}
                className={`absolute inset-0 bg-gradient-to-br ${step.bg}`}
              />
              <div className="flex items-center space-x-3 mb-2 relative z-10">
                <motion.div
                  animate={{ boxShadow: hovered ? `0 0 20px ${step.color}60` : 'none' }}
                  className={`w-9 h-9 rounded-xl bg-gradient-to-br ${step.bg} flex items-center justify-center text-white flex-shrink-0`}
                >
                  {step.icon}
                </motion.div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: step.color }}>{t(step.actor)}</p>
                  <p className="text-white font-black text-xs leading-tight">{t(step.action)}</p>
                </div>
              </div>
              <p className="text-gray-400 text-[11px] leading-relaxed relative z-10">{t(step.detail)}</p>
              {/* Connector arrow */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full w-8 flex items-center">
                <div className="w-full h-px" style={{ backgroundColor: step.color + '60' }} />
              </div>
            </motion.div>
          )}
        </div>

        {/* CENTER NODE */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={isInView ? { scale: 1, opacity: 1 } : {}}
          transition={{ delay: idx * 0.1 + 0.1, type: 'spring', stiffness: 300, damping: 18 }}
          className="flex-shrink-0 relative z-10"
        >
          <motion.div
            animate={{ boxShadow: [`0 0 0 0 ${step.color}40`, `0 0 0 10px transparent`] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: idx * 0.3 }}
            className="w-10 h-10 rounded-full border-2 flex items-center justify-center font-black text-sm"
            style={{ borderColor: step.color, color: step.color, background: '#111827' }}
          >
            {String(idx + 1).padStart(2, '0')}
          </motion.div>
        </motion.div>

        {/* RIGHT SIDE */}
        <div className="flex-1 flex justify-start pl-8">
          {!isLeft && (
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: idx * 0.1, duration: 0.5, ease: [0.34, 1.2, 0.64, 1] }}
              onHoverStart={() => setHovered(true)}
              onHoverEnd={() => setHovered(false)}
              whileHover={{ scale: 1.02 }}
              className="max-w-xs w-full bg-gray-800 border border-gray-700 rounded-2xl p-4 cursor-default relative overflow-hidden"
            >
              <motion.div
                animate={{ opacity: hovered ? 0.12 : 0 }}
                className={`absolute inset-0 bg-gradient-to-br ${step.bg}`}
              />
              <div className="flex items-center space-x-3 mb-2 relative z-10">
                <motion.div
                  animate={{ boxShadow: hovered ? `0 0 20px ${step.color}60` : 'none' }}
                  className={`w-9 h-9 rounded-xl bg-gradient-to-br ${step.bg} flex items-center justify-center text-white flex-shrink-0`}
                >
                  {step.icon}
                </motion.div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: step.color }}>{t(step.actor)}</p>
                  <p className="text-white font-black text-xs leading-tight">{t(step.action)}</p>
                </div>
              </div>
              <p className="text-gray-400 text-[11px] leading-relaxed relative z-10">{t(step.detail)}</p>
              {/* Connector arrow */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full w-8 flex items-center justify-end">
                <div className="w-full h-px" style={{ backgroundColor: step.color + '60' }} />
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

const RoleCard = ({ role, idx, t }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: idx * 0.1, duration: 0.5, ease: [0.34, 1.2, 0.64, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ y: -4 }}
      className="bg-gray-900 border border-gray-800 rounded-2xl sm:rounded-3xl p-4 sm:p-5 relative overflow-hidden cursor-default flex-shrink-0 w-[72%] min-w-0 sm:min-w-[45%] lg:min-w-0 snap-center shadow-lg h-full flex flex-col"
    >
      <motion.div
        animate={{ opacity: hovered ? 0.08 : 0 }}
        className={`absolute inset-0 bg-gradient-to-br ${role.bg}`}
        transition={{ duration: 0.3 }}
      />
      {/* Shimmer */}
      <motion.div
        animate={{ x: hovered ? ['−100%', '200%'] : '-100%' }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12"
      />

      <div className="relative z-10">
        <motion.div
          animate={{ scale: hovered ? 1.08 : 1, boxShadow: hovered ? `0 0 24px ${role.color}50` : 'none' }}
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br ${role.bg} flex items-center justify-center text-white mb-3 sm:mb-4`}
        >
          {role.icon}
        </motion.div>
        <p className="font-black text-white text-xs sm:text-sm mb-2.5 sm:mb-3" style={{ color: role.color }}>{t(role.role)}</p>
        {role.points.map((pt, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.08 + i * 0.05 }}
            className="flex items-center space-x-2 mb-1.5"
          >
            <FiCheckCircle size={10} style={{ color: role.color }} className="flex-shrink-0" />
            <span className="text-[10px] sm:text-[11px] text-gray-400 font-semibold truncate">{t(pt)}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

// ─────────────── MAIN COMPONENT ───────────────

const EcosystemFlow = () => {
  const allTexts = useMemo(() => [
    'How It Actually Works',
    'From Request to',
    'Completion',
    'A 6-step transparent journey — designed so no farmer ever has to wait for equipment.',
    'Click any node to see its steps',
    'Who\'s involved',
    'Booking Complete',
    ...JOURNEY_STEPS.flatMap(s => [s.actor, s.action, s.detail]),
    ...ECOSYSTEM_ROLES.flatMap(r => [r.role, ...r.points]),
  ], []);
  const { getTranslatedText: t } = usePageTranslation(allTexts);
  return (
    <section className="py-8 sm:py-12 md:py-16 bg-gray-950 overflow-hidden relative">
      {/* BG glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-green-900/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-6 sm:mb-10 md:mb-12"
        >
          <span className="text-[10px] text-yellow-400 font-black uppercase tracking-[0.3em]">{t('How It Actually Works')}</span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white mt-1.5 sm:mt-2 mb-2 sm:mb-3 tracking-tight">
            {t('From Request to')}<span className="text-green-400"> {t('Completion')}</span>
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 max-w-lg mx-auto">
            {t('A 6-step transparent journey — designed so no farmer ever has to wait for equipment.')}
          </p>
        </motion.div>

        {/* ─── VERTICAL TIMELINE ─── */}
        <div className="relative max-w-4xl mx-auto mb-10 sm:mb-16">
          {/* Center vertical line on desktop, Left vertical line on mobile */}
          <div className="absolute left-5 sm:left-6 md:left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gray-800 z-0 overflow-hidden">
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: '100%' }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="w-full bg-gradient-to-b from-green-500 via-yellow-500 to-emerald-500"
            />
            <TimelinePulse />
          </div>

          <div className="relative z-10 flex flex-col gap-4 sm:gap-6 md:gap-8">
            {JOURNEY_STEPS.map((step, idx) => (
              <JourneyStep key={step.id} step={step} idx={idx} t={t} />
            ))}
          </div>

          {/* End marker */}
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.8, type: 'spring' }}
            className="flex justify-center mt-5 sm:mt-6"
          >
            <div className="flex items-center space-x-2 bg-green-900/40 border border-green-700 px-4 sm:px-5 py-1.5 sm:py-2 rounded-full">
              <HiOutlineStar size={12} className="text-yellow-400" />
              <span className="text-green-400 font-black text-[11px] sm:text-xs tracking-widest uppercase">{t('Booking Complete')}</span>
              <HiOutlineStar size={12} className="text-yellow-400" />
            </div>
          </motion.div>
        </div>

        {/* Mobile/Tablet Slider */}
        <div className="md:hidden -mx-4">
          <div className="flex flex-nowrap items-stretch overflow-x-auto w-full gap-3 pb-6 no-scrollbar snap-x snap-mandatory px-4 touch-pan-x relative">
            {ECOSYSTEM_ROLES.map((role, idx) => (
              <RoleCard key={role.role} role={role} idx={idx} t={t} />
            ))}
          </div>
        </div>

        {/* Desktop Grid */}
        <div className="hidden md:grid md:grid-cols-3 gap-6 mt-10">
          {ECOSYSTEM_ROLES.map((role, idx) => (
            <RoleCard key={role.role} role={role} idx={idx} t={t} />
          ))}
        </div>

      </div>
    </section>
  );
};

export default EcosystemFlow;
