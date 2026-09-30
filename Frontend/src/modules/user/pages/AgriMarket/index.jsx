import React, { useState, useEffect } from 'react';
import { 
    FiSearch, 
    FiFilter, 
    FiChevronLeft,
    FiPackage,
    FiArrowRight,
    FiShoppingCart,
    FiPlus
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import ecommerceService from '../../../../services/ecommerceService';
import { publicCatalogService } from '../../../../services/catalogService';
import { useEcommerceCart } from '../../../../context/EcommerceCartContext';
import { toastManager } from '../../../../utils/toastManager';
import { motion } from 'framer-motion';

const toAssetUrl = (url) => {
    if (!url) return '/marketplace_images/wheat.jpg';
    if (url.startsWith('/marketplace_images') || url.startsWith('/landing_images') || url.startsWith('/')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};

const AgriMarket = () => {
    const navigate = useNavigate();
    const { addToCart, cartCount } = useEcommerceCart();
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const handleAddToCartClick = async (product) => {
        try {
            const res = await addToCart(product._id, 1);
            if (res.success) {
                toastManager.success(`"${product.title}" added to cart!`);
            } else {
                toastManager.error(res.message || "Failed to add to cart");
            }
        } catch (err) {
            toastManager.error(err.response?.data?.message || "Failed to add to cart");
        }
    };
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [hasOrders, setHasOrders] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        let hasError = false;

        // Load products independently
        try {
            const prodRes = await ecommerceService.getProducts();
            if (prodRes.success) setProducts(prodRes.data || []);
        } catch (err) {
            console.error('Products fetch error:', err?.response?.data || err.message);
            hasError = true;
        }

        // Load categories independently (filter strictly for products)
        try {
            const catRes = await publicCatalogService.getCategories({ type: 'product' });
            if (catRes.success) {
                const allCats = catRes.categories || catRes.data || [];
                // STRICT FILTER: Only show categories meant for Seeds & Fertilizers marketplace
                // This hides any machinery or accidental test categories (like Tractor, Rotavator)
                const allowedKeywords = ['seed', 'fertilizer', 'pesticide', 'chemical', 'urea', 'zinc', 'spray', 'nutrition', 'crop'];
                const filteredCats = allCats.filter(cat => {
                    const title = cat.title?.toLowerCase() || '';
                    return allowedKeywords.some(kw => title.includes(kw));
                });
                setCategories(filteredCats);
                // Removed auto-selecting the first category because the UI to change it is removed
            }
        } catch (err) {
            console.error('Categories fetch error:', err.message);
        }

        if (hasError) {
            toastManager.error("Products load karne mein dikkat hui");
        }

        // Check for existing orders
        try {
            const orderRes = await ecommerceService.getMyOrders();
            if (orderRes.success && orderRes.data?.length > 0) {
                setHasOrders(true);
            }
        } catch (err) {
            console.error('Orders check error:', err.message);
        }
        
        setLoading(false);
    };

    const filteredProducts = products.filter(p => {
        const trimmedSearch = searchTerm.trim().toLowerCase();
        const matchesSearch = p.title.toLowerCase().includes(trimmedSearch);
        const matchesCategory = selectedCategory === 'all' || p.categoryId?._id === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Premium Header */}
            <div className="bg-white px-6 pt-12 pb-6 rounded-b-[48px] shadow-sm border-b border-slate-100 sticky top-0 z-40">
                <div className="flex items-center justify-between gap-4 mb-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/user')} className="p-3 bg-slate-50 rounded-2xl relative z-50 cursor-pointer pointer-events-auto active:scale-95 transition-all">
                            <FiChevronLeft className="w-6 h-6 text-slate-800" />
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-slate-800 leading-none">Agri Market</h1>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Seeds & Fertilizers</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 relative z-50">

                        <button 
                            onClick={() => navigate('/user/agri-cart')}
                            className="p-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl relative z-50 cursor-pointer active:scale-95 transition-all shadow-sm border border-slate-100"
                        >
                            <FiShoppingCart className="w-5 h-5 text-slate-800" />
                            {cartCount > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-[#2E7D32] text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border border-white min-w-[18px] text-center shadow-sm">
                                    {cartCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex-1 bg-slate-50 rounded-2xl px-5 py-2 flex items-center gap-3 border border-slate-300">
                        <FiSearch className="text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Search seeds, urea, zinc..." 
                            className="bg-transparent border-none outline-none font-bold text-sm w-full placeholder:text-slate-300"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Track My Orders (Top position) */}
            {hasOrders && (
                <div className="px-6 pt-6 -mb-2">
                    <button 
                        onClick={() => navigate('/user/my-agri-orders')}
                        className="w-full flex items-center justify-between bg-slate-900 text-white px-6 py-4 rounded-3xl shadow-lg active:scale-95 transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                                <FiPackage className="w-5 h-5 text-white" />
                            </div>
                            <div className="text-left">
                                <span className="text-xs font-black uppercase tracking-widest block">Track My Orders</span>
                                <span className="text-[10px] text-slate-400 font-bold block mt-0.5">View your purchase history</span>
                            </div>
                        </div>
                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                            <FiArrowRight className="w-4 h-4" />
                        </div>
                    </button>
                </div>
            )}

            <div className="p-6 space-y-8 pb-32">
                {/* Categories removed as per user request */}
                {/* Products Grid */}
                <div className="grid grid-cols-2 gap-4">
                    {loading ? (
                        [1,2,3,4].map(i => <div key={i} className="aspect-[4/5] bg-slate-200 rounded-[32px] animate-pulse" />)
                    ) : filteredProducts.length === 0 ? (
                        <div className="col-span-2 py-20 text-center">
                            <FiPackage className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                            <p className="font-black text-slate-400 uppercase text-[10px] tracking-widest">No products found</p>
                        </div>
                    ) : (
                        filteredProducts.map((product, idx) => (
                            <motion.div 
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                key={product._id || `prod-${idx}`} 
                                onClick={() => navigate(`/user/agri-marketplace/${product._id}`)}
                                className="flex flex-col group cursor-pointer"
                            >
                                {/* Standalone Elevated Image Frame */}
                                <div className="w-full aspect-square rounded-[22px] bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(0,0,0,0.05)] group-hover:shadow-[0_8px_20px_rgba(0,0,0,0.09)] group-hover:border-teal-300/70 transition-all duration-300 relative overflow-hidden flex items-center justify-center p-1.5">
                                    <img 
                                        src={toAssetUrl(product.imageUrl)} 
                                        alt={product.title} 
                                        onError={(e) => {
                                            e.currentTarget.onerror = null;
                                            e.currentTarget.src = '/marketplace_images/wheat.jpg';
                                        }}
                                        className="w-full h-full object-cover rounded-[16px] group-hover:scale-105 transition-transform duration-500" 
                                    />
                                    
                                    {/* Small Verified Badge */}
                                    <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-white/90 backdrop-blur-md rounded-md border border-white/60 shadow-xs">
                                        <div className="flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 bg-teal-500 rounded-full" />
                                            <p className="text-[7px] font-black text-teal-700 uppercase tracking-tighter">Verified</p>
                                        </div>
                                    </div>

                                    {(product.discountPrice || product.calculatorPrice?.discountPercentage > 0) && (
                                        <div className="absolute top-2 right-2 bg-amber-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                                            Offer
                                        </div>
                                    )}
                                </div>

                                {/* Separated Details Underneath */}
                                <div className="pt-2 px-1 flex flex-col flex-1">
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate mb-0.5">
                                        {product.brandName || 'Agri Best'}
                                    </p>
                                    
                                    <h3 className="font-bold text-slate-800 text-xs leading-tight line-clamp-1 mb-1 group-hover:text-teal-700 transition-colors">
                                        {product.title}
                                    </h3>
                                    
                                    <div className="flex flex-col mt-auto">
                                        <div className="flex items-baseline gap-0.5">
                                            <span className="text-sm font-black text-slate-900">₹{product.calculatorPrice?.totalPrice || product.discountPrice || product.price}</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">/ {product.unit}</span>
                                        </div>

                                        {/* Compact Stock Indicator */}
                                        <div className="flex items-center justify-between mt-1">
                                            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
                                                product.stock > 10 
                                                    ? 'bg-emerald-50 text-emerald-600' 
                                                    : product.stock > 0 
                                                        ? 'bg-amber-50 text-amber-600' 
                                                        : 'bg-red-50 text-red-600'
                                            }`}>
                                                <div className={`w-1 h-1 rounded-full ${
                                                    product.stock > 10 ? 'bg-emerald-500' : product.stock > 0 ? 'bg-amber-500' : 'bg-red-500'
                                                }`} />
                                                <span className="text-[7px] font-black uppercase tracking-tight">
                                                    {product.stock > 0 ? 'In Stock' : 'Out'}
                                                </span>
                                            </div>
                                            
                                            {product.stock > 0 && (
                                                <p className="text-[8px] font-bold text-slate-400">
                                                    {product.stock} left
                                                </p>
                                            )}
                                        </div>

                                        {/* Add to Cart button */}
                                        {product.stock > 0 ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAddToCartClick(product);
                                                }}
                                                className="mt-2 w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1 shadow-sm cursor-pointer border border-teal-600/10"
                                            >
                                                <FiPlus className="w-3 h-3" /> Add to Cart
                                            </button>
                                        ) : (
                                            <button
                                                disabled
                                                className="mt-2 w-full py-2 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-not-allowed flex items-center justify-center"
                                            >
                                                Out of Stock
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgriMarket;
