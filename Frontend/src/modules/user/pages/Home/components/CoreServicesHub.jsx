import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowRight, FiChevronRight, FiUsers } from 'react-icons/fi';
import { LuTractor, LuLandmark } from 'react-icons/lu';
import { RiGamepadLine } from 'react-icons/ri';

const pillars = [
  {
    id: 'rentals',
    title: 'मशीनरी',
    titleEn: 'Machinery Rental',
    subtitle: 'किराया व उपकरण',
    image: '/landing_images/tracter.jpg',
    route: '/user/rentals',
    icon: LuTractor
  },
  {
    id: 'workers',
    title: 'श्रमिक टोली',
    titleEn: 'Farm Workforce',
    subtitle: 'खेत मजदूर',
    image: '/landing_images/labour1.jpg',
    route: '/user/worker-explorer',
    icon: FiUsers
  },
  {
    id: 'drones',
    title: 'ड्रोन स्प्रे',
    titleEn: 'Drone Spraying',
    subtitle: 'छिड़काव सेवा',
    image: '/landing_images/dron_spraying.jpg',
    route: '/user/drone-spraying',
    icon: RiGamepadLine
  },
  {
    id: 'mandi',
    title: 'मंडी व योजना',
    titleEn: 'Mandi & Schemes',
    subtitle: 'दैनिक भाव',
    image: '/landing_images/crop_advasory.jpg',
    route: '/user/mandi-bhav',
    icon: LuLandmark
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
    <section className="px-3.5 sm:px-5 py-2">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <h2 className="text-[16px] sm:text-[18px] font-black text-slate-900 tracking-tight flex items-center gap-1.5">
            <span>प्रमुख कृषि सेवाएँ</span>
            <span className="text-base select-none">🌱</span>
          </h2>
          <p className="text-[10.5px] sm:text-xs font-semibold text-slate-500 mt-0.5">
            किराया, मजदूर, ड्रोन एवं सरकारी कृषि सुविधाएँ
          </p>
        </div>

        <button
          onClick={() => navigate('/user/machinery-categories')}
          className="text-xs sm:text-sm font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 shrink-0 group transition-colors"
        >
          <span>सभी देखें</span>
          <FiChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* 4 Cards in One Horizontal Line - Image & Text Separate */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {pillars.map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.25 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleCardClick(item)}
              className="flex flex-col items-center cursor-pointer group w-full min-w-0"
            >
              {/* Separate Image Container */}
              <div className="w-full aspect-square rounded-2xl overflow-hidden bg-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_18px_rgba(0,0,0,0.12)] border border-slate-200/80 transition-all duration-300 relative flex items-center justify-center">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500 ease-out"
                  loading="lazy"
                />

                {/* Floating Circular Icon Badge */}
                <div className="absolute top-1.5 left-1.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-950/75 backdrop-blur-md border border-emerald-500/50 flex items-center justify-center text-white shadow-xs group-hover:bg-emerald-950/90 group-hover:border-emerald-400 transition-colors">
                  <Icon className="w-3.5 h-3.5 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
                </div>
              </div>

              {/* Separate Text Below Image */}
              <div className="mt-1.5 flex flex-col items-center text-center w-full px-0.5">
                <p className="text-[11px] sm:text-[13px] font-bold text-slate-800 leading-tight group-hover:text-emerald-700 transition-colors line-clamp-1 w-full">
                  {item.title}
                </p>
                {item.subtitle && (
                  <p className="text-[9px] sm:text-[10px] font-medium text-slate-500 leading-tight mt-0.5 line-clamp-1 w-full">
                    {item.subtitle}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};

export default CoreServicesHub;
