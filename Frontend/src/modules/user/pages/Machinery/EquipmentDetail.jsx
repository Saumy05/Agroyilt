import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FiTruck, FiMapPin, FiStar, FiShield, 
  FiClock, FiCalendar, FiUser, FiPhone,
  FiArrowLeft, FiCheck, FiInfo, FiTag, FiPlus, FiMinus, FiLayers
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import LogoLoader from '../../../../components/common/LogoLoader';
import BreadcrumbsSchema from '../../../../components/common/BreadcrumbsSchema';
import ServiceSchema from '../../../../components/common/ServiceSchema';
import { toastManager } from '../../../../utils/toastManager';

const EquipmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState(null);

  // Restore state from sessionStorage (so navigating back doesn't clear the form)
  const savedKey = `machinery_booking_${id}`;
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(savedKey) || 'null'); } catch { return null; } })();

  const [selectedRateType, setSelectedRateType] = useState(saved?.selectedRateType || 'hourly');
  const [quantity, setQuantity] = useState(saved?.quantity || 1);
  const [selectedDate, setSelectedDate] = useState(saved?.selectedDate || '');
  const [startTime, setStartTime] = useState(saved?.startTime || '');
  const [endTime, setEndTime] = useState(saved?.endTime || '');
  const [selectedImplements, setSelectedImplements] = useState([]); // NEW: selected sub-categories

  // Persist state to sessionStorage whenever relevant fields change
  useEffect(() => {
    const data = { selectedRateType, quantity, selectedDate, startTime, endTime };
    sessionStorage.setItem(savedKey, JSON.stringify(data));
  }, [selectedRateType, quantity, selectedDate, startTime, endTime, savedKey]);

  // Auto-calculate quantity for hourly rate
  useEffect(() => {
    if (selectedRateType === 'hourly' && startTime && endTime) {
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);
      
      let diffMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
      
      if (diffMinutes > 0) {
        // Calculate exact hours (30-min minimum), cleanly rounded to 1 decimal
        const hours = Math.max(0.5, Math.round((diffMinutes / 60) * 10) / 10);
        setQuantity(hours);
      }
    }
  }, [startTime, endTime, selectedRateType]);

  // Normalize quantity when rate type changes (NOT for hourly — hourly uses exact fractional hours)
  useEffect(() => {
    if (selectedRateType === 'land_based' && quantity < 0.5) {
      setQuantity(0.5);
    } else if (selectedRateType !== 'land_based' && selectedRateType !== 'hourly' && !Number.isInteger(quantity)) {
      // Only snap to integer for daily/monthly — hourly stays fractional (e.g. 0.5 = 30 min)
      setQuantity(Math.max(1, Math.floor(quantity)));
    }
  }, [selectedRateType]);

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await publicEquipmentService.getEquipmentById(id);
      if (res.success) {
        setEquipment(res.data);
        if (res.data.implements && Array.isArray(res.data.implements)) {
          setSelectedImplements(res.data.implements);
        }
        // Default rate type based on availability
        if (!res.data.pricing?.hourly?.isEnabled && res.data.pricing?.land_based?.isEnabled) {
          setSelectedRateType('land_based');
        }
      }
    } catch (err) {
      toastManager.error('Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  // Toggle an implement selection
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // ... (existing code for toggleImplement and getImplementAddon)
  const toggleImplement = (impl) => {
    setSelectedImplements(prev => {
      const exists = prev.find(i => i.subCategoryId === impl.subCategoryId);
      if (exists) {
        // Prevent deselecting the last implement
        if (prev.length === 1) {
          toastManager.info('You must select at least one implement for this machine.', { 
            icon: 'ℹ️',
            id: 'implement-limit-toast'
          });
          return prev;
        }
        return prev.filter(i => i.subCategoryId !== impl.subCategoryId);
      }
      return [...prev, impl];
    });
  };

  const getImplementAddon = () => {
    return selectedImplements.reduce((sum, impl) => {
      const p = impl.pricing?.[selectedRateType];
      if (p?.isEnabled && p?.price > 0) {
        return sum + (p.price * quantity);
      }
      return sum;
    }, 0);
  };

  if (loading) return <LogoLoader />;
  if (!equipment) return <div className="text-center py-20">Equipment not found</div>;

  const currentRate = selectedRateType === 'hourly' 
    ? equipment.pricing?.hourly?.price 
    : equipment.pricing?.land_based?.price;

  const implementAddon = getImplementAddon();
  const baseTotal = (currentRate || 0) * quantity;
  const total = baseTotal + implementAddon;

  // Implements available for this equipment
  const availableImplements = Array.isArray(equipment.implements) ? equipment.implements : [];

  return (
    <div className="min-[100dvh] bg-slate-50 pb-32">
      <Helmet>
        <title>{`${equipment.name} Booking | Agroyilt`}</title>
        <meta name="description" content={`Book ${equipment.name} machinery for your farm. Verified professional operator, affordable rates starting at ₹${currentRate}.`} />
        <link rel="canonical" href={`https://agroyilt.com/user/machinery/${id}`} />
      </Helmet>

      {/* SEO Structured Data */}
      <BreadcrumbsSchema items={[
        { name: 'Home', item: '/' },
        { name: 'Machinery', item: '/user/machinery-explorer' },
        { name: equipment.categoryId?.title || 'Category', item: '/user/machinery-explorer' },
        { name: equipment.name, item: `/user/machinery/${id}` }
      ]} />
      <ServiceSchema data={equipment} />

      {/* Dynamic Navbar */}
      <div className="fixed top-0 inset-x-0 z-50 px-5 pt-4">
         <div className="max-w-xl mx-auto flex justify-between items-center bg-white/80 backdrop-blur-md p-2 rounded-3xl border border-white/20 shadow-sm">
            <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm text-slate-800">
               <FiArrowLeft />
            </button>
            <div className="text-center">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Machinery Detail</p>
               <h1 className="text-sm font-black text-slate-800 truncate max-w-[150px]">{equipment.name}</h1>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
               <FiTruck />
            </div>
         </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Images Frame with Swipe capability */}
        <div className="h-[40vh] md:h-[50vh] relative bg-slate-200 overflow-hidden">
           {equipment.images?.length > 0 ? (
             <div 
               className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth"
               onScroll={(e) => {
                 const scrollLeft = e.target.scrollLeft;
                 const width = e.target.clientWidth;
                 setCurrentImageIndex(Math.round(scrollLeft / width));
               }}
             >
               {equipment.images.map((img, i) => (
                 <img key={i} src={img} className="w-full h-full flex-shrink-0 object-cover snap-center" alt={`${equipment.name} - View ${i+1}`} />
               ))}
             </div>
           ) : (
             <div className="w-full h-full flex items-center justify-center"><FiTruck size={60} className="text-white" /></div>
           )}
           <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent pointer-events-none" />
           
           {/* Image Dots Indicator */}
           {equipment.images?.length > 1 && (
             <div className="absolute bottom-[110px] left-0 right-0 flex justify-center gap-1.5 z-10">
               {equipment.images.map((_, i) => (
                 <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${currentImageIndex === i ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />
               ))}
             </div>
           )}

           <div className="absolute bottom-8 left-6 right-6 pointer-events-none">
              <div className="flex items-center gap-2 mb-3">
                 <span className="px-3 py-1 bg-emerald-700 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-xs">
                   {equipment.categoryId?.title}
                 </span>
                 <span className="px-3 py-1 bg-white/20 backdrop-blur-md text-white border border-white/20 rounded-full text-[9px] font-black uppercase tracking-widest">
                   Verified Asset
                 </span>
              </div>
              <h2 className="text-3xl font-black text-white leading-tight mb-2 drop-shadow-md">{equipment.name}</h2>
               <div className="flex items-center gap-4 text-white/90 text-xs font-bold">
                 <span className="flex items-center gap-1.5">
                   <FiMapPin className="text-orange-400" /> 
                   {equipment.vendorId?.address?.city || equipment.vendorId?.address?.addressLine1 || 'Available Nearby'}
                 </span>
                 <span className="flex items-center gap-1.5">
                   <FiStar className="text-amber-400 fill-amber-400" /> 
                   {equipment.rating || equipment.vendorId?.rating || 'New'} Rating
                   {equipment.totalReviews ? <span className="text-[10px] opacity-75 ml-1">({equipment.totalReviews} reviews)</span> : null}
                 </span>
              </div>
           </div>
        </div>

        {/* Content Body */}
        <div className="px-6 -mt-6 relative z-10 space-y-6">
           {/* Section: Rate Selection */}
           <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-5">
                 <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600"><FiTag size={16}/></div>
                 <h3 className="text-base font-black text-slate-800">Select Service Rate Type</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                 {equipment.pricing?.hourly?.isEnabled && (
                    <button 
                      onClick={() => setSelectedRateType('hourly')}
                      className={`p-4 rounded-3xl border-2 transition-all flex flex-col items-center gap-2
                        ${selectedRateType === 'hourly' ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/10' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                       <FiClock className={selectedRateType === 'hourly' ? 'text-emerald-700' : 'text-slate-400'} size={20} />
                       <div className="text-center">
                          <p className={`text-[10px] font-black uppercase tracking-widest ${selectedRateType === 'hourly' ? 'text-emerald-700' : 'text-slate-400'}`}>Hourly Service</p>
                          <p className="text-lg font-black text-slate-800">₹{equipment.pricing.hourly.price}<span className="text-[10px] text-slate-400 ml-0.5">/hr</span></p>
                          <span className="text-[9.5px] font-bold text-emerald-600 block mt-0.5">≈ ₹{(equipment.pricing.hourly.price / 60).toFixed(2)}/min live timer</span>
                       </div>
                    </button>
                 )}
                 {equipment.pricing?.land_based?.isEnabled && (
                    <button 
                      onClick={() => setSelectedRateType('land_based')}
                      className={`p-4 rounded-3xl border-2 transition-all flex flex-col items-center gap-2
                        ${selectedRateType === 'land_based' ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/10' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                       <FiMapPin className={selectedRateType === 'land_based' ? 'text-emerald-700' : 'text-slate-400'} size={20} />
                       <div className="text-center">
                          <p className={`text-[10px] font-black uppercase tracking-widest ${selectedRateType === 'land_based' ? 'text-emerald-700' : 'text-slate-400'}`}>Acre Rate</p>
                          <p className="text-lg font-black text-slate-800">₹{equipment.pricing.land_based.price}<span className="text-[10px] text-slate-400 ml-0.5">/acre</span></p>
                       </div>
                    </button>
                 )}
              </div>
           </div>

           {/* ============================================================ */}
           {/* NEW: Section: Add-on Implements (Sub-categories) Selection   */}
           {/* ============================================================ */}
           <AnimatePresence>
             {availableImplements.length > 0 && (
               <motion.div
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -10 }}
                 className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100"
               >
                 <div className="flex items-center gap-2 mb-5">
                   <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                     <FiLayers size={16} />
                   </div>
                    <div>
                      <h3 className="text-base font-black text-slate-800">Machine Implements</h3>
                      <p className="text-[10px] font-medium text-slate-400">Implements provided with this machine</p>
                    </div>
                 </div>

                 <div className="space-y-3">
                   {availableImplements.map((impl) => {
                     const isSelected = selectedImplements.some(i => i.subCategoryId === impl.subCategoryId);
                     const addonRate = impl.pricing?.[selectedRateType];
                     const hasPrice = addonRate?.isEnabled && addonRate?.price > 0;

                     return (
                       <motion.button
                         key={impl.subCategoryId}
                         type="button"
                         whileTap={{ scale: 0.98 }}
                         onClick={() => toggleImplement(impl)}
                         className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all text-left
                           ${isSelected 
                             ? 'border-violet-500 bg-violet-50/60 shadow-sm shadow-violet-100' 
                             : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'}`}
                       >
                         <div className="flex items-center gap-3">
                           <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all flex-shrink-0
                             ${isSelected ? 'bg-violet-600' : 'bg-slate-200'}`}>
                             {isSelected 
                               ? <FiCheck className="text-white" size={12} />
                               : <FiPlus className="text-slate-400" size={12} />
                             }
                           </div>
                           <div>
                             <p className={`text-sm font-black ${isSelected ? 'text-violet-800' : 'text-slate-700'}`}>
                               {impl.subCategoryId?.title || impl.title || 'Unknown Implement'}
                             </p>
                             {!hasPrice && (
                               <p className="text-[10px] text-slate-400 font-medium">Included (no extra charge)</p>
                             )}
                           </div>
                         </div>
                         {hasPrice && (
                           <div className="text-right flex-shrink-0">
                             <p className={`text-[10px] font-black uppercase tracking-wide ${isSelected ? 'text-violet-500' : 'text-slate-400'}`}>
                               Add-on
                             </p>
                             <p className={`text-sm font-black ${isSelected ? 'text-violet-700' : 'text-slate-600'}`}>
                               +₹{addonRate.price}
                               <span className="text-[9px] font-bold ml-0.5 opacity-70">
                                 /{selectedRateType === 'hourly' ? 'hr' : 'acre'}
                               </span>
                             </p>
                           </div>
                         )}
                       </motion.button>
                     );
                   })}
                 </div>

                 {selectedImplements.length > 0 && (
                   <motion.div
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     className="mt-4 p-4 bg-violet-600 rounded-2xl"
                   >
                     <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-1">Selected Add-ons</p>
                     <div className="flex flex-wrap gap-2">
                       {selectedImplements.map(impl => (
                         <span key={impl.subCategoryId} className="px-3 py-1 bg-white/20 rounded-full text-white text-[10px] font-black">
                           {impl.title}
                         </span>
                       ))}
                     </div>
                     {implementAddon > 0 && (
                       <p className="text-white font-black text-sm mt-2">
                         Add-on total: +₹{implementAddon.toLocaleString()}
                       </p>
                     )}
                   </motion.div>
                 )}
               </motion.div>
             )}
           </AnimatePresence>

           {/* Section: Quantity & Driver */}
           <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                 <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600"><FiInfo size={16}/></div>
                    <div>
                      <h3 className="text-base font-black text-slate-800">
                        {selectedRateType === 'hourly' ? 'Estimated Work Duration (Hours)' : 'Total Land Size (Acres)'}
                      </h3>
                      <p className="text-[10px] font-bold text-emerald-600">
                        {selectedRateType === 'hourly' 
                          ? '⏱️ Final billing on exact active minutes via Play/Pause (Breakdown = ₹0)' 
                          : '🌾 Rate applied per acre completed'}
                      </p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4 bg-slate-100 p-1 rounded-2xl">
                     <button 
                      onClick={() => {
                        const step = selectedRateType === 'land_based' ? 0.5 : 1;
                        const min = selectedRateType === 'land_based' ? 0.5 : 1;
                        setQuantity(Math.max(min, Math.round(((parseFloat(quantity) || 1) - step) * 10) / 10));
                      }}
                      disabled={selectedRateType === 'hourly'}
                      className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center font-bold transition-all shadow-sm ${selectedRateType === 'hourly' ? 'text-slate-400 opacity-50 cursor-not-allowed' : 'text-slate-800 active:scale-90'}`}
                    >
                      <FiMinus size={14} />
                    </button>
                    <span className="text-lg font-black text-slate-800 min-w-8 px-1 text-center">{Number((parseFloat(quantity) || 1).toFixed(2))}</span>
                    <button 
                      onClick={() => {
                        const step = selectedRateType === 'land_based' ? 0.5 : 1;
                        setQuantity(Math.round(((parseFloat(quantity) || 1) + step) * 10) / 10);
                      }}
                      disabled={selectedRateType === 'hourly'}
                      className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center font-bold transition-all shadow-sm ${selectedRateType === 'hourly' ? 'text-slate-400 opacity-50 cursor-not-allowed' : 'text-slate-800 active:scale-90'}`}
                    >
                      <FiPlus size={14} />
                    </button>
                 </div>
              </div>

              {equipment.includesDriver && (
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-4 flex items-center gap-4">
                   <div className="w-12 h-12 rounded-2xl bg-emerald-700 flex items-center justify-center text-white flex-shrink-0">
                      <FiUser size={24} />
                   </div>
                   <div className="flex-1">
                      <p className="text-xs font-black text-slate-800">Operator Included</p>
                      <p className="text-[10px] font-medium text-slate-500">Expert driver will accompany the machinery.</p>
                   </div>
                   {(equipment.driver?.additionalCharge > 0) && (
                     <div className="text-right">
                        <p className="text-[10px] font-black text-emerald-700 uppercase">Extra Charge</p>
                        <p className="text-sm font-black text-slate-800">+₹{equipment.driver?.additionalCharge}</p>
                     </div>
                   )}
                </div>
              )}
           </div>

           {/* Section: Availability Selection */}
           <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-5">
                 <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600"><FiCalendar size={16}/></div>
                 <h3 className="text-base font-black text-slate-800">Select Date & Slot</h3>
              </div>
              <div className="space-y-4">
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-2 block">Booking Date</label>
                    <input 
                      type="date" 
                      className="w-full bg-slate-50 border-slate-100 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20"
                      value={selectedDate}
                      min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]}
                      onChange={e => setSelectedDate(e.target.value)}
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-2 block">Service Time</label>
                    <div className="flex gap-3">
                       <div className="flex-1">
                          <label className="text-[10px] font-bold text-slate-500 mb-1 block">Start Time</label>
                          <input 
                            type="time" 
                            className="w-full bg-slate-50 border-slate-100 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20"
                            value={startTime}
                            onChange={e => setStartTime(e.target.value)}
                          />
                       </div>
                       <div className="flex-1">
                          <label className="text-[10px] font-bold text-slate-500 mb-1 block">End Time</label>
                          <input 
                            type="time" 
                            className="w-full bg-slate-50 border-slate-100 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20"
                            value={endTime}
                            onChange={e => setEndTime(e.target.value)}
                          />
                       </div>
                    </div>

                    {/* Validation Message */}
                    {(() => {
                      if (!selectedDate || !startTime || !endTime) return null;
                      
                      const localNow = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000);
                      const today = localNow.toISOString().split('T')[0];
                      
                      let startError = null;
                      if (selectedDate === today) {
                        const now = new Date();
                        const currentHours = now.getHours();
                        const currentMinutes = now.getMinutes();
                        const [startHours, startMinutes] = startTime.split(':').map(Number);
                        
                        if (startHours < currentHours || (startHours === currentHours && startMinutes <= currentMinutes)) {
                          startError = "Start time has already passed. Please select a future time.";
                        }
                      }

                      let endError = null;
                      if (endTime <= startTime) {
                        endError = "End time must be later than start time.";
                      }
                  
                      if (startError) {
                        return <p className="text-xs text-red-500 font-bold mt-2">{startError}</p>;
                      }
                      if (endError) {
                        return <p className="text-xs text-red-500 font-bold mt-2">{endError}</p>;
                      }
                      return null;
                    })()}
                 </div>
              </div>
           </div>

           {/* Section: Specifications */}
           <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
              <h3 className="text-base font-black text-slate-800 mb-4">Specifications</h3>
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Model</p>
                    <p className="text-sm font-black text-slate-800">{equipment.modelNumber || 'N/A'}</p>
                 </div>
                 <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Mfg Year</p>
                    <p className="text-sm font-black text-slate-800">{equipment.year}</p>
                 </div>
              </div>
              <p className="mt-4 text-xs text-slate-500 font-medium leading-relaxed">
                 {equipment.description || "This verified professional machinery is well-maintained and ready for efficient field work. Certified by Agroyilt team."}
              </p>
           </div>
        </div>
      </div>

      {/* Floating Bottom Bar with price breakdown */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-slate-100 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] rounded-t-[40px]">
        <div className="max-w-xl mx-auto">
          {/* Price Breakdown */}
          {implementAddon > 0 && (
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
              <span>Base: ₹{baseTotal.toLocaleString()}</span>
              <span>Implements: +₹{implementAddon.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
             <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Estimated</p>
                <h4 className="text-2xl font-black text-slate-800 leading-none">
                   ₹{total.toLocaleString()}<span className="text-sm text-slate-300 font-bold">.00</span>
                </h4>
             </div>
             <motion.button 
               whileHover={{ scale: 1.02 }}
               whileTap={{ scale: 0.98 }}
               onClick={() => {
                  if (!selectedDate || !startTime || !endTime) {
                    toastManager.error('Please select date, start time, and end time');
                    return;
                  }

                  if (availableImplements.length > 0 && selectedImplements.length === 0) {
                    toastManager.error('Please select at least one implement for this machine.');
                    return;
                  }

                  const localNow = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000);
                  const today = localNow.toISOString().split('T')[0];
                  
                  if (selectedDate === today) {
                    const now = new Date();
                    const currentHours = now.getHours();
                    const currentMinutes = now.getMinutes();
                    const [startHours, startMinutes] = startTime.split(':').map(Number);
                    
                    if (startHours < currentHours || (startHours === currentHours && startMinutes <= currentMinutes)) {
                      toastManager.error('Start time has already passed. Please select a future time.');
                      return;
                    }
                  }

                  if (endTime <= startTime) {
                    toastManager.error('End time must be later than start time.');
                    return;
                  }

                  // Format 24h to 12h AM/PM for display
                  const format12Hour = (time24) => {
                    const [h, m] = time24.split(':');
                    const hours = parseInt(h, 10);
                    const suffix = hours >= 12 ? 'PM' : 'AM';
                    const displayHours = hours % 12 || 12;
                    return `${displayHours.toString().padStart(2, '0')}:${m} ${suffix}`;
                  };

                  const formattedSlot = `${format12Hour(startTime)} - ${format12Hour(endTime)}`;

                  navigate('/user/machinery/checkout', { 
                    state: { 
                      equipment, 
                      bookingData: {
                        rateType: selectedRateType,
                        quantity,
                        date: selectedDate,
                        slot: formattedSlot,
                        startTime,
                        endTime,
                        total,
                        selectedImplements
                      }
                    } 
                  });
               }}
               className="px-10 py-4 bg-emerald-600 text-white rounded-[24px] font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/30 flex items-center gap-2"
             >
              <span>Book Now</span>
              <FiCheck size={18} />
             </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentDetail;
