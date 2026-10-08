import React, { useState, useEffect, useMemo } from 'react';
import {
  FiDollarSign,
  FiClock,
  FiCheck,
  FiX,
  FiEye,
  FiDownload,
  FiRefreshCw,
  FiFileText,
  FiUploadCloud,
  FiExternalLink,
  FiCopy,
  FiTrendingUp,
  FiAlertCircle,
  FiGrid,
  FiList,
  FiSearch,
  FiChevronLeft,
  FiChevronRight,
  FiCalendar
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import withdrawalService from '../../../../services/withdrawalService';
import { exportToCSV } from '../../../../utils/csvExport';

// Formatted Date Input component (Forces DD/MM/YYYY display for Indian standard)
const FormattedDateInput = ({ value, onChange, min, max, placeholder = 'DD/MM/YYYY' }) => {
  const formattedDisplay = useMemo(() => {
    if (!value) return '';
    const parts = value.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    }
    return value;
  }, [value]);

  return (
    <div className="relative inline-flex items-center">
      <input
        type="text"
        readOnly
        value={formattedDisplay}
        placeholder={placeholder}
        onClick={(e) => {
          const dateInput = e.currentTarget.nextElementSibling;
          if (dateInput && dateInput.showPicker) {
            dateInput.showPicker();
          } else if (dateInput) {
            dateInput.focus();
          }
        }}
        className="w-28 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-mono font-bold text-gray-800 outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 hover:border-gray-300 transition-all shadow-2xs"
      />
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
      />
      <FiCalendar className="w-3.5 h-3.5 text-gray-400 absolute right-2 pointer-events-none" />
    </div>
  );
};

