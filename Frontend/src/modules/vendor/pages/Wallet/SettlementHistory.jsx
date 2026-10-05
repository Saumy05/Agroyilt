import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiClock, 
  FiCheck, 
  FiX, 
  FiDollarSign, 
  FiChevronRight, 
  FiArrowDown, 
  FiArrowUp, 
  FiSend, 
  FiAlertCircle 
} from 'react-icons/fi';
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
        return <FiClock className="w-5 h-5 text-orange-500" />;
      case 'approved':
        return <FiCheck className="w-5 h-5 text-green-500" />;
      case 'rejected':
        return <FiX className="w-5 h-5 text-red-500" />;
      default:
        return <FiDollarSign className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' };
      case 'approved':
        return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
      case 'rejected':
        return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' };
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'cash_collected':
        return <FiArrowDown className="w-5 h-5 text-red-500" />;
      case 'earnings_credit':
        return <FiArrowUp className="w-5 h-5 text-green-500" />;
      case 'settlement':
        return <FiSend className="w-5 h-5 text-blue-500" />;
      case 'withdrawal':
        return <FiDollarSign className="w-5 h-5 text-purple-500" />;
      case 'tds_deduction':
        return <FiAlertCircle className="w-5 h-5 text-amber-500" />;
      case 'commission':
        return <FiDollarSign className="w-5 h-5 text-orange-500" />;
      case 'platform_fee':
        return <FiAlertCircle className="w-5 h-5 text-rose-500" />;
      default:
        return <FiDollarSign className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case 'cash_collected':
        return '#EF4444';
      case 'earnings_credit':
        return '#10B981';
      case 'settlement':
        return '#3B82F6';
      case 'withdrawal':
        return '#8B5CF6';
      case 'tds_deduction':
        return '#F59E0B';
      case 'commission':
        return '#F97316';
      case 'platform_fee':
        return '#F43F5E';
      default:
        return '#6B7280';
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

  const formatDate = (dateStr, includeTime = true) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(includeTime && {
        hour: '2-digit',
        minute: '2-digit'
      })
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

      <main className="px-4 py-6">
        {/* Segmented Control / Tabs */}
        <div className="bg-white/50 backdrop-blur-sm p-1 rounded-xl flex gap-1 mb-6 border border-gray-100 shadow-inner">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'transactions'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Transaction History
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'settlements'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Settlements
          </button>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
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
                className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all ${filter === option.id
                  ? 'text-white'
                  : 'bg-white text-gray-700'
                  }`}
                style={
                  filter === option.id
                    ? {
                      background: themeColors.button,
                      boxShadow: `0 2px 8px ${themeColors.button}40`,
                    }
                    : {
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
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
                className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all ${filter === option.id
                  ? 'text-white'
                  : 'bg-white text-gray-700'
                  }`}
                style={
                  filter === option.id
                    ? {
                      background: themeColors.button,
                      boxShadow: `0 2px 8px ${themeColors.button}40`,
                    }
                    : {
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    }
                }
              >
                {option.label}
              </button>
            ))
          )}
        </div>

        {/* Content list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${themeColors.button} transparent ${themeColors.button} ${themeColors.button}` }}></div>
          </div>
        ) : activeTab === 'settlements' ? (
          settlements.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-md">
              <FiDollarSign className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-600 font-semibold mb-2">No settlements found</p>
              <p className="text-sm text-gray-500">Your settlement history will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {settlements.map((settlement) => {
                const statusColors = getStatusColor(settlement.status);
                return (
                  <div
                    key={settlement._id}
                    className={`bg-white rounded-2xl p-4 shadow-md border-l-4`}
                    style={{
                      borderLeftColor: settlement.status === 'pending' ? '#F97316' :
                        settlement.status === 'approved' ? '#10B981' : '#EF4444'
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${statusColors.bg}`}>
                        {getStatusIcon(settlement.status)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-bold text-gray-900">₹{settlement.amount.toLocaleString()}</p>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusColors.bg} ${statusColors.text}`}>
                            {settlement.status.toUpperCase()}
                          </span>
                        </div>

                        <p className="text-xs text-gray-600 mb-1">
                          Via {settlement.paymentMethod === 'upi' ? 'UPI' : 'Bank Transfer'}
                          {settlement.paymentReference && ` ? Ref: ${settlement.paymentReference}`}
                        </p>

                        <p className="text-xs text-gray-400">{formatDate(settlement.createdAt)}</p>

                        {settlement.status === 'rejected' && settlement.rejectionReason && (
                          <div className="mt-2 p-2 bg-red-50 rounded-lg">
                            <p className="text-xs text-red-600">
                              <strong>Reason:</strong> {settlement.rejectionReason}
                            </p>
                          </div>
                        )}

                        {settlement.adminNotes && (
                          <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-600">
                              <strong>Admin Note:</strong> {settlement.adminNotes}
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
            <div className="bg-white rounded-2xl p-8 text-center shadow-md">
              <FiDollarSign className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-600 font-semibold mb-2">No transactions found</p>
              <p className="text-sm text-gray-500">Your ledger transaction history will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTransactions.map((txn) => (
                <div
                  key={txn._id}
                  className="bg-white rounded-2xl p-4 shadow-md border-l-4"
                  style={{
                    borderLeftColor: getTransactionColor(txn.type)
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: `${getTransactionColor(txn.type)}15` }}
                    >
                      {getTransactionIcon(txn.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-bold text-gray-900 text-sm">
                          {getTransactionLabel(txn.type)}
                        </p>
                        <p className={`text-lg font-bold ${['tds_deduction', 'withdrawal', 'platform_fee'].includes(txn.type)
                          ? 'text-red-600'
                          : 'text-green-600'
                          }`}>
                          {['tds_deduction', 'withdrawal', 'platform_fee'].includes(txn.type) ? '-' : '+'}₹{Math.abs(txn.amount).toLocaleString()}
                        </p>
                      </div>

                      <p className="text-xs text-gray-600 mb-1 break-words leading-relaxed">{txn.description}</p>

                      <div className="flex items-center flex-wrap gap-2 mt-1.5">
                        <span className="text-xs text-gray-400">{formatDate(txn.createdAt)}</span>
                        
                        {(() => {
                          const cat = getOrderCategory(txn);
                          return cat ? (
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${cat.bgColor}`}>
                              {cat.label}
                            </span>
                          ) : null;
                        })()}

                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${txn.status === 'completed' ? 'bg-green-100 text-green-700' :
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
