import React, { useState, useEffect, useRef } from 'react';
import {
  FiHelpCircle, FiSearch, FiFilter, FiCheckCircle,
  FiMessageSquare, FiUser, FiMail, FiPhone, FiClock,
  FiEye, FiSend, FiTag, FiAlertTriangle, FiLock,
  FiRefreshCw, FiChevronRight, FiBriefcase, FiTool, FiX, FiCheck
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import adminSupportService from '../../../../services/adminSupportService';
import Modal from '../../components/Modal';

const TICKET_CATEGORIES = [
  'ALL', 'BOOKING', 'PAYMENT', 'REFUND', 'WALLET', 'WITHDRAWAL',
  'WORKER', 'VENDOR', 'EQUIPMENT', 'ACCOUNT', 'LOGIN', 'RATING',
  'TECHNICAL_ISSUE', 'OTHER'
];

const AdminSupport = () => {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    open: 0,
    in_progress: 0,
    waiting_for_user: 0,
    resolved: 0,
    closed: 0,
    total: 0
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 20 });

  // Detail Modal & Conversation
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Reply state
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchTickets(1);
  }, [statusFilter, roleFilter, categoryFilter, priorityFilter]);

  const fetchTickets = async (targetPage = 1) => {
    try {
      setLoading(true);
      const params = {
        page: targetPage,
        limit: 20,
        status: statusFilter || undefined,
        role: roleFilter || undefined,
        category: categoryFilter || undefined,
        priority: priorityFilter || undefined,
        search: searchTerm.trim() || undefined
      };

      const response = await adminSupportService.getTickets(params);
      if (response && response.success && response.data) {
        setTickets(response.data.tickets || []);
        if (response.data.stats) {
          setStats(response.data.stats);
        }
        if (response.data.pagination) {
          setPagination(response.data.pagination);
          setPage(targetPage);
        }
      } else {
        toastManager.error('Failed to fetch support tickets');
      }
    } catch (error) {
      console.error('Fetch tickets error:', error);
      toastManager.error('Failed to fetch support tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    fetchTickets(1);
  };

  // Open ticket conversation & details
  const handleOpenTicket = async (ticket) => {
    try {
      setSelectedTicket(ticket);
      setIsDetailModalOpen(true);
      setLoadingConversation(true);
      setReplyMessage('');
      setIsInternalNote(false);

      const res = await adminSupportService.getTicketById(ticket._id);
      if (res && res.success && res.data) {
        setSelectedTicket(res.data.ticket);
        setConversation(res.data.messages || []);
      }
    } catch (error) {
      console.error('Load conversation error:', error);
      toastManager.error('Failed to load ticket conversation');
    } finally {
      setLoadingConversation(false);
    }
  };

  useEffect(() => {
    if (isDetailModalOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation, isDetailModalOpen]);

  // Admin reply / internal note submit
  const handleSendAdminReply = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!replyMessage.trim()) {
      return toastManager.error('Please enter a message');
    }

    try {
      setSubmittingReply(true);
      const payload = {
        message: replyMessage.trim(),
        isInternalNote
      };

      const res = await adminSupportService.replyTicket(selectedTicket._id, payload);
      if (res && res.success && res.data) {
        toastManager.success(isInternalNote ? 'Internal note added' : 'Reply sent to customer');
        setConversation(prev => [...prev, res.data]);
        setReplyMessage('');
        setIsInternalNote(false);
        if (res.ticketStatus) {
          setSelectedTicket(prev => prev ? { ...prev, status: res.ticketStatus } : null);
        }
        fetchTickets(page);
      } else {
        toastManager.error(res?.message || 'Failed to send message');
      }
    } catch (error) {
      console.error('Reply error:', error);
      toastManager.error(error.response?.data?.message || 'Failed to send reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Change ticket status directly
  const handleStatusChange = async (newStatus) => {
    if (!selectedTicket || selectedTicket.status === newStatus) return;

    try {
      setUpdatingStatus(true);
      const res = await adminSupportService.updateStatus(selectedTicket._id, newStatus);
      if (res && res.success && res.data) {
        toastManager.success(`Status updated to ${newStatus}`);
        setSelectedTicket(prev => ({ ...prev, status: newStatus }));
        fetchTickets(page);
      } else {
        toastManager.error(res?.message || 'Failed to update status');
      }
    } catch (error) {
      console.error('Status update error:', error);
      toastManager.error('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Change ticket priority directly
  const handlePriorityChange = async (newPriority) => {
    if (!selectedTicket || selectedTicket.priority === newPriority) return;

    try {
      const res = await adminSupportService.updatePriority(selectedTicket._id, newPriority);
      if (res && res.success && res.data) {
        toastManager.success(`Priority updated to ${newPriority}`);
        setSelectedTicket(prev => ({ ...prev, priority: newPriority }));
        fetchTickets(page);
      } else {
        toastManager.error('Failed to update priority');
      }
    } catch (error) {
      console.error('Priority update error:', error);
      toastManager.error('Failed to update priority');
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    const styles = {
      OPEN: 'bg-amber-100 text-amber-800 border-amber-200',
      IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
      WAITING_FOR_USER: 'bg-purple-100 text-purple-800 border-purple-200',
      WAITING_FOR_ADMIN: 'bg-sky-100 text-sky-800 border-sky-200',
      RESOLVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      CLOSED: 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${styles[s] || styles.CLOSED}`}>
        {s.replace(/_/g, ' ')}
      </span>
    );
  };

  const getRoleBadge = (role) => {
    const r = (role || 'USER').toUpperCase();
    const styles = {
      USER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      VENDOR: 'bg-blue-50 text-blue-700 border-blue-200',
      WORKER: 'bg-amber-50 text-amber-700 border-amber-200'
    };
    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider ${styles[r] || styles.USER}`}>
        {r}
      </span>
    );
  };

  const getPriorityBadge = (priority) => {
    const p = (priority || 'MEDIUM').toUpperCase();
    const styles = {
      LOW: 'text-gray-500 bg-gray-50 border-gray-200',
      MEDIUM: 'text-blue-600 bg-blue-50 border-blue-200',
      HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
      URGENT: 'text-red-700 bg-red-100 border-red-200 animate-pulse'
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${styles[p] || styles.MEDIUM}`}>
        {p}
      </span>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Title & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <FiHelpCircle className="text-primary-600" />
            Support Tickets
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
            Manage, resolve, and reply to support requests from Farmers, Vendors, and Workers.
          </p>
        </div>

        <button
          onClick={() => fetchTickets(page)}
          className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl shadow-sm self-start md:self-auto"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Tickets', count: stats.total, color: 'text-gray-900', bg: 'bg-white' },
          { label: 'Open', count: stats.open, color: 'text-amber-700', bg: 'bg-amber-50/50' },
          { label: 'In Progress', count: stats.in_progress, color: 'text-blue-700', bg: 'bg-blue-50/50' },
          { label: 'Action Required', count: stats.waiting_for_user, color: 'text-purple-700', bg: 'bg-purple-50/50' },
          { label: 'Resolved', count: stats.resolved, color: 'text-emerald-700', bg: 'bg-emerald-50/50' },
          { label: 'Closed', count: stats.closed, color: 'text-gray-600', bg: 'bg-gray-50/50' }
        ].map((item, idx) => (
          <div key={idx} className={`p-4 rounded-2xl border border-gray-100 shadow-sm ${item.bg}`}>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{item.label}</span>
            <span className={`text-2xl font-black tracking-tight mt-1 block ${item.color}`}>{item.count || 0}</span>
          </div>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Ticket # (e.g. AGY-2026-...), User Name, Phone, Email, Subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
            />
          </div>
          <button
            type="submit"
            className="w-full md:w-auto px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold shadow-md shadow-primary-200 active:scale-95 transition-all"
          >
            Search
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-gray-100 text-xs">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full p-2 rounded-xl bg-gray-50 border border-gray-200 font-bold text-gray-700 outline-none"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="WAITING_FOR_USER">Waiting for User</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full p-2 rounded-xl bg-gray-50 border border-gray-200 font-bold text-gray-700 outline-none"
          >
            <option value="">All Roles</option>
            <option value="USER">User / Farmer</option>
            <option value="VENDOR">Vendor</option>
            <option value="WORKER">Worker</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full p-2 rounded-xl bg-gray-50 border border-gray-200 font-bold text-gray-700 outline-none"
          >
            <option value="">All Categories</option>
            {TICKET_CATEGORIES.filter(c => c !== 'ALL').map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full p-2 rounded-xl bg-gray-50 border border-gray-200 font-bold text-gray-700 outline-none"
          >
            <option value="">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/70 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="px-5 py-3.5">Ticket #</th>
                <th className="px-5 py-3.5">User</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Category & Subject</th>
                <th className="px-5 py-3.5">Priority</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Last Activity</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-xs">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan="8" className="px-5 py-4 h-16 bg-gray-50/20"></td>
                  </tr>
                ))
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center opacity-40">
                      <FiMessageSquare className="w-12 h-12 mb-2 text-gray-400" />
                      <p className="font-bold text-gray-700">No support tickets found</p>
                      <p className="text-[11px] text-gray-400">Try changing your filters or search keywords.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t._id} className="hover:bg-gray-50/60 transition-colors group">
                    {/* Ticket # */}
                    <td className="px-5 py-4">
                      <span className="font-mono font-black text-primary-700 bg-primary-50 px-2 py-0.5 rounded-md border border-primary-200">
                        #{t.ticketNumber}
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center font-black text-xs shrink-0">
                          {t.name ? t.name[0].toUpperCase() : 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate max-w-[140px]">{t.name}</p>
                          <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{t.phone || t.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-5 py-4">
                      {getRoleBadge(t.createdByRole)}
                    </td>

                    {/* Category & Subject */}
                    <td className="px-5 py-4 max-w-[240px]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">{t.category}</span>
                      <p className="font-bold text-gray-900 line-clamp-1">{t.subject}</p>
                      <p className="text-[11px] text-gray-500 line-clamp-1">{t.lastMessage}</p>
                    </td>

                    {/* Priority */}
                    <td className="px-5 py-4">
                      {getPriorityBadge(t.priority)}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      {getStatusBadge(t.status)}
                    </td>

                    {/* Last Activity */}
                    <td className="px-5 py-4 text-gray-500 font-medium text-[11px]">
                      <div>{new Date(t.lastMessageAt || t.updatedAt).toLocaleDateString()}</div>
                      <div className="text-[10px] text-gray-400">{new Date(t.lastMessageAt || t.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => handleOpenTicket(t)}
                        className="px-3.5 py-1.5 bg-gray-100 hover:bg-primary-600 hover:text-white text-gray-700 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-sm flex items-center gap-1.5 ml-auto"
                      >
                        <FiEye className="w-3.5 h-3.5" />
                        <span>Manage</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-gray-600">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchTickets(page - 1)}
                disabled={page <= 1 || loading}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => fetchTickets(page + 1)}
                disabled={page >= pagination.totalPages || loading}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TICKET DETAIL & REPLY MODAL */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedTicket ? `Ticket #${selectedTicket.ticketNumber}` : 'Ticket Details'}
        size="lg"
      >
        {selectedTicket && (
          <div className="space-y-5">
            {/* Top Metadata Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* User Info */}
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1 text-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">User Details</span>
                <p className="font-black text-gray-900 text-sm">{selectedTicket.name}</p>
                <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                  {getRoleBadge(selectedTicket.createdByRole)}
                  {selectedTicket.phone && (
                    <a
                      href={`tel:${selectedTicket.phone.replace(/[^\d+]/g, '')}`}
                      className="text-primary-700 hover:underline font-mono text-[11px] font-bold flex items-center gap-1"
                      title="Click to call user"
                    >
                      <FiPhone className="w-3 h-3" />
                      {selectedTicket.phone}
                    </a>
                  )}
                </div>
                {selectedTicket.email && <p className="text-gray-400 text-[11px] truncate">{selectedTicket.email}</p>}
              </div>

              {/* Ticket Context */}
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1 text-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Context & Category</span>
                <p className="font-bold text-gray-800">{selectedTicket.category}</p>
                {selectedTicket.bookingNumber && (
                  <p className="text-primary-700 font-bold text-[11px]">Booking: #{selectedTicket.bookingNumber}</p>
                )}
                {selectedTicket.transactionId && (
                  <p className="text-gray-500 font-mono text-[10px] truncate">Txn: {selectedTicket.transactionId}</p>
                )}
                <p className="text-gray-400 text-[10px]">Created: {new Date(selectedTicket.createdAt).toLocaleString()}</p>
              </div>

              {/* Status & Priority Controls */}
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-2 text-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Status & Priority</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500 w-14">Status:</span>
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={updatingStatus}
                    className="flex-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 font-bold text-xs outline-none"
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="WAITING_FOR_USER">Waiting for User</option>
                    <option value="WAITING_FOR_ADMIN">Under Review</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500 w-14">Priority:</span>
                  <select
                    value={selectedTicket.priority}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                    className="flex-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 font-bold text-xs outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Subject Banner & Problem Description */}
            <div className="p-4 bg-primary-50/40 rounded-2xl border border-primary-100/60 space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-primary-700 block">Subject</span>
              <h3 className="font-black text-gray-900 text-sm">{selectedTicket.subject}</h3>
              {selectedTicket.description && (
                <div className="pt-2 border-t border-primary-100/60">
                  <span className="text-[10px] font-bold text-gray-400 block mb-0.5">Customer's Initial Description:</span>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedTicket.description}</p>
                </div>
              )}
            </div>

            {/* Attached Photos / Evidence (if any) */}
            {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-2">
                  Customer Attached Evidence ({selectedTicket.attachments.length})
                </span>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {selectedTicket.attachments.map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 group relative"
                      title="Click to view full photo"
                    >
                      <img
                        src={url}
                        alt={`Evidence ${idx + 1}`}
                        className="w-16 h-16 rounded-xl object-cover border border-gray-200 shadow-xs group-hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Thread */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4 max-h-[360px] overflow-y-auto space-y-3">
              {loadingConversation ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : conversation.length > 0 ? (
                conversation.map((msg, i) => {
                  const isCustomer = msg.senderType === 'CUSTOMER';
                  const isInternal = msg.isInternalNote || msg.senderType === 'INTERNAL_NOTE';
                  const isSystem = msg.senderName === 'System';

                  if (isSystem) {
                    return (
                      <div key={msg._id || i} className="flex justify-center my-1.5">
                        <span className="px-3 py-0.5 bg-gray-200 text-gray-600 text-[10px] font-bold rounded-full">
                          {msg.message}
                        </span>
                      </div>
                    );
                  }

                  if (isInternal) {
                    return (
                      <div key={msg._id || i} className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200/80 my-2 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-900">
                          <span className="flex items-center gap-1.5">
                            <FiLock className="w-3 h-3 text-amber-700" />
                            Internal Note (Hidden from customer)
                          </span>
                          <span className="text-amber-700/80 font-mono">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-amber-950 font-medium whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg._id || i}
                      className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                          {isCustomer ? `${selectedTicket.name} (${selectedTicket.createdByRole})` : 'AgroYilt Support'}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl p-3.5 text-xs font-medium shadow-sm leading-relaxed ${
                          isCustomer
                            ? 'bg-white text-gray-800 border border-gray-200 rounded-bl-xs'
                            : 'bg-primary-600 text-white rounded-br-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-xs text-gray-400">No conversation history found.</div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Admin Reply Form - Clean, Simple & Fast */}
            <form onSubmit={handleSendAdminReply} className="pt-1">
              <div className={`rounded-2xl border transition-all overflow-hidden ${
                isInternalNote
                  ? 'border-amber-300 bg-amber-50/40 ring-2 ring-amber-100'
                  : 'border-gray-200 bg-white focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100'
              }`}>
                <textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (replyMessage.trim() && !submittingReply) {
                        handleSendAdminReply(e);
                      }
                    }
                  }}
                  rows={2}
                  placeholder={
                    isInternalNote
                      ? "Write an internal note (only visible to admins)... [Press Enter to send]"
                      : "Type your reply... [Press Enter to send]"
                  }
                  className="w-full bg-transparent px-3.5 pt-3 pb-2 text-xs font-medium text-gray-800 outline-none resize-none placeholder:text-gray-400"
                />

                <div className="flex items-center justify-between px-3 py-2 bg-gray-50/70 border-t border-gray-100">
                  <label className="flex items-center gap-1.5 cursor-pointer text-gray-500 hover:text-gray-700 select-none">
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 border-gray-300 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold flex items-center gap-1">
                      <FiLock className="w-3 h-3 text-gray-400" />
                      Internal note only
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={submittingReply || !replyMessage.trim()}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow-sm ${
                      isInternalNote
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-primary-600 hover:bg-primary-700'
                    }`}
                  >
                    {submittingReply ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Send</span>
                        <FiSend className="w-3 h-3" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminSupport;
