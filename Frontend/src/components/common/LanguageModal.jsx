import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiGlobe, FiX, FiCheck, FiSearch, FiChevronRight } from 'react-icons/fi';
import { useLanguage } from '../../context/LanguageContext';
import { toastManager } from '../../utils/toastManager';

/**
 * Premium Language Selection Modal & Bottom-Sheet
 * - Modern bottom-sheet on mobile, centered modal on desktop
 * - Completely locks background scroll (body + html) with scrollbar width compensation
 * - Smooth framer-motion springs and backdrop blur
 * - Fast search filtering if list has multiple languages
 * - High-contrast bilingual typography for native scripts
 */
export const LanguageModal = ({
  isOpen,
  onClose,
  onSelectLanguage,
  title = 'Select Language',
  subtitle = 'Choose your preferred app language',
}) => {
  const { currentCode, language, changeLanguage, activeLanguagesList } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedCode, setSelectedCode] = useState(currentCode || 'en');

  const languages = activeLanguagesList;

  // Robust body scroll lock while modal is open
  useEffect(() => {
    if (!isOpen) return;

    // Save previous styles
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    // Compensate for scrollbar width to prevent page shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Lock scrolling on both body and html
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Handle Escape key to dismiss
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isUpdating) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isUpdating, onClose]);

  // Sync selected code with current language when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedCode(currentCode || 'en');
    }
  }, [isOpen, currentCode]);

  // Filtered languages based on search
  const filteredLanguages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter((l) => {
      const name = (l.name || '').toLowerCase();
      const native = (l.nativeName || '').toLowerCase();
      const code = (l.code || '').toLowerCase();
      return name.includes(q) || native.includes(q) || code.includes(q);
    });
  }, [languages, searchQuery]);

  // Selected language object
  const selectedLangObj = useMemo(() => {
    return (
      languages.find(
        (l) =>
          l.code?.toLowerCase() === selectedCode?.toLowerCase() ||
          l.name?.toLowerCase() === selectedCode?.toLowerCase()
      ) || languages[0]
    );
  }, [languages, selectedCode]);

  // Current active language object in app
  const currentLangObj = useMemo(() => {
    return (
      languages.find(
        (l) =>
          l.code?.toLowerCase() === currentCode?.toLowerCase() ||
          l.name?.toLowerCase() === language?.toLowerCase()
      ) || languages[0]
    );
  }, [languages, currentCode, language]);

  // Check if user has selected a different language than current
  const hasChanged = useMemo(() => {
    return (selectedCode || '').toLowerCase() !== (currentCode || '').toLowerCase();
  }, [selectedCode, currentCode]);

  const handleCardClick = (lang) => {
    if (isUpdating) return;
    setSelectedCode(lang.code);
  };

  const handleApply = async () => {
    if (isUpdating || !hasChanged) {
      if (!hasChanged) onClose();
      return;
    }

    const targetLang = selectedLangObj;
    if (!targetLang) return;

    try {
      setIsUpdating(true);

      // Trigger context language update
      changeLanguage(targetLang.code, { isExplicit: true });

      // Run caller's custom async update (e.g. backend profile persistence)
      if (typeof onSelectLanguage === 'function') {
        await onSelectLanguage(targetLang.code, targetLang);
      }

      const langLabel = targetLang.nativeName || targetLang.name || targetLang.code;
      toastManager.success(`Language changed to ${langLabel}`);
      onClose();
    } catch (err) {
      console.error('Failed to change language:', err);
      toastManager.error('Failed to update language preference');
    } finally {
      setIsUpdating(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="language-modal-title"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !isUpdating && onClose()}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs touch-none"
          />

          {/* Modal Container: Bottom sheet on mobile, rounded card on desktop */}
          <motion.div
            initial={{ y: '100%', opacity: 0.8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] sm:max-h-[80vh] relative z-10 overflow-hidden overscroll-contain touch-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Indicator */}
            <div className="pt-3 pb-1 flex justify-center sm:hidden">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                  <FiGlobe className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="language-modal-title" className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    {title}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {subtitle}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isUpdating}
                className="p-2 -mr-1 -mt-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40 cursor-pointer"
                aria-label="Close language selector"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Search Bar (Auto-shows if more than 3 languages or if user already typed) */}
            {(languages.length > 3 || searchQuery) && (
              <div className="px-5 sm:px-6 pt-3.5 pb-1 shrink-0">
                <div className="relative">
                  <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search language..."
                    className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-800 placeholder-slate-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Language Options List */}
            <div className="px-5 sm:px-6 py-3 space-y-2.5 overflow-y-auto overscroll-contain touch-pan-y flex-1">
              {filteredLanguages.map((lang) => {
                const isSelected = (selectedCode || '').toLowerCase() === (lang.code || '').toLowerCase();

                return (
                  <button
                    key={lang.code}
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleCardClick(lang)}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer active:scale-[0.99] group ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-500 text-emerald-950 shadow-xs ring-1 ring-emerald-500/25'
                        : 'bg-white border-slate-200/90 text-slate-800 hover:bg-slate-50/80 hover:border-slate-300'
                    }`}
                  >
                    {/* Left: Flag & Language Names */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">
                        {lang.flag || '🌐'}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span translate="no" className="text-sm sm:text-base font-bold tracking-tight text-slate-900">
                            {lang.nativeName || lang.name}
                          </span>
                          {lang.nativeName && lang.nativeName !== lang.name && (
                            <span translate="no" className={`text-xs ${isSelected ? 'text-emerald-700/80 font-medium' : 'text-slate-400'}`}>
                              ({lang.name})
                            </span>
                          )}
                          {lang.isDefault && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                              Default
                            </span>
                          )}
                        </div>
                        <span translate="no" className={`text-[11px] font-medium block mt-0.5 ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {lang.code.toUpperCase()} • {lang.name}
                        </span>
                      </div>
                    </div>

                    {/* Right: Radio / Check Indicator */}
                    <div className="shrink-0 ml-3">
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <FiCheck className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-slate-300 group-hover:border-slate-400 transition-colors" />
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredLanguages.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No languages found matching "{searchQuery}"
                </div>
              )}
            </div>

            {/* Footer with Save / Apply CTA */}
            <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1.5 truncate text-xs w-full sm:w-auto justify-between sm:justify-start">
                <span className="text-slate-400">Selected:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 truncate" translate="no">
                  <span>{selectedLangObj.flag || '🌐'}</span>
                  <span className="truncate">{selectedLangObj.nativeName || selectedLangObj.name || 'English'}</span>
                  {hasChanged && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                      Unsaved
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isUpdating}
                  className="flex-1 sm:flex-initial px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer border border-slate-200"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleApply}
                  disabled={isUpdating || !hasChanged}
                  className={`flex-1 sm:flex-initial px-5 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm ${
                    hasChanged
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25 active:scale-[0.98] cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  {isUpdating ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Applying...</span>
                    </>
                  ) : (
                    <>
                      <FiCheck className="w-4 h-4 stroke-[2.5]" />
                      <span>Apply</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

/**
 * Modern Settings Row for Language Selection
 * Matches standard iOS/Android settings row design.
 */
export const LanguageSettingRow = ({
  onClick,
  title = 'App Language',
  subtitle = 'Change preferred display language',
  badgeText,
  iconColor,
  className = '',
}) => {
  const { currentCode, language, activeLanguagesList } = useLanguage();

  const currentLangObj = useMemo(() => {
    return (
      activeLanguagesList.find(
        (l) =>
          l.code?.toLowerCase() === currentCode?.toLowerCase() ||
          l.name?.toLowerCase() === language?.toLowerCase()
      ) || activeLanguagesList[0] || {}
    );
  }, [activeLanguagesList, currentCode, language]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:bg-gray-50 active:scale-[0.99] transition-all cursor-pointer shadow-xs group ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
          style={{ backgroundColor: iconColor ? `${iconColor}15` : 'rgba(16, 185, 129, 0.12)' }}
        >
          <FiGlobe
            className="w-5 h-5"
            style={{ color: iconColor || '#059669' }}
          />
        </div>
        <div className="text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 truncate">{title}</span>
          </div>
          <span className="text-xs text-gray-500 block truncate">{subtitle}</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0 ml-3">
        <span
          translate="no"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-xs font-semibold shadow-2xs"
        >
          <span>{currentLangObj.flag || '🌐'}</span>
          <span className="truncate max-w-[120px]">
            {badgeText || currentLangObj.nativeName || currentLangObj.name || 'English'}
          </span>
        </span>
        <FiChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
      </div>
    </button>
  );
};

export default LanguageModal;
