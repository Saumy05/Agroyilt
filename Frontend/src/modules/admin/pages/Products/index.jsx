import React, { useState, useEffect } from 'react';
import {
    FiPlus,
    FiEdit2,
    FiTrash2,
    FiStar,
    FiSearch,
    FiPackage,
    FiFilter,
    FiMoreVertical,
    FiUploadCloud,
    FiUser,
    FiCheck,
    FiX,
    FiClock,
    FiTruck
} from 'react-icons/fi';
import adminProductService from '../../../../services/adminProductService';
import adminEquipmentService from '../../../../services/adminEquipmentService';
import { publicCatalogService, serviceService, homeContentService, categoryService } from '../../../../services/catalogService';
import { getSettings } from '../../services/settingsService';
import { toastManager } from '../../../../utils/toastManager';
import { motion, AnimatePresence } from 'framer-motion';

const ManageProducts = () => {
    const [products, setProducts] = useState([]);
    const [pendingProducts, setPendingProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [currentProduct, setCurrentProduct] = useState(null);
    const [activeTab, setActiveTab] = useState('marketplace');
    const [rentalGst, setRentalGst] = useState(5); // Default 5% for Agriculture
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [premiumOfferings, setPremiumOfferings] = useState([]);
    const [showAddTabModal, setShowAddTabModal] = useState(false);
    const [tabFormData, setTabFormData] = useState({
        title: '', subtitle: '', imageUrl: '', colorCode: '#3b82f6', actionType: 'navigate', route: ''
    });
    const [uploadingTabImage, setUploadingTabImage] = useState(false);
    const [savingTab, setSavingTab] = useState(false);
    const [viewEquipment, setViewEquipment] = useState(null);
    const [activeMenuId, setActiveMenuId] = useState(null);

    const [showCatalogModal, setShowCatalogModal] = useState(false);
    const [catalogFormData, setCatalogFormData] = useState({
        title: "",
        gstPercentage: 18,
        categoryId: "",
        hourly_price: "",
        land_price: "",
        land_unit: "acre",
        daily_price: "",
        pricing_context: "any",
        parentSourceId: ""
    });
    const [savingCatalog, setSavingCatalog] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        categoryId: '',
        brandName: '',
        description: '',
        price: '',
        discountPrice: '',
        unit: 'hour',
        stock: 1,
        imageUrl: '',
        images: [],
        type: 'machinery',
        hasDriver: false,
        driverDetails: {
            name: '',
            phone: '',
            photo: '',
            licenseNumber: ''
        },
        specifications: []
    });

    useEffect(() => {
        fetchData();
        // Load rental GST from admin settings
        getSettings().then(res => {
            if (res?.settings?.rentalGstPercentage !== undefined) {
                setRentalGst(res.settings.rentalGstPercentage);
            }
        }).catch(() => {});
    }, []);

    useEffect(() => {
        const handleOutsideClick = () => setActiveMenuId(null);
        document.addEventListener('click', handleOutsideClick);
        return () => document.removeEventListener('click', handleOutsideClick);
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [prodRes, pendingRes, catRes, vendorEqPendingRes, vendorEqApprovedRes] = await Promise.all([
                adminProductService.getAll(),
                adminProductService.getVendorSubmissions('pending', 'machinery'),
                publicCatalogService.getCategories(),
                adminEquipmentService.getAll({ status: 'pending' }),
                adminEquipmentService.getAll({ status: 'approved' })
            ]);

            // LIVE FLEET: admin products + approved VendorEquipment
            const adminProducts = prodRes.success ? (prodRes.data || []).filter(p => p.type === 'machinery') : [];
            const approvedVendorEq = vendorEqApprovedRes.success
                ? vendorEqApprovedRes.data.map(e => ({ ...e, _source: 'vendorEquipment' }))
                : [];
            setProducts([...approvedVendorEq, ...adminProducts]);

            // NEW APPROVALS: pending Product-model + pending VendorEquipment
            const productPending = pendingRes.success ? pendingRes.data : [];
            const vendorEqPending = vendorEqPendingRes.success 
                ? vendorEqPendingRes.data.map(e => ({ ...e, _source: 'vendorEquipment' })) 
                : [];
            setPendingProducts([...vendorEqPending, ...productPending]);

            if (catRes.success) setCategories(catRes.categories || catRes.data || []);
            
            const homeContentRes = await homeContentService.get();
            if (homeContentRes.success && homeContentRes.homeContent) {
                setPremiumOfferings(homeContentRes.homeContent.premiumOfferings || []);
            }
        } catch (err) {
            toastManager.error("Machinery data load karne mein dikkat hui");
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setUploading(true);
            const token = sessionStorage.getItem('adminAccessToken') || localStorage.getItem('adminAccessToken');
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

            const uploadFormData = new FormData();
            uploadFormData.append('file', file);
            
            const res = await fetch(`${baseUrl}/admin/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: uploadFormData
            });
            const data = await res.json();
            if (data.success) {
                setFormData(prev => ({ 
                    ...prev, 
                    imageUrl: data.imageUrl,
                    images: [...(prev.images || []), data.imageUrl]
                }));
                toastManager.success("Image upload ho gayi!");
            }
        } catch (err) {
            toastManager.error("Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleDriverPhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            setUploading(true);
            const token = sessionStorage.getItem('adminAccessToken') || localStorage.getItem('adminAccessToken');
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
            const uploadFormData = new FormData();
            uploadFormData.append('file', file);
            const res = await fetch(`${baseUrl}/admin/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: uploadFormData
            });
            const data = await res.json();
            if (data.success) {
                setFormData(prev => ({ 
                    ...prev, 
                    driverDetails: { ...prev.driverDetails, photo: data.imageUrl }
                }));
                toastManager.success("Driver photo uploaded!");
            }
        } catch (err) {
            toastManager.error("Driver photo upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleApprove = async (item) => {
        if (!window.confirm("Approve this machinery/equipment? It will go LIVE for farmers.")) return;
        try {
            let res;
            if (item._source === 'vendorEquipment') {
                // VendorEquipment flow — use adminEquipmentService
                res = await adminEquipmentService.updateStatus(item._id, { status: 'approved' });
            } else {
                // Product model flow
                res = await adminProductService.approveProduct(item._id, { commissionPercentage: 10, gstPercentage: rentalGst });
            }
            if (res.success) {
                toastManager.success(`✅ Machinery Approved!`);
                fetchData();
                setShowModal(false);
            }
        } catch (err) {
            toastManager.error("Approval failed");
        }
    };

    const openRejectModal = (product) => {
        setRejectTarget(product);
        setRejectReason('');
        setShowRejectModal(true);
    };

    const handleRejectConfirm = async () => {
        if (!rejectReason.trim()) return toastManager.error('Please enter a rejection reason');
        try {
            let res;
            if (rejectTarget._source === 'vendorEquipment') {
                res = await adminEquipmentService.updateStatus(rejectTarget._id, { status: 'rejected', remarks: rejectReason });
            } else {
                res = await adminProductService.rejectProduct(rejectTarget._id, rejectReason);
            }
            if (res.success) {
                toastManager.success('Equipment rejected. Owner will be notified.');
                setShowRejectModal(false);
                fetchData();
            }
        } catch (err) {
            toastManager.error("Rejection failed");
        }
    };

    const openCatalogModal = async (vendorEq) => {
        const cityId = vendorEq.cityIds?.[0]?._id || vendorEq.cityIds?.[0] || vendorEq.vendorId?.cityId?._id || vendorEq.vendorId?.cityId || vendorEq.vendorId?.address?.city || null;
        setViewEquipment(vendorEq);
        setCatalogFormData({
            title: vendorEq.requestedCategoryName || vendorEq.name || "",
            categoryId: vendorEq.categoryId?._id || vendorEq.categoryId || "",
            gstPercentage: 18,
            hourly_price: vendorEq.pricing?.hourly?.price || "",
            land_price: vendorEq.pricing?.land_based?.price || "",
            land_unit: "acre",
            daily_price: vendorEq.pricing?.daily?.price || "",
            pricing_context: "any",
            parentSourceId: vendorEq._id,
            isAlwaysMain: false,
            sectionType: "General",
            homeIconUrl: vendorEq.images?.[0] || "",
            trackingType: "none",
            requiresDriver: false,
            cityId: cityId,
            vendorEqId: vendorEq._id
        });
        setShowCatalogModal(true);
        
        try {
            const homeContentRes = await homeContentService.get(cityId ? { cityId } : {});
            if (homeContentRes.success && homeContentRes.homeContent) {
                setPremiumOfferings(homeContentRes.homeContent.premiumOfferings || []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveToCatalog = async (e) => {
        e.preventDefault();
        let finalCategoryId = catalogFormData.parentCategory;
        try {
            setSavingCatalog(true);
            
            // Auto-create category if vendor requested one and admin didn't explicitly select a parent
            if (!finalCategoryId && viewEquipment?.requestedCategoryName) {
                try {
                    const newCatPayload = {
                        title: viewEquipment.requestedCategoryName,
                        slug: viewEquipment.requestedCategoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                        status: 'active',
                        showOnHome: catalogFormData.isAlwaysMain || false,
                        isPopular: false,
                        trackingType: catalogFormData.trackingType || 'none',
                        requiresDriver: catalogFormData.requiresDriver || false,
                        type: 'service', // Machinery categories are 'service'
                        homeIconUrl: catalogFormData.homeIconUrl || viewEquipment.images?.[0] || null,
                        cityIds: catalogFormData.cityId ? [catalogFormData.cityId] : [],
                        isAlwaysMain: catalogFormData.isAlwaysMain || false
                    };
                    const newCatRes = await categoryService.create(newCatPayload);
                    const createdCat = newCatRes.category || newCatRes.data;
                    if (newCatRes.success && createdCat) {
                        finalCategoryId = createdCat._id || createdCat.id;
                    }
                } catch (catErr) {
                    console.error("Failed to auto-create category, it might already exist:", catErr);
                    // If it already exists, try to find it in the categories list by title (case-insensitive)
                    const existingCat = categories.find(c => c.title.toLowerCase() === viewEquipment.requestedCategoryName.toLowerCase());
                    if (existingCat) {
                        finalCategoryId = existingCat._id || existingCat.id;
                    }
                }
            }

            const payload = {
                title: catalogFormData.title,
                basePrice: parseFloat(catalogFormData.hourly_price) || parseFloat(catalogFormData.daily_price) || parseFloat(catalogFormData.land_price) || 0,
                gstPercentage: parseFloat(catalogFormData.gstPercentage) || 18,
                ...(finalCategoryId ? { categoryId: finalCategoryId } : {}),
                hourly_price: parseFloat(catalogFormData.hourly_price) || 0,
                land_price: parseFloat(catalogFormData.land_price) || 0,
                land_unit: catalogFormData.land_unit,
                daily_price: parseFloat(catalogFormData.daily_price) || 0,
                pricing_context: catalogFormData.pricing_context,
                parentSourceId: catalogFormData.parentSourceId || null,
                isAlwaysMain: catalogFormData.isAlwaysMain,
                sectionType: catalogFormData.sectionType,
                homeIconUrl: catalogFormData.homeIconUrl,
                trackingType: catalogFormData.trackingType,
                requiresDriver: catalogFormData.requiresDriver,
                cityIds: catalogFormData.cityId ? [catalogFormData.cityId] : []
            };
            const res = await serviceService.create(payload);
            if (res.success) {
                if (catalogFormData.vendorEqId) {
                    const updatePayload = { requestedCategoryName: null, status: 'approved' };
                    if (finalCategoryId) {
                        updatePayload.categoryId = finalCategoryId;
                    }
                    await adminEquipmentService.update(catalogFormData.vendorEqId, updatePayload);
                    fetchData(); // Refresh list to remove the button
                }
                toastManager.success("Added to Equipment Catalog successfully!");
                setShowCatalogModal(false);
            } else {
                toastManager.error(res.message || "Failed to add to catalog");
            }
        } catch (err) {
            const errorMsg = err.response?.data?.message;
            if (errorMsg === 'A service with this name already exists for this brand.') {
                if (catalogFormData.vendorEqId) {
                    const updatePayload = { requestedCategoryName: null, status: 'approved' };
                    if (finalCategoryId) {
                        updatePayload.categoryId = finalCategoryId;
                    }
                    await adminEquipmentService.update(catalogFormData.vendorEqId, updatePayload);
                    fetchData();
                    setShowCatalogModal(false);
                    return toastManager.success('Equipment linked to existing category in catalog');
                }
            } else {
                toastManager.error(errorMsg || "Failed to add to catalog");
            }
        } finally {
            setSavingCatalog(false);
        }
    };

    const handleSaveTab = async (e) => {
        e.preventDefault();
        try {
            setSavingTab(true);
            const cityId = catalogFormData.cityId;
            const homeContentRes = await homeContentService.get({ cityId });
            if (homeContentRes.success && homeContentRes.homeContent) {
                const content = homeContentRes.homeContent;
                const newTab = { 
                    ...tabFormData, 
                    actionPayload: tabFormData.route, 
                    order: (content.premiumOfferings?.length || 0) 
                };
                content.premiumOfferings = [...(content.premiumOfferings || []), newTab];
                
                const res = await homeContentService.update(content, { cityId });
                if (res.success) {
                    toastManager.success("Tab added successfully!");
                    setPremiumOfferings(content.premiumOfferings);
                    setCatalogFormData({ ...catalogFormData, sectionType: newTab.title || newTab.actionPayload || "General" });
                    setShowAddTabModal(false);
                }
            }
        } catch (err) {
            toastManager.error(err.response?.data?.message || 'Failed to add tab');
        } finally {
            setSavingTab(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            let res;
            if (editMode) {
                res = await adminProductService.update(currentProduct._id, formData);
            } else {
                res = await adminProductService.create(formData);
            }
            if (res.success) {
                toastManager.success("Saved successfully");
                setShowModal(false);
                fetchData();
            }
        } catch (err) {
            toastManager.error("Save failed");
        }
    };

    const resetForm = () => {
        setFormData({
            title: '',
            categoryId: '',
            brandName: '',
            description: '',
            price: '',
            discountPrice: '',
            unit: 'hour',
            stock: 1,
            imageUrl: '',
            images: [],
            type: 'machinery',
            hasDriver: false,
            driverDetails: { name: '', phone: '', photo: '', licenseNumber: '' },
            specifications: []
        });
        setEditMode(false);
    };

    const openEdit = (product) => {
        setCurrentProduct(product);
        setFormData({
            ...product,
            categoryId: product.categoryId?._id || product.categoryId,
            type: 'machinery',
            hasDriver: product.hasDriver || false,
            driverDetails: product.driverDetails || { name: '', phone: '', photo: '', licenseNumber: '' }
        });
        setEditMode(true);
        setShowModal(true);
    };

    const currentList = activeTab === 'marketplace' ? products : pendingProducts;
    const filteredProducts = currentList.filter(p => {
        const trimmedSearch = searchTerm.trim().toLowerCase();
        if (!trimmedSearch) return true;
        return (p.title?.toLowerCase().includes(trimmedSearch)) ||
               (p.name?.toLowerCase().includes(trimmedSearch)) ||
               (p.brandName?.toLowerCase().includes(trimmedSearch)) ||
               (p.vendorId?.name?.toLowerCase().includes(trimmedSearch));
    });

    return (
        <div className="py-6 bg-slate-50 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 px-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-800">Machinery Management</h1>
                    <p className="text-sm text-slate-500 font-medium">Manage Equipment & Heavy Machinery Approvals</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold shadow-lg hover:bg-slate-800 transition-all"
                >
                    + Add Machinery
                </button>
            </div>

            <div className="flex gap-4 mb-6 border-b border-slate-200 px-6">
                <button onClick={() => setActiveTab('marketplace')} className={`pb-4 px-2 font-black text-sm uppercase tracking-wider relative ${activeTab === 'marketplace' ? 'text-slate-800' : 'text-slate-400'}`}>
                    Live Fleet ({products.length})
                    {activeTab === 'marketplace' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('pending')} className={`pb-4 px-2 font-black text-sm uppercase tracking-wider relative ${activeTab === 'pending' ? 'text-orange-600' : 'text-slate-400'}`}>
                    New Approvals ({pendingProducts.length})
                    {activeTab === 'pending' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-orange-600 rounded-t-full" />}
                </button>
            </div>

            <div className="bg-white border-t border-slate-100 shadow-sm overflow-hidden mt-4">
                <div className="overflow-x-auto pb-28">
                <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Machine</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Owner / Shop</th>
                            {activeTab === 'pending' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rental Type</th>}
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Price</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading ? (
                            <tr><td colSpan="6" className="text-center py-20 text-slate-400 font-bold">Loading...</td></tr>
                        ) : filteredProducts.length === 0 ? (
                            <tr><td colSpan="6" className="text-center py-20 text-slate-400 font-bold">
                                {activeTab === 'pending' ? '🎉 No pending approvals! All clear.' : 'No machinery found'}
                            </td></tr>
                        ) : filteredProducts.map(p => {
                            // Support both VendorEquipment shape and Product shape
                            const isVendorEq = p._source === 'vendorEquipment';
                            const displayName = isVendorEq ? p.name : p.title;
                            const displaySubtitle = isVendorEq ? (p.modelNumber || p.year || 'Standard') : p.brandName;
                            const displayImage = isVendorEq ? p.images?.[0] : p.imageUrl;
                            const displayCategory = p.categoryId?.title || p.requestedCategoryName || 'Machine';
                            const vendorName = p.vendorId?.businessName || p.vendorId?.name || 'Vendor';
                            const vendorPhone = p.vendorId?.phone || '';

                            return (
                            <tr key={p._id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center">
                                            {displayImage 
                                                ? <img src={displayImage} alt="" className="w-full h-full object-cover" />
                                                : <FiTruck className="text-slate-300 w-5 h-5" />
                                            }
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-black text-slate-800 text-sm">{displayName}</p>
                                                {isVendorEq && (
                                                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-[8px] font-black uppercase">Vendor Listed</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{displaySubtitle}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    {isVendorEq && p.requestedCategoryName ? (
                                        <span className="whitespace-nowrap inline-block px-3 py-1 bg-rose-50 border border-rose-100 text-rose-600 rounded-lg text-[10px] font-black uppercase" title="Requested New Category">
                                            New: {p.requestedCategoryName}
                                        </span>
                                    ) : (
                                        <span className="whitespace-nowrap inline-block px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase">
                                            {p.categoryId?.title || 'Machine'}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {p.vendorId ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                                                <FiUser className="w-3 h-3 text-orange-600" />
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-700 text-xs leading-tight">{vendorName}</p>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <p className="text-[9px] text-orange-600 font-bold">{vendorPhone}</p>
                                                    {p.requestedCityName ? (
                                                        <span className="whitespace-nowrap inline-block text-[8px] px-1.5 py-0.5 bg-rose-50 border border-rose-100 text-rose-700 font-black uppercase rounded" title="Requested New City">
                                                            New City: {p.requestedCityName}
                                                        </span>
                                                    ) : (
                                                        <span className="whitespace-nowrap inline-block text-[8px] px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 font-black uppercase rounded">
                                                            {p.cityIds?.[0]?.name || p.vendorId?.cityId?.name || 'Global'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase">Admin</span>
                                    )}
                                </td>
                                {activeTab === 'pending' && (
                                    <td className="px-6 py-4">
                                        {isVendorEq ? (
                                            <span className="whitespace-nowrap inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[9px] font-black uppercase">
                                                🚜 <span>{p.listingType || 'service'}</span>
                                            </span>
                                        ) : (
                                            <span className={`whitespace-nowrap inline-block px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                                                p.rental_type === 'land_based' ? 'bg-green-50 text-green-700' :
                                                p.rental_type === 'monthly' ? 'bg-purple-50 text-purple-700' :
                                                'bg-blue-50 text-blue-700'
                                            }`}>
                                                {p.rental_type === 'land_based' ? '🌾 Acre-based' :
                                                 p.rental_type === 'monthly' ? '📅 Monthly' : '⏱ Hourly'}
                                            </span>
                                        )}
                                    </td>
                                )}
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1">
                                        {isVendorEq ? (
                                            Object.entries(p.pricing || {}).filter(([, v]) => v?.isEnabled).map(([k, v]) => {
                                                const label = k === 'land_based' ? 'acre' : k === 'hourly' ? 'hr' : 'day';
                                                return (
                                                    <span key={k} className="inline-block text-[11px] font-extrabold text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-0.5 whitespace-nowrap w-fit">
                                                        ₹{v.price}/{label}
                                                    </span>
                                                );
                                            })
                                        ) : (
                                            <span className="inline-block text-[11px] font-extrabold text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-0.5 whitespace-nowrap w-fit">
                                                ₹{p.price}/{p.unit}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                                        <button 
                                            onClick={() => setActiveMenuId(activeMenuId === p._id ? null : p._id)}
                                            className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-500 hover:text-slate-800"
                                        >
                                            <FiMoreVertical className="w-5 h-5" />
                                        </button>
                                        {activeMenuId === p._id && (
                                            <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 p-1.5 space-y-0.5 text-left animate-in fade-in slide-in-from-top-2 duration-150">
                                                <button 
                                                    onClick={() => { setViewEquipment(p); setActiveMenuId(null); }}
                                                    className="w-full text-left px-3.5 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-all flex items-center gap-2"
                                                >
                                                    <FiSearch className="w-3.5 h-3.5 text-slate-400" />
                                                    View Details
                                                </button>
                                                
                                                {activeTab === 'pending' ? (
                                                    <>
                                                        <button 
                                                            onClick={() => { handleApprove(p); setActiveMenuId(null); }}
                                                            className="w-full text-left px-3.5 py-2 text-xs font-black text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-all flex items-center gap-2"
                                                        >
                                                            <FiCheck className="w-3.5 h-3.5" />
                                                            Approve
                                                        </button>
                                                        {isVendorEq && p.requestedCategoryName && (
                                                            <button 
                                                                onClick={() => { 
                                                                    openCatalogModal(p); 
                                                                    setActiveMenuId(null); 
                                                                }}
                                                                className="w-full text-left px-3.5 py-2 text-xs font-black text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all flex items-center gap-2"
                                                            >
                                                                <FiPlus className="w-3.5 h-3.5" />
                                                                Add to Catalog
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => { openRejectModal(p); setActiveMenuId(null); }}
                                                            className="w-full text-left px-3.5 py-2 text-xs font-black text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-xl transition-all flex items-center gap-2"
                                                        >
                                                            <FiX className="w-3.5 h-3.5" />
                                                            Reject
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {!p.vendorId && (
                                                            <button 
                                                                onClick={() => { openEdit(p); setActiveMenuId(null); }}
                                                                className="w-full text-left px-3.5 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-all flex items-center gap-2"
                                                            >
                                                                <FiEdit2 className="w-3.5 h-3.5 text-slate-400" />
                                                                Edit
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => { adminProductService.delete(p._id).then(fetchData); setActiveMenuId(null); }}
                                                            className="w-full text-left px-3.5 py-2 text-xs font-black text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-xl transition-all flex items-center gap-2"
                                                        >
                                                            <FiTrash2 className="w-3.5 h-3.5" />
                                                            Delete
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
                </div>
            </div>

            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-8 border-b flex justify-between items-center">
                                <h2 className="text-xl font-black text-slate-800">{editMode ? 'Edit Machinery' : 'New Machinery'}</h2>
                                <button onClick={() => setShowModal(false)}>✕</button>
                            </div>
                            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Title</label>
                                        <input className="w-full bg-slate-50 rounded-2xl p-4 font-bold outline-none" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Category</label>
                                        <select className="w-full bg-slate-50 rounded-2xl p-4 font-bold outline-none" value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})} required>
                                            <option value="">Select Category</option>
                                            {categories.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Price</label>
                                        <input type="number" className="w-full bg-slate-50 rounded-2xl p-4 font-bold outline-none" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} required />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Unit (hour/day)</label>
                                        <input className="w-full bg-slate-50 rounded-2xl p-4 font-bold outline-none" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Brand</label>
                                        <input className="w-full bg-slate-50 rounded-2xl p-4 font-bold outline-none" value={formData.brandName} onChange={e => setFormData({...formData, brandName: e.target.value})} />
                                    </div>
                                </div>

                                <div className="pt-4 border-t">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <div className={`w-10 h-6 rounded-full p-1 transition-all ${formData.hasDriver ? 'bg-orange-500' : 'bg-slate-200'}`}>
                                            <div className={`w-4 h-4 rounded-full bg-white transform ${formData.hasDriver ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </div>
                                        <input type="checkbox" className="hidden" checked={formData.hasDriver} onChange={e => setFormData({...formData, hasDriver: e.target.checked})} />
                                        <span className="text-xs font-black uppercase tracking-tight">Include Driver Details?</span>
                                    </label>
                                    
                                    {formData.hasDriver && (
                                        <div className="mt-4 p-5 bg-orange-50/30 rounded-3xl border border-orange-100 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <input placeholder="Driver Name" className="bg-white rounded-xl p-3 text-sm font-bold outline-none" value={formData.driverDetails.name} onChange={e => setFormData({...formData, driverDetails: {...formData.driverDetails, name: e.target.value}})} />
                                                <input placeholder="Phone" className="bg-white rounded-xl p-3 text-sm font-bold outline-none" value={formData.driverDetails.phone} onChange={e => setFormData({...formData, driverDetails: {...formData.driverDetails, phone: e.target.value}})} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </form>
                            <div className="p-8 bg-slate-50 border-t flex gap-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 bg-white border rounded-2xl font-black text-xs uppercase">Cancel</button>
                                <button onClick={handleSubmit} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase shadow-xl">Save Machinery</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Reject Modal */}
                {showRejectModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowRejectModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden flex flex-col">
                            <div className="p-6 border-b flex justify-between items-center bg-rose-50/50">
                                <h2 className="text-xl font-black text-rose-600 flex items-center gap-2"><FiX className="w-5 h-5" /> Reject Equipment</h2>
                                <button onClick={() => setShowRejectModal(false)} className="p-2 hover:bg-rose-100 rounded-full transition-colors"><FiX /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Reason for Rejection</label>
                                    <textarea 
                                        className="w-full bg-slate-50 rounded-2xl p-4 font-medium outline-none border border-slate-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 transition-all resize-none h-32" 
                                        placeholder="Explain why this equipment is being rejected. The owner will see this message."
                                        value={rejectReason} 
                                        onChange={e => setRejectReason(e.target.value)} 
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t flex gap-4">
                                <button type="button" onClick={() => setShowRejectModal(false)} className="flex-1 py-3.5 bg-white border rounded-2xl font-black text-xs uppercase text-slate-600 hover:bg-slate-50">Cancel</button>
                                <button onClick={handleRejectConfirm} className="flex-[2] py-3.5 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all">Confirm Rejection</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* View Equipment Details Modal */}
                {viewEquipment && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <div className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                            {/* Modal Header */}
                            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg">
                                        Machinery / Equipment Details
                                    </h3>
                                    <p className="text-xs font-bold text-slate-400 mt-1 uppercase">
                                        Status: <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                            viewEquipment.status === 'approved' ? 'bg-green-100 text-green-700' :
                                            viewEquipment.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                        }`}>{viewEquipment.status}</span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => setViewEquipment(null)}
                                    className="p-2 bg-white rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors shadow-sm font-black"
                                >
                                    <FiX className="w-5 h-5 text-slate-600" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-8 overflow-y-auto space-y-6">
                                {/* Images Gallery */}
                                {viewEquipment.images && viewEquipment.images.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Machine Photos</p>
                                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                                            {viewEquipment.images.map((img, idx) => (
                                                <div key={idx} className="w-40 h-28 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                                                    <img src={img} className="w-full h-full object-cover" alt="" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Core Details */}
                                <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100/80">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Machine Name</p>
                                        <p className="text-sm font-black text-slate-800">{viewEquipment.name || viewEquipment.title}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Brand / Model</p>
                                        <p className="text-sm font-black text-slate-800">{viewEquipment.brandName || viewEquipment.modelNumber || 'N/A'}</p>
                                    </div>
                                    {viewEquipment.year && (
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Manufacturing Year</p>
                                            <p className="text-sm font-black text-slate-800">{viewEquipment.year}</p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Category</p>
                                        <p className="text-sm font-black text-slate-800">
                                            {viewEquipment.categoryId?.title || viewEquipment.requestedCategoryName || 'Machine'}
                                        </p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Description</p>
                                        <p className="text-xs font-semibold text-slate-600 leading-relaxed mt-1">
                                            {viewEquipment.description || 'No description provided.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Pricing Details */}
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pricing Configuration</p>
                                    <div className="grid grid-cols-3 gap-4">
                                        {viewEquipment._source === 'vendorEquipment' ? (
                                            Object.entries(viewEquipment.pricing || {}).map(([key, val]) => {
                                                if (!val?.isEnabled) return null;
                                                const label = key === 'land_based' ? 'Acre-based' : key === 'hourly' ? 'Hourly' : 'Daily';
                                                return (
                                                    <div key={key} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 text-center">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{label}</p>
                                                        <p className="text-base font-black text-[#2E7D32] mt-1">₹{val.price}</p>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 text-center col-span-3">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Standard Price</p>
                                                <p className="text-base font-black text-[#2E7D32] mt-1">₹{viewEquipment.price} / {viewEquipment.unit}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Operator / Driver details */}
                                {viewEquipment.includesDriver && viewEquipment.driver && (
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assigned Operator / Driver</p>
                                        <div className="flex gap-4 items-center bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
                                                {viewEquipment.driver.photo ? (
                                                    <img src={viewEquipment.driver.photo} className="w-full h-full object-cover rounded-xl" alt="" />
                                                ) : (
                                                    <FiUser className="w-6 h-6 text-slate-300" />
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1 text-xs font-bold text-slate-600">
                                                <div>
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Operator Name</span>
                                                    <span className="text-sm font-black text-slate-800">{viewEquipment.driver.name || 'N/A'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Phone Number</span>
                                                    <span className="text-sm font-black text-slate-800">{viewEquipment.driver.phone || 'N/A'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Aadhar Card</span>
                                                    <span className="text-xs font-black text-slate-800">{viewEquipment.driver.aadharNumber || 'N/A'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Driving License</span>
                                                    <span className="text-xs font-black text-slate-800">{viewEquipment.driver.licenseNumber || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Owner / Vendor info */}
                                {viewEquipment.vendorId && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor Information</p>
                                        <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 grid grid-cols-4 gap-4 text-xs font-bold text-slate-600">
                                            <div>
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Business / Shop Name</span>
                                                <span className="text-sm font-black text-slate-800">{viewEquipment.vendorId.businessName || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Contact Person</span>
                                                <span className="text-sm font-black text-slate-800">{viewEquipment.vendorId.name}</span>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Phone</span>
                                                <span className="text-sm font-black text-orange-600">{viewEquipment.vendorId.phone}</span>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Zone / City</span>
                                                <span className="text-sm font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded uppercase">{viewEquipment.cityIds?.[0]?.name || viewEquipment.vendorId?.cityId?.name || 'Global'}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Add to Catalog Modal */}
                {showCatalogModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowCatalogModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-8 border-b flex justify-between items-center bg-indigo-50/50">
                                <h2 className="text-xl font-black text-indigo-900 flex items-center gap-2"><FiPlus className="w-5 h-5" /> Add Equipment to Global Catalog</h2>
                                <button onClick={() => setShowCatalogModal(false)} className="p-2 hover:bg-indigo-100 rounded-full transition-colors"><FiX /></button>
                            </div>
                            <form id="catalogForm" onSubmit={handleSaveToCatalog} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                                <div className="grid grid-cols-2 gap-6">

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Equipment Title</label>
                                        <input 
                                            className="w-full bg-slate-50 rounded-2xl p-4 font-bold outline-none" 
                                            value={catalogFormData.title} 
                                            onChange={e => setCatalogFormData({...catalogFormData, title: e.target.value})} 
                                            placeholder="e.g. Tractor 50HP" 
                                            required 
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Pricing Context</label>
                                        <select
                                            value={catalogFormData.pricing_context}
                                            onChange={e => setCatalogFormData({ ...catalogFormData, pricing_context: e.target.value })}
                                            className="w-full px-4 py-4 border border-blue-200 bg-blue-50/50 rounded-2xl font-bold outline-none"
                                        >
                                            <option value="any">Global (Applies everywhere)</option>
                                            <option value="standalone">Standalone Rental (Direct Booking)</option>
                                            <option value="sub-category">Sub-category (As an Implement)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Parent Category <span className="text-xs font-normal text-slate-400">(Optional)</span></label>
                                        <select
                                            value={catalogFormData.categoryId || ""}
                                            onChange={e => setCatalogFormData({ ...catalogFormData, categoryId: e.target.value })}
                                            className="w-full px-4 py-4 border border-purple-200 bg-purple-50/50 rounded-2xl font-bold outline-none"
                                            disabled={catalogFormData.pricing_context === 'standalone' || catalogFormData.pricing_context === 'any'}
                                        >
                                            <option value="">None (Global)</option>
                                            {categories.map(cat => (
                                                <option key={cat._id || cat.id} value={cat._id || cat.id}>{cat.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1 mt-4">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="alwaysMain"
                                            checked={catalogFormData.isAlwaysMain || false}
                                            onChange={e => setCatalogFormData({ ...catalogFormData, isAlwaysMain: e.target.checked })}
                                            className="h-4 w-4 accent-indigo-600"
                                        />
                                        <label htmlFor="alwaysMain" className="text-sm font-bold text-slate-800">Always show in Main List</label>
                                    </div>
                                    <p className="text-[10px] text-slate-400 pl-7">Useful for tools like "Rotavator" that should be visible even when they are sub-categories.</p>
                                </div>

                                <div className="grid grid-cols-2 gap-6 mt-4">
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1 space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase">Home Page Tab Section</label>
                                            <select
                                                value={catalogFormData.sectionType || "General"}
                                                onChange={e => setCatalogFormData({ ...catalogFormData, sectionType: e.target.value })}
                                                className="w-full bg-slate-50 rounded-2xl p-4 font-bold outline-none border border-slate-200"
                                            >
                                                <option value="General">General (Default scrolling list)</option>
                                                {premiumOfferings.filter(o => o.actionPayload || o.title).map((o, idx) => {
                                                    const sectionName = o.actionPayload || o.title;
                                                    return <option key={o._id || o.id || idx} value={sectionName}>{o.title} - ({sectionName})</option>
                                                })}
                                            </select>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setTabFormData({ title: '', subtitle: '', imageUrl: '', colorCode: '#3b82f6', actionType: 'navigate', route: '' });
                                                setShowAddTabModal(true);
                                            }}
                                            className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 hover:bg-indigo-100 transition-colors"
                                            title="Create New Tab"
                                        >
                                            <FiPlus className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Home Icon</label>
                                        <div className="border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50 flex flex-col items-center gap-2">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={async e => {
                                                    const f = e.target.files[0];
                                                    if (!f) return;
                                                    setUploading(true);
                                                    const res = await serviceService.uploadImage(f, 'categories');
                                                    if (res.success) setCatalogFormData({ ...catalogFormData, homeIconUrl: res.imageUrl });
                                                    setUploading(false);
                                                }}
                                                className="w-full text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                                            />
                                            {catalogFormData.homeIconUrl && (
                                                <div className="relative mt-2">
                                                    <img src={catalogFormData.homeIconUrl} className="h-10 w-10 object-contain bg-white rounded-lg shadow-sm border border-slate-200 p-1" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-orange-50/50 p-5 rounded-3xl border border-orange-100 space-y-4 mt-6">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-orange-700 uppercase tracking-wider">⚙ Machinery Classification</span>
                                    </div>
                                    <p className="text-[10px] text-orange-600 font-medium leading-tight">Only set this for Equipment Catalog categories. Leave as "None" for Soil Testing or E-commerce.</p>
                                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                                        <div className="flex-1 w-full space-y-1">
                                            <label className="text-[10px] font-black text-orange-700 uppercase">Tracking Type</label>
                                            <select
                                                value={catalogFormData.trackingType || "none"}
                                                onChange={e => setCatalogFormData({ ...catalogFormData, trackingType: e.target.value })}
                                                className="w-full text-sm font-bold p-4 rounded-2xl border border-orange-200 bg-white outline-none"
                                            >
                                                <option value="none">None (Default - Not a Machine)</option>
                                                <option value="odometer">Odometer (Moving Machine)</option>
                                                <option value="timestamp">Timestamp (Static Tool)</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2 pt-5">
                                            <input
                                                id="reqDriver"
                                                type="checkbox"
                                                checked={catalogFormData.requiresDriver || false}
                                                onChange={e => setCatalogFormData({ ...catalogFormData, requiresDriver: e.target.checked })}
                                                className="h-4 w-4 accent-orange-600"
                                            />
                                            <label htmlFor="reqDriver" className="text-[10px] font-black text-orange-800 uppercase cursor-pointer">Requires Driver/Operator</label>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-blue-50/50 p-5 rounded-3xl border border-blue-100 space-y-4 mt-6">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-black text-blue-600 uppercase tracking-wider">Equipment Rental Pricing (Guidelines)</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Hourly (₹)</label>
                                            <input
                                                type="number"
                                                value={catalogFormData.hourly_price}
                                                onChange={e => setCatalogFormData({ ...catalogFormData, hourly_price: e.target.value })}
                                                placeholder="e.g. 500"
                                                className="w-full p-3 rounded-xl bg-white border border-blue-200 font-bold outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
                                                <span>Land (₹/{catalogFormData.land_unit?.toUpperCase() || 'ACRE'})</span>
                                                <select
                                                    value={catalogFormData.land_unit || 'acre'}
                                                    onChange={e => setCatalogFormData({ ...catalogFormData, land_unit: e.target.value })}
                                                    className="text-blue-600 lowercase bg-transparent outline-none font-black cursor-pointer border-b border-dashed border-blue-200 hover:border-blue-500 appearance-none text-right"
                                                >
                                                    <option value="acre">acre</option>
                                                    <option value="bigha">bigha</option>
                                                    <option value="hectare">hectare</option>
                                                    <option value="sqft">sq.ft</option>
                                                    <option value="gaj">gaj</option>
                                                </select>
                                            </label>
                                            <input
                                                type="number"
                                                value={catalogFormData.land_price}
                                                onChange={e => setCatalogFormData({ ...catalogFormData, land_price: e.target.value })}
                                                placeholder="e.g. 1200"
                                                className="w-full p-3 rounded-xl bg-white border border-blue-200 font-bold outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Daily (₹)</label>
                                            <input
                                                type="number"
                                                value={catalogFormData.daily_price}
                                                onChange={e => setCatalogFormData({ ...catalogFormData, daily_price: e.target.value })}
                                                placeholder="e.g. 2500"
                                                className="w-full p-3 rounded-xl bg-white border border-blue-200 font-bold outline-none"
                                            />
                                        </div>
                                    </div>

                                </div>
                            </form>

                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                                <button type="button" onClick={() => setShowCatalogModal(false)} className="flex-1 py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl text-sm font-black hover:bg-slate-50 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" form="catalogForm" disabled={savingCatalog} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-sm font-black hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50">
                                    {savingCatalog ? 'Saving...' : 'Add to Catalog'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add Tab Modal */}
            <AnimatePresence>
                {showAddTabModal && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                                <h3 className="text-xl font-black text-slate-800">Add Tab</h3>
                                <button onClick={() => setShowAddTabModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                                    <FiX className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <form onSubmit={handleSaveTab} className="flex flex-col overflow-hidden">
                                <div className="p-6 space-y-6 overflow-y-auto">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
                                            <input
                                                type="text"
                                                value={tabFormData.title}
                                                onChange={(e) => setTabFormData({ ...tabFormData, title: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                                placeholder="e.g. Farming"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Subtitle</label>
                                            <input
                                                type="text"
                                                value={tabFormData.subtitle}
                                                onChange={(e) => setTabFormData({ ...tabFormData, subtitle: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                                placeholder="e.g. Tools"
                                            />
                                        </div>
                                        <div className="col-span-2 sm:col-span-1">
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Image URL / Upload</label>
                                            <div className="space-y-3">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    disabled={uploadingTabImage}
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            setUploadingTabImage(true);
                                                            try {
                                                                const response = await serviceService.uploadImage(file, 'premium');
                                                                if (response.success) {
                                                                    setTabFormData((p) => ({ ...p, imageUrl: response.imageUrl }));
                                                                    toastManager.success("Image uploaded!");
                                                                }
                                                            } catch (error) {
                                                                toastManager.error("Failed to upload image");
                                                            } finally {
                                                                setUploadingTabImage(false);
                                                            }
                                                        }
                                                    }}
                                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                                                />
                                                <input
                                                    type="text"
                                                    value={tabFormData.imageUrl}
                                                    onChange={(e) => setTabFormData({ ...tabFormData, imageUrl: e.target.value })}
                                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none text-sm"
                                                    placeholder="Or enter URL here (e.g. /images/tractor.jpg)"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Color Code</label>
                                            <input
                                                type="text"
                                                value={tabFormData.colorCode}
                                                onChange={(e) => setTabFormData({ ...tabFormData, colorCode: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Action Type</label>
                                            <select
                                                value={tabFormData.actionType}
                                                onChange={(e) => setTabFormData({ ...tabFormData, actionType: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                            >
                                                <option value="navigate">Navigate to Route</option>
                                                <option value="link">External Link</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Route</label>
                                            <input
                                                type="text"
                                                value={tabFormData.route}
                                                onChange={(e) => setTabFormData({ ...tabFormData, route: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                                placeholder="e.g. /user/agri-marketplace"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                                    <button type="submit" disabled={savingTab || uploadingTabImage} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 hover:shadow-2xl transition-all disabled:opacity-50">
                                        {savingTab ? 'Saving...' : 'Add Tab'}
                                    </button>
                                    <button type="button" onClick={() => setShowAddTabModal(false)} className="flex-1 py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-50 transition-colors">
                                        Cancel
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

export default ManageProducts;
