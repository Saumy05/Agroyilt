import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FiChevronDown, FiSearch, FiCheck, FiX, FiPlus, FiLoader } from 'react-icons/fi';

const CustomSelect = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  disabled = false,
  isLoading = false,
  searchable = true,
  required = false,
  footerOption = null,
  emptyMessage = 'No options found',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options into { value, label, subtext }
  const normalizedOptions = useMemo(() => {
    return options.map(opt => {
      if (typeof opt === 'object' && opt !== null) {
        return {
          value: opt.value ?? opt.id ?? opt.name,
          label: opt.label ?? opt.name ?? String(opt.value),
          subtext: opt.subtext || opt.stateName || ''
        };
      }
      return { value: opt, label: String(opt), subtext: '' };
    });
  }, [options]);

  // Selected item object
  const selectedItem = useMemo(() => {
    return normalizedOptions.find(o => String(o.value) === String(value));
  }, [normalizedOptions, value]);

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter(o => 
      o.label.toLowerCase().includes(q) || 
      (o.subtext && o.subtext.toLowerCase().includes(q))
    );
  }, [normalizedOptions, searchQuery]);

  // Handle outside click to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen, searchable]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input for HTML5 form validation */}
      {required && (
        <input
          type="text"
          value={value || ''}
          required={required}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm flex items-center justify-between text-left transition-all duration-150 ${
          isOpen 
            ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-xs' 
            : 'border-gray-300 hover:border-gray-400'
        } ${
          disabled || isLoading 
            ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' 
            : 'cursor-pointer'
        }`}
      >
        <span className="truncate flex-1 pr-2">
          {isLoading ? (
            <span className="flex items-center gap-2 text-gray-400">
              <FiLoader className="w-3.5 h-3.5 animate-spin text-teal-600" />
              <span>Loading options...</span>
            </span>
          ) : selectedItem ? (
            <span className="text-gray-900 font-medium">
              {selectedItem.label}
              {selectedItem.subtext && (
                <span className="text-gray-400 text-xs font-normal ml-1.5">
                  ({selectedItem.subtext})
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>

        <FiChevronDown 
          className={`w-4 h-4 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-teal-600' : 'text-gray-400'
          }`} 
        />
      </button>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div 
          className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-gray-200/90 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Search Bar */}
          {searchable && normalizedOptions.length > 5 && (
            <div className="p-2 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
              <FiSearch className="w-4 h-4 text-gray-400 shrink-0 ml-1.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs sm:text-sm text-gray-800 placeholder-gray-400 outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 hover:bg-gray-200/60 rounded text-gray-400 hover:text-gray-600"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto py-1 divide-y divide-gray-50 scrollbar-thin">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt.value)}
                    className={`px-3.5 py-2.5 text-sm flex items-center justify-between cursor-pointer rounded-lg mx-1 transition-colors ${
                      isSelected
                        ? 'bg-teal-50 text-teal-900 font-medium'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="truncate flex-1 pr-2">
                      <span>{opt.label}</span>
                      {opt.subtext && (
                        <span className="text-xs text-gray-400 ml-1.5 font-normal">
                          ({opt.subtext})
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <FiCheck className="w-4 h-4 text-teal-600 shrink-0 ml-2" />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                {emptyMessage}
              </div>
            )}
          </div>

          {/* Footer Option (e.g. "Other (type a name)...") */}
          {footerOption && (
            <div
              onClick={() => {
                setIsOpen(false);
                footerOption.onClick?.();
              }}
              className="px-3.5 py-2.5 border-t border-gray-100 bg-gray-50/80 hover:bg-teal-50/70 text-xs font-semibold text-teal-700 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <FiPlus className="w-3.5 h-3.5 text-teal-600" />
              <span>{footerOption.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
