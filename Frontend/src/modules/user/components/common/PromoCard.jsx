import React, { memo } from 'react';
import { themeColors } from '../../../../theme';
import OptimizedImage from '../../../../components/common/OptimizedImage';
import OptimizedVideo from '../../../../components/common/OptimizedVideo';

const PromoCard = memo(({ title, subtitle, buttonText, image, onClick, className = '' }) => {
  const isVideo = image && (
    image.includes('video/upload') ||
    image.match(/\.(mp4|webm|ogg|mov)$|^https:\/\/res\.cloudinary\.com.*\/video\//i)
  );

  return (
    <div
      className="relative rounded-2xl overflow-hidden min-w-[320px] md:min-w-[400px] h-40 md:h-48 cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-95"
      style={{
        boxShadow: themeColors.cardShadow,
        border: themeColors.cardBorder,
        backdropFilter: 'blur(10px)'
      }}
      onClick={onClick}
    >
      {image ? (
        isVideo ? (
          <OptimizedVideo
            src={image}
            className="w-full h-full object-fill"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <OptimizedImage
            src={image}
            alt={title || 'Promo'}
            className="w-full h-full object-fill"
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-200">
          <span className="text-gray-400 text-sm">Image</span>
        </div>
      )}
    </div>
  );
});

PromoCard.displayName = 'PromoCard';

export default PromoCard;
