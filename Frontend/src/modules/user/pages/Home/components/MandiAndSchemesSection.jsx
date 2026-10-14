import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiTrendingUp, FiTrendingDown, FiShield, FiFileText, FiPhone, FiExternalLink, FiX, FiCheckCircle, FiChevronRight } from 'react-icons/fi';
import { LuWheat } from 'react-icons/lu';
import api from '../../../../../services/api';

const defaultMandiPrices = [
  { id: 'wheat', name: 'Wheat', market: 'Karnal APMC', modalPrice: 2275, change: '+₹25', isUp: true, quality: 'Mill Quality' },
  { id: 'mustard', name: 'Mustard', market: 'Hisar APMC', modalPrice: 5450, change: '+₹60', isUp: true, quality: '42% Oil' },
  { id: 'paddy', name: 'Paddy 1121 (Basmati)', market: 'Kaithal APMC', modalPrice: 3650, change: '+₹40', isUp: true, quality: 'Super' },
  { id: 'soybean', name: 'Soybean', market: 'Indore APMC', modalPrice: 4650, change: '-₹15', isUp: false, quality: 'Yellow Grain' },
  { id: 'cotton', name: 'Cotton', market: 'Sirsa APMC', modalPrice: 7100, change: '+₹80', isUp: true, quality: 'Medium Staple' },
  { id: 'maize', name: 'Maize', market: 'Dahod APMC', modalPrice: 2090, change: '+₹20', isUp: true, quality: 'Hybrid' }
];

const defaultGovtSchemes = [
  {
    id: 'smam',
    title: 'SMAM Farm Mechanisation Scheme',
    tag: '40% - 50% Subsidy',
    category: 'Equipment & Machinery',
    summary: '40% to 50% government subsidy on tractors, cutters, rotavators and laser levellers.',
    eligibility: 'All small and marginal farmers, women farmers and FPO groups.',
    docs: ['Aadhaar Card', 'Land record (Khasra/Khatauni)', 'Bank Passbook', 'Caste Certificate (if applicable)'],
    portalUrl: 'https://agrimachinery.nic.in',
    portalName: 'agrimachinery.nic.in'
  },
  {
    id: 'drone',
    title: 'Kisan Drone Subsidy Scheme',
    tag: 'Up to ₹5 Lakh Assistance',
    category: 'Drone Technology',
    summary: 'Financial assistance to FPOs and Custom Hiring Centres for buying drones for pesticide and nano urea spraying.',
    eligibility: 'Registered FPOs, Custom Hiring Centres and progressive farmers.',
    docs: ['FPO Registration Proof', 'PAN Card', 'Bank Account Details', 'Drone Pilot Training Certificate'],
    portalUrl: 'https://agricoop.nic.in',
    portalName: 'agricoop.nic.in'
  },
  {
    id: 'pmkisan',
    title: 'PM-Kisan Samman Nidhi',
    tag: '₹6,000 / year',
    category: 'Financial Assistance',
    summary: 'Paid directly to the bank account (DBT) in 3 instalments of ₹2,000, one every 4 months.',
    eligibility: 'All eligible farmer families owning cultivable land.',
    docs: ['Aadhaar Card (e-KYC verified)', 'Bank account linked to Aadhaar', 'Land ownership record'],
    portalUrl: 'https://pmkisan.gov.in',
    portalName: 'pmkisan.gov.in'
  },
  {
    id: 'irrigation',
    title: 'PM Krishi Sinchayee Yojana (PMKSY)',
    tag: 'Up to 55% Subsidy',
    category: 'Drip & Sprinkler',
    summary: '45% to 55% subsidy on installing drip and mini sprinkler systems to save water in the fields.',
    eligibility: 'Farmers with an irrigation source and at least 0.5 acre of land.',
    docs: ['Electricity connection / Borewell record', 'Aadhaar Card', 'Land map', 'Bank Passbook'],
    portalUrl: 'https://pmksy.gov.in',
    portalName: 'pmksy.gov.in'
  }
];

