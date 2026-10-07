import React, { useState, useEffect } from 'react';
import { FiShoppingBag, FiMapPin, FiPhone, FiMail, FiUser, FiExternalLink, FiSearch, FiCheckCircle, FiEye, FiX } from 'react-icons/fi';
import api from '../../../../services/api';
import { toastManager } from '../../../../utils/toastManager';
import { motion, AnimatePresence } from 'framer-motion';

const RegisteredShops = () => {
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [previewDoc, setPreviewDoc] = useState(null);

    useEffect(() => {
        fetchShops();
    }, []);

    const fetchShops = async () => {
        try {
            setLoading(true);
            const res = await api.get('/admin/vendors/approved-shops');
            if (res.data.success) {
                setShops(res.data.data);
            }
        } catch (err) {
            toastManager.error("Failed to load registered shops");
        } finally {
            setLoading(false);
        }
    };

    const filteredShops = shops.filter(shop => 
        shop.shopDetails?.shopName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shop.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) return <div className="p-10 text-center font-bold text-gray-400">Loading registered shops...</div>;

    return (
        <div className="p-6 max-w-[1600px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 tracking-tight">Agri Marketplace Stores</h1>
                    <p className="text-gray-400 text-[11px] font-bold uppercase tracking-widest mt-1">Verified Partners Registry</p>
                </div>
                
                <div className="relative">
                    <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search shops or owners..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-12 pr-6 py-3.5 bg-gray-50 border border-transparent rounded-[20px] w-full md:w-96 shadow-inner outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium"
                    />
                </div>
            </div>

            <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-50">
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[2px]">Shop & Status</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[2px]">Vendor Details</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[2px]">Location</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[2px]">Products & Stock</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[2px]">License</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[2px] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredShops.map((vendor) => (
                                <tr key={vendor._id} className="hover:bg-gray-50/30 transition-colors group">
                                    <td className="px-6 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-600 shadow-sm border border-teal-100/50">
                                                <FiShoppingBag className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="font-black text-gray-800 text-sm">{vendor.shopDetails?.shopName}</p>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <FiCheckCircle className="text-green-500 w-3 h-3" />
                                                    <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Verified Shop</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-gray-700">
                                                <FiUser className="w-3 h-3 text-gray-400" />
                                                <span className="text-xs font-bold">{vendor.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <FiPhone className="w-3 h-3" />
                                                <span className="text-[11px] font-medium">{vendor.phone}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <FiMail className="w-3 h-3" />
                                                <span className="text-[11px] font-medium truncate max-w-[150px]">{vendor.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 max-w-[250px]">
                                        <div className="flex items-start gap-2">
                                            <FiMapPin className="w-3.5 h-3.5 text-rose-400 mt-1 shrink-0" />
                                            <div>
                                                <p className="text-[11px] text-gray-600 font-medium line-clamp-2 leading-relaxed">
                                                    {vendor.shopDetails?.shopAddress}
                                                </p>
                                                {vendor.shopDetails?.shopLocation?.lat && (
                                                    <a 
                                                        href={`https://www.google.com/maps?q=${vendor.shopDetails.shopLocation.lat},${vendor.shopDetails.shopLocation.lng}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-[9px] font-black text-teal-600 uppercase tracking-widest mt-1 hover:underline underline-offset-4"
                                                    >
                                                        Google Maps <FiExternalLink className="w-2.5 h-2.5" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                <div className="text-center">
                                                    <p className="text-base font-black text-slate-800">{vendor.productStats?.totalProducts ?? 0}</p>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase">Total</p>
                                                </div>
                                                <div className="w-px h-8 bg-slate-100" />
                                                <div className="text-center">
                                                    <p className="text-base font-black text-emerald-600">{vendor.productStats?.approvedProducts ?? 0}</p>
                                                    <p className="text-[9px] font-black text-emerald-400 uppercase">Live</p>
                                                </div>
                                                <div className="w-px h-8 bg-slate-100" />
                                                <div className="text-center">
                                                    <p className="text-base font-black text-amber-600">{vendor.productStats?.pendingProducts ?? 0}</p>
                                                    <p className="text-[9px] font-black text-amber-400 uppercase">Pending</p>
                                                </div>
                                            </div>
                                            <div className="bg-slate-50 px-3 py-1.5 rounded-xl">
                                                <p className="text-[10px] text-slate-500 font-bold">Stock: <span className="text-slate-800 font-black">{vendor.productStats?.totalStock ?? 0} units</span></p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 inline-block font-mono text-[11px] text-gray-600 font-bold uppercase tracking-wider">
                                            {vendor.shopDetails?.shopLicense || '---'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-right">
                                        <button 
                                            onClick={() => setPreviewDoc(vendor.shopDetails?.licenseDocument)}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-teal-600/20 hover:bg-teal-700 active:scale-95 transition-all"
                                        >
                                            <FiEye className="w-3.5 h-3.5" />
                                            View License
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* In-page Document Preview Modal */}
            <AnimatePresence>
                {previewDoc && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-10">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setPreviewDoc(null)}
                            className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-5xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-full"
                        >
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black text-gray-800">License Document Preview</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Verified Shop Credentials</p>
                                </div>
                                <button 
                                    onClick={() => setPreviewDoc(null)}
                                    className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                                >
                                    <FiX className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto bg-gray-100 p-4 md:p-8 flex items-center justify-center min-h-[400px]">
                                {previewDoc.toLowerCase().endsWith('.pdf') ? (
                                    <iframe 
                                        src={`${previewDoc}#toolbar=0`} 
                                        className="w-full h-full min-h-[600px] rounded-2xl shadow-lg border-none"
                                        title="License PDF"
                                    />
                                ) : (
                                    <img 
                                        src={previewDoc} 
                                        alt="License Document" 
                                        className="max-w-full h-auto rounded-2xl shadow-2xl border-4 border-white"
                                    />
                                )}
                            </div>

                            <div className="p-6 bg-white border-t border-gray-100 flex justify-end gap-3">
                                <a 
                                    href={previewDoc} 
                                    download 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="px-6 py-3.5 bg-gray-50 text-gray-600 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all flex items-center gap-2"
                                >
                                    <FiExternalLink /> Open in Fullscreen
                                </a>
                                <button 
                                    onClick={() => setPreviewDoc(null)}
                                    className="px-10 py-3.5 bg-teal-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-teal-600/20 active:scale-95 transition-all"
                                >
                                    Done
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {filteredShops.length === 0 && !loading && (
                <div className="text-center py-20">
                    <p className="text-gray-400 font-bold text-lg">No shops matching your search found.</p>
                </div>
            )}
        </div>
    );
};

export default RegisteredShops;
