import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  FiArrowLeft, 
  FiChevronLeft, 
  FiChevronRight, 
  FiLoader,
  FiArrowUp,
  FiArrowDown,
  FiAlertCircle,
  FiShield,
  FiSearch,
  FiRefreshCw,
  FiCopy,
  FiCheck,
  FiX,
  FiEye,
  FiClock,
  FiCheckCircle,
  FiExternalLink
} from 'react-icons/fi';
import { IoReceiptOutline, IoWalletOutline } from 'react-icons/io5';
import { MdAccountBalanceWallet } from 'react-icons/md';
import { toastManager } from '../../../../utils/toastManager';
import { walletService } from '../../../../services/walletService';
import withdrawalService from '../../../../services/withdrawalService';
import LogoLoader from '../../../../components/common/LogoLoader';
import NotificationBell from '../../components/common/NotificationBell';
import WithdrawalModal from '../../../../components/common/WithdrawalModal';
import useBodyScrollLock from '../../../../hooks/useBodyScrollLock';

const TYPE_CONFIG = {
  credit: { label: 'Credit', kind: 'credit' },
  refund: { label: 'Refund', kind: 'credit' },
  topup: { label: 'Wallet Top-up', kind: 'credit' },
  referral: { label: 'Referral Reward', kind: 'credit' },
  referral_reward: { label: 'Referral Reward', kind: 'credit' },
  cashback: { label: 'Cashback', kind: 'credit' },
  cash_collected: { label: 'Cash Collected', kind: 'credit' },
  payment: { label: 'Payment', kind: 'debit' },
  booking_payment: { label: 'Booking Payment', kind: 'debit' },
  worker_payment: { label: 'Worker Payment', kind: 'debit' },
  withdrawal: { label: 'Withdrawal', kind: 'debit' },
  payout: { label: 'Withdrawal', kind: 'debit' },
  platform_fee: { label: 'Platform Fee', kind: 'debit' },
  convenience_fee: { label: 'Convenience Fee', kind: 'debit' },
  gst: { label: 'GST', kind: 'debit' },
  penalty: { label: 'Penalty', kind: 'penalty' },
  fine: { label: 'Penalty Fine', kind: 'penalty' },
  cancellation_fee: { label: 'Cancellation Fee', kind: 'penalty' },
  debit: { label: 'Deduction', kind: 'penalty' }
};

const getKind = (type = '') => {
  const norm = String(type).toLowerCase();
  return TYPE_CONFIG[norm]?.kind || (norm.includes('refund') || norm.includes('credit') ? 'credit' : 'debit');
};

const getLabel = (type = '') => {
  const norm = String(type).toLowerCase();
  return TYPE_CONFIG[norm]?.label || String(type).replace(/_/g, ' ').toUpperCase();
};

