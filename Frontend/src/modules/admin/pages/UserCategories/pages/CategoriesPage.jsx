import React, { useEffect, useMemo, useState } from "react";
import { FiGrid, FiPlus, FiEdit2, FiTrash2, FiSave, FiChevronUp, FiChevronDown, FiMove, FiX, FiSearch, FiMapPin, FiGlobe } from "react-icons/fi";
import { toast } from "react-hot-toast";
import CardShell from "../components/CardShell";
import Modal from "../components/Modal";
import ToggleSwitch from "../components/ToggleSwitch";
import { saveCatalog, slugify, toAssetUrl } from "../utils";

import { categoryService, serviceService, homeContentService } from "../../../../../services/catalogService";
import { stateService, districtService, subDistrictService } from "../../../services/geoService";
import { z } from "zod";

const categorySchema = z.object({
  title: z.string().min(2, "Category title must be at least 2 characters"),
  slug: z.string().optional(),
  homeIconUrl: z.string().optional(),
  homeBadge: z.string().optional(),
  hasSaleBadge: z.boolean(),
  showOnHome: z.boolean(),
  parentCategory: z.string().nullable().optional(),
  parentCategories: z.array(z.string()).optional(),
  isAlwaysMain: z.boolean().default(false),
  requiresDriver: z.boolean().default(false),
  sectionType: z.string().default('General'),
  trackingType: z.string().default('none'),
  bookingType: z.enum(['VENDOR', 'WORKER']).default('VENDOR'),
  scope: z.enum(['GLOBAL', 'GLOBAL_INDIA', 'STATE', 'DISTRICT', 'SUB_DISTRICT']).default('GLOBAL_INDIA'),
  stateId: z.string().nullable().optional(),
  districtId: z.string().nullable().optional(),
  subDistrictId: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.scope === 'STATE') {
    if (!data.stateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stateId'],
        message: 'Please select a state.'
      });
    }
  } else if (data.scope === 'DISTRICT') {
    if (!data.districtId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['districtId'],
        message: 'Please select a district.'
      });
    }
  } else if (data.scope === 'SUB_DISTRICT') {
    if (!data.subDistrictId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subDistrictId'],
        message: 'Please select a sub-district.'
      });
    }
  }
});

