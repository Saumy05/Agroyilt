import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FiArrowLeft, FiShield, FiLock, FiCheckCircle, FiAlertCircle, FiCreditCard, FiDollarSign } from 'react-icons/fi';
import toast from 'react-hot-toast';
import workerBookingService from '../../../../services/workerBookingService';
import authStorage from '../../../../utils/authStorage';

const WorkerSelectionPayment = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('online'); // 'online' | 'cash'

  const handleCashConfirm = async () => {
    try {
      setProcessing(true);
      toast.loading('Confirming booking with Cash on Service...', { id: 'cash-toast' });
      const res = await workerBookingService.confirmWorkerBookingCash(id);
      if (res && res.success) {
        toast.success('Booking Confirmed! Pay cash to worker upon completion.', { id: 'cash-toast' });
        navigate(`/user/farmer-worker-request/${id}`);
      } else {
        toast.error(res?.message || 'Failed to confirm booking.', { id: 'cash-toast' });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to confirm booking with cash.', { id: 'cash-toast' });
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await workerBookingService.getFarmerRequestById(id);
        if (res.data.paymentStatus === 'success') {
          navigate(`/user/farmer-worker-request/${id}`);
          return;
        }
        setRequest(res.data);
      } catch (err) {
        toast.error('Failed to load payment details');
        navigate(-1);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id, navigate]);

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    try {
      setProcessing(true);
      const isLoaded = await loadRazorpay();
      if (!isLoaded) {
        toast.error('Razorpay SDK failed to load. Are you online?');
        setProcessing(false);
        return;
      }

      // Initialize Payment on Backend
      const orderRes = await workerBookingService.createWorkerBookingPayment(id);
      if (!orderRes.success || !orderRes.data) {
        toast.error(orderRes.message || 'Failed to initialize payment.');
        setProcessing(false);
        return;
      }

      const { orderId, amount, currency } = orderRes.data;
      const razorpayKey = orderRes.data.key || import.meta.env.VITE_RAZORPAY_KEY_ID;

      if (!razorpayKey) {
        toast.error('Razorpay key is not configured.');
        setProcessing(false);
        return;
      }

      const options = {
        key: razorpayKey,
        amount: amount.toString(),
        currency: currency || 'INR',
        name: 'AgroYilt Worker Booking',
        description: `Booking for ${request.workTitle}`,
        order_id: orderId,
        handler: async function (response) {
          try {
            toast.loading('Verifying payment...', { id: 'verify-toast' });

            // Verify Payment on Backend
            await workerBookingService.verifyWorkerBookingPayment(id, {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });

            toast.success('Payment successful! Booking Confirmed.', { id: 'verify-toast' });
            navigate(`/user/farmer-worker-request/${id}`);
          } catch (verifyErr) {
            toast.error(verifyErr?.response?.data?.message || 'Payment verification failed', { id: 'verify-toast' });
            setProcessing(false);
          }
        },
        prefill: {
          name: request.farmerId?.name || (authStorage.getUserData('user')?.name) || 'AgroYilt User',
          contact: request.farmerId?.phone || (authStorage.getUserData('user')?.phone) || '',
        },
        theme: {
          color: '#059669', // Emerald-600
        },
        modal: {
          ondismiss: function () {
            toast.error('Payment cancelled');
            setProcessing(false);
          }
        }
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.on('payment.failed', function (resp) {
        toast.error(`Payment failed: ${resp.error?.description || 'Transaction unsuccessful'}`);
        setProcessing(false);
      });
      paymentObject.open();

    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to initialize payment');
      setProcessing(false);
    }
  };

  if (loading || !request) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const financials = request.financialSnapshot;
  if (!financials) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <FiAlertCircle size={40} className="text-red-500 mb-4" />
        <h2 className="text-xl font-black text-slate-800 mb-2">Financial details missing</h2>
        <p className="text-slate-500 mb-6 text-center">Please go back and select workers again.</p>
        <button onClick={() => navigate(-1)} className="px-6 py-2 bg-slate-800 text-white rounded-full font-bold">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Helmet><title>Complete Payment | AgroYilt</title></Helmet>

      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            disabled={processing}
            className="w-10 h-10 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center active:scale-95 transition-transform"
          >
            <FiArrowLeft size={20} />
          </button>
          <h1 className="font-black text-lg text-slate-800">Secure Payment</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4 mt-2">
        {/* Bill Summary */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
              <FiShield size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Payment Summary</h2>
              <p className="text-xs font-bold text-slate-500">Lock in your maximum budget</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-600">Selected Workers</span>
              <span className="text-sm font-black text-slate-800">{financials.selectedWorkerCount}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-600">Max Rate per Worker</span>
              <span className="text-sm font-black text-slate-800">
                ₹{financials.maximumBudget}
                <span className="text-xs text-slate-400 font-normal ml-1">
                  {financials.bookingType === 'DAILY' ? '/day' : '/hr'}
                </span>
              </span>
            </div>

            {financials.durationMinutes ? (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-600">Booking Duration</span>
                <span className="text-sm font-black text-slate-800">
                  {(() => {
                    const totalMins = Number(financials.durationMinutes);
                    const h = Math.floor(totalMins / 60);
                    const m = Math.round(totalMins % 60);
                    if (h > 0 && m > 0) return `${h} hr ${m} min`;
                    if (h > 0) return `${h} hour${h > 1 ? 's' : ''}`;
                    return `${m} min${m > 1 ? 's' : ''}`;
                  })()}
                </span>
              </div>
            ) : financials.numberOfDays ? (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-600">Working Days</span>
                <span className="text-sm font-black text-slate-800">{financials.numberOfDays} day(s)</span>
              </div>
            ) : null}

            <div className="flex justify-between items-center pt-2">
              <div>
                <span className="text-sm font-medium text-slate-600 block">Worker Payment Reserve</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {financials.bookingType === 'DAILY'
                    ? `₹${financials.maximumBudget} × ${financials.selectedWorkerCount} × ${financials.numberOfDays || 1} day(s)`
                    : `₹${financials.maximumBudget} × ${financials.selectedWorkerCount} × ${Number(((financials.durationMinutes || 60) / 60).toFixed(2))} hr(s)`}
                </span>
              </div>
              <span className="text-sm font-black text-slate-800">₹{financials.maximumWorkerAmount}</span>
            </div>

            {financials.platformChargeAmount > 0 && (
              <div className="flex justify-between items-center text-amber-600">
                <span className="text-sm font-medium">Platform Fee ({financials.platformChargeRate}%)</span>
                <span className="text-sm font-black">₹{financials.platformChargeAmount}</span>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">Total Payable</p>
              <p className="text-3xl font-black text-emerald-600">₹{financials.totalPayable}</p>
            </div>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="font-black text-sm text-slate-800">Choose Payment Method</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod('online')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                paymentMethod === 'online'
                  ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <FiCreditCard className={paymentMethod === 'online' ? 'text-emerald-600' : 'text-slate-400'} size={20} />
                {paymentMethod === 'online' && <FiCheckCircle className="text-emerald-600" size={16} />}
              </div>
              <p className="font-bold text-xs text-slate-900">Pay Online</p>
              <p className="text-[10px] text-slate-500 mt-0.5">UPI / Card / Netbanking with Auto-Refund</p>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('cash')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                paymentMethod === 'cash'
                  ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <FiDollarSign className={paymentMethod === 'cash' ? 'text-emerald-600' : 'text-slate-400'} size={20} />
                {paymentMethod === 'cash' && <FiCheckCircle className="text-emerald-600" size={16} />}
              </div>
              <p className="font-bold text-xs text-slate-900">Cash on Service</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Pay worker directly upon work completion</p>
            </button>
          </div>
        </div>

        {/* Info Card */}
        {paymentMethod === 'online' ? (
          <div className="bg-blue-50 border border-blue-100 rounded-3xl p-5 flex gap-3">
            <FiCheckCircle className="text-blue-500 shrink-0 mt-0.5" size={20} />
            <p className="text-xs text-blue-800 font-medium leading-relaxed">
              <strong className="font-bold">Online Escrow Protection:</strong> Workers may bid lower than your max rate. Any unused amount after work verification is instantly refunded to your AgroYilt wallet.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-5 flex gap-3">
            <FiShield className="text-emerald-600 shrink-0 mt-0.5" size={20} />
            <p className="text-xs text-emerald-800 font-medium leading-relaxed">
              <strong className="font-bold">Pay Cash on Farm:</strong> No advance payment required now. You will pay the worker directly in physical cash when the service is completed and you share the completion OTP.
            </p>
          </div>
        )}

        {paymentMethod === 'online' ? (
          <button
            onClick={handlePayment}
            disabled={processing}
            className="w-full mt-6 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(15,23,42,0.25)] disabled:opacity-75"
          >
            {processing ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <FiLock /> Pay ₹{financials.totalPayable} Securely
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleCashConfirm}
            disabled={processing}
            className="w-full mt-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(5,150,105,0.3)] disabled:opacity-75"
          >
            {processing ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <FiCheckCircle /> Confirm Booking (Cash on Service)
              </>
            )}
          </button>
        )}

      </div>
    </div>
  );
};

export default WorkerSelectionPayment;
