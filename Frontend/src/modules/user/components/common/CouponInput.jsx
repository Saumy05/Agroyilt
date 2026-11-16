import React, { useState, useEffect } from 'react';
import { FiTag, FiCheckCircle, FiX, FiGift, FiChevronRight, FiPercent, FiDollarSign } from 'react-icons/fi';
import { validateCoupon, getAvailableCoupons } from '../../../../services/couponService';
import { toastManager } from '../../../../utils/toastManager';

const CouponInput = ({
  bookingAmount = 0,
  appliedCoupon = null,
  onApplyCoupon,
  onRemoveCoupon,
  categoryId = null,
  serviceId = null,
  className = ''
}) => {
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  const handleApply = async (codeToApply = null) => {
    const targetCode = (codeToApply || code || '').trim().toUpperCase();
    if (!targetCode) {
      toastManager.error('Please enter a coupon code');
      return;
    }

    try {
      setValidating(true);
      const res = await validateCoupon(targetCode, bookingAmount, categoryId, serviceId);
      if (res.success && res.coupon) {
        toastManager.success(res.message || `Coupon "${res.coupon.code}" applied!`);
        onApplyCoupon(res.coupon);
        setCode('');
        setShowOffersModal(false);
      } else {
        toastManager.error(res.message || 'Invalid coupon code');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to apply coupon');
    } finally {
      setValidating(false);
    }
  };

  const handleFetchAvailable = async () => {
    try {
      setLoadingOffers(true);
      setShowOffersModal(true);
      const res = await getAvailableCoupons();
      if (res.success && Array.isArray(res.coupons)) {
        setAvailableCoupons(res.coupons);
      }
    } catch (err) {
      console.warn('Failed to load available coupons:', err);
    } finally {
      setLoadingOffers(false);
    }
  };

  const isBelowMin = appliedCoupon && appliedCoupon.minOrderAmount > 0 && bookingAmount > 0 && bookingAmount < appliedCoupon.minOrderAmount;
  const currentSavings = appliedCoupon ? (() => {
    if (isBelowMin) return 0;
    if (appliedCoupon.discountType === 'PERCENTAGE') {
      let d = Math.round((bookingAmount * appliedCoupon.discountValue) / 100);
      if (appliedCoupon.maxDiscountAmount && d > appliedCoupon.maxDiscountAmount) {
        d = appliedCoupon.maxDiscountAmount;
      }
      return d;
    }
    return Math.min(appliedCoupon.discountValue || appliedCoupon.discountAmount || 0, bookingAmount);
  })() : 0;

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
            <FiTag size={15} />
          </span>
          <div>
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Offers & Promo Code</h4>
            <p className="text-[10px] text-slate-400 font-medium">Apply festival promo code for instant savings</p>
          </div>
        </div>

        {/* View Available Offers Link */}
        {!appliedCoupon && (
          <button
            type="button"
            onClick={handleFetchAvailable}
            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-0.5 cursor-pointer"
          >
            <FiGift className="w-3.5 h-3.5 mr-0.5" />
            <span>View Offers</span>
            <FiChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Applied Coupon Banner */}
      {appliedCoupon ? (
        <div className={`rounded-xl p-3 border transition-all ${
          isBelowMin 
            ? 'bg-amber-50/70 border-amber-200' 
            : 'bg-gradient-to-r from-emerald-50 to-teal-50/60 border-emerald-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${
                isBelowMin ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
              }`}>
                {isBelowMin ? <FiTag size={15} /> : <FiCheckCircle size={16} />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono font-black text-xs tracking-wide ${
                    isBelowMin ? 'text-amber-900' : 'text-emerald-900'
                  }`}>
                    {appliedCoupon.code}
                  </span>
                  <span className={`text-[9.5px] font-bold uppercase px-1.5 py-0.2 rounded ${
                    isBelowMin ? 'bg-amber-200/80 text-amber-900' : 'bg-emerald-200/60 text-emerald-800'
                  }`}>
                    {isBelowMin ? 'Min. Amount Needed' : 'Applied'}
                  </span>
                </div>
                <p className={`text-[11px] font-bold mt-0.5 ${
                  isBelowMin ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {isBelowMin
                    ? `Add ₹${appliedCoupon.minOrderAmount - bookingAmount} more to activate discount`
                    : `₹${currentSavings} saved on this booking!`
                  }
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onRemoveCoupon}
              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors text-xs font-bold cursor-pointer flex items-center gap-1"
              title="Remove Coupon"
            >
              <FiX size={14} />
              <span className="text-[10px] uppercase">Remove</span>
            </button>
          </div>
        </div>
      ) : (
        /* Coupon Input Box */
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="ENTER PROMO CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApply();
                }
              }}
              className="w-full pl-3 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-sans placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 uppercase tracking-wider"
            />
          </div>

          <button
            type="button"
            onClick={() => handleApply()}
            disabled={!code.trim() || validating}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer shrink-0"
          >
            {validating ? 'Applying...' : 'Apply'}
          </button>
        </div>
      )}

      {/* Available Offers Modal / Drawer */}
      {showOffersModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-50/70 to-amber-50/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-sm">
                  <FiGift size={16} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Available Festival Offers</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Select and apply a promo code directly</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOffersModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Modal List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {loadingOffers ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading festive offers...</div>
              ) : availableCoupons.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <FiTag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-semibold text-slate-600">No active coupons available right now</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Stay tuned for upcoming festival deals and offers!</p>
                </div>
              ) : (
                availableCoupons.map((coupon) => (
                  <div
                    key={coupon.code}
                    className="p-3.5 rounded-xl border border-dashed border-orange-200 bg-orange-50/30 hover:bg-orange-50/70 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded border border-orange-200 tracking-wider">
                          {coupon.code}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700">
                          {coupon.discountType === 'PERCENTAGE'
                            ? `${coupon.discountValue}% OFF`
                            : `₹${coupon.discountValue} OFF`}
                        </span>
                      </div>
                      <p className="font-bold text-xs text-slate-800 mt-1 truncate">{coupon.title}</p>
                      {coupon.description && (
                        <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{coupon.description}</p>
                      )}
                      <div className="text-[9.5px] text-slate-400 mt-1 flex items-center gap-2">
                        {coupon.minOrderAmount > 0 && (
                          <span>Min order: ₹{coupon.minOrderAmount}</span>
                        )}
                        {coupon.maxDiscountAmount > 0 && coupon.discountType === 'PERCENTAGE' && (
                          <span>Max save: ₹{coupon.maxDiscountAmount}</span>
                        )}
                        {coupon.endDate && (
                          <span>Valid till: {new Date(coupon.endDate).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApply(coupon.code)}
                      className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-black uppercase rounded-lg shadow-sm active:scale-95 cursor-pointer shrink-0"
                    >
                      Apply
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CouponInput;
