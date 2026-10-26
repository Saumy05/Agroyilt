import React, { useState, useEffect } from 'react';
import {
    FiChevronLeft,
    FiMapPin,
    FiMaximize,
    FiSend,
    FiActivity,
    FiCheckCircle,
    FiClock,
    FiFileText,
    FiInfo,
    FiDownload,
    FiShield,
    FiChevronDown,
    FiTarget,
    FiAlertCircle
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import soilTestService from '../../../../services/soilTestService';
import { toastManager } from '../../../../utils/toastManager';
import { waitForServerPayment } from '../../../../utils/paymentRecovery';
import { motion, AnimatePresence } from 'framer-motion';
import flutterBridge from '../../../../utils/flutterBridge';
import authStorage from '../../../../utils/authStorage';

const SoilTesting = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [requests, setRequests] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingRequestId, setEditingRequestId] = useState(null);
    const [paymentModal, setPaymentModal] = useState(null);
    const [processingPayment, setProcessingPayment] = useState(false);

    const [fetchingLocation, setFetchingLocation] = useState(false);
    const [formData, setFormData] = useState({
        landSize: '',
        location: localStorage.getItem('currentAddress') || '',
        latitude: null,
        longitude: null,
        cropType: '',
        testType: 'Basic',
        phoneNumber: authStorage.getUserData('user')?.phone || ''
    });

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const testOptions = [
        { value: 'Basic', label: 'Basic Test (3 Parameters - NPK)', desc: 'Tests Nitrogen, Phosphorus, and Potassium' },
        { value: 'Advanced', label: 'Advanced Test (12 Parameters - Govt. Standard)', desc: 'Complete analysis including pH, EC, OC, NPK & Micro-nutrients' }
    ];

    useEffect(() => {
        fetchMyRequests(false);

        // Auto-update status every 15 seconds
        const interval = setInterval(() => fetchMyRequests(true), 15000);
        return () => clearInterval(interval);
    }, []);

    // Prevent background scrolling when modals are open
    useEffect(() => {
        if (showForm || paymentModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showForm, paymentModal]);

    const fetchMyRequests = async (isPolling = false) => {
        try {
            if (!isPolling) setLoading(true);
            const res = await soilTestService.getMyRequests();
            if (res.success) setRequests(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            if (!isPolling) setLoading(false);
        }
    };

    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            toastManager.error("Geolocation is not supported by your browser");
            return;
        }
        
        setFetchingLocation(true);
        const toastId = toastManager.info("Detecting your field location...");
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setFormData({
                    ...formData,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
                toastManager.success("Location acquired successfully!", { id: toastId });
                setFetchingLocation(false);
            },
            (error) => {
                console.error("Error getting location:", error);
                toastManager.error("Please allow location access in your browser/device settings.", { id: toastId });
                setFetchingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingRequestId(null);
        setFormData({
            landSize: '',
            location: localStorage.getItem('currentAddress') || '',
            latitude: null,
            longitude: null,
            cropType: '',
            testType: 'Basic',
            phoneNumber: authStorage.getUserData('user')?.phone || ''
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            let res;
            if (editingRequestId) {
                res = await soilTestService.update(editingRequestId, formData);
            } else {
                res = await soilTestService.request(formData);
            }
            if (res.success) {
                toastManager.success(editingRequestId ? "Request updated successfully!" : "Request submitted successfully! Our team will contact you soon.");
                closeForm();
                fetchMyRequests(false);
            }
        } catch (err) {
            toastManager.error(editingRequestId ? "Update failed. Please try again." : "Submission failed. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditRequest = (req) => {
        setFormData({
            landSize: req.landSize || '',
            location: req.location || '',
            latitude: req.latitude || null,
            longitude: req.longitude || null,
            cropType: req.cropType || '',
            testType: req.testType || 'Basic',
            phoneNumber: req.phoneNumber || ''
        });
        setEditingRequestId(req._id);
        setShowForm(true);
    };

    const handleDeleteRequest = async (id) => {
        if (!window.confirm("Are you sure you want to delete this request?")) return;
        try {
            const res = await soilTestService.delete(id);
            if (res.success) {
                toastManager.success("Request deleted successfully!");
                fetchMyRequests(false);
            }
        } catch (err) {
            toastManager.error(err.response?.data?.message || "Delete failed. Please try again.");
        }
    };

    const handleWalletPayment = async (req) => {
        try {
            setProcessingPayment(true);
            const res = await soilTestService.payForReport(req._id, 'wallet');
            if (res.success) {
                toastManager.success('Payment successful via Wallet!');
                setPaymentModal(null);
                fetchMyRequests(false);
            }
        } catch (error) {
            if (error.response?.data?.needsOnlinePayment) {
                toastManager.error('Insufficient Wallet Balance. Please pay online.');
                handleOnlinePayment(req);
            } else {
                toastManager.error(error.response?.data?.message || 'Wallet payment failed');
            }
        } finally {
            setProcessingPayment(false);
        }
    };

    const handleOnlinePayment = async (req) => {
        try {
            setProcessingPayment(true);
            const res = await soilTestService.payForReport(req._id, 'online');
            
            if (res.success && res.data?.orderId) {
                // Razorpay can say "failed"/closed after a UPI app paid; the server may already have unlocked it (verify call or webhook)
                const recoverIfPaid = async (failMessage) => {
                    toastManager.info('Checking payment status...');
                    const paid = await waitForServerPayment(async () => {
                        const r = await soilTestService.getMyRequests();
                        return !!(r.success && r.data?.find(x => x._id === req._id)?.paymentStatus === 'paid');
                    });
                    if (paid) {
                        toastManager.success('Payment verified successfully!');
                        setPaymentModal(null);
                        fetchMyRequests(false);
                    } else if (failMessage) {
                        toastManager.error(failMessage);
                    }
                };
                const options = {
                    key: res.data.key,
                    amount: res.data.amount * 100,
                    currency: res.data.currency,
                    name: 'Agroyilt',
                    description: 'Soil Test Report',
                    order_id: res.data.orderId,
                    handler: async function (response) {
                        try {
                            const verifyRes = await soilTestService.verifyPayment(req._id, {
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature
                            });
                            if (verifyRes.success) {
                                toastManager.success('Payment verified successfully!');
                                setPaymentModal(null);
                                fetchMyRequests(false);
                            }
                        } catch (verifyErr) {
                            toastManager.error(verifyErr.response?.data?.message || 'Payment verification failed');
                        }
                    },
                    prefill: {
                        name: authStorage.getUserData('user')?.name || 'Farmer',
                        contact: authStorage.getUserData('user')?.phone || ''
                    },
                    theme: { color: '#0d9488' },
                    modal: { ondismiss: () => { recoverIfPaid(); } }
                };
                
                const rzp = new window.Razorpay(options);
                rzp.on('payment.failed', function (response) {
                    recoverIfPaid('Payment failed: ' + response.error?.description);
                });
                rzp.open();
            }
        } catch (error) {
            toastManager.error(error.response?.data?.message || 'Online payment initialization failed');
        } finally {
            setProcessingPayment(false);
        }
    };

    const TRACKING_STEPS = [
        { key: 'pending',          label: 'Submitted' },
        { key: 'assigned',         label: 'Assigned' },
        { key: 'sample_collected', label: 'Sample Collected' },
        { key: 'at_lab',           label: 'At Lab' },
        { key: 'completed',        label: 'Approved' },
    ];

    const stepIndex = (status) => TRACKING_STEPS.findIndex(s => s.key === status);

    const TrackingBar = ({ status }) => {
        const current = stepIndex(status);
        return (
            <div className="flex items-center gap-0.5 mt-4">
                {TRACKING_STEPS.map((step, i) => (
                    <React.Fragment key={step.key}>
                        <div className="flex flex-col items-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-all
                                ${i <= current ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {i < current ? '✓' : i + 1}
                            </div>
                            <p className={`text-[8px] mt-1 font-bold text-center leading-tight max-w-[40px]
                                ${i <= current ? 'text-teal-600' : 'text-slate-300'}`}>
                                {step.label}
                            </p>
                        </div>
                        {i < TRACKING_STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mb-4 rounded-full transition-all ${
                                i < current ? 'bg-teal-500' : 'bg-slate-100'}`} />
                        )}
                    </React.Fragment>
                ))}
            </div>
        );
    };

    const StatusBadge = ({ status }) => {
        const styles = {
            pending:          'bg-amber-50 text-amber-600 border-amber-100',
            assigned:         'bg-blue-50 text-blue-600 border-blue-100',
            sample_collected: 'bg-purple-50 text-purple-600 border-purple-100',
            at_lab:           'bg-indigo-50 text-indigo-600 border-indigo-100',
            completed:        'bg-emerald-50 text-emerald-600 border-emerald-100',
            cancelled:        'bg-slate-50 text-slate-400 border-slate-100',
        };
        const labels = {
            pending:          'Pending',
            assigned:         'Assigned',
            sample_collected: 'Sample Collected',
            at_lab:           'At Lab',
            completed:        'Approved ✓',
            cancelled:        'Cancelled',
        };

        return (
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${styles[status] || styles.pending}`}>
                {labels[status] || status}
            </span>
        );
    };

    const handleDownload = async (url) => {
        const fileName = `soil_report_${Date.now()}${url.toLowerCase().includes('.pdf') ? '.pdf' : '.jpg'}`;
        try {
            const result = await flutterBridge.downloadFile(url, fileName);
            if (result && result.success) {
                toastManager.success("Download started...");
            }
        } catch (error) {
            console.error('Download failed:', error);
            window.open(url, '_blank');
        }
    };


    return (
        <div className="min-h-screen bg-[#F1F8E9] pb-24">
            {/* Navbar */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-black/[0.03] flex items-center px-4 py-4 gap-4">
                <button onClick={() => navigate(-1)} className="p-2 bg-slate-100 rounded-xl">
                    <FiChevronLeft className="w-6 h-6 text-slate-600" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-black text-slate-800 leading-tight">Soil Testing</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Soil Testing, Better Crops</p>
                </div>
            </div>

            <div className="p-6 space-y-8">
                {/* Hero Header */}
                <div className="bg-gradient-to-br from-[#347989] to-[#255b68] rounded-[40px] p-8 text-white relative overflow-hidden shadow-xl shadow-teal-900/10">
                    <div className="relative z-10">
                        <h2 className="text-2xl font-black mb-2">Get your soil tested</h2>
                        <p className="text-white/80 text-sm font-medium leading-relaxed mb-6">Know your soil nutrients and use the right fertilizer.</p>
                        <button
                            onClick={() => { setEditingRequestId(null); setShowForm(true); }}
                            className="bg-white text-[#347989] px-6 py-3 rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all"
                        >
                            Request Testing Now
                        </button>
                    </div>
                    {/* Decorative Elements */}
                    <FiActivity className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10 rotate-12" />
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
                        <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center mb-3">
                            <FiCheckCircle className="text-teal-600" />
                        </div>
                        <h3 className="font-black text-slate-800 text-sm mb-1">Authentic Lab</h3>
                        <p className="text-[10px] text-slate-400 font-bold leading-tight">Verified laboratories for accurate reports.</p>
                    </div>
                    <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
                            <FiClock className="text-amber-600" />
                        </div>
                        <h3 className="font-black text-slate-800 text-sm mb-1">Fast Result</h3>
                        <p className="text-[10px] text-slate-400 font-bold leading-tight">Get your soil report within 3-5 working days.</p>
                    </div>
                </div>

                {/* Previous Requests */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">My Requests</h2>
                        <FiFileText className="text-slate-400" />
                    </div>

                    {loading ? (
                        <div className="py-20 flex justify-center">
                            <div className="w-10 h-10 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin"></div>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-[40px] p-12 text-center">
                            <FiInfo className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                            <p className="font-black text-slate-800">No requests yet</p>
                            <p className="text-xs text-slate-400 font-medium">Soil testing is essential for a better harvest.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {requests.map(req => (
                                <div key={req._id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Request ID: {req._id.slice(-8)}</p>
                                            <h4 className="font-black text-slate-800 text-base">{req.landSize?.replace(/Arce/g, 'Acre')} Land — {req.cropType || 'General'}</h4>
                                            <p className="text-xs font-bold text-teal-600 mb-1">{req.testType === 'Advanced' ? 'Advanced Test (12 Parameters)' : 'Basic Test (3 Parameters)'}</p>
                                        </div>
                                        <StatusBadge status={req.status} />
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                                        <FiMapPin className="flex-shrink-0" />
                                        <p className="text-xs font-bold truncate">{req.location}</p>
                                    </div>

                                    {/* Real-time Tracking Bar */}
                                    {req.status !== 'cancelled' && <TrackingBar status={req.status} />}

                                    {/* Rejection Reason */}
                                    {req.status === 'cancelled' && req.rejectionReason && (
                                        <div className="mt-4 bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3">
                                            <FiAlertCircle className="text-red-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs font-black text-red-800 mb-1">Request Rejected</p>
                                                <p className="text-[10px] font-bold text-red-600 leading-relaxed">{req.rejectionReason}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Approved — Verified Report Badge + Download */}
                                    {req.status === 'completed' && req.reportStatus === 'approved' && req.reportUrl && (
                                        <div className="mt-4 space-y-3">
                                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <FiShield className="text-emerald-600 w-5 h-5" />
                                                    <div>
                                                        <p className="text-xs font-black text-emerald-800">Verified Report Ready</p>
                                                        <p className="text-[10px] text-emerald-600 font-bold">Verified by Admin ✓</p>
                                                    </div>
                                                </div>
                                                {req.paymentStatus === 'paid' ? (
                                                    <button onClick={() => handleDownload(req.reportUrl)}
                                                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-xs shadow-lg shadow-emerald-600/20 active:scale-95 transition-all">
                                                        <FiDownload /> Download
                                                    </button>
                                                ) : (
                                                    <button onClick={() => setPaymentModal(req)}
                                                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs shadow-lg shadow-blue-600/20 active:scale-95 transition-all">
                                                        <FiShield /> Pay ₹{req.totalAmount || 0} to View
                                                    </button>
                                                )}
                                            </div>
                                            {/* Show Admin Notes to the Farmer if available */}
                                            {req.adminNotes && (
                                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs">
                                                    <p className="font-black text-slate-700 mb-1">Admin Note:</p>
                                                    <p className="text-slate-600 font-medium leading-relaxed">{req.adminNotes}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {req.status === 'pending' && (
                                        <div className="pt-3.5 border-t border-slate-50 mt-4 flex gap-3">
                                            <button onClick={() => handleEditRequest(req)}
                                                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-1.5 border border-slate-200/50">
                                                Edit Request
                                            </button>
                                            <button onClick={() => handleDeleteRequest(req._id)}
                                                className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 border border-red-100/50">
                                                Delete Request
                                            </button>
                                        </div>
                                    )}

                                    {req.status !== 'pending' && (
                                        <div className="pt-4 border-t border-slate-50 mt-4">
                                            <p className="text-[10px] font-bold text-slate-400">{new Date(req.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Modal */}
            <AnimatePresence>
                {paymentModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPaymentModal(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-6">
                            <h3 className="text-xl font-black text-slate-800 mb-2">Unlock Report</h3>
                            <p className="text-xs font-bold text-slate-500 mb-6">Choose a payment method to unlock and download your verified soil report.</p>
                            
                            <div className="bg-slate-50 p-4 rounded-2xl mb-6">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-bold text-slate-500">Total Fee:</span>
                                    <span className="text-lg font-black text-slate-800">₹{paymentModal.totalAmount || 0}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">Includes sample collection & lab charges</p>
                            </div>

                            <div className="space-y-3">
                                <button onClick={() => handleWalletPayment(paymentModal)} disabled={processingPayment}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-slate-100 hover:border-teal-500 bg-white transition-all active:scale-95 disabled:opacity-50 group">
                                    <div className="flex flex-col items-start">
                                        <span className="font-black text-slate-800 group-hover:text-teal-700">Agroyilt Wallet</span>
                                        <span className="text-[10px] font-bold text-slate-400">Pay using your platform balance</span>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all">
                                        →
                                    </div>
                                </button>

                                <button onClick={() => handleOnlinePayment(paymentModal)} disabled={processingPayment}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-500 bg-white transition-all active:scale-95 disabled:opacity-50 group">
                                    <div className="flex flex-col items-start">
                                        <span className="font-black text-slate-800 group-hover:text-blue-700">Pay Online</span>
                                        <span className="text-[10px] font-bold text-slate-400">UPI, Cards, Netbanking</span>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                        →
                                    </div>
                                </button>
                            </div>

                            <button onClick={() => setPaymentModal(null)} disabled={processingPayment} className="w-full mt-4 py-3 text-xs font-black text-slate-400 hover:text-slate-600">
                                Cancel
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Request Form Modal */}
            <AnimatePresence>
                {showForm && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeForm}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="relative bg-white w-full max-h-[90vh] rounded-t-[48px] shadow-2xl overflow-y-auto"
                        >
                            <div className="p-8 pb-4 flex items-center justify-between sticky top-0 bg-white z-10 border-b border-slate-50">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-800">{editingRequestId ? 'Edit Soil Test Request' : 'Soil Test Form'}</h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{editingRequestId ? 'Update your request details' : 'Fill in correct details'}</p>
                                </div>
                                <button type="button" onClick={closeForm} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center font-bold">✕</button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Land Size (Acre/Bigha)</label>
                                        <div className="relative">
                                            <FiMaximize className="absolute left-4 top-4 text-slate-300" />
                                            <input
                                                required
                                                type="text"
                                                className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-5 font-bold outline-none"
                                                placeholder="e.g. 5 Acre"
                                                value={formData.landSize}
                                                onChange={e => setFormData({ ...formData, landSize: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between ml-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Location / Address</label>
                                            <button 
                                                type="button" 
                                                onClick={handleGetLocation}
                                                disabled={fetchingLocation}
                                                className={`text-[10px] font-black flex items-center gap-1 transition-all ${
                                                    formData.latitude && formData.longitude 
                                                        ? 'text-emerald-600' 
                                                        : 'text-blue-600 active:scale-95'
                                                }`}
                                            >
                                                {fetchingLocation ? (
                                                    <><div className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /> Detecting...</>
                                                ) : formData.latitude && formData.longitude ? (
                                                    <><FiCheckCircle /> Location Acquired</>
                                                ) : (
                                                    <><FiTarget /> Detect Field Location</>
                                                )}
                                            </button>
                                        </div>
                                        <div className="relative">
                                            <FiMapPin className="absolute left-4 top-4 text-slate-300" />
                                            <textarea
                                                required
                                                rows="3"
                                                className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-5 font-bold outline-none"
                                                placeholder="Enter your full address"
                                                value={formData.location}
                                                onChange={e => setFormData({ ...formData, location: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Proposed Crop (Optional)</label>
                                            <input
                                                type="text"
                                                className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 font-bold outline-none"
                                                placeholder="Which crop will you grow?"
                                                value={formData.cropType}
                                                onChange={e => setFormData({ ...formData, cropType: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Test Type</label>
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                                    className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-12 font-bold outline-none text-left flex items-center justify-between transition-all text-slate-700"
                                                >
                                                    <FiFileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                                                    <span className="truncate text-sm">{testOptions.find(o => o.value === formData.testType) ?.label}</span>
                                                    <FiChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                                </button>

                                                <AnimatePresence>
                                                    {isDropdownOpen && (
                                                        <>
                                                            <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                                                            <motion.div
                                                                initial={{ opacity: 0, y: -10 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: -10 }}
                                                                className="absolute z-50 w-full mt-2 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 overflow-hidden"
                                                            >
                                                                {testOptions.map(option => (
                                                                    <button
                                                                        key={option.value}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setFormData({ ...formData, testType: option.value });
                                                                            setIsDropdownOpen(false);
                                                                        }}
                                                                        className={`w-full text-left p-4 transition-colors flex flex-col gap-1 border-b last:border-b-0 border-slate-50
                                                                            ${formData.testType === option.value ? 'bg-teal-50/50' : 'hover:bg-slate-50'}`}
                                                                    >
                                                                        <div className="flex items-center justify-between">
                                                                            <span className={`font-black text-sm ${formData.testType === option.value ? 'text-teal-700' : 'text-slate-800'}`}>
                                                                                {option.label}
                                                                            </span>
                                                                            {formData.testType === option.value && <FiCheckCircle className="text-teal-600" />}
                                                                        </div>
                                                                        <span className="text-[10px] font-bold text-slate-400 leading-tight">{option.desc}</span>
                                                                    </button>
                                                                ))}
                                                            </motion.div>
                                                        </>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mobile Number</label>
                                            <input
                                                required
                                                type="tel"
                                                className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 font-bold outline-none"
                                                value={formData.phoneNumber}
                                                onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-teal-50 p-6 rounded-[32px] flex gap-4 items-start border border-teal-100/50">
                                    <FiInfo className="text-teal-600 flex-shrink-0 mt-1" />
                                    <p className="text-xs font-bold text-teal-900 leading-relaxed">
                                        Our team will contact you and collect the soil sample from your field. You will receive a notification once the lab report is available.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-[#347989] py-5 rounded-[32px] font-black text-white shadow-xl shadow-teal-900/10 active:scale-95 transition-all text-lg flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    {submitting ? 'Submitting...' : editingRequestId ? <><FiSend /> Update Request</> : <><FiSend /> Submit Request</>}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <BottomNav />
        </div>
    );
};

export default SoilTesting;
