import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiX, FiEye, FiSearch, FiFileText, FiDownload, FiRefreshCw } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { adminUserService } from '../../../../services/adminUserService';
import CardShell from '../UserCategories/components/CardShell';
import Modal from '../UserCategories/components/Modal';

const StatusBadge = ({ status }) => {
    const styles = {
        pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        verified: 'bg-green-100 text-green-800 border-green-300',
        rejected: 'bg-red-100 text-red-800 border-red-300',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${styles[status] || styles.pending}`}>
            {status}
        </span>
    );
};

const DocImage = ({ src, label }) => {
    if (!src) return (
        <div className="flex items-center justify-center h-32 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300">
            <p className="text-xs text-gray-400">No Document</p>
        </div>
    );
    return (
        <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <img src={src} alt={label} className="w-full h-32 object-cover rounded-xl border-2 border-gray-200" />
            <a href={src} target="_blank" rel="noreferrer" download
                className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-semibold">
                <FiDownload className="w-3 h-3" /> Download
            </a>
        </div>
    );
};

const KycVerification = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedUser, setSelectedUser] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const res = await adminUserService.getAllUsers({ limit: 100 });
            if (res.success) {
                // Show only users who have submitted at least one KYC document
                const kycUsers = res.data.filter(u => u.kyc_documents && u.kyc_documents.length > 0);
                setUsers(kycUsers);
            }
        } catch (err) {
            toastManager.error('Failed to load KYC records');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, []);

    const filteredUsers = users.filter(u => {
        const matchSearch = u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.phone?.includes(searchQuery);
        const matchStatus = filterStatus === 'all' || (u.kyc_status || 'pending') === filterStatus;
        return matchSearch && matchStatus;
    });

    const handleAction = async (userId, newStatus) => {
        try {
            setActionLoading(true);
            const res = await adminUserService.updateKycStatus(userId, newStatus);
            if (res.success) {
                setUsers(prev => prev.map(u => u._id === userId ? { ...u, kyc_status: newStatus } : u));
                if (selectedUser?._id === userId) setSelectedUser(prev => ({ ...prev, kyc_status: newStatus }));
                toastManager.success(`KYC ${newStatus === 'verified' ? 'Approved' : 'Rejected'} successfully!`);
            } else {
                toastManager.error(res.message || 'Action failed');
            }
        } catch (err) {
            toastManager.error('Failed to update details');
        } finally {
            setActionLoading(false);
        }
    };

    const pendingCount = users.filter(u => !u.kyc_status || u.kyc_status === 'pending').length;
    const verifiedCount = users.filter(u => u.kyc_status === 'verified').length;
    const rejectedCount = users.filter(u => u.kyc_status === 'rejected').length;

    return (
        <div className="space-y-4">
            <CardShell icon={FiFileText} title="KYC Verification" subtitle="Review and verify vendor documents">

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider mb-1">Pending</div>
                        <div className="text-2xl font-bold text-yellow-900">{pendingCount}</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1">Verified</div>
                        <div className="text-2xl font-bold text-green-900">{verifiedCount}</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">Rejected</div>
                        <div className="text-2xl font-bold text-red-900">{rejectedCount}</div>
                    </div>
                </div>

                {/* Search + Filter */}
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input type="text" placeholder="Search by name or phone..."
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-xs"
                        />
                    </div>
                    <div className="flex gap-1.5">
                        {['all', 'pending', 'verified', 'rejected'].map(s => (
                            <button key={s} onClick={() => setFilterStatus(s)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all ${filterStatus === s ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                {s}
                            </button>
                        ))}
                        <button onClick={loadUsers} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all">
                            <FiRefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Docs Submitted</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">KYC Status</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr><td colSpan="4" className="px-4 py-8 text-center text-xs text-gray-500">Loading KYC records...</td></tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr><td colSpan="4" className="px-4 py-8 text-center text-xs text-gray-500">No KYC submissions found</td></tr>
                                ) : filteredUsers.map(user => (
                                    <motion.tr key={user._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="font-bold text-gray-900 text-xs">{user.name}</p>
                                            <p className="text-[10px] text-gray-400">{user.phone}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs font-semibold text-blue-600">
                                                {user.kyc_documents?.length || 0} document(s)
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={user.kyc_status || 'pending'} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={() => { setSelectedUser(user); setModalOpen(true); }}
                                                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="View Documents">
                                                    <FiEye className="w-3.5 h-3.5" />
                                                </button>
                                                {(!user.kyc_status || user.kyc_status === 'pending') && (
                                                    <>
                                                        <button onClick={() => handleAction(user._id, 'verified')}
                                                            className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg transition-colors" title="Approve KYC">
                                                            <FiCheck className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => handleAction(user._id, 'rejected')}
                                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Reject KYC">
                                                            <FiX className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </CardShell>

            {/* Document Preview Modal */}
            <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setSelectedUser(null); }}
                title="KYC Document Review" size="lg">
                {selectedUser && (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <div>
                                <p className="font-bold text-gray-900">{selectedUser.name}</p>
                                <p className="text-xs text-gray-500">{selectedUser.phone}</p>
                            </div>
                            <StatusBadge status={selectedUser.kyc_status || 'pending'} />
                        </div>

                        {selectedUser.kyc_documents?.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {selectedUser.kyc_documents.map((doc, idx) => (
                                    <DocImage key={idx} src={doc} label={`Document ${idx + 1}`} />
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-sm text-gray-400">No documents uploaded yet.</div>
                        )}

                        {(!selectedUser.kyc_status || selectedUser.kyc_status === 'pending') && (
                            <div className="flex gap-3 pt-4 border-t border-gray-200">
                                <button disabled={actionLoading}
                                    onClick={async () => { await handleAction(selectedUser._id, 'verified'); setModalOpen(false); }}
                                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                                    <FiCheck className="w-4 h-4" /> Approve Documents
                                </button>
                                <button disabled={actionLoading}
                                    onClick={async () => { await handleAction(selectedUser._id, 'rejected'); setModalOpen(false); }}
                                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                                    <FiX className="w-4 h-4" /> Reject Documents
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default KycVerification;
