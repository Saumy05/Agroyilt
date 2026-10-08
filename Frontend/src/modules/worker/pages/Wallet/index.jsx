import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowUp, FiArrowDown, FiClock, FiBell, FiX, FiImage, FiFileText, FiCreditCard, FiCalendar, FiInfo, FiCheckCircle, FiShield } from 'react-icons/fi';
import { IoWallet, IoWalletOutline } from 'react-icons/io5';
import { FaWallet } from 'react-icons/fa';
import { AnimatePresence, motion } from 'framer-motion';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import workerWalletService from '../../../../services/workerWalletService';
import { toastManager } from '../../../../utils/toastManager';
import LogoLoader from '../../../../components/common/LogoLoader';
import WithdrawalModal from '../../../../components/common/WithdrawalModal';
import WithdrawalHistoryList from '../../../../components/common/WithdrawalHistoryList';
import { useSocket } from '../../../../context/SocketContext';
import PayDuesSheet from '../../components/common/PayDuesSheet';

// Passbook entry types that take money OUT of the worker's wallet (everything else adds, except cash in hand)
const DEBIT_TYPES = ['commission_deduction', 'commission', 'platform_fee', 'penalty', 'withdrawal', 'debit', 'tds_deduction', 'referral_reversal'];
// Entries that don't move wallet money (cash in hand, dues paid online / to the admin)
const NEUTRAL_TYPES = ['cash_collected', 'payment'];
const TYPE_LABELS = {
  earnings_credit: 'Earnings',
  worker_payment: 'Payment Received',
  refund: 'Refund',
  referral_reward: 'Referral Reward',
  credit: 'Credit',
  settlement: 'Settlement',
  cash_collected: 'Cash Received',
  commission_deduction: 'App Commission',
  commission: 'App Commission',
  platform_fee: 'Platform Fee',
  penalty: 'Penalty',
  withdrawal: 'Withdrawal',
  debit: 'Deduction',
  payment: 'Dues Paid',
  tds_deduction: 'TDS',
  referral_reversal: 'Referral Reversed'
};

