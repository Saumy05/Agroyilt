import React, { useState, useEffect, useRef } from 'react';
import { FiSearch } from 'react-icons/fi';
import NotificationBell from '../../../components/common/NotificationBell';
import { themeColors } from '../../../../../theme';

const SearchBar = ({ onInputClick, categories = [] }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [currentServiceIndex, setCurrentServiceIndex] = useState(0);

  const defaultServices = ['soil testing', 'rotavator', 'tractor rental', 'harvester', 'drone spraying', 'cultivator'];
  const serviceNames = categories.length > 0
    ? categories.slice(0, 8).map(c => c.title.toLowerCase())
    : defaultServices;

  useEffect(() => {
    let timer;
    const currentFullText = serviceNames[currentServiceIndex];

    if (isTyping) {
      if (displayedText.length < currentFullText.length) {
        timer = setTimeout(() => {
          setDisplayedText(currentFullText.slice(0, displayedText.length + 1));
        }, 150);
      } else {
        timer = setTimeout(() => setIsTyping(false), 2000);
      }
    } else {
      if (displayedText.length > 0) {
        timer = setTimeout(() => {
          setDisplayedText(currentFullText.slice(0, displayedText.length - 1));
        }, 100);
      } else {
        setCurrentServiceIndex((prev) => (prev + 1) % serviceNames.length);
        setIsTyping(true);
      }
    }

    return () => clearTimeout(timer);
  }, [displayedText, isTyping, currentServiceIndex]);

  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className="flex-1 min-w-0 relative cursor-pointer" onClick={onInputClick}>
        <div className="relative w-full group">
          {/* Glow effect on hover */}
          <div
            className="absolute inset-0 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{ background: `linear-gradient(90deg, ${themeColors.brand.teal}1A, ${themeColors.brand.orange}1A)` }}
          />

          {/* Gradient Definition */}
          <svg width="0" height="0" className="absolute">
            <linearGradient id="groo-search-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={themeColors.brand.teal} />
              <stop offset="50%" stopColor={themeColors.brand.yellow} />
              <stop offset="100%" stopColor={themeColors.brand.orange} />
            </linearGradient>
          </svg>

          {/* Search icon */}
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
            <FiSearch
              className="w-4 h-4 transition-colors duration-300"
              style={{ stroke: 'url(#groo-search-gradient)' }}
            />
          </div>

          {/* Simulated Input */}
          <div
            className="w-full pl-9 pr-3 rounded-xl text-[13.5px] bg-white border border-gray-200/90 transition-all duration-300 text-gray-800 flex items-center h-[40px] overflow-hidden"
            style={{
              boxShadow: '0 2px 10px -2px rgba(0,0,0,0.04)',
            }}
          >
            {/* Placeholder text with typing animation */}
            <span className="text-[13.5px] text-gray-400 tracking-wide font-light truncate block w-full whitespace-nowrap overflow-hidden">
              Search for{' '}
              <span
                className="font-medium"
                style={{
                  background: themeColors.gradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent'
                }}
              >
                {displayedText}
                <span className="animate-pulse ml-0.5" style={{ color: themeColors.brand.teal }}>|</span>
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Notification Bell next to Search Bar - firmly fixed in place */}
      <div className="shrink-0 flex-none">
        <NotificationBell size={36} />
      </div>
    </div>
  );
};

export default SearchBar;
