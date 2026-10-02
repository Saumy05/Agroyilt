import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  FiChevronLeft, FiPlus, FiTrash2, FiUpload, 
  FiSettings, FiCheckCircle, FiInfo, FiUser,
  FiZap, FiMapPin, FiClock, FiCalendar, FiSmartphone, FiCreditCard, FiChevronDown, FiActivity, FiSearch,
  FiTruck, FiTool, FiCheck, FiSave
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { motion, AnimatePresence } from 'framer-motion';
import vendorEquipmentService from '../../../../services/vendorEquipmentService';
import vendorService from '../../../../services/vendorService';
import { getWorkers } from '../../services/workerService';
import LogoLoader from '../../../../components/common/LogoLoader';
import { FormContainer, FormSection } from '../../../../components/common';
import api from '../../../../services/api';

const AddEquipment = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [machineTypes, setMachineTypes] = useState([]);
  const [machineImplements, setMachineImplements] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [vendorWorkers, setVendorWorkers] = useState([]);
  const [showWorkerLink, setShowWorkerLink] = useState(false);
  const [isRequestingCategory, setIsRequestingCategory] = useState(false);
  const [isRequestingCity, setIsRequestingCity] = useState(false);
  const [implementSearch, setImplementSearch] = useState('');

  const [form, setForm] = useState({
    categoryId: '',
    cityIds: [],
    requestedCategoryName: '',
    requestedCityName: '',
    listingType: 'service',
    implements: [],          // NEW: [{subCategoryId, pricing:{hourly,land_based,daily}}]
    subCategoryIds: [],      // legacy fallback
    name: '',
    modelNumber: '',
    year: new Date().getFullYear(),
    description: '',
    images: [],
    pricing: {
      hourly:     { price: 0, isEnabled: true },
      land_based: { price: 0, isEnabled: false },
      daily:      { price: 0, isEnabled: false }
    },
    includesDriver: true,
    driver: {
      name: '',
      phone: '',
      photo: '',
      aadharNumber: '',
      licenseNumber: '',
      aadharImage: '',
      licenseImage: '',
      additionalCharge: 0
    },
    workerId: null
  });

  // Tracks the selected category's metadata (trackingType, requiresDriver)
  const [categoryMeta, setCategoryMeta] = useState({ trackingType: 'none', requiresDriver: false });

  useEffect(() => {
    fetchInitialData();
  }, [id]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);

      // 1. Get Vendor Profile for City-based filtering
      let vendorCityId = null;
      try {
        const profileRes = await vendorService.getProfile();
        vendorCityId = profileRes.data?.address?.cityId || profileRes.data?.cityId;
      } catch (e) {
        console.warn('Profile city fetch skipped:', e);
      }

      let allTypes = [];
      try {
        const res = await vendorEquipmentService.getMachineTypes(vendorCityId);
        if (res.success && Array.isArray(res.data)) {
          setMachineTypes(res.data);
          allTypes = res.data;
        }
      } catch (e) {
        console.warn('Machine types fetch skipped:', e);
      }

      try {
        const workerRes = await getWorkers();
        if (workerRes.success && Array.isArray(workerRes.data)) {
          setVendorWorkers(workerRes.data);
        }
      } catch (e) {
        console.warn('Worker fetch skipped:', e);
      }

      let activeCategoryId = '';
      if (isEdit) {
        let item = null;

        // Try single equipment API first
        try {
          const singleRes = await vendorEquipmentService.getById(id);
          if (singleRes.success && singleRes.data) {
            item = singleRes.data;
          }
        } catch (e) {
          console.warn('Direct getById fetch failed, trying inventory list:', e);
        }

        // Fallback: search within inventory list
        if (!item) {
          try {
            const eqRes = await vendorEquipmentService.getMyEquipment();
            const list = Array.isArray(eqRes.data) ? eqRes.data : (Array.isArray(eqRes) ? eqRes : []);
            item = list.find(e => (e._id?.toString() || e.id?.toString()) === id.toString());
          } catch (e) {
            console.warn('getMyEquipment search failed:', e);
          }
        }

        if (item) {
          const catId = item.categoryId?._id || item.categoryId || '';
          activeCategoryId = catId;
          setForm({
            ...item,
            listingType: item.listingType || 'service',
            categoryId: catId,
            requestedCategoryName: item.requestedCategoryName || '',
            requestedCityName: item.requestedCityName || '',
            cityIds: item.cityIds || [],
            subCategoryIds: item.subCategoryIds?.map(s => s._id || s) || [],
            implements: item.implements?.map(i => ({
              ...i,
              subCategoryId: i.subCategoryId?._id || i.subCategoryId
            })) || [],
            driver: item.driver || {
              name: '',
              phone: '',
              photo: '',
              aadharNumber: '',
              licenseNumber: '',
              aadharImage: '',
              licenseImage: '',
              additionalCharge: 0
            }
          });
          if (item.requestedCategoryName) {
            setIsRequestingCategory(true);
          }
          if (item.requestedCityName) {
            setIsRequestingCity(true);
          }
        } else {
          toastManager.error('Equipment not found in your inventory');
        }
      } else {
        const savedDraft = localStorage.getItem('groo_add_machine_draft');
        if (savedDraft) {
          try {
            const { draftForm, draftIsRequesting, draftIsRequestingCity } = JSON.parse(savedDraft);
            if (draftForm) {
              setForm(prev => ({ ...prev, ...draftForm }));
              activeCategoryId = draftForm.categoryId || '';
            }
            if (typeof draftIsRequesting === 'boolean') {
              setIsRequestingCategory(draftIsRequesting);
            }
            if (typeof draftIsRequestingCity === 'boolean') {
              setIsRequestingCity(draftIsRequestingCity);
            }
          } catch (e) {
            console.error('Failed to parse form draft', e);
          }
        }
      }

      if (activeCategoryId) {
        try {
          const implRes = await vendorEquipmentService.getImplements(activeCategoryId);
          if (implRes.success && Array.isArray(implRes.data)) {
            setMachineImplements(implRes.data);
          }
        } catch (e) {
          console.warn('Could not fetch implements:', e);
        }

        // Fetch category metadata to drive adaptive UI
        const selected = allTypes.find(t => (t.id?.toString() || t._id?.toString()) === activeCategoryId.toString());
        if (selected) {
          setCategoryMeta({ 
            trackingType: selected.trackingType || 'none', 
            requiresDriver: selected.requiresDriver || false 
          });
        }
      }
    } catch (err) {
      console.error('fetchInitialData fatal error:', err);
      toastManager.error('Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  // Save draft to localStorage as user changes fields (only for add mode)
  useEffect(() => {
    if (!isEdit && !loading) {
      localStorage.setItem('groo_add_machine_draft', JSON.stringify({
        draftForm: form,
        draftIsRequesting: isRequestingCategory,
        draftIsRequestingCity: isRequestingCity
      }));
    }
  }, [form, isRequestingCategory, isRequestingCity, isEdit, loading]);

  const handleCategoryChange = async (categoryId) => {
    setForm(prev => ({ ...prev, categoryId, implements: [], subCategoryIds: [] }));
    setMachineImplements([]);
    if (!categoryId) return;

    try {
      const res = await vendorEquipmentService.getImplements(categoryId);
      if (res.success) setMachineImplements(res.data);

      // Fetch category metadata to drive adaptive UI (trackingType, requiresDriver)
      const allTypes = machineTypes;
      const selected = allTypes.find(t => t.id === categoryId);
      if (selected) {
        const isService = selected.trackingType === 'odometer';
        setCategoryMeta({ trackingType: selected.trackingType || 'none', requiresDriver: selected.requiresDriver || false });
        setForm(prev => ({
          ...prev,
          listingType: isEdit ? (prev.listingType || (isService ? 'service' : 'rental')) : (isService ? 'service' : 'rental'),
          includesDriver: selected.requiresDriver || false
        }));
      }
    } catch (err) {
      toastManager.error('Failed to load implements');
    }
  };

  const handleImageUpload = async (e, variant = 'general') => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    // For gallery images, ensure total doesn't exceed 5
    if (variant === 'general' && form.images.length + files.length > 5) {
      toastManager.error(`Maximum 5 images allowed. You can add ${5 - form.images.length} more.`);
      return;
    }

    try {
      setUploading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';
      let hasError = false;

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${baseUrl}/api/image/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        if (data.success) {
          if (variant === 'driver') {
            setForm(prev => ({ ...prev, driver: { ...prev.driver, photo: data.imageUrl } }));
          } else {
            setForm(prev => ({ ...prev, images: [...prev.images, data.imageUrl] }));
          }
        } else {
          hasError = true;
          console.error("Backend upload error:", data.message || data.error);
        }
      }
      
      if (hasError) {
        toastManager.error('Some uploads failed. Check console or server logs.');
      } else {
        toastManager.success('Upload success');
      }
    } catch (err) {
      console.error(err);
      toastManager.error('Upload failed');
    } finally {
      setUploading(false);
      // Reset input value so same file can be selected again
      e.target.value = null;
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // 1. Basic Identity Validation
    const submissionData = { ...form };
    submissionData.implements = (form.implements || []).map(i => {
      const hPrice = parseFloat(i.pricing?.hourly?.price) || 0;
      const lPrice = parseFloat(i.pricing?.land_based?.price) || 0;
      const dPrice = parseFloat(i.pricing?.daily?.price) || 0;
      return {
        subCategoryId: i.subCategoryId?._id || i.subCategoryId,
        pricing: {
          hourly: { price: hPrice, isEnabled: hPrice > 0 || !!form.pricing?.hourly?.isEnabled },
          land_based: { price: lPrice, isEnabled: lPrice > 0 || !!form.pricing?.land_based?.isEnabled },
          daily: { price: dPrice, isEnabled: dPrice > 0 || !!form.pricing?.daily?.isEnabled }
        }
      };
    });
    submissionData.subCategoryIds = submissionData.implements.map(i => i.subCategoryId);

    if (!isRequestingCategory && !submissionData.categoryId) {
      return toastManager.error('Please select machine type');
    }
    if (isRequestingCategory) {
      if (!submissionData.requestedCategoryName || submissionData.requestedCategoryName.trim().length < 3) {
        return toastManager.error('Please enter the machine type you want to request');
      }
      submissionData.categoryId = null; // Ensure it's null instead of empty string
    } else {
      submissionData.requestedCategoryName = null;
    }

    if (!submissionData.name || submissionData.name.length < 3) return toastManager.error('Please enter a valid machine name');
    
    // 2. Pricing Validation
    const enabledModes = Object.keys(form.pricing).filter(k => form.pricing[k].isEnabled);
    if (enabledModes.length === 0) return toastManager.error('Please enable at least one pricing mode (Hourly, Acre or Daily)');
    
    for (const mode of enabledModes) {
      if (form.pricing[mode].price <= 0) {
        return toastManager.error(`Please set a valid price for ${mode.replace('_', ' ')} mode`);
      }
    }

    // 3. Driver/Operator Validation - only for 'service' type (Tractor/Harvester)
    if (form.listingType === 'service' && form.includesDriver) {
      if (!form.driver.name) return toastManager.error('Operator name is required');
      if (!form.driver.phone || !/^[6-9]\d{9}$/.test(form.driver.phone)) {
        return toastManager.error('Valid 10-digit operator phone number is required');
      }
      if (!form.driver.aadharNumber || !/^\d{12}$/.test(form.driver.aadharNumber)) {
        return toastManager.error('Valid 12-digit Aadhar Card number is required');
      }
      const cleanDL = (form.driver.licenseNumber || '').trim().toUpperCase().replace(/[\s-]/g, '');
      const dlRegex = /^[A-Z]{2}[0-9A-Z]{9,15}$/;
      if (!cleanDL || !dlRegex.test(cleanDL)) {
        return toastManager.error('Please enter a valid Driving License number (e.g. RJ1420230001234)');
      }
    }

    // 4. Visuals Validation
    if (form.images.length === 0) return toastManager.error('Please upload at least one machine photo');

    try {
      setSubmitting(true);
      if (isEdit) {
        await vendorEquipmentService.update(id, submissionData);
        toastManager.success('Updated');
      } else {
        await vendorEquipmentService.add(submissionData);
        localStorage.removeItem('groo_add_machine_draft');
        toastManager.success('Listing created successfully!');
      }
      navigate('/vendor/equipment');
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LogoLoader />;

  return (
    <div className="min-h-screen bg-[#F0F5F9] pb-28">
      {/* Clean Sticky Header */}
      <div className="sticky top-0 z-20 bg-[#F0F5F9]/90 backdrop-blur-md px-4 sm:px-6 py-3.5 border-b border-slate-200/60">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              type="button"
              onClick={() => navigate(-1)} 
              className="w-10 h-10 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl shadow-2xs flex items-center justify-center text-slate-700 flex-shrink-0 transition-colors"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight truncate">
                {isEdit ? 'Edit Equipment' : 'Add Equipment'}
              </h1>
              <p className="text-xs text-slate-500 font-medium truncate">
                {form.name || (isEdit ? 'Update specifications & pricing' : 'List your machine on Agroyilt')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex-shrink-0"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <FiSave className="w-3.5 h-3.5" />
                <span>{isEdit ? 'Save' : 'Publish'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 sm:px-6 pt-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Main Card Container */}
          <FormContainer className="!p-5 sm:!p-6 !rounded-2xl">
            
            {/* Machine Setup */}
            <FormSection title="Machine Setup">
              <div className="space-y-4">
                {/* Category Dropdown */}
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1.5 block">Category</label>
                  {!isRequestingCategory ? (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <select 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 pr-10 text-xs sm:text-sm font-semibold text-slate-800 outline-none appearance-none focus:bg-white focus:border-blue-500 transition-all"
                          value={form.categoryId}
                          onChange={(e) => handleCategoryChange(e.target.value)}
                        >
                          <option value="">Select Category (e.g. Tractor)</option>
                          {machineTypes.map(t => {
                            const cleanName = t.title ? t.title.split('(')[0].trim() : '';
                            return (
                              <option key={t.id} value={t.id}>{cleanName}</option>
                            );
                          })}
                        </select>
                        <FiChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-4 h-4" />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsRequestingCategory(true);
                          setForm(p => ({ ...p, categoryId: '', implements: [], subCategoryIds: [] }));
                        }}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold transition-colors ml-0.5"
                      >
                        + Request new category
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input 
                        type="text"
                        placeholder="Enter machine type (e.g. Sugarcane Planter)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all"
                        value={form.requestedCategoryName}
                        onChange={e => setForm(p => ({ ...p, requestedCategoryName: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsRequestingCategory(false);
                          setForm(p => ({ ...p, requestedCategoryName: '' }));
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold transition-colors ml-0.5"
                      >
                        ← Back to category list
                      </button>
                    </div>
                  )}
                </div>

                {/* Service Model Segmented Switch */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Service Model</label>
                  <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, listingType: 'service' }))}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-semibold text-xs transition-all ${
                        form.listingType === 'service'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <FiTruck className={`w-4 h-4 ${form.listingType === 'service' ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span>Machine Service</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, listingType: 'rental', includesDriver: false }))}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-semibold text-xs transition-all ${
                        form.listingType === 'rental'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <FiTool className={`w-4 h-4 ${form.listingType === 'rental' ? 'text-amber-600' : 'text-slate-400'}`} />
                      <span>Tool Rental</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 pl-0.5">
                    {form.listingType === 'service' ? 'Includes operator & live GPS tracking' : 'Equipment only (operated by farmer)'}
                  </p>
                </div>

                {/* Available Attachments & Direct Pricing */}
                <AnimatePresence>
                  {machineImplements.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 block">Available Attachments</label>
                        {form.implements.length > 0 && (
                          <span className="text-[11px] font-semibold text-blue-600">
                            {form.implements.length} selected
                          </span>
                        )}
                      </div>

                      {/* Implement Selection Chips */}
                      <div className="flex flex-wrap gap-2">
                        {machineImplements.map(impl => {
                          const implId = impl.id || impl._id;
                          const isSelected = form.implements.some(i => (i.subCategoryId?._id || i.subCategoryId) === implId);
                          const cleanName = impl.title ? impl.title.split('(')[0].trim() : '';

                          return (
                            <button
                              key={implId}
                              type="button"
                              onClick={() => {
                                setForm(p => {
                                  const exists = p.implements.some(i => (i.subCategoryId?._id || i.subCategoryId) === implId);
                                  if (exists) {
                                    return {
                                      ...p,
                                      implements: p.implements.filter(i => (i.subCategoryId?._id || i.subCategoryId) !== implId),
                                      subCategoryIds: p.subCategoryIds.filter(id => id !== implId)
                                    };
                                  } else {
                                    return {
                                      ...p,
                                      implements: [...p.implements, {
                                        subCategoryId: implId,
                                        pricing: {
                                          hourly: { price: 0, isEnabled: p.pricing.hourly.isEnabled },
                                          land_based: { price: 0, isEnabled: p.pricing.land_based.isEnabled },
                                          daily: { price: 0, isEnabled: p.pricing.daily.isEnabled }
                                        }
                                      }],
                                      subCategoryIds: [...p.subCategoryIds, implId]
                                    };
                                  }
                                });
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                isSelected 
                                  ? 'bg-blue-600 text-white shadow-xs' 
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                              }`}
                            >
                              {isSelected ? <FiCheck className="w-3.5 h-3.5 stroke-[3]" /> : <FiPlus className="w-3.5 h-3.5 text-slate-400" />}
                              <span>{cleanName}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Attachment Rates Configuration Cards */}
                      {form.implements.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              Attachment Rates (Add-on to Tractor)
                            </span>
                            <span className="text-[10px] text-slate-400">₹0 = Included with Tractor</span>
                          </div>

                          <div className="space-y-2">
                            {form.implements.map(implItem => {
                              const currentImplId = implItem.subCategoryId?._id || implItem.subCategoryId;
                              const implMeta = machineImplements.find(m => (m.id || m._id) === currentImplId);
                              const name = implMeta ? implMeta.title.split('(')[0].trim() : 'Attachment';

                              return (
                                <div key={currentImplId} className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                      <FiTool className="w-3.5 h-3.5 text-blue-600" />
                                      <span>{name}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setForm(p => ({
                                          ...p,
                                          implements: p.implements.filter(i => (i.subCategoryId?._id || i.subCategoryId) !== currentImplId),
                                          subCategoryIds: p.subCategoryIds.filter(id => id !== currentImplId)
                                        }));
                                      }}
                                      className="text-[11px] font-semibold text-rose-500 hover:text-rose-700 transition-colors"
                                    >
                                      Remove
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {form.pricing.hourly.isEnabled && (
                                      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-blue-500 transition-colors">
                                        <span className="text-[11px] text-slate-600 font-medium">Hourly Add-on</span>
                                        <div className="flex items-center gap-1 w-24">
                                          <span className="text-xs text-slate-400 font-bold">₹</span>
                                          <input
                                            type="number"
                                            placeholder="0"
                                            className="w-full text-right text-xs font-bold text-slate-800 outline-none bg-transparent"
                                            onFocus={(e) => e.target.select()}
                                            value={implItem.pricing?.hourly?.price === 0 ? '' : implItem.pricing?.hourly?.price}
                                            onChange={e => {
                                              const val = parseFloat(e.target.value) || 0;
                                              setForm(p => ({
                                                ...p,
                                                implements: p.implements.map(i => 
                                                  (i.subCategoryId?._id || i.subCategoryId) === currentImplId
                                                    ? { ...i, pricing: { ...i.pricing, hourly: { price: val, isEnabled: true } } }
                                                    : i
                                                )
                                              }));
                                            }}
                                          />
                                          <span className="text-[10px] text-slate-400">/hr</span>
                                        </div>
                                      </div>
                                    )}

                                    {form.pricing.land_based.isEnabled && (
                                      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-blue-500 transition-colors">
                                        <span className="text-[11px] text-slate-600 font-medium">Per Acre Add-on</span>
                                        <div className="flex items-center gap-1 w-24">
                                          <span className="text-xs text-slate-400 font-bold">₹</span>
                                          <input
                                            type="number"
                                            placeholder="0"
                                            className="w-full text-right text-xs font-bold text-slate-800 outline-none bg-transparent"
                                            onFocus={(e) => e.target.select()}
                                            value={implItem.pricing?.land_based?.price === 0 ? '' : implItem.pricing?.land_based?.price}
                                            onChange={e => {
                                              const val = parseFloat(e.target.value) || 0;
                                              setForm(p => ({
                                                ...p,
                                                implements: p.implements.map(i => 
                                                  (i.subCategoryId?._id || i.subCategoryId) === currentImplId
                                                    ? { ...i, pricing: { ...i.pricing, land_based: { price: val, isEnabled: true } } }
                                                    : i
                                                )
                                              }));
                                            }}
                                          />
                                          <span className="text-[10px] text-slate-400">/ac</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Live Total Rate Preview */}
                                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 pt-0.5">
                                    <span className="text-slate-400">Farmer pays:</span>
                                    {form.pricing.hourly.isEnabled && (
                                      <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded text-[10px]">
                                        ₹{(Number(form.pricing.hourly.price) || 0) + (Number(implItem.pricing?.hourly?.price) || 0)}/hr
                                      </span>
                                    )}
                                    {form.pricing.land_based.isEnabled && (
                                      <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded text-[10px]">
                                        ₹{(Number(form.pricing.land_based.price) || 0) + (Number(implItem.pricing?.land_based?.price) || 0)}/acre
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </FormSection>

            {/* Details Section */}
            <FormSection title="Machine Details">
              <div className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1.5 block">Machine Name</label>
                  <input 
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400"
                    placeholder="e.g. John Deere 5045y"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">Model Number</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400"
                      placeholder="e.g. 5045y"
                      value={form.modelNumber}
                      onChange={e => setForm(p => ({ ...p, modelNumber: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">Mfg Year</label>
                    <input 
                      type="number"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400"
                      placeholder="2023"
                      value={form.year}
                      onChange={e => setForm(p => ({ ...p, year: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1.5 block">Notes / Terms (Optional)</label>
                  <textarea 
                    rows="2" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-xs sm:text-sm font-semibold text-slate-800 resize-none outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400" 
                    placeholder="e.g. Fuel included, standard maintenance..." 
                    value={form.description} 
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))} 
                  />
                </div>
              </div>
            </FormSection>

            {/* Pricing Section */}
            <FormSection title="Rental Rates">
              <div className="space-y-2.5">
                {[
                  { key: 'hourly', label: 'Hourly Rate', unit: '/ hr' },
                  { key: 'land_based', label: 'Per Acre Rate', unit: '/ acre' },
                  { key: 'daily', label: 'Daily Rate', unit: '/ day' }
                ].map(({ key, label, unit }) => {
                  const isEnabled = form.pricing[key].isEnabled;
                  const price = form.pricing[key].price;
                  return (
                    <div 
                      key={key} 
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isEnabled ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-50/30 border-slate-100 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button 
                          type="button" 
                          onClick={() => setForm(p => ({ ...p, pricing: { ...p.pricing, [key]: { ...p.pricing[key], isEnabled: !p.pricing[key].isEnabled } } }))}
                          className={`w-9 h-5 rounded-full relative transition-colors ${isEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-xs ${isEnabled ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{label}</p>
                          {isEnabled && key === 'hourly' && price > 0 && (
                            <p className="text-[10px] text-emerald-600 font-medium">≈ ₹{(price / 60).toFixed(2)}/min</p>
                          )}
                        </div>
                      </div>

                      {isEnabled ? (
                        <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 w-32 focus-within:border-blue-500 transition-colors">
                          <span className="text-xs text-slate-400 font-semibold mr-1">₹</span>
                          <input 
                            type="number"
                            placeholder="0"
                            className="w-full bg-transparent border-none p-0 text-xs font-bold text-slate-800 outline-none text-right"
                            onFocus={(e) => e.target.select()}
                            value={price === 0 ? '' : price}
                            onChange={e => setForm(p => ({ ...p, pricing: { ...p.pricing, [key]: { ...p.pricing[key], price: parseFloat(e.target.value) || 0 } } }))}
                          />
                          <span className="text-[10px] text-slate-400 ml-1 whitespace-nowrap">{unit}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">Off</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </FormSection>

            {/* Driver Section - Only rendered for Machine Service */}
            {form.listingType === 'service' && (
              <FormSection 
                title="Operator / Driver"
                headerRight={
                  <button 
                    type="button"
                    onClick={() => {
                      if (!categoryMeta.requiresDriver) {
                        setForm(p => ({ ...p, includesDriver: !p.includesDriver }));
                      } else {
                        toastManager.info('This machine category requires an operator.');
                      }
                    }}
                    className={`w-9 h-5 rounded-full relative transition-colors ${form.includesDriver ? 'bg-blue-600' : 'bg-slate-200'} ${categoryMeta.requiresDriver ? 'cursor-not-allowed' : ''}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-xs ${form.includesDriver ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                }
              >
                <AnimatePresence>
                  {form.includesDriver && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-3 pt-1">
                      
                      {/* Registered Worker Quick Link */}
                      {!isEdit && vendorWorkers.length > 0 && (
                        <div>
                          <button 
                            type="button"
                            onClick={() => setShowWorkerLink(!showWorkerLink)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors"
                          >
                            <span>{showWorkerLink ? '← Enter driver manually' : '🔗 Link registered worker'}</span>
                          </button>
                          
                          {showWorkerLink && (
                            <div className="grid grid-cols-1 gap-2 mt-2">
                              {vendorWorkers.map(w => (
                                <button
                                  key={w._id}
                                  type="button"
                                  onClick={() => {
                                    setForm(p => ({
                                      ...p,
                                      workerId: w._id,
                                      driver: {
                                        ...p.driver,
                                        name: w.name,
                                        phone: w.phone,
                                        photo: w.profilePhoto || '',
                                        aadharNumber: w.aadhar?.number || '',
                                      }
                                    }));
                                    setShowWorkerLink(false);
                                    toastManager.success(`Linked to ${w.name}`);
                                  }}
                                  className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                                    form.workerId === w._id ? 'bg-blue-50/70 border-blue-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                                    {w.profilePhoto ? <img src={w.profilePhoto} className="w-full h-full object-cover" /> : <FiUser className="m-auto text-slate-400 mt-2" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                                    <p className="text-[11px] text-slate-500">{w.phone}</p>
                                  </div>
                                  <span className="text-xs font-semibold text-blue-600">Select</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <label className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 flex items-center justify-center cursor-pointer overflow-hidden relative flex-shrink-0 transition-colors">
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'driver')} />
                          {form.driver.photo ? (
                            <img src={form.driver.photo} className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-slate-400">
                              <FiUser className="w-5 h-5" />
                              <span className="text-[8px] mt-0.5">Photo</span>
                            </div>
                          )}
                        </label>
                        <div className="flex-1 space-y-2">
                          <input 
                            type="text"
                            placeholder="Driver Name" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400"
                            value={form.driver.name} 
                            onChange={e => {
                              const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                              setForm(p => ({ ...p, driver: { ...p.driver, name: val } }));
                            }} 
                          />
                          <input 
                            type="tel" 
                            maxLength="10" 
                            placeholder="Mobile (10 digits)" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400"
                            value={form.driver.phone} 
                            onChange={e => setForm(p => ({ ...p, driver: { ...p.driver, phone: e.target.value.replace(/\D/g, '') } }))} 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <input 
                          type="tel" 
                          maxLength="12" 
                          placeholder="Aadhaar (12 digits)" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400"
                          value={form.driver.aadharNumber} 
                          onChange={e => setForm(p => ({ ...p, driver: { ...p.driver, aadharNumber: e.target.value.replace(/\D/g, '') } }))} 
                        />
                        <input 
                          type="text"
                          maxLength={16} 
                          placeholder="Driving License" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 uppercase outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400"
                          value={form.driver.licenseNumber} 
                          onChange={e => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                            setForm(p => ({ ...p, driver: { ...p.driver, licenseNumber: val } }));
                          }} 
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </FormSection>
            )}

            {/* Photos Section */}
            <FormSection 
              title="Photos"
              headerRight={
                <span className="text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                  {form.images.length}/5
                </span>
              }
            >
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                {form.images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-2xs group">
                    <img src={img} className="w-full h-full object-cover" alt={`Photo ${idx + 1}`} />
                    <button 
                      type="button" 
                      onClick={() => setForm(p => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))} 
                      className="absolute top-1 right-1 w-6 h-6 bg-slate-900/80 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-xs transition-colors z-10"
                    >
                      <FiTrash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {form.images.length < 5 && (
                  <label className="aspect-square rounded-xl border border-dashed border-slate-300 hover:border-blue-500 flex flex-col items-center justify-center bg-slate-50 hover:bg-blue-50/20 cursor-pointer transition-colors">
                    <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => handleImageUpload(e)} disabled={uploading} />
                    {uploading ? (
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <FiPlus className="text-slate-400 w-5 h-5 mb-0.5" />
                        <span className="text-[10px] font-medium text-slate-400">Add</span>
                      </>
                    )}
                  </label>
                )}
              </div>
            </FormSection>

          </FormContainer>

          {/* Bottom Primary Button */}
          <div className="pt-2">
            <button 
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <FiCheckCircle className="w-4 h-4" />
                  <span>{isEdit ? 'Save Changes' : 'Publish Equipment'}</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default AddEquipment;
