import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  FiChevronLeft, FiPlus, FiTrash2, FiUpload, 
  FiSettings, FiCheckCircle, FiInfo, FiUser,
  FiZap, FiMapPin, FiClock, FiCalendar, FiSmartphone, FiCreditCard, FiChevronDown, FiActivity, FiSearch
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
  }, []);

  const fetchInitialData = async () => {
    try {
      // 1. Get Vendor Profile for City-based filtering
      const profileRes = await vendorService.getProfile();
      const vendorCityId = profileRes.data?.address?.cityId || profileRes.data?.cityId;

      const res = await vendorEquipmentService.getMachineTypes(vendorCityId);
      if (res.success) setMachineTypes(res.data);

      const workerRes = await getWorkers();
      if (workerRes.success) setVendorWorkers(workerRes.data);

      let activeCategoryId = '';
      if (isEdit) {
        const eqRes = await vendorEquipmentService.getMyEquipment();
        const item = eqRes.data?.find(e => e._id === id);
        if (item) {
          const catId = item.categoryId?._id || item.categoryId || '';
          activeCategoryId = catId;
          setForm({
            ...item,
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
        const implRes = await vendorEquipmentService.getImplements(activeCategoryId);
        if (implRes.success) setMachineImplements(implRes.data);

        // Fetch category metadata to drive adaptive UI
        const allTypes = res.success ? res.data : [];
        const selected = allTypes.find(t => t.id === activeCategoryId);
        if (selected) {
          setCategoryMeta({ 
            trackingType: selected.trackingType || 'none', 
            requiresDriver: selected.requiresDriver || false 
          });
        }
      }
    } catch (err) {
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
          listingType: isService ? 'service' : 'rental',
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

    if (machineImplements.length > 0 && form.implements.length === 0) {
      return toastManager.error('Please select at least one implement for this machine');
    }
    
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
      const dlRegex = /^[A-Z]{2}[0-9A-Z]{13₹4}$/;
      if (!form.driver.licenseNumber || !dlRegex.test(form.driver.licenseNumber.toUpperCase())) {
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
    <div className="min-h-screen bg-[#F0F5F9] pb-32">
      {/* Simple Header */}
      <div className="px-6 pt-6 pb-2 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-3 bg-white rounded-2xl shadow-sm">
          <FiChevronLeft className="w-6 h-6 text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">
            {isEdit ? 'Edit Asset' : 'New Machine'}
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5"> Machinery Catalog </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Centralized Form Container */}
        <FormContainer>
          
          {/* Main Configuration Section */}
          <FormSection 
            subtitle="Main Configuration" 
            title={form.name || 'Untitled Machine'}
            titleClassName="text-slate-800 text-xl font-black tracking-tight mt-0.5"
          >
            <div className="space-y-4">
              {!isRequestingCategory ? (
                <div className="space-y-2">
                  <div className="relative">
                    <label className="absolute left-4 top-2 text-[9px] font-bold text-slate-400 uppercase">Machine Category</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pt-6 text-sm font-black text-slate-800 outline-none appearance-none"
                      value={form.categoryId}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                    >
                      <option value="" className="text-slate-800">Select Type (Tractor etc)</option>
                      {machineTypes.map(t => <option key={t.id} value={t.id} className="text-slate-800">{t.title}</option>)}
                    </select>
                    <FiChevronDown className="absolute right-5 bottom-4 text-slate-400 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRequestingCategory(true);
                      setForm(p => ({ ...p, categoryId: '', implements: [], subCategoryIds: [] }));
                    }}
                    className="text-[10px] text-slate-400 hover:text-blue-600 font-bold transition-colors flex flex-wrap items-center gap-x-1.5 gap-y-1 ml-1"
                  >
                    <span>Can't find your machine type?</span>
                    <span className="bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider border border-blue-100 shadow-sm">Request one</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <label className="absolute left-4 top-2 text-[9px] font-bold text-slate-400 uppercase">Request Machine Type</label>
                    <input 
                      type="text"
                      placeholder="e.g. Sugarcane Planter"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pt-6 text-sm font-black text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500/20 focus:bg-slate-50/50 transition-all"
                      value={form.requestedCategoryName}
                      onChange={e => setForm(p => ({ ...p, requestedCategoryName: e.target.value }))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRequestingCategory(false);
                      setForm(p => ({ ...p, requestedCategoryName: '' }));
                    }}
                    className="text-[10px] text-slate-400 hover:text-blue-600 font-bold transition-colors flex items-center gap-1 ml-1"
                  >
                    <span>← Back to category list</span>
                  </button>
                </div>
              )}

              <AnimatePresence>
                {machineImplements.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                     <p className="text-slate-400 text-[9px] font-bold uppercase ml-1">Implements & Pricing</p>
                     
                     {machineImplements.length > 5 && (
                       <div className="relative mb-2">
                         <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                         <input 
                           type="text"
                           placeholder="Search implements..."
                           className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-9 text-xs font-bold focus:bg-white focus:border-blue-500/20 outline-none transition-all placeholder:text-slate-400"
                           onChange={(e) => setImplementSearch(e.target.value.toLowerCase())}
                         />
                       </div>
                     )}

                     <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                      {machineImplements
                        .filter(impl => !implementSearch || impl.title.toLowerCase().includes(implementSearch))
                        .map(impl => {
                        const selected = form.implements.find(i => i.subCategoryId === impl.id);
                        return (
                          <div key={impl.id} className="py-2 border-b border-slate-100 last:border-0">
                            {/* Implement Header - Toggle */}
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-black uppercase ${selected ? 'text-slate-800' : 'text-slate-400'}`}>{impl.title}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const exists = form.implements.find(i => i.subCategoryId === impl.id);
                                  if (exists) {
                                    setForm(p => ({ ...p, implements: p.implements.filter(i => i.subCategoryId !== impl.id) }));
                                  } else {
                                    setForm(p => ({
                                      ...p,
                                      implements: [...p.implements, {
                                        subCategoryId: impl.id,
                                        pricing: {
                                          hourly:     { price: 0, isEnabled: form.pricing.hourly.isEnabled },
                                          land_based: { price: 0, isEnabled: form.pricing.land_based.isEnabled },
                                          daily:      { price: 0, isEnabled: form.pricing.daily.isEnabled }
                                        }
                                      }]
                                    }));
                                  }
                                }}
                                className={`w-8 h-4 rounded-full relative transition-all ${selected ? 'bg-blue-600' : 'bg-slate-200'}`}
                              >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${selected ? 'right-0.5' : 'left-0.5'}`} />
                              </button>
                            </div>
                            {/* Per-implement pricing has been removed to use master service pricing only */}
                          </div>
                        );
                      })}
                     </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </FormSection>

          {/* Details Section */}
          <FormSection subtitle="Specifications" title="Asset Details">
             <div className="grid grid-cols-2 gap-4">
               <div className="col-span-2 relative">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Full Title</label>
                 <input 
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-4 text-sm font-black focus:bg-white focus:border-blue-500/20 outline-none transition-all placeholder:text-slate-500"
                  placeholder="e.g. John Deere 5050D"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                 />
               </div>
               <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Model No</label>
                  <input className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-4 text-sm font-black focus:bg-white focus:border-blue-500/20 outline-none transition-all placeholder:text-slate-500" value={form.modelNumber} onChange={e => setForm(p => ({ ...p, modelNumber: e.target.value }))} />
               </div>
               <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Mfg Year</label>
                  <input className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-4 text-sm font-black focus:bg-white focus:border-blue-500/20 outline-none transition-all placeholder:text-slate-500" type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} />
               </div>
               <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Description / Special Terms</label>
                  <textarea 
                    rows="3" 
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-4 text-sm font-black resize-none focus:bg-white focus:border-blue-500/20 outline-none transition-all placeholder:text-slate-500" 
                    placeholder="e.g. Fuel extra, comes with rotavator attachment..." 
                    value={form.description} 
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))} 
                  />
               </div>
             </div>
          </FormSection>

          {/* Pricing Section */}
          <FormSection subtitle="Pricing Model" title="Rate Strategy" icon={FiCreditCard}>
            <div className="space-y-4">
              {['hourly', 'land_based', 'daily'].map(key => {
                const isEnabled = form.pricing[key].isEnabled;
                return (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <button 
                        type="button" 
                        onClick={() => setForm(p => ({ ...p, pricing: { ...p.pricing, [key]: { ...p.pricing[key], isEnabled: !p.pricing[key].isEnabled } } }))}
                        className={`w-10 h-5 rounded-full relative transition-all duration-200 ${isEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-200 ${isEnabled ? 'right-1' : 'left-1'}`} />
                      </button>
                      <span className={`text-xs font-black uppercase tracking-wider ${isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                        {key === 'land_based' ? 'Per Acre' : key === 'hourly' ? 'Hourly' : 'Daily'}
                      </span>
                    </div>
                    {isEnabled ? (
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 w-36 transition-all">
                          <span className="text-slate-500 font-bold text-sm">₹</span>
                          <input 
                            className="w-full bg-transparent border-none p-0 text-sm font-black text-slate-800 outline-none text-right placeholder:text-slate-400"
                            type="number"
                            placeholder="0"
                            onFocus={(e) => e.target.select()}
                            value={form.pricing[key].price === 0 ? "" : form.pricing[key].price}
                            onChange={e => setForm(p => ({ ...p, pricing: { ...p.pricing, [key]: { ...p.pricing[key], price: parseFloat(e.target.value) || 0 } } }))}
                          />
                        </div>
                        {key === 'hourly' && form.pricing.hourly.price > 0 && (
                          <span className="text-[10px] font-bold text-emerald-600 mt-1">
                            ≈ ₹{(form.pricing.hourly.price / 60).toFixed(2)} / min
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Disabled</span>
                    )}
                  </div>
                );
              })}
            </div>
          </FormSection>

          {/* Driver Section */}
          <FormSection 
            subtitle="Operator Module" 
            title="Driver Profile"
            headerRight={
              <div className="flex flex-col items-end">
                <button 
                  type="button"
                  onClick={() => {
                    if (!categoryMeta.requiresDriver) {
                      setForm(p => ({ ...p, includesDriver: !p.includesDriver }));
                    } else {
                      toastManager.info('This category requires a professional driver by policy.', { icon: '🛡️' });
                    }
                  }}
                  className={`w-12 h-6 rounded-full relative transition-all duration-200 ${form.includesDriver ? 'bg-purple-600' : 'bg-slate-200'} ${categoryMeta.requiresDriver ? 'cursor-not-allowed' : ''}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${form.includesDriver ? 'right-1' : 'left-1'}`} />
                </button>
                {categoryMeta.requiresDriver && (
                  <span className="text-[7px] font-black text-slate-400 uppercase mt-1 tracking-widest">Mandatory Policy</span>
                )}
              </div>
            }
          >
            <AnimatePresence>
              {form.includesDriver && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-4">
                  
                  {/* Worker Link Toggle */}
                  {!isEdit && vendorWorkers.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <button 
                        type="button"
                        onClick={() => setShowWorkerLink(!showWorkerLink)}
                        className="text-[10px] font-black text-slate-400 hover:text-purple-600 uppercase tracking-widest flex items-center gap-1 transition-colors"
                      >
                        {showWorkerLink ? "← Back to Manual Entry" : "🔗 Link from Registered Workers"}
                      </button>
                      
                      {showWorkerLink && (
                        <div className="grid grid-cols-1 gap-2 mt-1">
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
                              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${form.workerId === w._id ? 'bg-purple-50/50 border-purple-200' : 'bg-slate-50 border-slate-100'}`}
                            >
                              <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
                                {w.profilePhoto ? <img src={w.profilePhoto} className="w-full h-full object-cover" /> : <FiUser className="m-auto text-slate-400" />}
                              </div>
                              <div className="flex-1 text-left">
                                <p className={`text-xs font-black ${form.workerId === w._id ? 'text-purple-700' : 'text-slate-800'}`}>{w.name}</p>
                                <p className={`text-[9px] font-bold ${form.workerId === w._id ? 'text-purple-400' : 'text-slate-400'}`}>{w.phone}</p>
                              </div>
                              <div className="text-[9px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md uppercase tracking-wider">
                                Select
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <label className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-300 flex items-center justify-center cursor-pointer overflow-hidden p-1 shadow-inner relative">
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'driver')} />
                      {form.driver.photo ? <img src={form.driver.photo} className="w-full h-full object-cover rounded-xl" /> : <FiUser className="text-slate-400" />}
                    </label>
                    <div className="flex-1 space-y-2">
                      <input 
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-black text-slate-800 placeholder:text-slate-500 focus:bg-white focus:border-purple-200 outline-none transition-all" 
                        placeholder="Driver Name" 
                        value={form.driver.name} 
                        onChange={e => {
                          const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                          setForm(p => ({ ...p, driver: { ...p.driver, name: val } }));
                        }} 
                      />
                      <input 
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-black text-slate-800 placeholder:text-slate-500 focus:bg-white focus:border-purple-200 outline-none transition-all" 
                        type="tel" 
                        maxLength="10" 
                        placeholder="Phone Number" 
                        value={form.driver.phone} 
                        onChange={e => setForm(p => ({ ...p, driver: { ...p.driver, phone: e.target.value.replace(/\D/g, '') } }))} 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <input 
                       className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-[10px] font-black text-slate-800 placeholder:text-slate-500 focus:bg-white focus:border-purple-200 outline-none transition-all" 
                       type="tel" 
                       maxLength="12" 
                       placeholder="Aadhar Card" 
                       value={form.driver.aadharNumber} 
                       onChange={e => setForm(p => ({ ...p, driver: { ...p.driver, aadharNumber: e.target.value.replace(/\D/g, '') } }))} 
                     />
                     <input 
                       className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-[10px] font-black text-slate-800 placeholder:text-slate-500 uppercase focus:bg-white focus:border-purple-200 outline-none transition-all" 
                       maxLength={16} 
                       placeholder="Driving License (Alphanumeric)" 
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

          {/* Gallery Section */}
          <FormSection 
            subtitle="Gallery Images" 
            title="Machine Photos"
            headerRight={
              <div className="text-[9px] font-black text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                {form.images.length} / 5
              </div>
            }
          >
             <div className="grid grid-cols-4 gap-3">
               {form.images.map((img, idx) => (
                   <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 shadow-sm">
                     <img src={img} className="w-full h-full object-cover" alt={`Machine photo ${idx + 1}`} />
                     <button 
                       type="button" 
                       onClick={() => setForm(p => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))} 
                       className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform z-10"
                     >
                       <FiTrash2 className="w-3 h-3" />
                     </button>
                   </div>
                ))}
               {form.images.length < 5 && (
                  <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 hover:bg-slate-100/50 hover:border-slate-300 cursor-pointer active:scale-95 transition-all shadow-sm">
                    <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => handleImageUpload(e)} disabled={uploading} />
                    {uploading ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> : <FiPlus className="text-slate-400 w-5 h-5" />}
                  </label>
               )}
             </div>
          </FormSection>

        </FormContainer>

        {/* Large Launcher Button (Gradient) */}
        <div className="px-5">
          <button 
            type="submit"
            disabled={submitting}
            className="w-full py-6 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-[32px] shadow-lg shadow-blue-500/20 text-sm font-black uppercase tracking-[0.2em] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><FiActivity /> <span>Launch Listing</span></>}
          </button>
        </div>

      </form>
    </div>
  );
};

export default AddEquipment;
