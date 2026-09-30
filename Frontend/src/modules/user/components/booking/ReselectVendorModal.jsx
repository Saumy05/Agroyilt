import React, { useState, useEffect } from 'react';
import { 
  FiX, FiTruck, FiMapPin, FiStar, FiClock, 
  FiCheckCircle, FiAlertCircle, FiRefreshCw, FiArrowRight 
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
        toastManager.success(`Request sent to ${vendorItem.vendor.businessName || vendorItem.vendor.name}!`);
        if (onVendorSelected) {
          onVendorSelected(res.data?.booking || res.booking);
        }
        onClose();
      } else {
        toastManager.error(res.message || 'Failed to send request to this vendor');
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
          className="bg-white rounded-t-[36px] sm:rounded-[36px] max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <FiRefreshCw size={22} className={loading ? 'animate-spin' : ''} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">Select Another Vendor</h2>
                <p className="text-xs text-slate-500 font-medium">
                  {vendors.length > 0 
                    ? `${vendors.length} qualified vendor${vendors.length > 1 ? 's' : ''} available nearby`
                    : 'Searching for nearby verified vendors...'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <FiX size={18} />
            </button>
          </div>

          {/* Vendors List Body */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4 no-scrollbar">
            {loading ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-bold text-slate-600">Finding qualified available vendors nearby...</p>
                <p className="text-xs text-slate-400">Checking equipment compatibility and real slot availability</p>
              </div>
            ) : vendors.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <FiAlertCircle size={28} />
                </div>
                <h3 className="text-base font-bold text-slate-700">No other vendors currently available</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  There are no other vendors with compatible machinery in your area for the requested slot. Try changing the time slot or date.
                </p>
                <button
                  onClick={fetchAlternativeVendors}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 inline-flex items-center gap-2"
                >
                  <FiRefreshCw size={14} /> Refresh Vendors
                </button>
              </div>
            ) : (
              vendors.map((item) => {
                const isSelected = selectedVendorId === item.vendor._id;
                const isAvail = item.isAvailable;

                return (
                  <div
                    key={item.vendor._id}
                    className={`rounded-2xl p-4 border transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/30'
                        : isAvail
                        ? 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                        : 'border-slate-100 bg-slate-50/60 opacity-75'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Vendor & Equipment Details */}
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 overflow-hidden flex items-center justify-center shrink-0">
                          {item.vendor.avatar ? (
                            <img
                              src={item.vendor.avatar}
                              alt={item.vendor.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="font-black text-emerald-700 text-sm">
                              {item.vendor.name?.charAt(0) || 'V'}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-black text-sm text-slate-800 truncate">
                              {item.vendor.businessName || item.vendor.name}
                            </h4>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              <FiStar className="fill-amber-400 text-amber-400" size={10} />
                              {item.vendor.rating || 4.8}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              <FiMapPin size={10} />
                              {item.vendor.distance ? `${item.vendor.distance} km` : 'Nearby'}
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 font-semibold flex items-center gap-2">
                            <span>{item.equipment.name}</span>
                            {item.equipment.horsepower && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 font-black px-1.5 py-0.5 rounded">
                                {item.equipment.horsepower} HP
                              </span>
                            )}
                          </p>

                          {item.matchedImplement && (
                            <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                              <FiCheckCircle size={12} />
                              Attached: <span className="font-bold">{item.matchedImplement.title}</span>
                            </p>
                          )}

                          {/* Availability badge */}
                          <div className="pt-1">
                            {isAvail ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Available for your slot
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                {item.conflictReason || 'Slot busy'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Pricing & CTA */}
                      <div className="flex items-center justify-between sm:flex-col sm:items-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left sm:text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Price</p>
                          <p className="text-lg font-black text-slate-900 leading-tight">
                            ₹{item.pricing?.totalAmount?.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[9px] text-slate-400">
                            (₹{item.pricing?.tractorTotal} machine + ₹{item.pricing?.implementTotal} implement)
                          </p>
                        </div>

                        <button
                          disabled={!isAvail || submitting}
                          onClick={() => handleSelectAndSend(item)}
                          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                            isAvail
                              ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {submitting && isSelected ? (
                            <span>Sending...</span>
                          ) : (
                            <>
                              <span>Select Vendor</span>
                              <FiArrowRight size={14} />
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
          <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-500">
              Only the vendor you choose will receive this booking request. We never auto-switch vendors.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ReselectVendorModal;
