import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAppLocale } from '../../../../utils/languageUtils';
import { FiCloud, FiCloudRain, FiCloudSnow, FiSun, FiWind, FiDroplet, FiChevronLeft, FiAlertTriangle, FiThermometer, FiSun as FiUv, FiEye, FiZap, FiSunrise, FiSunset } from 'react-icons/fi';
import { motion } from 'framer-motion';
import weatherService from '../../services/weatherService';

export default function WeatherReport() {
    const navigate = useNavigate();
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchWeather = () => {
            setLoading(true);
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        try {
                            const { latitude, longitude } = position.coords;
                            const res = await weatherService.getWeather(latitude, longitude);
                            if (res.success) {
                                setWeather(res.data);
                            } else {
                                setError(res.message);
                            }
                        } catch (err) {
                            setError("Failed to fetch weather data");
                        } finally {
                            setLoading(false);
                        }
                    },
                    (err) => {
                        setError("Location access denied. Please allow location to see weather for your fields.");
                        setLoading(false);
                    }
                );
            } else {
                setError("Geolocation is not supported by your browser");
                setLoading(false);
            }
        };

        fetchWeather();
    }, []);

    const getWeatherIcon = (description, size = "w-10 h-10") => {
        const d = description.toLowerCase();
        if (d.includes('rain')) return <FiCloudRain className={`${size} text-blue-500`} />;
        if (d.includes('cloud')) return <FiCloud className={`${size} text-slate-400`} />;
        if (d.includes('snow')) return <FiCloudSnow className={`${size} text-blue-200`} />;
        if (d.includes('sun') || d.includes('clear')) return <FiSun className={`${size} text-amber-500`} />;
        return <FiCloud className={`${size} text-slate-400`} />;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#F1F8E9] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-[#2E7D32] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Analyzing...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-white p-6 text-center flex flex-col items-center justify-center">
                <FiAlertTriangle className="w-16 h-16 text-amber-500 mb-6" />
                <p className="text-slate-600 text-sm mb-8 leading-relaxed">{error}</p>
                <button onClick={() => window.location.reload()} className="w-full py-4 bg-[#2E7D32] text-white rounded-2xl font-black shadow-lg">Retry</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F1F8E9] pb-4">
            {/* Optimized Header */}
            <div className="sticky top-0 z-50 bg-[#F1F8E9]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-white shadow-sm text-slate-800">
                        <FiChevronLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-base font-black text-slate-800 uppercase tracking-tight">Weather</h1>
                </div>
                <div className="text-right">
                    <p className="text-sm font-black text-slate-900 leading-none">{weather.current.city}</p>
                    <span className="text-[9px] font-bold text-emerald-600 uppercase">Live Field Scan</span>
                </div>
            </div>

            <main className="px-4 pt-3">
                {/* Compact Hero Section */}
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-emerald-50 flex items-center justify-between mb-4">
                    <div>
                        <div className="flex items-baseline gap-1">
                            <h1 className="text-5xl font-black text-slate-900">{Math.round(weather.current.temp)}°</h1>
                            <span className="text-sm font-bold text-slate-400 capitalize">{weather.current.description}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Feels like {Math.round(weather.current.feels_like)}°</p>
                    </div>
                    <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center p-3">
                        {getWeatherIcon(weather.current.description, "w-full h-full")}
                    </div>
                </div>

                {/* Agri Advisory - Optimized Padding */}
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#2E7D32] rounded-3xl p-4 text-white mb-4 shadow-md shadow-emerald-100/50 relative overflow-hidden"
                >
                    <div className="flex items-center gap-2 mb-1.5 relative z-10">
                        <FiZap className="w-4 h-4 text-emerald-200" />
                        <h3 className="font-black text-sm tracking-tight">Agri Advisory</h3>
                    </div>
                    <p className="text-[11px] text-emerald-50 font-medium leading-normal relative z-10">
                        {weather.agriAlert}
                    </p>
                </motion.div>

                {/* Compact 3-Column Stats Grid */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    {[
                        { label: 'Humid', value: `${weather.current.humidity ?? '--'}%`, icon: <FiDroplet className="text-blue-500" /> },
                        { label: 'UV', value: weather.current.uv_index ?? '--', icon: <FiUv className="text-orange-500" /> },
                        { label: 'Rain', value: `${weather.current.precipitation_prob ?? '--'}%`, icon: <FiCloudRain className="text-indigo-500" /> },
                        { label: 'Visib', value: `${weather.current.visibility ?? '--'} km`, icon: <FiEye className="text-amber-600" /> },
                        { label: 'Wind', value: `${Math.round(weather.current.wind_speed) ?? '--'}`, icon: <FiWind className="text-teal-600" /> },
                        { label: 'Cloud', value: `${weather.current.cloud_cover ?? '--'}%`, icon: <FiCloud className="text-slate-400" /> }
                    ].map((item, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-50 text-center">
                            <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center mx-auto mb-1.5">
                                {React.cloneElement(item.icon, { className: "w-4 h-4" })}
                            </div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">{item.label}</p>
                            <p className="text-xs font-black text-slate-800">{item.value}</p>
                        </div>
                    ))}
                </div>

                {/* Compact Horizontal Forecast */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">10-Day Forecast</h3>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4">
                        {weather.forecast.map((day, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                                className="min-w-[105px] bg-white rounded-2xl p-3 shadow-sm border border-slate-50 flex flex-col items-center text-center"
                            >
                                <p className="text-[10px] font-black text-slate-500 uppercase mb-1">
                                    {i === 0 ? 'Tomorrow' : new Date(day.date).toLocaleDateString(getAppLocale(), { weekday: 'short' })}
                                </p>
                                <div className="w-9 h-9 mb-1">
                                    {getWeatherIcon(day.description, "w-full h-full")}
                                </div>
                                <p className="text-base font-black text-slate-800 leading-none mb-1">{Math.round(day.temp)}°</p>
                                <p className="text-[9px] font-black text-blue-500 uppercase tracking-tighter flex items-center gap-0.5">
                                    <FiCloudRain className="w-2.5 h-2.5" />
                                    {day.precipitation_prob}%
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Compact Sun Row */}
                <div className="grid grid-cols-2 gap-3 mb-0 pb-2">
                    <div className="bg-white rounded-2xl p-3 flex items-center gap-3 border border-slate-50 shadow-sm">
                        <FiSunrise className="w-5 h-5 text-amber-500" />
                        <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase leading-none mb-1">Sunrise</p>
                            <p className="text-[11px] font-black text-slate-800">
                                {weather.current.sunrise ? new Date(weather.current.sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-3 flex items-center gap-3 border border-slate-50 shadow-sm">
                        <FiSunset className="w-5 h-5 text-rose-500" />
                        <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase leading-none mb-1">Sunset</p>
                            <p className="text-[11px] font-black text-slate-800">
                                {weather.current.sunset ? new Date(weather.current.sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            <style dangerouslySetInnerHTML={{ __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
}
