import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiClock, FiCreditCard, FiAlertTriangle, FiFileText } from 'react-icons/fi';
import landLeaseService from '../../services/landLeaseService';
import { walletService } from '../../../../services/walletService';
import { toastManager } from '../../../../utils/toastManager';
import { waitForServerPayment } from '../../../../utils/paymentRecovery';
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

const LeasePaymentsPage = () => {
  const { landId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null); // null until loaded; payments stay allowed so the server still decides
  const [harvest, setHarvest] = useState({ cropName: '', harvestValue: '', note: '' });

  const load = useCallback(async () => {
    try {
      const res = await landLeaseService.getPayments(landId);
      if (res?.success) setData(res.data);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load payments');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [landId, navigate]);

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

      // Razorpay can say "failed"/closed after a UPI app paid; the server may already have applied it (verify call or webhook)
      const recoverIfPaid = async (failMessage) => {
        toastManager.info('Checking payment status...');
        const paid = await waitForServerPayment(async () => {
          const r = await landLeaseService.getPayments(landId);
          const list = r?.data?.[kind === 'installment' ? 'installments' : 'settlements'] || [];
          return list.find(x => String(x._id) === String(item._id))?.status === 'paid';
        });
        if (paid) {
          toastManager.success(successMsg);
          await Promise.all([load(), loadBalance()]);
        } else if (failMessage) {
          toastManager.error(failMessage);
        }
        return paid;
      };

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
                return resolve(true);
              }
              toastManager.error(res?.message || 'Payment could not be confirmed');
            } catch (err) {
              toastManager.error(err.response?.data?.message || 'Payment could not be confirmed');
            }
            await Promise.all([load(), loadBalance()]); // the server may have refunded it to the wallet, or left it to finish
            resolve(false);
          },
          modal: { ondismiss: () => { recoverIfPaid().then(resolve); } }
        });
        checkout.on?.('payment.failed', (r) => { recoverIfPaid(r?.error?.description || 'Payment failed').then(resolve); });
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

  const endForNonPayment = async () => {
    const eligibility = data?.endEligibility;
    const text = eligibility?.immediate
      ? 'End this lease now? The first installment was not paid in time. The tenant can still pay what is owed, but the lease stops.'
      : `Send a ${data?.noticeDays || 15}-day notice? If the overdue rent (${inr(eligibility?.overdueAmount)}) is still unpaid when it runs out, the lease ends.`;
    if (!window.confirm(text)) return;
    await run('end-lease', () => landLeaseService.endForNonPayment(landId), 'Done');
  };


  const eligibility = data?.endEligibility;
  const notice = data?.terminationNotice;
  const noticeOpen = notice?.status === 'open';
  const endedForRent = data?.status === 'inactive' && data?.endedReason === 'non_payment';
  const firstInstallment = data?.installments?.[0];
  const firstPending = agreement.advanceFirstInstallment && firstInstallment && firstInstallment.status !== 'paid';
  const overdueAmount = (data?.installments || []).filter((i) => i.overdue).reduce((t, i) => t + i.amount, 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 active:scale-95" aria-label="Back">
            <FiArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] uppercase font-extrabold text-emerald-700 tracking-wider">Lease Payments</span>
            <h1 className="text-sm font-black text-gray-900 truncate">{data ? data.title : 'Payments & Settlements'}</h1>
          </div>
          {data?.agreementId && (
            <button onClick={() => navigate(`/user/agreements/${data.agreementId}`)} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1.5 border border-emerald-200">
              <FiFileText size={13} /> Agreement
            </button>
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-3.5 pt-4">
        {loading || !data ? (
          <div className="py-16 text-center text-gray-400">
            <div className="w-8 h-8 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading...</p>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Notices first: they need action */}
            {endedForRent && (
              <div className="rounded-2xl bg-slate-800 text-white p-4 flex gap-3">
                <FiAlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-sm">This lease was ended for unpaid rent</p>
                  <p className="text-slate-300 mt-0.5">पट्टा किराया न देने के कारण समाप्त हो गया। The rent still owed can be paid to the owner below.</p>
                </div>
              </div>
            )}
            {noticeOpen && (
              <div className="rounded-2xl bg-red-50 border border-red-200 p-4 flex gap-3 text-red-900">
                <FiAlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                <div>
                  <p className="font-black text-sm">Notice: the lease ends on {fmtDate(notice.endsAt)}</p>
                  <p className="mt-0.5">
                    {isTenant
                      ? `Pay the overdue rent (${inr(overdueAmount)}) before then to keep the lease.`
                      : `It ends then unless the tenant pays the overdue rent (${inr(overdueAmount)}).`}
                  </p>
                </div>
              </div>
            )}
            {!endedForRent && !noticeOpen && firstPending && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3 text-amber-900">
                <FiClock className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-black text-sm">First installment {isTenant ? 'is waiting for your payment' : 'is not paid yet'}</p>
                  <p className="mt-0.5">
                    Promised at the start: {inr(firstInstallment.amount)}. It must be paid by {fmtDate(agreement.firstPaymentDueBy)}, or the owner can end the lease.
                  </p>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white border border-gray-200 p-3 rounded-xl">
                <span className="text-gray-400 block text-[10px]">Duration</span>
                <span className="font-bold text-gray-800">{fmtDate(agreement.startDate)} – {fmtDate(agreement.endDate)}</span>
              </div>
              <div className="bg-white border border-gray-200 p-3 rounded-xl">
                <span className="text-gray-400 block text-[10px]">Terms</span>
                <span className="font-bold text-gray-800">
                  {data.leaseType === 'fixed-rent' ? `${inr(agreement.totalRent)} for ${agreement.durationMonths} months` : `${agreement.agreedShare}% Crop Share (owner's share)`}
                </span>
                {data.leaseType === 'fixed-rent' && <span className="block text-[10px] text-gray-500">{inr(agreement.agreedPrice)}/acre/year × {data.sizeInAcres} acres · about {inr(agreement.totalRent / (agreement.durationMonths || 1))} a month</span>}
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                <span className="text-emerald-700 block text-[10px]">Paid so far</span>
                <span className="font-extrabold text-emerald-900">{inr(data.totals?.paid)}</span>
              </div>
              {data.leaseType === 'fixed-rent' && (
                <div className={`p-3 rounded-xl border ${overdueAmount > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-100'}`}>
                  <span className={`block text-[10px] ${overdueAmount > 0 ? 'text-red-700' : 'text-amber-700'}`}>{overdueAmount > 0 ? 'Overdue' : 'Rent due'}</span>
                  <span className={`font-extrabold ${overdueAmount > 0 ? 'text-red-900' : 'text-amber-900'}`}>{inr(overdueAmount > 0 ? overdueAmount : data.totals?.pendingRent)}</span>
                  {overdueAmount > 0 && <span className="block text-[10px] text-red-700">of {inr(data.totals?.pendingRent)} still to pay</span>}
                </div>
              )}
            </div>

            {isTenant && (
              <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1">
                <p className="text-[11px] text-gray-500">
                  Payment comes from your wallet; if the wallet is short, you pay the full amount online. {data.leaseType === 'crop-share'
                    ? `A platform fee of ${agreement.commissionPercentage || 0}% of the total crop value is deducted from the owner's share.`
                    : `A platform fee of ${agreement.commissionPercentage || 0}% is deducted from the owner's amount.`}
                </p>
                {walletBalance !== null && (
                  <p className="font-bold text-gray-800 flex items-center justify-between">
                    <span>Wallet balance: {inr(walletBalance)}</span>
                    <button onClick={() => navigate('/user/wallet')} className="text-emerald-700 underline font-black">Add money</button>
                  </p>
                )}
              </div>
            )}

            {/* Owner: end the lease for unpaid rent */}
            {isOwner && eligibility?.eligible && (
              <div className="bg-white border border-red-200 rounded-xl p-3 space-y-2">
                <p className="font-black text-gray-900">{eligibility.immediate ? 'The first installment was not paid in time' : `${eligibility.overdue} installments are overdue (${inr(eligibility.overdueAmount)})`}</p>
                <p className="text-gray-600">
                  {eligibility.immediate
                    ? 'You can end this lease now.'
                    : `You can send a ${data.noticeDays}-day notice. The lease ends if the rent is still unpaid after it.`}
                </p>
                <button onClick={endForNonPayment} disabled={!!busyId} className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black disabled:opacity-60">
                  {busyId === 'end-lease' ? '...' : eligibility.immediate ? 'End lease for non-payment' : `Send ${data.noticeDays}-day notice`}
                </button>
              </div>
            )}

            {/* Fixed-rent installments */}
            {data.leaseType === 'fixed-rent' && (
              <div className="space-y-2">
                <h4 className="font-extrabold text-gray-900 text-xs">Monthly Installments</h4>
                {data.installments.map((item) => (
                  <div key={item._id} className={`bg-white border rounded-xl p-3 space-y-2 ${item.overdue ? 'border-red-200' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 text-sm">Installment {item.number} · {inr(item.amount)}</div>
                        <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                          <FiClock className="w-3 h-3" /> Due {fmtDate(item.dueDate)}
                          {item.status === 'paid' && item.paidAt && <span>· paid {fmtDate(item.paidAt)}</span>}
                          {isOwner && item.status === 'paid' && <span>· you received {inr(item.ownerAmount)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusChip status={item.status} />
                        {item.overdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700">Overdue</span>}
                      </div>
                    </div>
                    {isTenant && nextDue?._id === item._id && item.status !== 'paid' && (
                      <div className="[&>button]:w-full [&>button]:justify-center [&>button]:py-2.5">
                        {renderPayButton(item, () => payInstallment(item), 'Pay')}
                      </div>
                    )}
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
                        {(agreement.commissionPercentage || 0) > 0 && (
                          <> · platform fee ({agreement.commissionPercentage}% of crop value): <b>{inr(Math.min(sharePreview, (Number(harvest.harvestValue) || 0) * agreement.commissionPercentage / 100).toFixed(2))}</b></>
                        )}
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
      </div>
    </div>
  );
};

export default LeasePaymentsPage;
