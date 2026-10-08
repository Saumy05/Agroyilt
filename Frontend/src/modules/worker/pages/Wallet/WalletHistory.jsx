import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiClock, 
  FiCheckCircle, 
  FiXCircle, 
  FiArrowUp, 
  FiArrowDown, 
  FiSend, 
  FiAlertCircle, 
  FiFileText, 
  FiCreditCard, 
  FiImage, 
  FiX, 
  FiInfo, 
  FiChevronRight,
  FiEye
} from 'react-icons/fi';
import { 
  IoWalletOutline, 
  IoReceiptOutline 
} from 'react-icons/io5';
import { FaWallet } from 'react-icons/fa';
import { AnimatePresence, motion } from 'framer-motion';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import workerWalletService from '../../../../services/workerWalletService';
import withdrawalService from '../../../../services/withdrawalService';
import { toastManager } from '../../../../utils/toastManager';
import LogoLoader from '../../../../components/common/LogoLoader';

const DEBIT_TYPES = ['commission_deduction', 'commission', 'platform_fee', 'penalty', 'withdrawal', 'debit', 'tds_deduction', 'referral_reversal'];
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

const WalletHistory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('passbook'); // 'passbook' | 'withdrawals'
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [filter, setFilter] = useState('all');

  // Modal inspection states
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

  // Reset filter when tab changes
  useEffect(() => {
    setFilter('all');
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txnRes, withRes] = await Promise.all([
        workerWalletService.getTransactions({ limit: 100 }),
        withdrawalService.getHistory({ page: 1, limit: 50 }).catch(() => ({ success: false, data: [] }))
      ]);

      if (txnRes.success) {
        setTransactions(txnRes.data || []);
      }
      if (withRes.success) {
        setWithdrawals(withRes.data || []);
      }
    } catch (error) {
      console.error('Failed to load wallet history:', error);
      toastManager.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const effectOf = (type) => {
    if (NEUTRAL_TYPES.includes(type)) return 'cash';
    if (DEBIT_TYPES.includes(type)) return 'debit';
    return 'credit';
  };

  const matchesFilter = (txn) => {
    if (filter === 'all') return true;
    if (filter === 'earnings') return effectOf(txn.type) === 'credit';
    if (filter === 'cash_jobs') return txn.type === 'cash_collected';
    if (filter === 'deductions') return effectOf(txn.type) === 'debit';
    return true;
  };

  // Group job entries together by assignmentId
  const historyItems = [];
  const jobCards = new Map();
  for (const txn of transactions.filter(matchesFilter)) {
    const jobId = txn.metadata?.assignmentId;
    if (!jobId) { 
      historyItems.push({ kind: 'single', txn }); 
      continue; 
    }
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
    if (effect === 'cash') return 'text-amber-700';
    return effect === 'debit' ? 'text-rose-600' : 'text-emerald-600';
  };

  const getTransactionIcon = (type) => {
    if (type === 'payment') return <FiCheckCircle className="w-4 h-4 text-emerald-600" />;
    if (type === 'cash_collected') return <FaWallet className="w-4 h-4 text-amber-600" />;
    const effect = effectOf(type);
    if (effect === 'debit') return <FiArrowUp className="w-4 h-4 text-rose-500" />;
    return <FiArrowDown className="w-4 h-4 text-emerald-600" />;
  };

  const getTransactionLabel = (type, txn) => {
    if (txn?.metadata?.type === 'dues_recovery') return 'Dues Paid from Balance';
    return TYPE_LABELS[type] || String(type || '').replace(/_/g, ' ');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredWithdrawals = withdrawals.filter(item => {
    if (filter === 'all') return true;
    const status = (item.status || '').toLowerCase();
    if (filter === 'completed') return status === 'completed';
    if (filter === 'pending') return status === 'pending' || status === 'admin_accepted';
    if (filter === 'rejected') return status === 'rejected';
    return true;
  });

  const getWithdrawalBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Successful
        </span>
      );
    }
    if (s === 'ADMIN_ACCEPTED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Accepted
        </span>
      );
    }
    if (s === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Rejected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Processing
      </span>
    );
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
      <Header
        title="Wallet History"
        showBack={true}
        onBack={() => {
          if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
          } else {
            navigate('/worker/wallet', { replace: true });
          }
        }}
      />

      <main className="px-3.5 py-3">
        {/* Segmented Control / Tabs */}
        <div className="bg-slate-200/70 p-1 rounded-xl flex gap-1 mb-2.5 backdrop-blur-md">
          <button
            onClick={() => setActiveTab('passbook')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'passbook'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 font-semibold'
            }`}
          >
            <IoReceiptOutline className="w-3.5 h-3.5 text-emerald-700" />
            <span>Passbook & Jobs</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'passbook' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300/60 text-slate-700'
            }`}>
              {historyItems.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'withdrawals'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 font-semibold'
            }`}
          >
            <FiArrowUp className="w-3.5 h-3.5 text-emerald-700" />
            <span>Withdrawals</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'withdrawals' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300/60 text-slate-700'
            }`}>
              {withdrawals.length}
            </span>
          </button>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-1.5 mb-2.5 overflow-x-auto pb-1 scrollbar-hide">
          {activeTab === 'passbook' ? (
            [
              { id: 'all', label: 'All' },
              { id: 'earnings', label: 'Earnings' },
              { id: 'cash_jobs', label: 'Cash Jobs' },
              { id: 'deductions', label: 'Deductions' },
            ].map(option => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id)}
                className={`px-3 py-1.5 rounded-full font-bold text-xs whitespace-nowrap transition-all ${
                  filter === option.id
                    ? 'text-white'
                    : 'bg-white text-gray-700 border border-slate-200/80 hover:bg-slate-50'
                }`}
                style={
                  filter === option.id
                    ? {
                      background: themeColors.button,
                      boxShadow: `0 2px 6px ${themeColors.button}30`,
                    }
                    : {
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                    }
                }
              >
                {option.label}
              </button>
            ))
          ) : (
            [
              { id: 'all', label: 'All' },
              { id: 'completed', label: 'Completed' },
              { id: 'pending', label: 'Pending' },
              { id: 'rejected', label: 'Rejected' },
            ].map(option => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id)}
                className={`px-3 py-1.5 rounded-full font-bold text-xs whitespace-nowrap transition-all ${
                  filter === option.id
                    ? 'text-white'
                    : 'bg-white text-gray-700 border border-slate-200/80 hover:bg-slate-50'
                }`}
                style={
                  filter === option.id
                    ? {
                      background: themeColors.button,
                      boxShadow: `0 2px 6px ${themeColors.button}30`,
                    }
                    : {
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                    }
                }
              >
                {option.label}
              </button>
            ))
          )}
        </div>

        {/* Subtitle count indicator */}
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
            {activeTab === 'passbook' 
              ? `${historyItems.length} Record${historyItems.length === 1 ? '' : 's'}`
              : `${filteredWithdrawals.length} Withdrawal${filteredWithdrawals.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${themeColors.button} transparent ${themeColors.button} ${themeColors.button}` }}></div>
          </div>
        ) : activeTab === 'passbook' ? (
          historyItems.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-xs border border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-2.5 text-emerald-600">
                <IoReceiptOutline className="w-6 h-6" />
              </div>
              <p className="text-slate-800 font-bold text-sm mb-0.5">No passbook records</p>
              <p className="text-xs text-gray-500">Your job payouts and passbook entries will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historyItems.map((item) => {
                if (item.kind === 'job') {
                  const entries = sortEntries(item.entries);
                  const cash = entries.find(e => e.type === 'cash_collected');
                  const deducted = entries.filter(e => effectOf(e.type) === 'debit').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                  const credited = entries.filter(e => effectOf(e.type) === 'credit').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                  return (
                    <div key={item.id} className="bg-white rounded-xl p-3 shadow-xs border border-slate-100 border-l-4 border-l-emerald-600 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">{item.title}</p>
                          {cash && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 shrink-0">
                              Cash Job
                            </span>
                          )}
                        </div>
                        <span className="text-[10.5px] text-slate-400 shrink-0 ml-2 font-medium">{formatDate(item.date)}</span>
                      </div>
                      
                      <div className="space-y-1.5 text-xs bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 mb-2">
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
                    onClick={() => {
                      if (txn.type === 'worker_payment') setSelectedTransaction(txn);
                    }}
                    className={`bg-white rounded-xl p-3 shadow-xs border border-slate-100 border-l-4 ${
                      isPayment ? 'border-l-emerald-500' : effect === 'debit' ? 'border-l-rose-500' : effect === 'cash' ? 'border-l-amber-500' : 'border-l-emerald-500'
                    } ${txn.type === 'worker_payment' ? 'cursor-pointer hover:shadow-sm active:scale-[0.98] transition-all' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
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
                            <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">{getTransactionLabel(txn.type, txn)}</p>
                            {isPayment && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800">
                                Online
                              </span>
                            )}
                          </div>
                          <p className={`text-xs sm:text-sm font-black ${isPayment ? 'text-slate-900' : amountColor(txn)}`}>{amountText(txn)}</p>
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
                            <span className="text-[10px] text-emerald-700 font-bold ml-auto flex items-center gap-0.5">
                              Details <FiChevronRight className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          filteredWithdrawals.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-xs border border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-2.5 text-emerald-600">
                <IoWalletOutline className="w-6 h-6" />
              </div>
              <p className="text-slate-800 font-bold text-sm mb-0.5">No withdrawals found</p>
              <p className="text-xs text-gray-500">Your requested payouts and bank transfer history will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredWithdrawals.map((item) => (
                <div key={item._id} className="bg-white rounded-xl p-3 shadow-xs border border-slate-100/90 border-l-4 border-l-purple-500 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <IoWalletOutline className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="font-black text-slate-900 text-sm">₹{Number(item.amount || 0).toLocaleString('en-IN')}</p>
                        {getWithdrawalBadge(item.status)}
                      </div>

                      <p className="text-[11px] text-gray-600 mb-1 leading-snug">
                        {item.paymentMethod === 'upi' ? `UPI: ${item.upiId || 'Direct'}` : `Bank Account: •••• ${item.bankDetails?.accountNumber?.slice(-4) || 'Direct'}`}
                        {item.referenceNumber && ` • Ref: #${item.referenceNumber}`}
                      </p>

                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10.5px] text-gray-400 font-medium">{formatDate(item.createdAt)}</span>
                        {item.paymentProof && (
                          <button
                            onClick={() => {
                              setSelectedImage(item.paymentProof);
                              setImageModalOpen(true);
                            }}
                            className="text-[10.5px] text-emerald-700 font-bold flex items-center gap-1 hover:underline"
                          >
                            <FiEye className="w-3 h-3" /> View Proof
                          </button>
                        )}
                      </div>

                      {item.status === 'REJECTED' && item.rejectionReason && (
                        <div className="mt-1.5 p-2 bg-rose-50 border border-rose-100 rounded-lg">
                          <p className="text-[11px] text-rose-700">
                            <strong className="font-bold">Reason:</strong> {item.rejectionReason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
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
              <div className="sticky top-0 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white px-5 py-4 rounded-t-3xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                    <IoReceiptOutline className="w-5 h-5 text-emerald-100" />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Payment Details</h3>
                    <p className="text-[11px] text-emerald-100/80">Transaction Information</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="text-center pb-4 border-b border-gray-100">
                  <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-0.5">Amount Received</p>
                  <p className="text-3xl font-black text-emerald-600">₹{selectedTransaction.amount?.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatDateTime(selectedTransaction.createdAt)}</p>
                </div>

                {selectedTransaction.metadata?.screenshot && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <FiImage className="w-4 h-4 text-emerald-600" />
                      <h4 className="font-bold text-gray-900 text-xs">Payment Proof</h4>
                    </div>
                    <div
                      className="relative rounded-xl overflow-hidden border border-gray-200 cursor-pointer hover:border-emerald-500 transition-colors"
                      onClick={() => {
                        setSelectedImage(selectedTransaction.metadata.screenshot);
                        setImageModalOpen(true);
                      }}
                    >
                      <img
                        src={selectedTransaction.metadata.screenshot}
                        alt="Payment Screenshot"
                        className="w-full h-44 object-cover"
                      />
                    </div>
                  </div>
                )}

                {selectedTransaction.metadata?.transactionId && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 font-bold uppercase mb-0.5">Transaction ID</p>
                    <p className="text-gray-700 font-mono text-xs break-all">{selectedTransaction.metadata.transactionId}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {imageModalOpen && selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[10001] flex items-center justify-center p-4"
            onClick={() => setImageModalOpen(false)}
          >
            <div className="relative max-w-3xl max-h-[90vh]">
              <button
                onClick={() => setImageModalOpen(false)}
                className="absolute -top-12 right-0 text-white bg-white/20 hover:bg-white/30 rounded-full p-2"
              >
                <FiX className="w-6 h-6" />
              </button>
              <img
                src={selectedImage}
                alt="Enlarged proof"
                className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

export default WalletHistory;
