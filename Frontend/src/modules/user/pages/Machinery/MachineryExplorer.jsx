import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FiSearch, FiFilter, FiMapPin, FiTruck, 
  FiClock, FiStar, FiChevronRight, FiArrowLeft,
  FiCalendar, FiCheckCircle, FiAlertCircle, FiSliders, 
  FiUsers, FiLayers, FiZap, FiPlus, FiMinus, FiInfo
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import { useGeo } from '../../../../context/GeoContext';
import LogoLoader from '../../../../components/common/LogoLoader';
import { toastManager } from '../../../../utils/toastManager';

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

  const [selectedCat, setSelectedCat] = useState(location.state?.category || null);
  const [selectedImplement, setSelectedImplement] = useState(location.state?.preSelectedImplement || null);
  const [hpRange, setHpRange] = useState(location.state?.hpRange || 'all'); // 'all', '20-35', '35-50', '50-75', '75+'
  const [rentalType, setRentalType] = useState(location.state?.rentalType || 'hourly'); // 'hourly' | 'land_based' | 'daily'
  const [quantity, setQuantity] = useState(location.state?.quantity || 1);
  const [bookingDate, setBookingDate] = useState(location.state?.bookingDate || todayStr);
  const [startTime, setStartTime] = useState(location.state?.startTime || '09:00');
  const [endTime, setEndTime] = useState(location.state?.endTime || '11:00');
  const [activeSlotPreset, setActiveSlotPreset] = useState('09:00 - 11:00');

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

  const handleProceedToVendors = () => {
    if (!selectedCat) {
      toastManager.error('Please select a machinery category');
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

    // Navigate to Step 2: Available Vendors Comparison
    navigate('/user/machinery/vendors', {
      state: {
        category: selectedCat,
        implement: selectedImplement,
        hpRange,
        rentalType,
        quantity,
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
    : (selectedDistrict?.name || selectedState?.name || currentCity?.name || 'Globally Available');

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
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-36">
      <Helmet>
        <title>Rent Agriculture Machinery | {locationDisplayName !== 'Globally Available' ? `In ${locationDisplayName}` : 'Agroyilt'}</title>
        <meta name="description" content={`Select equipment specifications, attachments, and slots to find verified machinery vendors in ${locationDisplayName}.`} />
      </Helmet>

      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
        <div className="max-w-xl mx-auto px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-all flex-shrink-0"
                aria-label="Back"
              >
                <FiArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-base font-black text-slate-900 leading-tight">
                  Rent Farm Machinery
                </h1>
                <p className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                  <FiMapPin className="text-orange-500" size={11} /> {locationDisplayName}
                </p>
              </div>
            </div>

            {/* Toggle: Book Work vs Browse Catalog */}
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                onClick={() => setViewMode('book')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                  viewMode === 'book'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FiZap size={13} />
                <span>Book Work</span>
              </button>
              <button
                onClick={() => setViewMode('catalog')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                  viewMode === 'catalog'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FiTruck size={13} />
                <span>Catalog</span>
              </button>
            </div>
          </div>

          {/* Multi-Step Flow Indicator (Only on Book Work view) */}
          {viewMode === 'book' && (
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5 text-xs font-black text-blue-600">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
                <span>Requirements</span>
              </div>
              <div className="h-[2px] flex-1 mx-2.5 bg-slate-200"></div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px]">2</span>
                <span>Select Vendor</span>
              </div>
              <div className="h-[2px] flex-1 mx-2.5 bg-slate-200"></div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px]">3</span>
                <span>Checkout</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Body */}
      {viewMode === 'book' ? (
        /* STEP 1: JOB SETUP & SPECIFICATIONS FORM */
        <div className="max-w-xl mx-auto px-4 py-5 space-y-5">
          {loading ? (
            <div className="py-20 text-center">
              <LogoLoader />
              <p className="text-xs font-bold text-slate-400 mt-4 animate-pulse">Loading machinery specifications...</p>
            </div>
          ) : (
            <>
              {/* SECTION 1: Select Category */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs">
                      1
                    </span>
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                      Machinery Category
                    </h2>
                  </div>
                  <button 
                    onClick={() => navigate('/user/machinery-categories')}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
                  >
                    View All
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  {categories.map((cat) => {
                    const isSelected = (selectedCat?.id || selectedCat?._id) === (cat.id || cat._id);
                    return (
                      <button
                        key={cat.id || cat._id}
                        type="button"
                        onClick={() => setSelectedCat(cat)}
                        className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 shadow-sm'
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSelected ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 shadow-xs'}`}>
                          <FiTruck size={18} />
                        </div>
                        <span className={`text-xs font-black truncate max-w-full ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                          {cat.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: Select Attachment / Implement (if category has implements) */}
              {equipmentImplements.length > 0 && (
                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs">
                        2
                      </span>
                      <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                        Attach Implement / Tool
                      </h2>
                    </div>
                    {selectedCat && (
                      <button 
                        onClick={() => navigate('/user/machinery-implements', { state: { category: selectedCat } })}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
                      >
                        Browse All
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] font-semibold text-slate-400">
                    Select a tool for this machinery or choose machine-only:
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedImplement(null)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                        !selectedImplement
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ✓ No Implement (Machine Only)
                    </button>

                    {equipmentImplements.map((imp) => {
                      const isSelected = (selectedImplement?.id || selectedImplement?._id) === (imp.id || imp._id);
                      return (
                        <button
                          key={imp.id || imp._id}
                          type="button"
                          onClick={() => setSelectedImplement(imp)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>{imp.title}</span>
                          {isSelected && <FiCheckCircle size={13} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION 3: Horsepower Range */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-black text-xs">
                    3
                  </span>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Horsepower Requirement (HP)
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {[
                    { label: 'All HP', value: 'all', desc: 'Any available machine' },
                    { label: '20 - 35 HP', value: '20-35', desc: 'Light / Orchard' },
                    { label: '35 - 50 HP', value: '35-50', desc: 'Standard Tilling' },
                    { label: '50 - 75 HP', value: '50-75', desc: 'Heavy Soil / Plouging' },
                    { label: '75+ HP', value: '75+', desc: 'Large Commercial' }
                  ].map((h) => {
                    const isSelected = hpRange === h.value;
                    return (
                      <button
                        key={h.value}
                        type="button"
                        onClick={() => setHpRange(h.value)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 text-slate-800'
                        }`}
                      >
                        <p className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {h.label}
                        </p>
                        <p className={`text-[10px] font-medium mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                          {h.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 4: Rental Type & Scope */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs">
                    4
                  </span>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Rental Type & Work Scope
                  </h2>
                </div>

                {/* Rental Type Tabs */}
                <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                  {[
                    { label: '⏱️ Hourly', value: 'hourly' },
                    { label: '🌾 Land-Based', value: 'land_based' },
                    { label: '📅 Daily', value: 'daily' }
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setRentalType(t.value)}
                      className={`py-2 rounded-xl text-xs font-black transition-all ${
                        rentalType === t.value
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Counter & Quick Presets */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider">
                      {rentalType === 'land_based' 
                        ? 'Total Land Size (Acres)' 
                        : rentalType === 'hourly' 
                        ? 'Work Duration (Hours)' 
                        : 'Number of Days'}
                    </label>

                    {/* Stepper */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1">
                      <button
                        type="button"
                        onClick={() => setQuantity(prev => Math.max(0.5, prev - (rentalType === 'daily' ? 1 : 0.5)))}
                        className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-700 shadow-xs active:scale-95"
                      >
                        <FiMinus size={14} />
                      </button>
                      <input
                        type="number"
                        step={rentalType === 'daily' ? '1' : '0.5'}
                        min="0.5"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                        className="w-16 text-center text-sm font-black bg-transparent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity(prev => prev + (rentalType === 'daily' ? 1 : 0.5))}
                        className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-700 shadow-xs active:scale-95"
                      >
                        <FiPlus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Quick Preset Chips */}
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                    {(rentalType === 'hourly' 
                      ? [1, 2, 3, 4, 6, 8] 
                      : rentalType === 'land_based' 
                      ? [1, 2, 3, 5, 10] 
                      : [1, 2, 3, 5, 7]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuantity(preset)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all ${
                          quantity === preset
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset} {rentalType === 'hourly' ? 'Hrs' : rentalType === 'land_based' ? 'Acres' : 'Days'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 5: Date & Time Slot */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-black text-xs">
                    5
                  </span>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Date & Time Slot
                  </h2>
                </div>

                {/* Quick Date Chips */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Select Date:
                  </p>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => setBookingDate(todayStr)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition-all ${
                        bookingDate === todayStr
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Today ({formatDateDisplay(todayStr)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingDate(tomorrowStr)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition-all ${
                        bookingDate === tomorrowStr
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Tomorrow ({formatDateDisplay(tomorrowStr)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingDate(dayAfterStr)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition-all ${
                        bookingDate === dayAfterStr
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Day After ({formatDateDisplay(dayAfterStr)})
                    </button>
                  </div>

                  {/* Native Date Picker */}
                  <input
                    type="date"
                    min={todayStr}
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full text-xs font-black p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Time Slot Presets */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Select Time Window:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Morning', start: '08:00', end: '11:00' },
                      { label: 'Midday', start: '11:00', end: '14:00' },
                      { label: 'Afternoon', start: '14:00', end: '17:00' },
                      { label: 'Evening', start: '17:00', end: '20:00' }
                    ].map((slot) => {
                      const isSelected = startTime === slot.start && endTime === slot.end;
                      return (
                        <button
                          key={slot.label}
                          type="button"
                          onClick={() => handleSelectSlotPreset(slot.start, slot.end)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20'
                              : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <p className={`text-xs font-black ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                            {slot.label}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                            {slot.start} - {slot.end}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Slot Inputs */}
                  <div className="pt-1 flex items-center gap-2">
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">Start Time</span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value);
                          setActiveSlotPreset('');
                        }}
                        className="w-full text-xs font-black p-2 rounded-xl bg-slate-50 border border-slate-200"
                      />
                    </div>
                    <span className="text-slate-400 pt-5">-</span>
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">End Time</span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => {
                          setEndTime(e.target.value);
                          setActiveSlotPreset('');
                        }}
                        className="w-full text-xs font-black p-2 rounded-xl bg-slate-50 border border-slate-200"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Guarantees Ribbon */}
              <div className="bg-blue-50/70 rounded-2xl p-3.5 border border-blue-100 flex items-center gap-3">
                <FiInfo className="text-blue-600 shrink-0" size={18} />
                <p className="text-[11px] font-semibold text-blue-900 leading-snug">
                  Only vendors with matching machinery, verified implements, and clear calendar slots within 60 km will be shown.
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        /* CATALOG VIEW: BROWSE ALL INVENTORY */
        <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
          <div className="relative">
            <FiSearch className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search tractors, harvesters, brands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-xs font-bold focus:outline-none focus:border-blue-500 shadow-xs"
            />
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <LogoLoader />
            </div>
          ) : filteredEquipment.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center space-y-3">
              <FiTruck size={36} className="text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No machinery matched your search.</p>
              <button
                onClick={() => setSearch('')}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                Clear Search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredEquipment.map((item) => (
                <div
                  key={item._id}
                  onClick={() => navigate(`/user/machinery/${item._id}`)}
                  className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="h-44 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                    {item.images?.[0] ? (
                      <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <FiTruck size={36} className="text-slate-300" />
                    )}
                    <span className="absolute top-3 left-3 px-2.5 py-1 bg-white/95 backdrop-blur-md rounded-full text-[9px] font-black uppercase text-blue-600 shadow-xs">
                      {item.categoryId?.title}
                    </span>
                    {item.horsepower && (
                      <span className="absolute top-3 right-3 px-2 py-1 bg-slate-900/80 backdrop-blur-md rounded-full text-[9px] font-black text-white">
                        {item.horsepower} HP
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 truncate">{item.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400">{item.modelNumber || 'Verified Farm Equipment'}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Rate</p>
                        <p className="text-sm font-black text-emerald-600">
                          {item.pricing?.hourly?.price ? `₹${item.pricing.hourly.price}/Hr` :
                           item.pricing?.land_based?.price ? `₹${item.pricing.land_based.price}/Acre` :
                           item.pricing?.daily?.price ? `₹${item.pricing.daily.price}/Day` : 'Rate On Request'}
                        </p>
                      </div>
                      <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <FiChevronRight size={16} />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FIXED STICKY BOTTOM BAR (Step 1 -> Step 2 CTA) */}
      {viewMode === 'book' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-3 shadow-lg">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Ready to find vendors:
              </p>
              <p className="text-xs font-black text-slate-900 truncate">
                {selectedCat?.title || 'Machinery'} {selectedImplement ? `+ ${selectedImplement.title}` : ''}
              </p>
              <p className="text-[10px] font-bold text-blue-600 truncate">
                {hpRange !== 'all' ? `${hpRange} HP • ` : ''}
                {quantity} {rentalType === 'hourly' ? 'Hrs' : rentalType === 'land_based' ? 'Acres' : 'Days'} • {formatDateDisplay(bookingDate)} • {startTime} - {endTime}
              </p>
            </div>

            <button
              onClick={handleProceedToVendors}
              className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-500/25 flex items-center gap-2 shrink-0 transition-all"
            >
              <span>Find Vendors</span>
              <FiChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MachineryExplorer;
