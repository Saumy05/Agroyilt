import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiShoppingCart, FiArrowLeft, FiPlus, FiFilter, FiTag } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import productService from '../../services/productService';
import { publicCatalogService } from '../../../../services/catalogService';
import { useCart } from '../../../../context/CartContext';
import { toastManager } from '../../../../utils/toastManager';
import { themeColors } from '../../../../theme';

const toAssetUrl = (url) => {
    if (!url) return '/marketplace_images/wheat.jpg';
    if (url.startsWith('/marketplace_images') || url.startsWith('/landing_images') || url.startsWith('/')) return url;
    const clean = url.replace('/api/upload', '/upload');
    if (clean.startsWith('http')) return clean;
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
    return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const MarketplacePage = () => {
    const navigate = useNavigate();
    const { addToCart } = useCart();

    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [isSearching, setIsSearching] = useState(false);
    const [userLocation, setUserLocation] = useState(null);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);

            let locParams = {};
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 });
                });
                locParams = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    radius: 50 // Default 50km radius
                };
                setUserLocation(locParams);
            } catch (geoErr) {
                console.warn("Could not get location:", geoErr);
            }

            const [prodRes, catRes] = await Promise.all([
                productService.getProducts(locParams),
                publicCatalogService.getCategories()
            ]);

            if (prodRes.success) setProducts(prodRes.data);
            if (catRes.success) {
                // Only show categories that have products or are specifically for marketplace
                // For now, let's filter if they have 'Agri' or 'Marketplace' in title or just show all
                setCategories(catRes.data);
            }
        } catch (err) {
            console.error("Marketplace load error:", err);
            toastManager.error("Data load karne mein dikkat hai.");
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        setIsSearching(true);

        try {
            const params = {
                query,
                categoryId: selectedCategory === 'all' ? undefined : selectedCategory
            };
            if (userLocation) {
                params.lat = userLocation.lat;
                params.lng = userLocation.lng;
                params.radius = userLocation.radius;
            }

            const res = await productService.getProducts(params);
            if (res.success) {
                setProducts(res.data);
            }
        } catch (err) {
            console.error("Search error:", err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleCategoryClick = async (catId) => {
        setSelectedCategory(catId);
        setLoading(true);
        try {
            const params = {
                categoryId: catId === 'all' ? undefined : catId,
                query: searchQuery
            };
            if (userLocation) {
                params.lat = userLocation.lat;
                params.lng = userLocation.lng;
                params.radius = userLocation.radius;
            }

            const res = await productService.getProducts(params);
            if (res.success) {
                setProducts(res.data);
            }
        } catch (err) {
            console.error("Category filter error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddToCart = async (product) => {
        try {
            const cartItemData = {
                serviceId: product._id,
                categoryId: product.categoryId?._id || product.categoryId,
                title: product.title,
                description: product.description || '',
                icon: toAssetUrl(product.imageUrl),
                category: 'Marketplace',
                categoryTitle: 'Agri Inputs',
                price: product.discountPrice || product.price,
                originalPrice: product.discountPrice ? product.price : null,
                unitPrice: product.discountPrice || product.price,
                serviceCount: 1,
                vendorId: product.vendorId || null,
                type: 'product'
            };

            const res = await addToCart(cartItemData);
            if (res.success) {
                toastManager.success(`${product.title} added!`);
            }
        } catch (error) {
            toastManager.error('Galti ho gayi.');
        }
    };

    return (
        <div className="min-h-screen bg-white pb-24">
            {/* Premium Header */}
            <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
                <div className="px-5 py-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-xl bg-slate-50 text-slate-600 active:scale-90 transition-all"
                    >
                        <FiArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">Agri Marketplace</h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Smart Farming Store</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="px-5 pb-4">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                            <FiSearch className="w-4 h-4" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search seeds, fertilizers..."
                            value={searchQuery}
                            onChange={handleSearch}
                            className="w-full bg-slate-50 border-none rounded-2xl py-3.5 pl-11 pr-4 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all outline-none shadow-sm"
                        />
                        {isSearching && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Category Filter */}
                <div className="px-5 pb-4 flex gap-2 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => handleCategoryClick('all')}
                        className={`flex-shrink-0 px-5 py-2 rounded-xl text-xs font-black transition-all ${selectedCategory === 'all'
                            ? 'bg-slate-800 text-white shadow-lg shadow-slate-200'
                            : 'bg-slate-50 text-slate-500'
                            }`}
                    >
                        All Items
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat._id}
                            onClick={() => handleCategoryClick(cat._id)}
                            className={`flex-shrink-0 px-5 py-2 rounded-xl text-xs font-black transition-all ${selectedCategory === cat._id
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100'
                                : 'bg-slate-50 text-slate-500'
                                }`}
                        >
                            {cat.title}
                        </button>
                    ))}
                </div>
            </div>

            {/* Products Grid */}
            <div className="px-5 pt-6">
                {loading ? (
                    <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="h-64 bg-slate-50 rounded-3xl animate-pulse" />
                        ))}
                    </div>
                ) : products.length === 0 ? (
                    <div className="py-20 text-center">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FiTag className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="font-bold text-slate-800">No products found</h3>
                        <p className="text-sm text-slate-400 px-10 mt-1">Try searching with different keywords or category.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        {products.map((product) => (
                            <motion.div
                                key={product._id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col group cursor-pointer"
                            >
                                {/* Frameless Modern Image Frame */}
                                <div className="relative w-full aspect-square rounded-[22px] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all duration-300 bg-slate-50">
                                    <img
                                        src={toAssetUrl(product.imageUrl)}
                                        alt={product.title}
                                        onError={(e) => {
                                            e.currentTarget.onerror = null;
                                            e.currentTarget.src = '/marketplace_images/wheat.jpg';
                                        }}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                    {product.discountPrice && (
                                        <div className="absolute top-2.5 left-2.5 bg-rose-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
                                            {Math.round((1 - product.discountPrice / product.price) * 100)}% Off
                                        </div>
                                    )}

                                    {/* Floating Add to Cart Button */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddToCart(product);
                                        }}
                                        className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 text-emerald-700 hover:bg-emerald-600 hover:text-white shadow-[0_3px_10px_rgba(0,0,0,0.18)] flex items-center justify-center transition-all duration-200 active:scale-90 border border-slate-100"
                                        title="Add to Cart"
                                    >
                                        <FiPlus className="w-4 h-4 stroke-[2.5]" />
                                    </button>
                                </div>

                                {/* Clean Product Info Underneath */}
                                <div className="pt-2 px-0.5 flex flex-col flex-1">
                                    <p className="text-[9.5px] font-black text-emerald-800/80 uppercase tracking-wider mb-0.5 truncate">
                                        {product.brandName || 'Quality Assured'}
                                    </p>
                                    <h3 className="text-xs font-black text-slate-800 line-clamp-2 leading-tight mb-2 group-hover:text-emerald-700 transition-colors min-h-[30px]">
                                        {product.title}
                                    </h3>

                                    {/* Tech Specs Tags */}
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {product.distance !== undefined && (
                                            <span className="text-[7px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md border border-blue-100 flex items-center gap-0.5">
                                                📍 {product.distance.toFixed(1)} km
                                            </span>
                                        )}
                                        {product.hasDriver && (
                                            <span className="text-[7px] font-black uppercase tracking-widest bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-md border border-orange-200">
                                                Driver Included
                                            </span>
                                        )}
                                        {product.specifications && product.specifications.slice(0, 2).map((spec, i) => (
                                            <span key={i} className="text-[7px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-md border border-emerald-100">
                                                {spec.name}: {spec.value}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="mt-auto flex items-baseline gap-1">
                                        <p className="text-base font-black text-slate-900 leading-none">₹{product.discountPrice || product.price}</p>
                                        {product.discountPrice && (
                                            <p className="text-[10px] font-bold text-slate-400 line-through">₹{product.price}</p>
                                        )}
                                        <p className="text-[9px] font-bold text-slate-400">/{product.unit}</p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarketplacePage;
