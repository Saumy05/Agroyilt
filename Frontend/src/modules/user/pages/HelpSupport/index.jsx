import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  FiArrowLeft, FiSearch, FiMessageCircle, FiMail, FiPhone,
  FiChevronRight, FiHelpCircle, FiBook, FiAlertCircle,
  FiCheckCircle, FiClock, FiSend, FiPlus, FiMessageSquare,
  FiFileText, FiTag, FiRefreshCw, FiX, FiCheck, FiCornerDownLeft,
  FiCamera, FiPaperclip, FiShield, FiTrash2
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import api from '../../../../services/api';
import supportService from '../../../../services/supportService';
import { bookingService } from '../../../../services/bookingService';
import workerBookingService from '../../../../services/workerBookingService';
import { uploadToCloudinary } from '../../../../utils/cloudinaryUpload';
import { useSocket } from '../../../../context/SocketContext';

const TICKET_CATEGORIES = [
  { id: 'BOOKING', label: 'Booking Issue' },
  { id: 'PAYMENT', label: 'Payment & Billing' },
  { id: 'REFUND', label: 'Refund Inquiry' },
  { id: 'WALLET', label: 'Wallet & Balance' },
  { id: 'WITHDRAWAL', label: 'Payout / Withdrawal' },
  { id: 'WORKER', label: 'Worker Issue' },
  { id: 'VENDOR', label: 'Vendor / Partner Issue' },
  { id: 'EQUIPMENT', label: 'Machinery / Equipment' },
  { id: 'ACCOUNT', label: 'Account & Profile' },
  { id: 'LOGIN', label: 'Login & Verification' },
  { id: 'RATING', label: 'Rating & Reviews' },
  { id: 'TECHNICAL_ISSUE', label: 'App / Technical Bug' },
  { id: 'OTHER', label: 'Other Inquiries' }
];

