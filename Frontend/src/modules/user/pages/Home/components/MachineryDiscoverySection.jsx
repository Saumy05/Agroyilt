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
  subtitle = "Verified Owners • Self-Operate Machines",
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
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2.5">
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
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl transition-all active:scale-95 cursor-pointer shadow-md shadow-blue-600/20"
          >
            Explore All Rental Equipment →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={`px-5 ${isSpotlight ? 'mb-4 mt-1' : 'mb-8'}`}>
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h2 className="text-[17px] sm:text-lg font-black text-slate-800 tracking-tight flex items-center gap-1.5">
            {title}
            {isSpotlight && (
              <span className="text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                Spotlight
              </span>
            )}
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
            <FiCheckCircle className="text-emerald-500" /> {subtitle}
          </p>
        </div>
        <button
          onClick={() => navigate('/user/rentals')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full text-xs font-black transition-all active:scale-95 cursor-pointer shadow-2xs"
        >
          Explore All <FiArrowRight />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="min-w-[215px] sm:min-w-[235px] h-[185px] bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : (
          equipment.map((item) => (
            <motion.div
              key={item._id}
              whileHover={{ y: -3 }}
              onClick={() => navigate(`/user/machinery/${item._id}`)}
              className="min-w-[215px] max-w-[225px] sm:min-w-[235px] sm:max-w-[245px] bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col cursor-pointer relative group shrink-0"
            >
              <div className="h-32 bg-slate-50 relative overflow-hidden">
                {item.images?.[0] ? (
                  <img
                    src={item.images[0]}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                    <FiTruck size={32} />
                  </div>
                )}

                {/* Overlay Badge - Certified */}
                <div className="absolute top-2 left-2">
                  <div className="bg-white/95 backdrop-blur-md px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs border border-slate-100/80">
                    <FiShield className="text-blue-500 w-2.5 h-2.5" />
                    <span className="text-[7.5px] font-black uppercase text-slate-700 tracking-wider">Certified</span>
                  </div>
                </div>

                {/* Compact Price Pill */}
                <div className="absolute bottom-2 left-2">
                  <div className="bg-white/95 backdrop-blur-md rounded-lg py-1 px-2 shadow-xs border border-slate-100/90 flex items-center gap-1">
                    <span className="text-[8px] font-bold text-slate-400 uppercase leading-none">Rent</span>
                    <span className="text-xs font-black text-emerald-700 leading-none">
                      ₹{item.pricing?.hourly?.price || item.pricing?.land_based?.price}/hr
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Bottom Body */}
              <div className="p-3 bg-white flex flex-col justify-between flex-1">
                <div>
                  <div className="flex justify-between items-start gap-1 mb-1">
                    <h3 className="text-[13px] font-black text-slate-900 leading-snug line-clamp-1" title={item.name}>
                      {item.name}
                    </h3>
                    <div className="flex items-center gap-0.5 text-[10px] font-black text-amber-500 shrink-0">
                      <span>★</span>
                      <span>{item.vendorId?.rating || 'New'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-semibold text-slate-400 uppercase tracking-tight">
                    <span className="flex items-center gap-0.5 text-slate-500"><FiClock className="text-blue-500" /> Instant</span>
                    <span className="w-1 h-1 bg-slate-200 rounded-full" />
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
            className="min-w-[105px] bg-slate-900 hover:bg-emerald-800 rounded-2xl flex flex-col items-center justify-center text-white cursor-pointer shadow-xs hover:shadow-md active:scale-95 transition-all p-3 shrink-0"
          >
            <div className="w-9 h-9 bg-white/15 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <FiArrowRight size={18} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-wider text-center">सभी देखें</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider text-center mt-0.5">View All</p>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default MachineryDiscoverySection;
