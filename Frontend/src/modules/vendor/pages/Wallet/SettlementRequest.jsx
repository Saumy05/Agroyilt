import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle } from 'react-icons/fi';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import vendorWalletService from '../../../../services/vendorWalletService';
import { toastManager } from '../../../../utils/toastManager';

const SettlementRequest = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wallet, setWallet] = useState({ amountDue: 0 });
  const [amount, setAmount] = useState('');

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient;

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  useEffect(() => {
    loadWallet();
    loadRazorpayScript();
  }, []);

  const loadWallet = async () => {
    try {
      setLoading(true);
      const res = await vendorWalletService.getWallet();
      if (res.success) {
        setWallet(res.data);
        setAmount(res.data.amountDue.toString());
      }
    } catch (error) {
      toastManager.error('Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toastManager.error('Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) > wallet.amountDue) {
      toastManager.error(`Amount cannot exceed ₹${wallet.amountDue}`);
      return;
    }

    try {
      setSubmitting(true);
      const orderRes = await vendorWalletService.createSettlementOrder(parseFloat(amount));

      if (!orderRes.success) {
        toastManager.error(orderRes.message || 'Failed to create payment order');
        setSubmitting(false);
        return;
      }

      const { orderId, amount: orderAmount, currency, key } = orderRes.data;

      const options = {
        key: key,
        amount: orderAmount * 100, // paise
        currency: currency,
        name: 'Appzeto',
        description: 'Vendor Settlement',
        order_id: orderId,
        handler: async function (response) {
          try {
            toastManager.info('Verifying payment...', { id: 'verify' });
            const verifyRes = await vendorWalletService.verifySettlementPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: parseFloat(amount)
            });

            if (verifyRes.success) {
              toastManager.success('Payment successful!', { id: 'verify' });
              sessionStorage.removeItem('cash_limit_modal_dismissed');
              navigate('/vendor/wallet', { replace: true });
            } else {
              toastManager.error(verifyRes.message || 'Payment verification failed', { id: 'verify' });
            }
          } catch (err) {
            toastManager.error('Payment verification failed', { id: 'verify' });
          }
        },
        prefill: {
          name: wallet.vendor?.businessName || wallet.vendor?.name || 'Vendor',
        },
        theme: {
          color: themeColors.primary || '#3B82F6'
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        toastManager.error(response.error.description || 'Payment failed');
      });
      
      rzp.open();
      setSubmitting(false);

    } catch (error) {
      toastManager.error('Failed to initiate payment');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: themeColors.backgroundGradient }}>
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${themeColors.button} transparent ${themeColors.button} ${themeColors.button}` }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
      <Header
        title="Pay to Admin"
        showBack={true}
        onBack={() => {
          if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
          } else {
            navigate('/vendor/wallet', { replace: true });
          }
        }}
      />

      <main className="px-4 py-6">
        {/* Amount Due Banner */}
        <div
          className="rounded-2xl p-5 mb-6"
          style={{
            background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
            boxShadow: '0 8px 24px rgba(220, 38, 38, 0.3)'
          }}
        >
          <p className="text-white/80 text-sm mb-1">Total Amount Due</p>
          <p className="text-3xl font-bold text-white">₹{wallet.amountDue?.toLocaleString() || 0}</p>
        </div>

        {/* Settlement Form */}
        <div className="bg-white rounded-2xl p-5 shadow-lg space-y-5">
          {/* Amount */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Settlement Amount *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border-2 border-gray-100 focus:border-blue-400 focus:outline-none"
                placeholder="Enter amount"
                max={wallet.amountDue}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Max: ₹{wallet.amountDue?.toLocaleString()}</p>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handlePayment}
          disabled={submitting || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > wallet.amountDue}
          className="w-full mt-6 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          style={{
            background: '#3399cc', // Razorpay color
            boxShadow: `0 4px 12px rgba(51, 153, 204, 0.4)`,
          }}
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Processing...
            </>
          ) : (
            <>
              <FiCheckCircle className="w-5 h-5" />
              Pay via Razorpay
            </>
          )}
        </button>

        {/* Info */}
        <p className="text-center text-xs text-gray-500 mt-4">
          Your balance will be updated instantly upon successful payment.
        </p>
      </main>

      <BottomNav />
    </div>
  );
};

export default SettlementRequest;
