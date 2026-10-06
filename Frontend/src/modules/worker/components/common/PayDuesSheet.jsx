import React, { useState } from 'react';
import { FiX, FiCreditCard, FiUser } from 'react-icons/fi';
import workerWalletService from '../../../../services/workerWalletService';
import { toastManager } from '../../../../utils/toastManager';

const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});

/**
 * Two ways for a worker to pay their dues:
 *  - online (UPI / card through Razorpay): applied as soon as the payment is verified
 *  - "I paid the admin" (cash or UPI outside the app): applied when the admin confirms it
 */
const PayDuesSheet = ({ isOpen, onClose, dues, hasPendingOffline, onDone }) => {
  const [mode, setMode] = useState(null); // null | 'offline'
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [offlineMode, setOfflineMode] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  if (!isOpen) return null;
  const close = () => { setMode(null); setAmount(''); setReference(''); setNote(''); onClose(); };
  const value = amount === '' ? dues : Number(amount);
  const amountError = !(value >= 1) ? 'Enter at least ₹1' : value > dues ? `Cannot be more than ₹${dues}` : null;

  const payOnline = async () => {
    if (amountError) return toastManager.error(amountError);
    setBusy(true);
    try {
      if (!(await loadRazorpay())) throw new Error('Payment could not load. Check your internet.');
      const order = await workerWalletService.createDuesOrder(amount === '' ? undefined : value);
      const key = order.data.key || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!key) throw new Error('Online payment is not configured.');
      const rzp = new window.Razorpay({
        key,
        amount: Math.round(order.data.amount * 100),
        currency: order.data.currency || 'INR',
        order_id: order.data.orderId,
        name: 'AgroYilt',
        description: 'Pay your dues',
        handler: async (response) => {
          try {
            const res = await workerWalletService.verifyDuesPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            toastManager.success(res.message || 'Dues paid');
            onDone();
            close();
          } catch (err) {
            toastManager.error(err?.message || 'Payment received but not confirmed yet. It will update shortly.');
            onDone();
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
        theme: { color: '#0F766E' }
      });
      rzp.open();
    } catch (err) {
      toastManager.error(err?.message || 'Could not start the payment');
      setBusy(false);
    }
  };

  const submitOffline = async () => {
    if (amountError) return toastManager.error(amountError);
    if (offlineMode === 'upi' && !reference.trim()) return toastManager.error('Enter the UPI reference number');
    setBusy(true);
    try {
      const res = await workerWalletService.submitOfflineDuesPayment({
        amount: amount === '' ? undefined : value, mode: offlineMode, reference: reference.trim() || undefined, note: note.trim() || undefined
      });
      toastManager.success(res.message || 'Sent to the admin');
      onDone();
      close();
    } catch (err) {
      toastManager.error(err?.message || 'Could not send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={close}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900">Pay your dues</h3>
            <p className="text-xs text-gray-500">You owe the app ₹{Number(dues).toLocaleString('en-IN')}</p>
          </div>
          <button onClick={close} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><FiX /></button>
        </div>

        <label className="block">
          <span className="text-xs font-bold text-gray-600">Amount (leave empty to pay everything)</span>
          <input
            type="number" inputMode="decimal" min="1" max={dues} value={amount} placeholder={String(dues)}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base font-bold"
          />
          {amount !== '' && amountError && <span className="text-[11px] text-red-600">{amountError}</span>}
        </label>

        {mode !== 'offline' ? (
          <div className="space-y-2.5">
            <button
              disabled={busy}
              onClick={payOnline}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-teal-600 bg-teal-50 text-left disabled:opacity-60"
            >
              <FiCreditCard className="w-6 h-6 text-teal-700 shrink-0" />
              <div>
                <p className="font-black text-teal-900">Pay now online</p>
                <p className="text-xs text-teal-800">UPI, card or net banking. Updates immediately.</p>
              </div>
            </button>
            <button
              disabled={busy || hasPendingOffline}
              onClick={() => setMode('offline')}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 text-left disabled:opacity-60"
            >
              <FiUser className="w-6 h-6 text-gray-600 shrink-0" />
              <div>
                <p className="font-black text-gray-900">I paid the admin directly</p>
                <p className="text-xs text-gray-600">
                  {hasPendingOffline ? 'You already have a payment waiting for the admin to confirm.' : 'Cash or UPI to the admin. Updates when the admin confirms.'}
                </p>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              {['cash', 'upi'].map(m => (
                <button
                  key={m}
                  onClick={() => setOfflineMode(m)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border ${offlineMode === m ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-700 border-gray-200'}`}
                >
                  {m === 'cash' ? 'Cash' : 'UPI'}
                </button>
              ))}
            </div>
            <input
              value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder={offlineMode === 'upi' ? 'UPI reference number (required)' : 'Receipt number (optional)'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
            />
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the admin (optional)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={() => setMode(null)} className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-sm">Back</button>
              <button disabled={busy} onClick={submitOffline} className="flex-[2] py-3 rounded-xl bg-teal-600 text-white font-black text-sm disabled:opacity-60">
                Send to admin
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayDuesSheet;
