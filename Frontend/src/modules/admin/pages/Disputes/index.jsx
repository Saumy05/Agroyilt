import React, { useState, useEffect } from 'react';
import {
    FiAlertTriangle, FiSearch, FiFilter, FiCheckCircle,
    FiXCircle, FiClock, FiEye, FiMessageSquare, FiImage
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import adminDisputeService from '../../../../services/adminDisputeService';
import Modal from '../../components/Modal';

const AdminDisputes = () => {
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDispute, setSelectedDispute] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchDisputes();
    }, [statusFilter]);

    const fetchDisputes = async () => {
        try {
            setLoading(true);
            const response = await adminDisputeService.getDisputes({ status: statusFilter });
            if (response.success) {
                setDisputes(response.data);
            }
        } catch (error) {
            toastManager.error('Failed to fetch disputes');
        } finally {
            setLoading(false);
        }
    };

    const filteredDisputes = disputes.filter(d => 
        (d.bookingId?.bookingNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.raisedBy?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleViewDetails = async (id) => {
        try {
            const response = await adminDisputeService.getDisputeById(id);
            if (response.success) {
                setSelectedDispute(response.data);
                setResolutionNotes(response.data.resolutionNotes || '');
                setIsDetailsModalOpen(true);
            }
        } catch (error) {
            toastManager.error('Failed to fetch dispute details');
        }
    };

    const handleResolve = async (status) => {
        if (!resolutionNotes.trim()) {
            return toastManager.error('Please enter resolution notes');
        }

        try {
            setSubmitting(true);
            const response = await adminDisputeService.resolveDispute(selectedDispute._id, {
                status,
                resolutionNotes
            });
            if (response.success) {
                toastManager.success(`Dispute ${status} successfully`);
                setIsDetailsModalOpen(false);
                fetchDisputes();
            }
        } catch (error) {
            toastManager.error('Failed to update dispute');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            pending: 'bg-amber-100 text-amber-700 border-amber-200',
            investigating: 'bg-blue-100 text-blue-700 border-blue-200',
            resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            dismissed: 'bg-gray-100 text-gray-700 border-gray-200'
        };
        return (
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${styles[status]}`}>
                {status.toUpperCase()}
            </span>
        );
    };

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <FiAlertTriangle className="text-primary-600" />
                        Dispute Management
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Review and resolve complaints from Farmers and Vendors.</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="relative w-full sm:w-64">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search disputes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                    </div>
                    <div className="relative w-full sm:w-auto">
                        <FiFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 outline-none appearance-none cursor-pointer"
                        >
                            <option value="">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="investigating">Investigating</option>
                            <option value="resolved">Resolved</option>
                            <option value="dismissed">Dismissed</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* List Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100 text-[11px] font-black text-gray-400 uppercase tracking-widest">
                        <tr>
                            <th className="px-6 py-4">Booking #</th>
                            <th className="px-6 py-4">Raised By</th>
                            <th className="px-6 py-4">Reason</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Created At</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan="6" className="px-6 py-4 h-16 bg-gray-50/50"></td>
                                </tr>
                            ))
                        ) : filteredDisputes.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-12 text-center text-gray-400">
                                    <FiCheckCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    No disputes found.
                                </td>
                            </tr>
                        ) : (
                            filteredDisputes.map((d) => (
                                <tr key={d._id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-900">{d.bookingId?.bookingNumber || 'N/A'}</td>
                                    <td className="px-6 py-4 text-sm">
                                        <p className="font-bold text-gray-800">{d.raisedBy?.name}</p>
                                        <p className="text-xs text-gray-500">{d.raisedByRole}</p>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium">{d.reason}</td>
                                    <td className="px-6 py-4">{getStatusBadge(d.status)}</td>
                                    <td className="px-6 py-4 text-[10px] text-gray-500 font-mono">
                                        {new Date(d.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleViewDetails(d._id)}
                                            className="p-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors"
                                        >
                                            <FiEye className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Details Modal */}
            <Modal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                title="Dispute Details & Resolution"
            >
                {selectedDispute && (
                    <div className="space-y-6">
                        {/* Users Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Raised By</p>
                                <p className="font-bold text-gray-800 text-sm">{selectedDispute.raisedBy?.name}</p>
                                <p className="text-xs text-gray-500">{selectedDispute.raisedByRole}</p>
                                <p className="text-xs text-gray-500 mt-1">📞 {selectedDispute.raisedBy?.phone}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Booking Info</p>
                                <p className="font-bold text-gray-800 text-sm">#{selectedDispute.bookingId?.bookingNumber}</p>
                                <p className="text-xs text-gray-500">Status: {selectedDispute.bookingId?.status}</p>
                                <button
                                    onClick={() => window.open(`/admin/bookings/${selectedDispute.bookingId?._id}`, '_blank')}
                                    className="text-[10px] text-primary-600 font-bold mt-1 hover:underline"
                                >
                                    View Full Booking →
                                </button>
                            </div>
                        </div>

                        {/* Complaint Box */}
                        <div className="p-4 bg-primary-50/50 rounded-2xl border border-primary-100">
                            <div className="flex items-center gap-2 mb-2">
                                <FiMessageSquare className="text-primary-600" />
                                <span className="text-sm font-black text-primary-900 underline decoration-primary-200">Complaint Details</span>
                            </div>
                            <p className="text-xs font-bold text-primary-800 mb-1">{selectedDispute.reason}</p>
                            <p className="text-sm text-gray-700 leading-relaxed italic">"{selectedDispute.description}"</p>
                        </div>

                        {/* Attachments */}
                        {selectedDispute.attachments?.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                                    <FiImage /> Attachments / Evidence
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {selectedDispute.attachments.map((img, i) => (
                                        <div key={i} className="aspect-square rounded-xl overflow-hidden border border-gray-200 group relative">
                                            <img src={img} alt="evidence" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => window.open(img, '_blank')}
                                                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold"
                                            >
                                                Preview
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Resolution Form */}
                        <div className="space-y-3 pt-4 border-t border-gray-100">
                            <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <FiCheckCircle className="text-emerald-500" />
                                Resolution Notes
                            </p>
                            <textarea
                                value={resolutionNotes}
                                onChange={(e) => setResolutionNotes(e.target.value)}
                                placeholder="Details of your investigation or decision..."
                                className="w-full h-24 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                disabled={selectedDispute.status === 'resolved' || selectedDispute.status === 'dismissed'}
                            />

                            {/* Buttons */}
                            {selectedDispute.status !== 'resolved' && selectedDispute.status !== 'dismissed' ? (
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => handleResolve('dismissed')}
                                        disabled={submitting}
                                        className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors"
                                    >
                                        <FiXCircle className="inline mr-2" />
                                        Dismiss
                                    </button>
                                    <button
                                        onClick={() => handleResolve('resolved')}
                                        disabled={submitting}
                                        className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 active:scale-95 transition-transform"
                                    >
                                        <FiCheckCircle className="inline mr-2" />
                                        Mark Resolved
                                    </button>
                                </div>
                            ) : (
                                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl flex items-center gap-3">
                                    <FiCheckCircle size={20} />
                                    <div>
                                        <p className="text-xs font-bold">Case Closed</p>
                                        <p className="text-[10px] opacity-80">Resolved by {selectedDispute.resolvedBy?.name} on {new Date(selectedDispute.resolvedAt).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default AdminDisputes;
