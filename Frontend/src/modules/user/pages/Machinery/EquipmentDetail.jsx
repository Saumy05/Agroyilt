import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FiTruck, FiMapPin, FiStar, FiShield, 
  FiClock, FiCalendar, FiUser,
  FiArrowLeft, FiArrowRight, FiCheck, FiInfo, FiTag, 
  FiPlus, FiMinus, FiLayers, FiZap,
  FiCheckCircle, FiShare2
} from 'react-icons/fi';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import LogoLoader from '../../../../components/common/LogoLoader';
import BreadcrumbsSchema from '../../../../components/common/BreadcrumbsSchema';
import ServiceSchema from '../../../../components/common/ServiceSchema';
import { toastManager } from '../../../../utils/toastManager';

// Clean bilingual title into primary name and optional secondary
const parseBilingualTitle = (rawTitle) => {
  if (!rawTitle) return { primary: 'Machinery', secondary: '' };
  const str = String(rawTitle).trim();
  const match = str.match(/^([^(]+)(?:\((.*)\))?/);
  if (!match) return { primary: str, secondary: '' };
  return {
    primary: match[1].trim(),
    secondary: match[2]?.trim() || ''
  };
};

const calculateEndTime = (startStr, durationHours) => {
  if (!startStr) return '11:00';
  try {
    const [h, m] = startStr.split(':').map(Number);
    const duration = parseFloat(durationHours) || 1;
    const totalMinutes = h * 60 + m + Math.round(duration * 60);
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  } catch {
    return '11:00';
  }
};

const TIME_PRESETS = [
  { label: '08:00 AM', time: '08:00' },
  { label: '10:00 AM', time: '10:00' },
  { label: '01:00 PM', time: '13:00' },
  { label: '03:00 PM', time: '15:00' },
  { label: '05:00 PM', time: '17:00' }
];

const EquipmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState(null);

  // Restore state from sessionStorage (so navigating back from checkout retains form)
  const savedKey = `machinery_booking_${id}`;
  const saved = (() => { 
    try { 
      return JSON.parse(sessionStorage.getItem(savedKey) || 'null'); 
    } catch { 
      return null; 
    } 
  })();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const [selectedRateType, setSelectedRateType] = useState(saved?.selectedRateType || 'hourly');
  const [quantity, setQuantity] = useState(saved?.quantity !== undefined ? saved.quantity : 1);
  const [selectedDate, setSelectedDate] = useState(saved?.selectedDate || todayStr);
  const [startTime, setStartTime] = useState(saved?.startTime || '09:00');
  const [endTime, setEndTime] = useState(saved?.endTime || '10:00');
  const [selectedImplements, setSelectedImplements] = useState(saved?.selectedImplements || []);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const scrollRef = useRef(null);

  // Persist state to sessionStorage whenever relevant fields change
  useEffect(() => {
    const data = { selectedRateType, quantity, selectedDate, startTime, endTime, selectedImplements };
    sessionStorage.setItem(savedKey, JSON.stringify(data));
  }, [selectedRateType, quantity, selectedDate, startTime, endTime, selectedImplements, savedKey]);

  // Sync endTime whenever startTime, quantity, or rateType changes
  useEffect(() => {
    if (selectedRateType === 'hourly') {
      const hours = parseFloat(quantity) || 1;
      setEndTime(calculateEndTime(startTime, hours));
    }
  }, [startTime, quantity, selectedRateType]);

  // Normalize quantity bounds when rate type changes
  useEffect(() => {
    setQuantity(prev => {
      const q = parseFloat(prev) || 1;
      if (selectedRateType === 'land_based' && q < 0.5) {
        return 0.5;
      } else if (selectedRateType === 'daily' && q < 1) {
        return 1;
      } else if (selectedRateType !== 'land_based' && selectedRateType !== 'hourly' && !Number.isInteger(q)) {
        return Math.max(1, Math.floor(q));
      }
      return prev;
    });
  }, [selectedRateType]);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await publicEquipmentService.getEquipmentById(id);
      if (res.success && res.data) {
        setEquipment(res.data);
        if (res.data.implements && Array.isArray(res.data.implements) && selectedImplements.length === 0) {
          setSelectedImplements(res.data.implements);
        }
        // Default rate type based on availability
        if (!res.data.pricing?.hourly?.isEnabled) {
          if (res.data.pricing?.daily?.isEnabled) {
            setSelectedRateType('daily');
          } else if (res.data.pricing?.land_based?.isEnabled) {
            setSelectedRateType('land_based');
          }
        }
      }
    } catch {
      toastManager.error('Failed to load machinery details');
    } finally {
      setLoading(false);
    }
  }, [id, selectedImplements.length]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const toggleImplement = (impl) => {
    setSelectedImplements(prev => {
      const exists = prev.find(i => (i.subCategoryId?._id || i.subCategoryId) === (impl.subCategoryId?._id || impl.subCategoryId));
      if (exists) {
        if (prev.length === 1) {
          toastManager.info('You must select at least one implement for this machine.', { 
            id: 'implement-limit-toast'
          });
          return prev;
        }
        return prev.filter(i => (i.subCategoryId?._id || i.subCategoryId) !== (impl.subCategoryId?._id || impl.subCategoryId));
      }
      return [...prev, impl];
    });
  };

  const getImplementAddon = () => {
    return selectedImplements.reduce((sum, impl) => {
      const p = impl.pricing?.[selectedRateType];
      if (p?.isEnabled && p?.price > 0) {
        return sum + (p.price * quantity);
      }
      return sum;
    }, 0);
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><LogoLoader /></div>;
  if (!equipment) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
        <FiTruck size={28} />
      </div>
      <h3 className="text-sm font-black text-slate-800">Machinery Not Found</h3>
      <p className="text-xs text-slate-400 mt-1">This machinery might have been unlisted or moved.</p>
      <button 
        onClick={() => navigate('/user/rentals')} 
        className="mt-4 px-5 py-2.5 bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm"
      >
        Browse Rental Catalog
      </button>
    </div>
  );

  const currentRate = selectedRateType === 'hourly' 
    ? (equipment.pricing?.hourly?.price || 0)
    : selectedRateType === 'daily'
    ? (equipment.pricing?.daily?.price || 0)
    : (equipment.pricing?.land_based?.price || 0);

  const implementAddon = getImplementAddon();
  const baseTotal = currentRate * quantity;
  const total = baseTotal + implementAddon;

  const availableImplements = Array.isArray(equipment.implements) ? equipment.implements : [];
  const titleObj = parseBilingualTitle(equipment.name);
  const images = equipment.images && equipment.images.length > 0 ? equipment.images : [];

  const handleBookNow = () => {
    if (!selectedDate || !startTime || !endTime) {
      toastManager.error('Please select booking date, start time, and end time');
      return;
    }

    if (availableImplements.length > 0 && selectedImplements.length === 0) {
      toastManager.error('Please select at least one implement for this machine.');
      return;
    }

    const localNow = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000);
    const today = localNow.toISOString().split('T')[0];
    
    if (selectedDate === today) {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      
      if (startHours < currentHours || (startHours === currentHours && startMinutes <= currentMinutes)) {
        toastManager.error('Start time has already passed. Please select a future time.');
        return;
      }
    }

    if (endTime === startTime) {
      toastManager.error('End time cannot be the same as start time.');
      return;
    }

    const format12Hour = (time24) => {
      const [h, m] = time24.split(':');
      const hours = parseInt(h, 10);
      const suffix = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours.toString().padStart(2, '0')}:${m} ${suffix}`;
    };

    const formattedSlot = `${format12Hour(startTime)} - ${format12Hour(endTime)}`;

    navigate('/user/machinery/checkout', { 
      state: { 
        equipment, 
        bookingData: {
          rateType: selectedRateType,
          quantity,
          date: selectedDate,
          slot: formattedSlot,
          startTime,
          endTime,
          total,
          basePrice: baseTotal,
          implementTotal: implementAddon,
          selectedImplements
        }
      } 
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: equipment.name,
        text: `Rent ${equipment.name} on Agroyilt starting at ₹${currentRate}/${selectedRateType === 'hourly' ? 'hr' : selectedRateType === 'daily' ? 'day' : 'acre'}`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toastManager.success('Link copied to clipboard');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-slate-50 to-slate-50 pb-28 font-sans">
      <Helmet>
        <title>{`${equipment.name} | Agroyilt Machinery Rental`}</title>
        <meta name="description" content={`Book ${equipment.name} for farm work. Verified machine and driver, rates starting at ₹${currentRate}.`} />
        <link rel="canonical" href={`https://agroyilt.com/user/machinery/${id}`} />
      </Helmet>

      {/* Structured Data */}
      <BreadcrumbsSchema items={[
        { name: 'Home', item: '/' },
        { name: 'Rentals', item: '/user/rentals' },
        { name: equipment.categoryId?.title || 'Machinery', item: '/user/rentals' },
        { name: equipment.name, item: `/user/machinery/${id}` }
      ]} />
      <ServiceSchema data={equipment} />

      {/* Sticky App-Consistent Top Bar */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-emerald-900/10 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-xl mx-auto px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button 
              onClick={() => navigate(-1)}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-center text-slate-700 active:scale-95 transition-all flex-shrink-0 border border-slate-200/60 cursor-pointer"
              aria-label="Back"
            >
              <FiArrowLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-black text-slate-900 tracking-tight leading-tight truncate">
                {titleObj.primary}
              </h1>
              <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                <FiMapPin className="text-emerald-600 shrink-0" size={10} />
                <span className="truncate">{equipment.vendorId?.address?.city || equipment.vendorId?.address?.addressLine1 || 'Available Nearby'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleShare}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-center text-slate-600 transition-all border border-slate-200/60 cursor-pointer"
              title="Share machinery"
              aria-label="Share"
            >
              <FiShare2 size={14} />
            </button>
            <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <FiShield size={10} className="text-emerald-700" />
              Verified
            </span>
          </div>
        </div>
      </div>

      {/* Main Body Container */}
      <div className="max-w-xl mx-auto px-3.5 py-3 space-y-3">
        
        {/* Machine Gallery Card */}
        <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs">
          <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
            {images.length > 0 ? (
              <div 
                ref={scrollRef}
                className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth"
                onScroll={(e) => {
                  const scrollLeft = e.target.scrollLeft;
                  const width = e.target.clientWidth;
                  setCurrentImageIndex(Math.round(scrollLeft / width));
                }}
              >
                {images.map((img, i) => (
                  <img 
                    key={i} 
                    src={img} 
                    className="w-full h-full flex-shrink-0 object-cover snap-center" 
                    alt={`${equipment.name} - View ${i+1}`} 
                  />
                ))}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                <FiTruck size={48} />
                <span className="text-[11px] font-bold mt-2">Verified Asset Photo</span>
              </div>
            )}

            {/* Top Overlay Badges */}
            <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
              <span className="px-2.5 py-1 bg-emerald-800/90 backdrop-blur-md text-white rounded-full text-[9.5px] font-black uppercase tracking-wider shadow-sm">
                {equipment.categoryId?.title || 'Machinery'}
              </span>
              <span className="px-2.5 py-1 bg-slate-900/80 backdrop-blur-md text-white rounded-full text-[9.5px] font-bold shadow-sm">
                {equipment.modelNumber ? equipment.modelNumber : 'Verified Fleet'}
              </span>
            </div>

            {/* Bottom Overlay Image Counter */}
            {images.length > 1 && (
              <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-slate-950/70 backdrop-blur-md text-white rounded-full text-[9px] font-black tracking-wider">
                {currentImageIndex + 1} / {images.length}
              </div>
            )}
          </div>

          {/* Thumbnail Strip */}
          {images.length > 1 && (
            <div className="p-2 border-t border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setCurrentImageIndex(i);
                    if (scrollRef.current) {
                      scrollRef.current.scrollTo({
                        left: i * scrollRef.current.clientWidth,
                        behavior: 'smooth'
                      });
                    }
                  }}
                  className={`w-12 h-10 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                    currentImageIndex === i ? 'border-emerald-600 ring-2 ring-emerald-500/20' : 'border-transparent opacity-60'
                  }`}
                >
                  <img src={img} alt={`Thumb ${i+1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Overview & Metadata Card */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                {equipment.categoryId?.title || 'Rental Service'}
              </span>
              {equipment.year && (
                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black bg-slate-100 text-slate-700">
                  {equipment.year} Model
                </span>
              )}
              {equipment.horsepower && (
                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black bg-slate-100 text-slate-700">
                  {equipment.horsepower} HP
                </span>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug">
              {titleObj.primary}
            </h2>
            {titleObj.secondary && (
              <p className="text-xs font-semibold text-emerald-800 mt-0.5">
                ({titleObj.secondary})
              </p>
            )}
          </div>

          {/* Quick Info Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100">
            <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <FiMapPin size={13} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Location</p>
                <p className="text-xs font-black text-slate-800 truncate">
                  {equipment.vendorId?.address?.city || 'Nearby Fleet'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <FiStar size={13} className="fill-amber-400 text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Rating</p>
                <p className="text-xs font-black text-slate-800">
                  {equipment.rating || 4.8} <span className="text-[10px] font-semibold text-slate-400">({equipment.totalReviews || 11})</span>
                </p>
              </div>
            </div>

            <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-100 flex items-center gap-2 col-span-2 sm:col-span-1">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <FiUser size={13} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Operator</p>
                <p className="text-xs font-black text-slate-800">
                  {equipment.includesDriver ? 'Included' : 'Self-Operated'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Service Rate Type */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-black text-xs">
              <FiTag size={13} />
            </span>
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Select Service Rate Type</h3>
              <p className="text-[10px] font-semibold text-slate-400">Choose hourly live billing or flat package rate</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {equipment.pricing?.hourly?.isEnabled && (
              <button 
                type="button"
                onClick={() => setSelectedRateType('hourly')}
                className={`p-3.5 rounded-xl border-2 transition-all flex items-center justify-between text-left cursor-pointer ${
                  selectedRateType === 'hourly' 
                    ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/10 shadow-xs' 
                    : 'border-slate-200/80 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    selectedRateType === 'hourly' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <FiClock size={16} />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-wider ${
                      selectedRateType === 'hourly' ? 'text-emerald-800' : 'text-slate-500'
                    }`}>
                      Hourly Service
                    </p>
                    <p className="text-sm font-black text-slate-900">
                      ₹{equipment.pricing.hourly.price} <span className="text-[10px] font-bold text-slate-400">/hr</span>
                    </p>
                    <span className="text-[9.5px] font-bold text-emerald-700 block">
                      ≈ ₹{(equipment.pricing.hourly.price / 60).toFixed(2)}/min live timer
                    </span>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                  selectedRateType === 'hourly' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
                }`}>
                  {selectedRateType === 'hourly' && <FiCheck size={11} />}
                </div>
              </button>
            )}

            {equipment.pricing?.daily?.isEnabled && (
              <button 
                type="button"
                onClick={() => setSelectedRateType('daily')}
                className={`p-3.5 rounded-xl border-2 transition-all flex items-center justify-between text-left cursor-pointer ${
                  selectedRateType === 'daily' 
                    ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/10 shadow-xs' 
                    : 'border-slate-200/80 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    selectedRateType === 'daily' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <FiCalendar size={16} />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-wider ${
                      selectedRateType === 'daily' ? 'text-emerald-800' : 'text-slate-500'
                    }`}>
                      Full Day Package
                    </p>
                    <p className="text-sm font-black text-slate-900">
                      ₹{equipment.pricing.daily.price} <span className="text-[10px] font-bold text-slate-400">/day</span>
                    </p>
                    <span className="text-[9.5px] font-bold text-slate-500 block">
                      Full 8-hour workday slot
                    </span>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                  selectedRateType === 'daily' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
                }`}>
                  {selectedRateType === 'daily' && <FiCheck size={11} />}
                </div>
              </button>
            )}

            {equipment.pricing?.land_based?.isEnabled && (
              <button 
                type="button"
                onClick={() => setSelectedRateType('land_based')}
                className={`p-3.5 rounded-xl border-2 transition-all flex items-center justify-between text-left cursor-pointer ${
                  selectedRateType === 'land_based' 
                    ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/10 shadow-xs' 
                    : 'border-slate-200/80 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    selectedRateType === 'land_based' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <FiMapPin size={16} />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-wider ${
                      selectedRateType === 'land_based' ? 'text-emerald-800' : 'text-slate-500'
                    }`}>
                      Acre Rate
                    </p>
                    <p className="text-sm font-black text-slate-900">
                      ₹{equipment.pricing.land_based.price} <span className="text-[10px] font-bold text-slate-400">/acre</span>
                    </p>
                    <span className="text-[9.5px] font-bold text-slate-500 block">
                      Fixed rate per field acre
                    </span>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                  selectedRateType === 'land_based' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
                }`}>
                  {selectedRateType === 'land_based' && <FiCheck size={11} />}
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Section: Machine Implements (Sub-categories / Attachments) */}
        <AnimatePresence>
          {availableImplements.length > 0 && (
            <Motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3"
            >
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-black text-xs">
                  <FiLayers size={13} />
                </span>
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Machine Implements & Tools</h3>
                  <p className="text-[10px] font-semibold text-slate-400">Attachments included with this machine booking</p>
                </div>
              </div>

              <div className="space-y-2">
                {availableImplements.map((impl) => {
                  const implKey = impl.subCategoryId?._id || impl.subCategoryId;
                  const isSelected = selectedImplements.some(i => (i.subCategoryId?._id || i.subCategoryId) === implKey);
                  const addonRate = impl.pricing?.[selectedRateType];
                  const hasPrice = addonRate?.isEnabled && addonRate?.price > 0;

                  return (
                    <button
                      key={implKey}
                      type="button"
                      onClick={() => toggleImplement(impl)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left cursor-pointer ${
                        isSelected 
                          ? 'border-emerald-600 bg-emerald-50/70 shadow-xs' 
                          : 'border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all shrink-0 ${
                          isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400'
                        }`}>
                          {isSelected ? <FiCheck size={11} /> : <FiPlus size={11} />}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-black truncate ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                            {impl.subCategoryId?.title || impl.title || 'Attached Tool'}
                          </p>
                          {!hasPrice && (
                            <p className="text-[9.5px] text-emerald-700 font-bold">Standard Attachment (Included)</p>
                          )}
                        </div>
                      </div>

                      {hasPrice && (
                        <div className="text-right shrink-0 pl-2">
                          <span className="text-[9.5px] font-bold text-slate-400 block uppercase">Add-on</span>
                          <span className="text-xs font-black text-emerald-800">
                            +₹{addonRate.price}
                            <span className="text-[9px] font-medium text-slate-400 ml-0.5">
                              /{selectedRateType === 'hourly' ? 'hr' : selectedRateType === 'daily' ? 'day' : 'acre'}
                            </span>
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedImplements.length > 0 && (
                <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200/60 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-black text-emerald-900 uppercase tracking-wider">Selected:</span>
                    {selectedImplements.map(impl => (
                      <span key={impl.subCategoryId?._id || impl.subCategoryId} className="px-2 py-0.5 bg-white text-emerald-800 border border-emerald-200 rounded-md text-[10px] font-bold">
                        {impl.subCategoryId?.title || impl.title}
                      </span>
                    ))}
                  </div>
                  {implementAddon > 0 && (
                    <span className="text-xs font-black text-emerald-800">
                      Add-on: +₹{implementAddon.toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </Motion.div>
          )}
        </AnimatePresence>

        {/* Section: Duration / Land Size & Stepper */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-black text-xs">
                <FiInfo size={13} />
              </span>
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  {selectedRateType === 'hourly' 
                    ? 'Estimated Duration' 
                    : selectedRateType === 'daily'
                    ? 'Number of Days'
                    : 'Total Land Size'}
                </h3>
                <p className="text-[10px] font-semibold text-slate-400">
                  {selectedRateType === 'hourly' 
                    ? 'Exact active minutes billed via Play/Pause timer' 
                    : selectedRateType === 'daily'
                    ? 'Consecutive rental days'
                    : 'Area in acres to be covered'}
                </p>
              </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
              <button 
                type="button"
                onClick={() => {
                  const step = selectedRateType === 'land_based' ? 0.5 : 1;
                  const min = selectedRateType === 'land_based' ? 0.5 : 1;
                  setQuantity(Math.max(min, Math.round(((parseFloat(quantity) || 1) - step) * 10) / 10));
                }}
                className="w-8 h-8 bg-white hover:bg-emerald-50 hover:text-emerald-700 rounded-lg flex items-center justify-center font-bold text-slate-700 transition-all shadow-xs cursor-pointer active:scale-90"
                aria-label="Decrease quantity"
              >
                <FiMinus size={13} />
              </button>
              <span className="text-sm font-black text-slate-900 min-w-8 text-center px-1">
                {Number((parseFloat(quantity) || 1).toFixed(2))}
              </span>
              <button 
                type="button"
                onClick={() => {
                  const step = selectedRateType === 'land_based' ? 0.5 : 1;
                  setQuantity(Math.round(((parseFloat(quantity) || 1) + step) * 10) / 10);
                }}
                className="w-8 h-8 bg-white hover:bg-emerald-50 hover:text-emerald-700 rounded-lg flex items-center justify-center font-bold text-slate-700 transition-all shadow-xs cursor-pointer active:scale-90"
                aria-label="Increase quantity"
              >
                <FiPlus size={13} />
              </button>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {selectedRateType === 'hourly' && [1, 2, 4, 8].map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setQuantity(h)}
                className={`px-3 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                  quantity === h 
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {h} Hr{h > 1 ? 's' : ''}
              </button>
            ))}
            {selectedRateType === 'daily' && [1, 2, 3, 7].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setQuantity(d)}
                className={`px-3 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                  quantity === d 
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {d} Day{d > 1 ? 's' : ''}
              </button>
            ))}
            {selectedRateType === 'land_based' && [1, 2, 5, 10].map(a => (
              <button
                key={a}
                type="button"
                onClick={() => setQuantity(a)}
                className={`px-3 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                  quantity === a 
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {a} Acre{a > 1 ? 's' : ''}
              </button>
            ))}
          </div>

          {/* Included Operator Note */}
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                equipment.includesDriver ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
              }`}>
                <FiUser size={15} />
              </div>
              <div>
                <p className="text-xs font-black text-slate-900">
                  {equipment.includesDriver ? 'Operator Included' : 'Self-Operated Rental'}
                </p>
                <p className="text-[10px] font-medium text-slate-400">
                  {equipment.includesDriver 
                    ? 'Verified experienced driver will accompany this machinery.' 
                    : 'Machine rented directly to farmer. Fuel & operation handled by renter.'}
                </p>
              </div>
            </div>
            {equipment.driver?.additionalCharge > 0 && (
              <div className="text-right shrink-0">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Driver Charge</span>
                <span className="text-xs font-black text-slate-800">+₹{equipment.driver.additionalCharge}</span>
              </div>
            )}
          </div>
        </div>

        {/* Section: Date & Time Schedule */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-black text-xs">
              <FiCalendar size={13} />
            </span>
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Schedule Date & Slot</h3>
              <p className="text-[10px] font-semibold text-slate-400">Machinery will arrive at your field on this slot</p>
            </div>
          </div>

          {/* Quick Date Chips */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                selectedDate === todayStr 
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs' 
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(tomorrowStr)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                selectedDate === tomorrowStr 
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs' 
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              Tomorrow
            </button>
          </div>

          {/* Custom Date Input */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
              Booking Date
            </label>
            <input 
              type="date" 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
              value={selectedDate}
              min={todayStr}
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>

          {/* Time Selection */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
              Service Slot Time
            </label>
            
            {/* Quick Time Presets */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-2 pb-0.5">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.time}
                  type="button"
                  onClick={() => setStartTime(preset.time)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black border shrink-0 transition-all cursor-pointer ${
                    startTime === preset.time
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block mb-1">Start Time</span>
                <input 
                  type="time" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 block mb-1">Estimated End</span>
                <input 
                  type="time" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Validation warning */}
            {(() => {
              if (!selectedDate || !startTime || !endTime) return null;
              if (selectedDate === todayStr) {
                const now = new Date();
                const [sh, sm] = startTime.split(':').map(Number);
                if (sh < now.getHours() || (sh === now.getHours() && sm <= now.getMinutes())) {
                  return (
                    <p className="text-[11px] text-amber-700 font-bold mt-2 bg-amber-50 border border-amber-200 rounded-xl p-2">
                      ⚠️ Selected start time is in the past. Please choose a future slot.
                    </p>
                  );
                }
              }
              if (endTime === startTime) {
                return (
                  <p className="text-[11px] text-red-600 font-bold mt-2 bg-red-50 border border-red-200 rounded-xl p-2">
                    ⚠️ End time cannot be identical to start time.
                  </p>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Section: Specifications & Description */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-black text-xs">
              <FiZap size={13} />
            </span>
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Specifications & Inspection</h3>
              <p className="text-[10px] font-semibold text-slate-400">Technical details verified by Agroyilt engineers</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100">
              <p className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider">Model</p>
              <p className="text-xs font-black text-slate-800 truncate">{equipment.modelNumber || 'Standard Specification'}</p>
            </div>
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100">
              <p className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider">Mfg Year</p>
              <p className="text-xs font-black text-slate-800">{equipment.year || 'Certified Recent'}</p>
            </div>
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100">
              <p className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider">Power / Rating</p>
              <p className="text-xs font-black text-slate-800">{equipment.horsepower ? `${equipment.horsepower} HP` : 'Heavy Duty Agri'}</p>
            </div>
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100">
              <p className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider">Inspection</p>
              <p className="text-xs font-black text-emerald-700 flex items-center gap-1">
                <FiCheckCircle size={11} /> 100% Verified
              </p>
            </div>
          </div>

          {equipment.description && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Description & Usage
              </p>
              <p className="text-xs text-slate-600 font-medium leading-relaxed bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                {equipment.description}
              </p>
            </div>
          )}
        </div>

        {/* Section: Verified Fleet Vendor Info */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xs shrink-0">
                {equipment.vendorId?.name?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-xs font-black text-slate-900 truncate">
                    {equipment.vendorId?.name || 'Agroyilt Certified Partner'}
                  </h4>
                  <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black bg-emerald-100 text-emerald-800">
                    Verified Vendor
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium truncate">
                  {equipment.vendorId?.address?.city || 'Local Farm Fleet'} · Direct field dispatch
                </p>
              </div>
            </div>

            <div className="text-right shrink-0 pl-2">
              <span className="text-[9px] font-bold text-slate-400 block uppercase">Protection</span>
              <span className="text-[10px] font-black text-emerald-700 flex items-center gap-0.5 justify-end">
                <FiShield size={10} /> Escrow Safe
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Floating Bottom Booking Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            {implementAddon > 0 && (
              <p className="text-[10px] font-bold text-slate-400 truncate mb-0.5">
                Base: ₹{baseTotal.toLocaleString()} + Tools: ₹{implementAddon.toLocaleString()}
              </p>
            )}
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">
              Total Estimated
            </p>
            <div className="flex items-baseline gap-1">
              <h4 className="text-xl sm:text-2xl font-black text-slate-900 leading-none">
                ₹{total.toLocaleString()}
              </h4>
              <span className="text-[11px] font-bold text-slate-400">
                {selectedRateType === 'hourly' 
                  ? `/${quantity} hr${quantity > 1 ? 's' : ''}` 
                  : selectedRateType === 'daily' 
                  ? `/${quantity} day${quantity > 1 ? 's' : ''}` 
                  : `/${quantity} acre${quantity > 1 ? 's' : ''}`}
              </span>
            </div>
          </div>

          <Motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleBookNow}
            className="px-6 py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer shrink-0"
          >
            <span>Book Now</span>
            <FiArrowRight size={15} />
          </Motion.button>
        </div>
      </div>
    </div>
  );
};

export default EquipmentDetail;
