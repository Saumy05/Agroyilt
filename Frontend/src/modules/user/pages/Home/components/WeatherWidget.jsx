import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCloud, FiCloudRain, FiSun, FiWind, FiMapPin, FiArrowRight } from 'react-icons/fi';
import { motion } from 'framer-motion';
import weatherService from '../../../services/weatherService';

export default function WeatherWidget() {
    const navigate = useNavigate();
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    try {
                        const { latitude, longitude } = position.coords;
                        const res = await weatherService.getWeather(latitude, longitude);
                        if (res.success) {
                            setWeather(res.data);
                        }
                    } catch (err) {
                        console.error("Weather error:", err);
                    } finally {
                        setLoading(false);
                    }
                },
                () => setLoading(false)
            );
        } else {
            setLoading(false);
        }
    }, []);

    const getWeatherIcon = (description) => {
        const d = description?.toLowerCase() || '';
        if (d.includes('rain')) return <FiCloudRain className="w-8 h-8 text-white drop-shadow-md" />;
        if (d.includes('cloud')) return <FiCloud className="w-8 h-8 text-white drop-shadow-md" />;
        if (d.includes('sun') || d.includes('clear')) return <FiSun className="w-8 h-8 text-white drop-shadow-md" />;
        return <FiCloud className="w-8 h-8 text-white drop-shadow-md" />;
    };

    const displayTemp = weather ? `${Math.round(weather.current.temp)}°C` : (loading ? "..." : "--");
    const displayDesc = weather ? weather.current.description : (loading ? "Loading..." : "Forecast");
    const iconToRender = weather ? getWeatherIcon(weather.current.description) : <FiCloud className="w-8 h-8 text-white drop-shadow-md opacity-70" />;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => navigate('/user/weather')}
            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
        >
            <div className={`relative w-[54px] h-[54px] sm:w-[60px] sm:h-[60px] rounded-[18px] bg-white border border-slate-100 shadow-[0_4px_14px_rgba(0,0,0,0.04)] group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] flex items-center justify-center p-2 transition-all duration-300 relative overflow-hidden ${loading ? 'animate-pulse' : ''}`}>
                <div className="absolute inset-0 bg-indigo-50/70 opacity-40 group-hover:opacity-60 transition-opacity" />
                <img
                    src="/landing_images/crop_advasory3.jpg"
                    alt="Weather"
                    className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply group-hover:opacity-40 transition-opacity"
                />
                <div className="scale-75 origin-center flex items-center justify-center z-10 drop-shadow-md">
                    {iconToRender}
                </div>

                {/* Temperature Badge */}
                {(!loading && weather) && (
                    <div className="absolute top-1 right-1 bg-amber-500 text-white text-[7.5px] font-black px-1.5 py-0.5 rounded-full shadow-xs border border-white z-20">
                        {displayTemp}
                    </div>
                )}
            </div>

            <p className="text-[12px] font-bold text-slate-800 text-center leading-snug mt-1.5 line-clamp-1">
                Weather
            </p>
            <p className="text-[9.5px] font-semibold text-slate-400 text-center leading-tight truncate max-w-full capitalize">
                {displayDesc}
            </p>
        </motion.div>
    );
}
