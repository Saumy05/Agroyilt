import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  FiMapPin, FiTruck, FiCalendar, FiClock, 
  FiCheckCircle, FiShield, FiCreditCard, FiArrowLeft, 
  FiDollarSign, FiTool, FiCheck, FiFileText, FiLock
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import { toastManager } from '../../../../utils/toastManager';
import { bookingService } from '../../../../services/bookingService';
import AddressSelectionModal from '../Checkout/components/AddressSelectionModal';

const MachineryCheckout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { equipment, bookingData } = location.state || {};
    const selectedImplements = bookingData?.selectedImplements || [];

    const [selectedAddress, setSelectedAddress] = useState(null);
    const [houseNumber, setHouseNumber] = useState('');
    const [showAddressModal, setShowAddressModal] = useState(true);
    const [paymentMethod, setPaymentMethod] = useState('cash'); // Defaulting to COD for agriculture
    const [submitting, setSubmitting] = useState(false);
    const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);

    if (!equipment || !bookingData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center bg-slate-50 font-sans">
                <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                  <FiTruck size={36} />
                </div>
                <h2 className="text-lg font-black text-slate-800">No Booking Data Available</h2>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">Please configure your machinery requirements first.</p>
                <button 
                  onClick={() => navigate('/user/machinery-explorer')} 
                  className="mt-5 px-6 py-3 bg-emerald-700 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-700/20 active:scale-95 transition-all"
                >
                  Return to Machinery Hub
                </button>
            </div>
        );
    }

    const { 
        rateType, 
        quantity, 
        date, 
        slot, 
        startTime, 
        endTime, 
        total, 
        basePrice, 
        tax, 
        visitingCharges,
        tractorTotal,
        implementTotal,
        gstPercentage
    } = bookingData;

    const formatToDDMMYYYY = (dateStr) => {
        if (!dateStr) return '';
        try {
            const [y, m, d] = dateStr.split('-');
            if (y && m && d) return `${d}/${m}/${y}`;
            return dateStr;
        } catch {
            return dateStr;
        }
    };

    const formatTime12Hour = (time24) => {
        if (!time24) return '';
        try {
            const [h, m] = time24.split(':').map(Number);
            const period = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            return `${h12}:${String(m).padStart(2, '0')} ${period}`;
        } catch {
            return time24;
        }
    };

    const formatTimeSlotDisplay = (slotStr, start, end) => {
        if (start && end) {
            return `${formatTime12Hour(start)} – ${formatTime12Hour(end)}`;
        }
        if (slotStr && slotStr.includes('-')) {
            const [s, e] = slotStr.split('-').map(t => t.trim());
            return `${formatTime12Hour(s)} – ${formatTime12Hour(e)}`;
        }
        return formatTime12Hour(slotStr || start);
    };

    const finalTractorTotal = (typeof tractorTotal === 'number') 
        ? tractorTotal 
        : (basePrice !== undefined ? basePrice : total);

    const formatDuration = (qty, type) => {
        if (type === 'hourly') {
            const totalMinutes = Math.round(qty * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            let parts = [];
            if (hours > 0) parts.push(`${hours} Hr${hours > 1 ? 's' : ''}`);
            if (minutes > 0) parts.push(`${minutes} Mins`);
            return parts.join(' ');
        }
        return `${qty} ${type === 'land_based' ? (qty === 1 ? 'Acre' : 'Acres') : type === 'daily' ? (qty === 1 ? 'Day' : 'Days') : type}`;
    };

    const handleConfirmBooking = async () => {
        if (!selectedAddress) {
            toastManager.error('Please select an address first');
            setShowAddressModal(true);
            return;
        }

        try {
            setSubmitting(true);
            const payload = {
                serviceId: equipment._id,
                vendorId: equipment.vendorId?._id || equipment.vendorId || undefined,
                categoryId: equipment.categoryId?._id || equipment.categoryId,
                bookingType: 'scheduled',
                rental_type: rateType,
                landSize: rateType === 'land_based' ? quantity : undefined,
                estimatedDuration: ['hourly', 'daily', 'monthly'].includes(rateType) ? quantity : undefined,
                scheduledDate: date,
                scheduledTime: slot,
                timeSlot: { start: startTime || slot, end: endTime || slot, date, time: slot },
                address: {
                    addressLine1: selectedAddress.addressLine1,
                    addressLine2: selectedAddress.addressLine2 || '',
                    city: selectedAddress.city || 'Unknown City',
                    state: selectedAddress.state || 'Unknown State',
                    pincode: selectedAddress.pincode || '000000',
                    lat: selectedAddress.lat,
                    lng: selectedAddress.lng
                },
                paymentMethod,
                amount: total,
                basePrice: basePrice || total,
                tax: tax || 0,
                visitingCharges: visitingCharges || 0,
                // Selected implements
                selectedImplements: selectedImplements.map(impl => ({
                    subCategoryId: impl.subCategoryId?._id || impl.subCategoryId,
                    title: impl.subCategoryId?.title || impl.title || 'Unknown Implement',
                    pricing: impl.pricing
                })),
                bookedItems: [
                    {
                        title: equipment.name,
                        price: rateType === 'hourly'
                            ? equipment.pricing?.hourly?.price
                            : rateType === 'land_based'
                            ? equipment.pricing?.land_based?.price
                            : equipment.pricing?.daily?.price,
                        quantity: quantity,
                        description: `${quantity} ${rateType === 'hourly' ? 'Hours' : rateType === 'land_based' ? 'Acres' : 'Days'}`
                    },
                    // Add implements as additional line items
                    ...selectedImplements.map(impl => ({
                        title: impl.subCategoryId?.title || impl.title || 'Unknown Implement',
                        price: impl.pricing?.[rateType]?.price || 0,
                        quantity: quantity,
                        description: `${impl.subCategoryId?.title || impl.title || 'Unknown Implement'} add-on`
                    }))
                ]
            };

            const res = await bookingService.create(payload);
            if (res.success) {
                toastManager.success('Booking Dispatched to Vendor!');
                sessionStorage.removeItem(`machinery_booking_${equipment._id}`);
                const newBookingId = res.booking?._id || res.data?._id || res.data?.booking?._id || res._id || res.booking?.id || res.data?.id;
                if (newBookingId) {
                    navigate(`/user/booking-confirmation/${newBookingId}`, { replace: true });
                } else {
                    navigate('/user/my-bookings', { replace: true });
                }
            }
        } catch (err) {
            const errorMsg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.message || 'Booking failed';
            toastManager.error(errorMsg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-slate-50 to-slate-50 pb-24 font-sans">
            {/* Header */}
            <div className="bg-white/90 backdrop-blur-xl border-b border-emerald-900/10 px-3.5 py-2.5 sticky top-0 z-40 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-2.5 max-w-xl mx-auto mb-1.5">
                    <button 
                      onClick={() => navigate(-1)} 
                      className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-center text-slate-700 active:scale-95 transition-all flex-shrink-0 border border-slate-200/60 cursor-pointer" 
                      aria-label="Back"
                    >
                      <FiArrowLeft size={16}/>
                    </button>
                    <div>
                        <div className="flex items-center gap-1.5">
                          <h1 className="text-sm font-black text-slate-900 leading-tight">
                            Booking Receipt & Dispatch
                          </h1>
                          <span className="px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Final Step
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400">Review specs, farm location & itemized bill</p>
                    </div>
                </div>

                {/* Polished 3-Step Flow Indicator (Step 3 Active) */}
                <div className="max-w-xl mx-auto pt-0.5 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[11px] font-black text-emerald-700 shrink-0">
                        <span className="w-4.5 h-4.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[9px] font-black">✓</span>
                        <span>Specs</span>
                    </div>

                    <div className="h-[2px] flex-1 mx-2.5 bg-emerald-600 rounded-full" />

                    <div className="flex items-center gap-1 text-[11px] font-black text-emerald-700 shrink-0">
                        <span className="w-4.5 h-4.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[9px] font-black">✓</span>
                        <span>Vendors</span>
                    </div>

                    <div className="h-[2px] flex-1 mx-2.5 bg-emerald-600 rounded-full" />

                    <div className="flex items-center gap-1 text-[11px] font-black text-emerald-800 shrink-0">
                        <span className="w-4.5 h-4.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black ring-2 ring-emerald-500/20 shadow-xs">
                          3
                        </span>
                        <span>Checkout</span>
                    </div>
                </div>
            </div>

            <div className="max-w-xl mx-auto px-3.5 py-2.5 space-y-2.5">
                {/* Farm Location Card */}
                <div 
                  onClick={() => setShowAddressModal(true)}
                  className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-200/80 cursor-pointer hover:border-emerald-400 transition-all group"
                >
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-black text-xs">
                                <FiMapPin size={13} />
                            </span>
                            <div>
                              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Farm Destination Address</h3>
                              <p className="text-[10px] font-semibold text-slate-400">Where the machine and operator will arrive</p>
                            </div>
                        </div>
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShowAddressModal(true); }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200/60 transition-colors cursor-pointer"
                        >
                          Change
                        </button>
                    </div>
                    {selectedAddress ? (
                        <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-100 space-y-0.5">
                            <p className="font-bold text-slate-900 text-xs leading-relaxed">{selectedAddress.addressLine1}</p>
                            <p className="text-[10px] text-slate-500 font-medium">
                                {selectedAddress.city ? `${selectedAddress.city}, ` : ''}{selectedAddress.state} {selectedAddress.pincode ? `• PIN: ${selectedAddress.pincode}` : ''}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-2.5 flex items-center gap-2 text-amber-900 text-xs font-bold">
                            <FiMapPin className="text-amber-600 shrink-0" size={14} />
                            <span className="text-[11px]">Tap to specify your farm field or survey number location...</span>
                        </div>
                    )}
                </div>

                {/* Booking Summary Card */}
                <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-200/80">
                    <div className="flex items-center gap-2 mb-2.5">
                       <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-black text-xs">
                          <FiCheckCircle size={13} />
                       </span>
                       <div>
                         <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Machine & Slot Specs</h3>
                         <p className="text-[10px] font-semibold text-slate-400">Verified operator assignment</p>
                       </div>
                    </div>

                    {/* Equipment Snapshot */}
                    <div className="flex items-center gap-2.5 mb-2.5 p-2.5 bg-slate-50/80 rounded-xl border border-slate-100">
                        <div className="w-12 h-12 bg-white rounded-xl overflow-hidden shrink-0 border border-slate-200/80 flex items-center justify-center">
                           {equipment.images?.[0] ? (
                             <img src={equipment.images[0]} alt={equipment.name} className="w-full h-full object-cover" />
                           ) : (
                             <FiTruck size={20} className="text-slate-400" />
                           )}
                        </div>
                        <div className="min-w-0 flex-1">
                             <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                                   {equipment.categoryId?.title || 'Machinery'}
                                </span>
                                {equipment.modelNumber && (
                                   <span className="text-[8.5px] font-bold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200/70">
                                     {equipment.modelNumber}
                                   </span>
                                )}
                             </div>
                             <h4 className="text-xs font-black text-slate-900 truncate leading-snug mt-0.5">{equipment.name}</h4>
                             <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
                               Vendor: <span className="text-slate-800 font-bold">{equipment.vendorId?.businessName || equipment.vendorId?.name || 'Verified Partner'}</span>
                             </p>
                        </div>
                    </div>

                    {/* Schedule Specs */}
                    <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-50/80 rounded-xl border border-slate-100 text-center mb-2.5">
                        <div className="p-1">
                           <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Date</span>
                           <span className="text-xs font-black text-slate-800 block truncate">{formatToDDMMYYYY(date)}</span>
                        </div>
                        <div className="p-1 border-x border-slate-200/70">
                           <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Time Slot</span>
                           <span className="text-[10px] font-black text-slate-800 block truncate">{formatTimeSlotDisplay(slot, startTime, endTime)}</span>
                        </div>
                        <div className="p-1">
                           <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Scope</span>
                           <span className="text-xs font-black text-emerald-800 block truncate">{formatDuration(quantity, rateType)}</span>
                        </div>
                    </div>

                    {/* Itemized Digital Invoice Receipt */}
                    <div className="bg-gradient-to-b from-slate-50 to-emerald-50/30 p-3 rounded-xl border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-dashed border-slate-200">
                          <span className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <FiFileText size={11} className="text-emerald-700" /> Itemized Invoice Breakdown
                          </span>
                          <span className="text-[9px] font-black text-emerald-800 bg-emerald-100/70 px-1.5 py-0.5 rounded-full">
                            Rate Lock Guarantee
                          </span>
                        </div>

                        {/* Machine Base Line Item */}
                        <div className="flex justify-between items-start text-xs pt-0.5">
                          <div className="space-y-0.5 max-w-[65%]">
                            <p className="font-bold text-slate-800 leading-snug">{equipment.name}</p>
                            <span className="text-[9.5px] font-semibold text-slate-400 block">{formatDuration(quantity, rateType)} rental unit</span>
                          </div>
                          <span className="font-black text-slate-900 shrink-0 text-xs">₹{finalTractorTotal}</span>
                        </div>

                        {/* Implements Line Items */}
                        {selectedImplements.map((impl, idx) => {
                          const implCost = typeof impl.total === 'number' ? impl.total : (implementTotal || 0);
                          return (
                            <div key={idx} className="flex justify-between items-start text-xs pt-0.5">
                              <div className="space-y-0.5 max-w-[65%]">
                                <p className="font-bold text-slate-800 leading-snug flex items-center gap-1">
                                  <FiTool size={10} className="text-emerald-700" />
                                  <span>{impl.title}</span>
                                </p>
                                <span className="text-[9.5px] font-semibold text-slate-400 block">Matched field attachment</span>
                              </div>
                              <div className="shrink-0 text-right">
                                {implCost > 0 ? (
                                  <span className="font-black text-slate-900 text-xs">+ ₹{implCost}</span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Included (₹0)
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Conveyance / Visiting Fee */}
                        <div className="flex justify-between items-center text-xs pt-0.5">
                          <span className="font-bold text-slate-500 text-[11px]">Conveyance & Mobilization</span>
                          {visitingCharges > 0 ? (
                            <span className="font-bold text-slate-700 text-xs">+ ₹{visitingCharges}</span>
                          ) : (
                            <span className="font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[9.5px]">
                              FREE
                            </span>
                          )}
                        </div>

                        {/* GST */}
                        <div className="flex justify-between items-center text-xs pt-0.5">
                          <span className="font-bold text-slate-500 text-[11px]">
                            GST {gstPercentage ? `(${gstPercentage}%)` : '(5%)'}
                          </span>
                          <span className="font-bold text-slate-700 text-xs">+ ₹{tax || 0}</span>
                        </div>

                        {/* Total Highlight */}
                        <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                          <div>
                            <span className="text-[11px] font-black text-slate-900 uppercase tracking-wider block">Total Payable</span>
                            <span className="text-[9.5px] font-semibold text-slate-400">All taxes & operator expenses included</span>
                          </div>
                          <span className="text-xl font-black text-emerald-800">₹{total}</span>
                        </div>
                    </div>
                </div>

                {/* Payment Selection Card */}
                <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-200/80 space-y-2">
                    <div className="flex items-center gap-2">
                       <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-black text-xs">
                          <FiDollarSign size={13} />
                       </span>
                       <div>
                         <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Payment Method</h3>
                         <p className="text-[10px] font-semibold text-slate-400">Choose how to settle with the vendor</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 pt-0.5">
                        {/* Cash / Field Pay */}
                        <button 
                          type="button"
                          onClick={() => setPaymentMethod('cash')}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left cursor-pointer
                            ${paymentMethod === 'cash' ? 'border-emerald-600 bg-emerald-50/60 shadow-xs ring-2 ring-emerald-500/10' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${paymentMethod === 'cash' ? 'bg-gradient-to-br from-emerald-600 to-green-700 text-white shadow-2xs' : 'bg-slate-100 text-slate-400'}`}>
                                  ₹
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs font-black ${paymentMethod === 'cash' ? 'text-emerald-950' : 'text-slate-700'}`}>
                                      Pay on Field (Cash / Direct UPI)
                                    </span>
                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">
                                      Recommended
                                    </span>
                                  </div>
                                  <p className="text-[9.5px] font-medium text-slate-400 mt-0.5">Pay vendor directly upon physical job completion</p>
                                </div>
                            </div>
                            {paymentMethod === 'cash' && <FiCheckCircle className="text-emerald-600 shrink-0" size={16} />}
                        </button>

                        {/* Online Payment */}
                        <button 
                          type="button"
                          onClick={() => setPaymentMethod('online')}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left cursor-pointer
                            ${paymentMethod === 'online' ? 'border-emerald-600 bg-emerald-50/60 shadow-xs ring-2 ring-emerald-500/10' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${paymentMethod === 'online' ? 'bg-gradient-to-br from-emerald-600 to-green-700 text-white shadow-2xs' : 'bg-slate-100 text-slate-400'}`}>
                                    <FiCreditCard className="w-4 h-4" />
                                </div>
                                <div>
                                  <span className={`text-xs font-black block ${paymentMethod === 'online' ? 'text-emerald-950' : 'text-slate-700'}`}>
                                    Pay Online (Advance Escrow)
                                  </span>
                                  <p className="text-[9.5px] font-medium text-slate-400 mt-0.5">UPI · Credit/Debit Cards · Netbanking</p>
                                </div>
                            </div>
                            {paymentMethod === 'online' && <FiCheckCircle className="text-emerald-600 shrink-0" size={16} />}
                        </button>
                    </div>
                </div>

                {/* Trust & Safety Seals */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div className="bg-white rounded-xl p-2.5 border border-slate-200/80 flex items-center gap-2 shadow-2xs">
                    <FiShield className="text-emerald-600 shrink-0" size={16} />
                    <div>
                      <p className="text-[10px] font-black text-slate-900 leading-tight">Price Protection</p>
                      <p className="text-[9px] text-slate-400 font-semibold leading-tight">Zero surprise charges</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 border border-slate-200/80 flex items-center gap-2 shadow-2xs">
                    <FiCheckCircle className="text-emerald-600 shrink-0" size={16} />
                    <div>
                      <p className="text-[10px] font-black text-slate-900 leading-tight">1-to-1 Dispatch</p>
                      <p className="text-[9px] text-slate-400 font-semibold leading-tight">Chosen vendor targeted</p>
                    </div>
                  </div>
                </div>
            </div>

            {/* Floating Island Action Bar */}
            <div className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-xl px-3.5 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] border-t border-slate-200/80">
                <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none mb-0.5">Total Payable</p>
                        <h4 className="text-xl font-black text-slate-900 leading-none">₹{total}</h4>
                        <span className="text-[9.5px] font-bold text-emerald-700 mt-0.5 block">
                          {paymentMethod === 'cash' ? 'Pay on field after work' : 'Online payment'}
                        </span>
                    </div>
                    <button
                        onClick={() => setShowPaymentConfirmModal(true)}
                        disabled={submitting}
                        className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer
                          ${submitting ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 text-white shadow-emerald-700/25 active:scale-95'}`}
                    >
                        {submitting ? 'Dispatching...' : 'Dispatch Request ➔'}
                    </button>
                </div>
            </div>

            <AddressSelectionModal 
              isOpen={showAddressModal}
              onClose={() => setShowAddressModal(false)}
              houseNumber={houseNumber}
              onHouseNumberChange={setHouseNumber}
              onSave={(houseNo, location) => {
                  setSelectedAddress({
                      addressLine1: location.address,
                      addressLine2: houseNo,
                      city: location.components.find(c => c.types.includes('locality')) ?.long_name || '',
                      state: location.components.find(c => c.types.includes('administrative_area_level_1')) ?.long_name || '',
                      pincode: location.components.find(c => c.types.includes('postal_code')) ?.long_name || '',
                      lat: location.lat,
                      lng: location.lng
                  });
                  setShowAddressModal(false);
              }}
            />

            {/* ══════════ Payment Confirmation Modal ══════════ */}
            {showPaymentConfirmModal && (
              <div className="fixed inset-0 z-[9999] flex items-end justify-center">
                <div
                  className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                  onClick={() => setShowPaymentConfirmModal(false)}
                />

                <div className="relative bg-white w-full max-w-lg rounded-t-[36px] shadow-2xl z-10 overflow-hidden border border-slate-100" style={{ maxHeight: '90vh' }}>
                  <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800" />

                  {/* Drag pill */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                  </div>

                  <div className="px-6 pb-8 pt-2">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="text-lg font-black text-slate-900">Confirm Booking Dispatch</h3>
                        <p className="text-[11px] text-slate-400 font-bold mt-0.5">Dispatched directly to your selected vendor</p>
                      </div>
                      <button
                        onClick={() => setShowPaymentConfirmModal(false)}
                        className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Amount Banner */}
                    <div className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50/60 border border-emerald-200/60">
                      <div>
                        <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Payable Amount</p>
                        <p className="text-2xl font-black text-emerald-950">₹{total}</p>
                      </div>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-700 text-white shadow-sm">
                        <FiTruck className="w-6 h-6" />
                      </div>
                    </div>

                    {/* Payment Options Selection */}
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Settlement Method</p>
                    <div className="flex flex-col gap-2.5 mb-6">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all text-left cursor-pointer ${
                          paymentMethod === 'cash'
                            ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                            : 'border-slate-100 hover:border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            paymentMethod === 'cash' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
                          }`}>
                            <FiDollarSign className="w-5 h-5" />
                          </div>
                          <div>
                            <span className={`text-xs font-black block ${ paymentMethod === 'cash' ? 'text-emerald-950' : 'text-slate-700'}`}>
                              Pay on Field (Cash / Direct UPI)
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400">Pay vendor on farm after job completion</span>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          paymentMethod === 'cash' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                        }`}>
                          {paymentMethod === 'cash' && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('online')}
                        className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all text-left cursor-pointer ${
                          paymentMethod === 'online'
                            ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                            : 'border-slate-100 hover:border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            paymentMethod === 'online' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
                          }`}>
                            <FiCreditCard className="w-5 h-5" />
                          </div>
                          <div>
                            <span className={`text-xs font-black block ${ paymentMethod === 'online' ? 'text-emerald-950' : 'text-slate-700'}`}>
                              Pay Online Advance
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400">UPI · Cards · Netbanking</span>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          paymentMethod === 'online' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                        }`}>
                          {paymentMethod === 'online' && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                      </button>
                    </div>

                    {/* Dispatch Action */}
                    <button
                      onClick={() => {
                        setShowPaymentConfirmModal(false);
                        setTimeout(() => handleConfirmBooking(), 150);
                      }}
                      disabled={submitting}
                      className="w-full py-4 rounded-2xl text-white font-black text-xs uppercase tracking-wider bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 transition-all active:scale-95 shadow-lg shadow-emerald-700/25 cursor-pointer"
                    >
                      {submitting ? 'Dispatching...' : `Confirm & Dispatch (₹${total}) ➔`}
                    </button>

                    <p className="text-center text-[10px] text-slate-400 font-bold mt-3 flex items-center justify-center gap-1">
                      <FiLock size={12} className="text-emerald-600" /> 100% Protected Agroyilt Direct Dispatch
                    </p>
                  </div>
                </div>
              </div>
            )}
        </div>
    );
};

export default MachineryCheckout;
