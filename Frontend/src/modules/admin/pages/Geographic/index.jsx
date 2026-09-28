/**
 * Geographic Management Admin Page
 * Manages States, Districts, and Sub-Districts.
 * Replaces the old City Management functionality.
 *
 * Hierarchy: GLOBAL_INDIA → State → District → SubDistrict
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toastManager } from '../../../../utils/toastManager';
import { stateService, districtService, subDistrictService } from '../../services/geoService';
import {
  FiPlus, FiEdit2, FiTrash2, FiToggleLeft, FiToggleRight,
  FiChevronDown, FiChevronRight, FiGlobe, FiMapPin, FiSearch, FiX
} from 'react-icons/fi';

// ── Small helpers ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'states',        label: 'States',        icon: FiGlobe },
  { id: 'districts',     label: 'Districts',      icon: FiMapPin },
  { id: 'subdistricts',  label: 'Sub-Districts',  icon: FiChevronRight }
];

const Badge = ({ active }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
    active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
  }`}>
    {active ? 'Active' : 'Inactive'}
  </span>
);

// ── Modal ─────────────────────────────────────────────────────────────────────
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          initial={{ scale: 0.95, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 20, opacity: 0 }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-800">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const GeographicManagement = () => {
  const [activeTab, setActiveTab] = useState('states');
  const [search, setSearch] = useState('');

  // ── States ──────────────────────────────────────────────────────────────────
  const [states, setStates] = useState([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [stateModal, setStateModal] = useState(false);
  const [editingState, setEditingState] = useState(null);
  const [stateForm, setStateForm] = useState({ name: '', code: '', isActive: true });

  // ── Districts ────────────────────────────────────────────────────────────────
  const [districts, setDistricts] = useState([]);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [districtModal, setDistrictModal] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState(null);
  const [districtForm, setDistrictForm] = useState({ name: '', stateId: '', isActive: true });

  // ── Sub-Districts ────────────────────────────────────────────────────────────
  const [subDistricts, setSubDistricts] = useState([]);
  const [subDistrictsLoading, setSubDistrictsLoading] = useState(false);
  const [subDistrictModal, setSubDistrictModal] = useState(false);
  const [editingSubDistrict, setEditingSubDistrict] = useState(null);
  const [subDistrictForm, setSubDistrictForm] = useState({ name: '', districtId: '', isActive: true });

  // Filtered districts for the sub-district form dropdown
  const [filteredDistricts, setFilteredDistricts] = useState([]);
  const [stateFilterForSubDist, setStateFilterForSubDist] = useState('');

  // ── Loaders ──────────────────────────────────────────────────────────────────
  const loadStates = useCallback(async () => {
    setStatesLoading(true);
    try {
      const res = await stateService.getAll();
      if (res.success) setStates(res.states || []);
    } catch { toastManager.error('Failed to load states'); }
    finally { setStatesLoading(false); }
  }, []);

  const loadDistricts = useCallback(async (stateId = null) => {
    setDistrictsLoading(true);
    try {
      const params = stateId ? { stateId } : {};
      const res = await districtService.getAll(params);
      if (res.success) setDistricts(res.districts || []);
    } catch { toastManager.error('Failed to load districts'); }
    finally { setDistrictsLoading(false); }
  }, []);

  const loadSubDistricts = useCallback(async (districtId = null) => {
    setSubDistrictsLoading(true);
    try {
      const params = districtId ? { districtId } : {};
      const res = await subDistrictService.getAll(params);
      if (res.success) setSubDistricts(res.subDistricts || []);
    } catch { toastManager.error('Failed to load sub-districts'); }
    finally { setSubDistrictsLoading(false); }
  }, []);

  useEffect(() => { loadStates(); }, []);
  useEffect(() => {
    if (activeTab === 'districts') loadDistricts();
    if (activeTab === 'subdistricts') {
      loadDistricts(); // for dropdown
      loadSubDistricts();
    }
  }, [activeTab]);

  // ── State CRUD ─────────────────────────────────────────────────────────────
  const openStateModal = (state = null) => {
    setEditingState(state);
    setStateForm(state
      ? { name: state.name, code: state.code || '', isActive: state.isActive }
      : { name: '', code: '', isActive: true }
    );
    setStateModal(true);
  };

  const handleStateSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingState) {
        await stateService.update(editingState._id, stateForm);
        toastManager.success('State updated');
      } else {
        await stateService.create(stateForm);
        toastManager.success('State created');
      }
      setStateModal(false);
      loadStates();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDeleteState = async (state) => {
    if (!confirm(`Delete state "${state.name}"? This cannot be undone.`)) return;
    try {
      await stateService.delete(state._id);
      toastManager.success('State deleted');
      loadStates();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleToggleState = async (state) => {
    try {
      await stateService.toggleStatus(state._id);
      toastManager.success(`State ${state.isActive ? 'deactivated' : 'activated'}`);
      loadStates();
    } catch { toastManager.error('Toggle failed'); }
  };

  // ── District CRUD ──────────────────────────────────────────────────────────
  const openDistrictModal = (district = null) => {
    if (!states.length) loadStates();
    setEditingDistrict(district);
    setDistrictForm(district
      ? { name: district.name, stateId: district.stateId?._id || district.stateId || '', isActive: district.isActive }
      : { name: '', stateId: '', isActive: true }
    );
    setDistrictModal(true);
  };

  const handleDistrictSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDistrict) {
        await districtService.update(editingDistrict._id, districtForm);
        toastManager.success('District updated');
      } else {
        await districtService.create(districtForm);
        toastManager.success('District created');
      }
      setDistrictModal(false);
      loadDistricts();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDeleteDistrict = async (district) => {
    if (!confirm(`Delete district "${district.name}"? This cannot be undone.`)) return;
    try {
      await districtService.delete(district._id);
      toastManager.success('District deleted');
      loadDistricts();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleToggleDistrict = async (district) => {
    try {
      await districtService.toggleStatus(district._id);
      toastManager.success(`District ${district.isActive ? 'deactivated' : 'activated'}`);
      loadDistricts();
    } catch { toastManager.error('Toggle failed'); }
  };

  // ── Sub-District CRUD ──────────────────────────────────────────────────────
  const openSubDistrictModal = (sd = null) => {
    if (!districts.length) loadDistricts();
    if (!states.length) loadStates();
    setEditingSubDistrict(sd);
    setSubDistrictForm(sd
      ? { name: sd.name, districtId: sd.districtId?._id || sd.districtId || '', isActive: sd.isActive }
      : { name: '', districtId: '', isActive: true }
    );
    setStateFilterForSubDist('');
    setFilteredDistricts(districts);
    setSubDistrictModal(true);
  };

  const handleSubDistrictSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSubDistrict) {
        await subDistrictService.update(editingSubDistrict._id, subDistrictForm);
        toastManager.success('Sub-district updated');
      } else {
        await subDistrictService.create(subDistrictForm);
        toastManager.success('Sub-district created');
      }
      setSubDistrictModal(false);
      loadSubDistricts();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDeleteSubDistrict = async (sd) => {
    if (!confirm(`Delete sub-district "${sd.name}"? This cannot be undone.`)) return;
    try {
      await subDistrictService.delete(sd._id);
      toastManager.success('Sub-district deleted');
      loadSubDistricts();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleToggleSubDistrict = async (sd) => {
    try {
      await subDistrictService.toggleStatus(sd._id);
      toastManager.success(`Sub-district ${sd.isActive ? 'deactivated' : 'activated'}`);
      loadSubDistricts();
    } catch { toastManager.error('Toggle failed'); }
  };

  // ── Search filter ─────────────────────────────────────────────────────────
  const filterBySearch = (items) => {
    if (!search.trim()) return items;
    const lower = search.toLowerCase();
    return items.filter(i => i.name?.toLowerCase().includes(lower));
  };

  // ── Row renderer ──────────────────────────────────────────────────────────
  const renderRow = (item, onEdit, onDelete, onToggle, extra = null) => (
    <tr key={item._id} className="hover:bg-gray-50/60 transition-colors border-b border-gray-100 last:border-0">
      <td className="py-3.5 px-5 font-medium text-gray-900">{item.name}</td>
      {extra}
      <td className="py-3.5 px-5">
        <Badge active={item.isActive} />
      </td>
      <td className="py-3.5 px-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(item)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Edit"
          >
            <FiEdit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToggle(item)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title={item.isActive ? 'Deactivate' : 'Activate'}
          >
            {item.isActive ? <FiToggleRight className="w-4 h-4 text-emerald-500" /> : <FiToggleLeft className="w-4 h-4 text-gray-400" />}
          </button>
          <button
            onClick={() => onDelete(item)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );

  const loading = statesLoading || districtsLoading || subDistrictsLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Geographic Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage States, Districts and Sub-Districts for service availability scope.
          </p>
        </div>

        {/* Global scope note */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <FiGlobe className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-emerald-700">GLOBAL_INDIA = Entire India</span>
        </div>
      </div>

      {/* Scope hierarchy info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800 font-medium">
          📍 Service Scope Hierarchy: <strong>GLOBAL INDIA</strong> → <strong>State</strong> → <strong>District</strong> → <strong>Sub-District</strong>
        </p>
        <p className="text-xs text-blue-600 mt-1">
          GLOBAL_INDIA services are visible across all of India. State-scoped services are visible within that state only.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + Add */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
          />
        </div>
        <button
          onClick={() => {
            if (activeTab === 'states') openStateModal();
            else if (activeTab === 'districts') openDistrictModal();
            else openSubDistrictModal();
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors"
        >
          <FiPlus className="w-4 h-4" />
          Add {activeTab === 'states' ? 'State' : activeTab === 'districts' ? 'District' : 'Sub-District'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {activeTab === 'states' && (
                    <>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State Name</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </>
                  )}
                  {activeTab === 'districts' && (
                    <>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">District Name</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </>
                  )}
                  {activeTab === 'subdistricts' && (
                    <>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sub-District Name</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">District</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeTab === 'states' && filterBySearch(states).map(s =>
                  renderRow(s, openStateModal, handleDeleteState, handleToggleState,
                    <td className="py-3.5 px-5 text-gray-500 text-sm">{s.code || '—'}</td>
                  )
                )}
                {activeTab === 'districts' && filterBySearch(districts).map(d =>
                  renderRow(d, openDistrictModal, handleDeleteDistrict, handleToggleDistrict,
                    <td className="py-3.5 px-5 text-gray-500 text-sm">
                      {d.stateId?.name || d.stateName || '—'}
                    </td>
                  )
                )}
                {activeTab === 'subdistricts' && filterBySearch(subDistricts).map(sd =>
                  renderRow(sd, openSubDistrictModal, handleDeleteSubDistrict, handleToggleSubDistrict,
                    <>
                      <td className="py-3.5 px-5 text-gray-500 text-sm">
                        {sd.districtId?.name || sd.districtName || '—'}
                      </td>
                      <td className="py-3.5 px-5 text-gray-500 text-sm">
                        {sd.stateId?.name || sd.stateName || '—'}
                      </td>
                    </>
                  )
                )}

                {/* Empty state */}
                {activeTab === 'states' && !statesLoading && filterBySearch(states).length === 0 && (
                  <tr><td colSpan={4} className="py-12 text-center text-gray-400 text-sm">No states found. Add your first state!</td></tr>
                )}
                {activeTab === 'districts' && !districtsLoading && filterBySearch(districts).length === 0 && (
                  <tr><td colSpan={4} className="py-12 text-center text-gray-400 text-sm">No districts found. Add a district under a state!</td></tr>
                )}
                {activeTab === 'subdistricts' && !subDistrictsLoading && filterBySearch(subDistricts).length === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-gray-400 text-sm">No sub-districts found. Add one under a district!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── State Modal ──────────────────────────────────────────────────────── */}
      <Modal
        isOpen={stateModal}
        onClose={() => setStateModal(false)}
        title={editingState ? 'Edit State' : 'Add State'}
      >
        <form onSubmit={handleStateSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State Name *</label>
            <input
              type="text"
              required
              value={stateForm.name}
              onChange={e => setStateForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Madhya Pradesh"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State Code (optional)</label>
            <input
              type="text"
              value={stateForm.code}
              onChange={e => setStateForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. MP"
              maxLength={5}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={stateForm.isActive}
              onChange={e => setStateForm(p => ({ ...p, isActive: e.target.checked }))}
              className="w-4 h-4 text-teal-600 rounded"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setStateModal(false)}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors">
              {editingState ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── District Modal ────────────────────────────────────────────────────── */}
      <Modal
        isOpen={districtModal}
        onClose={() => setDistrictModal(false)}
        title={editingDistrict ? 'Edit District' : 'Add District'}
      >
        <form onSubmit={handleDistrictSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">District Name *</label>
            <input
              type="text"
              required
              value={districtForm.name}
              onChange={e => setDistrictForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Indore"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
            <select
              required
              value={districtForm.stateId}
              onChange={e => setDistrictForm(p => ({ ...p, stateId: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 bg-white"
            >
              <option value="">Select a state</option>
              {states.filter(s => s.isActive).map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={districtForm.isActive}
              onChange={e => setDistrictForm(p => ({ ...p, isActive: e.target.checked }))}
              className="w-4 h-4 text-teal-600 rounded"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setDistrictModal(false)}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors">
              {editingDistrict ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Sub-District Modal ────────────────────────────────────────────────── */}
      <Modal
        isOpen={subDistrictModal}
        onClose={() => setSubDistrictModal(false)}
        title={editingSubDistrict ? 'Edit Sub-District' : 'Add Sub-District'}
      >
        <form onSubmit={handleSubDistrictSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sub-District Name *</label>
            <input
              type="text"
              required
              value={subDistrictForm.name}
              onChange={e => setSubDistrictForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Depalpur"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by State (Optional)</label>
            <select
              value={stateFilterForSubDist}
              onChange={e => {
                const sId = e.target.value;
                setStateFilterForSubDist(sId);
                if (sId) {
                  setFilteredDistricts(districts.filter(d => (d.stateId?._id || d.stateId) === sId));
                } else {
                  setFilteredDistricts(districts);
                }
              }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 bg-white mb-2"
            >
              <option value="">All States</option>
              {states.map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>

            <label className="block text-sm font-medium text-gray-700 mb-1">District *</label>
            <select
              required
              value={subDistrictForm.districtId}
              onChange={e => setSubDistrictForm(p => ({ ...p, districtId: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 bg-white"
            >
              <option value="">Select a district</option>
              {(stateFilterForSubDist ? filteredDistricts : districts).filter(d => d.isActive).map(d => (
                <option key={d._id} value={d._id}>
                  {d.name} {d.stateName ? `(${d.stateName})` : ''}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={subDistrictForm.isActive}
              onChange={e => setSubDistrictForm(p => ({ ...p, isActive: e.target.checked }))}
              className="w-4 h-4 text-teal-600 rounded"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setSubDistrictModal(false)}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors">
              {editingSubDistrict ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default GeographicManagement;
