import React, { useState, useEffect } from 'react';
import {
  FiDollarSign,
  FiSearch,
  FiRefreshCw,
  FiAlertCircle,
  FiPlus,
  FiAward,
  FiArrowUpRight,
  FiArrowDownRight,
  FiUsers,
  FiBriefcase
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import adminWalletService from '../../../../services/adminWalletService';
import AdjustWalletModal from '../../components/AdjustWalletModal';
import AwardIncentiveModal from '../../components/AwardIncentiveModal';

const VendorWallets = ({ initialRole = 'vendor' }) => {
  const [role, setRole] = useState(initialRole);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDue, setFilterDue] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({ totalDuesSum: 0, totalBalancesSum: 0, totalCount: 0 });

  // Modal states
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showIncentiveModal, setShowIncentiveModal] = useState(false);

  useEffect(() => {
    loadWallets();
  }, [role, page, filterDue]);

  const loadWallets = async () => {
    try {
      setLoading(true);
      const res = await adminWalletService.getWallets({
        role,
        page,
        limit: 15,
        search: search.trim() || undefined,
        filterDue: filterDue ? 'true' : 'false'
      });

      if (res.success) {
        setWallets(res.data || []);
        setSummary(res.summary || { totalDuesSum: 0, totalBalancesSum: 0, totalCount: 0 });
        if (res.pagination) {
          setTotalPages(res.pagination.pages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to load wallets:', err);
      toastManager.error('Failed to load wallet balances');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadWallets();
  };

  const openAdjust = (entity) => {
    setSelectedEntity(entity);
    setShowAdjustModal(true);
  };

  const openIncentive = (entity) => {
    setSelectedEntity(entity);
    setShowIncentiveModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Role Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Wallet Management & Adjustments
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage live balances, credits, COD dues, and manual overrides across partners.
          </p>
        </div>

        {/* Role Pills */}
        <div className="inline-flex p-1 bg-gray-100 rounded-xl self-start sm:self-auto">
          {[
            { id: 'vendor', label: 'Vendors' },
            { id: 'worker', label: 'Workers' },
            { id: 'user', label: 'Farmers' }
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

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <span>Total Outstanding Dues</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <FiArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-2">
            ₹{summary.totalDuesSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-xs text-gray-400 mt-1 block">Owed to company across {summary.totalCount} accounts</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <span>Total Wallet Balances</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FiArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">
            ₹{summary.totalBalancesSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-xs text-gray-400 mt-1 block">Available earnings / payouts</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <span>Total Accounts</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FiUsers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {summary.totalCount}
          </p>
          <span className="text-xs text-gray-400 mt-1 block">Active {role} wallets</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${role} by name or phone...`}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
          />
        </form>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setFilterDue(!filterDue);
              setPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
              filterDue
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {filterDue ? '✓ Showing Dues Only' : 'Filter: Dues > 0'}
          </button>

          <button
            type="button"
            onClick={loadWallets}
            className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Wallets Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50/80 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
              <tr>
                <th className="py-3.5 px-5 font-semibold">{role.toUpperCase()} INFO</th>
                <th className="py-3.5 px-4 font-semibold">WALLET BALANCE</th>
                <th className="py-3.5 px-4 font-semibold">CREDITS</th>
                <th className="py-3.5 px-4 font-semibold">{role === 'vendor' ? 'COD DUES' : 'DUES'}</th>
                <th className="py-3.5 px-4 font-semibold">INCENTIVES EARNED</th>
                <th className="py-3.5 px-5 font-semibold text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && wallets.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading wallet data...
                  </td>
                </tr>
              ) : wallets.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
                    No {role} accounts found matching the criteria.
                  </td>
                </tr>
              ) : (
                wallets.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50/60 transition-colors">
                    {/* User Info */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm uppercase">
                          {item.name ? item.name.charAt(0) : 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 leading-tight">
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{item.phone}</p>
                          {item.businessName && (
                            <p className="text-xs text-gray-400">{item.businessName}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Wallet Balance */}
                    <td className="py-4 px-4 font-bold text-emerald-600">
                      ₹{Number(item.walletBalance || 0).toFixed(2)}
                    </td>

                    {/* Credits */}
                    <td className="py-4 px-4 font-semibold text-indigo-600">
                      {Number(item.credits || 0).toFixed(2)}
                    </td>

                    {/* COD Dues */}
                    <td className="py-4 px-4 font-bold text-amber-600">
                      ₹{Number(item.dues || 0).toFixed(2)}
                    </td>

                    {/* Total Incentives Earned */}
                    <td className="py-4 px-4 text-gray-700">
                      ₹{Number(item.totalIncentivesEarned || 0).toFixed(2)}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openAdjust(item)}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg text-xs border border-emerald-200 transition-colors"
                        >
                          Adjust Wallet
                        </button>
                        <button
                          onClick={() => openIncentive(item)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-xs border border-rose-200 transition-colors"
                        >
                          + Incentive
                        </button>
                      </div>
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

      {/* Adjust Modal */}
      {showAdjustModal && selectedEntity && (
        <AdjustWalletModal
          isOpen={showAdjustModal}
          onClose={() => {
            setShowAdjustModal(false);
            setSelectedEntity(null);
          }}
          entity={selectedEntity}
          role={role}
          onSuccess={() => loadWallets()}
        />
      )}

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
          onSuccess={() => loadWallets()}
        />
      )}
    </div>
  );
};

export default VendorWallets;
