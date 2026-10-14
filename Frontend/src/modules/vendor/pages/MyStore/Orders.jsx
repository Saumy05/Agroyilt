import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    FiChevronLeft, 
    FiPackage, 
    FiTruck, 
    FiCheckCircle, 
    FiUser,
    FiPhone,
    FiMapPin,
    FiSearch
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import vendorProductService from '../../services/vendorProductService';
import { toastManager } from '../../../../utils/toastManager';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { format } from 'date-fns';

const ShippingDetailsModal = ({ onConfirm }) => {
    const [show, setShow] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [courierName, setCourierName] = useState('');
    const [trackingNumber, setTrackingNumber] = useState('');

    const handleSubmit = async () => {
        try {
            setIsSubmitting(true);
            const success = await onConfirm({ 
                courierName: courierName.trim() || 'Seller Delivery', 
                trackingNumber: trackingNumber.trim() 
            });
            if (success) {
                setShow(false);
                setCourierName('');
                setTrackingNumber('');
            }
        } catch (error) {
            console.error("Shipping Details Error:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <button 
                onClick={() => setShow(true)}
                className="w-full min-w-[160px] whitespace-nowrap px-4 py-3 bg-teal-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-teal-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                <FiTruck className="flex-shrink-0 w-4 h-4" /> Mark as Shipped
            </button>
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {show && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ position: 'fixed' }}>
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }} 
                                exit={{ opacity: 0 }} 
                                onClick={() => !isSubmitting && setShow(false)} 
                                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
                            />
                            <motion.div 
                                initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                                animate={{ scale: 1, opacity: 1, y: 0 }} 
                                exit={{ scale: 0.9, opacity: 0, y: 20 }} 
                                className="relative bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl"
                            >
                                <h2 className="text-xl font-black text-slate-800">Shipping Details</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Enter courier info</p>
                                
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Courier Service (Optional)</label>
                                        <input 
                                            type="text" 
                                            disabled={isSubmitting}
                                            className="w-full bg-slate-50 border-none rounded-xl py-4 px-5 font-bold outline-none text-slate-800" 
                                            placeholder="e.g. Delhivery, DTDC, Self" 
                                            value={courierName} 
                                            onChange={e => setCourierName(e.target.value)} 
                                        />
                                    </div>
                                    <div className="space-y-1 mt-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Tracking Number (Optional)</label>
                                        <input 
                                            type="text" 
                                            disabled={isSubmitting}
                                            className="w-full bg-slate-50 border-none rounded-xl py-4 px-5 font-bold outline-none text-slate-800 tracking-wider" 
                                            placeholder="AWB / Tracking Number" 
                                            value={trackingNumber} 
                                            onChange={e => setTrackingNumber(e.target.value)} 
                                        />
                                    </div>
                                    <div className="flex gap-2 mt-6">
                                        {!isSubmitting && (
                                            <button 
                                                onClick={() => setShow(false)}
                                                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-[24px] font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        <button 
                                            onClick={handleSubmit}
                                            disabled={isSubmitting}
                                            className="flex-1 py-4 bg-teal-600 text-white rounded-[24px] font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isSubmitting ? (
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                "Ship Now"
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};

const StoreOrders = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all'); // all, ordered, packed, shipped, delivered
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const ITEMS_PER_PAGE = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, searchQuery]);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const res = await vendorProductService.getMyOrders();
            if (res.success) setOrders(res.data || []);
        } catch {
            toastManager.error("Failed to load orders");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (orderId, status, extra = {}) => {
        try {
            const res = await vendorProductService.updateOrderStatus(orderId, { status, ...extra });
            if (res.success) {
                toastManager.success(res.message || `Order marked as ${status}`);
                fetchOrders();
                return true;
            } else {
                toastManager.error(res.message || "Status update failed");
                return false;
            }
        } catch (err) {
            const errorMsg = err.response?.data?.message || err.message || "Status update failed";
            toastManager.error(errorMsg);
            return false;
        }
    };

    const filteredOrders = orders.filter(o => {
        const matchesTab = activeTab === 'all' || o.deliveryStatus === activeTab;
        if (!matchesTab) return false;

        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        
        const matchesId = o._id?.toLowerCase().includes(query);
        const matchesName = o.userId?.name?.toLowerCase().includes(query);
        const matchesPhone = o.userId?.phone?.toLowerCase().includes(query);
        const matchesItems = o.items?.some(item => item.name?.toLowerCase().includes(query));

        return matchesId || matchesName || matchesPhone || matchesItems;
    });

    const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
    const paginatedOrders = filteredOrders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 py-4 gap-4">
                <button onClick={() => navigate(-1)} className="p-2 bg-slate-100 rounded-xl">
                    <FiChevronLeft className="w-6 h-6 text-slate-600" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-black text-slate-800 leading-tight">Store Orders</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fulfillment Tracking</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white px-6 pt-2 border-b border-slate-100 sticky top-[73px] z-30">
                <div className="flex gap-6 overflow-x-auto scrollbar-hide">
                    {['all', 'ordered', 'packed', 'shipped', 'delivered'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative ${
                                activeTab === tab ? 'text-[#2E7D32]' : 'text-slate-400'
                            }`}
                        >
                            {tab}
                            {activeTab === tab && (
                                <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-[#2E7D32] rounded-t-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 md:p-6 pb-24">
                {/* Search Bar */}
                {(!loading || orders.length > 0) && (
                    <div className="mb-6 max-w-md">
                        <div className="relative">
                            <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search orders (ID, customer name, phone, item)..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 focus:border-[#2E7D32] transition-all text-xs font-bold text-slate-800 placeholder-slate-400"
                            />
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="py-20 flex justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-[#2E7D32] rounded-full animate-spin" /></div>
                ) : filteredOrders.length === 0 ? (
                    <div className="bg-white p-12 rounded-[40px] text-center border-2 border-dashed border-slate-100">
                        <FiPackage className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="font-black text-slate-400 uppercase text-xs tracking-widest">
                            {searchQuery.trim() ? `No orders matching "${searchQuery}"` : `No ${activeTab} orders`}
                        </p>
                    </div>
                ) : (
                    <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-100 overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Info</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Details</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Address</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Balance</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedOrders.map(order => (
                                    <tr key={order._id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-5">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">#{order._id.slice(-6)}</p>
                                            <p className="font-bold text-slate-800 text-sm">{order.items[0]?.name || 'Item'} {order.items?.length > 1 && `(+${order.items.length - 1})`}</p>
                                            <p className="text-xs text-slate-500 font-medium my-0.5">
                                                Qty: {order.items[0]?.quantity || 1} {order.items[0]?.productId?.unit || 'bag'}{order.items[0]?.quantity > 1 ? 's' : ''}
                                                {order.items[0]?.bagWeight ? ` ? ${order.items[0]?.bagWeight}kg` : ''}
                                            </p>
                                            <p className="text-[10px] text-teal-600 font-bold">{format(new Date(order.createdAt), 'dd MMM, hh:mm a')}</p>
                                            {order.trackingDetails?.courierName && (
                                                <div className="mt-2 bg-slate-50 border border-slate-100 p-2 rounded-lg inline-block text-[9px]">
                                                    <p className="font-black text-slate-800 uppercase">{order.trackingDetails.courierName}</p>
                                                    <p className="font-bold text-slate-500 tracking-widest font-mono">{order.trackingDetails.trackingNumber}</p>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                                    <FiUser className="text-slate-400 w-3 h-3" /> {order.userId?.name || 'Unknown'}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                                    <FiPhone className="text-slate-400 w-3 h-3" /> {order.userId?.phone || 'No Phone'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 max-w-[250px]">
                                            <div className="flex items-start gap-1.5 text-xs font-bold text-slate-600">
                                                <FiMapPin className="text-slate-400 w-3 h-3 mt-0.5 flex-shrink-0" />
                                                <span className="line-clamp-3">
                                                    {typeof order.shippingAddress === 'object' && order.shippingAddress ? (() => {
                                                        const a = order.shippingAddress;
                                                        const parts = [
                                                            a.addressLine1,
                                                            a.city,
                                                            a.state,
                                                            a.pincode
                                                        ].filter(Boolean);
                                                        return parts.length > 0 ? parts.join(', ') : 'No Address';
                                                    })() : (order.shippingAddress || 'No Address')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            {order.paymentType === 'cod' ? (
                                                <>
                                                    <p className="font-black text-slate-800 text-base">₹{order.pricing?.orderTotal || 0}</p>
                                                    <p className="text-[9px] font-black text-orange-500 uppercase mt-0.5">Collect via COD</p>
                                                </>
                                            ) : order.paymentType === 'online_full' ? (
                                                <>
                                                    <p className="font-black text-slate-800 text-base">₹{order.pricing?.vendorBalance || 0}</p>
                                                    <p className="text-[9px] font-black text-green-500 uppercase mt-0.5">Paid Online</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="font-black text-slate-800 text-base">₹{order.pricing?.vendorBalance || 0}</p>
                                                    <p className="text-[9px] font-black text-slate-500 uppercase mt-0.5">Platform fee paid</p>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            {order.deliveryStatus === 'ordered' && (
                                                <button 
                                                    onClick={() => handleUpdateStatus(order._id, 'packed')}
                                                    className="px-6 py-2.5 bg-amber-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all whitespace-nowrap min-w-[120px]"
                                                >
                                                    Pack Order
                                                </button>
                                            )}
                                            {order.deliveryStatus === 'packed' && (
                                                <ShippingDetailsModal 
                                                    onConfirm={(shippingData) => handleUpdateStatus(order._id, 'shipped', shippingData)} 
                                                />
                                            )}
                                            {order.deliveryStatus === 'shipped' && (
                                                <DeliveryOtpModal 
                                                    onConfirm={(otpData) => handleUpdateStatus(order._id, 'delivered', otpData)} 
                                                    isCod={order.paymentType === 'cod'} 
                                                    amount={order.pricing?.orderTotal || 0}
                                                />
                                            )}
                                            {order.deliveryStatus === 'delivered' && (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 rounded-lg font-black text-[9px] uppercase tracking-widest border border-green-100">
                                                        <FiCheckCircle className="w-3 h-3" /> Done
                                                    </span>
                                                    {order.paymentType === 'cod' && (
                                                        <span className="text-[8px] font-black text-slate-400 uppercase mt-1">₹{order.pricing?.orderTotal || 0} Collected</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                
                {/* Pagination Controls */}
                {!loading && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-6">
                        <button 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold disabled:opacity-50 text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-sm"
                        >
                            Previous
                        </button>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold disabled:opacity-50 text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-sm"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


// Helper component for Delivery OTP
const DeliveryOtpModal = ({ onConfirm, isCod, amount }) => {
    const [show, setShow] = useState(false);
    const [otp, setOtp] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    useEffect(() => {
        if (show) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'unset';
        return () => { document.body.style.overflow = 'unset'; }
    }, [show]);

    const handleVerify = async () => {
        if (otp.length !== 4) {
            toastManager.error("Please enter a valid 4-digit OTP");
            return;
        }

        try {
            setIsVerifying(true);
            const success = await onConfirm({ deliveryOtp: otp });
            if (success) {
                setShow(false);
                setOtp('');
            }
        } catch (error) {
            console.error("OTP Verification Error:", error);
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <>
            <button 
                onClick={() => setShow(true)}
                className={`px-4 py-3 ${isCod ? 'bg-orange-500 shadow-orange-500/20' : 'bg-green-600 shadow-green-600/20'} text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all w-full min-w-[160px] whitespace-nowrap mt-2`}
            >
                {isCod ? `Verify & Collect ₹${amount}` : 'Confirm Delivery'}
            </button>
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {show && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ position: 'fixed' }}>
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }} 
                                exit={{ opacity: 0 }} 
                                onClick={() => !isVerifying && setShow(false)} 
                                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
                            />
                            <motion.div 
                                initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                                animate={{ scale: 1, opacity: 1, y: 0 }} 
                                exit={{ scale: 0.9, opacity: 0, y: 20 }} 
                                className="relative bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl"
                            >
                                <h2 className="text-xl font-black text-slate-800">Delivery verification</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Ask buyer for OTP</p>
                                
                                {isCod && (
                                    <div className="bg-orange-50 rounded-2xl p-4 mb-6 border border-orange-100 text-center">
                                        <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Please collect cash first</p>
                                        <p className="text-3xl font-black text-orange-600">₹{amount}</p>
                                    </div>
                                )}
                                
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">4-Digit Code</label>
                                        <input 
                                            type="text" 
                                            maxLength={4} 
                                            disabled={isVerifying}
                                            className="w-full bg-slate-50 border-none rounded-xl py-4 px-5 font-bold outline-none text-center tracking-[1em] text-lg" 
                                            placeholder="1234" 
                                            value={otp} 
                                            onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} 
                                        />
                                    </div>
                                    <div className="flex gap-2 mt-6">
                                        {!isVerifying && (
                                            <button 
                                                onClick={() => setShow(false)}
                                                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-[24px] font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        <button 
                                            onClick={handleVerify}
                                            disabled={isVerifying}
                                            className="flex-1 py-4 bg-green-600 text-white rounded-[24px] font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isVerifying ? (
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                "Verify"
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}

export default StoreOrders;
