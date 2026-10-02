import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiCheck, FiTool, FiArrowLeft, FiClock, FiKey, FiCheckCircle, FiShield, FiTag, FiTruck } from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa';
import { toastManager } from '../../../../utils/toastManager';
import vendorBillService from '../../../../services/vendorBillService';
import vendorWalletService from '../../../../services/vendorWalletService';
import { getBookingById } from '../../services/bookingService';
import OtpVerificationModal from './OtpVerificationModal';
import authStorage from '../../../../utils/authStorage';

const BillingPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);

  // OTP State
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  // Settings
  const [payoutSettings, setPayoutSettings] = useState({
    serviceGstPct: 18,
    rentalGstPct: 5,
    partsGstPct: 18,
    servicePayoutPct: 90,
    partsPayoutPct: 100
  });

  // Fetch Data
  useEffect(() => {
    fetchData();
  }, [id]);

  // Scroll to top on mount
  useLayoutEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      if (typeof document !== 'undefined' && document.body) {
        document.body.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    };

    scrollToTop();
    const timer = setTimeout(scrollToTop, 50);
    return () => clearTimeout(timer);
  }, [id, loading]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const bookingRes = await getBookingById(id);
      const bookingData = bookingRes.data || bookingRes;
      setBooking(bookingData);

      if (bookingData.customerConfirmationOTP || bookingData.paymentOtp || ['work_done', 'awaiting_payment'].includes(bookingData.status?.toLowerCase())) {
        setIsOtpSent(true);
      }

      // Load settings from backend bill
      const billRes = await vendorBillService.getBill(id);
      if (billRes.success && billRes.bill) {
        if (billRes.bill.payoutConfig) {
          const pc = billRes.bill.payoutConfig;
          setPayoutSettings({
            serviceGstPct: pc.serviceGstPercentage ?? 18,
            rentalGstPct: 5,
            partsGstPct: pc.partsGstPercentage ?? 18,
            servicePayoutPct: pc.serviceSplitPercentage ?? 90,
            partsPayoutPct: pc.partsSplitPercentage ?? 10
          });
        }
      } else {
        // Fallback global settings
        try {
          const token = authStorage.getAccessToken('vendor');
          const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/vendors/settings`, { headers: { Authorization: `Bearer ${token}` } });
          const data = await res.json();
          if (data.success && data.data?.global) {
            const g = data.data.global;
            setPayoutSettings({
              serviceGstPct: g.serviceGstPercentage ?? 18,
              rentalGstPct: g.rentalGstPercentage ?? 5,
              partsGstPct: g.partsGstPercentage ?? 18,
              servicePayoutPct: g.servicePayoutPercentage ?? 90,
              partsPayoutPct: g.partsPayoutPercentage ?? 10
            });
          }
        } catch (e) { console.error('Error fetching global settings:', e); }
      }
    } catch (error) {
      console.error('Error loading billing data:', error);
      toastManager.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // --- CALCULATIONS (Synchronized with Farmer Checkout) ---
  const calculations = useMemo(() => {
    if (!booking) return null;

    const { serviceGstPct, rentalGstPct, servicePayoutPct } = payoutSettings;

    // Detect agriculture / machinery booking
    const isAgriService = !!(
      booking.rental_type ||
      booking.equipmentId ||
      booking.selectedImplements?.length > 0 ||
      booking.bookedItems?.some(item => 
        item.title?.toLowerCase().includes('tractor') || 
        item.title?.toLowerCase().includes('rotavator') || 
        item.title?.toLowerCase().includes('harvester')
      ) ||
      (booking.serviceCategory && ['machinery', 'agriculture', 'equipment', 'farm equipment'].includes(booking.serviceCategory.toLowerCase()))
    );

    // True GST Rate: Prefer booking's stored gstPercentage, or derive from booking.tax
    const effectiveGstPct = (booking.gstPercentage !== undefined && booking.gstPercentage !== null)
      ? Number(booking.gstPercentage)
      : (booking.tax && booking.basePrice && Number(booking.basePrice) > 0)
      ? Math.round((Number(booking.tax) / Number(booking.basePrice)) * 100)
      : (isAgriService ? (rentalGstPct || 5) : (serviceGstPct || 18));

    // Original booking base
    const isPlanBooking = booking.paymentMethod === 'plan_benefit';
    const originalBase = isPlanBooking ? 0 : Number(booking.basePrice || 0);

    // Exact GST from booking record (or fallback calculation)
    const originalServiceGST = isPlanBooking
      ? 0
      : (booking.tax !== undefined && booking.tax !== null && Number(booking.tax) > 0)
      ? Number(booking.tax)
      : parseFloat(((originalBase * effectiveGstPct) / 100).toFixed(2));

    const visitingCharges = Number(booking.visitingCharges) || 0;

    // Total Bill amount payable by farmer (100% matched to checkout)
    const finalBillAmount = (booking.finalAmount && Number(booking.finalAmount) > 0)
      ? Number(booking.finalAmount)
      : (booking.amount && Number(booking.amount) > 0)
      ? Number(booking.amount)
      : parseFloat((originalBase + originalServiceGST + visitingCharges).toFixed(2));

    // Vendor Earnings (90% Payout on Base Rental)
    const effectivePayoutPct = servicePayoutPct || 90;
    const vendorServiceEarnings = parseFloat(((originalBase * effectivePayoutPct) / 100).toFixed(2));
    const totalVendorEarnings = vendorServiceEarnings;
    const platformCommission = parseFloat((originalBase - vendorServiceEarnings).toFixed(2));

    return {
      originalBase,
      serviceGstPct: effectiveGstPct,
      totalServiceGST: originalServiceGST,
      totalGST: originalServiceGST,
      visitingCharges,
      finalBillAmount,
      totalVendorEarnings,
      vendorServiceEarnings,
      servicePayoutPct: effectivePayoutPct,
      platformCommission,
      isAgriService
    };
  }, [booking, payoutSettings]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const res = await vendorBillService.createOrUpdateBill(id, {
        parts: [],
        customItems: [],
        transportCharges: 0
      });

      if (res.success) {
        toastManager.success('Bill generated successfully!');
        localStorage.removeItem(`billing_step_${id}`);
        localStorage.removeItem(`billing_max_step_${id}`);
        localStorage.removeItem(`billing_data_${id}`);
        navigate(`/vendor/booking/${id}`);
      } else {
        toastManager.error(res.message || 'Failed to generate bill');
        setSubmitting(false);
      }
    } catch (error) {
      console.error('Submit bill error:', error);
      toastManager.error('An error occurred');
      setSubmitting(false);
    }
  };

  const handleSendOTP = async () => {
    try {
      setOtpLoading(true);
      
      // Save bill first ONLY if it hasn't been generated yet
      if (!booking?.vendorBillId) {
        await vendorBillService.createOrUpdateBill(id, {
          parts: [],
          customItems: [],
          transportCharges: 0
        });
      }

      const res = await vendorWalletService.initiateCashCollection(
        id,
        calculations.finalBillAmount,
        []
      );

      if (res.success) {
        setIsOtpSent(true);
        setShowOtpModal(true);
        toastManager.success('OTP sent to customer!');
      } else {
        toastManager.error(res.message || 'Failed to send OTP');
      }
    } catch (error) {
      console.error('Send OTP error:', error);
      toastManager.error('Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async (code) => {
    try {
      setOtpLoading(true);
      const res = await vendorWalletService.confirmCashCollection(
        id,
        calculations.finalBillAmount,
        code,
        []
      );

      if (res.success) {
        setShowOtpModal(false);
        toastManager.success('Payment verified successfully!');
        localStorage.removeItem(`billing_step_${id}`);
        localStorage.removeItem(`billing_max_step_${id}`);
        localStorage.removeItem(`billing_data_${id}`);
        navigate(`/vendor/booking/${id}`);
      } else {
        toastManager.error(res.message || 'Invalid OTP');
      }
    } catch (error) {
      console.error('Verify OTP error:', error);
      toastManager.error('Verification failed');
    } finally {
      setOtpLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-emerald-800">Loading invoice details...</div>;
  if (!booking) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-0 flex flex-col font-sans">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-emerald-950/10 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)} 
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-center text-slate-700 active:scale-95 transition-all border border-slate-200/60 cursor-pointer"
            aria-label="Back"
          >
            <FiArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-black text-slate-900 leading-tight">Farmer Billing & Cash Collection</h1>
            <p className="text-[10px] font-bold text-slate-400">Booking #{booking.bookingNumber || id.slice(-6).toUpperCase()}</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto w-full px-3.5 py-3 space-y-3 pb-40">
        {calculations && (
          <div className="space-y-3">
            {/* Top Total Payable Card (Consistent Brand Aesthetic) */}
            <div className="bg-gradient-to-br from-emerald-800 via-teal-900 to-slate-900 rounded-2xl overflow-hidden shadow-lg border border-emerald-900/30 text-white p-4 text-center relative">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[9px] font-black uppercase tracking-wider text-emerald-300 mb-1.5">
                <FiShield className="w-3 h-3 text-emerald-400" />
                <span>Verified AgroYilt Invoice</span>
              </div>
              
              <p className="text-emerald-100/70 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                Total Cash to Collect from Farmer
              </p>
              
              <h2 className="text-3xl font-black tracking-tight text-white flex items-center justify-center gap-1">
                <span className="text-emerald-300 font-bold text-2xl">₹</span>
                {calculations.finalBillAmount.toFixed(2)}
              </h2>

              <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center justify-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-200/90 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Your Net Take-Home ({calculations.servicePayoutPct}%):{' '}
                  <strong className="text-white font-black text-sm">₹{calculations.totalVendorEarnings.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            {/* Itemized Order Breakdown */}
            <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-black text-xs">
                    <FiTool size={11} />
                  </span>
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Itemized Bill Breakdown</h3>
                    <p className="text-[9.5px] font-semibold text-slate-400">Synchronized with customer checkout</p>
                  </div>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {calculations.isAgriService ? 'Agri Rental' : 'Service'}
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-1.5">
                {booking.bookedItems && booking.bookedItems.length > 0 ? (
                  booking.bookedItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-slate-100/70 last:border-0">
                      <div>
                        <p className="font-black text-slate-800 text-xs">{item.title}</p>
                        {item.description && (
                          <p className="text-[10px] font-semibold text-slate-400">{item.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {item.price > 0 ? (
                          <span className="font-black text-slate-900 text-xs">₹{Number(item.price * (item.quantity || 1)).toFixed(2)}</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Included (₹0)
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-xs py-1">
                    <span className="font-bold text-slate-700">Original Service: {booking.serviceName || 'Equipment Booking'}</span>
                    <span className="font-black text-slate-900">₹{calculations.originalBase.toFixed(2)}</span>
                  </div>
                )}

                {/* Conveyance / Mobilization */}
                <div className="flex justify-between items-center text-xs pt-0.5">
                  <span className="font-bold text-slate-500 text-[11px] flex items-center gap-1.5">
                    <FiTruck className="text-slate-400" size={12} />
                    Conveyance & Mobilization
                  </span>
                  {calculations.visitingCharges > 0 ? (
                    <span className="font-black text-slate-800 text-xs">+ ₹{calculations.visitingCharges.toFixed(2)}</span>
                  ) : (
                    <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[9px] border border-emerald-200">
                      FREE (₹0)
                    </span>
                  )}
                </div>

                {/* GST */}
                <div className="flex justify-between items-center text-xs pt-0.5">
                  <span className="font-bold text-slate-500 text-[11px] flex items-center gap-1.5">
                    <FiTag className="text-slate-400" size={12} />
                    GST ({calculations.serviceGstPct}%)
                  </span>
                  <span className="font-black text-slate-800 text-xs">+ ₹{calculations.totalServiceGST.toFixed(2)}</span>
                </div>

                {/* Total */}
                <div className="flex justify-between items-center pt-2 mt-1.5 border-t border-slate-200">
                  <div>
                    <span className="text-[10.5px] font-black text-slate-900 uppercase tracking-wider block">Total Customer Payable</span>
                    <span className="text-[9px] font-semibold text-slate-400">All operator expenses & taxes included</span>
                  </div>
                  <span className="text-lg font-black text-emerald-800">₹{calculations.finalBillAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Transparent Vendor Revenue Split Card */}
            <div className="bg-emerald-50/60 rounded-2xl p-3.5 border border-emerald-200/70 space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-emerald-200/60">
                <span className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                  <FiCheckCircle className="text-emerald-700" size={13} />
                  Transparent Settlement Breakdown
                </span>
                <span className="text-[8.5px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  Vendor Share {calculations.servicePayoutPct}%
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Cash Collected:</span>
                  <span className="font-bold text-slate-800">₹{calculations.finalBillAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>GST Remitted for Tax Compliance ({calculations.serviceGstPct}%):</span>
                  <span className="font-semibold text-slate-600">- ₹{calculations.totalServiceGST.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Platform Fee ({100 - calculations.servicePayoutPct}%):</span>
                  <span className="font-semibold text-slate-600">- ₹{calculations.platformCommission.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-emerald-200/80 font-black text-emerald-950">
                  <span className="text-[11px] uppercase tracking-wider">Your Net Payout:</span>
                  <span className="text-base text-emerald-800">₹{calculations.totalVendorEarnings.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-[72px] left-0 right-0 p-2.5 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-40">
        <div className="max-w-xl mx-auto">
          {booking.vendorBillId || booking.paymentMethod === 'cash' || booking.paymentMethod === 'pay_at_home' || booking.paymentMethod === 'plan_benefit' ? (
            isOtpSent ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowOtpModal(true)}
                  disabled={otpLoading}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-70 disabled:scale-100 cursor-pointer"
                >
                  <FiKey className="w-3.5 h-3.5" />
                  {otpLoading ? 'Verifying OTP...' : 'Enter Customer OTP to Confirm Cash'}
                </button>
                <button
                  onClick={handleSendOTP}
                  disabled={otpLoading}
                  type="button"
                  className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] rounded-lg transition-all text-center cursor-pointer"
                >
                  {otpLoading ? 'Resending...' : 'Resend / Regenerate OTP to Customer'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleSendOTP}
                disabled={otpLoading}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-70 disabled:scale-100 cursor-pointer"
              >
                {otpLoading ? (
                  'Initiating Collection...'
                ) : (
                  <>
                    <FaRupeeSign className="w-3 h-3" />
                    <span>Collect Cash (Send OTP) - ₹{calculations?.finalBillAmount?.toFixed(2)}</span>
                  </>
                )}
              </button>
            )
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 disabled:opacity-70 active:scale-95 transition-all cursor-pointer"
            >
              {submitting ? 'Generating Bill...' : <><FiCheck className="w-3.5 h-3.5" /> Confirm & Generate Bill</>}
            </button>
          )}
        </div>
      </div>

      <OtpVerificationModal
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        onVerify={handleVerifyOTP}
        loading={otpLoading}
      />
    </div>
  );
};

export default BillingPage;

