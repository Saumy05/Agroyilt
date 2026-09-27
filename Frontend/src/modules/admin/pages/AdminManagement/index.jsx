import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiUsers, FiPlus, FiEdit2, FiTrash2, FiLock, FiUnlock, FiShield, FiMapPin,
  FiSearch, FiFilter, FiRefreshCw, FiX, FiCheck, FiChevronDown, FiChevronUp,
  FiActivity, FiAlertCircle, FiInfo, FiEye, FiSliders, FiClock, FiGlobe,
  FiDollarSign, FiAward, FiUserCheck, FiDownload, FiCalendar, FiChevronLeft,
  FiChevronRight, FiPieChart, FiFileText
} from 'react-icons/fi';
import {
  getAllAdmins, createAdmin, updateAdmin, deleteAdmin,
  toggleAdminStatus, updatePermissions, getAuditLogs, getAdminRegistrations,
  getAttributionSummary, exportAttributionData,
  getDistricts, getSubDistricts
} from '../../services/adminManagementService';
import { cityService } from '../../services/cityService';
import {
  PERMISSION_GROUPS,
  getAllPermissionKeys,
  buildDefaultPermissions,
  countEnabledPermissions,
  groupColorMap
} from '../../utils/permissionsConfig';
import { toastManager } from '../../../../utils/toastManager';
import authStorage from '../../../../utils/authStorage';
import SalaryPayrollView from './SalaryPayrollView';

// ── Helpers ────────────────────────────────────────────────────────────────

const SCOPE_LABELS = {
  GLOBAL: { label: 'Global Access', icon: FiGlobe, color: 'amber' },
  CITY: { label: 'City Scope', icon: FiMapPin, color: 'teal' },
  DISTRICT: { label: 'District Scope', icon: FiMapPin, color: 'blue' },
  SUB_DISTRICT: { label: 'Sub-District Scope', icon: FiMapPin, color: 'purple' }
};

const SCOPE_COLORS = {
  GLOBAL: 'bg-amber-100 text-amber-800 border-amber-200',
  CITY: 'bg-teal-100 text-teal-800 border-teal-200',
  DISTRICT: 'bg-blue-100 text-blue-800 border-blue-200',
  SUB_DISTRICT: 'bg-purple-100 text-purple-800 border-purple-200'
};

const ROLE_COLORS = {
  super_admin: 'bg-amber-100 text-amber-800 border-amber-200',
  admin: 'bg-blue-100 text-blue-800 border-blue-200'
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const getScopeDisplay = (admin) => {
  if (admin.scopeType === 'GLOBAL' || admin.role === 'super_admin') return 'Global Access';
  if (admin.scopeType === 'SUB_DISTRICT') return admin.subDistrictName || 'Sub-District';
  if (admin.scopeType === 'DISTRICT') return admin.districtName || 'District';
  return admin.cityId?.name || admin.cityName || 'City';
};

// ── Sub-Components ─────────────────────────────────────────────────────────

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className={`bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center gap-4`}>
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
    </div>
  </div>
);

// ── Permission Editor ──────────────────────────────────────────────────────

