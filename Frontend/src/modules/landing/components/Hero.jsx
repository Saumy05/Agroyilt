import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import harvesterHero from '../landing_images/hero_premium.png';
import TranslatedText from '../../../components/TranslatedText';
import PlayStoreButton from './PlayStoreButton';
import { FiPlay } from 'react-icons/fi';

// Register ScrollTrigger once with safe config.
// ignoreMobileResize: true prevents GSAP from attaching a media-query listener
// that appends/removes a 100vh-measurement div on every mobile viewport change.
// Without this, _onMediaChange2 → _refresh100vh2 → removeChild throws a
// NotFoundError when React has already cleaned up the DOM node.
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({
    ignoreMobileResize: true,
    autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load',
  });
}

// Floating particle component — small, subtle, behind content
const FloatingParticle = ({ style }) => (
  <motion.div
    className="absolute rounded-full bg-yellow-400/10 border border-yellow-400/15"
    style={style}
    animate={{ y: [0, -15, 0], opacity: [0.15, 0.35, 0.15] }}
    transition={{ duration: 5 + Math.random() * 3, repeat: Infinity, ease: 'easeInOut', delay: Math.random() * 2 }}
  />
);

const particles = [
  { width: 40, height: 40, top: '15%', left: '72%' },
  { width: 28, height: 28, top: '62%', left: '68%' },
  { width: 55, height: 55, top: '25%', right: '5%' },
  { width: 30, height: 30, top: '75%', right: '8%' },
  { width: 20, height: 20, top: '85%', left: '60%' },
  { width: 45, height: 45, top: '8%', right: '18%' },
];

