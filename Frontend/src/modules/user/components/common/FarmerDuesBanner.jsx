import React, { useCallback, useEffect, useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import { paymentDefaultService } from '../../../../services/paymentDefaultService';
import { toastManager } from '../../../../utils/toastManager';

/**
 * Shown while the farmer owes dues from an unpaid bill that support resolved against them.
 * Dues block new bookings; they can be paid from the wallet here. Renders nothing when there are none.
 */
const FarmerDuesBanner = () => {
  const [dues, setDues] = useState(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await paymentDefaultService.getMyDues();
      setDues(res?.success ? res.data : null);
    } catch {
      setDues(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!dues || !(dues.total > 0)) return null;

  const pay = async () => {
    try {
      setPaying(true);
      const res = await paymentDefaultService.payFromWallet();
      if (res?.data?.paid > 0) toastManager.success(res.message);
      else toastManager.info(res?.message || 'Your wallet balance is not enough to pay these dues.');
      await load();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not pay dues. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 space-y-2">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
          <FiAlertTriangle className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-red-800">You have ₹{dues.total} in unpaid dues</p>
          <p className="text-[11px] text-red-700/90 leading-snug">
            A bill from an earlier booking was not paid, so new bookings are blocked until it is cleared.
          </p>
          {dues.items?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {dues.items.map((it) => (
                <li key={it.bookingId} className="text-[11px] font-semibold text-red-800">
                  #{it.bookingNumber}{it.serviceName ? ` · ${it.serviceName}` : ''}: ₹{it.amount}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <button
        onClick={pay}
        disabled={paying}
        className="w-full py-2.5 rounded-xl bg-red-600 text-white text-xs font-black active:scale-95 transition-all disabled:opacity-50"
      >
        {paying ? 'Paying…' : 'Pay dues from wallet'}
      </button>
      <p className="text-[10px] text-red-700/80 text-center">Not enough wallet balance? Contact support to arrange payment.</p>
    </div>
  );
};

export default FarmerDuesBanner;
