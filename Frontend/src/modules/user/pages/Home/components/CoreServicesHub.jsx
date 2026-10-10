import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowUpRight, FiUsers, FiTrendingUp } from 'react-icons/fi';
import { LuTractor } from 'react-icons/lu';
import { RiGamepadLine } from 'react-icons/ri';

const pillars = [
  {
    id: 'rentals',
    title: 'मशीनरी किराया',
    titleEn: 'Machinery Rental',
    subtitle: 'ट्रैक्टर, हार्वेस्टर व उपकरण',
    badge: 'किराया बाज़ार',
    image: '/landing_images/tracter.jpg',
    route: '/user/rentals',
    icon: LuTractor,
    accentDot: 'bg-amber-400'
  },
  {
    id: 'workers',
    title: 'खेत मजदूर',
    titleEn: 'Farm Workforce',
    subtitle: 'एकल मजदूर व श्रमिक टोली',
    badge: 'श्रमिक टोली',
    image: '/landing_images/labour1.jpg',
    route: '/user/worker-explorer',
    icon: FiUsers,
    accentDot: 'bg-emerald-400'
  },
  {
    id: 'drones',
    title: 'ड्रोन छिड़काव',
    titleEn: 'Drone Spraying',
    subtitle: '10 मिनट में 1 एकड़ स्प्रे',
    badge: 'ड्रोन सेवा',
    image: '/landing_images/dron_spraying.jpg',
    route: '/user/drone-spraying',
    icon: RiGamepadLine,
    accentDot: 'bg-sky-400'
  },
  {
    id: 'mandi',
    title: 'मंडी व योजनाएं',
    titleEn: 'Mandi & Schemes',
    subtitle: 'दैनिक APMC भाव व सब्सिडी',
    badge: 'दैनिक भाव',
    image: '/landing_images/crop_advasory.jpg',
    action: 'scroll-to-mandi',
    icon: FiTrendingUp,
    accentDot: 'bg-purple-400'
  }
];

const CoreServicesHub = ({ onScrollToMandi }) => {
  const navigate = useNavigate();

  const handleCardClick = (pillar) => {
    if (pillar.route) {
      navigate(pillar.route);
    } else if (pillar.action === 'scroll-to-mandi') {
      if (onScrollToMandi) {
        onScrollToMandi();
      } else {
        const el = document.getElementById('mandi-schemes-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <section className="px-5 py-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[17px] sm:text-[19px] font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>प्रमुख कृषि सेवाएँ</span>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              SOW Ecosystem
            </span>
          </h2>
          <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
            किराया, मजदूर, ड्रोन एवं सरकारी कृषि सुविधाएँ
          </p>
        </div>
      </div>

      {/* 2x2 Responsive Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
        {pillars.map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleCardClick(item)}
              className="relative h-[132px] sm:h-[155px] rounded-2xl overflow-hidden cursor-pointer shadow-[0_4px_14px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-slate-200/80 hover:border-emerald-500/40 transition-all duration-300 group"
            >
              {/* Background Photo */}
              <img
                src={item.image}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-106 transition-transform duration-700 ease-out"
                loading="lazy"
              />

              {/* Natural Scrim (Keeps natural photography colors intact, ensures crisp text legibility) */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent transition-opacity duration-300" />

              {/* Top Row: Refined Glass Badge & Arrow */}
              <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
                <span className="text-[9.5px] font-bold tracking-wide px-2.5 py-0.5 rounded-full backdrop-blur-md bg-black/40 text-white border border-white/15 shadow-sm flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${item.accentDot}`} />
                  {item.badge}
                </span>
                <div className="w-6 h-6 rounded-full bg-black/35 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/90 group-hover:bg-white group-hover:text-slate-900 transition-all">
                  <FiArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Bottom Content: Titles with Clean Legibility */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon className="w-3.5 h-3.5 text-white/90 shrink-0" />
                  <h3 className="text-[13px] sm:text-[14px] font-black text-white leading-tight drop-shadow-sm">
                    {item.title}
                  </h3>
                </div>
                <p className="text-[10px] sm:text-[11px] font-medium text-white/85 leading-tight line-clamp-1 drop-shadow-xs">
                  {item.subtitle}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};

export default CoreServicesHub;
