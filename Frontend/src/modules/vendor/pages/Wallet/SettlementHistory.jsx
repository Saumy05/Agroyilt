import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiClock, 
  FiCheck, 
  FiX, 
  FiArrowDown, 
  FiArrowUp, 
  FiSend, 
  FiAlertCircle,
  FiCheckCircle
} from 'react-icons/fi';
import { 
  IoWalletOutline, 
  IoReceiptOutline 
} from 'react-icons/io5';
import { FaWallet } from 'react-icons/fa';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import vendorWalletService from '../../../../services/vendorWalletService';
import { toastManager } from '../../../../utils/toastManager';

const SettlementHistory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('transactions'); // Default to 'transactions' (complete ledger)
  const [settlements, setSettlements] = useState([]);
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

  // Reset filter when tab changes
  useEffect(() => {
    setFilter('all');
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'settlements') {
      loadSettlements();
    } else {
      loadTransactions();
    }
  }, [activeTab, filter]);

  const loadSettlements = async () => {
    try {
      setLoading(true);
      const params = filter !== 'all' ? { status: filter } : {};
      const res = await vendorWalletService.getSettlements(params);
      if (res.success) {
        setSettlements(res.data || []);
      }
    } catch (error) {
      toastManager.error('Failed to load settlements');
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const res = await vendorWalletService.getTransactions({ limit: 100 });
      if (res.success) {
        setTransactions(res.data || []);
      }
    } catch (error) {
      toastManager.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <FiClock className="w-4 h-4 text-amber-500" />;
      case 'approved':
        return <FiCheck className="w-4 h-4 text-emerald-600" />;
      case 'rejected':
        return <FiX className="w-4 h-4 text-rose-500" />;
      default:
        return <IoReceiptOutline className="w-4 h-4 text-slate-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
      case 'approved':
        return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
      case 'rejected':
        return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
      default:
        return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'cash_collected':
        return <FaWallet className="w-4 h-4 text-amber-600" />;
      case 'earnings_credit':
      case 'credit':
        return <FiArrowUp className="w-4 h-4 text-emerald-600" />;
      case 'settlement':
        return <FiSend className="w-4 h-4 text-blue-600" />;
      case 'withdrawal':
        return <IoWalletOutline className="w-4 h-4 text-purple-600" />;
      case 'tds_deduction':
        return <FiAlertCircle className="w-4 h-4 text-amber-600" />;
      case 'commission':
        return <FiArrowDown className="w-4 h-4 text-orange-600" />;
      case 'platform_fee':
        return <FiAlertCircle className="w-4 h-4 text-rose-600" />;
      default:
        return <IoReceiptOutline className="w-4 h-4 text-slate-500" />;
    }
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case 'cash_collected':
        return '#D97706'; // Amber 600 - physical cash collection
      case 'earnings_credit':
      case 'credit':
        return '#10B981'; // Emerald 500
      case 'settlement':
        return '#3B82F6'; // Blue 500
      case 'withdrawal':
        return '#8B5CF6'; // Purple 500
      case 'tds_deduction':
        return '#F59E0B'; // Amber 500
      case 'commission':
        return '#F97316'; // Orange 500
      case 'platform_fee':
        return '#F43F5E'; // Rose 500
      default:
        return '#64748B'; // Slate 500
    }
  };

  const getTransactionLabel = (type) => {
    switch (type) {
      case 'cash_collected':
        return 'Cash Collected';
      case 'earnings_credit':
      case 'credit':
        return 'Earnings Credited';
      case 'settlement':
        return 'Settlement Paid';
      case 'withdrawal':
        return 'Withdrawal Payout';
      case 'tds_deduction':
        return 'TDS Deduction';
      case 'commission':
        return 'Commission Charge';
      case 'platform_fee':
        return 'Platform Charge';
      default:
        return String(type || '').replace(/_/g, ' ');
    }
  };

  const renderAmount = (txn) => {
    const isDebit = ['tds_deduction', 'withdrawal', 'platform_fee', 'commission'].includes(txn.type);
    const isCredit = ['earnings_credit', 'credit'].includes(txn.type);
    const isCash = txn.type === 'cash_collected';
    const isSettlement = txn.type === 'settlement';

    const val = `₹${Math.abs(txn.amount || 0).toLocaleString('en-IN')}`;

    if (isCredit) {
      return <span className="text-sm sm:text-base font-black text-emerald-600 tracking-tight">+{val}</span>;
    }
    if (isDebit) {
      return <span className="text-sm sm:text-base font-black text-rose-600 tracking-tight">-{val}</span>;
    }
    if (isCash) {
      return (
        <div className="flex flex-col items-end">
          <span className="text-sm sm:text-base font-black text-amber-700 tracking-tight">+{val}</span>
          <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-1 rounded">In Hand</span>
        </div>
      );
    }
    if (isSettlement) {
      return <span className="text-sm sm:text-base font-black text-blue-600 tracking-tight">{val}</span>;
    }
    return <span className="text-sm sm:text-base font-black text-slate-800 tracking-tight">{val}</span>;
  };

  const getOrderCategory = (txn) => {
    const desc = (txn.description || '').toLowerCase();
    const type = (txn.type || '').toLowerCase();
    const metaType = (txn.metadata?.type || '').toLowerCase();

    if (desc.includes('soil test') || desc.includes('soiltesting') || type.includes('soil') || metaType.includes('soil')) {
      return { label: 'Soil Testing', bgColor: 'bg-amber-50 text-amber-700 border-amber-200' };
    }

    if (desc.includes('order #') || desc.includes('split order') || desc.includes('cod order') || desc.includes('ecommerce') || txn.metadata?.orderId) {
      return { label: 'Agri Order', bgColor: 'bg-teal-50 text-teal-700 border-teal-200' };
    }

    if (desc.includes('booking') || desc.includes('job') || desc.includes('rental') || desc.includes('machinery') || txn.metadata?.bookingId || type.includes('booking') || type.includes('worker_payment')) {
      return { label: 'Rental', bgColor: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    }

    return null;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredTransactions = transactions.filter(txn => {
    if (filter === 'all') return true;
    if (filter === 'earnings') return ['earnings_credit', 'credit'].includes(txn.type);
    return txn.type === filter;
  });

  return (
    <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
      <Header
        title="History"
        showBack={true}
        onBack={() => {
          if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
          } else {
            navigate('/vendor/wallet', { replace: true });
          }
        }}
      />

      <main className="px-3.5 py-3">
        {/* Segmented Control / Tabs */}
        <div className="bg-slate-200/70 p-1 rounded-xl flex gap-1 mb-2.5 backdrop-blur-md">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'transactions'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 font-semibold'
            }`}
          >
            <IoReceiptOutline className="w-3.5 h-3.5 text-emerald-700" />
            <span>Transactions</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'transactions' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300/60 text-slate-700'
            }`}>
              {transactions.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'settlements'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 font-semibold'
            }`}
          >
            <FiSend className="w-3 h-3 text-emerald-700" />
            <span>Settlements</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'settlements' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300/60 text-slate-700'
            }`}>
              {settlements.length}
            </span>
          </button>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-1.5 mb-2.5 overflow-x-auto pb-1 scrollbar-hide">
          {activeTab === 'settlements' ? (
            [
              { id: 'all', label: 'All' },
              { id: 'pending', label: 'Pending' },
              { id: 'approved', label: 'Approved' },
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
          ) : (
            [
              { id: 'all', label: 'All' },
              { id: 'earnings', label: 'Earnings' },
              { id: 'cash_collected', label: 'Cash Collected' },
              { id: 'withdrawal', label: 'Withdrawals' },
              { id: 'platform_fee', label: 'Platform Fees' },
              { id: 'tds_deduction', label: 'TDS' },
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

        {/* Subtotal / Count Indicator */}
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
            {activeTab === 'transactions' 
              ? `${filteredTransactions.length} Record${filteredTransactions.length === 1 ? '' : 's'}`
              : `${settlements.length} Record${settlements.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${themeColors.button} transparent ${themeColors.button} ${themeColors.button}` }}></div>
          </div>
        ) : activeTab === 'settlements' ? (
          settlements.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-xs border border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-2.5 text-emerald-600">
                <FiSend className="w-6 h-6" />
              </div>
              <p className="text-slate-800 font-bold text-sm mb-0.5">No settlements found</p>
              <p className="text-xs text-gray-500">Your admin settlement payout history will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {settlements.map((settlement) => {
                const statusColors = getStatusColor(settlement.status);
                return (
                  <div
                    key={settlement._id}
                    className="bg-white rounded-xl p-3 shadow-xs border border-slate-100/90 border-l-4 transition-all"
                    style={{
                      borderLeftColor: settlement.status === 'pending' ? '#F97316' :
                        settlement.status === 'approved' ? '#10B981' : '#EF4444'
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${statusColors.bg}`}>
                        {getStatusIcon(settlement.status)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="font-black text-slate-900 text-sm">₹{Number(settlement.amount || 0).toLocaleString('en-IN')}</p>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}>
                            {settlement.status?.toUpperCase()}
                          </span>
                        </div>

                        <p className="text-[11px] text-gray-600 mb-1 leading-snug">
                          Via {settlement.paymentMethod === 'upi' ? 'UPI' : 'Bank Transfer'}
                          {settlement.paymentReference && ` • Ref: #${settlement.paymentReference}`}
                        </p>

                        <p className="text-[10.5px] text-gray-400 font-medium">{formatDate(settlement.createdAt)}</p>

                        {settlement.status === 'rejected' && settlement.rejectionReason && (
                          <div className="mt-1.5 p-2 bg-rose-50 border border-rose-100 rounded-lg">
                            <p className="text-[11px] text-rose-700">
                              <strong className="font-bold">Reason:</strong> {settlement.rejectionReason}
                            </p>
                          </div>
                        )}

                        {settlement.adminNotes && (
                          <div className="mt-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg">
                            <p className="text-[11px] text-slate-600">
                              <strong className="font-bold">Admin Note:</strong> {settlement.adminNotes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          filteredTransactions.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-xs border border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-2.5 text-emerald-600">
                <IoReceiptOutline className="w-6 h-6" />
              </div>
              <p className="text-slate-800 font-bold text-sm mb-0.5">No transactions found</p>
              <p className="text-xs text-gray-500">Your ledger transaction history will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTransactions.map((txn) => (
                <div
                  key={txn._id}
                  className="bg-white rounded-xl p-3 shadow-xs border border-slate-100/90 border-l-4 transition-all"
                  style={{
                    borderLeftColor: getTransactionColor(txn.type)
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${getTransactionColor(txn.type)}15` }}
                    >
                      {getTransactionIcon(txn.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="font-bold text-gray-900 text-xs sm:text-sm truncate">
                          {getTransactionLabel(txn.type)}
                        </p>
                        <div className="shrink-0 ml-2">
                          {renderAmount(txn)}
                        </div>
                      </div>

                      <p className="text-[11px] text-gray-600 mb-1 break-words leading-relaxed">{txn.description}</p>

                      <div className="flex items-center flex-wrap gap-1.5 mt-1">
                        <span className="text-[10.5px] text-gray-400 font-medium">{formatDate(txn.createdAt)}</span>
                        
                        {(() => {
                          const cat = getOrderCategory(txn);
                          return cat ? (
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded border ${cat.bgColor}`}>
                              {cat.label}
                            </span>
                          ) : null;
                        })()}

                        <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${
                          txn.status === 'completed' ? 'bg-green-100 text-green-700' :
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
          )
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default SettlementHistory;
