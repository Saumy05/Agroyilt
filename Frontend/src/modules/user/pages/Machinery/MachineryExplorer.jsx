import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FiSearch, FiMapPin, FiTruck, FiClock, 
  FiChevronRight, FiArrowLeft, FiCalendar, 
  FiCheckCircle, FiZap, FiPlus, FiMinus, 
  FiInfo, FiShield, FiSliders, FiSun, 
  FiSunrise, FiSunset, FiMoon, FiCheck, FiTool,
  FiArrowRight, FiEdit2, FiLock
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import { useGeo } from '../../../../context/GeoContext';
import LogoLoader from '../../../../components/common/LogoLoader';
import { toastManager } from '../../../../utils/toastManager';
import { themeColors } from '../../../../theme';

const MachineryExplorer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    selectedState, 
    selectedDistrict, 
    selectedSubDistrict, 
    currentCity, 
    loading: geoLoading 
  } = useGeo();

  const isInitialMount = useRef(true);

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [equipmentImplements, setEquipmentImplements] = useState([]);
  const [equipment, setEquipment] = useState([]); // for Catalog view
  
  // View Mode: 'book' (Step 1 Requirements flow) vs 'catalog' (Browsing equipment)
  const [viewMode, setViewMode] = useState(location.state?.viewMode || 'book');
  const [search, setSearch] = useState('');

  // Step 1: Requirements State (Restored from navigation state if returning from Step 2)
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const dayAfterStr = new Date(Date.now() + 172800000).toISOString().split('T')[0];

  const START_SLOTS = [
    { label: 'Early Morning', time: '07:00', icon: FiSunrise, tag: 'Cool Hours' },
    { label: 'Morning', time: '09:00', icon: FiSun, tag: 'Popular' },
    { label: 'Afternoon', time: '13:00', icon: FiSun, tag: 'Dry Field' },
    { label: 'Late Afternoon', time: '16:00', icon: FiSunset, tag: 'Tillage' }
  ];

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

  const getAvailableSlotsForDate = (dateStr) => {
    if (!dateStr || dateStr !== todayStr) return START_SLOTS;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const LEAD_TIME_MINUTES = 45; // 45-minute dispatch lead time buffer

    return START_SLOTS.filter(slot => {
      const [startH, startM] = slot.time.split(':').map(Number);
      const slotStartMinutes = startH * 60 + startM;
      return slotStartMinutes >= currentMinutes + LEAD_TIME_MINUTES;
    });
  };

  const isTodayClosed = getAvailableSlotsForDate(todayStr).length === 0;

  const [selectedCat, setSelectedCat] = useState(location.state?.category || null);
  const [selectedImplement, setSelectedImplement] = useState(location.state?.preSelectedImplement || null);
  const [hpRange, setHpRange] = useState(location.state?.hpRange || 'all'); // 'all', '20-35', '35-50', '50-75', '75+'
  const [rentalType, setRentalType] = useState(location.state?.rentalType || 'hourly'); // 'hourly' | 'land_based' | 'daily'
  const [quantity, setQuantity] = useState(() => {
    const raw = location.state?.quantity;
    if (raw !== undefined && raw !== null) {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.round(parsed * 100) / 100;
      }
    }
    return 1;
  });
  const [bookingDate, setBookingDate] = useState(() => {
    if (location.state?.bookingDate) return location.state.bookingDate;
    return isTodayClosed ? tomorrowStr : todayStr;
  });

  const availableSlots = getAvailableSlotsForDate(bookingDate);

  const [startTime, setStartTime] = useState(() => {
    if (location.state?.startTime) return location.state.startTime;
    return availableSlots[0]?.time || '09:00';
  });

  const [endTime, setEndTime] = useState(() => {
    if (location.state?.endTime) return location.state.endTime;
    const initialQty = location.state?.quantity ? (Math.round((parseFloat(location.state.quantity) || 1) * 100) / 100) : 1;
    return calculateEndTime(location.state?.startTime || availableSlots[0]?.time || '09:00', initialQty);
  });

  const [activeSlotPreset, setActiveSlotPreset] = useState(() => {
    return availableSlots[0]?.label || 'Morning';
  });
  const [currentStep, setCurrentStep] = useState(location.state?.step || 1);

  // Automatically sync endTime whenever startTime, quantity, or rentalType changes
  useEffect(() => {
    const qtyNum = parseFloat(quantity) || 1;
    const hours = rentalType === 'hourly' ? qtyNum : (rentalType === 'daily' ? 8 * qtyNum : 4);
    setEndTime(calculateEndTime(startTime, hours));
  }, [startTime, quantity, rentalType]);

  // Automatically update start time when date changes if previous selection is in the past for today
  useEffect(() => {
    const validSlots = getAvailableSlotsForDate(bookingDate);
    if (validSlots.length > 0) {
      const isCurrentSlotValid = validSlots.some(s => s.time === startTime);
      if (!isCurrentSlotValid) {
        setStartTime(validSlots[0].time);
        setActiveSlotPreset(validSlots[0].label);
      }
    }
  }, [bookingDate]);

  // Handle category change -> reset implement unless returning with preSelectedImplement
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setSelectedImplement(null);
  }, [selectedCat]);

  // Fetch categories, implements, and catalog equipment
  useEffect(() => {
    if (geoLoading) return;
    fetchData();
  }, [selectedState, selectedDistrict, selectedSubDistrict, geoLoading, selectedCat]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const geoParams = {};
      if (selectedState?._id) geoParams.stateId = selectedState._id;
      if (selectedDistrict?._id) geoParams.districtId = selectedDistrict._id;
      if (selectedSubDistrict?._id) geoParams.subDistrictId = selectedSubDistrict._id;
      if (currentCity?._id) geoParams.cityId = currentCity._id;

      const catId = selectedCat?._id || selectedCat?.id;
      
      const promises = [
        publicEquipmentService.getMachineryCategories(geoParams),
        publicEquipmentService.getAllEquipment({ 
          ...geoParams,
          categoryId: catId
        })
      ];

      if (catId) {
        promises.push(publicEquipmentService.getImplementsForCategory(catId, geoParams));
      }

      const [catsRes, equipsRes, impsRes] = await Promise.all(promises);

      if (catsRes?.success && Array.isArray(catsRes.data)) {
        setCategories(catsRes.data);
        if (!selectedCat && catsRes.data.length > 0) {
          // Default to first category (e.g. Tractor)
          setSelectedCat(catsRes.data[0]);
        }
      }
      
      if (equipsRes?.success && Array.isArray(equipsRes.data)) {
        setEquipment(equipsRes.data);
      }

      if (impsRes && impsRes.success && Array.isArray(impsRes.data)) {
        setEquipmentImplements(impsRes.data);
      } else {
        setEquipmentImplements([]);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSlotPreset = (start, end) => {
    setStartTime(start);
    setEndTime(end);
    setActiveSlotPreset(`${start} - ${end}`);
  };

  const hasImplements = equipmentImplements && equipmentImplements.length > 0;

  useEffect(() => {
    if (!loading && !hasImplements && currentStep === 2) {
      setCurrentStep(3);
    }
  }, [hasImplements, currentStep, loading]);

  const handleStep1Next = () => {
    if (!selectedCat) {
      toastManager.error('Please select a machinery category');
      return;
    }
    setCurrentStep(hasImplements ? 2 : 3);
  };

  const handleStep2Next = () => {
    setCurrentStep(3);
  };

  const handleStep3Next = () => {
    const { min, max, unit } = getScopeLimits(rentalType);
    const qtyNum = parseFloat(quantity);
    if (!qtyNum || isNaN(qtyNum) || qtyNum < min) {
      toastManager.error(`Please specify at least ${min} ${unit.toLowerCase()}`);
      return;
    }
    if (qtyNum > max) {
      toastManager.error(`Maximum allowed is ${max} ${unit.toLowerCase()} per booking`);
      return;
    }
    setCurrentStep(4);
  };

  const handleStepBack = (toStep) => {
    setCurrentStep(toStep);
  };

  const handleJumpToStep = (targetStep) => {
    if (targetStep === 1) {
      setCurrentStep(1);
      return;
    }
    if (!selectedCat) {
      toastManager.info('Please select a machinery category first');
      setCurrentStep(1);
      return;
    }
    if (targetStep === 2) {
      if (hasImplements) setCurrentStep(2);
      else setCurrentStep(3);
      return;
    }
    if (targetStep === 3) {
      setCurrentStep(3);
      return;
    }
    if (targetStep === 4) {
      const { min, max } = getScopeLimits(rentalType);
      const qtyNum = parseFloat(quantity);
      if (!qtyNum || isNaN(qtyNum) || qtyNum < min || qtyNum > max) {
        toastManager.info('Please set valid duration or land size first');
        setCurrentStep(3);
        return;
      }
      setCurrentStep(4);
    }
  };

  const handleBottomAction = () => {
    if (currentStep === 1) {
      handleStep1Next();
    } else if (currentStep === 2) {
      handleStep2Next();
    } else if (currentStep === 3) {
      handleStep3Next();
    } else if (currentStep === 4) {
      handleProceedToVendors();
    }
  };

  const formatTime12Hour = (timeStr) => {
    if (!timeStr) return '';
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
    } catch {
      return timeStr;
    }
  };

  const formatQtyDisplay = (qty) => {
    const num = parseFloat(qty);
    if (isNaN(num) || num <= 0) return '1';
    return Number(num.toFixed(2)).toString();
  };

  const formatScopeDisplay = (qty, type) => {
    const num = parseFloat(qty) || 1;
    const formatted = formatQtyDisplay(num);
    if (type === 'hourly') {
      return `${formatted} ${num === 1 ? 'Hour' : 'Hours'} • Hourly Metered`;
    }
    if (type === 'land_based') {
      return `${formatted} ${num === 1 ? 'Acre' : 'Acres'} • Land Acreage`;
    }
    return `${formatted} ${num === 1 ? 'Day' : 'Days'} • Daily Rental`;
  };

  const formatScopeShort = (qty, type) => {
    const num = parseFloat(qty) || 1;
    const formatted = formatQtyDisplay(num);
    if (type === 'hourly') {
      return `${formatted} ${num === 1 ? 'Hr' : 'Hrs'}`;
    }
    if (type === 'land_based') {
      return `${formatted} ${num === 1 ? 'Acre' : 'Acres'}`;
    }
    return `${formatted} ${num === 1 ? 'Day' : 'Days'}`;
  };

  const getScopeLimits = (type) => {
    if (type === 'daily') return { min: 1, max: 30, unit: 'Days' };
    if (type === 'hourly') return { min: 0.5, max: 24, unit: 'Hours' };
    return { min: 0.5, max: 200, unit: 'Acres' };
  };

  const handleRentalTypeChange = (newType) => {
    setRentalType(newType);
    const { min, max } = getScopeLimits(newType);
    setQuantity(prev => {
      const current = parseFloat(prev) || 1;
      const clamped = Math.min(max, Math.max(min, current));
      if (newType === 'daily') {
        return Math.round(clamped);
      }
      if (newType === 'hourly') {
        return Math.round(clamped * 2) / 2;
      }
      // land_based
      return Math.round(clamped * 10) / 10;
    });
  };

  const handleDecrementQuantity = () => {
    const { min } = getScopeLimits(rentalType);
    setQuantity(prev => {
      const current = parseFloat(prev) || 1;
      if (current <= min) return min;
      if (rentalType === 'daily') {
        return Math.max(min, Math.round(current) - 1);
      }
      // Snap to nearest 0.5 step, then subtract 0.5 cleanly
      const snapped = Math.round(current * 2) / 2;
      return Math.max(min, Math.round((snapped - 0.5) * 10) / 10);
    });
  };

  const handleIncrementQuantity = () => {
    const { max } = getScopeLimits(rentalType);
    setQuantity(prev => {
      const current = parseFloat(prev) || 1;
      if (current >= max) return max;
      if (rentalType === 'daily') {
        return Math.min(max, Math.round(current) + 1);
      }
      // Snap to nearest 0.5 step, then add 0.5 cleanly
      const snapped = Math.round(current * 2) / 2;
      return Math.min(max, Math.round((snapped + 0.5) * 10) / 10);
    });
  };

  const handleQuantityInputChange = (valStr) => {
    if (valStr === '') {
      setQuantity('');
      return;
    }
    const val = parseFloat(valStr);
    if (isNaN(val)) return;

    const { max } = getScopeLimits(rentalType);
    // If entered value exceeds max (e.g. 12122), strictly clamp to max
    const clampedVal = val > max ? max : val;
    
    // Limit decimal precision while typing: max 2 decimals for land_based, max 1 for hourly, 0 for daily
    const maxDecimals = rentalType === 'land_based' ? 2 : (rentalType === 'hourly' ? 1 : 0);
    const factor = Math.pow(10, maxDecimals);
    const rounded = Math.round(clampedVal * factor) / factor;
    setQuantity(rounded);
  };

  const handleQuantityInputBlur = () => {
    const { min, max } = getScopeLimits(rentalType);
    const num = parseFloat(quantity);
    if (!num || isNaN(num) || num < min) {
      setQuantity(min);
    } else if (num > max) {
      setQuantity(max);
    } else {
      const maxDecimals = rentalType === 'land_based' ? 2 : (rentalType === 'hourly' ? 1 : 0);
      const factor = Math.pow(10, maxDecimals);
      setQuantity(Math.round(num * factor) / factor);
    }
  };

  const getBottomButtonContent = () => {
    if (currentStep === 1) {
      return {
        title: hasImplements ? 'Next: Tool Attachment' : 'Next: Work Scope',
        icon: FiArrowRight
      };
    }
    if (currentStep === 2) {
      return {
        title: 'Next: Work Scope',
        icon: FiArrowRight
      };
    }
    if (currentStep === 3) {
      return {
        title: 'Next: Date & Time',
        icon: FiArrowRight
      };
    }
    return {
      title: 'Find Available Vendors',
      icon: FiChevronRight
    };
  };

  const getBottomSummaryText = () => {
    if (currentStep === 1) {
      return {
        label: 'Step 1 • Machine Category',
        main: selectedCat?.title || 'Choose Machine',
        sub: hasImplements ? `${equipmentImplements.length} attachments available` : 'Direct field deployment'
      };
    }
    if (currentStep === 2) {
      return {
        label: 'Step 2 • Tool Attachment',
        main: `${selectedCat?.title || 'Machine'} + ${selectedImplement ? selectedImplement.title : 'Bare Machine'}`,
        sub: selectedImplement ? 'Implement connected' : 'Bare machine (no implement)'
      };
    }
    if (currentStep === 3) {
      return {
        label: 'Step 3 • Work Scope',
        main: formatScopeDisplay(quantity, rentalType),
        sub: rentalType === 'hourly' ? 'Metered work duration' : rentalType === 'land_based' ? 'Land area measurement' : 'Multi-day rental period'
      };
    }
    return {
      label: 'Step 4 • Date & Start Time',
      main: `${selectedCat?.title || 'Machinery'} ${selectedImplement ? `+ ${selectedImplement.title}` : ''}`,
      sub: `${formatScopeShort(quantity, rentalType)} • ${formatToDDMMYYYY(bookingDate)} • Starts ${formatTime12Hour(startTime)}`
    };
  };

  const formatToDDMMYYYY = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
      const d = new Date(dateStr);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    } catch {
      return dateStr;
    }
  };

  const handleProceedToVendors = () => {
    if (!selectedCat) {
      toastManager.error('Please select a machinery category');
      return;
    }
    const { min, max, unit } = getScopeLimits(rentalType);
    const qtyNum = parseFloat(quantity);
    if (!qtyNum || isNaN(qtyNum) || qtyNum < min || qtyNum > max) {
      toastManager.error(`Please specify a valid work scope (${min} - ${max} ${unit.toLowerCase()})`);
      return;
    }
    if (!bookingDate) {
      toastManager.error('Please select a booking date');
      return;
    }
    if (!startTime || !endTime) {
      toastManager.error('Please select a time slot');
      return;
    }
    if (startTime >= endTime) {
      toastManager.error('End time must be after start time');
      return;
    }

    if (bookingDate === todayStr) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [sH, sM] = startTime.split(':').map(Number);
      if (sH * 60 + sM < currentMinutes + 45) {
        toastManager.error('Start time must be at least 45 minutes from now for same-day machinery dispatch');
        return;
      }
    }

    // Navigate to Step 2: Available Vendors Comparison
    navigate('/user/machinery/vendors', {
      state: {
        category: selectedCat,
        implement: selectedImplement,
        hpRange,
        rentalType,
        quantity: Math.round((parseFloat(quantity) || 1) * 100) / 100,
        bookingDate,
        startTime,
        endTime,
        lat: currentCity?.lat || selectedDistrict?.lat,
        lng: currentCity?.lng || selectedDistrict?.lng
      }
    });
  };

  const locationDisplayName = selectedSubDistrict?.name 
    ? `${selectedSubDistrict.name}, ${selectedDistrict?.name || ''}`
    : (selectedDistrict?.name || selectedState?.name || currentCity?.name || 'All India Coverage');

  const filteredEquipment = equipment.filter(e => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const nameMatch = (e.name || '').toLowerCase().includes(searchLower);
    const catMatch = (e.categoryId?.title || '').toLowerCase().includes(searchLower);
    const modelMatch = (e.modelNumber || '').toLowerCase().includes(searchLower);
    const vendorMatch = (e.vendorId?.name || '').toLowerCase().includes(searchLower);
    return nameMatch || catMatch || modelMatch || vendorMatch;
  });

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-slate-50 to-slate-50 pb-24 font-sans">
      <Helmet>
        <title>Rent Agriculture Machinery | {locationDisplayName !== 'All India Coverage' ? `In ${locationDisplayName}` : 'Agroyilt'}</title>
        <meta name="description" content={`Select equipment specifications, attachments, and slots to find verified machinery vendors in ${locationDisplayName}.`} />
      </Helmet>

      {/* Top Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-emerald-900/10 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-xl mx-auto px-3.5 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Back button + Title & Location */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button 
                onClick={() => navigate(-1)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-center text-slate-700 active:scale-95 transition-all flex-shrink-0 border border-slate-200/60 cursor-pointer"
                aria-label="Back"
              >
                <FiArrowLeft size={16} />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-black text-slate-900 tracking-tight leading-tight truncate">
                  Machinery & Tractor Services
                </h1>
                <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                  <FiMapPin className="text-emerald-600 shrink-0" size={10} />
                  <span className="truncate">{locationDisplayName}</span>
                </p>
              </div>
            </div>

            {/* Right: Segmented Toggle (Book Work vs Browse Catalog) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('book')}
                className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                  viewMode === 'book'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FiZap size={11} className={viewMode === 'book' ? 'text-amber-300' : ''} />
                <span>Book</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('catalog')}
                className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                  viewMode === 'catalog'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FiTruck size={11} />
                <span>Catalog</span>
              </button>
            </div>
          </div>

          {/* Polished 3-Step Flow Indicator */}
          {viewMode === 'book' && (
            <div className="pt-0.5 pb-0">
              <div className="flex items-center justify-between">
                {/* Step 1: Active */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-4.5 h-4.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black ring-2 ring-emerald-500/20 shadow-xs">
                    1
                  </span>
                  <span className="text-[11px] font-black text-emerald-800">Specs</span>
                </div>

                <div className="h-[2px] flex-1 mx-2.5 bg-gradient-to-r from-emerald-500 to-slate-200 rounded-full" />

                {/* Step 2 */}
                <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                  <span className="w-4.5 h-4.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center text-[9px] font-bold">
                    2
                  </span>
                  <span className="text-[11px] font-bold">Vendors</span>
                </div>

                <div className="h-[2px] flex-1 mx-2.5 bg-slate-200 rounded-full" />

                {/* Step 3 */}
                <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                  <span className="w-4.5 h-4.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center text-[9px] font-bold">
                    3
                  </span>
                  <span className="text-[11px] font-bold">Checkout</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Body */}
      {viewMode === 'book' ? (
        /* PROGRESSIVE 4-STEP SPECIFICATIONS ACCORDION */
        <div className="max-w-xl mx-auto px-3.5 py-3 space-y-3">
          {loading ? (
            <div className="py-24 text-center">
              <LogoLoader />
              <p className="text-xs font-black text-emerald-800 mt-4 tracking-wide animate-pulse">
                Configuring machinery specifications...
              </p>
            </div>
          ) : (
            <>


              {/* STEP 1: Machinery Category */}
              <div className="transition-all duration-300">
                {currentStep === 1 ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-3.5 border-2 border-emerald-500/40 shadow-xs space-y-3 ring-4 ring-emerald-500/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-[11px] shadow-xs">
                        1
                      </span>
                      <div>
                        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Select Machinery Category
                        </h2>
                        <p className="text-[10px] font-semibold text-slate-400">
                          Select the primary machine needed for your field
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-0.5">
                      {categories.map((cat) => {
                        const isSelected = (selectedCat?.id || selectedCat?._id) === (cat.id || cat._id);
                        return (
                          <button
                            key={cat.id || cat._id}
                            type="button"
                            onClick={() => setSelectedCat(cat)}
                            className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 relative cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                                : 'bg-slate-50/60 border-slate-200/80 hover:border-slate-300 hover:bg-slate-100/60'
                            }`}
                          >
                            {isSelected && (
                              <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[8px]">
                                <FiCheck size={9} />
                              </span>
                            )}
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform ${
                              isSelected 
                                ? 'bg-gradient-to-br from-emerald-600 to-green-700 text-white shadow-xs' 
                                : 'bg-white text-slate-600 shadow-2xs border border-slate-100'
                            }`}>
                              <FiTruck size={17} />
                            </div>
                            <span className={`text-[11px] font-black truncate max-w-full ${
                              isSelected ? 'text-emerald-900' : 'text-slate-800'
                            }`}>
                              {cat.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>


                  </motion.div>
                ) : (
                  /* Step 1 Collapsed Summary */
                  <div 
                    onClick={() => setCurrentStep(1)}
                    className="bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-200/80 hover:border-emerald-300 rounded-2xl p-3 flex items-center justify-between cursor-pointer transition-all group shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0 shadow-xs">
                        <FiCheck size={13} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-emerald-800/80 uppercase tracking-wider">
                          Step 1 • Machine Category
                        </p>
                        <p className="text-xs font-black text-slate-900 truncate">
                          {selectedCat?.title || 'Machine Selected'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentStep(1);
                      }}
                      className="text-[11px] font-black text-emerald-700 bg-white hover:bg-emerald-100/70 border border-emerald-200/60 px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 transition-colors shadow-2xs cursor-pointer"
                    >
                      <FiEdit2 size={10} />
                      <span>Change</span>
                    </button>
                  </div>
                )}
              </div>

              {/* STEP 2: Tool Attachment / Implement (Shown if hasImplements) */}
              {hasImplements && (
                <div className="transition-all duration-300">
                  {currentStep === 2 ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl p-3.5 border-2 border-emerald-500/40 shadow-xs space-y-3 ring-4 ring-emerald-500/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-[11px] shadow-xs">
                          2
                        </span>
                        <div>
                          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                            Tool Attachment / Implement
                          </h2>
                          <p className="text-[10px] font-semibold text-slate-400">
                            Hook a rotary, cultivator, or plough to the {selectedCat?.title || 'machine'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setSelectedImplement(null)}
                          className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                            !selectedImplement
                              ? 'bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow-xs ring-2 ring-emerald-500/20'
                              : 'bg-slate-50 text-slate-700 border border-slate-200/80 hover:bg-slate-100'
                          }`}
                        >
                          {!selectedImplement && <FiCheckCircle size={13} className="text-white" />}
                          <span>Bare Machine (No Attachment)</span>
                        </button>

                        {equipmentImplements.map((imp) => {
                          const isSelected = (selectedImplement?.id || selectedImplement?._id) === (imp.id || imp._id);
                          return (
                            <button
                              key={imp.id || imp._id}
                              type="button"
                              onClick={() => setSelectedImplement(imp)}
                              className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                isSelected
                                  ? 'bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow-xs ring-2 ring-emerald-500/20'
                                  : 'bg-slate-50 text-slate-700 border border-slate-200/80 hover:bg-slate-100'
                              }`}
                            >
                              <FiTool size={12} className={isSelected ? 'text-amber-300' : 'text-slate-400'} />
                              <span>{imp.title}</span>
                              {isSelected && <FiCheckCircle size={13} className="text-white" />}
                            </button>
                          );
                        })}
                      </div>


                    </motion.div>
                  ) : currentStep > 2 ? (
                    /* Step 2 Collapsed Summary */
                    <div 
                      onClick={() => setCurrentStep(2)}
                      className="bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-200/80 hover:border-emerald-300 rounded-2xl p-3 flex items-center justify-between cursor-pointer transition-all group shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0 shadow-xs">
                          <FiCheck size={13} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-emerald-800/80 uppercase tracking-wider">
                            Step 2 • Tool Attachment
                          </p>
                          <p className="text-xs font-black text-slate-900 truncate">
                            {selectedImplement ? selectedImplement.title : 'Bare Machine (No Attachment)'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentStep(2);
                        }}
                        className="text-[11px] font-black text-emerald-700 bg-white hover:bg-emerald-100/70 border border-emerald-200/60 px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 transition-colors shadow-2xs cursor-pointer"
                      >
                        <FiEdit2 size={10} />
                        <span>Change</span>
                      </button>
                    </div>
                  ) : (
                    /* Step 2 Locked Preview */
                    <div 
                      onClick={() => handleJumpToStep(2)}
                      className="bg-slate-50/70 hover:bg-slate-100/60 border border-slate-200/60 rounded-2xl p-3 flex items-center justify-between opacity-70 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold shrink-0">
                          2
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-700 truncate">
                            Tool Attachment / Implement
                          </p>
                          <p className="text-[10px] font-semibold text-slate-400 truncate">
                            Select machinery first to customize attachment
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <FiLock size={10} />
                        <span>Upcoming</span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Rental Type & Scope */}
              <div className="transition-all duration-300">
                {currentStep === 3 ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-3.5 border-2 border-emerald-500/40 shadow-xs space-y-3 ring-4 ring-emerald-500/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-[11px] shadow-xs">
                        3
                      </span>
                      <div>
                        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Service Scope & Work Estimate
                        </h2>
                        <p className="text-[10px] font-semibold text-slate-400">
                          Estimate work duration • Final billing based on live active minutes
                        </p>
                      </div>
                    </div>

                    {/* Service Type Segmented Tabs (Hourly/Minutes vs Acreage) */}
                    <div className="grid grid-cols-2 gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/60">
                      {[
                        { label: '⏱️ Hourly / Minutes', value: 'hourly' },
                        { label: '🌾 Land Area (Acres)', value: 'land_based' }
                      ].map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => handleRentalTypeChange(t.value)}
                          className={`py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            rentalType === t.value
                              ? 'bg-white text-emerald-800 shadow-xs border border-slate-200/50'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Stepper & Counter */}
                    <div className="space-y-2 pt-0.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                            {rentalType === 'land_based' 
                              ? 'Total Land Size (Acres)' 
                              : 'Estimated Work Duration (Hours)'}
                          </label>
                          <span className="text-[9.5px] text-emerald-600 font-bold block mt-0.5">
                            {rentalType === 'hourly'
                              ? '⏱️ Billed on actual running minutes (0.5 – 24 Hrs)'
                              : rentalType === 'land_based'
                              ? '🌾 Rate applied per acre completed (0.5 – 200 Acres)'
                              : '📅 Multi-day machine rental (1 – 30 Days)'}
                          </span>
                        </div>

                        {/* Stepper Controls */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl p-0.5 shadow-inner">
                          <button
                            type="button"
                            onClick={handleDecrementQuantity}
                            disabled={parseFloat(quantity) <= getScopeLimits(rentalType).min}
                            className="w-8 h-8 rounded-lg bg-white border border-slate-200/70 flex items-center justify-center font-black text-slate-800 shadow-2xs hover:bg-slate-100 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all cursor-pointer"
                            aria-label="Decrease"
                          >
                            <FiMinus size={13} />
                          </button>
                          <input
                            type="number"
                            step={rentalType === 'daily' ? '1' : rentalType === 'hourly' ? '0.5' : '0.1'}
                            min={getScopeLimits(rentalType).min}
                            max={getScopeLimits(rentalType).max}
                            value={quantity}
                            onChange={(e) => handleQuantityInputChange(e.target.value)}
                            onBlur={handleQuantityInputBlur}
                            className="w-16 min-w-[3.5rem] px-1 text-center text-xs font-black text-slate-900 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={handleIncrementQuantity}
                            disabled={parseFloat(quantity) >= getScopeLimits(rentalType).max}
                            className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 text-white flex items-center justify-center font-black shadow-2xs active:scale-95 transition-all cursor-pointer"
                            aria-label="Increase"
                          >
                            <FiPlus size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Preset Pills */}
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                        {(rentalType === 'hourly' 
                          ? [1, 2, 3, 4, 6, 8] 
                          : rentalType === 'land_based' 
                          ? [1, 2, 3, 5, 8, 10] 
                          : [1, 2, 3, 5, 7]
                        ).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setQuantity(preset)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0 transition-all cursor-pointer ${
                              parseFloat(quantity) === preset
                                ? 'bg-emerald-700 text-white shadow-2xs'
                                : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                            }`}
                          >
                            {formatScopeShort(preset, rentalType)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : currentStep > 3 ? (
                  /* Step 3 Collapsed Summary */
                  <div 
                    onClick={() => setCurrentStep(3)}
                    className="bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-200/80 hover:border-emerald-300 rounded-2xl p-3 flex items-center justify-between cursor-pointer transition-all group shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0 shadow-xs">
                        <FiCheck size={13} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-emerald-800/80 uppercase tracking-wider">
                          Step 3 • Estimated Scope
                        </p>
                        <p className="text-xs font-black text-slate-900 truncate">
                          {formatScopeDisplay(quantity, rentalType)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentStep(3);
                      }}
                      className="text-[11px] font-black text-emerald-700 bg-white hover:bg-emerald-100/70 border border-emerald-200/60 px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 transition-colors shadow-2xs cursor-pointer"
                    >
                      <FiEdit2 size={10} />
                      <span>Change</span>
                    </button>
                  </div>
                ) : (
                  /* Step 3 Locked Preview */
                  <div 
                    onClick={() => handleJumpToStep(3)}
                    className="bg-slate-50/70 hover:bg-slate-100/60 border border-slate-200/60 rounded-2xl p-3 flex items-center justify-between opacity-70 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold shrink-0">
                        3
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-700 truncate">
                          Service Scope & Work Estimate
                        </p>
                        <p className="text-[10px] font-semibold text-slate-400 truncate">
                          Estimate hourly duration or land acreage
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <FiLock size={10} />
                      <span>Upcoming</span>
                    </span>
                  </div>
                )}
              </div>

              {/* STEP 4: Date & Start Time */}
              <div className="transition-all duration-300">
                {currentStep === 4 ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-3.5 border-2 border-emerald-500/40 shadow-xs space-y-3 ring-4 ring-emerald-500/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-[11px] shadow-xs">
                        4
                      </span>
                      <div>
                        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Work Date & Start Time
                        </h2>
                        <p className="text-[10px] font-semibold text-slate-400">
                          Specify when the machine should arrive and begin work
                        </p>
                      </div>
                    </div>

                    {/* Date Picker Card */}
                    <div className="relative group">
                      <div className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 group-hover:border-emerald-500 group-hover:bg-emerald-50/20 transition-all shadow-2xs cursor-pointer">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100/90 text-emerald-800 flex items-center justify-center shrink-0">
                            <FiCalendar size={15} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 tracking-wider">
                              {formatToDDMMYYYY(bookingDate)}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 truncate">
                              {formatDateDisplay(bookingDate)}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10.5px] font-black text-emerald-700 bg-white border border-emerald-200/70 px-2.5 py-1 rounded-lg shadow-2xs shrink-0 flex items-center gap-1">
                          <FiEdit2 size={10} />
                          <span>Change Date</span>
                        </span>
                      </div>
                      <input
                        type="date"
                        min={isTodayClosed ? tomorrowStr : todayStr}
                        value={bookingDate}
                        onChange={(e) => setBookingDate(e.target.value)}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                      />
                    </div>

                    {/* Preferred Arrival / Start Time Slots */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          Select Preferred Start Time:
                        </p>
                        {bookingDate === todayStr && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 shrink-0">
                            45m lead time
                          </span>
                        )}
                      </div>

                      {availableSlots.length === 0 ? (
                        <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3 text-center space-y-1.5 shadow-2xs">
                          <p className="text-xs font-black text-amber-950">
                            Today's operating shifts have concluded
                          </p>
                          <p className="text-[10.5px] font-semibold text-amber-800 leading-relaxed">
                            Machinery dispatch buffer has ended for today. Book for tomorrow to access all morning and daytime slots.
                          </p>
                          <button
                            type="button"
                            onClick={() => setBookingDate(tomorrowStr)}
                            className="mt-1 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-black transition-all cursor-pointer shadow-xs"
                          >
                            Switch to Tomorrow ({formatToDDMMYYYY(tomorrowStr)})
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {availableSlots.map((slot) => {
                            const isSelected = startTime === slot.time;
                            const IconComp = slot.icon;
                            return (
                              <button
                                key={slot.label}
                                type="button"
                                onClick={() => {
                                  setStartTime(slot.time);
                                  setActiveSlotPreset(slot.label);
                                }}
                                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[70px] ${
                                  isSelected
                                    ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                                    : 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300 hover:bg-slate-100/60'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 w-full">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                      isSelected ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-200/70 text-slate-600'
                                    }`}>
                                      <IconComp size={11} />
                                    </span>
                                    <span className="text-[11px] font-black text-slate-900 truncate">
                                      {slot.label}
                                    </span>
                                  </div>
                                  {slot.tag && (
                                    <span className={`text-[7.5px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 tracking-wider ${
                                      isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200/80 text-slate-600'
                                    }`}>
                                      {slot.tag}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-baseline justify-between mt-2 pt-1 border-t border-slate-200/50">
                                  <p className="text-xs font-black text-emerald-800 tracking-tight">
                                    {formatTime12Hour(slot.time)}
                                  </p>
                                  {isSelected && (
                                    <span className="text-[9px] font-black text-emerald-700 flex items-center gap-0.5">
                                      <FiCheck size={11} />
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Custom Start Time Input */}
                      <div className="pt-1.5">
                        <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Or Set Custom Start Time:
                        </label>
                        <div className="relative">
                          <input
                            type="time"
                            value={startTime}
                            onChange={(e) => {
                              setStartTime(e.target.value);
                              setActiveSlotPreset('');
                            }}
                            className="w-full text-xs font-black p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 focus:outline-none focus:border-emerald-500 focus:bg-white text-slate-900 transition-all"
                          />
                        </div>
                      </div>

                      {/* Smart Job Schedule Preview Banner (Matches chosen scope exactly) */}
                      <div className="pt-1">
                        <div className="bg-emerald-50/90 border border-emerald-200/80 rounded-xl p-2.5 flex items-center gap-2.5 shadow-2xs">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                            <FiClock size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[9.5px] font-black text-emerald-900 uppercase tracking-wider">
                              {rentalType === 'hourly' ? 'Expected Work Window' : rentalType === 'land_based' ? 'Field Work Schedule' : 'Rental Duration'}
                            </p>
                            <p className="text-xs font-black text-slate-900 truncate">
                              {rentalType === 'hourly' 
                                ? `${formatTime12Hour(startTime)} – ${formatTime12Hour(endTime)} (${formatQtyDisplay(quantity)} ${parseFloat(quantity) === 1 ? 'Hour' : 'Hours'})`
                                : rentalType === 'land_based'
                                ? `Starts at ${formatTime12Hour(startTime)} • ${formatQtyDisplay(quantity)} ${parseFloat(quantity) === 1 ? 'Acre' : 'Acres'} Workload`
                                : `${formatQtyDisplay(quantity)} ${parseFloat(quantity) === 1 ? 'Day' : 'Days'} • Starts at ${formatTime12Hour(startTime)}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  /* Step 4 Locked Preview */
                  <div 
                    onClick={() => handleJumpToStep(4)}
                    className="bg-slate-50/70 hover:bg-slate-100/60 border border-slate-200/60 rounded-2xl p-3 flex items-center justify-between opacity-70 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold shrink-0">
                        4
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-700 truncate">
                          Work Date & Start Time
                        </p>
                        <p className="text-[10px] font-semibold text-slate-400 truncate">
                          {formatToDDMMYYYY(bookingDate)} • Starts {formatTime12Hour(startTime)}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <FiLock size={10} />
                      <span>Upcoming</span>
                    </span>
                  </div>
                )}
              </div>

            </>
          )}
        </div>
      ) : (
        /* CATALOG VIEW: BROWSE ALL INVENTORY */
        <div className="max-w-xl mx-auto px-3.5 py-3 space-y-3">
          <div className="relative">
            <FiSearch className="absolute left-3.5 top-3 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search tractors, rotavators, brands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 text-xs font-bold focus:outline-none focus:border-emerald-600 shadow-xs"
            />
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <LogoLoader />
            </div>
          ) : filteredEquipment.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 text-center space-y-2.5 shadow-xs">
              <FiTruck size={30} className="text-slate-300 mx-auto" />
              <p className="text-xs font-black text-slate-800">No machinery matched your search.</p>
              <button
                onClick={() => setSearch('')}
                className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredEquipment.map((item) => (
                <div
                  key={item._id}
                  onClick={() => navigate(`/user/machinery/${item._id}`)}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="h-36 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                    {item.images?.[0] ? (
                      <img 
                        src={item.images[0]} 
                        alt={item.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                    ) : (
                      <FiTruck size={30} className="text-slate-300" />
                    )}
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-white/95 backdrop-blur-md rounded-full text-[8.5px] font-black uppercase text-emerald-800 shadow-2xs">
                      {item.categoryId?.title || 'Machinery'}
                    </span>
                    {item.horsepower && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/80 backdrop-blur-md rounded-full text-[8.5px] font-black text-white">
                        {item.horsepower} HP
                      </span>
                    )}
                  </div>

                  <div className="p-3 space-y-1.5">
                    <div>
                      <h3 className="text-xs font-black text-slate-900 truncate">{item.name}</h3>
                      <p className="text-[9.5px] font-bold text-slate-400">{item.modelNumber || 'Verified Farm Equipment'}</p>
                    </div>

                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-[8.5px] font-bold text-slate-400 uppercase">Rate</p>
                        <p className="text-xs font-black text-emerald-700">
                          {item.pricing?.hourly?.price ? `₹${item.pricing.hourly.price}/Hr` :
                           item.pricing?.land_based?.price ? `₹${item.pricing.land_based.price}/Acre` :
                           item.pricing?.daily?.price ? `₹${item.pricing.daily.price}/Day` : 'Rate On Request'}
                        </p>
                      </div>
                      <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <FiChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FLOATING GLASS ISLAND BOTTOM BAR (Step 1 -> Step 2 CTA) */}
      {viewMode === 'book' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 px-3.5 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2.5">
            {(() => {
              const summary = getBottomSummaryText();
              const btn = getBottomButtonContent();
              const BtnIcon = btn.icon;

              return (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate">
                      {summary.label}
                    </p>
                    <p className="text-xs font-black text-slate-900 truncate">
                      {summary.main}
                    </p>
                    <p className="text-[9.5px] font-bold text-emerald-700 truncate">
                      {summary.sub}
                    </p>
                  </div>

                  <button
                    onClick={handleBottomAction}
                    className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-700/25 flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                  >
                    <span>{btn.title}</span>
                    <BtnIcon size={14} />
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default MachineryExplorer;
