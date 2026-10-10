import React, { useMemo } from 'react';
import CategoryCard from '../../../components/common/CategoryCard';
import TranslatedText from '../../../../../components/TranslatedText';
import { FiChevronRight } from 'react-icons/fi';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  if (clean.startsWith('/landing_images/') || clean.startsWith('/assets/')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const ServiceCategories = React.memo(({
  categories,
  onCategoryClick,
  onSeeAllClick,
  title = "कृषि उपकरण व सेवा श्रेणियां",
  subtitle = "EXPLORE EQUIPMENT & SERVICES",
  showViewAll = true
}) => {
  if (!Array.isArray(categories) || categories.length === 0) {
    return null;
  }

  // Filter categories (excluding rental categories)
  const filteredCategories = useMemo(() => {
    return (categories || []).filter(c => {
      const mode = (c.fulfillmentMode || c.mode || '').toLowerCase();
      if (mode === 'rental' || c.isRental === true) return false;
      if ((c.slug || '').toLowerCase().includes('rental')) return false;
      return true;
    });
  }, [categories]);

  const displayLimit = 7;
  const showMore = filteredCategories.length > displayLimit;
  const displayedCategories = showMore ? filteredCategories.slice(0, displayLimit) : filteredCategories;

  const serviceCategories = displayedCategories.map((cat) => ({
    ...cat,
    icon: toAssetUrl(cat.icon || cat.image),
  }));

  return (
    <div className="px-5 py-2">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <h2 className="text-[17px] sm:text-[19px] font-black text-slate-900 tracking-tight flex items-center gap-2">
            <TranslatedText>{title}</TranslatedText>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          </h2>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-[0.12em] mt-0.5">
            <TranslatedText>{subtitle}</TranslatedText>
          </p>
        </div>

        {onSeeAllClick && (
          <button
            onClick={onSeeAllClick}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 group shrink-0"
          >
            <span>सभी देखें</span>
            <FiChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>

      {/* Grid Layout: 4 columns mobile, 6 sm, 8 md */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-y-4 gap-x-2.5">
        {serviceCategories.map((category, index) => {
          const iconSrc = toAssetUrl(category.icon || category.image);
          return (
            <div key={category.id || category._id || index} className="flex justify-center h-full">
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
                    <div className="w-full h-full flex items-center justify-center bg-white/40 backdrop-blur-xs">
                      <div className="w-8 h-8 rounded-xl bg-white/90 shadow-sm flex items-center justify-center font-black text-emerald-800 text-sm">
                        {category.title?.charAt(0)?.toUpperCase() || 'A'}
                      </div>
                    </div>
                  )
                }
                onClick={() => onCategoryClick?.(category)}
                hasSaleBadge={category.hasSaleBadge}
                index={index}
              />
            </div>
          );
        })}

        {/* View All / More Button */}
        {showViewAll && showMore && (
          <div className="flex justify-center h-full">
            <CategoryCard
              title="सभी देखें"
              icon={
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-800 text-sm font-black flex-col gap-0.5 shadow-inner">
                  <span className="text-xl leading-none block font-black">+</span>
                  <span className="text-[9px] uppercase tracking-wider block font-black text-center leading-tight opacity-75">More</span>
                </div>
              }
              onClick={onSeeAllClick}
              index={serviceCategories.length}
            />
          </div>
        )}
      </div>

      {/* Subtle Bottom Separator */}
      <div className="mt-4 h-[1px] w-full bg-gradient-to-r from-transparent via-slate-200/80 to-transparent"></div>
    </div>
  );
});

ServiceCategories.displayName = 'ServiceCategories';

export default ServiceCategories;
