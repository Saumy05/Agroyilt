import { fmtMinutesExact } from '../../../../utils/serverClock';
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
import { formatFullAddress } from '../../../../utils/formatAddress';
import { formatDateTimeDDMMYYYY } from '../../../../utils/formatDate';

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
                            {(() => {
                                // The real service name: what the farmer booked, not a generic label
                                const serviceName = booking.serviceName || booking.equipmentId?.name || booking.serviceId?.title || booking.bookedItems?.[0]?.card?.title || 'Service';
                                const unit = booking.categoryId?.unitLabel || 'piece';
                                const modeLabel = { hourly: 'Hourly', daily: 'Daily', land_based: 'Per acre', monthly: 'Monthly', distance_based: 'Per km' }[booking.rental_type];
                                const scope = [
                                    modeLabel,
                                    booking.unitsBooked > 0 ? `${booking.unitsBooked} ${unit}${booking.unitsBooked > 1 ? 's' : ''}` : null,
                                    booking.rental_type === 'hourly' && booking.estimatedDuration ? `${booking.estimatedDuration} hr` : null,
                                    booking.rental_type === 'daily' && booking.estimatedDuration ? `${booking.estimatedDuration} day${booking.estimatedDuration > 1 ? 's' : ''}` : null,
                                    booking.rental_type === 'land_based' && booking.landSize ? `${booking.landSize} acre` : null
                                ].filter(Boolean).join(' · ');
                                const implementNames = (booking.selectedImplements || []).map(i => i.title || i.name).filter(Boolean);
                                const lines = (booking.bookedItems || []).filter(i => i?.card?.title || i?.serviceName);
                                const image = booking.equipmentId?.images?.[0] || booking.serviceId?.images?.[0] || booking.serviceId?.iconUrl;
                                return (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl">
                                            <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                                {image ? <img src={image} alt={serviceName} className="w-full h-full object-cover" />
                                                    : <div className="w-full h-full flex items-center justify-center text-gray-400"><FiPackage /></div>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-gray-800">{serviceName}</h4>
                                                <p className="text-xs text-gray-500">
                                                    {[booking.categoryId?.title || booking.serviceCategory, booking.equipmentId?.modelNumber].filter(Boolean).join(' · ')}
                                                </p>
                                                {scope && <p className="text-xs text-gray-500 mt-0.5">{scope}</p>}
                                                {implementNames.length > 0 && (
                                                    <p className="text-xs text-gray-500 mt-0.5">With: {implementNames.join(', ')}</p>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{booking.providerType === 'WORKER' ? 'Worker wage' : 'Quoted'}</p>
                                                <p className="font-bold text-gray-900">₹{Number(booking.basePrice || booking.workerPayment?.grossAmount || booking.finalAmount || 0).toLocaleString('en-IN')}</p>
                                            </div>
                                        </div>
                                        {lines.length > 1 && lines.slice(1).map((it, idx) => (
                                            <div key={idx} className="flex justify-between text-sm text-gray-600 px-2">
                                                <span>{it.quantity > 1 ? `${it.quantity} × ` : ''}{it.card?.title || it.serviceName}</span>
                                                <span className="font-semibold text-gray-800">₹{Number((it.card?.price || 0) * (it.quantity || 1)).toLocaleString('en-IN')}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Timeline / Progress */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-6">
                            <FiClock className="text-primary-600" /> Activity Timeline
                        </h2>
                        {(() => {
                            const cancelledBy = booking.cancelledBy ? ` by ${booking.cancelledBy}` : '';
                            const events = [
                                { at: booking.createdAt, label: 'Booking placed', dot: 'bg-green-500' },
                                { at: booking.acceptedAt, label: 'Accepted by vendor', dot: 'bg-primary-500' },
                                { at: booking.assignedAt, label: 'Operator assigned', dot: 'bg-primary-500' },
                                { at: booking.journeyStartedAt, label: 'Vendor on the way', dot: 'bg-primary-500' },
                                { at: booking.visitedAt, label: 'Vendor reached the farm', dot: 'bg-primary-500' },
                                { at: booking.startedAt, label: booking.rental_type && booking.fulfillmentMode === 'rental' ? 'Equipment handed over' : 'Work started', dot: 'bg-primary-500' },
                                { at: booking.completedAt, label: booking.fulfillmentMode === 'rental' ? 'Equipment returned' : 'Work completed', dot: 'bg-green-500' },
                                { at: booking.cashCollectedAt, label: 'Cash collected by vendor', dot: 'bg-green-500' },
                                { at: booking.reviewedAt, label: `Farmer rated the service${booking.rating ? ` (${booking.rating}/5)` : ''}`, dot: 'bg-yellow-500' },
                                { at: booking.cancelledAt, label: `Cancelled${cancelledBy}`, note: booking.cancellationReason, dot: 'bg-red-500' },
                                // money in and out, from the farmer's payment and refund records
                                ...(booking.moneyEvents || []).map(t => (t.type === 'refund'
                                    ? { at: t.createdAt, label: `Refunded ₹${Number(t.amount).toLocaleString('en-IN')} to the farmer's wallet`, note: t.description, dot: 'bg-blue-500' }
                                    : { at: t.createdAt, label: `Farmer paid ₹${Number(t.amount).toLocaleString('en-IN')}${t.paymentMethod ? ` (${String(t.paymentMethod).replace(/_/g, ' ')})` : ''}`, dot: 'bg-green-500' }))
                            ].filter(e => e.at && !Number.isNaN(new Date(e.at).getTime()))
                             .sort((x, y) => new Date(x.at) - new Date(y.at));
                            return (
                                <div className="relative pl-6 border-l-2 border-gray-100 space-y-8">
                                    {events.map((e, idx) => (
                                        <div key={idx} className="relative pb-1">
                                            <div className={`absolute -left-[30px] top-0 w-4 h-4 rounded-full ${e.dot} border-4 border-white shadow-sm`}></div>
                                            <p className="text-sm font-bold text-gray-800">{e.label}</p>
                                            <p className="text-xs text-gray-500">{formatDateTimeDDMMYYYY(e.at)}</p>
                                            {e.note && <p className="text-xs text-gray-400 mt-1 italic">"{e.note}"</p>}
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
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
                                <h3 className="font-bold text-gray-900">{booking.userId?.name || booking.customerName || 'Guest User'}</h3>
                                <p className="text-xs text-gray-500">{booking.userId?.phone || booking.customerPhone}</p>
                                {booking.userId?.email && <p className="text-xs text-gray-400">{booking.userId.email}</p>}
                            </div>
                        </div>
                        <div className="space-y-3 pt-4 border-t border-gray-50">
                            <div className="flex items-start gap-3">
                                <FiHome className="text-gray-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Farm / service address</p>
                                    <p className="text-xs text-gray-600 break-words">
                                        {formatFullAddress(booking.address) || 'No address on this booking'}
                                    </p>
                                    {booking.address?.lat && booking.address?.lng && (
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${booking.address.lat},${booking.address.lng}`}
                                            target="_blank" rel="noreferrer"
                                            className="text-[11px] font-semibold text-primary-600 hover:underline inline-block mt-1"
                                        >
                                            Open in Maps
                                        </a>
                                    )}
                                </div>
                            </div>
                            {booking.vendorId && (
                                <div className="flex items-start gap-3">
                                    <FiTruck className="text-gray-400 mt-0.5 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Vendor</p>
                                        <p className="text-xs text-gray-700 font-semibold">{booking.vendorId.businessName || booking.vendorId.name}</p>
                                        {booking.vendorId.phone && <p className="text-xs text-gray-500">{booking.vendorId.phone}</p>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Work and break time per day: the same figures the worker and the farmer see */}
                    {booking.workerTiming && booking.workerTiming.days?.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-1">
                                <FiClock className="text-primary-600" /> Work & Break Time
                            </h2>
                            <p className="text-[11px] text-gray-400 mb-4">
                                Break allowance: {booking.workerTiming.breakAllowanceMinutes} min per working day, shared by all that day's breaks. Work time leaves the break out.
                            </p>
                            <div className="space-y-2">
                                {booking.workerTiming.days.map((d) => {
                                    const t = (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—');
                                    return (
                                        <div key={d.day} className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-xl p-3 text-xs">
                                            <span className="font-bold text-gray-800">{booking.workerTiming.bookingType === 'DAILY' ? `Day ${d.day}` : 'Work'}</span>
                                            <span className="text-gray-500">Started {t(d.workStartedAt)}{d.workEndedAt ? ` · Ended ${t(d.workEndedAt)}` : (d.workStartedAt ? ' · running' : '')}</span>
                                            <span className="text-amber-700 font-semibold">Break {fmtMinutesExact(d.breakMinutes)}{d.onBreak ? ' (on break now)' : ''}</span>
                                            <span className="font-bold text-gray-900">Work {d.workMinutes == null ? '—' : fmtMinutesExact(d.workMinutes)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Payment Summary: from the final bill when there is one, else from the booking's quote */}
                    {(() => {
                        const bill = booking.bill;
                        const wp = booking.providerType === 'WORKER' ? booking.workerPayment : null; // worker bookings: the wage split, no vendor bill
                        const n = (v) => Number(v) || 0;
                        const money = (v) => `₹${n(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                        const feePct = bill?.payoutConfig?.platformFeePercentage || booking.platformFeePercentage;
                        const gstPct = bill?.payoutConfig?.serviceGstPercentage ?? booking.gstPercentage;
                        const billTotal = bill ? n(bill.grandTotal) : n(booking.finalAmount ?? booking.totalAmount ?? booking.agreedRate ?? booking.basePrice);
                        // Nothing was billed (a refunded booking): show what was quoted and taxed instead of a column of zeros
                        const showQuote = !bill || (billTotal === 0 && n(booking.advancePaidAmount) > 0);
                        const rows = wp ? [
                            { label: `Agreed rate (per ${String(wp.rateUnit || '').toLowerCase().startsWith('hour') ? 'hour' : 'day'})`, value: n(wp.agreedRate) },
                            { label: 'Worker wage (gross)', value: n(wp.grossAmount) },
                            { label: `Platform commission${wp.commissionRate ? ` (${wp.commissionRate}%)` : ''}`, value: n(wp.commissionAmount) },
                            { label: 'Worker earns (net)', value: n(wp.netEarning) }
                        ] : !showQuote ? [
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
                        const total = wp ? n(wp.grossAmount) : showQuote
                            ? n(booking.basePrice) - n(booking.discount) + n(booking.tax) + n(booking.platformFee) + n(booking.visitingCharges) + n(booking.travelCharge) + n(booking.penalty)
                            : billTotal;
                        const platformEarning = bill ? n(bill.companyRevenue) - n(bill.totalGST) : 0;
                        return (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-1">
                                    <FiCreditCard className="text-primary-600" /> Payment Summary
                                </h2>
                                <p className="text-[11px] text-gray-400 mb-4">{!showQuote ? 'From the final bill' : bill ? 'Quoted at booking. Nothing was billed (see below)' : 'Quoted at booking (no final bill yet)'}</p>
                                <div className="space-y-3">
                                    {rows.filter(r => !(r.hideZero && r.value === 0)).map(r => (
                                        <div key={r.label} className="flex justify-between text-sm text-gray-500">
                                            <span>{r.label}</span>
                                            <span className="font-semibold text-gray-800">{money(r.value)}</span>
                                        </div>
                                    ))}
                                    <div className="pt-3 border-t border-gray-50 flex justify-between font-bold text-lg text-gray-900">
                                        <span>{showQuote && bill ? 'Quoted total' : 'Total'}</span>
                                        <span>{money(total)}</span>
                                    </div>

                                    {bill && !showQuote && (
                                        <div className="mt-2 rounded-lg p-3 border border-emerald-100 bg-emerald-50/50 space-y-1.5 text-xs">
                                            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Who gets what</p>
                                            <div className="flex justify-between text-gray-600"><span>Vendor earning</span><span className="font-semibold text-gray-800">{money(bill.vendorTotalEarning)}</span></div>
                                            <div className="flex justify-between text-gray-600"><span>Platform earning (commission + fee)</span><span className="font-semibold text-gray-800">{money(platformEarning)}</span></div>
                                            <div className="flex justify-between text-gray-600"><span>GST collected</span><span className="font-semibold text-gray-800">{money(bill.totalGST)}</span></div>
                                        </div>
                                    )}

                                    {(n(booking.advancePaidAmount) > 0 || n(booking.refundedAmount) > 0) && (
                                        <div className="mt-2 rounded-lg p-3 border border-blue-100 bg-blue-50/50 space-y-1.5 text-xs">
                                            <p className="text-[10px] uppercase tracking-wider text-blue-700 font-bold">Quote, bill & refund</p>
                                            <div className="flex justify-between text-gray-600"><span>Quoted at booking (service + GST{n(booking.platformFee) > 0 ? ' + fee' : ''})</span><span className="font-semibold text-gray-800">{money(n(booking.basePrice) - n(booking.discount) + n(booking.tax) + n(booking.platformFee) + n(booking.visitingCharges) + n(booking.travelCharge))}</span></div>
                                            <div className="flex justify-between text-gray-600"><span>Paid by the farmer</span><span className="font-semibold text-gray-800">{money(booking.advancePaidAmount)}</span></div>
                                            <div className="flex justify-between text-gray-600"><span>Final bill</span><span className="font-semibold text-gray-800">{money(billTotal)}</span></div>
                                            {bill && billTotal === 0 && (
                                                <p className="text-[11px] text-amber-700">No billable work was recorded, so nothing was charged.</p>
                                            )}
                                            {n(booking.refundedAmount) > 0 && (
                                                <div className="flex justify-between font-bold text-blue-700"><span>Refunded to the farmer</span><span>{money(booking.refundedAmount)}</span></div>
                                            )}
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