const MandiAndSchemesSection = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('mandi'); // 'mandi' | 'schemes'
  const [selectedScheme, setSelectedScheme] = useState(null);
  const [mandiPrices, setMandiPrices] = useState(defaultMandiPrices);
  const [govtSchemes, setGovtSchemes] = useState(defaultGovtSchemes);

  useEffect(() => {
    const loadDynamicData = async () => {
      try {
        const res = await api.get('/public/kisan-suvidha');
        if (res?.data?.success && res.data.data) {
          if (Array.isArray(res.data.data.mandiPrices) && res.data.data.mandiPrices.length > 0) {
            setMandiPrices(res.data.data.mandiPrices.slice(0, 6).map(m => ({
              id: m._id || m.id,
              name: m.commodity,
              market: m.market,
              modalPrice: m.modalPrice,
              change: m.change,
              isUp: m.isUp,
              quality: m.quality
            })));
          }
          if (Array.isArray(res.data.data.schemes) && res.data.data.schemes.length > 0) {
            setGovtSchemes(res.data.data.schemes.slice(0, 4).map(s => ({
              id: s._id || s.id,
              title: s.title,
              tag: s.tag,
              category: s.category,
              summary: s.summary,
              eligibility: s.eligibility,
              docs: s.docs,
              portalUrl: s.portalUrl,
              portalName: s.portalName
            })));
          }
        }
      } catch (_) {
        // Fallback to default in-memory data
      }
    };
    loadDynamicData();
  }, []);

  return (
    <section id="mandi-schemes-section" className="px-5 py-4 my-2">
      {/* Header with Pill Switcher and See All */}
      <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] sm:text-[19px] font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Farmer Services & Prices</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </h2>
          </div>
          <p className="text-[11px] font-semibold text-slate-400">
            Daily APMC mandi rates & government farm schemes
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Toggle Buttons */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              onClick={() => setActiveTab('mandi')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'mandi'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              📈 Mandi Prices
            </button>
            <button
              onClick={() => setActiveTab('schemes')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'schemes'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              🏛️ Schemes
            </button>
          </div>

          <button
            onClick={() => navigate('/user/mandi-bhav')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 group shrink-0 ml-1 cursor-pointer"
          >
            <span>View All</span>
            <FiChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Tab 1: Mandi Bhav Content */}
      {activeTab === 'mandi' && (
        <motion.div
          key="mandi"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
        >
          {mandiPrices.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-400 truncate max-w-[100px]">
                    {item.market}
                  </span>
                  <span
                    className={`text-[9.5px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${
                      item.isUp ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {item.isUp ? <FiTrendingUp className="w-2.5 h-2.5" /> : <FiTrendingDown className="w-2.5 h-2.5" />}
                    {item.change}
                  </span>
                </div>
                <h4 className="text-[13px] font-black text-slate-800 leading-snug truncate">
                  {item.name}
                </h4>
                <p className="text-[10px] font-semibold text-slate-400">
                  {item.quality}
                </p>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                <span className="text-[10px] font-bold text-slate-400">Modal price:</span>
                <span className="text-[15px] font-black text-emerald-700">
                  ₹{item.modalPrice.toLocaleString()} <span className="text-[9.5px] font-semibold text-slate-400">/qtl</span>
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Tab 2: Govt Schemes Content */}
      {activeTab === 'schemes' && (
        <motion.div
          key="schemes"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {govtSchemes.map((scheme) => (
            <div
              key={scheme.id}
              onClick={() => setSelectedScheme(scheme)}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    {scheme.category}
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {scheme.tag}
                  </span>
                </div>
                <h4 className="text-[13.5px] font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                  {scheme.title}
                </h4>
                <p className="text-[11px] font-semibold text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {scheme.summary}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  View eligibility & documents →
                </span>
                <span className="text-[10px] font-semibold text-slate-400">Govt. portal</span>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* 1-Tap Kisan Support Banner */}
      <div className="mt-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100/60 rounded-2xl p-3 border border-emerald-200/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <FiPhone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h5 className="text-[12px] font-black text-emerald-950 truncate">
              Farmer Helpline (Toll-Free)
            </h5>
            <p className="text-[10px] font-semibold text-emerald-800 truncate">
              Call 1800-180-1551 for help with machinery or labour bookings
            </p>
          </div>
        </div>
        <a
          href="tel:18001801551"
          className="shrink-0 text-[11px] font-black bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-xl transition-all shadow-xs"
        >
          Call Now
        </a>
      </div>

      {/* Scheme Detail Interactive Modal */}
      <AnimatePresence>
        {selectedScheme && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl border border-slate-200 relative max-h-[85vh] overflow-y-auto"
            >
              <button
                onClick={() => setSelectedScheme(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>

              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {selectedScheme.category}
              </span>

              <h3 className="text-lg font-black text-slate-900 mt-2 leading-snug">
                {selectedScheme.title}
              </h3>
              <p className="text-xs font-bold text-emerald-700 mt-0.5">
                Benefit: {selectedScheme.tag}
              </p>

              <div className="mt-4 space-y-3.5">
                <div>
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Scheme Details
                  </h5>
                  <p className="text-xs font-semibold text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {selectedScheme.summary}
                  </p>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Eligibility
                  </h5>
                  <p className="text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {selectedScheme.eligibility}
                  </p>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Required Documents
                  </h5>
                  <ul className="space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {selectedScheme.docs.map((doc, idx) => (
                      <li key={idx} className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{doc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-5 flex gap-2.5">
                <a
                  href={selectedScheme.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all"
                >
                  <span>Open Official Portal</span>
                  <FiExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => setSelectedScheme(null)}
                  className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default MandiAndSchemesSection;
