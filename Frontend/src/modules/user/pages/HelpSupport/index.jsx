import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  FiArrowLeft, FiSearch, FiMessageCircle, FiMail, FiPhone,
  FiChevronRight, FiHelpCircle, FiBook, FiAlertCircle,
  FiCheckCircle, FiClock, FiSend, FiPlus, FiMessageSquare,
  FiFileText, FiTag, FiRefreshCw, FiX, FiCheck, FiCornerDownLeft
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import api from '../../../../services/api';
import supportService from '../../../../services/supportService';
import { useSocket } from '../../../../context/SocketContext';

const TICKET_CATEGORIES = [
  { id: 'BOOKING', label: 'Booking Issue' },
  { id: 'PAYMENT', label: 'Payment & Billing' },
  { id: 'REFUND', label: 'Refund Inquiry' },
  { id: 'WALLET', label: 'Wallet & Balance' },
  { id: 'WITHDRAWAL', label: 'Payout / Withdrawal' },
  { id: 'WORKER', label: 'Worker / Driver Issue' },
  { id: 'VENDOR', label: 'Vendor / Partner Issue' },
  { id: 'EQUIPMENT', label: 'Machinery / Equipment' },
  { id: 'ACCOUNT', label: 'Account & Profile' },
  { id: 'LOGIN', label: 'Login & Verification' },
  { id: 'RATING', label: 'Rating & Reviews' },
  { id: 'TECHNICAL_ISSUE', label: 'App / Technical Bug' },
  { id: 'OTHER', label: 'Other Inquiries' }
];

