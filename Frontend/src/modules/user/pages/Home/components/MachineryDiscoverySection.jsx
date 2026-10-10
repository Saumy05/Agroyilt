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

      <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
        {loading ? (
          [1, 2].map(i => (
            <div key={i} className="min-w-[280px] h-[180px] bg-white rounded-3xl animate-pulse border border-slate-100" />
          ))
        ) : (
          equipment.map((item) => (
            <motion.div
              key={item._id}
              whileHover={{ y: -5 }}
              onClick={() => navigate(`/user/machinery/${item._id}`)}
              className="min-w-[290px] bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm flex flex-col cursor-pointer relative group"
            >
              <div className="h-40 bg-slate-50 relative">
                {item.images?.[0] ? (
                  <img
                    src={item.images[0]}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                    <FiTruck size={40} />
                  </div>
                )}

                {/* Overlay Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                  <div className="bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                    <FiShield className="text-blue-500 w-2.5 h-2.5" />
                    <span className="text-[8px] font-black uppercase text-slate-600 tracking-tighter">Certified</span>
                  </div>
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                  <div className="bg-white/90 backdrop-blur-md rounded-2xl p-2 px-3 shadow-md border border-white/20">
                    <p className="text-[8px] font-black text-slate-400 uppercase leading-none mb-1">Rent at</p>
                    <p className="text-sm font-black text-emerald-600 leading-none">
                      ₹{item.pricing?.hourly?.price || item.pricing?.land_based?.price}/hr
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-sm font-black text-slate-800 truncate pr-2">
                    {item.name}
                  </h3>
                  <div className="flex items-center gap-1 text-[10px] font-black text-amber-500">
                    <span>★</span>
                    <span>{item.vendorId?.rating || 'New'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                  <span className="flex items-center gap-1"><FiClock className="text-blue-400" /> Instant Confirm</span>
                  <span className="w-1 h-1 bg-slate-200 rounded-full" />
                  <span>{item.categoryId?.title}</span>
                </div>
              </div>
            </motion.div>
          ))
        )}

        {/* View More Card */}
        {!loading && equipment.length > 0 && (
          <motion.div
            onClick={() => navigate('/user/rentals')}
            className="min-w-[140px] bg-blue-600 rounded-[32px] flex flex-col items-center justify-center text-white cursor-pointer shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
          >
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
              <FiArrowRight size={24} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest">View All</p>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default MachineryDiscoverySection;
