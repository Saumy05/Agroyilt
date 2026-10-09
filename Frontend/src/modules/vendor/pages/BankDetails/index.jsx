import React, { useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiChevronLeft, FiShield, FiCheckCircle, FiClock, FiHelpCircle, FiZap, FiLock } from 'react-icons/fi';
import { vendorTheme as themeColors } from '../../../../theme';
import BankDetailsSection from '../../../../components/common/BankDetailsSection';

const BankDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // If arriving from a non-bank-details page (e.g. settings, wallet), return there; otherwise return to Profile
    if (location.state?.from && !location.state.from.includes('/bank-details')) {
      navigate(location.state.from);
    } else {
      navigate('/vendor/profile');
    }
  };

  // Consistent app theme background gradient
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

  return (
    <div className="min-h-screen pb-28" style={{ background: themeColors.backgroundGradient }}>
      {/* Sticky Topbar */}
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
                Bank & Payout Details
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate flex items-center gap-1">
                <FiLock className="w-2.5 h-2.5 text-emerald-600" />
                <span>Encrypted Payout Account</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100/80 border border-emerald-200 text-emerald-800 text-[10px] font-black uppercase tracking-wider shrink-0">
            <FiShield className="w-3 h-3 text-emerald-700" />
            <span>Verified Hub</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {/* Security & Information Banner */}
        <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-[0_2px_10px_rgba(46,125,50,0.03)] flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
            <FiShield className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              Direct Earnings Settlement
            </h3>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-0.5">
              All machine booking revenue, driver wages, and Agri-Store sales are deposited directly into this account via automated bank transfers.
            </p>
          </div>
        </div>

        {/* Bank Details Management Section */}
        <BankDetailsSection 
          showTitle={true} 
          onEditClick={() => navigate('/vendor/bank-details/edit', { state: { from: '/vendor/bank-details' } })}
          onAddClick={() => navigate('/vendor/bank-details/edit', { state: { from: '/vendor/bank-details' } })}
        />

        {/* Payout & Settlement Info Cards */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <FiZap className="w-3.5 h-3.5 text-amber-500" />
            <span>Payout Guidelines & Timeline</span>
          </h4>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                <FiCheckCircle className="w-3 h-3" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-bold text-slate-800 block">Instant Settlement Processing</span>
                <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                  Payouts for completed field jobs and store orders are settled directly via NEFT, RTGS, or IMPS.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <FiClock className="w-3 h-3" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-bold text-slate-800 block">Changing Your Account</span>
                <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                  Click 'Edit Details' anytime to update your bank account. Changes reflect immediately for the next payout cycle.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                <FiHelpCircle className="w-3 h-3" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-bold text-slate-800 block">UPI Transfers Supported</span>
                <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                  You can also add an optional UPI ID for faster micro-payouts and instant incentives.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BankDetails;
