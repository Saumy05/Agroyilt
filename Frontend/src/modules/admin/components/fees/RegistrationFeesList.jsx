import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiSearch, 
  FiDollarSign, 
  FiCheckCircle, 
  FiClock, 
  FiXCircle, 
  FiUser, 
  FiUsers, 
  FiBriefcase, 
  FiCopy, 
  FiCheck, 
  FiExternalLink, 
  FiRefreshCw, 
  FiCalendar, 
  FiCreditCard, 
  FiFileText, 
  FiX, 
  FiEye,
  FiPhone,
  FiMail,
  FiMapPin,
  FiShield
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import registrationFeeService from '../../services/registrationFeeService';
import LogoLoader from '../../../../components/common/LogoLoader';

const StatusBadge = ({ status }) => {
  const styles = {
    PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
    FAILED: 'bg-rose-100 text-rose-700 border-rose-200',
    CANCELLED: 'bg-slate-100 text-slate-700 border-slate-200'
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 border ${styles[status] || styles.PENDING}`}>
      {status === 'PAID' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
      {status === 'PENDING' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>}
      {status === 'FAILED' && <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>}
      {status === 'CANCELLED' && <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>}
      {status}
    </span>
  );
};

const RegistrationFeesList = ({ role = 'USER' }) => {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({
    totalCollected: 0,
    paidCount: 0,
    pendingCount: 0,
    failedCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [copiedId, setCopiedId] = useState(null);

  // Transaction Receipt / Details Modal State
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Role details mapping
  const roleConfig = {
    USER: {
      title: 'Farmer Registration Fees',
      subtitle: 'Monitor and track all registration fee transactions collected from farmers.',
      tag: 'Farmer',
      icon: FiUsers,
      color: 'blue'
    },
    WORKER: {
      title: 'Worker Registration Fees',
      subtitle: 'Monitor and track all registration fee transactions collected from farm workers & team leaders.',
      tag: 'Worker',
      icon: FiUser,
      color: 'emerald'
    },
    VENDOR: {
      title: 'Vendor Registration Fees',
      subtitle: 'Monitor and track all registration fee transactions collected from machinery & vendors.',
      tag: 'Vendor',
      icon: FiBriefcase,
      color: 'purple'
    }
  };

  const currentRoleConfig = roleConfig[role] || roleConfig.USER;

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await registrationFeeService.getPayments({
        role,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        page,
        limit: 20
      });

      if (res && res.success) {
        setPayments(res.data || []);
        if (res.stats) setStats(res.stats);
        if (res.pagination) {
          setTotalPages(res.pagination.pages || 1);
          setTotalCount(res.pagination.total || 0);
        }
      }
    } catch (err) {
      console.error('Failed to load registration fees:', err);
      toast.error('Failed to load registration fee payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setPage(1); // Reset page on filter change
      fetchPayments();
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [search, statusFilter, role]);

  useEffect(() => {
    fetchPayments();
  }, [page]);

  const copyToClipboard = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <currentRoleConfig.icon className={`text-${currentRoleConfig.color}-600`} />
            {currentRoleConfig.title}
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {currentRoleConfig.subtitle}
          </p>
        </div>
        <button
          onClick={() => fetchPayments()}
          className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer self-start sm:self-auto"
        >
          <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/40 p-5 rounded-3xl border border-emerald-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-800">Total Collected</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/20">
              <FiDollarSign size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-950 mt-3">
            ₹{stats.totalCollected?.toLocaleString('en-IN') || 0}
          </p>
          <p className="text-[11px] font-bold text-emerald-700 mt-1">
            From {stats.paidCount || 0} successful registrations
          </p>
        </div>

        {/* Successful Paid */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Paid / Active</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <FiCheckCircle size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">
            {stats.paidCount || 0}
          </p>
          <p className="text-[11px] font-bold text-emerald-600 mt-1">
            Confirmed payments
          </p>
        </div>

        {/* Pending */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Pending</span>
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <FiClock size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">
            {stats.pendingCount || 0}
          </p>
          <p className="text-[11px] font-bold text-amber-600 mt-1">
            Awaiting completion
          </p>
        </div>

        {/* Failed */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Failed / Cancelled</span>
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <FiXCircle size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">
            {stats.failedCount || 0}
          </p>
          <p className="text-[11px] font-bold text-rose-600 mt-1">
            Incomplete orders
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
        {/* Search Bar */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <FiSearch className="text-slate-400 mr-3 shrink-0" />
            <input
              type="text"
              placeholder="Search by payer name, phone, Razorpay Payment ID or Order ID..."
              className="bg-transparent border-none outline-none w-full text-sm font-medium text-slate-700"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                <FiX size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100 overflow-x-auto">
          {[
            { id: '', label: 'All Transactions' },
            { id: 'PAID', label: '✅ Paid' },
            { id: 'PENDING', label: '⏳ Pending' },
            { id: 'FAILED', label: '❌ Failed / Cancelled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                statusFilter === tab.id
                  ? tab.id === 'PAID'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : tab.id === 'PENDING'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : tab.id === 'FAILED'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <LogoLoader />
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiDollarSign className="text-slate-400 text-2xl" />
            </div>
            <h3 className="text-lg font-black text-slate-800">No registration fee transactions found</h3>
            <p className="text-slate-500 text-sm mt-1">Try adjusting your search or status filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider font-black text-slate-500">
                  <th className="py-4 px-4">Payer / Member</th>
                  <th className="py-4 px-4">Amount</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-4">Gateway Payment ID</th>
                  <th className="py-4 px-4">Order ID</th>
                  <th className="py-4 px-4">Date & Time</th>
                  <th className="py-4 px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {payments.map((p) => {
                    const payer = p.accountId || {};
                    const payerName = payer.name || 'Unknown Member';
                    const payerPhone = payer.phone || p.mobileNumberNormalized || '—';
                    const payerEmail = payer.email;
                    const businessName = payer.businessName;

                    return (
                      <motion.tr
                        key={p._id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        {/* Member */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center font-bold text-slate-600 shrink-0">
                              {payer.profilePhoto ? (
                                <img src={payer.profilePhoto} alt={payerName} className="w-full h-full object-cover" />
                              ) : (
                                payerName.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{payerName}</p>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>{payerPhone}</span>
                                {businessName && (
                                  <span className="bg-slate-100 text-slate-600 font-bold px-1.5 py-0.2 rounded text-[10px]">
                                    {businessName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="py-4 px-4">
                          <span className="font-black text-slate-900 text-sm">
                            ₹{p.amount?.toLocaleString('en-IN')}
                          </span>
                          {p.feeVersion && (
                            <span className="text-[10px] text-slate-400 block font-bold">
                              v{p.feeVersion}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4">
                          <StatusBadge status={p.status} />
                        </td>

                        {/* Gateway Payment ID */}
                        <td className="py-4 px-4">
                          {p.gatewayPaymentId ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                                {p.gatewayPaymentId}
                              </span>
                              <button
                                onClick={() => copyToClipboard(p.gatewayPaymentId, `pay_${p._id}`)}
                                className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"
                                title="Copy Payment ID"
                              >
                                {copiedId === `pay_${p._id}` ? <FiCheck className="text-emerald-500" /> : <FiCopy size={13} />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Not generated</span>
                          )}
                        </td>

                        {/* Gateway Order ID */}
                        <td className="py-4 px-4">
                          {p.gatewayOrderId ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono font-medium text-slate-600 max-w-[140px] truncate" title={p.gatewayOrderId}>
                                {p.gatewayOrderId}
                              </span>
                              <button
                                onClick={() => copyToClipboard(p.gatewayOrderId, `ord_${p._id}`)}
                                className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"
                                title="Copy Order ID"
                              >
                                {copiedId === `ord_${p._id}` ? <FiCheck className="text-emerald-500" /> : <FiCopy size={13} />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">—</span>
                          )}
                        </td>

                        {/* Date & Time */}
                        <td className="py-4 px-4 text-xs font-medium text-slate-600">
                          {formatDate(p.paidAt || p.createdAt)}
                        </td>

                        {/* Actions / View Receipt */}
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedPayment(p);
                              setIsReceiptModalOpen(true);
                            }}
                            className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white inline-flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:shadow"
                            title="View Full Payment Receipt"
                          >
                            <FiEye size={15} />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && payments.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-slate-100 gap-3">
            <p className="text-xs text-slate-500 font-bold">
              Showing {payments.length} of {totalCount} records (Page {page} of {totalPages})
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Receipt & Details Modal */}
      <AnimatePresence>
        {isReceiptModalOpen && selectedPayment && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100000] flex items-center justify-center p-2.5 sm:p-6 pb-20 sm:pb-6 overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[82vh] sm:max-h-[88vh] my-auto"
            >
              {/* Receipt Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold">
                    <FiFileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">Registration Fee Receipt</h3>
                    <p className="text-[11px] text-slate-400 font-mono">ID: {selectedPayment._id}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsReceiptModalOpen(false);
                    setSelectedPayment(null);
                  }}
                  className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <FiX size={16} />
                </button>
              </div>

              {/* Receipt Body */}
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
                {/* Payer Card */}
                <div className="bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-100 space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
                    Payer Profile ({currentRoleConfig.tag})
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center font-black text-slate-600 text-base shrink-0">
                      {selectedPayment.accountId?.profilePhoto ? (
                        <img src={selectedPayment.accountId.profilePhoto} alt={selectedPayment.accountId?.name} className="w-full h-full object-cover" />
                      ) : (
                        selectedPayment.accountId?.name?.charAt(0) ?.toUpperCase() || 'U'
                      )}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm">
                        {selectedPayment.accountId?.name || 'Unknown User'}
                      </h4>
                      <div className="text-xs text-slate-500 space-y-0.5 mt-0.5">
                        <p className="flex items-center gap-1.5"><FiPhone className="text-blue-500" /> {selectedPayment.accountId?.phone || selectedPayment.mobileNumberNormalized}</p>
                        {selectedPayment.accountId?.email && (
                          <p className="flex items-center gap-1.5"><FiMail className="text-indigo-500" /> {selectedPayment.accountId.email}</p>
                        )}
                        {selectedPayment.accountId?.businessName && (
                          <p className="text-slate-700 font-bold">Business: {selectedPayment.accountId.businessName}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Amount & Status Summary */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Fee Amount</span>
                    <p className="text-xl font-black text-slate-900 mt-0.5">
                      ₹{selectedPayment.amount?.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Payment Status</span>
                    <div className="mt-1">
                      <StatusBadge status={selectedPayment.status} />
                    </div>
                  </div>
                </div>

                {/* Gateway Metadata */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-slate-400 font-medium">Gateway:</span>
                    <span className="font-bold text-slate-800">Razorpay</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-slate-400 font-medium">Razorpay Payment ID:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedPayment.gatewayPaymentId || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-slate-400 font-medium">Razorpay Order ID:</span>
                    <span className="font-mono font-bold text-slate-800 max-w-[200px] truncate">
                      {selectedPayment.gatewayOrderId || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-slate-400 font-medium">Fee Version:</span>
                    <span className="font-bold text-slate-800">v{selectedPayment.feeVersion || 1}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400 font-medium">Completed At:</span>
                    <span className="font-bold text-slate-800">
                      {formatDate(selectedPayment.paidAt || selectedPayment.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Receipt Footer */}
              <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/90 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsReceiptModalOpen(false);
                    setSelectedPayment(null);
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer text-center justify-center"
                >
                  Close Receipt
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RegistrationFeesList;
