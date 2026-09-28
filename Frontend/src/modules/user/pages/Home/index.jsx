import React, { useState, useEffect, useLayoutEffect, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import SearchBar from './components/SearchBar';
import ServiceCategories from './components/ServiceCategories';
import { publicCatalogService } from '../../../../services/catalogService';
import { useCart } from '../../../../context/CartContext';
import { useGeo } from '../../../../context/GeoContext';
import { toastManager } from '../../../../utils/toastManager';
import { registerFCMToken } from '../../../../services/pushNotificationService';
import { motion, AnimatePresence } from 'framer-motion';

import { userAuthService } from '../../../../services/authService';
import authStorage from '../../../../utils/authStorage';
// Lazy load heavy components for better initial load performance
import PromoCarousel from './components/PromoCarousel';
// Lazy load OTHER heavy components
const NewAndNoteworthy = lazy(() => import('./components/NewAndNoteworthy'));
const MostBookedServices = lazy(() => import('./components/MostBookedServices'));
const CuratedServices = lazy(() => import('./components/CuratedServices'));
const ServiceSectionWithRating = lazy(() => import('./components/ServiceSectionWithRating'));
const Banner = lazy(() => import('./components/Banner'));
const ReferEarnSection = lazy(() => import('./components/ReferEarnSection'));
import CategoryModal from './components/CategoryModal';
import SearchOverlay from './components/SearchOverlay';
import WeatherWidget from './components/WeatherWidget';
import AgriMarketplaceSection from './components/AgriMarketplaceSection';
import MachineryDiscoverySection from './components/MachineryDiscoverySection';
import LogoLoader from '../../../../components/common/LogoLoader';
import AddressSelectionModal from '../Checkout/components/AddressSelectionModal';



const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  // Local static assets should just be relative to frontend
  if (clean.startsWith('/landing_images/') || clean.startsWith('/assets/')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [address, setAddress] = useState(localStorage.getItem('currentAddress') || 'Select Location');
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [houseNumber, setHouseNumber] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLocationSupported, setIsLocationSupported] = useState(true);


  const { cartCount, addToCart } = useCart();
  const {
    selectedState,
    states,
    selectState,
    isGlobalIndia,
    isLocationResolved,
    detectLocationFromAddress,
    loading: geoLoading
  } = useGeo();
  // Backward-compat alias for code below that still references currentCity
  const currentCity = selectedState;
  const cities = states;
  const cityLoading = geoLoading;

  // Detect state from address string using GeoContext
  useEffect(() => {
    if (address && address !== 'Select Location' && states && states.length > 0) {
      const detected = detectLocationFromAddress(address);
      if (!detected) {
        // Address present but no matching state found — show fallback info
        setIsLocationSupported(false);
      } else {
        setIsLocationSupported(true);
      }
    }
  }, [address, states]);


  const handleAddressSave = (savedHouseNumber, locationObj) => {
    if (locationObj) {
      const newAddress = locationObj.address;
      setAddress(newAddress);
      localStorage.setItem('currentAddress', newAddress);

      // Try to parse state from location object (Google Places)
      const components = locationObj.components || locationObj.address_components;
      let stateName = '';
      let city = '';
      if (components) {
        const getComponent = (type) => components.find(c => c.types.includes(type))?.long_name || '';
        stateName = getComponent('administrative_area_level_1');
        city = getComponent('locality') || getComponent('administrative_area_level_2');
      }

      // Detect state from address using GeoContext
      if (newAddress) {
        detectLocationFromAddress(newAddress);
      }

      if (city || stateName) {
        // Sync location with profile for Weather Notifications
        const accessToken = authStorage.getAccessToken('user');
        if (accessToken && locationObj.lat && locationObj.lng) {
          userAuthService.updateProfile({
            addresses: [{
              addressLine1: newAddress,
              city: city,
              state: stateName,
              lat: locationObj.lat,
              lng: locationObj.lng,
              isDefault: true
            }]
          }).catch(err => console.log('Manual location sync failed', err));
        }

        toastManager.success(`Location set to ${city || stateName}`);
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    }
    setHouseNumber(savedHouseNumber);
    setIsAddressModalOpen(false);
  };

  // Auto-detect location on mount
  useEffect(() => {
    const autoDetectLocation = async () => {
      if (navigator.geolocation) {
        if (address === 'Select Location') {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const { latitude, longitude } = position.coords;
                const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
                const response = await fetch(
                  `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
                );
                const data = await response.json();

                if (data.status === 'OK' && data.results.length > 0) {
                  const result = data.results[0];
                  const getComponent = (type) =>
                    result.address_components.find(c => c.types.includes(type)) ?.long_name || '';

                  const area = getComponent('sublocality_level_1') || getComponent('neighborhood') || getComponent('locality');
                  const city = getComponent('locality') || getComponent('administrative_area_level_2');
                  const state = getComponent('administrative_area_level_1');

                  const formattedAddress = `${area}, ${city}, ${state}`;
                  setAddress(formattedAddress);
                  localStorage.setItem('currentAddress', formattedAddress);

                  if (state) {
                    // Detect state from GeoContext
                    detectLocationFromAddress(formattedAddress);

                    // Sync location with profile for Weather Notifications
                    const accessToken = authStorage.getAccessToken('user');
                    if (accessToken) {
                      userAuthService.updateProfile({
                        addresses: [{
                          addressLine1: formattedAddress,
                          city: city,
                          state: state,
                          lat: latitude,
                          lng: longitude,
                          isDefault: true
                        }]
                      }).catch(err => console.log('Location sync failed', err));
                    }
                  }
                }
              } catch (error) {
                // Silent fail
              }
            },
            (error) => {
              console.log("GPS Error:", error);
            },
            {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            }
          );
        }
      }
    };

    autoDetectLocation();

    // Register FCM token for user to receive push notifications
    registerFCMToken('user', true).catch(err => {/* Silent fail */ });
  }, []);

  const [categories, setCategories] = useState([]);
  const [homeContent, setHomeContent] = useState(null);
  const [loading, setLoading] = useState(true);

  // Handle scroll separately (only when needed)
  useEffect(() => {
    if (location.state?.scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      window.history.replaceState({}, '', location.pathname);
    }
  }, [location.state?.scrollToTop, location.pathname]);

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [activeSectionTab, setActiveSectionTab] = useState(null); // 'Driver Based', 'Farming Equipment', 'Advance Service'

  // Fetch categories and home content on mount (and when location changes)
  useEffect(() => {
    if (geoLoading) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        // Pass no cityId — new system uses GLOBAL_INDIA by default
        // The backend now serves all GLOBAL_INDIA-scoped content
        const [categoriesRes, homeContentRes] = await Promise.all([
          publicCatalogService.getCategories(null),
          publicCatalogService.getHomeContent(null)
        ]);

        let hasData = false;

        if (categoriesRes.success) {
          const mappedCategories = categoriesRes.categories.map(cat => ({
            id: cat.id,
            _id: cat.id,
            title: cat.title,
            slug: cat.slug,
            icon: toAssetUrl(cat.icon),
            hasSaleBadge: cat.hasSaleBadge,
            badge: cat.badge,
            requiresDriver: cat.requiresDriver,
            sectionType: cat.sectionType || 'General',
            showOnHome: cat.showOnHome ?? true,
            isAlwaysMain: cat.isAlwaysMain,
            parentCategory: cat.parentCategory,
            parentCategories: cat.parentCategories,
            bookingType: cat.bookingType || (/labour|labor|worker|manpower|service|shramik|majdoor/i.test(cat.title || '') ? 'WORKER' : 'VENDOR')
          }));
          setCategories(mappedCategories);
          if (mappedCategories.length > 0) hasData = true;
        }

        if (homeContentRes.success) {
          setHomeContent(homeContentRes.homeContent);
          if (homeContentRes.homeContent) hasData = true;
        }

        if (!hasData && categoriesRes.categories?.length === 0 && !homeContentRes.homeContent) {
          // If no data, maybe we should still stop loading?
        }

        setLoading(false);
      } catch (error) {
        // Silent fail
        setLoading(false);
      }
    };

    fetchData();
  }, [currentCity, cityLoading]);
  // Open category modal from navigation state (e.g. from Cart 'Add Services')
  useEffect(() => {
    if (!loading && categories.length > 0 && (location.state?.openCategoryId || location.state?.openCategoryName)) {
      const targetId = location.state.openCategoryId;
      const targetName = location.state.openCategoryName;

      const cat = categories.find(c =>
        (targetId && (c.id === targetId || c._id === targetId)) ||
        (targetName && c.title === targetName)
      );

      if (cat) {
        handleCategoryClick(cat);
        // Clear state to prevent reopening on subsequent renders/refreshes
        window.history.replaceState({}, '', location.pathname);
      }
    }
  }, [loading, categories, location.state]);

  const handleSearch = (query) => {
    // Navigate to search results page
  };

  const handleCategoryClick = (category) => {
    if (!category) return;
    
    const slug = (category.slug || '').toLowerCase();
    const title = (category.title || '').toLowerCase();
    
    if (slug.includes('soil') || title.includes('soil')) {
      navigate('/user/soil-testing');
      return;
    }
    
    // SOP: Direct navigation for master categories
    if (category.bookingType === 'WORKER' || slug.includes('worker')) {
      navigate('/user/worker-explorer', { state: { category } });
      return;
    }
    
    // Default fallback for any newly added equipment category (like Dron)
    navigate('/user/machinery-explorer', { state: { category } });
  };

  const handlePromoClick = (promo) => {
    let cat = null;
    if (promo.targetCategoryId) {
      cat = categories.find(c => (c.id === promo.targetCategoryId || c._id === promo.targetCategoryId));
    }
    // Fallback: if category not found by ID (maybe old DB data), try matching by slug
    if (!cat && promo.slug) {
      cat = categories.find(c => (c.slug || '').toLowerCase() === (promo.slug || '').toLowerCase());
    }

    if (cat) {
      handleCategoryClick(cat);
      return;
    }

    if (promo.slug) {
      // Don't navigate to undefined routes, only handle known ones
      if (promo.slug.includes('soil')) {
        navigate(`/user/soil-testing`);
      } else {
        toastManager.error("Service category not found or unavailable.");
      }
      return;
    }
    if (promo.route && !promo.slug) {
      if (promo.scrollToSection) {
        navigate(promo.route, {
          state: { scrollToSection: promo.scrollToSection }
        });
      } else {
        navigate(promo.route);
      }
    }
  };

  const handleServiceClick = (service) => {
    if (!service) return;
    if (service.targetCategoryId) {
      const cat = categories.find(c => (c.id === service.targetCategoryId || c._id === service.targetCategoryId));
      if (cat) {
        handleCategoryClick(cat);
        return;
      }
    }
    // Fallback if no targetCategoryId but has slug/title, we no longer navigate to slug
  };

  const handleAddClick = async (service) => {
    try {
      if (service.serviceId && service.categoryId) {
        const cartItemData = {
          serviceId: service.serviceId,
          categoryId: service.categoryId,
          title: service.title,
          description: service.subtitle || service.description || '',
          icon: service.image || '',
          category: service.category || 'Equipment',
          price: parseInt(service.price?.toString().replace(/[^0-9]/g, '')) || 0,
          originalPrice: service.originalPrice ? (parseInt(service.originalPrice.toString().replace(/[^0-9]/g, '')) || null) : null,
          unitPrice: parseInt(service.price?.toString().replace(/[^0-9]/g, '')) || 0,
          serviceCount: 1,
          rating: service.rating || "4.8",
          reviews: service.reviews || "10k+",
          vendorId: service.vendorId || null,
          sectionId: service.sectionId || null
        };

        const response = await addToCart(cartItemData);
        if (response.success) {
          toastManager.success(`${service.title} added to cart!`);
          navigate('/user/cart');
        } else {
          toastManager.error(response.message || 'Failed to add to cart');
        }
      } else if (service.targetCategoryId) {
        const cat = categories.find(c => (c.id === service.targetCategoryId || c._id === service.targetCategoryId));
        if (cat) {
          handleCategoryClick(cat);
        } else {
          toastManager.error('Unable to add this item to cart.');
        }
      } else {
        toastManager.error('Unable to add this item to cart.');
      }
    } catch (error) {
      toastManager.error('Failed to add to cart. Please try again.');
    }
  };

  const handleReferClick = () => {
    navigate('/user/rewards');
  };

  const handleLocationClick = () => {
    setIsAddressModalOpen(true);
  };

  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  };

  if (loading) {
    return <LogoLoader />;
  }

  return (
    <div className="min-h-screen pb-20 relative" style={{ backgroundColor: '#F1F8E9' }}>
      {/* Refined Brand Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#347989'}25 0%, transparent 70%),
              radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#D68F35'}20 0%, transparent 70%),
              radial-gradient(at 100% 100%, ${themeColors?.brand?.orange || '#BB5F36'}15 0%, transparent 75%),
              radial-gradient(at 0% 100%, ${themeColors?.brand?.teal || '#347989'}10 0%, transparent 70%),
              radial-gradient(at 50% 50%, ${themeColors?.brand?.teal || '#347989'}03 0%, transparent 100%),
              #F1F8E9
            `
          }}
        />
        {/* Elegant Dot Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(${themeColors?.brand?.teal || '#347989'} 0.8px, transparent 0.8px)`,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      <motion.div
        className="relative z-10"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <motion.div
          variants={itemVariants}
          className="backdrop-blur-xl sticky top-0 z-50 border-b border-black/[0.03] rounded-b-[24px] shadow-[0_4px_30px_rgba(0,0,0,0.03)] transition-all duration-300"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.4)' }}
        >
          <Header
            location={address}
            onLocationClick={handleLocationClick}
          />
          <div className="px-5 pb-5 pt-1 max-w-lg mx-auto w-full">
            <SearchBar onInputClick={() => setIsSearchOpen(true)} categories={categories} />
          </div>
        </motion.div>

        <main className="pt-6 space-y-8 pb-6 max-w-screen-xl mx-auto w-full">
          {/* Location availability notice — shows only if state list is loaded but location is unresolved */}
          {!isLocationResolved && !geoLoading && states.length > 0 && (
            <div
              className="flex items-center justify-between gap-3 py-2.5 px-4 mx-4 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)'
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(251,146,60,0.18)', border: '1px solid rgba(251,146,60,0.35)' }}>
                  <span className="text-sm">📍</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11.5px] font-black text-white leading-tight" style={{ letterSpacing: '0.01em' }}>
                    Services available across India
                  </p>
                  <p className="text-[9.5px] font-semibold leading-tight" style={{ color: 'rgba(251,146,60,0.75)' }}>
                    Select your location for local services
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddressModalOpen(true)}
                className="flex-shrink-0 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(249,115,22,0.45)'
                }}
              >
                Set Area
              </button>
            </div>
          )}

          <>
            {/* Hero Section - Promo Carousel (Includes Banners and Promos) */}
            {(homeContent?.isPromosVisible !== false || homeContent?.isBannersVisible !== false) && (
                <motion.section variants={itemVariants} className="relative z-0">
                  <PromoCarousel
                    promos={[
                      ...(homeContent?.banners || []).map(b => ({
                        id: b.id || b._id,
                        title: b.text || '',
                        subtitle: '',
                        buttonText: '',
                        image: toAssetUrl(b.imageUrl),
                        targetCategoryId: b.targetCategoryId,
                        slug: b.slug,
                        order: b.order || 0,
                        route: null
                      })),
                      ...(homeContent?.promos || []).map(promo => ({
                        id: promo.id || promo._id,
                        title: promo.title || '',
                        subtitle: promo.subtitle || promo.description || '',
                        buttonText: promo.buttonText || 'Book now',
                        className: promo.gradientClass || 'from-[#00A6A6] to-[#008a8a]',
                        image: toAssetUrl(promo.imageUrl),
                        targetCategoryId: promo.targetCategoryId,
                        slug: promo.slug,
                        scrollToSection: promo.scrollToSection,
                        order: promo.order || 0,
                        route: null
                      }))
                    ].sort((a, b) => (a.order || 0) - (b.order || 0))}
                    onPromoClick={handlePromoClick}
                  />
                </motion.section>
              )}

              {/* Quick Agri Actions (Modern Premium Grid) */}
              {homeContent?.isPremiumOfferingsVisible !== false && (
                <motion.section variants={itemVariants} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex flex-col">
                      <h2 className="text-[18px] sm:text-[20px] font-black text-slate-900 tracking-tight">Explore Services</h2>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Tab Create</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(homeContent?.premiumOfferings || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map((item, idx) => (
                      <motion.div
                        key={item.id || item._id || idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => {
                          if (item.actionType === 'navigate' && item.route && item.route.trim() !== '') {
                            const route = item.route.trim();
                            // Check if this route is meant to open a category modal instead of navigating
                            // Only intercept routes that don't have dedicated pages
                            if (route === '/user/drone-spraying') {
                              const searchName = 'drone';
                              const matchedCategory = categories.find(c => 
                                (c.title && c.title.toLowerCase().includes(searchName)) || 
                                (c.slug && c.slug.toLowerCase().includes(searchName))
                              );
                              if (matchedCategory) {
                                handleCategoryClick(matchedCategory);
                                return;
                              } else {
                                toastManager.error("Category not found.");
                                return;
                              }
                            }
                            navigate(route);
                          } else {
                            // setActiveSectionTab: use title as primary (admin sets category sectionType = tab title)
                            // Fall back to actionPayload if title is missing
                            const tabKey = (item.title || item.actionPayload || '').trim();
                            if (tabKey) setActiveSectionTab(tabKey);
                          }
                        }}
                        className="relative overflow-hidden bg-white border border-slate-100 rounded-[20px] p-3 shadow-[0_4px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all active:scale-95 group flex items-center gap-3 cursor-pointer"
                      >
                         <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(to bottom right, ${item.colorCode}1a, transparent)` }} />
                         <div className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center flex-shrink-0 transition-all duration-300 shadow-sm border z-10 overflow-hidden" style={{ backgroundColor: `${item.colorCode}1a`, color: item.colorCode, borderColor: `${item.colorCode}33` }}>
                           {item.imageUrl ? (
                             <img src={toAssetUrl(item.imageUrl)} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                           ) : (
                             <span className="text-xl font-bold">{item.title?.charAt(0)}</span>
                           )}
                         </div>
                         <div className="flex-1 min-w-0 z-10">
                            <p className="text-[13px] sm:text-sm font-black text-slate-800 leading-tight truncate tracking-tight">
                              {item.title === 'Rent Machinery' ? 'Machinery Catalog' : item.title}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5 truncate tracking-wide">{item.subtitle}</p>
                         </div>
                      </motion.div>
                    ))}
                    {/* Weather Button */}
                    <WeatherWidget />
                  </div>
                </motion.section>
              )}


              {/* Categories Sections */}
              {homeContent?.isCategoriesVisible !== false && categories.length > 0 && (() => {
                const activeCategories = categories.filter(c => {
                  if (c.showOnHome === false) return false;
                  // If it has a parent category, it should ONLY show if isAlwaysMain is true
                  const hasParent = c.parentCategory || (c.parentCategories && c.parentCategories.length > 0);

                  if (hasParent) {
                    return c.isAlwaysMain === true;
                  }
                  return true;
                });

                if (activeCategories.length === 0) return null;

                const sectionTypes = [...new Set(activeCategories.map(c => (c.sectionType || 'General').trim()))];
                return (
                  <>
                    {sectionTypes.map(sectionType => {
                      const sectionCategories = activeCategories.filter(c => (c.sectionType || 'General').trim() === sectionType);
                      if (sectionCategories.length === 0) return null;
                      return (
                        <motion.section key={sectionType} variants={itemVariants} className="relative overflow-hidden pt-2 mb-4">
                          <div className="absolute inset-0 bg-gradient-to-b from-gray-50/30 to-transparent pointer-events-none -z-10" />
                          <ServiceCategories
                            title={sectionType === 'General' ? 'All Services' : sectionType}
                            subtitle={sectionType === 'General' ? 'EXPLORE CATEGORIES' : `EXPLORE ${sectionType.toUpperCase()}`}
                            categories={sectionCategories}
                            onCategoryClick={handleCategoryClick}
                            onSeeAllClick={() => navigate('/user/machinery-categories')}
                          />
                        </motion.section>
                      );
                    })}
                  </>
                );
              })()}

              {/* Curated Services */}
              {homeContent?.isCuratedVisible !== false && (
                <motion.div variants={itemVariants}>
                  <Suspense fallback={<div className="h-40 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                    <CuratedServices
                      services={(homeContent?.curated || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map(item => ({
                        id: item.id || item._id,
                        title: item.title,
                        gif: toAssetUrl(item.gifUrl),
                        slug: item.slug,
                        targetCategoryId: item.targetCategoryId
                      }))}
                      onServiceClick={handleServiceClick}
                    />
                  </Suspense>
                </motion.div>
              )}

              {/* New & Noteworthy */}
              {homeContent?.isNoteworthyVisible !== false && (
                <motion.div variants={itemVariants}>
                  <Suspense fallback={<div className="h-40 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                    <NewAndNoteworthy
                      services={(homeContent?.noteworthy || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map(item => ({
                        id: item.id || item._id,
                        title: item.title,
                        image: toAssetUrl(item.imageUrl),
                        slug: item.slug,
                        targetCategoryId: item.targetCategoryId
                      }))}
                      onServiceClick={handleServiceClick}
                    />
                  </Suspense>
                </motion.div>
              )}

              {/* Most Booked */}
              {homeContent?.isBookedVisible !== false && (
                <motion.div variants={itemVariants}>
                  <Suspense fallback={<div className="h-40 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                    <MostBookedServices
                      services={(homeContent?.booked || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map(item => ({
                        id: item.id || item._id,
                        title: item.title,
                        rating: item.rating,
                        reviews: item.reviews,
                        price: item.price,
                        originalPrice: item.originalPrice,
                        discount: item.discount,
                        image: toAssetUrl(item.imageUrl),
                        targetCategoryId: item.targetCategoryId,
                        slug: item.slug,
                        serviceId: item.targetServiceId,
                        categoryId: item.targetCategoryId
                      }))}
                      onServiceClick={handleServiceClick}
                      onAddClick={handleAddClick}
                    />
                  </Suspense>
                </motion.div>
              )}


              {/* Machinery Discovery Section */}
              <motion.div variants={itemVariants}>
                <MachineryDiscoverySection />
              </motion.div>

              {/* Agriculture Marketplace */}
              <motion.div variants={itemVariants}>
                <AgriMarketplaceSection />
              </motion.div>

              {/* Dynamic Sections */}
              {homeContent?.isCategorySectionsVisible !== false && (homeContent?.categorySections || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map((section, sIdx) => (
                <motion.div key={section._id || sIdx} variants={itemVariants}>
                  <Suspense fallback={<div className="h-40 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                    <ServiceSectionWithRating
                      title={section.title}
                      subtitle={section.subtitle}
                      services={section.cards?.map((card, cIdx) => {
                        const processedImage = toAssetUrl(card.imageUrl);
                        return {
                          id: card._id || cIdx,
                          title: card.title,
                          rating: card.rating || "4.8",
                          reviews: card.reviews || "10k+",
                          price: card.price,
                          originalPrice: card.originalPrice,
                          discount: card.discount,
                          image: processedImage,
                          targetCategoryId: card.targetCategoryId,
                          slug: card.slug,
                          serviceId: card.targetServiceId,
                          categoryId: card.targetCategoryId
                        };
                      }) || []}
                      onSeeAllClick={() => {
                        if (section.seeAllTargetCategoryId) {
                          const cat = categories.find(c => (c.id === section.seeAllTargetCategoryId || c._id === section.seeAllTargetCategoryId));
                          if (cat) handleCategoryClick(cat);
                        }
                      }}
                      onServiceClick={(service) => handleServiceClick(service)}
                      onAddClick={handleAddClick}
                    />
                  </Suspense>
                </motion.div>
              ))}

              {/* Refer & Earn Section */}
              <motion.div variants={itemVariants}>
                <Suspense fallback={<div className="h-32 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                  <ReferEarnSection onReferClick={handleReferClick} />
                </Suspense>
              </motion.div>
            </>
        </main>
      </motion.div>

      {/* Bottom Navigation */}
      {!isAddressModalOpen && <BottomNav />}

      {/* Category Modal */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        category={selectedCategory}
        currentCity={currentCity}
      />

      {/* Section Tab Bottom Sheet Modal */}
      <AnimatePresence>
        {activeSectionTab && (
          <div className="fixed inset-0 z-[9990] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveSectionTab(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative bg-white w-full rounded-t-[32px] p-6 pb-12 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-10 max-h-[80vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
              
              <div className="flex justify-between items-center mb-6">
                <h4 className="font-bold text-gray-900 text-lg">{activeSectionTab}</h4>
                <button
                  onClick={() => setActiveSectionTab(null)}
                  className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200"
                >
                  ✕
                </button>
              </div>

              {categories.filter(c => (c.sectionType || '').trim().toLowerCase() === (activeSectionTab || '').trim().toLowerCase()).length > 0 ? (
                <ServiceCategories
                  title={activeSectionTab}
                  subtitle={`EXPLORE ALL ${activeSectionTab.toUpperCase()}`}
                  categories={categories.filter(c => (c.sectionType || '').trim().toLowerCase() === (activeSectionTab || '').trim().toLowerCase())}
                  onCategoryClick={(cat) => {
                    setActiveSectionTab(null);
                    handleCategoryClick(cat);
                  }}
                  onSeeAllClick={() => {}}
                />
              ) : (
                <div className="py-12 text-center text-gray-500 text-sm">
                  No services available in this section yet.
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Search Overlay */}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        categories={categories}
        onCategoryClick={handleCategoryClick}
      />

      {/* Address Selection Modal */}
      <AddressSelectionModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        houseNumber={houseNumber}
        onHouseNumberChange={setHouseNumber}
        onSave={handleAddressSave}
      />


    </div>
  );
};

export default Home;
