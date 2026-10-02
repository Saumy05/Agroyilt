import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiPlus, FiTruck, FiSettings, FiTrash2, FiEdit2, 
  FiClock, FiAlertCircle, FiCheckCircle, FiChevronLeft, FiChevronRight,
  FiTool, FiLayers, FiInfo, FiSliders, FiCheck
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { toastManager } from '../../../../utils/toastManager';
import vendorEquipmentService from '../../../../services/vendorEquipmentService';

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
        toastManager.success(`"${deleteModalItem.name}" removed from inventory`);
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

  // Helper to extract implements cleanly
  const getImplementsList = (item) => {
    const list = [];
    if (Array.isArray(item.implements)) {
      item.implements.forEach(impl => {
        const title = impl.subCategoryId?.title || impl.subCategoryId?.name;
        if (title) list.push(title);
      });
    }
    if (list.length === 0 && Array.isArray(item.subCategoryIds)) {
      item.subCategoryIds.forEach(sub => {
        const title = sub.title || sub.name;
        if (title) list.push(title);
      });
    }
    return list;
  };


  const StatusBadge = ({ status }) => {
    const configs = {
      pending: { 
        bg: 'bg-amber-50/80 text-amber-700 border-amber-200/60', 
        label: 'In Verification',
        dot: 'bg-amber-500'
      },
      approved: { 
        bg: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60', 
        label: 'Live & Bookable',
        dot: 'bg-emerald-500 animate-pulse'
      },
      active: { 
        bg: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60', 
        label: 'Live & Bookable',
        dot: 'bg-emerald-500 animate-pulse'
      },
      rejected: { 
        bg: 'bg-rose-50/80 text-rose-700 border-rose-200/60', 
        label: 'Needs Action',
        dot: 'bg-rose-500'
      },
      inactive: { 
        bg: 'bg-slate-50 text-slate-500 border-slate-200/60', 
        label: 'Paused',
        dot: 'bg-slate-400'
      }
    };
    const cfg = configs[status] || configs.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cfg.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        <span>{cfg.label}</span>
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FBFF] pb-28">
        {/* Skeleton Topbar */}
        <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-100 px-5 py-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-5 w-32 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-3 w-20 bg-slate-100 rounded-md animate-pulse" />
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-100 animate-pulse" />
        </div>

        {/* Skeleton Cards */}
        <div className="p-4 sm:p-5 space-y-4 max-w-4xl mx-auto">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-3xl border border-slate-100 p-5 shadow-xs flex flex-col sm:flex-row gap-4 animate-pulse">
              <div className="w-24 h-24 rounded-2xl bg-slate-200 flex-shrink-0" />
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 bg-slate-200 rounded w-1/4" />
                <div className="h-6 bg-slate-200 rounded w-2/3" />
                <div className="h-4 bg-slate-100 rounded w-1/2" />
                <div className="h-8 bg-slate-100 rounded-xl w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FBFF] pb-32">
      {/* Sticky Premium Topbar */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/vendor/dashboard')}
              aria-label="Back to Dashboard"
              className="w-10 h-10 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-700 active:scale-95 transition-all shadow-xs"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none">
                  My Machinery
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black border border-blue-100">
                  {equipment.length}
                </span>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                Rentable Fleet Inventory
              </p>
            </div>
          </div>

          {/* Add Machine Button */}
          <button 
            onClick={() => navigate('/vendor/equipment/add')}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs sm:text-sm px-3.5 sm:px-4 py-2.5 rounded-2xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all"
          >
            <FiPlus className="w-4 h-4 stroke-[3]" />
            <span className="hidden sm:inline">Add Machine</span>
            <span className="sm:hidden font-bold">Add</span>
          </button>
        </div>

      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Equipment Cards List */}
        {equipment.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200/80 rounded-3xl p-10 sm:p-14 text-center my-6 shadow-xs">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100">
              <FiTruck className="w-8 h-8 stroke-[1.5]" />
            </div>
            <h3 className="text-lg font-black text-slate-800">No machinery added yet</h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-sm mx-auto mt-1 mb-6">
              List your tractors, rotavators, sprayers, or harvesters to start receiving rental bookings from local farmers.
            </p>
            <button 
              onClick={() => navigate('/vendor/equipment/add')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black text-xs sm:text-sm shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
            >
              <FiPlus className="w-4 h-4" />
              <span>Add First Machine</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {equipment.map(item => {
                const category = parseBilingualTitle(item.categoryId?.title);
                const implementsList = getImplementsList(item);
                const hasHourly = item.pricing?.hourly?.isEnabled && Number(item.pricing?.hourly?.price) > 0;
                const hasAcre = item.pricing?.land_based?.isEnabled && Number(item.pricing?.land_based?.price) > 0;
                const hasDaily = (item.pricing?.daily?.isEnabled && Number(item.pricing?.daily?.price) > 0) ||
                                (item.pricing?.monthly?.isEnabled && Number(item.pricing?.monthly?.price) > 0);

                return (
                  <motion.div 
                    key={item._id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all overflow-hidden"
                  >
                    {/* Top Row: Thumbnail + Details + Actions */}
                    <div className="p-4 sm:p-5 flex gap-3.5 sm:gap-4 items-start">
                      {/* Machine Thumbnail */}
                      <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 flex-shrink-0 group">
                        {item.images && item.images[0] ? (
                          <img 
                            src={item.images[0]} 
                            alt={item.name} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              if (e.currentTarget.nextSibling) {
                                e.currentTarget.nextSibling.style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div 
                          className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-gradient-to-br from-slate-50 to-slate-100"
                          style={{ display: item.images && item.images[0] ? 'none' : 'flex' }}
                        >
                          <FiTruck className="w-8 h-8 stroke-[1.5]" />
                        </div>

                        {/* Image count pill */}
                        {item.images?.length > 1 && (
                          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[9px] font-bold text-white shadow-xs">
                            📷 {item.images.length}
                          </span>
                        )}
                      </div>

                      {/* Main Info Block */}
                      <div className="flex-1 min-w-0">
                        {/* Header Row: Category Badge & Action Icons */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-wider">
                              {category.primary}
                            </span>
                            {(item.horsepower || item.hp) && (
                              <span className="text-[10px] font-bold text-slate-500">
                                • {item.horsepower || item.hp} HP
                              </span>
                            )}
                            {item.listingType === 'rental' && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-black uppercase border border-amber-200/60">
                                Tool Rental
                              </span>
                            )}
                          </div>

                          {/* Quick Action Icons */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button 
                              onClick={() => navigate(`/vendor/equipment/edit/${item._id}`)}
                              className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 flex items-center justify-center transition-colors border border-slate-200/60"
                              title="Edit machine specs & pricing"
                            >
                              <FiEdit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => setDeleteModalItem(item)}
                              className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-colors border border-slate-200/60"
                              title="Remove machine from inventory"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Machine Name */}
                        <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug break-words mb-2">
                          {item.name}
                        </h3>

                        {/* Status Badge */}
                        <div className="flex items-center">
                          <StatusBadge status={item.status} />
                        </div>
                      </div>
                    </div>

                    {/* Configured Attachments with Live Total Rates */}
                    {Array.isArray(item.implements) && item.implements.length > 0 && (
                      <div className="px-4 sm:px-5 pb-3">
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {item.implements.map((impl, idx) => {
                            const rawTitle = impl.subCategoryId?.title || impl.subCategoryId?.name || 'Attachment';
                            const title = rawTitle.split('(')[0].trim();
                            const hourlyAdd = Number(impl.pricing?.hourly?.price) || 0;
                            const acreAdd = Number(impl.pricing?.land_based?.price) || 0;
                            const baseHourly = Number(item.pricing?.hourly?.price) || 0;
                            const baseAcre = Number(item.pricing?.land_based?.price) || 0;
                            
                            const totalHourly = baseHourly + hourlyAdd;
                            const totalAcre = baseAcre + acreAdd;

                            let rateText = '';
                            if (totalHourly > 0 && totalAcre > 0) {
                              rateText = `₹${totalHourly}/hr • ₹${totalAcre}/ac`;
                            } else if (totalHourly > 0) {
                              rateText = `₹${totalHourly}/hr`;
                            } else if (totalAcre > 0) {
                              rateText = `₹${totalAcre}/ac`;
                            } else {
                              rateText = 'Included';
                            }

                            return (
                              <span 
                                key={idx} 
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] font-semibold text-slate-700"
                              >
                                <span className="text-blue-600 font-bold">✓</span>
                                <span>{title}</span>
                                <span className="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200/60 text-[10px]">
                                  {rateText}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}



                    {/* Rejection Alert Banner */}
                    {item.status === 'rejected' && item.rejectionReason && (
                      <div className="mx-4 sm:mx-5 mb-3 p-3 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-start gap-2.5 text-rose-800">
                        <FiAlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                        <div className="text-xs">
                          <span className="font-black uppercase tracking-wider text-[10px] text-rose-700 block">Verification Feedback:</span>
                          <p className="font-semibold mt-0.5">{item.rejectionReason}</p>
                          <button 
                            onClick={() => navigate(`/vendor/equipment/edit/${item._id}`)}
                            className="mt-1.5 text-[11px] font-black text-rose-700 hover:underline flex items-center gap-1"
                          >
                            <span>Update Machine & Resubmit</span>
                            <FiChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Clean Pricing Strip */}
                    <div className="bg-slate-50/60 border-t border-slate-100/90 px-4 sm:px-5 py-2.5 flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-slate-800">
                        {hasHourly && (
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm sm:text-base font-black text-slate-900">
                              {formatRupee(item.pricing.hourly.price)}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">/hr</span>
                          </div>
                        )}

                        {hasAcre && (
                          <div className="flex items-baseline gap-1">
                            {hasHourly && <span className="text-slate-300 mr-1.5">•</span>}
                            <span className="text-sm sm:text-base font-black text-slate-900">
                              {formatRupee(item.pricing.land_based.price)}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">/acre</span>
                          </div>
                        )}

                        {hasDaily && (
                          <div className="flex items-baseline gap-1">
                            {(hasHourly || hasAcre) && <span className="text-slate-300 mr-1.5">•</span>}
                            <span className="text-sm sm:text-base font-black text-slate-900">
                              {formatRupee(item.pricing.daily?.price || item.pricing.monthly?.price)}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">/day</span>
                          </div>
                        )}

                        {!hasHourly && !hasAcre && !hasDaily && (
                          <span className="text-xs font-semibold text-slate-400 italic">
                            No active rates configured
                          </span>
                        )}
                      </div>
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
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-black text-xs hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteConfirm}
                  className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-500/25 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
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
