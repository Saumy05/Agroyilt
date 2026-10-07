import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FiDollarSign,
  FiCheck,
  FiX,
  FiEye,
  FiClock,
  FiUsers,
  FiTrendingUp,
  FiDownload,
  FiRefreshCw,
  FiAlertCircle
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import adminSettlementService from '../../../../services/adminSettlementService';
import { exportToCSV } from '../../../../utils/csvExport';

const SettlementManagement = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [dashboard, setDashboard] = useState(null);
  const [pendingSettlements, setPendingSettlements] = useState([]);
  const [owners, setOwners] = useState([]);
  const [history, setHistory] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Modal State
  const [activeModal, setActiveModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalInput, setModalInput] = useState('');

  // Determine active tab from URL
  useEffect(() => {
    const path = location.pathname.split('/').pop();
    if (['pending', 'owners', 'vendors', 'history'].includes(path)) {
      setActiveTab(path === 'vendors' ? 'owners' : path);
    } else {
      setActiveTab('pending');
    }
  }, [location.pathname]);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Always load dashboard stats
      const dashRes = await adminSettlementService.getDashboard();
      if (dashRes.success) {
        setDashboard(dashRes.data);
      }

      if (activeTab === 'pending') {
        const res = await adminSettlementService.getPendingSettlements();
        if (res.success) setPendingSettlements(res.data || []);
      } else if (activeTab === 'owners' || activeTab === 'vendors') {
        const res = await adminSettlementService.getVendorBalances({ filterDue: 'true' });
        if (res.success) setOwners(res.data || []);
      } else if (activeTab === 'history') {
        const res = await adminSettlementService.getSettlementHistory();
        if (res.success) setHistory(res.data || []);
      }
    } catch (error) {
      console.error('Error loading settlement data:', error);
      toastManager.error('Failed to load settlement data');
    } finally {
      setLoading(false);
    }
  };

  // --- Modal Openers ---
  const openApproveSettlement = (item) => {
    setSelectedItem(item);
    setActiveModal('approve_settlement');
  };

  const openRejectSettlement = (item) => {
    setSelectedItem(item);
    setModalInput('');
    setActiveModal('reject_settlement');
  };

  const openBlockVendor = (vendor) => {
    setSelectedItem(vendor);
    setModalInput('');
    setActiveModal('block_owner');
  };

  const openUnblockVendor = (vendor) => {
    setSelectedItem(vendor);
    setActiveModal('unblock_owner');
  };

  const openUpdateLimit = (vendor) => {
    setSelectedItem(vendor);
    setModalInput(vendor.maxCashLimit || 5000);
    setActiveModal('update_limit');
  };

  const closeModals = () => {
    setActiveModal(null);
    setSelectedItem(null);
    setModalInput('');
  };

  // --- Actions ---
  const handleApproveSettlement = async () => {
    try {
      setActionLoading(true);
      const res = await adminSettlementService.approveSettlement(selectedItem._id);
      if (res.success) {
        toastManager.success('Settlement approved successfully');
        loadData();
        closeModals();
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to approve settlement');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSettlement = async () => {
    if (!modalInput.trim()) return toastManager.error('Reason is required');
    try {
      setActionLoading(true);
      const res = await adminSettlementService.rejectSettlement(selectedItem._id, modalInput);
      if (res.success) {
        toastManager.success('Settlement rejected');
        loadData();
        closeModals();
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to reject settlement');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlockVendor = async () => {
    if (!modalInput.trim()) return toastManager.error('Reason is required');
    try {
      setActionLoading(true);
      const res = await adminSettlementService.blockVendor(selectedItem._id, modalInput);
      if (res.success) {
        toastManager.success('Vendor blocked from taking cash orders');
        loadData();
        closeModals();
      }
    } catch (error) {
      toastManager.error('Failed to block owner');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblockVendorSubmit = async () => {
    try {
      setActionLoading(true);
      const res = await adminSettlementService.unblockVendor(selectedItem._id);
      if (res.success) {
        toastManager.success('Vendor unblocked');
        loadData();
        closeModals();
      }
    } catch (error) {
      toastManager.error('Failed to unblock');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateLimitSubmit = async () => {
    const limit = Number(modalInput);
    if (isNaN(limit) || limit < 0) return toastManager.error('Invalid limit amount');
    try {
      setActionLoading(true);
      const res = await adminSettlementService.updateVendorLimit(selectedItem._id, limit);
      if (res.success) {
        toastManager.success('Limit updated successfully');
        loadData();
        closeModals();
      }
    } catch (error) {
      toastManager.error('Failed to update limit');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleExport = () => {
    if (activeTab === 'history' && history.length > 0) {
      exportToCSV(history, 'settlement_history', [
        { key: 'vendorId.name', label: 'Vendor Name' },
        { key: 'vendorId.businessName', label: 'Business Name' },
        { key: 'amount', label: 'Amount', type: 'currency' },
        { key: 'paymentMethod', label: 'Payment Method' },
        { key: 'paymentReference', label: 'Reference' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'Date', type: 'datetime' }
      ]);
    } else if (activeTab === 'owners' && owners.length > 0) {
      exportToCSV(owners, 'owner_balances_due', [
        { key: 'name', label: 'Vendor Name' },
        { key: 'businessName', label: 'Business Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'amountDue', label: 'Amount Due', type: 'currency' },
        { key: 'maxCashLimit', label: 'Max Cash Limit', type: 'currency' },
        { key: 'isBlocked', label: 'Blocked' }
      ]);
    } else if (activeTab === 'pending' && pendingSettlements.length > 0) {
      exportToCSV(pendingSettlements, 'pending_settlements', [
        { key: 'vendorId.name', label: 'Vendor Name' },
        { key: 'vendorId.businessName', label: 'Business Name' },
        { key: 'amount', label: 'Amount', type: 'currency' },
        { key: 'paymentMethod', label: 'Payment Method' },
        { key: 'paymentReference', label: 'Reference' },
        { key: 'createdAt', label: 'Date', type: 'datetime' }
      ]);
    } else {
      toastManager.error('No data to export');
    }
  };

  /* --- Dashboard Cards --- */
  const renderDashboardCards = () => {
    let cards = [];

    if (activeTab === 'owners') {
      const totalDue = owners.reduce((sum, o) => sum + (o.amountDue || 0), 0);
      const blockedCount = owners.filter(o => o.isBlocked).length;
      const totalLimit = owners.reduce((sum, o) => sum + (o.maxCashLimit || 0), 0);

      cards = [
        {
          title: 'Total Due from Vendors',
          value: `₹${totalDue.toLocaleString()}`,
          icon: FiDollarSign,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-100'
        },
        {
          title: 'Vendors with Due',
          value: owners.length,
          icon: FiUsers,
          color: 'text-orange-600',
          bg: 'bg-orange-50',
          border: 'border-orange-100'
        },
        {
          title: 'Blocked Vendors',
          value: blockedCount,
          icon: FiAlertCircle,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-100'
        },
        {
          title: 'Total Cash Limit',
          value: `₹${(totalLimit / 100000).toFixed(1)}L`,
          icon: FiCheck,
          color: 'text-indigo-600',
          bg: 'bg-indigo-50',
          border: 'border-indigo-100'
        }
      ];
    } else if (activeTab === 'history') {
      const totalTxns = history.length;
      const totalSettled = history.reduce((sum, h) => h.status === 'approved' ? sum + (h.amount || 0) : 0, 0);
      const approvedCount = history.filter(h => h.status === 'approved').length;
      const rejectedCount = history.filter(h => h.status === 'rejected').length;

      cards = [
        {
          title: 'Total Settled Amount',
          value: `₹${totalSettled.toLocaleString()}`,
          icon: FiCheck,
          color: 'text-green-600',
          bg: 'bg-green-50',
          border: 'border-green-100'
        },
        {
          title: 'Total Transactions',
          value: totalTxns,
          icon: FiTrendingUp,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-100'
        },
        {
          title: 'Approved Requests',
          value: approvedCount,
          icon: FiCheck,
          color: 'text-teal-600',
          bg: 'bg-teal-50',
          border: 'border-teal-100'
        },
        {
          title: 'Rejected Requests',
          value: rejectedCount,
          icon: FiX,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-100'
        }
      ];
    } else {
      // Default Pending Tab
      if (!dashboard) return null;
      cards = [
        {
          title: 'Total Due to Admin',
          value: `₹${dashboard.totalDueToAdmin?.toLocaleString() || 0}`,
          icon: FiDollarSign,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-100'
        },
        {
          title: 'Pending Settlements',
          value: dashboard.pendingSettlements?.count || 0,
          icon: FiClock,
          color: 'text-orange-600',
          bg: 'bg-orange-50',
          border: 'border-orange-100'
        },
        {
          title: "Today's Collection",
          value: `₹${dashboard.todayCashCollected?.amount?.toLocaleString() || 0}`,
          icon: FiTrendingUp,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-100'
        },
        {
          title: 'Weekly Collection',
          value: `₹${dashboard.weeklySettlements?.amount?.toLocaleString() || 0}`,
          icon: FiCheck,
          color: 'text-green-600',
          bg: 'bg-green-50',
          border: 'border-green-100'
        }
      ];
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, index) => (
          <div key={index} className={`bg-white rounded-2xl p-5 shadow-sm border hover:shadow-md transition-all ${card.border}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{card.title}</p>
                <h3 className="text-2xl font-black text-gray-800 tracking-tight">{card.value}</h3>
              </div>
              <div className={`p-3 rounded-xl ${card.bg} ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // --- Render Lists ---
  const renderPendingSettlements = () => (
    pendingSettlements.length === 0 ? (
      <div className="text-center py-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
        <FiClock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="text-gray-700 font-bold text-base">No pending settlements</p>
        <p className="text-gray-400 text-xs mt-1">All owner cash settlements have been reviewed.</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pendingSettlements.map((settlement) => (
          <div key={settlement._id} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-all space-y-4">
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-gray-900 text-sm">{settlement.vendorId?.name || 'Unknown Vendor'}</h3>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">{settlement.vendorId?.businessName}</span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <p className="text-2xl font-black text-blue-600">₹{settlement.amount?.toLocaleString()}</p>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase rounded">{settlement.paymentMethod}</span>
                </div>

                {settlement.paymentReference && (
                  <p className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded inline-block">Ref: {settlement.paymentReference}</p>
                )}

                <p className="text-xs text-gray-400 mt-2">{formatDate(settlement.createdAt)}</p>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                {settlement.paymentProof && (
                  <a
                    href={settlement.paymentProof}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 text-center transition-colors mb-1"
                  >
                    View Proof
                  </a>
                )}
                <button
                  onClick={() => openApproveSettlement(settlement)}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold uppercase hover:bg-green-700 shadow-sm active:scale-95 transition-all"
                >
                  Approve
                </button>
                <button
                  onClick={() => openRejectSettlement(settlement)}
                  className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold uppercase hover:bg-red-50 active:scale-95 transition-all"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  );

  const renderOwnersList = () => (
    owners.length === 0 ? (
      <div className="text-center py-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
        <FiUsers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="text-gray-700 font-bold text-base">No owners with outstanding dues</p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 font-semibold">Vendor</th>
              <th className="px-6 py-3 font-semibold">Cash Collection vs Limit</th>
              <th className="px-6 py-3 font-semibold text-right">Amount Due</th>
              <th className="px-6 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {owners.map(vendor => (
              <tr key={vendor._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <p className="font-bold text-gray-900">{vendor.name}</p>
                    <p className="text-xs text-gray-500">{vendor.businessName} ? {vendor.phone}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1 max-w-[200px]">
                    <div className="flex justify-between text-xs font-medium">
                      <span>₹{vendor.currentCashHoldings?.toLocaleString() || 0}</span>
                      <span className="text-gray-400">Limit: ₹{vendor.maxCashLimit?.toLocaleString() || 5000}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${vendor.isBlocked ? 'bg-red-600' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, ((vendor.currentCashHoldings || 0) / (vendor.maxCashLimit || 5000)) * 100)}%` }}
                      />
                    </div>
                    {vendor.isBlocked && <span className="text-[10px] text-red-600 font-bold mt-1 uppercase tracking-wide">Blocked</span>}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="font-bold text-red-600 text-base">
                    ₹{vendor.amountDue?.toLocaleString() || 0}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => navigate(`/admin/settlements/vendor/${vendor._id}`)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="View Ledger"
                    >
                      <FiEye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openUpdateLimit(vendor)}
                      className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Update Limit"
                    >
                      <FiDollarSign className="w-4 h-4" />
                    </button>
                    {vendor.isBlocked ? (
                      <button
                        onClick={() => openUnblockVendor(vendor)}
                        className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-xs font-bold uppercase hover:bg-orange-200 transition-colors"
                      >
                        Unblock
                      </button>
                    ) : (
                      <button
                        onClick={() => openBlockVendor(vendor)}
                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold uppercase hover:bg-red-100 transition-colors"
                      >
                        Block
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  const renderHistoryList = () => (
    history.length === 0 ? (
      <div className="text-center py-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
        <FiTrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="text-gray-700 font-bold text-base">No settlement history found</p>
      </div>
    ) : (
      <div className="space-y-3">
        {history.map(settlement => (
          <div
            key={settlement._id}
            className={`bg-white rounded-2xl p-4 border transition-all hover:shadow-md ${settlement.status === 'approved' ? 'border-l-4 border-l-green-500 border-gray-100' :
              settlement.status === 'rejected' ? 'border-l-4 border-l-red-500 border-gray-100' :
                'border-l-4 border-l-orange-500 border-gray-100'
              }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${settlement.status === 'approved' ? 'bg-green-100 text-green-600' :
                  settlement.status === 'rejected' ? 'bg-red-100 text-red-600' :
                    'bg-orange-100 text-orange-600'
                  }`}>
                  {settlement.status === 'approved' ? <FiCheck /> : settlement.status === 'rejected' ? <FiX /> : <FiClock />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{settlement.vendorId?.name || 'Unknown'} <span className="font-normal text-gray-500">paid</span> ₹{settlement.amount?.toLocaleString()}</h4>
                  <p className="text-xs text-gray-500">{formatDate(settlement.createdAt)} • via {settlement.paymentMethod}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${settlement.status === 'approved' ? 'bg-green-50 text-green-700' :
                  settlement.status === 'rejected' ? 'bg-red-50 text-red-700' :
                    'bg-orange-50 text-orange-700'
                  }`}>
                  {settlement.status}
                </span>
                {settlement.rejectionReason && (
                  <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={settlement.rejectionReason}>{settlement.rejectionReason}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
          {activeTab === 'owners' || activeTab === 'vendors'
            ? 'Vendors with Due'
            : activeTab === 'history'
            ? 'Settlement History'
            : 'Pending Settlements'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {activeTab === 'owners' || activeTab === 'vendors'
            ? 'Monitor owner cash holdings, limits, and outstanding dues'
            : activeTab === 'history'
            ? 'View past transaction records and approved settlements'
            : 'Review and approve owner cash settlements'}
        </p>
      </div>

      {/* Dynamic Dashboard Cards */}
      {renderDashboardCards()}

      {/* Navigation Tabs Bar & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'pending', label: 'Pending Settlements', icon: FiClock, count: pendingSettlements.length },
            { id: 'owners', label: 'Vendors with Due', icon: FiUsers },
            { id: 'history', label: 'Settlement History', icon: FiTrendingUp }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  navigate(`/admin/settlements/${tab.id}`);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                      isActive ? 'bg-white text-blue-600' : 'bg-orange-100 text-orange-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExport}
            className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-all"
          >
            <FiDownload className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => loadData()}
            className="p-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-50 transition-colors shadow-sm"
            title="Refresh Data"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500 mt-4 font-medium text-xs">Loading settlement data...</p>
          </div>
        ) : (
          <div>
            {activeTab === 'pending' && renderPendingSettlements()}
            {(activeTab === 'owners' || activeTab === 'vendors') && renderOwnersList()}
            {activeTab === 'history' && renderHistoryList()}
          </div>
        )}
      </div>

      {/* Modals */}
      {/* Approve Settlement Modal */}
      <Modal
        isOpen={activeModal === 'approve_settlement'}
        onClose={closeModals}
        title="Approve Settlement"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">
            Are you sure you want to approve this settlement of
            <span className="font-bold text-gray-900 mx-1">₹{selectedItem?.amount?.toLocaleString()}</span>
            from {selectedItem?.vendorId?.name || selectedItem?.name}?
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={closeModals}>Cancel</Button>
            <Button
              onClick={handleApproveSettlement}
              isLoading={actionLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Confirm Approval
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Settlement Modal */}
      <Modal
        isOpen={activeModal === 'reject_settlement'}
        onClose={closeModals}
        title="Reject Settlement"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">Please provide a reason for rejecting this settlement.</p>
          <textarea
            value={modalInput}
            onChange={(e) => setModalInput(e.target.value)}
            placeholder="e.g. Transaction ID not found, Invalid screenshot..."
            className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-xs"
            rows={3}
          />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={closeModals}>Cancel</Button>
            <Button
              onClick={handleRejectSettlement}
              isLoading={actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Reject Settlement
            </Button>
          </div>
        </div>
      </Modal>

      {/* Block Owner Modal */}
      <Modal
        isOpen={activeModal === 'block_owner'}
        onClose={closeModals}
        title="Block Vendor"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">
            Blocking <span className="font-bold">{selectedItem?.name}</span> will prevent them from accepting new cash jobs.
          </p>
          <textarea
            value={modalInput}
            onChange={(e) => setModalInput(e.target.value)}
            placeholder="Reason for blocking..."
            className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-xs"
            rows={3}
          />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={closeModals}>Cancel</Button>
            <Button
              onClick={handleBlockVendor}
              isLoading={actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Block Vendor
            </Button>
          </div>
        </div>
      </Modal>

      {/* Unblock Owner Modal */}
      <Modal
        isOpen={activeModal === 'unblock_owner'}
        onClose={closeModals}
        title="Unblock Vendor"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">
            Are you sure you want to unblock <span className="font-bold text-gray-900">{selectedItem?.name}</span>?
            Their cash limit and blocking status will be reset.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={closeModals}>Cancel</Button>
            <Button
              onClick={handleUnblockVendorSubmit}
              isLoading={actionLoading}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Confirm Unblock
            </Button>
          </div>
        </div>
      </Modal>

      {/* Update Limit Modal */}
      <Modal
        isOpen={activeModal === 'update_limit'}
        onClose={closeModals}
        title="Update Cash Limit"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">Set a new cash collection limit for {selectedItem?.name}.</p>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-500 font-bold">₹</span>
            <input
              type="number"
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              className="w-full p-2.5 pl-8 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
            />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={closeModals}>Cancel</Button>
            <Button
              onClick={handleUpdateLimitSubmit}
              isLoading={actionLoading}
            >
              Update Limit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SettlementManagement;