const WalletHistory = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'withdrawals' ? 'withdrawals' : 'transactions';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);

  // Transactions State
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txPagination, setTxPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [txSummary, setTxSummary] = useState({ totalSpent: 0, totalPenalty: 0, totalRefunds: 0 });
  const [txFilter, setTxFilter] = useState('all'); // 'all' | 'credits' | 'payments' | 'penalties'
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Transaction Modal
  const [selectedTx, setSelectedTx] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Withdrawals State
  const [withdrawals, setWithdrawals] = useState([]);
  const [wLoading, setWLoading] = useState(false);
  const [wPage, setWPage] = useState(1);
  const [wPagination, setWPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [wFilter, setWFilter] = useState('all'); // 'all' | 'completed' | 'pending' | 'rejected'
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [viewProofItem, setViewProofItem] = useState(null);

  // Lock background scrolling when any modal is open in WalletHistory
  useBodyScrollLock(Boolean(selectedTx || showWithdrawModal || viewProofItem));

  // Sync tab with URL
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'withdrawals' ? { tab: 'withdrawals' } : {});
  };

  // Initial load
  useEffect(() => {
    loadBalance();
    loadTransactions(1);
    loadWithdrawals(1);
  }, []);

  const loadBalance = async () => {
    try {
      const res = await walletService.getBalance();
      if (res.success) {
        setWalletBalance(res.data.balance || 0);
      }
    } catch (err) {
      console.error('Error fetching balance:', err);
    }
  };

  const loadTransactions = async (page = 1, showIndicator = true) => {
    try {
      if (showIndicator) setTxLoading(true);
      const res = await walletService.getTransactions({ page, limit: 15 });
      if (res.success) {
        setTransactions(res.data || []);
        if (res.pagination) {
          setTxPagination(res.pagination);
          setTxPage(res.pagination.page);
        }
        if (res.summary) {
          setTxSummary(res.summary);
        }
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      toastManager.error('Failed to load transaction history');
    } finally {
      if (showIndicator) setTxLoading(false);
      setLoading(false);
    }
  };

  const loadWithdrawals = async (page = 1) => {
    try {
      setWLoading(true);
      const res = await withdrawalService.getHistory({ page, limit: 10 });
      if (res.success) {
        setWithdrawals(res.data || []);
        if (res.pagination) {
          setWPagination(res.pagination);
          setWPage(res.pagination.page);
        }
      }
    } catch (error) {
      console.error('Error loading withdrawals:', error);
    } finally {
      setWLoading(false);
    }
  };

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    toastManager.success('Copied to clipboard');
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Client-side filtering for search & type tabs
  const filteredTransactions = transactions.filter((tx) => {
    const kind = getKind(tx.type);
    if (txFilter === 'credits' && kind !== 'credit') return false;
    if (txFilter === 'payments' && kind !== 'debit') return false;
    if (txFilter === 'penalties' && kind !== 'penalty') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const desc = (tx.description || tx.title || '').toLowerCase();
      const type = (tx.type || '').toLowerCase();
      const ref = (tx.referenceId || tx.bookingId || tx.id || '').toLowerCase();
      const amt = String(tx.amount || '');
      return desc.includes(q) || type.includes(q) || ref.includes(q) || amt.includes(q);
    }
    return true;
  });

  const filteredWithdrawals = withdrawals.filter((item) => {
    const status = (item.status || '').toLowerCase();
    if (wFilter === 'completed' && status !== 'completed') return false;
    if (wFilter === 'pending' && !['pending', 'admin_accepted', 'processing'].includes(status)) return false;
    if (wFilter === 'rejected' && status !== 'rejected') return false;
    return true;
  });

  const formatDate = (rawDate) => {
    if (!rawDate) return 'Recent';
    const parsed = new Date(rawDate);
    if (isNaN(parsed.getTime())) return 'Recent';
    return parsed.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateTime = (rawDate) => {
    if (!rawDate) return 'N/A';
    const parsed = new Date(rawDate);
    if (isNaN(parsed.getTime())) return 'N/A';
    return parsed.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getWithdrawalBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Successful
        </span>
      );
    }
    if (s === 'ADMIN_ACCEPTED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Accepted
        </span>
      );
    }
    if (s === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Rejected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Processing
      </span>
    );
  };

  return (
    <div className="min-h-screen pb-20 relative bg-white">
      {/* Brand Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#347989'}20 0%, transparent 70%),
              radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#D68F35'}15 0%, transparent 70%),
              radial-gradient(at 100% 100%, ${themeColors?.brand?.orange || '#BB5F36'}10 0%, transparent 75%),
              #FFFFFF
            `
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(${themeColors?.brand?.teal || '#347989'} 0.8px, transparent 0.8px)`,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Top Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/60 border-b border-black/[0.04] px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate('/user/wallet', { replace: true });
                }
              }}
              className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-xs border border-slate-200/60 active:scale-95 transition-all text-slate-700 hover:text-black"
              aria-label="Back"
            >
              <FiArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                Wallet History
              </h1>
              <p className="text-[11px] font-medium text-slate-500">
                Complete Passbook & Settlements
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadBalance();
                if (activeTab === 'transactions') loadTransactions(txPage, true);
                else loadWithdrawals(wPage);
              }}
              className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-xs border border-slate-200/60 text-slate-600 hover:text-slate-900 transition-colors"
              title="Refresh"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${txLoading || wLoading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
            <NotificationBell />
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-3.5 py-3.5">
          {/* Mini Summary Banner */}
          <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-2xl p-4 text-white shadow-md mb-3.5 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md bg-white/15 flex items-center justify-center text-white">
                  <IoWalletOutline className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11px] font-bold text-emerald-100 uppercase tracking-wider">
                  AgroYilt Passbook
                </span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-100 bg-white/15 px-2 py-0.5 rounded-full border border-white/20 flex items-center gap-1">
                <FiShield className="w-3 h-3 text-emerald-200" />
                100% Escrow Protected
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-emerald-100/80 text-[10.5px] font-medium">Available Balance</p>
                <p className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  ₹{Number(walletBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div className="text-right">
                <p className="text-emerald-100/80 text-[10.5px] font-medium">Total Spent</p>
                <p className="text-base sm:text-lg font-bold text-white">
                  ₹{Number(txSummary.totalSpent || 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>

          {/* Segmented Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl mb-3.5">
            <button
              onClick={() => handleTabChange('transactions')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'transactions'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IoReceiptOutline className="w-3.5 h-3.5" />
              <span>Transactions</span>
              {txPagination.total > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'transactions' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {txPagination.total}
                </span>
              )}
            </button>

            <button
              onClick={() => handleTabChange('withdrawals')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'withdrawals'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MdAccountBalanceWallet className="w-3.5 h-3.5" />
              <span>Withdrawals</span>
              {wPagination.total > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'withdrawals' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {wPagination.total}
                </span>
              )}
            </button>
          </div>

          {/* ========================================================= */}
          {/* TAB 1: TRANSACTIONS PASSBOOK */}
          {/* ========================================================= */}
          {activeTab === 'transactions' && (
            <div>
              {/* Search & Filter Bar */}
              <div className="space-y-2 mb-3">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by description, ID, or amount..."
                    className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-8 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                  {[
                    { id: 'all', label: 'All Records' },
                    { id: 'credits', label: 'Credits & Refunds' },
                    { id: 'payments', label: 'Payments' },
                    { id: 'penalties', label: 'Penalties' }
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setTxFilter(filter.id)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                        txFilter === filter.id
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white border border-slate-200/70 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transactions List */}
              <div className={`space-y-2 transition-opacity ${txLoading ? 'opacity-50' : 'opacity-100'}`}>
                {loading ? (
                  <div className="text-center py-16">
                    <LogoLoader fullScreen={false} />
                    <p className="text-xs text-slate-500 mt-3 font-medium">Loading passbook history...</p>
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="text-center py-12 bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                      <IoReceiptOutline className="w-6 h-6" />
                    </div>
                    <p className="text-slate-800 font-bold text-sm mb-1">No transactions found</p>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      {searchQuery || txFilter !== 'all'
                        ? 'Try clearing your filters or search query.'
                        : 'Your refunds, booking payments, and top-ups will appear here.'}
                    </p>
                    {(searchQuery || txFilter !== 'all') && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setTxFilter('all');
                        }}
                        className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                ) : (
                  filteredTransactions.map((item, index) => {
                    const kind = getKind(item.type);
                    const formattedDate = formatDate(item.createdAt || item.date || item.timestamp);
                    const label = getLabel(item.type);

                    // Refined, subtle styling (NO loud borders)
                    const isCredit = kind === 'credit';
                    const isPenalty = kind === 'penalty';

                    const iconBg = isCredit
                      ? 'bg-emerald-50 text-emerald-600'
                      : isPenalty
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-slate-100 text-slate-600';

                    const amountColor = isCredit
                      ? 'text-emerald-600'
                      : isPenalty
                        ? 'text-amber-700'
                        : 'text-slate-900';

                    const amountSign = isCredit ? '+' : '-';

                    return (
                      <div
                        key={item.id || item._id || index}
                        onClick={() => setSelectedTx(item)}
                        className="flex items-center justify-between p-3 bg-white border border-slate-100 hover:border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-xs transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                            {isCredit ? (
                              <FiArrowDown className="w-4 h-4" />
                            ) : isPenalty ? (
                              <FiAlertCircle className="w-4 h-4" />
                            ) : (
                              <FiArrowUp className="w-4 h-4" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                              {item.description || item.title || 'Transaction'}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10.5px] text-slate-400 font-medium">{formattedDate}</span>
                              <span className="text-[9.5px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                {label}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-2">
                          <p className={`text-xs sm:text-sm font-black ${amountColor}`}>
                            {amountSign}₹{Number(item.amount || 0).toLocaleString('en-IN')}
                          </p>
                          {item.balanceAfter !== undefined && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Bal: ₹{Number(item.balanceAfter).toLocaleString('en-IN')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Transactions Pagination */}
              {!loading && txPagination.pages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500 mt-3">
                  <span>
                    Page <span className="font-bold text-slate-900">{txPagination.page}</span> of <span className="font-bold text-slate-900">{txPagination.pages}</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => loadTransactions(txPagination.page - 1)}
                      disabled={txPagination.page <= 1 || txLoading}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                    >
                      <FiChevronLeft className="w-3 h-3" />
                      <span>Prev</span>
                    </button>
                    <button
                      onClick={() => loadTransactions(txPagination.page + 1)}
                      disabled={txPagination.page >= txPagination.pages || txLoading}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                    >
                      <span>Next</span>
                      <FiChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: WITHDRAWALS HISTORY */}
          {/* ========================================================= */}
          {activeTab === 'withdrawals' && (
            <div>
              {/* Withdrawals Filter Pills + Action */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'pending', label: 'Processing' },
                    { id: 'rejected', label: 'Rejected' }
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setWFilter(filter.id)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                        wFilter === filter.id
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white border border-slate-200/70 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowWithdrawModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 shadow-xs active:scale-95 transition-all flex items-center gap-1"
                >
                  <MdAccountBalanceWallet className="w-3.5 h-3.5" />
                  <span>Withdraw</span>
                </button>
              </div>

              {/* Withdrawals List */}
              <div className={`space-y-2.5 transition-opacity ${wLoading ? 'opacity-50' : 'opacity-100'}`}>
                {wLoading && withdrawals.length === 0 ? (
                  <div className="text-center py-14">
                    <LogoLoader fullScreen={false} />
                    <p className="text-xs text-slate-500 mt-3 font-medium">Loading withdrawal requests...</p>
                  </div>
                ) : filteredWithdrawals.length === 0 ? (
                  <div className="text-center py-12 bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                      <FiClock className="w-6 h-6" />
                    </div>
                    <p className="text-slate-800 font-bold text-sm mb-1">No withdrawal requests</p>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto mb-3">
                      Your payout requests to bank or UPI will appear here.
                    </p>
                    <button
                      onClick={() => setShowWithdrawModal(true)}
                      className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-emerald-700 transition-all"
                    >
                      Request Payout
                    </button>
                  </div>
                ) : (
                  filteredWithdrawals.map((item) => {
                    const status = (item.status || '').toUpperCase();
                    return (
                      <div
                        key={item._id}
                        className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs hover:border-slate-200 transition-all space-y-2.5"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-base sm:text-lg font-black text-slate-900">
                              ₹{Number(item.amountINR || item.amount || 0).toLocaleString('en-IN')}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Requested: {formatDate(item.requestedAt || item.createdAt)}
                            </p>
                          </div>
                          <div>
                            {getWithdrawalBadge(item.status)}
                          </div>
                        </div>

                        <div className="bg-slate-50 rounded-lg p-2.5 text-xs text-slate-600 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Account / UPI</span>
                            <span className="font-mono font-medium text-slate-800">
                              {item.bankAccountMasked || item.upiId || '••••'}
                            </span>
                          </div>
                          {item.completedAt && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Completed On</span>
                              <span className="font-medium text-slate-800">{formatDate(item.completedAt)}</span>
                            </div>
                          )}
                          {item.paymentReference && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Ref / UTR</span>
                              <span className="font-mono font-medium text-slate-800">{item.paymentReference}</span>
                            </div>
                          )}
                        </div>

                        {status === 'REJECTED' && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                            <p className="font-bold text-[11px]">Withdrawal Rejected:</p>
                            <p className="text-[11px] mt-0.5">{item.rejectionReason || 'No reason provided'}</p>
                          </div>
                        )}

                        {status === 'COMPLETED' && item.paymentProof && (
                          <div className="flex justify-end pt-0.5">
                            <button
                              onClick={() => setViewProofItem(item)}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                            >
                              <FiEye className="w-3.5 h-3.5" />
                              View Transfer Proof
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Withdrawals Pagination */}
              {!wLoading && wPagination.pages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500 mt-3">
                  <span>
                    Page <span className="font-bold text-slate-900">{wPagination.page}</span> of <span className="font-bold text-slate-900">{wPagination.pages}</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => loadWithdrawals(wPagination.page - 1)}
                      disabled={wPagination.page <= 1 || wLoading}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                    >
                      <FiChevronLeft className="w-3 h-3" />
                      <span>Prev</span>
                    </button>
                    <button
                      onClick={() => loadWithdrawals(wPagination.page + 1)}
                      disabled={wPagination.page >= wPagination.pages || wLoading}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                    >
                      <span>Next</span>
                      <FiChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ========================================================= */}
      {/* TRANSACTION DETAILS MODAL */}
      {/* ========================================================= */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div
            className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  getKind(selectedTx.type) === 'credit'
                    ? 'bg-emerald-50 text-emerald-600'
                    : getKind(selectedTx.type) === 'penalty'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-slate-100 text-slate-600'
                }`}>
                  {getKind(selectedTx.type) === 'credit' ? (
                    <FiArrowDown className="w-4 h-4" />
                  ) : (
                    <FiArrowUp className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 leading-tight">Transaction Details</h3>
                  <p className="text-[10px] text-slate-400 font-medium">AgroYilt Escrow Ledger</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTx(null)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Amount Banner */}
            <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                {getLabel(selectedTx.type)}
              </span>
              <p className={`text-2xl font-black ${
                getKind(selectedTx.type) === 'credit'
                  ? 'text-emerald-600'
                  : getKind(selectedTx.type) === 'penalty'
                    ? 'text-amber-700'
                    : 'text-slate-900'
              }`}>
                {getKind(selectedTx.type) === 'credit' ? '+' : '-'}₹{Number(selectedTx.amount || 0).toLocaleString('en-IN')}
              </p>
              <div className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                <FiCheckCircle className="w-3 h-3" />
                <span>{selectedTx.status === 'completed' ? 'Completed & Settled' : (selectedTx.status || 'Success')}</span>
              </div>
            </div>

            {/* Key/Value Data List */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400">Description</span>
                <span className="font-bold text-slate-800 text-right max-w-[200px] truncate">
                  {selectedTx.description || selectedTx.title || 'Wallet Activity'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400">Timestamp</span>
                <span className="font-semibold text-slate-700">
                  {formatDateTime(selectedTx.createdAt || selectedTx.date || selectedTx.timestamp)}
                </span>
              </div>

              {(selectedTx.referenceId || selectedTx.id) && (
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-400">Reference ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-slate-700 font-medium">
                      {(selectedTx.referenceId || selectedTx.id).slice(-12)}
                    </span>
                    <button
                      onClick={() => handleCopy(selectedTx.referenceId || selectedTx.id)}
                      className="p-1 text-slate-400 hover:text-slate-700"
                      title="Copy Reference ID"
                    >
                      {copiedId ? <FiCheck className="w-3 h-3 text-emerald-600" /> : <FiCopy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}

              {selectedTx.balanceAfter !== undefined && (
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">Balance After</span>
                  <span className="font-black text-slate-900">
                    ₹{Number(selectedTx.balanceAfter).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedTx(null)}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Payment Proof Modal */}
      {viewProofItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-sm text-slate-900">Transfer Proof</h4>
              <button onClick={() => setViewProofItem(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-100 max-h-72">
              <img
                src={viewProofItem.paymentProof}
                alt="Payment proof"
                className="w-full h-auto object-contain"
              />
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-xs text-slate-400 font-mono">
                Ref: {viewProofItem.paymentReference || 'N/A'}
              </span>
              <a
                href={viewProofItem.paymentProof}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-emerald-600 flex items-center gap-1 hover:underline"
              >
                <span>Full Size</span>
                <FiExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Request Modal */}
      <WithdrawalModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onSuccess={() => {
          loadBalance();
          loadWithdrawals(1);
          toastManager.success('Withdrawal request submitted');
        }}
        role="farmer"
      />
    </div>
  );
};

export default WalletHistory;
