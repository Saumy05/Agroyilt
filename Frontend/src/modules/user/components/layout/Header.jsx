import React, { useRef, useEffect, useState } from 'react';
import { HiLocationMarker, HiMenuAlt2 } from 'react-icons/hi';
import { gsap } from 'gsap';
import LocationSelector from '../common/LocationSelector';
import { animateLogo } from '../../../../utils/gsapAnimations';
import Logo from '../../../../components/common/Logo';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { themeColors } from '../../../../theme';

import Sidebar from './Sidebar';

const Header = ({ location, onLocationClick }) => {
  const logoRef = useRef(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (logoRef.current) {
      animateLogo(logoRef.current);
    }
  }, []);

  return (
    <header className="relative overflow-hidden">
      {/* Content wrapper with relative positioning */}
      <div className="relative z-10">
        <div className="w-full">
          {/* Top Row: Logo (Left) and Location (Right) */}
          <div className="px-4 py-3 flex items-center justify-between">
            {/* Left: Hamburger & Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
                aria-label="Open Menu"
              >
                <HiMenuAlt2 className="w-6 h-6" />
              </button>

              <div
                className="cursor-pointer"
              onMouseEnter={() => {
                if (logoRef.current) {
                  gsap.to(logoRef.current, {
                    scale: 1.15,
                    filter: `drop-shadow(0 0 16px ${themeColors.brand.teal}40)`,
                    duration: 0.3,
                    ease: 'power2.out',
                  });
                }
              }}
              onMouseLeave={() => {
                if (logoRef.current) {
                  gsap.to(logoRef.current, {
                    scale: 1,
                    filter: '',
                    duration: 0.3,
                    ease: 'power2.out',
                  });
                }
              }}
              >
                <Logo
                  ref={logoRef}
                  className="h-12 w-12 sm:h-14 sm:w-14 shadow-sm border border-gray-100"
                />
              </div>
            </div>

            {/* Right: City & Location */}
            <div className="flex flex-col items-end gap-1">



              {/* Location Selector */}
              <div className="flex flex-col items-end cursor-pointer" onClick={onLocationClick}>
                <div className="flex items-center gap-1 mb-0.5">
                  {/* Gradient Definition for Icons */}
                  <svg width="0" height="0" className="absolute">
                    <linearGradient id="groo-location-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={themeColors.brand.teal} />
                      <stop offset="50%" stopColor={themeColors.brand.yellow} />
                      <stop offset="100%" stopColor={themeColors.brand.orange} />
                    </linearGradient>
                  </svg>
                  <HiLocationMarker
                    className="w-4 h-4"
                    style={{ fill: 'url(#groo-location-gradient)' }}
                  />
                  <span className="text-sm font-bold truncate max-w-[160px]" style={{
                    background: themeColors.gradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                    {location && location !== '...' ? location.split('-')[0].trim() : 'Select Location'}
                  </span>
                </div>
                <LocationSelector
                  location={location}
                  onLocationClick={onLocationClick}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
    </header>
  );
};

export default Header;
