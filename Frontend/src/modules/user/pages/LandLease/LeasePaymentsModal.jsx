import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FiX, FiCheck, FiClock, FiCreditCard } from 'react-icons/fi';
import { motion } from 'framer-motion';
import landLeaseService from '../../services/landLeaseService';
import { walletService } from '../../../../services/walletService';
import { toastManager } from '../../../../utils/toastManager';
import authStorage from '../../../../utils/authStorage';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

const STATUS_STYLE = {
  paid: 'bg-emerald-100 text-emerald-800',
  processing: 'bg-blue-100 text-blue-800',
  pending: 'bg-amber-100 text-amber-800',
  submitted: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-700'
};

const STATUS_LABEL = {
  paid: 'Paid',
  processing: 'Processing',
  pending: 'Due',
  submitted: 'Awaiting owner',
  confirmed: 'Confirmed',
  rejected: 'Rejected'
};

const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});

// An online payment already took the money but finishing failed: the server resumes it, no new charge
const isOnlineResume = (item) => item.status === 'processing' && String(item.paymentKey || '').startsWith('rzp_');

const StatusChip = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${STATUS_STYLE[status] || 'bg-gray-100 text-gray-700'}`}>
    {STATUS_LABEL[status] || status}
  </span>
);

const LeasePaymentsModal = ({ landId, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null); // null until loaded; payments stay allowed so the server still decides
  const [harvest, setHarvest] = useState({ cropName: '', harvestValue: '', note: '' });

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const load = useCallback(async () => {
    try {
      const res = await landLeaseService.getPayments(landId);
      if (res?.success) setData(res.data);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load payments');
      onCloseRef.current();
    } finally {
      setLoading(false);
    }
  }, [landId]);

  const loadBalance = useCallback(async () => {
    try {
      const res = await walletService.getBalance();
      if (res?.success) setWalletBalance(Number(res.data?.balance) || 0);
    } catch {
      // Balance is only a hint here; the server re-checks on every payment
    }
  }, []);

  useEffect(() => {
    load();
    loadBalance();
  }, [load, loadBalance]);

  // One Pay button: wallet when it covers the amount, otherwise the full amount online
  const renderPayButton = (item, onPay, label) => {
    const walletShort = walletBalance !== null && walletBalance < item.amount && !isOnlineResume(item);
    return (
      <button
        onClick={onPay}
        disabled={!!busyId}
        className="py-1.5 px-3 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white rounded-xl font-bold flex items-center gap-1"
      >
        <FiCreditCard className="w-3.5 h-3.5" />
        <span>{busyId === item._id ? '...' : isOnlineResume(item) ? 'Finish payment' : walletShort ? `Pay ${inr(item.amount)} online` : label}</span>
      </button>
    );
  };

  // Full amount through Razorpay (the wallet is not touched). Resolves true once the owner is credited.
  const payOnline = async (kind, item, successMsg) => {
    setBusyId(item._id);
    try {
      if (!(await loadRazorpay())) {
        toastManager.error('Could not load the payment window. Check your internet and try again.');
        return false;
      }
      const orderRes = await landLeaseService.createOnlineOrder(landId, kind, item._id);
      if (!orderRes?.success) {
        toastManager.error(orderRes?.message || 'Could not start the payment');
        return false;
      }
      const { orderId, amount, currency, keyId } = orderRes.data;
      const user = authStorage.getUserData('user') || {};

      return await new Promise((resolve) => {
        const checkout = new window.Razorpay({
          key: keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: String(amount),
          currency: currency || 'INR',
          name: 'Agroyilt Land Lease',
          description: kind === 'installment' ? `Rent installment ${item.number}` : 'Crop-share settlement',
          order_id: orderId,
          prefill: { name: user.name || '', contact: user.phone || '' },
          theme: { color: '#065f46' },
          handler: async (response) => {
            try {
              const res = await landLeaseService.verifyOnlinePayment(landId, kind, item._id, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              });
              if (res?.success) {
                toastManager.success(successMsg);
                await Promise.all([load(), loadBalance()]);
                onChanged?.();
                return resolve(true);
              }
              toastManager.error(res?.message || 'Payment could not be confirmed');
            } catch (err) {
              toastManager.error(err.response?.data?.message || 'Payment could not be confirmed');
            }
            await Promise.all([load(), loadBalance()]); // the server may have refunded it to the wallet, or left it to finish
            resolve(false);
          },
          modal: { ondismiss: () => resolve(false) }
        });
        checkout.on?.('payment.failed', (r) => toastManager.error(r?.error?.description || 'Payment failed'));
        checkout.open();
      });
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not start the payment');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  // Runs one money/status action, then refreshes this modal and the parent list. Resolves true on success.
  const run = async (id, action, successMsg) => {
    if (busyId) return false;
    setBusyId(id);
    try {
      const res = await action();
      if (res?.success) {
        toastManager.success(successMsg);
        await Promise.all([load(), loadBalance()]);
        onChanged?.();
        return true;
      }
      toastManager.error(res?.message || 'Action failed');
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Action failed');
      loadBalance(); // a "balance is low" reply means our number was stale
    } finally {
      setBusyId(null);
    }
    return false;
  };

  // Wallet when it covers the amount, else the whole amount online. The server still checks the wallet:
  // if our balance was stale and it says "low", the balance refreshes and the button becomes "Pay online".
  const startPayment = async (kind, item, successMsg) => {
    if (busyId) return;
    const walletPay = () => run(item._id, () => (kind === 'installment'
      ? landLeaseService.payInstallment(landId, item._id)
      : landLeaseService.paySettlement(landId, item._id)), successMsg);

    if (isOnlineResume(item)) return walletPay(); // finishing a payment that is already taken

    const walletCovers = walletBalance === null || walletBalance >= item.amount;
    if (walletCovers) {
      if (!window.confirm(`Pay ${inr(item.amount)} from wallet?`)) return;
      return walletPay();
    }
    if (!window.confirm(`Your wallet has ${inr(walletBalance)}, which is not enough.\n\nPay ${inr(item.amount)} online instead?`)) return;
    return payOnline(kind, item, successMsg);
  };

  const payInstallment = (item) => startPayment('installment', item, 'Rent paid');
  const paySettlement = (item) => startPayment('settlement', item, 'Share paid');

  const submitHarvest = (e) => {
    e.preventDefault();
    if (!(Number(harvest.harvestValue) > 0)) return toastManager.error('Enter the total crop value');
    run('harvest', () => landLeaseService.submitSettlement(landId, harvest), 'Settlement sent to owner')
      .then((ok) => ok && setHarvest({ cropName: '', harvestValue: '', note: '' }));
  };

  const isOwner = data?.role === 'owner';
  const isTenant = data?.role === 'tenant';
  const agreement = data?.agreement || {};
  const nextDue = data?.installments?.find((i) => i.status !== 'paid');
  const hasOpenSettlement = data?.settlements?.some((s) => ['submitted', 'confirmed', 'processing'].includes(s.status));
  const sharePreview = (Number(harvest.harvestValue) || 0) * ((agreement.agreedShare || 0) / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
          <FiX className="w-5 h-5" />
        </button>

        <div className="border-b border-gray-100 pb-3 mb-4 pr-10">
          <span className="text-xs uppercase font-extrabold text-emerald-700 tracking-wider">Lease Payments</span>
          <h3 className="text-base sm:text-lg font-black text-gray-900 mt-0.5">Payments & Settlements</h3>
          {data && <p className="text-xs text-gray-500 line-clamp-1">{data.title}</p>}
        </div>

        {loading || !data ? (
          <div className="py-10 text-center text-gray-400">
            <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading...</p>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Agreement summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 p-2.5 rounded-xl">
                <span className="text-gray-400 block text-[10px]">Duration</span>
                <span className="font-bold text-gray-800">
                  {fmtDate(agreement.startDate)} – {fmtDate(agreement.endDate)}
                </span>
              </div>
              <div className="bg-gray-50 p-2.5 rounded-xl">
                <span className="text-gray-400 block text-[10px]">Terms</span>
                <span className="font-bold text-gray-800">
                  {data.leaseType === 'fixed-rent'
                    ? `${inr(agreement.agreedPrice)}/acre/year`
                    : `${agreement.agreedShare}% Crop Share (owner's share)`}
                </span>
              </div>
              <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                <span className="text-emerald-700 block text-[10px]">Paid so far</span>
                <span className="font-extrabold text-emerald-900">{inr(data.totals?.paid)}</span>
              </div>
              {data.leaseType === 'fixed-rent' && (
                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100">
                  <span className="text-amber-700 block text-[10px]">Rent due</span>
                  <span className="font-extrabold text-amber-900">{inr(data.totals?.pendingRent)}</span>
                </div>
              )}
            </div>

            {isTenant && (
              <p className="text-[11px] text-gray-500">
                Payment comes from your wallet; if the wallet is short, you pay the full amount online. A platform fee of {agreement.commissionPercentage || 0}% is deducted from the owner's amount.
                {walletBalance !== null && <span className="block font-bold text-gray-700 mt-0.5">Wallet balance: {inr(walletBalance)}</span>}
              </p>
            )}

            {/* Fixed-rent installments */}
            {data.leaseType === 'fixed-rent' && (
              <div className="space-y-2">
                <h4 className="font-extrabold text-gray-900 text-xs">Monthly Installments</h4>
                {data.installments.map((item) => (
                  <div key={item._id} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-xl p-2.5">
                    <div>
                      <div className="font-bold text-gray-900">
                        Installment {item.number} • {inr(item.amount)}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1">
                        <FiClock className="w-3 h-3" /> Due: {fmtDate(item.dueDate)}
                        {isOwner && item.status === 'paid' && <span> • You received {inr(item.ownerAmount)}</span>}
                        {item.status === 'paid' && item.paidAt && <span> • {fmtDate(item.paidAt)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusChip status={item.status} />
                      {isTenant && nextDue?._id === item._id && item.status !== 'paid' && (
                        renderPayButton(item, () => payInstallment(item), 'Pay')
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Crop-share settlements */}
            {data.leaseType === 'crop-share' && (
              <div className="space-y-2">
                <h4 className="font-extrabold text-gray-900 text-xs">Harvest Settlements</h4>

                {data.settlements.length === 0 && (
                  <p className="text-gray-500 italic">No settlements have been sent yet.</p>
                )}

                {data.settlements.map((item) => (
                  <div key={item._id} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-gray-900">
                          {item.cropName || 'Crop'} • Total value {inr(item.harvestValue)}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          Owner's share ({item.sharePercentage}%): <b>{inr(item.amount)}</b> • {fmtDate(item.createdAt)}
                        </div>
                        {item.note && <div className="text-[11px] text-gray-500 italic">"{item.note}"</div>}
                      </div>
                      <StatusChip status={item.status} />
                    </div>

                    {isOwner && item.status === 'submitted' && (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => run(item._id, () => landLeaseService.reviewSettlement(landId, item._id, 'reject'), 'Settlement rejected')}
                          disabled={!!busyId}
                          className="py-1.5 px-3 border border-red-200 text-red-600 rounded-xl font-bold disabled:opacity-60"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => run(item._id, () => landLeaseService.reviewSettlement(landId, item._id, 'confirm'), 'Settlement accepted')}
                          disabled={!!busyId}
                          className="py-1.5 px-3 bg-emerald-800 text-white rounded-xl font-bold flex items-center gap-1 disabled:opacity-60"
                        >
                          <FiCheck className="w-3.5 h-3.5" /> Accept
                        </button>
                      </div>
                    )}

                    {isTenant && (item.status === 'confirmed' || item.status === 'processing') && (
                      <div className="flex justify-end">
                        {renderPayButton(item, () => paySettlement(item), `Pay ${inr(item.amount)}`)}
                      </div>
                    )}
                  </div>
                ))}

                {isTenant && !hasOpenSettlement && (
                  <form onSubmit={submitHarvest} className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 space-y-2">
                    <h5 className="font-extrabold text-emerald-900">Send New Crop Settlement</h5>
                    <input
                      value={harvest.cropName}
                      onChange={(e) => setHarvest({ ...harvest, cropName: e.target.value })}
                      placeholder="Crop name (e.g. Wheat)"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white"
                    />
                    <input
                      type="number"
                      min="1"
                      value={harvest.harvestValue}
                      onChange={(e) => setHarvest({ ...harvest, harvestValue: e.target.value })}
                      placeholder="Total crop value (₹)"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white"
                    />
                    {sharePreview > 0 && (
                      <p className="text-[11px] text-emerald-800">
                        Owner's share ({agreement.agreedShare}%): <b>{inr(sharePreview.toFixed(2))}</b>
                      </p>
                    )}
                    <input
                      value={harvest.note}
                      onChange={(e) => setHarvest({ ...harvest, note: e.target.value })}
                      placeholder="Note (optional)"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white"
                    />
                    <button
                      type="submit"
                      disabled={!!busyId}
                      className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white rounded-xl font-bold"
                    >
                      {busyId === 'harvest' ? 'Sending...' : 'Send to Owner'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default LeasePaymentsModal;
