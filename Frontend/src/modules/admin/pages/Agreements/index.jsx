import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiChevronLeft, FiChevronRight, FiEdit2, FiTrash2, FiCheck, FiPlus, FiX, FiEye } from 'react-icons/fi';
import adminAgreementService from '../../services/adminAgreementService';
import { toastManager } from '../../../../utils/toastManager';
import { AGREEMENT_DOC_CSS } from './agreementStyles';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

const STATUS = {
  DRAFT: ['Waiting', 'bg-amber-50 text-amber-700 border-amber-100'],
  PARTIALLY_SIGNED: ['1 of 2 signed', 'bg-amber-50 text-amber-700 border-amber-100'],
  FULLY_EXECUTED: ['Fully executed', 'bg-emerald-50 text-emerald-700 border-emerald-100'],
  CANCELLED: ['Cancelled', 'bg-rose-50 text-rose-700 border-rose-100'],
  EXPIRED: ['Expired', 'bg-slate-50 text-slate-600 border-slate-200'],
  DISPUTED: ['Disputed', 'bg-purple-50 text-purple-700 border-purple-100']
};
const TYPE_LABEL = { FIXED_RENT: 'Fixed rent', BATAI_CROP_SHARE: 'Batai / crop share' };

export const StatusBadge = ({ value }) => {
  const [label, cls] = STATUS[value] || STATUS.DRAFT;
  return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${cls}`}>{label}</span>;
};

const SignDot = ({ signed }) => (
  <span className={`inline-block w-2.5 h-2.5 rounded-full ${signed ? 'bg-emerald-500' : 'bg-slate-300'}`} title={signed ? 'Signed' : 'Not signed'} />
);

// ── agreements list ────────────────────────────────────────────────────────────────────────────
const AgreementsList = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAgreementService.list({
        page, limit: 15,
        status: status !== 'all' ? status : undefined,
        type: type !== 'all' ? type : undefined,
        from: from || undefined, to: to || undefined,
        search: query || undefined
      });
      if (res?.success) { setRows(res.data); setCounts(res.counts || {}); setPagination(res.pagination); }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load agreements');
    } finally {
      setLoading(false);
    }
  }, [page, status, type, from, to, query]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {Object.keys(STATUS).map((k) => (
          <button key={k} onClick={() => { setPage(1); setStatus(status === k ? 'all' : k); }}
            className={`text-left rounded-2xl border p-3.5 transition-all ${status === k ? 'ring-2 ring-emerald-500 bg-white' : 'bg-white hover:bg-gray-50'} border-gray-100`}>
            <p className="text-[11px] font-semibold uppercase text-gray-500">{STATUS[k][0]}</p>
            <p className="text-xl font-black text-gray-900 mt-0.5">{counts[k] ?? 0}</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col lg:flex-row gap-3">
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }} className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search agreement no., name, mobile, khasra or village"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-500" />
        </form>
        <select value={type} onChange={(e) => { setPage(1); setType(e.target.value); }} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm">
          <option value="all">All types</option>
          <option value="FIXED_RENT">Fixed rent</option>
          <option value="BATAI_CROP_SHARE">Batai / crop share</option>
        </select>
        <input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm" aria-label="From date" />
        <input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm" aria-label="To date" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
              <th className="p-3">Agreement</th><th className="p-3">Landowner</th><th className="p-3">Farmer</th>
              <th className="p-3">Land</th><th className="p-3 text-center">Signed</th><th className="p-3">Status</th><th className="p-3">Made</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-8 text-center text-gray-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-gray-400">No agreements found</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer" onClick={() => navigate(`/admin/agreements/${r.id}`)}>
                <td className="p-3"><p className="font-bold text-gray-900">{r.referenceNo}</p><p className="text-[11px] text-gray-500">{TYPE_LABEL[r.type]} · {r.language === 'hi' ? 'Hindi' : 'English'}</p></td>
                <td className="p-3"><p className="font-semibold">{r.landowner}</p><p className="text-[11px] text-gray-500">{r.landownerMobile}</p></td>
                <td className="p-3"><p className="font-semibold">{r.farmer}</p><p className="text-[11px] text-gray-500">{r.farmerMobile}</p></td>
                <td className="p-3"><p>Khasra {r.khasraNumber}</p><p className="text-[11px] text-gray-500">{r.village} · {r.landAreaAcres} acres</p></td>
                <td className="p-3 text-center"><span className="inline-flex gap-1.5"><SignDot signed={r.landownerSigned} /><SignDot signed={r.farmerSigned} /></span></td>
                <td className="p-3"><StatusBadge value={r.status} /></td>
                <td className="p-3 text-xs text-gray-500">{fmtDate(r.createdAt)}</td>
                <td className="p-3 text-gray-400"><FiEye /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{pagination.total} agreements</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40"><FiChevronLeft /></button>
          <span>Page {pagination.page} of {pagination.pages}</span>
          <button disabled={page >= pagination.pages} onClick={() => setPage(page + 1)} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40"><FiChevronRight /></button>
        </div>
      </div>
    </div>
  );
};

// ── templates ──────────────────────────────────────────────────────────────────────────────────
const EMPTY_TEMPLATE = { title: '', type: 'FIXED_RENT', language: 'hi', content: '', standardClauses: [] };

const TemplateEditor = ({ initial, placeholders, onClose, onSaved }) => {
  const [form, setForm] = useState({ ...EMPTY_TEMPLATE, ...initial, standardClauses: [...(initial?.standardClauses || [])] });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const isNew = !initial?._id;

  const doPreview = async () => {
    try {
      const res = await adminAgreementService.previewTemplate({ type: form.type, language: form.language, content: form.content, standardClauses: form.standardClauses });
      if (res?.success) setPreview(res.data);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not build the preview');
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      const res = isNew ? await adminAgreementService.createTemplate(form) : await adminAgreementService.updateTemplate(initial._id, form);
      if (res?.success) {
        toastManager.success(res.message || 'Saved');
        (res.warnings || []).forEach((w) => toastManager.info(w));
        onSaved();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const insert = (key) => setForm((f) => ({ ...f, content: `${f.content}{{${key}}}` }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <style>{AGREEMENT_DOC_CSS}</style>
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[94vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-black text-gray-900">{isNew ? 'New agreement template' : `Edit template (version ${initial.version})`}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <select value={form.type} disabled={!isNew} onChange={(e) => setForm({ ...form, type: e.target.value })} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm disabled:bg-gray-50">
                <option value="FIXED_RENT">Fixed rent</option><option value="BATAI_CROP_SHARE">Batai / crop share</option>
              </select>
              <select value={form.language} disabled={!isNew} onChange={(e) => setForm({ ...form, language: e.target.value })} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm disabled:bg-gray-50">
                <option value="hi">Hindi</option><option value="en">English</option>
              </select>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase text-gray-500 mb-1">Text (# heading, **bold**, - bullets, 1. numbered; no HTML)</p>
              <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={16}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-mono leading-relaxed" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {placeholders.map((p) => (
                  <button key={p.key} type="button" title={p.description} onClick={() => insert(p.key)}
                    className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-mono border border-emerald-100 hover:bg-emerald-100">{`{{${p.key}}}`}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase text-gray-500 mb-1">Standard clauses (inserted where you write {'{{standard_clauses}}'})</p>
              {form.standardClauses.map((c, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <textarea value={c} rows={2} onChange={(e) => setForm({ ...form, standardClauses: form.standardClauses.map((x, j) => (j === i ? e.target.value : x)) })}
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                  <button type="button" onClick={() => setForm({ ...form, standardClauses: form.standardClauses.filter((_, j) => j !== i) })} className="p-2 text-rose-600"><FiTrash2 /></button>
                </div>
              ))}
              <button type="button" onClick={() => setForm({ ...form, standardClauses: [...form.standardClauses, ''] })} className="text-xs font-bold text-emerald-700 flex items-center gap-1"><FiPlus /> Add clause</button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase text-gray-500">Preview with sample data</p>
              <button onClick={doPreview} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">Refresh preview</button>
            </div>
            {preview?.missing?.length > 0 && <p className="mb-2 text-xs font-semibold text-rose-600">Missing required: {preview.missing.map((m) => `{{${m}}}`).join(', ')}</p>}
            {preview?.unknown?.length > 0 && <p className="mb-2 text-xs font-semibold text-amber-700">Unknown placeholders (left empty): {preview.unknown.map((m) => `{{${m}}}`).join(', ')}</p>}
            <div className="border border-gray-200 rounded-xl p-4 bg-slate-50 max-h-[60vh] overflow-y-auto">
              {preview ? <div className="agr-doc" dangerouslySetInnerHTML={{ __html: preview.html }} /> : <p className="text-sm text-gray-400">Press “Refresh preview”.</p>}
            </div>
            <p className="mt-3 text-[11px] text-gray-500 leading-snug">
              Every template must contain {'{{landowner_name}}, {{farmer_name}}, {{khasra_no}}'} and {'{{boundary_table}}'} (the land border coordinates), plus {'{{rent_amount}}'} for fixed rent or {'{{share_percentage}}'} for batai.
              Saving a changed text makes a new version; agreements already made keep the text they were made from. Have a lawyer review the wording before you activate it.
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold">Close</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

const TemplatesPanel = () => {
  const [rows, setRows] = useState([]);
  const [placeholders, setPlaceholders] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([adminAgreementService.listTemplates(), adminAgreementService.placeholders()]);
      if (t?.success) setRows(t.data);
      if (p?.success) setPlaceholders(p.data.placeholders);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activate = async (t) => {
    try { const res = await adminAgreementService.activateTemplate(t._id); if (res?.success) { toastManager.success(res.message); load(); } }
    catch (err) { toastManager.error(err.response?.data?.message || 'Could not activate'); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.title}"?`)) return;
    try { const res = await adminAgreementService.deleteTemplate(t._id); if (res?.success) { toastManager.success(res.message); load(); } }
    catch (err) { toastManager.error(err.response?.data?.message || 'Could not delete'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">One template per type and language is active. The built-in wording is used until you activate your own.</p>
        <button onClick={() => setEditing({})} className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-bold flex items-center gap-1.5"><FiPlus /> New template</button>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100"><th className="p-3">Title</th><th className="p-3">Type</th><th className="p-3">Language</th><th className="p-3">Version</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3" /></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-8 text-center text-gray-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">No templates yet. The built-in ones are saved the first time an agreement is made.</td></tr>}
            {rows.map((t) => (
              <tr key={t._id} className="border-b border-gray-50">
                <td className="p-3 font-semibold">{t.title}</td>
                <td className="p-3">{TYPE_LABEL[t.type]}</td>
                <td className="p-3">{t.language === 'hi' ? 'Hindi' : 'English'}</td>
                <td className="p-3">v{t.version}</td>
                <td className="p-3">{t.isActive ? <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">Active</span> : <span className="text-xs text-gray-400">Inactive</span>}</td>
                <td className="p-3 text-xs text-gray-500">{fmtDate(t.updatedAt)}</td>
                <td className="p-3 flex items-center gap-1.5 justify-end">
                  {!t.isActive && <button onClick={() => activate(t)} className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1"><FiCheck /> Activate</button>}
                  <button onClick={() => setEditing(t)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><FiEdit2 /></button>
                  {!t.isActive && <button onClick={() => remove(t)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600"><FiTrash2 /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <TemplateEditor initial={editing} placeholders={placeholders} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
};

const Agreements = () => {
  const [tab, setTab] = useState('agreements');
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl bg-gray-100 p-1">
        {[['agreements', 'Agreements'], ['templates', 'Templates']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-bold ${tab === k ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'}`}>{label}</button>
        ))}
      </div>
      {tab === 'agreements' ? <AgreementsList /> : <TemplatesPanel />}
    </div>
  );
};

export default Agreements;
