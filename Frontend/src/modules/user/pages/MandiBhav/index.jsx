import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft,
  FiSearch,
  FiTrendingUp,
  FiTrendingDown,
  FiExternalLink,
  FiCheckCircle,
  FiFileText,
  FiMapPin,
  FiRefreshCw,
  FiInfo,
  FiX,
  FiShare2
} from 'react-icons/fi';
import { LuWheat, LuLandmark, LuClock, LuCalendar } from 'react-icons/lu';
import { themeColors } from '../../../../theme';
import api from '../../../../services/api';

const defaultMandiPrices = [
  { _id: '1', commodity: 'गेहूं (Wheat)', commodityEnglish: 'Wheat', market: 'करनाल APMC', state: 'हरियाणा', modalPrice: 2275, minPrice: 2200, maxPrice: 2320, change: '+₹25', isUp: true, quality: 'मिल क्वालिटी' },
  { _id: '2', commodity: 'सरसों (Mustard)', commodityEnglish: 'Mustard', market: 'हिसार APMC', state: 'हरियाणा', modalPrice: 5450, minPrice: 5300, maxPrice: 5600, change: '+₹60', isUp: true, quality: '42% तेल' },
  { _id: '3', commodity: 'धान 1121 (Basmati)', commodityEnglish: 'Paddy Basmati', market: 'कैथल APMC', state: 'हरियाणा', modalPrice: 3650, minPrice: 3500, maxPrice: 3800, change: '+₹40', isUp: true, quality: 'सुपर' },
  { _id: '4', commodity: 'सोयाबीन (Soybean)', commodityEnglish: 'Soybean', market: 'इंदौर APMC', state: 'मध्य प्रदेश', modalPrice: 4650, minPrice: 4500, maxPrice: 4750, change: '-₹15', isUp: false, quality: 'पीला दाना' },
  { _id: '5', commodity: 'कपास / नरमा (Cotton)', commodityEnglish: 'Cotton', market: 'सिरसा APMC', state: 'हरियाणा', modalPrice: 7100, minPrice: 6900, maxPrice: 7300, change: '+₹80', isUp: true, quality: 'मीडियम स्टेपल' },
  { _id: '6', commodity: 'मक्का (Maize)', commodityEnglish: 'Maize', market: 'दाहोद APMC', state: 'गुजरात', modalPrice: 2090, minPrice: 2000, maxPrice: 2150, change: '+₹20', isUp: true, quality: 'हाइब्रिड' },
  { _id: '7', commodity: 'चना (Gram)', commodityEnglish: 'Gram / Chana', market: 'जयपुर APMC', state: 'राजस्थान', modalPrice: 5850, minPrice: 5700, maxPrice: 6000, change: '+₹50', isUp: true, quality: 'देसी चना' },
  { _id: '8', commodity: 'मूंग (Green Gram)', commodityEnglish: 'Moong', market: 'बीकानेर APMC', state: 'राजस्थान', modalPrice: 7900, minPrice: 7600, maxPrice: 8100, change: '+₹30', isUp: true, quality: 'चमकदार' }
];

