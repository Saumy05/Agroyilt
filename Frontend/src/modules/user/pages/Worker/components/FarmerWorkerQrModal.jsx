import React, { useState, useEffect, useRef } from 'react';
import {
  FiX, FiShield, FiCheckCircle, FiRefreshCw, FiExternalLink, FiCopy, FiCheck
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import workerBookingService from '../../../../../services/workerBookingService';

/**
 * FarmerWorkerQrModal
 * Enables farmers to pay for worker bookings/assignments digitally via AgroYilt Admin Dynamic UPI QR.
 * Automatically verifies status via polling and real-time socket events.
 */
const FarmerWorkerQrModal = ({
  isOpen,
  onClose,
  targetId,
  title = 'Worker Service Payment',
  amount = 0,
  onSuccess
}) => {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef(null);

  useEffect(() => {
    if (isOpen && targetId) {
      setPaid(false);
      setQrData(null);
      setError(null);
      fetchQrCode();
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isOpen, targetId]);

  // Polling for confirmation
  useEffect(() => {
    if (isOpen && targetId && qrData && !paid) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          try {
            const res = await workerBookingService.getAdminPaymentQrStatus(targetId);
            if (res?.success && res.data?.isPaid) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
              setPaid(true);
              toast.success('Payment Verified! Workers have been credited.');
              onSuccess?.();
              setTimeout(() => {
                onClose();
              }, 2500);
            }
          } catch (e) {
            // Non-fatal polling error
          }
        }, 3000);
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isOpen, targetId, qrData, paid]);

  const fetchQrCode = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await workerBookingService.generateAdminPaymentQr(targetId, amount);
      if (res?.success && res.data) {
        setQrData(res.data);
      } else {
        throw new Error(res?.message || 'Failed to generate payment QR');
      }
    } catch (err) {
      console.error('[FarmerWorkerQrModal fetch error]', err);
      setError(err?.response?.data?.message || err.message || 'Unable to generate UPI QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUpi = () => {
    if (!qrData?.adminUpiId) return;
    navigator.clipboard.writeText(qrData.adminUpiId);
    setCopied(true);
    toast.success('UPI ID copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const displayAmount = Number(qrData?.amount || amount || 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', bounce: 0.2 }}
          className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col"
        >
          {/* Header */}
          <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <span className="text-[10px] font-black tracking-wider uppercase text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full inline-block mb-1">
                Official AgroYilt UPI
              </span>
              <h3 className="font-bold text-base truncate">{title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors shrink-0"
              aria-label="Close"
            >
              <FiX size={18} />
            </button>
          </div>

          {/* Content Body */}
          <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {paid ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <FiCheckCircle size={36} />
                </div>
                <h4 className="text-xl font-black text-slate-900">Payment Completed!</h4>
                <p className="text-xs text-slate-600 max-w-xs mx-auto">
                  Payment of <span className="font-bold text-slate-900">₹{displayAmount.toLocaleString('en-IN')}</span> verified.
                  Net wages have been directly credited to the worker's wallet with ₹0 cash dues.
                </p>
              </div>
            ) : (
              <>
                {/* Security Badge */}
                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <FiShield size={18} />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-emerald-950 flex items-center gap-1">
                      Direct & Instant Settlement
                    </h5>
                    <p className="text-[11px] text-emerald-700">
                      Zero cash dues for the worker. Amount goes straight to wages & platform.
                    </p>
                  </div>
                </div>

                {/* QR Code Canvas */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center flex flex-col items-center justify-center">
                  {loading ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-2">
                      <FiRefreshCw className="animate-spin text-emerald-600" size={32} />
                      <span className="text-xs font-bold text-slate-500">Generating Secure Dynamic QR...</span>
                    </div>
                  ) : error ? (
                    <div className="py-8 text-center space-y-2">
                      <p className="text-xs font-bold text-rose-600">{error}</p>
                      <button
                        type="button"
                        onClick={fetchQrCode}
                        className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl"
                      >
                        Retry
                      </button>
                    </div>
                  ) : qrData?.qrCodeDataUrl ? (
                    <div className="space-y-3">
                      <div className="p-2.5 bg-white rounded-2xl shadow-sm border border-slate-200/80 inline-block">
                        <img
                          src={qrData.qrCodeDataUrl}
                          alt="AgroYilt Payment QR"
                          className="w-48 h-48 object-contain rounded-xl"
                        />
                      </div>

                      <div className="space-y-0.5">
                        <p className="text-2xl font-black text-slate-900">
                          ₹{displayAmount.toLocaleString('en-IN')}
                        </p>
                        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600">
                          <span className="font-mono text-slate-800 font-semibold">{qrData.adminUpiId}</span>
                          <button
                            type="button"
                            onClick={handleCopyUpi}
                            className="p-1 text-slate-500 hover:text-slate-800"
                            title="Copy UPI ID"
                          >
                            {copied ? <FiCheck className="text-emerald-600" size={13} /> : <FiCopy size={13} />}
                          </button>
                        </div>
                      </div>

                      {/* Pay via UPI App deep link */}
                      {qrData.upiUri && (
                        <a
                          href={qrData.upiUri}
                          className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                          <span>Open UPI App (GPay / PhonePe / Paytm)</span>
                          <FiExternalLink size={13} />
                        </a>
                      )}

                      {/* Supported UPI Badges */}
                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500">
                        <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">GPay</span>
                        <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">PhonePe</span>
                        <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">Paytm</span>
                        <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">BHIM</span>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Waiting status */}
                <div className="flex items-center justify-center gap-2 py-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-xs font-bold text-slate-600">
                    Listening for payment confirmation...
                  </span>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default FarmerWorkerQrModal;
