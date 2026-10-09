import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiSearch, FiTruck, FiChevronRight, FiArrowLeft, FiMapPin } from 'react-icons/fi';
import { Helmet } from 'react-helmet-async';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import { useGeo } from '../../../../context/GeoContext';
import LogoLoader from '../../../../components/common/LogoLoader';

// Rental flow: browse machines -> /user/machinery/:id -> /user/machinery/checkout
// Independent of the service booking flow (/user/machinery-explorer).
const RentalCatalog = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    selectedState,
    selectedDistrict,
    selectedSubDistrict,
    currentCity,
    loading: geoLoading
  } = useGeo();

  const [categories, setCategories] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [activeCat, setActiveCat] = useState(location.state?.category ? { ...location.state.category, _id: location.state.category._id || location.state.category.id } : null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (geoLoading) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        const geo = {};
        const rentalGeo = { mode: 'rental' };
        if (selectedState?._id) geo.stateId = selectedState._id;
        if (selectedDistrict?._id) geo.districtId = selectedDistrict._id;
        if (selectedSubDistrict?._id) geo.subDistrictId = selectedSubDistrict._id;
        if (currentCity?._id) geo.cityId = currentCity._id;

        const [catsRes, equipRes] = await Promise.all([
          publicEquipmentService.getMachineryCategories({ ...geo, ...rentalGeo }),
          publicEquipmentService.getAllEquipment({ ...geo, ...rentalGeo, categoryId: activeCat?._id })
        ]);
        if (catsRes?.success) setCategories(catsRes.data);
        if (equipRes?.success && Array.isArray(equipRes.data)) setEquipment(equipRes.data);
      } catch (err) {
        console.error('Rental catalog fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedState, selectedDistrict, selectedSubDistrict, currentCity, geoLoading, activeCat]);

  const q = search.trim().toLowerCase();
  const filtered = equipment.filter((e) =>
    !q ||
    (e.name || '').toLowerCase().includes(q) ||
    (e.modelNumber || '').toLowerCase().includes(q) ||
    (e.categoryId?.title || '').toLowerCase().includes(q)
  );

  const rateLabel = (p) =>
    p?.hourly?.price ? `₹${p.hourly.price}/Hr` :
    p?.daily?.price ? `₹${p.daily.price}/Day` :
    p?.land_based?.price ? `₹${p.land_based.price}/Acre` : 'Rate On Request';

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <Helmet><title>Rent Machinery | Agroyilt</title></Helmet>

      <div className="sticky top-0 z-20 bg-white border-b border-slate-100">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center"
          >
            <FiArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-sm font-black text-slate-900">Rental Services</h1>
            <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <FiMapPin size={10} className="text-emerald-600" />
              {selectedState?.name || 'Your area'} · Rent a machine directly
            </p>
          </div>
        </div>

        <div className="max-w-xl mx-auto px-4 pb-3 space-y-2.5">
          <div className="relative">
            <FiSearch className="absolute left-3.5 top-3 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search machines, models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-bold focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[{ _id: null, title: 'All' }, ...categories].map((c) => (
              <button
                key={c._id || 'all'}
                onClick={() => setActiveCat(c._id ? c : null)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-black border transition-colors ${
                  (activeCat?._id || null) === c._id
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-4">
        {loading ? (
          <div className="py-20 text-center"><LogoLoader /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 text-center space-y-2">
            <FiTruck size={30} className="text-slate-300 mx-auto" />
            <p className="text-xs font-black text-slate-800">No machines available for rent here yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((item) => (
              <div
                key={item._id}
                onClick={() => navigate(`/user/machinery/${item._id}`)}
                className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="h-36 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                  {item.images?.[0] ? (
                    <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <FiTruck size={30} className="text-slate-300" />
                  )}
                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-white/95 rounded-full text-[8.5px] font-black uppercase text-emerald-800">
                    {item.categoryId?.title || 'Machinery'}
                  </span>
                  {item.horsepower && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/80 rounded-full text-[8.5px] font-black text-white">
                      {item.horsepower} HP
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-xs font-black text-slate-900 truncate">{item.name}</h3>
                  <p className="text-[9.5px] font-bold text-slate-400">{item.modelNumber || 'Verified Farm Equipment'}</p>
                  <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[8.5px] font-bold text-slate-400 uppercase">Rent from</p>
                      <p className="text-xs font-black text-emerald-700">{rateLabel(item.pricing)}</p>
                    </div>
                    <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <FiChevronRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RentalCatalog;
