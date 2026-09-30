import React, { useState, useEffect, useRef } from 'react';
import { 
    FiChevronLeft, 
    FiChevronRight,
    FiPackage, 
    FiCheckCircle, 
    FiInfo,
    FiPlus,
    FiMinus,
    FiShield,
    FiTruck,
    FiShoppingCart
} from 'react-icons/fi';
import { useParams, useNavigate } from 'react-router-dom';
import ecommerceService from '../../../../services/ecommerceService';
import { useEcommerceCart } from '../../../../context/EcommerceCartContext';
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

const ProductDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToCart, cartCount } = useEcommerceCart();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [quantity, setQuantity] = useState(1);
    const [showCheckout, setShowCheckout] = useState(false);
    const [address, setAddress] = useState(null); // Will hold {addressLine1, lat, lng}
    const [paymentType, setPaymentType] = useState('split'); // 'split', 'online_full', 'cod'
    const [adding, setAdding] = useState(false);
    const scrollRef = useRef(null);

    const handleAddToCart = async () => {
        try {
            setAdding(true);
            const res = await addToCart(product._id, quantity);
            if (res.success) {
                toastManager.success("Cart mein add ho gaya!");
            } else {
                toastManager.error(res.message || "Failed to add to cart");
            }
        } catch (err) {
            toastManager.error(err.response?.data?.message || "Cart mein add karne mein dikkat hui");
        } finally {
            setAdding(false);
        }
    };

    const scrollImage = (direction) => {
        if (scrollRef.current) {
            const { scrollLeft, clientWidth } = scrollRef.current;
            const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
            scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

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

    useEffect(() => {
        fetchProduct();
    }, [id]);

    const fetchProduct = async () => {
        try {
            setLoading(true);
            const res = await ecommerceService.getProductDetails(id);
            if (res.success) setProduct(res.data);
        } catch (err) {
            toastManager.error("Failed to load product details");
        } finally {
            setLoading(false);
        }
    };

    const handlePlaceOrder = async () => {
        if (!address || !address.addressLine1) return toastManager.error("Please pin your location on the map");
        try {
            const res = await ecommerceService.placeOrder({
                productId: product._id,
                quantity,
                shippingAddress: address,
                paymentType
            });
            if (res.success) {
                if (paymentType === 'cod') {
                    toastManager.success("Order Placed Successfully!");
                    navigate('/user/my-agri-orders');
                } else {
                    toastManager.success("Order Placed! Please complete payment to confirm.");
                    navigate(`/user/order-payment/${res.data._id}`);
                }
            }
        } catch (err) {
            toastManager.error(err.response?.data?.message || "Order failed");
        }
    };

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-12 overflow-hidden"><div className="w-12 h-12 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" /></div>;
    if (!product) return <div className="p-20 text-center font-black text-slate-400">PRODUCT NOT FOUND</div>;

    const basePrice = product.price || 0;
    const commissionPercentage = product.commissionPercentage || 0;
    const gstPercentage = product.gstPercentage || 5;

    const commission = (basePrice * quantity) * (commissionPercentage / 100);
    const gstTotal = (basePrice * quantity) * (gstPercentage / 100);
    const calculatedPlatformFee = commission + gstTotal;

    const adminFee = calculatedPlatformFee;
    const vendorBalance = basePrice * quantity;
    const totalPayable = adminFee + vendorBalance;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Gallery Section */}
            <div className="relative aspect-[4/3] bg-white rounded-b-[48px] overflow-hidden shadow-sm">
                <div className="absolute top-12 left-6 z-10">
                    <button onClick={() => navigate(-1)} className="p-3 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl shadow-slate-900/10 active:scale-95 transition-all">
                        <FiChevronLeft className="w-6 h-6 text-slate-800" />
                    </button>
                </div>
                
                <div className="absolute top-12 right-6 z-10">
                    <button onClick={() => navigate('/user/agri-cart')} className="p-3 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl shadow-slate-900/10 active:scale-95 transition-all relative">
                        <FiShoppingCart className="w-6 h-6 text-slate-800" />
                        {cartCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-[#2E7D32] text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border border-white min-w-[18px] text-center shadow-sm">
                                {cartCount}
                            </span>
                        )}
                    </button>
                </div>
                
                {product.images && product.images.length > 0 ? (
                    <div className="relative w-full h-full group">
                        <div ref={scrollRef} className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide" onScroll={(e) => {
                            const scrollLeft = e.target.scrollLeft;
                            const width = e.target.offsetWidth;
                            const activeIndex = Math.round(scrollLeft / width);
                            const dots = document.querySelectorAll('.image-dot');
                            dots.forEach((dot, i) => {
                                if (i === activeIndex) {
                                    dot.classList.add('bg-teal-500', 'w-4');
                                    dot.classList.remove('bg-white/50', 'w-1.5');
                                } else {
                                    dot.classList.add('bg-white/50', 'w-1.5');
                                    dot.classList.remove('bg-teal-500', 'w-4');
                                }
                            });
                        }}>
                            {product.images.map((img, idx) => (
                                <img
                                    key={idx}
                                    src={toAssetUrl(img)}
                                    alt=""
                                    onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = '/marketplace_images/wheat.jpg';
                                    }}
                                    className="w-full h-full object-cover flex-shrink-0 snap-center"
                                />
                            ))}
                        </div>
                        {product.images.length > 1 && (
                            <>
                                <button onClick={() => scrollImage('left')} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-slate-800 shadow-lg active:scale-90 transition-all z-20">
                                    <FiChevronLeft className="w-6 h-6 -ml-0.5" />
                                </button>
                                <button onClick={() => scrollImage('right')} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-slate-800 shadow-lg active:scale-90 transition-all z-20">
                                    <FiChevronRight className="w-6 h-6 ml-0.5" />
                                </button>
                                <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5 z-20">
                                    {product.images.map((_, idx) => (
                                        <div key={idx} className={`image-dot h-1.5 rounded-full transition-all duration-300 ${idx === 0 ? 'bg-teal-500 w-4' : 'bg-white/50 w-1.5'}`} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                ) : product.imageUrl ? (
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
                    <div className="w-full h-full flex items-center justify-center text-slate-100 bg-slate-200"><FiPackage className="w-24 h-24" /></div>
                )}
            </div>

            <div className="p-8 space-y-8 pb-72">
                {/* Title & Price */}
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider truncate max-w-[60%]">{product.brandName || 'Local Brand'}</p>
                        <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-0.5 rounded-full shrink-0">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">In Stock: {product.stock} {product.unit}s</span>
                        </div>
                    </div>
                    
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">{product.title}</h1>
                    
                    <div className="flex items-baseline gap-2 pt-1 flex-wrap">
                        <p className="text-2xl font-black text-slate-900">₹{basePrice}</p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">/ {product.unit}</p>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full ml-1 whitespace-nowrap">Base Price</span>
                    </div>
                </div>

                {/* Quantity Selector */}
                <div className="flex items-center justify-between px-2 bg-white p-3 rounded-[24px] border border-slate-100 shadow-sm">
                    <div>
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Select Quantity</h3>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">Total units to order</p>
                    </div>
                    <div className="flex items-center gap-4 bg-slate-50 p-1.5 border border-slate-200/60 rounded-2xl">
                        <button onClick={() => setQuantity(q => Math.max(1, q-1))} className="w-9 h-9 bg-white text-slate-700 rounded-xl flex items-center justify-center font-bold shadow-sm active:scale-90 transition-all border border-slate-100">
                            <FiMinus className="w-4 h-4" />
                        </button>
                        <span className="text-lg font-black text-slate-900 font-sans min-w-[24px] text-center">{quantity}</span>
                        <button onClick={() => setQuantity(q => q + 1)} className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center font-bold shadow-md active:scale-90 transition-all">
                            <FiPlus className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Split Payment Info */}
                <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-800 uppercase tracking-wider">
                        <FiInfo className="text-teal-600" /> Payment Structure
                    </div>
                    
                    <div className="space-y-3">
                        <div className="p-4 pl-6 bg-white rounded-2xl border border-teal-100 shadow-[0_4px_20px_-4px_rgba(20₹84₹66,0.1)] relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-2.5 h-full bg-teal-500"></div>
                            <div className="flex justify-between items-center mb-4 gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-black text-slate-800 uppercase tracking-wider whitespace-nowrap">Booking Amount</p>
                                    <p className="text-[10px] font-medium text-slate-400 mt-0.5 whitespace-nowrap">Pay now to confirm order</p>
                                </div>
                                <p className="text-2xl font-black text-teal-600 font-sans tracking-tight shrink-0 ml-2">₹{adminFee.toFixed(2)}</p>
                            </div>
                            
                            <div className="pt-3 border-t border-dashed border-slate-200 space-y-2">
                                <div className="flex justify-between items-center gap-2">
                                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                                        <span className="whitespace-nowrap">Platform Commission</span> 
                                        <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">{commissionPercentage}%</span>
                                    </p>
                                    <p className="text-xs font-black text-slate-800 font-sans shrink-0">₹{commission.toFixed(2)}</p>
                                </div>
                                <div className="flex justify-between items-center gap-2">
                                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                                        <span className="whitespace-nowrap">GST (Taxes)</span> 
                                        <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">{gstPercentage}%</span>
                                    </p>
                                    <p className="text-xs font-black text-slate-800 font-sans shrink-0">₹{gstTotal.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex justify-between items-center p-4 pl-5 bg-slate-50 rounded-2xl border border-slate-200/80 shadow-sm gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-slate-800 uppercase tracking-wider whitespace-nowrap">Base Price</p>
                                <p className="text-[10px] font-medium text-slate-400 mt-0.5 whitespace-nowrap">Pay to vendor on delivery</p>
                            </div>
                            <p className="text-2xl font-black text-slate-800 font-sans tracking-tight shrink-0 ml-2">₹{vendorBalance.toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                {/* Description & Specs */}
                <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">About Product</h3>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">{product.description || 'No description provided'}</p>
                    
                    {product.specifications && product.specifications.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            {product.specifications.map((spec, i) => (
                                <div key={i} className="p-3 bg-white rounded-2xl border border-slate-50 flex items-center gap-3">
                                    <div className="w-8 h-8 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <FiCheckCircle className="text-teal-600 text-xs" />
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter leading-none">{spec.name}</p>
                                        <p className="text-[10px] font-black text-slate-800 uppercase leading-none mt-1">{spec.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Trust Badges */}
                <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 flex-shrink-0">
                            <FiShield />
                        </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">Admin<br/>Verified</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 flex-shrink-0">
                            <FiTruck />
                        </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">Fast<br/>Delivery</p>
                    </div>
                </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="fixed bottom-0 left-0 right-0 p-4 pb-4 pt-2 bg-white border-t border-slate-100 z-50 shadow-[0_-8px_30px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between mb-3 px-2">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Value</p>
                        <p className="text-xl font-black text-slate-800">₹{totalPayable}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-black text-teal-500 uppercase tracking-widest">Confirm Fee</p>
                        <p className="text-xl font-black text-teal-600">₹{adminFee}</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button 
                        disabled={product.stock <= 0 || adding}
                        onClick={handleAddToCart}
                        className={`flex-1 py-4 rounded-2xl font-black text-[#2E7D32] border-2 border-[#2E7D32] bg-white transition-all text-xs uppercase tracking-wider active:scale-95 flex items-center justify-center gap-1.5 ${
                            product.stock <= 0 ? 'border-slate-200 text-slate-400 cursor-not-allowed active:scale-100' : 'hover:bg-slate-50'
                        }`}
                    >
                        {adding ? 'Adding...' : 'Add to Cart'}
                    </button>
                    <button 
                        disabled={product.stock <= 0}
                        onClick={() => setShowCheckout(true)}
                        className={`flex-1 py-4 rounded-2xl font-black text-white transition-all text-xs uppercase tracking-wider active:scale-95 ${
                            product.stock <= 0 
                                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none active:scale-100' 
                                : 'bg-[#2E7D32] hover:bg-[#1B5E20] shadow-lg shadow-green-950/10'
                        }`}
                    >
                        {product.stock <= 0 ? 'Out of Stock' : 'Order Now'}
                    </button>
                </div>
            </div>

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
                                    <h2 className="text-xl font-black text-slate-800 text-center">Confirm Order</h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mt-1">Seeds & Fertilizers Delivery</p>
                                </div>
                            </div>
                            
                            <div className="space-y-6 overflow-y-auto overflow-x-hidden p-2 pb-4 scrollbar-hide flex-1 shrink">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pin Location on Map</label>
                                    <div className="w-full rounded-3xl overflow-hidden border border-slate-100 shadow-sm relative isolate" style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
                                        <LocationPicker onLocationSelect={(loc) => {
                                            // Parse city/state from Google address_components if available
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
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Method</label>
                                    <div className="space-y-2">
                                        <label onClick={() => setPaymentType('split')} className={`flex items-start gap-3 p-4 rounded-3xl border cursor-pointer transition-all ${paymentType === 'split' ? 'border-teal-500 bg-teal-50/50 shadow-sm' : 'border-slate-200 bg-white'}`}>
                                            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${paymentType === 'split' ? 'border-teal-500' : 'border-slate-300'}`}>
                                                {paymentType === 'split' && <div className="w-2.5 h-2.5 bg-teal-500 rounded-full" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-800">Split Payment (Recommended)</p>
                                                <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">Pay Platform Fee (₹{adminFee}) now. Pay remaining (₹{vendorBalance}) on delivery.</p>
                                            </div>
                                        </label>

                                        <label onClick={() => setPaymentType('online_full')} className={`flex items-start gap-3 p-4 rounded-3xl border cursor-pointer transition-all ${paymentType === 'online_full' ? 'border-teal-500 bg-teal-50/50 shadow-sm' : 'border-slate-200 bg-white'}`}>
                                            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${paymentType === 'online_full' ? 'border-teal-500' : 'border-slate-300'}`}>
                                                {paymentType === 'online_full' && <div className="w-2.5 h-2.5 bg-teal-500 rounded-full" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-800">Pay Full Amount Online</p>
                                                <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">Pay ₹{totalPayable} securely now. Nothing to pay on delivery.</p>
                                            </div>
                                        </label>

                                        <label onClick={() => setPaymentType('cod')} className={`flex items-start gap-3 p-4 rounded-3xl border cursor-pointer transition-all ${paymentType === 'cod' ? 'border-teal-500 bg-teal-50/50 shadow-sm' : 'border-slate-200 bg-white'}`}>
                                            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${paymentType === 'cod' ? 'border-teal-500' : 'border-slate-300'}`}>
                                                {paymentType === 'cod' && <div className="w-2.5 h-2.5 bg-teal-500 rounded-full" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-800">Cash on Delivery</p>
                                                <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">Pay ₹{totalPayable} to vendor upon delivery.</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                                
                                {paymentType === 'split' && (
                                    <div className="p-4 bg-orange-50 rounded-3xl border border-orange-100 flex items-start gap-3">
                                        <FiInfo className="text-orange-500 mt-1 flex-shrink-0" />
                                        <p className="text-[10px] font-bold text-orange-800 leading-relaxed">
                                            You are paying ₹{adminFee} to confirm the order. The remaining ₹{vendorBalance} must be paid to the vendor directly when goods are delivered.
                                        </p>
                                    </div>
                                )}

                                <button 
                                    onClick={handlePlaceOrder}
                                    className="w-full py-5 bg-[#2E7D32] text-white rounded-[28px] font-black text-lg uppercase tracking-widest active:scale-95 transition-all shadow-xl shadow-green-900/10"
                                >
                                    {paymentType === 'cod' ? 'Confirm Order' : `Confirm & Pay ₹${paymentType === 'online_full' ? totalPayable : adminFee}`}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ProductDetail;
