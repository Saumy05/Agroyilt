import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FiGlobe, FiPlus, FiTrash2, FiCheck, FiStar, FiAlertCircle, FiX, FiChevronDown, FiSearch } from 'react-icons/fi';
import {
  getAdminLanguages,
  toggleLanguageStatus,
  setDefaultLanguage,
  addLanguage,
  deleteLanguage
} from '../../../../services/languageService';
import { toastManager } from '../../../../utils/toastManager';
import { useLanguage } from '../../../../context/LanguageContext';
import LogoLoader from '../../../../components/common/LogoLoader';

// Curated list of Indian official languages (22 Eighth Schedule) & popular regional dialects
const INDIAN_LANGUAGES = [
  { name: 'English', nativeName: 'English', code: 'en', flag: '🇬🇧' },
  { name: 'Hindi', nativeName: 'हिन्दी', code: 'hi', flag: '🇮🇳' },
  { name: 'Bengali', nativeName: 'বাংলা', code: 'bn', flag: '🇮🇳' },
  { name: 'Marathi', nativeName: 'मराठी', code: 'mr', flag: '🇮🇳' },
  { name: 'Telugu', nativeName: 'తెలుగు', code: 'te', flag: '🇮🇳' },
  { name: 'Tamil', nativeName: 'தமிழ்', code: 'ta', flag: '🇮🇳' },
  { name: 'Gujarati', nativeName: 'ગુજરાતી', code: 'gu', flag: '🇮🇳' },
  { name: 'Urdu', nativeName: 'اردو', code: 'ur', flag: '🇮🇳', isRTL: true },
  { name: 'Kannada', nativeName: 'ಕನ್ನಡ', code: 'kn', flag: '🇮🇳' },
  { name: 'Odia', nativeName: 'ଓଡ଼ିଆ', code: 'or', flag: '🇮🇳' },
  { name: 'Malayalam', nativeName: 'മലയാളം', code: 'ml', flag: '🇮🇳' },
  { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', code: 'pa', flag: '🇮🇳' },
  { name: 'Assamese', nativeName: 'অসমীয়া', code: 'as', flag: '🇮🇳' },
  { name: 'Maithili', nativeName: 'मैथिली', code: 'mai', flag: '🇮🇳' },
  { name: 'Bhojpuri', nativeName: 'भोजपुरी', code: 'bho', flag: '🇮🇳' },
  { name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', code: 'sat', flag: '🇮🇳' },
  { name: 'Kashmiri', nativeName: 'कॉशुर / کٲشُر', code: 'ks', flag: '🇮🇳' },
  { name: 'Nepali', nativeName: 'नेपाली', code: 'ne', flag: '🇳🇵' },
  { name: 'Konkani', nativeName: 'कोंकणी', code: 'kok', flag: '🇮🇳' },
  { name: 'Sindhi', nativeName: 'سنڌي / सिंधी', code: 'sd', flag: '🇮🇳' },
  { name: 'Dogri', nativeName: 'डोगरी', code: 'doi', flag: '🇮🇳' },
  { name: 'Manipuri', nativeName: 'ꯃꯤꯇꯩꯂꯣꯟ', code: 'mni', flag: '🇮🇳' },
  { name: 'Bodo', nativeName: 'बड़ो', code: 'brx', flag: '🇮🇳' },
  { name: 'Sanskrit', nativeName: 'संस्कृतम्', code: 'sa', flag: '🇮🇳' },
  { name: 'Haryanvi', nativeName: 'हरियाणवी', code: 'bgc', flag: '🇮🇳' },
  { name: 'Chhattisgarhi', nativeName: 'छत्तीसगढ़ी', code: 'hne', flag: '🇮🇳' },
  { name: 'Marwari', nativeName: 'मारवाड़ी', code: 'mwr', flag: '🇮🇳' },
];

const Switch = ({ checked, onChange, disabled, title }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    title={title}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
      checked ? 'bg-emerald-600' : 'bg-gray-300'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const Languages = () => {
  const { refreshLanguages } = useLanguage();
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const dropdownRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newLang, setNewLang] = useState({
    name: '',
    nativeName: '',
    code: '',
    flag: '🇮🇳',
    isRTL: false,
    isActive: true
  });

  // Close custom dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!showAddModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showAddModal]);

  // Set of existing language codes to avoid duplicates
  const existingCodes = useMemo(() => {
    return new Set((languages || []).map((l) => (l.code || '').toLowerCase().trim()));
  }, [languages]);

  // Selected preset object
  const selectedPresetObj = useMemo(() => {
    return INDIAN_LANGUAGES.find((p) => p.code === selectedPreset);
  }, [selectedPreset]);

  // Filtered Indian languages based on search input
  const filteredIndianLanguages = useMemo(() => {
    const q = dropdownSearch.trim().toLowerCase();
    if (!q) return INDIAN_LANGUAGES;
    return INDIAN_LANGUAGES.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.nativeName.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
    );
  }, [dropdownSearch]);

  const handleChooseLanguage = (preset) => {
    if (preset === 'custom') {
      setSelectedPreset('custom');
      setIsDropdownOpen(false);
      setNewLang({
        name: '',
        nativeName: '',
        code: '',
        flag: '🇮🇳',
        isRTL: false,
        isActive: true
      });
      return;
    }

    setSelectedPreset(preset.code);
    setIsDropdownOpen(false);
    setNewLang({
      name: preset.name,
      nativeName: preset.nativeName,
      code: preset.code,
      flag: preset.flag || '🇮🇳',
      isRTL: Boolean(preset.isRTL),
      isActive: true
    });
  };

  const loadLanguages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getAdminLanguages();
      if (res.success && Array.isArray(res.languages)) {
        setLanguages(res.languages);
      }
    } catch (err) {
      console.error('Failed to load languages:', err);
      toastManager.error(err.response?.data?.message || 'Failed to load languages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLanguages();
  }, [loadLanguages]);

  const handleToggle = async (lang) => {
    if (lang.isDefault) {
      toastManager.error('Cannot disable the default language. Change default language first.');
      return;
    }

    try {
      setBusyId(lang._id);
      const res = await toggleLanguageStatus(lang._id, !lang.isActive);
      if (res.success) {
        toastManager.success(res.message || 'Language updated');
        await loadLanguages();
        refreshLanguages();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to update language status');
    } finally {
      setBusyId(null);
    }
  };

  const handleSetDefault = async (lang) => {
    if (lang.isDefault) return;
    try {
      setBusyId(lang._id);
      const res = await setDefaultLanguage(lang._id);
      if (res.success) {
        toastManager.success(`${lang.name} is now the default language`);
        // Sync local storage cache to reflect the new system default immediately
        localStorage.setItem('systemDefaultLanguage', lang.name);
        localStorage.setItem('systemDefaultLanguageCode', lang.code);
        // Clear any explicit lock on this browser so admin testing immediately sees the new default
        localStorage.removeItem('userLanguageExplicit');
        await loadLanguages();
        await refreshLanguages();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to set default language');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (lang) => {
    if (!window.confirm(`Are you sure you want to delete ${lang.name}?`)) return;
    try {
      setBusyId(lang._id);
      const res = await deleteLanguage(lang._id);
      if (res.success) {
        toastManager.success(res.message || 'Language deleted');
        await loadLanguages();
        refreshLanguages();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to delete language');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newLang.name || !newLang.nativeName || !newLang.code) {
      toastManager.error('Please fill all required fields');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await addLanguage(newLang);
      if (res.success) {
        toastManager.success('New language added successfully');
        setShowAddModal(false);
        setSelectedPreset('');
        setNewLang({
          name: '',
          nativeName: '',
          code: '',
          flag: '🇮🇳',
          isRTL: false,
          isActive: true
        });
        await loadLanguages();
        refreshLanguages();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to add language');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <LogoLoader />
      </div>
    );
  }

  const activeCount = languages.filter((l) => l.isActive).length;
  const defaultLang = languages.find((l) => l.isDefault);

  return (
    <div className="space-y-6">
      {/* Header & Stats Banner */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl">
            <FiGlobe />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Language Management</h2>
            <p className="text-sm text-gray-500">
              Control which languages are available to Workers and Users across AgroYilt.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm self-start md:self-auto cursor-pointer"
        >
          <FiPlus className="w-4 h-4" />
          Add Language
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Supported</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{languages.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Active in Apps</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Default Language</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg">{defaultLang?.flag || '🇬🇧'}</span>
            <span className="text-xl font-bold text-gray-800">{defaultLang?.name || 'English'}</span>
          </div>
        </div>
      </div>

      {/* Languages Table / Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-sm">Available Languages</h3>
          <span className="text-xs text-gray-400">Toggle switch to show or hide from Worker & User apps</span>
        </div>

        <div className="divide-y divide-gray-100">
          {languages.map((lang) => {
            const isBusy = busyId === lang._id;
            return (
              <div
                key={lang._id || lang.code}
                className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/60 transition-colors"
              >
                {/* Language Info */}
                <div className="flex items-center gap-3.5">
                  <span className="text-2xl p-2 bg-gray-50 rounded-lg border border-gray-100">
                    {lang.flag || '🌐'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800 text-base">{lang.name}</span>
                      <span className="text-gray-500 text-sm">({lang.nativeName})</span>
                      <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase">
                        {lang.code}
                      </span>
                      {lang.isDefault && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                          <FiStar className="w-3 h-3 fill-amber-500 text-amber-500" />
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {lang.isDefault
                        ? 'Applies as default on all new devices and users'
                        : lang.isActive
                        ? 'Currently selectable by Workers & Users'
                        : 'Hidden from Worker & User selection'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4 self-end sm:self-auto">
                  {/* Set as Default button */}
                  {!lang.isDefault && lang.isActive && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSetDefault(lang)}
                      className="text-xs font-medium text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-emerald-200 transition-all cursor-pointer disabled:opacity-50"
                    >
                      Set as Default
                    </button>
                  )}

                  {/* Active Toggle Switch */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      {lang.isActive ? 'Active' : 'Disabled'}
                    </span>
                    <Switch
                      checked={lang.isActive}
                      onChange={() => handleToggle(lang)}
                      disabled={isBusy || lang.isDefault}
                      title={lang.isDefault ? 'Default language cannot be disabled' : 'Toggle active status'}
                    />
                  </div>

                  {/* Delete button (only for custom non-system languages) */}
                  {!lang.isSystem && !lang.isDefault && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDelete(lang)}
                      title="Delete custom language"
                      className="text-gray-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Language Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
            >
              <FiX className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
                <FiGlobe />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Add New Language</h3>
                <p className="text-xs text-gray-500">Enable an additional regional or international language</p>
              </div>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              {/* Custom Searchable Indian Languages Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Choose Language from Indian Presets *
                </label>

                {/* Dropdown Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`w-full px-3.5 py-2.5 bg-emerald-50/50 border rounded-xl text-sm font-semibold text-gray-800 flex items-center justify-between transition-all cursor-pointer shadow-2xs ${
                    isDropdownOpen
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white'
                      : 'border-emerald-300/80 hover:border-emerald-400'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {selectedPresetObj ? (
                      <>
                        <span className="text-base">{selectedPresetObj.flag}</span>
                        <span className="text-gray-900 font-bold">{selectedPresetObj.name}</span>
                        <span className="text-emerald-700 text-xs font-medium">({selectedPresetObj.nativeName})</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                          {selectedPresetObj.code}
                        </span>
                      </>
                    ) : selectedPreset === 'custom' ? (
                      <>
                        <span>✏️</span>
                        <span className="text-gray-900 font-semibold">Custom / Other Language (Manual)</span>
                      </>
                    ) : (
                      <span className="text-gray-400 font-normal">-- Select an Indian Language / भारतीय भाषा चुनें --</span>
                    )}
                  </div>
                  <FiChevronDown
                    className={`w-4 h-4 text-emerald-700 transition-transform duration-200 shrink-0 ml-2 ${
                      isDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Menu Container */}
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
                    {/* Search Input Header */}
                    <div className="p-2.5 border-b border-gray-100 bg-gray-50/70">
                      <div className="relative">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="text"
                          value={dropdownSearch}
                          onChange={(e) => setDropdownSearch(e.target.value)}
                          placeholder="Search Indian language or script (e.g. Odia, ଓଡ଼ିଆ)..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-gray-800"
                          autoFocus
                        />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                          >
                            <FiX className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Scrollable List */}
                    <div className="max-h-56 overflow-y-auto divide-y divide-gray-50 overscroll-contain">
                      {filteredIndianLanguages.map((p) => {
                        const isAdded = existingCodes.has(p.code.toLowerCase());
                        const isSelected = selectedPreset === p.code;

                        return (
                          <button
                            key={p.code}
                            type="button"
                            disabled={isAdded}
                            onClick={() => handleChooseLanguage(p)}
                            className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between text-xs transition-colors ${
                              isAdded
                                ? 'bg-gray-50/70 opacity-40 cursor-not-allowed text-gray-400'
                                : isSelected
                                ? 'bg-emerald-50 text-emerald-900 font-bold'
                                : 'hover:bg-gray-50 text-gray-800 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-base shrink-0">{p.flag}</span>
                              <span className="font-bold text-gray-900 truncate">{p.name}</span>
                              <span className="text-gray-500 truncate">({p.nativeName})</span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase font-semibold">
                                {p.code}
                              </span>
                              {isAdded && (
                                <span className="text-[10px] font-semibold text-gray-400 bg-gray-200/60 px-1.5 py-0.5 rounded">
                                  Already Added
                                </span>
                              )}
                              {isSelected && !isAdded && (
                                <FiCheck className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                              )}
                            </div>
                          </button>
                        );
                      })}

                      {filteredIndianLanguages.length === 0 && (
                        <div className="p-4 text-center text-xs text-gray-400">
                          No Indian languages found matching "{dropdownSearch}"
                        </div>
                      )}

                      {/* Custom Language Manual Entry Option */}
                      <button
                        type="button"
                        onClick={() => handleChooseLanguage('custom')}
                        className="w-full px-3.5 py-2.5 text-left flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border-t border-gray-100 bg-emerald-50/30 cursor-pointer transition-colors"
                      >
                        <span>✏️</span>
                        <span>Custom / Other Indian Dialect (Manual Entry)</span>
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-gray-400 mt-1">
                  Selecting a preset automatically fills the native script, ISO code, and flag below.
                </p>
              </div>

              {/* Pre-filled / Editable Details */}
              <div className="p-3.5 bg-gray-50/70 border border-gray-200/80 rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Language Name (in English) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Odia, Bengali, Urdu"
                    value={newLang.name}
                    onChange={(e) => setNewLang({ ...newLang, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Native Language Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ଓଡ଼ିଆ, বাংলা, اردو"
                    value={newLang.nativeName}
                    onChange={(e) => setNewLang({ ...newLang, nativeName: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      ISO Code *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. or, ur, fr"
                      value={newLang.code}
                      onChange={(e) => setNewLang({ ...newLang, code: e.target.value.toLowerCase().trim() })}
                      required
                      maxLength={5}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Flag Emoji
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 🇮🇳"
                      value={newLang.flag}
                      onChange={(e) => setNewLang({ ...newLang, flag: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-medium text-gray-700">Activate Immediately</span>
                <Switch
                  checked={newLang.isActive}
                  onChange={(val) => setNewLang({ ...newLang, isActive: val })}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Add Language'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Languages;