const Hero = () => {
  const heroRef = useRef(null);
  const bgRef = useRef(null);
  const contentRef = useRef(null);
  const statsRef = useRef(null);
  const [stats, setStats] = useState({ farmers: 0, owners: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/public/stats');
        if (response.data.success) {
          setStats(response.data.data);
        }
      } catch (error) {
        console.error('Fetch stats error:', error);
      }
    };
    fetchStats();
    // GSAP Parallax on scroll only
    const ctx = gsap.context(() => {
      gsap.to(bgRef.current, {
        yPercent: 25,
        ease: 'none',
        scrollTrigger: {
          trigger: heroRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
    }, heroRef);

    return () => ctx.revert();
  }, []);

  const statVariants = {
    hidden: { opacity: 0, y: 20 },
    show: (i) => ({
      opacity: 1, y: 0,
      transition: { delay: 0.8 + i * 0.15, duration: 0.6, ease: 'easeOut' }
    })
  };

  const formatNumber = (num) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k+';
    }
    return num + '+';
  };

  return (
    <section ref={heroRef} className="relative min-h-screen flex flex-col justify-center overflow-hidden">

      {/* Parallax BG */}
      <div ref={bgRef} className="absolute inset-0 z-0 will-change-transform">
        <img
          src={harvesterHero}
          alt="AgroYilt Hero"
          className="w-full h-full object-cover scale-110"
        />
        {/* Multi-layer gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/20 z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
      </div>

      {/* Floating Particles - behind main content (z-5) */}
      <div className="absolute inset-0 z-[5] pointer-events-none">
        {particles.map((p, i) => (
          <FloatingParticle key={i} style={p} />
        ))}
      </div>

      {/* Animated grid overlay */}
      <div
        className="absolute inset-0 z-10 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }}
      />

      {/* Main Content */}
      <div ref={contentRef} className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-20 pt-24 sm:pt-32 md:pt-40 pb-12 sm:pb-20 md:pb-24">
        <div className="max-w-3xl">

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="inline-flex items-center space-x-2 bg-yellow-500/15 backdrop-blur-md text-yellow-400 px-3.5 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold mb-4 sm:mb-6 tracking-widest uppercase border border-yellow-500/30 shadow-lg"
          >
            <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-yellow-400 rounded-full animate-pulse" />
            <span><TranslatedText>Founded in India</TranslatedText></span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-4xl sm:text-5xl md:text-7xl font-black text-white leading-tight md:leading-none mb-2 tracking-tighter"
          >
            AGROYILT
          </motion.h1>

          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '4rem' }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="h-1 bg-yellow-400 rounded-full mb-4 sm:mb-6"
          />

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-400 mb-3 sm:mb-5 font-serif italic"
          >
            <TranslatedText>Grow more with AGROYILT</TranslatedText>
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="text-xs sm:text-sm md:text-base text-gray-300 mb-6 sm:mb-8 max-w-2xl leading-relaxed font-medium"
          >
            <TranslatedText>
              AgroYilt is made for farmers. Farmers can book tractors, harvesters, rotavators, drones, JCB, borewell machines, labour, and other equipment on rent. With AgroYilt, they can also easily order seeds, fertilizers, and other farming items from nearby shops. Our goal is to make farming work easy, fast, and on time. Farmers can get modern technology, useful services, weather updates, and support in one place. AgroYilt helps save time, reduce trouble, and improve farming work. We want every farmer to get the right machine, right service, and right support at the right time.
            </TranslatedText>
          </motion.p>

          {/* CTA Buttons - Compact & responsive */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="space-y-2.5 sm:space-y-0 sm:flex sm:flex-row sm:flex-wrap sm:gap-3 mb-8 sm:mb-12 md:mb-16"
          >
            <Link to="/user/login" className="block sm:inline-block">
              <motion.div
                whileHover={{ scale: 1.04, boxShadow: '0 20px 40px rgba(21, 128, 61, 0.4)' }}
                whileTap={{ scale: 0.97 }}
                className="w-full sm:w-auto bg-green-600 text-white px-6 py-3 rounded-full text-xs sm:text-sm font-bold cursor-pointer shadow-xl text-center transition-colors hover:bg-green-700"
              >
                <TranslatedText>Book Now</TranslatedText>
              </motion.div>
            </Link>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:gap-3">
              <Link to="/vendor/login">
                <motion.div
                  whileHover={{ scale: 1.04, backgroundColor: 'rgba(255,255,255,0.15)' }}
                  whileTap={{ scale: 0.97 }}
                  className="bg-white/10 backdrop-blur-md text-white border border-white/30 px-3.5 sm:px-6 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-bold cursor-pointer text-center truncate"
                >
                  <TranslatedText>Owner Registration</TranslatedText>
                </motion.div>
              </Link>
              <Link to="/worker/login">
                <motion.div
                  whileHover={{ scale: 1.04, boxShadow: '0 20px 40px rgba(217, 119, 6, 0.4)' }}
                  whileTap={{ scale: 0.97 }}
                  className="bg-amber-600 text-white px-3.5 sm:px-6 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-bold cursor-pointer shadow-xl text-center transition-colors hover:bg-amber-700 truncate"
                >
                  <TranslatedText>Worker Join</TranslatedText>
                </motion.div>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:gap-3">
              <a
                href="#video-guides"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('video-guides')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <motion.div
                  whileHover={{ scale: 1.04, backgroundColor: 'rgba(255,255,255,0.2)' }}
                  whileTap={{ scale: 0.97 }}
                  className="bg-white/10 backdrop-blur-md text-white border border-yellow-400/50 px-3 sm:px-5 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-bold cursor-pointer text-center flex items-center justify-center gap-1.5 truncate"
                >
                  <FiPlay size={12} className="text-yellow-400 shrink-0" />
                  <span className="truncate"><TranslatedText>Watch Guides</TranslatedText></span>
                </motion.div>
              </a>
              <PlayStoreButton className="bg-white text-green-800 hover:bg-yellow-400 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm truncate" />
            </div>
          </motion.div>

          {/* Stats */}
          <div ref={statsRef} className="flex items-center space-x-6 sm:space-x-8 md:space-x-14">
            {[
              { value: formatNumber(stats.farmers), label: 'Happy Farmers' },
              { value: formatNumber(stats.owners), label: 'Verified Owners' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                custom={i}
                variants={statVariants}
                initial="hidden"
                animate="show"
                className="text-white group"
              >
                <p className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter group-hover:text-yellow-400 transition-colors">
                  {stat.value}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-widest font-bold mt-0.5 sm:mt-1">
                  <TranslatedText>{stat.label}</TranslatedText>
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll Indicator - fixed to bottom center */}
      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="hidden sm:flex absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20 flex-col items-center space-y-1 cursor-pointer"
        onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
      >
        <div className="w-4 sm:w-5 h-7 sm:h-9 border-2 border-white/25 rounded-full flex justify-center pt-1 sm:pt-1.5">
          <motion.div
            animate={{ y: [0, 5, 0], opacity: [1, 0, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="w-1 h-1 sm:h-1.5 bg-yellow-400 rounded-full"
          />
        </div>
      </motion.div>
    </section>
  );
};

export default Hero;
