import React, { useCallback, useEffect, useState } from 'react';
import { FiCreditCard, FiChevronRight, FiLock, FiRotateCcw } from 'react-icons/fi';
import api from '../../../../services/api';
import { toastManager } from '../../../../utils/toastManager';
import LogoLoader from '../../../../components/common/LogoLoader';

// Admin: where cash / online payment is allowed. A State switch gates its Districts, a District switch gates its
// Sub-districts: a child can only restrict what its parent allows (the server enforces this too).
const TYPES = [
  { key: 'worker', label: 'Worker bookings' },
  { key: 'machinery', label: 'Machinery bookings' }
];
const METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'online', label: 'Online' }
];
const LEVEL_NOUN = { state: 'State', district: 'District', subDistrict: 'Sub-district' };

const Switch = ({ checked, onChange, disabled, title }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    title={title}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

const PaymentMethods = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState({}); // { stateId, districtId }
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async (f = filter) => {
    try {
      const params = {};
      if (f.districtId) params.districtId = f.districtId;
      else if (f.stateId) params.stateId = f.stateId;
      const res = await api.get('/admin/payment-rules', { params });
      setData(res.data);
    } catch (e) {
      toastManager.error(e.response?.data?.message || 'Failed to load payment rules');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(filter); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (fn, key) => {
    setBusy(key);
    try {
      await fn();
      await load(filter);
    } catch (e) {
      toastManager.error(e.response?.data?.message || 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const setGlobal = (type, method, value) =>
    save(() => api.put('/admin/payment-rules/global', { [type]: { [method]: value } }), `g-${type}-${method}`);

  const setArea = (child, type, method, value) =>
    save(() => api.put('/admin/payment-rules/area', { level: data.childLevel, areaId: child.id, [type]: { [method]: value } }), `${child.id}-${type}-${method}`);

  const resetArea = (child) =>
    save(() => api.delete(`/admin/payment-rules/area/${data.childLevel}/${child.id}`), `${child.id}-reset`);

  const open = (child) => {
    setSearch('');
    if (data.childLevel === 'state') setFilter({ stateId: child.id });
    else if (data.childLevel === 'district') setFilter({ stateId: filter.stateId, districtId: child.id });
  };

  if (loading || !data) return <LogoLoader />;

  const children = data.children.filter(c => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()));
  const parentName = data.path.length ? data.path[data.path.length - 1].name : 'Everywhere';

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Intro */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-50 rounded-lg"><FiCreditCard className="w-5 h-5 text-indigo-600" /></div>
          <h2 className="text-lg font-bold text-gray-800">Payment Methods by Area</h2>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          Choose where farmers can pay in <b>cash</b> or <b>online</b>. Switch a method off for a whole state, then open the
          state to switch it off for particular districts, and a district to do the same for its sub-districts. A switch can only
          restrict what the level above allows: if a state has cash off, none of its districts or sub-districts can turn it on.
          At least one method must stay on everywhere. Bookings already made keep their payment method.
        </p>
      </div>

      {/* Global defaults */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-bold text-gray-800 mb-1">Everywhere (default)</h3>
        <p className="text-xs text-gray-400 mb-4">Applies to every area first. Anything switched off here is off in all states.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TYPES.map(t => (
            <div key={t.key} className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t.label}</p>
              <div className="flex items-center gap-8">
                {METHODS.map(m => (
                  <label key={m.key} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <Switch checked={!!data.global[t.key][m.key]} disabled={busy === `g-${t.key}-${m.key}`} onChange={(v) => setGlobal(t.key, m.key, v)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Explorer */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            <button type="button" onClick={() => setFilter({})} className={`hover:underline ${data.path.length ? 'text-indigo-600' : 'text-gray-800'}`}>All states</button>
            {data.path.map((p, i) => (
              <React.Fragment key={String(p.id)}>
                <FiChevronRight className="text-gray-300" />
                <button
                  type="button"
                  disabled={i === data.path.length - 1}
                  onClick={() => setFilter(p.level === 'state' ? { stateId: p.id } : { stateId: filter.stateId, districtId: p.id })}
                  className={i === data.path.length - 1 ? 'text-gray-800' : 'text-indigo-600 hover:underline'}
                >
                  {p.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${LEVEL_NOUN[data.childLevel].toLowerCase()}s…`}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 w-56"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                <th className="text-left font-bold px-4 py-3">{LEVEL_NOUN[data.childLevel]}</th>
                {TYPES.map(t => (
                  <th key={t.key} colSpan={2} className="text-center font-bold px-2 py-3 border-l border-gray-100">{t.label}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400">
                <th />
                {TYPES.flatMap(t => METHODS.map(m => (
                  <th key={`${t.key}-${m.key}`} className="font-semibold px-2 pb-2 text-center">{m.label}</th>
                )))}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {children.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No {LEVEL_NOUN[data.childLevel].toLowerCase()}s found.</td></tr>
              )}
              {children.map(c => (
                <tr key={String(c.id)} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-800">{c.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {c.rule ? 'Custom rule' : `Same as ${parentName}`}
                      {c.customisedBelow > 0 ? ` · ${c.customisedBelow} area${c.customisedBelow > 1 ? 's' : ''} customised below` : ''}
                    </div>
                  </td>
                  {TYPES.flatMap(t => METHODS.map(m => {
                    const parentAllows = !!data.parentEffective[t.key][m.key];
                    const value = !!c.effective[t.key][m.key];
                    return (
                      <td key={`${t.key}-${m.key}`} className="px-2 py-3 text-center">
                        <div className="inline-flex items-center justify-center">
                          {parentAllows ? (
                            <Switch checked={value} disabled={busy === `${c.id}-${t.key}-${m.key}`} onChange={(v) => setArea(c, t.key, m.key, v)} title={`${m.label} for ${t.label.toLowerCase()} in ${c.name}`} />
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400" title={`Off in ${parentName}, so it cannot be switched on here`}>
                              <FiLock size={11} /> Off above
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  }))}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {c.rule && (
                      <button type="button" onClick={() => resetArea(c)} disabled={busy === `${c.id}-reset`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 mr-3" title="Remove this rule and inherit again">
                        <FiRotateCcw size={12} /> Reset
                      </button>
                    )}
                    {data.childLevel !== 'subDistrict' && (
                      <button type="button" onClick={() => open(c)} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
                        Open <FiChevronRight size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethods;