// Common issue templates per category for 1-tap filling
const QUICK_ISSUES = {
  BOOKING: [
    { label: '🚜 Vendor Late / No Show', subject: 'Vendor did not arrive for scheduled booking', desc: 'The vendor has not arrived at the scheduled time and has not responded. Please assist immediately.' },
    { label: '🛑 Work Incomplete', subject: 'Field work left incomplete by operator', desc: 'The operator left without completing the agreed farm work. Need review and settlement adjustment.' },
    { label: '💵 Extra Cash Demanded', subject: 'Vendor demanded more cash than bill amount', desc: 'The vendor asked for additional cash above the agreed platform bill. Please investigate.' },
    { label: '⚙️ Machine Breakdown', subject: 'Machinery broke down during field operation', desc: 'The machine had a mechanical breakdown during work. Need replacement or partial refund.' },
    { label: '❌ Reschedule Booking', subject: 'Need to reschedule my booking slot', desc: 'I need to change the date/time of my scheduled booking. Please assist.' }
  ],
  EQUIPMENT: [
    { label: '⚙️ Machine Breakdown', subject: 'Machinery broke down on field', desc: 'The equipment stopped working during operation. Please coordinate with vendor.' },
    { label: '🚜 Wrong Equipment Sent', subject: 'Received incorrect equipment model', desc: 'The delivered machinery does not match the model booked on the app.' },
    { label: '⏱️ Hourly Meter Discrepancy', subject: 'Hour meter reading dispute with operator', desc: 'Discrepancy in recorded hours vs actual work time. Need verification.' }
  ],
  WORKER: [
    { label: '👨‍🌾 Workers Did Not Report', subject: 'Hired workers did not report on time', desc: 'The assigned workers have not arrived at the field. Please contact them or arrange alternatives.' },
    { label: '⏱️ Workers Left Early', subject: 'Workers left before completing daily shift', desc: 'Workers left prior to completing agreed hours. Need wage calculation adjustment.' },
    { label: '💵 Wage Dispute', subject: 'Cash wage / payment discrepancy with workers', desc: 'Dispute regarding wages or extra amount demanded. Please mediate.' },
    { label: '⚠️ Conduct / Quality Issue', subject: 'Poor work quality / conduct issue', desc: 'Workers did not perform work properly or behaved inappropriately.' }
  ],
  PAYMENT: [
    { label: '💳 Money Deducted, No Confirmation', subject: 'Amount deducted from bank but booking pending', desc: 'Bank account was debited but the booking is still pending/failed. Please verify transaction.' },
    { label: '💰 Refund Not Credited', subject: 'Refund amount not received in account', desc: 'Cancelled booking refund has not reflected in bank account within promised time.' },
    { label: '🧾 Charged Twice', subject: 'Duplicate charge for single booking', desc: 'My account was charged twice for the same booking. Please reverse the duplicate payment.' }
  ],
  WALLET: [
    { label: '👛 Wallet Balance Mismatch', subject: 'Incorrect wallet balance after transaction', desc: 'My wallet balance does not match recent transactions. Please check history.' },
    { label: '🏦 Payout / Withdrawal Delay', subject: 'Withdrawal to bank account delayed', desc: 'Requested withdrawal has not arrived in bank account. Please verify status.' }
  ],
  OTHER: [
    { label: '📱 App Crash / Technical Bug', subject: 'Technical bug encountered in application', desc: 'Encountered an issue or error screen in the app. Details below:' },
    { label: '📞 Request Priority Callback', subject: 'Need urgent callback from Agroyilt manager', desc: 'Please arrange a phone call with the operations team as soon as possible.' }
  ]
};

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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'BOOKING',
    description: '',
    bookingNumber: '',
    bookingId: '',
    transactionId: '',
    attachments: []
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

  // Fetch user's recent orders to support 1-tap booking selection
  const fetchRecentOrders = useCallback(async () => {
    try {
      setLoadingOrders(true);
      const [bookingsRes, requestsRes] = await Promise.all([
        bookingService.getUserBookings({ limit: 8 }).catch(() => null),
        workerBookingService.getMyFarmerRequests({ limit: 8 }).catch(() => null)
      ]);

      const items = [];
      if (bookingsRes?.success && Array.isArray(bookingsRes.data)) {
        bookingsRes.data.forEach(b => {
          items.push({
            id: b._id || b.id,
            number: b.bookingNumber || (b._id || b.id).substring(0, 8),
            title: b.serviceName || b.serviceCategory || 'Equipment Booking',
            date: b.scheduledDate || b.createdAt,
            category: 'BOOKING'
          });
        });
      }
      if (requestsRes?.success && Array.isArray(requestsRes.data)) {
        requestsRes.data.forEach(r => {
          items.push({
            id: r._id,
            number: r.bookingNumber || String(r._id).substring(0, 8),
            title: r.workTitle || `Workers (${r.workCategory || 'Farm'})`,
            date: r.startDate || r.scheduledDate || r.createdAt,
            category: 'WORKER'
          });
        });
      }

      setRecentOrders(items);
    } catch (err) {
      console.warn('Could not load recent orders for support form', err);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentOrders();
  }, [fetchRecentOrders]);

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

  // Deep-link handling:
  // 1. If ?ticketId=..., open that ticket immediately
  // 2. If ?bookingNumber=... or ?openCreate=true, pre-fill form and open modal
  useEffect(() => {
    const linkedTicketId = searchParams.get('ticketId');
    if (linkedTicketId) {
      openTicketDetails(linkedTicketId);
    }

    const bNum = searchParams.get('bookingNumber');
    const bId = searchParams.get('bookingId');
    const cat = searchParams.get('category');
    const sub = searchParams.get('subject');
    const openCreate = searchParams.get('openCreate');

    if (bNum || bId || cat || sub || openCreate === 'true') {
      setTicketForm(prev => ({
        ...prev,
        bookingNumber: bNum || prev.bookingNumber,
        bookingId: bId || prev.bookingId,
        category: cat && TICKET_CATEGORIES.some(c => c.id === cat) ? cat : prev.category,
        subject: sub ? decodeURIComponent(sub) : prev.subject
      }));
      setShowCreateModal(true);
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
        bookingId: ticketForm.bookingId || undefined,
        bookingNumber: ticketForm.bookingNumber.trim() || undefined,
        transactionId: ticketForm.transactionId.trim() || undefined,
        attachments: ticketForm.attachments || []
      });

      if (res.success && res.data) {
        toastManager.success(`Support ticket #${res.data.ticketNumber} created!`);
        setShowCreateModal(false);
        setTicketForm({
          subject: '',
          category: 'BOOKING',
          description: '',
          bookingNumber: '',
          bookingId: '',
          transactionId: '',
          attachments: []
        });
        // Refresh ticket list
        await fetchMyTickets(1);
      } else {
        toastManager.error(res.message || 'Failed to submit ticket');
      }
    } catch (err) {
      console.error('Create ticket error:', err);
      toastManager.error('Failed to submit ticket. Please check your connection.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  // Handle uploading photos/screenshots
  const handleAttachmentUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if ((ticketForm.attachments?.length || 0) + files.length > 3) {
      return toastManager.error('Maximum 3 photos allowed');
    }

    try {
      setUploadingImage(true);
      const newUrls = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          toastManager.error(`${file.name} is not an image`);
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          toastManager.error(`${file.name} exceeds 5MB limit`);
          continue;
        }
        const url = await uploadToCloudinary(file, 'support-tickets');
        if (url) newUrls.push(url);
      }

      setTicketForm(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...newUrls]
      }));
      if (newUrls.length > 0) {
        toastManager.success('Photo attached');
      }
    } catch (err) {
      console.error('Attachment upload error:', err);
      toastManager.error('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
      if (e.target) e.target.value = '';
    }
  };

  const removeAttachment = (indexToRemove) => {
    setTicketForm(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter((_, idx) => idx !== indexToRemove)
    }));
  };

  // Send message reply inside existing ticket
  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !activeTicket) return;

    try {
      setSendingReply(true);
      const res = await supportService.sendMessage(activeTicket._id, {
        message: replyText.trim()
      });

      if (res.success && res.data) {
        setActiveMessages(prev => [...prev, res.data.message]);
        setReplyText('');
        scrollToBottom();
      } else {
        toastManager.error(res.message || 'Failed to send message');
      }
    } catch (err) {
      console.error('Send message error:', err);
      toastManager.error('Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  // Reopen resolved ticket
  const handleReopenTicket = async () => {
    if (!reopenReason.trim() || !activeTicket) {
      return toastManager.error('Please specify a reason to reopen');
    }

    try {
      setReopening(true);
      const res = await supportService.reopenTicket(activeTicket._id, {
        reason: reopenReason.trim()
      });

      if (res.success && res.data) {
        toastManager.success('Ticket reopened');
        setActiveTicket(res.data.ticket);
        setActiveMessages(res.data.messages || []);
        setShowReopenInput(false);
        setReopenReason('');
        await fetchMyTickets(1);
      } else {
        toastManager.error(res.message || 'Failed to reopen ticket');
      }
    } catch (err) {
      console.error('Reopen ticket error:', err);
      toastManager.error('Failed to reopen ticket');
    } finally {
      setReopening(false);
    }
  };

  // Helper for Status Badge styling
  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">Open</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">In Progress</span>;
      case 'WAITING_FOR_USER':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">Action Required</span>;
      case 'WAITING_FOR_ADMIN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">Under Review</span>;
      case 'RESOLVED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">Resolved</span>;
      case 'CLOSED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200">Closed</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-50 text-gray-600">{status}</span>;
    }
  };

  // Direct contact channels with dynamic WhatsApp context
  const quickActions = [
    {
      id: 'whatsapp',
      title: 'WhatsApp Support',
      subtitle: 'Fastest response • Hindi & English',
      icon: FiMessageCircle,
      color: '#25D366',
      action: () => {
        const phone = supportInfo.whatsapp.replace(/[^0-9]/g, '');
        const bText = ticketForm.bookingNumber ? ` regarding Booking #${ticketForm.bookingNumber}` : '';
        const msg = encodeURIComponent(`Namaste Agroyilt Support, I need help${bText}.`);
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
      }
    },
    {
      id: 'call',
      title: 'Call Help Center',
      subtitle: supportInfo.phone,
      icon: FiPhone,
      color: '#3B82F6',
      action: () => {
        const link = document.createElement('a');
        link.href = `tel:${supportInfo.phone.replace(/[^\d+]/g, '')}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    {
      id: 'email',
      title: 'Email Support',
      subtitle: supportInfo.email,
      icon: FiMail,
      color: '#8B5CF6',
      action: () => {
        const link = document.createElement('a');
        link.href = `mailto:${supportInfo.email}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      {/* Sticky Header */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-gray-100 shadow-xs">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
              aria-label="Go back"
            >
              <FiArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-base font-bold text-gray-900 tracking-tight">Help & Support</h1>
              <p className="text-[11px] text-gray-500 font-medium">Customer assistance & complaints</p>
            </div>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search help topics, FAQs, tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200/80 rounded-xl text-xs font-medium placeholder-gray-400 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all outline-none"
            />
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-5">
        {/* Support Desk Status & SLA Banner */}
        <div className="bg-gradient-to-br from-emerald-800 to-teal-900 rounded-2xl p-4 text-white shadow-sm border border-emerald-700/40 relative overflow-hidden">
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">
                  Support Desk Active
                </span>
              </div>
              <h2 className="text-sm font-black text-white">We're here to assist you</h2>
              <p className="text-xs text-emerald-100/90 mt-0.5 leading-snug">
                Typical response within <span className="font-bold text-white">15–30 mins</span> • 8:00 AM to 8:00 PM
              </p>
            </div>
            <div className="px-2.5 py-1 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15 text-[10px] font-bold text-emerald-100 shrink-0">
              ⚡ Fast Resolution
            </div>
          </div>

          <div className="relative z-10 mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-200">
                <FiShield className="w-3.5 h-3.5 text-emerald-300" /> Farmer Protection
              </span>
              <span className="flex items-center gap-1 text-emerald-200">
                <FiClock className="w-3.5 h-3.5 text-emerald-300" /> Daily Support
              </span>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1 bg-white text-emerald-950 font-black rounded-lg text-xs hover:bg-emerald-50 active:scale-95 transition-all shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <span>+ New Request</span>
            </button>
          </div>
        </div>

        {/* Contact Us Direct Support Section */}
        <div>
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2.5 pl-1">Direct Support Channels</h2>
          <div className="grid grid-cols-1 gap-2">
            {quickActions.map(action => (
              <button
                key={action.id}
                onClick={action.action}
                className="bg-white rounded-xl p-3 shadow-xs hover:shadow-sm transition-all active:scale-[0.99] border border-gray-100 flex items-center gap-3 w-full text-left"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${action.color}15` }}
                >
                  <action.icon className="w-4 h-4" style={{ color: action.color }} />
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
          className="w-full bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl p-3.5 font-bold shadow-sm active:scale-98 transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
        >
          <FiSend className="w-4 h-4" />
          <span>Submit a Support Request / Complaint</span>
        </button>

        {/* My Support Requests (Ticket System) */}
        <div>
          <div className="flex items-center justify-between mb-2.5 pl-1">
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
            <div className="bg-white rounded-2xl p-6 text-center shadow-xs border border-gray-100 py-8">
              <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-gray-500">Checking your support requests...</p>
            </div>
          ) : tickets.length > 0 ? (
            <div className="space-y-2.5">
              {tickets.map(ticket => {
                const hasUnread = (ticket.unreadUserCount || 0) > 0;
                return (
                  <div
                    key={ticket._id}
                    onClick={() => openTicketDetails(ticket._id)}
                    className={`bg-white rounded-xl p-3.5 shadow-xs hover:shadow-sm transition-all border cursor-pointer active:scale-[0.99] relative overflow-hidden ${
                      hasUnread ? 'border-emerald-300 ring-2 ring-emerald-100 bg-emerald-50/20' : 'border-gray-200/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                          #{ticket.ticketNumber}
                        </span>
                        {hasUnread && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500 text-white text-[9px] font-black rounded-full animate-pulse">
                            NEW REPLY
                          </span>
                        )}
                      </div>
                      {getStatusBadge(ticket.status)}
                    </div>

                    <h4 className="font-bold text-gray-900 text-xs sm:text-sm mb-1 leading-snug">
                      {ticket.subject}
                    </h4>

                    {ticket.lastMessage && (
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-2.5">
                        {ticket.lastMessageSender === 'ADMIN' ? '💬 Support: ' : 'You: '}
                        {ticket.lastMessage}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                      <span className="font-medium">
                        {ticket.category}
                        {ticket.bookingNumber ? ` • #${ticket.bookingNumber}` : ''}
                      </span>
                      <div className="flex items-center gap-1 font-bold text-emerald-700">
                        <span>View thread</span>
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
                  className="w-full py-2 bg-white rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-xs"
                >
                  {loadingTickets ? 'Loading...' : 'Load More Requests'}
                </button>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="bg-white rounded-2xl p-6 text-center shadow-xs border border-dashed border-gray-200 py-8">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2 text-emerald-600">
                <FiMessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-gray-900 font-bold text-xs sm:text-sm mb-1">No Support Requests Yet</h3>
              <p className="text-[11px] text-gray-500 max-w-xs mx-auto mb-3">
                Need help with a booking or payment? Submit a request and our team will resolve it.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition-colors"
              >
                + Submit First Request
              </button>
            </div>
          )}
        </div>

        {/* FAQs Section */}
        {categories.length > 0 && (
          <div>
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2.5 pl-1">Frequently Asked Questions</h2>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                    selectedCategory === cat.id
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
                      : 'bg-white border-gray-200/80 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <cat.icon className="w-4 h-4 shrink-0" style={{ color: cat.color }} />
                  <span className="text-xs font-bold truncate">{cat.title}</span>
                </button>
              ))}
            </div>

            {selectedCategory && (
              <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 space-y-3">
                {categories.find(c => c.id === selectedCategory)?.questions.map((item, idx) => (
                  <div key={idx} className="border-b border-gray-100 last:border-0 pb-2.5 last:pb-0">
                    <h4 className="text-xs font-bold text-gray-800 mb-1 flex items-start gap-1.5">
                      <span className="text-emerald-600 font-black">Q.</span>
                      <span>{item.q}</span>
                    </h4>
                    <p className="text-[11px] text-gray-600 pl-4 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* CREATE SUPPORT REQUEST MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3.5 flex items-center justify-between z-10">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-gray-900">Submit a Support Request</h2>
                <p className="text-[11px] text-gray-400 font-medium">Fast review by Agroyilt operations team</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateTicketSubmit} className="p-4 space-y-3.5">
              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Category *
                </label>
                <select
                  value={ticketForm.category}
                  onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-bold text-gray-900 focus:bg-white focus:border-emerald-600 outline-none transition-all"
                >
                  {TICKET_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* 1-Tap Quick Issue Chips */}
              {QUICK_ISSUES[ticketForm.category] && (
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1 flex items-center justify-between">
                    <span>Common issues (tap to auto-fill)</span>
                    <span className="text-[10px] text-emerald-700 font-bold">⚡ 1-Tap</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_ISSUES[ticketForm.category].map((issue, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setTicketForm(prev => ({
                            ...prev,
                            subject: issue.subject,
                            description: issue.desc
                          }));
                        }}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/70 active:scale-95 transition-all text-left"
                      >
                        {issue.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Booking Quick Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Related Booking / Order</span>
                  {ticketForm.bookingNumber && (
                    <button
                      type="button"
                      onClick={() => setTicketForm(prev => ({ ...prev, bookingNumber: '', bookingId: '' }))}
                      className="text-[10px] font-bold text-rose-500 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </label>

                {recentOrders.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] text-gray-400 mb-1">Select from your recent bookings:</p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      {recentOrders.map(order => {
                        const isSelected = ticketForm.bookingNumber === order.number || ticketForm.bookingId === order.id;
                        return (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => {
                              setTicketForm(prev => ({
                                ...prev,
                                bookingNumber: order.number,
                                bookingId: order.id,
                                category: order.category || prev.category
                              }));
                            }}
                            className={`shrink-0 px-2.5 py-1.5 rounded-lg text-left border transition-all ${
                              isSelected
                                ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                                : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                            }`}
                          >
                            <div className="text-[11px] font-bold truncate max-w-[130px]">{order.title}</div>
                            <div className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>#{order.number}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Booking # (Optional)"
                    value={ticketForm.bookingNumber}
                    onChange={(e) => setTicketForm({ ...ticketForm, bookingNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Transaction ID (Optional)"
                    value={ticketForm.transactionId}
                    onChange={(e) => setTicketForm({ ...ticketForm, transactionId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 outline-none"
                  />
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vendor did not arrive at farm"
                  value={ticketForm.subject}
                  onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 outline-none transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Description *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Please describe what happened..."
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                  className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 outline-none resize-none transition-all"
                />
              </div>

              {/* Attach Photos / Evidence */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Photo / Screenshot (Optional)</span>
                  <span className="text-[10px] text-gray-400">Max 3</span>
                </label>

                {ticketForm.attachments && ticketForm.attachments.length > 0 && (
                  <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                    {ticketForm.attachments.map((url, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-200 shrink-0">
                        <img src={url} alt={`Upload ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 text-white rounded-full flex items-center justify-center text-[9px] hover:bg-red-600 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {(!ticketForm.attachments || ticketForm.attachments.length < 3) && (
                  <label className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-gray-300 hover:border-emerald-600 bg-gray-50 hover:bg-emerald-50/40 cursor-pointer transition-all text-xs font-bold text-gray-600">
                    {uploadingImage ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                        <span>Uploading photo...</span>
                      </>
                    ) : (
                      <>
                        <FiCamera className="w-4 h-4 text-emerald-600" />
                        <span>Attach photo or screenshot</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingImage}
                      onChange={handleAttachmentUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Submit Button & SLA Guarantee */}
              <div className="pt-1">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-2">
                  <FiClock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Expected response within 15–30 minutes</span>
                </div>
                <button
                  type="submit"
                  disabled={submittingTicket || uploadingImage}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white rounded-xl py-3 font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {submittingTicket ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting Request...</span>
                    </>
                  ) : (
                    <>
                      <FiSend className="w-4 h-4" />
                      <span>Submit Support Request</span>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg h-[92vh] sm:h-[85vh] shadow-2xl flex flex-col overflow-hidden">
            {/* Ticket Header */}
            <div className="p-3.5 bg-white border-b border-gray-100 flex items-start justify-between shrink-0 shadow-xs z-10">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    #{activeTicket.ticketNumber}
                  </span>
                  {getStatusBadge(activeTicket.status)}
                </div>
                <h3 className="font-bold text-gray-900 text-xs sm:text-sm truncate">{activeTicket.subject}</h3>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium mt-0.5">
                  <span>{activeTicket.category}</span>
                  <span>•</span>
                  <span>{new Date(activeTicket.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
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
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors shrink-0"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Conversation Messages Thread */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-gray-50/60">
              {/* Initial description card */}
              <div className="bg-white rounded-xl p-3 border border-gray-200/80 shadow-xs">
                <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold mb-1">
                  <span>Initial Issue Details</span>
                  <span>{new Date(activeTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{activeTicket.description}</p>
                
                {/* Initial attachments */}
                {activeTicket.attachments && activeTicket.attachments.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <FiPaperclip className="w-3 h-3" /> Attached Photos ({activeTicket.attachments.length})
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {activeTicket.attachments.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <img src={url} alt={`Attachment ${i + 1}`} className="w-14 h-14 rounded-lg object-cover border border-gray-200 shadow-xs hover:opacity-90 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : activeMessages.length > 0 ? (
                activeMessages.map((msg, i) => {
                  const isUser = msg.senderType === 'CUSTOMER';
                  const isSystem = msg.senderName === 'System';

                  if (isSystem) {
                    return (
                      <div key={msg._id || i} className="flex justify-center my-1.5">
                        <span className="px-2.5 py-0.5 bg-gray-200 text-gray-600 text-[10px] font-bold rounded-full">
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
                      <div className="flex items-center gap-1 mb-1 px-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          {isUser ? 'You' : 'Agroyilt Support'}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div
                        className={`max-w-[85%] rounded-2xl p-3 text-xs font-medium leading-relaxed shadow-xs ${
                          isUser
                            ? 'bg-emerald-700 text-white rounded-br-xs'
                            : 'bg-white text-gray-800 border border-gray-200/80 rounded-bl-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    </div>
                  );
                })
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Resolved / Closed Status Banner & Reopen Flow */}
            {(activeTicket.status === 'RESOLVED' || activeTicket.status === 'CLOSED') && (
              <div className="p-3 bg-emerald-50 border-t border-emerald-100 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FiCheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-900">
                      Issue marked as {activeTicket.status.toLowerCase()}.
                    </span>
                  </div>
                  {!showReopenInput && (
                    <button
                      onClick={() => setShowReopenInput(true)}
                      className="text-xs font-bold text-emerald-700 underline hover:text-emerald-900 cursor-pointer"
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
                      className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowReopenInput(false)}
                        className="px-2.5 py-1 text-xs font-bold text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReopenTicket}
                        disabled={reopening}
                        className="px-3 py-1 bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
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
              <form onSubmit={handleSendReply} className="p-2.5 bg-white border-t border-gray-100 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  placeholder="Type your message to support..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-900 focus:bg-white focus:border-emerald-600 outline-none transition-all"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="p-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 disabled:opacity-40 text-white rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
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
