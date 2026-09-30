import React, { useState, useEffect, useMemo } from "react";
import { FiGrid, FiPlus, FiEdit2, FiTrash2, FiPackage, FiSearch } from "react-icons/fi";
import { toast } from "react-hot-toast";
import CardShell from "../components/CardShell";
import Modal from "../components/Modal";
import { ensureIds, saveCatalog, toAssetUrl } from "../utils";
import { serviceService, categoryService } from "../../../../../services/catalogService";
import { z } from "zod";

// Schema for Service Entity
const serviceSchema = z.object({
  title: z.string().min(2, "Title is required"),
  basePrice: z.number().optional(),
  gstPercentage: z.number().min(0).max(100).default(18),
  categoryId: z.string().min(1, "Category is required"),
  hourly_price: z.number().optional(),
  land_price: z.number().optional(),
  land_unit: z.string().min(1, 'Unit required').default('acre'),
  daily_price: z.number().optional(),
  pricing_context: z.enum(['standalone', 'sub-category', 'any']).default('any'),
  parentSourceId: z.string().nullable().optional()
});

const ServicesPage = ({ catalog, setCatalog, selectedCity }) => {
  const [fetching, setFetching] = useState(false);
  const categories = catalog.categories || [];

  // Filter only Main Machinery categories (excluding subcategory implements)
  const mainCategories = useMemo(() => {
    return categories.filter(c => {
      const hasParent = c.parentCategory || (Array.isArray(c.parentCategories) && c.parentCategories.length > 0);
      return !hasParent;
    });
  }, [categories]);

  // Selected Category State
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const activeCategory = mainCategories.find(c => c.id === activeCategoryId) || null;

  // Services List State
  const [categoryServices, setCategoryServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch data on mount or city change
  useEffect(() => {
    const fetchData = async () => {
      try {
        setFetching(true);

        const params = { status: 'active' };
        if (selectedCity) params.cityId = selectedCity;

        const categoriesRes = await categoryService.getAll(params);

        let mappedCategories = [];

        if (categoriesRes.success) {
          mappedCategories = categoriesRes.categories.map(cat => ({
            id: (cat.id || cat._id?.$oid || cat._id) ?.toString() || "",
            title: cat.title,
            slug: cat.slug,
            icon: cat.icon || "",
            parentCategories: Array.isArray(cat.parentCategories) ? cat.parentCategories.map(p => (p._id || p.id || p).toString()) : [],
            parentCategory: (cat.parentCategory?._id || cat.parentCategory?.id || cat.parentCategory) ?.toString() || ""
          }));
        }

        setCatalog(prev => {
          const next = { ...prev, categories: mappedCategories };
          saveCatalog(next);
          return next;
        });

      } catch (error) {
        console.error('Failed to fetch catalog data:', error);
        toast.error(`Failed to load data: ${error.response?.data?.message || error.message}`);
      } finally {
        setFetching(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  // Auto-select first Category
  useEffect(() => {
    if (mainCategories.length > 0) {
      if (!activeCategoryId || !mainCategories.find(c => c.id === activeCategoryId)) {
        setActiveCategoryId(mainCategories[0].id);
      }
    } else {
      setActiveCategoryId(null);
      setCategoryServices([]);
    }
  }, [mainCategories, activeCategoryId]);

  // Fetch Services when Active Category Changes
  useEffect(() => {
    const fetchServices = async () => {
      if (!activeCategoryId) return;

      try {
        setLoadingServices(true);
        const response = await serviceService.getAll({ categoryId: activeCategoryId });
        if (response.success) {
          setCategoryServices(response.services || []);
        } else {
          setCategoryServices([]);
        }
      } catch (error) {
        console.error("Failed to fetch services:", error);
        toast.error("Failed to load services");
      } finally {
        setLoadingServices(false);
      }
    };

    fetchServices();
  }, [activeCategoryId]);

  // Form State
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
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
  const [saving, setSaving] = useState(false);

  // Form Actions
  const resetForm = () => {
    setEditingId(null);
    setForm({
      title: "",
      basePrice: "",
      gstPercentage: 18,
      categoryId: activeCategoryId || "",
      hourly_price: "",
      land_price: "",
      land_unit: "acre",
      daily_price: "",
      pricing_context: "any",
      parentSourceId: ""
    });
    setIsModalOpen(false);
  };

  const handleEdit = (s) => {
    setEditingId(s.id || s._id);
    setForm({
      title: s.title,
      basePrice: s.basePrice || "",
      gstPercentage: s.gstPercentage || 18,
      categoryId: String(s.categoryId?._id || s.categoryId),
      hourly_price: s.hourly_price || "",
      land_price: s.land_price || "",
      land_unit: s.land_unit || "acre",
      daily_price: s.daily_price || "",
      pricing_context: s.pricing_context || "any",
      parentSourceId: s.parentSourceId || ""
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!activeCategoryId) return;

    const data = {
      title: form.title,
      basePrice: parseFloat(form.hourly_price) || parseFloat(form.daily_price) || parseFloat(form.land_price) || 0,
      gstPercentage: parseFloat(form.gstPercentage) || 18,
      categoryId: form.categoryId,
      hourly_price: parseFloat(form.hourly_price) || 0,
      land_price: parseFloat(form.land_price) || 0,
      land_unit: form.land_unit,
      daily_price: parseFloat(form.daily_price) || 0,
      pricing_context: form.pricing_context,
      parentSourceId: form.parentSourceId || null
    };

    const result = serviceSchema.safeParse(data);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        const response = await serviceService.update(editingId, result.data);
        if (response.success) {
          toast.success("Equipment updated");
          setCategoryServices(prev => prev.map(s => (s.id === editingId || s._id === editingId ? { ...s, ...result.data, categoryId: result.data.categoryId } : s)));
          resetForm();
          const reloadRes = await serviceService.getAll({ categoryId: activeCategoryId });
          if (reloadRes.success) setCategoryServices(reloadRes.services);
        }
      } else {
        const response = await serviceService.create(result.data);
        if (response.success) {
          toast.success("Equipment created");
          setCategoryServices(prev => [response.service || response.data, ...prev]);
          resetForm();
          const reloadRes = await serviceService.getAll({ categoryId: activeCategoryId });
          if (reloadRes.success) setCategoryServices(reloadRes.services);
        }
      }
    } catch (error) {
      console.error("Save service error:", error);
      toast.error(error.response?.data?.message || "Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this equipment?")) return;
    try {
      await serviceService.delete(id);
      toast.success("Equipment deleted");
      setCategoryServices(prev => prev.filter(s => (s.id !== id && s._id !== id)));
    } catch (error) {
      console.error("Delete service error:", error);
      toast.error("Failed to delete service");
    }
  };

  // Filtered Services List based on search
  const displayedServices = useMemo(() => {
    let result = categoryServices;
    if (!searchTerm) return result;
    const lower = searchTerm.trim().toLowerCase();
    return result.filter(s => s.title.toLowerCase().includes(lower));
  }, [categoryServices, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* LEFT COLUMN: LIST OF CATEGORIES */}
        <div className="lg:col-span-1">
          <CardShell icon={FiGrid} title={`Select Machine (${mainCategories.length})`}>
            <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
              {fetching ? (
                <div className="text-center py-8 text-sm text-gray-500 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                  Loading categories...
                </div>
              ) : mainCategories.length === 0 ? (
                <div className="text-center text-gray-400 py-4 text-sm">No machines found</div>
              ) : (
                mainCategories.map(cat => (
                  <div
                    key={cat.id}
                    onClick={() => setActiveCategoryId(cat.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3 ${activeCategoryId === cat.id
                      ? 'bg-blue-50 border-blue-500 shadow-sm ring-1 ring-blue-200'
                      : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                  >
                    {cat.icon ? (
                      <img src={toAssetUrl(cat.icon)} className="w-8 h-8 rounded-md object-contain bg-white border border-gray-100" />
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center text-xs text-gray-400 font-bold">
                        {cat.title.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-sm truncate ${activeCategoryId === cat.id ? 'text-blue-700' : 'text-gray-800'}`}>
                        {cat.title}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardShell>
        </div>

        {/* RIGHT COLUMN: SERVICES LIST */}
        <div className="lg:col-span-3">
          {activeCategory ? (
            <CardShell icon={FiPackage}>
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6 border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    {activeCategory.icon && <img src={toAssetUrl(activeCategory.icon)} className="w-6 h-6 object-contain" />}
                    {activeCategory.title}
                  </h3>
                  <p className="text-sm text-gray-500">Manage individual equipment models directly under this category</p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search equipment..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-48"
                    />
                  </div>
                  <button
                    onClick={() => {
                      resetForm();
                      setIsModalOpen(true);
                    }}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg font-semibold shadow-md hover:bg-primary-700 transition-all flex items-center justify-center gap-2 shrink-0"
                  >
                    <FiPlus className="w-4 h-4" />
                    Add Equipment Type
                  </button>
                </div>
              </div>

              {loadingServices ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                </div>
              ) : displayedServices.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <FiPackage className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-bold">No equipment models found for {activeCategory.title}</p>
                  <button onClick={() => setIsModalOpen(true)} className="mt-2 text-primary-600 hover:underline text-sm font-semibold">
                    Add the first equipment model
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedServices.map((service) => {
                    const catId = service.categoryId?._id || service.categoryId;
                    const cat = categories.find(c => String(c.id) === String(catId));
                    const catTitle = service.categoryId?.title || cat?.title || "Uncategorized";

                    return (
                      <div key={service.id || service._id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition-all relative group overflow-hidden border-b-4 border-b-primary-500/10">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 min-w-0 pr-2">
                            <h4 className="font-extrabold text-gray-900 truncate text-base" title={service.title}>{service.title}</h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded uppercase tracking-tight">
                                {catTitle}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight ${
                                service.pricing_context === 'standalone' ? 'bg-blue-100 text-blue-700' :
                                service.pricing_context === 'sub-category' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {service.pricing_context || 'any'}
                              </span>
                              {service.parentSourceId && (
                                <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-100 px-1.5 py-0.5 rounded uppercase">
                                  Parent: {categories.find(c => String(c.id) === String(service.parentSourceId)) ?.title || 'Unknown'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="bg-blue-50 text-blue-700 text-[10px] px-2 py-1 rounded-full font-black border border-blue-100 shadow-sm whitespace-nowrap">
                              {service.gstPercentage}% GST
                            </span>
                          </div>
                        </div>

                        {/* Guideline Rates Grid */}
                        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-50">
                          <div className="text-center px-1">
                            <div className="text-[9px] text-gray-400 font-bold uppercase mb-1">Hourly</div>
                            <div className="text-sm font-black text-gray-900">₹{service.hourly_price || 0}</div>
                          </div>
                          <div className="text-center px-1 border-x border-gray-100">
                            <div className="text-[9px] text-gray-400 font-bold uppercase mb-1">Land <span className="lowercase">({service.land_unit || 'acre'})</span></div>
                            <div className="text-sm font-black text-gray-900">₹{service.land_price || 0}</div>
                          </div>
                          <div className="text-center px-1">
                            <div className="text-[9px] text-gray-400 font-bold uppercase mb-1">Daily</div>
                            <div className="text-sm font-black text-gray-900">₹{service.daily_price || 0}</div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                          <span>Base Unit Highlight</span>
                          <span className="text-gray-900 font-bold">₹{service.basePrice || service.hourly_price || 0}</span>
                        </div>

                        {/* Action Buttons (Repositioned to avoid overlap) */}
                        <div className="absolute bottom-2 right-2 flex gap-1.5 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200">
                          <button 
                            onClick={() => handleEdit(service)} 
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors"
                            title="Edit"
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(service.id || service._id)} 
                            className="w-8 h-8 flex items-center justify-center bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition-colors"
                            title="Delete"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardShell>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 bg-gray-50 rounded-xl border border-gray-200 text-center text-gray-500">
              <p>Select a category from the left to manage its equipment types.</p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={resetForm}
        title={editingId ? "Edit Equipment" : "Add Equipment"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Category</label>
            <select
              value={form.categoryId}
              onChange={e => setForm({ ...form, categoryId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
              required
            >
              <option value="">Select Category</option>
              {mainCategories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Equipment Title</label>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Tractor 50HP or Harvesting Machine"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          {/* SOP requested removal of these complex fields 
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Pricing Context</label>
              <select
                value={form.pricing_context}
                onChange={e => setForm({ ...form, pricing_context: e.target.value })}
                className="w-full px-4 py-2 border border-blue-200 bg-blue-50/20 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm font-medium"
              >
                <option value="any">Global (Applies everywhere)</option>
                <option value="standalone">Standalone Rental (Direct Booking)</option>
                <option value="sub-category">Sub-category (As an Implement)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Parent Category <span className="text-xs font-normal text-gray-400">(Optional)</span></label>
              <select
                value={form.parentSourceId || ""}
                onChange={e => setForm({ ...form, parentSourceId: e.target.value })}
                className="w-full px-4 py-2 border border-purple-200 bg-purple-50/20 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm font-medium"
                disabled={form.pricing_context === 'standalone' || form.pricing_context === 'any'}
              >
                <option value="">None (Global)</option>
                {(() => {
                  const selectedCatId = form.categoryId || "";
                  const selectedCategoryObj = categories.find(c => String(c.id) === String(selectedCatId));
                  let allowedParents = [];
                  
                  if (selectedCategoryObj) {
                    const pIds = [...(selectedCategoryObj.parentCategories || [])];
                    if (selectedCategoryObj.parentCategory && !pIds.includes(selectedCategoryObj.parentCategory)) {
                      pIds.push(selectedCategoryObj.parentCategory);
                    }
                    allowedParents = categories.filter(c => pIds.includes(String(c.id)));
                  }

                  return allowedParents.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.title}</option>
                  ));
                })()}
              </select>
            </div>
          </div>
          */}


          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black text-blue-600 uppercase tracking-wider">Equipment Rental Pricing (Guidelines)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Hourly (₹)</label>
                <input
                  type="number"
                  value={form.hourly_price}
                  onChange={e => setForm({ ...form, hourly_price: e.target.value })}
                  placeholder="e.g. 500"
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 flex items-center justify-between">
                  <span>Land (₹/{form.land_unit || 'acre'})</span>
                  <input
                    list="land-units"
                    value={form.land_unit}
                    onChange={e => setForm({ ...form, land_unit: e.target.value.toLowerCase() })}
                    className="bg-transparent border-b border-dashed border-primary-300 text-[10px] font-bold text-primary-600 outline-none p-0 max-w-[60px] lowercase focus:border-solid text-right"
                    placeholder="unit"
                  />
                  <datalist id="land-units">
                    <option value="acre" />
                    <option value="hectare" />
                    <option value="bigha" />
                    <option value="katha" />
                  </datalist>
                </label>
                <input
                  type="number"
                  value={form.land_price}
                  onChange={e => setForm({ ...form, land_price: e.target.value })}
                  placeholder="e.g. 1200"
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Daily (₹)</label>
                <input
                  type="number"
                  value={form.daily_price}
                  onChange={e => setForm({ ...form, daily_price: e.target.value })}
                  placeholder="e.g. 2500"
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white text-sm font-bold"
                />
              </div>
            </div>
            <p className="text-[10px] text-blue-500 leading-tight"> These values will be used to show <strong>estimated totals</strong> to farmers based on their selected rental type (Daily rate x 30 for Monthly). </p>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-4">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Equipment"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ServicesPage;
