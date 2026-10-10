import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiTrendingUp,
  FiTrendingDown,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiCheck,
  FiX,
  FiSearch,
  FiRefreshCw,
  FiExternalLink,
  FiFileText,
  FiLayers,
  FiAlertCircle
} from 'react-icons/fi';
import { LuWheat, LuLandmark } from 'react-icons/lu';
import api from '../../../../services/api';
import { toastManager } from '../../../../utils/toastManager';

const KisanSuvidhaAdmin = () => {
  const [activeTab, setActiveTab] = useState('mandi'); // 'mandi' | 'schemes'
  const [mandiPrices, setMandiPrices] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isMandiModalOpen, setIsMandiModalOpen] = useState(false);
  const [editingMandi, setEditingMandi] = useState(null);
  const [mandiFormData, setMandiFormData] = useState({
    commodity: '',
    commodityEnglish: '',
    market: '',
    state: 'हरियाणा',
    district: '',
    modalPrice: '',
    minPrice: '',
    maxPrice: '',
    priceUnit: 'क्विं.',
    change: '+₹0',
    isUp: true,
    quality: 'सामान्य',
    isActive: true
  });

  const [isSchemeModalOpen, setIsSchemeModalOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState(null);
  const [schemeFormData, setSchemeFormData] = useState({
    title: '',
    tag: '',
    category: 'उपकरण व मशीनरी',
    summary: '',
    eligibility: '',
    docs: '',
    portalUrl: '',
    portalName: '',
    isActive: true
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/kisan-suvidha/data');
      if (res?.data?.success) {
        setMandiPrices(res.data.mandiPrices || []);
        setSchemes(res.data.schemes || []);
      }
    } catch (err) {
      console.error('Fetch Kisan Suvidha error:', err);
      toastManager.error('Failed to load data from server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Reset defaults handler
  const handleResetDefaults = async () => {
    if (!window.confirm('Are you sure you want to restore official default Mandi prices and Govt schemes? This will overwrite manual changes.')) {
      return;
    }
    try {
      setLoading(true);
      const res = await api.post('/admin/kisan-suvidha/seed-defaults');
      if (res?.data?.success) {
        toastManager.success('Successfully restored official defaults!');
        setMandiPrices(res.data.mandiPrices || []);
        setSchemes(res.data.schemes || []);
      }
    } catch (err) {
      toastManager.error('Failed to reset defaults');
    } finally {
      setLoading(false);
    }
  };

  // Open Mandi Modal
  const openMandiModal = (item = null) => {
    if (item) {
      setEditingMandi(item);
      setMandiFormData({
        commodity: item.commodity || '',
        commodityEnglish: item.commodityEnglish || '',
        market: item.market || '',
        state: item.state || 'हरियाणा',
        district: item.district || '',
        modalPrice: item.modalPrice || '',
        minPrice: item.minPrice || '',
        maxPrice: item.maxPrice || '',
        priceUnit: item.priceUnit || 'क्विं.',
        change: item.change || '+₹0',
        isUp: item.isUp !== undefined ? item.isUp : true,
        quality: item.quality || 'सामान्य',
        isActive: item.isActive !== undefined ? item.isActive : true
      });
    } else {
      setEditingMandi(null);
      setMandiFormData({
        commodity: '',
        commodityEnglish: '',
        market: '',
        state: 'हरियाणा',
        district: '',
        modalPrice: '',
        minPrice: '',
        maxPrice: '',
        priceUnit: 'क्विं.',
        change: '+₹0',
        isUp: true,
        quality: 'सामान्य',
        isActive: true
      });
    }
    setIsMandiModalOpen(true);
  };

  // Save Mandi item
  const handleSaveMandi = async (e) => {
    e.preventDefault();
    if (!mandiFormData.commodity || !mandiFormData.market || !mandiFormData.modalPrice) {
      toastManager.error('Commodity, Market and Modal Price are required');
      return;
    }

    try {
      if (editingMandi) {
        const res = await api.put(`/admin/kisan-suvidha/mandi/${editingMandi._id}`, mandiFormData);
        if (res?.data?.success) {
          toastManager.success('Mandi price updated successfully');
          setIsMandiModalOpen(false);
          fetchData();
        }
      } else {
        const res = await api.post('/admin/kisan-suvidha/mandi', mandiFormData);
        if (res?.data?.success) {
          toastManager.success('Mandi price created successfully');
          setIsMandiModalOpen(false);
          fetchData();
        }
      }
    } catch (err) {
      toastManager.error(err?.response?.data?.message || 'Failed to save mandi price');
    }
  };

  // Delete Mandi item
  const handleDeleteMandi = async (id) => {
    if (!window.confirm('Are you sure you want to delete this crop price record?')) return;
    try {
      const res = await api.delete(`/admin/kisan-suvidha/mandi/${id}`);
      if (res?.data?.success) {
        toastManager.success('Mandi price deleted');
        setMandiPrices(prev => prev.filter(m => m._id !== id));
      }
    } catch (err) {
      toastManager.error('Failed to delete record');
    }
  };

  // Open Scheme Modal
  const openSchemeModal = (scheme = null) => {
    if (scheme) {
      setEditingScheme(scheme);
      setSchemeFormData({
        title: scheme.title || '',
        tag: scheme.tag || '',
        category: scheme.category || 'उपकरण व मशीनरी',
        summary: scheme.summary || '',
        eligibility: scheme.eligibility || '',
        docs: Array.isArray(scheme.docs) ? scheme.docs.join(', ') : (scheme.docs || ''),
        portalUrl: scheme.portalUrl || '',
        portalName: scheme.portalName || '',
        isActive: scheme.isActive !== undefined ? scheme.isActive : true
      });
    } else {
      setEditingScheme(null);
      setSchemeFormData({
        title: '',
        tag: '',
        category: 'उपकरण व मशीनरी',
        summary: '',
        eligibility: '',
        docs: '',
        portalUrl: '',
        portalName: '',
        isActive: true
      });
    }
    setIsSchemeModalOpen(true);
  };

  // Save Scheme
  const handleSaveScheme = async (e) => {
    e.preventDefault();
    if (!schemeFormData.title || !schemeFormData.summary) {
      toastManager.error('Title and Summary are required');
      return;
    }

    try {
      const payload = {
        ...schemeFormData,
        docs: schemeFormData.docs ? schemeFormData.docs.split(',').map(s => s.trim()).filter(Boolean) : []
      };

      if (editingScheme) {
        const res = await api.put(`/admin/kisan-suvidha/schemes/${editingScheme._id}`, payload);
        if (res?.data?.success) {
          toastManager.success('Scheme updated successfully');
          setIsSchemeModalOpen(false);
          fetchData();
        }
      } else {
        const res = await api.post('/admin/kisan-suvidha/schemes', payload);
        if (res?.data?.success) {
          toastManager.success('Scheme created successfully');
          setIsSchemeModalOpen(false);
          fetchData();
        }
      }
    } catch (err) {
      toastManager.error(err?.response?.data?.message || 'Failed to save scheme');
    }
  };

  // Delete Scheme
  const handleDeleteScheme = async (id) => {
    if (!window.confirm('Are you sure you want to delete this government scheme?')) return;
    try {
      const res = await api.delete(`/admin/kisan-suvidha/schemes/${id}`);
      if (res?.data?.success) {
        toastManager.success('Scheme deleted');
        setSchemes(prev => prev.filter(s => s._id !== id));
      }
    } catch (err) {
      toastManager.error('Failed to delete scheme');
    }
  };

  // Filtered lists
  const filteredMandi = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return mandiPrices;
    return mandiPrices.filter(m =>
      m.commodity?.toLowerCase().includes(q) ||
      m.commodityEnglish?.toLowerCase().includes(q) ||
      m.market?.toLowerCase().includes(q) ||
      m.state?.toLowerCase().includes(q)
    );
  }, [mandiPrices, searchQuery]);

  const filteredSchemes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return schemes;
    return schemes.filter(s =>
      s.title?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q) ||
      s.tag?.toLowerCase().includes(q)
    );
  }, [schemes, searchQuery]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <LuLandmark className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Kisan Suvidha & Mandi Bhav Management
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configure live APMC crop rates and official government agriculture subsidy schemes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleResetDefaults}
            className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
          >
            Reset Defaults
          </button>

          <button
            onClick={() => (activeTab === 'mandi' ? openMandiModal() : openSchemeModal())}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <FiPlus className="w-4 h-4" />
            <span>{activeTab === 'mandi' ? 'Add Mandi Crop Rate' : 'Add Govt Scheme'}</span>
          </button>
        </div>
      </div>

      {/* Govt API Integration Notice */}
      <div className="bg-emerald-950 text-white p-4 rounded-2xl border border-emerald-800/80 flex items-start gap-3 shadow-sm">
        <FiAlertCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm">
          <p className="font-bold text-emerald-200">
            Government API Ready Architecture:
          </p>
          <p className="text-slate-300 mt-0.5 leading-relaxed">
            All prices and schemes configured here are instantly reflected on the farmer app and website. When your live Government API (eNAM / Agmarknet / PM Kisan) is connected, live automated updates will seamlessly sync into this model.
          </p>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('mandi')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-black transition-all ${
              activeTab === 'mandi'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📈 Mandi Rates ({mandiPrices.length})
          </button>
          <button
            onClick={() => setActiveTab('schemes')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-black transition-all ${
              activeTab === 'schemes'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🏛️ Govt Schemes ({schemes.length})
          </button>
        </div>

        <div className="relative min-w-[260px]">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'mandi' ? 'Search crop, market, state...' : 'Search scheme, category, tag...'}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
      </div>

      {/* Tab 1: Mandi Rates Table */}
      {activeTab === 'mandi' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="p-3.5">Commodity / Crop</th>
                  <th className="p-3.5">APMC Market</th>
                  <th className="p-3.5">Quality</th>
                  <th className="p-3.5">Modal Price</th>
                  <th className="p-3.5">Min - Max Price</th>
                  <th className="p-3.5">Trend</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredMandi.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">
                      <div>{item.commodity}</div>
                      {item.commodityEnglish && (
                        <div className="text-[10px] text-slate-400">{item.commodityEnglish}</div>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-800">{item.market}</div>
                      <div className="text-[10px] text-slate-400">{item.state}</div>
                    </td>
                    <td className="p-3.5 text-slate-600">{item.quality || '—'}</td>
                    <td className="p-3.5">
                      <span className="font-black text-emerald-700 text-sm">
                        ₹{Number(item.modalPrice).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400">/{item.priceUnit || 'क्विं.'}</span>
                    </td>
                    <td className="p-3.5 text-[11px] text-slate-500">
                      {item.minPrice > 0 || item.maxPrice > 0
                        ? `₹${Number(item.minPrice).toLocaleString()} - ₹${Number(item.maxPrice).toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10.5px] font-bold ${
                          item.isUp
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {item.isUp ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
                        <span>{item.change}</span>
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.isActive ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    <td className="p-3.5 text-right space-x-2">
                      <button
                        onClick={() => openMandiModal(item)}
                        className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <FiEdit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteMandi(item._id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredMandi.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-xs font-semibold">
              No crop price records found matching your query.
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Schemes List */}
      {activeTab === 'schemes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSchemes.map((scheme) => (
            <div
              key={scheme._id}
              className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:border-emerald-400 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {scheme.category}
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    {scheme.tag}
                  </span>
                </div>

                <h3 className="text-base font-black text-slate-900 leading-snug">
                  {scheme.title}
                </h3>

                <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                  {scheme.summary}
                </p>

                {scheme.eligibility && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    <strong className="text-slate-800 font-bold">Eligibility: </strong>
                    {scheme.eligibility}
                  </p>
                )}

                {Array.isArray(scheme.docs) && scheme.docs.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {scheme.docs.map((d, idx) => (
                      <span key={idx} className="text-[9.5px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  {scheme.portalUrl ? (
                    <a
                      href={scheme.portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
                    >
                      <span>{scheme.portalName || 'Official Portal'}</span>
                      <FiExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[10px] text-slate-400">No portal url</span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openSchemeModal(scheme)}
                    className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <FiEdit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteScheme(scheme._id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredSchemes.length === 0 && (
            <div className="col-span-full p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs font-semibold">
              No government schemes found.
            </div>
          )}
        </div>
      )}

      {/* Modal: Mandi Crop Rate */}
      <AnimatePresence>
        {isMandiModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-black text-slate-900">
                  {editingMandi ? 'Edit Mandi Rate' : 'Add Mandi Crop Rate'}
                </h3>
                <button
                  onClick={() => setIsMandiModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveMandi} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Commodity / Crop (Hindi + English) *
                  </label>
                  <input
                    type="text"
                    required
                    value={mandiFormData.commodity}
                    onChange={(e) => setMandiFormData({ ...mandiFormData, commodity: e.target.value })}
                    placeholder="e.g. गेहूं (Wheat)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      APMC Market *
                    </label>
                    <input
                      type="text"
                      required
                      value={mandiFormData.market}
                      onChange={(e) => setMandiFormData({ ...mandiFormData, market: e.target.value })}
                      placeholder="e.g. करनाल APMC"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={mandiFormData.state}
                      onChange={(e) => setMandiFormData({ ...mandiFormData, state: e.target.value })}
                      placeholder="e.g. हरियाणा"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Modal Rate (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      value={mandiFormData.modalPrice}
                      onChange={(e) => setMandiFormData({ ...mandiFormData, modalPrice: e.target.value })}
                      placeholder="2275"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Min Rate (₹)
                    </label>
                    <input
                      type="number"
                      value={mandiFormData.minPrice}
                      onChange={(e) => setMandiFormData({ ...mandiFormData, minPrice: e.target.value })}
                      placeholder="2200"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Max Rate (₹)
                    </label>
                    <input
                      type="number"
                      value={mandiFormData.maxPrice}
                      onChange={(e) => setMandiFormData({ ...mandiFormData, maxPrice: e.target.value })}
                      placeholder="2320"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Trend Change
                    </label>
                    <input
                      type="text"
                      value={mandiFormData.change}
                      onChange={(e) => setMandiFormData({ ...mandiFormData, change: e.target.value })}
                      placeholder="+₹25 or -₹15"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Quality / Variety
                    </label>
                    <input
                      type="text"
                      value={mandiFormData.quality}
                      onChange={(e) => setMandiFormData({ ...mandiFormData, quality: e.target.value })}
                      placeholder="मिल क्वालिटी"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={mandiFormData.isUp}
                      onChange={(e) => setMandiFormData({ ...mandiFormData, isUp: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Price Trend is UP (Green)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={mandiFormData.isActive}
                      onChange={(e) => setMandiFormData({ ...mandiFormData, isActive: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Active on App</span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsMandiModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    {editingMandi ? 'Update Rate' : 'Save Rate'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Scheme */}
      <AnimatePresence>
        {isSchemeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-black text-slate-900">
                  {editingScheme ? 'Edit Government Scheme' : 'Add Government Scheme'}
                </h3>
                <button
                  onClick={() => setIsSchemeModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveScheme} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Scheme Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={schemeFormData.title}
                    onChange={(e) => setSchemeFormData({ ...schemeFormData, title: e.target.value })}
                    placeholder="e.g. SMAM कृषि यंत्रीकरण योजना"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Subsidy Tag / Amount
                    </label>
                    <input
                      type="text"
                      value={schemeFormData.tag}
                      onChange={(e) => setSchemeFormData({ ...schemeFormData, tag: e.target.value })}
                      placeholder="e.g. 40% - 50% सब्सिडी"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={schemeFormData.category}
                      onChange={(e) => setSchemeFormData({ ...schemeFormData, category: e.target.value })}
                      placeholder="e.g. उपकरण व मशीनरी"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Summary / Description *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={schemeFormData.summary}
                    onChange={(e) => setSchemeFormData({ ...schemeFormData, summary: e.target.value })}
                    placeholder="Brief description of the subsidy and benefits..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Eligibility Criteria
                  </label>
                  <input
                    type="text"
                    value={schemeFormData.eligibility}
                    onChange={(e) => setSchemeFormData({ ...schemeFormData, eligibility: e.target.value })}
                    placeholder="Who can apply? (e.g. लघु एवं सीमांत किसान)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Required Documents (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={schemeFormData.docs}
                    onChange={(e) => setSchemeFormData({ ...schemeFormData, docs: e.target.value })}
                    placeholder="आधार कार्ड, बैंक पासबुक, जमीन की फर्द"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Official Portal URL
                    </label>
                    <input
                      type="url"
                      value={schemeFormData.portalUrl}
                      onChange={(e) => setSchemeFormData({ ...schemeFormData, portalUrl: e.target.value })}
                      placeholder="https://pmkisan.gov.in"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Portal Display Name
                    </label>
                    <input
                      type="text"
                      value={schemeFormData.portalName}
                      onChange={(e) => setSchemeFormData({ ...schemeFormData, portalName: e.target.value })}
                      placeholder="pmkisan.gov.in"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={schemeFormData.isActive}
                      onChange={(e) => setSchemeFormData({ ...schemeFormData, isActive: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Active on Farmer App</span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsSchemeModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    {editingScheme ? 'Update Scheme' : 'Save Scheme'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default KisanSuvidhaAdmin;
