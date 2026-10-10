import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSun, FiChevronRight } from 'react-icons/fi';
import { motion } from 'framer-motion';
import weatherService from '../../services/weatherService';

const SidebarWeatherPill = ({ onClose }) => {
  const navigate = useNavigate();
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const res = await weatherService.getWeather(latitude, longitude);
            if (isMounted && res.success && res.data) {
              setWeather(res.data);
            }
          } catch (err) {
            console.error('Weather error in sidebar:', err);
          } finally {
            if (isMounted) setLoading(false);
          }
        },
        () => {
          if (isMounted) setLoading(false);
        },
        { timeout: 8000 }
      );
    } else {
      setLoading(false);
    }
    return () => { isMounted = false; };
  }, []);

  const temp = weather?.current?.temp ? Math.round(weather.current.temp) : 29;
  const windSpeed = weather?.current?.wind_speed ? Math.round(weather.current.wind_speed * 3.6) : 7; // km/h
  const humidity = weather?.current?.humidity || 58;
  const isSprayFriendly = windSpeed < 15 && (!weather?.current?.description?.toLowerCase().includes('rain'));

  return (
    <div className="pb-2 pt-0.5">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => {
          if (onClose) onClose();
          navigate('/user/weather');
        }}
        className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white rounded-2xl p-2.5 shadow-[0_4px_14px_rgba(5,150,105,0.2)] cursor-pointer hover:shadow-md transition-all group relative overflow-hidden"
      >
        {/* Subtle background motif */}
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-white/5 rounded-l-full pointer-events-none" />

        <div className="flex items-center justify-between gap-2 relative z-10">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
              <FiSun className="w-4 h-4 text-amber-300 animate-spin-slow" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-black text-white">{temp}°C</span>
                <span className="text-[9.5px] bg-white/20 font-bold px-1.5 py-0.5 rounded-full text-white">
                  हवा: {windSpeed} km/h • नमी: {humidity}%
                </span>
              </div>
              <p className="text-[10px] font-semibold text-emerald-50 truncate mt-0.5">
                {isSprayFriendly 
                  ? '✓ स्प्रे अनुकूल: हवा सामान्य है' 
                  : '⚠️ ध्यान दें: हवा तेज है, छिड़काव टालें'}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold bg-white/20 group-hover:bg-white/30 text-white px-2 py-1.5 rounded-xl transition-colors">
            <span>पूर्वानुमान</span>
            <FiChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SidebarWeatherPill;
