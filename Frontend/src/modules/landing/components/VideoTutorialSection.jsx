import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FiPlay,
  FiPause,
  FiCheckCircle,
  FiMaximize2,
  FiSmartphone,
  FiMonitor,
  FiUser,
  FiTool,
  FiTruck,
  FiDownload,
  FiShield,
  FiClock,
  FiDollarSign,
  FiMapPin
} from 'react-icons/fi';
import TranslatedText from '../../../components/TranslatedText';

const guides = {
  farmer: {
    id: 'farmer',
    badge: 'FOR FARMERS / किसान भाई',
    title: 'Farmer Guide: Rent Machinery & Book Workers',
    subtitle: 'Learn how to book tractors, hire farm labour with Reach OTP, and make secure escrow payments.',
    icon: FiUser,
    color: '#22c55e', // green-500
    themeBg: 'rgba(34, 197, 94, 0.1)',
    themeBorder: 'rgba(34, 197, 94, 0.35)',
    landscapeSrc: '/videos/agroyilt_farmer_guide_actual_screens.mp4',
    verticalSrc: '/videos/agroyilt_farmer_guide_actual_screens_vertical.mp4',
    duration: '2 min 08 sec',
    ctaText: 'Book Equipment or Labour',
    ctaLink: '/user/login',
    features: [
      {
        icon: FiTool,
        title: 'Core Farm Services',
        desc: 'Rent tractors, harvesters, irrigation motors, or hire verified labourers in 1 click.',
      },
      {
        icon: FiClock,
        title: '3 Flexible Booking Modes',
        desc: 'Choose Hourly booking (with Reach OTP timer), Daily shifts, or Theka (fixed contract).',
      },
      {
        icon: FiShield,
        title: 'Escrow Protected Wallet',
        desc: 'Funds are securely held in Escrow and released only after verified work completion.',
      },
      {
        icon: FiMapPin,
        title: 'Verified Local Network',
        desc: 'Direct match with machinery providers & farm workers within your local district & taluka.',
      },
    ],
  },
  worker: {
    id: 'worker',
    badge: 'FOR WORKERS / कृषि श्रमिक',
    title: 'Worker Guide: Set Rates, Get Farm Jobs & Withdraw',
    subtitle: 'Learn how to set your hourly and daily wages, toggle online availability, and get paid directly to your bank account.',
    icon: FiTool,
    color: '#f59e0b', // amber-500
    themeBg: 'rgba(245, 158, 11, 0.1)',
    themeBorder: 'rgba(245, 158, 11, 0.35)',
    landscapeSrc: '/videos/agroyilt_worker_training_guide.mp4',
    verticalSrc: '/videos/agroyilt_worker_training_guide_vertical.mp4',
    duration: '2 min 02 sec',
    ctaText: 'Join as Independent Worker',
    ctaLink: '/worker/login',
    features: [
      {
        icon: FiCheckCircle,
        title: 'Live Online Toggle',
        desc: 'Turn availability ON when you want to work, and OFF when you are busy.',
      },
      {
        icon: FiDollarSign,
        title: 'Set Your Own Rates',
        desc: 'Transparently set your custom hourly (₹100/hr), daily (₹600/day), or per-acre rate.',
      },
      {
        icon: FiClock,
        title: 'Instant Job Notifications',
        desc: 'Get instant alerts when a local farmer selects you for harvesting, sowing, or weeding.',
      },
      {
        icon: FiShield,
        title: 'Direct Bank Withdrawal',
        desc: 'Check your live daily earnings ledger and withdraw money directly into your bank.',
      },
    ],
  },
  vendor: {
    id: 'vendor',
    badge: 'FOR EQUIPMENT OWNERS / मशीनरी मालिक',
    title: 'Vendor Guide: List Fleet, Accept Bookings & Grow',
    subtitle: 'Learn how to list tractors, pumps, and pipes, set custom hourly/daily rates, and manage bookings.',
    icon: FiTruck,
    color: '#3b82f6', // blue-500
    themeBg: 'rgba(59, 130, 246, 0.1)',
    themeBorder: 'rgba(59, 130, 246, 0.35)',
    landscapeSrc: '/videos/agroyilt_vendor_training_guide.mp4',
    verticalSrc: '/videos/agroyilt_vendor_training_guide_vertical.mp4',
    duration: '2 min 03 sec',
    ctaText: 'Register Your Equipment',
    ctaLink: '/vendor/login',
    features: [
      {
        icon: FiTruck,
        title: 'Rentable Fleet Inventory',
        desc: 'Manage your tractors, harvesters, irrigation motors, and pipes in one clean dashboard.',
      },
      {
        icon: FiTool,
        title: 'Custom Rate & Service Model',
        desc: 'Configure Service (with driver) or Rental (machine only), set per-hour or per-day price.',
      },
      {
        icon: FiClock,
        title: 'Booking Schedule & Fleet Status',
        desc: 'Accept or decline farmer rental requests with farm location and required hours.',
      },
      {
        icon: FiShield,
        title: 'Guaranteed Payout Security',
        desc: 'All booking payments are backed by AgroYilt Escrow for 100% peace of mind.',
      },
    ],
  },
};

