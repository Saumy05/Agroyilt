import React from 'react';
import homepageBanner from '../../../../../assets/images/pages/Home/Banner/homepage-banner.webp';
import { optimizeCloudinaryUrl } from '../../../../../utils/cloudinaryOptimize';

const Banner = React.memo(({ imageUrl, onClick }) => {
  // Optimize Cloudinary URLs for faster loading
  const optimizedUrl = imageUrl ? optimizeCloudinaryUrl(imageUrl, { quality: 'auto' }) : homepageBanner;

  return (
    <div className="mb-8 px-4 cursor-pointer group" onClick={onClick}>
      <div
        className="relative overflow-hidden transition-all duration-500 group-hover:shadow-2xl group-hover:scale-[1.01]"
        style={{
          borderRadius: '20px',
          boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.1), 0 5px 15px -3px rgba(0, 0, 0, 0.05)'
        }}
      >
        <img
          src={optimizedUrl}
          alt="Banner"
          className="w-full h-full object-fill min-h-[150px]"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
      </div>
    </div>
  );
});

Banner.displayName = 'Banner';

export default Banner;
