import React, { useState, useRef, useEffect } from 'react';
import { FiGlobe, FiChevronDown, FiCheck } from 'react-icons/fi';
import { useLanguage } from '../../context/LanguageContext';

const LanguageSelector = ({ variant = 'pill', className = '' }) => {
  const { currentCode, language, changeLanguage, activeLanguagesList } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const languages = activeLanguagesList && activeLanguagesList.length > 0 ? activeLanguagesList : [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  ];

  const currentLangObj = languages.find(l => l.code === currentCode || l.name === language) || languages[0];

  const handleSelect = (langCode) => {
    changeLanguage(langCode, { isExplicit: true });
    setIsOpen(false);
  };

  const buttonStyle = variant === 'subtle'
    ? 'border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'
    : 'border border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/70';

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef} translate="no">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-95 ${buttonStyle}`}
        title="Change Language"
      >
        <span className="text-sm">{currentLangObj?.flag || '🌐'}</span>
        <span className="font-bold">{currentLangObj?.nativeName || currentLangObj?.name || 'English'}</span>
        <FiChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 sm:absolute sm:inset-auto sm:right-0 sm:mt-2 z-50 flex items-end sm:items-start justify-center bg-black/40 sm:bg-transparent p-0 sm:p-0">
          <div
            className="w-full sm:w-56 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 p-2 sm:p-2.5 max-h-[70vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 mb-1">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <FiGlobe className="w-3.5 h-3.5 text-emerald-600" />
                Select Language
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="sm:hidden text-xs font-bold text-gray-400 hover:text-gray-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              {languages.map((lang) => {
                const isSelected = currentCode === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleSelect(lang.code)}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : 'text-gray-700 hover:bg-emerald-50/60 active:bg-emerald-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{lang.flag || '🌐'}</span>
                      <div className="flex flex-col">
                        <span>{lang.nativeName || lang.name}</span>
                        {lang.nativeName && lang.nativeName !== lang.name && (
                          <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                            {lang.name}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <FiCheck className="w-4 h-4 stroke-[3] text-white" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
