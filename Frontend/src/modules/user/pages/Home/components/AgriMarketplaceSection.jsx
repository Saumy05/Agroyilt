import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiShoppingCart, FiArrowRight, FiPlus, FiTag } from 'react-icons/fi';
import { motion } from 'framer-motion';
import productService from '../../../services/productService';
import { useCart } from '../../../../../context/CartContext';
import { toastManager } from '../../../../../utils/toastManager';
import { themeColors } from '../../../../../theme';

const toAssetUrl = (url) => {
    if (!url) return '/landing_images/fertilizer_seeds.jpg';
    if (url.startsWith('/landing_images')) return url;
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
                        <div key={i} className="min-w-[160px] h-[220px] bg-white rounded-3xl animate-pulse border border-slate-100" />
                    ))
                ) : (
                    products.map((product) => (
                        <motion.div
                            key={product._id}
                            whileHover={{ y: -5 }}
                            onClick={() => navigate(`/user/agri-marketplace/${product._id}`)}
                            className="min-w-[170px] bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm flex flex-col cursor-pointer"
                        >
                            <div className="h-32 bg-slate-100 relative group overflow-hidden">
                                <img
                                    src={toAssetUrl(product.imageUrl)}
                                    alt={product.title}
                                    onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = '/landing_images/fertilizer_seeds.jpg';
                                    }}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                {product.discountPrice && (
                                    <div className="absolute top-2 left-2 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">
                                        Offer
                                    </div>
                                )}
                            </div>

                            <div className="p-3 flex flex-col flex-1">
                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">{product.brandName || 'Top Brand'}</p>
                                <h3 className="text-xs font-black text-slate-800 line-clamp-2 mb-2 h-8 leading-tight">
                                    {product.title}
                                </h3>

                                <div className="mt-auto flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-black text-emerald-600">
                                            ₹{product.discountPrice || product.price}
                                        </p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">per {product.unit}</p>
                                    </div>
                                    <button
                                        onClick={() => handleAddToCart(product)}
                                        className="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"
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
