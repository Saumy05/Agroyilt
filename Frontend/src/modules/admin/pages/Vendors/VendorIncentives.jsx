import React, { useState, useEffect } from 'react';
import {
  FiAward,
  FiSearch,
  FiRefreshCw,
  FiStar,
  FiCheckCircle,
  FiCalendar,
  FiFilter
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import adminWalletService from '../../../../services/adminWalletService';
import AwardIncentiveModal from '../../components/AwardIncentiveModal';

const VendorIncentives = ({ initialRole = 'vendor' }) => {
  const [role, setRole] = useState(initialRole);
  const [period, setPeriod] = useState('All Time');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Update role if initialRole prop changes via route navigation
  useEffect(() => {
    setRole(initialRole);
    setPage(1);
  }, [initialRole]);

  // Modal State
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [showIncentiveModal, setShowIncentiveModal] = useState(false);

  const periods = ['All Time', 'This Month', 'Last Month', 'Last 90 Days'];

  useEffect(() => {
    loadIncentives();
  }, [role, period, page]);

  const loadIncentives = async () => {
    try {
      setLoading(true);
      const res = await adminWalletService.getIncentives({
        role,
        period,
        page,
        limit: 15,
        search: search.trim() || undefined
      });

      if (res.success) {
        setItems(res.data || []);
        if (res.pagination) {
          setTotalPages(res.pagination.pages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to load incentives data:', err);
      toastManager.error('Failed to load performance incentives data');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadIncentives();
  };

  const openIncentive = (item) => {
    setSelectedEntity(item);
    setShowIncentiveModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Performance Incentives & Rewards
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Reward top-performing partners based on completed bookings, ratings, and attendance.
          </p>
        </div>

        {/* Role Switcher */}
        <div className="inline-flex p-1 bg-gray-100 rounded-xl self-start sm:self-auto">
          {[
            { id: 'vendor', label: 'Vendors' },
            { id: 'worker', label: 'Workers' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setRole(tab.id);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                role === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Bar (Period & Search) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${role} by name or phone...`}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-colors"
          />
        </form>

        {/* Period Selector & Refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-700">
            <FiCalendar className="text-gray-500" />
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPage(1);
              }}
              className="bg-transparent font-semibold focus:outline-none cursor-pointer"
            >
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={loadIncentives}
            className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Incentives Table (Matches Screen 2) */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50/80 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
              <tr>
                <th className="py-3.5 px-5 font-semibold">{role.toUpperCase()} INFO</th>
                <th className="py-3.5 px-4 font-semibold">INCENTIVE</th>
                <th className="py-3.5 px-4 font-semibold">DUES</th>
                <th className="py-3.5 px-4 font-semibold">RATING (SELECTED PERIOD)</th>
                <th className="py-3.5 px-4 font-semibold">BOOKINGS (SELECTED PERIOD)</th>
                <th className="py-3.5 px-5 font-semibold text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
                    <div className="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Calculating performance metrics...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
                    No {role} records found for this period.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50/60 transition-colors">
                    {/* Entity Info */}
                    <td className="py-4 px-5">
                      <div>
                        <p className="font-semibold text-gray-900 leading-tight">
                          {item.name || `${role.charAt(0).toUpperCase() + role.slice(1)} ${item.phone}`}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.phone}</p>
                        {item.businessName && (
                          <p className="text-xs text-gray-400">{item.businessName}</p>
                        )}
                      </div>
                    </td>

                    {/* Incentive & Wallet */}
                    <td className="py-4 px-4">
                      <p className="font-bold text-emerald-600">
                        ₹{Number(item.incentive || 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Wallet: ₹{Number(item.walletBalance || 0).toFixed(2)}
                      </p>
                    </td>

                    {/* Dues */}
                    <td className="py-4 px-4 font-semibold text-rose-600">
                      ₹{Number(item.dues || 0).toFixed(2)}
                    </td>

                    {/* Rating */}
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-500 text-sm">
                        <FiStar className="w-4 h-4 fill-amber-400 text-amber-400" />
                        {item.rating || '5.0'}
                      </span>
                    </td>

                    {/* Bookings */}
                    <td className="py-4 px-4 font-medium text-gray-700">
                      {item.completedBookings || '0 Completed'}
                    </td>

                    {/* Action */}
                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => openIncentive(item)}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                      >
                        Incentive
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Award Incentive Modal */}
      {showIncentiveModal && selectedEntity && (
        <AwardIncentiveModal
          isOpen={showIncentiveModal}
          onClose={() => {
            setShowIncentiveModal(false);
            setSelectedEntity(null);
          }}
          entity={selectedEntity}
          role={role}
          period={period}
          onSuccess={() => loadIncentives()}
        />
      )}
    </div>
  );
};

export default VendorIncentives;
