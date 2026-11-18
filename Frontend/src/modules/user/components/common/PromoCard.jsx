import React, { memo, useState } from 'react';
import OptimizedImage from '../../../../components/common/OptimizedImage';
import OptimizedVideo from '../../../../components/common/OptimizedVideo';
import { toastManager } from '../../../../utils/toastManager';

  const PromoCard = memo(({ title, subtitle, buttonText, image, couponCode, onClick, className = '' }) => {
    const [copied, setCopied] = useState(false);

    const isVideo = image && (
      image.includes('video/upload') ||
      image.match(/\.(mp4|webm|ogg|mov)$|^https:\/\/res\.cloudinary\.com.*\/video\//i)
    );

    return (
      <div
        className="relative rounded-2xl overflow-hidden w-full h-[165px] sm:h-[195px] cursor-pointer transition-all duration-300 hover:shadow-lg active:scale-99 border border-slate-200/60 shadow-[0_4px_16px_rgba(0,0,0,0.06)] bg-slate-100 group select-none"
        onClick={onClick}
      >
        {/* 1-Tap Copy Coupon Badge (Solution 2 & 3) */}
        {couponCode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              try {
                navigator.clipboard.writeText(couponCode);
                toastManager.success(`Coupon code ${couponCode} copied!`);
              } catch (_) { }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 bg-black/80 hover:bg-black/95 backdrop-blur-md text-amber-300 border border-dashed border-amber-400/90 px-2.5 py-1 rounded-lg text-[10.5px] sm:text-xs font-black tracking-wider shadow-md cursor-pointer transition-all active:scale-95"
            title="Click to copy coupon code"
          >
            <span className="flex items-center gap-1">
              <span>🎟️</span>
              <span>{couponCode}</span>
            </span>
            <span className="text-[9.5px] text-white font-bold bg-white/20 px-1.5 py-0.5 rounded ml-0.5">
              {copied ? '✓ Copied' : '📋 Copy'}
            </span>
          </div>
        )}

        {/* Media: Image or Video */}
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

        {/* Text Overlay (Title & Subtitle) */}
        {(title || subtitle) && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 sm:p-3.5 z-10 pointer-events-none text-white">
            {title && (
              <h3 className="text-xs sm:text-sm font-black leading-tight drop-shadow-sm line-clamp-1">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[10px] sm:text-[11px] text-white/90 font-medium leading-tight mt-0.5 line-clamp-1 drop-shadow-xs">
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>
    );
  });

  PromoCard.displayName = 'PromoCard';

  export default PromoCard;