const Wallet = () => {
  const [loading, setLoading] = useState(true);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [showPayDues, setShowPayDues] = useState(false);
  const [duesPayments, setDuesPayments] = useState([]);
  const [wallet, setWallet] = useState({
    balance: 0,
    pendingPayout: 0
  });
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

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

  const socket = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    loadWalletData();
  }, []);

  // Keep the wallet live: refresh when a job settles / a penalty applies, and whenever the screen comes back
  useEffect(() => {
    const refresh = () => loadWalletData({ silent: true });
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    if (socket) socket.on('wallet_balance_updated', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      if (socket) socket.off('wallet_balance_updated', refresh);
    };
  }, [socket]);

  const loadWalletData = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [walletRes, txnRes, duesRes] = await Promise.all([
        workerWalletService.getWallet(),
        workerWalletService.getTransactions({ limit: 50 }),
        workerWalletService.getDuesPayments().catch(() => null)
      ]);

      if (duesRes?.success) {
        setDuesPayments(duesRes.data || []);
      }

      if (walletRes.success) {
        setWallet(walletRes.data);
      }

      if (txnRes.success) {
        setTransactions(txnRes.data || []);
      }
    } catch (error) {
      console.error('Error loading wallet:', error);
      if (!silent) toastManager.error('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPayout = async (bookingId) => {
    if (payoutLoading) return;
    try {
      setPayoutLoading(bookingId);
      await workerWalletService.requestPayout(bookingId);
      toastManager.success('Payout request sent to vendor');
    } catch (error) {
      toastManager.error(error.message || 'Failed to request payout');
    } finally {
      setPayoutLoading(false);
    }
  };

  // What an entry does to the wallet. Cash received is money in hand, not wallet money.
  const effectOf = (type) => {
    if (NEUTRAL_TYPES.includes(type)) return 'cash';
    if (DEBIT_TYPES.includes(type)) return 'debit';
    return 'credit';
  };
  const matchesFilter = (txn) => {
    if (filter === 'all') return true;
    const effect = effectOf(txn.type);
    return filter === 'deductions' ? effect === 'debit' : effect !== 'debit';
  };

  // One card per job (entries share metadata.assignmentId); everything else stays a single row
  const historyItems = [];
  const jobCards = new Map();
  for (const txn of transactions.filter(matchesFilter)) {
    const jobId = txn.metadata?.assignmentId;
    if (!jobId) { historyItems.push({ kind: 'single', txn }); continue; }
    if (!jobCards.has(jobId)) {
      const card = { kind: 'job', id: jobId, title: txn.metadata?.workTitle || 'Job', date: txn.createdAt, entries: [] };
      jobCards.set(jobId, card);
      historyItems.push(card);
    }
    jobCards.get(jobId).entries.push(txn);
  }
  const ENTRY_ORDER = ['cash_collected', 'earnings_credit', 'platform_fee', 'commission_deduction'];
  const sortEntries = (entries) => [...entries].sort((x, y) => ENTRY_ORDER.indexOf(x.type) - ENTRY_ORDER.indexOf(y.type));
  const amountText = (txn) => {
    const effect = effectOf(txn.type);
    const value = `₹${Math.abs(Number(txn.amount) || 0).toLocaleString('en-IN')}`;
    if (effect === 'cash') return value;
    return `${effect === 'debit' ? '−' : '+'}${value}`;
  };
  const amountColor = (txn) => {
    const effect = effectOf(txn.type);
    if (effect === 'cash') return 'text-slate-800';
    return effect === 'debit' ? 'text-rose-600' : 'text-emerald-600';
  };

  const getTransactionIcon = (type) => {
    if (type === 'payment') return <FiCheckCircle className="w-5 h-5 text-emerald-600" />;
    if (type === 'cash_collected') return <FaWallet className="w-5 h-5 text-amber-600" />;
    const effect = effectOf(type);
    if (effect === 'debit') return <FiArrowUp className="w-5 h-5 text-rose-500" />;
    return <FiArrowDown className="w-5 h-5 text-emerald-600" />;
  };

  const getTransactionLabel = (type, txn) => {
    if (txn?.metadata?.type === 'dues_recovery') return 'Dues Paid from Balance';
    return TYPE_LABELS[type] || String(type || '').replace(/_/g, ' ');
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleTransactionClick = (txn) => {
    // Only open details modal for worker_payment transactions
    if (txn.type === 'worker_payment') {
      setSelectedTransaction(txn);
    }
  };

  const viewScreenshot = (imageUrl) => {
    setSelectedImage(imageUrl);
    setImageModalOpen(true);
  };

  // Lock body scroll when modal is open
  useEffect(() => {
    if (selectedTransaction || imageModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedTransaction, imageModalOpen]);

  if (loading) {
    return <LogoLoader />;
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
      <Header title="My Wallet" onBack={() => navigate('/worker/dashboard', { replace: true })} />

      <main className="px-4 py-4 sm:py-5">
        {/* Balance Card - Compact Mobile View */}
        <div className="rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden mb-4 bg-gradient-to-br from-emerald-700 via-emerald-800 to-green-900 border border-emerald-600/30">
          {/* Subtle ambient decorative accents */}
          <div className="absolute -top-10 -right-10 w-36 h-36 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-emerald-500/20 rounded-full blur-lg pointer-events-none" />

          <div className="relative z-10 text-white">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-emerald-100/80 text-[11px] font-bold uppercase tracking-wider mb-0.5">Available Balance</p>
                <p className="text-2xl sm:text-3xl font-black tracking-tight">
                  ₹{Number(wallet?.balance ?? wallet?.wallet?.balance ?? 0).toLocaleString('en-IN')}
                </p>
                {Number(wallet?.reservedWithdrawal || wallet?.wallet?.reservedWithdrawal || 0) > 0 && (
                  <p className="text-[10px] text-emerald-200/90 font-medium mt-0.5">
                    ₹{Number(wallet?.reservedWithdrawal || wallet?.wallet?.reservedWithdrawal || 0).toLocaleString('en-IN')} pending withdrawal
                  </p>
                )}
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                <IoWallet className="w-5 h-5 text-emerald-100" />
              </div>
            </div>

            {Number(wallet?.outstandingDues || 0) > 0 && (
              <div className="mb-3 bg-rose-500/30 border border-rose-200/40 rounded-xl p-2.5 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black text-white">You owe ₹{Number(wallet.outstandingDues).toLocaleString('en-IN')} dues</p>
                  <button
                    onClick={() => setShowPayDues(true)}
                    className="bg-white text-rose-700 hover:bg-rose-50 font-black px-2.5 py-1 rounded-lg text-[11px] active:scale-[0.98] transition-all shadow-xs shrink-0"
                  >
                    Pay Now
                  </button>
                </div>
                {wallet?.isRestricted && (
                  <p className="text-[10px] font-bold text-white mt-1">Account restricted: {wallet.restrictionReason || 'dues limit crossed'}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowWithdrawModal(true)}
                className="flex-1 bg-white hover:bg-emerald-50 text-emerald-950 font-black py-2.5 px-3.5 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 text-xs"
              >
                <FiArrowUp className="w-3.5 h-3.5 text-emerald-700 stroke-[2.5]" />
                <span>Request Withdrawal</span>
              </button>
              <div className="bg-black/20 text-emerald-100/90 py-2 px-2.5 rounded-xl font-semibold text-[10px] text-center border border-white/10 flex items-center justify-center gap-1 shrink-0 backdrop-blur-xs">
                <FiShield className="w-3 h-3 text-emerald-300 shrink-0" />
                <span>{(wallet?.vendorId || wallet?.wallet?.vendorId) ? 'Vendor Payouts' : 'Direct Payouts'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dues payments waiting for / refused by the admin */}
        {duesPayments.filter(p => p.status === 'PENDING_REVIEW' || p.status === 'REJECTED').slice(0, 3).map(p => (
          <div key={p._id} className={`mb-3 rounded-xl px-4 py-3 border text-sm ${p.status === 'REJECTED' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`font-bold ${p.status === 'REJECTED' ? 'text-red-800' : 'text-amber-900'}`}>
              {p.status === 'REJECTED' ? 'Dues payment not accepted' : 'Waiting for admin to confirm'} · ₹{Number(p.amount).toLocaleString('en-IN')} ({p.offlineMode === 'upi' ? 'UPI' : 'cash'})
            </p>
            <p className="text-xs text-gray-600">
              {p.status === 'REJECTED' ? `Reason: ${p.adminNote || 'not given'}` : `Sent on ${formatDate(p.createdAt)}. Your dues update once the admin confirms.`}
            </p>
          </div>
        ))}

        {/* Pending Payouts List */}
        {wallet.pendingBookings?.length > 0 && (
          <div className="mb-8">
            <h3 className="font-bold text-gray-800 mb-4 px-1">Pending Payments</h3>
            <div className="space-y-3">
              {wallet.pendingBookings.map(booking => (
                <div key={booking._id} className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100 flex justify-between items-center">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm mb-0.5">{booking.serviceName}</p>
                    <p className="text-xs text-gray-500 font-medium mb-1">Booking #{booking.bookingNumber}</p>
                    <p className="text-[10px] text-gray-400">
                      Completed: {new Date(booking.completedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {wallet.vendorId ? (
                    <button
                      onClick={() => handleRequestPayout(booking._id)}
                      disabled={payoutLoading === booking._id}
                      className="flex-shrink-0 px-3 py-2 bg-orange-50 text-orange-600 border border-orange-200 text-xs font-bold rounded-xl active:scale-95 transition-all flex items-center gap-1.5 hover:bg-orange-100"
                    >
                      {payoutLoading === booking._id ? (
                        <span className="w-3 h-3 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin"></span>
                      ) : (
                        <>
                          <FiBell className="w-3.5 h-3.5" />
                          Ask Vendor
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 text-xs font-bold rounded-xl">
                      Pending Settlement
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { id: 'all', label: 'All' },
            { id: 'earnings', label: 'Earnings' },
            { id: 'deductions', label: 'Deductions' },
          ].map((filterOption) => (
            <button
              key={filterOption.id}
              onClick={() => setFilter(filterOption.id)}
              className={`px-4.5 py-2 rounded-full font-bold text-xs whitespace-nowrap transition-all ${
                filter === filterOption.id
                  ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/25'
                  : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {filterOption.label}
            </button>
          ))}
        </div>

        {/* Transactions/Ledger */}
        <div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">Transaction History</h3>
            <span className="text-[11px] text-slate-400 font-medium">{historyItems.length} record{historyItems.length === 1 ? '' : 's'}</span>
          </div>
          {historyItems.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center shadow-xs border border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3 text-emerald-600">
                <IoWalletOutline className="w-6 h-6" />
              </div>
              <p className="text-slate-800 font-bold text-sm mb-0.5">No transactions yet</p>
              <p className="text-xs text-slate-400">Your payments will appear here</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {historyItems.map((item) => {
                if (item.kind === 'job') {
                  const entries = sortEntries(item.entries);
                  const cash = entries.find(e => e.type === 'cash_collected');
                  const deducted = entries.filter(e => effectOf(e.type) === 'debit').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                  const credited = entries.filter(e => effectOf(e.type) === 'credit').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                  return (
                    <div key={item.id} className="bg-white rounded-xl p-3.5 sm:p-4 shadow-xs border border-slate-100 border-l-4 border-l-emerald-600 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">{item.title}</p>
                          {cash && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 shrink-0">
                              Cash Job
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0 ml-2 font-medium">{formatDate(item.date)}</span>
                      </div>
                      <div className="space-y-1.5 text-xs bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 mb-2.5">
                        {entries.map(e => (
                          <div key={e._id} className="flex justify-between items-center gap-3">
                            <span className="text-slate-600 text-[11px] font-semibold flex items-center gap-1.5">
                              {e.type === 'cash_collected' ? <FaWallet className="text-amber-600 w-2.5 h-2.5" /> : null}
                              {getTransactionLabel(e.type, e)}
                              {e.type === 'cash_collected' && <span className="text-[10px] text-slate-400 font-normal">(in hand)</span>}
                            </span>
                            <span className={`font-black text-xs ${amountColor(e)}`}>{amountText(e)}</span>
                          </div>
                        ))}
                      </div>
                      {filter === 'all' && (cash || credited > 0) && (
                        <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-slate-200 text-xs">
                          <span className="font-bold text-slate-600 text-[11px] uppercase tracking-wide">{cash ? 'You kept' : 'Added to wallet'}</span>
                          <span className="font-black text-emerald-700 text-sm">
                            ₹{((cash ? Number(cash.amount) || 0 : credited) - (cash ? deducted : 0)).toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }
                const txn = item.txn;
                const effect = effectOf(txn.type);
                const isPayment = txn.type === 'payment';
                return (
                  <div
                    key={txn._id}
                    onClick={() => handleTransactionClick(txn)}
                    className={`bg-white rounded-xl p-3 sm:p-3.5 shadow-xs border border-slate-100 border-l-4 ${
                      isPayment ? 'border-l-emerald-500' : effect === 'debit' ? 'border-l-rose-500' : effect === 'cash' ? 'border-l-amber-500' : 'border-l-emerald-500'
                    } ${txn.type === 'worker_payment' ? 'cursor-pointer hover:shadow-sm active:scale-[0.98] transition-all' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isPayment ? 'bg-emerald-50 text-emerald-600' : effect === 'debit' ? 'bg-rose-50 text-rose-600' : effect === 'cash' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        {getTransactionIcon(txn.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 truncate">
                            <p className="font-bold text-slate-900 text-xs truncate">{getTransactionLabel(txn.type, txn)}</p>
                            {isPayment && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800">
                                Online
                              </span>
                            )}
                          </div>
                          <p className={`text-sm font-black ${isPayment ? 'text-slate-900' : amountColor(txn)}`}>{amountText(txn)}</p>
                        </div>

                        <p className="text-[11px] text-slate-500 line-clamp-1 mb-0.5">{txn.description}</p>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-medium">{formatDate(txn.createdAt)}</span>
                          {txn.status !== 'completed' && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${txn.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                              {txn.status}
                            </span>
                          )}
                          {txn.type === 'worker_payment' && (
                            <span className="text-[10px] text-emerald-700 font-bold ml-auto">Details →</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Withdrawal History Section */}
        <div className="mt-8">
          <WithdrawalHistoryList role="worker" refreshTrigger={historyRefreshKey} />
        </div>
      </main>

      {/* Payment Details Modal */}
      <AnimatePresence>
        {selectedTransaction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-end sm:items-center justify-center p-4"
            onClick={() => setSelectedTransaction(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 bg-gradient-to-br from-emerald-700 to-green-900 text-white px-6 py-5 rounded-t-3xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                    <IoWallet className="w-6 h-6 text-emerald-100" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg">Payment Details</h3>
                    <p className="text-xs text-emerald-100/80">Transaction Information</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Amount Section */}
                <div className="text-center pb-6 border-b border-gray-100">
                  <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">Amount Received</p>
                  <p className="text-4xl font-black text-emerald-600">₹{selectedTransaction.amount?.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-2">{formatDateTime(selectedTransaction.createdAt)}</p>
                </div>

                {/* Screenshot */}
                {selectedTransaction.metadata?.screenshot && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FiImage className="w-5 h-5 text-emerald-600" />
                      <h4 className="font-bold text-gray-900">Payment Proof</h4>
                    </div>
                    <div
                      className="relative rounded-2xl overflow-hidden border-2 border-gray-100 cursor-pointer hover:border-emerald-500 transition-colors group"
                      onClick={() => viewScreenshot(selectedTransaction.metadata.screenshot)}
                    >
                      <img
                        src={selectedTransaction.metadata.screenshot}
                        alt="Payment Screenshot"
                        className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="200"%3E%3Crect fill="%23f3f4f6" width="400" height="200"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="18" dy="100" dx="120"%3EImage not available%3C/text%3E%3C/svg%3E';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full">
                          <p className="text-sm font-bold text-gray-900">Click to enlarge</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Method */}
                {selectedTransaction.metadata?.paymentMethod && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FiCreditCard className="w-5 h-5 text-teal-600" />
                      <h4 className="font-bold text-gray-900">Payment Method</h4>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-gray-700 font-semibold capitalize">
                        {selectedTransaction.metadata.paymentMethod === 'hand_to_hand'
                          ? 'Cash / Hand-to-Hand'
                          : selectedTransaction.metadata.paymentMethod}
                      </p>
                    </div>
                  </div>
                )}

                {/* Transaction ID */}
                {selectedTransaction.metadata?.transactionId && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FiFileText className="w-5 h-5 text-teal-600" />
                      <h4 className="font-bold text-gray-900">Transaction ID</h4>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-gray-700 font-mono text-sm break-all">{selectedTransaction.metadata.transactionId}</p>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedTransaction.metadata?.notes && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FiInfo className="w-5 h-5 text-teal-600" />
                      <h4 className="font-bold text-gray-900">Payment Notes</h4>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-gray-700 text-sm leading-relaxed">{selectedTransaction.metadata.notes}</p>
                    </div>
                  </div>
                )}

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-teal-50 rounded-xl p-4">
                    <p className="text-xs text-teal-600 font-semibold mb-1">Status</p>
                    <p className="text-sm font-bold text-gray-900 capitalize">{selectedTransaction.status}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4">
                    <p className="text-xs text-blue-600 font-semibold mb-1">Type</p>
                    <p className="text-sm font-bold text-gray-900">Payment Received</p>
                  </div>
                </div>

                {/* Description */}
                {selectedTransaction.description && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 font-semibold mb-2">Description</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{selectedTransaction.description}</p>
                  </div>
                )}

                {/* Close Button */}
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="w-full py-4 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Fullscreen Modal */}
      <AnimatePresence>
        {imageModalOpen && selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[10001] flex items-center justify-center p-4"
            onClick={() => setImageModalOpen(false)}
          >
            <button
              onClick={() => setImageModalOpen(false)}
              className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
            >
              <FiX className="w-6 h-6" />
            </button>
            <motion.img
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              src={selectedImage}
              alt="Payment Screenshot"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <PayDuesSheet
        isOpen={showPayDues}
        onClose={() => setShowPayDues(false)}
        dues={Number(wallet?.outstandingDues || 0)}
        hasPendingOffline={duesPayments.some(p => p.status === 'PENDING_REVIEW')}
        onDone={() => loadWalletData({ silent: true })}
      />

      {/* Universal Withdrawal Modal */}
      <WithdrawalModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        role="worker"
        workerType={wallet?.workerType || wallet?.wallet?.workerType || 'WORKER'}
        currentBalance={Number(wallet?.balance ?? wallet?.wallet?.balance ?? 0)}
        onSuccess={() => {
          loadWalletData();
          setHistoryRefreshKey(prev => prev + 1);
        }}
      />

      {/* Hide BottomNav when modal is open */}
      {!selectedTransaction && !imageModalOpen && <BottomNav />}
    </div>
  );
};

export default Wallet;