const WithdrawalsPage = () => {
  const [loading, setLoading] = useState(true);
  const [withdrawals, setWithdrawals] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters & Search & View Mode & Pagination
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [workerTypeFilter, setWorkerTypeFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  // Modals state
  const [activeModal, setActiveModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');

  // Complete payout form
  const [withdrawalProofFile, setWithdrawalProofFile] = useState(null);
  const [withdrawalProofPreview, setWithdrawalProofPreview] = useState('');
  const [withdrawalPaymentRef, setWithdrawalPaymentRef] = useState('');
  const [withdrawalAdminNotes, setWithdrawalAdminNotes] = useState('');

  // Bank details & proof viewers
  const [fullBankDetails, setFullBankDetails] = useState(null);
  const [loadingBankDetails, setLoadingBankDetails] = useState(false);
  const [viewProofItem, setViewProofItem] = useState(null);

  useEffect(() => {
    loadWithdrawals();
  }, [statusFilter, roleFilter, workerTypeFilter]);

  // Reset pagination when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, roleFilter, workerTypeFilter, searchQuery, timeFilter, startDate, endDate, itemsPerPage]);

  const loadWithdrawals = async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (roleFilter !== 'ALL') params.role = roleFilter;
      if (workerTypeFilter !== 'ALL') params.workerType = workerTypeFilter;

      const res = await withdrawalService.adminListWithdrawals(params);
      if (res.success) {
        setWithdrawals(res.data || []);
      }
    } catch (error) {
      console.error('Error loading withdrawals:', error);
      toastManager.error('Failed to load withdrawal requests');
    } finally {
      setLoading(false);
    }
  };

  // Client-side search and time filtering
  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter(item => {
      // 1. Text Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (item.requester?.name || item.vendorId?.name || '').toLowerCase();
        const phone = (item.requester?.phone || item.vendorId?.phone || '').toLowerCase();
        const acc = (item.bankAccountMasked || item.bankDetailsSnapshot?.accountNumber || item.bankDetails?.accountNumber || '').toLowerCase();
        const ref = (item.paymentReference || item.transactionReference || item._id || '').toLowerCase();
        const amt = String(item.amountINR || item.amount || '');
        const match = name.includes(q) || phone.includes(q) || acc.includes(q) || ref.includes(q) || amt.includes(q);
        if (!match) return false;
      }

      // 2. Time / Period Filter
      if (timeFilter !== 'ALL') {
        const itemDate = new Date(item.requestDate || item.createdAt || 0);
        const now = new Date();

        if (timeFilter === 'TODAY') {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (itemDate < startOfToday) return false;
        } else if (timeFilter === 'THIS_WEEK') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (itemDate < sevenDaysAgo) return false;
        } else if (timeFilter === 'THIS_MONTH') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          if (itemDate < startOfMonth) return false;
        } else if (timeFilter === 'CUSTOM') {
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (itemDate < start) return false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (itemDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [withdrawals, searchQuery, timeFilter, startDate, endDate]);

  // Client-side pagination
  const totalPages = Math.ceil(filteredWithdrawals.length / itemsPerPage) || 1;
  const paginatedWithdrawals = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredWithdrawals.slice(start, start + itemsPerPage);
  }, [filteredWithdrawals, currentPage, itemsPerPage]);

  const handleStartDateChange = (val) => {
    setStartDate(val);
    // If start date is later than end date, auto-align end date to match start date
    if (val && endDate && val > endDate) {
      setEndDate(val);
    }
  };

  const handleEndDateChange = (val) => {
    // If end date is earlier than start date, inform admin and auto-align end date
    if (val && startDate && val < startDate) {
      toastManager.error('End date cannot be earlier than start date');
      setEndDate(startDate);
      return;
    }
    setEndDate(val);
  };

  const closeModals = () => {
    setActiveModal(null);
    setSelectedItem(null);
    setAdminNoteInput('');
    setRejectionReasonInput('');
    setWithdrawalProofFile(null);
    setWithdrawalProofPreview('');
    setWithdrawalPaymentRef('');
    setWithdrawalAdminNotes('');
    setFullBankDetails(null);
    setViewProofItem(null);
  };

  // --- Actions ---
  const handleAcceptWithdrawal = async () => {
    try {
      setActionLoading(true);
      const res = await withdrawalService.adminAccept(selectedItem._id, adminNoteInput.trim());
      if (res.success) {
        toastManager.success('Withdrawal accepted for manual payout processing');
        loadWithdrawals();
        closeModals();
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || error.message || 'Failed to accept withdrawal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkProcessing = async (item) => {
    try {
      setActionLoading(true);
      const res = await withdrawalService.adminMarkProcessing(item._id);
      if (res.success) {
        toastManager.success('Withdrawal marked as PROCESSING');
        loadWithdrawals();
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || error.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectWithdrawalSubmit = async () => {
    if (!rejectionReasonInput.trim()) {
      return toastManager.error('Mandatory rejection reason is required');
    }
    try {
      setActionLoading(true);
      const res = await withdrawalService.adminReject(selectedItem._id, rejectionReasonInput.trim(), adminNoteInput.trim());
      if (res.success) {
        toastManager.success('Withdrawal rejected and reserved balance refunded');
        loadWithdrawals();
        closeModals();
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || error.message || 'Failed to reject withdrawal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteWithdrawalSubmit = async () => {
    const targetId = selectedItem?._id || selectedItem?.id;
    if (!targetId) {
      return toastManager.error('No withdrawal request selected');
    }
    if (!withdrawalProofFile) {
      return toastManager.error('Payment proof document (receipt/screenshot/PDF) is mandatory');
    }

    try {
      setActionLoading(true);
      const formData = new FormData();
      formData.append('paymentProof', withdrawalProofFile);
      if (withdrawalPaymentRef && withdrawalPaymentRef.trim()) {
        formData.append('paymentReference', withdrawalPaymentRef.trim());
      }
      if (withdrawalAdminNotes && withdrawalAdminNotes.trim()) {
        formData.append('adminNotes', withdrawalAdminNotes.trim());
      }

      const res = await withdrawalService.adminComplete(targetId, formData);
      if (res && res.success) {
        toastManager.success('Withdrawal finalized and marked as COMPLETED!');
        loadWithdrawals();
        closeModals();
      } else {
        toastManager.error(res?.message || 'Failed to complete payout');
      }
    } catch (error) {
      console.error('[handleCompleteWithdrawalSubmit] Error completing payout:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to complete payout';
      toastManager.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const openViewBankDetails = async (item) => {
    setSelectedItem(item);
    setActiveModal('view_bank_details');

    const immediate = item.bankDetailsSnapshot || item.bankDetails;
    if (immediate && (immediate.accountNumber || immediate.accountHolderName)) {
      setFullBankDetails(immediate);
    } else {
      setFullBankDetails(null);
    }

    try {
      setLoadingBankDetails(true);
      const res = await withdrawalService.adminGetWithdrawal(item._id);
      if (res.success && res.data) {
        const details = res.data.bankDetailsSnapshot || res.data.bankDetails || immediate;
        if (details && (details.accountNumber || details.accountHolderName)) {
          setFullBankDetails(details);
        }
      }
    } catch (err) {
      console.error('Failed to load bank details snapshot:', err);
    } finally {
      setLoadingBankDetails(false);
    }
  };

  const handleExport = () => {
    if (filteredWithdrawals.length === 0) {
      return toastManager.error('No withdrawal records to export');
    }
    exportToCSV(filteredWithdrawals, 'withdrawal_requests', [
      { key: 'requester.name', label: 'Requester Name' },
      { key: 'requesterRole', label: 'Role' },
      { key: 'workerType', label: 'Worker Type' },
      { key: 'amount', label: 'Amount', type: 'currency' },
      { key: 'status', label: 'Status' },
      { key: 'requestDate', label: 'Requested Date', type: 'date' },
      { key: 'paymentReference', label: 'Reference / UTR' }
    ]);
  };

  const handleExportBankBatch = () => {
    const pendingList = filteredWithdrawals.filter(w => ['PENDING', 'ADMIN_ACCEPTED', 'PROCESSING'].includes((w.status || '').toUpperCase()));
    if (pendingList.length === 0) {
      return toastManager.error('No pending or accepted requests available for bank batch export');
    }
    exportToCSV(pendingList, 'bank_payout_batch', [
      { key: 'requester.name', label: 'Beneficiary Name' },
      { key: 'bankDetailsSnapshot.accountNumber', label: 'Account Number' },
      { key: 'bankDetailsSnapshot.ifscCode', label: 'IFSC Code' },
      { key: 'bankDetailsSnapshot.bankName', label: 'Bank Name' },
      { key: 'amount', label: 'Amount INR' },
      { key: '_id', label: 'Payment Reference ID' }
    ]);
    toastManager.success(`Exported ${pendingList.length} records for Corporate Bank Batch Transfer!`);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Stats calculation
  const pendingRequests = withdrawals.filter(w => (w.status || '').toUpperCase() === 'PENDING');
  const pendingAmount = pendingRequests.reduce((sum, w) => sum + (w.amount || 0), 0);
  const completedRequests = withdrawals.filter(w => (w.status || '').toUpperCase() === 'COMPLETED');
  const completedAmount = completedRequests.reduce((sum, w) => sum + (w.amount || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Withdrawal Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Review, approve, and finalize bank payouts for Farmers, Vendors, and Workers
        </p>
      </div>

      {/* Dashboard KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3.5 shadow-2xs border border-orange-100 hover:shadow-xs transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Total Pending Amount</p>
              <h3 className="text-xl font-black text-gray-800 tracking-tight">₹{pendingAmount.toLocaleString()}</h3>
            </div>
            <div className="p-2.5 rounded-lg bg-orange-50 text-orange-600 shrink-0">
              <FiDollarSign className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 shadow-2xs border border-blue-100 hover:shadow-xs transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Pending Requests</p>
              <h3 className="text-xl font-black text-gray-800 tracking-tight">{pendingRequests.length}</h3>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <FiClock className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 shadow-2xs border border-emerald-100 hover:shadow-xs transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Completed Payouts</p>
              <h3 className="text-xl font-black text-gray-800 tracking-tight">₹{completedAmount.toLocaleString()}</h3>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <FiCheck className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 shadow-2xs border border-purple-100 hover:shadow-xs transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Total Requests</p>
              <h3 className="text-xl font-black text-gray-800 tracking-tight">{withdrawals.length}</h3>
            </div>
            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600 shrink-0">
              <FiTrendingUp className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl shadow-2xs border border-gray-100 p-4 sm:p-5 space-y-4">
        {/* Top Control Bar: Search + Batch Actions + View Toggle */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <FiSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, account, UTR, amount..."
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Actions & View Mode Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportBankBatch}
              title="Download NEFT / NACH batch CSV for corporate banking portal upload"
              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl text-[11px] font-bold hover:bg-emerald-100 flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <FiDownload className="w-3.5 h-3.5" />
              Bank Payout Batch CSV
            </button>

            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-[11px] font-bold hover:bg-gray-50 flex items-center gap-1 shadow-2xs transition-all"
            >
              <FiDownload className="w-3.5 h-3.5" />
              Export CSV
            </button>

            <button
              onClick={loadWithdrawals}
              className="p-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs hover:bg-gray-50 transition-colors shadow-2xs"
              title="Refresh"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* View Mode Switcher (Grid vs Table) */}
            <div className="flex items-center p-0.5 bg-gray-100 rounded-xl border border-gray-200 ml-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white text-blue-600 shadow-2xs font-bold'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Grid Card View"
              >
                <FiGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-blue-600 shadow-2xs font-bold'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Compact Table View"
              >
                <FiList className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2">
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-200/80">
            {[
              { id: 'ALL', label: 'All Requests' },
              { id: 'PENDING', label: 'Pending' },
              { id: 'ADMIN_ACCEPTED', label: 'Accepted' },
              { id: 'PROCESSING', label: 'Processing' },
              { id: 'COMPLETED', label: 'Completed' },
              { id: 'REJECTED', label: 'Rejected' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  statusFilter === tab.id
                    ? 'bg-white text-gray-900 shadow-2xs border border-gray-200/80 font-bold'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Secondary Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Time / Period Filter */}
            <div className="flex items-center gap-1.5">
              <FiCalendar className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-500">Period:</span>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Today</option>
                <option value="THIS_WEEK">Last 7 Days</option>
                <option value="THIS_MONTH">This Month</option>
                <option value="CUSTOM">Custom Date Range</option>
              </select>
            </div>

            {/* Custom Date Range Pickers */}
            {timeFilter === 'CUSTOM' && (
              <div className="flex items-center gap-1.5 animate-fadeIn">
                <FormattedDateInput
                  value={startDate}
                  onChange={handleStartDateChange}
                  max={endDate || undefined}
                  placeholder="DD/MM/YYYY"
                />
                <span className="text-gray-400 text-xs">to</span>
                <FormattedDateInput
                  value={endDate}
                  onChange={handleEndDateChange}
                  min={startDate || undefined}
                  placeholder="DD/MM/YYYY"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="p-1 text-xs text-gray-400 hover:text-gray-700"
                    title="Clear date range"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Role Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-500">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Roles</option>
                <option value="farmer">Farmer / User</option>
                <option value="vendor">Vendor</option>
                <option value="worker">Worker</option>
              </select>
            </div>

            {/* Worker Type filter (visible if worker role selected) */}
            {roleFilter === 'worker' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-500">Type:</span>
                <select
                  value={workerTypeFilter}
                  onChange={(e) => setWorkerTypeFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Worker Types</option>
                  <option value="WORKER">Independent</option>
                  <option value="TEAM_LEADER">Team Leader</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* List / Table of Requests */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500 mt-3 text-xs font-medium">Loading withdrawal requests...</p>
          </div>
        ) : filteredWithdrawals.length === 0 ? (
          <div className="text-center py-12 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
            <FiCheck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-gray-700 font-bold text-sm">No withdrawal requests found</p>
            <p className="text-gray-400 text-xs mt-0.5">There are no records matching your current search or filter selection.</p>
          </div>
        ) : viewMode === 'table' ? (
          /* ========================================================= */
          /* HIGH-DENSITY COMPACT TABLE VIEW (FOR 50+ REQUESTS) */
          /* ========================================================= */
          <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] border-b border-gray-200 tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Requester</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Requested Date</th>
                  <th className="py-2.5 px-3">Bank Details</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {paginatedWithdrawals.map((request) => {
                  const requesterName = request.requester?.name || request.vendorId?.name || 'User';
                  const requesterPhone = request.requester?.phone || request.vendorId?.phone || '';
                  const role = (request.requesterRole || (request.vendorId ? 'vendor' : 'user')).toLowerCase();
                  const workerType = request.workerType;
                  const amount = request.amountINR || request.amount || 0;
                  const status = (request.status || 'PENDING').toUpperCase();

                  return (
                    <tr key={request._id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-gray-900">{requesterName}</div>
                        {requesterPhone && <div className="text-[10px] text-gray-400 font-mono">{requesterPhone}</div>}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          role === 'vendor'
                            ? 'bg-blue-100 text-blue-800'
                            : role === 'worker'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {role === 'farmer' || role === 'user' ? 'Farmer' : role === 'vendor' ? 'Vendor' : 'Worker'}
                        </span>
                        {role === 'worker' && workerType && (
                          <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800">
                            {workerType === 'TEAM_LEADER' ? 'TL' : 'Ind'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                        {formatDate(request.requestDate || request.createdAt)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-bold text-gray-800 text-[11px]">
                          {request.bankAccountMasked || '••••'}
                        </div>
                        <button
                          onClick={() => openViewBankDetails(request)}
                          className="text-[10px] font-bold text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                        >
                          <FiFileText className="w-3 h-3" /> Details
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-gray-900 text-sm">
                        ₹{amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : status === 'ADMIN_ACCEPTED'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : status === 'PROCESSING'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : status === 'REJECTED'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {status === 'ADMIN_ACCEPTED' ? 'Accepted' : status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedItem(request);
                                  setActiveModal('accept_withdrawal');
                                }}
                                className="px-2 py-1 bg-blue-600 text-white rounded font-bold text-[11px] hover:bg-blue-700"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedItem(request);
                                  setActiveModal('complete_withdrawal');
                                }}
                                className="px-2 py-1 bg-emerald-600 text-white rounded font-bold text-[11px] hover:bg-emerald-700"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedItem(request);
                                  setActiveModal('reject_withdrawal');
                                }}
                                className="px-2 py-1 bg-white border border-red-200 text-red-600 rounded font-bold text-[11px] hover:bg-red-50"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {status === 'ADMIN_ACCEPTED' && (
                            <>
                              <button
                                onClick={() => handleMarkProcessing(request)}
                                className="px-2 py-1 bg-white border border-purple-200 text-purple-700 rounded font-bold text-[11px] hover:bg-purple-50"
                              >
                                Process
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedItem(request);
                                  setActiveModal('complete_withdrawal');
                                }}
                                className="px-2 py-1 bg-emerald-600 text-white rounded font-bold text-[11px] hover:bg-emerald-700"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedItem(request);
                                  setActiveModal('reject_withdrawal');
                                }}
                                className="px-2 py-1 bg-white border border-red-200 text-red-600 rounded font-bold text-[11px] hover:bg-red-50"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {status === 'PROCESSING' && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedItem(request);
                                  setActiveModal('complete_withdrawal');
                                }}
                                className="px-2 py-1 bg-emerald-600 text-white rounded font-bold text-[11px] hover:bg-emerald-700"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedItem(request);
                                  setActiveModal('reject_withdrawal');
                                }}
                                className="px-2 py-1 bg-white border border-red-200 text-red-600 rounded font-bold text-[11px] hover:bg-red-50"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {status === 'COMPLETED' && request.paymentProof && (
                            <button
                              onClick={() => setViewProofItem(request)}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold text-[11px] hover:bg-emerald-100 flex items-center gap-1"
                            >
                              <FiEye className="w-3 h-3" /> Proof
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ========================================================= */
          /* GRID VIEW (3 CARDS PER ROW ON DESKTOP) */
          /* ========================================================= */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {paginatedWithdrawals.map(request => {
              const requesterName = request.requester?.name || request.vendorId?.name || 'User';
              const requesterPhone = request.requester?.phone || request.vendorId?.phone || '';
              const role = (request.requesterRole || (request.vendorId ? 'vendor' : 'user')).toLowerCase();
              const workerType = request.workerType;
              const amount = request.amountINR || request.amount || 0;
              const status = (request.status || 'PENDING').toUpperCase();

              return (
                <div
                  key={request._id}
                  className="bg-white rounded-xl p-3.5 shadow-2xs border border-gray-200/90 hover:border-blue-300 transition-all space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                          role === 'vendor'
                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                            : role === 'worker'
                            ? 'bg-purple-50 text-purple-700 border border-purple-100'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>
                          {requesterName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-gray-900 text-xs truncate max-w-[110px] sm:max-w-[130px]">{requesterName}</h3>
                            {/* Role Badge */}
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold tracking-wide uppercase ${
                              role === 'vendor'
                                ? 'bg-blue-100/80 text-blue-800'
                                : role === 'worker'
                                ? 'bg-purple-100/80 text-purple-800'
                                : 'bg-emerald-100/80 text-emerald-800'
                            }`}>
                              {role === 'farmer' || role === 'user' ? 'Farmer' : role === 'vendor' ? 'Vendor' : 'Worker'}
                            </span>
                            {/* Worker Type Badge */}
                            {role === 'worker' && workerType && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold tracking-wide bg-amber-100 text-amber-800">
                                {workerType === 'TEAM_LEADER' ? 'TL' : 'Ind'}
                              </span>
                            )}
                          </div>
                          {requesterPhone && (
                            <p className="text-[11px] text-gray-400 font-mono mt-0.5">{requesterPhone}</p>
                          )}
                        </div>
                      </div>

                      {/* Amount & Status Badge */}
                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-gray-900 leading-none">₹{amount.toLocaleString()}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase mt-1 border ${
                          status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : status === 'ADMIN_ACCEPTED'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : status === 'PROCESSING'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : status === 'REJECTED'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            status === 'COMPLETED'
                              ? 'bg-emerald-500'
                              : status === 'ADMIN_ACCEPTED'
                              ? 'bg-blue-500'
                              : status === 'PROCESSING'
                              ? 'bg-purple-500'
                              : status === 'REJECTED'
                              ? 'bg-red-500'
                              : 'bg-amber-500'
                          }`} />
                          {status === 'ADMIN_ACCEPTED' ? 'Accepted' : status}
                        </span>
                      </div>
                    </div>

                    {/* Bank Details & Timing Snapshot */}
                    <div className="bg-gray-50/80 rounded-lg p-2.5 space-y-1.5 text-[11px] border border-gray-100">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Requested</span>
                        <span className="font-semibold text-gray-700">{formatDate(request.requestDate || request.createdAt)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Account</span>
                        <span className="font-mono font-bold text-gray-800">
                          {request.bankAccountMasked || '••••'}
                        </span>
                      </div>
                      {(request.bankDetails?.ifscCode || request.bankDetails?.ifsc) && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">IFSC / Bank</span>
                          <span className="font-medium text-gray-800 truncate max-w-[150px]">
                            {request.bankDetails.ifscCode || request.bankDetails.ifsc} {request.bankDetails.bankName ? `(${request.bankDetails.bankName})` : ''}
                          </span>
                        </div>
                      )}
                      <div className="pt-1.5 border-t border-gray-200/60 flex justify-end">
                        <button
                          onClick={() => openViewBankDetails(request)}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                        >
                          <FiFileText className="w-3 h-3" />
                          View Full Bank Details
                        </button>
                      </div>
                    </div>

                    {/* Rejection Note if Rejected */}
                    {status === 'REJECTED' && (
                      <div className="bg-red-50/80 border border-red-200 rounded-lg p-2 text-[11px] text-red-700">
                        <p className="font-bold mb-0.5">Rejection Reason:</p>
                        <p className="text-[11px] leading-tight">{request.rejectionReason || 'No reason specified'}</p>
                      </div>
                    )}

                    {/* Payment Details if Completed */}
                    {status === 'COMPLETED' && (
                      <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-2 text-[11px] text-emerald-800 flex justify-between items-center">
                        <div>
                          <p className="font-bold flex items-center gap-1 text-emerald-700 text-xs">
                            <FiCheck className="w-3.5 h-3.5" /> Payout Completed
                          </p>
                          {request.paymentReference && (
                            <p className="text-[10px] font-mono text-emerald-900 mt-0.5">
                              Ref: {request.paymentReference}
                            </p>
                          )}
                        </div>
                        {request.paymentProof && (
                          <button
                            onClick={() => setViewProofItem(request)}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded-md font-bold text-[11px] hover:bg-emerald-700 flex items-center gap-1 shadow-2xs transition-all"
                          >
                            <FiEye className="w-3 h-3" />
                            Proof
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-1 flex items-center gap-1.5">
                    {status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('accept_withdrawal');
                          }}
                          className="px-2.5 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs shadow-2xs hover:bg-blue-700 active:scale-95 transition-all"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('complete_withdrawal');
                          }}
                          className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs shadow-2xs hover:bg-emerald-700 active:scale-95 transition-all"
                        >
                          Finalize Payout
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('reject_withdrawal');
                          }}
                          className="px-2.5 py-2 bg-white border border-red-200 text-red-600 rounded-lg font-bold text-xs hover:bg-red-50 active:scale-95 transition-all"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {status === 'ADMIN_ACCEPTED' && (
                      <>
                        <button
                          onClick={() => handleMarkProcessing(request)}
                          className="px-2.5 py-2 bg-white border border-purple-200 text-purple-700 rounded-lg font-bold text-[11px] hover:bg-purple-50 active:scale-95 transition-all"
                        >
                          Processing
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('complete_withdrawal');
                          }}
                          className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs shadow-2xs hover:bg-emerald-700 active:scale-95 transition-all"
                        >
                          Complete Payout
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('reject_withdrawal');
                          }}
                          className="px-2.5 py-2 bg-white border border-red-200 text-red-600 rounded-lg font-bold text-xs hover:bg-red-50 active:scale-95 transition-all"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {status === 'PROCESSING' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('complete_withdrawal');
                          }}
                          className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs shadow-2xs hover:bg-emerald-700 active:scale-95 transition-all"
                        >
                          Complete Payout
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('reject_withdrawal');
                          }}
                          className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg font-bold text-xs hover:bg-red-50 active:scale-95 transition-all"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && filteredWithdrawals.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            <div className="flex items-center gap-3">
              <span>
                Showing <span className="font-bold text-gray-900">{Math.min((currentPage - 1) * itemsPerPage + 1, filteredWithdrawals.length)}</span> to{' '}
                <span className="font-bold text-gray-900">{Math.min(currentPage * itemsPerPage, filteredWithdrawals.length)}</span> of{' '}
                <span className="font-bold text-gray-900">{filteredWithdrawals.length}</span> requests
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 outline-none"
                >
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all shadow-2xs"
                >
                  <FiChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <span className="px-2 font-bold text-gray-800">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all shadow-2xs"
                >
                  <span>Next</span>
                  <FiChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- Modals --- */}
      {/* Accept Withdrawal Modal */}
      <Modal
        isOpen={activeModal === 'accept_withdrawal'}
        onClose={closeModals}
        title="Accept Withdrawal Request"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm font-bold text-blue-900">
              Approve for Manual Bank Transfer
            </p>
            <p className="text-xs text-blue-700 mt-1">
              Accepting this request changes its status to <span className="font-bold">ADMIN_ACCEPTED</span>. You can then transfer the amount outside the system via Netbanking/UPI, and upload payment proof to complete the withdrawal.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Requester</span>
              <span className="font-bold text-gray-900">{selectedItem?.requester?.name || selectedItem?.vendorId?.name || 'User'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Role</span>
              <span className="font-bold uppercase text-xs text-gray-700">{selectedItem?.requesterRole || (selectedItem?.vendorId ? 'Vendor' : 'User')}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="text-gray-700 font-semibold">Payout Amount</span>
              <span className="text-xl font-black text-green-600">
                ₹{(selectedItem?.amountINR || selectedItem?.amount || 0).toLocaleString()}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Optional Admin Note</label>
            <input
              type="text"
              value={adminNoteInput}
              onChange={(e) => setAdminNoteInput(e.target.value)}
              placeholder="e.g. Processing via HDFC netbanking batch 1"
              className="w-full p-2.5 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={closeModals}>Cancel</Button>
            <Button
              onClick={handleAcceptWithdrawal}
              isLoading={actionLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Confirm Acceptance
            </Button>
          </div>
        </div>
      </Modal>

      {/* Complete Payout Modal with Proof Upload */}
      <Modal
        isOpen={activeModal === 'complete_withdrawal'}
        onClose={closeModals}
        title="Complete Withdrawal Payout"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
            <p className="text-xs text-emerald-800">
              You are finalizing payout of <span className="font-bold text-emerald-950">₹{(selectedItem?.amountINR || selectedItem?.amount || 0).toLocaleString()}</span> to <span className="font-bold text-emerald-950">{selectedItem?.requester?.name || selectedItem?.vendorId?.name}</span>. Once marked completed, the wallet balance is permanently finalized.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Payment Proof (Mandatory: Receipt / Screenshot / PDF) *
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setWithdrawalProofFile(file);
                  if (file.type.startsWith('image/')) {
                    setWithdrawalProofPreview(URL.createObjectURL(file));
                  } else {
                    setWithdrawalProofPreview('');
                  }
                }
              }}
              className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer border border-gray-200 rounded-xl p-2"
            />
            {withdrawalProofPreview && (
              <div className="mt-2 p-2 border border-gray-200 rounded-xl bg-gray-50">
                <img src={withdrawalProofPreview} alt="Proof Preview" className="max-h-40 mx-auto rounded object-contain" />
              </div>
            )}
            {withdrawalProofFile && !withdrawalProofPreview && (
              <p className="text-xs text-emerald-600 font-semibold mt-1">
                Selected document: {withdrawalProofFile.name} ({(withdrawalProofFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Bank Transaction Reference / UTR Number
            </label>
            <input
              type="text"
              value={withdrawalPaymentRef}
              onChange={(e) => setWithdrawalPaymentRef(e.target.value)}
              placeholder="e.g. UTR123456789012"
              className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Admin Notes (Optional)
            </label>
            <input
              type="text"
              value={withdrawalAdminNotes}
              onChange={(e) => setWithdrawalAdminNotes(e.target.value)}
              placeholder="e.g. Paid via IMPS from main business account"
              className="w-full p-2.5 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={closeModals}>Cancel</Button>
            <Button
              onClick={handleCompleteWithdrawalSubmit}
              isLoading={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Finalize Payout
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Withdrawal Modal */}
      <Modal
        isOpen={activeModal === 'reject_withdrawal'}
        onClose={closeModals}
        title="Reject Withdrawal Request"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
            Rejecting this request will immediately release the reserved amount of <span className="font-bold">₹{(selectedItem?.amountINR || selectedItem?.amount || 0).toLocaleString()}</span> back to the user's available wallet balance.
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Mandatory Rejection Reason *
            </label>
            <textarea
              value={rejectionReasonInput}
              onChange={(e) => setRejectionReasonInput(e.target.value)}
              placeholder="e.g. Bank account name does not match KYC, Invalid IFSC code..."
              className="w-full p-3 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={closeModals}>Cancel</Button>
            <Button
              onClick={handleRejectWithdrawalSubmit}
              isLoading={actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Reject & Refund Balance
            </Button>
          </div>
        </div>
      </Modal>

      {/* Full Bank Details Snapshot Modal */}
      <Modal
        isOpen={activeModal === 'view_bank_details'}
        onClose={closeModals}
        title="Full Payout Bank Details"
        size="md"
      >
        <div className="space-y-4">
          {loadingBankDetails && !fullBankDetails ? (
            <div className="py-8 text-center">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-400">Loading bank details...</p>
            </div>
          ) : fullBankDetails && (fullBankDetails.accountNumber || fullBankDetails.accountHolderName) ? (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                🔒 These details were verified and snapshotted when the request was submitted. Transfer money only to this exact account.
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-xs border border-gray-200">
                <div className="flex justify-between items-center py-1 border-b border-gray-200">
                  <span className="text-gray-500">Account Holder Name</span>
                  <span className="font-bold text-gray-900">{fullBankDetails.accountHolderName || '-'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-200">
                  <span className="text-gray-500">Full Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-gray-900 text-sm">{fullBankDetails.accountNumber || '-'}</span>
                    {fullBankDetails.accountNumber && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(fullBankDetails.accountNumber);
                          toastManager.success('Account number copied!');
                        }}
                        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                        title="Copy Account Number"
                      >
                        <FiCopy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-200">
                  <span className="text-gray-500">IFSC Code</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-gray-900">{fullBankDetails.ifscCode || fullBankDetails.ifsc || '-'}</span>
                    {(fullBankDetails.ifscCode || fullBankDetails.ifsc) && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(fullBankDetails.ifscCode || fullBankDetails.ifsc);
                          toastManager.success('IFSC copied!');
                        }}
                        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                        title="Copy IFSC"
                      >
                        <FiCopy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-200">
                  <span className="text-gray-500">Bank Name</span>
                  <span className="font-bold text-gray-900">{fullBankDetails.bankName || '-'}</span>
                </div>
                {fullBankDetails.branchName && (
                  <div className="flex justify-between items-center py-1 border-b border-gray-200">
                    <span className="text-gray-500">Branch</span>
                    <span className="text-gray-800">{fullBankDetails.branchName}</span>
                  </div>
                )}
                {fullBankDetails.upiId && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-500">UPI ID / VPA</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-green-700">{fullBankDetails.upiId}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(fullBankDetails.upiId);
                          toastManager.success('UPI ID copied!');
                        }}
                        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                        title="Copy UPI ID"
                      >
                        <FiCopy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400 py-4">No bank snapshot found.</p>
          )}

          <div className="flex justify-end mt-4">
            <Button variant="ghost" onClick={closeModals}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* View Payment Proof Modal */}
      {viewProofItem && (
        <Modal
          isOpen={Boolean(viewProofItem)}
          onClose={() => setViewProofItem(null)}
          title="Payment Proof Document"
          size="lg"
        >
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 flex justify-between items-center text-xs border border-gray-200">
              <div>
                <p className="font-bold text-gray-900">
                  Payout to {viewProofItem.requester?.name || viewProofItem.vendorId?.name}
                </p>
                <p className="font-mono text-gray-500 mt-0.5">
                  Ref/UTR: {viewProofItem.paymentReference || 'N/A'}
                </p>
              </div>
              <a
                href={viewProofItem.paymentProof}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-1"
              >
                <FiExternalLink className="w-3.5 h-3.5" />
                Open Full Size
              </a>
            </div>

            <div className="border border-gray-200 rounded-2xl overflow-hidden bg-gray-900 flex items-center justify-center min-h-[300px] max-h-[500px]">
              {viewProofItem.paymentProof?.endsWith('.pdf') ? (
                <iframe
                  src={viewProofItem.paymentProof}
                  title="Payment Proof Document"
                  className="w-full h-[450px]"
                />
              ) : (
                <img
                  src={viewProofItem.paymentProof}
                  alt="Payment Proof"
                  className="max-h-[480px] max-w-full object-contain mx-auto"
                />
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setViewProofItem(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default WithdrawalsPage;
