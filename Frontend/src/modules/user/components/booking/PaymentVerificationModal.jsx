import React, { useEffect, useState } from 'react';
import { FiCheckCircle, FiShield, FiAlertCircle, FiPackage, FiX, FiInfo } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const PaymentVerificationModal = ({ isOpen, onClose, booking, onPayOnline }) => {
  const [selectedMethod, setSelectedMethod] = useState('online'); // 'online' | 'cash'

  // Prevent background scrolling when modal is open
  // NOTE: Both hooks must be declared BEFORE any conditional returns (Rules of Hooks)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !booking) return null;

  // --- 1. Total & Breakdown Calculations ---
  const isPlanBenefit = booking.paymentMethod === 'plan_benefit';
  const bill = booking.bill;

  // Base Logic (Services)
  // Use bill.originalServiceBase if available (source of truth), else booking.basePrice
  const originalBase = bill ? (bill.originalServiceBase || 0) : (parseFloat(booking.basePrice) || 0);

  // Extra Services (from Vendor Bill) — filter out the original service
  const allBillServices = bill?.services || [];
  const services = allBillServices.filter(s => !s.isOriginal);
  const originalServiceFromBill = allBillServices.find(s => s.isOriginal);

  let extraServiceBase = 0;
  let extraServiceGST = 0;

  services.forEach(s => {
    // s.price is UNIT BASE PRICE. s.total is INCLUSIVE.
    // Use stored values directly to avoid rounding errors or tax assumption mismatches
    const qty = parseFloat(s.quantity) || 1;
    const base = (parseFloat(s.price) || 0) * qty;
    const gst = parseFloat(s.gstAmount) || 0;

    extraServiceBase += base;
    extraServiceGST += gst;
  });

  const totalServiceBase = originalBase + extraServiceBase;

  // Parts & Custom Items (from Vendor Bill)
  const parts = bill?.parts || [];
  const customItems = bill?.customItems || [];

  let partsBase = 0;
  let partsGST = 0;

  // Calculate parts base & GST from stored values
  parts.forEach(p => {
    const qty = parseFloat(p.quantity) || 1;
    partsBase += ((parseFloat(p.price) || 0) * qty);
    partsGST += (parseFloat(p.gstAmount) || 0);
  });

  customItems.forEach(c => {
    const qty = parseFloat(c.quantity) || 1;
    partsBase += ((parseFloat(c.price) || 0) * qty);
    partsGST += (parseFloat(c.gstAmount) || 0);
  });

  // Tax Logic
  // Use bill.originalGST if available
  const originalGST = bill ? (bill.originalGST || 0) : (originalBase * 0.18);
  const totalGST = originalGST + extraServiceGST + partsGST;

  const serviceGstPercent = bill
    ? (bill.payoutConfig?.serviceGstPercentage ?? bill.services?.[0]?.gstPercentage ?? 18)
    : 18;
  const partsGstPercent = bill
    ? (bill.payoutConfig?.partsGstPercentage ?? bill.parts?.[0]?.gstPercentage ?? bill.customItems?.[0]?.gstPercentage ?? 18)
    : 18;

  // Final Total
  // Ideally, use grandTotal from bill if available
  const finalTotal = bill?.grandTotal || (booking.finalAmount || 0);

  // --- 2. Identity Helpers ---
  const categoryName = booking.serviceCategory || 'General';
  // Use new field if present, else fallback
  const brandName = booking.brandName || booking.bookedItems?.[0]?.sectionTitle || '';
  const serviceName = booking.serviceName || 'Service Request';

  // Dynamic Icon
  const CategoryIcon = booking.categoryIcon ? (
    <img src={booking.categoryIcon} alt={categoryName} className="w-full h-full object-cover" />
  ) : (
    <span className="text-2xl font-black uppercase text-white">{categoryName.charAt(0)}</span>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", bounce: 0.3 }}
          className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl relative max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="relative bg-slate-900 border-b border-slate-800 p-5 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <FiX className="w-5 h-5 text-white/80" />
            </button>

            <div className="flex flex-col items-center text-center mt-2">
              <div className="w-14 h-14 bg-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/30 mb-3 text-white overflow-hidden border-2 border-slate-800">
                {CategoryIcon}
              </div>
              <h3 className="text-white font-bold text-lg">Payment Verification</h3>
              <p className="text-slate-400 text-xs mt-1">Review bill and complete payment</p>
            </div>
          </div>

          <div className="p-5 overflow-y-auto custom-scrollbar flex-1">

            {/* Booking Identity Card */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-5 relative overflow-hidden">
              <div className="flex flex-col gap-1 relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                    {categoryName}
                  </span>
                  {brandName && (
                    <div className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      {booking.brandIcon && <img src={booking.brandIcon} alt={brandName} className="w-3 h-3 object-contain" />}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {brandName}
                      </span>
                    </div>
                  )}
                </div>
                <h4 className="text-lg font-bold text-slate-800 leading-tight">
                  {serviceName}
                </h4>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  ID: #{booking.bookingNumber || booking._id?.slice(-8).toUpperCase()}
                </p>
              </div>
              {/* Decorative Icon */}
              <FiPackage className="absolute -bottom-2 -right-2 w-16 h-16 text-slate-100 rotate-[-15deg] z-0" />
            </div>

            {/* Bill Details */}
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Total Amount</p>
                <p className="text-3xl font-black text-slate-900">
                  ₹{finalTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* 1. Services */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FiCheckCircle className="w-3.5 h-3.5 text-teal-500" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Services</span>
                </div>
                <div className="space-y-2 pl-1">
                  {/* Base */}
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>{originalServiceFromBill?.name || booking.serviceName || 'Service'}</span>
                    {isPlanBenefit ? (
                      <div className="flex items-center gap-1.5">
                        <span className="line-through text-slate-400">₹{originalBase.toFixed(2)}</span>
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 rounded">FREE</span>
                      </div>
                    ) : (
                      <span className="font-medium font-mono">₹{originalBase.toFixed(2)}</span>
                    )}
                  </div>
                  {/* Extra Services */}
                  {services.map((s, idx) => (
                    <div key={`s-${idx}`} className="flex justify-between text-xs text-slate-600">
                      <span>{s.name} <span className="text-slate-400">x{s.quantity}</span></span>
                      <span className="font-medium font-mono">₹{((parseFloat(s.price) || 0) * (parseFloat(s.quantity) || 1)).toFixed(2)}</span>
                    </div>
                  ))}

                  {/* Service GST */}
                  <div className="flex justify-between text-xs text-slate-500 border-t border-dashed border-slate-100 pt-1 mt-1">
                    <span>GST ({serviceGstPercent}%)</span>
                    <span className="font-mono">₹{(originalGST + extraServiceGST).toFixed(2)}</span>
                  </div>

                  {/* Service Subtotal */}
                  <div className="flex justify-between text-xs font-bold text-slate-800 pt-1">
                    <span>Total Service</span>
                    <span>₹{(totalServiceBase + originalGST + extraServiceGST).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* 2. Parts (Conditional) */}
              {(parts.length > 0 || customItems.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-2 mt-4">
                    <FiPackage className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Parts & Materials</span>
                  </div>
                  <div className="space-y-2 pl-1">
                    {parts.map((p, idx) => (
                      <div key={`p-${idx}`} className="flex justify-between text-xs text-slate-600">
                        <span>{p.name} <span className="text-slate-400">x{p.quantity}</span></span>
                        <span className="font-medium font-mono">₹{(p.price * p.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {customItems.map((c, idx) => (
                      <div key={`c-${idx}`} className="flex justify-between text-xs text-slate-600">
                        <span>{c.name} <span className="text-slate-400">x{c.quantity}</span></span>
                        <span className="font-medium font-mono">₹{(c.price * c.quantity).toFixed(2)}</span>
                      </div>
                    ))}

                    {/* Parts GST */}
                    <div className="flex justify-between text-xs text-slate-500 border-t border-dashed border-slate-100 pt-1 mt-1">
                      <span>GST ({partsGstPercent}%)</span>
                      <span className="font-mono">₹{partsGST.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-xs font-bold text-slate-800 pt-1">
                      <span>Total Parts</span>
                      <span>₹{(partsBase + partsGST).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Visiting Charges */}
              {(booking.visitingCharges > 0 || bill?.visitingCharges > 0) && (
                <div className="mt-4 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-2 uppercase tracking-wide">
                      <FiInfo className="w-3.5 h-3.5 text-blue-400" /> Visiting Charges
                    </span>
                    <span className="font-mono">₹{(bill?.visitingCharges || booking.visitingCharges || 0).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Platform Fee (admin-set % of the service price) */}
              {(Number(bill?.platformFee) > 0 || Number(booking.platformFee) > 0) && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-2 uppercase tracking-wide">
                      <FiInfo className="w-3.5 h-3.5 text-blue-400" /> Platform Fee{(bill?.payoutConfig?.platformFeePercentage || booking.platformFeePercentage) ? ` (${bill?.payoutConfig?.platformFeePercentage || booking.platformFeePercentage}%)` : ''}
                    </span>
                    <span className="font-mono">₹{Number(bill ? (bill.platformFee || 0) : booking.platformFee).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* 4. Transport Charges */}
              {(bill?.transportCharges > 0) && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-2 uppercase tracking-wide">
                      <FiPackage className="w-3.5 h-3.5 text-blue-400" /> Transport Charges
                    </span>
                    <span className="font-mono">₹{(bill.transportCharges).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 space-y-3">
              {booking.paymentStatus === 'success' ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
                    <FiCheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-emerald-900 font-bold text-sm">Payment Verified</p>
                    <p className="text-emerald-700 text-xs">Transaction completed successfully.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Payment Method Selector */}
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Payment Method</p>
                  <div className="flex gap-2 mb-4">
                    {/* Pay Online */}
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('online')}
                      className={`flex-1 p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                        selectedMethod === 'online'
                          ? 'border-slate-800 bg-slate-900 shadow-md'
                          : 'border-slate-100 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <span className={`text-lg`}>💳</span>
                      <span className={`text-[11px] font-black ${ selectedMethod === 'online' ? 'text-white' : 'text-slate-600'}`}>Pay Online</span>
                      <span className={`text-[9px] font-medium ${ selectedMethod === 'online' ? 'text-slate-300' : 'text-slate-400'}`}>UPI · Cards</span>
                    </button>

                    {/* Pay Cash */}
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('cash')}
                      className={`flex-1 p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                        selectedMethod === 'cash'
                          ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100'
                          : 'border-slate-100 bg-slate-50 hover:border-emerald-200'
                      }`}
                    >
                      <span className="text-lg">💵</span>
                      <span className={`text-[11px] font-black ${ selectedMethod === 'cash' ? 'text-emerald-800' : 'text-slate-600'}`}>Pay Cash</span>
                      <span className={`text-[9px] font-medium ${ selectedMethod === 'cash' ? 'text-emerald-500' : 'text-slate-400'}`}>Pay to Pro</span>
                    </button>
                  </div>

                  {/* Action based on selected method */}
                  {selectedMethod === 'online' ? (
                    <button
                      onClick={onPayOnline}
                      className="w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                    >
                      ✦ Pay Online Securely
                    </button>
                  ) : (
                    // Cash OTP section
                    (booking.customerConfirmationOTP || booking.paymentOtp) ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                        <p className="text-xs font-bold text-emerald-800 mb-1">Share this OTP with the Professional</p>
                        <p className="text-[10px] text-emerald-600 mb-3">Ask them to confirm receipt of cash</p>
                        <div className="bg-white border-2 border-dashed border-emerald-300 rounded-lg py-3 px-4 inline-block mb-2">
                          <span className="text-3xl font-black font-mono text-emerald-700 tracking-[0.25em]">
                            {booking.customerConfirmationOTP || booking.paymentOtp}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">🔒 OTP confirms your cash payment to the professional</p>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                        <p className="text-xs font-bold text-amber-800">Cash OTP not available yet</p>
                        <p className="text-[10px] text-amber-600 mt-1">OTP will appear here once work is completed</p>
                      </div>
                    )
                  )}
                </>
              )}
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PaymentVerificationModal;