const VideoTutorialSection = () => {
  const [activeTab, setActiveTab] = useState('farmer');
  const [format, setFormat] = useState('landscape'); // 'landscape' | 'vertical'
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  const current = guides[activeTab];
  const videoSrc = format === 'landscape' ? current.landscapeSrc : current.verticalSrc;

  // Reset play state and pause on tab/format switch
  useEffect(() => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.load();
    }
  }, [activeTab, format]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <section id="video-guides" className="py-10 sm:py-16 md:py-24 bg-gray-950 text-white relative overflow-hidden border-t border-b border-gray-900">
      {/* Background ambient lighting */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full blur-[140px] pointer-events-none opacity-20"
        style={{ background: current.color }}
      />
      <div className="absolute top-0 right-0 w-80 h-80 bg-green-900/10 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-10 md:mb-14">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center space-x-1.5 sm:space-x-2 bg-yellow-400/10 text-yellow-400 border border-yellow-400/25 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-3 sm:mb-4 shadow-sm"
          >
            <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span><TranslatedText>Step-by-Step App Video Guides</TranslatedText></span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-2 sm:mb-4"
          >
            <TranslatedText>See How AgroYilt Works in Action</TranslatedText>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 text-xs sm:text-sm md:text-base leading-relaxed"
          >
            <TranslatedText>
              Watch genuine screen recordings from the AgroYilt app with clear Hindi voiceover.
              See how easy it is to book machines, hire farm workers, set your daily rates, or register your machinery fleet.
            </TranslatedText>
          </motion.p>
        </div>

        {/* Role Switcher Tabs */}
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-3 mb-6 sm:mb-10">
          {Object.values(guides).map((g) => {
            const Icon = g.icon;
            const isActive = activeTab === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setActiveTab(g.id)}
                className={`flex flex-col sm:flex-row items-center gap-1 sm:gap-2.5 px-2 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer border ${
                  isActive
                    ? 'bg-gray-800 border-white/20 text-white shadow-xl scale-[1.02]'
                    : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`}
                style={isActive ? { borderLeftColor: g.color, borderLeftWidth: '3px' } : {}}
              >
                <div
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: isActive ? g.themeBg : 'rgba(255,255,255,0.05)', color: g.color }}
                >
                  <Icon size={14} />
                </div>
                <div className="text-center sm:text-left min-w-0">
                  <div className="leading-tight text-[11px] sm:text-sm truncate">
                    {g.id === 'farmer' ? 'Farmer' : g.id === 'worker' ? 'Worker' : 'Owner'}
                    <span className="hidden sm:inline"> / {g.id === 'farmer' ? 'किसान' : g.id === 'worker' ? 'मज़दूर' : 'मालिक'}</span>
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-gray-400 font-normal hidden sm:block">{g.duration}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Main Showcase Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-start max-w-6xl mx-auto">

          {/* Left Column: Video Player */}
          <div className="lg:col-span-7 bg-gray-900/90 rounded-2xl sm:rounded-3xl p-3 sm:p-5 border border-gray-800 shadow-xl sm:shadow-2xl">
            {/* Top Bar with Format Switcher */}
            <div className="flex items-center justify-between mb-3 pb-2.5 sm:mb-4 sm:pb-3 border-b border-gray-800">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span
                  className="text-[9px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md truncate max-w-[150px] sm:max-w-none"
                  style={{ background: current.themeBg, color: current.color, border: `1px solid ${current.themeBorder}` }}
                >
                  {current.badge}
                </span>
                <span className="text-[10px] sm:text-xs text-gray-400 whitespace-nowrap">⏱️ {current.duration}</span>
              </div>

              {/* Format Toggle Buttons */}
              <div className="flex items-center bg-gray-950 p-0.5 sm:p-1 rounded-lg sm:rounded-xl border border-gray-800 text-[10px] sm:text-xs">
                <button
                  type="button"
                  onClick={() => setFormat('landscape')}
                  className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-semibold transition-all cursor-pointer ${
                    format === 'landscape' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Widescreen 16:9 view"
                >
                  <FiMonitor size={12} />
                  <span>16:9</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('vertical')}
                  className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-semibold transition-all cursor-pointer ${
                    format === 'vertical' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Mobile App Reel 9:16 view"
                >
                  <FiSmartphone size={12} />
                  <span>9:16</span>
                </button>
                <Link
                  to={`/guide?role=${activeTab}`}
                  className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-md sm:rounded-lg font-semibold text-yellow-400 hover:text-white hover:bg-yellow-400/20 transition-all ml-0.5 sm:ml-1 bg-yellow-400/10 border border-yellow-400/30"
                  title="Open full-screen immersive guide"
                >
                  <FiMaximize2 size={12} />
                  <span className="hidden sm:inline">Full</span>
                </Link>
              </div>
            </div>

            {/* Video Canvas Container */}
            <div
              className={`relative bg-black rounded-xl sm:rounded-2xl overflow-hidden flex items-center justify-center transition-all duration-300 mx-auto ${
                format === 'vertical' ? 'max-w-[280px] sm:max-w-[340px] aspect-[9/16]' : 'w-full aspect-[16/9]'
              }`}
              style={{ boxShadow: `0 20px 40px -15px ${current.color}25` }}
            >
              <video
                key={videoSrc}
                ref={videoRef}
                src={videoSrc}
                controls
                playsInline
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="w-full h-full object-contain"
              />

              {/* Big initial Play Overlay when paused */}
              {!isPlaying && (
                <div
                  onClick={togglePlay}
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center cursor-pointer group transition-opacity"
                >
                  <motion.div
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-2xl transition-all"
                    style={{ background: current.color, color: '#000' }}
                  >
                    <FiPlay size={20} className="ml-1 sm:text-[26px]" />
                  </motion.div>
                  <p className="mt-2 sm:mt-3 text-[10px] sm:text-xs font-bold text-white tracking-wide bg-black/60 px-3 py-1 rounded-full">
                    Click to Play Hindi Guide
                  </p>
                </div>
              )}
            </div>

            {/* Video Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2 sm:mt-4 sm:pt-3 border-t border-gray-800 text-[10px] sm:text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: current.color }} />
                Hindi Voiceover • 100% Real AgroYilt Screens
              </span>
              <a
                href={videoSrc}
                download
                className="inline-flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title="Download video file for offline watching"
              >
                <FiDownload size={12} />
                <span>Download MP4</span>
              </a>
            </div>
          </div>

          {/* Right Column: Features & Direct CTA */}
          <div className="lg:col-span-5 flex flex-col justify-between h-full space-y-4 sm:space-y-6">
            <div>
              <div className="inline-block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 sm:mb-2">
                Walkthrough Highlights
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-white mb-1 sm:mb-2">{current.title}</h3>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-3 sm:mb-6">{current.subtitle}</p>

              {/* 4 Real Features from the actual screens */}
              <div className="space-y-2 sm:space-y-3.5">
                {current.features.map((feat, idx) => {
                  const FeatIcon = feat.icon;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.08 }}
                      className="flex items-start gap-2.5 sm:gap-3.5 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700 transition-all"
                    >
                      <div
                        className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: current.themeBg, color: current.color }}
                      >
                        <FeatIcon size={15} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-white mb-0.5">{feat.title}</h4>
                        <p className="text-[11px] sm:text-xs text-gray-400 leading-normal">{feat.desc}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Direct Role Action Button */}
            <div className="pt-3 sm:pt-4 border-t border-gray-800">
              <Link to={current.ctaLink}>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 sm:py-3.5 px-5 sm:px-6 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm text-center flex items-center justify-center gap-2 cursor-pointer shadow-xl transition-all"
                  style={{ background: current.color, color: '#090d0a' }}
                >
                  <span>{current.ctaText}</span>
                  <span>→</span>
                </motion.div>
              </Link>
              <p className="text-center text-[10px] sm:text-[11px] text-gray-500 mt-2">
                No credit card required • Available in English & Hindi
              </p>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};

export default VideoTutorialSection;

