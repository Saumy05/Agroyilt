import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FiArrowLeft, FiStar, FiMapPin, FiTruck, 
  FiClock, FiCalendar, FiCheckCircle, FiChevronRight,
  FiEdit2, FiAlertCircle, FiRefreshCw, FiShield,
  FiZap, FiCheck, FiSliders
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import { useGeo } from '../../../../context/GeoContext';
import LogoLoader from '../../../../components/common/LogoLoader';
import { themeColors } from '../../../../theme';

const AvailableVendors = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentCity, selectedDistrict } = useGeo();

  // Retrieve search requirements from navigation state
  const searchParams = location.state || {};
  const {
    category,
    implement,
    hpRange = 'all',
    rentalType = 'hourly',
    quantity = 1,
    bookingDate = new Date().toISOString().split('T')[0],
    startTime = '09:00',
    endTime = '11:00',
    lat,
    lng
  } = searchParams;

  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [sortBy, setSortBy] = useState('nearest'); // 'nearest' | 'price_low' | 'rating'
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!category?._id && !category?.id) {
      // If user landed here directly without picking a category, redirect to explorer
      navigate('/user/machinery-explorer', { replace: true });
      return;
    }
    fetchVendors();
  }, [category, implement, hpRange, rentalType, quantity, bookingDate, startTime, endTime]);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      setError(null);

      const catId = category?._id || category?.id;
      let minHp = undefined;
      let maxHp = undefined;
      if (hpRange === '20-35') { minHp = 20; maxHp = 35; }
      else if (hpRange === '35-50') { minHp = 35; maxHp = 50; }
      else if (hpRange === '50-75') { minHp = 50; maxHp = 75; }
      else if (hpRange === '75+') { minHp = 75; }

      const res = await publicEquipmentService.getQualifiedVendors({
        categoryId: catId,
        implementId: implement?._id || implement?.id || undefined,
        minHp,
        maxHp,
        rental_type: rentalType,
        landSize: rentalType === 'land_based' ? quantity : undefined,
        durationHours: rentalType === 'hourly' ? quantity : undefined,
        estimatedDuration: rentalType === 'daily' ? quantity : undefined,
        date: bookingDate,
        timeSlot: `${startTime} - ${endTime}`,
        lat: lat || currentCity?.lat || selectedDistrict?.lat || undefined,
        lng: lng || currentCity?.lng || selectedDistrict?.lng || undefined,
        radius: 60
      });

      if (res.success && Array.isArray(res.data)) {
        setVendors(res.data);
      } else {
        setVendors([]);
      }
    } catch (err) {
      console.error('Failed to fetch qualified vendors:', err);
      setError('Could not load vendors for your area. Please try again.');
      setVendors([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEditRequirements = () => {
    navigate('/user/machinery-explorer', {
      state: {
        category,
        preSelectedImplement: implement,
        hpRange,
        rentalType,
        quantity,
        bookingDate,
        startTime,
        endTime
      }
    });
  };

  const handleSelectVendor = (item) => {
    navigate('/user/machinery/checkout', {
      state: {
        equipment: {
          _id: item.equipment._id,
          name: item.equipment.name,
          images: item.equipment.images || [],
          modelNumber: item.equipment.modelNumber || '',
          vendorId: item.vendor,
          categoryId: category || item.equipment.categoryId,
          pricing: {
            [rentalType]: {
              price: item.pricing.tractorUnitRate,
              isEnabled: true
            }
          }
        },
        bookingData: {
          rateType: rentalType,
          quantity: quantity,
          date: bookingDate,
          slot: `${startTime} - ${endTime}`,
          startTime,
          endTime,
          basePrice: item.pricing.basePrice,
          tax: item.pricing.tax,
          visitingCharges: item.pricing.visitingCharges,
          gstPercentage: item.pricing.gstPercentage || 5,
          total: item.pricing.totalAmount,
          tractorTotal: item.pricing.tractorTotal || item.pricing.basePrice,
          implementTotal: item.pricing.implementTotal || 0,
          tractorUnitRate: item.pricing.tractorUnitRate,
          implementUnitRate: item.pricing.implementUnitRate || 0,
          selectedImplements: item.matchedImplement ? [{
            subCategoryId: item.matchedImplement._id,
            title: item.matchedImplement.title,
            rate: item.pricing.implementUnitRate || 0,
            total: item.pricing.implementTotal || 0,
            pricing: {
              [rentalType]: {
                price: item.pricing.implementUnitRate,
                isEnabled: true
              }
            }
          }] : []
        }
      }
    });
  };

  // Sort logic
  const sortedVendors = [...vendors].sort((a, b) => {
    // Available vendors always come first
    if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;

    if (sortBy === 'price_low') {
      return (a.pricing?.totalAmount || 0) - (b.pricing?.totalAmount || 0);
    }
    if (sortBy === 'rating') {
      return (b.vendor?.rating || 0) - (a.vendor?.rating || 0);
    }
    // Default: nearest
    return (a.vendor?.distance || 0) - (b.vendor?.distance || 0);
  });

  const availableCount = vendors.filter(v => v.isAvailable).length;

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
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-slate-50 to-slate-50 pb-20 font-sans">
      <Helmet>
        <title>Available {category?.title || 'Machinery'} Vendors | Agroyilt</title>
      </Helmet>

      {/* Top Header */}
      <div className="bg-white/95 backdrop-blur-xl border-b border-emerald-900/10 sticky top-0 z-30 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-xl mx-auto px-3.5 py-2 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button 
              onClick={handleEditRequirements} 
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-center text-slate-700 active:scale-95 transition-all flex-shrink-0 border border-slate-200/60 cursor-pointer"
              aria-label="Back to Requirements"
            >
              <FiArrowLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-black text-slate-900 tracking-tight leading-tight truncate">
                Qualified Vendors
              </h1>
              <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 mt-0.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span>{availableCount} verified operators in cluster</span>
              </p>
            </div>
          </div>

          <button
            onClick={fetchVendors}
            disabled={loading}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 flex items-center justify-center transition-all border border-slate-200/60 shrink-0 cursor-pointer"
            title="Refresh availability"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin text-emerald-700' : ''} />
          </button>
        </div>

        {/* Polished 3-Step Flow Indicator (Step 2 Active) */}
        <div className="max-w-xl mx-auto px-3.5 pb-2 flex items-center justify-between">
          <button 
            onClick={handleEditRequirements}
            className="flex items-center gap-1 text-[11px] font-black text-emerald-700 hover:opacity-80 transition-opacity cursor-pointer shrink-0"
          >
            <span className="w-4.5 h-4.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[9px] font-black">✓</span>
            <span>Specs</span>
          </button>

          <div className="h-[2px] flex-1 mx-2.5 bg-emerald-600 rounded-full" />

          <div className="flex items-center gap-1 shrink-0">
            <span className="w-4.5 h-4.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black ring-2 ring-emerald-500/20 shadow-xs">
              2
            </span>
            <span className="text-[11px] font-black text-emerald-800">Vendors</span>
          </div>

          <div className="h-[2px] flex-1 mx-2.5 bg-slate-200 rounded-full" />

          <div className="flex items-center gap-1 text-slate-400 shrink-0">
            <span className="w-4.5 h-4.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center text-[9px] font-bold">
              3
            </span>
            <span className="text-[11px] font-bold">Checkout</span>
          </div>
        </div>

        {/* Requirements Summary Pill Banner */}
        <div className="bg-gradient-to-r from-emerald-50/70 to-teal-50/50 border-t border-emerald-900/5 px-3.5 py-1.5">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-white text-emerald-700 shadow-2xs border border-emerald-100 flex items-center justify-center shrink-0">
                <FiTruck size={13} />
              </span>
              <div className="truncate">
                <p className="text-[11px] font-black text-slate-900 truncate">
                  {category?.title} {implement ? `+ ${implement.title}` : ''}
                </p>
                <p className="text-[9.5px] font-bold text-slate-500">
                  {quantity} {rentalType === 'hourly' ? 'Hrs' : rentalType === 'land_based' ? 'Acres' : 'Days'} • {formatDateDisplay(bookingDate)} • {startTime} - {endTime}
                </p>
              </div>
            </div>

            <button
              onClick={handleEditRequirements}
              className="px-2.5 py-1 bg-white border border-slate-200/90 hover:border-emerald-500 text-emerald-800 rounded-lg text-[11px] font-black flex items-center gap-1 shrink-0 shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              <FiEdit2 size={10} />
              <span>Modify</span>
            </button>
          </div>
        </div>

        {/* Quick Sort Bar */}
        <div className="px-3.5 py-1.5 bg-white/95 border-t border-slate-100 overflow-x-auto no-scrollbar">
          <div className="max-w-xl mx-auto flex items-center gap-1.5 text-xs font-black">
            <span className="text-[9.5px] text-slate-400 uppercase tracking-wider shrink-0 mr-0.5">Sort:</span>
            <button
              onClick={() => setSortBy('nearest')}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-all shrink-0 cursor-pointer ${
                sortBy === 'nearest'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              📍 Nearest
            </button>
            <button
              onClick={() => setSortBy('price_low')}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-all shrink-0 cursor-pointer ${
                sortBy === 'price_low'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              💰 Low Price
            </button>
            <button
              onClick={() => setSortBy('rating')}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-all shrink-0 cursor-pointer ${
                sortBy === 'rating'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ⭐ Top Rated
            </button>
          </div>
        </div>
      </div>

      {/* Vendors Body */}
      <div className="max-w-xl mx-auto px-3.5 pt-2.5">
        {loading ? (
          <div className="py-20 text-center">
            <LogoLoader />
            <p className="text-xs font-black text-emerald-800 mt-3 tracking-wide animate-pulse">
              Finding qualified available vendors in your cluster...
            </p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center space-y-2.5 mt-2">
            <FiAlertCircle size={28} className="text-red-500 mx-auto" />
            <p className="text-xs font-black text-red-800">{error}</p>
            <button
              onClick={fetchVendors}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-xs active:scale-95 cursor-pointer"
            >
              Try Again
            </button>
          </div>
        ) : sortedVendors.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 text-center space-y-3 shadow-xs mt-2">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100">
              <FiTruck size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-900">No Machinery Free for This Window</h3>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                All qualified equipment in your 60 km cluster is currently booked or off-duty during {startTime} - {endTime} on {formatDateDisplay(bookingDate)}.
              </p>
            </div>
            <div className="pt-1 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={handleEditRequirements}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                Change Time or Date
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sortedVendors.map((item, idx) => (
              <motion.div
                key={item.equipment._id + '-' + item.vendor._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
                className={`bg-white rounded-2xl p-3.5 border transition-all ${
                  item.isAvailable 
                    ? 'border-slate-200/90 shadow-xs hover:border-emerald-400 hover:shadow-md' 
                    : 'border-slate-200 bg-slate-50/70 opacity-70'
                }`}
              >
                {/* Vendor Header */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 font-black text-sm flex items-center justify-center shrink-0 border border-emerald-100/80 overflow-hidden shadow-2xs">
                      {item.vendor.avatar ? (
                        <img src={item.vendor.avatar} alt={item.vendor.name} className="w-full h-full object-cover" />
                      ) : (
                        item.vendor.name?.charAt(0) || 'V'
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-black text-xs text-slate-900 leading-tight truncate">
                          {item.vendor.businessName || item.vendor.name}
                        </h3>
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[8px] shrink-0" title="Verified Partner">
                          ✓
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500 font-semibold whitespace-nowrap">
                        <span className="flex items-center gap-0.5 text-amber-600 font-black shrink-0">
                          <FiStar size={10} className="fill-amber-400 text-amber-400" />
                          {item.vendor.rating ? item.vendor.rating.toFixed(1) : '4.8'}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 text-slate-500 truncate">
                          <FiMapPin size={10} className="text-emerald-600 shrink-0" />
                          <span>{item.vendor.distance ? `${item.vendor.distance} km away` : 'Nearby'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {item.isAvailable ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border border-emerald-200/80 shrink-0 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Free Slot
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-full text-[9px] font-black uppercase tracking-wider border border-rose-100 shrink-0 whitespace-nowrap">
                      Slot Busy
                    </span>
                  )}
                </div>

                {/* Equipment Snapshot Card */}
                <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-100 flex gap-2.5 mb-2.5">
                  <div className="w-14 h-14 rounded-lg bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200/60">
                    {item.equipment.images?.[0] ? (
                      <img 
                        src={item.equipment.images[0]} 
                        alt={item.equipment.name} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <FiTruck className="text-slate-400" size={20} />
                    )}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-black text-xs text-slate-900 truncate">
                      {item.equipment.name}
                    </p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {item.equipment.horsepower > 0 && (
                        <span className="text-[8.5px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                          {item.equipment.horsepower} HP
                        </span>
                      )}
                      {item.equipment.modelNumber && (
                        <span className="text-[8.5px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200/70">
                          {item.equipment.modelNumber}
                        </span>
                      )}
                      {item.equipment.includesDriver && (
                        <span className="text-[8.5px] font-bold text-emerald-800 bg-white px-1.5 py-0.5 rounded border border-emerald-200/70">
                          Driver Incl.
                        </span>
                      )}
                      <span className="text-[8.5px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200/70 flex items-center gap-0.5">
                        <FiShield size={9} className="text-emerald-600" /> Verified
                      </span>
                    </div>

                    {item.matchedImplement && (
                      <p className="text-[9.5px] font-bold text-emerald-800 flex items-center gap-1 pt-0.5">
                        <FiCheckCircle size={11} className="text-emerald-600 shrink-0" />
                        <span className="truncate">{item.matchedImplement.title} attached</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Price Breakdown & CTA */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                      Total Payable
                    </p>
                    <p className="text-lg font-black text-slate-900 leading-tight">
                      ₹{item.pricing?.totalAmount?.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[9.5px] text-slate-400 font-semibold leading-tight">
                      Base ₹{item.pricing?.basePrice} + GST ₹{item.pricing?.tax} (Visiting Free)
                    </p>
                  </div>

                  <button
                    disabled={!item.isAvailable}
                    onClick={() => handleSelectVendor(item)}
                    className={`px-3.5 py-2 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1 shadow-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      item.isAvailable
                        ? 'bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 text-white shadow-emerald-700/20 active:scale-95'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span>Book Vendor</span>
                    <FiChevronRight size={14} className="shrink-0" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AvailableVendors;
