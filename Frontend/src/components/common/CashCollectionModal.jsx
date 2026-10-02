import React, { useState, useEffect, useRef } from 'react';
import {
  FiX, FiPlus, FiTrash2, FiCreditCard, FiClock, FiCheck,
  FiDollarSign, FiPlusCircle, FiShield, FiCheckCircle, FiRefreshCw
} from 'react-icons/fi';
import { toastManager } from '../../utils/toastManager';
import api from '../../services/api';

/**
 * CashCollectionModal (Common)
 * A unified component for collecting cash payments OR presenting AgroYilt Admin Dynamic UPI QR
 * with support for extra items/services and instant settlements.
 */
const CashCollectionModal = ({
  isOpen,
  onClose,
  booking,
  onConfirm,
  onInitiateOTP,
  loading
}) => {
  const [paymentMode, setPaymentMode] = useState('cash'); // 'cash' or 'qr'
  const [extraItems, setExtraItems] = useState([]);
  const [showOTPInput, setShowOTPInput] = useState(false);
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastInitiatedTotal, setLastInitiatedTotal] = useState(0);

  // QR Payment State
  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [qrSuccess, setQrSuccess] = useState(false);
  const pollingTimerRef = useRef(null);

  const bookingId = booking?._id || booking?.id;

  const baseAmount = parseFloat(booking?.finalAmount) || parseFloat(booking?.price) || 0;
  const totalExtra = extraItems.reduce((sum, item) => {
    const price = parseFloat(item.price);
    const qty = parseFloat(item.qty);
    const itemTotal = (isNaN(price) ? 0 : price) * (isNaN(qty) ? 1 : qty);
    return sum + itemTotal;
  }, 0);
  const finalTotal = baseAmount + totalExtra;

  // Clear state only when switching to a different booking
  useEffect(() => {
    setExtraItems([]);
    setShowOTPInput(false);
    setOtp('');
    setSubmitting(false);
    setLastInitiatedTotal(0);
    setPaymentMode('cash');
    setQrData(null);
    setQrError(null);
    setQrSuccess(false);
    setUtrNumber('');
  }, [booking?._id, booking?.id]);

  // Handle switching to QR payment mode
  useEffect(() => {
    if (isOpen && paymentMode === 'qr' && bookingId && !qrData && !qrLoading) {
      fetchAdminQr();
    }
  }, [isOpen, paymentMode, bookingId]);

  // Polling for QR payment completion while QR mode is open
  useEffect(() => {
    if (isOpen && paymentMode === 'qr' && qrData && !qrSuccess) {
      if (!pollingTimerRef.current) {
        pollingTimerRef.current = setInterval(async () => {
          try {
            const res = await api.get(`/bookings/cash/${bookingId}/qr-status`);
            if (res.data?.success && res.data.data?.isPaid) {
              clearInterval(pollingTimerRef.current);
              pollingTimerRef.current = null;
              setQrSuccess(true);
              toastManager.success('Payment Received via Admin QR! Wallet credited.');
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
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    }

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [isOpen, paymentMode, qrData, qrSuccess, bookingId]);

  const fetchAdminQr = async () => {
    try {
      setQrLoading(true);
      setQrError(null);
      const res = await api.post(`/bookings/cash/${bookingId}/generate-admin-qr`, {
        amount: finalTotal,
        extraItems
      });
      if (res.data?.success && res.data.data) {
        setQrData(res.data.data);
      } else {
        throw new Error(res.data?.message || 'Failed to generate QR');
      }
    } catch (err) {
      console.error('[Generate Admin QR error]', err);
      setQrError(err?.response?.data?.message || err.message || 'Failed to generate Admin QR');
      toastManager.error('Could not generate dynamic QR. Please retry.');
    } finally {
      setQrLoading(false);
    }
  };

  const handleConfirmQr = async () => {
    try {
      setSubmitting(true);
      const res = await api.post(`/bookings/cash/${bookingId}/confirm-admin-qr`, {
        amount: finalTotal,
        utr: utrNumber
      });
      if (res.data?.success) {
        setQrSuccess(true);
        toastManager.success('Payment Confirmed! Earnings credited to wallet.');
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        throw new Error(res.data?.message || 'Failed to confirm payment');
      }
    } catch (err) {
      toastManager.error(err?.response?.data?.message || err.message || 'Failed to confirm QR payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddItem = () => {
    setExtraItems([...extraItems, { title: '', price: '', qty: 1 }]);
    setQrData(null);
  };

  const handleUpdateItem = (index, field, value) => {
    const newItems = [...extraItems];
    newItems[index][field] = value;
    setExtraItems(newItems);
    setQrData(null);
  };

  const handleRemoveItem = (index) => {
    setExtraItems(extraItems.filter((_, i) => i !== index));
    setQrData(null);
  };

  const handleInitiate = async () => {
    for (const item of extraItems) {
      if (!item.title || !item.price) {
        toastManager.error('Please fill in all extra item details or remove them');
        return;
      }
    }

    try {
      setSubmitting(true);
      await onInitiateOTP(finalTotal, extraItems);
      setLastInitiatedTotal(finalTotal);
      setShowOTPInput(true);
      toastManager.success('OTP sent to customer');
    } catch (error) {
      toastManager.error(error.message || 'Failed to send OTP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!otp || otp.length < 4) {
      toastManager.error('Please enter the 4-digit OTP provided by customer');
      return;
    }

    try {
      setSubmitting(true);
      await onConfirm(finalTotal, extraItems, otp);
      onClose();
    } catch (error) {
      toastManager.error(error.message || 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-scale-up border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {paymentMode === 'qr' ? 'AgroYilt UPI QR' : 'Cash Collection'}
            </h3>
            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">
              {paymentMode === 'qr' ? 'Scan & Pay to AgroYilt Company' : (showOTPInput ? 'Verify customer code' : 'Finalize bill & collect payment')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Payment Mode Selector Tabs */}
        <div className="px-6 pt-4 pb-2 bg-white flex-shrink-0">
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => {
                setPaymentMode('cash');
                setShowOTPInput(false);
              }}
              className={`py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
                paymentMode === 'cash'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>💵 Cash in Hand</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMode('qr')}
              className={`py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
                paymentMode === 'qr'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>📲 Scan Admin QR</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {paymentMode === 'qr' ? (
            /* ── QR PAYMENT MODE ────────────────────────────────────────── */
            <div className="space-y-4">
              {qrSuccess ? (
                <div className="py-8 text-center space-y-3">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
                    <FiCheckCircle size={36} />
                  </div>
                  <h4 className="text-xl font-black text-slate-900">Payment Verified!</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    The payment of <span className="font-bold text-slate-900">₹{finalTotal.toLocaleString()}</span> has been confirmed. Net earnings have been credited to your wallet!
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                      <FiShield size={18} />
                    </div>
                    <div>
                      <h5 className="font-black text-xs text-emerald-950 flex items-center gap-1">
                        Official AgroYilt Company QR
                        <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.2 rounded-full font-bold">100% Secure</span>
                      </h5>
                      <p className="text-[11px] text-emerald-700 font-medium">
                        Payment goes directly to AgroYilt. Earnings will be credited to your wallet without cash dues.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 text-center flex flex-col items-center justify-center relative overflow-hidden">
                    {qrLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center space-y-2">
                        <FiRefreshCw className="animate-spin text-emerald-600" size={32} />
                        <span className="text-xs font-bold text-slate-500">Generating Dynamic UPI QR...</span>
                      </div>
                    ) : qrError ? (
                      <div className="py-8 text-center space-y-2">
                        <p className="text-xs font-bold text-rose-600">{qrError}</p>
                        <button
                          type="button"
                          onClick={fetchAdminQr}
                          className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl"
                        >
                          Retry
                        </button>
                      </div>
                    ) : qrData?.qrCodeDataUrl ? (
                      <div className="space-y-3">
                        <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 inline-block">
                          <img
                            src={qrData.qrCodeDataUrl}
                            alt="AgroYilt Admin Payment QR"
                            className="w-52 h-52 object-contain rounded-xl"
                          />
                        </div>

                        <div className="space-y-1">
                          <p className="text-2xl font-black text-slate-900 tracking-tight">
                            ₹{finalTotal.toLocaleString()}
                          </p>
                          <p className="text-[11px] font-bold text-slate-500">
                            UPI ID: <span className="font-mono text-slate-800">{qrData.adminUpiId}</span>
                          </p>
                        </div>

                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500">
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">GPay</span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">PhonePe</span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">Paytm</span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">BHIM</span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-center gap-2 py-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="text-xs font-bold text-slate-600">
                      Waiting for farmer to scan & pay...
                    </span>
                  </div>

                  <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-2">
                    <label className="text-[11px] font-black text-slate-700 block uppercase">
                      Manual Verification (Optional UTR / Ref)
                    </label>
                    <input
                      type="text"
                      placeholder="Enter 12-digit UTR from customer's screen"
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleConfirmQr}
                      disabled={submitting}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submitting ? 'Verifying Online Payment...' : 'Customer Paid? Confirm Online Payment'}
                      <FiCheck size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── CASH PAYMENT MODE ───────────────────────────────────────── */
            <>
              {/* Base Amount */}
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Service Base Amount</span>
                  <span className="text-xs text-emerald-600">Original booking cost</span>
                </div>
                <div className="text-xl font-bold text-emerald-950">
                  ₹{baseAmount.toFixed(2)}
                </div>
              </div>

              {/* Extra Items */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Extra Services / Items</span>
                  {!showOTPInput && (
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 transition-colors"
                    >
                      <FiPlusCircle className="w-3.5 h-3.5" /> Add Extra
                    </button>
                  )}
                </div>

                {extraItems.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                    <input
                      type="text"
                      placeholder="Item/Service name"
                      value={item.title}
                      disabled={showOTPInput}
                      onChange={(e) => handleUpdateItem(index, 'title', e.target.value)}
                      className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                    />
                    <div className="relative w-24">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                      <input
                        type="number"
                        placeholder="Price"
                        value={item.price}
                        disabled={showOTPInput}
                        onChange={(e) => handleUpdateItem(index, 'price', e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                      />
                    </div>
                    {!showOTPInput && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Total Due Section */}
              <div className="border-t border-gray-100 pt-4 flex justify-between items-baseline">
                <span className="text-sm font-bold text-gray-700">Total Cash Due:</span>
                <span className="text-2xl font-black text-gray-900">₹{finalTotal.toFixed(2)}</span>
              </div>

              {/* OTP Input Section */}
              {showOTPInput && (
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <FiClock className="w-4 h-4 text-emerald-600 animate-pulse" />
                    <span className="text-xs font-bold">Ask customer for the 4-digit code</span>
                  </div>
                  <input
                    type="text"
                    maxLength="6"
                    placeholder="Enter 4-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full text-center tracking-widest text-2xl font-black text-emerald-950 bg-white border border-emerald-300 rounded-xl py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowOTPInput(false)}
                      className="text-[11px] font-bold text-emerald-700 hover:underline"
                    >
                      Need to change amount? Edit Bill
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions for Cash Mode */}
        {paymentMode === 'cash' && (
          <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex-shrink-0">
            {!showOTPInput ? (
              <button
                type="button"
                onClick={handleInitiate}
                disabled={submitting || loading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {submitting ? 'Sending Code...' : 'Finalize Bill & Send OTP'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || loading || !otp}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {submitting ? 'Verifying...' : 'Verify OTP & Record Payment'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CashCollectionModal;
