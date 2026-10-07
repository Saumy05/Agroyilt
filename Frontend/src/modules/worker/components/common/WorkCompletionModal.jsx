import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiTrash, FiCamera, FiImage, FiDollarSign, FiCheckCircle, FiKey } from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import flutterBridge from '../../../../utils/flutterBridge';
import { toastManager } from '../../../../utils/toastManager';
import { compressImage, fileToBase64 } from '../../../../utils/imageCompression';
import { rupees, paymentLineLabel } from '../../../../utils/workerPayment';

const WorkCompletionModal = ({ isOpen, onClose, job, onComplete, loading, onOpenQrModal }) => {
  const [workPhotos, setWorkPhotos] = useState([]);
  const [completionOtp, setCompletionOtp] = useState(['', '', '', '']);
  const [isUploading, setIsUploading] = useState(false);
  const [showSourceSheet, setShowSourceSheet] = useState(false);
  const [cashCollectedConfirmed, setCashCollectedConfirmed] = useState(false);

  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const otpInputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...completionOtp];
    newOtp[index] = value.slice(-1);
    setCompletionOtp(newOtp);

    // Focus next box
    if (value && index < 3) {
      otpInputRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !completionOtp[index] && index > 0) {
      otpInputRefs[index - 1].current?.focus();
    }
  };

  const handleNativeCamera = async () => {
    try {
      setIsUploading(true);
      const file = await flutterBridge.openCamera();
      if (file) {
        try {
          const compressed = await compressImage(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.7 });
          const base64 = await fileToBase64(compressed);
          setWorkPhotos(prev => [...prev, base64]);
        } catch (compErr) {
          const base64 = await fileToBase64(file);
          setWorkPhotos(prev => [...prev, base64]);
        }
        flutterBridge.hapticFeedback('success');
      }
    } catch (error) {
      console.error('Native camera failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        try {
          const compressed = await compressImage(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.7 });
          return await fileToBase64(compressed);
        } catch (compErr) {
          return await fileToBase64(file);
        }
      });

      const urls = await Promise.all(uploadPromises);
      setWorkPhotos(prev => [...prev, ...urls]);
    } catch (err) {
      console.error('Photo upload failed:', err);
      toastManager.error('Failed to process photos. Please try again.');
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemovePhoto = (index) => {
    setWorkPhotos(prev => prev.filter((_, i) => i !== index));
    flutterBridge.hapticFeedback('light');
  };

  useEffect(() => {
    if (isOpen) {
      setCashCollectedConfirmed(false);
      setCompletionOtp(['', '', '', '']);
    }
  }, [isOpen]);

  const calculateTotal = () => {
    // For Plan Benefit, user only pays for Extra Charges
    if (job?.paymentMethod === 'plan_benefit') {
      return job?.extraChargesTotal || 0;
    }

    // For normal bookings, prefer finalAmount (even if 0)
    if (typeof job?.finalAmount === 'number') {
      return job.finalAmount;
    }

    return ((job?.basePrice || 0) + (job?.tax || 0) - (job?.discount || 0));
  };

  const isCashBooking = job?.paymentMethod === 'cash' || Boolean(job?.isCashBooking) || Boolean(job?.cashCollection?.isCashBooking);
  const cashToCollect = typeof job?.cashCollection?.totalToCollect === 'number'
    ? job.cashCollection.totalToCollect
    : (typeof job?.cashToCollect === 'number'
      ? job.cashToCollect
      : (isCashBooking ? ((job?.finalAmount || 0) + (job?.platformFee || (Math.round((job?.finalAmount || 0) * 0.1)))) : 0));
  const workerWage = typeof job?.cashCollection?.workerWage === 'number'
    ? job.cashCollection.workerWage
    : (typeof job?.finalAmount === 'number' ? job.finalAmount : calculateTotal());
  const platformFee = typeof job?.cashCollection?.platformFee === 'number'
    ? job.cashCollection.platformFee
    : Math.max(0, cashToCollect - workerWage);
  const farmerName = job?.userId?.name || job?.customerName || job?.farmerName || 'the farmer';
  // farmer ⇄ worker jobs: the backend's line-by-line cash breakdown (booked work + each extra-time part)
  const cashLines = Array.isArray(job?.cashCollection?.lines) ? job.cashCollection.lines : [];

  const handleSubmit = () => {
    const otpCode = completionOtp.join('').trim();
    if (otpCode.length < 4) {
      toastManager.error('Please enter the 4-digit Completion OTP given by the farmer');
      return;
    }
    if (isCashBooking && !cashCollectedConfirmed) {
      toastManager.error(`Please confirm you have collected ₹${cashToCollect.toFixed(2)} cash from ${farmerName}`);
      return;
    }
    onComplete(workPhotos, otpCode);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white w-full max-w-md rounded-[24px] shadow-2xl relative z-10 overflow-hidden"
          >
            {/* Header */}
            <div className="px-8 pt-8 pb-4 flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-gray-900 leading-tight">Complete Work</h3>
                <p className="text-xs text-green-600 font-bold uppercase tracking-wider mt-1">Final Step</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 active:scale-95"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>

            <div className="px-8 pb-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">

              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                Please upload proof of work (Camera/Gallery) to confirm completion.
              </p>

              {/* Photo Upload Section */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Work Photos <span className="text-gray-300 font-normal">(Optional)</span></p>
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md font-bold">
                    {workPhotos.length}/5 (Min 1)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {workPhotos.map((photo, index) => (
                    <div key={index} className="aspect-square rounded-2xl bg-gray-100 border border-gray-200 relative overflow-hidden shadow-sm group">
                      <img src={photo} className="w-full h-full object-cover" alt="work" />
                      {/* Subtle gradient overlay for contrast */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/30 pointer-events-none" />
                      {/* Always-visible remove button for mobile & desktop */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePhoto(index);
                        }}
                        className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white active:scale-90 transition-all z-20 cursor-pointer"
                        aria-label="Remove photo"
                        title="Remove photo"
                      >
                        <FiTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {workPhotos.length < 5 && (
                    <button
                      type="button"
                      onClick={() => setShowSourceSheet(true)}
                      className="aspect-square rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 hover:border-green-400 hover:bg-green-50/30 flex flex-col items-center justify-center text-gray-400 hover:text-green-500 cursor-pointer active:scale-95 transition-all"
                    >
                      <FiCamera className="w-7 h-7 mb-1" />
                      <span className="text-[10px] font-bold uppercase">Add / Cam</span>
                    </button>
                  )}
                </div>

                {/* Hidden Inputs */}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={galleryInputRef}
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={cameraInputRef}
                  onChange={handlePhotoUpload}
                  className="hidden"
                />

                {isUploading && <p className="text-blue-500 text-[10px] font-bold mt-2 ml-1 animate-pulse">Uploading photos...</p>}
              </div>

              {/* Quality Checklist (Restored from Vendor Design) */}
              <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700 mb-3">
                  <FiCheckCircle className="w-5 h-5" />
                  <span className="font-bold text-sm">Quality Checklist</span>
                </div>
                <ul className="space-y-2">
                  {[
                    'Double checked the results',
                    'Cleaned up work area',
                    'Customer satisfaction confirmed'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 4-Digit Completion OTP Section */}
              <div className="bg-amber-50/80 p-5 rounded-2xl border-2 border-amber-200">
                <div className="flex items-center gap-2 text-amber-900 mb-1.5">
                  <FiKey className="w-5 h-5 text-amber-600" />
                  <span className="font-black text-sm">Farmer Completion OTP</span>
                </div>
                <p className="text-xs text-amber-700 mb-3 font-medium">
                  Ask the farmer for the 4-digit Completion OTP displayed on their screen to complete your job and release payment.
                </p>
                <div className="flex justify-center gap-3">
                  {completionOtp.map((digit, index) => (
                    <input
                      key={index}
                      ref={otpInputRefs[index]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      placeholder="•"
                      className="w-12 h-14 text-center font-mono font-black text-2xl bg-white border-2 border-amber-300 rounded-2xl focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100 shadow-sm text-slate-800 placeholder-slate-300 transition-all"
                    />
                  ))}
                </div>
              </div>

              {/* Payment Info */}
              {isCashBooking ? (
                <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/70 rounded-2xl p-4 space-y-3 border-2 border-emerald-400 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md shadow-emerald-600/20 shrink-0">
                        <FaRupeeSign className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded-md">
                          Cash On Service
                        </span>
                        <h4 className="text-xs font-bold text-slate-700 mt-0.5">Collect Cash Directly in Hand</h4>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Collect From Farmer</p>
                      <p className="text-2xl font-black text-emerald-900">₹{cashToCollect.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Cash Breakdown */}
                  {cashLines.length > 0 ? (
                    <div className="bg-white rounded-xl p-3 border border-emerald-200/80 text-xs space-y-2 shadow-xs">
                      {cashLines.map((line, i) => (
                        <div key={i} className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block">{paymentLineLabel(line)}</span>
                            <span className="text-[10px] text-slate-500">
                              Your pay {rupees(line.workerAmount)} + platform fee {rupees(line.platformFee)}
                            </span>
                          </div>
                          <span className="font-bold text-slate-800 shrink-0">{rupees(line.amount)}</span>
                        </div>
                      ))}
                      <div className="pt-1.5 border-t border-slate-100 flex justify-between font-black text-emerald-900">
                        <span>Total cash to collect</span>
                        <span>{rupees(cashToCollect)}</span>
                      </div>
                      <div className="pt-1.5 border-t border-dashed border-slate-200 space-y-1 text-[11px]">
                        <p className="font-bold text-slate-700">After the job, from your wallet:</p>
                        <div className="flex justify-between text-slate-600">
                          <span>Platform fee (collected above)</span>
                          <span>−{rupees(platformFee)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>App commission on your pay</span>
                          <span>−{rupees(job?.cashCollection?.commissionAmount)}</span>
                        </div>
                        <div className="flex justify-between font-black text-emerald-800 pt-1">
                          <span>You keep</span>
                          <span>{rupees(job?.cashCollection?.netEarnings)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                  <div className="bg-white rounded-xl p-3 border border-emerald-200/80 text-xs space-y-1.5 shadow-xs">
                    <div className="flex justify-between text-slate-600 font-medium">
                      <span>Your Work Earnings:</span>
                      <span className="font-bold text-slate-800">₹{workerWage.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 font-medium">
                      <span>Platform Fee (collect for app):</span>
                      <span className="font-bold text-emerald-700">+₹{platformFee.toFixed(2)}</span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-100 flex justify-between font-black text-emerald-900 text-xs">
                      <span>Total Cash to Collect in Hand:</span>
                      <span>₹{cashToCollect.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-amber-700 font-semibold pt-1 border-t border-dashed border-slate-100 leading-tight">
                      ℹ️ The ₹{platformFee.toFixed(2)} platform fee will be adjusted from your wallet balance upon completion.
                    </p>
                  </div>
                  )}

                  {/* Mandatory Cash Collection Confirmation Checkbox */}
                  <label className="flex items-start gap-3 p-3 bg-white rounded-xl border-2 border-emerald-500 cursor-pointer select-none hover:bg-emerald-50/50 transition-colors shadow-xs">
                    <input
                      type="checkbox"
                      checked={cashCollectedConfirmed}
                      onChange={(e) => {
                        setCashCollectedConfirmed(e.target.checked);
                        flutterBridge.hapticFeedback('medium');
                      }}
                      className="w-5 h-5 mt-0.5 rounded-lg border-2 border-emerald-500 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600 shrink-0"
                    />
                    <div className="flex-1 text-xs">
                      <span className="font-black text-slate-900 block leading-tight">
                        I confirm I have received ₹{cashToCollect.toFixed(2)} cash from {farmerName}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium mt-0.5 block">
                        Do not complete without receiving physical cash in hand.
                      </span>
                    </div>
                  </label>

                  {/* Switch to Dynamic Admin QR option */}
                  {onOpenQrModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenQrModal();
                      }}
                      className="w-full py-2.5 px-3 bg-white hover:bg-emerald-50 border-2 border-emerald-400 text-emerald-800 font-black text-xs rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xs"
                    >
                      <span>📲 Farmer prefers UPI? Show Admin QR (Zero Dues)</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Bill Value</p>
                    <p className="text-lg font-black text-gray-800">₹{calculateTotal().toFixed(2)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-green-600 shadow-sm">
                    <FiDollarSign className="w-5 h-5" />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="py-4 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || isUploading || (isCashBooking && !cashCollectedConfirmed) || completionOtp.join('').trim().length < 4}
                  className="py-4 rounded-xl font-bold text-white shadow-lg shadow-green-500/30 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
                  style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
                >
                  {loading ? 'Confirming...' : (isCashBooking && !cashCollectedConfirmed ? 'Collect Cash First' : 'Complete Work')}
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}

      {/* Photo Source Selection - Mobile Styled Bottom Sheet */}
      <AnimatePresence>
        {showSourceSheet && (
          <div className="fixed inset-0 z-[10000] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSourceSheet(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative bg-white w-full rounded-t-[32px] p-6 pb-12 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-10"
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
              <h4 className="text-center font-bold text-gray-900 mb-6 text-lg">Select Photo Source</h4>

              <div className="grid grid-cols-2 gap-4">
                {/* Camera Option */}
                <button
                  type="button"
                  onClick={() => {
                    setShowSourceSheet(false);
                    if (flutterBridge.isFlutter) {
                      handleNativeCamera();
                    } else {
                      cameraInputRef.current?.click();
                    }
                  }}
                  className="flex flex-col items-center gap-3 p-6 bg-green-50 rounded-2xl border border-green-100 active:scale-95 transition-all"
                >
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-green-200">
                    <FiCamera className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-green-800 text-sm">Take Photo</span>
                </button>

                {/* Gallery Option */}
                <button
                  type="button"
                  onClick={() => {
                    setShowSourceSheet(false);
                    galleryInputRef.current?.click();
                  }}
                  className="flex flex-col items-center gap-3 p-6 bg-blue-50 rounded-2xl border border-blue-100 active:scale-95 transition-all"
                >
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-200">
                    <FiImage className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-blue-800 text-sm">Gallery</span>
                </button>
              </div>

              <button
                onClick={() => setShowSourceSheet(false)}
                className="w-full mt-6 py-3 text-sm font-bold text-gray-400 uppercase tracking-widest"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
};

export default WorkCompletionModal;
