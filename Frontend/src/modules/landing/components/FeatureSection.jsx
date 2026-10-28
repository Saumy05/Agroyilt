import React, { useMemo, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { HiOutlineMap, HiOutlineCalendar, HiOutlineBadgeCheck, HiOutlineCloud, HiOutlineChartBar, HiOutlineLockClosed } from 'react-icons/hi';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import featureImg from '../landing_images/dron_spraying1.jpg';

const FeatureCard = ({ feature, idx, isCompactMobile = false }) => {
  const [hovered, setHovered] = useState(false);
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-30px' });

  if (isCompactMobile) {
    return (
      <div className="bg-white p-3 rounded-xl sm:rounded-2xl border border-green-100 shadow-sm flex flex-col justify-between">
        <div className="flex items-center space-x-2.5 mb-1.5">
          <div className="w-8 h-8 rounded-lg bg-green-50 text-green-700 flex items-center justify-center shrink-0">
            {React.cloneElement(feature.icon, { className: 'w-4 h-4' })}
          </div>
          <h3 className="text-xs sm:text-sm font-bold text-gray-900 leading-tight truncate">{feature.title}</h3>
        </div>
        <p className="text-[10px] sm:text-[11px] text-gray-500 leading-normal line-clamp-2">{feature.desc}</p>
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.08, duration: 0.5, ease: 'easeOut' }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="relative group overflow-hidden rounded-2xl md:rounded-3xl border border-green-100 bg-white p-4 sm:p-6 cursor-default shadow-sm hover:shadow-xl hover:shadow-green-900/5 transition-all h-full flex flex-col"
    >
      {/* Animated BG glow */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent"
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      {/* Animated line accent */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 w-0.5 bg-green-600 rounded-full"
        animate={{ scaleY: hovered ? 1 : 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{ transformOrigin: 'top' }}
      />

      <div className="relative z-10 flex items-start space-x-3 sm:space-x-4">
        {/* Icon */}
        <motion.div
          animate={{
            backgroundColor: hovered ? '#15803d' : '#f0fdf4',
            color: hovered ? '#fff' : '#15803d',
          }}
          transition={{ duration: 0.3 }}
          className="flex-shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shadow-sm"
        >
          {React.cloneElement(feature.icon, { className: 'w-4 h-4 sm:w-5 sm:h-5' })}
        </motion.div>

        <div className="min-w-0">
          <h3 className="text-xs sm:text-sm font-black text-gray-900 mb-1 tracking-tight group-hover:text-green-700 transition-colors">{feature.title}</h3>
          <p className="text-[11px] sm:text-xs text-gray-500 leading-relaxed font-medium">{feature.desc}</p>
        </div>
      </div>
    </motion.div>
  );
};

const FeatureSection = () => {
  const allTexts = useMemo(() => [
    "Real-time Tracking", "Live GPS tracking of your booked tractor or harvester in real-time.",
    "Easy Scheduling", "Pre-book machines for your harvest season to avoid last-minute rushes.",
    "Verified Operators", "Every machine comes with a skilled and verified operator for efficiency.",
    "Weather Alerts", "In-app weather monitoring to help you plan your farming activities better.",
    "Proof of Work", "Secure image & speedometer proof uploads for transparent billing.",
    "OTP Security", "Fully secure transactions with mobile OTP based work verification.",
    "Built for Modern Farmers", "Packed with features that simplify every step of the agriculture process.",
    "Elite Tech", "Certified 2024", "Modern Farming Features"
  ], []);

  const { getTranslatedText } = usePageTranslation(allTexts);

  const features = [
    { title: getTranslatedText("Real-time Tracking"), desc: getTranslatedText("Live GPS tracking of your booked tractor or harvester in real-time."), icon: <HiOutlineMap className="w-8 h-8" /> },
    { title: getTranslatedText("Easy Scheduling"), desc: getTranslatedText("Pre-book machines for your harvest season to avoid last-minute rushes."), icon: <HiOutlineCalendar className="w-8 h-8" /> },
    { title: getTranslatedText("Verified Operators"), desc: getTranslatedText("Every machine comes with a skilled and verified operator for efficiency."), icon: <HiOutlineBadgeCheck className="w-8 h-8" /> },
    { title: getTranslatedText("Weather Alerts"), desc: getTranslatedText("In-app weather monitoring to help you plan your farming activities better."), icon: <HiOutlineCloud className="w-8 h-8" /> },
    { title: getTranslatedText("Proof of Work"), desc: getTranslatedText("Secure image & speedometer proof uploads for transparent billing."), icon: <HiOutlineChartBar className="w-8 h-8" /> },
    { title: getTranslatedText("OTP Security"), desc: getTranslatedText("Fully secure transactions with mobile OTP based work verification."), icon: <HiOutlineLockClosed className="w-8 h-8" /> },
  ];

  return (
    <section id="features" className="py-8 sm:py-12 md:py-16 bg-white overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-14">

          {/* Heading - shown first on mobile & desktop */}
          <div className="w-full lg:hidden text-center">
            <span className="text-[10px] text-green-700 font-black uppercase tracking-[0.3em]">{getTranslatedText("Modern Farming Features")}</span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1.5 mb-2 tracking-tight leading-tight">
              {getTranslatedText("Built for Modern Farmers")}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 font-medium max-w-sm mx-auto leading-relaxed">
              {getTranslatedText("Packed with features that simplify every step of the agriculture process.")}
            </p>
          </div>

          {/* LEFT: Image with floating badge */}
          <div className="w-full lg:w-1/2 relative">
            {/* Blur blobs */}
            <div className="absolute -top-14 -left-14 w-56 h-56 bg-green-100 rounded-full blur-3xl opacity-60 animate-pulse pointer-events-none" />
            <div className="absolute -bottom-14 -right-14 w-40 h-40 bg-yellow-100 rounded-full blur-3xl opacity-40 animate-pulse pointer-events-none" style={{ animationDelay: '1s' }} />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, rotate: -1 }}
              whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="relative rounded-2xl sm:rounded-[2.5rem] overflow-hidden shadow-xl sm:shadow-2xl"
            >
              <img
                src={featureImg}
                alt={getTranslatedText("Modern Farming Features")}
                className="w-full h-44 sm:h-64 md:h-[430px] object-cover"
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
            </motion.div>

            {/* Live indicator */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="absolute top-3 left-3 sm:top-6 sm:left-6 bg-black/60 backdrop-blur-md text-white px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full flex items-center space-x-1.5 sm:space-x-2 border border-white/10"
            >
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Live Tracking</span>
            </motion.div>
          </div>

          {/* RIGHT: Desktop Header + Features */}
          <div className="hidden lg:block lg:w-1/2 w-full min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-6 md:mb-8 text-left"
            >
              <span className="text-xs text-green-700 font-black uppercase tracking-[0.3em]">{getTranslatedText("Modern Farming Features")}</span>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 mt-2 mb-3 tracking-tight leading-tight">
                {getTranslatedText("Built for Modern Farmers")}
              </h2>
              <p className="text-sm text-gray-500 font-medium max-w-sm leading-relaxed">
                {getTranslatedText("Packed with features that simplify every step of the agriculture process.")}
              </p>
            </motion.div>
          </div>

        </div>

        {/* Mobile: Compact 2-column grid showing all 6 features without sideways scrolling */}
        <div className="lg:hidden mt-5 sm:mt-8">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {features.map((feature, idx) => (
              <FeatureCard key={idx} feature={feature} idx={idx} isCompactMobile={true} />
            ))}
          </div>
        </div>

        {/* Desktop Grid */}
        <div className="hidden lg:block mt-12">
          <div className="grid lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <FeatureCard key={idx} feature={feature} idx={idx} />
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};

export default FeatureSection;