const defaultGovtSchemes = [
  {
    _id: '1',
    title: 'SMAM कृषि यंत्रीकरण योजना',
    tag: '40% - 50% सब्सिडी',
    category: 'उपकरण व मशीनरी',
    summary: 'ट्रैक्टर, कटर, रोटावेटर एवं लेजर लेवलर पर 40% से 50% सरकारी अनुदान।',
    eligibility: 'सभी लघु एवं सीमांत किसान, महिला कृषक एवं FPO समूह।',
    docs: ['आधार कार्ड', 'जमीन की फर्द (खसरा/खतौनी)', 'बैंक पासबुक', 'जाति प्रमाण पत्र (यदि लागू हो)'],
    portalUrl: 'https://agrimachinery.nic.in',
    portalName: 'agrimachinery.nic.in'
  },
  {
    _id: '2',
    title: 'किसान ड्रोन सब्सिडी योजना',
    tag: '₹5 लाख तक सहायता',
    category: 'ड्रोन तकनीक',
    summary: 'कृषि में कीटनाशक व नैनो यूरिया छिड़काव हेतु ड्रोन खरीद पर FPO/कस्टम हायरिंग केंद्रों को वित्तीय सहायता।',
    eligibility: 'पंजीकृत FPO, Custom Hiring Centres एवं प्रगतिशील किसान।',
    docs: ['FPO पंजीकरण प्रमाण', 'PAN कार्ड', 'बैंक खाता विवरण', 'ड्रोन पायलट प्रशिक्षण पत्र'],
    portalUrl: 'https://agricoop.nic.in',
    portalName: 'agricoop.nic.in'
  },
  {
    _id: '3',
    title: 'PM-किसान सम्मान निधि',
    tag: '₹6,000 / वर्ष',
    category: 'वित्तीय सहायता',
    summary: 'प्रत्येक 4 माह में ₹2,000 की 3 किस्तों में सीधे बैंक खाते (DBT) में अंतरण।',
    eligibility: 'खेती योग्य भूमि रखने वाले सभी पात्र किसान परिवार।',
    docs: ['आधार कार्ड (e-KYC सत्यापित)', 'बैंक खाता आधार लिंक', 'जमीन का भूलेख रिकॉर्ड'],
    portalUrl: 'https://pmkisan.gov.in',
    portalName: 'pmkisan.gov.in'
  },
  {
    _id: '4',
    title: 'PM कृषि सिंचाई योजना (PMKSY)',
    tag: '55% तक अनुदान',
    category: 'ड्रिप व स्प्रिंकलर',
    summary: 'खेतों में पानी बचाने हेतु ड्रिप एवं मिनी स्प्रिंकलर लगाने पर 45% से 55% का अनुदान।',
    eligibility: 'सिंचाई सुविधा वाले किसान जिनके पास कम से कम 0.5 एकड़ जमीन हो।',
    docs: ['बिजली कनेक्शन / बोरवेल रिकॉर्ड', 'आधार कार्ड', 'जमीन का नक्शा', 'बैंक पासबुक'],
    portalUrl: 'https://pmksy.gov.in',
    portalName: 'pmksy.gov.in'
  },
  {
    _id: '5',
    title: 'प्रधानमंत्री फसल बीमा योजना (PMFBY)',
    tag: 'सुरक्षित फसल गारंटी',
    category: 'फसल बीमा',
    summary: 'प्राकृतिक आपदाओं, कीटों व रोगों से फसल नुकसान होने पर न्यूनतम प्रीमियम पर संपूर्ण क्षतिपूर्ति।',
    eligibility: 'अधिसूचित क्षेत्रों में अधिसूचित फसल उगाने वाले सभी किसान।',
    docs: ['बुवाई प्रमाण पत्र', 'भूमि कब्जा प्रमाण पत्र / LPC', 'आधार कार्ड', 'बैंक पासबुक'],
    portalUrl: 'https://pmfby.gov.in',
    portalName: 'pmfby.gov.in'
  }
];

const MandiBhavPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('mandi'); // 'mandi' | 'schemes'
  const [mandiPrices, setMandiPrices] = useState(defaultMandiPrices);
  const [schemes, setSchemes] = useState(defaultGovtSchemes);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('सभी');
  const [selectedScheme, setSelectedScheme] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/public/kisan-suvidha');
      if (res?.data?.success && res.data.data) {
        if (Array.isArray(res.data.data.mandiPrices) && res.data.data.mandiPrices.length > 0) {
          setMandiPrices(res.data.data.mandiPrices);
        }
        if (Array.isArray(res.data.data.schemes) && res.data.data.schemes.length > 0) {
          setSchemes(res.data.data.schemes);
        }
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.log('Using local fallback for Kisan Suvidha:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Mandi Items
  const filteredMandi = useMemo(() => {
    return mandiPrices.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.commodity?.toLowerCase().includes(q) ||
        item.commodityEnglish?.toLowerCase().includes(q) ||
        item.market?.toLowerCase().includes(q) ||
        item.quality?.toLowerCase().includes(q);

      const matchFilter =
        selectedFilter === 'सभी' ||
        item.market?.includes(selectedFilter) ||
        item.state?.includes(selectedFilter);

      return matchSearch && matchFilter;
    });
  }, [mandiPrices, searchQuery, selectedFilter]);

  // Filter Schemes
  const filteredSchemes = useMemo(() => {
    return schemes.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.title?.toLowerCase().includes(q) ||
        s.summary?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.tag?.toLowerCase().includes(q);

      const matchCategory =
        selectedFilter === 'सभी' || s.category?.includes(selectedFilter);

      return matchSearch && matchCategory;
    });
  }, [schemes, searchQuery, selectedFilter]);

  // Unique filters for Mandi
  const mandiFilterOptions = useMemo(() => {
    const markets = Array.from(new Set(mandiPrices.map(m => m.market?.split(' ')[0]))).filter(Boolean);
    return ['सभी', ...markets.slice(0, 6)];
  }, [mandiPrices]);

  // Unique categories for Schemes
  const schemeFilterOptions = useMemo(() => {
    const cats = Array.from(new Set(schemes.map(s => s.category))).filter(Boolean);
    return ['सभी', ...cats];
  }, [schemes]);

  return (
    <div className="min-h-screen pb-24 relative" style={{ backgroundColor: '#F1F8E9' }}>
      {/* Refined Brand Ambient Mesh Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#2E7D32'}20 0%, transparent 70%),
              radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#81C784'}20 0%, transparent 70%),
              radial-gradient(at 50% 50%, ${themeColors?.brand?.teal || '#2E7D32'}05 0%, transparent 100%),
              #F1F8E9
            `
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(${themeColors?.brand?.teal || '#2E7D32'} 0.8px, transparent 0.8px)`,
            backgroundSize: '28px 28px'
          }}
        />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/90 border-b border-black/[0.04] px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200/80 flex items-center justify-center text-slate-700 active:scale-95 transition-all cursor-pointer"
                aria-label="Back"
              >
                <FiArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-[17px] sm:text-xl font-black text-slate-900 tracking-tight leading-tight flex items-center gap-1.5">
                  <span>किसान सुविधा व भाव</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </h1>
                <p className="text-[10.5px] sm:text-xs font-semibold text-slate-500 leading-tight">
                  दैनिक APMC मंडी दरें एवं सरकारी योजनाएं
                </p>
              </div>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Refresh Data"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">ताज़ा करें</span>
            </button>
          </div>

          {/* Interactive Switcher */}
          <div className="grid grid-cols-2 gap-1.5 mt-3 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setActiveTab('mandi');
                setSelectedFilter('सभी');
              }}
              className={`py-2 rounded-lg text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'mandi'
                  ? 'bg-white text-emerald-900 shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="text-base">📈</span>
              <span>मंडी भाव (Mandi Rates)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('schemes');
                setSelectedFilter('सभी');
              }}
              className={`py-2 rounded-lg text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'schemes'
                  ? 'bg-white text-emerald-900 shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="text-base">🏛️</span>
              <span>सरकारी योजनाएं (Schemes)</span>
            </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="px-4 py-3 space-y-3">
          {/* Search Box */}
          <div className="relative">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'mandi'
                  ? 'फसल या मंडी खोजें (उदा. गेहूं, करनाल APMC)...'
                  : 'योजना या सब्सिडी खोजें (उदा. ट्रैक्टर, ड्रोन, PM किसान)...'
              }
              className="w-full pl-10 pr-4 py-2.5 bg-white/95 border border-slate-200/90 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Chips Bar */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide no-scrollbar">
            {(activeTab === 'mandi' ? mandiFilterOptions : schemeFilterOptions).map((opt) => (
              <button
                key={opt}
                onClick={() => setSelectedFilter(opt)}
                className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  selectedFilter === opt
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-white/90 text-slate-700 border border-slate-200/70 hover:bg-slate-50'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          {/* Tab 1: Mandi Bhav Section */}
          {activeTab === 'mandi' && (
            <motion.div
              key="mandi-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              {/* Govt API Integration Status Bar */}
              <div className="bg-emerald-950/90 text-white rounded-2xl p-3 sm:p-3.5 border border-emerald-700/40 shadow-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                    <LuWheat className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-white leading-tight">
                      लाइव APMC मंडी भाव
                    </h3>
                    <p className="text-[10px] sm:text-[11px] font-medium text-emerald-200/80 leading-tight mt-0.5">
                      भारत सरकार eNAM एवं Agmarknet पोर्टल डेटा संरेखित
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[9.5px] font-bold text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded-full border border-emerald-600/40">
                    प्रति क्विंटल दरें
                  </span>
                </div>
              </div>

              {/* Mandi Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
                {filteredMandi.map((item, idx) => (
                  <motion.div
                    key={item._id || item.id || idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] hover:border-emerald-400 transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Bar: Market & Trend */}
                      <div className="flex items-center justify-between mb-1.5 gap-1">
                        <span className="text-[10.5px] sm:text-xs font-bold text-slate-500 flex items-center gap-1 truncate max-w-[120px]">
                          <FiMapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{item.market}</span>
                        </span>
                        <span
                          className={`text-[9.5px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0 ${
                            item.isUp
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                          }`}
                        >
                          {item.isUp ? (
                            <FiTrendingUp className="w-3 h-3" />
                          ) : (
                            <FiTrendingDown className="w-3 h-3" />
                          )}
                          <span>{item.change}</span>
                        </span>
                      </div>

                      {/* Commodity Title */}
                      <h4 className="text-[13.5px] sm:text-[15px] font-black text-slate-900 leading-snug">
                        {item.commodity}
                      </h4>
                      <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 mt-0.5">
                        {item.quality}
                      </p>
                    </div>

                    {/* Price Block */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10.5px] font-bold text-slate-500">
                          मॉडल भाव:
                        </span>
                        <span className="text-[16px] sm:text-[18px] font-black text-emerald-700 tracking-tight">
                          ₹{Number(item.modalPrice).toLocaleString()}
                          <span className="text-[10px] font-bold text-slate-400 ml-0.5">
                            /{item.priceUnit || 'क्विं.'}
                          </span>
                        </span>
                      </div>

                      {/* Min / Max Range if present */}
                      {(item.minPrice > 0 || item.maxPrice > 0) && (
                        <div className="mt-1 flex items-center justify-between text-[9.5px] text-slate-400 font-medium">
                          <span>न्यूनतम: ₹{Number(item.minPrice).toLocaleString()}</span>
                          <span>अधिकतम: ₹{Number(item.maxPrice).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {filteredMandi.length === 0 && (
                <div className="text-center py-12 bg-white/70 rounded-2xl border border-slate-200">
                  <p className="text-sm font-bold text-slate-700">कोई फसल दर नहीं मिली</p>
                  <p className="text-xs text-slate-400 mt-1">कृपया सर्च या फ़िल्टर बदल कर देखें</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Tab 2: Govt Schemes Section */}
          {activeTab === 'schemes' && (
            <motion.div
              key="schemes-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              {/* Scheme Cards */}
              <div className="space-y-3">
                {filteredSchemes.map((scheme, idx) => (
                  <motion.div
                    key={scheme._id || scheme.id || idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] hover:border-emerald-400 transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                        <span className="text-[10px] sm:text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          {scheme.category}
                        </span>
                        <span className="text-[10.5px] sm:text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          🏷️ {scheme.tag}
                        </span>
                      </div>

                      {/* Scheme Title */}
                      <h3 className="text-sm sm:text-base font-black text-slate-900 leading-snug">
                        {scheme.title}
                      </h3>

                      {/* Summary */}
                      <p className="text-xs font-medium text-slate-600 mt-1.5 leading-relaxed">
                        {scheme.summary}
                      </p>

                      {/* Eligibility Snippet */}
                      {scheme.eligibility && (
                        <div className="mt-2.5 p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-1.5">
                          <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <p className="text-[11px] font-medium text-slate-700 leading-snug">
                            <strong className="text-slate-900 font-bold">पात्रता: </strong>
                            {scheme.eligibility}
                          </p>
                        </div>
                      )}

                      {/* Required Documents Pills */}
                      {Array.isArray(scheme.docs) && scheme.docs.length > 0 && (
                        <div className="mt-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            आवश्यक दस्तावेज:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {scheme.docs.map((d, dIdx) => (
                              <span
                                key={dIdx}
                                className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60"
                              >
                                📄 {d}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedScheme(scheme)}
                        className="text-xs font-bold text-slate-700 hover:text-emerald-700 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <FiInfo className="w-3.5 h-3.5" />
                        <span>पूर्ण विवरण देखें</span>
                      </button>

                      {scheme.portalUrl ? (
                        <a
                          href={scheme.portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <span>आधिकारिक पोर्टल</span>
                          <FiExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[10.5px] font-semibold text-slate-400">
                          पोर्टल लिंक उपलब्ध नहीं
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {filteredSchemes.length === 0 && (
                <div className="text-center py-12 bg-white/70 rounded-2xl border border-slate-200">
                  <p className="text-sm font-bold text-slate-700">कोई सरकारी योजना नहीं मिली</p>
                  <p className="text-xs text-slate-400 mt-1">कृपया सर्च या श्रेणी बदल कर देखें</p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Scheme Detail Modal */}
      <AnimatePresence>
        {selectedScheme && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-100 relative"
            >
              <button
                onClick={() => setSelectedScheme(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                <FiX className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  {selectedScheme.category}
                </span>
                <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                  {selectedScheme.tag}
                </span>
              </div>

              <h2 className="text-lg font-black text-slate-900 leading-snug">
                {selectedScheme.title}
              </h2>

              <p className="text-xs font-medium text-slate-600 mt-2.5 leading-relaxed">
                {selectedScheme.summary}
              </p>

              {selectedScheme.eligibility && (
                <div className="mt-4 p-3 bg-emerald-50/70 rounded-2xl border border-emerald-100">
                  <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5 mb-1">
                    <FiCheckCircle className="text-emerald-700" />
                    <span>पात्रता एवं शर्तें:</span>
                  </h4>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {selectedScheme.eligibility}
                  </p>
                </div>
              )}

              {Array.isArray(selectedScheme.docs) && selectedScheme.docs.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-slate-900 mb-1.5">
                    आवश्यक दस्तावेज सूची:
                  </h4>
                  <ul className="space-y-1">
                    {selectedScheme.docs.map((doc, idx) => (
                      <li key={idx} className="text-xs font-medium text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        <span>{doc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex items-center gap-2">
                {selectedScheme.portalUrl && (
                  <a
                    href={selectedScheme.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                  >
                    <span>पोर्टल पर आवेदन करें ({selectedScheme.portalName || 'Government Portal'})</span>
                    <FiExternalLink />
                  </a>
                )}
                <button
                  onClick={() => setSelectedScheme(null)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  बंद करें
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MandiBhavPage;
