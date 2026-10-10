import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiArrowLeft, FiClock, FiTrendingUp, FiX, FiLayers, FiChevronRight } from 'react-icons/fi';
import { publicCatalogService } from '../../../../../services/catalogService';
import { themeColors } from '../../../../../theme';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const SearchOverlay = ({ isOpen, onClose, categories = [], onCategoryClick }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [trendingServices, setTrendingServices] = useState([]);
  const inputRef = useRef(null);

  // Load recent searches and trending services on mount
  useEffect(() => {
    const saved = localStorage.getItem('recent_searches');
    if (saved) {
      setRecentSearches(JSON.parse(saved).slice(0, 5));
    }

    const defaultTrending = categories.length > 0
      ? categories.slice(0, 5).map((cat, idx) => ({
          id: cat.id || `cat-${idx}`,
          title: cat.title,
          isCategory: true,
          imageUrl: cat.icon
        }))
      : [
          { id: 'trend-1', title: 'Tractor Rental', isCategory: true },
          { id: 'trend-2', title: 'Farming Equipment', isCategory: true },
          { id: 'trend-3', title: 'Heavy Machinery', isCategory: true },
          { id: 'trend-4', title: 'Drone Spraying', isCategory: true },
          { id: 'trend-5', title: 'Rotavator & Cultivator', isCategory: true }
        ];

    // Fetch trending services (Most Booked)
    const fetchTrending = async () => {
      try {
        const res = await publicCatalogService.getHomeContent();
        if (res.success && res.homeContent?.booked && res.homeContent.booked.length > 0) {
          const filtered = res.homeContent.booked.filter(s =>
            !s.title.toLowerCase().includes('fan install') &&
            !s.title.toLowerCase().includes('fan repair') &&
            !s.title.toLowerCase().includes('top load') &&
            !s.title.toLowerCase().includes('automatic')
          );
          if (filtered.length > 0) {
            setTrendingServices(filtered.slice(0, 5));
            return;
          }
        }
        setTrendingServices(defaultTrending);
      } catch (error) {
        console.error("Failed to load trending services", error);
        setTrendingServices(defaultTrending);
      }
    };
    fetchTrending();
  }, [categories]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setLoading(true);
        try {
          const lowerQ = query.toLowerCase();

          // 1. Search Categories (Local)
          const categoryMatches = categories.filter(c =>
            c.title.toLowerCase().includes(lowerQ)
          ).map(c => ({ ...c, isCategory: true }));

          // 2. Search Services (API)
          const serviceRes = await publicCatalogService.getServices({ search: query });
          let serviceMatches = [];
          if (serviceRes.success && Array.isArray(serviceRes.services)) {
            serviceMatches = serviceRes.services.map(s => ({ ...s, isService: true }));
          }

          // 3. Search Brands (API)
          const brandRes = await publicCatalogService.getBrands({ search: query });
          let brandMatches = [];
          if (brandRes.success && Array.isArray(brandRes.brands)) {
            brandMatches = brandRes.brands.map(b => ({ ...b, isBrand: true }));
          }

          // Combine and deduplicate by title
          const seen = new Set();
          const combined = [];
          for (const item of [...categoryMatches, ...serviceMatches, ...brandMatches]) {
            const titleKey = (item.title || '').trim().toLowerCase();
            if (titleKey && !seen.has(titleKey)) {
              seen.add(titleKey);
              combined.push(item);
            }
          }

          setResults(combined);
        } catch (error) {
          console.error("Search failed", error);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, categories]);

  const handleResultClick = (item) => {
    // Add to recent searches
    if (item.title) {
      const newRecent = [item.title, ...recentSearches.filter(s => s !== item.title)].slice(0, 5);
      setRecentSearches(newRecent);
      localStorage.setItem('recent_searches', JSON.stringify(newRecent));
    }

    onClose();

    const titleLower = (item.title || '').toLowerCase();
    const slugLower = (item.slug || '').toLowerCase();
    if (titleLower.includes('soil') || slugLower.includes('soil')) {
      navigate('/user/soil-testing');
      return;
    }
    if (titleLower.includes('lease') || titleLower.includes('theka') || titleLower.includes('batai') || titleLower.includes('patta') || titleLower.includes('land') || slugLower.includes('lease')) {
      navigate('/user/land-lease');
      return;
    }

    // 1. Handle Category Click
    if (item.isCategory) {
      const cat = categories.find(c => (c.id === item.id || c._id === item.id || c.title === item.title));
      onCategoryClick(cat || item);
      return;
    }

    // 2. Handle Service/Brand Click
    const catId = item.categoryId || item.targetCategoryId || (item.categoryIds && item.categoryIds[0]) || item.parentSourceId;
    if (catId) {
      const cat = categories.find(c => (c.id === catId || c._id === catId));
      if (cat) {
        onCategoryClick(cat);
        return;
      }
    }

    if (item.category) {
      const cat = categories.find(c => c.title.toLowerCase() === item.category.toLowerCase());
      if (cat) {
        onCategoryClick(cat);
        return;
      }
    }

    // Fallback search category by title match
    const matchedCategory = categories.find(c =>
      item.title?.toLowerCase().includes(c.title.toLowerCase()) ||
      c.title.toLowerCase().includes(item.title?.toLowerCase())
    );

    if (matchedCategory) {
      onCategoryClick(matchedCategory);
    } else if (categories.length > 0) {
      onCategoryClick(categories[0]);
    }
  };

  const handleTermClick = (term) => {
    setQuery(term);
  };

  const clearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent_searches');
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-white z-[9999] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-100 shadow-sm bg-white">
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <FiArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <div className="flex-1 relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results.length > 0) {
                     handleResultClick(results[0]);
                  }
                }}
                placeholder="Search for services..."
                className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-100 transition-all border-none outline-none text-base font-medium text-gray-900"
                style={{ '--tw-ring-color': `${themeColors.primary}33` }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-gray-200 rounded-full"
                >
                  <FiX className="w-3 h-3 text-gray-600" />
                </button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto bg-gray-50/50">
            {query.length >= 2 ? (
              // Create Search Results List
              <div className="p-4 space-y-3">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-10 opacity-60">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin mb-2" style={{ borderTopColor: themeColors.primary }}></div>
                    <p className="text-sm text-gray-500">Searching...</p>
                  </div>
                ) : results.length > 0 ? (
                  <>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Services</p>
                    {results.map((service) => (
                      <div
                        key={service.id}
                        onClick={() => handleResultClick(service)}
                        className="flex items-center gap-3 p-3 bg-white rounded-xl active:bg-gray-50 transition-colors cursor-pointer border border-transparent hover:border-gray-100 shadow-sm"
                      >
                        <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                          {service.icon || service.imageUrl ? (
                            <img src={toAssetUrl(service.icon || service.imageUrl)} alt="" className="w-8 h-8 object-contain" />
                          ) : (
                            <FiLayers className="w-6 h-6 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 flex items-center">
                            {service.title}
                            <FiChevronRight className="w-4 h-4 ml-auto text-gray-300" />
                          </h4>
                          <p className="text-xs text-gray-500">
                            {service.isCategory ? 'Category' : 'Service'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="text-center py-20">
                    <p className="text-gray-500 font-medium">No services found for "{query}"</p>
                    <p className="text-sm text-gray-400 mt-1">Try a different keyword</p>
                  </div>
                )}
              </div>
            ) : (
              // Default State (Recent & Popular)
              <div className="p-5 space-y-8">
                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <section>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <FiClock className="text-gray-400" /> Recent Searches
                      </h3>
                      <button onClick={clearRecent} className="text-xs text-red-500 font-semibold hover:text-red-600">Clear</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((term, i) => (
                        <button
                          key={i}
                          onClick={() => handleTermClick(term)}
                          className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Popular Services */}
                {trendingServices.length > 0 && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
                      <FiTrendingUp className="text-blue-500" /> Trending Services
                    </h3>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                      {trendingServices.map((service) => (
                        <button
                          key={service.id}
                          onClick={() => handleResultClick(service)}
                          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 bg-white transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3">
                            {service.imageUrl && (
                              <img src={toAssetUrl(service.imageUrl)} alt="" className="w-8 h-8 rounded-lg object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            )}
                            <span className="font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{service.title}</span>
                          </div>
                          <FiChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default SearchOverlay;
