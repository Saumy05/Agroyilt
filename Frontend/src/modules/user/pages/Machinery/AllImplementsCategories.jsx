import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiArrowLeft, FiMapPin, FiLayers } from 'react-icons/fi';
import { Helmet } from 'react-helmet-async';
import { publicEquipmentService } from '../../../../services/publicEquipmentService';
import LogoLoader from '../../../../components/common/LogoLoader';
import CategoryCard from '../../components/common/CategoryCard';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const AllImplementsCategories = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [implementList, setImplementList] = useState([]);
  const [loading, setLoading] = useState(true);

  // The main category passed from the explorer
  const selectedCat = location.state?.category;

  useEffect(() => {
    if (!selectedCat) {
      navigate('/user/machinery-explorer', { replace: true });
      return;
    }

    const fetchImplements = async () => {
      try {
        setLoading(true);
        const res = await publicEquipmentService.getImplementsForCategory(selectedCat.id || selectedCat._id);
        
        if (res && res.success) {
          setImplementList(res.data || []);
        } else {
          setImplementList([]);
        }
      } catch (err) {
        console.error('Failed to load implements:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchImplements();
  }, [selectedCat, navigate]);

  const handleImplementClick = (implement) => {
    // Navigate back to the explorer with BOTH the main category and the selected implement pre-selected
    navigate('/user/machinery-explorer', { 
      state: { 
        category: selectedCat,
        preSelectedImplement: implement
      } 
    });
  };

  if (!selectedCat) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Helmet>
        <title>All {selectedCat.title} Implements | Agroyilt</title>
      </Helmet>
      
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-100 px-5 pt-4 pb-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 active:scale-95 transition-all flex-shrink-0"
          >
            <FiArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">All {selectedCat.title} Implements</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <FiMapPin className="text-orange-500" /> All India
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <LogoLoader />
      ) : (
        <div className="p-5 max-w-xl mx-auto">
          {implementList.length === 0 ? (
            <div className="text-center py-20 space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                <FiLayers className="text-slate-300 text-2xl" />
              </div>
              <p className="text-slate-500 font-medium">No implements available for {selectedCat.title}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-y-7 gap-x-3">
              {implementList.map((imp) => {
                const iconSrc = toAssetUrl(imp.icon || imp.image || imp.homeIconUrl);
                return (
                  <div key={imp.id || imp._id} className="flex justify-center h-full cursor-pointer" onClick={() => handleImplementClick(imp)}>
                    <CategoryCard
                      title={imp.title}
                      icon={
                        iconSrc ? (
                          <img
                            src={iconSrc}
                            alt={imp.title}
                            className="w-full h-full object-cover transition-transform duration-500"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-600 text-lg font-black">
                            {imp.title?.charAt(0) ?.toUpperCase() || '?'}
                          </div>
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AllImplementsCategories;
