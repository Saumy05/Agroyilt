import React, { useState, useEffect } from 'react';
import { 
  FiCheckCircle, FiXCircle, FiEye, FiClock, 
  FiTruck, FiUser, FiMapPin, FiCalendar, FiSearch, FiFilter, 
  FiTrash2, FiSmartphone, FiRotateCcw, FiX, FiTag, FiDollarSign
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { motion, AnimatePresence } from 'framer-motion';
import adminEquipmentService from '../../../../services/adminEquipmentService';
import { categoryService } from '../../../../services/catalogService';
import LogoLoader from '../../../../components/common/LogoLoader';
import { refreshAdminCounts } from '../../utils/adminCounts';

const RATE_UNIT_LABELS = {
  hourly: 'hr',
  land_based: 'acre',
  daily: 'day',
  monthly: 'month',
  per_minute: 'min',
  distance_based: 'km'
};

const EquipmentApproval = () => {
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [search, setSearch] = useState('');
  
  // New rental category requested by the vendor: the admin decides whether it is rented by the piece
  const [byUnit, setByUnit] = useState(false);
  const [unitLabel, setUnitLabel] = useState('');
  const [allCategories, setAllCategories] = useState([]);
  const [reqTitles, setReqTitles] = useState({});
  const [reqMapTargets, setReqMapTargets] = useState({});
  const [reviewingReqId, setReviewingReqId] = useState(null);

  useEffect(() => { 
    setByUnit(false); 
    setUnitLabel(''); 
    setReqMapTargets({});
    setReqTitles({});
  }, [selectedItem?._id]);

  useEffect(() => {
    categoryService.getAll({ status: 'active', limit: 500 })
      .then((res) => {
        if (res.success && Array.isArray(res.categories)) {
          const hasParent = (c) => Boolean(c.parentCategory || (Array.isArray(c.parentCategories) && c.parentCategories.length > 0));
          const list = res.categories
            .filter((c) => !c.type || c.type === 'service')
            .sort((a, b) => {
              const parentDiff = Number(hasParent(b)) - Number(hasParent(a));
              if (parentDiff !== 0) return parentDiff;
              return String(a.title || '').localeCompare(String(b.title || ''));
            });
          setAllCategories(list);
        }
      })
      .catch(() => {});
  }, []);

  const needsCategoryChoice = (item) => Boolean(item && !item.categoryId && item.requestedCategoryName && item.listingType === 'rental');

  useEffect(() => {
    fetchEquipment();
  }, [filterStatus]);

  const fetchEquipment = async () => {
    try {
      setLoading(true);
      const res = await adminEquipmentService.getAll({ status: filterStatus });
      if (res.success) setEquipment(res.data || []);
    } catch (err) {
      toastManager.error('Failed to fetch equipment');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id, status, remarks = '', extra = {}) => {
    try {
      const res = await adminEquipmentService.updateStatus(id, { status, remarks, ...extra });
      if (res.success) {
        if (status === 'approved' && res.data?.status !== 'approved') {
          toastManager.info(res.message || 'Not approved yet');
        } else {
          toastManager.success(status === 'pending' ? 'Moved back to Pending' : `Machine ${status}`);
        }
        refreshAdminCounts();
        fetchEquipment();
        setSelectedItem(null);
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Update failed');
    }
  };

  const handleReject = (id) => {
    const reason = window.prompt('Reason for rejecting this machine (the vendor will see it):');
    if (reason === null) return;
    if (!reason.trim()) {
      toastManager.error('Please give a reason so the vendor knows what to fix');
      return;
    }
    handleStatusUpdate(id, 'rejected', reason.trim());
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete (archive) this equipment listing? Existing bookings and invoices will be safely preserved, and it can be restored anytime from the Archived view.')) return;
    try {
      const res = await adminEquipmentService.delete(id);
      if (res.success) {
        toastManager.success('Equipment archived successfully');
        refreshAdminCounts();
        fetchEquipment();
      }
    } catch (err) {
      toastManager.error('Delete failed');
    }
  };

  const handleRestore = async (id) => {
    if (!window.confirm('Restore this equipment listing to approved state?')) return;
    try {
      const res = await adminEquipmentService.restore(id);
      if (res.success) {
        toastManager.success('Equipment restored successfully');
        refreshAdminCounts();
        fetchEquipment();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Restore failed');
    }
  };

  const handleReviewRequestedImplement = async (reqImpl, action) => {
    if (!selectedItem?._id || !reqImpl?._id) return;
    let payload = { action };

    if (action === 'reject') {
      const reason = window.prompt(`Reason for rejecting "${reqImpl.name}" (the vendor will see it):`);
      if (reason === null) return;
      if (!reason.trim()) {
        toastManager.error('Please give a reason so the vendor knows what to fix');
        return;
      }
      payload.remarks = reason.trim();
    } else if (action === 'map') {
      const targetId = reqMapTargets[reqImpl._id];
      if (!targetId) {
        toastManager.error('Select an existing attachment category to link');
        return;
      }
      payload.targetCategoryId = targetId;
    } else {
      const title = (reqTitles[reqImpl._id] ?? reqImpl.name ?? '').trim();
      if (title.length < 2) {
        toastManager.error('Attachment name must be at least 2 characters');
        return;
      }
      payload.title = title;
    }

    try {
      setReviewingReqId(reqImpl._id);
      const res = await adminEquipmentService.reviewRequestedImplement(selectedItem._id, reqImpl._id, payload);
      if (res.success && res.data) {
        setSelectedItem(res.data);
        const stillPendingInQueue =
          res.data.status === 'pending' ||
          (res.data.requestedImplements || []).some((r) => r.status === 'pending');
        setEquipment((prev) =>
          filterStatus === 'pending' && !stillPendingInQueue
            ? prev.filter((e) => e._id !== res.data._id)
            : prev.map((e) => (e._id === res.data._id ? res.data : e))
        );
        refreshAdminCounts();
        toastManager.success(res.message || 'Updated');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to review attachment');
    } finally {
      setReviewingReqId(null);
    }
  };

  const filtered = equipment.filter(e => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = e.name?.toLowerCase().includes(q);
    const vendorMatch = e.vendorId?.name?.toLowerCase().includes(q) || 
                        e.vendorId?.businessName?.toLowerCase().includes(q) || 
                        e.vendorId?.phone?.includes(q);
    const catMatch = (e.categoryId?.title || e.requestedCategoryName || '')?.toLowerCase().includes(q);
    const modelMatch = e.modelNumber?.toLowerCase().includes(q);
    return nameMatch || vendorMatch || catMatch || modelMatch;
  });

  if (loading && equipment.length === 0) return <LogoLoader />;

  return (
    <div className="space-y-6">
      {/* Search & Filters Card */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Machinery Approvals</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              {filtered.length} {filtered.length === 1 ? 'listing' : 'listings'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 font-medium">
            Review and audit vendor equipment listings for rent & operations
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Status Tabs */}
          <div className="inline-flex bg-gray-100 p-1 rounded-xl border border-gray-200/80">
            {[
              { key: 'pending', label: 'Pending' },
              { key: 'approved', label: 'Approved' },
              { key: 'rejected', label: 'Rejected' },
              { key: 'archived', label: 'Archived' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilterStatus(tab.key)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  filterStatus === tab.key 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <input 
              type="text"
              placeholder="Filter by name, vendor..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-9 pr-3.5 text-xs sm:text-sm text-gray-800 placeholder-gray-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-normal"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="bg-gray-50/75 border-b border-gray-200/80">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Asset Details</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rates</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <AnimatePresence mode="popLayout">
                {filtered.map((item) => {
                  const activeRates = Object.entries(item.pricing || {}).filter(([_, v]) => v?.isEnabled);

                  return (
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      key={item._id} 
                      className="hover:bg-blue-50/20 transition-colors group"
                    >
                      {/* Asset Details */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 border border-gray-200/80 shadow-xs shrink-0 flex items-center justify-center">
                            {item.images?.[0] ? (
                              <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <FiTruck className="text-gray-400 w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate max-w-[220px]" title={item.name}>
                              {item.name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 font-normal">
                              {item.modelNumber && <span>{item.modelNumber}</span>}
                              {item.modelNumber && item.year && <span className="text-gray-300">•</span>}
                              {item.year && <span>{item.year} Mfg</span>}
                              {!item.modelNumber && !item.year && <span className="text-gray-400 italic">No model info</span>}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.categoryId ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100/80">
                              {item.categoryId.title}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100/80">
                              Req: {item.requestedCategoryName || 'Uncategorized'}
                            </span>
                          )}
                          {(item.requestedImplements || []).filter((r) => r.status === 'pending').length > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
                              +{(item.requestedImplements || []).filter((r) => r.status === 'pending').length} custom
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Vendor */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-900">
                            {item.vendorId?.name || item.vendorId?.businessName || 'Unknown Vendor'}
                          </span>
                          {item.vendorId?.phone ? (
                            <span className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 font-normal">
                              <FiSmartphone className="w-3 h-3 text-gray-400 shrink-0" />
                              {item.vendorId.phone}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 mt-0.5 italic">No phone</span>
                          )}
                        </div>
                      </td>

                      {/* Rates */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                          {activeRates.length > 0 ? (
                            activeRates.map(([k, v]) => {
                              const rateVal = k === 'distance_based' ? (v?.perKmRate || v?.price || 0) : (v?.price || 0);
                              const unit = RATE_UNIT_LABELS[k] || k;
                              return (
                                <span 
                                  key={k} 
                                  className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-md text-xs font-semibold"
                                >
                                  ₹{Number(rateVal).toLocaleString('en-IN')}<span className="text-emerald-500 font-normal text-[11px] ml-0.5">/{unit}</span>
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-gray-400 italic">No rates set</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        {item.isDeleted ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200/80">
                            Archived
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize
                            ${item.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200/80' : 
                              item.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80' : 
                              'bg-rose-50 text-rose-700 border border-rose-200/80'}`}>
                            {item.status === 'pending' && <FiClock className="w-3.5 h-3.5 text-amber-600" />}
                            {item.status === 'approved' && <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                            {item.status === 'rejected' && <FiXCircle className="w-3.5 h-3.5 text-rose-600" />}
                            <span>{item.status}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button 
                            onClick={() => setSelectedItem(item)}
                            className="p-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200/60"
                            title="View Details"
                          >
                            <FiEye className="w-4 h-4" />
                          </button>
                          {item.isDeleted ? (
                            <button
                              onClick={() => handleRestore(item._id)}
                              className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors border border-emerald-200/80 flex items-center gap-1 text-xs font-medium"
                              title="Restore Equipment"
                            >
                              <FiRotateCcw className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </button>
                          ) : (
                            <>
                              {item.status === 'pending' && (
                                <>
                                  <button 
                                    onClick={() => (needsCategoryChoice(item) ? setSelectedItem(item) : handleStatusUpdate(item._id, 'approved'))}
                                    className="p-2 text-emerald-600 hover:text-white bg-emerald-50 hover:bg-emerald-600 rounded-lg transition-colors border border-emerald-200/80"
                                    title="Approve"
                                  >
                                    <FiCheckCircle className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleReject(item._id)}
                                    className="p-2 text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 rounded-lg transition-colors border border-rose-200/80"
                                    title="Reject"
                                  >
                                    <FiXCircle className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              {item.status === 'rejected' && (
                                <button
                                  onClick={() => handleStatusUpdate(item._id, 'pending')}
                                  className="p-2 text-amber-600 hover:text-white bg-amber-50 hover:bg-amber-600 rounded-lg transition-colors border border-amber-200/80"
                                  title="Move back to Pending"
                                >
                                  <FiRotateCcw className="w-4 h-4" />
                                </button>
                              )}
                              <button 
                                onClick={() => handleDelete(item._id)}
                                className="p-2 text-gray-400 hover:text-rose-600 bg-gray-50 hover:bg-rose-50 rounded-lg transition-colors border border-gray-200/60"
                                title="Archive"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="p-16 text-center space-y-3">
              <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto border border-gray-100">
                <FiTruck className="text-gray-300 text-2xl" />
              </div>
              <p className="text-gray-600 font-medium text-sm">No machinery found matching criteria</p>
              <p className="text-gray-400 text-xs">Try selecting a different status filter or clear the search term</p>
            </div>
          )}
        </div>
      </div>

      {/* Audit Detail Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col md:flex-row my-auto z-10 border border-gray-100"
            >
              {/* Image Rail */}
              <div className="w-full md:w-[42%] bg-gray-50 border-r border-gray-100 p-4 sm:p-6 flex flex-col shrink-0">
                <div className="w-full aspect-4/3 rounded-xl overflow-hidden bg-white border border-gray-200/80 shadow-xs mb-3 flex items-center justify-center">
                  {selectedItem.images?.[0] ? (
                    <img src={selectedItem.images[0]} alt={selectedItem.name} className="w-full h-full object-cover" />
                  ) : (
                    <FiTruck className="text-gray-300 w-16 h-16" />
                  )}
                </div>

                {/* Additional thumbnail images if any */}
                {selectedItem.images && selectedItem.images.length > 1 && (
                  <div className="grid grid-cols-4 gap-2 overflow-x-auto pb-1">
                    {selectedItem.images.slice(1).map((img, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-white">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Vendor Details in Side Panel */}
                <div className="mt-auto pt-4 border-t border-gray-200/70">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Vendor Information</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                      <FiUser className="text-blue-600 w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {selectedItem.vendorId?.name || selectedItem.vendorId?.businessName || 'Official Vendor'}
                      </p>
                      {selectedItem.vendorId?.phone && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 font-normal">
                          <FiSmartphone className="w-3 h-3 text-gray-400" />
                          {selectedItem.vendorId.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Panel */}
              <div className="w-full md:w-[58%] p-6 sm:p-8 overflow-y-auto bg-white flex-1 flex flex-col justify-between">
                <div className="space-y-6">
                  {/* Top Bar with Category & Close */}
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-block mb-2
                        ${selectedItem.categoryId ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-purple-50 text-purple-700 border border-purple-100'}`}>
                        {selectedItem.categoryId ? selectedItem.categoryId.title : `Requested: ${selectedItem.requestedCategoryName}`}
                      </span>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug">{selectedItem.name}</h2>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        {selectedItem.modelNumber && <span>Model: {selectedItem.modelNumber}</span>}
                        {selectedItem.modelNumber && selectedItem.year && <span>•</span>}
                        {selectedItem.year && <span>Year: {selectedItem.year}</span>}
                      </p>
                    </div>
                    <button 
                      onClick={() => setSelectedItem(null)} 
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <FiX size={20} />
                    </button>
                  </div>

                  {/* Subcategories / Implements */}
                  {((selectedItem.subCategoryIds && selectedItem.subCategoryIds.length > 0) || 
                    (selectedItem.implements && selectedItem.implements.length > 0)) && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Compatible Implements</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedItem.subCategoryIds?.map(sub => (
                          <span key={sub._id} className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium border border-gray-200">
                            + {sub.title}
                          </span>
                        ))}
                        {selectedItem.implements?.map(impl => (
                          <span key={impl._id || impl.subCategoryId?._id} className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium border border-gray-200">
                            + {impl.subCategoryId?.title || 'Unknown'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vendor-Requested Custom Attachments */}
                  {Array.isArray(selectedItem.requestedImplements) && selectedItem.requestedImplements.length > 0 && (
                    <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                          Requested Custom Attachments ({selectedItem.requestedImplements.length})
                        </p>
                        {!selectedItem.categoryId && (
                          <span className="text-[11px] font-medium text-amber-700">
                            Approve main listing first to create/link
                          </span>
                        )}
                      </div>
                      <div className="space-y-2.5">
                        {(() => {
                          const mainCatId = String(selectedItem.categoryId?._id || selectedItem.categoryId || '');
                          const itemMode = selectedItem.listingType === 'rental' ? 'rental' : 'service';
                          const linkableCategories = allCategories.filter(
                            (c) => String(c.id || c._id) !== mainCatId && (c.fulfillmentMode || 'service') === itemMode
                          );

                          return selectedItem.requestedImplements.map((reqImpl) => {
                          const isBusy = reviewingReqId === reqImpl._id;
                          const rates = Object.entries(reqImpl.pricing || {})
                            .filter(([key, val]) => val?.isEnabled && RATE_UNIT_LABELS[key] && (Number(val.price) > 0 || Number(val.perKmRate) > 0))
                            .map(([key, val]) => `₹${Number(key === 'distance_based' ? (val.perKmRate || val.price) : val.price).toLocaleString('en-IN')}/${RATE_UNIT_LABELS[key]}`);

                          return (
                            <div key={reqImpl._id} className="p-3 rounded-lg bg-white border border-amber-200/70 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                {reqImpl.status === 'pending' ? (
                                  <input
                                    type="text"
                                    value={reqTitles[reqImpl._id] ?? reqImpl.name}
                                    onChange={(e) => setReqTitles((prev) => ({ ...prev, [reqImpl._id]: e.target.value }))}
                                    className="flex-1 px-2.5 py-1.5 text-xs font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-500 outline-none"
                                    placeholder="Attachment category name"
                                  />
                                ) : (
                                  <span className="text-xs font-bold text-gray-900">{reqImpl.name}</span>
                                )}
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  reqImpl.status === 'rejected'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  {reqImpl.status}
                                </span>
                              </div>

                              {rates.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {rates.map((r, i) => (
                                    <span key={i} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-semibold">
                                      {r}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {reqImpl.status === 'rejected' && reqImpl.adminRemarks && (
                                <p className="text-[11px] text-rose-600 font-medium">Reason: {reqImpl.adminRemarks}</p>
                              )}

                              {reqImpl.status === 'pending' && (
                                <div className="space-y-2 pt-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={!selectedItem.categoryId || isBusy}
                                      onClick={() => handleReviewRequestedImplement(reqImpl, 'approve')}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                                    >
                                      {isBusy ? 'Saving...' : 'Create & Approve'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => handleReviewRequestedImplement(reqImpl, 'reject')}
                                      className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold transition-colors"
                                    >
                                      Reject
                                    </button>
                                  </div>

                                  {linkableCategories.length > 0 && (
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={reqMapTargets[reqImpl._id] || ''}
                                        onChange={(e) => setReqMapTargets((prev) => ({ ...prev, [reqImpl._id]: e.target.value }))}
                                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-500"
                                      >
                                        <option value="">Or link to existing attachment...</option>
                                        {linkableCategories.map((c) => {
                                          const cid = c.id || c._id;
                                          const hasParent = Boolean(c.parentCategory || (Array.isArray(c.parentCategories) && c.parentCategories.length > 0));
                                          return (
                                            <option key={cid} value={cid}>
                                              {c.title}{hasParent ? ' (Implement)' : ''}
                                            </option>
                                          );
                                        })}
                                      </select>
                                      <button
                                        type="button"
                                        disabled={!selectedItem.categoryId || !reqMapTargets[reqImpl._id] || isBusy}
                                        onClick={() => handleReviewRequestedImplement(reqImpl, 'map')}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                                      >
                                        Link
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</p>
                    <p className="text-gray-600 text-sm leading-relaxed bg-gray-50/70 p-3 rounded-xl border border-gray-200/60 font-normal">
                      {selectedItem.description || 'No additional description provided.'}
                    </p>
                  </div>

                  {/* Rates Section */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Configured Rental Rates</p>
                    {(() => {
                      const LABELS = { 
                        hourly: 'Hourly Rate', 
                        land_based: 'Per Acre Rate', 
                        daily: 'Daily Rate', 
                        monthly: 'Monthly Rate', 
                        per_minute: 'Per Minute Rate', 
                        distance_based: 'Distance Rate' 
                      };
                      const rates = Object.entries(selectedItem?.pricing || {})
                        .filter(([key, val]) => val && typeof val === 'object' && val.isEnabled && LABELS[key])
                        .map(([key, val]) => {
                          if (key === 'distance_based') {
                            const perKm = Number(val.perKmRate) || Number(val.price) || 0;
                            return { 
                              key, 
                              label: LABELS[key], 
                              amount: `₹${perKm.toLocaleString('en-IN')}/km`, 
                              note: Number(val.baseCharge) > 0 ? `₹${val.baseCharge} covers first ${val.baseKm || 0} km` : '' 
                            };
                          }
                          return { 
                            key, 
                            label: LABELS[key], 
                            amount: `₹${(Number(val.price) || 0).toLocaleString('en-IN')}`, 
                            note: '' 
                          };
                        });

                      if (rates.length === 0) {
                        return <p className="text-xs text-gray-400 italic">The vendor has not set any rates for this machine.</p>;
                      }

                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {rates.map(r => (
                            <div key={r.key} className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
                              <div className="flex items-center gap-1.5 text-emerald-700 mb-1">
                                {r.key === 'land_based' ? <FiMapPin className="w-3.5 h-3.5" /> : <FiClock className="w-3.5 h-3.5" />}
                                <p className="text-xs font-medium">{r.label}</p>
                              </div>
                              <p className="text-base sm:text-lg font-bold text-gray-900">{r.amount}</p>
                              {r.note && <p className="text-[11px] text-gray-500 mt-0.5">{r.note}</p>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* New category selection prompt if requested */}
                  {selectedItem.status === 'pending' && needsCategoryChoice(selectedItem) && (
                    <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/80 space-y-2.5">
                      <p className="text-xs font-bold text-purple-900">New Category Request: {selectedItem.requestedCategoryName}</p>
                      <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={byUnit} 
                          onChange={e => setByUnit(e.target.checked)} 
                          className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" 
                        />
                        Rented by the piece (e.g. pipes, panels)
                      </label>
                      {byUnit && (
                        <input
                          type="text"
                          value={unitLabel}
                          onChange={e => setUnitLabel(e.target.value)}
                          placeholder="What is one piece called? (e.g. pipe)"
                          className="w-full px-3 py-2 rounded-lg border border-purple-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
                        />
                      )}
                      {byUnit && (
                        <p className="text-[11px] text-gray-500">
                          The vendor will enter their stock quantity before the listing goes live.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Audit Action Buttons */}
                {selectedItem.status === 'pending' && (
                  <div className="flex items-center gap-3 pt-6 border-t border-gray-100 mt-6">
                    <button 
                      onClick={() => handleStatusUpdate(
                        selectedItem._id, 
                        'approved', 
                        '', 
                        needsCategoryChoice(selectedItem) ? { rentByUnit: byUnit, unitLabel } : {}
                      )}
                      className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-xs transition-colors text-xs sm:text-sm flex items-center justify-center gap-2"
                    >
                      <FiCheckCircle className="w-4 h-4" />
                      Approve Listing
                    </button>
                    <button 
                      onClick={() => handleReject(selectedItem._id)}
                      className="py-2.5 px-5 bg-white hover:bg-rose-50 text-rose-600 rounded-xl font-semibold border border-rose-200 transition-colors text-xs sm:text-sm flex items-center justify-center gap-2"
                    >
                      <FiXCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EquipmentApproval;
