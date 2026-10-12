import React, { useState, useEffect, useCallback } from 'react';
import { FiSearch, FiX, FiChevronLeft, FiChevronRight, FiEye } from 'react-icons/fi';
import adminLandLeaseService from '../../services/adminLandLeaseService';
import { toastManager } from '../../../../utils/toastManager';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

const STATUS_STYLE = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  leased: 'bg-blue-50 text-blue-700 border-blue-100',
  inactive: 'bg-slate-50 text-slate-600 border-slate-100',
  pending_verification: 'bg-amber-50 text-amber-700 border-amber-100',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  processing: 'bg-blue-50 text-blue-700 border-blue-100',
  submitted: 'bg-amber-50 text-amber-700 border-amber-100',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-100',
  rejected: 'bg-rose-50 text-rose-700 border-rose-100'
};

const Badge = ({ value }) => (
  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${STATUS_STYLE[value] || STATUS_STYLE.inactive}`}>
    {String(value).replace('_', ' ')}
  </span>
);

const TONES = {
  gray: 'bg-gray-50 border-gray-100 text-gray-600',
  blue: 'bg-blue-50 border-blue-100 text-blue-600',
  emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
  amber: 'bg-amber-50 border-amber-100 text-amber-600'
};

const StatCard = ({ label, value, tone = 'gray' }) => (
  <div className={`rounded-2xl border p-4 ${TONES[tone]}`}>
    <p className="text-[11px] font-semibold uppercase">{label}</p>
    <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
  </div>
);

const LandLeases = () => {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [leaseType, setLeaseType] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        adminLandLeaseService.list({
          page,
          limit: 15,
          status: status !== 'all' ? status : undefined,
          leaseType: leaseType !== 'all' ? leaseType : undefined,
          search: query || undefined
        }),
        adminLandLeaseService.stats()
      ]);
      if (listRes?.success) {
        setRows(listRes.data);
        setPagination(listRes.pagination);
      }
      if (statsRes?.success) setStats(statsRes.data);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load land leases');
    } finally {
      setLoading(false);
    }
  }, [page, status, leaseType, query]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id) => {
    try {
      const res = await adminLandLeaseService.getById(id);
      if (res?.success) setDetail(res.data);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load details');
    }
  };

  const applySearch = (e) => {
    e.preventDefault();
    setPage(1);
    setQuery(search.trim());
  };

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Total Listings" value={stats.totalListings} />
          <StatCard label="Leased" value={stats.counts.leased} tone="blue" />
          <StatCard label="Open for Offers" value={stats.counts.active} tone="emerald" />
          <StatCard label="Rent Collected" value={inr(stats.totalCollected)} tone="emerald" />
          <StatCard label="Platform Commission" value={inr(stats.totalCommission)} tone="amber" />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col md:flex-row gap-3">
        <form onSubmit={applySearch} className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, khasra number, city or district"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-500"
          />
        </form>
        <select
          value={status}
          onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="leased">Leased</option>
          <option value="inactive">Inactive</option>
          <option value="pending_verification">Pending verification</option>
        </select>
        <select
          value={leaseType}
          onChange={(e) => { setPage(1); setLeaseType(e.target.value); }}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
        >
          <option value="all">All types</option>
          <option value="fixed-rent">Fixed rent</option>
          <option value="crop-share">Crop share</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
              <th className="p-3">Land</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Tenant</th>
              <th className="p-3">Type</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Collected</th>
              <th className="p-3 text-right">Pending</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="p-8 text-center text-gray-400">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="8" className="p-8 text-center text-gray-400">No land leases found</td></tr>
            ) : rows.map((r) => (
              <tr key={r._id} className="border-b border-gray-50 hover:bg-gray-50/60">
                <td className="p-3">
                  <div className="font-bold text-gray-900 line-clamp-1">{r.title}</div>
                  <div className="text-[11px] text-gray-500">
                    Khasra {r.khasraNumber} • {r.sizeInAcres} acre • {r.location?.city || r.location?.district || '-'}
                  </div>
                </td>
                <td className="p-3">{r.owner?.name || '-'}<div className="text-[11px] text-gray-400">{r.owner?.phone}</div></td>
                <td className="p-3">{r.tenant?.name || '-'}<div className="text-[11px] text-gray-400">{r.tenant?.phone}</div></td>
                <td className="p-3 capitalize">{r.leaseType.replace('-', ' ')}</td>
                <td className="p-3"><Badge value={r.status} /></td>
                <td className="p-3 text-right font-bold text-emerald-700">{inr(r.totals.collected)}</td>
                <td className="p-3 text-right text-amber-700">{inr(r.totals.pending)}</td>
                <td className="p-3">
                  <button onClick={() => openDetail(r._id)} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100" title="View">
                    <FiEye />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40"><FiChevronLeft /></button>
          <span>Page {pagination.page} of {pagination.pages} ({pagination.total})</span>
          <button disabled={page >= pagination.pages} onClick={() => setPage(page + 1)} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40"><FiChevronRight /></button>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 relative max-h-[90vh] overflow-y-auto space-y-4 text-sm">
            <button onClick={() => setDetail(null)} className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200"><FiX /></button>
            <div className="pr-10">
              <h3 className="text-lg font-black text-gray-900">{detail.title}</h3>
              <p className="text-xs text-gray-500">
                Khasra {detail.khasraNumber} • {detail.sizeInAcres} acre • {detail.location?.fullAddress}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded-xl p-3"><span className="text-gray-400 block">Owner</span><b>{detail.ownerId?.name}</b> {detail.ownerId?.phone}</div>
              <div className="bg-gray-50 rounded-xl p-3"><span className="text-gray-400 block">Tenant</span><b>{detail.currentTenantId?.name || '-'}</b> {detail.currentTenantId?.phone}</div>
              <div className="bg-gray-50 rounded-xl p-3">
                <span className="text-gray-400 block">Terms</span>
                {detail.leaseType === 'fixed-rent'
                  ? `${inr(detail.agreement?.agreedPrice ?? detail.pricePerAcre)}/acre/year`
                  : `${detail.agreement?.agreedShare ?? detail.sharePercentage}% owner share`}
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <span className="text-gray-400 block">Period</span>
                {fmtDate(detail.agreement?.startDate)} – {fmtDate(detail.agreement?.endDate)}
              </div>
              <div className="bg-emerald-50 rounded-xl p-3"><span className="text-emerald-600 block">Collected</span><b>{inr(detail.totals.collected)}</b></div>
              <div className="bg-amber-50 rounded-xl p-3"><span className="text-amber-600 block">Commission ({detail.agreement?.commissionPercentage ?? 0}%)</span><b>{inr(detail.totals.commission)}</b></div>
            </div>

            {detail.installments?.length > 0 && (
              <div>
                <h4 className="font-extrabold mb-2">Rent installments</h4>
                <div className="space-y-1.5">
                  {detail.installments.map((i) => (
                    <div key={i._id} className="flex items-center justify-between border border-gray-100 rounded-xl p-2.5 text-xs">
                      <span>#{i.number} • due {fmtDate(i.dueDate)}</span>
                      <span className="font-bold">{inr(i.amount)} <span className="text-gray-400 font-normal">(fee {inr(i.commission)})</span></span>
                      <Badge value={i.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.settlements?.length > 0 && (
              <div>
                <h4 className="font-extrabold mb-2">Crop-share settlements</h4>
                <div className="space-y-1.5">
                  {detail.settlements.map((s) => (
                    <div key={s._id} className="flex items-center justify-between border border-gray-100 rounded-xl p-2.5 text-xs">
                      <span>{s.cropName || 'Crop'} • harvest {inr(s.harvestValue)}</span>
                      <span className="font-bold">{inr(s.amount)} <span className="text-gray-400 font-normal">(fee {inr(s.commission)})</span></span>
                      <Badge value={s.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="font-extrabold mb-2">Offers ({detail.offers?.length || 0})</h4>
              {(detail.offers || []).map((o) => (
                <div key={o._id} className="flex items-center justify-between border border-gray-100 rounded-xl p-2.5 text-xs mb-1.5">
                  <span>{o.farmerName} {o.farmerPhone}</span>
                  <span>{o.proposedPrice ? `${inr(o.proposedPrice)}/acre` : `${o.proposedShare}%`} • {o.durationMonths} mo</span>
                  <Badge value={o.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandLeases;
