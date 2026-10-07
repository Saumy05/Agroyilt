import React, { useState, useEffect } from 'react';
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
  FiAlertCircle
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import withdrawalService from '../../../../services/withdrawalService';
import { exportToCSV } from '../../../../utils/csvExport';

const WithdrawalsPage = () => {
  const [loading, setLoading] = useState(true);
  const [withdrawals, setWithdrawals] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [workerTypeFilter, setWorkerTypeFilter] = useState('ALL');

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
    if (withdrawals.length === 0) {
      return toastManager.error('No withdrawal records to export');
    }
    exportToCSV(withdrawals, 'withdrawal_requests', [
      { key: 'requester.name', label: 'Requester Name' },
      { key: 'requesterRole', label: 'Role' },
      { key: 'workerType', label: 'Worker Type' },
      { key: 'amount', label: 'Amount', type: 'currency' },
      { key: 'status', label: 'Status' },
      { key: 'requestDate', label: 'Requested Date', type: 'date' },
      { key: 'paymentReference', label: 'Reference / UTR' }
    ]);
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Withdrawal Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Review, approve, and finalize bank payouts for Farmers, Vendors, and Workers
        </p>
      </div>

      {/* Dashboard KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-orange-100 hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Pending Amount</p>
              <h3 className="text-2xl font-black text-gray-800 tracking-tight">₹{pendingAmount.toLocaleString()}</h3>
            </div>
            <div className="p-3 rounded-xl bg-orange-50 text-orange-600">
              <FiDollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-blue-100 hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Pending Requests</p>
              <h3 className="text-2xl font-black text-gray-800 tracking-tight">{pendingRequests.length}</h3>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <FiClock className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-emerald-100 hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Completed Payouts</p>
              <h3 className="text-2xl font-black text-gray-800 tracking-tight">₹{completedAmount.toLocaleString()}</h3>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <FiCheck className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-purple-100 hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Requests</p>
              <h3 className="text-2xl font-black text-gray-800 tracking-tight">{withdrawals.length}</h3>
            </div>
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
              <FiTrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        {/* Filter Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
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
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === tab.id
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200 font-bold'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Secondary Filters & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Role Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Roles</option>
                <option value="farmer">Farmer / User</option>
                <option value="vendor">Vendor</option>
                <option value="worker">Worker</option>
              </select>
            </div>

            {/* Worker Type filter (visible if worker role selected) */}
            {roleFilter === 'worker' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">Worker Type:</span>
                <select
                  value={workerTypeFilter}
                  onChange={(e) => setWorkerTypeFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Worker Types</option>
                  <option value="WORKER">Independent</option>
                  <option value="TEAM_LEADER">Team Leader</option>
                </select>
              </div>
            )}

            <button
              onClick={handleExport}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 flex items-center gap-1.5 shadow-sm transition-all"
            >
              <FiDownload className="w-3.5 h-3.5" />
              Export CSV
            </button>

            <button
              onClick={loadWithdrawals}
              className="p-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs hover:bg-gray-50 transition-colors shadow-sm"
              title="Refresh"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* List of Requests */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500 mt-4 text-xs font-medium">Loading withdrawal requests...</p>
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="text-center py-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
            <FiCheck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-700 font-bold text-base">No withdrawal requests found</p>
            <p className="text-gray-400 text-xs mt-1">There are no records matching your current filter selection.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {withdrawals.map(request => {
              const requesterName = request.requester?.name || request.vendorId?.name || 'User';
              const requesterPhone = request.requester?.phone || request.vendorId?.phone || '';
              const role = (request.requesterRole || (request.vendorId ? 'vendor' : 'user')).toLowerCase();
              const workerType = request.workerType;
              const amount = request.amountINR || request.amount || 0;
              const status = (request.status || 'PENDING').toUpperCase();

              return (
                <div
                  key={request._id}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 hover:border-blue-300 transition-all space-y-4"
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base ${
                        role === 'vendor'
                          ? 'bg-blue-50 text-blue-700'
                          : role === 'worker'
                          ? 'bg-purple-50 text-purple-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {requesterName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-900 text-sm">{requesterName}</h3>
                          {/* Role Badge */}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                            role === 'vendor'
                              ? 'bg-blue-100 text-blue-800'
                              : role === 'worker'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {role === 'farmer' || role === 'user' ? 'Farmer' : role === 'vendor' ? 'Vendor' : 'Worker'}
                          </span>
                          {/* Worker Type Badge */}
                          {role === 'worker' && workerType && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-amber-100 text-amber-800">
                              {workerType === 'TEAM_LEADER' ? 'Team Leader' : 'Independent'}
                            </span>
                          )}
                        </div>
                        {requesterPhone && (
                          <p className="text-xs text-gray-500 font-mono mt-0.5">{requesterPhone}</p>
                        )}
                      </div>
                    </div>

                    {/* Amount & Status Badge */}
                    <div className="text-right">
                      <p className="text-2xl font-black text-gray-900">₹{amount.toLocaleString()}</p>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase mt-1 border ${
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
                  <div className="bg-gray-50 rounded-xl p-3.5 space-y-2 text-xs border border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Requested Date</span>
                      <span className="font-semibold text-gray-700">{formatDate(request.requestDate || request.createdAt)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Bank Account</span>
                      <span className="font-mono font-bold text-gray-800">
                        {request.bankAccountMasked || '••••'}
                      </span>
                    </div>
                    {(request.bankDetails?.ifscCode || request.bankDetails?.ifsc) && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">IFSC & Bank</span>
                        <span className="font-medium text-gray-800">
                          {request.bankDetails.ifscCode || request.bankDetails.ifsc} {request.bankDetails.bankName ? `(${request.bankDetails.bankName})` : ''}
                        </span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-gray-200 flex justify-end">
                      <button
                        onClick={() => openViewBankDetails(request)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        <FiFileText className="w-3.5 h-3.5" />
                        View Full Payout Bank Details
                      </button>
                    </div>
                  </div>

                  {/* Rejection Note if Rejected */}
                  {status === 'REJECTED' && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                      <p className="font-bold mb-0.5">Rejection Reason:</p>
                      <p>{request.rejectionReason || 'No reason specified'}</p>
                    </div>
                  )}

                  {/* Payment Details if Completed */}
                  {status === 'COMPLETED' && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex justify-between items-center">
                      <div>
                        <p className="font-bold flex items-center gap-1 text-emerald-700">
                          <FiCheck className="w-4 h-4" /> Payout Completed
                        </p>
                        {request.paymentReference && (
                          <p className="text-[11px] font-mono text-emerald-900 mt-0.5">
                            Ref / UTR: {request.paymentReference}
                          </p>
                        )}
                      </div>
                      {request.paymentProof && (
                        <button
                          onClick={() => setViewProofItem(request)}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700 flex items-center gap-1 shadow-sm transition-all"
                        >
                          <FiEye className="w-3.5 h-3.5" />
                          View Proof
                        </button>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-1 flex items-center gap-2">
                    {status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('accept_withdrawal');
                          }}
                          className="px-3 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('complete_withdrawal');
                          }}
                          className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
                        >
                          Finalize Payout
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('reject_withdrawal');
                          }}
                          className="px-3 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-xs hover:bg-red-50 active:scale-95 transition-all"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {status === 'ADMIN_ACCEPTED' && (
                      <>
                        <button
                          onClick={() => handleMarkProcessing(request)}
                          className="px-3 py-2.5 bg-white border border-purple-200 text-purple-700 rounded-xl font-bold text-xs hover:bg-purple-50 active:scale-95 transition-all"
                        >
                          Mark Processing
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('complete_withdrawal');
                          }}
                          className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
                        >
                          Complete Payout (Upload Proof)
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('reject_withdrawal');
                          }}
                          className="px-3 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-xs hover:bg-red-50 active:scale-95 transition-all"
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
                          className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
                        >
                          Complete Payout (Upload Proof)
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(request);
                            setActiveModal('reject_withdrawal');
                          }}
                          className="px-4 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-xs hover:bg-red-50 active:scale-95 transition-all"
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
