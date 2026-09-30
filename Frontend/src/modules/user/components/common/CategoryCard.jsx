import React, { useRef, memo, useEffect } from 'react';
import { gsap } from 'gsap';
import { themeColors } from '../../../../theme';

// Pre-defined agriculture colors for the mockup
const bgColors = [
  '#A0B788', // Olive green (Tractor Rental)
  '#F4C365', // Mustard Yellow (JCB Excavation)
  '#C97658', // Terracotta/Brown (Seed Sowing)
  '#D78A7A', // Salmon/Peach (Pest Control)
  '#F5C563', // Mustard Yellow (Harvester)
  '#B89B77', // Light Brown (Soil)
  '#CAE0CD', // Pale Mint Green (Irrigation)
  '#A0B788'  // Olive green (Spares)
];

const CategoryCard = memo(({ icon, title, onClick, hasSaleBadge = false, index = 0 }) => {
  const cardRef = useRef(null);

  // Simple entrance animation
  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { y: 12, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.35,
          delay: index * 0.04,
          ease: 'power2.out',
        }
      );
    }
  }, [index]);

  return (
    <div
      ref={cardRef}
      className="flex flex-col items-center cursor-pointer group transition-all duration-300 ease-out hover:-translate-y-1 active:scale-95 w-full max-w-[84px]"
      onClick={onClick}
      style={{ opacity: 0 }}
    >
      {/* Top Image Container - Squircle Card */}
      <div className="w-[68px] h-[68px] sm:w-[76px] sm:h-[76px] rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.05)] group-hover:shadow-[0_8px_18px_rgba(0,0,0,0.09)] group-hover:border-emerald-300/60 transition-all duration-300 relative flex items-center justify-center">
        {icon ? (
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            {React.isValidElement(icon) && icon.type === 'img' ? (
              React.cloneElement(icon, { 
                className: `w-full h-full object-cover transition-transform duration-500 group-hover:scale-108 ${icon.props.className || ''}` 
              })
            ) : (
              <div className="w-full h-full flex items-center justify-center p-2 transform transition-transform duration-300 group-hover:scale-108">
                {icon}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-50">
            <svg
              className="w-8 h-8 text-slate-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {hasSaleBadge && (
          <div
            className="absolute top-1.5 right-1.5 text-white text-[7.5px] font-black px-1.5 py-0.5 rounded-full shadow-sm z-10"
            style={{
              background: themeColors.gradient,
            }}
          >
            SALE
          </div>
        )}
      </div>

      {/* Bottom Separated Title Container */}
      <span
        className="mt-2 text-[11px] sm:text-xs leading-[1.25] text-center font-bold tracking-tight text-slate-700 group-hover:text-emerald-700 line-clamp-2 max-w-[78px] transition-colors"
        title={title}
      >
        {title}
      </span>
    </div>
  );
});

CategoryCard.displayName = 'CategoryCard';

export default CategoryCard;

