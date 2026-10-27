import React, { useState, useEffect } from 'react';
import {
  FiGift,
  FiCheckCircle,
  FiClock,
  FiRotateCcw,
  FiSave,
  FiSearch,
  FiFilter,
  FiTrendingUp,
  FiUsers,
  FiDollarSign,
  FiLayers,
  FiAlertTriangle,
  FiCheck,
  FiX
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import referralService from '../../../../services/referralService';
import LogoLoader from '../../../../components/common/LogoLoader';

const ReferralManagement = () => {
  const [activeTab, setActiveTab] = useState('settings'); // 'settings', 'attributions', 'audit'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings State
  const [settings, setSettings] = useState({
    systemEnabled: true,
    showRewardStructure: true,
    registrationUrl: 'https://agroyilt.com/app/register',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.agroyilt.app',
    qualificationEvent: 'ADMIN_APPROVAL',
    version: 1,
    roles: {
      farmer: { enabled: true, rewardAmount: 50, rewardAmountPaise: 5000 },
      vendor: { enabled: true, rewardAmount: 40, rewardAmountPaise: 4000 },
      worker: { enabled: true, rewardAmount: 50, rewardAmountPaise: 5000 }
    },
    auditHistory: []
  });

  // Attributions State
  const [attributions, setAttributions] = useState([]);
  const [attributionStats, setAttributionStats] = useState({
    totalAttributions: 0,
    totalQualified: 0,
    totalPaidRupees: 0
  });
  const [filters, setFilters] = useState({
    role: 'all',
    status: 'all',
    search: '',
    page: 1,
    limit: 20
  });
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loadingAttributions, setLoadingAttributions] = useState(false);

  // Reversal Modal State
  const [reversalModal, setReversalModal] = useState({
    isOpen: false,
    attribution: null,
    reason: '',
    processing: false
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'attributions') {
      fetchAttributions();
    }
  }, [activeTab, filters.role, filters.status, filters.page]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await referralService.getAdminSettings();
      if (res.success && res.data) {
        setSettings(res.data);
      }
    } catch (err) {
      console.error('Failed to load referral settings:', err);
      toastManager.error('Failed to load referral configuration');
    } finally {
      setLoading(false);
    }
  };

  const fetchAttributions = async () => {
    setLoadingAttributions(true);
    try {
      const res = await referralService.getAdminAttributions(filters);
      if (res.success && res.data) {
        setAttributions(res.data.attributions || []);
        setPagination(res.data.pagination || { total: 0, page: 1, pages: 1 });
        if (res.data.stats) setAttributionStats(res.data.stats);
      }
    } catch (err) {
      console.error('Failed to load attributions:', err);
      toastManager.error('Failed to load attribution records');
    } finally {
      setLoadingAttributions(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await referralService.updateAdminSettings({
        systemEnabled: settings.systemEnabled,
        showRewardStructure: settings.showRewardStructure !== false,
        registrationUrl: settings.registrationUrl || 'https://agroyilt.com/app/register',
        playStoreUrl: settings.playStoreUrl || 'https://play.google.com/store/apps/details?id=com.agroyilt.app',
        qualificationEvent: settings.qualificationEvent,
        roles: {
          farmer: {
            enabled: settings.roles.farmer.enabled,
            rewardAmount: Number(settings.roles.farmer.rewardAmount)
          },
          vendor: {
            enabled: settings.roles.vendor.enabled,
            rewardAmount: Number(settings.roles.vendor.rewardAmount)
          },
          worker: {
            enabled: settings.roles.worker.enabled,
            rewardAmount: Number(settings.roles.worker.rewardAmount)
          }
        }
      });

      if (res.success) {
        toastManager.success('Referral settings updated successfully!');
        fetchSettings();
      } else {
        toastManager.error(res.message || 'Failed to update settings');
      }
    } catch (err) {
      console.error('Error updating settings:', err);
      toastManager.error(err.response?.data?.message || 'Error updating settings');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenReverse = (attr) => {
    setReversalModal({
      isOpen: true,
      attribution: attr,
      reason: '',
      processing: false
    });
  };

  const handleConfirmReverse = async () => {
    if (!reversalModal.attribution) return;
    if (!reversalModal.reason.trim()) {
      toastManager.error('Please specify a reversal reason');
      return;
    }

    setReversalModal(prev => ({ ...prev, processing: true }));
    try {
      const res = await referralService.reverseReward(
        reversalModal.attribution._id,
        reversalModal.reason
      );
      if (res.success) {
        toastManager.success('Referral reward reversed successfully');
        setReversalModal({ isOpen: false, attribution: null, reason: '', processing: false });
        fetchAttributions();
        fetchSettings();
      } else {
        toastManager.error(res.message || 'Failed to reverse reward');
        setReversalModal(prev => ({ ...prev, processing: false }));
      }
    } catch (err) {
      console.error('Reversal error:', err);
      toastManager.error(err.response?.data?.message || 'Failed to reverse reward');
      setReversalModal(prev => ({ ...prev, processing: false }));
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <LogoLoader />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <FiGift className="w-6 h-6" />
            </div>
            Referral System Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure role-based reward rates (in ₹/Paise), system status, audit logs, and attribution ledger.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-gray-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
              activeTab === 'settings'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Settings & Rates
          </button>
          <button
            onClick={() => setActiveTab('attributions')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
              activeTab === 'attributions'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Attributions & History
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
              activeTab === 'audit'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Audit Log ({settings.auditHistory?.length || 0})
          </button>
        </div>
      </div>

      {/* TAB 1: SETTINGS & ROLE RATES */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Master Switch Banner */}
          <div className={`p-5 rounded-2xl border transition-all ${
            settings.systemEnabled
              ? 'bg-emerald-50/60 border-emerald-200'
              : 'bg-rose-50/60 border-rose-200'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${settings.systemEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <h3 className="text-base font-bold text-gray-900">
                    System Status: {settings.systemEnabled ? 'Active (ON)' : 'Disabled (OFF)'}
                  </h3>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 rounded-md text-gray-600">
                    Config v{settings.version}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 max-w-xl">
                  {settings.systemEnabled
                    ? 'Referral program is active. Users can share codes and earn role-based rewards upon qualification.'
                    : 'Referral program is temporarily paused. New referral codes cannot be verified or attributed.'}
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={settings.systemEnabled}
                  onChange={(e) => setSettings(prev => ({ ...prev, systemEnabled: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-14 h-8 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>

          {/* Role Reward Configuration Cards */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Role-Based Reward Rates & App Visibility</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Set reward amounts (in ₹). Roles set to ₹0 or toggled OFF are automatically removed from the user/vendor/worker UI.
                </p>
              </div>

              {/* Master Toggle to Hide/Show Role Rewards Card in UI */}
              <div className="flex items-center gap-3 p-2 px-3 bg-gray-50 border border-gray-200 rounded-xl">
                <span className="text-xs font-bold text-gray-700">Show Reward Card in App:</span>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={settings.showRewardStructure !== false}
                    onChange={(e) => setSettings(prev => ({ ...prev, showRewardStructure: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  settings.showRewardStructure !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                }`}>
                  {settings.showRewardStructure !== false ? 'Visible' : 'Hidden'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Farmer Reward Card */}
              <div className={`p-5 rounded-2xl border transition-all space-y-4 ${
                settings.roles.farmer.enabled && Number(settings.roles.farmer.rewardAmount) > 0
                  ? 'bg-white border-emerald-200 shadow-sm'
                  : 'bg-gray-50/70 border-gray-200 opacity-90'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🌾</span>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">Farmer</h4>
                      <span className="text-[11px] text-gray-500">User Collection</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      settings.roles.farmer.enabled && Number(settings.roles.farmer.rewardAmount) > 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {settings.roles.farmer.enabled && Number(settings.roles.farmer.rewardAmount) > 0 ? 'Active' : 'Disabled'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.roles.farmer.enabled}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          roles: {
                            ...prev.roles,
                            farmer: { ...prev.roles.farmer, enabled: e.target.checked }
                          }
                        }))}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Reward Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500 font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={settings.roles.farmer.rewardAmount}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        roles: {
                          ...prev.roles,
                          farmer: { ...prev.roles.farmer, rewardAmount: e.target.value }
                        }
                      }))}
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                    <span>Stored as {Number(settings.roles.farmer.rewardAmount || 0) * 100} Paise</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          roles: { ...prev.roles, farmer: { ...prev.roles.farmer, enabled: true, rewardAmount: 10 } }
                        }))}
                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 rounded text-[10px] font-semibold text-gray-600 transition-colors"
                      >
                        ₹10
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          roles: { ...prev.roles, farmer: { ...prev.roles.farmer, enabled: true, rewardAmount: 20 } }
                        }))}
                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 rounded text-[10px] font-semibold text-gray-600 transition-colors"
                      >
                        ₹20
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          roles: { ...prev.roles, farmer: { ...prev.roles.farmer, enabled: false, rewardAmount: 0 } }
                        }))}
                        className="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[10px] font-semibold transition-colors"
                      >
                        Disable (₹0)
                      </button>
                    </div>
                  </div>
                </div>

                {/* App UI Status indicator */}
                <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                  settings.roles.farmer.enabled && Number(settings.roles.farmer.rewardAmount) > 0
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                    : 'bg-rose-50 text-rose-800 border border-rose-100'
                }`}>
                  {settings.roles.farmer.enabled && Number(settings.roles.farmer.rewardAmount) > 0 ? (
                    <span>✅ Shown as <b>₹{settings.roles.farmer.rewardAmount}</b> in user app UI</span>
                  ) : (
                    <span>🚫 <b>Removed from user app UI</b> ({!settings.roles.farmer.enabled ? 'Disabled' : 'Reward is ₹0'})</span>
                  )}
                </div>
              </div>

              {/* Vendor Reward Card */}
              <div className={`p-5 rounded-2xl border transition-all space-y-4 ${
                settings.roles.vendor.enabled && Number(settings.roles.vendor.rewardAmount) > 0
                  ? 'bg-white border-blue-200 shadow-sm'
                  : 'bg-gray-50/70 border-gray-200 opacity-90'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🚛</span>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">Vendor</h4>
                      <span className="text-[11px] text-gray-500">Vendor Collection</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      settings.roles.vendor.enabled && Number(settings.roles.vendor.rewardAmount) > 0
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {settings.roles.vendor.enabled && Number(settings.roles.vendor.rewardAmount) > 0 ? 'Active' : 'Disabled'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.roles.vendor.enabled}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          roles: {
                            ...prev.roles,
                            vendor: { ...prev.roles.vendor, enabled: e.target.checked }
                          }
                        }))}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Reward Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500 font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={settings.roles.vendor.rewardAmount}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        roles: {
                          ...prev.roles,
                          vendor: { ...prev.roles.vendor, rewardAmount: e.target.value }
                        }
                      }))}
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                    <span>Stored as {Number(settings.roles.vendor.rewardAmount || 0) * 100} Paise</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          roles: { ...prev.roles, vendor: { ...prev.roles.vendor, enabled: true, rewardAmount: 10 } }
                        }))}
                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 rounded text-[10px] font-semibold text-gray-600 transition-colors"
                      >
                        ₹10
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          roles: { ...prev.roles, vendor: { ...prev.roles.vendor, enabled: true, rewardAmount: 20 } }
                        }))}
                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 rounded text-[10px] font-semibold text-gray-600 transition-colors"
                      >
                        ₹20
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          roles: { ...prev.roles, vendor: { ...prev.roles.vendor, enabled: false, rewardAmount: 0 } }
                        }))}
                        className="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[10px] font-semibold transition-colors"
                      >
                        Disable (₹0)
                      </button>
                    </div>
                  </div>
                </div>

                {/* App UI Status indicator */}
                <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                  settings.roles.vendor.enabled && Number(settings.roles.vendor.rewardAmount) > 0
                    ? 'bg-blue-50 text-blue-800 border border-blue-100'
                    : 'bg-rose-50 text-rose-800 border border-rose-100'
                }`}>
                  {settings.roles.vendor.enabled && Number(settings.roles.vendor.rewardAmount) > 0 ? (
                    <span>✅ Shown as <b>₹{settings.roles.vendor.rewardAmount}</b> in app UI</span>
                  ) : (
                    <span>🚫 <b>Removed from app UI</b> ({!settings.roles.vendor.enabled ? 'Disabled' : 'Reward is ₹0'})</span>
                  )}
                </div>
              </div>

              {/* Independent Worker Reward Card */}
              <div className={`p-5 rounded-2xl border transition-all space-y-4 ${
                settings.roles.worker.enabled && Number(settings.roles.worker.rewardAmount) > 0
                  ? 'bg-white border-orange-200 shadow-sm'
                  : 'bg-gray-50/70 border-gray-200 opacity-90'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🛠️</span>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">Independent Worker</h4>
                      <span className="text-[11px] text-gray-500">Worker Collection</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      settings.roles.worker.enabled && Number(settings.roles.worker.rewardAmount) > 0
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {settings.roles.worker.enabled && Number(settings.roles.worker.rewardAmount) > 0 ? 'Active' : 'Disabled'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.roles.worker.enabled}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          roles: {
                            ...prev.roles,
                            worker: { ...prev.roles.worker, enabled: e.target.checked }
                          }
                        }))}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Reward Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500 font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={settings.roles.worker.rewardAmount}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        roles: {
                          ...prev.roles,
                          worker: { ...prev.roles.worker, rewardAmount: e.target.value }
                        }
                      }))}
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-800 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                    <span>Stored as {Number(settings.roles.worker.rewardAmount || 0) * 100} Paise</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          roles: { ...prev.roles, worker: { ...prev.roles.worker, enabled: true, rewardAmount: 10 } }
                        }))}
                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-orange-50 hover:text-orange-700 rounded text-[10px] font-semibold text-gray-600 transition-colors"
                      >
                        ₹10
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          roles: { ...prev.roles, worker: { ...prev.roles.worker, enabled: true, rewardAmount: 20 } }
                        }))}
                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-orange-50 hover:text-orange-700 rounded text-[10px] font-semibold text-gray-600 transition-colors"
                      >
                        ₹20
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          roles: { ...prev.roles, worker: { ...prev.roles.worker, enabled: false, rewardAmount: 0 } }
                        }))}
                        className="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[10px] font-semibold transition-colors"
                      >
                        Disable (₹0)
                      </button>
                    </div>
                  </div>
                </div>

                {/* App UI Status indicator */}
                <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                  settings.roles.worker.enabled && Number(settings.roles.worker.rewardAmount) > 0
                    ? 'bg-orange-50 text-orange-800 border border-orange-100'
                    : 'bg-rose-50 text-rose-800 border border-rose-100'
                }`}>
                  {settings.roles.worker.enabled && Number(settings.roles.worker.rewardAmount) > 0 ? (
                    <span>✅ Shown as <b>₹{settings.roles.worker.rewardAmount}</b> in app UI</span>
                  ) : (
                    <span>🚫 <b>Removed from app UI</b> ({!settings.roles.worker.enabled ? 'Disabled' : 'Reward is ₹0'})</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Qualification Trigger Strategy */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <h4 className="text-sm font-bold text-gray-900 mb-1">Qualification Event Rule</h4>
            <p className="text-xs text-gray-500 mb-3">
              Define when the referral reward is disbursed to the referrer.
            </p>
            <div className="grid grid-cols-1 gap-3 max-w-xl">
              {/* Option 1: On Admin Approval */}
              <label className={`p-3.5 rounded-xl border cursor-pointer flex items-center gap-3 transition-all ${
                (settings.qualificationEvent === 'ADMIN_APPROVAL' || settings.qualificationEvent === 'on_approval')
                  ? 'border-emerald-500 bg-emerald-50/40 text-emerald-900 shadow-sm ring-1 ring-emerald-500/20'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="qualificationEvent"
                  value="ADMIN_APPROVAL"
                  checked={settings.qualificationEvent === 'ADMIN_APPROVAL' || settings.qualificationEvent === 'on_approval'}
                  onChange={(e) => setSettings(prev => ({ ...prev, qualificationEvent: e.target.value }))}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-bold block">On Admin Approval (Recommended)</span>
                  <span className="text-[11px] text-gray-500">Reward credited when account is verified & approved</span>
                </div>
              </label>

              {/* Option 2: On Registration */}
              <label className={`p-3.5 rounded-xl border cursor-pointer flex items-center gap-3 transition-all ${
                (settings.qualificationEvent === 'REGISTRATION' || settings.qualificationEvent === 'on_registration')
                  ? 'border-emerald-500 bg-emerald-50/40 text-emerald-900 shadow-sm ring-1 ring-emerald-500/20'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="qualificationEvent"
                  value="REGISTRATION"
                  checked={settings.qualificationEvent === 'REGISTRATION' || settings.qualificationEvent === 'on_registration'}
                  onChange={(e) => setSettings(prev => ({ ...prev, qualificationEvent: e.target.value }))}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-bold block">On Registration</span>
                  <span className="text-[11px] text-gray-500">Reward credited immediately upon verified signup</span>
                </div>
              </label>

              {/* Option 3: On Registration Fee Payment */}
              <label className={`p-3.5 rounded-xl border cursor-pointer flex items-center gap-3 transition-all ${
                (settings.qualificationEvent === 'REGISTRATION_FEE_PAYMENT' || settings.qualificationEvent === 'on_registration_fee_payment')
                  ? 'border-emerald-500 bg-emerald-50/40 text-emerald-900 shadow-sm ring-1 ring-emerald-500/20'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="qualificationEvent"
                  value="REGISTRATION_FEE_PAYMENT"
                  checked={settings.qualificationEvent === 'REGISTRATION_FEE_PAYMENT' || settings.qualificationEvent === 'on_registration_fee_payment'}
                  onChange={(e) => setSettings(prev => ({ ...prev, qualificationEvent: e.target.value }))}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-bold block">On Registration Fee Payment</span>
                  <span className="text-[11px] text-gray-500">Reward credited after registration fee payment is successfully verified</span>
                </div>
              </label>
            </div>
          </div>

          {/* Registration / Share Link Configuration */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-0.5">App Registration & Share Link URL</h4>
                <p className="text-xs text-gray-500">
                  The target registration link shared with new users when farmers, vendors, or workers share their referral code.
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200">
                Deploy / Production URL
              </span>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <input
                type="url"
                value={settings.registrationUrl || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, registrationUrl: e.target.value }))}
                placeholder="https://agroyilt.com/app/register"
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 font-mono text-xs sm:text-sm text-gray-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, registrationUrl: 'https://agroyilt.com/app/register' }))}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition whitespace-nowrap"
              >
                Reset Default
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Default: <code className="text-gray-600 bg-gray-100 px-1 py-0.5 rounded">https://agroyilt.com/app/register</code>. You can change this to point referrals to a custom landing page, app store link, or another domain anytime.
            </p>
          </div>

          {/* Play Store link: where an invited Android phone without the app goes */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-0.5">Play Store Link</h4>
              <p className="text-xs text-gray-500">
                A shared referral link (agroyilt.com/r/CODE) sends an Android phone here, with the referral code attached. Everyone else goes to the registration link above.
              </p>
            </div>
            <input
              type="url"
              value={settings.playStoreUrl || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, playStoreUrl: e.target.value }))}
              placeholder="https://play.google.com/store/apps/details?id=com.agroyilt.app"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 font-mono text-xs sm:text-sm text-gray-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              <FiSave className="w-4 h-4" />
              <span>{saving ? 'Saving Changes...' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: ATTRIBUTIONS & REFERRAL HISTORY */}
      {activeTab === 'attributions' && (
        <div className="space-y-5">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <FiUsers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Total Attributions</p>
                <p className="text-2xl font-black text-gray-900 mt-0.5">{attributionStats.totalAttributions}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <FiCheckCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Qualified & Rewarded</p>
                <p className="text-2xl font-black text-emerald-600 mt-0.5">{attributionStats.totalQualified}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                <FiDollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Total Disbursed</p>
                <p className="text-2xl font-black text-purple-700 mt-0.5">₹{attributionStats.totalPaidRupees}</p>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <FiSearch className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search code or user..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                  className="w-full pl-9 pr-4 py-2 border rounded-xl text-xs sm:text-sm outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <select
                value={filters.role}
                onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value, page: 1 }))}
                className="py-2 px-3 border rounded-xl text-xs sm:text-sm outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
              >
                <option value="all">All Roles</option>
                <option value="farmer">Farmer</option>
                <option value="vendor">Vendor</option>
                <option value="worker">Worker</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                className="py-2 px-3 border rounded-xl text-xs sm:text-sm outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending_qualification">Pending</option>
                <option value="qualified">Qualified</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>

            <button
              onClick={fetchAttributions}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors self-end sm:self-auto"
            >
              Refresh Table
            </button>
          </div>

          {/* Attributions Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600">
                <thead className="bg-gray-50 text-gray-700 uppercase font-bold text-[11px] border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Referrer</th>
                    <th className="px-4 py-3">Referred User</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Reward</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingAttributions ? (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-gray-400">
                        Loading attributions...
                      </td>
                    </tr>
                  ) : attributions.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-gray-400">
                        No referral attributions found.
                      </td>
                    </tr>
                  ) : (
                    attributions.map((row) => (
                      <tr key={row._id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono">
                          {new Date(row.createdAt).toLocaleDateString()}
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-bold text-gray-800">{row.referrerName}</p>
                          <span className="text-[10px] text-gray-400 font-mono">{row.referrerPhone || row.referrerModel}</span>
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-bold text-gray-800">{row.referredName}</p>
                          <span className="text-[10px] text-gray-400 font-mono">{row.referredPhone || row.referredModel}</span>
                        </td>

                        <td className="px-4 py-3 font-mono font-bold text-emerald-700">
                          {row.referralCode}
                        </td>

                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            row.referredRole === 'farmer'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.referredRole === 'vendor'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {row.referredRole}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-bold text-gray-900">
                          ₹{row.rewardAmountRupees}
                          <span className="text-[10px] font-normal text-gray-400 block font-mono">
                            v{row.rewardConfigVersion || 1}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {row.status === 'qualified' ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                <FiCheck className="w-3 h-3" /> Credited
                              </span>
                              {row.qualificationRule && (
                                <span className="text-[10px] text-gray-500 block mt-0.5 font-medium">
                                  {row.qualificationRule === 'REGISTRATION_FEE_PAYMENT' || row.qualificationRule === 'on_registration_fee_payment'
                                    ? '💳 Fee Payment'
                                    : row.qualificationRule === 'REGISTRATION' || row.qualificationRule === 'on_registration'
                                    ? '📝 On Signup'
                                    : '🛡️ Admin Approval'}
                                </span>
                              )}
                              {row.paymentReference && (
                                <span className="text-[9px] text-gray-400 block font-mono" title={row.paymentReference}>
                                  Ref: {row.paymentReference.slice(-10)}
                                </span>
                              )}
                            </div>
                          ) : row.status === 'reversed' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                              <FiRotateCcw className="w-3 h-3" /> Reversed
                            </span>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                                <FiClock className="w-3 h-3" /> Pending
                              </span>
                              {row.qualificationRule && (
                                <span className="text-[10px] text-gray-400 block mt-0.5">
                                  Awaiting: {row.qualificationRule === 'REGISTRATION_FEE_PAYMENT' ? 'Fee Payment' : 'Approval'}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {row.status === 'qualified' && (
                            <button
                              onClick={() => handleOpenReverse(row)}
                              className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 rounded-lg transition-colors"
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination.pages > 1 && (
              <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                <span>Page {pagination.page} of {pagination.pages}</span>
                <div className="flex gap-1">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                    className="px-3 py-1 bg-white border rounded-lg disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                    className="px-3 py-1 bg-white border rounded-lg disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CONFIGURATION AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-gray-900">Admin Audit History</h3>
            <p className="text-xs text-gray-500">
              Immutable record of all modifications to referral reward rates and system switches.
            </p>
          </div>

          {!settings.auditHistory || settings.auditHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">
              No configuration changes recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-700 uppercase font-bold text-[11px] border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Admin</th>
                    <th className="px-4 py-3">Target Role / Setting</th>
                    <th className="px-4 py-3">Field</th>
                    <th className="px-4 py-3">Old Value</th>
                    <th className="px-4 py-3">New Value</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {settings.auditHistory.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono">
                        {new Date(item.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {item.adminEmail || 'Admin'}
                      </td>
                      <td className="px-4 py-3 font-bold uppercase text-gray-700">
                        {item.role}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-500">
                        {item.field}
                      </td>
                      <td className="px-4 py-3 font-mono text-rose-600 font-bold">
                        {typeof item.oldValue === 'number' && item.field.includes('Paise')
                          ? `₹${item.oldValue / 100} (${item.oldValue}p)`
                          : String(item.oldValue)}
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-600 font-bold">
                        {typeof item.newValue === 'number' && item.field.includes('Paise')
                          ? `₹${item.newValue / 100} (${item.newValue}p)`
                          : String(item.newValue)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 italic">
                        {item.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* REVERSAL MODAL */}
      {reversalModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 text-rose-600">
                <FiRotateCcw className="w-5 h-5" /> Reverse Referral Reward
              </h3>
              <button
                onClick={() => setReversalModal({ isOpen: false, attribution: null, reason: '', processing: false })}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              This action will debit <strong>₹{reversalModal.attribution?.rewardAmountRupees}</strong> from the Referrer's wallet and mark this attribution as <strong>REVERSED</strong>.
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Reversal Reason (Required)
              </label>
              <textarea
                rows="3"
                value={reversalModal.reason}
                onChange={(e) => setReversalModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="e.g. Fraudulent signup, duplicate account, abusive referral..."
                className="w-full p-3 text-xs border rounded-xl outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReversalModal({ isOpen: false, attribution: null, reason: '', processing: false })}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReverse}
                disabled={reversalModal.processing || !reversalModal.reason.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md disabled:opacity-50"
              >
                {reversalModal.processing ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralManagement;
