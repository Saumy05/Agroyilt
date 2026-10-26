import React, { useCallback, useEffect, useState } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiX } from 'react-icons/fi';
import adminWorkCategoryService from '../../services/adminWorkCategoryService';
import { toastManager } from '../../../../utils/toastManager';

const EMPTY = { name: '', icon: '🌾', title: '', description: '', aliases: '', order: '', isActive: true };

/**
 * The kinds of farm work, managed in one place: farmers pick from this list when asking for workers, and workers, team leaders'
 * offline members and the admin's Add Worker use the same names, so a request always finds the workers who offer that work.
 */
const WorkCategories = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | { id?, ...form }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminWorkCategoryService.list();
      if (res?.success) setRows(res.data);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load the work categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setEditing({ ...EMPTY });
  const openEdit = (c) => setEditing({
    id: c._id, name: c.name, icon: c.icon || '', title: c.title || '', description: c.description || '',
    aliases: (c.aliases || []).join(', '), order: c.order ?? '', isActive: c.isActive !== false
  });

  const save = async (e) => {
    e.preventDefault();
    if (!editing.name.trim()) return toastManager.error('Enter the category name');
    setSaving(true);
    try {
      const { id, ...form } = editing;
      const payload = { ...form, order: form.order === '' ? undefined : Number(form.order) };
      const res = id ? await adminWorkCategoryService.update(id, payload) : await adminWorkCategoryService.create(payload);
      if (res?.success) {
        toastManager.success(id ? 'Category updated' : 'Category added');
        setEditing(null);
        load();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not save the category');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c) => {
    try {
      await adminWorkCategoryService.update(c._id, { isActive: !c.isActive });
      load();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not change the category');
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.name}"?\n\nWorkers who already have it keep it, but farmers can no longer pick it. Switching it off is usually better.`)) return;
    try {
      await adminWorkCategoryService.remove(c._id);
      toastManager.success('Category deleted');
      load();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not delete the category');
    }
  };

  const input = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-500';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-2xl">
          The kinds of farm work, one list for everyone: farmers choose from it when asking for workers, and workers, offline members and Add Worker use the same names.
          Switch a category off to hide it from new choices without losing it.
        </p>
        <button onClick={openNew} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center gap-2">
          <FiPlus /> Add category
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No categories yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((c) => (
              <div key={c._id} className={`flex flex-wrap items-center gap-3 p-4 ${c.isActive ? '' : 'opacity-60'}`}>
                <span className="text-2xl w-9 text-center">{c.icon}</span>
                <div className="flex-1 min-w-[180px]">
                  <p className="font-bold text-gray-900 text-sm">{c.name} <span className="text-[10px] text-gray-400 font-semibold">#{c.order}</span></p>
                  <p className="text-xs text-gray-500">{c.title}{c.description ? ` · ${c.description}` : ''}</p>
                  {c.aliases?.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-0.5">Also matches: {c.aliases.join(', ')}</p>
                  )}
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">{c.workerCount} worker{c.workerCount === 1 ? '' : 's'}</span>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={c.isActive} onChange={() => toggleActive(c)} /> Active
                </label>
                <button onClick={() => openEdit(c)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Edit"><FiEdit2 size={14} /></button>
                <button onClick={() => remove(c)} className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50" title="Delete"><FiTrash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={save} className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900">{editing.id ? 'Edit category' : 'Add category'}</h3>
              <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><FiX /></button>
            </div>

            <div className="grid grid-cols-[4.5rem_1fr] gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Icon</label>
                <input className={`${input} text-center text-lg`} value={editing.icon} maxLength={8} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Name *</label>
                <input className={input} value={editing.name} maxLength={60} placeholder="e.g. Drone Spraying" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
            </div>
            {editing.id && <p className="text-[11px] text-gray-400 -mt-1">Renaming keeps the old name working: workers who saved it are still found.</p>}

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Request title (filled in for the farmer)</label>
              <input className={input} value={editing.title} maxLength={80} placeholder="e.g. Drone Spraying Work" onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Request description (filled in for the farmer)</label>
              <textarea className={input} rows={2} value={editing.description} maxLength={300} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Other names for the same work (comma separated)</label>
              <input className={input} value={editing.aliases} placeholder="e.g. Drone, UAV spraying" onChange={(e) => setEditing({ ...editing, aliases: e.target.value })} />
              <p className="text-[11px] text-gray-400 mt-1">A request for this work also reaches workers who saved any of these names.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-28">
                <label className="block text-xs font-bold text-gray-600 mb-1">Order</label>
                <input type="number" min="0" className={input} value={editing.order} placeholder="last" onChange={(e) => setEditing({ ...editing, order: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mt-5 cursor-pointer">
                <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default WorkCategories;
