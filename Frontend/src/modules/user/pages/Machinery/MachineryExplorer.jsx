import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FiSearch, FiMapPin, FiTruck, FiClock, 
  FiChevronRight, FiArrowLeft, FiCalendar, 
  FiCheckCircle, FiZap, FiPlus, FiMinus, 
  FiInfo, FiShield, FiSliders, FiSun, 
  FiSunrise, FiSunset, FiMoon, FiCheck, FiTool
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
                  Machinery Rental
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
        /* STEP 1: JOB SETUP & SPECIFICATIONS FORM */
        <div className="max-w-xl mx-auto px-3.5 py-3 space-y-2.5">
          {loading ? (
            <div className="py-24 text-center">
              <LogoLoader />
              <p className="text-xs font-black text-emerald-800 mt-4 tracking-wide animate-pulse">
                Configuring machinery specifications...
              </p>
            </div>
          ) : (
            <>
              {/* SECTION 1: Select Machinery Category */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-[11px] border border-emerald-200/60">
                      1
                    </span>
                    <div>
                      <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Machinery Category
                      </h2>
                      <p className="text-[10px] font-semibold text-slate-400">
                        Select the primary machine needed for your field
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => navigate('/user/machinery-categories')}
                    className="text-[11px] font-black text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/70 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                  >
                    View All
                  </button>
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
              </div>

              {/* SECTION 2: Select Attachment / Implement (Tractor Hitch) */}
              {equipmentImplements.length > 0 && (
                <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-[11px] border border-emerald-200/60">
                        2
                      </span>
                      <div>
                        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Tool Attachment / Implement
                        </h2>
                        <p className="text-[10px] font-semibold text-slate-400">
                          Hook a rotary, cultivator, or plough to the machine
                        </p>
                      </div>
                    </div>
                    {selectedCat && (
                      <button 
                        onClick={() => navigate('/user/machinery-implements', { state: { category: selectedCat } })}
                        className="text-[11px] font-black text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/70 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                      >
                        All Tools
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedImplement(null)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                        !selectedImplement
                          ? 'bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow-xs'
                          : 'bg-slate-50 text-slate-700 border border-slate-200/80 hover:bg-slate-100'
                      }`}
                    >
                      <span>✓ Bare Machine</span>
                    </button>

                    {equipmentImplements.map((imp) => {
                      const isSelected = (selectedImplement?.id || selectedImplement?._id) === (imp.id || imp._id);
                      return (
                        <button
                          key={imp.id || imp._id}
                          type="button"
                          onClick={() => setSelectedImplement(imp)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow-xs ring-2 ring-emerald-500/20'
                              : 'bg-slate-50 text-slate-700 border border-slate-200/80 hover:bg-slate-100'
                          }`}
                        >
                          <FiTool size={11} className={isSelected ? 'text-amber-300' : 'text-slate-400'} />
                          <span>{imp.title}</span>
                          {isSelected && <FiCheckCircle size={12} className="text-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION 3: Horsepower Range */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-black text-[11px] border border-amber-200/60">
                    3
                  </span>
                  <div>
                    <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Engine Horsepower (HP)
                    </h2>
                    <p className="text-[10px] font-semibold text-slate-400">
                      Match horsepower to soil compactness and implement size
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5">
                  {[
                    { label: 'All HP', value: 'all', desc: 'Any verified machine', tag: 'Fastest' },
                    { label: '20 - 35 HP', value: '20-35', desc: 'Mini / Orchard', tag: 'Light Soil' },
                    { label: '35 - 50 HP', value: '35-50', desc: 'Standard Rotavator', tag: 'Popular' },
                    { label: '50 - 75 HP', value: '50-75', desc: 'Heavy Deep Plough', tag: 'Hard Soil' },
                    { label: '75+ HP', value: '75+', desc: 'Commercial Harvester', tag: 'Large Fields' }
                  ].map((h) => {
                    const isSelected = hpRange === h.value;
                    return (
                      <button
                        key={h.value}
                        type="button"
                        onClick={() => setHpRange(h.value)}
                        className={`p-2.5 rounded-xl border text-left transition-all relative cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-emerald-500/30'
                            : 'bg-slate-50/60 border-slate-200/80 hover:border-slate-300 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                            {h.label}
                          </p>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                            isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-200/70 text-slate-600'
                          }`}>
                            {h.tag}
                          </span>
                        </div>
                        <p className={`text-[9.5px] font-medium mt-0.5 leading-tight ${
                          isSelected ? 'text-slate-300' : 'text-slate-400'
                        }`}>
                          {h.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 4: Rental Type & Scope */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-[11px] border border-emerald-200/60">
                    4
                  </span>
                  <div>
                    <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Rental Type & Work Scope
                    </h2>
                    <p className="text-[10px] font-semibold text-slate-400">
                      Choose how billing will be measured
                    </p>
                  </div>
                </div>

                {/* Rental Type Segmented Tabs */}
                <div className="grid grid-cols-3 gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/60">
                  {[
                    { label: '⏱️ Hourly', value: 'hourly' },
                    { label: '🌾 Land Size', value: 'land_based' },
                    { label: '📅 Daily', value: 'daily' }
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setRentalType(t.value)}
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
                          : rentalType === 'hourly' 
                          ? 'Work Duration (Hours)' 
                          : 'Number of Days'}
                      </label>
                      <span className="text-[9.5px] font-semibold text-slate-400">
                        {rentalType === 'land_based' ? 'Standard 1 Acre = 43,560 sq ft' : 'Metered by tractor hour meter'}
                      </span>
                    </div>

                    {/* Stepper Controls */}
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl p-0.5 shadow-inner">
                      <button
                        type="button"
                        onClick={() => setQuantity(prev => Math.max(0.5, prev - (rentalType === 'daily' ? 1 : 0.5)))}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200/70 flex items-center justify-center font-black text-slate-800 shadow-2xs hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
                        aria-label="Decrease"
                      >
                        <FiMinus size={13} />
                      </button>
                      <input
                        type="number"
                        step={rentalType === 'daily' ? '1' : '0.5'}
                        min="0.5"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                        className="w-14 text-center text-xs font-black text-slate-900 bg-transparent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity(prev => prev + (rentalType === 'daily' ? 1 : 0.5))}
                        className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center font-black shadow-2xs active:scale-95 transition-all cursor-pointer"
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
                          quantity === preset
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                        }`}
                      >
                        {preset} {rentalType === 'hourly' ? 'Hrs' : rentalType === 'land_based' ? 'Acres' : 'Days'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 5: Date & Time Window */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-[11px] border border-emerald-200/60">
                    5
                  </span>
                  <div>
                    <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Work Date & Time Window
                    </h2>
                    <p className="text-[10px] font-semibold text-slate-400">
                      Reserve the vendor's machine calendar slot
                    </p>
                  </div>
                </div>

                {/* Quick Date Chips */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => setBookingDate(todayStr)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 transition-all cursor-pointer ${
                        bookingDate === todayStr
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-50 text-slate-700 border border-slate-200/80 hover:bg-slate-100'
                      }`}
                    >
                      Today ({formatDateDisplay(todayStr)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingDate(tomorrowStr)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 transition-all cursor-pointer ${
                        bookingDate === tomorrowStr
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-50 text-slate-700 border border-slate-200/80 hover:bg-slate-100'
                      }`}
                    >
                      Tomorrow ({formatDateDisplay(tomorrowStr)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingDate(dayAfterStr)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 transition-all cursor-pointer ${
                        bookingDate === dayAfterStr
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-50 text-slate-700 border border-slate-200/80 hover:bg-slate-100'
                      }`}
                    >
                      Day After ({formatDateDisplay(dayAfterStr)})
                    </button>
                  </div>

                  {/* Native Date Picker */}
                  <div className="relative">
                    <input
                      type="date"
                      min={todayStr}
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="w-full text-xs font-bold p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 focus:outline-none focus:border-emerald-500 focus:bg-white text-slate-900 transition-colors"
                    />
                  </div>
                </div>

                {/* Ambient Time Slots */}
                <div className="space-y-2 pt-1.5 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Select Operating Shift:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Morning Shift', start: '08:00', end: '11:00', icon: FiSunrise, tag: 'Sowing' },
                      { label: 'Midday Shift', start: '11:00', end: '14:00', icon: FiSun, tag: 'Dry Land' },
                      { label: 'Afternoon Shift', start: '14:00', end: '17:00', icon: FiSunset, tag: 'Tillage' },
                      { label: 'Evening Shift', start: '17:00', end: '20:00', icon: FiMoon, tag: 'Cool Temp' }
                    ].map((slot) => {
                      const isSelected = startTime === slot.start && endTime === slot.end;
                      const IconComp = slot.icon;
                      return (
                        <button
                          key={slot.label}
                          type="button"
                          onClick={() => handleSelectSlotPreset(slot.start, slot.end)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                              : 'bg-slate-50/60 border-slate-200/80 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                              <IconComp size={13} className={isSelected ? 'text-emerald-700' : 'text-slate-400'} />
                              <span>{slot.label}</span>
                            </span>
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                              isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200/60 text-slate-500'
                            }`}>
                              {slot.tag}
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                            {slot.start} - {slot.end}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Slot Adjustment */}
                  <div className="pt-1.5 flex items-center gap-2">
                    <div className="flex-1">
                      <span className="text-[9.5px] font-bold text-slate-400 block mb-0.5">Custom Start</span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value);
                          setActiveSlotPreset('');
                        }}
                        className="w-full text-xs font-black p-2 rounded-lg bg-slate-50 border border-slate-200/80 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <span className="text-slate-400 pt-4 font-bold">-</span>
                    <div className="flex-1">
                      <span className="text-[9.5px] font-bold text-slate-400 block mb-0.5">Custom End</span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => {
                          setEndTime(e.target.value);
                          setActiveSlotPreset('');
                        }}
                        className="w-full text-xs font-black p-2 rounded-lg bg-slate-50 border border-slate-200/80 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Guarantees Ribbon */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50/60 rounded-xl p-3 border border-emerald-200/60 flex items-start gap-2.5">
                <FiShield className="text-emerald-700 shrink-0 mt-0.5" size={17} />
                <div className="space-y-0.5">
                  <p className="text-xs font-black text-emerald-950">Agroyilt Dispatch Guarantee</p>
                  <p className="text-[10px] font-semibold text-emerald-800/80 leading-relaxed">
                    Only verified machinery owners with matching horsepower, tested attachments, and 100% active calendar availability in your 60km cluster will be shown.
                  </p>
                </div>
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
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-slate-200/80 px-3.5 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                Ready to find vendors:
              </p>
              <p className="text-xs font-black text-slate-900 truncate">
                {selectedCat?.title || 'Machinery'} {selectedImplement ? `+ ${selectedImplement.title}` : ''}
              </p>
              <p className="text-[9.5px] font-bold text-emerald-700 truncate">
                {hpRange !== 'all' ? `${hpRange} HP • ` : ''}
                {quantity} {rentalType === 'hourly' ? 'Hrs' : rentalType === 'land_based' ? 'Acres' : 'Days'} • {formatDateDisplay(bookingDate)} • {startTime} - {endTime}
              </p>
            </div>

            <button
              onClick={handleProceedToVendors}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-700/25 flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
            >
              <span>Find Vendors</span>
              <FiChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MachineryExplorer;
