import React, { useState, useEffect, useRef } from 'react';
import {
  FiX, FiPlus, FiTrash2, FiCreditCard, FiClock, FiCheck,
  FiDollarSign, FiPlusCircle, FiShield, FiCheckCircle, FiRefreshCw
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import api from '../../../../services/api';

/**
 * CashCollectionModal (Vendor)
 * A unified component for collecting cash payments OR presenting AgroYilt Admin Dynamic UPI QR
 * with support for extra items/services and instant wallet settlements.
 */
const CashCollectionModal = ({
  isOpen,
  onClose,
  booking,
  onConfirm,
  onInitiateOTP,
  loading,
  defaultMode = 'cash'
}) => {
  const [paymentMode, setPaymentMode] = useState(defaultMode || 'cash'); // 'cash' or 'qr'
  const [extraItems, setExtraItems] = useState([]);
  const [step, setStep] = useState('summary'); // 'summary' or 'otp'
  const [otp, setOtp] = useState(['', '', '', '']);
  const [submitting, setSubmitting] = useState(false);

  // QR Payment State
  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [qrSuccess, setQrSuccess] = useState(false);
  const pollingTimerRef = useRef(null);

  const bookingId = booking?._id || booking?.id;

  // Fix potential undefined issue
  const safeExtraItems = Array.isArray(extraItems) ? extraItems : [];

  // Calculate base amount - For plan_benefit, base is ALWAYS 0 (covered by plan)
  const baseAmount = (() => {
    if (booking?.paymentMethod === 'plan_benefit') {
      return 0;
    }

    const rawFinal = booking?.finalAmount || parseFloat(booking?.price) || 0;
    const existingExtras = booking?.workDoneDetails?.items || [];
    const existingExtrasTotal = existingExtras.reduce((sum, item) => sum + (parseFloat(item.price || 0) * (item.qty || 1)), 0);
    return (booking?.customerConfirmationOTP || booking?.paymentOtp)
      ? Math.max(0, rawFinal - existingExtrasTotal)
      : rawFinal;
  })();

  const totalExtra = safeExtraItems.reduce((sum, item) => sum + (parseFloat(item.price || 0) * (item.qty || 1)), 0);
  const finalTotal = baseAmount + totalExtra;

  // Reset or initialize state
  useEffect(() => {
    if (isOpen) {
      const pStatus = booking?.paymentStatus?.toLowerCase() || '';
      if (pStatus === 'success' || pStatus === 'paid') {
        onClose();
        return;
      }

      const hasOTP = booking?.customerConfirmationOTP || booking?.paymentOtp;
      if (hasOTP) {
        setStep('otp');
        if (booking.workDoneDetails?.items && booking.workDoneDetails.items.length > 0) {
          setExtraItems(booking.workDoneDetails.items);
        }
      } else {
        setStep('summary');
        setExtraItems([]);
        setOtp(['', '', '', '']);
      }

      setPaymentMode(defaultMode || 'cash');
      setSubmitting(false);
      setQrData(null);
      setQrError(null);
      setQrSuccess(false);
      setUtrNumber('');
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
  }, [isOpen, bookingId, booking?.customerConfirmationOTP, booking?.paymentOtp, booking?.paymentStatus]);

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
              toastManager.success('Payment Received via Admin QR! Earnings credited.');
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

  // Auto-verify as last digit enters
  useEffect(() => {
    const otpValue = otp.join('');
    if (otpValue.length === 4 && !submitting && !loading && step === 'otp' && paymentMode === 'cash') {
      handleVerify();
    }
  }, [otp]);

  const handleOtpChange = (index, value) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 3) {
      const nextInput = document.getElementById(`modal-otp-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleInputFocus = (e) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  const handleSendOTP = async () => {
    for (const item of extraItems) {
      if (!item.title || !item.price || parseFloat(item.price) <= 0) {
        toastManager.error('Please provide title and price for all extra items');
        return;
      }
    }

    const isPlanBenefit = booking?.paymentMethod === 'plan_benefit';
    const hasExtras = extraItems.length > 0 && totalExtra > 0;

    if (isPlanBenefit && !hasExtras) {
      setSubmitting(true);
      try {
        await onConfirm(0, [], '0000');
        onClose();
        toastManager.success('Bill finalized successfully!');
      } catch (error) {
        toastManager.error(error?.response?.data?.message || 'Failed to finalize');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      await onInitiateOTP(finalTotal, extraItems);
      setStep('otp');
      toastManager.success('OTP sent to customer');
    } catch (error) {
      toastManager.error(error?.response?.data?.message || 'Failed to send OTP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    const otpString = otp.join('');
    if (otpString.length !== 4) {
      toastManager.error('Please enter 4-digit OTP');
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(finalTotal, extraItems, otpString);
      onClose();
      toastManager.success('Payment recorded successfully');
    } catch (error) {
      toastManager.error(error?.response?.data?.message || 'Invalid OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 bg-black/65 backdrop-blur-sm transition-opacity">
      <div className={`
        bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl 
        animate-in slide-in-from-bottom-4 duration-300
        max-h-[90vh] flex flex-col mb-safe-bottom border border-slate-100
      `}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/70 flex-shrink-0">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {paymentMode === 'qr'
                ? 'AgroYilt UPI QR'
                : (step === 'summary' ? 'Prepare Bill' : 'Verify OTP')}
            </h3>
            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">
              {paymentMode === 'qr'
                ? 'Scan & Pay to AgroYilt Company'
                : (step === 'summary' ? 'Review Bill & Collect Payment' : 'Enter Customer Code')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FiX className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Payment Mode Selector Tabs */}
        <div className="px-6 pt-4 pb-2 bg-white flex-shrink-0">
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl gap-1">
            <button
              type="button"
              id="mode-cash-btn"
              onClick={() => {
                setPaymentMode('cash');
                setStep('summary');
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
              id="mode-qr-btn"
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
        <div className="p-6 overflow-y-auto flex-1">
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
                    The payment of <span className="font-bold text-slate-900">₹{finalTotal.toLocaleString()}</span> has been confirmed. Net earnings have been credited directly to your AgroYilt Wallet!
                  </p>
                </div>
              ) : (
                <>
                  {/* Verified Admin Shield Banner */}
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
                        Payment goes directly to AgroYilt. Your earnings will be credited to your wallet without cash dues.
                      </p>
                    </div>
                  </div>

                  {/* QR Code Container */}
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

                        {/* Supported UPI Apps Badges */}
                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500">
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">GPay</span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">PhonePe</span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">Paytm</span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">BHIM</span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Pulsing Listener Status */}
                  <div className="flex items-center justify-center gap-2 py-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="text-xs font-bold text-slate-600">
                      Waiting for farmer to scan & pay...
                    </span>
                  </div>

                  {/* Manual Confirmation / UTR Input Section */}
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
                      id="confirm-qr-payment-btn"
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
            step === 'summary' ? (
              <>
                {/* Base Amount Section */}
                {booking?.paymentMethod === 'plan_benefit' ? (
                  <div className="bg-emerald-50/50 rounded-2xl p-5 mb-6 border border-emerald-100/50 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                      <FiCheck className="w-12 h-12 text-emerald-600" />
                    </div>
                    <div className="flex justify-between items-center mb-2 relative z-10">
                      <span className="text-sm font-bold text-emerald-800">Base Service Cost</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-600/60 line-through font-medium">₹{(booking?.finalAmount || parseFloat(booking?.price) || 0).toLocaleString()}</span>
                        <span className="text-xs font-black text-emerald-600 bg-white/80 px-2 py-1 rounded-md border border-emerald-100 shadow-sm">FREE ✓</span>
                      </div>
                    </div>
                    <p className="text-[11px] font-medium text-emerald-700">Covered by customer's membership plan</p>
                  </div>
                ) : (
                  <div className="bg-blue-50/50 rounded-2xl p-5 mb-6 border border-blue-100/50">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-blue-800">Booking Amount</span>
                      <span className="text-lg font-bold text-blue-900">₹{baseAmount.toLocaleString()}</span>
                    </div>
                    <p className="text-[11px] text-blue-600/80">Original service booking amount</p>
                  </div>
                )}

                {/* Extra Items Section */}
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Extra Services / Items</h4>
                    <button
                      onClick={handleAddItem}
                      className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <FiPlus className="w-3.5 h-3.5" />
                      Add Extra
                    </button>
                  </div>

                  {extraItems.length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-2xl">
                      <p className="text-xs text-gray-400">No extra charges added yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {extraItems.map((item, index) => (
                        <div key={index} className="flex gap-2 items-start animate-in slide-in-from-right-2 duration-200">
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              placeholder="Service name"
                              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-all"
                              value={item.title}
                              onChange={(e) => handleUpdateItem(index, 'title', e.target.value)}
                            />
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                <input
                                  type="number"
                                  placeholder="Price"
                                  className="w-full pl-7 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                                  value={item.price}
                                  onChange={(e) => handleUpdateItem(index, 'price', e.target.value)}
                                />
                              </div>
                              <div className="w-20">
                                <input
                                  type="number"
                                  placeholder="Qty"
                                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                                  value={item.qty}
                                  onChange={(e) => handleUpdateItem(index, 'qty', e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveItem(index)}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-lg mt-1"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Final Summary Card */}
                <div className="bg-gray-900 rounded-2xl p-6 text-white shadow-xl mt-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <FiCreditCard className="w-16 h-16" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-center mb-4 text-gray-400/80 text-xs font-bold uppercase tracking-widest">
                      <span>Payment Summary</span>
                      <span>Total Due</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        {(() => {
                          const roundedCash = paymentMode === 'cash' ? Math.ceil(finalTotal) : finalTotal;
                          const cashChange = Number((roundedCash - finalTotal).toFixed(2));
                          return (
                            <>
                              <p className="text-3xl font-black tracking-tight">₹{roundedCash.toLocaleString()}</p>
                              {cashChange > 0 && (
                                <p className="text-[11px] text-emerald-400 font-semibold mt-1">
                                  Bill: ₹{finalTotal.toFixed(2)} (+₹{cashChange.toFixed(2)} change ➔ Customer Wallet)
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div className="text-right">
                        <div className="px-2 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded-lg border border-blue-500/30">
                          CASH COLLECTION
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* OTP Verification Step */
              <div className="py-4 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                  <FiClock className="w-8 h-8 animate-pulse" />
                </div>
                <h4 className="font-bold text-gray-900 mb-2">Enter Confirmation Code</h4>
                {(() => {
                  const roundedCash = paymentMode === 'cash' ? Math.ceil(finalTotal) : finalTotal;
                  const cashChange = Number((roundedCash - finalTotal).toFixed(2));
                  return (
                    <p className="text-xs text-gray-500 mb-8 px-4">
                      Ask the customer for the 4-digit code sent to their phone to verify the payment of <span className="font-bold text-gray-900">₹{roundedCash.toLocaleString()}</span>
                      {cashChange > 0 ? ` (₹${cashChange.toFixed(2)} change will be credited to customer's wallet)` : ''}.
                    </p>
                  );
                })()}

                <div className="flex gap-3 justify-center mb-8">
                  {[0, 1, 2, 3].map((i) => (
                    <input
                      key={i}
                      id={`modal-otp-${i}`}
                      type="text"
                      inputMode="numeric"
                      value={otp[i]}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onFocus={handleInputFocus}
                      className="w-12 h-14 border-2 border-gray-100 rounded-xl text-center text-2xl font-bold focus:border-blue-500 focus:outline-none bg-gray-50 transition-all"
                      maxLength={1}
                    />
                  ))}
                </div>

                <button
                  onClick={() => setStep('summary')}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Back to Edit Bill
                </button>
              </div>
            )
          )}
        </div>

        {/* Footer Actions (Only for Cash Mode) */}
        {paymentMode === 'cash' && (
          <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex-shrink-0">
            {step === 'summary' ? (
              <button
                onClick={handleSendOTP}
                disabled={submitting || loading}
                className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 hover:brightness-105"
                style={{
                  background: booking?.paymentMethod === 'plan_benefit' && extraItems.length === 0
                    ? 'linear-gradient(135deg, #10B981, #059669)'
                    : 'linear-gradient(135deg, #3B82F6, #2563EB)',
                  boxShadow: booking?.paymentMethod === 'plan_benefit' && extraItems.length === 0
                    ? '0 8px 16px -4px rgba(16, 185, 129, 0.4)'
                    : '0 8px 16px -4px rgba(59, 130, 246, 0.4)',
                }}
              >
                {submitting ? 'Processing...' : (
                  booking?.paymentMethod === 'plan_benefit' && extraItems.length === 0
                    ? 'Finalize Bill'
                    : 'Send OTP to User'
                )}
                <FiArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleVerify}
                disabled={submitting || loading}
                className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 hover:brightness-105"
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  boxShadow: '0 8px 16px -4px rgba(16, 185, 129, 0.4)',
                }}
              >
                {submitting ? 'Verifying...' : 'Verify & Record Cash'}
                <FiCheck className="w-5 h-5" />
              </button>
            )}
            <p className="text-[10px] text-gray-400 text-center italic mt-3">
              {step === 'summary'
                ? (booking?.paymentMethod === 'plan_benefit' && extraItems.length === 0
                  ? 'No extra charges. Clicking will finalize the bill immediately.'
                  : 'Clicking will finalize the bill and send a 4-digit code to the customer.')
                : 'Enter the code provided by the customer to finalize the transaction.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Internal icon for button
const FiArrowRight = ({ className }) => (
  <svg className={className} stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12 5 19 12 12 19"></polyline>
  </svg>
);

export default CashCollectionModal;
