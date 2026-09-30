import React from 'react';
import CategoryCard from '../../../components/common/CategoryCard';
import TranslatedText from '../../../../../components/TranslatedText';
const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const ServiceCategories = React.memo(({ categories, onCategoryClick, onSeeAllClick, title = "Agriculture Seva Shreniyan", subtitle = "PREMIUM AGRICULTURE SERVICES" }) => {


  if (!Array.isArray(categories) || categories.length === 0) {
    return null;
  }

  const displayLimit = 6;
  const showMore = categories.length > displayLimit;
  const displayedCategories = showMore ? categories.slice(0, displayLimit) : categories;

  const serviceCategories = displayedCategories.map((cat) => ({
    ...cat,
    icon: toAssetUrl(cat.icon || cat.image),
  }));

  return (
    <div className="px-5">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col">
          <h2 className="text-[18px] sm:text-[20px] font-black text-gray-900 tracking-tight flex items-center gap-2">
            <TranslatedText>{title}</TranslatedText>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59₹30,246,0.5)]"></div>
          </h2>
          <p className="text-[10px] sm:text-[11px] text-gray-500 font-bold uppercase tracking-[0.14em] mt-0.5">
            <TranslatedText>{subtitle}</TranslatedText>
          </p>
        </div>

      </div>

      {/* Professional Grid Layout */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-y-7 gap-x-3">
        {serviceCategories.map((category, index) => {
          const iconSrc = toAssetUrl(category.icon || category.image);
          return (
            <div key={category.id} className="flex justify-center h-full">
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
                    <div className="w-full h-full flex items-center justify-center bg-white/30 backdrop-blur-xs rounded-xl">
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

        {/* Static Worker Section Card */}
        <div className="flex justify-center h-full">
          <CategoryCard
            title="Worker"
            icon={
              <img
                src="https://images.unsplash.com/photo-1605000797499-95a51c5269ae?q=80&w=600&auto=format&fit=crop"
                alt="Worker"
                className="w-full h-full object-cover transition-transform duration-500"
                loading="lazy"
                decoding="async"
              />
            }
            onClick={() => onCategoryClick?.({ slug: 'worker', title: 'Worker', bookingType: 'WORKER' })}
            index={serviceCategories.length}
          />
        </div>

        {/* View All / More Button */}
        {showMore && (
          <div className="flex justify-center h-full">
            <CategoryCard
              title="View All"
              icon={
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-50 text-blue-600 text-sm font-black flex-col gap-1 shadow-inner rounded-2xl">
                  <span className="text-xl leading-none block font-black">+</span>
                  <span className="text-[9px] uppercase tracking-widest block font-black text-center leading-tight opacity-70">More</span>
                </div>
              }
              onClick={onSeeAllClick}
              index={serviceCategories.length + 1}
            />
          </div>
        )}
      </div>

      {/* Subtle Bottom Separator */}
      <div className="mt-10 h-[1px] w-full bg-gradient-to-r from-transparent via-gray-100 to-transparent"></div>
    </div>
  );
});

ServiceCategories.displayName = 'ServiceCategories';

export default ServiceCategories;

