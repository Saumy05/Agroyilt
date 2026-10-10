import React, { memo } from 'react';
import OptimizedImage from '../../../../components/common/OptimizedImage';
import OptimizedVideo from '../../../../components/common/OptimizedVideo';

const PromoCard = memo(({ title, subtitle, buttonText, image, onClick, className = '' }) => {
  const isVideo = image && (
    image.includes('video/upload') ||
    image.match(/\.(mp4|webm|ogg|mov)$|^https:\/\/res\.cloudinary\.com.*\/video\//i)
  );

  return (
    <div
      className="relative rounded-2xl overflow-hidden w-full h-[165px] sm:h-[195px] cursor-pointer transition-all duration-300 hover:shadow-lg active:scale-99 border border-slate-200/60 shadow-[0_4px_16px_rgba(0,0,0,0.06)] bg-slate-100 group"
      onClick={onClick}
    >
      {image ? (
        isVideo ? (
          <OptimizedVideo
            src={image}
            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-700"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <OptimizedImage
            src={image}
            alt={title || 'Promo'}
            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-700"
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
          <span className="text-sm font-semibold">Agroyilt</span>
        </div>
      )}
    </div>
  );
});

PromoCard.displayName = 'PromoCard';

export default PromoCard;
