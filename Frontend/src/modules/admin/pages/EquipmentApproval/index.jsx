import React, { useState, useEffect } from 'react';
import { 
  FiCheckCircle, FiXCircle, FiEye, FiClock, 
  FiTruck, FiUser, FiMapPin, FiCalendar, FiSearch, FiFilter, FiMoreVertical, FiTrash2, FiSmartphone
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { motion, AnimatePresence } from 'framer-motion';
import adminEquipmentService from '../../../../services/adminEquipmentService';
import LogoLoader from '../../../../components/common/LogoLoader';

const EquipmentApproval = () => {
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchEquipment();
  }, [filterStatus]);

  const fetchEquipment = async () => {
    try {
      setLoading(true);
      const res = await adminEquipmentService.getAll({ status: filterStatus });
      if (res.success) setEquipment(res.data);
    } catch (err) {
      toastManager.error('Failed to fetch equipment');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id, status, remarks = '') => {
    try {
      const res = await adminEquipmentService.updateStatus(id, { status, remarks });
      if (res.success) {
        toastManager.success(`Machine ${status}`);
        fetchEquipment();
        setSelectedItem(null);
      }
    } catch (err) {
      toastManager.error('Update failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this listing?')) return;
    try {
      const res = await adminEquipmentService.delete(id);
      if (res.success) {
        toastManager.success('Deleted successfully');
        fetchEquipment();
      }
    } catch (err) {
      toastManager.error('Delete failed');
    }
  };

  const filtered = equipment.filter(e => 
    e.name?.toLowerCase().includes(search.toLowerCase()) || 
    e.vendorId?.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading && equipment.length === 0) return <LogoLoader />;

  return (
    <div className="p-6 lg:p-10 space-y-8 bg-slate-50 min-h-screen">
      {/* Search & Filters Header */}
      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Machinery Approvals</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Audit Vendor Listings</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            {['pending', 'approved', 'rejected'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                  ${filterStatus === s ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Filter by name/vendor..."
              className="w-full bg-slate-100 border-none rounded-2xl p-3.5 pl-12 text-xs font-black outline-none focus:ring-2 focus:ring-blue-500/10 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-[40px] shadow-2xl shadow-blue-900/5 border border-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Details</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Rates</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence mode='popLayout'>
                {filtered.map((item, idx) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={item._id} 
                    className="hover:bg-blue-50/30 transition-all group"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-50 shadow-sm flex-shrink-0">
                          {item.images?.[0] ? (
                            <img src={item.images[0]} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-100"><FiTruck className="text-slate-300" /></div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800 leading-tight">{item.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{item.modelNumber} ? {item.year} Mfg</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider
                        ${item.categoryId ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                        {item.categoryId ? item.categoryId.title : `Req: ${item.requestedCategoryName}`}
                      </span>
                    </td>
                    <td className="px-6 py-6 font-bold text-slate-600 text-sm">
                      <div className="flex flex-col">
                        <span className="text-slate-800 font-black">{item.vendorId?.name || 'Unknown'}</span>
                        <span className="text-[10px] text-slate-400 tracking-tighter">{item.vendorId?.phone}</span>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                         {Object.entries(item.pricing || {}).filter(([_, v]) => v?.isEnabled).map(([k, v]) => (
                           <div key={k} className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md text-[8px] font-bold uppercase">
                             {k === 'land_based' ? 'Acre' : k === 'hourly' ? 'Hr' : 'Day'}: ₹{v?.price}
                           </div>
                         ))}
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider
                        ${item.status === 'pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 
                          item.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                          'bg-red-50 text-red-600 border border-red-100'}`}>
                        {item.status === 'pending' && <FiClock className="w-2.5 h-2.5" />}
                        {item.status === 'approved' && <FiCheckCircle className="w-2.5 h-2.5" />}
                        {item.status === 'rejected' && <FiXCircle className="w-2.5 h-2.5" />}
                        {item.status}
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setSelectedItem(item)}
                          className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                          title="Inspect"
                        >
                          <FiEye className="w-4 h-4" />
                        </button>
                        {item.status === 'pending' && (
                          <>
                            <button 
                              onClick={() => handleStatusUpdate(item._id, 'approved')}
                              className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                              title="Approve"
                            >
                              <FiCheckCircle className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleStatusUpdate(item._id, 'rejected')}
                              className="p-2.5 bg-red-100 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                              title="Reject"
                            >
                              <FiXCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => handleDelete(item._id)}
                          className="p-2.5 bg-slate-50 text-slate-300 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all"
                          title="Delete"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-20 text-center space-y-3">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiTruck className="text-slate-200 text-3xl" />
              </div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No machinery found matching criteria</p>
            </div>
          )}
        </div>
      </div>

      {/* Audit Modal (Same as before but polished) */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-6xl bg-white rounded-3xl sm:rounded-[48px] shadow-2xl overflow-hidden max-h-[90vh] sm:max-h-[95vh] flex flex-col md:flex-row mx-4"
            >
              {/* Image Rail */}
              <div className="w-full md:w-[40%] h-48 sm:h-64 md:h-full bg-slate-100 flex-shrink-0">
                <div className="h-full grid grid-cols-2 gap-1 overflow-y-auto">
                  {selectedItem.images?.map((img, i) => (
                    <img key={i} src={img} className={`w-full h-full object-cover min-h-[150px] ${selectedItem.images.length === 1 ? 'col-span-2 row-span-2 h-full' : ''}`} />
                  ))}
                  {(!selectedItem.images || selectedItem.images.length === 0) && (
                    <div className="col-span-2 flex items-center justify-center text-slate-300 h-full bg-slate-50"><FiTruck size={64} /></div>
                  )}
                </div>
              </div>

              {/* Data Panel */}
              <div className="w-full md:w-[60%] p-6 sm:p-8 md:p-14 overflow-y-auto bg-white flex-1 min-h-0">
                <div className="flex justify-between items-start mb-6 sm:mb-8 gap-4">
                  <div>
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 inline-block shadow-sm
                      ${selectedItem.categoryId ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                      {selectedItem.categoryId ? selectedItem.categoryId.title : `Requested Type: ${selectedItem.requestedCategoryName}`}
                    </span>
                    <h2 className="text-2xl sm:text-4xl font-black text-slate-900 leading-none">{selectedItem.name}</h2>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {selectedItem.subCategoryIds?.map(sub => (
                        <span key={sub._id} className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold border border-slate-200">
                          + {sub.title}
                        </span>
                      ))}
                      {selectedItem.implements?.map(impl => (
                        <span key={impl._id || impl.subCategoryId?._id} className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold border border-slate-200">
                          + {impl.subCategoryId?.title || 'Unknown'}
                        </span>
                      ))}
                    </div>
                    <p className="text-slate-400 mt-6 text-sm leading-relaxed font-bold italic">"{selectedItem.description || 'Verified machinery asset listed for community rent.'}"</p>
                  </div>
                  <button onClick={() => setSelectedItem(null)} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all">
                    <FiXCircle size={24} className="text-slate-400" />
                  </button>
                </div>

                <div className="space-y-10">
                   {/* Owner Info */}
                   <div className="flex items-center gap-4 border-b border-slate-50 pb-6">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center"><FiUser className="text-blue-600" /></div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Listing Vendor</p>
                        <p className="text-lg font-black text-slate-800">{selectedItem.vendorId?.name || 'Official Vendor'}</p>
                      </div>
                   </div>

                  {/* Driver Section */}
                  {selectedItem?.includesDriver && selectedItem?.driver && (
                    <div className="bg-purple-50 rounded-3xl sm:rounded-[40px] p-5 sm:p-6 md:p-8 border border-purple-100 shadow-xl shadow-purple-900/5">
                      <div className="flex flex-col sm:flex-row items-center gap-6 mb-8 text-center sm:text-left">
                        <div className="relative flex-shrink-0">
                          <div className="w-24 h-24 rounded-[32px] overflow-hidden bg-white shadow-lg border-4 border-white">
                            {selectedItem.driver.photo ? (
                              <img src={selectedItem.driver.photo} className="w-full h-full object-cover" />
                            ) : (
                              <FiUser className="w-full h-full p-6 text-purple-200" />
                            )}
                          </div>
                          <div className="absolute -right-2 -bottom-2 w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center border-4 border-purple-50 shadow-lg">
                            <FiCheckCircle className="text-white text-sm" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-purple-600 uppercase tracking-widest leading-none mb-2">Registered Operator</p>
                          <h4 className="text-2xl sm:text-3xl font-black text-purple-900 break-words">{selectedItem.driver.name}</h4>
                          <h4 className="text-sm font-bold text-purple-400 mt-2 tracking-tight flex items-center justify-center sm:justify-start gap-1.5">
                            <FiSmartphone size={14} /> {selectedItem.driver.phone}
                          </h4>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div className="bg-white/80 p-5 rounded-3xl border border-purple-100/50 shadow-sm">
                            <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-1.5">Aadhar Card</p>
                            <p className="text-sm font-black text-purple-800 tracking-wider break-all">{selectedItem.driver.aadharNumber || 'Not Linked'}</p>
                         </div>
                         <div className="bg-white/80 p-5 rounded-3xl border border-purple-100/50 shadow-sm">
                            <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-1.5">DL Number</p>
                            <p className="text-sm font-black text-purple-800 tracking-wider break-all uppercase">{selectedItem.driver.licenseNumber || 'Active'}</p>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* Rates Detail */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
                    {Object.entries(selectedItem?.pricing || {}).map(([key, val]) => (
                      val && (
                        <div key={key} className={`p-6 rounded-[32px] border-2 transition-all ${val.isEnabled ? 'bg-white border-emerald-500/10 shadow-xl shadow-emerald-900/5' : 'bg-slate-50 border-transparent opacity-20'}`}>
                          <div className="flex items-center gap-2 mb-3">
                             {key === 'hourly' && <FiClock className="text-emerald-500" />}
                             {key === 'land_based' && <FiMapPin className="text-emerald-500" />}
                             {(key === 'daily' || key === 'monthly') && <FiClock className="text-emerald-500" />}
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{key === 'land_based' ? 'Acre' : key === 'hourly' ? 'Hourly' : 'Daily'}</p>
                          </div>
                          <p className="text-2xl font-black text-slate-900">₹{val.price}</p>
                        </div>
                      )
                    ))}
                  </div>

                  {/* Audit Actions */}
                  {selectedItem.status === 'pending' && (
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
                      <button 
                        onClick={() => handleStatusUpdate(selectedItem._id, 'approved')}
                        className="flex-3 py-6 bg-emerald-600 text-white rounded-[32px] font-black uppercase tracking-widest shadow-2xl shadow-emerald-200 active:scale-95 transition-all text-sm flex items-center justify-center gap-3 flex-[2]"
                      >
                        <FiCheckCircle size={20} />
                        Confirm Listing
                      </button>
                      <button 
                        onClick={() => handleStatusUpdate(selectedItem._id, 'rejected')}
                        className="flex-1 py-6 bg-red-50 text-red-600 rounded-[32px] font-black uppercase tracking-widest active:scale-95 transition-all text-sm border-2 border-red-100"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EquipmentApproval;
