import React, { useState, useEffect, useMemo } from 'react';
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
import LogoLoader from '../../../../components/common/LogoLoader';
import { FormContainer, FormSection } from '../../../../components/common';
import api from '../../../../services/api';
import { locationParamsFromVendor } from '../../../../utils/geoParams';

// Older service listings stored attachment rates as add-ons on top of the machine's rate. The form now works with the
// price the farmer actually pays for the attachment, so fold the add-on into it (same price, nothing changes for farmers).
const foldAddOnsIntoTotals = (implementsList = [], pricing = {}) => (implementsList || []).map((i) => {
  const next = { ...(i.pricing || {}) };
  ['hourly', 'land_based', 'daily'].forEach((mode) => {
    const add = Number(i.pricing?.[mode]?.price) || 0;
    const machine = pricing[mode]?.isEnabled ? (Number(pricing[mode].price) || 0) : 0;
    next[mode] = { ...(i.pricing?.[mode] || {}), price: add > 0 ? machine + add : 0, isEnabled: i.pricing?.[mode]?.isEnabled ?? true };
  });
  const kmAdd = Number(i.pricing?.distance_based?.price) || 0;
  const kmBase = Number(i.pricing?.distance_based?.baseCharge) || 0;
  if (kmAdd > 0 || kmBase > 0) {
    const own = pricing.distance_based?.isEnabled ? pricing.distance_based : null;
    const km = kmAdd + (Number(own?.price) || 0);
    next.distance_based = {
      ...(i.pricing.distance_based || {}),
      price: km,
      perKmRate: km,
      baseCharge: kmBase + (Number(own?.baseCharge) || 0),
      baseKm: Number(i.pricing.distance_based?.baseKm || own?.baseKm) || 0,
      isEnabled: true
    };
  }
  return { ...i, pricing: next };
});

const DEFAULT_CATEGORY_META = {
  trackingType: 'none',
  requiresDriver: false,
  fulfillmentMode: 'service',
  rentByUnit: false,
  unitLabel: '',
  chargedPerKm: false
};

const getCategoryMode = (cat) => {
  if (!cat) return 'service';
  return cat.fulfillmentMode || (cat.trackingType === 'odometer' ? 'service' : 'rental');
};

const isTrolleyName = (name = '') => (/trailer|trolley|ट्राली|ट्रॉली/i).test(name);

const buildDefaultImplementPricing = (parentPricing = {}, name = '', listingType = 'service') => ({
  hourly: { price: 0, isEnabled: parentPricing?.hourly?.isEnabled ?? true },
  land_based: { price: 0, isEnabled: parentPricing?.land_based?.isEnabled ?? false },
  daily: { price: 0, isEnabled: parentPricing?.daily?.isEnabled ?? false },
  distance_based: {
    price: 0,
    perKmRate: 0,
    isEnabled: (isTrolleyName(name) && listingType !== 'rental') || !!parentPricing?.distance_based?.isEnabled
  }
});

const serializeImplementPricing = (pricing = {}, parentPricing = {}) => {
  const hPrice = parseFloat(pricing?.hourly?.price) || 0;
  const lPrice = parseFloat(pricing?.land_based?.price) || 0;
  const dPrice = parseFloat(pricing?.daily?.price) || 0;
  const kmPrice = parseFloat(pricing?.distance_based?.price) || 0;
  return {
    hourly: { price: hPrice, isEnabled: hPrice > 0 || !!parentPricing?.hourly?.isEnabled },
    land_based: { price: lPrice, isEnabled: lPrice > 0 || !!parentPricing?.land_based?.isEnabled },
    daily: { price: dPrice, isEnabled: dPrice > 0 || !!parentPricing?.daily?.isEnabled },
    distance_based: {
      price: kmPrice,
      perKmRate: kmPrice,
      isEnabled: kmPrice > 0 || !!parentPricing?.distance_based?.isEnabled,
      baseCharge: parseFloat(pricing?.distance_based?.baseCharge) || 0,
      baseKm: parseFloat(pricing?.distance_based?.baseKm) || 0
    }
  };
};

