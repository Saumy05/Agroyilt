import React, { useState, useEffect, useRef } from 'react';
import {
  FiX, FiShield, FiCheckCircle, FiCopy,
  FiExternalLink, FiRefreshCw, FiCheck, FiAlertCircle
} from 'react-icons/fi';
import { toastManager } from '../../../../../utils/toastManager';
import workerBookingService from '../../../../../services/workerBookingService';

/**
 * FarmerQrPaymentModal
 * Allows a farmer to pay their booking bill by scanning AgroYilt Admin's Dynamic UPI QR
 * or opening GPay/PhonePe directly on mobile.
 */
const FarmerQrPaymentModal = ({
  isOpen,
  onClose,
  targetId, // bookingId, assignmentId, or requestId
  amount,
  onPaymentSuccess
}) => {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [utr, setUtr] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const pollingRef = useRef(null);

  useEffect(() => {
    if (isOpen && targetId) {
      setIsSuccess(false);
      setUtr('');
      setError(null);
      fetchQr();
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
  }, [isOpen, targetId, amount]);

  // Polling for automated payment confirmation
  useEffect(() => {
    if (isOpen && targetId && qrData && !isSuccess) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          try {
            const res = await workerBookingService.getAdminPaymentQrStatus(targetId);
            if (res?.success && res.data?.isPaid) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
              setIsSuccess(true);
              toastManager.success('Payment verified successfully!');
              if (onPaymentSuccess) onPaymentSuccess();
              setTimeout(() => {
                onClose();
              }, 2200);
            }
          } catch (e) {
            // Non-fatal polling error
          }
        }, 3000);
      }
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
  }, [isOpen, targetId, qrData, isSuccess]);

  const fetchQr = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await workerBookingService.generateAdminPaymentQr(targetId, amount);
      if (res?.success && res.data) {
        setQrData(res.data);
      } else {
        throw new Error(res?.message || 'Failed to generate Admin QR');
      }
    } catch (err) {
      console.error('[Farmer QR fetch error]', err);
      setError(err?.response?.data?.message || err.message || 'Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmManual = async () => {
    try {
      setConfirming(true);
      const res = await workerBookingService.confirmAdminPaymentQr(targetId, utr, amount);
      if (res?.success) {
        setIsSuccess(true);
        toastManager.success('Payment confirmed! Work marked completed.');
        if (onPaymentSuccess) onPaymentSuccess();
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        throw new Error(res?.message || 'Failed to confirm payment');
      }
    } catch (err) {
      toastManager.error(err?.response?.data?.message || err.message || 'Verification failed. Please check UTR or retry.');
    } finally {
      setConfirming(false);
    }
  };

  const copyUpiId = () => {
    if (qrData?.adminUpiId) {
      navigator.clipboard?.writeText(qrData.adminUpiId);
      toastManager.success('UPI ID copied to clipboard');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[11000] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-opacity">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300 max-h-[90vh] flex flex-col border border-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/60">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-1.5">
              <span>Pay Online via UPI QR</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
              Official AgroYilt Company Account
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200/60 rounded-full transition-colors"
          >
            <FiX className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {isSuccess ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
                <FiCheckCircle size={36} />
              </div>
              <h4 className="text-xl font-black text-slate-900">Payment Successful!</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Your payment of <span className="font-bold text-slate-900">₹{(qrData?.amount || amount || 0).toLocaleString()}</span> has been confirmed. The booking has been marked complete.
              </p>
            </div>
          ) : (
            <>
              {/* Trust Badge */}
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                  <FiShield size={18} />
                </div>
                <div>
                  <h5 className="font-black text-xs text-emerald-950 flex items-center gap-1">
                    AgroYilt Secure Platform Payment
                    <span className="text-[9px] bg-emerald-200 text-emerald-800 px-1.5 py-0.2 rounded-full font-bold">Verified ✓</span>
                  </h5>
                  <p className="text-[11px] text-emerald-700 font-medium">
                    Payment is received directly into AgroYilt company account and workers are settled digitally.
                  </p>
                </div>
              </div>

              {/* QR Image Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 text-center flex flex-col items-center justify-center relative">
                {loading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-2">
                    <FiRefreshCw className="animate-spin text-emerald-600" size={32} />
                    <span className="text-xs font-bold text-slate-500">Generating Secure UPI QR...</span>
                  </div>
                ) : error ? (
                  <div className="py-8 text-center space-y-2">
                    <p className="text-xs font-bold text-rose-600">{error}</p>
                    <button
                      type="button"
                      onClick={fetchQr}
                      className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl"
                    >
                      Retry
                    </button>
                  </div>
                ) : qrData?.qrCodeDataUrl ? (
                  <div className="space-y-3 w-full">
                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 inline-block mx-auto">
                      <img
                        src={qrData.qrCodeDataUrl}
                        alt="AgroYilt Payment QR"
                        className="w-52 h-52 object-contain rounded-xl"
                      />
                    </div>

                    <div className="space-y-1">
                      <p className="text-3xl font-black text-slate-900 tracking-tight">
                        ₹{(qrData.amount || amount || 0).toLocaleString()}
                      </p>
                      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                        <span>UPI ID:</span>
                        <span className="font-mono font-bold text-slate-800">{qrData.adminUpiId}</span>
                        <button
                          type="button"
                          onClick={copyUpiId}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                          title="Copy UPI ID"
                        >
                          <FiCopy size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Direct App Link Button (Mobile) */}
                    {qrData.upiUri && (
                      <div className="pt-2">
                        <a
                          href={qrData.upiUri}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          <span>Open in GPay / PhonePe / Paytm</span>
                          <FiExternalLink size={14} />
                        </a>
                      </div>
                    )}

                    {/* Supported Apps List */}
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">Google Pay</span>
                      <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">PhonePe</span>
                      <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">Paytm</span>
                      <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">BHIM</span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Pulsing Status */}
              <div className="flex items-center justify-center gap-2 py-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-xs font-bold text-slate-600">
                  Awaiting payment confirmation...
                </span>
              </div>

              {/* Manual Confirmation / UTR fallback */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="text-[11px] font-black text-slate-700 block uppercase">
                  Already Paid? Enter UPI Ref / UTR (Optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="12-digit UTR number"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleConfirmManual}
                    disabled={confirming}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs active:scale-95 disabled:opacity-50"
                  >
                    {confirming ? 'Checking...' : 'I Have Paid'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FarmerQrPaymentModal;
