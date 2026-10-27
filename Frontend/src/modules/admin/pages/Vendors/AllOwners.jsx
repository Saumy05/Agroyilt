import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiX, FiEye, FiSearch, FiFilter, FiDownload, FiLoader, FiPower, FiTrash2, FiPlus, FiUpload, FiUserCheck } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { downloadFile } from '../../../../utils/downloadFile';
import CardShell from '../UserCategories/components/CardShell';
import Modal from '../UserCategories/components/Modal';
import adminVendorService from '../../../../services/adminVendorService';
import { publicCatalogService } from '../../../../services/catalogService';
import GoogleMapPicker from '../../../vendor/pages/AddressManagement/components/GoogleMapPicker';
import { calculateAge } from '../../../../utils/age';
import { refreshAdminCounts } from '../../utils/adminCounts';
import { FeeStatusBadge, LocationCell, FeeFilter } from '../../components/common/FeeAndLocation';

const AllOwners = () => {
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
  const [feeFilter, setFeeFilter] = useState(''); // '', PAID, UNPAID
  const [createdByMe, setCreatedByMe] = useState(false);
  const [myRegistrationsCount, setMyRegistrationsCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [analytics, setAnalytics] = useState({ totalVendors: 0, totalBookings: 0 });

  // Add Owner modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    businessName: '',
    service: [],
    aadhar: '',
    pan: '',
    aadharDocument: '',
    aadharBackDocument: '',
    panDocument: '',
    otherDocuments: []
  });
  const [documentPreviews, setDocumentPreviews] = useState({
    aadhar: '',
    aadharBack: '',
    pan: ''
  });
  const [uploadingDocs, setUploadingDocs] = useState({
    aadhar: false,
    aadharBack: false,
    pan: false
  });

  // Load owners and categories from backend
  useEffect(() => {
    loadOwners();
    fetchAnalytics();
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await publicCatalogService.getVendorCategories();
      if (response.success) {
        setCategories(response.categories || []);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await adminVendorService.getVendorAnalytics();
      if (response.success) {
        setAnalytics({
          totalVendors: response.data.totalVendors || 0,
          totalBookings: response.data.totalBookings || 0
        });
      }
    } catch (error) {
      console.error('Error fetching vendor analytics:', error);
    }
  };

  const loadOwners = async () => {
    try {
      setLoading(true);
      const params = {};
      if (createdByMe) {
        params.createdByMe = 'true';
      }
      const response = await adminVendorService.getAllVendors(params);
      if (response.success) {
        if (response.counts?.myRegistrations !== undefined) {
          setMyRegistrationsCount(response.counts.myRegistrations);
        }
        // Transform backend data to frontend format
        const transformedOwners = response.data.map(owner => ({
          id: owner._id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
          gender: owner.gender,
          dateOfBirth: owner.dateOfBirth,
          businessName: owner.businessName,
          service: owner.service,
          approvalStatus: owner.approvalStatus,
          aadhar: owner.aadhar?.number,
          pan: owner.pan?.number,
          address: owner.address,       // ← address field add kiya
          districtName: owner.districtName,
          subDistrictName: owner.subDistrictName,
          shopDetails: owner.shopDetails,
          registrationFeeStatus: owner.registrationFeeStatus,
          registrationFeeAmount: owner.registrationFeeAmount,
          cityId: owner.cityId,         // ← cityId add kiya
          createdByAdmin: owner.createdByAdmin,
          documents: {
            aadhar: owner.aadhar?.document,
            aadharBack: owner.aadhar?.backDocument,
            pan: owner.pan?.document,
            other: owner.otherDocuments?.[0]
          },
          createdAt: owner.createdAt,
          isActive: owner.isActive
        }));
        setOwners(transformedOwners);
      } else {
        toastManager.error(response.message || 'Failed to load owners');
      }
    } catch (error) {
      console.error('Error loading owners:', error);
      toastManager.error('Failed to load owners. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOwners();
  }, [createdByMe]);

  const filteredOwners = useMemo(() => {
    return owners.filter(owner => {
      const serviceString = Array.isArray(owner.service)
        ? owner.service.join(' ')
        : (owner.service || '');

      const matchesStatus = filterStatus === 'all' || owner.approvalStatus === filterStatus;

      const matchesSearch =
        (owner.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (owner.email || '').toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (owner.phone || '').includes(searchQuery.trim()) ||
        serviceString.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (owner.businessName && owner.businessName.toLowerCase().includes(searchQuery.trim().toLowerCase()));
      const matchesFee = !feeFilter || (feeFilter === 'PAID') === (owner.registrationFeeStatus === 'PAID');
      return matchesStatus && matchesSearch && matchesFee;
    });
  }, [owners, filterStatus, feeFilter, searchQuery]);

  const handleApprove = async (ownerId) => {
    try {
      const response = await adminVendorService.approveVendor(ownerId);
      if (response.success) {
        setOwners(prev => prev.map(o =>
          o.id === ownerId ? { ...o, approvalStatus: 'approved' } : o
        ));
        toastManager.success('Vendor approved successfully!');
        refreshAdminCounts();
      } else {
        toastManager.error(response.message || 'Failed to approve owner');
      }
    } catch (error) {
      console.error('Error approving owner:', error);
      toastManager.error('Failed to approve owner. Please try again.');
    }
  };

  const handleReject = async (ownerId) => {
    try {
      const response = await adminVendorService.rejectVendor(ownerId);
      if (response.success) {
        setOwners(prev => prev.map(o =>
          o.id === ownerId ? { ...o, approvalStatus: 'rejected' } : o
        ));
        toastManager.success('Vendor rejected successfully.');
        refreshAdminCounts();
      } else {
        toastManager.error(response.message || 'Failed to reject owner');
      }
    } catch (error) {
      console.error('Error rejecting owner:', error);
      toastManager.error('Failed to reject owner. Please try again.');
    }
  };

  const handleToggleStatus = async (ownerId, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      const response = await adminVendorService.toggleStatus(ownerId, newStatus);
      if (response.success) {
        setOwners(prev => prev.map(o =>
          o.id === ownerId ? { ...o, isActive: newStatus } : o
        ));
        toastManager.success(`Vendor ${newStatus ? 'activated' : 'deactivated'} successfully`);
      } else {
        toastManager.error(response.message || 'Failed to update owner status');
      }
    } catch (error) {
      console.error('Error toggling owner status:', error);
      toastManager.error('Failed to update status');
    }
  };

  const handleDelete = async (ownerId) => {
    if (!window.confirm('Are you sure you want to delete this owner? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await adminVendorService.deleteVendor(ownerId);
      if (response.success) {
        setOwners(prev => prev.filter(o => o.id !== ownerId));
        toastManager.success('Vendor deleted successfully');
      } else {
        toastManager.error(response.message || 'Failed to delete owner');
      }
    } catch (error) {
      console.error('Error deleting owner:', error);
      toastManager.error('Failed to delete owner');
    }
  };

  const handleViewDetails = (owner) => {
    setSelectedOwner(owner);
    setIsViewModalOpen(true);
  };

  const handleDocumentUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toastManager.error('Please upload a valid image or PDF');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toastManager.error('File size should be less than 15MB');
      return;
    }

    setUploadingDocs(prev => ({ ...prev, [type]: true }));
    const loadingToast = toastManager.info("Processing file...");

    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const previewUrl = reader.result;
        setFormData(prev => ({
          ...prev,
          [`${type}Document`]: previewUrl
        }));
        setDocumentPreviews(prev => ({
          ...prev,
          [type]: previewUrl
        }));
        setUploadingDocs(prev => ({ ...prev, [type]: false }));
        toastManager.dismiss(loadingToast);
        toastManager.success("Document uploaded successfully!", { duration: 2000 });
      };

      reader.onerror = () => {
        toastManager.error("Failed to read file");
        setUploadingDocs(prev => ({ ...prev, [type]: false }));
      };

      reader.readAsDataURL(file);
    } catch (error) {
      toastManager.dismiss(loadingToast);
      toastManager.error("Failed to process file");
      setUploadingDocs(prev => ({ ...prev, [type]: false }));
    }
  };

  const removeDocument = (type) => {
    setFormData(prev => ({
      ...prev,
      [`${type}Document`]: ''
    }));
    setDocumentPreviews(prev => ({
      ...prev,
      [type]: ''
    }));
  };

  const handleAddOwnerSubmit = async (e) => {
    e.preventDefault();

    // Validations
    if (!formData.name.trim()) return toastManager.error('Please enter owner name');
    if (!formData.businessName.trim()) return toastManager.error('Please enter business name');
    if (formData.service.length === 0) {
      return toastManager.error('Please select at least one service category or additional service');
    }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return toastManager.error('Please enter a valid email');
    }
    if (!formData.phone.trim()) return toastManager.error('Please enter phone number');
    if (!/^[6-9]\d{9}$/.test(formData.phone)) return toastManager.error('Please enter a valid 10-digit Indian phone number');
    if (!formData.aadhar.trim()) return toastManager.error('Please enter Aadhar number');
    if (!/^\d{12}$/.test(formData.aadhar)) return toastManager.error('Please enter a valid 12-digit Aadhar number');
    if (formData.pan.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.pan.toUpperCase())) {
      return toastManager.error('Please enter a valid PAN number');
    }

    if (!formData.aadharDocument) return toastManager.error('Please upload Aadhar card front');
    if (!formData.aadharBackDocument) return toastManager.error('Please upload Aadhar card back');

    try {
      setIsAdding(true);
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        businessName: formData.businessName,
        service: formData.service,
        aadhar: formData.aadhar,
        pan: formData.pan.toUpperCase(),
        aadharDocument: formData.aadharDocument,
        aadharBackDocument: formData.aadharBackDocument,
        panDocument: formData.panDocument,
        otherDocuments: formData.otherDocuments
      };
      
      const response = await adminVendorService.addVendor(payload);
      if (response.success) {
        toastManager.success('Vendor registered successfully!');
        setIsAddModalOpen(false);
        // Reset form
        setFormData({
          name: '',
          email: '',
          phone: '',
          businessName: '',
          service: [],
          aadhar: '',
          pan: '',
          aadharDocument: '',
          aadharBackDocument: '',
          panDocument: '',
          otherDocuments: []
        });
        setDocumentPreviews({
          aadhar: '',
          aadharBack: '',
          pan: ''
        });
        loadOwners();
      } else {
        toastManager.error(response.message || 'Failed to register vendor');
      }
    } catch (error) {
      console.error('Error adding vendor:', error);
      toastManager.error(error.response?.data?.message || 'Failed to register vendor');
    } finally {
      setIsAdding(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      approved: 'bg-green-100 text-green-800 border-green-300',
      rejected: 'bg-red-100 text-red-800 border-red-300'
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const pendingCount = owners.filter(v => v.approvalStatus === 'pending').length;
  const approvedCount = owners.filter(v => v.approvalStatus === 'approved').length;
  const rejectedCount = owners.filter(v => v.approvalStatus === 'rejected').length;

  return (
    <div className="space-y-4">
      <CardShell
        icon={FiFilter}
        title="Vendor Management"
        subtitle="Manage and verify platform vendors"
      >
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">Total Vendors</div>
            <div className="text-xl font-bold text-blue-900">{analytics.totalVendors || owners.length}</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1">Total Bookings</div>
            <div className="text-xl font-bold text-purple-900">{analytics.totalBookings}</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider mb-1">Pending</div>
            <div className="text-xl font-bold text-yellow-900">{pendingCount}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1">Approved</div>
            <div className="text-xl font-bold text-green-900">{approvedCount}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">Rejected</div>
            <div className="text-xl font-bold text-red-900">{rejectedCount}</div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col gap-4">
          {/* Top row for actions */}
          <div className="flex justify-end w-full">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-[#347989] hover:bg-[#2c6573] text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2 shadow-sm shrink-0"
            >
              <FiPlus className="w-4 h-4" />
              Add Vendor
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search vendors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
              {['all', 'pending', 'approved', 'rejected'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all whitespace-nowrap ${filterStatus === status
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {status}
                </button>
              ))}

              <FeeFilter value={feeFilter} onChange={setFeeFilter} />

              <button
                type="button"
                onClick={() => setCreatedByMe(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer whitespace-nowrap ${
                  createdByMe
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
                title="Filter vendors registered by your admin account"
              >
                <FiUserCheck className="w-3.5 h-3.5" />
                Added by Me ({myRegistrationsCount})
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Vendor Details</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Business Info</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-xs text-gray-500">Loading vendors...</td>
                  </tr>
                ) : filteredOwners.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-xs text-gray-500">No vendors found</td>
                  </tr>
                ) : (
                  filteredOwners.map((owner) => (
                    <tr key={owner.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-gray-900 text-xs">{owner.name}</p>
                          <p className="text-[10px] text-gray-500">{owner.phone}</p>
                          <p className="text-[10px] text-gray-400">{owner.email}</p>
                          {owner.createdByAdmin && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 mt-0.5" title={`Created by Admin: ${owner.createdByAdmin.name} (${owner.createdByAdmin.email})`}>
                              🛡️ By {owner.createdByAdmin.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-gray-800 text-xs">{owner.businessName || 'N/A'}</p>
                          <p className="text-[10px] text-blue-600 font-medium">
                            {Array.isArray(owner.service) ? owner.service.join(', ') : (owner.service || 'No equipment')}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <LocationCell entity={owner} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${owner.approvalStatus === 'approved' ? 'bg-green-50 text-green-700 border-green-100' :
                            owner.approvalStatus === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                              'bg-yellow-50 text-yellow-700 border-yellow-100'
                            }`}>
                            {owner.approvalStatus}
                          </span>
                        <FeeStatusBadge status={owner.registrationFeeStatus} amount={owner.registrationFeeAmount} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* View Details */}
                          <button
                            onClick={() => handleViewDetails(owner)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                          </button>
 
                          {/* Toggle Active Status */}
                          <button
                            onClick={() => handleToggleStatus(owner.id, owner.isActive)}
                            className={`p-1.5 rounded-lg transition-colors ${owner.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                            title={owner.isActive ? "Disable Login" : "Enable Login"}
                          >
                            <FiPower className={`w-3.5 h-3.5 ${owner.isActive ? 'fill-current' : ''}`} />
                          </button>
 
                          {/* Approve/Reject (Only for pending) */}
                          {owner.approvalStatus === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(owner.id)}
                                className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                                title="Approve"
                              >
                                <FiCheck className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReject(owner.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Reject"
                              >
                                <FiX className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
 
                          {/* Delete Owner */}
                          <button
                            onClick={() => handleDelete(owner.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Vendor"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardShell >

      {/* View Vendor Details Modal */}
      < Modal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedOwner(null);
        }}
        title="Vendor Details"
        size="lg"
      >
        {selectedOwner && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Business Name</label>
                <div className="text-gray-900">{selectedOwner.businessName || 'N/A'}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Vendor Name</label>
                <div className="text-gray-900">{selectedOwner.name}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <div className="text-gray-900">{selectedOwner.email}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                <div className="text-gray-900">{selectedOwner.phone}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Gender</label>
                <div className="text-gray-900">
                  {selectedOwner.gender ? selectedOwner.gender.charAt(0).toUpperCase() + selectedOwner.gender.slice(1) : 'Not provided'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Age</label>
                <div className="text-gray-900">
                  {selectedOwner.dateOfBirth
                    ? `${calculateAge(selectedOwner.dateOfBirth)} years (DOB ${new Date(selectedOwner.dateOfBirth).toLocaleDateString('en-IN', { timeZone: 'UTC' })})`
                    : 'Not provided'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Aadhar Number</label>
                <div className="text-gray-900 font-mono">{selectedOwner.aadhar || 'Not provided'}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">PAN Number</label>
                <div className="text-gray-900 font-mono">{selectedOwner.pan || 'Not provided'}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Equipment Category</label>
                <div className="text-gray-900">
                  {Array.isArray(selectedOwner.service) ? selectedOwner.service.join(', ') : (selectedOwner.service || 'N/A')}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                <div>{getStatusBadge(selectedOwner.approvalStatus)}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Registration Fee</label>
                <FeeStatusBadge status={selectedOwner.registrationFeeStatus} amount={selectedOwner.registrationFeeAmount} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Location</label>
                <LocationCell entity={selectedOwner} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Registered On</label>
                <div className="text-gray-900">
                  {new Date(selectedOwner.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Active</label>
                <div className={`text-sm font-semibold ${selectedOwner.isActive ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedOwner.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
 
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Verification Documents</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedOwner.documents.aadhar && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">Aadhar Front</label>
                    <img
                      src={selectedOwner.documents.aadhar}
                      alt="Aadhar Front"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => downloadFile(selectedOwner.documents.aadhar, `${selectedOwner.name}_aadhar_front`)}
                      className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      <FiDownload className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                )}
                {selectedOwner.documents.aadharBack && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">Aadhar Back</label>
                    <img
                      src={selectedOwner.documents.aadharBack}
                      alt="Aadhar Back"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => downloadFile(selectedOwner.documents.aadharBack, `${selectedOwner.name}_aadhar_back`)}
                      className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      <FiDownload className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                )}
                {selectedOwner.documents.pan && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">PAN Card</label>
                    <img
                      src={selectedOwner.documents.pan}
                      alt="PAN"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => downloadFile(selectedOwner.documents.pan, `${selectedOwner.name}_pan_card`)}
                      className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      <FiDownload className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                )}
              </div>
            </div>

            {selectedOwner.approvalStatus === 'pending' && (
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={async () => {
                    await handleApprove(selectedOwner.id);
                    setIsViewModalOpen(false);
                    setSelectedOwner(null);
                  }}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiCheck className="w-5 h-5" />
                  Approve Vendor
                </button>
                <button
                  onClick={async () => {
                    await handleReject(selectedOwner.id);
                    setIsViewModalOpen(false);
                    setSelectedOwner(null);
                  }}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiX className="w-5 h-5" />
                  Reject Vendor
                </button>
              </div>
            )}
          </div>
        )}
      </Modal >

      {/* Add Equipment Owner Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setFormData({
            name: '',
            email: '',
            phone: '',
            businessName: '',
            service: [],
            aadhar: '',
            pan: '',
            aadharDocument: '',
            aadharBackDocument: '',
            panDocument: '',
            otherDocuments: []
          });
          setDocumentPreviews({
            aadhar: '',
            aadharBack: '',
            pan: ''
          });
        }}
        title="Add Vendor"
        size="lg"
      >
        <form onSubmit={handleAddOwnerSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Column: Business Details */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-gray-900 border-b pb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-4 bg-[#347989] rounded-full"></span>
                Business Profile
              </h3>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Vendor Name</label>
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.replace(/[^A-Za-z\s]/g, '') }))}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#347989]/20 focus:border-[#347989] outline-none text-xs transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Business / Farm Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Krishna Agri Services"
                  value={formData.businessName}
                  onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#347989]/20 focus:border-[#347989] outline-none text-xs transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Equipment Category (Select All That Apply)</label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 border border-gray-200 rounded-xl bg-gray-50/50">
                  {categories.map((cat) => {
                    const isSelected = formData.service.includes(cat.title);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setFormData(prev => {
                            const selected = prev.service.includes(cat.title)
                              ? prev.service.filter(s => s !== cat.title)
                              : [...prev.service, cat.title];
                            return { ...prev, service: selected };
                          });
                        }}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all ${
                          isSelected
                            ? 'bg-[#347989] text-white border-[#347989] shadow-sm'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-[#347989]'
                        }`}
                      >
                        {cat.title}
                      </button>
                    );
                  })}
                  {categories.length === 0 && (
                    <p className="text-[10px] text-gray-400 italic">No categories available</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address (Optional)</label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#347989]/20 focus:border-[#347989] outline-none text-xs transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#347989]/20 focus:border-[#347989] outline-none text-xs transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Aadhar Number</label>
                  <input
                    type="text"
                    required
                    placeholder="12-digit Aadhar"
                    value={formData.aadhar}
                    onChange={(e) => setFormData(prev => ({ ...prev, aadhar: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#347989]/20 focus:border-[#347989] outline-none text-xs transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">PAN Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. ABCDE1234F"
                    value={formData.pan}
                    onChange={(e) => setFormData(prev => ({ ...prev, pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }))}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#347989]/20 focus:border-[#347989] outline-none text-xs transition-all"
                  />
                </div>
              </div>

            </div>

            {/* Right Column: Identity Documents */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-gray-900 border-b pb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-4 bg-[#347989] rounded-full"></span>
                Identity Documents
              </h3>

              <div className="grid grid-cols-2 gap-4">
                
                {/* Aadhar Front Upload */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Aadhar Card Front</p>
                  {documentPreviews.aadhar ? (
                    <div className="relative group overflow-hidden rounded-xl border border-gray-200">
                      <img src={documentPreviews.aadhar} className="w-full h-24 object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button type="button" onClick={() => removeDocument('aadhar')} className="bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-colors shadow-lg">
                          <FiX size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-all hover:border-[#347989] bg-white relative">
                      {uploadingDocs.aadhar && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-xl">
                          <FiLoader className="animate-spin h-5 w-5 text-[#347989]" />
                        </div>
                      )}
                      <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                        <FiUpload className="w-5 h-5 text-gray-400 mb-1" />
                        <span className="text-[9px] text-gray-500 font-bold">Upload Front</span>
                        <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleDocumentUpload(e, 'aadhar')} disabled={uploadingDocs.aadhar} />
                      </label>
                    </div>
                  )}
                </div>

                {/* Aadhar Back Upload */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Aadhar Card Back</p>
                  {documentPreviews.aadharBack ? (
                    <div className="relative group overflow-hidden rounded-xl border border-gray-200">
                      <img src={documentPreviews.aadharBack} className="w-full h-24 object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button type="button" onClick={() => removeDocument('aadharBack')} className="bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-colors shadow-lg">
                          <FiX size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-all hover:border-[#347989] bg-white relative">
                      {uploadingDocs.aadharBack && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-xl">
                          <FiLoader className="animate-spin h-5 w-5 text-[#347989]" />
                        </div>
                      )}
                      <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                        <FiUpload className="w-5 h-5 text-gray-400 mb-1" />
                        <span className="text-[9px] text-gray-500 font-bold">Upload Back</span>
                        <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleDocumentUpload(e, 'aadharBack')} disabled={uploadingDocs.aadharBack} />
                      </label>
                    </div>
                  )}
                </div>

                {/* PAN Upload */}
                <div className="space-y-1.5 col-span-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">PAN Card Front (Optional)</p>
                  {documentPreviews.pan ? (
                    <div className="relative group overflow-hidden rounded-xl border border-gray-200 max-w-xs mx-auto">
                      <img src={documentPreviews.pan} className="w-full h-24 object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button type="button" onClick={() => removeDocument('pan')} className="bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-colors shadow-lg">
                          <FiX size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-all hover:border-[#347989] bg-white relative max-w-xs mx-auto">
                      {uploadingDocs.pan && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-xl">
                          <FiLoader className="animate-spin h-5 w-5 text-[#347989]" />
                        </div>
                      )}
                      <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                        <FiUpload className="w-5 h-5 text-gray-400 mb-1" />
                        <span className="text-[9px] text-gray-500 font-bold">Upload PAN</span>
                        <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleDocumentUpload(e, 'pan')} disabled={uploadingDocs.pan} />
                      </label>
                    </div>
                  )}
                </div>

              </div>

              <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl mt-4">
                <p className="text-[10px] text-teal-700 leading-relaxed italic">
                  Note: Vendors registered directly by the admin are automatically verified and marked active, allowing immediate catalog listing and login.
                </p>
              </div>

            </div>

          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setFormData({
                  name: '',
                  email: '',
                  phone: '',
                  businessName: '',
                  service: [],
                  aadhar: '',
                  pan: '',
                  aadharDocument: '',
                  aadharBackDocument: '',
                  panDocument: '',
                  otherDocuments: []
                });
                setDocumentPreviews({
                  aadhar: '',
                  aadharBack: '',
                  pan: ''
                });
              }}
              className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding || uploadingDocs.aadhar || uploadingDocs.aadharBack || uploadingDocs.pan}
              className="px-5 py-2 bg-[#347989] text-white rounded-xl text-xs font-bold hover:bg-[#28606c] disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm shadow-[#347989]/10"
            >
              {isAdding ? (
                <>
                  <FiLoader className="animate-spin h-3.5 w-3.5" />
                  Creating...
                </>
              ) : (
                'Register Vendor'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div >
  );
};

export default AllOwners;
