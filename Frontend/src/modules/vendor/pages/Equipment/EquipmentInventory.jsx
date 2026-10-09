import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiPlus, FiChevronLeft, FiChevronRight, FiEdit2, FiTrash2, 
  FiSearch, FiX, FiTool, FiCheck, FiClock, FiCalendar, 
  FiMapPin, FiAlertCircle
} from 'react-icons/fi';
import { FaTractor } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toastManager } from '../../../../utils/toastManager';
import vendorEquipmentService from '../../../../services/vendorEquipmentService';
import { vendorTheme as themeColors } from '../../../../theme';

// Safely format asset and Cloudinary URLs
const toAssetUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http')) return url;
  const clean = url.replace('/api/upload', '/upload');
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

// Format Indian Rupee currency with commas
const formatRupee = (val) => {
  const num = Number(val);
  if (isNaN(num) || num <= 0) return '₹0';
  return '₹' + num.toLocaleString('en-IN');
};

// Clean bilingual title into English primary and optional native script
const parseBilingualTitle = (rawTitle) => {
  if (!rawTitle) return { primary: 'Machinery', native: '' };
  const str = String(rawTitle).trim();
  const match = str.match(/^([^(]+)(?:\((.*)\))?/);
  if (!match) return { primary: str, native: '' };
  return {
    primary: match[1].trim(),
    native: match[2]?.trim() || ''
  };
};

const EquipmentInventory = () => {
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalItem, setDeleteModalItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Maintain consistent app theme background gradient
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient;

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    try {
      setLoading(true);
      const res = await vendorEquipmentService.getMyEquipment();
      if (res.success && Array.isArray(res.data)) {
        setEquipment(res.data);
      } else {
        setEquipment([]);
      }
    } catch (err) {
      toastManager.error('Failed to load your equipment');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalItem?._id) return;
    try {
      setIsDeleting(true);
      const res = await vendorEquipmentService.delete(deleteModalItem._id);
      if (res.success) {
        toastManager.success(`"${deleteModalItem.name}" removed from fleet`);
        setEquipment(prev => prev.filter(e => e._id !== deleteModalItem._id));
        setDeleteModalItem(null);
      } else {
        toastManager.error(res.message || 'Delete failed');
      }
    } catch (err) {
      toastManager.error('Failed to delete machine');
    } finally {
      setIsDeleting(false);
    }
  };

  // Fleet Statistics
  const stats = useMemo(() => {
    const total = equipment.length;
    const active = equipment.filter(e => ['approved', 'active'].includes(e.status?.toLowerCase())).length;
    const rentals = equipment.filter(e => e.listingType === 'rental').length;
    const services = equipment.filter(e => e.listingType !== 'rental').length;
    return { total, active, rentals, services };
  }, [equipment]);

  // Unique category names for quick filters
  const categoriesList = useMemo(() => {
    const set = new Set();
    equipment.forEach(item => {
      const cat = item.categoryId?.title || item.requestedCategoryName;
      if (cat) {
        set.add(parseBilingualTitle(cat).primary);
      }
    });
    return Array.from(set);
  }, [equipment]);

  // Filtered Equipment List
  const filteredEquipment = useMemo(() => {
    return equipment.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const cat = parseBilingualTitle(item.categoryId?.title || item.requestedCategoryName).primary;

      if (q) {
        const name = (item.name || '').toLowerCase();
        const model = (item.modelNumber || '').toLowerCase();
        const catStr = (cat || '').toLowerCase();
        const match = name.includes(q) || model.includes(q) || catStr.includes(q);
        if (!match) return false;
      }

      if (selectedFilter === 'all') return true;
      if (selectedFilter === 'rental') return item.listingType === 'rental';
      if (selectedFilter === 'service') return item.listingType !== 'rental';
      if (selectedFilter === 'active') return ['approved', 'active'].includes(item.status?.toLowerCase());
      if (selectedFilter === cat) return true;

      return true;
    });
  }, [equipment, searchQuery, selectedFilter]);

  const StatusBadge = ({ status }) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live & Bookable</span>
        </span>
      );
    }
    if (s === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>In Verification</span>
        </span>
      );
    }
    if (s === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          <span>Action Required</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-500 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        <span>Paused</span>
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-32" style={{ background: themeColors.backgroundGradient }}>
        {/* Header Skeleton */}
        <div className="sticky top-0 z-30 backdrop-blur-xl border-b border-emerald-900/10 bg-white/80">
          <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-200/60 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-5 w-32 bg-slate-200/70 rounded-md animate-pulse" />
                <div className="h-2.5 w-24 bg-slate-200/50 rounded-md animate-pulse" />
              </div>
            </div>
            <div className="w-20 h-9 rounded-full bg-slate-200/70 animate-pulse" />
          </div>
        </div>

        {/* List Skeleton */}
        <div className="max-w-xl mx-auto px-4 pt-4 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-3xl border border-slate-100 p-4 shadow-sm animate-pulse space-y-4">
              <div className="flex gap-3.5">
                <div className="w-22 h-22 rounded-2xl bg-slate-200/70 shrink-0" />
                <div className="flex-1 space-y-2.5 py-1">
                  <div className="flex justify-between">
                    <div className="h-4 w-20 bg-slate-200 rounded-full" />
                    <div className="h-6 w-14 bg-slate-100 rounded-full" />
                  </div>
                  <div className="h-5 w-36 bg-slate-200 rounded-md" />
                  <div className="h-4 w-28 bg-slate-100 rounded-full" />
                </div>
              </div>
              <div className="h-10 bg-slate-100/70 rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: themeColors.backgroundGradient }}>
      {/* Sticky Native Header */}
      <header 
        className="sticky top-0 z-30 w-full backdrop-blur-xl shadow-[0_2px_12px_rgba(46,125,50,0.04)]"
        style={{
          background: 'linear-gradient(180deg, #F1F8E9 0%, rgba(255, 255, 255, 0.95) 100%)',
          borderBottom: '1px solid rgba(165, 214, 167, 0.4)',
        }}
      >
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Back button & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={() => navigate('/vendor/dashboard')}
              aria-label="Back to Dashboard"
              className="w-10 h-10 rounded-full bg-white hover:bg-emerald-50/60 border border-emerald-200/70 flex items-center justify-center text-emerald-900 active:scale-95 transition-all shadow-[0_2px_8px_rgba(46,125,50,0.06)] shrink-0 cursor-pointer"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none truncate">
                  My Machinery
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100/90 text-emerald-800 text-[11px] font-black border border-emerald-200/60 shrink-0">
                  {equipment.length}
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">
                Rentable Fleet Inventory
              </p>
            </div>
          </div>

          {/* Add Machine Button */}
          <button 
            onClick={() => navigate('/vendor/equipment/add')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm text-white shadow-md active:scale-95 transition-all shrink-0 cursor-pointer"
            style={{ 
              background: themeColors.button,
              boxShadow: '0 4px 12px rgba(46, 125, 50, 0.28)'
            }}
          >
            <FiPlus className="w-4 h-4 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto px-4 pt-3.5 space-y-3.5">
        {/* Search & Filter Bar */}
        {equipment.length > 0 && (
          <div className="space-y-2.5">
            {/* Search Input */}
            <div className="relative">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-700/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search machine name, model, category..."
                className="w-full pl-10 pr-9 py-2.5 bg-white border border-emerald-100/90 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                >
                  <FiX className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <button
                onClick={() => setSelectedFilter('all')}
                className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                  selectedFilter === 'all'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-white hover:bg-emerald-50/50 text-slate-600 border border-emerald-100/70 shadow-2xs'
                }`}
              >
                All ({equipment.length})
              </button>

              {stats.rentals > 0 && (
                <button
                  onClick={() => setSelectedFilter('rental')}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                    selectedFilter === 'rental'
                      ? 'bg-emerald-800 text-white shadow-xs'
                      : 'bg-white hover:bg-emerald-50/50 text-slate-600 border border-emerald-100/70 shadow-2xs'
                  }`}
                >
                  Tool Rentals ({stats.rentals})
                </button>
              )}

              {stats.services > 0 && (
                <button
                  onClick={() => setSelectedFilter('service')}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                    selectedFilter === 'service'
                      ? 'bg-emerald-800 text-white shadow-xs'
                      : 'bg-white hover:bg-emerald-50/50 text-slate-600 border border-emerald-100/70 shadow-2xs'
                  }`}
                >
                  Services ({stats.services})
                </button>
              )}

              {categoriesList.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedFilter(cat)}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                    selectedFilter === cat
                      ? 'bg-emerald-800 text-white shadow-xs'
                      : 'bg-white hover:bg-emerald-50/50 text-slate-600 border border-emerald-100/70 shadow-2xs'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Equipment Cards List */}
        {equipment.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-emerald-200/80 rounded-3xl p-10 text-center my-6 shadow-xs">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
              <FaTractor className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-slate-900">No machinery added yet</h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-sm mx-auto mt-1 mb-6 leading-relaxed">
              List your tractors, rotavators, sprayers, pumps, or harvesters to start receiving rental bookings from local farmers.
            </p>
            <button 
              onClick={() => navigate('/vendor/equipment/add')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-xs sm:text-sm text-white shadow-md active:scale-95 transition-all cursor-pointer"
              style={{ background: themeColors.button }}
            >
              <FiPlus className="w-4 h-4" />
              <span>Add First Machine</span>
            </button>
          </div>
        ) : filteredEquipment.length === 0 ? (
          <div className="bg-white rounded-3xl border border-emerald-100/80 p-8 text-center my-6 space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <FiSearch className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-800">No matching machinery</h3>
            <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">
              No equipment found matching "{searchQuery}". Try a different keyword or reset filters.
            </p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedFilter('all'); }}
              className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            <AnimatePresence mode="popLayout">
              {filteredEquipment.map(item => {
                const category = parseBilingualTitle(item.categoryId?.title || item.requestedCategoryName);
                const hasHourly = item.pricing?.hourly?.isEnabled && Number(item.pricing?.hourly?.price) > 0;
                const hasAcre = item.pricing?.land_based?.isEnabled && Number(item.pricing?.land_based?.price) > 0;
                const hasDaily = (item.pricing?.daily?.isEnabled && Number(item.pricing?.daily?.price) > 0) ||
                                (item.pricing?.monthly?.isEnabled && Number(item.pricing?.monthly?.price) > 0);

                return (
                  <motion.div 
                    key={item._id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_rgba(46,125,50,0.06)] hover:border-emerald-200/50 transition-all overflow-hidden group"
                  >
                    {/* Top Row: Thumbnail + Details + Actions */}
                    <div className="p-4 sm:p-5 flex gap-3.5 sm:gap-4 items-start">
                      {/* Machine Thumbnail */}
                      <div className="relative w-22 h-22 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-emerald-50/40 border border-slate-150 shrink-0 group/media">
                        {item.images && item.images[0] ? (
                          <img 
                            src={toAssetUrl(item.images[0])} 
                            alt={item.name} 
                            className="w-full h-full object-cover group-hover/media:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              if (e.currentTarget.nextSibling) {
                                e.currentTarget.nextSibling.style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div 
                          className="w-full h-full flex flex-col items-center justify-center text-emerald-300 bg-emerald-50/60"
                          style={{ display: item.images && item.images[0] ? 'none' : 'flex' }}
                        >
                          <FaTractor className="w-8 h-8 text-emerald-400/60" />
                        </div>

                        {/* Mode badge on top of image */}
                        <span className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider backdrop-blur-md shadow-2xs ${
                          item.listingType === 'rental'
                            ? 'bg-amber-600/90 text-white'
                            : 'bg-emerald-700/90 text-white'
                        }`}>
                          {item.listingType === 'rental' ? 'Rental' : 'Service'}
                        </span>

                        {/* Image count pill */}
                        {item.images?.length > 1 && (
                          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[8px] font-bold text-white shadow-xs">
                            📷 {item.images.length}
                          </span>
                        )}
                      </div>

                      {/* Main Info Block */}
                      <div className="flex-1 min-w-0">
                        {/* Header Row: Category Badge & Quick Actions */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase tracking-wider border border-emerald-200/60">
                              {category.primary}
                            </span>
                            {(item.horsepower || item.hp) && (
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                {item.horsepower || item.hp} HP
                              </span>
                            )}
                          </div>

                          {/* Quick Action Icons */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button 
                              onClick={() => navigate(`/vendor/equipment/edit/${item._id}`)}
                              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 flex items-center justify-center transition-colors border border-slate-200/70 shadow-2xs active:scale-95 cursor-pointer"
                              title="Edit machine specs & pricing"
                            >
                              <FiEdit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => setDeleteModalItem(item)}
                              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors border border-slate-200/70 shadow-2xs active:scale-95 cursor-pointer"
                              title="Remove machine from inventory"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Machine Name */}
                        <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug break-words">
                          {item.name}
                        </h3>

                        {/* Model Number if present */}
                        {item.modelNumber && (
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Model: <span className="font-bold text-slate-700">{item.modelNumber}</span>
                          </p>
                        )}

                        {/* Status Badge */}
                        <div className="mt-1.5">
                          <StatusBadge status={item.status} />
                        </div>
                      </div>
                    </div>

                    {/* Configured Attachments */}
                    {Array.isArray(item.implements) && item.implements.length > 0 && (
                      <div className="px-4 sm:px-5 pb-2.5">
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {item.implements.map((impl, idx) => {
                            const rawTitle = impl.subCategoryId?.title || impl.subCategoryId?.name || 'Attachment';
                            const title = rawTitle.split('(')[0].trim();
                            const hourlyAdd = Number(impl.pricing?.hourly?.price) || 0;
                            const acreAdd = Number(impl.pricing?.land_based?.price) || 0;

                            let addonLabel = '';
                            if (hourlyAdd > 0) {
                              addonLabel = `+₹${hourlyAdd}/hr`;
                            } else if (acreAdd > 0) {
                              addonLabel = `+₹${acreAdd}/ac`;
                            }

                            return (
                              <span 
                                key={idx} 
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/90 border border-slate-200/60 text-xs font-medium text-slate-700"
                              >
                                <FiTool className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{title}</span>
                                {addonLabel && (
                                  <span className="text-emerald-700 font-bold text-[11px]">
                                    ({addonLabel})
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Rejection Alert Banner */}
                    {item.status === 'rejected' && item.rejectionReason && (
                      <div className="mx-4 sm:mx-5 mb-3 p-3 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-start gap-2.5 text-rose-800">
                        <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <div className="text-xs">
                          <span className="font-black uppercase tracking-wider text-[10px] text-rose-700 block">Verification Feedback:</span>
                          <p className="font-semibold mt-0.5">{item.rejectionReason}</p>
                          <button 
                            onClick={() => navigate(`/vendor/equipment/edit/${item._id}`)}
                            className="mt-1.5 text-[11px] font-black text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>Update Machine & Resubmit</span>
                            <FiChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Clean Pricing Strip */}
                    <div className="bg-slate-50/70 border-t border-slate-100 px-4 sm:px-5 py-2.5 flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                        {hasHourly && (
                          <div className="flex items-baseline gap-1">
                            <span className="text-base sm:text-lg font-black text-slate-900">
                              {formatRupee(item.pricing.hourly.price)}
                            </span>
                            <span className="text-xs font-medium text-slate-400">/hr</span>
                          </div>
                        )}

                        {hasHourly && (hasAcre || hasDaily) && (
                          <span className="text-slate-300 font-light">•</span>
                        )}

                        {hasAcre && (
                          <div className="flex items-baseline gap-1">
                            <span className="text-base sm:text-lg font-black text-slate-900">
                              {formatRupee(item.pricing.land_based.price)}
                            </span>
                            <span className="text-xs font-medium text-slate-400">/acre</span>
                          </div>
                        )}

                        {hasAcre && hasDaily && (
                          <span className="text-slate-300 font-light">•</span>
                        )}

                        {hasDaily && (
                          <div className="flex items-baseline gap-1">
                            <span className="text-base sm:text-lg font-black text-slate-900">
                              {formatRupee(item.pricing.daily?.price || item.pricing.monthly?.price)}
                            </span>
                            <span className="text-xs font-medium text-slate-400">/day</span>
                          </div>
                        )}

                        {!hasHourly && !hasAcre && !hasDaily && (
                          <span className="text-xs font-semibold text-slate-400 italic">
                            No active rates configured
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => navigate(`/vendor/equipment/edit/${item._id}`)}
                        className="text-xs font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 shrink-0 group-hover:translate-x-0.5 transition-transform cursor-pointer"
                      >
                        <span>Configure</span>
                        <FiChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setDeleteModalItem(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Dialog */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 z-10"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
                <FiTrash2 className="w-6 h-6 stroke-[2]" />
              </div>

              <h3 className="text-lg font-black text-slate-900 text-center">
                Remove Machinery?
              </h3>
              <p className="text-xs text-slate-500 font-medium text-center mt-2 leading-relaxed">
                Are you sure you want to remove <strong className="text-slate-800">"{deleteModalItem.name}"</strong>? 
                Farmers will no longer be able to book this equipment.
              </p>

              <div className="mt-6 flex gap-2.5">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteModalItem(null)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-black text-xs hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteConfirm}
                  className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-500/25 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Removing...</span>
                    </>
                  ) : (
                    <span>Delete</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EquipmentInventory;