const CategoriesPage = ({ catalog, setCatalog }) => {
  const [editingId, setEditingId] = useState(null);
  const [activeTab, setActiveTab] = useState('main'); // 'main' | 'all'
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [premiumOfferings, setPremiumOfferings] = useState([]);
  const [viewAllSubCatsModal, setViewAllSubCatsModal] = useState({
    isOpen: false,
    category: null,
    subCategories: []
  });
  const [subCategorySearchTerm, setSubCategorySearchTerm] = useState("");

  // Geographic management states
  const [geoStates, setGeoStates] = useState([]);
  const [geoDistricts, setGeoDistricts] = useState([]);
  const [geoSubDistricts, setGeoSubDistricts] = useState([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingSubDistricts, setLoadingSubDistricts] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [geoSearchFilter, setGeoSearchFilter] = useState("");

  const openSubCategoriesModal = (category, subCategories) => {
    setViewAllSubCatsModal({
      isOpen: true,
      category,
      subCategories
    });
    setSubCategorySearchTerm("");
  };

  const filteredModalSubCats = useMemo(() => {
    if (!viewAllSubCatsModal.subCategories) return [];
    if (!subCategorySearchTerm.trim()) return viewAllSubCatsModal.subCategories;
    const lower = subCategorySearchTerm.trim().toLowerCase();
    return viewAllSubCatsModal.subCategories.filter(sc => 
      sc.title?.toLowerCase().includes(lower) ||
      sc.slug?.toLowerCase().includes(lower)
    );
  }, [viewAllSubCatsModal.subCategories, subCategorySearchTerm]);

  const [form, setForm] = useState({
    title: "",
    slug: "",
    homeIconUrl: "",
    homeBadge: "",
    hasSaleBadge: false,
    showOnHome: true,
    parentCategory: "",
    parentCategories: [],
    isAlwaysMain: false,
    trackingType: "none",
    requiresDriver: false,
    sectionType: "General",
    bookingType: "VENDOR",
    scope: "GLOBAL_INDIA",
    stateId: "",
    districtId: "",
    subDistrictId: ""
  });

  const categoriesBase = useMemo(() => {
    return [...(catalog.categories || [])].sort((a, b) => (a.homeOrder || 0) - (b.homeOrder || 0));
  }, [catalog.categories]);

  const getCategoryId = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") return (value.id || value._id || null)?.toString?.() || null;
    return value?.toString?.() || null;
  };

  const getCategoryTitle = (value) => {
    if (!value) return "";
    if (typeof value === "object" && value.title) return value.title;
    const id = getCategoryId(value);
    return categoriesBase.find(cat => cat.id === id)?.title || "";
  };

  const mainCount = useMemo(() => {
    return categoriesBase.filter(c => {
      const hasParent = c.parentCategory || (Array.isArray(c.parentCategories) && c.parentCategories.length > 0);
      return !hasParent || c.isAlwaysMain;
    }).length;
  }, [categoriesBase]);

  const categoriesFiltered = useMemo(() => {
    let list = categoriesBase;
    if (activeTab === 'main') {
      list = list.filter(c => {
        const hasParent = c.parentCategory || (Array.isArray(c.parentCategories) && c.parentCategories.length > 0);
        return !hasParent || c.isAlwaysMain;
      });
    }
    if (!searchTerm) return list;
    const lower = searchTerm.trim().toLowerCase();
    return list.filter(c =>
      c.title?.toLowerCase().includes(lower) ||
      c.slug?.toLowerCase().includes(lower)
    );
  }, [categoriesBase, searchTerm, activeTab]);

  const editing = useMemo(() => categoriesBase.find((c) => c.id === editingId) || null, [categoriesBase, editingId]);

  // Load all active states from Geographic Management
  const fetchStates = async () => {
    try {
      setLoadingStates(true);
      setGeoError("");
      const res = await stateService.getAll();
      if (res.success && Array.isArray(res.states)) {
        setGeoStates(res.states.filter(s => s.isActive !== false));
      }
    } catch (err) {
      console.error("Failed to load states:", err);
      setGeoError("Failed to load geographic states. Please try again.");
    } finally {
      setLoadingStates(false);
    }
  };

  // Load all active districts from Geographic Management
  const fetchDistricts = async () => {
    try {
      setLoadingDistricts(true);
      setGeoError("");
      const res = await districtService.getAll();
      if (res.success && Array.isArray(res.districts)) {
        setGeoDistricts(res.districts.filter(d => d.isActive !== false));
      }
    } catch (err) {
      console.error("Failed to load districts:", err);
      setGeoError("Failed to load geographic districts. Please try again.");
    } finally {
      setLoadingDistricts(false);
    }
  };

  // Load all active sub-districts from Geographic Management
  const fetchSubDistricts = async () => {
    try {
      setLoadingSubDistricts(true);
      setGeoError("");
      const res = await subDistrictService.getAll();
      if (res.success && Array.isArray(res.subDistricts)) {
        setGeoSubDistricts(res.subDistricts.filter(sd => sd.isActive !== false));
      }
    } catch (err) {
      console.error("Failed to load sub-districts:", err);
      setGeoError("Failed to load geographic sub-districts. Please try again.");
    } finally {
      setLoadingSubDistricts(false);
    }
  };

  // Display label helpers
  const getDistrictDisplayLabel = (district) => {
    const stateName = district.stateId?.name || district.stateName || 'State';
    return `${district.name} — ${stateName}`;
  };

  const getSubDistrictDisplayLabel = (subDistrict) => {
    const districtName = subDistrict.districtId?.name || subDistrict.districtName || 'District';
    const stateName = subDistrict.stateId?.name || subDistrict.districtId?.stateId?.name || subDistrict.stateName || 'State';
    return `${subDistrict.name} — ${districtName}, ${stateName}`;
  };

  // Scope change handler with automatic stale ID clearance
  const handleScopeChange = (newScope) => {
    setGeoSearchFilter("");
    setForm(prev => {
      if (newScope === 'GLOBAL_INDIA' || newScope === 'GLOBAL') {
        return { ...prev, scope: 'GLOBAL_INDIA', stateId: "", districtId: "", subDistrictId: "" };
      }
      if (newScope === 'STATE') {
        return { ...prev, scope: 'STATE', districtId: "", subDistrictId: "" };
      }
      if (newScope === 'DISTRICT') {
        return { ...prev, scope: 'DISTRICT', stateId: "", districtId: "", subDistrictId: "" };
      }
      if (newScope === 'SUB_DISTRICT') {
        return { ...prev, scope: 'SUB_DISTRICT', stateId: "", districtId: "", subDistrictId: "" };
      }
      return { ...prev, scope: newScope };
    });

    if (newScope === 'STATE' && geoStates.length === 0) fetchStates();
    if (newScope === 'DISTRICT' && geoDistricts.length === 0) fetchDistricts();
    if (newScope === 'SUB_DISTRICT' && geoSubDistricts.length === 0) fetchSubDistricts();
  };

  // Direct state selection handler
  const handleDirectStateSelect = (selectedStateId) => {
    setForm(prev => ({
      ...prev,
      stateId: selectedStateId,
      districtId: "",
      subDistrictId: ""
    }));
  };

  // Direct district selection handler with automatic parent state resolution
  const handleDirectDistrictSelect = (selectedDistrictId) => {
    if (!selectedDistrictId) {
      setForm(prev => ({ ...prev, districtId: "", stateId: "", subDistrictId: "" }));
      return;
    }
    const district = geoDistricts.find(d => (d._id || d.id) === selectedDistrictId);
    const resolvedStateId = district?.stateId?._id || district?.stateId || "";
    setForm(prev => ({
      ...prev,
      districtId: selectedDistrictId,
      stateId: resolvedStateId,
      subDistrictId: ""
    }));
  };

  // Direct sub-district selection handler with automatic parent district and state resolution
  const handleDirectSubDistrictSelect = (selectedSubDistrictId) => {
    if (!selectedSubDistrictId) {
      setForm(prev => ({ ...prev, subDistrictId: "", districtId: "", stateId: "" }));
      return;
    }
    const subDistrict = geoSubDistricts.find(sd => (sd._id || sd.id) === selectedSubDistrictId);
    const resolvedDistrictId = subDistrict?.districtId?._id || subDistrict?.districtId || "";
    const resolvedStateId = subDistrict?.stateId?._id || subDistrict?.stateId || subDistrict?.districtId?.stateId?._id || subDistrict?.districtId?.stateId || "";
    setForm(prev => ({
      ...prev,
      subDistrictId: selectedSubDistrictId,
      districtId: resolvedDistrictId,
      stateId: resolvedStateId
    }));
  };

  // Resolved geographic entities for confirmation badges
  const resolvedDistrictObject = useMemo(() => {
    if (!form.districtId) return null;
    return geoDistricts.find(d => (d._id || d.id) === form.districtId) || null;
  }, [form.districtId, geoDistricts]);

  const resolvedSubDistrictObject = useMemo(() => {
    if (!form.subDistrictId) return null;
    return geoSubDistricts.find(sd => (sd._id || sd.id) === form.subDistrictId) || null;
  }, [form.subDistrictId, geoSubDistricts]);

  const resolvedDistrictStateName = useMemo(() => {
    if (resolvedDistrictObject?.stateId?.name) return resolvedDistrictObject.stateId.name;
    if (resolvedDistrictObject?.stateName) return resolvedDistrictObject.stateName;
    if (editing?.state?.name) return editing.state.name;
    const parentState = geoStates.find(st => (st._id || st.id) === form.stateId);
    return parentState?.name || "";
  }, [resolvedDistrictObject, editing, geoStates, form.stateId]);

  const resolvedSubDistrictNames = useMemo(() => {
    const dName = resolvedSubDistrictObject?.districtId?.name || resolvedSubDistrictObject?.districtName || editing?.district?.name || "";
    const sName = resolvedSubDistrictObject?.stateId?.name || resolvedSubDistrictObject?.districtId?.stateId?.name || resolvedSubDistrictObject?.stateName || editing?.state?.name || "";
    return { districtName: dName, stateName: sName };
  }, [resolvedSubDistrictObject, editing]);

  // Filtered lists for quick search in selectors
  const filteredGeoStates = useMemo(() => {
    if (!geoSearchFilter.trim() || form.scope !== 'STATE') return geoStates;
    const lower = geoSearchFilter.trim().toLowerCase();
    return geoStates.filter(st =>
      st.name?.toLowerCase().includes(lower) ||
      st.code?.toLowerCase().includes(lower)
    );
  }, [geoStates, geoSearchFilter, form.scope]);

  const filteredGeoDistricts = useMemo(() => {
    if (!geoSearchFilter.trim() || form.scope !== 'DISTRICT') return geoDistricts;
    const lower = geoSearchFilter.trim().toLowerCase();
    return geoDistricts.filter(dt => {
      const stateName = dt.stateId?.name || dt.stateName || '';
      return dt.name?.toLowerCase().includes(lower) || stateName.toLowerCase().includes(lower);
    });
  }, [geoDistricts, geoSearchFilter, form.scope]);

  const filteredGeoSubDistricts = useMemo(() => {
    if (!geoSearchFilter.trim() || form.scope !== 'SUB_DISTRICT') return geoSubDistricts;
    const lower = geoSearchFilter.trim().toLowerCase();
    return geoSubDistricts.filter(sd => {
      const districtName = sd.districtId?.name || sd.districtName || '';
      const stateName = sd.stateId?.name || sd.districtId?.stateId?.name || sd.stateName || '';
      return (
        sd.name?.toLowerCase().includes(lower) ||
        districtName.toLowerCase().includes(lower) ||
        stateName.toLowerCase().includes(lower)
      );
    });
  }, [geoSubDistricts, geoSearchFilter, form.scope]);

  const fetchCategories = async () => {
    try {
      setFetching(true);
      const params = { status: 'active' };
      if (searchTerm) params.search = searchTerm;

      const response = await categoryService.getAll(params);

      if (response.success && response.categories) {
        const mapped = response.categories.map(cat => ({
          id: (cat.id || cat._id?.$oid || cat._id)?.toString() || "",
          title: cat.title,
          slug: cat.slug,
          homeIconUrl: cat.homeIconUrl || "",
          homeBadge: cat.homeBadge || "",
          hasSaleBadge: cat.hasSaleBadge || false,
          showOnHome: cat.showOnHome !== false,
          homeOrder: cat.homeOrder || 0,
          parentCategory: getCategoryId(cat.parentCategory),
          parentCategories: Array.isArray(cat.parentCategories)
            ? cat.parentCategories
              .map(parent => ({
                id: getCategoryId(parent),
                title: getCategoryTitle(parent),
              }))
              .filter(parent => parent.id)
            : [],
          isAlwaysMain: !!cat.isAlwaysMain,
          trackingType: cat.trackingType || 'none',
          requiresDriver: cat.requiresDriver || false,
          sectionType: cat.sectionType || 'General',
          bookingType: cat.bookingType || 'VENDOR',
          scope: (!cat.scope || cat.scope === 'GLOBAL') ? 'GLOBAL_INDIA' : cat.scope,
          stateId: cat.stateId || null,
          state: cat.state || null,
          districtId: cat.districtId || null,
          district: cat.district || null,
          subDistrictId: cat.subDistrictId || null,
          subDistrict: cat.subDistrict || null
        }));

        setCatalog({ ...catalog, categories: mapped });
        saveCatalog({ ...catalog, categories: mapped });
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchStates();
    fetchDistricts();
    fetchSubDistricts();

    const fetchHomeData = async () => {
      try {
        const response = await homeContentService.get();
        if (response.success && response.homeContent) {
          setPremiumOfferings(response.homeContent.premiumOfferings || []);
        }
      } catch (e) { }
    };
    fetchHomeData();
  }, []);

  // Direct initialization for Edit Mode
  useEffect(() => {
    const initEditForm = async () => {
      if (!isModalOpen) return;

      if (!editing) {
        setForm({
          title: "", slug: "", homeIconUrl: "", homeBadge: "",
          hasSaleBadge: false, showOnHome: true, parentCategory: "",
          parentCategories: [], isAlwaysMain: false,
          trackingType: "none", requiresDriver: false,
          sectionType: "General", bookingType: "VENDOR",
          scope: "GLOBAL_INDIA", stateId: "", districtId: "", subDistrictId: ""
        });
        setGeoSearchFilter("");
        return;
      }

      // Initialize with existing category values
      const editScope = (!editing.scope || editing.scope === 'GLOBAL') ? 'GLOBAL_INDIA' : editing.scope;
      const targetStateId = editing.stateId || (editing.state?.id || editing.state?._id) || "";
      const targetDistrictId = editing.districtId || (editing.district?.id || editing.district?._id) || "";
      const targetSubDistrictId = editing.subDistrictId || (editing.subDistrict?.id || editing.subDistrict?._id) || "";

      setForm({
        title: editing.title || "",
        slug: editing.slug || "",
        homeIconUrl: editing.homeIconUrl || "",
        homeBadge: editing.homeBadge || "",
        hasSaleBadge: Boolean(editing.hasSaleBadge),
        showOnHome: editing.showOnHome !== false,
        parentCategory: editing.parentCategory || "",
        parentCategories: Array.isArray(editing.parentCategories)
          ? editing.parentCategories.map(parent => getCategoryId(parent)).filter(Boolean)
          : [],
        isAlwaysMain: !!editing.isAlwaysMain,
        trackingType: editing.trackingType || "none",
        requiresDriver: Boolean(editing.requiresDriver),
        sectionType: editing.sectionType || "General",
        bookingType: editing.bookingType || "VENDOR",
        scope: editScope,
        stateId: targetStateId,
        districtId: targetDistrictId,
        subDistrictId: targetSubDistrictId
      });
      setGeoSearchFilter("");

      // Ensure required geographic list is loaded for current scope
      if (editScope === 'STATE' && geoStates.length === 0) {
        fetchStates();
      } else if (editScope === 'DISTRICT' && geoDistricts.length === 0) {
        fetchDistricts();
      } else if (editScope === 'SUB_DISTRICT' && geoSubDistricts.length === 0) {
        fetchSubDistricts();
      }
    };

    initEditForm();
  }, [editingId, isModalOpen]);

  const reset = () => {
    setEditingId(null);
    setForm({
      title: "", slug: "", homeIconUrl: "", homeBadge: "",
      hasSaleBadge: false, showOnHome: true, parentCategory: "",
      parentCategories: [], isAlwaysMain: false,
      trackingType: "none", requiresDriver: false,
      sectionType: "General", bookingType: "VENDOR",
      scope: "GLOBAL_INDIA", stateId: "", districtId: "", subDistrictId: ""
    });
    setGeoSearchFilter("");
    setGeoError("");
    setIsModalOpen(false);
  };

  const normalizeCategory = (cat) => ({
    id: (cat.id || cat._id?.$oid || cat._id)?.toString() || "",
    title: cat.title,
    slug: cat.slug,
    homeIconUrl: cat.homeIconUrl || "",
    homeBadge: cat.homeBadge || "",
    hasSaleBadge: cat.hasSaleBadge || false,
    showOnHome: cat.showOnHome !== false,
    homeOrder: cat.homeOrder || 0,
    parentCategory: getCategoryId(cat.parentCategory),
    parentCategories: Array.isArray(cat.parentCategories)
      ? cat.parentCategories
        .map(parent => ({
          id: getCategoryId(parent),
          title: getCategoryTitle(parent),
        }))
        .filter(parent => parent.id)
      : [],
    isAlwaysMain: !!cat.isAlwaysMain,
    trackingType: cat.trackingType || 'none',
    requiresDriver: cat.requiresDriver || false,
    sectionType: cat.sectionType || 'General',
    bookingType: cat.bookingType || 'VENDOR',
    scope: (!cat.scope || cat.scope === 'GLOBAL') ? 'GLOBAL_INDIA' : cat.scope,
    stateId: cat.stateId || null,
    state: cat.state || null,
    districtId: cat.districtId || null,
    district: cat.district || null,
    subDistrictId: cat.subDistrictId || null,
    subDistrict: cat.subDistrict || null
  });

  const upsert = async () => {
    if (loadingStates && form.scope === 'STATE') {
      toast.error("Please wait for states to finish loading");
      return;
    }
    if (loadingDistricts && form.scope === 'DISTRICT') {
      toast.error("Please wait for districts to finish loading");
      return;
    }
    if (loadingSubDistricts && form.scope === 'SUB_DISTRICT') {
      toast.error("Please wait for sub-districts to finish loading");
      return;
    }

    const val = categorySchema.safeParse({
      ...form,
      title: form.title.trim(),
      slug: slugify(form.title.trim()),
      stateId: (form.scope === 'GLOBAL_INDIA' || form.scope === 'GLOBAL') ? null : (form.stateId || null),
      districtId: (form.scope === 'DISTRICT' || form.scope === 'SUB_DISTRICT') ? (form.districtId || null) : null,
      subDistrictId: form.scope === 'SUB_DISTRICT' ? (form.subDistrictId || null) : null,
    });

    if (!val.success) {
      toast.error(val.error.errors[0].message);
      return;
    }

    try {
      setLoading(true);
      const data = {
        ...val.data,
        parentCategories: form.parentCategories || [],
        homeOrder: editing?.homeOrder || 0,
        scope: form.scope || 'GLOBAL_INDIA',
        stateId: (form.scope === 'GLOBAL_INDIA' || form.scope === 'GLOBAL') ? null : (form.stateId || null),
        districtId: (form.scope === 'DISTRICT' || form.scope === 'SUB_DISTRICT') ? (form.districtId || null) : null,
        subDistrictId: form.scope === 'SUB_DISTRICT' ? (form.subDistrictId || null) : null,
      };

      if (!editing) {
        data.homeOrder = categoriesBase.length;
      }

      const response = editing
        ? await categoryService.update(editingId, data)
        : await categoryService.create(data);

      if (response.success) {
        if (response.category) {
          const normalizedCategory = normalizeCategory(response.category);
          const existingCategories = catalog.categories || [];
          const updatedCategories = editing
            ? existingCategories.map(category =>
              category.id === normalizedCategory.id ? normalizedCategory : category
            )
            : [normalizedCategory, ...existingCategories];

          const nextCatalog = { ...catalog, categories: updatedCategories };
          setCatalog(nextCatalog);
          saveCatalog(nextCatalog);
        }

        toast.success(editing ? "Category updated successfully" : "Category created successfully");
        fetchCategories();
        reset();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save category");
    } finally {
      setLoading(false);
    }
  };


  const remove = async (id) => {
    if (!window.confirm("Delete this category?")) return;
    try {
      setLoading(true);
      const res = await categoryService.delete(id);
      if (res.success) {
        toast.success("Deleted");
        fetchCategories();
      }
    } catch (error) {
      toast.error("Delete failed");
    } finally {
      setLoading(false);
    }
  };

  const moveOrder = async (id, newOrder) => {
    try {
      await categoryService.updateOrder(id, newOrder);
      fetchCategories();
    } catch (e) { toast.error("Move failed"); }
  };

  const handleToggleVisibility = async (id, nextState, title) => {
    // Optimistically update catalog
    setCatalog(prev => {
      const nextCats = (prev.categories || []).map(cat => 
        cat.id === id ? { ...cat, showOnHome: nextState } : cat
      );
      const next = { ...prev, categories: nextCats };
      saveCatalog(next);
      return next;
    });

    try {
      const res = await categoryService.update(id, { showOnHome: nextState });
      if (res.success) {
        toast.success(`"${title || 'Category'}" is now ${nextState ? 'visible on' : 'hidden from'} Homepage`);
      } else {
        // Revert
        setCatalog(prev => {
          const nextCats = (prev.categories || []).map(cat => 
            cat.id === id ? { ...cat, showOnHome: !nextState } : cat
          );
          const next = { ...prev, categories: nextCats };
          saveCatalog(next);
          return next;
        });
        toast.error(res.message || 'Failed to update visibility');
      }
    } catch (err) {
      console.error('Toggle visibility error:', err);
      // Revert
      setCatalog(prev => {
        const nextCats = (prev.categories || []).map(cat => 
          cat.id === id ? { ...cat, showOnHome: !nextState } : cat
        );
        const next = { ...prev, categories: nextCats };
        saveCatalog(next);
        return next;
      });
      toast.error('Failed to update visibility');
    }
  };

  const handleDragStart = (e, index) => { setDraggedItem(index); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === dropIndex) return;
    const newItems = [...categoriesFiltered];
    const [moved] = newItems.splice(draggedItem, 1);
    newItems.splice(dropIndex, 0, moved);

    try {
      await Promise.all(newItems.map((c, i) => categoryService.updateOrder(c.id, i)));
      fetchCategories();
      toast.success("Order saved");
    } catch (err) { toast.error("Save failed"); }
    setDraggedItem(null);
  };

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl shadow-sm border border-slate-100 min-h-[400px]">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-bold text-lg animate-pulse">Loading Categories...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CardShell icon={FiGrid}>
        <div className="flex flex-col gap-4 mb-4">
          {/* TAB SWITCHER */}
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <button
              onClick={() => setActiveTab('main')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'main'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🚜 Main Machinery ({mainCount})
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📑 All Categories ({categoriesBase.length})
            </button>
          </div>

          {activeTab === 'main' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <span>
                  Showing primary machines. Looking to manage <strong>implements & attachments</strong> (Rotavator, Trolley, Baler, Cultivator) with price caps?
                </span>
              </div>
              <a
                href="/admin/equipment-catalog/sections"
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md shrink-0 transition-colors"
              >
                Manage Equipment Types →
              </a>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 font-bold uppercase tracking-tight">{categoriesFiltered.length} Items</div>
            <button
              onClick={() => { reset(); setIsModalOpen(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 shrink-0 shadow-sm"
            >
              <FiPlus /> Add Category
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Search..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
              <button onClick={() => setShowReorderModal(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 shrink-0">
                <FiMove /> Reorder
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50/50">
                <th className="text-left py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest w-12">#</th>
                <th className="text-left py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest w-20">Icon</th>
                <th className="text-left py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest">Category Name</th>
                <th className="text-left py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest">Parent Categories</th>
                <th className="text-left py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest">Scope</th>
                <th className="text-left py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest">Section Tab</th>
                <th className="text-left py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest">Hierarchy</th>
                <th className="text-left py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest">Tracking</th>
                <th className="text-center py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest w-20">Sort</th>
                <th className="text-center py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest w-32">Home Display</th>
                <th className="text-center py-3 px-4 text-xs font-black text-gray-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categoriesFiltered.map((c, idx) => {
                const parents = Array.isArray(c.parentCategories)
                  ? c.parentCategories
                    .map(parent => ({
                      id: getCategoryId(parent),
                      title: getCategoryTitle(parent),
                    }))
                    .filter(parent => parent.id)
                  : [];
                const isSub = parents.length > 0;
                const children = categoriesBase.filter(child =>
                  Array.isArray(child.parentCategories) &&
                  child.parentCategories.some(parent => getCategoryId(parent) === c.id)
                );
                return (
                  <tr key={c.id} className={`hover:bg-blue-50/30 transition-colors ${isSub ? 'bg-slate-50/30' : 'bg-white'}`}>
                    <td className="py-4 px-4 text-sm font-bold text-gray-400">{idx + 1}</td>
                    <td className="py-4 px-4">
                      {c.homeIconUrl ? (
                        <img src={toAssetUrl(c.homeIconUrl)} className="h-10 w-10 object-contain rounded bg-white shadow-sm border p-1" />
                      ) : <div className="h-10 w-10 bg-gray-100 rounded border border-dashed" />}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className={`text-sm font-black tracking-tight ${isSub ? 'text-blue-600' : 'text-gray-900'}`}>
                          {isSub && <span className="text-gray-300 mr-1">↳</span>}
                          {c.title}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{c.slug}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1.5">
                        {parents.length > 0 ? (
                          <>
                            <div className="flex flex-wrap gap-1">
                              {parents.map(parent => (
                                <span key={parent.id} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-black border border-blue-200">
                                  {parent.title}
                                </span>
                              ))}
                            </div>
                            <span className="text-[10px] text-slate-500 font-bold">
                              {parents.map(parent => parent.title).filter(Boolean).join(", ")}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-bold uppercase italic">No Parent</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        {(!c.scope || c.scope === 'GLOBAL' || c.scope === 'GLOBAL_INDIA') ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-black border border-emerald-200 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            GLOBAL (ALL INDIA)
                          </span>
                        ) : c.scope === 'STATE' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-black border border-blue-200 w-fit">
                              STATE
                            </span>
                            <span className="text-[11px] font-bold text-slate-800">
                              {c.state?.name || (typeof c.stateId === 'string' ? 'Assigned State' : c.stateId?.name) || 'State Specific'}
                            </span>
                          </div>
                        ) : c.scope === 'DISTRICT' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-black border border-amber-200 w-fit">
                              DISTRICT
                            </span>
                            <span className="text-[11px] font-bold text-slate-800">
                              {c.district?.name || (typeof c.districtId === 'string' ? 'Assigned District' : c.districtId?.name) || 'District Specific'}
                            </span>
                            {(c.state?.name || c.stateId?.name) && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                ({c.state?.name || c.stateId?.name})
                              </span>
                            )}
                          </div>
                        ) : c.scope === 'SUB_DISTRICT' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-black border border-purple-200 w-fit">
                              SUB-DISTRICT
                            </span>
                            <span className="text-[11px] font-bold text-slate-800">
                              {c.subDistrict?.name || (typeof c.subDistrictId === 'string' ? 'Assigned Sub-District' : c.subDistrictId?.name) || 'Sub-District Specific'}
                            </span>
                            {(c.district?.name || c.districtId?.name || c.state?.name || c.stateId?.name) && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                ({[c.district?.name || c.districtId?.name, c.state?.name || c.stateId?.name].filter(Boolean).join(', ')})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block whitespace-nowrap px-2 py-1 bg-gray-50 text-gray-700 rounded text-[10px] font-black border border-gray-200 w-fit">
                            {c.scope}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-block whitespace-nowrap px-2 py-1 bg-purple-50 text-purple-700 rounded text-[10px] font-black border border-purple-200">
                        {c.sectionType || 'General'}
                      </span>
                    </td>
                    <td className="py-4 px-4 max-w-[280px]">
                      <div className="flex flex-col gap-1.5">
                        {isSub ? (
                          <>
                            <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded text-[10px] font-black border border-sky-200 inline-block w-fit">SUB CATEGORY</span>
                            {c.isAlwaysMain && <span className="text-[9px] text-cyan-600 font-black uppercase italic">★ Featured in Main</span>}
                          </>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-black border border-green-200 inline-block w-fit">MAIN CATEGORY</span>
                        )}
                        {!isSub && (
                          children.length > 0 ? (
                            <div className="mt-1 flex flex-col gap-1">
                              <span className="text-[9px] text-gray-400 font-black uppercase tracking-wider">SUB CATEGORIES</span>
                              <div className="text-[11px] font-semibold text-slate-700 leading-snug break-words">
                                {children.slice(0, 3).map((child, i) => (
                                  <React.Fragment key={child.id || i}>
                                    {i > 0 && <span className="text-slate-300 mx-1.5 font-bold">•</span>}
                                    <span className="hover:text-blue-600 transition-colors inline" title={child.title}>
                                      {child.title}
                                    </span>
                                  </React.Fragment>
                                ))}
                              </div>
                              {children.length > 3 && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[10px] font-bold text-slate-500">
                                    +{children.length - 3} more
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openSubCategoriesModal(c, children)}
                                    className="text-[10px] font-black text-blue-600 hover:text-blue-800 hover:underline cursor-pointer bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-all"
                                  >
                                    [View All]
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic mt-0.5">No sub-categories</span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded w-fit ${c.trackingType === 'timestamp' ? 'bg-indigo-100 text-indigo-700' : c.trackingType === 'odometer' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                          {c.trackingType?.toUpperCase() || 'NONE'}
                        </span>
                        {c.requiresDriver && <span className="text-[9px] text-rose-600 font-black uppercase">● Driver Required</span>}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => moveOrder(c.id, idx - 1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-20"><FiChevronUp /></button>
                        <button onClick={() => moveOrder(c.id, idx + 1)} disabled={idx === categoriesFiltered.length - 1} className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-20"><FiChevronDown /></button>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <ToggleSwitch
                          checked={c.showOnHome !== false}
                          onChange={(newVal) => handleToggleVisibility(c.id, newVal, c.title)}
                        />
                        <span className={`text-[10px] font-black uppercase tracking-wider ${c.showOnHome !== false ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {c.showOnHome !== false ? 'Visible' : 'Hidden'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => { setEditingId(c.id); setIsModalOpen(true); }} className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"><FiEdit2 /></button>
                        <button onClick={() => remove(c.id)} className="p-1.5 bg-rose-50 text-rose-600 rounded hover:bg-rose-100"><FiTrash2 /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardShell>

      <Modal isOpen={isModalOpen} onClose={reset} title={editing ? "Edit Category" : "Add Category"} size="lg">
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-base font-bold text-gray-900 mb-2">Title</label>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="e.g. Tractor, Rotavator"
              />
            </div>
            <div>
              <label className="block text-base font-bold text-gray-900 mb-2">Parent Categories (Select multiple)</label>
              <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-xl p-3 bg-white space-y-2">
                {categoriesBase
                  .filter(c => c.id !== editingId && (!c.parentCategories || c.parentCategories.length === 0))
                  .map(c => (
                    <label key={c.id} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={form.parentCategories.includes(c.id)}
                        onChange={e => {
                          const checked = e.target.checked;
                          setForm(p => ({
                            ...p,
                            parentCategories: checked ? [...p.parentCategories, c.id] : p.parentCategories.filter(id => id !== c.id)
                          }));
                        }}
                      />
                      <span className="text-sm font-semibold text-gray-700 group-hover:text-primary-600">{c.title}</span>
                    </label>
                  ))}
                {categoriesBase.filter(c => c.id !== editingId && (!c.parentCategories || c.parentCategories.length === 0)).length === 0 && (
                  <p className="text-xs text-gray-400 italic">No main categories available</p>
                )}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">If none selected, this will be a Main Category.</p>
            </div>
          </div>

          {/* Geographic Scope Management */}
          <div className="bg-slate-50/90 p-5 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-bold text-gray-900">
                  Geographic Scope <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select the operational coverage territory for this category.
                </p>
              </div>
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase border ${
                form.scope === 'GLOBAL_INDIA' || form.scope === 'GLOBAL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                form.scope === 'STATE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                form.scope === 'DISTRICT' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                'bg-purple-50 text-purple-700 border-purple-200'
              }`}>
                {form.scope === 'GLOBAL_INDIA' || form.scope === 'GLOBAL' ? 'All India' : form.scope.replace('_', ' ')}
              </span>
            </div>

            {/* Scope Level Selector */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Scope Level
              </label>
              <select
                value={form.scope === 'GLOBAL' ? 'GLOBAL_INDIA' : form.scope}
                onChange={e => handleScopeChange(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="GLOBAL_INDIA">Global (All India)</option>
                <option value="STATE">State Specific</option>
                <option value="DISTRICT">District Specific</option>
                <option value="SUB_DISTRICT">Sub-District Specific</option>
              </select>
            </div>

            {/* Geographic Error Alert */}
            {geoError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
                <span>{geoError}</span>
                <button
                  type="button"
                  onClick={() => {
                    fetchStates();
                    fetchDistricts();
                    fetchSubDistricts();
                  }}
                  className="text-xs font-bold text-rose-800 underline hover:no-underline ml-2"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Global Info Box */}
            {(form.scope === 'GLOBAL_INDIA' || form.scope === 'GLOBAL') && (
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0"></span>
                <div>
                  <span className="font-bold">Global All-India Scope:</span> This category will be available across all states, districts, and territories in India. No territorial restrictions apply.
                </div>
              </div>
            )}

            {/* STATE SPECIFIC SELECTOR */}
            {form.scope === 'STATE' && (
              <div className="space-y-3 pt-2 border-t border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Select State <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {filteredGeoStates.length} state(s) available
                  </span>
                </div>
                {geoStates.length > 5 && (
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-2.5 text-gray-400 w-3.5 h-3.5" />
                    <input
                      type="text"
                      placeholder="Search state by name or code..."
                      value={geoSearchFilter}
                      onChange={e => setGeoSearchFilter(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    {geoSearchFilter && (
                      <button
                        type="button"
                        onClick={() => setGeoSearchFilter("")}
                        className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 p-0.5"
                      >
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
                <div className="relative">
                  <select
                    value={form.stateId || ""}
                    onChange={e => handleDirectStateSelect(e.target.value)}
                    disabled={loadingStates}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {loadingStates ? "Loading states..." : "-- Choose State --"}
                    </option>
                    {filteredGeoStates.map(st => (
                      <option key={st._id || st.id} value={st._id || st.id}>
                        {st.name} {st.code ? `(${st.code})` : ''}
                      </option>
                    ))}
                    {form.stateId && !filteredGeoStates.some(st => (st._id || st.id) === form.stateId) && (
                      <option value={form.stateId}>
                        {editing?.state?.name || `Selected State (${form.stateId})`}
                      </option>
                    )}
                  </select>
                  {loadingStates && (
                    <div className="absolute right-3 top-3">
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                {geoStates.length === 0 && !loadingStates && (
                  <p className="text-[11px] text-amber-600 mt-1">No active states available in Geographic Management.</p>
                )}
              </div>
            )}

            {/* DISTRICT SPECIFIC SELECTOR (Direct with auto-resolved parent State) */}
            {form.scope === 'DISTRICT' && (
              <div className="space-y-3 pt-2 border-t border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Select District <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {filteredGeoDistricts.length} district(s) available
                  </span>
                </div>
                <div className="relative">
                  <FiSearch className="absolute left-3 top-2.5 text-gray-400 w-3.5 h-3.5" />
                  <input
                    type="text"
                    placeholder="Search district by name or state (e.g. Indore, Bhopal)..."
                    value={geoSearchFilter}
                    onChange={e => setGeoSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {geoSearchFilter && (
                    <button
                      type="button"
                      onClick={() => setGeoSearchFilter("")}
                      className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={form.districtId || ""}
                    onChange={e => handleDirectDistrictSelect(e.target.value)}
                    disabled={loadingDistricts}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {loadingDistricts ? "Loading districts..." : "-- Choose District --"}
                    </option>
                    {filteredGeoDistricts.map(dt => (
                      <option key={dt._id || dt.id} value={dt._id || dt.id}>
                        {getDistrictDisplayLabel(dt)}
                      </option>
                    ))}
                    {form.districtId && !filteredGeoDistricts.some(dt => (dt._id || dt.id) === form.districtId) && (
                      <option value={form.districtId}>
                        {editing?.district?.name ? `${editing.district.name} — ${editing.state?.name || 'State'}` : `Selected District (${form.districtId})`}
                      </option>
                    )}
                  </select>
                  {loadingDistricts && (
                    <div className="absolute right-3 top-3">
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                {form.districtId && resolvedDistrictStateName && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 shadow-xs">
                    <FiMapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      Auto-resolved Parent State: <strong className="font-bold text-amber-950">{resolvedDistrictStateName}</strong>
                    </span>
                  </div>
                )}
                {geoDistricts.length === 0 && !loadingDistricts && (
                  <p className="text-[11px] text-amber-600 mt-1">No active districts available in Geographic Management.</p>
                )}
              </div>
            )}

            {/* SUB-DISTRICT SPECIFIC SELECTOR (Direct with auto-resolved parent District & State) */}
            {form.scope === 'SUB_DISTRICT' && (
              <div className="space-y-3 pt-2 border-t border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Select Sub-District <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {filteredGeoSubDistricts.length} sub-district(s) available
                  </span>
                </div>
                <div className="relative">
                  <FiSearch className="absolute left-3 top-2.5 text-gray-400 w-3.5 h-3.5" />
                  <input
                    type="text"
                    placeholder="Search sub-district, district, or state (e.g. Depalpur, Indore)..."
                    value={geoSearchFilter}
                    onChange={e => setGeoSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {geoSearchFilter && (
                    <button
                      type="button"
                      onClick={() => setGeoSearchFilter("")}
                      className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={form.subDistrictId || ""}
                    onChange={e => handleDirectSubDistrictSelect(e.target.value)}
                    disabled={loadingSubDistricts}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {loadingSubDistricts ? "Loading sub-districts..." : "-- Choose Sub-District --"}
                    </option>
                    {filteredGeoSubDistricts.map(sd => (
                      <option key={sd._id || sd.id} value={sd._id || sd.id}>
                        {getSubDistrictDisplayLabel(sd)}
                      </option>
                    ))}
                    {form.subDistrictId && !filteredGeoSubDistricts.some(sd => (sd._id || sd.id) === form.subDistrictId) && (
                      <option value={form.subDistrictId}>
                        {editing?.subDistrict?.name ? `${editing.subDistrict.name} — ${editing.district?.name || 'District'}, ${editing.state?.name || 'State'}` : `Selected Sub-District (${form.subDistrictId})`}
                      </option>
                    )}
                  </select>
                  {loadingSubDistricts && (
                    <div className="absolute right-3 top-3">
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                {form.subDistrictId && (resolvedSubDistrictNames.districtName || resolvedSubDistrictNames.stateName) && (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-purple-50/90 border border-purple-200 rounded-xl text-xs text-purple-900 shadow-xs">
                    <FiMapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>
                      Auto-resolved Hierarchy: <strong className="font-bold text-purple-950">{[resolvedSubDistrictNames.districtName, resolvedSubDistrictNames.stateName].filter(Boolean).join(", ")}</strong>
                    </span>
                  </div>
                )}
                {geoSubDistricts.length === 0 && !loadingSubDistricts && (
                  <p className="text-[11px] text-amber-600 mt-1">No active sub-districts available in Geographic Management.</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-base font-bold text-gray-900">Category Status</label>
                <p className="text-[11px] text-gray-500 leading-tight mt-0.5">Control if this category/subcategory is visible to Vendors and Farmers.</p>
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-300 shadow-sm">
                <input
                  type="checkbox"
                  id="showOnHome"
                  checked={form.showOnHome}
                  onChange={e => setForm({ ...form, showOnHome: e.target.checked })}
                  className="h-5 w-5 accent-emerald-500 cursor-pointer"
                />
                <label htmlFor="showOnHome" className={`text-sm font-black uppercase cursor-pointer ${form.showOnHome ? 'text-emerald-600' : 'text-gray-500'}`}>
                  {form.showOnHome ? 'Visible' : 'Hidden'}
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="alwaysMain"
                checked={form.isAlwaysMain}
                onChange={e => setForm({ ...form, isAlwaysMain: e.target.checked })}
                className="h-4 w-4 accent-primary-600"
              />
              <label htmlFor="alwaysMain" className="text-base font-bold text-gray-900">Always show in Main List</label>
            </div>
            <p className="text-[11px] text-gray-400 leading-tight pl-7">Useful for tools like "Rotavator" that should be visible even when they are sub-categories.</p>
          </div>

          <div>
            <label className="block text-base font-bold text-gray-900 mb-2">Home Page Tab Section</label>
            <select
              value={form.sectionType}
              onChange={e => setForm({ ...form, sectionType: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold"
            >
              <option value="General">General (Default scrolling list)</option>
              {premiumOfferings
                .filter(o => o.actionPayload || o.title)
                .filter(o => {
                  const sectionName = (o.actionPayload || o.title || '').toLowerCase();
                  return sectionName !== 'drone spraying' && sectionName !== 'dronespraying';
                })
                .map(o => {
                  const sectionName = o.actionPayload || o.title;
                  return <option key={o._id || o.id} value={sectionName}>{o.title} - ({sectionName})</option>
                })}
            </select>
          </div>

          <div>
            <label className="block text-base font-bold text-gray-900 mb-2">Home Icon</label>
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 bg-gray-50/30">
              <div className="flex flex-col items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async e => {
                    const f = e.target.files[0];
                    if (!f) return;
                    setUploadingIcon(true);
                    const res = await serviceService.uploadImage(f, 'categories');
                    if (res.success) setForm({ ...form, homeIconUrl: res.imageUrl });
                    setUploadingIcon(false);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
                />
                {uploadingIcon && <p className="text-xs text-primary-600 font-bold animate-pulse">Uploading...</p>}
                {form.homeIconUrl && (
                  <div className="relative group mt-2">
                    <img src={toAssetUrl(form.homeIconUrl)} className="h-20 w-20 object-contain bg-white rounded-xl shadow-sm border border-gray-200 p-2" />
                    <button onClick={() => setForm({ ...form, homeIconUrl: "" })} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"><FiX /></button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-orange-50/50 p-5 rounded-2xl border border-orange-100 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-orange-700 uppercase tracking-wider">⚙ Machinery Classification</span>
            </div>
            <p className="text-xs text-orange-600 font-medium">Only set this for Equipment Catalog categories. Leave as "None" for Soil Testing or E-commerce.</p>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-orange-700 mb-1 uppercase tracking-tighter">Tracking Type</label>
                <select
                  value={form.trackingType}
                  onChange={e => setForm({ ...form, trackingType: e.target.value })}
                  className="w-full text-sm font-bold p-3 rounded-xl border border-orange-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="none">None (Default - Not a Machine)</option>
                  <option value="odometer">Odometer (Moving Machine - Tractor/Harvester)</option>
                  <option value="timestamp">Timestamp (Static Tool - Pump/Sprayer)</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-5">
                <input
                  id="reqDriver"
                  type="checkbox"
                  checked={form.requiresDriver}
                  onChange={e => setForm({ ...form, requiresDriver: e.target.checked })}
                  className="h-5 w-5 accent-orange-500"
                />
                <label htmlFor="reqDriver" className="text-sm font-bold text-orange-800 uppercase cursor-pointer">Requires registered Driver/Operator</label>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              onClick={upsert}
              disabled={loading}
              className="flex-1 py-4 bg-primary-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl shadow-primary-200 hover:bg-primary-700 hover:shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : <FiSave className="w-5 h-5" />}
              {loading ? "SAVING..." : (editing ? "Update Category" : "Add Category")}
            </button>
            <button onClick={reset} className="px-8 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showReorderModal} onClose={() => setShowReorderModal(false)} title="Reorder Categories">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {categoriesFiltered.map((c, i) => (
            <div key={c.id} draggable onDragStart={e => handleDragStart(e, i)} onDragOver={handleDragOver} onDrop={e => handleDrop(e, i)} className={`p-3 border rounded-lg bg-white flex items-center justify-between cursor-move hover:border-blue-300 ${draggedItem === i ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-gray-300">#{i + 1}</span>
                <span className="text-sm font-black uppercase">{c.title}</span>
              </div>
              <FiMove className="text-gray-400" />
            </div>
          ))}
        </div>
      </Modal>

      {/* View All Sub-Categories Modal */}
      <Modal
        isOpen={viewAllSubCatsModal.isOpen}
        onClose={() => setViewAllSubCatsModal({ isOpen: false, category: null, subCategories: [] })}
        size="md"
        title={
          <div>
            <h3 className="text-lg font-bold text-gray-900 leading-tight">
              {viewAllSubCatsModal.category?.title} Sub Categories
            </h3>
            <p className="text-xs font-semibold text-gray-500 mt-0.5">
              {viewAllSubCatsModal.subCategories.length} sub-categories
            </p>
          </div>
        }
      >
        <div className="space-y-3">
          {/* Search bar */}
          <div className="relative">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search sub-category..."
              value={subCategorySearchTerm}
              onChange={(e) => setSubCategorySearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-blue-500 transition-all"
              autoFocus
            />
            {subCategorySearchTerm && (
              <button
                type="button"
                onClick={() => setSubCategorySearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                aria-label="Clear search"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sub-category list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
            {filteredModalSubCats.length > 0 ? (
              filteredModalSubCats.map((sub, sIdx) => (
                <div
                  key={sub.id || sIdx}
                  className="p-3 flex items-center justify-between hover:bg-blue-50/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-gray-400 w-5 shrink-0">
                      {sIdx + 1}.
                    </span>
                    {sub.homeIconUrl ? (
                      <img 
                        src={toAssetUrl(sub.homeIconUrl)} 
                        alt="" 
                        className="w-8 h-8 object-contain rounded-lg bg-white border border-gray-100 p-0.5 shadow-2xs shrink-0" 
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate" title={sub.title}>
                        {sub.title}
                      </p>
                      {sub.slug && (
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate">
                          {sub.slug}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    {sub.isAlwaysMain && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-100">
                        Main List
                      </span>
                    )}
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                      sub.showOnHome !== false 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {sub.showOnHome !== false ? 'Active' : 'Hidden'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm font-bold text-gray-500">No matching sub-categories found.</p>
                <p className="text-xs text-gray-400 mt-1">Try searching with a different term.</p>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CategoriesPage;
