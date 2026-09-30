import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiMapPin } from 'react-icons/fi';
import { Helmet } from 'react-helmet-async';
import { publicCatalogService } from '../../../../services/catalogService';
import LogoLoader from '../../../../components/common/LogoLoader';
import CategoryCard from '../../components/common/CategoryCard';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const AllMachineryCategories = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        const res = await publicCatalogService.getCategories({ all: true });
        if (res.success && Array.isArray(res.categories)) {
          // Filter to only show main categories (isAlwaysMain or has no parent)
          const mains = res.categories.filter(c => {
            const hasParent = c.parentCategory || (c.parentCategories && c.parentCategories.length > 0);
            if (hasParent) return c.isAlwaysMain === true;
            return true;
          });
          setCategories(mains);
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const handleCategoryClick = (category) => {
    navigate('/user/machinery-explorer', { state: { category } });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Helmet>
        <title>All Machinery Categories | Agroyilt</title>
      </Helmet>
      
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-100 px-5 pt-4 pb-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 active:scale-95 transition-all flex-shrink-0"
          >
            <FiArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">All Categories</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <FiMapPin className="text-orange-500" /> All India
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <LogoLoader />
      ) : (
        <div className="p-5 max-w-xl mx-auto">
          {categories.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-500 font-medium">No categories available in this location.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-y-7 gap-x-3">
              {categories.map((category) => {
                const iconSrc = toAssetUrl(category.icon || category.image || category.homeIconUrl);
                return (
                  <div key={category.id || category._id} className="flex justify-center h-full cursor-pointer" onClick={() => handleCategoryClick(category)}>
                    <CategoryCard
                      title={category.title}
                      icon={
                        iconSrc ? (
                          <img
                            src={iconSrc}
                            alt={category.title}
                            className="w-full h-full object-cover transition-transform duration-500"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-100 to-emerald-50 text-green-600 text-lg font-black">
                            {category.title?.charAt(0) ?.toUpperCase() || '?'}
                          </div>
                        )
                      }
                      hasSaleBadge={category.hasSaleBadge}
                      badge={category.badge || category.homeBadge}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AllMachineryCategories;
