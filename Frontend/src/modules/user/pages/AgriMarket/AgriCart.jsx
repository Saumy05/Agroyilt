import React, { useState, useEffect } from 'react';
import { 
    FiChevronLeft, 
    FiShoppingCart, 
    FiTrash2, 
    FiPlus, 
    FiMinus, 
    FiPackage, 
    FiShield, 
    FiInfo, 
    FiTruck,
    FiMapPin
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useEcommerceCart } from '../../../../context/EcommerceCartContext';
import ecommerceService from '../../../../services/ecommerceService';
import { toastManager } from '../../../../utils/toastManager';
import { motion, AnimatePresence } from 'framer-motion';
import LocationPicker from '../Checkout/components/LocationPicker';

const toAssetUrl = (url) => {
    if (!url) return '/marketplace_images/wheat.jpg';
    if (url.startsWith('/marketplace_images') || url.startsWith('/landing_images') || url.startsWith('/')) return url;
    const clean = url.replace('/api/upload', '/upload');
    if (clean.startsWith('http')) return clean;
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
    return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const AgriCart = () => {
    const navigate = useNavigate();
    const { cartItems, fetchCart, updateItem, removeItem, clearCart, isLoading } = useEcommerceCart();
    const [showCheckout, setShowCheckout] = useState(false);
    const [address, setAddress] = useState(null); // {addressLine1, city, state, pincode, lat, lng}
    const [paymentType, setPaymentType] = useState('split'); // 'split', 'online_full', 'cod'
    const [placingOrder, setPlacingOrder] = useState(false);

    useEffect(() => {
        fetchCart();
    }, [fetchCart]);

    useEffect(() => {
        if (showCheckout) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showCheckout]);

    // Handle item quantity change
    const handleQtyChange = async (item, change) => {
        const newQty = (item.quantity || 1) + change;
        if (newQty < 1) return;
        if (newQty > (item.productId?.stock || 0)) {
            toastManager.error(`Only ${item.productId?.stock} units available in stock`);
            return;
        }
        try {
            await updateItem(item._id, newQty);
            toastManager.success("Quantity updated");
        } catch (err) {
            toastManager.error("Failed to update quantity");
        }
    };

    // Handle remove item
    const handleRemoveItem = async (itemId) => {
        if (!window.confirm("Are you sure you want to remove this item?")) return;
        try {
            await removeItem(itemId);
            toastManager.success("Item removed from cart");
        } catch (err) {
            toastManager.error("Failed to remove item");
        }
    };

    // Calculations based on backend logic
    const calculateTotals = () => {
        let itemsTotal = 0;
        let adminCommission = 0;
        let gstAmount = 0;
        let shippingCharges = 0;

        cartItems.forEach(item => {
            const product = item.productId;
            if (product) {
                const subtotal = (product.price || 0) * (item.quantity || 1);
                itemsTotal += subtotal;
                adminCommission += subtotal * ((product.commissionPercentage || 0) / 100);
                gstAmount += subtotal * ((product.gstPercentage || 5) / 100);
                shippingCharges += (product.shippingCharge || 0) * (item.quantity || 1);
            }
        });

        const platformFee = adminCommission + gstAmount;
        const vendorBalance = itemsTotal;
        const orderTotal = itemsTotal + platformFee + shippingCharges;

        return {
            itemsTotal,
            platformFee,
            vendorBalance,
            shippingCharges,
            orderTotal
        };
    };

    const totals = calculateTotals();

    // Group items by vendorId
    const getGroupedItems = () => {
        const groups = {};
        cartItems.forEach(item => {
            const vendorId = item.productId?.vendorId || 'central';
            if (!groups[vendorId]) {
                groups[vendorId] = [];
            }
            groups[vendorId].push(item);
        });
        return groups;
    };

    const groupedItems = getGroupedItems();

    // Checkout / Order placement
    const handlePlaceOrder = async () => {
        if (!address || !address.addressLine1) return toastManager.error("Please pin your location on the map");
        try {
            setPlacingOrder(true);
            const res = await ecommerceService.placeOrder({
                shippingAddress: address,
                paymentType
            });

            if (res.success) {
                toastManager.success("Order placed successfully!");
                // Clear cart locally
                await clearCart();
                
                // If multiple orders are created, redirect to orders tracking page
                if (res.orders && res.orders.length > 1) {
                    toastManager.info("Created separate orders for different vendors. Please pay platform fees.", { icon: '📦' });
                    navigate('/user/my-agri-orders');
                } else {
                    const singleOrder = res.data || (res.orders && res.orders[0]);
                    if (paymentType === 'cod') {
                        navigate('/user/my-agri-orders');
                    } else {
                        navigate(`/user/order-payment/${singleOrder._id}`);
                    }
                }
            }
        } catch (err) {
            toastManager.error(err.response?.data?.message || "Order placement failed");
        } finally {
            setPlacingOrder(false);
            setShowCheckout(false);
        }
    };

    if (isLoading && cartItems.length === 0) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-12">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white px-6 pt-12 pb-6 border-b border-slate-100 flex items-center gap-4 sticky top-0 z-40">
                <button onClick={() => navigate('/user/agri-marketplace')} className="p-3 bg-slate-50 rounded-2xl cursor-pointer active:scale-95 transition-all">
                    <FiChevronLeft className="w-6 h-6 text-slate-800" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-black text-slate-800 leading-tight flex items-center gap-2">
                        <FiShoppingCart className="w-5 h-5 text-teal-600" /> Cart
                    </h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Seeds & Fertilizers Cart</p>
                </div>
            </div>

            {cartItems.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center min-h-[60vh] bg-white m-6 rounded-[32px] border border-slate-100 shadow-sm">
                    <FiShoppingCart className="w-16 h-16 text-slate-200 mb-4" />
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-wide">Your cart is empty</h3>
                    <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">Add seeds, fertilizers, and crop nutrition products from the Agri Market to checkout.</p>
                    <button onClick={() => navigate('/user/agri-marketplace')} className="mt-8 px-6 py-4 bg-teal-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-teal-500/20">
                        Browse Marketplace
                    </button>
                </div>
            ) : (
                <div className="p-6 space-y-6 pb-48">
                    {/* Cart Items List */}
                    <div className="space-y-6">
                        {Object.entries(groupedItems).map(([vendorId, items]) => (
                            <div key={vendorId} className="bg-white rounded-[32px] p-5 shadow-sm border border-slate-100 space-y-4">
                                <div className="border-b border-slate-50 pb-3 flex items-center justify-between">
                                    <span className="text-[9px] font-black text-teal-600 uppercase tracking-widest">
                                        {vendorId === 'central' ? 'Agroyilt Central Store' : `Seller Store #${vendorId.slice(-6).toUpperCase()}`}
                                    </span>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                        {items.length} {items.length === 1 ? 'Item' : 'Items'}
                                    </span>
                                </div>
                                <div className="divide-y divide-slate-50 space-y-3">
                                    {items.map(item => {
                                        const product = item.productId;
                                        if (!product) return null;
                                        return (
                                            <div key={item._id} className="flex gap-4 pt-3 first:pt-0">
                                                <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden flex-shrink-0 border border-slate-100">
                                                    {product.imageUrl ? (
                                                        <img
                                                            src={toAssetUrl(product.imageUrl)}
                                                            alt=""
                                                            onError={(e) => {
                                                                e.currentTarget.onerror = null;
                                                                e.currentTarget.src = '/marketplace_images/wheat.jpg';
                                                            }}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-200"><FiPackage /></div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-black text-slate-800 line-clamp-1 uppercase tracking-tight">{product.title}</h4>
                                                        <p className="text-[9px] font-black text-slate-400 mt-0.5 uppercase tracking-widest">{product.brandName || 'Agri Brand'}</p>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-2">
                                                        <p className="text-sm font-black text-slate-800">
                                                            ₹{product.price} <span className="text-[9px] font-bold text-slate-400">/ {product.unit}</span>
                                                        </p>
                                                        
                                                        {/* Quantity Changer */}
                                                        <div className="flex items-center gap-3 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100">
                                                            <button 
                                                                onClick={() => handleQtyChange(item, -1)}
                                                                className="text-slate-400 hover:text-slate-800 p-0.5"
                                                            >
                                                                <FiMinus className="w-3 h-3" />
                                                            </button>
                                                            <span className="text-xs font-black text-slate-800 font-sans min-w-[15px] text-center">
                                                                {item.quantity}
                                                            </span>
                                                            <button 
                                                                onClick={() => handleQtyChange(item, 1)}
                                                                className="text-slate-400 hover:text-slate-800 p-0.5"
                                                            >
                                                                <FiPlus className="w-3 h-3" />
                                                            </button>
                                                        </div>

                                                        {/* Remove Button */}
                                                        <button 
                                                            onClick={() => handleRemoveItem(item._id)}
                                                            className="p-2 text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors active:scale-95"
                                                        >
                                                            <FiTrash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary Card */}
                    <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-3">Bill Details</h4>
                        
                        <div className="space-y-2.5 text-xs font-bold text-slate-500">
                            <div className="flex justify-between">
                                <span>Items Subtotal</span>
                                <span className="text-slate-800 font-sans">₹{totals.itemsTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Platform Booking Fee</span>
                                <span className="text-slate-800 font-sans">₹{totals.platformFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Shipping charges</span>
                                <span className="text-slate-800 font-sans">₹{totals.shippingCharges.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 pt-3 text-sm font-black text-slate-800">
                                <span>Grand Total</span>
                                <span className="text-teal-600 font-sans">₹{totals.orderTotal.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 flex gap-3 mt-4">
                            <FiInfo className="text-teal-600 mt-0.5 flex-shrink-0" />
                            <p className="text-[10px] font-bold text-teal-800 leading-relaxed">
                                Pay Upfront Fee now to confirm the order. Balance due can be settled directly with the vendor upon delivery.
                            </p>
                        </div>
                    </div>

                    {/* Sticky Checkout Button */}
                    <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-50 border-t border-slate-100 z-30">
                        <div className="flex justify-between items-center mb-3 px-2">
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Payable</p>
                                <p className="text-xl font-black text-slate-800">₹{totals.orderTotal.toFixed(2)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black text-teal-500 uppercase tracking-widest">Upfront Platform Fee</p>
                                <p className="text-xl font-black text-teal-600">₹{totals.platformFee.toFixed(2)}</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setShowCheckout(true)}
                            className="w-full py-4.5 bg-[#2E7D32] hover:bg-[#1B5E20] text-white rounded-[28px] font-black text-sm uppercase tracking-wider active:scale-95 transition-all shadow-xl shadow-green-950/10 flex items-center justify-center gap-2"
                        >
                            Proceed to Checkout
                        </button>
                    </div>
                </div>
            )}

            {/* Checkout Modal */}
            <AnimatePresence>
                {showCheckout && (
                    <div className="fixed inset-0 z-[100] flex flex-col justify-end sm:p-6 sm:items-center">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCheckout(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
                        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="relative bg-white w-full max-w-md mx-auto rounded-t-[48px] sm:rounded-[48px] p-6 pb-8 shadow-2xl flex flex-col max-h-[90dvh]">
                            <div className="shrink-0 pb-4 relative">
                                <div 
                                    className="absolute -top-6 left-0 right-0 h-12 flex items-center justify-center cursor-pointer z-10"
                                    onClick={() => setShowCheckout(false)}
                                >
                                    <div className="w-12 h-1.5 bg-slate-300 rounded-full mt-2" />
                                </div>
                                <div className="pt-4">
                                    <h2 className="text-xl font-black text-slate-800 text-center">Confirm E-Commerce Order</h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mt-1">Pin location & choose payment type</p>
                                </div>
                            </div>
                            
                            <div className="space-y-6 overflow-y-auto overflow-x-hidden p-2 pb-4 scrollbar-hide flex-1 shrink">
                                {/* Map Location Picker */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pin Location on Map</label>
                                    <div className="w-full rounded-3xl overflow-hidden border border-slate-100 shadow-sm relative isolate" style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
                                        <LocationPicker onLocationSelect={(loc) => {
                                            let city = '', state = '', pincode = '';
                                            if (loc.components && Array.isArray(loc.components)) {
                                                loc.components.forEach(comp => {
                                                    if (comp.types.includes('locality')) city = comp.long_name;
                                                    if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
                                                    if (comp.types.includes('postal_code')) pincode = comp.long_name;
                                                });
                                            }
                                            setAddress({
                                                addressLine1: loc.address || '',
                                                city,
                                                state,
                                                pincode,
                                                lat: loc.lat || null,
                                                lng: loc.lng || null
                                            });
                                        }} />
                                    </div>
                                </div>

                                {/* Detailed Address */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Complete Address Details</label>
                                    <div className="relative">
                                        <textarea 
                                            rows="3"
                                            className="w-full bg-white border border-slate-200 rounded-3xl py-4 px-5 font-bold outline-none text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all resize-none shadow-sm" 
                                            placeholder="Add house no, street, landmark..." 
                                            value={address?.addressLine1 || ''} 
                                            onChange={e => setAddress(prev => ({ ...(prev || {}), addressLine1: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                {/* Payment Types */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Method</label>
                                    <div className="space-y-2">
                                        <label onClick={() => setPaymentType('split')} className={`flex items-start gap-3 p-4 rounded-3xl border cursor-pointer transition-all ${paymentType === 'split' ? 'border-teal-500 bg-teal-50/50 shadow-sm' : 'border-slate-200 bg-white'}`}>
                                            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${paymentType === 'split' ? 'border-teal-500' : 'border-slate-300'}`}>
                                                {paymentType === 'split' && <div className="w-2.5 h-2.5 bg-teal-500 rounded-full" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-800">Split Payment (Recommended)</p>
                                                <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">Pay Platform Fee (₹{totals.platformFee.toFixed(2)}) now. Pay remaining balance directly to vendor on delivery.</p>
                                            </div>
                                        </label>

                                        <label onClick={() => setPaymentType('online_full')} className={`flex items-start gap-3 p-4 rounded-3xl border cursor-pointer transition-all ${paymentType === 'online_full' ? 'border-teal-500 bg-teal-50/50 shadow-sm' : 'border-slate-200 bg-white'}`}>
                                            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${paymentType === 'online_full' ? 'border-teal-500' : 'border-slate-300'}`}>
                                                {paymentType === 'online_full' && <div className="w-2.5 h-2.5 bg-teal-500 rounded-full" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-800">Pay Full Amount Online</p>
                                                <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">Pay ₹{totals.orderTotal.toFixed(2)} securely now. Nothing to pay on delivery.</p>
                                            </div>
                                        </label>

                                        <label onClick={() => setPaymentType('cod')} className={`flex items-start gap-3 p-4 rounded-3xl border cursor-pointer transition-all ${paymentType === 'cod' ? 'border-teal-500 bg-teal-50/50 shadow-sm' : 'border-slate-200 bg-white'}`}>
                                            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${paymentType === 'cod' ? 'border-teal-500' : 'border-slate-300'}`}>
                                                {paymentType === 'cod' && <div className="w-2.5 h-2.5 bg-teal-500 rounded-full" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-800">Cash on Delivery</p>
                                                <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">Pay ₹{totals.orderTotal.toFixed(2)} to vendor upon delivery.</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                                
                                {paymentType === 'split' && (
                                    <div className="p-4 bg-orange-50 rounded-3xl border border-orange-100 flex items-start gap-3">
                                        <FiInfo className="text-orange-500 mt-1 flex-shrink-0" />
                                        <p className="text-[10px] font-bold text-orange-800 leading-relaxed">
                                            You are paying ₹{totals.platformFee.toFixed(2)} to confirm the order. The remaining balance must be paid to the vendor directly when goods are delivered.
                                        </p>
                                    </div>
                                )}

                                <button 
                                    disabled={placingOrder}
                                    onClick={handlePlaceOrder}
                                    className="w-full py-5 bg-[#2E7D32] text-white rounded-[28px] font-black text-lg uppercase tracking-widest active:scale-95 transition-all shadow-xl shadow-green-950/10 flex items-center justify-center"
                                >
                                    {placingOrder ? (
                                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>{paymentType === 'cod' ? 'Confirm Order' : `Confirm & Pay ₹${paymentType === 'online_full' ? totals.orderTotal.toFixed(2) : totals.platformFee.toFixed(2)}`}</>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AgriCart;
