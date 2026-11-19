/**
 * Geographic Management Admin Page
 * Manages States, Districts, and Sub-Districts.
 *
 * Hierarchical Drill-Down Navigation:
 * GLOBAL_INDIA → State → District → SubDistrict
 *
 * Click State → Drills into its Districts
 * Click District → Drills into its Sub-Districts (Tehsils)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { INDIAN_STATES } from './indianStates';
import GooglePlaceList from './GooglePlaceList';
import CustomSelect from './CustomSelect';
import { motion, AnimatePresence } from 'framer-motion';
import { toastManager } from '../../../../utils/toastManager';
import { stateService, districtService, subDistrictService } from '../../services/geoService';
import {
  FiPlus, FiEdit2, FiTrash2, FiToggleLeft, FiToggleRight,
  FiChevronRight, FiGlobe, FiMapPin, FiLayers, FiSearch, FiX,
  FiArrowLeft, FiFilter
} from 'react-icons/fi';

// ── Small helpers ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'states',        label: 'States',        icon: FiGlobe },
  { id: 'districts',     label: 'Districts',      icon: FiMapPin },
  { id: 'subdistricts',  label: 'Sub-Districts',  icon: FiLayers }
];

const Badge = ({ active }) => (
  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
    active ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-600 border border-red-200'
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto relative"
          initial={{ scale: 0.95, y: 0, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 20, opacity: 0 }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-2xl bg-white">
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const stateIdParam = searchParams.get('stateId') || '';
  const districtIdParam = searchParams.get('districtId') || '';

  const activeTab = tabParam && ['states', 'districts', 'subdistricts'].includes(tabParam)
    ? tabParam
    : 'states';

  const [search, setSearch] = useState('');

  // ── States State ────────────────────────────────────────────────────────────
  const [states, setStates] = useState([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [stateModal, setStateModal] = useState(false);
  const [editingState, setEditingState] = useState(null);
  const [stateForm, setStateForm] = useState({ name: '', code: '', isActive: true });
  const [stateCustom, setStateCustom] = useState(false);

  // ── Districts State ─────────────────────────────────────────────────────────
  const [districts, setDistricts] = useState([]);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [districtModal, setDistrictModal] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState(null);
  const [districtForm, setDistrictForm] = useState({ name: '', stateId: '', isActive: true });

  // ── Sub-Districts State ─────────────────────────────────────────────────────
  const [subDistricts, setSubDistricts] = useState([]);
  const [subDistrictsLoading, setSubDistrictsLoading] = useState(false);
  const [subDistrictModal, setSubDistrictModal] = useState(false);
  const [editingSubDistrict, setEditingSubDistrict] = useState(null);
  const [subDistrictForm, setSubDistrictForm] = useState({ name: '', districtId: '', isActive: true });

  // Filtered districts for dropdown inside sub-district modal
  const [filteredDistricts, setFilteredDistricts] = useState([]);
  const [stateFilterForSubDist, setStateFilterForSubDist] = useState('');

  // ── Active Selection Helpers ────────────────────────────────────────────────
  const selectedState = useMemo(() => {
    return states.find(s => s._id === stateIdParam) || null;
  }, [states, stateIdParam]);

  const selectedDistrict = useMemo(() => {
    return districts.find(d => d._id === districtIdParam) || null;
  }, [districts, districtIdParam]);

  // ── Loaders ──────────────────────────────────────────────────────────────────
  const loadStates = useCallback(async () => {
    setStatesLoading(true);
    try {
      const res = await stateService.getAll();
      if (res.success) setStates(res.states || []);
    } catch {
      toastManager.error('Failed to load states');
    } finally {
      setStatesLoading(false);
    }
  }, []);

  const loadDistricts = useCallback(async (sId = null) => {
    setDistrictsLoading(true);
    try {
      const params = sId ? { stateId: sId } : {};
      const res = await districtService.getAll(params);
      if (res.success) setDistricts(res.districts || []);
    } catch {
      toastManager.error('Failed to load districts');
    } finally {
      setDistrictsLoading(false);
    }
  }, []);

  const loadSubDistricts = useCallback(async (dId = null, sId = null) => {
    setSubDistrictsLoading(true);
    try {
      const params = {};
      if (dId) params.districtId = dId;
      if (sId) params.stateId = sId;
      const res = await subDistrictService.getAll(params);
      if (res.success) setSubDistricts(res.subDistricts || []);
    } catch {
      toastManager.error('Failed to load sub-districts');
    } finally {
      setSubDistrictsLoading(false);
    }
  }, []);

  // Initial load: states
  useEffect(() => {
    loadStates();
  }, [loadStates]);

  // Load districts / subdistricts depending on current tab and parameters
  useEffect(() => {
    if (activeTab === 'districts') {
      loadDistricts(stateIdParam || null);
    } else if (activeTab === 'subdistricts') {
      // Load districts for context/dropdowns
      loadDistricts(stateIdParam || null);
      loadSubDistricts(districtIdParam || null, stateIdParam || null);
    }
  }, [activeTab, stateIdParam, districtIdParam, loadDistricts, loadSubDistricts]);

  // ── Drill-down and Navigation Handlers ──────────────────────────────────────
  const handleDrillDownToDistricts = (state) => {
    setSearch('');
    setSearchParams({
      tab: 'districts',
      stateId: state._id
    });
  };

  const handleDrillDownToSubDistricts = (district) => {
    setSearch('');
    const sId = district.stateId?._id || district.stateId || stateIdParam;
    setSearchParams({
      tab: 'subdistricts',
      stateId: sId || '',
      districtId: district._id
    });
  };

  const handleGoToStates = () => {
    setSearch('');
    setSearchParams({ tab: 'states' });
  };

  const handleGoToDistricts = (sId = stateIdParam) => {
    setSearch('');
    const params = { tab: 'districts' };
    if (sId) params.stateId = sId;
    setSearchParams(params);
  };

  const handleStateFilterChange = (newSId) => {
    setSearch('');
    if (!newSId) {
      setSearchParams({ tab: activeTab });
    } else {
      if (activeTab === 'subdistricts') {
        setSearchParams({ tab: 'subdistricts', stateId: newSId });
      } else {
        setSearchParams({ tab: 'districts', stateId: newSId });
      }
    }
  };

  const handleDistrictFilterChange = (newDId) => {
    setSearch('');
    const params = { tab: 'subdistricts', stateId: stateIdParam };
    if (newDId) params.districtId = newDId;
    setSearchParams(params);
  };

  // ── State CRUD ─────────────────────────────────────────────────────────────
  const openStateModal = (state = null) => {
    setEditingState(state);
    setStateForm(state
      ? { name: state.name, code: state.code || '', isActive: state.isActive }
      : { name: '', code: '', isActive: true }
    );
    setStateCustom(false);
    setStateModal(true);
  };

  const addableStates = INDIAN_STATES.filter(
    s => !states.some(x => String(x.name).trim().toLowerCase() === s.name.toLowerCase())
  );

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
    } catch {
      toastManager.error('Toggle failed');
    }
  };

  // ── District CRUD ──────────────────────────────────────────────────────────
  const openDistrictModal = (district = null) => {
    if (!states.length) loadStates();
    setEditingDistrict(district);
    const defaultStateId = district
      ? (district.stateId?._id || district.stateId || '')
      : (stateIdParam || (states.find(s => s.isActive)?._id || ''));
    setDistrictForm(district
      ? { name: district.name, stateId: defaultStateId, isActive: district.isActive }
      : { name: '', stateId: defaultStateId, isActive: true }
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
      loadDistricts(stateIdParam || null);
      loadStates(); // Refresh district counts
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDeleteDistrict = async (district) => {
    if (!confirm(`Delete district "${district.name}"? This cannot be undone.`)) return;
    try {
      await districtService.delete(district._id);
      toastManager.success('District deleted');
      loadDistricts(stateIdParam || null);
      loadStates();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleToggleDistrict = async (district) => {
    try {
      await districtService.toggleStatus(district._id);
      toastManager.success(`District ${district.isActive ? 'deactivated' : 'activated'}`);
      loadDistricts(stateIdParam || null);
    } catch {
      toastManager.error('Toggle failed');
    }
  };

  // ── Sub-District CRUD ──────────────────────────────────────────────────────
  const openSubDistrictModal = (sd = null) => {
    if (!districts.length) loadDistricts(stateIdParam || null);
    if (!states.length) loadStates();
    setEditingSubDistrict(sd);
    const defaultDistrictId = sd
      ? (sd.districtId?._id || sd.districtId || '')
      : (districtIdParam || (districts.find(d => d.isActive)?._id || ''));

    setSubDistrictForm(sd
      ? { name: sd.name, districtId: defaultDistrictId, isActive: sd.isActive }
      : { name: '', districtId: defaultDistrictId, isActive: true }
    );
    setStateFilterForSubDist(stateIdParam || '');
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
      loadSubDistricts(districtIdParam || null, stateIdParam || null);
      loadDistricts(stateIdParam || null); // Refresh subdistrict counts
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDeleteSubDistrict = async (sd) => {
    if (!confirm(`Delete sub-district "${sd.name}"? This cannot be undone.`)) return;
    try {
      await subDistrictService.delete(sd._id);
      toastManager.success('Sub-district deleted');
      loadSubDistricts(districtIdParam || null, stateIdParam || null);
      loadDistricts(stateIdParam || null);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleToggleSubDistrict = async (sd) => {
    try {
      await subDistrictService.toggleStatus(sd._id);
      toastManager.success(`Sub-district ${sd.isActive ? 'deactivated' : 'activated'}`);
      loadSubDistricts(districtIdParam || null, stateIdParam || null);
    } catch {
      toastManager.error('Toggle failed');
    }
  };

  // ── Search filter ─────────────────────────────────────────────────────────
  const filterBySearch = (items) => {
    if (!search.trim()) return items;
    const lower = search.toLowerCase();
    return items.filter(i =>
      i.name?.toLowerCase().includes(lower) ||
      i.code?.toLowerCase().includes(lower) ||
      i.stateName?.toLowerCase().includes(lower) ||
      i.districtName?.toLowerCase().includes(lower)
    );
  };

  const loading = statesLoading || districtsLoading || subDistrictsLoading;

  return (
    <div className="p-6 space-y-6">
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Geographic Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Click into any State to view its Districts, or click a District to manage its Sub-Districts (Tehsils).
          </p>
        </div>

        {/* Global scope note */}
        <div className="flex items-center gap-2.5 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
          <FiGlobe className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-emerald-800">GLOBAL_INDIA = Entire India</span>
        </div>
      </div>

      {/* ── Interactive Breadcrumb & Hierarchy Navigator ─────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 sm:p-5 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center flex-wrap gap-2 text-sm">
            {/* Level 1: All States */}
            <button
              onClick={handleGoToStates}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'states'
                  ? 'bg-teal-500 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <FiGlobe className="w-4 h-4" />
              <span>All States</span>
              <span className="text-xs bg-slate-800/80 px-1.5 py-0.5 rounded-full text-slate-300">
                {states.length}
              </span>
            </button>

            {/* Level 2: State breadcrumb */}
            {activeTab !== 'states' && (
              <>
                <FiChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <button
                  onClick={() => handleGoToDistricts(stateIdParam)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                    activeTab === 'districts'
                      ? 'bg-teal-500 text-white shadow'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <FiMapPin className="w-4 h-4" />
                  <span>{selectedState?.name || 'All Districts'}</span>
                  {selectedState && (
                    <span className="text-xs bg-slate-800/80 px-1.5 py-0.5 rounded-full text-teal-200">
                      {selectedState.districtCount ?? districts.length} Districts
                    </span>
                  )}
                </button>
              </>
            )}

            {/* Level 3: District breadcrumb */}
            {activeTab === 'subdistricts' && (
              <>
                <FiChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium bg-teal-500 text-white shadow">
                  <FiLayers className="w-4 h-4" />
                  <span>{selectedDistrict?.name || 'All Sub-Districts'}</span>
                  {selectedDistrict && (
                    <span className="text-xs bg-slate-800/80 px-1.5 py-0.5 rounded-full text-teal-200">
                      {selectedDistrict.subDistrictCount ?? subDistricts.length} Sub-districts
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Quick Context Switchers & Back Action */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* Quick State Switcher (when on Districts or Sub-Districts) */}
            {activeTab !== 'states' && (
              <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs">
                <FiFilter className="text-teal-400 w-3.5 h-3.5" />
                <span className="text-slate-400">State:</span>
                <select
                  value={stateIdParam}
                  onChange={(e) => handleStateFilterChange(e.target.value)}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer pr-1"
                >
                  <option value="" className="text-gray-900">All States</option>
                  {states.map(s => (
                    <option key={s._id} value={s._id} className="text-gray-900">
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick District Switcher (when on Sub-Districts) */}
            {activeTab === 'subdistricts' && (
              <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs">
                <FiFilter className="text-teal-400 w-3.5 h-3.5" />
                <span className="text-slate-400">District:</span>
                <select
                  value={districtIdParam}
                  onChange={(e) => handleDistrictFilterChange(e.target.value)}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer pr-1"
                >
                  <option value="" className="text-gray-900">All Districts</option>
                  {districts.map(d => (
                    <option key={d._id} value={d._id} className="text-gray-900">
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Back Button */}
            {activeTab === 'subdistricts' && (
              <button
                onClick={() => handleGoToDistricts(stateIdParam)}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <FiArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Districts</span>
              </button>
            )}

            {activeTab === 'districts' && (
              <button
                onClick={handleGoToStates}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <FiArrowLeft className="w-3.5 h-3.5" />
                <span>Back to States</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── View Header & Actions Toolbar ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Tabs toggle */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'states') handleGoToStates();
                else if (tab.id === 'districts') handleGoToDistricts(stateIdParam);
                else {
                  setSearchParams({
                    tab: 'subdistricts',
                    stateId: stateIdParam,
                    districtId: districtIdParam
                  });
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + Add Button */}
        <div className="flex gap-2.5 items-center flex-1 max-w-lg justify-end">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={
                activeTab === 'states'
                  ? 'Search states...'
                  : activeTab === 'districts'
                  ? selectedState ? `Search districts in ${selectedState.name}...` : 'Search districts...'
                  : selectedDistrict ? `Search sub-districts in ${selectedDistrict.name}...` : 'Search sub-districts...'
              }
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            />
          </div>

          <button
            onClick={() => {
              if (activeTab === 'states') openStateModal();
              else if (activeTab === 'districts') openDistrictModal();
              else openSubDistrictModal();
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors flex-shrink-0 shadow-sm"
          >
            <FiPlus className="w-4 h-4" />
            <span>
              {activeTab === 'states'
                ? 'Add State'
                : activeTab === 'districts'
                ? selectedState ? `Add District to ${selectedState.name}` : 'Add District'
                : selectedDistrict ? `Add Sub-District to ${selectedDistrict.name}` : 'Add Sub-District'
              }
            </span>
          </button>
        </div>
      </div>

      {/* ── Context Notification Pill ────────────────────────────────────────── */}
      {activeTab === 'districts' && selectedState && (
        <div className="flex items-center justify-between px-4 py-3 bg-teal-50/70 border border-teal-200 rounded-xl text-sm text-teal-900">
          <div className="flex items-center gap-2">
            <FiMapPin className="w-4 h-4 text-teal-600" />
            <span>
              Showing districts for <strong>{selectedState.name}</strong> ({filterBySearch(districts).length} found).
              Click on any district to explore its <strong>Sub-Districts (Tehsils)</strong>.
            </span>
          </div>
          <button
            onClick={() => handleStateFilterChange('')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline flex-shrink-0 ml-2"
          >
            Show All Districts
          </button>
        </div>
      )}

      {activeTab === 'subdistricts' && (selectedDistrict || selectedState) && (
        <div className="flex items-center justify-between px-4 py-3 bg-blue-50/70 border border-blue-200 rounded-xl text-sm text-blue-900">
          <div className="flex items-center gap-2">
            <FiLayers className="w-4 h-4 text-blue-600" />
            <span>
              Showing sub-districts for{' '}
              <strong>{selectedDistrict ? selectedDistrict.name : 'all districts'}</strong>
              {selectedState && <span> in <strong>{selectedState.name}</strong></span>}
              {' '}({filterBySearch(subDistricts).length} found).
            </span>
          </div>
          <button
            onClick={() => {
              setSearchParams({ tab: 'subdistricts' });
            }}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline flex-shrink-0 ml-2"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading geographic data...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {/* States Table Headers */}
                  {activeTab === 'states' && (
                    <>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State Name</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Districts</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="py-3.5 px-5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </>
                  )}

                  {/* Districts Table Headers */}
                  {activeTab === 'districts' && (
                    <>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">District Name</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sub-Districts</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="py-3.5 px-5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </>
                  )}

                  {/* Sub-Districts Table Headers */}
                  {activeTab === 'subdistricts' && (
                    <>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sub-District Name</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">District</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                      <th className="py-3.5 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="py-3.5 px-5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* ── States Rows ─────────────────────────────────────────── */}
                {activeTab === 'states' && filterBySearch(states).map(s => (
                  <tr
                    key={s._id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    {/* Name: clickable to drill down */}
                    <td className="py-3.5 px-5 font-semibold text-gray-900">
                      <button
                        onClick={() => handleDrillDownToDistricts(s)}
                        className="text-left font-semibold text-gray-900 hover:text-teal-600 transition-colors flex items-center gap-2 group-hover:translate-x-0.5 duration-150"
                      >
                        <span className="w-2 h-2 rounded-full bg-teal-500/70" />
                        <span>{s.name}</span>
                      </button>
                    </td>

                    <td className="py-3.5 px-5 text-gray-500 text-sm font-mono">{s.code || '—'}</td>

                    {/* Districts Pill */}
                    <td className="py-3.5 px-5">
                      <button
                        onClick={() => handleDrillDownToDistricts(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-all shadow-2xs group/btn"
                        title="Click to view all districts of this state"
                      >
                        <span>{s.districtCount ?? 0} Districts</span>
                        <FiChevronRight className="w-3.5 h-3.5 text-teal-500 group-hover/btn:translate-x-0.5 transition-transform" />
                      </button>
                    </td>

                    <td className="py-3.5 px-5">
                      <Badge active={s.isActive} />
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDrillDownToDistricts(s)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors mr-1 flex items-center gap-1"
                          title="Open Districts"
                        >
                          <span>Open</span>
                          <FiChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openStateModal(s)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleState(s)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title={s.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {s.isActive ? (
                            <FiToggleRight className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <FiToggleLeft className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteState(s)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* ── Districts Rows ──────────────────────────────────────── */}
                {activeTab === 'districts' && filterBySearch(districts).map(d => (
                  <tr
                    key={d._id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    {/* Name: clickable to drill down to Sub-Districts */}
                    <td className="py-3.5 px-5 font-semibold text-gray-900">
                      <button
                        onClick={() => handleDrillDownToSubDistricts(d)}
                        className="text-left font-semibold text-gray-900 hover:text-teal-600 transition-colors flex items-center gap-2 group-hover:translate-x-0.5 duration-150"
                      >
                        <span className="w-2 h-2 rounded-full bg-blue-500/70" />
                        <span>{d.name}</span>
                      </button>
                    </td>

                    <td className="py-3.5 px-5 text-gray-600 text-sm">
                      {d.stateId?.name || d.stateName || '—'}
                    </td>

                    {/* Sub-Districts Pill */}
                    <td className="py-3.5 px-5">
                      <button
                        onClick={() => handleDrillDownToSubDistricts(d)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all shadow-2xs group/btn"
                        title="Click to view all sub-districts (tehsils) of this district"
                      >
                        <span>{d.subDistrictCount ?? 0} Sub-Districts</span>
                        <FiChevronRight className="w-3.5 h-3.5 text-blue-500 group-hover/btn:translate-x-0.5 transition-transform" />
                      </button>
                    </td>

                    <td className="py-3.5 px-5">
                      <Badge active={d.isActive} />
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDrillDownToSubDistricts(d)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors mr-1 flex items-center gap-1"
                          title="Open Sub-Districts"
                        >
                          <span>Open</span>
                          <FiChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openDistrictModal(d)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleDistrict(d)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title={d.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {d.isActive ? (
                            <FiToggleRight className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <FiToggleLeft className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteDistrict(d)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* ── Sub-Districts Rows ───────────────────────────────────── */}
                {activeTab === 'subdistricts' && filterBySearch(subDistricts).map(sd => (
                  <tr
                    key={sd._id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="py-3.5 px-5 font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500/70" />
                      <span>{sd.name}</span>
                    </td>

                    <td className="py-3.5 px-5 text-gray-600 text-sm">
                      {sd.districtId?.name || sd.districtName || '—'}
                    </td>

                    <td className="py-3.5 px-5 text-gray-600 text-sm">
                      {sd.stateId?.name || sd.stateName || '—'}
                    </td>

                    <td className="py-3.5 px-5">
                      <Badge active={sd.isActive} />
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openSubDistrictModal(sd)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleSubDistrict(sd)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title={sd.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {sd.isActive ? (
                            <FiToggleRight className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <FiToggleLeft className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteSubDistrict(sd)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* ── Empty States ────────────────────────────────────────── */}
                {activeTab === 'states' && !statesLoading && filterBySearch(states).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-gray-500">
                      <FiGlobe className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="font-medium text-gray-700">No states found.</p>
                      <p className="text-xs text-gray-400 mt-1">Get started by adding your first state or union territory.</p>
                      <button
                        onClick={() => openStateModal()}
                        className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 transition-colors"
                      >
                        + Add State
                      </button>
                    </td>
                  </tr>
                )}

                {activeTab === 'districts' && !districtsLoading && filterBySearch(districts).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-gray-500">
                      <FiMapPin className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="font-medium text-gray-700">
                        {selectedState ? `No districts found in ${selectedState.name}.` : 'No districts found.'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Add a district to define local regional boundaries.
                      </p>
                      <button
                        onClick={() => openDistrictModal()}
                        className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 transition-colors"
                      >
                        + Add District {selectedState ? `to ${selectedState.name}` : ''}
                      </button>
                    </td>
                  </tr>
                )}

                {activeTab === 'subdistricts' && !subDistrictsLoading && filterBySearch(subDistricts).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-gray-500">
                      <FiLayers className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="font-medium text-gray-700">
                        {selectedDistrict ? `No sub-districts found in ${selectedDistrict.name}.` : 'No sub-districts found.'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Add tehsils, blocks, or mandals under this district.
                      </p>
                      <button
                        onClick={() => openSubDistrictModal()}
                        className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 transition-colors"
                      >
                        + Add Sub-District {selectedDistrict ? `to ${selectedDistrict.name}` : ''}
                      </button>
                    </td>
                  </tr>
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
            {editingState || stateCustom ? (
              <input
                type="text"
                required
                value={stateForm.name}
                onChange={e => setStateForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Madhya Pradesh"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            ) : (
              <CustomSelect
                required
                value={stateForm.name}
                onChange={val => {
                  const picked = INDIAN_STATES.find(s => s.name === val);
                  setStateForm(p => ({ ...p, name: picked?.name || '', code: picked?.code || '' }));
                }}
                options={addableStates.map(s => ({ value: s.name, label: s.name }))}
                placeholder="Select a state or union territory"
                searchPlaceholder="Search states..."
                footerOption={{
                  label: 'Other (type a name)...',
                  onClick: () => {
                    setStateCustom(true);
                    setStateForm(p => ({ ...p, name: '', code: '' }));
                  }
                }}
              />
            )}
            {!editingState && !stateCustom && addableStates.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">Every state and union territory is already added.</p>
            )}
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
            <button
              type="button"
              onClick={() => setStateModal(false)}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors"
            >
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
            <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
            <CustomSelect
              required
              value={districtForm.stateId}
              onChange={sId => setDistrictForm(p => ({ ...p, stateId: sId }))}
              options={states.filter(s => s.isActive).map(s => ({ value: s._id, label: s.name }))}
              placeholder="Select a state"
              searchPlaceholder="Search states..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">District Name *</label>
            <GooglePlaceList
              required
              level="district"
              editing={Boolean(editingDistrict)}
              value={districtForm.name}
              onChange={name => setDistrictForm(p => ({ ...p, name }))}
              stateName={states.find(s => s._id === districtForm.stateId)?.name || ''}
              existingNames={districts.filter(d => (d.stateId?._id || d.stateId) === districtForm.stateId).map(d => d.name)}
              placeholder="e.g. Indore"
            />
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
            <button
              type="button"
              onClick={() => setDistrictModal(false)}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors"
            >
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by State (Optional)</label>
            <CustomSelect
              value={stateFilterForSubDist}
              onChange={sId => {
                setStateFilterForSubDist(sId);
                if (sId) {
                  setFilteredDistricts(districts.filter(d => (d.stateId?._id || d.stateId) === sId));
                } else {
                  setFilteredDistricts(districts);
                }
              }}
              options={[
                { value: '', label: 'All States' },
                ...states.map(s => ({ value: s._id, label: s.name }))
              ]}
              placeholder="All States"
              searchPlaceholder="Search states..."
              className="mb-3"
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">District *</label>
            <CustomSelect
              required
              value={subDistrictForm.districtId}
              onChange={dId => setSubDistrictForm(p => ({ ...p, districtId: dId }))}
              options={(stateFilterForSubDist ? filteredDistricts : districts)
                .filter(d => d.isActive)
                .map(d => ({
                  value: d._id,
                  label: d.name,
                  subtext: d.stateName || ''
                }))
              }
              placeholder="Select a district"
              searchPlaceholder="Search districts..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sub-District Name *</label>
            <GooglePlaceList
              required
              level="subdistrict"
              editing={Boolean(editingSubDistrict)}
              value={subDistrictForm.name}
              onChange={name => setSubDistrictForm(p => ({ ...p, name }))}
              districtName={districts.find(d => d._id === subDistrictForm.districtId)?.name || ''}
              stateName={
                districts.find(d => d._id === subDistrictForm.districtId)?.stateName ||
                states.find(s => s._id === stateFilterForSubDist)?.name || ''
              }
              existingNames={subDistricts.filter(sd => (sd.districtId?._id || sd.districtId) === subDistrictForm.districtId).map(sd => sd.name)}
              placeholder="e.g. Depalpur"
            />
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
            <button
              type="button"
              onClick={() => setSubDistrictModal(false)}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors"
            >
              {editingSubDistrict ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default GeographicManagement;
