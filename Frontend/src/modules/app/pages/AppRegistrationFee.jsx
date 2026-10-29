import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toastManager } from '../../../utils/toastManager';
import api from '../../../services/api';
import { FiChevronLeft, FiCheckCircle, FiShield } from 'react-icons/fi';
import authStorage from '../../../utils/authStorage';

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

const AppRegistrationFee = () => {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feeData, setFeeData] = useState(null);

  const preAuthToken = sessionStorage.getItem('preAuthToken') || localStorage.getItem('preAuthToken');
  const pendingRole = sessionStorage.getItem('pendingRole') || localStorage.getItem('pendingRole');

  useEffect(() => {
    if (!preAuthToken || !pendingRole) {
      navigate('/app/login', { replace: true });
      return;
    }

    fetchFeeConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFeeConfig = async () => {
    try {
      const res = await api.get(`/fees/config/${pendingRole}`);
      if (res.data?.success) {
        const config = res.data.config;
        setFeeData(config);
        // If fee is 0 or not configured, auto-activate immediately without displaying fee screen/popup
        if (!config || Number(config.amount) <= 0) {
          await autoApproveZeroFee();
          return;
        }
      }
    } catch (error) {
      console.error('Error fetching fee config:', error);
      toastManager.error('Failed to load fee configuration. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const autoApproveZeroFee = async () => {
    setIsProcessing(true);
    try {
      const initRes = await api.post(
        '/fees/initiate-payment',
        {},
        {
          headers: {
            Authorization: `Bearer ${preAuthToken}`
          },
          role: pendingRole
        }
      );
      if (initRes.data?.autoApproved || initRes.data?.success) {
        handlePaymentSuccess(initRes.data);
      }
    } catch (error) {
      console.error('Auto zero fee approval error:', error);
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!feeData) return;
    setIsProcessing(true);

    try {
      // 1. Ensure Razorpay SDK is loaded
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        toastManager.error('Razorpay SDK failed to load. Please check your connection.');
        setIsProcessing(false);
        return;
      }

      // 2. Initiate payment
      const initRes = await api.post(
        '/fees/initiate-payment',
        {},
        { 
          headers: { 
            Authorization: `Bearer ${preAuthToken}`
          },
          role: pendingRole
        }
      );

      if (initRes.data.autoApproved) {
        // Zero fee case
        handlePaymentSuccess(initRes.data);
        return;
      }

      const { order, paymentRecordId, customer } = initRes.data;

      // Only include valid non-empty prefill fields (empty strings cause Razorpay 400 Bad Request)
      const prefill = {};
      if (customer?.name?.trim()) prefill.name = customer.name.trim();
      if (customer?.phone?.trim()) prefill.contact = customer.phone.trim();
      if (customer?.email?.trim()) prefill.email = customer.email.trim();

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'AgroYilt',
        description: `${pendingRole} Registration Fee`,
        order_id: order.id,
        handler: async (response) => {
          await verifyPayment(response, paymentRecordId);
        },
        ...(Object.keys(prefill).length > 0 ? { prefill } : {}),
        theme: {
          color: '#2E7D32'
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
            toastManager.error('Payment cancelled');
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        setIsProcessing(false);
        const failMsg = response.error?.description || 'Payment failed. Please try another method.';
        toastManager.error(failMsg);
      });
      rzp.open();
    } catch (error) {
      console.error('Payment initiation error:', error);
      const errMsg = error.response?.data?.message || 'Failed to initiate payment.';
      toastManager.error(errMsg);
      setIsProcessing(false);
      if (error.response?.status === 401) {
        setTimeout(() => {
          navigate('/app/login', { replace: true });
        }, 2500);
      }
    }
  };

  const verifyPayment = async (razorpayResponse, paymentRecordId) => {
    try {
      toastManager.loading('Verifying payment...');
      const verifyRes = await api.post(
        '/fees/verify-payment',
        {
          razorpay_order_id: razorpayResponse.razorpay_order_id,
          razorpay_payment_id: razorpayResponse.razorpay_payment_id,
          razorpay_signature: razorpayResponse.razorpay_signature,
          paymentRecordId
        },
        { 
          headers: { 
            Authorization: `Bearer ${preAuthToken}`
          },
          role: pendingRole
        }
      );

      toastManager.dismiss();
      if (verifyRes.data?.success) {
        handlePaymentSuccess(verifyRes.data);
      }
    } catch (error) {
      toastManager.dismiss();
      console.error('Payment verification error:', error);
      toastManager.error(error.response?.data?.message || 'Payment verification failed.');
      setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = (data) => {
    toastManager.success('Payment successful! Welcome aboard.');
    
    // Determine the exact role to get the right storage keys
    const roleMap = {
      'USER': {
        access: 'accessToken',
        refresh: 'refreshToken',
        dataKey: 'userData',
        profile: data.user,
        route: '/user'
      },
      'VENDOR': {
        access: 'vendorAccessToken',
        refresh: 'vendorRefreshToken',
        dataKey: 'vendorData',
        profile: data.vendor,
        route: '/vendor/dashboard'
      },
      'WORKER': {
        access: 'workerAccessToken',
        refresh: 'workerRefreshToken',
        dataKey: 'workerData',
        profile: data.worker,
        route: '/worker/dashboard'
      }
    };

    const target = roleMap[pendingRole];
    if (target) {
      const canonicalRole = pendingRole.toLowerCase();
      authStorage.setAuthSession(canonicalRole, {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: target.profile || { role: canonicalRole }
      });
    }

    sessionStorage.removeItem('preAuthToken');
    sessionStorage.removeItem('pendingRole');
    localStorage.removeItem('preAuthToken');
    localStorage.removeItem('pendingRole');

    // Route to appropriate dashboard
    if (target?.route) {
      navigate(target.route, { replace: true });
    } else {
      navigate('/app/login', { replace: true });
    }
  };

  if (isLoading || isProcessing || (feeData && Number(feeData.amount) <= 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const roleName = pendingRole === 'USER' ? 'Farmer' : pendingRole === 'VENDOR' ? 'Vendor' : 'Worker';

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-50">
      <div className="bg-white px-4 py-4 flex items-center gap-3 sticky top-0 z-20 border-b border-gray-100">
        <button
          onClick={() => {
            localStorage.removeItem('preAuthToken');
            localStorage.removeItem('pendingRole');
            navigate('/app/login', { replace: true });
          }}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <FiChevronLeft className="w-6 h-6 text-gray-700" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Account Activation</h1>
      </div>

      <div className="flex-1 px-5 py-8 max-w-md mx-auto w-full">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-green-100">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiShield className="w-8 h-8 text-green-600" />
          </div>
          
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">Activate {roleName} Account</h2>
          <p className="text-center text-gray-500 mb-6 text-sm">
            Your {roleName} account has been approved by the Admin. A one-time registration fee is required to activate your account and start using the platform.
          </p>

          <div className="bg-gray-50 rounded-xl p-4 mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600 font-medium">Registration Fee</span>
              <span className="text-xl font-bold text-gray-900">₹{feeData?.amount || 0}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 p-2 rounded-lg mt-3">
              <FiCheckCircle className="w-4 h-4 text-green-600" />
              <span>One-time payment for your {roleName} account</span>
            </div>
          </div>

          <button
            onClick={handlePayment}
            disabled={isProcessing || !feeData}
            className="w-full bg-green-600 text-white font-semibold py-4 px-6 rounded-xl shadow-lg shadow-green-200 
                     hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-70 flex justify-center items-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                <span>Processing...</span>
              </>
            ) : (
              <span>Pay ₹{feeData?.amount || 0} Securely</span>
            )}
          </button>

          {import.meta.env.VITE_RAZORPAY_KEY_ID?.startsWith('rzp_test_') && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-800">
              <p className="font-bold text-amber-900 mb-1 flex items-center gap-1">
                <span>🧪</span> Razorpay Test Mode Active:
              </p>
              <ul className="list-disc list-inside space-y-1 text-amber-700">
                <li>
                  Use <strong>Cards</strong>: <code className="bg-amber-100 font-mono px-1 rounded">4111 1111 1111 1111</code> (Exp: 12/28, CVV: 123)
                </li>
                <li>
                  Or use <strong>UPI</strong> ID: <code className="bg-amber-100 font-mono px-1 rounded">success@razorpay</code>
                </li>
                <li>
                  Click <strong>Success</strong> on the Razorpay mock OTP/Auth popup.
                </li>
              </ul>
            </div>
          )}
          
          <p className="text-center text-xs text-gray-400 mt-4">
            Payments are securely processed via Razorpay
          </p>
        </div>
      </div>
    </div>
  );
};

export default AppRegistrationFee;

