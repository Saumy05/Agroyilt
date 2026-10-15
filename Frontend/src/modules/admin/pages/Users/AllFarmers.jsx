import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiUser, FiPhone, FiMail, FiCheckCircle, FiSlash, FiCheck, FiTrash2, FiPlus, FiX, FiUserCheck, FiEye, FiAlertCircle } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { adminUserService } from '../../../../services/adminUserService';

const AllFarmers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
  const [approvalFilter, setApprovalFilter] = useState('all'); // all, pending, approved, rejected
  const [createdByMe, setCreatedByMe] = useState(false);
  const [myRegistrationsCount, setMyRegistrationsCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Add Farmer State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newFarmer, setNewFarmer] = useState({ name: '', phone: '', email: '', gender: '' });
  const [modalError, setModalError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // View Farmer State
  const [viewUser, setViewUser] = useState(null);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const handleAddFarmer = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!newFarmer.name?.trim()) {
      const err = 'Farmer full name is required';
      setModalError(err);
      return toastManager.error(err);
    }

    const cleanPhone = (newFarmer.phone || '').replace(/\D/g, '').slice(-10);
    const indianMobileRegex = /^[6-9]\d{9}$/;

    if (!cleanPhone || cleanPhone.length !== 10) {
      const err = 'Please enter a complete 10-digit mobile number';
      setModalError(err);
      return toastManager.error(err);
    }

    if (!indianMobileRegex.test(cleanPhone)) {
      const err = 'Please enter a valid Indian mobile number starting with 6, 7, 8, or 9';
      setModalError(err);
      return toastManager.error(err);
    }
    
    try {
      setIsAdding(true);
      const response = await adminUserService.addUser({
        ...newFarmer,
        name: newFarmer.name.trim(),
        phone: cleanPhone,
        email: newFarmer.email?.trim() || undefined,
        gender: newFarmer.gender || undefined
      });
      if (response.success) {
        toastManager.success(response.message || 'Farmer added successfully');
        setIsAddModalOpen(false);
        setNewFarmer({ name: '', phone: '', email: '', gender: '' });
        setModalError('');
        fetchUsers();
      }
    } catch (error) {
      const errMsg = error.message || 'Failed to add farmer';
      setModalError(errMsg);
      toastManager.error(errMsg);
    } finally {
      setIsAdding(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 10,
        search: debouncedSearch
      };

      if (statusFilter !== 'all') {
        params.isActive = statusFilter === 'active';
      }

      if (approvalFilter !== 'all') {
        params.approvalStatus = approvalFilter;
      }

      if (createdByMe) {
        params.createdByMe = 'true';
      }

      const response = await adminUserService.getAllUsers(params);
      if (response.success) {
        setUsers(response.data);
        setTotalPages(response.pagination?.pages || 1);
        setTotalUsers(response.pagination?.total || 0);
        if (response.counts?.myRegistrations !== undefined) {
          setMyRegistrationsCount(response.counts.myRegistrations);
        }
      }
    } catch (error) {
      console.error('Error fetching farmers:', error);
      toastManager.error(error.message || 'Failed to load farmers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, debouncedSearch, statusFilter, approvalFilter, createdByMe]);

  const handleApprove = async (userId) => {
    try {
      const response = await adminUserService.updateApprovalStatus(userId, 'approved');
      if (response.success) {
        toastManager.success('Farmer approved successfully!');
        fetchUsers();
      } else {
        toastManager.error(response.message || 'Failed to approve farmer');
      }
    } catch (error) {
      toastManager.error(error.message || 'Failed to approve farmer');
    }
  };

  const handleReject = async (userId) => {
    const reason = window.prompt('Enter reason for rejecting this farmer application (optional):');
    if (reason === null) return; // user clicked cancel

    try {
      const response = await adminUserService.updateApprovalStatus(userId, 'rejected', reason);
      if (response.success) {
        toastManager.success('Farmer application rejected.');
        fetchUsers();
      } else {
        toastManager.error(response.message || 'Failed to reject farmer');
      }
    } catch (error) {
      toastManager.error(error.message || 'Failed to reject farmer');
    }
  };

  const handleStatusToggle = async (userId, currentStatus) => {
    if (!window.confirm(`Are you sure you want to ${currentStatus ? 'block' : 'activate'} this user?`)) {
      return;
    }

    try {
      const response = await adminUserService.toggleUserStatus(userId, !currentStatus);
      if (response.success) {
        toastManager.success(response.message);
        setUsers(users.map(user =>
          user._id === userId ? { ...user, isActive: !currentStatus } : user
        ));
      }
    } catch (error) {
      toastManager.error(error.message || 'Failed to update farmer status');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this farmer? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await adminUserService.deleteUser(userId);
      if (response.success) {
        toastManager.success(response.message || 'Farmer deleted successfully');
        fetchUsers();
      }
    } catch (error) {
      toastManager.error(error.message || 'Failed to delete farmer');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col gap-3">
        <div className="flex flex-wrap justify-between items-center w-full gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-2 bg-green-50 rounded-lg border border-green-100">
              <span className="text-xs font-bold text-green-700">{totalUsers} Farmers</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreatedByMe(prev => !prev);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                createdByMe
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
              title="Filter farmers registered by your admin account"
            >
              <FiUserCheck className="w-3.5 h-3.5" />
              Added by Me ({myRegistrationsCount})
            </button>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            <FiPlus className="w-4 h-4" />
            Add Farmer
          </button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search farmers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:border-green-500 cursor-pointer w-full sm:w-auto"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Blocked Only</option>
          </select>
        </div>
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100 overflow-x-auto">
          {[
            { id: 'all', label: 'All Farmers' },
            { id: 'pending', label: ' Pending Approval' },
            { id: 'approved', label: ' Approved' },
            { id: 'rejected', label: ' Rejected' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setApprovalFilter(tab.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                approvalFilter === tab.id
                  ? tab.id === 'pending'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : tab.id === 'approved'
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : tab.id === 'rejected'
                    ? 'bg-red-100 text-red-800 border border-red-300'
                    : 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Farmer</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Joined Date</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-xs text-gray-500">Loading farmers...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-xs text-gray-500">No farmers found</td>
                </tr>
              ) : (
                users.map((user) => {
                  const isApproved = user.approvalStatus === 'approved' || (!user.approvalStatus && user.isActive);
                  const isRejected = user.approvalStatus === 'rejected';
                  const isPending = !isApproved && !isRejected;

                  return (
                    <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                            <FiUser className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-xs">{user.name}</p>
                            <p className="text-[10px] text-gray-400">ID: {user._id.slice(-6).toUpperCase()}</p>
                            {user.createdByAdmin && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 mt-0.5" title={`Created by Admin: ${user.createdByAdmin.name} (${user.createdByAdmin.email})`}>
                                🛡️ By {user.createdByAdmin.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-gray-600 text-[11px]">
                            <FiMail className="w-3 h-3" />
                            <span>{user.email || 'No email'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-600 text-[11px]">
                            <FiPhone className="w-3 h-3" />
                            <span>{user.phone}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider w-fit ${
                            isApproved
                              ? 'bg-green-100 text-green-700 border border-green-200'
                              : isRejected
                              ? 'bg-red-100 text-red-700 border border-red-200'
                              : 'bg-amber-100 text-amber-700 border border-amber-200'
                          }`}>
                            {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending Approval'}
                          </span>
                          {!user.isActive && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 w-fit">
                              Blocked
                            </span>
                          )}
                          {isRejected && user.rejectionReason && (
                            <span className="text-[9px] text-red-500 max-w-[160px] truncate" title={user.rejectionReason}>
                              {user.rejectionReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-gray-600 font-medium">
                          {new Date(user.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric'
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end items-center gap-1.5">
                          <button
                            onClick={() => setViewUser(user)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 cursor-pointer"
                            title="View Farmer Details"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                          </button>
                          {!isApproved && (
                            <button
                              onClick={() => handleApprove(user._id)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-200 cursor-pointer"
                              title="Approve Farmer"
                            >
                              <FiCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!isRejected && (
                            <button
                              onClick={() => handleReject(user._id)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-amber-200 cursor-pointer"
                              title="Reject Farmer"
                            >
                              <FiX className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleStatusToggle(user._id, user.isActive)}
                            className={`p-1.5 rounded-lg transition-colors border cursor-pointer ${
                              user.isActive
                                ? 'text-gray-400 hover:text-red-500 hover:bg-red-50 border-gray-200'
                                : 'text-green-600 hover:bg-green-50 border-green-200'
                            }`}
                            title={user.isActive ? 'Block Farmer' : 'Activate Farmer'}
                          >
                            {user.isActive ? <FiSlash className="w-3.5 h-3.5" /> : <FiCheck className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user._id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-red-200 cursor-pointer"
                            title="Delete Farmer"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && users.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/30">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">
              Showing {users.length} of {totalUsers} farmers
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-white transition-all"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-white transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Farmer Modal */}
      <AnimatePresence>
        {viewUser && (
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100000] flex items-center justify-center p-3 sm:p-4 pb-20 sm:pb-4"
            onClick={() => setViewUser(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-gray-800">Farmer Details</h3>
                <button
                  onClick={() => setViewUser(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              <dl className="p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ['Name', viewUser.name],
                  ['Farmer ID', viewUser._id.slice(-6).toUpperCase()],
                  ['Phone', viewUser.phone],
                  ['Email', viewUser.email || 'Not provided'],
                  ['Gender', viewUser.gender ? viewUser.gender.charAt(0).toUpperCase() + viewUser.gender.slice(1) : 'Not provided'],
                  ['Registered', new Date(viewUser.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })],
                  ['Approval', (viewUser.approvalStatus || (viewUser.isActive ? 'approved' : 'pending')).replace(/^./, c => c.toUpperCase())],
                  ['Account', viewUser.isActive ? 'Active' : 'Blocked'],
                  ['Created By', viewUser.createdByAdmin?.name || 'Self signup']
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
                    <dd className="text-gray-900 font-medium break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100000] flex items-center justify-center p-3 sm:p-4 pb-20 sm:pb-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-gray-800">Add New Farmer</h3>
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setNewFarmer({ name: '', phone: '', email: '', gender: '' });
                    setModalError('');
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddFarmer} className="p-4 space-y-4">
                {modalError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2 shadow-xs">
                    <FiAlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                    <span className="font-semibold leading-relaxed">{modalError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newFarmer.name}
                    onChange={(e) => {
                      if (modalError) setModalError('');
                      setNewFarmer({ ...newFarmer, name: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter farmer's name"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-gray-700">Phone Number *</label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {newFarmer.phone?.length || 0}/10 digits
                    </span>
                  </div>
                  <div className="relative flex rounded-lg shadow-xs">
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-200 bg-gray-50 text-gray-600 text-xs font-semibold select-none">
                      🇮🇳 +91
                    </span>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={newFarmer.phone}
                      onChange={(e) => {
                        if (modalError) setModalError('');
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setNewFarmer({ ...newFarmer, phone: val });
                      }}
                      className={`w-full px-3 py-2 border rounded-r-lg text-sm focus:outline-none font-medium ${
                        newFarmer.phone && newFarmer.phone.length === 10 && !/^[6-9]\d{9}$/.test(newFarmer.phone)
                          ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-red-900 bg-red-50/20'
                          : newFarmer.phone && /^[6-9]\d{9}$/.test(newFarmer.phone)
                          ? 'border-green-400 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                          : 'border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                      placeholder="Enter 10-digit mobile number"
                    />
                  </div>
                  {newFarmer.phone && newFarmer.phone.length > 0 && (
                    <div className="mt-1 text-[11px]">
                      {newFarmer.phone.length < 10 ? (
                        <p className="text-amber-600 font-medium flex items-center gap-1">
                          ⚠️ Needs 10 digits ({10 - newFarmer.phone.length} more)
                        </p>
                      ) : !/^[6-9]/.test(newFarmer.phone) ? (
                        <p className="text-red-600 font-medium flex items-center gap-1">
                          ⚠️ Indian mobile numbers must start with 6, 7, 8, or 9
                        </p>
                      ) : (
                        <p className="text-green-600 font-medium flex items-center gap-1">
                          ✓ Valid 10-digit Indian mobile number
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email Address (Optional)</label>
                  <input
                    type="email"
                    value={newFarmer.email}
                    onChange={(e) => {
                      if (modalError) setModalError('');
                      setNewFarmer({ ...newFarmer, email: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Gender (Optional)</label>
                  <select
                    value={newFarmer.gender}
                    onChange={(e) => {
                      if (modalError) setModalError('');
                      setNewFarmer({ ...newFarmer, gender: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setNewFarmer({ name: '', phone: '', email: '', gender: '' });
                      setModalError('');
                    }}
                    className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isAdding ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Adding...
                      </>
                    ) : (
                      'Add Farmer'
                    )}
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

export default AllFarmers;
