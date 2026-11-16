import React, { useState, useEffect, useCallback } from 'react';
import { 
  FiTag, FiPlus, FiTrash2, FiEdit2, FiCheck, FiX, 
  FiPercent, FiDollarSign, FiCalendar, FiUsers, FiCopy, 
  FiAlertCircle, FiTrendingUp, FiGift, FiSearch, FiRotateCcw 
} from 'react-icons/fi';
import {
  getAdminCoupons,
  createCoupon,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  restoreCoupon
} from '../../../../services/couponService';
import { toastManager } from '../../../../utils/toastManager';
import LogoLoader from '../../../../components/common/LogoLoader';

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

const initialFormState = {
  code: '',
  title: '',
  description: '',
  discountType: 'PERCENTAGE',
  discountValue: '',
  minOrderAmount: '',
  maxDiscountAmount: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  usageLimit: '',
  userLimit: '1',
  isActive: true
};

const Coupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [stats, setStats] = useState({
    totalCoupons: 0,
    activeCoupons: 0,
    totalRedemptions: 0,
    totalDiscountDisbursed: 0
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'EXPIRED'

  const loadCoupons = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getAdminCoupons();
      if (res.success && Array.isArray(res.coupons)) {
        setCoupons(res.coupons);
        if (res.stats) setStats(res.stats);
      }
    } catch (err) {
      console.error('Failed to load coupons:', err);
      toastManager.error(err.response?.data?.message || 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleOpenCreate = () => {
    setEditingCoupon(null);
    setFormData(initialFormState);
    setShowModal(true);
  };

  const handleOpenEdit = (coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      title: coupon.title,
      description: coupon.description || '',
      discountType: coupon.discountType || 'PERCENTAGE',
      discountValue: coupon.discountValue?.toString() || '',
      minOrderAmount: coupon.minOrderAmount ? coupon.minOrderAmount.toString() : '',
      maxDiscountAmount: coupon.maxDiscountAmount ? coupon.maxDiscountAmount.toString() : '',
      startDate: coupon.startDate ? new Date(coupon.startDate).toISOString().split('T')[0] : '',
      endDate: coupon.endDate ? new Date(coupon.endDate).toISOString().split('T')[0] : '',
      usageLimit: coupon.usageLimit ? coupon.usageLimit.toString() : '',
      userLimit: coupon.userLimit ? coupon.userLimit.toString() : '1',
      isActive: coupon.isActive !== false
    });
    setShowModal(true);
  };

  const handleToggle = async (coupon) => {
    try {
      setBusyId(coupon._id);
      const res = await toggleCouponStatus(coupon._id);
      if (res.success) {
        toastManager.success(res.message || 'Status updated');
        await loadCoupons();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to toggle status');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (coupon) => {
    if (!window.confirm(`Are you sure you want to delete coupon "${coupon.code}"?`)) {
      return;
    }

    try {
      setBusyId(coupon._id);
      const res = await deleteCoupon(coupon._id);
      if (res.success) {
        toastManager.success(res.message || 'Coupon deleted');
        await loadCoupons();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to delete coupon');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (coupon) => {
    try {
      setBusyId(coupon._id);
      const res = await restoreCoupon(coupon._id);
      if (res.success) {
        toastManager.success(res.message || 'Coupon restored successfully');
        await loadCoupons();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to restore coupon');
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.code.trim()) {
      toastManager.error('Coupon code is required');
      return;
    }
    if (!formData.title.trim()) {
      toastManager.error('Title / Festival name is required');
      return;
    }
    const val = Number(formData.discountValue);
    if (isNaN(val) || val <= 0) {
      toastManager.error('Discount value must be greater than 0');
      return;
    }
    if (formData.discountType === 'PERCENTAGE' && val > 100) {
      toastManager.error('Percentage discount cannot exceed 100%');
      return;
    }
    if (formData.endDate && formData.startDate && new Date(formData.endDate) < new Date(formData.startDate)) {
      toastManager.error('Expiry date cannot be earlier than start date');
      return;
    }

    const payload = {
      code: formData.code.trim().toUpperCase(),
      title: formData.title.trim(),
      description: formData.description.trim(),
      discountType: formData.discountType,
      discountValue: val,
      minOrderAmount: formData.minOrderAmount ? Number(formData.minOrderAmount) : 0,
      maxDiscountAmount: formData.maxDiscountAmount ? Number(formData.maxDiscountAmount) : null,
      startDate: formData.startDate ? new Date(formData.startDate) : new Date(),
      endDate: formData.endDate ? new Date(formData.endDate) : null,
      usageLimit: formData.usageLimit ? Number(formData.usageLimit) : null,
      userLimit: formData.userLimit ? Number(formData.userLimit) : 1,
      isActive: formData.isActive
    };

    try {
      setIsSubmitting(true);
      if (editingCoupon) {
        const res = await updateCoupon(editingCoupon._id, payload);
        if (res.success) {
          toastManager.success(res.message || 'Coupon updated successfully');
          setShowModal(false);
          await loadCoupons();
        }
      } else {
        const res = await createCoupon(payload);
        if (res.success) {
          toastManager.success(res.message || 'Coupon created successfully');
          setShowModal(false);
          await loadCoupons();
        }
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to save coupon');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toastManager.success(`Code "${code}" copied to clipboard`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredCoupons = coupons.filter(c => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || 
      c.code.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    const now = new Date();
    const isExpired = c.endDate && new Date(c.endDate) < now;

    if (filterStatus === 'ARCHIVED') return c.isDeleted === true;
    if (c.isDeleted) return false;

    if (filterStatus === 'ACTIVE') return c.isActive && !isExpired;
    if (filterStatus === 'EXPIRED') return isExpired;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-white shadow-md shadow-orange-100">
            <FiGift className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Coupons & Festival Offers</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage promo codes and discounts for Diwali, Dussehra, and promotional campaigns
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
        >
          <FiPlus className="w-4 h-4" />
          Create New Coupon
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Coupons</span>
            <FiTag className="w-4 h-4 text-gray-500" />
          </div>
          <div className="text-2xl font-black text-gray-900">{stats.totalCoupons}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Active & Live</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{stats.activeCoupons}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Redemptions</span>
            <FiTrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-blue-700">{stats.totalRedemptions}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Disbursed Savings</span>
            <FiDollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-700">₹{stats.totalDiscountDisbursed.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Coupons Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-800 text-sm">All Promotional Promo Codes</h3>
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-bold">
              {filteredCoupons.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Pills */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterStatus('ALL')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterStatus === 'ALL' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('ACTIVE')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterStatus === 'ACTIVE' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('EXPIRED')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterStatus === 'EXPIRED' ? 'bg-white text-rose-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Expired
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('ARCHIVED')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterStatus === 'ARCHIVED' ? 'bg-white text-slate-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Archived
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search promo codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl w-44 sm:w-56 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <LogoLoader size="md" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <FiGift className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-600" />
            <p className="text-sm font-semibold text-gray-600">No promo coupons created yet</p>
            <p className="text-xs text-gray-400 mt-1">Create your first festival offer like DIWALI50 or FLAT200 to boost bookings!</p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <FiPlus className="w-3.5 h-3.5" />
              Add Festival Coupon
            </button>
          </div>
        ) : filteredCoupons.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <FiSearch className="w-8 h-8 mx-auto mb-2 opacity-30 text-gray-400" />
            <p className="text-sm font-semibold text-gray-600">No promo codes match your search</p>
            <p className="text-xs text-gray-400 mt-0.5">Try searching for a different code name or clear filters</p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setFilterStatus('ALL'); }}
              className="mt-3 text-xs font-bold text-orange-600 hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50/70 text-gray-500 text-[11px] font-bold uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3.5">Code & Offer</th>
                  <th className="px-6 py-3.5">Discount</th>
                  <th className="px-6 py-3.5">Order Rules</th>
                  <th className="px-6 py-3.5">Validity</th>
                  <th className="px-6 py-3.5">Redemptions</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCoupons.map((coupon) => {
                  const now = new Date();
                  const isExpired = coupon.endDate && new Date(coupon.endDate) < now;
                  const isUpcoming = coupon.startDate && new Date(coupon.startDate) > now;
                  const isLimitReached = coupon.usageLimit && (coupon.usageCount >= coupon.usageLimit);

                  return (
                    <tr key={coupon._id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Code & Title */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleCopyCode(coupon.code)}
                            className="font-mono font-black text-sm bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all group"
                            title="Click to copy code"
                          >
                            <span>{coupon.code}</span>
                            {copiedCode === coupon.code ? (
                              <FiCheck className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <FiCopy className="w-3 h-3 text-orange-400 group-hover:text-orange-600" />
                            )}
                          </button>
                        </div>
                        <div className="mt-1 font-semibold text-gray-800 text-xs">{coupon.title}</div>
                        {coupon.description && (
                          <div className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{coupon.description}</div>
                        )}
                      </td>

                      {/* Discount Value */}
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-100">
                          {coupon.discountType === 'PERCENTAGE' ? (
                            <>
                              <FiPercent className="w-3 h-3" />
                              <span>{coupon.discountValue}% OFF</span>
                            </>
                          ) : (
                            <>
                              <span>₹{coupon.discountValue} OFF</span>
                            </>
                          )}
                        </div>
                        {coupon.discountType === 'PERCENTAGE' && coupon.maxDiscountAmount && (
                          <div className="text-[10px] text-gray-400 font-medium mt-1">
                            Up to ₹{coupon.maxDiscountAmount}
                          </div>
                        )}
                      </td>

                      {/* Order Rules */}
                      <td className="px-6 py-4">
                        <div className="text-xs text-gray-700">
                          {coupon.minOrderAmount > 0 ? (
                            <span className="font-semibold text-gray-800">Min. ₹{coupon.minOrderAmount}</span>
                          ) : (
                            <span className="text-gray-400">No minimum</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Limit: {coupon.userLimit || 1} use/farmer
                        </div>
                      </td>

                      {/* Validity Dates */}
                      <td className="px-6 py-4">
                        {isExpired ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Expired
                          </span>
                        ) : isUpcoming ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Starts {new Date(coupon.startDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Live
                          </span>
                        )}
                        <div className="text-[11px] text-gray-500 mt-1">
                          {coupon.endDate ? `Till ${new Date(coupon.endDate).toLocaleDateString()}` : 'No expiry'}
                        </div>
                      </td>

                      {/* Redemptions */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-xs text-gray-800">
                          {coupon.usageCount || 0} {coupon.usageLimit ? `/ ${coupon.usageLimit}` : 'uses'}
                        </div>
                        {isLimitReached && (
                          <span className="text-[10px] text-rose-500 font-semibold block mt-0.5">
                            Limit reached
                          </span>
                        )}
                      </td>

                      {/* Status Toggle */}
                      <td className="px-6 py-4">
                        {coupon.isDeleted ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Archived
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={coupon.isActive}
                              disabled={busyId === coupon._id}
                              onChange={() => handleToggle(coupon)}
                              title={coupon.isActive ? 'Active' : 'Inactive'}
                            />
                            <span className={`text-xs font-semibold ${coupon.isActive ? 'text-emerald-700' : 'text-gray-400'}`}>
                              {coupon.isActive ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {coupon.isDeleted ? (
                            <button
                              type="button"
                              onClick={() => handleRestore(coupon)}
                              disabled={busyId === coupon._id}
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                              title="Restore Coupon"
                            >
                              <FiRotateCcw className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(coupon)}
                                disabled={busyId === coupon._id}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Coupon"
                              >
                                <FiEdit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(coupon)}
                                disabled={busyId === coupon._id}
                                className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Coupon (Soft Delete)"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-50/50 to-amber-50/30">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-sm">
                  <FiTag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    {editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : 'Create Festival / Promo Coupon'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Set up discount rate, festival name, limits & validity
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Coupon Code */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Coupon Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DIWALI50"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl font-mono font-bold text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 uppercase"
                  />
                </div>

                {/* Offer Title */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Offer Title / Festival *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Diwali Dhamaka 20% Off"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Applicable on all tractor and harvester rentals"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Discount Type Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Discount Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, discountType: 'PERCENTAGE' })}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      formData.discountType === 'PERCENTAGE'
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <FiPercent className="w-4 h-4" />
                    Percentage (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, discountType: 'FLAT' })}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      formData.discountType === 'FLAT'
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <FiDollarSign className="w-4 h-4" />
                    Flat Amount (₹)
                  </button>
                </div>
              </div>

              {/* Discount Value & Max Discount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    {formData.discountType === 'PERCENTAGE' ? 'Discount Percentage (%) *' : 'Discount Amount (₹) *'}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={formData.discountType === 'PERCENTAGE' ? '100' : undefined}
                    placeholder={formData.discountType === 'PERCENTAGE' ? 'e.g. 20' : 'e.g. 300'}
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                {formData.discountType === 'PERCENTAGE' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Max Discount Cap (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 500 (No cap if empty)"
                      value={formData.maxDiscountAmount}
                      onChange={(e) => setFormData({ ...formData, maxDiscountAmount: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Minimum Order Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 1000 (0 for none)"
                    value={formData.minOrderAmount}
                    onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Validity Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Usage Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Total Uses Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 100 (Empty = Unlimited)"
                    value={formData.usageLimit}
                    onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Per-Farmer Use Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={formData.userLimit}
                    onChange={(e) => setFormData({ ...formData, userLimit: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Active Switch */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <span className="text-xs font-bold text-gray-800 block">Active Status</span>
                  <span className="text-[11px] text-gray-400">Coupons can be disabled at any time</span>
                </div>
                <Switch
                  checked={formData.isActive}
                  onChange={(v) => setFormData({ ...formData, isActive: v })}
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : editingCoupon ? 'Update Coupon' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Coupons;
