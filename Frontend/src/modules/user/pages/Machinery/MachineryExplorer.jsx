import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FiSearch, FiFilter, FiMapPin, FiTruck, 
  FiClock, FiStar, FiChevronRight, FiMap, FiArrowLeft 
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import { useGeo } from '../../../../context/GeoContext';
import LogoLoader from '../../../../components/common/LogoLoader';
import { themeColors } from '../../../../theme';

const MachineryExplorer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    selectedState, 
    selectedDistrict, 
    selectedSubDistrict, 
    currentCity, 
    loading: geoLoading 
  } = useGeo();

  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState([]);
  const [categories, setCategories] = useState([]);
  const [equipmentImplements, setEquipmentImplements] = useState([]);
  
  // SOP: Initialize from Home navigation state if present
  const [selectedCat, setSelectedCat] = useState(location.state?.category || null);
  const [selectedImplement, setSelectedImplement] = useState(location.state?.preSelectedImplement || null);
  const [search, setSearch] = useState('');

  // Clear implement when category changes, but ONLY if it wasn't just set via navigation state
  useEffect(() => {
    if (location.state?.preSelectedImplement && location.state?.category?.id === selectedCat?.id) {
      // It's from navigation, don't clear
      return;
    }
    setSelectedImplement(null);
  }, [selectedCat]);

  // Auto-scroll selected implement into view
  useEffect(() => {
    if (selectedImplement) {
      setTimeout(() => {
        const selectedBtn = document.getElementById(`implement-btn-${selectedImplement.id || selectedImplement._id}`);
        const container = document.getElementById('implement-scroll-container');
        if (selectedBtn && container) {
          const containerWidth = container.clientWidth;
          const btnLeft = selectedBtn.offsetLeft;
          const btnWidth = selectedBtn.clientWidth;
          const scrollLeft = btnLeft - (containerWidth / 2) + (btnWidth / 2);
          container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
        }
      }, 150); // slight delay to ensure DOM is updated
    }
  }, [selectedImplement, equipmentImplements]);

  useEffect(() => {
    if (geoLoading) return;
    fetchData();
  }, [selectedState, selectedDistrict, selectedSubDistrict, geoLoading, selectedCat, selectedImplement]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const geoParams = {};
      if (selectedState?._id) geoParams.stateId = selectedState._id;
      if (selectedDistrict?._id) geoParams.districtId = selectedDistrict._id;
      if (selectedSubDistrict?._id) geoParams.subDistrictId = selectedSubDistrict._id;
      if (currentCity?._id) geoParams.cityId = currentCity._id;

      const catId = selectedCat?._id || selectedCat?.id;
      
      const promises = [
        publicEquipmentService.getAllEquipment({ 
          ...geoParams,
          categoryId: catId,
          implementId: selectedImplement?._id || selectedImplement?.id
        }),
        publicEquipmentService.getMachineryCategories(geoParams)
      ];

      // Only fetch equipmentImplements if a main category is selected
      if (catId) {
        promises.push(publicEquipmentService.getImplementsForCategory(catId, geoParams));
      }

      const [equipsRes, catsRes, impsRes] = await Promise.all(promises);

      if (equipsRes?.success) setEquipment(equipsRes.data || []);
      if (catsRes?.success) setCategories(catsRes.data || []);
      
      if (impsRes && impsRes.success) {
        setEquipmentImplements(impsRes.data || []);
      } else {
        setEquipmentImplements([]);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const locationDisplayName = selectedSubDistrict?.name 
    ? `${selectedSubDistrict.name}, ${selectedDistrict?.name || ''}`
    : (selectedDistrict?.name || selectedState?.name || currentCity?.name || 'Globally Available');

  const filtered = equipment.filter(e => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const nameMatch = (e.name || '').toLowerCase().includes(searchLower);
    const catMatch = (e.categoryId?.title || '').toLowerCase().includes(searchLower);
    const modelMatch = (e.modelNumber || '').toLowerCase().includes(searchLower);
    const vendorMatch = (e.vendorId?.name || '').toLowerCase().includes(searchLower);
    return nameMatch || catMatch || modelMatch || vendorMatch;
  });

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F8FBFF' }}>
      <Helmet>
        <title>Rent Agriculture Machinery | {locationDisplayName !== 'Globally Available' ? `In ${locationDisplayName}` : 'Agroyilt'}</title>
        <meta name="description" content={`Rent top-quality tractors, harvesters, and tools ${locationDisplayName !== 'Globally Available' ? `in ${locationDisplayName}` : ''}. Verified machinery from professional vendors on Agroyilt.`} />
      </Helmet>
      {/* Header Sticky Container */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-100 px-5 pt-4 pb-4">
        <div className="max-w-xl mx-auto space-y-4">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => navigate(-1)}
                  className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 active:scale-95 transition-all flex-shrink-0"
                >
                  <FiArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl font-black text-slate-800 tracking-tight">Machinery Catalog</h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <FiMapPin className="text-orange-500" /> {locationDisplayName}
                  </p>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                <FiTruck size={20} />
              </div>
           </div>

           {/* Search Box */}
           <div className="relative">
             <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
             <input 
               type="text" 
               placeholder="Search Tractors, Harvesters..."
               className="w-full bg-slate-100 border-none rounded-2xl p-3.5 pl-12 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
               value={search}
               onChange={e => setSearch(e.target.value)}
             />
           </div>

           {/* Horizontal Category Chips */}
           <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
              <button 
                onClick={() => setSelectedCat(null)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
                  ${!selectedCat ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}
              >
                All Machinery
              </button>
              {(() => {
                let displayCategories = categories.slice(0, 10);
                // Ensure selected category is always visible
                if (selectedCat && !displayCategories.find(c => (c.id || c._id) === (selectedCat.id || selectedCat._id))) {
                  displayCategories = [
                    categories.find(c => (c.id || c._id) === (selectedCat.id || selectedCat._id)) || selectedCat,
                    ...categories.slice(0, 9)
                  ];
                }
                return displayCategories.map(cat => (
                  <button 
                    key={cat.id || cat._id}
                    onClick={() => setSelectedCat(cat)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
                      ${(selectedCat?.id || selectedCat?._id) === (cat.id || cat._id) ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}
                  >
                    {cat.title}
                  </button>
                ));
              })()}
              {categories.length > 10 && (
                <button
                  onClick={() => navigate('/user/machinery-categories')}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                >
                  View All Categories
                </button>
              )}
           </div>
           
           {/* Horizontal Implement Filters (Subcategories) */}
           {selectedCat && equipmentImplements.length > 0 && (
             <div id="implement-scroll-container" className="flex gap-2 overflow-x-auto no-scrollbar pt-2 pb-1 border-t border-slate-100/50 mt-2 scroll-smooth">
                <button 
                  onClick={() => setSelectedImplement(null)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
                    ${!selectedImplement ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                >
                  All {selectedCat.title}
                </button>
                {(() => {
                  const displayLimit = 7;
                  const showMore = equipmentImplements.length > displayLimit;
                  const displayedImplements = showMore ? equipmentImplements.slice(0, displayLimit) : equipmentImplements;

                  return (
                    <>
                      {displayedImplements.map(imp => (
                        <button 
                          key={imp.id || imp._id}
                          id={`implement-btn-${imp.id || imp._id}`}
                          onClick={() => setSelectedImplement(imp)}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
                            ${(selectedImplement?.id || selectedImplement?._id) === (imp.id || imp._id) ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                        >
                          {imp.title}
                        </button>
                      ))}
                      {showMore && (
                        <button
                          onClick={() => navigate('/user/machinery-implements', { state: { category: selectedCat } })}
                          className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                        >
                          View All
                        </button>
                      )}
                    </>
                  );
                })()}
             </div>
           )}
        </div>
      </div>

      {loading ? <LogoLoader /> : (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {filtered.length === 0 ? (
            <div className="col-span-full py-20 text-center space-y-4">
               <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto scale-110">
                 <FiTruck className="text-slate-200 text-3xl" />
               </div>
               <div>
                  <p className="text-slate-600 font-black text-lg">
                    {selectedImplement ? `No ${selectedCat?.title} with ${selectedImplement.title} available in your location.` : 
                     selectedCat ? `No ${selectedCat.title} services are currently available in your location.` : 'No machinery available in your location.'}
                  </p>
                  <p className="text-xs text-slate-400 font-medium">Try changing the category or location.</p>
               </div>
            </div>
          ) : (
            filtered.map(item => (
              <motion.div 
                key={item._id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                onClick={() => navigate(`/user/machinery/${item._id}`)}
                className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden group active:scale-95 transition-all cursor-pointer"
              >
                {/* Hero Asset Frame */}
                <div className="h-56 relative bg-slate-50 overflow-hidden">
                   {item.images?.[0] ? (
                     <img 
                       src={item.images[0]} 
                       className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                     />
                   ) : (
                     <div className="w-full h-full flex items-center justify-center bg-slate-100"><FiTruck size={40} className="text-slate-200" /></div>
                   )}
                   
                   {/* Badges */}
                   <div className="absolute top-4 left-4 flex gap-2">
                      <span className="px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-widest text-blue-600 shadow-sm border border-white/20">
                        {item.categoryId?.title}
                      </span>
                   </div>

                   <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                      <div className="bg-white/90 backdrop-blur-md rounded-2xl px-3 py-1.5 shadow-sm border border-white/20">
                         <p className="text-[8px] font-black text-slate-400 uppercase leading-none mb-0.5">Starting at</p>
                         <p className="text-sm font-black text-emerald-600 leading-none">
                            {(() => {
                              if (item.pricing?.hourly?.price) return `₹${item.pricing.hourly.price}/Hr`;
                              if (item.pricing?.land_based?.price) return `₹${item.pricing.land_based.price}/Acre`;
                              if (item.pricing?.daily?.price) return `₹${item.pricing.daily.price}/Day`;
                              return 'Negotiable';
                            })()}
                         </p>
                      </div>
                      <div className="bg-blue-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                         <FiChevronRight />
                      </div>
                   </div>
                </div>

                {/* Content Panel */}
                <div className="p-5">
                   <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-[17px] font-black text-slate-800 leading-tight truncate max-w-[200px]">{item.name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-tight flex items-center gap-1.5">
                           {item.modelNumber} {item.modelNumber && item.year ? '•' : ''} {item.year ? `${item.year} Mfg` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-black text-slate-800 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                         <FiStar className="fill-amber-400 text-amber-400" />
                         <span>{item.vendorId?.rating || 'New'}</span>
                      </div>
                   </div>
                   
                   {/* Vendor Details */}
                   <div className="flex items-center gap-2 mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                     {item.vendorId?.avatar ? (
                       <img src={item.vendorId.avatar} alt={item.vendorId?.name} className="w-8 h-8 rounded-full object-cover" />
                     ) : (
                       <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                         {item.vendorId?.name?.charAt(0) || 'V'}
                       </div>
                     )}
                     <div>
                       <p className="text-xs font-bold text-slate-700">{item.vendorId?.name || 'Agroyilt Partner'}</p>
                       <p className="text-[9px] text-slate-400 font-medium tracking-wide uppercase">Verified Vendor</p>
                     </div>
                   </div>

                   <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 border-t border-slate-50 pt-4">
                      {selectedImplement && (
                        <div className="flex items-center gap-1.5">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                           <span className="text-emerald-600">Has {selectedImplement.title}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                         <FiClock className="text-blue-500" />
                         <span>Fast Booking</span>
                      </div>
                   </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default MachineryExplorer;
