import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { FiX, FiLayers, FiArrowLeft, FiPlus, FiCheck } from 'react-icons/fi';
import { AnimatePresence, motion } from 'framer-motion';
import { themeColors } from '../../../../../theme';
import { publicCatalogService } from '../../../../../services/catalogService';
import api from '../../../../../services/api';
import { useCart } from '../../../../../context/CartContext';
import { toastManager } from '../../../../../utils/toastManager';
import SlotPicker from '../../../components/booking/SlotPicker';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const CategoryModal = React.memo(({ isOpen, onClose, category, location, cartCount, currentCity }) => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [isClosing, setIsClosing] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const [view, setView] = useState('services'); // 'services' | 'attachments'
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [services, setServices] = useState([]); // Sub-services
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const cityId = currentCity?._id || currentCity?.id;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsClosing(false);
      // Reset state on close
      setTimeout(() => {
        setView('services');
        setSelectedBrand(null);
        setBrands([]);
        setServices([]);
        setIsRedirecting(false);
      }, 300);
    } else if (category) {
      const slug = (category.slug || '').toLowerCase();
      const title = (category.title || '').toLowerCase();
      if (slug.includes('soil') || title.includes('soil')) {
        onClose();
        toastManager.info("Soil testing service is currently unavailable.");
        return;
      }
      if (category.id || category._id) {
        // Fetch Services directly for this category
        fetchServicesDirectly();
      }
    }
  }, [isOpen, category?.id, category?._id, cityId]);

  const fetchServicesDirectly = async () => {
    try {
      setLoading(true);

      const catId = category?.id || category?._id;
      const title = (category?.title || '').toLowerCase();
      const slug = (category?.slug || '').toLowerCase();

      const isWorker = category?.bookingType === 'WORKER' || 
                       /labour|labor|worker|manpower|service|shramik|majdoor/i.test(title) ||
                       /labour|labor|worker|manpower|service|shramik|majdoor/i.test(slug);

      if (isWorker) {
        // 1. Fetch public services & registered independent workers
        const [servicesRes, workersRes] = await Promise.all([
          api.get('/public/services', { params: { categoryId: catId } }).catch(() => ({ data: {} })),
          api.get('/public/workers', { params: { categoryId: catId, category: category?.title } }).catch(() => ({ data: {} }))
        ]);

        const rawServices = servicesRes.data?.services || servicesRes.data?.data || [];
        const rawWorkers = workersRes.data?.workers || [];

        const workerCards = rawWorkers.map(worker => ({
          _id: worker.id || worker._id,
          id: worker.id || worker._id,
          title: `${worker.name} (Independent Worker)`,
          description: `Rating: ${worker.rating || 4.8}★ ? Skills: ${worker.skills?.join(', ') || 'General Labour'}`,
          icon: worker.profilePhoto || '',
          hourly_price: worker.hourlyRate || 0,
          daily_price: worker.dailyRate || 0,
          land_price: worker.landRate || 0,
          land_unit: 'Acre',
          originalWorker: worker,
          isWorkerProfile: true
        }));

        // SOP RULE FOR WORKER CATEGORIES:
        // If registered Independent Workers exist, show ONLY the Independent Worker profiles!
        if (workerCards.length > 0) {
          setServices(workerCards);
          setLoading(false);
          return;
        }

        // If no registered workers exist yet, show empty list.
        setServices([]);
        setLoading(false);
        return;
      }

      // 2. Fetch machinery/vendor equipment (VENDOR)
      let lat = '';
      let lng = '';
      try {
        const storedLoc = JSON.parse(localStorage.getItem('userLocation'));
        if (storedLoc?.lat) {
          lat = storedLoc.lat;
          lng = storedLoc.lng;
        }
      } catch (e) {}

      const response = await api.get('/public/equipment/search', {
        params: {
          category: catId,
          lat,
          lng,
          radius: 100 // 100km radius
        }
      });

      const machineryList = response.data?.data || [];

      if (response.data?.success && machineryList.length > 0) {
        const mappedListings = machineryList.map(equipment => ({
          _id: equipment._id,
          title: equipment.name,
          description: `${equipment.vendor?.businessName || equipment.vendor?.name || 'Vendor'} ? ${equipment.distance ? (equipment.distance/1000).toFixed(1) + 'km away' : ''}`,
          icon: equipment.images?.[0] || '',
          hourly_price: equipment.pricing?.hourly?.isEnabled ? equipment.pricing.hourly.price : 0,
          land_price: equipment.pricing?.land_based?.isEnabled ? equipment.pricing.land_based.price : 0,
          daily_price: equipment.pricing?.daily?.isEnabled ? equipment.pricing.daily.price : 0,
          originalEquipment: equipment
        }));
        setServices(mappedListings);
      } else {
        // If no machinery found, show empty list. We should NOT fall back to admin templates.
        setServices([]);
      }
    } catch (error) {
      console.error("Failed to load services:", error);
      toastManager.error("Failed to load services. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToBrands = () => {
    setView('services');
    setSelectedBrand(null);
    setServices([]);
  };

  const [selectedServiceForBooking, setSelectedServiceForBooking] = useState(null);
  const [availableImplements, setAvailableImplements] = useState([]);
  const [selectedImplements, setSelectedImplements] = useState([]);

  const isRentalCategory = (categoryTitle) => {
    if (!categoryTitle) return false;
    const rentals = ['tractor', 'harvester', 'drone', 'heavy', 'planting', 'irrigation', 'crop protection', 'land preparation', 'modern equipment', 'machinery', 'agriculture'];
    return rentals.some(r => categoryTitle.toLowerCase().includes(r));
  };

  const handleServiceClick = async (service) => {
    // Check if we need to pick attachments (implements)
    if (isRentalCategory(category?.title)) {
      setSelectedServiceForBooking(service);
      setLoading(true);
      try {
        const vendorImplements = service.originalEquipment?.implements || [];
        
        // Map vendor implements to match UI expectations
        const mappedImplements = vendorImplements
          .filter(impl => impl.subCategory) // Ensure it has details
          .map(impl => ({
            _id: impl.subCategory._id,
            id: impl.subCategory._id,
            title: impl.subCategory.title,
            hourly_price: impl.pricing?.hourly?.isEnabled ? impl.pricing.hourly.price : 0,
            land_price: impl.pricing?.land_based?.isEnabled ? impl.pricing.land_based.price : 0,
            daily_price: impl.pricing?.daily?.isEnabled ? impl.pricing.daily.price : 0,
            icon: impl.subCategory.homeIconUrl || ''
          }));

        if (mappedImplements.length > 0) {
          setAvailableImplements(mappedImplements);
          setSelectedImplements([]);
          setView('attachments');
        } else {
          // No implements, direct add
          processAddToCart(service);
        }
      } catch (err) {
        console.error("Failed to parse attachments:", err);
        processAddToCart(service);
      } finally {
        setLoading(false);
      }
    } else {
      // Direct add for non-rentals
      processAddToCart(service);
    }
  };

  const calculateTotals = () => {
    const parent = selectedServiceForBooking || {};
    const total = {
      hourly: parent.hourly_price || 0,
      land: parent.land_price || 0,
      daily: parent.daily_price || 0
    };

    selectedImplements.forEach(impl => {
      total.hourly += (impl.hourly_price || 0);
      total.land += (impl.land_price || 0);
      total.daily += (impl.daily_price || 0);
    });

    return total;
  };

  const toggleImplement = (impl) => {
    setSelectedImplements(prev => {
      const exists = prev.find(i => (i._id || i.id) === (impl._id || impl.id));
      if (exists) {
        return prev.filter(i => (i._id || i.id) !== (impl._id || impl.id));
      }
      return [...prev, impl];
    });
  };

  const handleProcessWithAttachments = () => {
    processAddToCart(selectedServiceForBooking, null, null, selectedImplements);
  };

  const processAddToCart = async (service, slot = null, date = null, implementsToAdd = []) => {
    // Add to cart logic
    try {
      if (service) {
        // Add parent machine first
        await addToCart({
          serviceId: service?._id || service?.id,
          title: service.title,
          description: service.description || '',
          icon: toAssetUrl(service.icon || ''),
          price: service.hourly_price || service.price || service.discountPrice || service.basePrice || 0,
          hourly_price: service.hourly_price,
          land_price: service.land_price,
          land_unit: service.land_unit,
          daily_price: service.daily_price,
          categoryId: category?._id || category?.id,
          categoryTitle: category?.title || 'Agriculture',
          category: category?.title || 'Agriculture',
          vendorId: service?.originalEquipment?.vendorId?._id || service?.originalEquipment?.vendorId || null,
          brandId: selectedBrand?._id || selectedBrand?.id,
          sectionTitle: selectedBrand?.title || '',
          sectionIcon: toAssetUrl(selectedBrand?.iconUrl || selectedBrand?.icon || ''),
          scheduledDate: date,
          timeSlot: slot
        });

        // Add selected implements
        for (const impl of implementsToAdd) {
          await addToCart({
            serviceId: impl?._id || impl?.id,
            title: impl.title,
            description: impl.description || '',
            icon: toAssetUrl(impl.icon || ''),
            price: impl.hourly_price || impl.price || 0,
            hourly_price: impl.hourly_price,
            land_price: impl.land_price,
            land_unit: impl.land_unit,
            daily_price: impl.daily_price,
            pricing_context: 'sub-category',
            parentSourceId: service?._id || service?.id,
            categoryId: category?._id || category?.id,
            category: category?.title || 'Agriculture'
          });
        }
        
        setIsRedirecting(true);
        setTimeout(() => {
          setIsRedirecting(false);
          onClose();
          // Fast-track for rentals, regular flow for others
          const isRental = isRentalCategory(category?.title);
          if (isRental) {
            navigate('/user/checkout', {
              state: {
                category: category?.title,
                rentalType: 'hourly'
              }
            });
          } else {
            navigate('/user/cart');
          }
        }, 1200);
      }
    } catch (error) {
      toastManager.error('Failed to add to cart. Try again.');
    }
  };


  if (!isOpen && !isClosing) return null;
  if (!mounted) return null;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]"
            onClick={onClose}
            style={{
              position: 'fixed',
              willChange: 'opacity',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[9999]"
            style={{
              position: 'fixed',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* Close Button */}
            <div className="absolute -top-12 right-4 z-[60]">
              <button
                onClick={onClose}
                className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-50 transition-colors"
              >
                <FiX className="w-6 h-6 text-gray-800" />
              </button>
            </div>

            <div className="bg-white rounded-t-3xl max-h-[90vh] overflow-y-auto min-h-[50vh]">
              {isRedirecting ? (
                <div className="flex flex-col items-center justify-center min-h-[40vh] py-12">
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6"
                  >
                    <FiCheck className="w-10 h-10 text-green-500" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Service Added!</h3>
                  <p className="text-gray-500 text-sm">Proceeding to checkout...</p>
                </div>
              ) : (
                <div className="px-4 py-6">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-6">
                    {(view === 'attachments' || view === 'slots') && (
                       <button
                         onClick={() => {
                           if (view === 'slots') setView('services');
                           else setView('services');
                         }}
                         className="p-1 rounded-full hover:bg-gray-100"
                       >
                         <FiArrowLeft className="w-6 h-6 text-gray-800" />
                       </button>
                     )}
                     <div>
                       <h1 className="text-xl font-bold text-gray-900 line-clamp-1">
                         {view === 'attachments'
                           ? `Attachments for ${selectedServiceForBooking?.title}`
                           : (category?.title || 'Services')}
                       </h1>
                       {view === 'services' && <p className="text-xs text-gray-500">{category?.bookingType === 'WORKER' ? 'Select a service to continue' : 'Select a machine to continue'}</p>}
                       {view === 'attachments' && <p className="text-xs text-gray-500">Step 2: Choose tools required for your task</p>}
                     </div>
                     {loading && <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin ml-auto"></div>}
                   </div>

                  {/* Content */}
                  {loading && services.length === 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 animate-pulse">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex flex-col items-center">
                          <div className="w-20 h-20 bg-gray-200 rounded-2xl mb-2"></div>
                          <div className="h-3 w-16 bg-gray-200 rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {view === 'attachments' ? (
                        // Attachments View
                        <div className="space-y-6 pb-32">
                          {/* Machine Summary Snippet */}
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden">
                              {toAssetUrl(selectedServiceForBooking?.icon) ? (
                                <img src={toAssetUrl(selectedServiceForBooking?.icon)} className="w-full h-full object-cover" />
                              ) : <FiLayers className="w-6 h-6 text-slate-300" />}
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Selected Machine</h4>
                                <h3 className="font-black text-slate-800 text-sm">{selectedServiceForBooking?.title}</h3>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 max-h-[40vh] overflow-y-auto pr-1">
                            {availableImplements.map((impl) => {
                              const isSelected = selectedImplements.some(i => (i._id || i.id) === (impl._id || impl.id));
                              return (
                                <div
                                  key={impl.id || impl._id}
                                  onClick={() => toggleImplement(impl)}
                                  className={`p-4 border-2 rounded-2xl flex flex-col gap-3 transition-all cursor-pointer ${
                                    isSelected 
                                      ? 'border-emerald-600 bg-emerald-50/50 shadow-md' 
                                      : 'border-gray-100 bg-white hover:border-gray-200'
                                  }`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <h3 className="font-extrabold text-gray-900 text-sm italic uppercase">{impl.title}</h3>
                                      <p className="text-[10px] text-gray-400 font-medium line-clamp-1">{impl.description || 'Rental implement attachment'}</p>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                      isSelected ? 'bg-emerald-600 border-emerald-600' : 'border-gray-200'
                                    }`}>
                                      {isSelected && <FiCheck className="w-4 h-4 text-white" />}
                                    </div>
                                  </div>
                                  
                                  {/* Pricing Row */}
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {impl.hourly_price > 0 && (
                                      <div className="flex-1 min-w-[70px] flex flex-col bg-white p-2 rounded-xl border border-gray-100 items-center">
                                        <span className="text-[7px] font-black text-gray-400 uppercase">Hourly</span>
                                        <span className="text-[11px] font-black text-emerald-700">+₹{impl.hourly_price}</span>
                                      </div>
                                    )}
                                    {impl.land_price > 0 && (
                                      <div className="flex-1 min-w-[70px] flex flex-col bg-white p-2 rounded-xl border border-gray-100 items-center">
                                        <span className="text-[7px] font-black text-gray-400 uppercase">Land (/{impl.land_unit || 'Ac'})</span>
                                        <span className="text-[11px] font-black text-teal-700">+₹{impl.land_price}</span>
                                      </div>
                                    )}
                                    {impl.daily_price > 0 && (
                                      <div className="flex-1 min-w-[70px] flex flex-col bg-white p-2 rounded-xl border border-gray-100 items-center">
                                        <span className="text-[7px] font-black text-gray-400 uppercase">Daily</span>
                                        <span className="text-[11px] font-black text-blue-700">+₹{impl.daily_price}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Sticky Summary / Total Bar */}
                          <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t border-slate-100 shadow-[0_-8px_24px_rgba(0,0,0,0.05)] z-50 rounded-t-3xl">
                            <div className="flex flex-col gap-4">
                                {/* Aggregated Prices Preview */}
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Hourly</span>
                                        <span className="text-xl font-black text-slate-900">₹{calculateTotals().hourly}</span>
                                    </div>
                                    <div className="h-10 w-px bg-slate-100"></div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Land</span>
                                        <span className="text-xl font-black text-slate-900">₹{calculateTotals().land}</span>
                                    </div>
                                    <div className="h-10 w-px bg-slate-100"></div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Daily</span>
                                        <span className="text-xl font-black text-slate-900">₹{calculateTotals().daily}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleProcessWithAttachments}
                                    className="w-full py-4 rounded-2xl text-white font-extrabold text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
                                    style={{ 
                                        backgroundColor: themeColors.button,
                                        boxShadow: `0 8px 16px ${themeColors.brand.teal}3D`
                                    }}
                                >
                                    Proceed to Booking ({selectedImplements.length + 1} Items)
                                </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        // Services List
                        services.length > 0 ? (
                          <div className="space-y-3">
                            {services.map((svc) => {
                              const isAgri = isRentalCategory(category?.title);
                              return (
                                <div key={svc.id || svc._id} className="p-4 border border-gray-100 rounded-2xl bg-white shadow-sm flex flex-col gap-3">
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1 pr-4">
                                      <h3 className="font-bold text-gray-900 text-base">{svc.title}</h3>
                                      <p className="text-[10px] text-gray-400 font-medium line-clamp-1">{svc.description || 'Professional rental equipment service'}</p>
                                    </div>
                                    <button
                                      onClick={() => handleServiceClick(svc)}
                                      className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-black flex items-center gap-1.5 hover:bg-emerald-700 active:scale-95 transition-all shadow-sm"
                                    >
                                      <FiPlus className="w-4 h-4" /> Add
                                    </button>
                                  </div>

                                  <div className="flex gap-2 py-3 px-2 bg-gray-50/50 rounded-xl border border-gray-50 overflow-x-auto">
                                    {(svc.hourly_price > 0 || svc.basePrice > 0) && (
                                      <div className="flex-1 min-w-[70px] flex flex-col items-center">
                                        <span className="text-[8.5px] font-black text-gray-400 uppercase tracking-wider">Hourly</span>
                                        <span className="text-[13px] font-extrabold text-gray-900">₹{svc.hourly_price || svc.basePrice}</span>
                                      </div>
                                    )}
                                    {svc.land_price > 0 && (
                                      <div className={`flex-1 min-w-[70px] flex flex-col items-center ${
                                        (svc.hourly_price > 0 || svc.basePrice > 0) ? 'border-l border-gray-100 pl-2' : ''
                                      }`}>
                                        <span className="text-[8.5px] font-black text-gray-400 uppercase tracking-wider">Land ({svc.land_unit || 'Acre'})</span>
                                        <span className="text-[13px] font-extrabold text-gray-900">₹{svc.land_price}</span>
                                      </div>
                                    )}
                                    {svc.daily_price > 0 && (
                                      <div className={`flex-1 min-w-[70px] flex flex-col items-center ${
                                        (svc.hourly_price > 0 || svc.basePrice > 0 || svc.land_price > 0) ? 'border-l border-gray-100 pl-2' : ''
                                      }`}>
                                        <span className="text-[8.5px] font-black text-gray-400 uppercase tracking-wider">Daily</span>
                                        <span className="text-[13px] font-extrabold text-gray-900">₹{svc.daily_price}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-500">
                            <p>{category?.bookingType === 'WORKER' ? 'No services available in this category yet.' : 'No equipment available in this category yet.'}</p>
                          </div>
                        )
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
});

CategoryModal.displayName = 'CategoryModal';
export default CategoryModal;
