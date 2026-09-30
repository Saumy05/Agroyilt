import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FiArrowLeft, FiStar, FiMapPin, FiTruck, 
  FiClock, FiCalendar, FiCheckCircle, FiChevronRight,
  FiFilter, FiSliders, FiEdit2, FiAlertCircle, FiRefreshCw
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
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <Helmet>
        <title>Available {category?.title || 'Machinery'} Vendors | Agroyilt</title>
      </Helmet>

      {/* Top Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-xs">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleEditRequirements} 
              className="p-2 -ml-1 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors active:scale-95"
              aria-label="Back to Requirements"
            >
              <FiArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-base font-black text-slate-900 leading-tight">
                Available Vendors
              </h1>
              <p className="text-[11px] font-semibold text-slate-400">
                {availableCount} {availableCount === 1 ? 'vendor' : 'vendors'} ready for your slot
              </p>
            </div>
          </div>

          <button
            onClick={fetchVendors}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            title="Refresh availability"
          >
            <FiRefreshCw size={17} className={loading ? 'animate-spin text-blue-600' : ''} />
          </button>
        </div>

        {/* Multi-Step Flow Indicator (Step 2 Active) */}
        <div className="max-w-xl mx-auto px-4 pb-2.5 flex items-center justify-between">
          <button 
            onClick={handleEditRequirements}
            className="flex items-center gap-1.5 text-xs font-black text-emerald-600 hover:opacity-80 transition-opacity"
          >
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px]">✓</span>
            <span>Requirements</span>
          </button>
          <div className="h-[2px] flex-1 mx-2.5 bg-blue-500"></div>
          <div className="flex items-center gap-1.5 text-xs font-black text-blue-600">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
            <span>Select Vendor</span>
          </div>
          <div className="h-[2px] flex-1 mx-2.5 bg-slate-200"></div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px]">3</span>
            <span>Checkout</span>
          </div>
        </div>

        {/* Requirements Summary Pill Banner */}
        <div className="bg-slate-50 border-t border-slate-100 px-4 py-2.5">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <FiTruck size={14} />
              </span>
              <div className="truncate">
                <p className="text-xs font-black text-slate-800 truncate">
                  {category?.title} {implement ? `+ ${implement.title}` : ''}
                </p>
                <p className="text-[10px] font-bold text-slate-400">
                  {quantity} {rentalType === 'hourly' ? 'Hrs' : rentalType === 'land_based' ? 'Acres' : 'Days'} • {formatDateDisplay(bookingDate)} • {startTime} - {endTime}
                </p>
              </div>
            </div>

            <button
              onClick={handleEditRequirements}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-400 text-blue-600 rounded-lg text-xs font-black flex items-center gap-1 shrink-0 shadow-xs transition-all active:scale-95"
            >
              <FiEdit2 size={11} />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {/* Quick Sort Bar */}
        <div className="px-4 py-2 bg-white border-t border-slate-100 overflow-x-auto no-scrollbar">
          <div className="max-w-xl mx-auto flex items-center gap-2 text-xs font-black">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider shrink-0 mr-1">Sort:</span>
            <button
              onClick={() => setSortBy('nearest')}
              className={`px-3 py-1.5 rounded-full transition-all shrink-0 ${
                sortBy === 'nearest'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              📍 Nearest
            </button>
            <button
              onClick={() => setSortBy('price_low')}
              className={`px-3 py-1.5 rounded-full transition-all shrink-0 ${
                sortBy === 'price_low'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              💰 Lowest Price
            </button>
            <button
              onClick={() => setSortBy('rating')}
              className={`px-3 py-1.5 rounded-full transition-all shrink-0 ${
                sortBy === 'rating'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ⭐ Top Rated
            </button>
          </div>
        </div>
      </div>

      {/* Vendors Body */}
      <div className="max-w-xl mx-auto px-4 pt-4">
        {loading ? (
          <div className="py-24 text-center">
            <LogoLoader />
            <p className="text-xs font-bold text-slate-400 mt-4 animate-pulse">
              Finding qualified available vendors near you...
            </p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center space-y-3 mt-4">
            <FiAlertCircle size={32} className="text-red-500 mx-auto" />
            <p className="text-sm font-black text-red-800">{error}</p>
            <button
              onClick={fetchVendors}
              className="px-5 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm active:scale-95"
            >
              Try Again
            </button>
          </div>
        ) : sortedVendors.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-sm mt-4">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto">
              <FiTruck size={30} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-800">No Vendors Free for This Slot</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                All qualified equipment in your radius is either booked or not operating during {startTime} - {endTime} on {formatDateDisplay(bookingDate)}.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
              <button
                onClick={handleEditRequirements}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all active:scale-95"
              >
                Change Time or Date
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedVendors.map((item, idx) => (
              <motion.div
                key={item.equipment._id + '-' + item.vendor._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                className={`bg-white rounded-3xl p-5 border transition-all ${
                  item.isAvailable 
                    ? 'border-slate-200/90 shadow-sm hover:border-blue-300 hover:shadow-md' 
                    : 'border-slate-200 bg-slate-50/70 opacity-70'
                }`}
              >
                {/* Vendor Header */}
                <div className="flex items-start justify-between gap-3 mb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 font-black text-sm flex items-center justify-center shrink-0 border border-blue-100 overflow-hidden">
                      {item.vendor.avatar ? (
                        <img src={item.vendor.avatar} alt={item.vendor.name} className="w-full h-full object-cover" />
                      ) : (
                        item.vendor.name?.charAt(0) || 'V'
                      )}
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-slate-900 leading-tight">
                        {item.vendor.businessName || item.vendor.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-semibold">
                        <span className="flex items-center gap-0.5 text-amber-600 font-black">
                          <FiStar size={12} className="fill-amber-400 text-amber-400" />
                          {item.vendor.rating ? item.vendor.rating.toFixed(1) : '4.8'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5 text-slate-500">
                          <FiMapPin size={11} className="text-slate-400" />
                          {item.vendor.distance ? `${item.vendor.distance} km` : 'Nearby'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {item.isAvailable ? (
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border border-emerald-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Free
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-rose-100">
                      Slot Busy
                    </span>
                  )}
                </div>

                {/* Equipment Snapshot Card */}
                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 flex gap-3.5 mb-4">
                  <div className="w-18 h-18 rounded-xl bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                    {item.equipment.images?.[0] ? (
                      <img 
                        src={item.equipment.images[0]} 
                        alt={item.equipment.name} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <FiTruck className="text-slate-400" size={24} />
                    )}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-black text-xs text-slate-900 truncate">
                      {item.equipment.name}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.equipment.horsepower > 0 && (
                        <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          {item.equipment.horsepower} HP
                        </span>
                      )}
                      {item.equipment.modelNumber && (
                        <span className="text-[9px] font-bold text-slate-400">
                          {item.equipment.modelNumber}
                        </span>
                      )}
                      {item.equipment.includesDriver && (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Driver Included
                        </span>
                      )}
                    </div>

                    {item.matchedImplement && (
                      <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 pt-0.5">
                        <FiCheckCircle size={11} className="shrink-0" />
                        <span className="truncate">{item.matchedImplement.title} attached</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Price Breakdown & CTA */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      Total Payable
                    </p>
                    <p className="text-xl font-black text-slate-900 leading-tight">
                      ₹{item.pricing?.totalAmount?.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      Base ₹{item.pricing?.basePrice} + GST ₹{item.pricing?.tax} + Fee ₹{item.pricing?.visitingCharges}
                    </p>
                  </div>

                  <button
                    disabled={!item.isAvailable}
                    onClick={() => handleSelectVendor(item)}
                    className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all ${
                      item.isAvailable
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25 active:scale-95'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span>Book Vendor</span>
                    <FiChevronRight size={14} />
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
