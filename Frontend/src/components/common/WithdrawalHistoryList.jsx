import React, { useState, useEffect } from 'react';
import {
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiEye,
  FiExternalLink,
  FiFileText,
  FiRefreshCw,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiLoader
} from 'react-icons/fi';
import withdrawalService from '../../services/withdrawalService';
import { toastManager } from '../../utils/toastManager';

export const WithdrawalHistoryList = ({ refreshTrigger = 0 }) => {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 5, total: 0, pages: 1 });
  const [viewProofItem, setViewProofItem] = useState(null);

  useEffect(() => {
    loadHistory(1);
  }, [refreshTrigger]);

  const loadHistory = async (page = 1, limit = 5) => {
    try {
      setLoading(true);
      const res = await withdrawalService.getHistory({ page, limit });
      if (res.success) {
        setHistory(res.data || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      }
    } catch (err) {
      console.error('Error fetching withdrawal history:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Withdrawal Successful
          </span>
        );
      case 'ADMIN_ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Accepted
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Processing Payout
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Rejected
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending
          </span>
        );
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Withdrawal History</h3>
        <button
          onClick={() => loadHistory(1)}
          className="p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
          title="Refresh History"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && history.length === 0 ? (
        <div className="py-8 text-center">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-400">Loading history...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <FiClock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-gray-600">No withdrawal requests yet</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Your submitted payout requests will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map(item => {
            const status = item.status?.toUpperCase();
            return (
              <div
                key={item._id}
                className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm space-y-3 hover:border-gray-200 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-lg font-black text-gray-900">₹{(item.amountINR || item.amount || 0).toLocaleString()}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Requested: {formatDate(item.requestedAt || item.requestDate || item.createdAt)}
                    </p>
                  </div>
                  <div>
                    {getStatusBadge(item.status)}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Bank Account</span>
                    <span className="font-mono font-medium text-gray-800">{item.bankAccountMasked || '••••'}</span>
                  </div>
                  {item.completedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Completed Date</span>
                      <span className="font-medium text-gray-800">{formatDate(item.completedAt)}</span>
                    </div>
                  )}
                  {item.paymentReference && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">UTR / Ref No.</span>
                      <span className="font-mono font-medium text-gray-800">{item.paymentReference}</span>
                    </div>
                  )}
                </div>

                {item.requestNotes && (
                  <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
                    <p className="font-bold text-[11px]">Your note:</p>
                    <p className="text-[11px] mt-0.5 break-words">{item.requestNotes}</p>
                  </div>
                )}

                {item.adminNotes && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                    <p className="font-bold text-[11px]">Note from admin:</p>
                    <p className="text-[11px] mt-0.5 break-words">{item.adminNotes}</p>
                  </div>
                )}

                {status === 'REJECTED' && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    <p className="font-bold text-[11px]">Withdrawal Rejected:</p>
                    <p className="text-[11px] mt-0.5">{item.rejectionReason || 'No reason provided'}</p>
                  </div>
                )}

                {status === 'COMPLETED' && item.paymentProof && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => setViewProofItem(item)}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <FiEye className="w-3.5 h-3.5" />
                      View Payment Proof
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar for Withdrawal History */}
      {!loading && pagination.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>
              Showing <span className="font-bold text-gray-900">{(pagination.page - 1) * (pagination.limit || 5) + 1}</span> - <span className="font-bold text-gray-900">{Math.min(pagination.page * (pagination.limit || 5), pagination.total)}</span> of <span className="font-bold text-gray-900">{pagination.total}</span> requests
            </span>
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => loadHistory(pagination.page - 1, pagination.limit || 5)}
                disabled={pagination.page <= 1 || loading}
                className="px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 shadow-sm active:scale-95"
              >
                <FiChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <div className="flex items-center gap-1">
                {[...Array(pagination.pages)].map((_, i) => {
                  const p = i + 1;
                  if (pagination.pages > 6 && Math.abs(p - pagination.page) > 2 && p !== 1 && p !== pagination.pages) {
                    if (Math.abs(p - pagination.page) === 3) {
                      return <span key={p} className="px-1 text-gray-400">...</span>;
                    }
                    return null;
                  }
                  const isActive = p === pagination.page;
                  return (
                    <button
                      key={p}
                      onClick={() => loadHistory(p, pagination.limit || 5)}
                      disabled={loading}
                      className={`min-w-[32px] h-8 px-2 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                          : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => loadHistory(pagination.page + 1, pagination.limit || 5)}
                disabled={pagination.page >= pagination.pages || loading}
                className="px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 shadow-sm active:scale-95"
              >
                <span>Next</span>
                <FiChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Proof Modal */}
      {viewProofItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setViewProofItem(null)}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <FiX className="w-5 h-5" />
            </button>
            <h4 className="text-sm font-bold text-gray-900 mb-3">Official Payout Proof</h4>

            {viewProofItem.paymentProof.endsWith('.pdf') ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
                <FiFileText className="w-10 h-10 text-red-500 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-800">PDF Payment Receipt</p>
                <a
                  href={viewProofItem.paymentProof}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 mt-3 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
                >
                  <FiExternalLink className="w-3.5 h-3.5" />
                  View PDF
                </a>
              </div>
            ) : (
              <div className="bg-gray-900 rounded-xl p-2 flex items-center justify-center max-h-[60vh] overflow-hidden">
                <img
                  src={viewProofItem.paymentProof}
                  alt="Payment Proof"
                  className="max-h-[55vh] w-auto object-contain rounded"
                />
              </div>
            )}

            {viewProofItem.paymentReference && (
              <p className="text-xs font-mono text-center text-gray-600 mt-3">
                Reference ID: <span className="font-bold text-gray-900">{viewProofItem.paymentReference}</span>
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setViewProofItem(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WithdrawalHistoryList;
