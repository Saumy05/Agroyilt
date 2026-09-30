import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  FiMapPin, FiTruck, FiCalendar, FiClock, 
  FiCheckCircle, FiShield, FiCreditCard, FiArrowLeft, FiDollarSign
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
    const [paymentMethod, setPaymentMethod] = useState('cash'); // Defaulting to COD
    const [submitting, setSubmitting] = useState(false);
    const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false); // Payment confirmation modal

    if (!equipment || !bookingData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center">
                <FiTruck size={50} className="text-slate-200 mb-4" />
                <h2 className="text-xl font-black text-slate-800">No Booking Data</h2>
                <button onClick={() => navigate('/user/machinery-explorer')} className="mt-4 text-blue-600 font-bold underline">Go Back</button>
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

    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        } catch {
            return dateStr;
        }
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
            if (hours > 0) parts.push(`${hours} Hour${hours > 1 ? 's' : ''}`);
            if (minutes > 0) parts.push(`${minutes} Minutes`);
            return parts.join(' ');
        }
        return `${qty} ${type === 'land_based' ? 'Acres' : type}`;
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
                // Selected implements (sub-categories like Rotavator, Cultivator etc.)
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
                toastManager.success('Booking Successful!');
                // Clear persisted form state so the form starts fresh next time
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
        <div className="min-h-screen bg-slate-50 pb-44">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 p-4 sticky top-0 z-40 shadow-xs">
                <div className="flex items-center gap-3.5 max-w-xl mx-auto mb-2.5">
                    <button onClick={() => navigate(-1)} className="p-2 bg-slate-50 hover:bg-slate-100 active:scale-95 rounded-xl transition-all" aria-label="Back">
                      <FiArrowLeft size={18}/>
                    </button>
                    <div>
                        <h1 className="text-base font-black text-slate-800 leading-tight">Final Confirmation</h1>
                        <p className="text-[11px] font-semibold text-slate-400">Review equipment, address & pricing</p>
                    </div>
                </div>

                {/* Multi-Step Flow Indicator (Step 3 Active) */}
                <div className="max-w-xl mx-auto pt-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-black text-emerald-600">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px]">✓</span>
                        <span>Requirements</span>
                    </div>
                    <div className="h-[2px] flex-1 mx-2.5 bg-emerald-500"></div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-emerald-600">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px]">✓</span>
                        <span>Select Vendor</span>
                    </div>
                    <div className="h-[2px] flex-1 mx-2.5 bg-blue-500"></div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-blue-600">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">3</span>
                        <span>Checkout</span>
                    </div>
                </div>
            </div>

            <div className="max-w-xl mx-auto p-4 space-y-4">
                {/* Farm Address Card */}
                <div 
                  onClick={() => setShowAddressModal(true)}
                  className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 cursor-pointer hover:border-blue-300 transition-all"
                >
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                <FiMapPin size={14} />
                            </span>
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Farm Address</h3>
                        </div>
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShowAddressModal(true); }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          Change
                        </button>
                    </div>
                    {selectedAddress ? (
                        <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 space-y-0.5">
                            <p className="font-bold text-slate-800 text-xs leading-relaxed">{selectedAddress.addressLine1}</p>
                            <p className="text-[11px] text-slate-400 font-medium">
                                {selectedAddress.city ? `${selectedAddress.city}, ` : ''}{selectedAddress.state} {selectedAddress.pincode ? `• ${selectedAddress.pincode}` : ''}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-amber-800 text-xs font-bold">
                            <FiMapPin className="text-amber-500 shrink-0" />
                            <span>Select your farm location...</span>
                        </div>
                    )}
                </div>

                {/* Booking Summary Card */}
                <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80">
                    <div className="flex items-center gap-2 mb-3.5">
                       <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <FiCheckCircle size={14} />
                       </span>
                       <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Summary</h3>
                    </div>

                    {/* Equipment Snapshot */}
                    <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                        <div className="w-14 h-14 bg-white rounded-xl overflow-hidden shrink-0 border border-slate-200/80 flex items-center justify-center">
                           {equipment.images?.[0] ? (
                             <img src={equipment.images[0]} alt={equipment.name} className="w-full h-full object-cover" />
                           ) : (
                             <FiTruck size={22} className="text-slate-300" />
                           )}
                        </div>
                        <div className="min-w-0 flex-1">
                             <h4 className="text-sm font-black text-slate-900 truncate leading-snug">{equipment.name}</h4>
                             <div className="flex items-center gap-1.5 mt-1">
                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">
                                   {equipment.categoryId?.title || 'Machinery'}
                                </span>
                                {equipment.modelNumber && (
                                   <span className="text-[10px] font-bold text-slate-400 truncate">{equipment.modelNumber}</span>
                                )}
                             </div>
                        </div>
                    </div>

                    {/* Specs & Itemized Pricing Card */}
                    <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
                        {/* Work Specs */}
                        <div className="flex justify-between items-center text-xs">
                           <span className="font-bold text-slate-400">Date</span>
                           <span className="font-black text-slate-800 flex items-center gap-1.5">
                             <FiCalendar className="text-blue-500" size={13} /> {formatDateDisplay(date)}
                           </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                           <span className="font-bold text-slate-400">Slot</span>
                           <span className="font-black text-slate-800 flex items-center gap-1.5">
                             <FiClock className="text-blue-500" size={13} /> {slot}
                           </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                           <span className="font-bold text-slate-400">Duration / Scope</span>
                           <span className="font-black text-slate-800 uppercase">{formatDuration(quantity, rateType)}</span>
                        </div>

                        {/* Itemized Pricing Breakdown */}
                        <div className="pt-3 border-t border-slate-200/90 space-y-2">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            Pricing Breakdown
                          </p>

                          {/* Machine Base Rate */}
                          <div className="flex justify-between items-start text-xs pt-0.5">
                            <div className="space-y-0.5 max-w-[65%]">
                              <p className="font-bold text-slate-800 leading-snug">{equipment.name}</p>
                              <span className="text-[10px] font-medium text-slate-400 block">{formatDuration(quantity, rateType)}</span>
                            </div>
                            <span className="font-black text-slate-900 shrink-0">₹{finalTractorTotal}</span>
                          </div>

                          {/* Selected Implements (Itemized) */}
                          {selectedImplements.map((impl, idx) => {
                            const implCost = typeof impl.total === 'number' ? impl.total : (implementTotal || 0);
                            return (
                              <div key={idx} className="flex justify-between items-start text-xs pt-1">
                                <div className="space-y-0.5 max-w-[65%]">
                                  <p className="font-bold text-slate-800 leading-snug">{impl.title}</p>
                                  <span className="text-[10px] font-medium text-slate-400 block">Attachment</span>
                                </div>
                                <div className="shrink-0 text-right">
                                  {implCost > 0 ? (
                                    <span className="font-black text-slate-900">+ ₹{implCost}</span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      Included (₹0)
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Visiting Fee */}
                          {visitingCharges > 0 && (
                            <div className="flex justify-between items-center text-xs pt-1">
                              <span className="font-bold text-slate-500">Conveyance / Visiting Fee</span>
                              <span className="font-bold text-slate-700">+ ₹{visitingCharges}</span>
                            </div>
                          )}

                          {/* GST */}
                          {tax > 0 && (
                            <div className="flex justify-between items-center text-xs pt-1">
                              <span className="font-bold text-slate-500">
                                GST {gstPercentage ? `(${gstPercentage}%)` : '(5%)'}
                              </span>
                              <span className="font-bold text-slate-700">+ ₹{tax}</span>
                            </div>
                          )}

                          {/* Final Total */}
                          <div className="flex justify-between items-center text-sm pt-2.5 border-t border-slate-200">
                            <span className="font-black text-slate-900">Total Payable</span>
                            <span className="text-base font-black text-slate-900">₹{total}</span>
                          </div>
                        </div>
                    </div>
                </div>

                {/* Payment Logic Card */}
                <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80">
                    <div className="flex items-center gap-2 mb-3">
                       <span className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                          <FiCreditCard size={14} />
                       </span>
                       <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Payment Method</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5">
                        <button 
                          onClick={() => setPaymentMethod('cash')}
                          className={`p-3.5 rounded-xl border-2 flex items-center justify-between transition-all text-left
                            ${paymentMethod === 'cash' ? 'border-emerald-500 bg-emerald-50/50 shadow-xs' : 'border-slate-100 hover:border-slate-200'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${paymentMethod === 'cash' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>₹</div>
                                <span className={`text-xs font-black ${paymentMethod === 'cash' ? 'text-emerald-900' : 'text-slate-600'}`}>Pay After Work (Cash)</span>
                            </div>
                            {paymentMethod === 'cash' && <FiCheckCircle className="text-emerald-500" size={16} />}
                        </button>

                        <button 
                          onClick={() => setPaymentMethod('online')}
                          className={`p-3.5 rounded-xl border-2 flex items-center justify-between transition-all text-left
                            ${paymentMethod === 'online' ? 'border-purple-500 bg-purple-50/50 shadow-xs' : 'border-slate-100 hover:border-slate-200'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${paymentMethod === 'online' ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                    <FiCreditCard className="w-4 h-4" />
                                </div>
                                <span className={`text-xs font-black ${paymentMethod === 'online' ? 'text-purple-900' : 'text-slate-600'}`}>Pay Online</span>
                            </div>
                            {paymentMethod === 'online' && <FiCheckCircle className="text-purple-500" size={16} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Sticky Price Footer */}
            <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md px-5 py-3.5 shadow-xl rounded-t-3xl border-t border-slate-200">
                <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Final Amount</p>
                        <h4 className="text-xl font-black text-slate-900 leading-none">₹{total}</h4>
                    </div>
                    <button
                        onClick={() => setShowPaymentConfirmModal(true)}
                        disabled={submitting}
                        className={`px-8 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all
                          ${submitting ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-black text-white active:scale-95 shadow-slate-900/10'}`}
                    >
                        {submitting ? 'Processing...' : 'Confirm Rental'}
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
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
                  onClick={() => setShowPaymentConfirmModal(false)}
                />

                {/* Bottom Sheet */}
                <div className="relative bg-white w-full rounded-t-[32px] shadow-2xl z-10 overflow-hidden" style={{ maxHeight: '90vh' }}>
                  {/* Top accent strip */}
                  <div className="h-1 w-full bg-gradient-to-r from-slate-700 to-slate-900" />

                  {/* Drag pill */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1.5 bg-gray-200 rounded-full" />
                  </div>

                  <div className="px-6 pb-8 pt-2">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="text-lg font-black text-slate-900">Confirm Payment</h3>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Review or change your payment method</p>
                      </div>
                      <button
                        onClick={() => setShowPaymentConfirmModal(false)}
                        className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Amount Banner */}
                    <div className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between bg-slate-50 border border-slate-200">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Amount</p>
                        <p className="text-2xl font-black text-slate-800">₹{total}</p>
                      </div>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-800">
                        <FiTruck className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    {/* Payment Options */}
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Select Payment Method</p>
                    <div className="flex flex-col gap-3 mb-6">
                      {/* Pay After Work (Cash) - shown first as default for machinery */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all text-left ${
                          paymentMethod === 'cash'
                            ? 'border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100'
                            : 'border-slate-100 hover:border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            paymentMethod === 'cash' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-slate-100 text-slate-400'
                          }`}>
                            <FiDollarSign className="w-5 h-5" />
                          </div>
                          <div>
                            <span className={`text-sm font-black block ${ paymentMethod === 'cash' ? 'text-emerald-800' : 'text-slate-600'}`}>Pay After Work (Cash)</span>
                            <span className="text-[10px] font-medium text-slate-400">Pay cash directly to operator</span>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          paymentMethod === 'cash' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-200'
                        }`}>
                          {paymentMethod === 'cash' && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                      </button>

                      {/* Pay Online */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('online')}
                        className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all text-left ${
                          paymentMethod === 'online'
                            ? 'border-purple-500 bg-purple-50/50 shadow-sm shadow-purple-100'
                            : 'border-slate-100 hover:border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            paymentMethod === 'online' ? 'bg-purple-500 text-white shadow-md shadow-purple-200' : 'bg-slate-100 text-slate-400'
                          }`}>
                            <FiCreditCard className="w-5 h-5" />
                          </div>
                          <div>
                            <span className={`text-sm font-black block ${ paymentMethod === 'online' ? 'text-purple-800' : 'text-slate-600'}`}>Pay Online</span>
                            <span className="text-[10px] font-medium text-slate-400">UPI · Cards · Netbanking</span>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          paymentMethod === 'online' ? 'border-purple-500 bg-purple-500' : 'border-slate-200'
                        }`}>
                          {paymentMethod === 'online' && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                      </button>
                    </div>

                    {/* Confirm Button */}
                    <button
                      onClick={() => {
                        setShowPaymentConfirmModal(false);
                        setTimeout(() => handleConfirmBooking(), 150);
                      }}
                      disabled={submitting}
                      className="w-full py-4 rounded-2xl text-white font-black text-sm tracking-wide transition-all active:scale-95 shadow-lg"
                      style={{
                        background: paymentMethod === 'online'
                          ? 'linear-gradient(135deg, #7c3aed, #9333ea)'
                          : 'linear-gradient(135deg, #059669, #10b981)',
                        boxShadow: paymentMethod === 'online'
                          ? '0 8px 24px #7c3aed44'
                          : '0 8px 24px #05966944'
                      }}
                    >
                      {submitting ? 'Processing...' : paymentMethod === 'online'
                        ? `✦ Proceed to Pay ₹${total}`
                        : `✦ Confirm Rental (Cash) ₹${total}`}
                    </button>

                    <p className="text-center text-[10px] text-slate-400 font-medium mt-3">
                      🔒 Your rental is secured & protected
                    </p>
                  </div>
                </div>
              </div>
            )}
        </div>
    );
};

export default MachineryCheckout;
