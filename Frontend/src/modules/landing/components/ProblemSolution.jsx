import React, { useMemo, useState, useRef } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { HiOutlineSearch, HiOutlineShieldCheck, HiOutlineCurrencyDollar, HiOutlineClock, HiArrowRight } from 'react-icons/hi';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

const problems = [
  "High cost of modern farm machinery",
  "Limited access to technology in rural areas",
  "Middleman dependency & unorganized services",
  "Lack of timely weather, soil, and crop insights",
  "Small farmers cannot afford high-cost equipment",
  "Labour shortage & rising wages",
];

const solutions = [
  { title: "On-Demand Rentals", desc: "Rent nearby machinery via app", icon: <HiOutlineSearch /> },
  { title: "Pay-As-You-Go", desc: "Pay for actual usage hours", icon: <HiOutlineCurrencyDollar /> },
  { title: "Verified Partners", desc: "100% verified owners", icon: <HiOutlineShieldCheck /> },
  { title: "AI-Advised Farming", desc: "Weather & crop advisory", icon: <HiOutlineClock /> },
];

// Problem row with stagger + X slide
const ProblemRow = ({ item, index, getTranslatedText }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-30px' });
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -30 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ delay: index * 0.09, duration: 0.45, ease: 'easeOut' }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="flex items-start space-x-3 group cursor-default"
    >
      {/* Animated bullet */}
      <motion.div
        animate={{ scale: hovered ? 1.25 : 1, backgroundColor: hovered ? '#dc2626' : '#fee2e2' }}
        transition={{ duration: 0.25 }}
        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
      >
        <motion.div
          animate={{ scale: hovered ? 1 : 0.6, backgroundColor: hovered ? '#fff' : '#dc2626' }}
          className="w-2 h-2 rounded-full"
          transition={{ duration: 0.25 }}
        />
      </motion.div>
      <motion.p
        animate={{ color: hovered ? '#dc2626' : '#374151', x: hovered ? 4 : 0 }}
        transition={{ duration: 0.25 }}
        className="text-sm font-semibold leading-tight"
      >
        {getTranslatedText(item)}
      </motion.p>
    </motion.div>
  );
};

// Solution card with 3D tilt
const SolutionRow = ({ item, index, getTranslatedText }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });
  const [hovered, setHovered] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [6, -6]), { stiffness: 250, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-6, 6]), { stiffness: 250, damping: 20 });

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const handleMouseLeave = () => { mouseX.set(0); mouseY.set(0); };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: 30 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ delay: index * 0.1, duration: 0.45, ease: 'easeOut' }}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="flex items-center space-x-4 p-3 rounded-2xl transition-colors cursor-default"
    >
      <motion.div
        animate={{
          backgroundColor: hovered ? '#16a34a' : 'rgba(255,255,255,0.08)',
          scale: hovered ? 1.1 : 1,
          boxShadow: hovered ? '0 0 20px rgba(74,222₹28,0.4)' : 'none',
        }}
        transition={{ duration: 0.3 }}
        className="w-11 h-11 rounded-2xl flex items-center justify-center text-green-400 text-xl flex-shrink-0"
      >
        {item.icon}
      </motion.div>
      <div>
        <motion.h4
          animate={{ x: hovered ? 3 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white font-black text-sm tracking-tight"
        >
          {getTranslatedText(item.title)}
        </motion.h4>
        <p className="text-green-300/60 text-xs font-medium">{getTranslatedText(item.desc)}</p>
      </div>
      <motion.div
        animate={{ opacity: hovered ? 1 : 0, x: hovered ? 0 : -6 }}
        transition={{ duration: 0.2 }}
        className="ml-auto text-green-400"
      >
        <HiArrowRight size={14} />
      </motion.div>
    </motion.div>
  );
};

