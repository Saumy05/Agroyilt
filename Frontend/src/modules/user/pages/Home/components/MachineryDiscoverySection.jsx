import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiTruck, FiArrowRight, FiCheckCircle,
  FiShield, FiClock
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import { publicEquipmentService } from '../../../../../services/publicEquipmentService';

const MachineryDiscoverySection = ({
  title = "Featured Rental Equipment",
  subtitle = "Verified Owners • Self-Operated",
  isSpotlight = false
}) => {
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const res = await publicEquipmentService.getAllEquipment({
          mode: 'rental'
        });
        if (res.success && Array.isArray(res.data)) {
          setEquipment(res.data.slice(0, 8));
        }
      } catch (err) {
        console.error("Machinery fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchEquipment();
  }, []);

  if (!loading && equipment.length === 0) {
    return (
      <section className={`px-5 ${isSpotlight ? 'mb-4 mt-2' : 'mb-8'}`}>
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
            <FiTruck size={22} />
          </div>
          <h3 className="text-sm font-black text-slate-800 mb-1">
            Looking to Rent Machines & Tools?
          </h3>
          <p className="text-xs text-slate-500 mb-3 max-w-xs mx-auto">
            Browse our full rental catalog for spray pumps, tillers, tractors, and harvesters.
          </p>
          <button
            onClick={() => navigate('/user/rentals')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all active:scale-95 cursor-pointer shadow-md shadow-emerald-600/20"
          >
            Explore All Rental Equipment →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={`px-5 ${isSpotlight ? 'mb-4 mt-1' : 'mb-8'}`}>
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] sm:text-lg font-black text-slate-800 tracking-tight truncate">
              {title}
            </h2>
            {isSpotlight && (
              <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200/80 shrink-0">
                Spotlight
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
            <FiCheckCircle className="text-emerald-500 shrink-0 text-xs" />
            <span className="truncate">{subtitle}</span>
          </p>
        </div>
        <button
          onClick={() => navigate('/user/rentals')}
          className="group flex items-center gap-1.5 px-3.5 py-1.5 bg-white/95 hover:bg-white text-emerald-700 hover:text-emerald-800 border border-emerald-200/80 hover:border-emerald-300 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs shrink-0 whitespace-nowrap"
        >
          <span>Explore All</span>
          <FiArrowRight className="text-xs transition-transform group-hover:translate-x-0.5 text-emerald-600" />
        </button>
      </div>

      <div className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-3 no-scrollbar snap-x snap-mandatory">
        {loading ? (
          [1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="min-w-[152px] max-w-[165px] sm:min-w-[210px] sm:max-w-[225px] h-[195px] sm:h-[225px] bg-white rounded-2xl animate-pulse border border-slate-100 shrink-0"
            />
          ))
        ) : (
          equipment.map((item) => (
            <motion.div
              key={item._id}
              whileHover={{ y: -3 }}
              onClick={() => navigate(`/user/machinery/${item._id}`)}
              className="min-w-[152px] max-w-[165px] sm:min-w-[210px] sm:max-w-[225px] bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col cursor-pointer relative group shrink-0 snap-start"
            >
              <div className="h-28 sm:h-32 bg-slate-50 relative overflow-hidden">
                {item.images?.[0] ? (
                  <img
                    src={item.images[0]}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                    <FiTruck size={28} />
                  </div>
                )}

                {/* Overlay Badge - Certified */}
                <div className="absolute top-2 left-2">
                  <div className="bg-white/95 backdrop-blur-md px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs border border-slate-100/80">
                    <FiShield className="text-emerald-600 w-2.5 h-2.5" />
                    <span className="text-[7px] sm:text-[7.5px] font-black uppercase text-slate-700 tracking-wider">Certified</span>
                  </div>
                </div>

                {/* Compact Price Pill */}
                <div className="absolute bottom-2 left-2">
                  <div className="bg-white/95 backdrop-blur-md rounded-lg py-0.5 px-1.5 shadow-2xs border border-slate-100/90 flex items-center gap-1">
                    <span className="text-[7.5px] sm:text-[8px] font-bold text-slate-400 uppercase leading-none">Rent</span>
                    <span className="text-[11px] sm:text-xs font-black text-emerald-700 leading-none">
                      ₹{item.pricing?.hourly?.price || item.pricing?.land_based?.price}/hr
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Bottom Body */}
              <div className="p-2.5 sm:p-3 bg-white flex flex-col justify-between flex-1">
                <div>
                  <div className="flex justify-between items-start gap-1 mb-1">
                    <h3 className="text-xs sm:text-[13px] font-black text-slate-900 leading-snug line-clamp-1" title={item.name}>
                      {item.name}
                    </h3>
                    <div className="flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black text-amber-500 shrink-0">
                      <span>★</span>
                      <span>{item.vendorId?.rating || 'New'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[8.5px] sm:text-[9px] font-semibold text-slate-400 uppercase tracking-tight">
                    <span className="flex items-center gap-0.5 text-slate-500 shrink-0">
                      <FiClock className="text-emerald-600 w-2.5 h-2.5" /> Instant
                    </span>
                    <span className="w-1 h-1 bg-slate-200 rounded-full shrink-0" />
                    <span className="truncate">{item.categoryId?.title}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}

        {/* View More Card */}
        {!loading && equipment.length > 0 && (
          <motion.div
            onClick={() => navigate('/user/rentals')}
            className="min-w-[95px] sm:min-w-[110px] bg-slate-900 hover:bg-emerald-800 rounded-2xl flex flex-col items-center justify-center text-white cursor-pointer shadow-xs hover:shadow-md active:scale-95 transition-all p-3 shrink-0 snap-start"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-white/15 rounded-full flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
              <FiArrowRight size={16} />
            </div>
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-center">सभी देखें</p>
            <p className="text-[7.5px] sm:text-[8px] font-bold text-slate-400 uppercase tracking-wider text-center mt-0.5">View All</p>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default MachineryDiscoverySection;
