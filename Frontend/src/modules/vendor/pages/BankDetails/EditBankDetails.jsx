import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FiChevronLeft, FiLock, FiShield, FiCreditCard, FiCheck, 
  FiAlertCircle, FiEye, FiEyeOff, FiCheckCircle 
} from 'react-icons/fi';
import { vendorTheme as themeColors } from '../../../../theme';
import withdrawalService from '../../../../services/withdrawalService';
import { toastManager } from '../../../../utils/toastManager';

const EditBankDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingData, setExistingData] = useState(null);

  const [formData, setFormData] = useState({
    accountHolderName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: '',
    bankName: '',
    branchName: '',
    upiId: ''
  });

  const [formErrors, setFormErrors] = useState({});
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [showConfirmAccountNumber, setShowConfirmAccountNumber] = useState(false);
  const [isLookingUpIfsc, setIsLookingUpIfsc] = useState(false);

  // Maintain consistent app theme background gradient
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
    loadBankDetails();
  }, []);

  const loadBankDetails = async () => {
    try {
      setLoading(true);
      const res = await withdrawalService.getBankDetails();
      if (res.success && res.data) {
        setExistingData(res.data);
        setFormData({
          accountHolderName: res.data.accountHolderName || '',
          accountNumber: '', // Blank for secure re-entry
          confirmAccountNumber: '',
          ifsc: res.data.ifsc || res.data.ifscCode || '',
          bankName: res.data.bankName || '',
          branchName: res.data.branchName || '',
          upiId: res.data.upiId || ''
        });
      }
    } catch (err) {
      console.warn('Could not load bank details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let formattedVal = value;

    if (name === 'ifsc') {
      formattedVal = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
      if (formattedVal.length === 11) {
        lookupIfsc(formattedVal);
      }
    } else if (name === 'accountNumber' || name === 'confirmAccountNumber') {
      formattedVal = value.replace(/[^0-9]/g, '');
    }

    setFormData(prev => ({ ...prev, [name]: formattedVal }));

    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const lookupIfsc = async (code) => {
    if (code.length !== 11) return;
    try {
      setIsLookingUpIfsc(true);
      const res = await fetch(`https://ifsc.razorpay.com/${code}`);
      if (res.ok) {
        const data = await res.json();
        setFormData(prev => ({
          ...prev,
          bankName: data.BANK || prev.bankName,
          branchName: data.BRANCH || prev.branchName
        }));
      }
    } catch (e) {
      // Non-blocking IFSC fetch
    } finally {
      setIsLookingUpIfsc(false);
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.accountHolderName.trim()) {
      errors.accountHolderName = 'Account holder name is required';
    } else if (formData.accountHolderName.trim().length < 3) {
      errors.accountHolderName = 'Name must be at least 3 characters';
    }

    if (!formData.accountNumber) {
      errors.accountNumber = 'Account number is required';
    } else if (!/^\d{9,18}$/.test(formData.accountNumber)) {
      errors.accountNumber = 'Account number must be between 9 and 18 digits';
    }

    if (!formData.confirmAccountNumber) {
      errors.confirmAccountNumber = 'Please re-enter your account number';
    } else if (formData.accountNumber !== formData.confirmAccountNumber) {
      errors.confirmAccountNumber = 'Account numbers do not match';
    }

    if (!formData.ifsc.trim()) {
      errors.ifsc = 'IFSC code is required';
    } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifsc.trim().toUpperCase())) {
      errors.ifsc = 'Invalid IFSC format (11 chars, e.g. SBIN0001234)';
    }

    if (!formData.bankName.trim()) {
      errors.bankName = 'Bank name is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleBack = () => {
    if (location.state?.from && !location.state.from.includes('/bank-details/edit')) {
      navigate(location.state.from, { replace: true });
    } else {
      navigate('/vendor/bank-details', { replace: true });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toastManager.error('Please fix the errors before saving');
      return;
    }

    try {
      setSaving(true);
      const res = await withdrawalService.updateBankDetails({
        accountHolderName: formData.accountHolderName.trim(),
        accountNumber: formData.accountNumber.trim(),
        ifsc: formData.ifsc.trim().toUpperCase(),
        ifscCode: formData.ifsc.trim().toUpperCase(),
        bankName: formData.bankName.trim(),
        branchName: formData.branchName.trim(),
        upiId: formData.upiId.trim()
      });

      if (res.success) {
        toastManager.success('Banking details saved securely!');
        handleBack();
      } else {
        toastManager.error(res.message || 'Failed to save bank details');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || err.message || 'Failed to save bank details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-10" style={{ background: themeColors.backgroundGradient }}>
      {/* Sticky Header */}
      <header 
        className="sticky top-0 z-30 w-full backdrop-blur-xl shadow-[0_2px_12px_rgba(46,125,50,0.04)]"
        style={{
          background: 'linear-gradient(180deg, #F1F8E9 0%, rgba(255, 255, 255, 0.95) 100%)',
          borderBottom: '1px solid rgba(165, 214, 167, 0.4)',
        }}
      >
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={handleBack}
              aria-label="Back"
              className="w-10 h-10 rounded-full bg-white hover:bg-emerald-50/60 border border-emerald-200/70 flex items-center justify-center text-emerald-900 active:scale-95 transition-all shadow-[0_2px_8px_rgba(46,125,50,0.06)] shrink-0 cursor-pointer"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight truncate">
                {existingData?.accountNumberMasked ? 'Edit Banking Details' : 'Add Banking Details'}
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate flex items-center gap-1">
                <FiLock className="w-2.5 h-2.5 text-emerald-600" />
                <span>Encrypted Payout Account</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100/80 border border-emerald-200 text-emerald-800 text-[10px] font-black uppercase tracking-wider shrink-0">
            <FiShield className="w-3 h-3 text-emerald-700" />
            <span>256-Bit SSL</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
            <div className="w-7 h-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">Loading bank form...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
            {/* Security Callout */}
            <div className="flex items-start gap-2.5 p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-xs text-emerald-900">
              <FiShield className="w-4 h-4 shrink-0 text-emerald-700 mt-0.5" />
              <div className="leading-tight">
                <span className="font-bold block">Verified Account Deposit</span>
                <span className="text-[11px] text-emerald-800/80">
                  Ensure account details match your official banking passbook or statement to prevent settlement delays.
                </span>
              </div>
            </div>

            {/* Current Active Account Card (if already exists) */}
            {existingData?.accountNumberMasked && (
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Current Active Account
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-bold text-slate-800 text-xs sm:text-sm">
                      {existingData.accountNumberMasked}
                    </span>
                    {existingData.bankName && (
                      <span className="text-slate-500 font-medium text-[11px]">
                        • {existingData.bankName}
                      </span>
                    )}
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-100/80 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold shrink-0">
                  Active
                </span>
              </div>
            )}

            {/* Account Holder Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Account Holder Name *
              </label>
              <input
                type="text"
                name="accountHolderName"
                value={formData.accountHolderName}
                onChange={handleChange}
                placeholder="Full name as registered with bank"
                className={`w-full p-3 bg-slate-50 border rounded-xl text-xs sm:text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${
                  formErrors.accountHolderName ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                }`}
              />
              {formErrors.accountHolderName && (
                <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.accountHolderName}</p>
              )}
            </div>

            {/* Account Numbers (Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bank Account Number *
                </label>
                <div className="relative">
                  <input
                    type={showAccountNumber ? "text" : "password"}
                    name="accountNumber"
                    value={formData.accountNumber}
                    onChange={handleChange}
                    placeholder="Enter account number"
                    autoComplete="new-password"
                    className={`w-full p-3 pr-10 bg-slate-50 border rounded-xl text-xs sm:text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${
                      formErrors.accountNumber ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccountNumber(prev => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
                    title={showAccountNumber ? "Hide Account Number" : "Show Account Number"}
                  >
                    {showAccountNumber ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                  </button>
                </div>
                {formErrors.accountNumber && (
                  <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.accountNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Confirm Account Number *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmAccountNumber ? "text" : "password"}
                    name="confirmAccountNumber"
                    value={formData.confirmAccountNumber}
                    onChange={handleChange}
                    placeholder="Re-enter account number"
                    autoComplete="new-password"
                    className={`w-full p-3 pr-10 bg-slate-50 border rounded-xl text-xs sm:text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${
                      formErrors.confirmAccountNumber ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmAccountNumber(prev => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
                    title={showConfirmAccountNumber ? "Hide Account Number" : "Show Account Number"}
                  >
                    {showConfirmAccountNumber ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                  </button>
                </div>
                {formErrors.confirmAccountNumber && (
                  <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.confirmAccountNumber}</p>
                )}
              </div>
            </div>

            {/* IFSC Code & Lookup */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  IFSC Code *
                </label>
                {isLookingUpIfsc && (
                  <span className="text-[10px] font-semibold text-emerald-700 animate-pulse">
                    Looking up branch...
                  </span>
                )}
              </div>
              <input
                type="text"
                name="ifsc"
                value={formData.ifsc}
                onChange={handleChange}
                placeholder="e.g. SBIN0001234 or HDFC0000001"
                maxLength={11}
                className={`w-full p-3 bg-slate-50 border rounded-xl text-xs sm:text-sm font-mono font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${
                  formErrors.ifsc ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                }`}
              />
              {formErrors.ifsc && (
                <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.ifsc}</p>
              )}
            </div>

            {/* Bank Name & Branch Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bank Name *
                </label>
                <input
                  type="text"
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleChange}
                  placeholder="e.g. State Bank of India"
                  className={`w-full p-3 bg-slate-50 border rounded-xl text-xs sm:text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${
                    formErrors.bankName ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
                {formErrors.bankName && (
                  <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.bankName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Branch Name (Optional)
                </label>
                <input
                  type="text"
                  name="branchName"
                  value={formData.branchName}
                  onChange={handleChange}
                  placeholder="e.g. Main Branch"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* UPI ID (Optional) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                UPI ID / VPA (Optional)
              </label>
              <input
                type="text"
                name="upiId"
                value={formData.upiId}
                onChange={handleChange}
                placeholder="e.g. mobile@upi or name@okaxis"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Optional: Used for instant micro-settlements and incentive deposits.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs sm:text-sm hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                style={{ 
                  background: themeColors.button,
                  boxShadow: '0 4px 12px rgba(46, 125, 50, 0.28)'
                }}
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <FiCheck className="w-4 h-4 stroke-[2.5]" />
                    <span>Save Banking Details</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
};

export default EditBankDetails;
