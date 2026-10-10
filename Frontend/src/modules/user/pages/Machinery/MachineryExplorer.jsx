import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FiSearch, FiMapPin, FiTruck, FiClock, 
  FiChevronRight, FiArrowLeft, FiCalendar, 
  FiCheckCircle, FiZap, FiPlus, FiMinus, 
  FiInfo, FiShield, FiSliders, FiCheck, FiTool,
  FiArrowRight, FiEdit2, FiLock
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import { useGeo } from '../../../../context/GeoContext';
import LogoLoader from '../../../../components/common/LogoLoader';
import { toastManager } from '../../../../utils/toastManager';
import { themeColors } from '../../../../theme';
import FieldAreaMeasurementModal from '../../components/FieldAreaMeasurementModal';

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

  // Step 1: Requirements State (Restored from navigation state if returning from Step 2)
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const dayAfterStr = new Date(Date.now() + 172800000).toISOString().split('T')[0];

  const QUICK_TIME_PRESETS = [
    { label: '6:00 AM', time: '06:00' },
    { label: '8:00 AM', time: '08:00' },
    { label: '10:00 AM', time: '10:00' },
    { label: '1:00 PM', time: '13:00' },
    { label: '3:00 PM', time: '15:00' },
    { label: '5:00 PM', time: '17:00' },
    { label: '7:00 PM', time: '19:00' }
  ];

  const getEarliestStartTime = (dateStr) => {
    if (!dateStr || dateStr !== todayStr) return '08:00';
    const now = new Date();
    // 45 minute buffer from now
    const targetMin = now.getHours() * 60 + now.getMinutes() + 45;
    const roundedMin = Math.ceil(targetMin / 15) * 15;
    const h = Math.floor(roundedMin / 60);
    const m = roundedMin % 60;
    if (h >= 24) return '23:00';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const isTodayClosed = (() => {
    const now = new Date();
    return now.getHours() >= 20; // 8:00 PM cutoff for new same-day dispatches
  })();

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
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [measuredField, setMeasuredField] = useState(location.state?.measuredField || null);

  const handleApplyMeasuredField = (fieldData) => {
    setMeasuredField(fieldData);
    if (fieldData?.acres) {
      setQuantity(fieldData.acres);
    }
  };
  const [bookingDate, setBookingDate] = useState(() => {
    if (location.state?.bookingDate) return location.state.bookingDate;
    return isTodayClosed ? tomorrowStr : todayStr;
  });

  const [startTime, setStartTime] = useState(() => {
    if (location.state?.startTime) return location.state.startTime;
    return getEarliestStartTime(location.state?.bookingDate || (isTodayClosed ? tomorrowStr : todayStr));
  });

  const [endTime, setEndTime] = useState(() => {
    if (location.state?.endTime) return location.state.endTime;
    const initialQty = location.state?.quantity ? (Math.round((parseFloat(location.state.quantity) || 1) * 100) / 100) : 1;
    const initStart = location.state?.startTime || getEarliestStartTime(location.state?.bookingDate || (isTodayClosed ? tomorrowStr : todayStr));
    return calculateEndTime(initStart, initialQty);
  });

  const [currentStep, setCurrentStep] = useState(location.state?.step || 1);

  // Automatically sync endTime whenever startTime, quantity, or rentalType changes
  useEffect(() => {
    const qtyNum = parseFloat(quantity) || 1;
    const hours = rentalType === 'hourly' ? qtyNum : (rentalType === 'daily' ? 8 * qtyNum : 4);
    setEndTime(calculateEndTime(startTime, hours));
  }, [startTime, quantity, rentalType]);

  // When switching to today, ensure startTime is not in the past
  useEffect(() => {
    if (bookingDate === todayStr) {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes() + 45;
      const [sh, sm] = startTime.split(':').map(Number);
      if (sh * 60 + sm < currentMin) {
        setStartTime(getEarliestStartTime(todayStr));
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

  // Fetch service categories and implements
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

      // A category carried over from earlier navigation may since have been marked Rental by admin
      if (catId) {
        const rentalRes = await publicEquipmentService.getMachineryCategories({ ...geoParams, mode: 'rental' });
        if (rentalRes?.success && rentalRes.data.some(c => String(c._id || c.id) === String(catId))) {
          navigate('/user/rentals', { replace: true, state: { category: selectedCat } });
          return;
        }
      }

      const promises = [
        publicEquipmentService.getMachineryCategories({ ...geoParams, mode: 'service' })
      ];

      if (catId) {
        promises.push(publicEquipmentService.getImplementsForCategory(catId, geoParams));
      }

      const [catsRes, impsRes] = await Promise.all(promises);

      if (catsRes?.success && Array.isArray(catsRes.data)) {
        setCategories(catsRes.data);
        if (!selectedCat && catsRes.data.length > 0) {
          // Default to first category (e.g. Tractor)
          setSelectedCat(catsRes.data[0]);
        }
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

  const getDurationHumanReadable = (qty) => {
    const num = parseFloat(qty);
    if (isNaN(num) || num <= 0) return '0 mins';
    const totalMinutes = Math.round(num * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m} min${m !== 1 ? 's' : ''}`;
    if (m === 0) return `${h} hr${h !== 1 ? 's' : ''}`;
    return `${h} hr${h !== 1 ? 's' : ''} ${m} min${m !== 1 ? 's' : ''}`;
  };

  const getLandAreaEquivalent = (qty) => {
    const num = parseFloat(qty);
    if (isNaN(num) || num <= 0) return '';
    const bigha = (num * 1.61).toFixed(2).replace(/\.00$/, '');
    const guntha = (num * 40).toFixed(1).replace(/\.0$/, '');
    return `≈ ${bigha} Bigha • ${guntha} Guntha`;
  };

  const formatScopeDisplay = (qty, type) => {
    const num = parseFloat(qty) || 1;
    const formatted = formatQtyDisplay(num);
    if (type === 'hourly') {
      const human = getDurationHumanReadable(num);
      return `${formatted} ${num === 1 ? 'Hour' : 'Hours'} (${human}) • Hourly Metered`;
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
    if (startTime === endTime && (rentalType !== 'hourly' || parseFloat(quantity) !== 24)) {
      toastManager.error('End time cannot be the same as start time');
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
        lng: currentCity?.lng || selectedDistrict?.lng,
        measuredField
      }
    });
  };

  const locationDisplayName = selectedSubDistrict?.name 
    ? `${selectedSubDistrict.name}, ${selectedDistrict?.name || ''}`
    : (selectedDistrict?.name || selectedState?.name || currentCity?.name || 'All India Coverage');

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

            {/* Right: Link to the separate rental flow */}
            <button
              type="button"
              onClick={() => navigate('/user/rentals')}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200/80 text-[11px] font-black text-slate-600 hover:text-emerald-700 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <FiTruck size={11} />
              <span>Rent a machine</span>
            </button>
          </div>

          {/* Polished 3-Step Flow Indicator */}
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
        </div>
      </div>

      {/* Main Body */}
      {/* PROGRESSIVE 4-STEP SPECIFICATIONS ACCORDION */}
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
                            <span className={`text-[11px] font-bold line-clamp-2 leading-tight text-center break-words max-w-full min-h-[26px] flex items-center justify-center ${
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

                      {/* Live Human-Readable Helper Banner */}
                      {rentalType === 'hourly' && (
                        <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-200/80 rounded-xl px-3 py-1.5 shadow-2xs">
                          <span className="text-[11px] font-bold text-emerald-900/80 flex items-center gap-1.5">
                            <FiClock size={12} className="text-emerald-600" />
                            Work Duration:
                          </span>
                          <span className="font-black text-emerald-800 text-xs flex items-center gap-1.5">
                            <span>{getDurationHumanReadable(quantity)}</span>
                            <span className="text-[10px] text-emerald-600 font-bold bg-white/80 px-1.5 py-0.5 rounded border border-emerald-200/50">
                              {Math.round((parseFloat(quantity) || 0) * 60)} mins
                            </span>
                          </span>
                        </div>
                      )}

                      {rentalType === 'land_based' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between bg-amber-50/80 border border-amber-200/80 rounded-xl px-3 py-1.5 shadow-2xs">
                            <span className="text-[11px] font-bold text-amber-900/80 flex items-center gap-1.5">
                              🌾 Equivalent Size:
                            </span>
                            <span className="font-black text-amber-800 text-xs">
                              {getLandAreaEquivalent(quantity)}
                            </span>
                          </div>

                          {/* Map-based Field Measurement Tool CTA */}
                          {measuredField ? (
                            <div className="bg-emerald-50/90 border border-emerald-300 rounded-xl p-2.5 flex items-center justify-between shadow-2xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                  <FiMapPin size={14} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-black text-emerald-900 uppercase tracking-wider">
                                    Field Measured on Satellite Map
                                  </p>
                                  <p className="text-xs font-black text-slate-900 truncate">
                                    {measuredField.acres} Acres (≈ {measuredField.bigha} Bigha • {measuredField.guntha} Guntha)
                                  </p>
                                  {measuredField.points?.length > 0 && (
                                    <p className="text-[9.5px] font-semibold text-emerald-700">
                                      {measuredField.points.length} boundary pins marked
                                    </p>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsAreaModalOpen(true)}
                                className="px-2.5 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-black shrink-0 transition-all cursor-pointer shadow-2xs"
                              >
                                Edit Border
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsAreaModalOpen(true)}
                              className="w-full py-2 px-3 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 active:scale-[0.99] text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-sm shadow-emerald-700/20 transition-all cursor-pointer border border-emerald-500/30"
                            >
                              <FiMapPin size={14} className="text-emerald-200" />
                              <span>📐 Measure Field on Map (नक्शे पर खेत नापें)</span>
                              <span className="text-[9.5px] bg-white/20 px-1.5 py-0.5 rounded font-bold">
                                Auto-Calculate
                              </span>
                            </button>
                          )}
                        </div>
                      )}

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

                    {/* Machine Arrival Time */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                          Preferred Arrival Time
                        </label>
                        {bookingDate === todayStr && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 shrink-0">
                            45m dispatch lead time
                          </span>
                        )}
                      </div>

                      {/* Prominent Arrival Time Card (Matches Date Picker Pattern) */}
                      <div className="relative group">
                        <div className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 group-hover:border-emerald-500 group-hover:bg-emerald-50/20 transition-all shadow-2xs cursor-pointer">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100/90 text-emerald-800 flex items-center justify-center shrink-0">
                              <FiClock size={15} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-slate-900 tracking-wider">
                                {formatTime12Hour(startTime)}
                              </p>
                              <p className="text-[10px] font-bold text-slate-400">
                                Machine starts work at your field
                              </p>
                            </div>
                          </div>
                          <span className="text-[10.5px] font-black text-emerald-700 bg-white border border-emerald-200/70 px-2.5 py-1 rounded-lg shadow-2xs shrink-0 flex items-center gap-1">
                            <FiEdit2 size={10} />
                            <span>Change Time</span>
                          </span>
                        </div>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                        />
                      </div>

                      {/* Quick Hour Preset Pills */}
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          Popular Start Times:
                        </p>
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                          {QUICK_TIME_PRESETS.map((preset) => {
                            const isSelected = startTime === preset.time;
                            const isPast = bookingDate === todayStr && (() => {
                              const now = new Date();
                              const curMin = now.getHours() * 60 + now.getMinutes() + 45;
                              const [ph, pm] = preset.time.split(':').map(Number);
                              return ph * 60 + pm < curMin;
                            })();

                            return (
                              <button
                                key={preset.time}
                                type="button"
                                disabled={isPast}
                                onClick={() => setStartTime(preset.time)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black shrink-0 transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-700 text-white shadow-2xs'
                                    : isPast
                                    ? 'bg-slate-100 text-slate-400 opacity-40 cursor-not-allowed border border-slate-200/40'
                                    : 'bg-slate-50 text-slate-700 border border-slate-200/80 hover:bg-slate-100'
                                }`}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
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
                                ? `${formatTime12Hour(startTime)} – ${formatTime12Hour(endTime)}${(() => {
                                    const [sh, sm] = (startTime || '').split(':').map(Number);
                                    const [eh, em] = (endTime || '').split(':').map(Number);
                                    return (eh * 60 + (em || 0) < sh * 60 + (sm || 0)) ? ' (Next Day)' : '';
                                  })()} (${formatQtyDisplay(quantity)} ${parseFloat(quantity) === 1 ? 'Hour' : 'Hours'} • ${getDurationHumanReadable(quantity)})`
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

      {/* FLOATING GLASS ISLAND BOTTOM BAR (Step 1 -> Step 2 CTA) */}
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

        {/* FIELD AREA MEASUREMENT MODAL */}
        <FieldAreaMeasurementModal
          isOpen={isAreaModalOpen}
          onClose={() => setIsAreaModalOpen(false)}
          onApplyArea={handleApplyMeasuredField}
          initialAcres={parseFloat(quantity) || 1}
          initialCenter={
            currentCity?.lat && currentCity?.lng
              ? { lat: currentCity.lat, lng: currentCity.lng }
              : selectedDistrict?.lat && selectedDistrict?.lng
              ? { lat: selectedDistrict.lat, lng: selectedDistrict.lng }
              : null
          }
          initialPoints={measuredField?.points || []}
        />
    </div>
  );
};

export default MachineryExplorer;
