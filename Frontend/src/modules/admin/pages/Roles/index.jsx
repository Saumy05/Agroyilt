import React, { useState, useEffect } from 'react';
import { FiShield, FiPlus, FiEdit2, FiTrash2, FiUsers, FiAlertTriangle, FiSave } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import Modal from '../../components/Modal';
import { PermissionsEditor } from '../AdminManagement';
import { buildDefaultPermissions } from '../../utils/permissionsConfig';
import { getRoles, getRole, createRole, updateRole, deleteRole, seedStarterRoles } from '../../services/adminRoleService';

// Permissions the editor works with are { key: boolean }; roles are stored as a list of enabled keys
const keysToMap = (keys = []) => {
  const map = buildDefaultPermissions();
  keys.forEach((k) => { map[k] = true; });
  return map;
};
const mapToKeys = (map = {}) => Object.keys(map).filter((k) => map[k] === true);

// Risky permissions get a warning so they are not ticked for a support role by accident
const SENSITIVE = ['settings.edit', 'payouts.approve', 'settlements.process', 'users.delete', 'vendors.delete', 'workers.delete', 'machinery.delete'];

const Roles = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | { id?, name, description, permissions, members, memberCount }
  const [saving, setSaving] = useState(false);
  const [askApply, setAskApply] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await getRoles();
      setRoles(res?.data || []);
    } catch (e) {
      toastManager.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => setEditing({ name: '', description: '', permissions: buildDefaultPermissions(), members: [], memberCount: 0 });

  const openEdit = async (role) => {
    try {
      const res = await getRole(role._id);
      const r = res.data;
      setEditing({ id: r._id, name: r.name, description: r.description || '', permissions: keysToMap(r.permissionKeys), members: r.members || [], memberCount: (r.members || []).length });
    } catch (e) {
      toastManager.error('Failed to open role');
    }
  };

  const save = async (applyToMembers = false) => {
    if (!editing.name.trim()) return toastManager.error('Give the role a name');
    const body = { name: editing.name.trim(), description: editing.description, permissionKeys: mapToKeys(editing.permissions) };
    try {
      setSaving(true);
      if (editing.id) {
        const res = await updateRole(editing.id, { ...body, applyToMembers });
        toastManager.success(res.applied ? `Role saved. Updated ${res.applied.changed} of ${res.applied.members} people.` : 'Role saved');
      } else {
        await createRole(body);
        toastManager.success('Role created');
      }
      setAskApply(false);
      setEditing(null);
      load();
    } catch (e) {
      toastManager.error(e.response?.data?.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  // Existing role with people on it: ask whether to push the change to them
  const onSaveClick = () => {
    if (editing.id && editing.memberCount > 0) setAskApply(true);
    else save(false);
  };

  const remove = async (role) => {
    if (!window.confirm(`Delete the role "${role.name}"?`)) return;
    try {
      await deleteRole(role._id);
      toastManager.success('Role deleted');
      load();
    } catch (e) {
      toastManager.error(e.response?.data?.message || 'Failed to delete role');
    }
  };

  const addStarters = async () => {
    try {
      const res = await seedStarterRoles();
      toastManager.success(res.message || 'Starter roles added');
      load();
    } catch (e) {
      toastManager.error('Failed to add starter roles');
    }
  };

  const risky = editing ? SENSITIVE.filter((k) => editing.permissions[k]) : [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2"><FiShield className="text-primary-600" /> Roles</h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5">Save a set of permissions once, then pick it when you create an admin.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl shadow-md self-start">
          <FiPlus className="w-4 h-4" /> New role
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
      ) : roles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center space-y-3">
          <FiShield className="w-10 h-10 mx-auto text-gray-300" />
          <p className="font-bold text-gray-800">No roles yet</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">Start with ready-made roles (Support Agent, Support Supervisor, Site Manager, Finance, Content Manager). You can edit or delete any of them.</p>
          <button onClick={addStarters} className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl">Add starter roles</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {roles.map((r) => (
            <div key={r._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-black text-gray-900 truncate">{r.name}</h3>
                  <p className="text-xs text-gray-500 line-clamp-2">{r.description || 'No description'}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => openEdit(r)} className="p-2 rounded-lg bg-gray-100 hover:bg-primary-600 hover:text-white text-gray-600 transition-colors" title="Edit"><FiEdit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(r)} disabled={r.memberCount > 0}
                    title={r.memberCount > 0 ? 'Move its people to another role first' : 'Delete'}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-red-600 hover:text-white text-gray-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"><FiTrash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold text-gray-500 mt-1">
                <span className="flex items-center gap-1"><FiUsers className="w-3 h-3" /> {r.memberCount} {r.memberCount === 1 ? 'person' : 'people'}</span>
                <span>{r.permissionKeys.length} permissions</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role editor */}
      <Modal isOpen={!!editing} onClose={() => !saving && setEditing(null)} title={editing?.id ? 'Edit role' : 'New role'} size="lg">
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Role name *</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={60} placeholder="e.g. Support Agent"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Description</label>
                <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={300} placeholder="What is this role for?"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>

            {risky.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <FiAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span><b>Sensitive access ticked:</b> {risky.join(', ')}. Make sure everyone with this role should have it.</span>
              </div>
            )}

            <PermissionsEditor permissions={editing.permissions} onChange={(p) => setEditing({ ...editing, permissions: p })} />

            {editing.id && (
              <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1.5">People with this role ({editing.members.length})</p>
                {editing.members.length === 0 ? (
                  <p className="text-xs text-gray-400">Nobody yet. Pick this role when you create or edit an admin.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {editing.members.map((m) => (
                      <span key={m._id} title={m.customised ? 'Their ticks differ from this role' : ''}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${m.customised ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-white text-gray-700 border-gray-200'}`}>
                        {m.name}{m.customised ? ' · customised' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditing(null)} disabled={saving} className="px-4 py-2 text-xs font-bold text-gray-600 bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={onSaveClick} disabled={saving} className="px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl flex items-center gap-1.5 disabled:opacity-60">
                <FiSave className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save role'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Apply the change to the people who already have this role? */}
      <Modal isOpen={askApply} onClose={() => !saving && setAskApply(false)} title="Apply to the people with this role?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {editing?.memberCount} {editing?.memberCount === 1 ? 'person has' : 'people have'} this role. Do you want their permissions to match the new version?
          </p>
          <p className="text-xs text-gray-500">Anyone whose ticks you changed by hand will be reset to the role.</p>
          <div className="flex flex-col gap-2">
            <button onClick={() => save(true)} disabled={saving} className="w-full py-2.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-60">Yes, update them too</button>
            <button onClick={() => save(false)} disabled={saving} className="w-full py-2.5 text-sm font-bold text-gray-700 bg-gray-100 rounded-xl disabled:opacity-60">No, only future assignments</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Roles;
