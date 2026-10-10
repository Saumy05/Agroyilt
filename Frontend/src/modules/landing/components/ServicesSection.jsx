import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { LuTractor } from 'react-icons/lu';
import { GiScythe, GiDustCloud, GiDrippingTube, GiWheat } from 'react-icons/gi';
import { RiGamepadLine } from 'react-icons/ri';
import { HiX, HiOutlineUsers, HiArrowRight, HiArrowLeft } from 'react-icons/hi';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

// Import Images
import tractorImg from '../landing_images/tracter1.jpg';
import harvesterImg from '../landing_images/harvester2.jpg';
import droneImg from '../landing_images/dron_spraying.jpg';
import labourImg from '../landing_images/labour1.jpg';
import seedsImg from '../landing_images/fertilizer_seeds3.jpg';
import advisoryImg from '../landing_images/crop_advasory.jpg';

const SLIDE_DURATION = 5000;

const services = [
  { id: 1, title: "Tractor Rental", desc: "Top HP tractors for plowing, tilling and transport.", image: tractorImg, details: "Our fleet includes top brands like Mahindra, John Deere, and Swaraj.", icon: <LuTractor />, color: { badge: 'text-green-600 bg-green-50 border-green-100', btn: 'bg-green-700 hover:bg-green-800', dot: 'bg-green-500' }, specs: ["30HP - 90HP Range", "Verified Operators", "Attachments available"] },
  { id: 2, title: "Harvester Booking", desc: "Modern harvesters for minimal grain loss during harvest.", image: harvesterImg, details: "High-performance combine harvesters that minimize grain loss.", icon: <GiScythe />, color: { badge: 'text-yellow-700 bg-yellow-50 border-yellow-100', btn: 'bg-yellow-600 hover:bg-yellow-700', dot: 'bg-yellow-500' }, specs: ["Minimal Grain Loss", "GPS-linked Billing", "24/7 Season Support"] },
  { id: 3, title: "Drone Spraying", desc: "Precision pesticide & fertilizer spraying using drones.", image: droneImg, details: "Drones cover 1 acre in just 10-15 minutes, 90% water saving.", icon: <RiGamepadLine />, color: { badge: 'text-blue-700 bg-blue-50 border-blue-100', btn: 'bg-blue-700 hover:bg-blue-800', dot: 'bg-blue-500' }, specs: ["10 min per Acre", "90% Water Saving", "Precision Targeting"] },
  { id: 4, title: "Farm Workforce", desc: "Verified skilled and general farm labor on-demand.", image: labourImg, details: "Verified farm laborers and crews for sowing, weeding, harvesting, and field prep.", icon: <HiOutlineUsers />, color: { badge: 'text-purple-700 bg-purple-50 border-purple-100', btn: 'bg-purple-700 hover:bg-purple-800', dot: 'bg-purple-500' }, specs: ["Verified Workers", "Daily & Acre Wage", "Direct Booking"] },
  { id: 5, title: "Seeds & Fertilizer", desc: "Certified high-yield seeds & organic fertilizers.", image: seedsImg, details: "Certified, high-germination seeds and premium fertilizers.", icon: <GiDustCloud />, color: { badge: 'text-orange-700 bg-orange-50 border-orange-100', btn: 'bg-orange-600 hover:bg-orange-700', dot: 'bg-orange-500' }, specs: ["Certified Seeds", "Quality Checked", "Doorstep Delivery"] },
  { id: 6, title: "Crop Advisory", desc: "Expert advice on crop selection based on weather forecasts.", image: advisoryImg, details: "AI-driven and expert-verified advice based on soil & weather data.", icon: <GiWheat />, color: { badge: 'text-emerald-700 bg-emerald-50 border-emerald-100', btn: 'bg-emerald-700 hover:bg-emerald-800', dot: 'bg-emerald-500' }, specs: ["Weather Alerts", "Expert Consultations", "Pest Risk Alerts"] },
];

const textVariants = {
  enter: { opacity: 0, y: 24, filter: 'blur(6px)' },
  center: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -16, filter: 'blur(4px)' },
};

