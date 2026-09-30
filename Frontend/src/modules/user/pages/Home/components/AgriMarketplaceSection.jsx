import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiShoppingCart, FiArrowRight, FiPlus, FiTag } from 'react-icons/fi';
import { motion } from 'framer-motion';
import productService from '../../../services/productService';
import { useCart } from '../../../../../context/CartContext';
import { toastManager } from '../../../../../utils/toastManager';
import { themeColors } from '../../../../../theme';

const toAssetUrl = (url) => {
    if (!url) return '/marketplace_images/wheat.jpg';
    if (url.startsWith('/marketplace_images') || url.startsWith('/landing_images') || url.startsWith('/')) return url;
    const clean = url.replace('/api/upload', '/upload');
    if (clean.startsWith('http')) return clean;
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
    return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const AgriMarketplaceSection = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const { addToCart } = useCart();

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const params = { isFeatured: true };
                const res = await productService.getProducts(params);
                if (res.success) {
                    setProducts(res.data);
                }
            } catch (err) {
                console.error("Marketplace fetch error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchProducts();
    }, []);

    const handleAddToCart = async (product) => {
        try {
            const cartItemData = {
                serviceId: product._id, // Products use same cart flow
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
                type: 'product' // New type indicator
            };

            const res = await addToCart(cartItemData);
            if (res.success) {
                toastManager.success(`${product.title} added to cart!`);
            }
        } catch (error) {
            toastManager.error('Galti ho gayi. Phir se koshish karein.');
        }
    };

    if (!loading && products.length === 0) return null;

    return (
        <section className="px-5 mb-8">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">Agri Marketplace</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quality Seeds & Fertilizers</p>
                </div>
                <button
                    onClick={() => navigate('/user/agri-marketplace')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-black transition-all active:scale-95"
                >
                    See All <FiArrowRight />
                </button>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                {loading ? (
                    [1, 2, 3].map(i => (
                        <div key={i} className="min-w-[155px] max-w-[165px] flex flex-col gap-2">
                            <div className="w-full aspect-square bg-slate-100 rounded-[20px] animate-pulse" />
                            <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
                            <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
                            <div className="h-4 w-16 bg-slate-100 rounded animate-pulse mt-0.5" />
                        </div>
                    ))
                ) : (
                    products.map((product) => (
                        <motion.div
                            key={product._id}
                            whileHover={{ y: -4 }}
                            onClick={() => navigate(`/user/agri-marketplace/${product._id}`)}
                            className="min-w-[155px] max-w-[165px] flex flex-col cursor-pointer group"
                        >
                            {/* Frameless Modern Image Container */}
                            <div className="relative w-full aspect-square rounded-[20px] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.07)] group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all duration-300 bg-slate-50">
                                <img
                                    src={toAssetUrl(product.imageUrl)}
                                    alt={product.title}
                                    onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = '/marketplace_images/wheat.jpg';
                                    }}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />

                                {/* Offer Badge */}
                                {product.discountPrice && (
                                    <div className="absolute top-2 left-2 bg-emerald-600/95 backdrop-blur-xs text-white text-[8.5px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                                        SAVE ₹{product.price - product.discountPrice}
                                    </div>
                                )}

                                {/* Floating Add to Cart Pill Button on Image Corner */}
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

                            {/* Clean Product Details Underneath */}
                            <div className="pt-2 px-0.5 flex flex-col flex-1">
                                <p className="text-[10px] font-black text-emerald-800/80 uppercase tracking-wider mb-0.5 truncate">
                                    {product.brandName || 'Top Brand'}
                                </p>
                                <h3 className="text-xs font-black text-slate-800 group-hover:text-emerald-700 line-clamp-2 leading-[1.25] transition-colors min-h-[30px]" title={product.title}>
                                    {product.title}
                                </h3>

                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className="text-sm font-black text-slate-900 leading-none">
                                        ₹{product.discountPrice || product.price}
                                    </span>
                                    {product.discountPrice && (
                                        <span className="text-[10px] font-bold text-slate-400 line-through">
                                            ₹{product.price}
                                        </span>
                                    )}
                                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-tight">
                                        / {product.unit}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </section>
    );
};

export default AgriMarketplaceSection;