const AddEquipment = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [machineTypes, setMachineTypes] = useState([]);
  const [machineImplements, setMachineImplements] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [isRequestingCategory, setIsRequestingCategory] = useState(false);
  const [isRequestingCity, setIsRequestingCity] = useState(false);
  const [isRequestingImplement, setIsRequestingImplement] = useState(false);
  const [customImplementName, setCustomImplementName] = useState('');
  const [implementSearch, setImplementSearch] = useState('');

  const [form, setForm] = useState({
    categoryId: '',
    cityIds: [],
    requestedCategoryName: '',
    requestedCityName: '',
    listingType: 'service',
    implements: [],          // NEW: [{subCategoryId, pricing:{hourly,land_based,daily}}]
    requestedImplements: [], // Vendor-requested custom attachments awaiting admin approval
    subCategoryIds: [],      // legacy fallback
    name: '',
    modelNumber: '',
    year: new Date().getFullYear(),
    description: '',
    images: [],
    pricing: {
      hourly:         { price: 0, isEnabled: true },
      land_based:     { price: 0, isEnabled: false },
      daily:          { price: 0, isEnabled: false },
      distance_based: { price: 0, perKmRate: 0, isEnabled: false }
    },
    attachmentRates: 'total' // the attachment's rate is the price for that job (service listings)
  });

  // Tracks the selected category's metadata (trackingType, requiresDriver, fulfillmentMode)
  const [categoryMeta, setCategoryMeta] = useState(DEFAULT_CATEGORY_META);

  const serviceTypes = useMemo(
    () => machineTypes.filter(t => getCategoryMode(t) !== 'rental'),
    [machineTypes]
  );
  const rentalTypes = useMemo(
    () => machineTypes.filter(t => getCategoryMode(t) === 'rental'),
    [machineTypes]
  );
  const filteredMachineTypes = form.listingType === 'rental' ? rentalTypes : serviceTypes;

  useEffect(() => {
    fetchInitialData();
  }, [id]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);

      // 1. Get Vendor Profile for City-based filtering
      let vendorLocation = {};
      try {
        const profileRes = await vendorService.getProfile();
        vendorLocation = locationParamsFromVendor(profileRes.vendor || profileRes.data);
      } catch (e) {
        console.warn('Profile city fetch skipped:', e);
      }

      let allTypes = [];
      try {
        const res = await vendorEquipmentService.getMachineTypes(vendorLocation);
        if (res.success && Array.isArray(res.data)) {
          setMachineTypes(res.data);
          allTypes = res.data;
        }
      } catch (e) {
        console.warn('Machine types fetch skipped:', e);
      }

      let activeCategoryId = '';
      let resolvedListingType = 'service';
      let resolvedIsRequesting = false;
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
          const loadedPricing = {
            hourly: item.pricing?.hourly || { price: 0, isEnabled: false },
            land_based: item.pricing?.land_based || { price: 0, isEnabled: false },
            daily: item.pricing?.daily || { price: 0, isEnabled: false },
            distance_based: item.pricing?.distance_based || { price: 0, perKmRate: 0, isEnabled: false }
          };
          const loadedImplements = item.implements?.map(i => ({
            ...i,
            subCategoryId: i.subCategoryId?._id || i.subCategoryId,
            pricing: {
              hourly: i.pricing?.hourly || { price: 0, isEnabled: false },
              land_based: i.pricing?.land_based || { price: 0, isEnabled: false },
              daily: i.pricing?.daily || { price: 0, isEnabled: false },
              distance_based: i.pricing?.distance_based || { price: 0, perKmRate: 0, isEnabled: false }
            }
          })) || [];
          const loadedRequestedImplements = Array.isArray(item.requestedImplements)
            ? item.requestedImplements.map((r, idx) => ({
                ...r,
                localKey: r._id || `req-${idx}-${r.name}`,
                pricing: {
                  hourly: r.pricing?.hourly || { price: 0, isEnabled: false },
                  land_based: r.pricing?.land_based || { price: 0, isEnabled: false },
                  daily: r.pricing?.daily || { price: 0, isEnabled: false },
                  distance_based: r.pricing?.distance_based || { price: 0, perKmRate: 0, isEnabled: false }
                }
              }))
            : [];
          const isLegacyService = (item.listingType || 'service') !== 'rental' && item.attachmentRates !== 'total';
          resolvedListingType = item.listingType || 'service';
          resolvedIsRequesting = !!item.requestedCategoryName;
          setForm({
            ...item,
            attachmentRates: 'total',
            listingType: resolvedListingType,
            categoryId: catId,
            requestedCategoryName: item.requestedCategoryName || '',
            requestedCityName: item.requestedCityName || '',
            cityIds: item.cityIds || [],
            subCategoryIds: item.subCategoryIds?.map(s => s._id || s) || [],
            implements: isLegacyService ? foldAddOnsIntoTotals(loadedImplements, loadedPricing) : loadedImplements,
            requestedImplements: loadedRequestedImplements,
            pricing: loadedPricing
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
            const { v, draftForm, draftIsRequesting, draftIsRequestingCity } = JSON.parse(savedDraft);
            // v2 drafts use the "attachment price = job price" model; older drafts held add-ons, so they are not reused
            if (v === 2 && draftForm) {
              setForm(prev => ({ ...prev, ...draftForm }));
              activeCategoryId = draftForm.categoryId || '';
              resolvedListingType = draftForm.listingType || 'service';
            }
            if (typeof draftIsRequesting === 'boolean') {
              setIsRequestingCategory(draftIsRequesting);
              resolvedIsRequesting = draftIsRequesting;
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
          const mode = getCategoryMode(selected);
          setCategoryMeta({
            trackingType: selected.trackingType || 'none',
            requiresDriver: selected.requiresDriver || false,
            fulfillmentMode: mode,
            rentByUnit: !!selected.rentByUnit,
            unitLabel: selected.unitLabel || '',
            chargedPerKm: !!selected.chargedPerKm
          });
          setForm(prev => ({
            ...prev,
            listingType: mode
          }));
        } else {
          if (!isEdit && allTypes.length > 0) {
            const hasService = allTypes.some(t => getCategoryMode(t) !== 'rental');
            const hasRental = allTypes.some(t => getCategoryMode(t) === 'rental');
            const nextMode = resolvedListingType === 'rental'
              ? (!hasRental && hasService ? 'service' : 'rental')
              : (!hasService && hasRental ? 'rental' : 'service');
            resolvedListingType = nextMode;
            setForm(prev => ({ ...prev, categoryId: '', listingType: nextMode }));
          }
          setCategoryMeta(prev => ({ ...prev, fulfillmentMode: resolvedListingType }));
        }
      } else {
        let nextMode = resolvedListingType;
        if (!isEdit && !resolvedIsRequesting && allTypes.length > 0) {
          const hasService = allTypes.some(t => getCategoryMode(t) !== 'rental');
          const hasRental = allTypes.some(t => getCategoryMode(t) === 'rental');
          if (nextMode === 'service' && !hasService && hasRental) nextMode = 'rental';
          else if (nextMode === 'rental' && !hasRental && hasService) nextMode = 'service';
        }
        if (nextMode !== resolvedListingType) {
          setForm(prev => ({ ...prev, listingType: nextMode }));
        }
        setCategoryMeta(prev => ({ ...prev, fulfillmentMode: nextMode }));
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
        v: 2,
        draftForm: form,
        draftIsRequesting: isRequestingCategory,
        draftIsRequestingCity: isRequestingCity
      }));
    }
  }, [form, isRequestingCategory, isRequestingCity, isEdit, loading]);

  const handleListingTypeChange = (nextType) => {
    if (nextType === form.listingType) return;

    if (isRequestingCategory) {
      setForm(prev => ({ ...prev, listingType: nextType }));
      setCategoryMeta(prev => ({ ...prev, fulfillmentMode: nextType }));
      return;
    }

    setMachineImplements([]);
    setIsRequestingImplement(false);
    setCustomImplementName('');
    setCategoryMeta({ ...DEFAULT_CATEGORY_META, fulfillmentMode: nextType });
    setForm(prev => {
      const currentPricing = prev.pricing || {};
      const nextPricing = nextType === 'rental'
        ? {
            ...currentPricing,
            hourly: {
              ...(currentPricing.hourly || { price: 0 }),
              isEnabled: currentPricing.hourly?.isEnabled || !currentPricing.daily?.isEnabled
            },
            daily: {
              ...(currentPricing.daily || { price: 0 }),
              isEnabled: !!currentPricing.daily?.isEnabled
            },
            land_based: { ...(currentPricing.land_based || { price: 0 }), isEnabled: false },
            distance_based: { ...(currentPricing.distance_based || { price: 0, perKmRate: 0 }), isEnabled: false }
          }
        : {
            ...currentPricing,
            hourly: {
              ...(currentPricing.hourly || { price: 0 }),
              isEnabled: currentPricing.hourly?.isEnabled || !currentPricing.land_based?.isEnabled
            },
            land_based: {
              ...(currentPricing.land_based || { price: 0 }),
              isEnabled: !!currentPricing.land_based?.isEnabled
            },
            daily: { ...(currentPricing.daily || { price: 0 }), isEnabled: false },
            distance_based: { ...(currentPricing.distance_based || { price: 0, perKmRate: 0 }), isEnabled: false }
          };

      return {
        ...prev,
        listingType: nextType,
        categoryId: '',
        implements: [],
        requestedImplements: [],
        subCategoryIds: [],
        pricing: nextPricing
      };
    });
  };

  const handleCategoryChange = async (categoryId) => {
    setForm(prev => ({ ...prev, categoryId, implements: [], requestedImplements: [], subCategoryIds: [] }));
    setMachineImplements([]);
    setIsRequestingImplement(false);
    setCustomImplementName('');
    if (!categoryId) {
      setCategoryMeta(prev => ({ ...DEFAULT_CATEGORY_META, fulfillmentMode: form.listingType || prev.fulfillmentMode }));
      return;
    }

    try {
      const res = await vendorEquipmentService.getImplements(categoryId);
      if (res.success) setMachineImplements(res.data);

      // Fetch category metadata to drive adaptive UI (trackingType, requiresDriver, fulfillmentMode)
      const allTypes = machineTypes;
      const selected = allTypes.find(t => (t.id?.toString() || t._id?.toString()) === categoryId.toString());
      if (selected) {
        const mode = getCategoryMode(selected);
        setCategoryMeta({
          trackingType: selected.trackingType || 'none',
          requiresDriver: selected.requiresDriver || false,
          fulfillmentMode: mode,
          rentByUnit: !!selected.rentByUnit,
          unitLabel: selected.unitLabel || '',
          chargedPerKm: !!selected.chargedPerKm
        });
        setForm(prev => ({
          ...prev,
          listingType: mode,
          // A per-km category starts with the per-km rate on and the hourly rate off, so nothing is left at ₹0
          ...(selected.chargedPerKm && mode !== 'rental' && !prev.pricing?.distance_based?.isEnabled ? {
            pricing: {
              ...prev.pricing,
              hourly: { ...(prev.pricing?.hourly || { price: 0 }), isEnabled: false },
              distance_based: { ...(prev.pricing?.distance_based || { price: 0, perKmRate: 0 }), isEnabled: true }
            }
          } : {})
        }));
      }
    } catch (err) {
      toastManager.error('Failed to load implements');
    }
  };

  const handleAddCustomImplement = () => {
    const trimmed = customImplementName.trim();
    if (trimmed.length < 2) return toastManager.error('Please enter a valid attachment name');
    const lower = trimmed.toLowerCase();
    const matchesPreset = machineImplements.some(
      m => (m.title || '').split('(')[0].trim().toLowerCase() === lower
    );
    if (matchesPreset) return toastManager.error('This attachment is already available above');
    const alreadyRequested = (form.requestedImplements || []).some(
      r => (r.name || '').trim().toLowerCase() === lower
    );
    if (alreadyRequested) return toastManager.error('This attachment is already in your request list');
    setForm(p => ({
      ...p,
      requestedImplements: [
        ...(p.requestedImplements || []),
        {
          localKey: `req-${Date.now()}`,
          name: trimmed,
          status: 'pending',
          adminRemarks: null,
          pricing: buildDefaultImplementPricing(p.pricing, trimmed, p.listingType)
        }
      ]
    }));
    setCustomImplementName('');
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
          setForm(prev => ({ ...prev, images: [...prev.images, data.imageUrl] }));
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
    // Operator/driver details are no longer collected (old saved drafts may still carry them)
    delete submissionData.driver;
    delete submissionData.includesDriver;
    delete submissionData.workerId;
    submissionData.implements = (form.implements || []).map(i => ({
      subCategoryId: i.subCategoryId?._id || i.subCategoryId,
      pricing: serializeImplementPricing(i.pricing, form.pricing)
    }));
    submissionData.requestedImplements = isRequestingCategory
      ? []
      : (form.requestedImplements || [])
          .filter(r => r?.name && r.name.trim().length >= 2)
          .map(r => ({
            ...(r._id ? { _id: r._id } : {}),
            name: r.name.trim(),
            ...(r.status === 'rejected' ? { status: 'rejected' } : {}),
            pricing: serializeImplementPricing(r.pricing, form.pricing)
          }));
    submissionData.subCategoryIds = submissionData.implements.map(i => i.subCategoryId);

    // No stock count is kept: farmers choose how many, and every request reaches the vendor
    delete submissionData.totalUnits;

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
    const hasImplementDistancePrice =
      (form.implements || []).some(i => (i.pricing?.distance_based?.price || 0) > 0) ||
      (form.requestedImplements || []).some(r => (r.pricing?.distance_based?.price || 0) > 0);
    const enabledModes = Object.keys(form.pricing).filter(k => form.pricing[k]?.isEnabled);
    if (enabledModes.length === 0 && !hasImplementDistancePrice) {
      return toastManager.error('Please enable at least one pricing mode (Hourly, Acre, Daily or Per KM)');
    }
    
    for (const mode of enabledModes) {
      if (mode === 'distance_based' && hasImplementDistancePrice) continue;
      if ((form.pricing[mode]?.price || 0) <= 0) {
        return toastManager.error(`Please set a valid price for ${mode.replace('_', ' ')} mode`);
      }
    }

    // 3. Visuals Validation
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
                {/* Service Model Toggle (Drives Category Filter) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">Service Model</label>
                    {!isRequestingCategory && form.categoryId && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        form.listingType === 'rental'
                          ? 'text-amber-700 bg-amber-50 border-amber-200'
                          : 'text-blue-700 bg-blue-50 border-blue-200'
                      }`}>
                        Set by Platform
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => handleListingTypeChange('service')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg font-semibold text-xs transition-all ${
                        form.listingType === 'service'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <FiTruck className={`w-4 h-4 flex-shrink-0 ${form.listingType === 'service' ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span>Machine Service</span>
                      {!isRequestingCategory && machineTypes.length > 0 && (
                        <span
                          translate="no"
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                            form.listingType === 'service'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-slate-200/70 text-slate-500'
                          }`}
                        >
                          {serviceTypes.length}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleListingTypeChange('rental')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg font-semibold text-xs transition-all ${
                        form.listingType === 'rental'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <FiTool className={`w-4 h-4 flex-shrink-0 ${form.listingType === 'rental' ? 'text-amber-600' : 'text-slate-400'}`} />
                      <span>Tool Rental</span>
                      {!isRequestingCategory && machineTypes.length > 0 && (
                        <span
                          translate="no"
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                            form.listingType === 'rental'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-200/70 text-slate-500'
                          }`}
                        >
                          {rentalTypes.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {isRequestingCategory ? (
                    <p key={`req-hint-${form.listingType}`} className="text-[11px] text-slate-400 pl-0.5 flex flex-wrap items-center gap-x-1">
                      <span>
                        {form.listingType === 'service'
                          ? "You do the job at the farmer's field, with live GPS tracking"
                          : 'Equipment only (operated by farmer)'}
                      </span>
                      <span translate="no">·</span>
                      <span>Admin confirms this when approving your new category.</span>
                    </p>
                  ) : form.listingType === 'rental' ? (
                    <div key="mode-card-rental" className="flex items-center gap-3 p-2.5 bg-amber-50/70 rounded-xl border border-amber-200/80">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
                        <FiTool className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-[11px] text-amber-800/90 leading-snug">
                        Direct equipment rental. Farmers rent this machine from the Rental Catalog and operate it themselves.
                      </p>
                    </div>
                  ) : (
                    <div key="mode-card-service" className="flex items-center gap-3 p-2.5 bg-blue-50/70 rounded-xl border border-blue-200/80">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 flex-shrink-0">
                        <FiTruck className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-[11px] text-blue-800/90 leading-snug">
                        The farmer books a job and your machine does it at their field, with live GPS tracking and start/end OTPs.
                      </p>
                    </div>
                  )}
                </div>

                {/* Category Dropdown (Filtered by Selected Service Model) */}
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1.5 block">Category</label>
                  {!isRequestingCategory ? (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <select
                          key={form.listingType}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 pr-10 text-xs sm:text-sm font-semibold text-slate-800 outline-none appearance-none focus:bg-white focus:border-blue-500 transition-all"
                          value={form.categoryId}
                          onChange={(e) => handleCategoryChange(e.target.value)}
                        >
                          <option
                            key={`${form.listingType}-${filteredMachineTypes.length > 0 ? 'has-opts' : 'empty'}`}
                            value=""
                          >
                            {filteredMachineTypes.length === 0
                              ? 'No categories available in this mode'
                              : form.listingType === 'rental'
                                ? 'Select Rental Category (e.g. Sprayer)'
                                : 'Select Service Category (e.g. Tractor)'}
                          </option>
                          {filteredMachineTypes.map(t => {
                            const cleanName = t.title ? t.title.split('(')[0].trim() : '';
                            return (
                              <option key={t.id} value={t.id}>{cleanName}</option>
                            );
                          })}
                        </select>
                        <FiChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-4 h-4" />
                      </div>
                      <p className="text-[11px] text-slate-400 ml-0.5">
                        Not finding your machine? Try switching Service / Rental above.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsRequestingCategory(true);
                          setMachineImplements([]);
                          setIsRequestingImplement(false);
                          setCustomImplementName('');
                          setForm(p => ({ ...p, categoryId: '', implements: [], requestedImplements: [], subCategoryIds: [] }));
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

                {/* Available Attachments & Direct Pricing (Preset + Custom Requested) */}
                <AnimatePresence>
                  {!isRequestingCategory && form.categoryId && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 block">Available Attachments</label>
                        {(form.implements.length + (form.requestedImplements?.length || 0)) > 0 && (
                          <span className="text-[11px] font-semibold text-blue-600 flex items-center gap-1">
                            <span translate="no">{form.implements.length + (form.requestedImplements?.length || 0)}</span>
                            <span>selected</span>
                          </span>
                        )}
                      </div>

                      {/* Implement Selection Chips */}
                      {machineImplements.length > 0 && (
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
                                    }
                                    return {
                                      ...p,
                                      implements: [...p.implements, {
                                        subCategoryId: implId,
                                        pricing: buildDefaultImplementPricing(p.pricing, cleanName, p.listingType)
                                      }],
                                      subCategoryIds: [...p.subCategoryIds, implId]
                                    };
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
                      )}

                      {/* Request Missing Attachment Input */}
                      {!isRequestingImplement ? (
                        <button
                          type="button"
                          onClick={() => setIsRequestingImplement(true)}
                          className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold transition-colors ml-0.5"
                        >
                          + Request missing attachment
                        </button>
                      ) : (
                        <div className="p-3 bg-blue-50/50 border border-blue-200/70 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">Request Custom Attachment</span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsRequestingImplement(false);
                                setCustomImplementName('');
                              }}
                              className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold"
                            >
                              Close
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Attachment name (e.g. Bund Maker)"
                              className="flex-1 bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 transition-all"
                              value={customImplementName}
                              onChange={e => setCustomImplementName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                handleAddCustomImplement();
                              }}
                            />
                            <button
                              type="button"
                              onClick={handleAddCustomImplement}
                              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                            >
                              Add
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500 leading-snug">
                            Sent to admin for approval. Your machine stays bookable and this attachment goes live with your rates once approved.
                          </p>
                        </div>
                      )}

                      {/* Attachment Rates Configuration Cards (Preset + Custom Requested) */}
                      {(form.implements.length > 0 || (form.requestedImplements?.length || 0) > 0) && (
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              {form.listingType === 'rental' ? 'Accessories (extra charge)' : 'Price with each attachment'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {form.listingType === 'rental' ? '₹0 = included in the rental' : "Blank = same as the machine's own rate"}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {[
                              ...form.implements.map(implItem => {
                                const currentImplId = implItem.subCategoryId?._id || implItem.subCategoryId;
                                const implMeta = machineImplements.find(m => (m.id || m._id) === currentImplId);
                                return {
                                  listKey: 'implements',
                                  itemId: currentImplId,
                                  cardKey: `impl-${currentImplId}`,
                                  name: implMeta ? implMeta.title.split('(')[0].trim() : 'Attachment',
                                  pricing: implItem.pricing,
                                  status: null,
                                  adminRemarks: null
                                };
                              }),
                              ...(form.requestedImplements || []).map((reqItem, idx) => {
                                const reqKey = reqItem._id || reqItem.localKey || `req-${idx}`;
                                return {
                                  listKey: 'requestedImplements',
                                  itemId: reqKey,
                                  cardKey: `req-${reqKey}`,
                                  name: reqItem.name,
                                  pricing: reqItem.pricing,
                                  status: reqItem.status || 'pending',
                                  adminRemarks: reqItem.adminRemarks || null
                                };
                              })
                            ].map(({ listKey, itemId, cardKey, name, pricing, status, adminRemarks }) => {
                              const isTrolleyImpl = isTrolleyName(name);
                              const matchesEntry = (entry, idx) => {
                                if (listKey === 'implements') {
                                  return (entry.subCategoryId?._id || entry.subCategoryId) === itemId;
                                }
                                return (entry._id || entry.localKey || `req-${idx}`) === itemId;
                              };
                              const updateEntryPricing = (mode, patch) => {
                                setForm(p => ({
                                  ...p,
                                  [listKey]: (p[listKey] || []).map((entry, idx) =>
                                    matchesEntry(entry, idx)
                                      ? {
                                          ...entry,
                                          ...(listKey === 'requestedImplements' && entry.status === 'rejected'
                                            ? { status: 'pending', adminRemarks: null }
                                            : {}),
                                          pricing: { ...entry.pricing, [mode]: patch }
                                        }
                                      : entry
                                  )
                                }));
                              };
                              const removeEntry = () => {
                                setForm(p => ({
                                  ...p,
                                  [listKey]: (p[listKey] || []).filter((entry, idx) => !matchesEntry(entry, idx)),
                                  ...(listKey === 'implements'
                                    ? { subCategoryIds: p.subCategoryIds.filter(id => id !== itemId) }
                                    : {})
                                }));
                              };

                              return (
                                <div key={cardKey} className={`p-3 border rounded-xl space-y-2 ${
                                  status === 'rejected'
                                    ? 'bg-rose-50/50 border-rose-200/80'
                                    : status === 'pending'
                                      ? 'bg-amber-50/40 border-amber-200/80'
                                      : 'bg-slate-50/80 border-slate-200/80'
                                }`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                      <FiTool className={`w-3.5 h-3.5 flex-shrink-0 ${status === 'pending' ? 'text-amber-600' : status === 'rejected' ? 'text-rose-600' : 'text-blue-600'}`} />
                                      <span className="text-xs font-bold text-slate-800 truncate">{name}</span>
                                      {status === 'pending' && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                          Pending Approval
                                        </span>
                                      )}
                                      {status === 'rejected' && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                                          Rejected
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={removeEntry}
                                      className="text-[11px] font-semibold text-rose-500 hover:text-rose-700 transition-colors shrink-0"
                                    >
                                      Remove
                                    </button>
                                  </div>

                                  {status === 'rejected' && adminRemarks && (
                                    <p className="text-[11px] text-rose-600 font-medium">{adminRemarks}</p>
                                  )}

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {form.pricing.hourly.isEnabled && (
                                      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-blue-500 transition-colors">
                                        <span className="text-[11px] text-slate-600 font-medium">{form.listingType === 'rental' ? 'Hourly Add-on' : 'Per hour (field work)'}</span>
                                        <div className="flex items-center gap-1 w-24">
                                          <span className="text-xs text-slate-400 font-bold">₹</span>
                                          <input
                                            type="number"
                                            placeholder={form.listingType === 'rental' ? '0' : String(form.pricing.hourly.price || 0)}
                                            className="w-full text-right text-xs font-bold text-slate-800 outline-none bg-transparent"
                                            onFocus={(e) => e.target.select()}
                                            value={pricing?.hourly?.price === 0 ? '' : (pricing?.hourly?.price ?? '')}
                                            onChange={e => updateEntryPricing('hourly', { price: parseFloat(e.target.value) || 0, isEnabled: true })}
                                          />
                                          <span className="text-[10px] text-slate-400">/hr</span>
                                        </div>
                                      </div>
                                    )}

                                    {form.pricing.land_based.isEnabled && (
                                      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-blue-500 transition-colors">
                                        <span className="text-[11px] text-slate-600 font-medium">{form.listingType === 'rental' ? 'Per Acre Add-on' : 'Per Acre'}</span>
                                        <div className="flex items-center gap-1 w-24">
                                          <span className="text-xs text-slate-400 font-bold">₹</span>
                                          <input
                                            type="number"
                                            placeholder={form.listingType === 'rental' ? '0' : String(form.pricing.land_based.price || 0)}
                                            className="w-full text-right text-xs font-bold text-slate-800 outline-none bg-transparent"
                                            onFocus={(e) => e.target.select()}
                                            value={pricing?.land_based?.price === 0 ? '' : (pricing?.land_based?.price ?? '')}
                                            onChange={e => updateEntryPricing('land_based', { price: parseFloat(e.target.value) || 0, isEnabled: true })}
                                          />
                                          <span className="text-[10px] text-slate-400">/ac</span>
                                        </div>
                                      </div>
                                    )}

                                    {(() => {
                                      if (form.listingType === 'rental') return null; // per-km needs an operator and GPS: service only
                                      if (!isTrolleyImpl && (categoryMeta.chargedPerKm || !form.pricing.distance_based?.isEnabled)) return null;
                                      return (
                                        <div className="flex items-center justify-between bg-white border border-teal-200/80 rounded-lg px-2.5 py-1.5 focus-within:border-teal-500 transition-colors">
                                          <div className="flex items-center gap-1">
                                            <span className="text-[11px] text-teal-800 font-bold">{isTrolleyImpl ? 'Per km (transport trip)' : 'Per KM Rate'}</span>
                                            {isTrolleyImpl && (
                                              <span className="text-[8.5px] bg-teal-100 text-teal-800 px-1 py-0.2 rounded font-bold">Trolley</span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 w-24">
                                            <span className="text-xs text-teal-600 font-bold">₹</span>
                                            <input
                                              type="number"
                                              placeholder="0"
                                              className="w-full text-right text-xs font-bold text-slate-800 outline-none bg-transparent"
                                              onFocus={(e) => e.target.select()}
                                              value={pricing?.distance_based?.price === 0 ? '' : (pricing?.distance_based?.price ?? '')}
                                              onChange={e => {
                                                const val = parseFloat(e.target.value) || 0;
                                                updateEntryPricing('distance_based', {
                                                  price: val,
                                                  perKmRate: val,
                                                  isEnabled: true,
                                                  baseCharge: pricing?.distance_based?.baseCharge || 0,
                                                  baseKm: pricing?.distance_based?.baseKm || 0
                                                });
                                              }}
                                            />
                                            <span className="text-[10px] text-slate-400">/km</span>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  {form.listingType !== 'rental' && (
                                    <p className="text-[10px] text-slate-400 leading-snug">The farmer pays exactly these amounts for the job. A blank box uses the machine's own rate.</p>
                                  )}

                                  {/* Live Total Rate Preview */}
                                  <div className="text-[11px] text-slate-500 font-medium flex flex-wrap items-center gap-1.5 pt-0.5">
                                    <span className="text-slate-400">Farmer pays:</span>
                                    {form.pricing.hourly.isEnabled && (
                                      <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded text-[10px]">
                                        ₹{form.listingType === 'rental'
                                          ? (Number(form.pricing.hourly.price) || 0) + (Number(pricing?.hourly?.price) || 0)
                                          : (Number(pricing?.hourly?.price) || Number(form.pricing.hourly.price) || 0)}/hr
                                      </span>
                                    )}
                                    {form.pricing.land_based.isEnabled && (
                                      <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded text-[10px]">
                                        ₹{form.listingType === 'rental'
                                          ? (Number(form.pricing.land_based.price) || 0) + (Number(pricing?.land_based?.price) || 0)
                                          : (Number(pricing?.land_based?.price) || Number(form.pricing.land_based.price) || 0)}/acre
                                      </span>
                                    )}
                                    {(() => {
                                      if (form.listingType === 'rental') return null;
                                      if (!isTrolleyImpl && (categoryMeta.chargedPerKm || !form.pricing.distance_based?.isEnabled)) return null;
                                      const totalKmRate = Number(pricing?.distance_based?.price) || Number(form.pricing.distance_based?.price) || 0;
                                      return (
                                        <span className="font-bold text-teal-800 bg-teal-50 border border-teal-200/60 px-1.5 py-0.5 rounded text-[10px]">
                                          ₹{totalKmRate}/km
                                        </span>
                                      );
                                    })()}
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
            <FormSection title={form.listingType === 'rental' ? 'Rental Rates' : 'Service Rates'}>
              <p className="text-[11px] text-slate-400 -mt-1 mb-2.5 leading-snug">
                {form.listingType === 'rental'
                  ? 'Farmer rents the machine and runs it. Charged by the hour or by the day.'
                  : categoryMeta.chargedPerKm
                    ? 'The farmer books a trip and you are paid for the road distance driven (GPS tracked), at your per-km rate.'
                    : 'The farmer books a job and you do it at their field. Charged by the hour or per acre. A trolley is charged per km, set on the attachment above.'}
              </p>
              {categoryMeta.rentByUnit && !isRequestingCategory && (
                <div className="mb-3 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80">
                  <p className="text-[11px] text-slate-600 leading-snug">The rates below are for <b>one {categoryMeta.unitLabel || 'piece'}</b>. Farmers choose how many they want, and you get every request to accept or decline.</p>
                </div>
              )}
              <div className="space-y-2.5">
                {[
                  { key: 'hourly', label: 'Hourly Rate', unit: '/ hr', sub: 'For standard agricultural operations' },
                  { key: 'land_based', label: 'Per Acre Rate', unit: '/ acre', sub: 'Calculated per acre field work' },
                  { key: 'daily', label: 'Daily Rate', unit: '/ day', sub: 'Flat full-day machine rent' },
                  { key: 'distance_based', label: 'Per KM Rate', unit: '/ km', sub: 'Live GPS road distance tracking' }
                ].filter(({ key }) => {
                  // Only the modes that make sense for this kind of listing; one that is already switched on stays visible
                  if (form.pricing[key]?.isEnabled) return true;
                  // A per-km category is billed on distance only, so hourly / acre are not offered there
                  const perKmOnly = categoryMeta.chargedPerKm && form.listingType !== 'rental';
                  if (key === 'hourly') return !perKmOnly;
                  if (key === 'land_based') return form.listingType !== 'rental' && !perKmOnly;
                  if (key === 'daily') return form.listingType === 'rental';
                  // per-km: the machine's own rate only in a category the admin marked "charged per km" (trolleys are set on the attachment)
                  return key === 'distance_based' && categoryMeta.chargedPerKm && form.listingType !== 'rental';
                }).map(({ key, label, unit }) => {
                  const isEnabled = !!form.pricing[key]?.isEnabled;
                  const price = form.pricing[key]?.price;
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
                          onClick={() => setForm(p => ({ 
                            ...p, 
                            pricing: { 
                              ...p.pricing, 
                              [key]: { 
                                ...(p.pricing[key] || { price: 0 }), 
                                isEnabled: !p.pricing[key]?.isEnabled 
                              } 
                            } 
                          }))}
                          className={`w-9 h-5 rounded-full relative transition-colors ${isEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-xs ${isEnabled ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-slate-800">{label}</p>
                            {key === 'distance_based' && (
                              <span className="text-[9px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.2 rounded">Trolley / KM</span>
                            )}
                          </div>
                          {isEnabled && key === 'hourly' && price > 0 && (
                            <p className="text-[10px] text-emerald-600 font-medium">≈ ₹{(price / 60).toFixed(2)}/min</p>
                          )}
                          {isEnabled && key === 'distance_based' && (
                            <p className="text-[10px] text-teal-600 font-medium">Billed via GPS road distance tracking</p>
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
                            onChange={e => setForm(p => ({ 
                              ...p, 
                              pricing: { 
                                ...p.pricing, 
                                [key]: { 
                                  ...(p.pricing[key] || {}), 
                                  price: parseFloat(e.target.value) || 0,
                                  perKmRate: parseFloat(e.target.value) || 0
                                } 
                              } 
                            }))}
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
