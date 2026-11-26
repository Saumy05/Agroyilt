import React, { useState, useEffect } from 'react';
import { FiCalendar, FiClock, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import availabilityService from '../../services/availabilityService';
import { getAppLocale } from '../../../../utils/languageUtils';

const SlotPicker = ({ serviceId, onSlotSelect }) => {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [slots, setSlots] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Generate next 7 days for quick selection
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const locale = getAppLocale();
        return {
            date: d.toISOString().split('T')[0],
            dayName: d.toLocaleDateString(locale, { weekday: 'short' }),
            dayNum: d.getDate(),
            month: d.toLocaleDateString(locale, { month: 'short' })
        };
    });

    useEffect(() => {
        const fetchSlots = async () => {
            if (!serviceId || !selectedDate) return;
            setLoading(true);
            setError(null);
            try {
                const res = await availabilityService.getAvailableSlots(serviceId, selectedDate);
                if (res.success) {
                    setSlots(res.data);
                    // Auto-select first available slot if nothing is selected or if previous selected is now unavailable
                    const stillAvailable = res.data.find(s => s.id === selectedSlot?.id && s.isAvailable);
                    if (!stillAvailable) setSelectedSlot(null);
                }
            } catch (err) {
                setError("Failed to load slots. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        fetchSlots();
    }, [serviceId, selectedDate]);

    const handleDateClick = (date) => {
        setSelectedDate(date);
        setSelectedSlot(null);
        onSlotSelect(null, date);
    };

    const handleSlotClick = (slot) => {
        if (!slot.isAvailable) return;
        setSelectedSlot(slot);
        onSlotSelect(slot, selectedDate);
    };

    return (
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
                <FiCalendar className="text-emerald-600" />
                <h3 className="font-black text-slate-800 tracking-tight">Select Date & Slot</h3>
            </div>

            {/* Date Selector */}
            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                {days.map((d) => (
                    <button
                        key={d.date}
                        onClick={() => handleDateClick(d.date)}
                        className={`flex-shrink-0 w-14 py-3 rounded-2xl flex flex-col items-center transition-all ${selectedDate === d.date
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100'
                            : 'bg-slate-50 text-slate-500 border border-transparent'
                            }`}
                    >
                        <span className="text-[10px] uppercase font-bold tracking-tighter">{d.dayName}</span>
                        <span className="text-lg font-black">{d.dayNum}</span>
                        <span className="text-[10px] font-bold">{d.month}</span>
                    </button>
                ))}
            </div>

            {/* Slot Selector */}
            <div className="mt-4 space-y-3">
                {loading ? (
                    <div className="py-8 text-center">
                        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Checking Availability...</p>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-50 rounded-2xl flex items-center gap-3 text-red-600">
                        <FiAlertCircle />
                        <p className="text-xs font-bold">{error}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2">
                        {slots.map((slot) => (
                            <button
                                key={slot.id}
                                disabled={!slot.isAvailable}
                                onClick={() => handleSlotClick(slot)}
                                className={`relative w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all ${!slot.isAvailable
                                    ? 'bg-slate-100 border-transparent opacity-50 cursor-not-allowed'
                                    : selectedSlot?.id === slot.id
                                        ? 'bg-emerald-50 border-emerald-500 ring-4 ring-emerald-50'
                                        : 'bg-white border-slate-50 hover:border-emerald-200'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-xl ${selectedSlot?.id === slot.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        <FiClock className="w-4 h-4" />
                                    </div>
                                    <div className="text-left">
                                        <p className={`font-black tracking-tight ${selectedSlot?.id === slot.id ? 'text-emerald-900' : 'text-slate-700'}`}>
                                            {slot.label}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                            {!slot.isAvailable ? 'Already Blocked' : 'Available for booking'}
                                        </p>
                                    </div>
                                </div>
                                {selectedSlot?.id === slot.id && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="bg-emerald-600 text-white p-1 rounded-full"
                                    >
                                        <FiCheck className="w-3 h-3" />
                                    </motion.div>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SlotPicker;
