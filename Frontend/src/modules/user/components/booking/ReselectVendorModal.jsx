import React, { useState, useEffect } from 'react';
import { 
  FiX, FiTruck, FiMapPin, FiStar, FiClock, 
  FiCheckCircle, FiAlertCircle, FiRefreshCw, FiArrowRight,
  FiShield, FiTool, FiCheck
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import { bookingService } from '../../../../services/bookingService';
import { toastManager } from '../../../../utils/toastManager';

const ReselectVendorModal = ({ isOpen, onClose, booking, onVendorSelected }) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState(null);

  useEffect(() => {
    if (isOpen && booking) {
      fetchAlternativeVendors();
    }
  }, [isOpen, booking]);

  const fetchAlternativeVendors = async () => {
    try {
      setLoading(true);
      const catId = booking.categoryId?._id || booking.categoryId;
      const implId = booking.selectedImplements?.[0]?.subCategoryId?._id 
        || booking.selectedImplements?.[0]?.subCategoryId 
        || undefined;

      const dateStr = booking.scheduledDate 
        ? new Date(booking.scheduledDate).toISOString().split('T')[0] 
        : new Date().toISOString().split('T')[0];

      const payload = {
        categoryId: catId,
        implementId: implId,
        rental_type: booking.rental_type || 'hourly',
        landSize: booking.landSize,
        durationHours: booking.estimatedDuration,
        date: dateStr,
        timeSlot: booking.timeSlot?.start && booking.timeSlot?.end 
          ? `${booking.timeSlot.start} - ${booking.timeSlot.end}` 
          : (booking.scheduledTime || undefined),
        lat: booking.address?.lat,
        lng: booking.address?.lng,
        radius: 60
      };

      const res = await publicEquipmentService.getQualifiedVendors(payload);
      if (res.success && Array.isArray(res.data)) {
        // Exclude the currently rejected vendor if present
        const currentVendorId = (booking.vendorId?._id || booking.vendorId || '').toString();
        const filtered = res.data.filter(v => v.vendor._id.toString() !== currentVendorId);
        setVendors(filtered);
      } else {
        setVendors([]);
      }
    } catch (err) {
      console.error('Failed to fetch alternative vendors:', err);
      toastManager.error('Could not load alternative vendors. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAndSend = async (vendorItem) => {
    try {
      setSubmitting(true);
      setSelectedVendorId(vendorItem.vendor._id);

      const res = await bookingService.reselectVendor(booking._id || booking.id, {
        vendorId: vendorItem.vendor._id,
        equipmentId: vendorItem.equipment._id,
        priceDetails: {
          basePrice: vendorItem.pricing.basePrice || (vendorItem.pricing.tractorTotal + (vendorItem.pricing.implementTotal || 0)),
          tax: vendorItem.pricing.tax || 0,
          visitingCharges: vendorItem.pricing.visitingCharges || 0,
          finalAmount: vendorItem.pricing.totalAmount,
          pricing: {
            unitRate: vendorItem.pricing.tractorUnitRate,
            multiplier: vendorItem.pricing.multiplier,
            totalPrice: vendorItem.pricing.totalAmount
          }
        }
      });

      if (res.success) {
        toastManager.success(`Request dispatched to ${vendorItem.vendor.businessName || vendorItem.vendor.name}!`);
        if (onVendorSelected) {
          onVendorSelected(res.data?.booking || res.booking);
        }
        onClose();
      } else {
        toastManager.error(res.message || 'Failed to dispatch request to this vendor');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Error sending request to vendor';
      toastManager.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="bg-white rounded-t-[36px] sm:rounded-[36px] max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 font-sans"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-emerald-900/10 bg-gradient-to-r from-emerald-50/70 via-slate-50 to-teal-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200 shadow-xs">
                <FiRefreshCw size={22} className={loading ? 'animate-spin' : ''} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Select Another Vendor
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Instant Retry
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  {vendors.length > 0 
                    ? `${vendors.length} qualified vendor${vendors.length > 1 ? 's' : ''} available in your 60km cluster`
                    : 'Searching verified owners with compatible machinery...'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-2xl bg-white/90 border border-slate-200/80 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <FiX size={18} />
            </button>
          </div>

          {/* Rejection Context Pill */}
          {booking?.rejectionReason && (
            <div className="bg-amber-50/80 border-b border-amber-200/60 px-5 py-2.5 flex items-center gap-2.5 text-amber-900 text-xs font-semibold">
              <FiAlertCircle size={15} className="text-amber-600 shrink-0" />
              <span>
                Previous vendor status: <strong className="font-black text-amber-950">{booking.rejectionReason}</strong>
              </span>
            </div>
          )}

          {/* Vendors List Body */}
          <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 space-y-2.5 no-scrollbar bg-slate-50/50">
            {loading ? (
              <div className="py-16 text-center space-y-2.5">
                <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-black text-slate-800">Checking nearby vendor availability...</p>
                <p className="text-[11px] text-slate-400">Verifying horsepower, implement attachments, and free schedule</p>
              </div>
            ) : vendors.length === 0 ? (
              <div className="py-10 text-center space-y-2.5 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <FiAlertCircle size={24} />
                </div>
                <h3 className="text-sm font-black text-slate-800">No Other Free Machinery Nearby</h3>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                  There are no other vendors with compatible machinery in your 60km cluster for this exact slot. Try adjusting the slot or booking date.
                </p>
                <button
                  onClick={fetchAlternativeVendors}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 rounded-xl text-xs font-black text-white inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <FiRefreshCw size={13} /> Refresh Cluster
                </button>
              </div>
            ) : (
              vendors.map((item) => {
                const isSelected = selectedVendorId === item.vendor._id;
                const isAvail = item.isAvailable;

                return (
                  <div
                    key={item.vendor._id}
                    className={`rounded-2xl p-3 border transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                        : isAvail
                        ? 'border-slate-200/80 bg-white hover:border-emerald-300 hover:shadow-xs'
                        : 'border-slate-200 bg-slate-50/70 opacity-70'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Vendor & Equipment Details */}
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                          {item.vendor.avatar ? (
                            <img
                              src={item.vendor.avatar}
                              alt={item.vendor.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="font-black text-emerald-800 text-xs">
                              {item.vendor.name?.charAt(0) || 'V'}
                            </span>
                          )}
                        </div>

                        <div className="space-y-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-black text-xs text-slate-900 truncate">
                              {item.vendor.businessName || item.vendor.name}
                            </h4>
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                              <FiStar className="fill-amber-400 text-amber-400" size={9} />
                              {item.vendor.rating ? item.vendor.rating.toFixed(1) : '4.8'}
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                              <FiMapPin size={9} className="text-emerald-600" />
                              {item.vendor.distance ? `${item.vendor.distance} km` : 'Nearby'}
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 font-semibold flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="font-bold text-slate-900">{item.equipment.name}</span>
                            {item.equipment.horsepower && (
                              <span className="text-[8.5px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.2 rounded">
                                {item.equipment.horsepower} HP
                              </span>
                            )}
                            {item.matchedImplement && (
                              <span className="text-[9.5px] text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100 flex items-center gap-0.5">
                                <FiCheck size={10} className="text-emerald-600" />
                                {item.matchedImplement.title} attached
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Pricing & CTA */}
                      <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left sm:text-right">
                          <p className="text-[8.5px] font-black uppercase tracking-wider text-slate-400">Total Payable</p>
                          <p className="text-base font-black text-slate-900 leading-tight">
                            ₹{item.pricing?.totalAmount?.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[9px] text-slate-400 font-medium">
                            ₹{item.pricing?.basePrice} base + ₹{item.pricing?.tax} GST
                          </p>
                        </div>

                        <button
                          disabled={!isAvail || submitting}
                          onClick={() => handleSelectAndSend(item)}
                          className={`px-3.5 py-2 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1 transition-all shadow-xs cursor-pointer ${
                            isAvail
                              ? 'bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 active:scale-95 text-white shadow-emerald-700/20'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {submitting && isSelected ? (
                            <span>Dispatching...</span>
                          ) : (
                            <>
                              <span>Dispatch</span>
                              <FiArrowRight size={12} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Note */}
          <div className="p-4 bg-white border-t border-slate-100 text-center">
            <p className="text-[11px] font-bold text-slate-500 flex items-center justify-center gap-1.5">
              <FiShield size={13} className="text-emerald-600" /> Direct 1-to-1 Dispatch: Only the selected vendor receives your request.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ReselectVendorModal;
