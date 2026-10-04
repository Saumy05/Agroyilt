import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiShield, FiCheckCircle, FiLoader } from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

const OtpVerificationModal = ({ isOpen, onClose, onVerify, loading, amount }) => {
  const [otp, setOtp] = useState('');
  const inputRef = useRef(null);

  // Auto-focus input on open and lock scroll
  useEffect(() => {
    if (isOpen) {
      setOtp('');
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const timer = setTimeout(() => inputRef.current?.focus(), 120);

      return () => {
        document.body.style.overflow = originalOverflow;
        clearTimeout(timer);
      };
    }
  }, [isOpen]);

  // Auto-trigger verification when 4 digits entered
  useEffect(() => {
    if (otp.length === 4) {
      onVerify(otp);
    }
  }, [otp, onVerify]);

  // Clear OTP on failure
  const prevLoading = useRef(loading);
  useEffect(() => {
    if (prevLoading.current && !loading && isOpen) {
      setOtp('');
      inputRef.current?.focus();
    }
    prevLoading.current = loading;
  }, [loading, isOpen]);

  const handleChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    setOtp(val);
  };

  if (!isOpen) return null;

  const digits = [0, 1, 2, 3].map(i => otp[i] || '');

  const modalContent = (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
        onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 25 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 25 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative border border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white flex flex-col items-center justify-center">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
              <div className="w-48 h-48 bg-white rounded-full -top-12 -left-12 absolute blur-2xl" />
              <div className="w-48 h-48 bg-white rounded-full -bottom-12 -right-12 absolute blur-2xl" />
            </div>

            <button
              onClick={onClose}
              disabled={loading}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-black/20 hover:bg-black/35 backdrop-blur-md rounded-full text-white/90 hover:text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
              aria-label="Close"
            >
              <FiX className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 flex items-center justify-center shadow-md mb-2.5">
              <FiShield className="w-6 h-6 text-white" />
            </div>

            <h2 className="text-white text-base font-black tracking-tight">Customer Payment OTP</h2>
            <p className="text-emerald-100 text-xs mt-0.5 font-medium">Verify Cash Payment Receipt</p>
          </div>

          {/* Amount Badge */}
          {amount !== undefined && amount !== null && (
            <div className="bg-emerald-50/80 border-b border-emerald-100 px-6 py-2.5 flex items-center justify-between">
              <span className="text-xs text-emerald-800 font-bold">Cash to Collect:</span>
              <span className="text-sm font-black text-emerald-950 flex items-center">
                <FaRupeeSign className="w-3 h-3 mr-0.5 text-emerald-700" />
                {Number(amount).toFixed(2)}
              </span>
            </div>
          )}

          {/* Body */}
          <div className="px-6 py-6 space-y-5">
            <div className="text-center">
              <p className="text-gray-600 text-xs leading-relaxed font-medium">
                Ask the farmer for the 4-digit <strong>Payment OTP</strong> shown on their screen to confirm you received the cash.
              </p>
            </div>

            {/* Hidden Input for Native Keyboards */}
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={otp}
                onChange={handleChange}
                disabled={loading}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                autoComplete="one-time-code"
              />

              {/* 4 Digit Boxes */}
              <div className="flex justify-center gap-3">
                {digits.map((digit, idx) => {
                  const isCurrent = idx === otp.length;
                  const isFilled = Boolean(digit);
                  return (
                    <div
                      key={idx}
                      className={`w-14 h-16 rounded-2xl flex items-center justify-center text-2xl font-mono font-black transition-all ${
                        isFilled
                          ? 'bg-emerald-50 border-2 border-emerald-500 text-emerald-900 shadow-sm'
                          : isCurrent
                          ? 'bg-white border-2 border-teal-500 shadow-md ring-4 ring-teal-100 text-gray-900'
                          : 'bg-gray-50 border-2 border-gray-200 text-gray-400'
                      }`}
                    >
                      {digit ? digit : (isCurrent && !loading ? <span className="w-1.5 h-6 bg-teal-600 rounded-full animate-pulse" /> : '')}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status / Indicator */}
            <div className="flex items-center justify-center min-h-[24px]">
              {loading ? (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                  <FiLoader className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying payment OTP...</span>
                </div>
              ) : otp.length === 4 ? (
                <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700">
                  <FiCheckCircle className="w-3.5 h-3.5" />
                  <span>Submitting verification...</span>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 font-medium text-center">
                  Auto-verifies as soon as you type 4 digits
                </p>
              )}
            </div>

            {/* Safety Guarantee */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-gray-500">
                🔒 Once verified, the booking will be marked <strong>Completed</strong> and payout will be credited to your wallet.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

export default OtpVerificationModal;