const PermissionsEditor = ({ permissions, onChange }) => {
  const [expanded, setExpanded] = useState({});

  const toggleGroup = (group) => {
    setExpanded(p => ({ ...p, [group]: !p[group] }));
  };

  const handleGroupToggle = (groupKeys, value) => {
    const updated = { ...permissions };
    groupKeys.forEach(k => { updated[k] = value; });
    onChange(updated);
  };

  const handleKeyToggle = (key) => {
    onChange({ ...permissions, [key]: !permissions[key] });
  };

  const totalEnabled = countEnabledPermissions(permissions);
  const totalKeys = getAllPermissionKeys().length;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">
          {totalEnabled} / {totalKeys} permissions enabled
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={() => {
            const all = {};
            PERMISSION_GROUPS.flatMap(g => g.keys).forEach(k => { all[k.key] = true; });
            onChange(all);
          }}
            className="text-xs text-blue-600 hover:underline">Enable All</button>
          <span className="text-gray-300">|</span>
          <button type="button" onClick={() => onChange(buildDefaultPermissions())}
            className="text-xs text-red-500 hover:underline">Disable All</button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
          style={{ width: totalKeys ? `${(totalEnabled / totalKeys) * 100}%` : '0%' }}
        />
      </div>

      {PERMISSION_GROUPS.map((group) => {
        const isOpen = expanded[group.group] !== false; // default open
        const groupKeys = group.keys.map(k => k.key);
        const enabledCount = groupKeys.filter(k => permissions[k]).length;
        const allEnabled = enabledCount === groupKeys.length;
        const colors = groupColorMap[group.color] || groupColorMap.blue;

        return (
          <div key={group.group} className={`rounded-xl border ${colors.border} overflow-hidden`}>
            {/* Group Header */}
            <div
              className={`flex items-center justify-between px-4 py-3 cursor-pointer ${colors.bg} hover:opacity-90 transition`}
              onClick={() => toggleGroup(group.group)}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{group.icon}</span>
                <span className={`text-sm font-semibold ${colors.text}`}>{group.group}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${colors.badge}`}>
                  {enabledCount}/{groupKeys.length}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleGroupToggle(groupKeys, !allEnabled); }}
                  className={`text-xs font-semibold px-2 py-1 rounded-md ${allEnabled ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'} transition`}
                >
                  {allEnabled ? 'Disable All' : 'Enable All'}
                </button>
                {isOpen ? <FiChevronUp className={`w-4 h-4 ${colors.text}`} /> : <FiChevronDown className={`w-4 h-4 ${colors.text}`} />}
              </div>
            </div>

            {/* Keys */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="p-3 bg-white grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.keys.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition group">
                        <div
                          onClick={() => handleKeyToggle(key)}
                          className={`w-5 h-5 rounded flex items-center justify-center border-2 cursor-pointer transition flex-shrink-0 ${permissions[key]
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 bg-white group-hover:border-blue-400'
                            }`}
                        >
                          {permissions[key] && <FiCheck className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};

// ── Admin Form Modal ───────────────────────────────────────────────────────

// ── Admin Access Summary Panel ─────────────────────────────────────────────

const AdminAccessSummary = ({ form }) => {
  const isSuperAdmin = form.role === 'super_admin';
  const totalEnabled = countEnabledPermissions(form.permissions);
  const totalKeys = getAllPermissionKeys().length;

  let territoryLabel = 'All Territories (Global)';
  let scopeBadge = { label: 'GLOBAL', color: 'bg-amber-100 text-amber-800 border-amber-300' };

  if (!isSuperAdmin) {
    if (form.scopeType === 'SUB_DISTRICT') {
      territoryLabel = [form.subDistrictName, form.districtName, form.cityName].filter(Boolean).join(', ') || 'Unassigned Sub-District';
      scopeBadge = { label: 'SUB-DISTRICT', color: 'bg-purple-100 text-purple-800 border-purple-300' };
    } else if (form.scopeType === 'DISTRICT') {
      territoryLabel = [form.districtName, form.cityName].filter(Boolean).join(', ') || 'Unassigned District';
      scopeBadge = { label: 'DISTRICT', color: 'bg-blue-100 text-blue-800 border-blue-300' };
    } else {
      territoryLabel = form.cityName || 'Unassigned City';
      scopeBadge = { label: 'CITY', color: 'bg-teal-100 text-teal-800 border-teal-300' };
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
            <FiShield className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Admin Access Summary</h4>
            <p className="text-[11px] text-slate-500">Live preview of geographic scope & operational authority</p>
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${scopeBadge.color}`}>
          {isSuperAdmin ? 'SUPER ADMIN' : scopeBadge.label}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-400">Territory & Geographic Boundary</span>
          <div className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
            <FiMapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="truncate">{territoryLabel}</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {isSuperAdmin
              ? 'Unrestricted access to all users, bookings, vendors, and revenue data across all regions.'
              : `Can only view and manage farmers, vendors, workers, and bookings restricted to: ${territoryLabel}.`}
          </p>
        </div>

        <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-400">Operational Authority</span>
          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
            <FiLock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>{isSuperAdmin ? 'All 100% Granted' : `${totalEnabled} of ${totalKeys} privileges enabled`}</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {PERMISSION_GROUPS.map(g => {
              const keys = g.keys.map(k => k.key);
              const enabled = isSuperAdmin || keys.some(k => form.permissions?.[k]);
              if (!enabled) return null;
              return (
                <span key={g.group} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  {g.group}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Admin Form Modal ───────────────────────────────────────────────────────

const AdminFormModal = ({ admin, cities, onClose, onSave, defaultTab = 'basic' }) => {
  const isEdit = !!(admin?.id || admin?._id);
  const [form, setForm] = useState({
    name: admin?.name || '',
    email: admin?.email || '',
    password: '',
    role: admin?.role || 'admin',
    scopeType: admin?.scopeType || 'CITY',
    cityId: admin?.cityId?._id || admin?.cityId || '',
    cityName: admin?.cityName || '',
    districtId: admin?.districtId?._id || admin?.districtId || '',
    districtName: admin?.districtName || '',
    subDistrictId: admin?.subDistrictId?._id || admin?.subDistrictId || '',
    subDistrictName: admin?.subDistrictName || '',
    permissions: { ...buildDefaultPermissions(), ...(admin?.permissions || {}) },
    salary: {
      baseSalary: admin?.salary?.baseSalary !== undefined && admin?.salary?.baseSalary !== 0 ? admin.salary.baseSalary : '',
      payFrequency: admin?.salary?.payFrequency || 'monthly',
      status: admin?.salary?.status || 'ACTIVE',
      effectiveFrom: admin?.salary?.effectiveFrom ? new Date(admin.salary.effectiveFrom).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      effectiveTo: admin?.salary?.effectiveTo ? new Date(admin.salary.effectiveTo).toISOString().split('T')[0] : '',
      changeReason: '',
      farmerIncentive: admin?.salary?.farmerIncentive !== undefined && admin?.salary?.farmerIncentive !== 0 ? admin.salary.farmerIncentive : '',
      vendorIncentive: admin?.salary?.vendorIncentive !== undefined && admin?.salary?.vendorIncentive !== 0 ? admin.salary.vendorIncentive : '',
      workerIncentive: admin?.salary?.workerIncentive !== undefined && admin?.salary?.workerIncentive !== 0 ? admin.salary.workerIncentive : '',
      bankDetails: {
        accountNumber: admin?.salary?.bankDetails?.accountNumber || '',
        ifscCode: admin?.salary?.bankDetails?.ifscCode || '',
        bankName: admin?.salary?.bankDetails?.bankName || '',
        accountHolderName: admin?.salary?.bankDetails?.accountHolderName || '',
        upiId: admin?.salary?.bankDetails?.upiId || ''
      },
      notes: admin?.salary?.notes || ''
    }
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab); // 'basic' | 'permissions' | 'compensation'
  const [showPassword, setShowPassword] = useState(false);
  const [overrideBankDetails, setOverrideBankDetails] = useState(false);
  const [showSalaryHistory, setShowSalaryHistory] = useState(false);

  // Geographic Scope Dropdown Data
  const [districts, setDistricts] = useState([]);
  const [subDistricts, setSubDistricts] = useState([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingSubDistricts, setLoadingSubDistricts] = useState(false);
  const [isCustomDistrict, setIsCustomDistrict] = useState(false);
  const [isCustomSubDistrict, setIsCustomSubDistrict] = useState(false);

  // Fetch districts when cityId changes
  useEffect(() => {
    if (!form.cityId) {
      setDistricts([]);
      setSubDistricts([]);
      return;
    }
    let isMounted = true;
    const fetchDistricts = async () => {
      setLoadingDistricts(true);
      try {
        const res = await getDistricts(form.cityId);
        if (isMounted) {
          const list = res?.data || [];
          setDistricts(list);
          if (form.districtName && !form.districtId && !list.some(d => (d.name || '').toLowerCase() === form.districtName.toLowerCase())) {
            setIsCustomDistrict(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch districts:', err);
      } finally {
        if (isMounted) setLoadingDistricts(false);
      }
    };
    fetchDistricts();
    return () => { isMounted = false; };
  }, [form.cityId]);

  // Fetch sub-districts when districtId changes
  useEffect(() => {
    if (!form.districtId || form.scopeType !== 'SUB_DISTRICT') {
      setSubDistricts([]);
      return;
    }
    let isMounted = true;
    const fetchSubDistricts = async () => {
      setLoadingSubDistricts(true);
      try {
        const res = await getSubDistricts(form.districtId);
        if (isMounted) {
          const list = res?.data || [];
          setSubDistricts(list);
          if (form.subDistrictName && !form.subDistrictId && !list.some(sd => (sd.name || '').toLowerCase() === form.subDistrictName.toLowerCase())) {
            setIsCustomSubDistrict(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch sub-districts:', err);
      } finally {
        if (isMounted) setLoadingSubDistricts(false);
      }
    };
    fetchSubDistricts();
    return () => { isMounted = false; };
  }, [form.districtId, form.scopeType]);

  const handleDistrictSelect = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomDistrict(true);
      setForm(p => ({ ...p, districtId: '', districtName: '', subDistrictId: '', subDistrictName: '' }));
      return;
    }
    setIsCustomDistrict(false);
    if (!val) {
      setForm(p => ({ ...p, districtId: '', districtName: '', subDistrictId: '', subDistrictName: '' }));
      return;
    }
    const dist = districts.find(d => (d._id || d.id) === val);
    setForm(p => ({
      ...p,
      districtId: val,
      districtName: dist?.name || '',
      subDistrictId: '',
      subDistrictName: ''
    }));
  };

  const handleSubDistrictSelect = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomSubDistrict(true);
      setForm(p => ({ ...p, subDistrictId: '', subDistrictName: '' }));
      return;
    }
    setIsCustomSubDistrict(false);
    if (!val) {
      setForm(p => ({ ...p, subDistrictId: '', subDistrictName: '' }));
      return;
    }
    const subDist = subDistricts.find(sd => (sd._id || sd.id) === val);
    setForm(p => ({
      ...p,
      subDistrictId: val,
      subDistrictName: subDist?.name || ''
    }));
  };

  const hasBankDetails = Boolean(
    form.salary?.bankDetails?.accountNumber || form.salary?.bankDetails?.upiId
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));

    // Auto-set scope based on role
    if (name === 'role' && value === 'super_admin') {
      setForm(p => ({ ...p, role: value, scopeType: 'GLOBAL' }));
    }

    // Auto-fill cityName and reset lower scopes
    if (name === 'cityId') {
      const city = cities.find(c => (c._id || c.id) === value);
      setForm(p => ({
        ...p,
        cityId: value,
        cityName: city?.name || '',
        districtId: '',
        districtName: '',
        subDistrictId: '',
        subDistrictName: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email) return toastManager.error('Name and email are required');
    if (!isEdit && !form.password) return toastManager.error('Password is required');
    if (!isEdit && form.password.length < 6) return toastManager.error('Password must be at least 6 characters');

    setLoading(true);
    try {
      const payload = {
        ...form,
        salary: {
          ...form.salary,
          baseSalary: form.salary.baseSalary === '' ? 0 : Number(form.salary.baseSalary),
          farmerIncentive: form.salary.farmerIncentive === '' ? 0 : Number(form.salary.farmerIncentive),
          vendorIncentive: form.salary.vendorIncentive === '' ? 0 : Number(form.salary.vendorIncentive),
          workerIncentive: form.salary.workerIncentive === '' ? 0 : Number(form.salary.workerIncentive),
          status: form.salary.status || 'ACTIVE',
          effectiveFrom: form.salary.effectiveFrom || null,
          effectiveTo: form.salary.effectiveTo || null,
          changeReason: form.salary.changeReason || ''
        }
      };
      if (isEdit && !payload.password) delete payload.password;

      if (isEdit) {
        await updateAdmin(admin.id, payload);
        toastManager.success('Admin updated successfully');
      } else {
        await createAdmin(payload);
        toastManager.success('Admin created successfully');
      }
      onSave();
      onClose();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-slate-800 to-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <FiShield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Administrator' : 'Create New Administrator'}</h2>
              <p className="text-xs text-slate-300">Configure access scope and permissions</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition">
            <FiX className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {[
            { id: 'basic', label: 'Basic Info & Scope' },
            { id: 'permissions', label: 'Permissions', disabled: form.role === 'super_admin' },
            { id: 'compensation', label: 'Salary & Compensation' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`flex-1 py-3 text-sm font-semibold transition border-b-2 ${activeTab === tab.id
                ? 'text-blue-600 border-blue-600 bg-blue-50/50'
                : tab.disabled
                  ? 'text-gray-300 border-transparent cursor-not-allowed'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
            >
              {tab.label}
              {tab.id === 'permissions' && form.role !== 'super_admin' && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">
                  {countEnabledPermissions(form.permissions)}
                </span>
              )}
              {tab.id === 'permissions' && form.role === 'super_admin' && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">All</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form id="admin-form" onSubmit={handleSubmit}>
            {activeTab === 'basic' && (
              <div className="space-y-5">
                {/* Name & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Full Name *</label>
                    <input name="name" value={form.name} onChange={handleChange} required
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="e.g. Ramesh Sharma" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Email Address *</label>
                    <input name="email" type="email" value={form.email} onChange={handleChange} required
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="admin@example.com" />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                    {isEdit ? 'New Password (leave blank to keep)' : 'Password *'}
                  </label>
                  <div className="relative">
                    <input
                      name="password" type={showPassword ? 'text' : 'password'}
                      value={form.password} onChange={handleChange}
                      className="w-full px-4 py-2.5 pr-12 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Min. 6 characters" />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <FiEye className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Role */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Role *</label>
                  <select name="role" value={form.role} onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  {form.role === 'super_admin' && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <FiAlertCircle className="w-3 h-3" /> Super Admin has unrestricted global access to everything.
                    </p>
                  )}
                </div>

                {/* Scope (only for admin role) */}
                {form.role === 'admin' && (
                  <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2">
                      <FiMapPin className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-semibold text-slate-700">Geographic Scope</span>
                      <span className="text-xs text-slate-400">— Limits what data this admin can see</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Scope Type</label>
                      <select name="scopeType" value={form.scopeType} onChange={handleChange}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                        <option value="CITY">City</option>
                        <option value="DISTRICT">District</option>
                        <option value="SUB_DISTRICT">Sub-District</option>
                      </select>
                    </div>

                    {/* City Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Assign City *</label>
                      <select name="cityId" value={form.cityId} onChange={handleChange}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                        <option value="">— Select City —</option>
                        {cities.map(c => (
                          <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* District (if scope is DISTRICT or SUB_DISTRICT) */}
                    {(form.scopeType === 'DISTRICT' || form.scopeType === 'SUB_DISTRICT') && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-gray-500 uppercase">District *</label>
                          {districts.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsCustomDistrict(!isCustomDistrict);
                                if (!isCustomDistrict) setForm(p => ({ ...p, districtId: '' }));
                              }}
                              className="text-[11px] text-blue-600 hover:underline"
                            >
                              {isCustomDistrict ? '← Select from registered districts' : '✏️ Custom entry'}
                            </button>
                          )}
                        </div>

                        {!isCustomDistrict && districts.length > 0 ? (
                          <select
                            value={form.districtId}
                            onChange={handleDistrictSelect}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                          >
                            <option value="">{loadingDistricts ? 'Loading districts...' : '— Select District —'}</option>
                            {districts.map(d => (
                              <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
                            ))}
                            <option value="__custom__">✏️ Custom / Other District</option>
                          </select>
                        ) : (
                          <input
                            name="districtName"
                            value={form.districtName}
                            onChange={handleChange}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder={loadingDistricts ? 'Loading...' : 'e.g. Nagpur District'}
                          />
                        )}
                      </div>
                    )}

                    {/* Sub-District */}
                    {form.scopeType === 'SUB_DISTRICT' && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-gray-500 uppercase">Sub-District / Taluka *</label>
                          {subDistricts.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsCustomSubDistrict(!isCustomSubDistrict);
                                if (!isCustomSubDistrict) setForm(p => ({ ...p, subDistrictId: '' }));
                              }}
                              className="text-[11px] text-blue-600 hover:underline"
                            >
                              {isCustomSubDistrict ? '← Select from registered sub-districts' : '✏️ Custom entry'}
                            </button>
                          )}
                        </div>

                        {!isCustomSubDistrict && subDistricts.length > 0 ? (
                          <select
                            value={form.subDistrictId}
                            onChange={handleSubDistrictSelect}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                          >
                            <option value="">{loadingSubDistricts ? 'Loading sub-districts...' : '— Select Sub-District / Taluka —'}</option>
                            {subDistricts.map(sd => (
                              <option key={sd._id || sd.id} value={sd._id || sd.id}>{sd.name}</option>
                            ))}
                            <option value="__custom__">✏️ Custom / Other Sub-District</option>
                          </select>
                        ) : (
                          <input
                            name="subDistrictName"
                            value={form.subDistrictName}
                            onChange={handleChange}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder={loadingSubDistricts ? 'Loading...' : 'e.g. Katol Taluka'}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Admin Access Summary Panel */}
                <AdminAccessSummary form={form} />
              </div>
            )}

            {/* Permissions Tab */}
            {activeTab === 'permissions' && form.role !== 'super_admin' && (
              <PermissionsEditor
                permissions={form.permissions}
                onChange={(p) => setForm(prev => ({ ...prev, permissions: p }))}
              />
            )}

            {/* Compensation & Salary Tab */}
            {activeTab === 'compensation' && (
              <div className="space-y-5">
                {/* Live Accrued Compensation Preview if Admin has registrations */}
                {admin?.onboardedStats && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                        Accrued Performance Payout
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {admin.onboardedStats.total} Total Onboarded
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center mt-2">
                      <div className="bg-white/80 p-2 rounded-xl border border-blue-100">
                        <span className="text-[10px] text-gray-500 font-bold block">Base Salary</span>
                        <span className="text-sm font-black text-gray-800">₹{(Number(form.salary.baseSalary) || 0).toLocaleString()}</span>
                      </div>
                      <div className="bg-white/80 p-2 rounded-xl border border-green-100">
                        <span className="text-[10px] text-green-700 font-bold block">Farmers ({admin.onboardedStats.farmers})</span>
                        <span className="text-sm font-black text-green-700">₹{(admin.onboardedStats.farmers * (Number(form.salary.farmerIncentive) || 0)).toLocaleString()}</span>
                      </div>
                      <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                        <span className="text-[10px] text-amber-700 font-bold block">Vendors ({admin.onboardedStats.vendors})</span>
                        <span className="text-sm font-black text-amber-700">₹{(admin.onboardedStats.vendors * (Number(form.salary.vendorIncentive) || 0)).toLocaleString()}</span>
                      </div>
                      <div className="bg-white/80 p-2 rounded-xl border border-purple-100">
                        <span className="text-[10px] text-purple-700 font-bold block">Workers ({admin.onboardedStats.workers})</span>
                        <span className="text-sm font-black text-purple-700">₹{(admin.onboardedStats.workers * (Number(form.salary.workerIncentive) || 0)).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-blue-200/60 flex items-center justify-between text-xs">
                      <span className="text-blue-900 font-medium">Estimated Total Compensation:</span>
                      <span className="text-base font-black text-blue-900">
                        ₹{(
                          (Number(form.salary.baseSalary) || 0) +
                          (admin.onboardedStats.farmers * (Number(form.salary.farmerIncentive) || 0)) +
                          (admin.onboardedStats.vendors * (Number(form.salary.vendorIncentive) || 0)) +
                          (admin.onboardedStats.workers * (Number(form.salary.workerIncentive) || 0))
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Base Salary & Frequency & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Base Salary (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.salary.baseSalary}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm(p => ({
                          ...p,
                          salary: { ...p.salary, baseSalary: val === '' ? '' : Math.max(0, Number(val)) }
                        }));
                      }}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Payment Frequency</label>
                    <select
                      value={form.salary.payFrequency}
                      onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, payFrequency: e.target.value } }))}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Salary Status</label>
                    <select
                      value={form.salary.status}
                      onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, status: e.target.value } }))}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </div>
                </div>

                {/* Effective Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200/60">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">
                      Salary Effective From *
                    </label>
                    <input
                      type="date"
                      value={form.salary.effectiveFrom}
                      onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, effectiveFrom: e.target.value } }))}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">
                      Salary Effective To (Optional)
                    </label>
                    <input
                      type="date"
                      value={form.salary.effectiveTo}
                      onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, effectiveTo: e.target.value } }))}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    />
                  </div>
                </div>

                {/* Change Reason for Historical Audit Trail */}
                {isEdit && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                      Reason for Salary / Incentive Adjustment
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Annual revision, promotion, territory expansion..."
                      value={form.salary.changeReason}
                      onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, changeReason: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5 block">
                      Salary changes will create a new effective version without overwriting past months&apos; payroll records.
                    </span>
                  </div>
                )}

                {/* Historical Versions Preview */}
                {isEdit && admin?.salaryHistory && admin.salaryHistory.length > 0 && (
                  <div className="border border-blue-100 rounded-xl p-3 bg-blue-50/40 text-xs">
                    <button
                      type="button"
                      onClick={() => setShowSalaryHistory(!showSalaryHistory)}
                      className="flex items-center justify-between w-full font-bold text-blue-900 text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        <FiClock className="text-blue-600" />
                        View Salary Version History ({admin.salaryHistory.length} previous versions)
                      </span>
                      {showSalaryHistory ? <FiChevronUp /> : <FiChevronDown />}
                    </button>
                    {showSalaryHistory && (
                      <div className="mt-2.5 space-y-2 border-t border-blue-200/60 pt-2">
                        {admin.salaryHistory.map((hist, idx) => (
                          <div key={idx} className="bg-white p-2.5 rounded-lg border border-blue-100 text-[11px] space-y-0.5">
                            <div className="flex items-center justify-between font-bold text-gray-800">
                              <span>Version {hist.version || idx + 1}: ₹{hist.baseSalary.toLocaleString()}/mo</span>
                              <span className="text-[10px] font-normal text-gray-500">
                                {hist.effectiveFrom ? new Date(hist.effectiveFrom).toLocaleDateString() : 'Initial'} —{' '}
                                {hist.effectiveTo ? new Date(hist.effectiveTo).toLocaleDateString() : 'Superseded'}
                              </span>
                            </div>
                            <p className="text-gray-500 text-[10px]">
                              Incentives: 👨‍🌾 ₹{hist.farmerIncentive || 0} · 🚜 ₹{hist.vendorIncentive || 0} · 👷 ₹{hist.workerIncentive || 0}
                            </p>
                            {hist.changeReason && (
                              <p className="text-blue-800 italic text-[10px]">Reason: {hist.changeReason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Per-Registration Incentives */}
                <div>
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <FiAward className="text-amber-500" /> Onboarding &amp; Registration Incentives
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Per Farmer Added (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={form.salary.farmerIncentive}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm(p => ({
                            ...p,
                            salary: { ...p.salary, farmerIncentive: val === '' ? '' : Math.max(0, Number(val)) }
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Per Vendor Added (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={form.salary.vendorIncentive}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm(p => ({
                            ...p,
                            salary: { ...p.salary, vendorIncentive: val === '' ? '' : Math.max(0, Number(val)) }
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Per Worker Added (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={form.salary.workerIncentive}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm(p => ({
                            ...p,
                            salary: { ...p.salary, workerIncentive: val === '' ? '' : Math.max(0, Number(val)) }
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                {/* Bank / UPI Details - Self-managed by Admin, viewed & verified by Super Admin */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                        <FiDollarSign className="text-green-600" /> Bank &amp; Payout Information
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        Payout account filled by administrator in their profile for salary &amp; incentive disbursement.
                      </p>
                    </div>
                  </div>

                  {/* Mode 1: Admin already submitted bank details -> Show verified card */}
                  {hasBankDetails && !overrideBankDetails && (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">✓</span>
                          <div>
                            <p className="text-xs font-bold text-emerald-950">Submitted by Administrator in Profile</p>
                            <p className="text-[10px] text-emerald-700">Account verified as entered by {form.name || 'admin'}.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOverrideBankDetails(true)}
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white border border-emerald-300 rounded-lg shadow-xs hover:bg-emerald-50 transition"
                        >
                          ✏️ Edit / Override
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white p-3 rounded-lg border border-emerald-100 text-xs">
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-semibold">Account Holder</span>
                          <span className="font-semibold text-gray-800">{form.salary.bankDetails.accountHolderName || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-semibold">Bank Name</span>
                          <span className="font-semibold text-gray-800">{form.salary.bankDetails.bankName || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-semibold">Account Number</span>
                          <span className="font-mono font-semibold text-gray-900">{form.salary.bankDetails.accountNumber || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-semibold">IFSC Code</span>
                          <span className="font-mono font-bold text-indigo-700">{form.salary.bankDetails.ifscCode || '—'}</span>
                        </div>
                        {form.salary.bankDetails.upiId && (
                          <div className="sm:col-span-2 pt-1 border-t border-gray-100">
                            <span className="text-gray-400 block text-[10px] uppercase font-semibold">UPI ID</span>
                            <span className="font-mono font-semibold text-gray-800">{form.salary.bankDetails.upiId}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Mode 2: Admin has not submitted bank details yet -> Show guidance banner */}
                  {!hasBankDetails && !overrideBankDetails && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="text-base">⏳</span>
                          <div>
                            <p className="text-xs font-bold text-amber-900">Pending Submission by Administrator</p>
                            <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                              Admins fill their bank details directly in their portal under <strong>Settings → Profile → Bank &amp; Payout Information</strong>. Once {form.name || 'this admin'} saves their details, it will appear here automatically.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOverrideBankDetails(true)}
                          className="shrink-0 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:text-amber-950 bg-white border border-amber-300 rounded-lg shadow-xs hover:bg-amber-100/50 transition"
                        >
                          + Enter Manually
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mode 3: Manual override / edit enabled by Super Admin */}
                  {overrideBankDetails && (
                    <div className="space-y-3 bg-blue-50/40 p-3.5 rounded-xl border border-blue-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                          <span>✏️</span> Manual Entry / Override Mode
                        </div>
                        <button
                          type="button"
                          onClick={() => setOverrideBankDetails(false)}
                          className="text-xs text-blue-700 hover:text-blue-900 font-semibold underline"
                        >
                          {hasBankDetails ? 'Cancel Override' : 'Cancel Manual Entry'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Account Holder Name</label>
                          <input
                            type="text"
                            value={form.salary.bankDetails.accountHolderName}
                            onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, bankDetails: { ...p.salary.bankDetails, accountHolderName: e.target.value } } }))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Full name as in passbook"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Bank Name</label>
                          <input
                            type="text"
                            value={form.salary.bankDetails.bankName}
                            onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, bankDetails: { ...p.salary.bankDetails, bankName: e.target.value } } }))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. State Bank of India"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Account Number</label>
                          <input
                            type="text"
                            value={form.salary.bankDetails.accountNumber}
                            onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, bankDetails: { ...p.salary.bankDetails, accountNumber: e.target.value } } }))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                            placeholder="Account number"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">IFSC Code</label>
                          <input
                            type="text"
                            value={form.salary.bankDetails.ifscCode}
                            onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, bankDetails: { ...p.salary.bankDetails, ifscCode: e.target.value.toUpperCase() } } }))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none font-mono uppercase"
                            placeholder="e.g. SBIN0001234"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">UPI ID (Optional)</label>
                          <input
                            type="text"
                            value={form.salary.bankDetails.upiId}
                            onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, bankDetails: { ...p.salary.bankDetails, upiId: e.target.value } } }))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. admin@upi"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Compensation Notes</label>
                  <textarea
                    rows="2"
                    value={form.salary.notes}
                    onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, notes: e.target.value } }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Internal compensation notes, joining agreement, terms..."
                  />
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
            Cancel
          </button>
          <button
            form="admin-form" type="submit" disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 flex items-center gap-2 shadow-lg shadow-blue-200 transition"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiCheck className="w-4 h-4" />}
            {isEdit ? 'Save Changes' : 'Create Admin'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Permissions Panel (quick edit) ─────────────────────────────────────────

const PermissionsPanel = ({ admin, onClose, onSave }) => {
  const [permissions, setPermissions] = useState({ ...buildDefaultPermissions(), ...(admin?.permissions || {}) });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await updatePermissions(admin._id || admin.id, permissions);
      toastManager.success('Permissions updated');
      onSave();
      onClose();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to update permissions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-blue-700 to-indigo-700">
          <div>
            <h2 className="text-base font-bold text-white">Manage Permissions</h2>
            <p className="text-xs text-blue-200 mt-0.5">{admin.name} · {admin.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <FiX className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <PermissionsEditor permissions={permissions} onChange={setPermissions} />
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={handleSave} disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60 transition">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiCheck className="w-4 h-4" />}
            Save Permissions
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Audit Log Drawer ───────────────────────────────────────────────────────

const AuditLogDrawer = ({ onClose }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  const MODULE_COLORS = {
    AUTH: 'bg-slate-100 text-slate-700',
    ADMIN_MANAGEMENT: 'bg-amber-100 text-amber-700',
    USER_MANAGEMENT: 'bg-blue-100 text-blue-700',
    VENDOR_MANAGEMENT: 'bg-orange-100 text-orange-700',
    WORKER_MANAGEMENT: 'bg-green-100 text-green-700',
    SETTINGS: 'bg-red-100 text-red-700'
  };

  const STATUS_COLORS = {
    SUCCESS: 'text-green-600',
    FAILURE: 'text-red-600',
    WARNING: 'text-amber-600'
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({ page, limit: LIMIT });
      if (res.success) {
        setLogs(res.data);
        setTotal(res.pagination?.total || 0);
      }
    } catch (err) {
      toastManager.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-lg bg-white h-full flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-slate-800 to-slate-700">
          <div className="flex items-center gap-3">
            <FiActivity className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-base font-bold text-white">Audit Log</h2>
              <p className="text-xs text-slate-300">{total} entries recorded</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <FiX className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FiActivity className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No audit entries yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {logs.map(log => (
                <div key={log._id} className="px-5 py-4 hover:bg-gray-50 transition">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-slate-600 text-xs">
                      {log.adminName?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{log.adminName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODULE_COLORS[log.module] || 'bg-gray-100 text-gray-600'}`}>
                          {log.module?.replace(/_/g, ' ')}
                        </span>
                        <span className={`text-xs font-bold ${STATUS_COLORS[log.status] || 'text-gray-500'}`}>
                          {log.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{log.description}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-gray-400 font-mono">{log.action}</span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <FiClock className="w-3 h-3" />
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > LIMIT && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">Page {page} of {Math.ceil(total / LIMIT)}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
              <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// ── Admin People Detail Modal (Full Attribution & Traceability) ────────────
const AdminPeopleDetailModal = ({ admin, onClose }) => {
  const [people, setPeople] = useState([]);
  const [summary, setSummary] = useState({ totalFarmers: 0, totalVendors: 0, totalWorkers: 0, totalAll: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const fetchPeople = useCallback(async () => {
    if (!admin?._id) return;
    setLoading(true);
    try {
      const params = {
        page,
        limit: 15,
        ...(role && { role }),
        ...(status && { status }),
        ...(dateRange && { dateRange }),
        ...(dateRange === 'custom' && startDate && { startDate }),
        ...(dateRange === 'custom' && endDate && { endDate }),
        ...(searchInput.trim() && { search: searchInput.trim() })
      };
      const res = await getAdminRegistrations(admin._id, params);
      if (res.success) {
        setPeople(res.data || []);
        setSummary(res.summary || { totalFarmers: 0, totalVendors: 0, totalWorkers: 0, totalAll: 0 });
        if (res.pagination) {
          setPagination(res.pagination);
        }
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load people added by admin');
    } finally {
      setLoading(false);
    }
  }, [admin, page, role, status, dateRange, startDate, endDate, searchInput]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      const params = {
        adminId: admin._id,
        ...(role && { role }),
        ...(status && { status }),
        ...(dateRange && { dateRange }),
        ...(dateRange === 'custom' && startDate && { startDate }),
        ...(dateRange === 'custom' && endDate && { endDate })
      };
      const blob = await exportAttributionData(params);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attribution_${admin.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toastManager.success('Attribution records exported successfully');
    } catch (err) {
      toastManager.error('Failed to export attribution records');
    } finally {
      setExporting(false);
    }
  };

  const getRoleBadge = (uRole) => {
    switch (uRole) {
      case 'farmer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-50 text-green-700 border border-green-200">
            👨‍🌾 Farmer
          </span>
        );
      case 'vendor':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            🚜 Eq. Owner / Vendor
          </span>
        );
      case 'worker':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            👷 Worker
          </span>
        );
      default:
        return <span className="text-gray-500">{uRole || 'User'}</span>;
    }
  };

  const getSourceBadge = (source) => {
    switch (source) {
      case 'ADMIN_CREATED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">Admin Created</span>;
      case 'SUPER_ADMIN_CREATED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Super Admin</span>;
      case 'SELF_REGISTERED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">Self Registered</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">{source || 'Legacy'}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-white text-xl">
              <FiUsers className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">People Added by {admin.name}</h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  admin.role === 'super_admin' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'bg-blue-400/20 text-blue-300 border border-blue-400/30'
                }`}>
                  {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/10 text-gray-200">
                  {getScopeDisplay(admin)}
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5">
                {admin.email} · {admin.isActive !== false ? 'Active Account' : 'Blocked / Inactive Account'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg border border-white/20 transition disabled:opacity-50"
              title="Export filtered records to CSV"
            >
              <FiDownload className="w-3.5 h-3.5" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
            >
              <FiX className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Summary Metric Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 border-b border-gray-100">
          <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs">
            <p className="text-[10px] uppercase font-bold text-gray-400">Total People Added</p>
            <p className="text-xl font-black text-gray-900 mt-0.5">{summary.totalAll}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-green-200 shadow-xs">
            <p className="text-[10px] uppercase font-bold text-green-600">Farmers / Users</p>
            <p className="text-xl font-black text-green-700 mt-0.5">{summary.totalFarmers}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-xs">
            <p className="text-[10px] uppercase font-bold text-amber-600">Vendors / Owners</p>
            <p className="text-xl font-black text-amber-700 mt-0.5">{summary.totalVendors}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-purple-200 shadow-xs">
            <p className="text-[10px] uppercase font-bold text-purple-600">Workers</p>
            <p className="text-xl font-black text-purple-700 mt-0.5">{summary.totalWorkers}</p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 border-b border-gray-100 bg-white space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by name, phone, email, or user ID..."
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Role Filter Tabs */}
            <div className="flex gap-1 overflow-x-auto">
              {[
                { id: '', label: 'All Roles' },
                { id: 'farmer', label: 'Farmers' },
                { id: 'vendor', label: 'Vendors' },
                { id: 'worker', label: 'Workers' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => { setRole(t.id); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                    role === t.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Status Dropdown */}
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 bg-white outline-none focus:border-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active / Approved</option>
              <option value="pending">Pending Verification</option>
              <option value="blocked">Blocked / Suspended</option>
              <option value="rejected">Rejected</option>
            </select>

            {/* Date Range Dropdown */}
            <select
              value={dateRange}
              onChange={e => { setDateRange(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 bg-white outline-none focus:border-indigo-500"
            >
              <option value="">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom Date Pickers */}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-3 pt-1 text-xs">
              <span className="text-gray-500 font-medium">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setPage(1); }}
                className="px-2.5 py-1 border border-gray-200 rounded-lg outline-none focus:border-indigo-500"
              />
              <span className="text-gray-500 font-medium">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setPage(1); }}
                className="px-2.5 py-1 border border-gray-200 rounded-lg outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-xs text-gray-500 gap-2">
              <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <span>Fetching verified records...</span>
            </div>
          ) : people.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400">
              <FiUsers className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-600 text-sm">No people match the selected criteria</p>
              <p className="text-gray-400 mt-1">Try adjusting the search query, role filter, or date range.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-gray-400 uppercase text-[10px] tracking-wider bg-gray-50/50">
                  <th className="py-2.5 px-3 font-bold">Person Details</th>
                  <th className="py-2.5 px-3 font-bold">Role</th>
                  <th className="py-2.5 px-3 font-bold">Creation Source</th>
                  <th className="py-2.5 px-3 font-bold">Attributed Creator</th>
                  <th className="py-2.5 px-3 font-bold">District / Scope</th>
                  <th className="py-2.5 px-3 font-bold">Status</th>
                  <th className="py-2.5 px-3 font-bold text-right">Added At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {people.map((item, idx) => (
                  <tr key={item._id || idx} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="py-3 px-3">
                      <div>
                        <p className="font-bold text-gray-900">{item.name || 'Unnamed'}</p>
                        <p className="text-[11px] text-gray-500">{item.phone || item.email || '—'}</p>
                        <p className="text-[9px] text-gray-400 font-mono">ID: {item._id?.slice(-8)}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {getRoleBadge(item.userRole)}
                    </td>
                    <td className="py-3 px-3">
                      {getSourceBadge(item.creationSource)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-[11px]">
                        <p className="font-semibold text-gray-800">
                          {item.createdByAdminSnapshot?.name || admin.name}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {item.createdByAdminSnapshot?.email || admin.email}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[11px] text-gray-600 font-medium">
                        {item.district || item.city || item.subDistrict || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.approvalStatus === 'approved' || item.isActive
                          ? 'bg-green-100 text-green-700'
                          : item.approvalStatus === 'rejected'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.approvalStatus || (item.isActive ? 'Active' : 'Pending')}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-gray-500 font-medium whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer & Server-Side Pagination */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-gray-500 font-medium">
            Showing <span className="font-bold text-gray-800">{people.length > 0 ? (page - 1) * 15 + 1 : 0}</span> to{' '}
            <span className="font-bold text-gray-800">{Math.min(page * 15, pagination.total || 0)}</span> of{' '}
            <span className="font-bold text-gray-800">{pagination.total || 0}</span> people
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition"
            >
              <FiChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <span className="px-2 font-bold text-gray-700">
              Page {page} of {pagination.pages || 1}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages || 1, p + 1))}
              disabled={page >= (pagination.pages || 1) || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition"
            >
              Next <FiChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="ml-2 px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold transition"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Super Admin People Attribution & Traceability View ─────────────────────
const PeopleAttributionView = ({ onViewAdminPeople }) => {
  const [summary, setSummary] = useState(null);
  const [adminBreakdown, setAdminBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        ...(dateRange && { dateRange }),
        ...(dateRange === 'custom' && startDate && { startDate }),
        ...(dateRange === 'custom' && endDate && { endDate })
      };
      const res = await getAttributionSummary(params);
      if (res.success) {
        const s = res.summary || {};
        setSummary({
          byAdmins: s.byAdmins || s.totalByAdmins || {},
          bySuperAdmin: s.bySuperAdmin || s.totalBySuperAdmin || {},
          selfRegistered: s.selfRegistered || s.totalSelfRegistered || {},
          legacyUnknown: s.legacyUnknown || s.totalLegacyUnknown || {},
          grandTotal: s.grandTotal || {}
        });
        setAdminBreakdown(res.adminBreakdown || res.admins || []);
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load attribution summary');
    } finally {
      setLoading(false);
    }
  }, [dateRange, startDate, endDate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleGlobalExport = async () => {
    try {
      setExporting(true);
      const params = {
        ...(dateRange && { dateRange }),
        ...(dateRange === 'custom' && startDate && { startDate }),
        ...(dateRange === 'custom' && endDate && { endDate })
      };
      const blob = await exportAttributionData(params);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `global_attribution_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toastManager.success('Global attribution report downloaded');
    } catch (err) {
      toastManager.error('Failed to export attribution report');
    } finally {
      setExporting(false);
    }
  };

  const filteredAdmins = adminBreakdown.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Filter and Actions Bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[180px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search admin in breakdown..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <FiCalendar className="text-gray-400 w-4 h-4 flex-shrink-0" />
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
              className="px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 bg-white outline-none focus:border-indigo-500"
            >
              <option value="">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSummary}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition cursor-pointer"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleGlobalExport}
            disabled={exporting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <FiDownload className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* 4 Global People Summary Cards - 2 cols on mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Added by Admins */}
        <div className="bg-white rounded-2xl border border-blue-100 shadow-xs p-3 sm:p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-xs font-bold text-blue-600 uppercase tracking-wider truncate">By Admins</span>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <FiUsers className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="text-lg sm:text-2xl font-black text-gray-900">{summary?.byAdmins?.total || 0}</p>
          <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-1 text-center text-[10px]">
            <div className="bg-blue-50/50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Farmers</p>
              <p className="font-bold text-gray-800">{summary?.byAdmins?.farmers || 0}</p>
            </div>
            <div className="bg-blue-50/50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Vendors</p>
              <p className="font-bold text-gray-800">{summary?.byAdmins?.vendors || 0}</p>
            </div>
            <div className="bg-blue-50/50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Workers</p>
              <p className="font-bold text-gray-800">{summary?.byAdmins?.workers || 0}</p>
            </div>
          </div>
        </div>

        {/* Super Admin Created */}
        <div className="bg-white rounded-2xl border border-amber-100 shadow-xs p-3 sm:p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-xs font-bold text-amber-600 uppercase tracking-wider truncate">Super Admin</span>
            <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <FiShield className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="text-lg sm:text-2xl font-black text-gray-900">{summary?.bySuperAdmin?.total || 0}</p>
          <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-1 text-center text-[10px]">
            <div className="bg-amber-50/50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Farmers</p>
              <p className="font-bold text-gray-800">{summary?.bySuperAdmin?.farmers || 0}</p>
            </div>
            <div className="bg-amber-50/50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Vendors</p>
              <p className="font-bold text-gray-800">{summary?.bySuperAdmin?.vendors || 0}</p>
            </div>
            <div className="bg-amber-50/50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Workers</p>
              <p className="font-bold text-gray-800">{summary?.bySuperAdmin?.workers || 0}</p>
            </div>
          </div>
        </div>

        {/* Self-Registered */}
        <div className="bg-white rounded-2xl border border-teal-100 shadow-xs p-3 sm:p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-xs font-bold text-teal-600 uppercase tracking-wider truncate">Self Signed</span>
            <span className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
              <FiUserCheck className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="text-lg sm:text-2xl font-black text-gray-900">{summary?.selfRegistered?.total || 0}</p>
          <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-1 text-center text-[10px]">
            <div className="bg-teal-50/50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Farmers</p>
              <p className="font-bold text-gray-800">{summary?.selfRegistered?.farmers || 0}</p>
            </div>
            <div className="bg-teal-50/50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Vendors</p>
              <p className="font-bold text-gray-800">{summary?.selfRegistered?.vendors || 0}</p>
            </div>
            <div className="bg-teal-50/50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Workers</p>
              <p className="font-bold text-gray-800">{summary?.selfRegistered?.workers || 0}</p>
            </div>
          </div>
        </div>

        {/* Legacy / Unknown */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-3 sm:p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider truncate">Historical</span>
            <span className="p-1.5 bg-gray-100 text-gray-600 rounded-lg">
              <FiClock className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="text-lg sm:text-2xl font-black text-gray-800">{summary?.legacyUnknown?.total || 0}</p>
          <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-1 text-center text-[10px]">
            <div className="bg-gray-50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Farmers</p>
              <p className="font-bold text-gray-800">{summary?.legacyUnknown?.farmers || 0}</p>
            </div>
            <div className="bg-gray-50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Vendors</p>
              <p className="font-bold text-gray-800">{summary?.legacyUnknown?.vendors || 0}</p>
            </div>
            <div className="bg-gray-50 p-1 rounded-lg">
              <p className="text-gray-400 font-medium">Workers</p>
              <p className="font-bold text-gray-800">{summary?.legacyUnknown?.workers || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Admin-Wise Attribution Breakdown Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <FiUsers className="w-4 h-4 text-indigo-600" />
              Admin-wise Attribution Breakdown
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Verified backend counts of accounts onboarded by each administrator
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100">
            {filteredAdmins.length} Admins Tracked
          </span>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-xs text-gray-500 gap-2">
            <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <span>Calculating database aggregations...</span>
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="py-16 text-center text-xs text-gray-400">
            <FiUsers className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="font-semibold text-gray-600">No administrators match your search</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider border-b border-gray-100">
                  <th className="py-3 px-4 font-bold">Administrator</th>
                  <th className="py-3 px-4 font-bold">Role</th>
                  <th className="py-3 px-4 font-bold">Geographic Scope</th>
                  <th className="py-3 px-4 font-bold text-center">Total Added</th>
                  <th className="py-3 px-4 font-bold text-center">👨‍🌾 Farmers</th>
                  <th className="py-3 px-4 font-bold text-center">🚜 Eq. Owners</th>
                  <th className="py-3 px-4 font-bold text-center">👷 Workers</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAdmins.map(admin => {
                  const adminId = admin.adminId || admin._id || admin.id;
                  const total = admin.total ?? admin.counts?.total ?? 0;
                  const farmers = admin.farmers ?? admin.counts?.farmers ?? 0;
                  const vendors = admin.vendors ?? admin.counts?.vendors ?? 0;
                  const workers = admin.workers ?? admin.counts?.workers ?? 0;

                  return (
                    <tr key={adminId} className="hover:bg-indigo-50/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                            {admin.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-gray-800">{admin.name}</p>
                            <p className="text-[11px] text-gray-400">{admin.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          admin.role === 'super_admin' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-blue-100 text-blue-800 border-blue-200'
                        }`}>
                          {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                          {getScopeDisplay(admin)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 font-black rounded-lg text-sm border border-indigo-100">
                          {total}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-green-700">
                        {farmers}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-amber-700">
                        {vendors}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-purple-700">
                        {workers}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${admin.isActive !== false ? 'text-green-600' : 'text-red-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${admin.isActive !== false ? 'bg-green-500' : 'bg-red-500'}`} />
                          {admin.isActive !== false ? 'Active' : 'Blocked'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onViewAdminPeople({
                            _id: adminId,
                            name: admin.name,
                            email: admin.email,
                            role: admin.role,
                            isActive: admin.isActive,
                            scopeType: admin.scopeType,
                          cityScope: admin.cityScope,
                          districtScope: admin.districtScope,
                          subDistrictScope: admin.subDistrictScope
                        })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                      >
                        <FiEye className="w-3.5 h-3.5" /> View People
                      </button>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────

const AdminManagement = ({ defaultTab }) => {
  const [admins, setAdmins] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [mainTab, setMainTab] = useState(defaultTab || urlTab || 'admins');

  useEffect(() => {
    if (urlTab && ['admins', 'attribution', 'payroll'].includes(urlTab)) {
      setMainTab(urlTab);
    } else if (defaultTab) {
      setMainTab(defaultTab);
    }
  }, [urlTab, defaultTab]);

  const handleTabChange = (newTab) => {
    setMainTab(newTab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', newTab);
      return next;
    }, { replace: true });
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editAdmin, setEditAdmin] = useState(null);
  const [adminModalTab, setAdminModalTab] = useState('basic');
  const [permAdmin, setPermAdmin] = useState(null);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [viewingRegistrationsAdmin, setViewingRegistrationsAdmin] = useState(null);

  const currentAdmin = (() => {
    try { return authStorage.getUserData('admin') || {}; } catch { return {}; }
  })();

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterRole) params.role = filterRole;
      if (filterStatus) params.isActive = filterStatus === 'active';
      const res = await getAllAdmins(params);
      if (res.success) setAdmins(res.data || []);
    } catch (err) {
      toastManager.error('Failed to fetch admins');
    } finally {
      setLoading(false);
    }
  }, [search, filterRole, filterStatus]);

  const fetchCities = useCallback(async () => {
    try {
      const res = await cityService.getAll();
      if (res.success) setCities(res.cities || []);
    } catch {}
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);
  useEffect(() => { fetchCities(); }, [fetchCities]);

  const handleToggleStatus = async (admin) => {
    const action = admin.isActive !== false ? 'block' : 'unblock';
    if (!window.confirm(`Are you sure you want to ${action} "${admin.name}"?`)) return;
    try {
      await toggleAdminStatus(admin._id);
      toastManager.success(`Admin ${action}ed`);
      fetchAdmins();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDelete = async (admin) => {
    if (!window.confirm(`Permanently delete admin "${admin.name}"? This cannot be undone.`)) return;
    try {
      await deleteAdmin(admin._id);
      toastManager.success('Admin deleted');
      fetchAdmins();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  // Counts for stat cards
  const totalAdmins = admins.length;
  const superAdmins = admins.filter(a => a.role === 'super_admin').length;
  const activeAdmins = admins.filter(a => a.isActive !== false).length;
  const blockedAdmins = admins.filter(a => a.isActive === false).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header - Mobile Compact & Desktop Clean */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FiShield className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500 flex-shrink-0" />
            <span>Admin Management</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Configure admins, track lead attribution & record monthly salary
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAuditLog(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition shadow-xs"
          >
            <FiActivity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
            <span>Audit Log</span>
          </button>
          <button
            onClick={() => { setEditAdmin(null); setShowCreateModal(true); }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-amber-200/50 hover:from-amber-600 hover:to-orange-600 transition"
          >
            <FiPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Add Admin</span>
          </button>
        </div>
      </div>

      {/* Top View Mode Switcher - 100% Mobile & Desktop Responsive Segmented Bar */}
      <div className="bg-slate-100/90 p-1 sm:p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/80 shadow-xs w-full">
        <button
          type="button"
          onClick={() => handleTabChange('admins')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            mainTab === 'admins'
              ? 'bg-white text-amber-700 shadow-sm border border-amber-200/70'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FiShield className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${mainTab === 'admins' ? 'text-amber-500' : 'text-slate-400'}`} />
          <span className="sm:hidden">Admins</span>
          <span className="hidden sm:inline">Admins &amp; RBAC</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('attribution')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            mainTab === 'attribution'
              ? 'bg-white text-indigo-700 shadow-sm border border-indigo-200/70'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FiPieChart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${mainTab === 'attribution' ? 'text-indigo-500' : 'text-slate-400'}`} />
          <span className="sm:hidden">Attribution</span>
          <span className="hidden sm:inline">People Attribution</span>
          <span className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700">
            Leads
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('payroll')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            mainTab === 'payroll'
              ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200/70'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FiDollarSign className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${mainTab === 'payroll' ? 'text-emerald-500' : 'text-slate-400'}`} />
          <span className="sm:hidden">Salary</span>
          <span className="hidden sm:inline">Salary &amp; Payroll</span>
          <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-extrabold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
            Live
          </span>
        </button>
      </div>

      {mainTab === 'payroll' ? (
        <SalaryPayrollView />
      ) : mainTab === 'attribution' ? (
        <PeopleAttributionView onViewAdminPeople={(admin) => setViewingRegistrationsAdmin(admin)} />
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FiUsers} label="Total Admins" value={totalAdmins} color="bg-slate-100 text-slate-600" />
        <StatCard icon={FiShield} label="Super Admins" value={superAdmins} color="bg-amber-100 text-amber-600" />
        <StatCard icon={FiCheck} label="Active" value={activeAdmins} color="bg-green-100 text-green-600" />
        <StatCard icon={FiLock} label="Blocked" value={blockedAdmins} color="bg-red-100 text-red-600" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
          <option value="">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
        <button onClick={fetchAdmins}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
          <FiRefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Admins Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : admins.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FiUsers className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No administrators found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                  <th className="px-5 py-3.5 font-semibold">Administrator</th>
                  <th className="px-5 py-3.5 font-semibold">Role</th>
                  <th className="px-5 py-3.5 font-semibold">Geographic Scope</th>
                  <th className="px-5 py-3.5 font-semibold">Permissions</th>
                  <th className="px-5 py-3.5 font-semibold">People Added</th>
                  <th className="px-5 py-3.5 font-semibold">Salary &amp; Incentives</th>
                  <th className="px-5 py-3.5 font-semibold">Created By</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold">Last Login</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {admins.map(admin => {
                  const isSelf = admin._id === currentAdmin.id || admin._id === currentAdmin._id;
                  const isPrimary = admin.email === 'admin@admin.com';
                  const scopeDisplay = getScopeDisplay(admin);
                  const permCount = admin.role === 'super_admin' ? 'All' : countEnabledPermissions(admin.permissions || {});

                  return (
                    <tr key={admin._id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Name */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                            {admin.profilePhoto
                              ? <img src={admin.profilePhoto} alt="" className="w-full h-full object-cover rounded-full" />
                              : admin.name?.charAt(0).toUpperCase()
                            }
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                              {admin.name}
                              {isSelf && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">You</span>}
                              {isPrimary && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Primary</span>}
                            </p>
                            <p className="text-xs text-gray-400">{admin.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${ROLE_COLORS[admin.role] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {admin.role === 'super_admin' ? <><FiShield className="w-3 h-3" /> Super Admin</> : 'Admin'}
                        </span>
                      </td>

                      {/* Scope */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${SCOPE_COLORS[admin.scopeType || 'CITY']}`}>
                          <FiMapPin className="w-3 h-3" />
                          {scopeDisplay}
                        </span>
                      </td>

                      {/* Permissions */}
                      <td className="px-5 py-4">
                        {admin.role === 'super_admin' ? (
                          <span className="text-xs text-amber-600 font-semibold">All Access</span>
                        ) : (
                          <span className="text-xs text-gray-600">
                            <span className="font-bold text-blue-600">{permCount}</span> / {Object.keys(buildDefaultPermissions()).length}
                          </span>
                        )}
                      </td>

                      {/* People Added */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingRegistrationsAdmin(admin)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer"
                            title="Click to view detailed list of onboarded people"
                          >
                            <FiUsers className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{admin.onboardedStats?.total || 0} Total</span>
                          </button>
                          <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium">
                            <span title="Farmers">👨‍🌾 {admin.onboardedStats?.farmers || 0}</span>
                            <span>·</span>
                            <span title="Equipment Owners">🚜 {admin.onboardedStats?.vendors || 0}</span>
                            <span>·</span>
                            <span title="Workers">👷 {admin.onboardedStats?.workers || 0}</span>
                          </div>
                        </div>
                      </td>

                      {/* Salary & Incentives */}
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => {
                            setAdminModalTab('compensation');
                            setEditAdmin(admin);
                          }}
                          className="text-left group/sal p-1.5 -m-1.5 rounded-lg hover:bg-blue-50/60 transition cursor-pointer"
                          title="Click to view or edit compensation & payout information"
                        >
                          <p className="text-xs font-bold text-gray-800 group-hover/sal:text-blue-600 transition flex items-center gap-1">
                            ₹{(admin.salary?.baseSalary || 0).toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">/{admin.salary?.payFrequency || 'mo'}</span>
                          </p>
                          {admin.onboardedStats?.earnedIncentive > 0 ? (
                            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                              +₹{admin.onboardedStats.earnedIncentive.toLocaleString()} incentives
                            </p>
                          ) : (
                            <p className="text-[10px] text-gray-400">Base salary</p>
                          )}
                          {admin.salary?.bankDetails?.accountNumber || admin.salary?.bankDetails?.upiId ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-1">
                              ✓ Bank Details Saved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1">
                              ⏳ Bank Pending
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Created By */}
                      <td className="px-5 py-4">
                        {admin.createdBy ? (
                          <div>
                            <p className="text-xs text-gray-700 font-medium">{admin.createdBy.name}</p>
                            <p className="text-xs text-gray-400">{admin.createdBy.email}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">System</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${admin.isActive !== false ? 'text-green-600' : 'text-red-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${admin.isActive !== false ? 'bg-green-500' : 'bg-red-500'}`} />
                          {admin.isActive !== false ? 'Active' : 'Blocked'}
                        </span>
                      </td>

                      {/* Last Login */}
                      <td className="px-5 py-4">
                        <span className="text-xs text-gray-400">{formatDate(admin.lastLogin)}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        {!isSelf && !isPrimary ? (
                          <div className="flex items-center justify-end gap-1">
                            {/* Edit */}
                            <button
                              onClick={() => setEditAdmin(admin)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Edit Admin"
                            >
                              <FiEdit2 className="w-4 h-4" />
                            </button>

                            {/* Permissions */}
                            {admin.role !== 'super_admin' && (
                              <button
                                onClick={() => setPermAdmin(admin)}
                                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                title="Manage Permissions"
                              >
                                <FiSliders className="w-4 h-4" />
                              </button>
                            )}

                            {/* Block / Unblock */}
                            <button
                              onClick={() => handleToggleStatus(admin)}
                              className={`p-2 text-gray-400 rounded-lg transition ${admin.isActive !== false
                                ? 'hover:text-amber-600 hover:bg-amber-50'
                                : 'hover:text-green-600 hover:bg-green-50'
                                }`}
                              title={admin.isActive !== false ? 'Block Admin' : 'Unblock Admin'}
                            >
                              {admin.isActive !== false ? <FiLock className="w-4 h-4" /> : <FiUnlock className="w-4 h-4" />}
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDelete(admin)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Delete Admin"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <span className="text-xs text-gray-300 italic">{isSelf ? 'You' : 'Protected'}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {(showCreateModal || editAdmin) && (
          <AdminFormModal
            key="admin-form"
            admin={editAdmin ? { ...editAdmin, id: editAdmin._id } : null}
            cities={cities}
            defaultTab={adminModalTab}
            onClose={() => { setShowCreateModal(false); setEditAdmin(null); setAdminModalTab('basic'); }}
            onSave={fetchAdmins}
          />
        )}
        {permAdmin && (
          <PermissionsPanel
            key="perm-panel"
            admin={permAdmin}
            onClose={() => setPermAdmin(null)}
            onSave={fetchAdmins}
          />
        )}
        {showAuditLog && (
          <AuditLogDrawer key="audit-drawer" onClose={() => setShowAuditLog(false)} />
        )}
        {viewingRegistrationsAdmin && (
          <AdminPeopleDetailModal
            key="onboarded-peoples"
            admin={viewingRegistrationsAdmin}
            onClose={() => setViewingRegistrationsAdmin(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminManagement;