const ProblemSolution = () => {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true });

  const allTexts = useMemo(() => [
    "The Challenge & The Change", "Modernizing Agriculture Rental",
    "Traditional Challenges", "Digital Ecosystem for Farm Access",
    ...problems,
    "Problem is not lack of machinery, Problem is lack of access.",
    "Our Solution: AgroYilt",
    ...solutions.flatMap(s => [s.title, s.desc]),
    "Drones", "Farm Workforce", "Marketplace"
  ], []);

  const { getTranslatedText } = usePageTranslation(allTexts);

  const tags = ["Drones", "Farm Workforce", "Marketplace"];

  return (
    <section ref={sectionRef} id="problem" className="py-8 md:py-14 bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-6 md:mb-10"
        >
          <span className="text-[10px] text-green-700 font-black tracking-[0.3em] uppercase">
            {getTranslatedText("The Challenge & The Change")}
          </span>
          <p className="text-2xl md:text-3xl font-black tracking-tight text-gray-900 leading-tight mt-2">
            {getTranslatedText("Modernizing Agriculture Rental")}
          </p>
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: '3rem' }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="h-1 bg-green-500 rounded-full mx-auto mt-3"
          />
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

          {/* LEFT: Problem Column */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="bg-white p-7 md:p-8 rounded-[2rem] shadow-lg border border-red-50 relative overflow-hidden"
          >
            {/* Animated background blob */}
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.04, 0.08, 0.04] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-0 right-0 w-40 h-40 bg-red-400 rounded-full -translate-y-16 translate-x-16 blur-2xl"
            />

            {/* Header */}
            <div className="flex items-center space-x-2 mb-6">
              <motion.div
                animate={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                className="w-2 h-2 rounded-full bg-red-500"
              />
              <h3 className="text-lg font-black text-red-600 tracking-tight">
                {getTranslatedText("Traditional Challenges")}
              </h3>
            </div>

            {/* Problem list */}
            <div className="space-y-3.5 mb-7">
              {problems.map((item, i) => (
                <ProblemRow key={i} item={item} index={i} getTranslatedText={getTranslatedText} />
              ))}
            </div>

            {/* Quote box */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 }}
              className="relative overflow-hidden p-5 bg-red-600 rounded-2xl text-white shadow-lg group"
            >
              {/* Shimmer sweep */}
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12"
              />
              <p className="text-sm font-bold leading-snug relative z-10">
                "{getTranslatedText("Problem is not lack of machinery, Problem is lack of access.")}"
              </p>
            </motion.div>
          </motion.div>

          {/* RIGHT: Solution Column */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="bg-green-900 p-7 md:p-8 rounded-[2rem] shadow-xl relative overflow-hidden border border-green-800"
          >
            {/* Animated background orbs */}
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.08, 0.15, 0.08] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-0 right-0 w-56 h-56 bg-green-400 rounded-full -translate-y-28 translate-x-28 blur-3xl"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.1, 0.05] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
              className="absolute bottom-0 left-0 w-40 h-40 bg-emerald-500 rounded-full translate-y-20 -translate-x-20 blur-2xl"
            />

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center space-x-2 bg-green-800 text-green-400 px-4 py-1.5 rounded-full text-[10px] font-black mb-5 tracking-widest uppercase shadow-sm border border-green-700"
            >
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span>{getTranslatedText("Our Solution: AgroYilt")}</span>
            </motion.div>

            {/* Title with character stagger */}
            <motion.h3
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.25, duration: 0.5 }}
              className="text-2xl font-black text-white mb-6 leading-tight tracking-tight"
            >
              {getTranslatedText("Digital Ecosystem for Farm Access")}
            </motion.h3>

            {/* Solution rows */}
            <div className="space-y-1 mb-7 relative z-10">
              {solutions.map((item, i) => (
                <SolutionRow key={i} item={item} index={i} getTranslatedText={getTranslatedText} />
              ))}
            </div>

            {/* Tag chips with stagger */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap gap-2 relative z-10"
            >
              {tags.map((tag, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  whileHover={{ scale: 1.08, backgroundColor: 'rgba(74,222₹28,0.15)', borderColor: '#4ade80' }}
                  className="bg-green-800/50 text-green-300 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-green-700/50 cursor-default transition-colors"
                >
                  {getTranslatedText(tag)}
                </motion.span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSolution;
