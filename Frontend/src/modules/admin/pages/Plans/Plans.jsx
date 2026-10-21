import React, { useState, useEffect } from 'react';
import { getPlans, createPlan, updatePlan, deletePlan } from '../../services/planService';
import { categoryService } from '../../../../services/catalogService';
import { FiPlus, FiEdit2, FiTrash2, FiCheck, FiX, FiList, FiPackage } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';

const Plans = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [formData, setFormData] = useState({
    name: 'Silver',
    price: '',
    highlights: [],
    validityDays: 30,
    freeCategories: [],
    marketplaceDiscountPercentage: 0,
    rentalDiscountPercentage: 0
  });
  const [featureInput, setFeatureInput] = useState('');

  const PLAN_TYPES = ['Silver', 'Gold', 'Diamond', 'Platinum'];

  const getCardStyle = (name) => {
    const lower = name.toLowerCase();

    if (lower.includes('platinum')) {
      return {
        container: 'bg-slate-900 text-white border-slate-700 ring-1 ring-slate-700',
        text: 'text-white',
        subtext: 'text-slate-400',
        badge: 'bg-slate-800 text-white',
        price: 'text-white',
        check: 'text-slate-900 bg-white',
        footer: 'bg-slate-800 border-slate-700'
      };
    }
    if (lower.includes('diamond')) {
      return {
        container: 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white border-transparent shadow-xl ring-0',
        text: 'text-white',
        subtext: 'text-indigo-100',
        badge: 'bg-white/20 text-white',
        price: 'text-white',
        check: 'text-indigo-600 bg-white',
        footer: 'bg-white/10 border-white/20'
      }
    }
    if (lower.includes('gold')) {
      return {
        container: 'bg-gradient-to-br from-amber-100 to-yellow-100 border-amber-200 text-amber-900',
        text: 'text-amber-900',
        subtext: 'text-amber-700',
        badge: 'bg-amber-200 text-amber-800',
        price: 'text-amber-900',
        check: 'text-amber-100 bg-amber-600',
        footer: 'bg-amber-50/80 border-amber-200'
      };
    }
    // Silver / Default
    return {
      container: 'bg-gradient-to-br from-gray-100 to-slate-200 border-gray-300 text-gray-800',
      text: 'text-gray-900',
      subtext: 'text-gray-600',
      badge: 'bg-white/50 text-gray-700',
      price: 'text-gray-900',
      check: 'text-gray-700 bg-white/60',
      footer: 'bg-gray-50 border-gray-200'
    };
  };

  // Catalog State
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [plansRes, catsRes] = await Promise.all([
        getPlans(),
        categoryService.getAll()
      ]);

      if (plansRes.success) setPlans(plansRes.data);

      const categoriesData = catsRes.categories || catsRes.data || (Array.isArray(catsRes) ? catsRes : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);

    } catch (error) {
      console.error('fetchInitialData error', error);
      toastManager.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await getPlans();
      if (res.success) setPlans(res.data);
    } catch (error) {
      console.error('Refresh plans failed', error);
    }
  };


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Create a clean payload with only IDs for benefit arrays
      const payload = {
        ...formData,
        price: Number(formData.price),
        marketplaceDiscountPercentage: Number(formData.marketplaceDiscountPercentage) || 0,
        rentalDiscountPercentage: Number(formData.rentalDiscountPercentage) || 0,
        freeCategories: formData.freeCategories.map(c => String(c?._id || c)),
        highlights: formData.highlights
      };

      if (currentPlan) {
        await updatePlan(currentPlan._id, payload);
        toastManager.success('Plan updated successfully');
      } else {
        await createPlan(payload);
        toastManager.success('Plan created successfully');
      }
      setIsModalOpen(false);
      fetchPlans();
    } catch (error) {
      console.error(error);
      toastManager.error(error.response?.data?.message || 'Error saving plan');
    }
  };

  const handleEdit = (plan) => {
    setCurrentPlan(plan);
    setFormData({
      name: plan.name,
      price: plan.price,
      highlights: plan.highlights || plan.services || [],
      validityDays: plan.validityDays || 30,
      freeCategories: (plan.freeCategories || []).map(c => c._id || c),
      marketplaceDiscountPercentage: plan.marketplaceDiscountPercentage || 0,
      rentalDiscountPercentage: plan.rentalDiscountPercentage || 0
    });
    setFeatureInput('');
    setIsModalOpen(true);

    if (plan.freeCategories?.length > 0) {
      setSelectedCategory(String(plan.freeCategories[0]?._id || plan.freeCategories[0]));
    } else {
      setSelectedCategory('');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this plan?')) return;
    try {
      await deletePlan(id);
      toastManager.success('Plan deleted successfully');
      fetchPlans();
    } catch (error) {
      console.error(error);
      toastManager.error('Failed to delete plan');
    }
  };

  const openCreateModal = () => {
    setCurrentPlan(null);
    setFormData({
      name: 'Silver',
      price: '',
      highlights: [],
      validityDays: 30,
      freeCategories: [],
      freeServices: [],
      marketplaceDiscountPercentage: 0,
      rentalDiscountPercentage: 0
    });
    setIsModalOpen(true);
    // Reset selections
    setSelectedCategory('');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end items-center">
        <button
          onClick={openCreateModal}
          className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 flex items-center gap-2 transition-colors shadow-sm"
        >
          <FiPlus className="w-4 h-4" /> Add New Plan
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => {
            const style = getCardStyle(plan.name);
            return (
              <div key={plan._id} className={`rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-all flex flex-col h-full ${style.container}`}>
                <div className="p-4 flex-1">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className={`text-lg font-bold ${style.text}`}>{plan.name}</h3>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${plan.isActive ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'}`}>
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className={`flex items-baseline gap-2 mb-4 ${style.price}`}>
                    <span className="text-2xl font-bold">₹{plan.price}</span>
                    <span className={`text-[10px] font-medium opacity-60`}>/ {plan.validityDays || 30} Days</span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <h4 className={`text-[10px] font-bold uppercase tracking-wider ${style.subtext}`}>Includes</h4>
                    <div className="space-y-1.5">
                      {/* Display Free Categories First */}
                      {plan.freeCategories && plan.freeCategories.length > 0 && (
                        <div className={`flex flex-col gap-1 text-xs ${style.text}`}>
                          {plan.freeCategories.map((catRef, idx) => {
                            const catId = String(catRef?._id || catRef);
                            const cat = categories.find(c => String(c.id || c._id) === catId);
                            const displayTitle = cat ? cat.title : (catRef?.title || 'Unlimited Coverage');
                            return (
                              <div key={`c-v-${idx}`} className="flex items-center gap-2">
                                <FiCheck className={`w-3.5 h-3.5 ${style.check} rounded-full p-0.5`} />
                                <span>{displayTitle === 'Unlimited Coverage' ? 'Unlimited Coverage' : `Unlimited ${displayTitle}`}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}



                      {/* Display Free Equipment Types */}
                      {plan.freeServices && plan.freeServices.length > 0 && (
                        <div className={`flex flex-col gap-1 text-xs ${style.text}`}>
                          {plan.freeServices.map((svcRef, idx) => {
                            // the plan carries the equipment type itself when the server populated it; otherwise a generic label is shown
                            const svc = svcRef && typeof svcRef === 'object' ? svcRef : null;

                            let displayTitle = 'Free Equipment';
                            if (svc) {
                              const brandTitle = svc.brandId?.title || '';
                              const catTitle = svc.categoryId?.title || '';
                              displayTitle = `Free ${brandTitle} ${catTitle} ${svc.title}`.replace(/\s+/g, ' ').trim();
                            } else if (svcRef?.title) {
                              displayTitle = `Free ${svcRef.title}`;
                            }

                            return (
                              <div key={`s-v-${idx}`} className="flex items-center gap-2">
                                <FiCheck className={`w-3.5 h-3.5 ${style.check} rounded-full p-0.5`} />
                                <span>{displayTitle}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {(!plan.freeCategories?.length && !plan.freeServices?.length && !plan.marketplaceDiscountPercentage && !plan.rentalDiscountPercentage) && (
                        <span className={`text-xs italic ${style.subtext}`}>No benefits configured</span>
                      )}

                      {/* Agri Discounts Display */}
                      {plan.marketplaceDiscountPercentage > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <FiCheck className={`w-3.5 h-3.5 ${style.check} rounded-full p-0.5`} />
                          <span className="font-bold">{plan.marketplaceDiscountPercentage}% Marketplace Discount</span>
                        </div>
                      )}
                      {plan.rentalDiscountPercentage > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <FiCheck className={`w-3.5 h-3.5 ${style.check} rounded-full p-0.5`} />
                          <span className="font-bold">{plan.rentalDiscountPercentage}% Equipment Rental Discount</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`px-4 py-3 flex justify-end gap-2 border-t ${style.footer}`}>
                  <button
                    onClick={() => handleEdit(plan)}
                    className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-full transition-all duration-300"
                    title="Edit"
                  >
                    <FiEdit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(plan._id)}
                    className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-full transition-all duration-300"
                    title="Delete"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}

          {plans.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
              <p>No plans found. Create one to get started.</p>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in duration-200 my-8 flex flex-col max-h-[90vh]">

            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{currentPlan ? 'Edit Configuration' : 'Create New Plan'}</h2>
                <p className="text-sm text-gray-500 mt-1">Define plan details and benefits</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="bg-white p-2 rounded-full text-gray-400 hover:text-gray-600 shadow-sm border border-gray-200 transition-all hover:rotate-90">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">

              {/* Basic Info Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Plan Type</label>
                  <select
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all font-medium"
                    required
                  >
                    {PLAN_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Monthly Price (₹)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-gray-500 font-bold">₹</span>
                    <input
                      type="number"
                      name="price"
                      value={formData.price}
                      onChange={handleInputChange}
                      className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all font-bold text-gray-800"
                      required
                      placeholder="999"
                      min="0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Validity (Days)</label>
                  <input
                    type="number"
                    name="validityDays"
                    value={formData.validityDays}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all font-bold text-gray-800"
                    required
                    placeholder="30"
                    min="1"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Marketplace Disc (%)</label>
                  <input
                    type="number"
                    name="marketplaceDiscountPercentage"
                    value={formData.marketplaceDiscountPercentage}
                    onChange={handleInputChange}
                    onFocus={(e) => { if (e.target.value === '0') setFormData(prev => ({ ...prev, marketplaceDiscountPercentage: '' })); }}
                    onBlur={(e) => { if (e.target.value === '') setFormData(prev => ({ ...prev, marketplaceDiscountPercentage: 0 })); }}
                    className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-emerald-800"
                    placeholder="0"
                    min="0"
                    max="100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Rental Disc (%)</label>
                  <input
                    type="number"
                    name="rentalDiscountPercentage"
                    value={formData.rentalDiscountPercentage}
                    onChange={handleInputChange}
                    onFocus={(e) => { if (e.target.value === '0') setFormData(prev => ({ ...prev, rentalDiscountPercentage: '' })); }}
                    onBlur={(e) => { if (e.target.value === '') setFormData(prev => ({ ...prev, rentalDiscountPercentage: 0 })); }}
                    className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-blue-800"
                    placeholder="0"
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              {/* Plan Highlights Section */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                  <span className="bg-amber-100 text-amber-600 p-2 rounded-lg">
                    <FiList className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-gray-800">Plan Highlights</h3>
                    <p className="text-xs text-gray-500">Marketing features shown to farmers</p>
                  </div>
                </div>
                <div className="p-6 bg-white space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={featureInput}
                      onChange={(e) => setFeatureInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && featureInput.trim()) {
                          e.preventDefault();
                          setFormData(p => ({ ...p, highlights: [...p.highlights, featureInput.trim()] }));
                          setFeatureInput('');
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                      placeholder="e.g. 24/7 Priority Support, Genuine Spare Parts..."
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (featureInput.trim()) {
                          setFormData(p => ({ ...p, highlights: [...p.highlights, featureInput.trim()] }));
                          setFeatureInput('');
                        }
                      }}
                      className="px-6 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-[40px]">
                    {formData.highlights.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-full text-[11px] font-bold text-amber-700 shadow-sm animate-in fade-in slide-in-from-left-2 transition-all">
                        <span>{feature}</span>
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, highlights: p.highlights.filter((_, i) => i !== idx) }))}
                          className="w-4 h-4 flex items-center justify-center bg-white rounded-full text-amber-400 hover:text-red-500 transition-colors"
                        >
                          <FiX className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {formData.highlights.length === 0 && (
                      <p className="text-gray-400 text-xs italic">No highlights added yet. Describe what makes this plan special.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Boxed Benefits Section */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                      <FiCheck className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="font-bold text-gray-800">Plan Benefits</h3>
                      <p className="text-xs text-gray-500">Configure free equipment included in this plan</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-white space-y-6">
                  {/* Selector Row: Category → Add Benefit */}
                  <div className="flex flex-col md:flex-row gap-3 items-end">
                    <div className="flex-1 w-full space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase">Category</label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">Select Category...</option>
                        {categories.map(cat => (
                          <option key={cat.id || cat._id} value={cat.id || cat._id}>{cat.title}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={!selectedCategory}
                      onClick={() => {
                        if (selectedCategory) {
                          if (!formData.freeCategories.some(c => String(c._id || c) === String(selectedCategory))) {
                            setFormData(p => ({ ...p, freeCategories: [...p.freeCategories, selectedCategory] }));
                            toastManager.success('Benefit added!');
                            setSelectedCategory('');
                          } else {
                            toastManager.error('Already in list');
                          }
                        }
                      }}
                      className="h-[42px] px-6 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 active:scale-95 transition-all w-full md:w-auto"
                    >
                      Add Benefit
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-gray-100 w-full"></div>

                  {/* Active List */}
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-gray-700">Active Benefits</p>

                    <div className="flex flex-wrap gap-3">
                      {/* Categories */}
                      {formData.freeCategories.map((catId, idx) => {
                        const targetId = String(catId?._id || catId);
                        const cat = categories.find(c => String(c.id || c._id) === targetId);
                        const displayTitle = cat ? cat.title : (catId?.title || 'Category');
                        return (
                          <div key={`c-tag-${idx}`} className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-sm font-medium shadow-sm">
                            <FiPackage className="w-4 h-4" />
                            <span>{displayTitle}</span>
                            <span className="bg-indigo-200 text-indigo-800 text-[10px] px-1.5 rounded-full uppercase">All Free</span>
                            <button
                              type="button"
                              onClick={() => setFormData(p => ({ ...p, freeCategories: p.freeCategories.filter(id => String(id?._id || id) !== targetId) }))}
                              className="ml-1 p-0.5 hover:bg-white rounded-full transition-colors text-indigo-400 hover:text-red-500"
                            >
                              <FiX className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}

                      {formData.freeCategories.length === 0 && (
                        <p className="text-gray-400 text-sm italic w-full">No benefits added yet. Select a category above to start.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 sticky bottom-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="px-8 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20 active:scale-95"
              >
                {currentPlan ? 'Save Changes' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Plans;
