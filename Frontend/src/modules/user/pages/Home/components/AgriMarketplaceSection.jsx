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
                        <div key={i} className="min-w-[160px] flex flex-col gap-2">
                            <div className="w-full aspect-square bg-white rounded-[22px] animate-pulse border border-slate-100" />
                            <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
                            <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
                            <div className="h-6 w-full bg-slate-100 rounded animate-pulse mt-1" />
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
                            {/* Standalone Elevated Image Frame */}
                            <div className="w-full aspect-square rounded-[22px] bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(0,0,0,0.05)] group-hover:shadow-[0_8px_20px_rgba(0,0,0,0.09)] group-hover:border-emerald-300/70 transition-all duration-300 relative overflow-hidden flex items-center justify-center p-1.5">
                                <img
                                    src={toAssetUrl(product.imageUrl)}
                                    alt={product.title}
                                    onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = '/marketplace_images/wheat.jpg';
                                    }}
                                    className="w-full h-full object-cover rounded-[16px] group-hover:scale-106 transition-transform duration-500"
                                />
                                {product.discountPrice && (
                                    <div className="absolute top-2.5 left-2.5 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                                        Offer
                                    </div>
                                )}
                            </div>

                            {/* Separated Product Details Underneath */}
                            <div className="pt-2 px-1 flex flex-col flex-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                                    {product.brandName || 'Top Brand'}
                                </p>
                                <h3 className="text-xs font-black text-slate-800 group-hover:text-emerald-700 line-clamp-2 leading-[1.25] transition-colors min-h-[30px]" title={product.title}>
                                    {product.title}
                                </h3>

                                <div className="mt-1.5 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-black text-emerald-600 leading-none">
                                            ₹{product.discountPrice || product.price}
                                        </p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">per {product.unit}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddToCart(product);
                                        }}
                                        className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md hover:bg-emerald-600 active:scale-90 transition-all"
                                        title="Add to Cart"
                                    >
                                        <FiPlus className="w-4 h-4" />
                                    </button>
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