const HelpSupport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const socket = useSocket();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categories, setCategories] = useState([]);

  // Configurable Support Contacts from Settings
  const [supportInfo, setSupportInfo] = useState({
    email: 'agroyilt@gmail.com',
    phone: '+91 91177 04450',
    whatsapp: '+91 91177 04450'
  });

  // Ticket System State
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketPagination, setTicketPagination] = useState({ total: 0, totalPages: 1 });

  // Create Request Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'BOOKING',
    description: '',
    bookingNumber: '',
    transactionId: ''
  });

  // Ticket Details & Conversation Modal State
  const [activeTicket, setActiveTicket] = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [showReopenInput, setShowReopenInput] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeMessages]);

  // Load support configuration and FAQs
  useEffect(() => {
    const fetchSupportData = async () => {
      try {
        const [configRes, faqRes] = await Promise.all([
          api.get('/public/config').catch(() => null),
          api.get('/content/faq').catch(() => null)
        ]);

        if (configRes?.data?.success && configRes?.data?.settings) {
          const { supportEmail, supportPhone, supportWhatsapp } = configRes.data.settings;
          setSupportInfo({
            email: supportEmail || 'agroyilt@gmail.com',
            phone: supportPhone || '+91 91177 04450',
            whatsapp: supportWhatsapp || '+91 91177 04450'
          });
        }

        if (faqRes?.data?.success && faqRes.data.data) {
          const backendFaqs = faqRes.data.data.filter(faq => faq.category !== 'Owner');
          const grouped = backendFaqs.reduce((acc, curr) => {
            const cat = curr.category || 'General';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push({ q: curr.question, a: curr.answer });
            return acc;
          }, {});

          const newCategories = Object.keys(grouped).map(cat => {
            let icon = FiHelpCircle;
            let color = '#10B981';
            if (cat === 'Farmer') { icon = FiBook; color = '#059669'; }

            return {
              id: cat.toLowerCase(),
              title: cat + ' FAQs',
              icon,
              color,
              questions: grouped[cat]
            };
          });

          if (newCategories.length > 0) {
            setCategories(newCategories);
          }
        }
      } catch (error) {
        console.error('Failed to fetch support data:', error);
      }
    };

    fetchSupportData();
  }, []);

  // Fetch current user's tickets
  const fetchMyTickets = async (page = 1) => {
    try {
      setLoadingTickets(true);
      const res = await supportService.getMyTickets({ page, limit: 10 });
      if (res.success && res.data) {
        setTickets(page === 1 ? res.data.tickets : [...tickets, ...res.data.tickets]);
        if (res.data.pagination) {
          setTicketPagination(res.data.pagination);
          setTicketPage(page);
        }
      }
    } catch (err) {
      console.error('Fetch tickets error:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    fetchMyTickets(1);
  }, []);

  // Deep-link handling: if URL has ?ticketId=..., open that ticket immediately
  useEffect(() => {
    const linkedTicketId = searchParams.get('ticketId');
    if (linkedTicketId) {
      openTicketDetails(linkedTicketId);
    }
  }, [searchParams]);

  // Real-time socket listener for incoming replies on active ticket
  useEffect(() => {
    if (!socket) return;

    const handleTicketReply = (data) => {
      if (activeTicket && (data.ticketId === activeTicket._id || data.ticketNumber === activeTicket.ticketNumber)) {
        if (data.message) {
          setActiveMessages(prev => {
            const exists = prev.some(m => m._id === data.message._id);
            if (exists) return prev;
            return [...prev, data.message];
          });
        }
        if (data.status) {
          setActiveTicket(prev => prev ? { ...prev, status: data.status } : null);
        }
      }
      // Refresh tickets list silently
      fetchMyTickets(1);
    };

    socket.on('ticket_reply', handleTicketReply);

    return () => {
      socket.off('ticket_reply', handleTicketReply);
    };
  }, [socket, activeTicket]);

  // Open single ticket conversation modal
  const openTicketDetails = async (ticketIdentifier) => {
    try {
      setLoadingMessages(true);
      setShowReopenInput(false);
      const res = await supportService.getTicketById(ticketIdentifier);
      if (res.success && res.data) {
        setActiveTicket(res.data.ticket);
        setActiveMessages(res.data.messages || []);
        // Reset unread indicator in local state
        setTickets(prev => prev.map(t => (t._id === res.data.ticket._id ? { ...t, unreadUserCount: 0 } : t)));
      } else {
        toastManager.error(res.message || 'Unable to open ticket');
      }
    } catch (err) {
      console.error('Open ticket error:', err);
      toastManager.error('Failed to load conversation');
    } finally {
      setLoadingMessages(false);
    }
  };

  // Submit new ticket
  const handleCreateTicketSubmit = async (e) => {
    e.preventDefault();

    if (!ticketForm.subject.trim()) {
      return toastManager.error('Please enter a subject');
    }
    if (!ticketForm.description.trim()) {
      return toastManager.error('Please describe your issue');
    }

    try {
      setSubmittingTicket(true);
      const res = await supportService.createTicket({
        subject: ticketForm.subject.trim(),
        category: ticketForm.category,
        description: ticketForm.description.trim(),
        bookingNumber: ticketForm.bookingNumber.trim() || undefined,
        transactionId: ticketForm.transactionId.trim() || undefined
      });

      if (res.success && res.data) {
        toastManager.success(`Support ticket #${res.data.ticketNumber} created!`);
        setShowCreateModal(false);
        setTicketForm({
          subject: '',
          category: 'BOOKING',
          description: '',
          bookingNumber: '',
          transactionId: ''
        });
        // Refresh ticket list
        await fetchMyTickets(1);
        // Open the newly created ticket directly
        openTicketDetails(res.data._id);
      } else {
        toastManager.error(res.message || 'Failed to submit request');
      }
    } catch (err) {
      console.error('Submit ticket error:', err);
      toastManager.error(err.response?.data?.message || 'Failed to submit ticket. Please try again.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  // Customer replies to active ticket
  const handleSendReply = async (e) => {
    e?.preventDefault();
    if (!replyText.trim() || !activeTicket) return;

    try {
      setSendingReply(true);
      const res = await supportService.sendMessage(activeTicket._id, {
        message: replyText.trim()
      });

      if (res.success && res.data) {
        setActiveMessages(prev => [...prev, res.data]);
        setReplyText('');
        if (activeTicket.status === 'WAITING_FOR_USER' || activeTicket.status === 'RESOLVED') {
          setActiveTicket(prev => ({ ...prev, status: 'IN_PROGRESS' }));
        }
        fetchMyTickets(1);
      } else {
        toastManager.error(res.message || 'Failed to send message');
      }
    } catch (err) {
      console.error('Send reply error:', err);
      toastManager.error(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSendingReply(false);
    }
  };

  // Reopen resolved/closed ticket
  const handleReopenTicket = async () => {
    if (!reopenReason.trim()) {
      return toastManager.error('Please specify why this issue is not solved');
    }

    try {
      setReopening(true);
      const res = await supportService.reopenTicket(activeTicket._id, {
        reason: reopenReason.trim()
      });

      if (res.success) {
        toastManager.success('Ticket reopened successfully');
        setShowReopenInput(false);
        setReopenReason('');
        openTicketDetails(activeTicket._id);
        fetchMyTickets(1);
      } else {
        toastManager.error(res.message || 'Failed to reopen ticket');
      }
    } catch (err) {
      console.error('Reopen error:', err);
      toastManager.error(err.response?.data?.message || 'Failed to reopen ticket');
    } finally {
      setReopening(false);
    }
  };

  // Contact quick actions
  const quickActions = [
    {
      id: 'chat',
      title: 'WhatsApp Chat',
      subtitle: 'Chat with our support team',
      icon: FiMessageCircle,
      color: '#25D366',
      action: () => {
        if (supportInfo.whatsapp) {
          const cleanNumber = supportInfo.whatsapp.replace(/\D/g, '');
          window.location.href = `whatsapp://send?phone=${cleanNumber}`;
        } else {
          toastManager.info('WhatsApp support is currently unavailable');
        }
      }
    },
    {
      id: 'email',
      title: 'Email Us',
      subtitle: supportInfo.email,
      icon: FiMail,
      color: '#10B981',
      action: () => {
        window.location.href = `mailto:${supportInfo.email}`;
      }
    },
    {
      id: 'call',
      title: 'Call Us',
      subtitle: supportInfo.phone || 'Not Available',
      icon: FiPhone,
      color: '#F59E0B',
      action: () => {
        if (supportInfo.phone) {
          window.location.href = `tel:${supportInfo.phone.replace(/\D/g, '')}`;
        } else {
          toastManager.info('Phone support is currently unavailable');
        }
      }
    }
  ];

  // Helper for Status Badge styling
  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'OPEN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">OPEN</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wider">IN PROGRESS</span>;
      case 'WAITING_FOR_USER':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200 uppercase tracking-wider">ACTION REQUIRED</span>;
      case 'WAITING_FOR_ADMIN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-sky-100 text-sky-800 border border-sky-200 uppercase tracking-wider">UNDER REVIEW</span>;
      case 'RESOLVED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">RESOLVED</span>;
      case 'CLOSED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gray-100 text-gray-700 border border-gray-200 uppercase tracking-wider">CLOSED</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gray-100 text-gray-700 uppercase tracking-wider">{s}</span>;
    }
  };

  const filteredQuestions = categories.flatMap(cat =>
    cat.questions.filter(q =>
      searchQuery === '' ||
      q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.a.toLowerCase().includes(searchQuery.toLowerCase())
    ).map(q => ({ ...q, category: cat.title, color: cat.color }))
  );

  return (
    <div className="min-h-screen bg-[#F8FAF9] pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.history.state && window.history.state.idx > 0 ? navigate(-1) : navigate('/user/account')}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
              aria-label="Back"
            >
              <FiArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <h1 className="text-lg font-black text-gray-900 tracking-tight">Help & Support</h1>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
          >
            <FiPlus className="w-3.5 h-3.5" />
            <span>New Ticket</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-3.5">
          <div className="relative">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100 outline-none text-xs font-medium transition-all"
            />
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-6">


        {/* Contact Us Section */}
        <div>
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 pl-1">Direct Support</h2>
          <div className="grid grid-cols-1 gap-2.5">
            {quickActions.map(action => (
              <button
                key={action.id}
                onClick={action.action}
                className="bg-white rounded-2xl p-3.5 shadow-sm hover:shadow-md transition-all active:scale-[0.99] border border-gray-100 flex items-center gap-3.5 w-full text-left"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${action.color}15` }}
                >
                  <action.icon className="w-5 h-5" style={{ color: action.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-xs sm:text-sm">{action.title}</h3>
                  <p className="text-[11px] text-gray-500 truncate">{action.subtitle}</p>
                </div>
                <FiChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Submit a Request Big Button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-4 font-black shadow-lg shadow-emerald-700/20 hover:shadow-xl active:scale-98 transition-all flex items-center justify-center gap-2 text-sm"
        >
          <FiSend className="w-4 h-4" />
          <span>Submit a Support Request</span>
        </button>

        {/* My Support Requests (Ticket System) */}
        <div>
          <div className="flex items-center justify-between mb-3 pl-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">My Support Requests</h2>
              {tickets.some(t => (t.unreadUserCount || 0) > 0) && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>
            <button
              onClick={() => fetchMyTickets(1)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Refresh"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${loadingTickets ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingTickets && tickets.length === 0 ? (
            <div className="bg-white rounded-3xl p-6 text-center shadow-sm border border-gray-100 py-10">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-gray-500">Checking your support requests...</p>
            </div>
          ) : tickets.length > 0 ? (
            <div className="space-y-3">
              {tickets.map(ticket => {
                const hasUnread = (ticket.unreadUserCount || 0) > 0;
                return (
                  <div
                    key={ticket._id}
                    onClick={() => openTicketDetails(ticket._id)}
                    className={`bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all border cursor-pointer active:scale-[0.99] relative overflow-hidden ${
                      hasUnread ? 'border-emerald-300 ring-2 ring-emerald-100 bg-emerald-50/20' : 'border-gray-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                          #{ticket.ticketNumber}
                        </span>
                        {hasUnread && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500 text-white text-[9px] font-black rounded-full animate-bounce">
                            NEW REPLY
                          </span>
                        )}
                      </div>
                      {getStatusBadge(ticket.status)}
                    </div>

                    <h4 className="font-black text-gray-900 text-sm mb-1 leading-snug">
                      {ticket.subject}
                    </h4>

                    {ticket.lastMessage && (
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-3">
                        {ticket.lastMessageSender === 'ADMIN' ? '💬 Support: ' : 'You: '}
                        {ticket.lastMessage}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                      <span className="font-semibold">{ticket.category}</span>
                      <div className="flex items-center gap-1 font-bold text-emerald-700">
                        <span>View Request</span>
                        <FiChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })}

              {ticketPagination.total > tickets.length && (
                <button
                  onClick={() => fetchMyTickets(ticketPage + 1)}
                  disabled={loadingTickets}
                  className="w-full py-2.5 bg-white rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  {loadingTickets ? 'Loading...' : 'Load More Requests'}
                </button>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="bg-white rounded-3xl p-6 text-center shadow-sm border border-dashed border-gray-200 py-10">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3 text-emerald-600">
                <FiMessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-gray-900 mb-1">No support requests yet.</h3>
              <p className="text-xs text-gray-500 max-w-xs mx-auto mb-4 leading-relaxed">
                Need help with your account, booking, payment, or another issue?
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
              >
                Submit a Request
              </button>
            </div>
          )}
        </div>

        {/* FAQs Section */}
        {searchQuery === '' && categories.length > 0 && (
          <div>
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 pl-1">Browse Help Articles</h2>
            <div className="space-y-2.5">
              {categories.map(category => (
                <div
                  key={category.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  <button
                    onClick={() => setSelectedCategory(category.id === selectedCategory ? null : category.id)}
                    className="w-full p-4 flex items-center justify-between text-left active:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${category.color}15` }}
                      >
                        <category.icon className="w-4 h-4" style={{ color: category.color }} />
                      </div>
                      <h3 className="font-bold text-gray-900 text-xs sm:text-sm">{category.title}</h3>
                    </div>
                    <FiChevronRight
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${selectedCategory === category.id ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {/* Expanded Questions */}
                  {selectedCategory === category.id && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                      {category.questions.map((item, idx) => (
                        <div key={idx} className="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                          <div className="flex items-start gap-2 mb-1.5">
                            <FiHelpCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                            <p className="font-bold text-gray-900 text-xs">{item.q}</p>
                          </div>
                          <p className="text-[11px] text-gray-600 pl-5 leading-relaxed">{item.a}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        {searchQuery !== '' && (
          <div>
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 pl-1">
              Search Results ({filteredQuestions.length})
            </h2>
            {filteredQuestions.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-gray-100">
                <FiAlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-700">No matching help articles found.</p>
                <p className="text-[11px] text-gray-400 mt-1 mb-4">Still need help?</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
                >
                  Submit a Request
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredQuestions.map((item, idx) => (
                  <div key={idx} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                      {item.category}
                    </span>
                    <div className="flex items-start gap-2">
                      <FiHelpCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      <p className="font-bold text-gray-900 text-xs">{item.q}</p>
                    </div>
                    <p className="text-[11px] text-gray-600 pl-5 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* CREATE SUPPORT REQUEST MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-base font-black text-gray-900">Submit a Support Request</h2>
                <p className="text-[11px] text-gray-400 font-medium">Our support team will review and reply to you</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateTicketSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Category *
                </label>
                <select
                  value={ticketForm.category}
                  onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                  className="w-full px-3.5 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs font-bold text-gray-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
                >
                  {TICKET_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payment deducted but booking not confirmed"
                  value={ticketForm.subject}
                  onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                  className="w-full px-3.5 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Booking # (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BK12345"
                    value={ticketForm.bookingNumber}
                    onChange={(e) => setTicketForm({ ...ticketForm, bookingNumber: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Transaction ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. pay_XXXXX"
                    value={ticketForm.transactionId}
                    onChange={(e) => setTicketForm({ ...ticketForm, transactionId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Description *
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="Please describe what happened in detail..."
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none resize-none transition-all"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submittingTicket}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-2xl p-4 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submittingTicket ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <FiSend className="w-4 h-4" />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TICKET DETAILS & CONVERSATION MODAL */}
      {activeTicket && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg h-[92vh] sm:h-[85vh] shadow-2xl flex flex-col overflow-hidden">
            {/* Ticket Header */}
            <div className="p-4 bg-white border-b border-gray-100 flex items-start justify-between shrink-0 shadow-sm z-10">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    #{activeTicket.ticketNumber}
                  </span>
                  {getStatusBadge(activeTicket.status)}
                </div>
                <h3 className="font-black text-gray-900 text-sm truncate">{activeTicket.subject}</h3>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold mt-0.5">
                  <span>{activeTicket.category}</span>
                  <span>•</span>
                  <span>{new Date(activeTicket.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {activeTicket.bookingNumber && (
                    <>
                      <span>•</span>
                      <span>Booking #{activeTicket.bookingNumber}</span>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => setActiveTicket(null)}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors shrink-0"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Conversation Messages Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gray-50/60">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : activeMessages.length > 0 ? (
                activeMessages.map((msg, i) => {
                  const isUser = msg.senderType === 'CUSTOMER';
                  const isSystem = msg.senderName === 'System';

                  if (isSystem) {
                    return (
                      <div key={msg._id || i} className="flex justify-center my-2">
                        <span className="px-3 py-1 bg-gray-200/80 text-gray-600 text-[10px] font-bold rounded-full">
                          {msg.message}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg._id || i}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                          {isUser ? 'You' : 'AgroYilt Support'}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div
                        className={`max-w-[85%] rounded-2xl p-3.5 text-xs font-medium leading-relaxed shadow-sm ${
                          isUser
                            ? 'bg-emerald-600 text-white rounded-br-xs'
                            : 'bg-white text-gray-800 border border-gray-200/80 rounded-bl-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 text-gray-400 text-xs">
                  No conversation history found.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Resolved / Closed Status Banner & Reopen Flow */}
            {(activeTicket.status === 'RESOLVED' || activeTicket.status === 'CLOSED') && (
              <div className="p-3 bg-emerald-50 border-t border-emerald-100 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FiCheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-800">
                      This ticket is marked as {activeTicket.status.toLowerCase()}.
                    </span>
                  </div>
                  {!showReopenInput && (
                    <button
                      onClick={() => setShowReopenInput(true)}
                      className="text-xs font-black text-emerald-700 underline hover:text-emerald-900"
                    >
                      Not solved? Reopen
                    </button>
                  )}
                </div>

                {showReopenInput && (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      placeholder="Why is this issue not resolved? (e.g. Payment still pending)"
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowReopenInput(false)}
                        className="px-3 py-1 text-xs font-bold text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReopenTicket}
                        disabled={reopening}
                        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50"
                      >
                        {reopening ? 'Reopening...' : 'Confirm Reopen'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Reply Bar */}
            {activeTicket.status !== 'CLOSED' && (!showReopenInput || activeTicket.status !== 'RESOLVED') && (
              <form onSubmit={handleSendReply} className="p-3 bg-white border-t border-gray-100 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  placeholder="Type your reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="p-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 text-white rounded-2xl shadow-md shadow-emerald-600/20 transition-all shrink-0"
                  aria-label="Send message"
                >
                  <FiSend className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default HelpSupport;
