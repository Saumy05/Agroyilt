import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
    FiArrowLeft, FiClock, FiCheckCircle, FiTruck, 
    FiPackage, FiUser, FiHome, FiCreditCard, 
    FiAlertCircle, FiCamera 
} from 'react-icons/fi';
import { adminBookingService } from '../../../../services/adminBookingService';
import { toastManager } from '../../../../utils/toastManager';

const BookingDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchBookingDetails = async () => {
        try {
            setLoading(true);
            const res = await adminBookingService.getBookingById(id);
            if (res.success) {
                setBooking(res.data);
            }
        } catch (error) {
            console.error('Error fetching booking details:', error);
            toastManager.error(error.message || 'Failed to load booking details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBookingDetails();
    }, [id]);

    const getStatusColor = (status) => {
        const s = status?.toLowerCase();
        if (s === 'completed') return 'bg-green-100 text-green-700';
        if (s === 'cancelled') return 'bg-red-100 text-red-700';
        if (s === 'rejected') return 'bg-rose-100 text-rose-700';
        if (s === 'in_progress') return 'bg-purple-100 text-purple-700';
        return 'bg-yellow-100 text-yellow-700';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (!booking) {
        return (
            <div className="text-center py-12">
                <FiAlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-800">Booking Not Found</h2>
                <button 
                    onClick={() => navigate('/admin/bookings')}
                    className="mt-4 text-primary-600 font-bold hover:underline"
                >
                    Back to Bookings
                </button>
            </div>
        );
    }

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="space-y-6 pb-12"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <FiArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            Booking Details
                        </h1>
                        <p className="text-sm text-gray-500">
                            #{booking.bookingNumber || booking._id}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(booking.status)}`}>
                        {booking.status?.replace('_', ' ')}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Essential Info */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Items Section */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <FiPackage className="text-primary-600" /> Booked Items
                            </h2>
                        </div>
                        <div className="p-6">
                            {booking.items && booking.items.length > 0 ? (
                                <div className="space-y-4">
                                    {booking.items.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-all">
                                            <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                              {item.serviceId?.thumbnail || item.thumbnail ? (
                                                <img src={item.serviceId?.thumbnail || item.thumbnail} alt={item.serviceId?.title} className="w-full h-full object-cover" />
                                              ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                  <FiPackage />
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-gray-800">{item.serviceId?.title || 'Equipment Name'}</h4>
                                                <p className="text-xs text-gray-500">Qty: {item.quantity} | Total Area: {item.totalArea || 0} Acre</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-gray-900">₹{item.itemTotal?.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl">
                                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                                        <FiPackage />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-800">{booking.serviceId?.title || 'Bulk Booking'}</h4>
                                        <p className="text-xs text-gray-500">₹{Number(booking.finalAmount ?? booking.totalAmount ?? booking.agreedRate ?? booking.basePrice ?? 0).toLocaleString('en-IN')}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Timeline / Progress */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-6">
                            <FiClock className="text-primary-600" /> Activity Timeline
                        </h2>
                        <div className="relative pl-6 border-l-2 border-gray-100 space-y-8">
                            <div className="relative pb-1">
                                <div className="absolute -left-[30px] top-0 w-4 h-4 rounded-full bg-green-500 border-4 border-white shadow-sm"></div>
                                <p className="text-sm font-bold text-gray-800">Booking Received</p>
                                <p className="text-xs text-gray-500">{new Date(booking.createdAt).toLocaleString()}</p>
                            </div>
                            {booking.statusHistory && booking.statusHistory.map((history, idx) => (
                                <div key={idx} className="relative pb-1">
                                    <div className="absolute -left-[30px] top-0 w-4 h-4 rounded-full bg-primary-500 border-4 border-white shadow-sm"></div>
                                    <p className="text-sm font-bold text-gray-800 capitalize">{history.status.replace('_', ' ')}</p>
                                    <p className="text-xs text-gray-500">{new Date(history.timestamp).toLocaleString()}</p>
                                    {history.comment && <p className="text-xs text-gray-400 mt-1 italic">"{history.comment}"</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Party Info */}
                <div className="space-y-6">
                    {/* Farmer/Customer Info */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                            <FiUser className="text-primary-600" /> Customer Info
                        </h2>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center text-xl font-bold text-primary-700 uppercase">
                                {booking.userId?.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">{booking.userId?.name || booking.shippingAddress?.name || 'Guest User'}</h3>
                                <p className="text-xs text-gray-500">{booking.userId?.phone || booking.customerPhone}</p>
                            </div>
                        </div>
                        <div className="space-y-3 pt-4 border-t border-gray-50">
                            <div className="flex items-start gap-3">
                                <FiHome className="text-gray-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-gray-600">
                                    {booking.shippingAddress?.streetAddress}, {booking.shippingAddress?.city}, {booking.shippingAddress?.state} - {booking.shippingAddress?.pincode}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Payment Summary: from the final bill when there is one, else from the booking's quote */}
                    {(() => {
                        const bill = booking.bill;
                        const n = (v) => Number(v) || 0;
                        const money = (v) => `₹${n(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                        const feePct = bill?.payoutConfig?.platformFeePercentage || booking.platformFeePercentage;
                        const gstPct = bill?.payoutConfig?.serviceGstPercentage ?? booking.gstPercentage;
                        const rows = bill ? [
                            { label: 'Service charges', value: n(bill.totalServiceBase) },
                            { label: 'Parts & materials', value: n(bill.totalPartsBase), hideZero: true },
                            { label: `GST${gstPct != null ? ` (${gstPct}%)` : ''}`, value: n(bill.totalGST) },
                            { label: 'Visiting charges', value: n(bill.visitingCharges), hideZero: true },
                            { label: 'Transport charges', value: n(bill.transportCharges), hideZero: true },
                            { label: 'Travel charge (to vendor)', value: n(bill.travelCharge), hideZero: true },
                            { label: `Platform fee${feePct ? ` (${feePct}%)` : ''}`, value: n(bill.platformFee), hideZero: true },
                            { label: 'Cancellation penalty', value: n(bill.penaltyCharges), hideZero: true }
                        ] : [
                            { label: 'Service charges', value: n(booking.basePrice) - n(booking.discount) },
                            { label: `GST${gstPct != null ? ` (${gstPct}%)` : ''}`, value: n(booking.tax) },
                            { label: 'Visiting charges', value: n(booking.visitingCharges), hideZero: true },
                            { label: 'Travel charge (to vendor)', value: n(booking.travelCharge), hideZero: true },
                            { label: `Platform fee${feePct ? ` (${feePct}%)` : ''}`, value: n(booking.platformFee), hideZero: true },
                            { label: 'Cancellation penalty', value: n(booking.penalty), hideZero: true }
                        ];
                        const total = bill ? n(bill.grandTotal) : n(booking.finalAmount ?? booking.totalAmount ?? booking.agreedRate ?? booking.basePrice);
                        const platformEarning = bill ? n(bill.companyRevenue) - n(bill.totalGST) : 0;
                        return (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-1">
                                    <FiCreditCard className="text-primary-600" /> Payment Summary
                                </h2>
                                <p className="text-[11px] text-gray-400 mb-4">{bill ? 'From the final bill' : 'Quoted at booking (no final bill yet)'}</p>
                                <div className="space-y-3">
                                    {rows.filter(r => !(r.hideZero && r.value === 0)).map(r => (
                                        <div key={r.label} className="flex justify-between text-sm text-gray-500">
                                            <span>{r.label}</span>
                                            <span className="font-semibold text-gray-800">{money(r.value)}</span>
                                        </div>
                                    ))}
                                    <div className="pt-3 border-t border-gray-50 flex justify-between font-bold text-lg text-gray-900">
                                        <span>Total</span>
                                        <span>{money(total)}</span>
                                    </div>

                                    {bill && (
                                        <div className="mt-2 rounded-lg p-3 border border-emerald-100 bg-emerald-50/50 space-y-1.5 text-xs">
                                            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Who gets what</p>
                                            <div className="flex justify-between text-gray-600"><span>Vendor earning</span><span className="font-semibold text-gray-800">{money(bill.vendorTotalEarning)}</span></div>
                                            <div className="flex justify-between text-gray-600"><span>Platform earning (commission + fee)</span><span className="font-semibold text-gray-800">{money(platformEarning)}</span></div>
                                            <div className="flex justify-between text-gray-600"><span>GST collected</span><span className="font-semibold text-gray-800">{money(bill.totalGST)}</span></div>
                                        </div>
                                    )}

                                    <div className="mt-2 bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-1.5 text-xs">
                                        <div className="flex justify-between"><span className="text-gray-500">Payment status</span><span className="font-bold text-gray-800 uppercase">{(booking.paymentStatus || 'pending').replace(/_/g, ' ')}</span></div>
                                        {booking.paymentMethod && (
                                            <div className="flex justify-between"><span className="text-gray-500">Method</span><span className="font-bold text-gray-800 uppercase">{String(booking.paymentMethod).replace(/_/g, ' ')}</span></div>
                                        )}
                                        {n(booking.advancePaidAmount) > 0 && (
                                            <div className="flex justify-between"><span className="text-gray-500">Paid in advance</span><span className="font-bold text-gray-800">{money(booking.advancePaidAmount)}</span></div>
                                        )}
                                        {n(booking.refundedAmount) > 0 && (
                                            <div className="flex justify-between"><span className="text-gray-500">Refunded to farmer</span><span className="font-bold text-gray-800">{money(booking.refundedAmount)}</span></div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </motion.div>
    );
};

export default BookingDetailsPage;