const ServicesSection = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedService, setSelectedService] = useState(null);
  const [direction, setDirection] = useState(1);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  const allTexts = useMemo(() => [
    "Agriculture Services", "Smart farming solutions designed for modern agriculture.",
    "Premium Solution", "View Details", "Book Now via App", "Contact support", "Service Highlights",
    ...services.flatMap(s => [s.title, s.desc, s.details, ...s.specs])
  ], []);
  const { getTranslatedText } = usePageTranslation(allTexts);

  const goTo = useCallback((idx, dir = 1) => {
    setDirection(dir);
    setCurrentIndex(idx);
    startTimeRef.current = Date.now();
    setProgress(0);
  }, []);

  const nextSlide = useCallback(() => goTo((currentIndex + 1) % services.length, 1), [currentIndex, goTo]);
  const prevSlide = useCallback(() => goTo((currentIndex - 1 + services.length) % services.length, -1), [currentIndex, goTo]);

  // Auto progress
  useEffect(() => {
    const frame = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / SLIDE_DURATION) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        nextSlide();
      }
    };
    const id = setInterval(frame, 50);
    return () => clearInterval(id);
  }, [nextSlide]);

  const service = services[currentIndex];

  const imageVariants = {
    enter: (d) => ({ opacity: 0, scale: 1.08, x: d > 0 ? 40 : -40 }),
    center: { opacity: 1, scale: 1.04, x: 0, transition: { duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] } },
    exit: (d) => ({ opacity: 0, scale: 0.98, x: d > 0 ? -30 : 30, transition: { duration: 0.4 } }),
  };

  return (
    <section id="services" className="py-12 bg-gray-50 overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2 tracking-tight">
            {getTranslatedText("Agriculture Services")}
          </h2>
          <p className="text-sm text-gray-500 max-w-2xl mx-auto font-medium">
            {getTranslatedText("Smart farming solutions designed for modern agriculture.")}
          </p>
        </motion.div>

        {/* Main Slider */}
        <div className="relative w-full rounded-[2rem] overflow-hidden shadow-2xl border border-gray-100 bg-white">
          {/* Desktop height spacer — invisible, keeps container tall on md+ */}
          <div className="hidden md:block" style={{ paddingTop: '42%' }} />

          {/* Animated Progress bar */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-30">
            <motion.div
              className={`h-full ${service.color.dot} transition-none`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={currentIndex}
              custom={direction}
              className="flex flex-col md:flex-row md:absolute md:inset-0"
            >
              {/* LEFT: Ken Burns Image */}
              <div className="w-full md:w-7/12 h-52 sm:h-64 md:h-full relative overflow-hidden flex-shrink-0">
                <motion.img
                  key={currentIndex}
                  custom={direction}
                  variants={imageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  src={service.image}
                  alt={service.title}
                  className="w-full h-full object-cover"
                  style={{ minHeight: '100%' }}
                />
                {/* Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent md:hidden" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/5 hidden md:block" />

                {/* Floating service count badge */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="absolute top-4 left-4 bg-black/50 backdrop-blur-md text-white text-[10px] font-black px-3 py-1.5 rounded-full border border-white/10 uppercase tracking-widest"
                >
                  {String(currentIndex + 1).padStart(2, '0')} / {String(services.length).padStart(2, '0')}
                </motion.div>
              </div>

              {/* RIGHT: Animated Content */}
              <div className="w-full md:w-5/12 p-7 md:p-10 flex flex-col justify-center bg-white relative overflow-hidden">
                {/* BG circle decoration */}
                <motion.div
                  key={`bg-${currentIndex}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.06 }}
                  transition={{ duration: 0.8 }}
                  className={`absolute -bottom-16 -right-16 w-48 h-48 rounded-full ${service.color.dot}`}
                />

                {/* Badge */}
                <motion.div
                  key={`badge-${currentIndex}`}
                  variants={textVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.45, delay: 0.05 }}
                  className={`inline-flex items-center space-x-2 self-start px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border mb-3 ${service.color.badge}`}
                >
                  <span className="text-sm">{React.cloneElement(service.icon, { size: 12 })}</span>
                  <span>{getTranslatedText("Premium Solution")}</span>
                </motion.div>

                {/* Title */}
                <motion.h3
                  key={`title-${currentIndex}`}
                  variants={textVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.45, delay: 0.12 }}
                  className="text-2xl md:text-3xl font-black text-gray-900 tracking-tighter leading-tight mb-2"
                >
                  {getTranslatedText(service.title)}
                </motion.h3>

                {/* Desc */}
                <motion.p
                  key={`desc-${currentIndex}`}
                  variants={textVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.45, delay: 0.2 }}
                  className="text-gray-500 text-xs leading-relaxed max-w-xs mb-4"
                >
                  {getTranslatedText(service.desc)}
                </motion.p>

                {/* Specs chips */}
                <motion.div
                  key={`specs-${currentIndex}`}
                  variants={textVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.45, delay: 0.28 }}
                  className="flex flex-wrap gap-1.5 mb-5"
                >
                  {service.specs.map((spec, i) => (
                    <span key={i} className={`text-[9px] font-bold px-2.5 py-1 rounded-full border ${service.color.badge}`}>
                      {getTranslatedText(spec)}
                    </span>
                  ))}
                </motion.div>

                {/* CTA */}
                <motion.div
                  key={`cta-${currentIndex}`}
                  variants={textVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.45, delay: 0.35 }}
                >
                  <motion.button
                    whileHover={{ scale: 1.04, x: 3 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setSelectedService(service)}
                    className={`inline-flex items-center space-x-2 ${service.color.btn} text-white px-5 py-2.5 rounded-full font-black text-[10px] uppercase tracking-widest transition-colors shadow-lg`}
                  >
                    <span>{getTranslatedText("View Details")}</span>
                    <HiArrowRight size={12} />
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Nav Arrows */}
          <motion.button
            whileHover={{ scale: 1.1, x: -2 }}
            whileTap={{ scale: 0.9 }}
            onClick={prevSlide}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg border border-gray-100 text-gray-600 hover:text-green-700 transition-colors"
          >
            <HiArrowLeft size={14} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1, x: 2 }}
            whileTap={{ scale: 0.9 }}
            onClick={nextSlide}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg border border-gray-100 text-gray-600 hover:text-green-700 transition-colors"
          >
            <HiArrowRight size={14} />
          </motion.button>
        </div>

        {/* Thumbnail Strip */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1 no-scrollbar justify-center">
          {services.map((svc, idx) => (
            <motion.button
              key={idx}
              onClick={() => goTo(idx, idx > currentIndex ? 1 : -1)}
              whileHover={{ scale: 1.06, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className={`relative flex-shrink-0 flex items-center space-x-2 px-3 py-2 rounded-xl border transition-all text-[10px] font-black uppercase tracking-wide ${currentIndex === idx ? 'bg-gray-900 text-white border-gray-900 shadow-lg' : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300 hover:text-gray-700'}`}
            >
              {currentIndex === idx && (
                <motion.div
                  layoutId="activePill"
                  className="absolute inset-0 bg-gray-900 rounded-xl"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <span className="relative z-10">{React.cloneElement(svc.icon, { size: 13 })}</span>
              <span className="relative z-10 hidden sm:block">{svc.title}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedService && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedService(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[2.5rem] p-8 md:p-12 max-w-2xl w-full relative shadow-2xl overflow-hidden"
            >
              {/* Decoration blob */}
              <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10 ${selectedService.color.dot}`} />

              <button
                onClick={() => setSelectedService(null)}
                className="absolute top-6 right-6 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              >
                <HiX size={20} className="text-gray-600" />
              </button>

              <div className="flex items-center space-x-5 mb-7">
                <div className={`p-4 rounded-2xl border text-xl ${selectedService.color.badge}`}>
                  {React.cloneElement(selectedService.icon, { size: 24 })}
                </div>
                <h3 className="text-2xl font-black text-gray-900">{getTranslatedText(selectedService.title)}</h3>
              </div>

              <p className="text-gray-600 text-base leading-relaxed mb-8">
                {getTranslatedText(selectedService.details)}
              </p>

              <div className="bg-gray-50 rounded-2xl p-5 mb-8">
                <h4 className="font-black text-gray-900 mb-4 uppercase tracking-widest text-[10px]">{getTranslatedText("Service Highlights")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {selectedService.specs.map((spec, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-xl border text-[10px] font-bold ${selectedService.color.badge}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedService.color.dot}`} />
                      <span>{getTranslatedText(spec)}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedService(null)}
                  className={`${selectedService.color.btn} text-white px-6 py-2.5 rounded-full font-bold text-sm flex-grow shadow-lg transition-colors`}
                >
                  {getTranslatedText("Book Now via App")}
                </motion.button>
                <button
                  onClick={() => setSelectedService(null)}
                  className="bg-gray-100 text-gray-600 px-5 py-2.5 rounded-full font-bold text-sm hover:bg-gray-200 transition-all"
                >
                  {getTranslatedText("Contact support")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default ServicesSection;
