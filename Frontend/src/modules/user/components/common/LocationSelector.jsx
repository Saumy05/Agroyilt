import React from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { splitLocation } from './splitLocation';

const LocationSelector = ({ location, onLocationClick }) => {
  const { secondary } = splitLocation(location);

  return (
    <div
      className="flex items-center gap-1.5 cursor-pointer"
      onClick={onLocationClick}
    >
      {secondary && (
        <span className="text-xs text-gray-700 truncate max-w-[200px] leading-tight">
          {secondary}
        </span>
      )}
      <FiChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: '#F59E0B' }} />
    </div>
  );
};

export default LocationSelector;
