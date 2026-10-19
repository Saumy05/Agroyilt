import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiSearch, FiCalendar, FiDownload, FiMoreVertical,
  FiClock, FiCheckCircle, FiBox, FiTruck, FiXCircle, FiShoppingBag, FiEye, FiCopy, FiRefreshCw
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { adminBookingService } from '../../../../services/adminBookingService';

const BookingStatsCard = ({ title, count, icon: Icon, colorClass, bgClass, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-3 rounded-xl border shadow-sm flex items-center justify-between text-left w-full transition-all active:scale-[0.98] hover:shadow-md ${bgClass} ${active ? 'border-gray-800 ring-2 ring-gray-800/20' : 'border-gray-100'}`}
  >
    <div>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${colorClass.replace('text-', 'bg-').replace('600', '100')}`}>
        <Icon className={`w-4 h-4 ${colorClass}`} />
      </div>
      <h3 className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">{title}</h3>
      <p className="text-xl font-bold text-gray-800 mt-0.5">{count}</p>
    </div>
    <div className={`w-12 h-12 rounded-full opacity-10 -mr-3 -mb-3 ${colorClass.replace('text-', 'bg-')}`}></div>
  </button>
);

// The cards double as the status filter; the groups of real statuses behind each come from the server
const STATUS_CARDS = [
  { key: 'awaiting', title: 'Awaiting', icon: FiClock, bgClass: 'bg-yellow-50', colorClass: 'text-yellow-600' },
  { key: 'confirmed', title: 'Confirmed', icon: FiCheckCircle, bgClass: 'bg-blue-50', colorClass: 'text-blue-600' },
  { key: 'inProgress', title: 'In Progress', icon: FiBox, bgClass: 'bg-purple-50', colorClass: 'text-purple-600' },
  { key: 'completed', title: 'Completed', icon: FiTruck, bgClass: 'bg-green-50', colorClass: 'text-green-600' },
  { key: 'cancelled', title: 'Cancelled', icon: FiXCircle, bgClass: 'bg-red-50', colorClass: 'text-red-600' }
];
const ALL_STATUS = 'All Status';

const Bookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS);
  const [moduleFilter, setModuleFilter] = useState('All Types');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMatching, setTotalMatching] = useState(0);

  // Card counts and the statuses behind each card (from the server)
  const [counts, setCounts] = useState({});
  const [groups, setGroups] = useState({});
  const totalAll = Object.values(counts).reduce((sum, n) => sum + (n || 0), 0);

  // Row action menu
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null); // { booking, top, right }
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  const openMenu = (e, booking) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu(menu?.booking._id === booking._id ? null : { booking, top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };

  const copyId = async (booking) => {
    try {
      await navigator.clipboard.writeText(booking.bookingNumber || booking._id);
      toastManager.success('Booking ID copied');
    } catch {
      toastManager.error('Could not copy');
    }
    setMenu(null);
  };

  const chooseStatus = (key) => {
    setPage(1);
    setStatusFilter(prev => (prev === key ? ALL_STATUS : key));
  };

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Load Data
  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Bookings
      const params = {
        page,
        limit: 10,
        search: debouncedSearch.trim(),
        startDate,
        endDate
      };
      if (statusFilter !== ALL_STATUS && groups[statusFilter]) {
        params.status = groups[statusFilter].join(',');
      }
      
      if (moduleFilter === 'Hourly Rent') params.rental_type = 'hourly';
      if (moduleFilter === 'Monthly Rent') params.rental_type = 'monthly';
      if (moduleFilter === 'Acre Rent') params.rental_type = 'land_based';

      const res = await adminBookingService.getAllBookings(params);
      if (res.success) {
        setBookings(res.data);
        setTotalPages(res.pagination.pages);
        setTotalMatching(res.pagination.total);
        if (res.statusCounts) setCounts(res.statusCounts);
        if (res.statusGroups) setGroups(res.statusGroups);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toastManager.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, debouncedSearch, statusFilter, moduleFilter, startDate, endDate]);

  const handleExport = () => {
    const headers = ['Order ID', 'Farmer', 'Equipment', 'Total', 'Status', 'Date'];
    const rows = bookings.map(b => [
      b.bookingNumber,
      b.userId?.name || 'Unknown',
      b.serviceId?.title || 'Equipment',
      b.finalAmount,
      b.status,
      new Date(b.createdAt).toLocaleDateString()
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "bookings.csv");
    document.body.appendChild(link);
    link.click();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Stats Grid: tap a card to filter the list by it */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUS_CARDS.map(card => (
          <BookingStatsCard
            key={card.key}
            title={card.title}
            count={counts[card.key] ?? 0}
            icon={card.icon}
            bgClass={card.bgClass}
            colorClass={card.colorClass}
            active={statusFilter === card.key}
            onClick={() => chooseStatus(card.key)}
          />
        ))}
        <BookingStatsCard
          title="Total Orders"
          count={totalAll}
          icon={FiShoppingBag}
          bgClass="bg-gray-50"
          colorClass="text-gray-600"
          active={statusFilter === ALL_STATUS}
          onClick={() => { setPage(1); setStatusFilter(ALL_STATUS); }}
        />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-3 justify-between items-center">
        <div className="relative w-full lg:w-80">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search bookings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus:outline-none focus:border-green-500 cursor-pointer"
          >
            <option value={ALL_STATUS}>All Status</option>
            {STATUS_CARDS.map(card => <option key={card.key} value={card.key}>{card.title}</option>)}
          </select>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-blue-600 font-bold focus:outline-none focus:border-blue-500 cursor-pointer shadow-sm"
          >
            <option>All Types</option>
            <option value="Hourly Rent">🚜 Hourly Rent</option>
            <option value="Monthly Rent">📅 Monthly Rent</option>
            <option value="Acre Rent">🌾 Acre Rent</option>
          </select>

          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-[11px] text-gray-600 focus:outline-none w-20"
            />
            <span className="text-gray-400 text-[10px]">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-[11px] text-gray-600 focus:outline-none w-20"
            />
          </div>

          <button
            onClick={fetchData}
            className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm hover:bg-blue-100 transition-colors"
            title="Refresh Data"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm shadow-green-200"
          >
            <FiDownload className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Farmer</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Items</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total (₹)</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Order Date</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-xs text-gray-500">Loading bookings...</td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-xs text-gray-500">No bookings found</td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr key={booking._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/admin/bookings/${booking._id}`}>
                        <span className="font-bold text-blue-600 hover:underline text-xs cursor-pointer">
                          #{booking.bookingNumber || booking._id.slice(-6).toUpperCase()}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-bold text-gray-900 text-xs">{booking.userId?.name || 'Guest'}</p>
                        <p className="text-[10px] text-gray-400">{booking.userId?.phone || booking.customerPhone}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-blue-600 text-[11px] font-bold">
                        {booking.items?.length || 1} items
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-gray-900 text-xs">
                        ₹{Number(booking.finalAmount ?? booking.totalAmount ?? booking.agreedRate ?? booking.basePrice ?? 0).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider
                            ${booking.status === 'completed' ? 'bg-green-100 text-green-700' :
                          booking.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          booking.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                            booking.status === 'in_progress' ? 'bg-purple-100 text-purple-700' :
                              'bg-yellow-100 text-yellow-700'}`}>
                        {booking.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-gray-600 capitalize font-medium">
                        {(booking.paymentMethod || booking.paymentStatus || 'Cash').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-gray-600 font-medium">
                        {new Date(booking.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => openMenu(e, booking)}
                        aria-label="Booking actions"
                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <FiMoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {!loading && bookings.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/30">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Showing {bookings.length} of {totalMatching} entries</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-white transition-all"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-white transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1"
            style={{ top: menu.top, right: menu.right }}
          >
            <button
              type="button"
              onClick={() => navigate(`/admin/bookings/${menu.booking._id}`)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <FiEye className="w-4 h-4 text-blue-500" /> View details
            </button>
            <button
              type="button"
              onClick={() => copyId(menu.booking)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <FiCopy className="w-4 h-4 text-gray-500" /> Copy booking ID
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
};

export default Bookings;
