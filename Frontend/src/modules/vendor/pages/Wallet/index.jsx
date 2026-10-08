import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowUp, FiArrowDown, FiArrowRight, FiClock, FiCheckCircle, FiAlertCircle, FiSend, FiShield, FiX } from 'react-icons/fi';
import { IoWallet, IoWalletOutline } from 'react-icons/io5';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import LogoLoader from '../../../../components/common/LogoLoader';
import vendorWalletService from '../../../../services/vendorWalletService';
import { toastManager } from '../../../../utils/toastManager';

const Wallet = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState({
    balance: 0,
    dues: 0,
    earnings: 0,
    amountDue: 0,
    totalCashCollected: 0,
    totalSettled: 0,
    totalWithdrawn: 0,
    pendingSettlements: 0,
    cashLimit: 10000
  });
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');

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

  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    try {
      setLoading(true);
      const [walletRes, txnRes] = await Promise.all([
        vendorWalletService.getWallet(),
        vendorWalletService.getTransactions({ limit: 50 })
      ]);

      if (walletRes.success) {
        setWallet(walletRes.data);
      }

      if (txnRes.success) {
        setTransactions(txnRes.data || []);
      }
    } catch (error) {
      console.error('Error loading wallet:', error);
      toastManager.error('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(txn => {
    if (filter === 'all') return true;
    return txn.type === filter;
  });

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'cash_collected':
        return <FiArrowDown className="w-5 h-5 text-red-500" />;
      case 'earnings_credit':
        return <FiArrowUp className="w-5 h-5 text-green-500" />;
      case 'settlement':
        return <FiSend className="w-5 h-5 text-blue-500" />;
      case 'withdrawal':
        return <IoWallet className="w-5 h-5 text-purple-500" />;
      case 'tds_deduction':
        return <FiAlertCircle className="w-5 h-5 text-amber-500" />;
      case 'commission':
        return <FiArrowUp className="w-5 h-5 text-orange-500" />;
      case 'platform_fee':
        return <FiAlertCircle className="w-5 h-5 text-rose-500" />;
      default:
        return <IoWallet className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTransactionLabel = (type) => {
    switch (type) {
      case 'cash_collected':
        return 'Cash Collected';
      case 'earnings_credit':
        return 'Earnings Credited';
      case 'settlement':
        return 'Settlement Paid';
      case 'withdrawal':
        return 'Withdrawal Payout';
      case 'tds_deduction':
        return 'TDS Deduction';
      case 'commission':
        return 'Commission';
      case 'platform_fee':
        return 'Platform Charge';
      default:
        return type;
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getOrderCategory = (txn) => {
    const desc = (txn.description || '').toLowerCase();
    const type = (txn.type || '').toLowerCase();
    const metaType = (txn.metadata?.type || '').toLowerCase();

    // 1. Soil Testing check
    if (desc.includes('soil test') || desc.includes('soiltesting') || type.includes('soil') || metaType.includes('soil')) {
      return { label: 'Soil Testing', bgColor: 'bg-amber-50 text-amber-700 border-amber-200' };
    }

    // 2. Ecommerce check
    if (desc.includes('order #') || desc.includes('split order') || desc.includes('cod order') || desc.includes('ecommerce') || txn.metadata?.orderId) {
      return { label: 'Agri Order', bgColor: 'bg-teal-50 text-teal-700 border-teal-200' };
    }

    // 3. Rental check
    if (desc.includes('booking') || desc.includes('job') || desc.includes('rental') || desc.includes('machinery') || txn.metadata?.bookingId || type.includes('booking') || type.includes('worker_payment')) {
      return { label: 'Rental', bgColor: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    }

    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
        <Header title="Wallet & Ledger" onBack={() => navigate('/vendor/dashboard')} />
        <main className="px-4 py-6">
          <div className="animate-pulse space-y-6">
            <div className="h-36 bg-white/20 rounded-2xl border border-white/10"></div>
            <div className="h-36 bg-white/20 rounded-2xl border border-white/10"></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-24 bg-white/20 rounded-2xl border border-white/10"></div>
              <div className="h-24 bg-white/20 rounded-2xl border border-white/10"></div>
            </div>
            <div className="h-40 bg-white/20 rounded-2xl border border-white/10 mt-6"></div>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Wallet & Ledger" onBack={() => navigate('/vendor/dashboard')} />

      <main className="px-3.5 py-3">
        {/* Unified Dual-Pane Balance & Dues Card */}
        <div className="rounded-2xl p-3.5 shadow-lg relative overflow-hidden mb-2.5 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 border border-emerald-500/30 text-white">
          {/* Ambient background decorative glow */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-emerald-400/15 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10">
            {/* Header row */}
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/15">
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center text-white">
                  <IoWallet className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-100">Vendor Business Ledger</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-100 bg-white/15 px-2 py-0.5 rounded-full border border-white/20">
                <FiShield className="w-3 h-3 text-emerald-200 shrink-0" />
                <span>Verified Payouts</span>
              </div>
            </div>

            {/* Dual Pane Grid: Available Earnings (Left) | Amount Due (Right) */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              {/* Left Pane: Available Earnings */}
              <div className="bg-white/15 backdrop-blur-md rounded-xl p-2.5 border border-white/20 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-100 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                    <span className="truncate">Available</span>
                  </div>
                  <p className="text-lg sm:text-xl font-black tracking-tight text-white mb-1.5">
                    ₹{Number(wallet.earnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <button
                  onClick={() => navigate('/vendor/wallet/withdraw')}
                  className="w-full bg-white hover:bg-emerald-50 text-emerald-900 font-black py-1.5 px-2 rounded-lg text-xs shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1 mt-auto"
                >
                  <FiArrowUp className="w-3 h-3 stroke-[2.5]" />
                  <span>Withdraw</span>
                </button>
              </div>

              {/* Right Pane: Amount Due to Admin */}
              <div className={`backdrop-blur-md rounded-xl p-2.5 border flex flex-col justify-between transition-all shadow-xs ${
                Number(wallet.dues || 0) > 0 
                  ? 'bg-rose-500/20 border-rose-300/30 text-rose-50' 
                  : 'bg-white/15 border-white/20 text-white'
              }`}>
                <div>
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-0.5 text-slate-100">
                    <span className={`w-1.5 h-1.5 rounded-full ${Number(wallet.dues || 0) > 0 ? 'bg-rose-300 animate-pulse' : 'bg-emerald-300'}`} />
                    <span className="truncate">Due to Admin</span>
                    {Number(wallet.dues || 0) > 0 && <FiAlertCircle className="w-2.5 h-2.5 text-rose-200 shrink-0" />}
                  </div>
                  <p className="text-lg sm:text-xl font-black tracking-tight text-white mb-1.5">
                    ₹{Number(wallet.dues || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                {Number(wallet.dues || 0) > 0 ? (
                  <button
                    onClick={() => navigate('/vendor/wallet/settle')}
                    className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-1.5 px-2 rounded-lg text-xs shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1 mt-auto"
                  >
                    <span>Pay Now</span>
                  </button>
                ) : (
                  <div className="w-full bg-white/15 text-emerald-100 font-bold py-1.5 rounded-lg text-xs text-center border border-white/20 mt-auto flex items-center justify-center gap-1">
                    <FiCheckCircle className="w-3 h-3 text-emerald-200" />
                    <span>All Clear</span>
                  </div>
                )}
              </div>
            </div>

            {/* Integrated Cash Collection Limit Gauge */}
            <div className="bg-black/15 rounded-xl p-2 border border-white/15 backdrop-blur-xs">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[10px] font-semibold text-emerald-100/90 flex items-center gap-1">
                  <span>Cash Limit Buffer</span>
                  {(wallet.dues / (wallet.cashLimit || 10000)) > 0.8 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white">Action Needed</span>
                  )}
                </span>
                <span className="text-[11px] font-black text-white">
                  ₹{(wallet.dues || 0).toLocaleString()} <span className="text-emerald-100/70 font-normal">/ ₹{(wallet.cashLimit || 10000).toLocaleString()}</span>
                </span>
              </div>
              <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (wallet.dues / (wallet.cashLimit || 10000)) > 0.8 ? 'bg-rose-400' : 'bg-emerald-300'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, ((wallet.dues || 0) / (wallet.cashLimit || 10000)) * 100))}%` }}
                />
              </div>
              <p className="text-[9.5px] text-emerald-100/80 mt-1">
                {(wallet.dues / (wallet.cashLimit || 10000)) > 0.8
                  ? `⚠️ Near limit: auto-block triggers at ₹${(wallet.cashLimit || 10000).toLocaleString()}. Settle dues to stay online.`
                  : `✓ Safe buffer: auto-block at ₹${(wallet.cashLimit || 10000).toLocaleString()}.`}
              </p>
            </div>
          </div>
        </div>

        {/* Blocked Status Notice (If blocked) */}
        {wallet.isBlocked && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-2.5 animate-shake">
            <div className="flex items-start gap-2.5">
              <FiX className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-red-800 text-xs">Account Blocked</p>
                <p className="text-[11px] text-red-600 mb-1.5 leading-relaxed">
                  {wallet.blockReason || 'Your account is blocked due to excessive dues.'}
                </p>
                <button
                  onClick={() => navigate('/vendor/wallet/settle')}
                  className="text-xs font-bold uppercase tracking-wider text-white bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded-lg shadow-xs active:scale-95 transition-all"
                >
                  Pay Now to Unblock
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick Filter Summary Cards (Cash Collected & Total Settled) */}
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          {/* Cash Collected */}
          <div 
            onClick={() => setFilter(filter === 'cash_collected' ? 'all' : 'cash_collected')}
            className={`rounded-xl p-2.5 shadow-xs border cursor-pointer active:scale-95 transition-all ${
              filter === 'cash_collected' ? 'border-red-500 bg-red-50/70' : 'bg-white border-slate-100 hover:border-red-200'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="p-1 rounded-md bg-red-50">
                <FiArrowDown className="w-3 h-3 text-red-500" />
              </div>
              <p className="text-[11px] text-slate-600 font-bold truncate">Cash Collected</p>
            </div>
            <p className="text-sm sm:text-base font-black text-red-600">
              ₹{wallet.totalCashCollected?.toLocaleString() || 0}
            </p>
          </div>

          {/* Total Settled */}
          <div 
            onClick={() => setFilter(filter === 'settlement' ? 'all' : 'settlement')}
            className={`rounded-xl p-2.5 shadow-xs border cursor-pointer active:scale-95 transition-all ${
              filter === 'settlement' ? 'border-emerald-500 bg-emerald-50/70' : 'bg-white border-slate-100 hover:border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="p-1 rounded-md bg-emerald-50">
                <FiArrowUp className="w-3 h-3 text-emerald-600" />
              </div>
              <p className="text-[11px] text-slate-600 font-bold truncate">Total Settled</p>
            </div>
            <p className="text-sm sm:text-base font-black text-emerald-600">
              ₹{wallet.totalSettled?.toLocaleString() || 0}
            </p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-1.5 mb-2.5 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { id: 'all', label: 'All' },
            { id: 'cash_collected', label: 'Cash Collected' },
            { id: 'settlement', label: 'Settlements' },
            { id: 'withdrawal', label: 'Withdrawals' },
            { id: 'tds_deduction', label: 'TDS' },
            { id: 'platform_fee', label: 'Platform Fees' },
          ].map((filterOption) => (
            <button
              key={filterOption.id}
              onClick={() => setFilter(filterOption.id)}
              className={`px-3 py-1.5 rounded-full font-semibold text-xs whitespace-nowrap transition-all ${filter === filterOption.id
                ? 'text-white'
                : 'bg-white text-gray-700'
                }`}
              style={
                filter === filterOption.id
                  ? {
                    background: themeColors.button,
                    boxShadow: `0 2px 6px ${themeColors.button}30`,
                  }
                  : {
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
                  }
              }
            >
              {filterOption.label}
            </button>
          ))}
        </div>

        {/* Transactions/Ledger */}
        <div>
          <h3 className="font-bold text-gray-800 mb-2 text-sm">Transaction History</h3>
          {filteredTransactions.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-2 text-emerald-600">
                <IoWalletOutline className="w-5 h-5" />
              </div>
              <p className="text-slate-800 font-bold text-sm mb-0.5">No transactions yet</p>
              <p className="text-xs text-gray-500">Your ledger will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTransactions.map((txn) => (
                <div
                  key={txn._id}
                  className="bg-white rounded-xl p-3 shadow-xs border-l-4"
                  style={{
                    borderLeftColor:
                      txn.type === 'cash_collected' ? '#DC2626' :
                        txn.type === 'settlement' ? '#10B981' :
                          txn.type === 'withdrawal' ? '#8B5CF6' :
                            txn.type === 'tds_deduction' ? '#F59E0B' :
                              txn.type === 'platform_fee' ? '#E11D48' : '#F97316'
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background:
                          txn.type === 'cash_collected' ? '#FEE2E2' :
                            txn.type === 'settlement' ? '#D1FAE5' :
                              txn.type === 'withdrawal' ? '#EDE9FE' :
                                txn.type === 'tds_deduction' ? '#FEF3C7' :
                                  txn.type === 'platform_fee' ? '#FFF1F2' : '#FFEDD5'
                      }}
                    >
                      {getTransactionIcon(txn.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="font-bold text-gray-900 text-xs sm:text-sm truncate">
                          {getTransactionLabel(txn.type)}
                        </p>
                        <p className={`text-base font-bold shrink-0 ml-2 ${['tds_deduction', 'withdrawal', 'platform_fee'].includes(txn.type)
                          ? 'text-red-600'
                          : 'text-green-600'
                          }`}>
                          {['tds_deduction', 'withdrawal', 'platform_fee'].includes(txn.type) ? '-' : '+'}₹{Math.abs(txn.amount).toLocaleString()}
                        </p>
                      </div>

                      <p className="text-[11px] text-gray-600 mb-1 break-words leading-relaxed">{txn.description}</p>

                      <div className="flex items-center flex-wrap gap-1.5 mt-1">
                        <span className="text-[11px] text-gray-400">{formatDate(txn.createdAt)}</span>
                        
                        {(() => {
                          const cat = getOrderCategory(txn);
                          return cat ? (
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded border ${cat.bgColor}`}>
                              {cat.label}
                            </span>
                          ) : null;
                        })()}

                        <span className={`text-[11px] font-semibold px-2 py-0.2 rounded-full ${txn.status === 'completed' ? 'bg-green-100 text-green-700' :
                          txn.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                          {txn.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* View Complete History Link */}
        <button
          onClick={() => navigate('/vendor/wallet/settlements')}
          className="w-full mt-3 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-gray-700 bg-white border border-gray-200 flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs"
        >
          View Complete History
          <FiArrowRight className="w-3.5 h-3.5" />
        </button>
      </main>

      <BottomNav />
    </div>
  );
};

export default Wallet;
