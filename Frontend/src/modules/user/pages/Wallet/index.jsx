import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiArrowLeft, 
  FiChevronLeft, 
  FiChevronRight, 
  FiLoader,
  FiArrowUp,
  FiArrowDown,
  FiAlertCircle,
  FiShield,
  FiPlus,
  FiGift
} from 'react-icons/fi';
import { IoWallet, IoWalletOutline, IoReceiptOutline } from 'react-icons/io5';
import { MdAccountBalanceWallet } from 'react-icons/md';
import { toastManager } from '../../../../utils/toastManager';
import { walletService } from '../../../../services/walletService';
import LogoLoader from '../../../../components/common/LogoLoader';
import NotificationBell from '../../components/common/NotificationBell';
import { themeColors } from '../../../../theme';
import { useSocket } from '../../../../context/SocketContext';
import WithdrawalModal from '../../../../components/common/WithdrawalModal';
import WithdrawalHistoryList from '../../../../components/common/WithdrawalHistoryList';

const Wallet = () => {
  const navigate = useNavigate();
  const socket = useSocket();
  const [walletBalance, setWalletBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txLimit, setTxLimit] = useState(10);
  const [txPagination, setTxPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [txSummary, setTxSummary] = useState({ totalSpent: 0, totalPenalty: 0 });
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [amountToAdd, setAmountToAdd] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Load Razorpay Script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  const loadTransactions = async (page = 1, limit = txLimit, showIndicator = true) => {
    try {
      if (showIndicator) setTxLoading(true);
      const res = await walletService.getTransactions({ page, limit });
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
      console.error('Error fetching transactions:', error);
      toastManager.error('Failed to load transactions');
    } finally {
      if (showIndicator) setTxLoading(false);
    }
  };

  const loadWalletData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [balanceResponse, transactionsResponse] = await Promise.all([
        walletService.getBalance(),
        walletService.getTransactions({ page: txPage, limit: txLimit })
      ]);

      if (balanceResponse.success) {
        setWalletBalance(balanceResponse.data.balance || 0);
      }

      if (transactionsResponse.success) {
        setTransactions(transactionsResponse.data || []);
        if (transactionsResponse.pagination) {
          setTxPagination(transactionsResponse.pagination);
          setTxPage(transactionsResponse.pagination.page);
        }
        if (transactionsResponse.summary) {
          setTxSummary(transactionsResponse.summary);
        }
      }
    } catch (error) {
      if (showLoader) toastManager.error('Failed to load wallet data');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    loadWalletData(true);
  }, []);

  // Listen for real-time wallet events
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = (data) => {
      if (data && data.balance !== undefined) {
        setWalletBalance(data.balance);
      }
      loadWalletData(false);
    };

    socket.on('wallet_balance_updated', handleUpdate);
    socket.on('wallet_updated', handleUpdate);

    return () => {
      socket.off('wallet_balance_updated', handleUpdate);
      socket.off('wallet_updated', handleUpdate);
    };
  }, [socket]);

  const handleAddMoney = async (e) => {
    e.preventDefault();
    if (!amountToAdd || isNaN(amountToAdd) || Number(amountToAdd) < 100) {
      return toastManager.error('Minimum amount to add is ₹100');
    }

    try {
      setIsProcessing(true);
      const res = await walletService.addMoney(Number(amountToAdd));

      if (res.success) {
        setShowAddMoney(false);
        const options = {
          key: res.data.key,
          amount: Math.round(res.data.amount * 100),
          currency: res.data.currency,
          name: 'Agroyilt',
          description: 'Wallet Top-up',
          order_id: res.data.orderId,
          handler: async function (response) {
            try {
              const verifyRes = await walletService.verifyTopup({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                amount: Number(amountToAdd)
              });

              if (verifyRes.success) {
                toastManager.success('Money added to wallet successfully!');
                setWalletBalance(verifyRes.data.balance);
                setAmountToAdd('');
                const tRes = await walletService.getTransactions({ page: 1, limit: txLimit });
                if (tRes.success) {
                  setTransactions(tRes.data || []);
                  if (tRes.pagination) setTxPagination(tRes.pagination);
                  if (tRes.summary) setTxSummary(tRes.summary);
                  setTxPage(1);
                }
              }
            } catch (error) {
              toastManager.error('Payment verification failed');
            }
          },
          theme: { color: themeColors?.brand?.teal || '#347989' }
        };
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response) {
          toastManager.error(response.error.description || 'Payment Failed');
        });
        rzp.open();
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to initiate payment');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen pb-20 relative bg-white">
      {/* Refined Brand Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#347989'}25 0%, transparent 70%),
              radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#D68F35'}20 0%, transparent 70%),
              radial-gradient(at 100% 100%, ${themeColors?.brand?.orange || '#BB5F36'}15 0%, transparent 75%),
              radial-gradient(at 0% 100%, ${themeColors?.brand?.teal || '#347989'}10 0%, transparent 70%),
              radial-gradient(at 50% 50%, ${themeColors?.brand?.teal || '#347989'}03 0%, transparent 100%),
              #FFFFFF
            `
          }}
        />
        {/* Elegant Dot Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(${themeColors?.brand?.teal || '#347989'} 0.8px, transparent 0.8px)`,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Modern Glassmorphism Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/40 border-b border-black/[0.03] px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/[0.02]"
            >
              <FiArrowLeft className="w-5 h-5 text-black" />
            </button>
            <h1 className="text-xl font-extrabold text-black tracking-tight">Wallet</h1>
          </div>
          <NotificationBell />
        </header>

        <main className="px-3.5 py-3">
          {/* Referral Banner */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 border border-emerald-200/60 rounded-2xl p-3 mb-2.5 flex items-center justify-between shadow-xs">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-emerald-600 text-white">
                  Refer & Earn
                </span>
                <span className="text-[10px] font-bold text-emerald-800">Earn ₹50 per friend</span>
              </div>
              <p className="text-xs font-bold text-slate-800">Invite friends & get instant wallet credits</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/80 border border-emerald-200/50 flex items-center justify-center text-xl shrink-0 shadow-xs">
              🎁
            </div>
          </div>

          {/* Main Balance Card */}
          <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-2xl p-3.5 sm:p-4 mb-2.5 text-white shadow-lg relative overflow-hidden border border-emerald-500/30">
            {/* Ambient background decorative glow */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-emerald-400/15 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10">
              {/* Header row */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/15">
                <div className="flex items-center gap-1.5">
                  <span className="w-6 h-6 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center text-white">
                    <IoWallet className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-100">AgroYilt User Wallet</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-100 bg-white/15 px-2 py-0.5 rounded-full border border-white/20">
                  <FiShield className="w-3 h-3 text-emerald-200 shrink-0" />
                  <span>Escrow Protected</span>
                </div>
              </div>

              {/* Balance row */}
              <div className="mb-3">
                <p className="text-emerald-100/90 text-[10px] font-bold uppercase tracking-wider mb-0.5">Available Balance</p>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  ₹{Number(walletBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h2>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddMoney(true)}
                  className="flex-1 bg-white hover:bg-emerald-50 text-emerald-950 font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                >
                  <FiPlus className="w-3.5 h-3.5 stroke-[3] text-emerald-700" />
                  <span>Add Money</span>
                </button>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  className="flex-1 bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all backdrop-blur-xs"
                >
                  <MdAccountBalanceWallet className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Withdraw</span>
                </button>
              </div>
            </div>
          </div>

          {/* Analytics Cards */}
          <div className="grid grid-cols-2 gap-2 mb-2.5">
            <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="p-1 rounded-md bg-emerald-50 text-emerald-600">
                  <FiArrowDown className="w-3 h-3" />
                </div>
                <p className="text-[11px] text-slate-500 font-bold truncate">Total Spent</p>
              </div>
              <p className="text-sm sm:text-base font-black text-slate-900">
                ₹{(
                  txSummary.totalSpent !== undefined
                    ? txSummary.totalSpent
                    : (
                      transactions
                        .filter(t => ['payment', 'withdrawal', 'platform_fee', 'convenience_fee', 'gst', 'worker_payment', 'cash_collected'].includes(t.type))
                        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0) -
                      transactions
                        .filter(t => ['refund', 'cashback'].includes(t.type))
                        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
                    )
                ).toLocaleString('en-IN')}
              </p>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="p-1 rounded-md bg-amber-50 text-amber-600">
                  <FiAlertCircle className="w-3 h-3" />
                </div>
                <p className="text-[11px] text-slate-500 font-bold truncate">Total Penalty</p>
              </div>
              <p className="text-sm sm:text-base font-black text-amber-700">
                ₹{(
                  txSummary.totalPenalty !== undefined
                    ? txSummary.totalPenalty
                    : transactions
                      .filter(t => ['penalty', 'fine', 'cancellation_fee', 'debit'].includes(t.type))
                      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
                ).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Recent Activity List */}
          <div>
            <div className="flex items-center justify-between mb-2 px-0.5">
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">Recent Activity</h3>
                {txPagination.total > 0 && (
                  <span className="text-[10.5px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-full">
                    {txPagination.total} {txPagination.total === 1 ? 'record' : 'records'}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate('/user/wallet/history')}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 transition-colors group"
              >
                <span>View Passbook</span>
                <FiChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className={`space-y-2 transition-opacity ${txLoading ? 'opacity-50' : 'opacity-100'}`}>
              {loading ? (
                <div className="text-center py-12">
                  <LogoLoader fullScreen={false} />
                  <p className="text-xs text-slate-500 mt-3 font-medium">Loading activity...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 bg-white border border-slate-100 rounded-xl shadow-xs">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                    <IoReceiptOutline className="w-5 h-5" />
                  </div>
                  <p className="text-slate-800 font-bold text-sm mb-0.5">No wallet activity yet</p>
                  <p className="text-xs text-slate-400">Your refunds and payments will appear here</p>
                </div>
              ) : (
                transactions.slice(0, 5).map((item, index) => {
                  const rawDate = item.createdAt || item.date || item.timestamp;
                  const parsedDate = rawDate ? new Date(rawDate) : null;
                  const formattedDate = parsedDate && !isNaN(parsedDate.getTime())
                    ? parsedDate.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })
                    : 'Recent';

                  // Subtle, calm categorization (NO loud warning borders)
                  const isCredit = ['credit', 'refund', 'topup', 'referral', 'cashback', 'cash_collected'].includes(item.type);
                  const isPenalty = ['penalty', 'fine', 'cancellation_fee', 'debit'].includes(item.type);

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
                      onClick={() => navigate('/user/wallet/history')}
                      className="flex items-center justify-between p-3 bg-white border border-slate-100 hover:border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-xs transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                          {isCredit ? (
                            <FiArrowDown className="w-4 h-4" />
                          ) : isPenalty ? (
                            <FiAlertCircle className="w-4 h-4" />
                          ) : (
                            <FiArrowUp className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                            {item.description || item.title || 'Transaction'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10.5px] text-slate-400 font-medium">{formattedDate}</span>
                            {item.type && (
                              <span className={`text-[9.5px] font-semibold px-1.5 py-0.2 rounded ${
                                isCredit 
                                  ? 'bg-emerald-50 text-emerald-700' 
                                  : isPenalty 
                                    ? 'bg-amber-50 text-amber-700' 
                                    : 'bg-slate-100 text-slate-600'
                              }`}>
                                {item.type.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`text-xs sm:text-sm font-black ${amountColor}`}>
                          {amountSign}₹{Number(item.amount || 0).toLocaleString('en-IN')}
                        </p>
                        {item.balanceAfter !== undefined && (
                          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                            Bal: ₹{Number(item.balanceAfter).toLocaleString('en-IN')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* View Full History Link */}
            {!loading && transactions.length > 0 && (
              <button
                onClick={() => navigate('/user/wallet/history')}
                className="w-full mt-2.5 py-2.5 px-4 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95"
              >
                <span>View Complete Passbook & History</span>
                <FiChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>

          {/* Withdrawal History Section */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">Payout Requests</h3>
              <button
                onClick={() => navigate('/user/wallet/history?tab=withdrawals')}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 transition-colors group"
              >
                <span>All Payouts</span>
                <FiChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
            <WithdrawalHistoryList refreshTrigger={historyRefreshKey} />
          </div>
        </main>
      </div>

      {/* Withdrawal Modal */}
      <WithdrawalModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onSuccess={() => {
          loadWalletData(false);
          setHistoryRefreshKey(k => k + 1);
        }}
        role="farmer"
      />

      {/* Add Money Modal */}
      {showAddMoney && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isProcessing && setShowAddMoney(false)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-fade-in-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-black">Add Money</h3>
              <button onClick={() => setShowAddMoney(false)} disabled={isProcessing} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMoney}>
              <div className="mb-6">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Amount (₹)</label>
                <input
                  type="number"
                  value={amountToAdd}
                  onChange={(e) => setAmountToAdd(e.target.value)}
                  placeholder="Enter amount (Min ₹100)"
                  min="100"
                  required
                  className="w-full bg-gray-50 border-none rounded-2xl p-4 text-xl font-black outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {[100, 500, 1000].map(amt => (
                  <button
                    key={amt} type="button"
                    onClick={() => setAmountToAdd(amt.toString())}
                    className="py-2.5 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-600 hover:border-teal-500 hover:text-teal-600 transition-colors">
                    +₹{amt}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={isProcessing || !amountToAdd || Number(amountToAdd) < 100}
                className="w-full bg-teal-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-teal-600/20 disabled:opacity-50 active:scale-95 transition-all">
                {isProcessing ? 'Processing...' : 'Proceed to Pay'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Wallet;
