import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiTrendingUp, FiTrendingDown, FiShield, FiFileText, FiPhone, FiExternalLink, FiX, FiCheckCircle } from 'react-icons/fi';
import { LuWheat } from 'react-icons/lu';

const mandiPrices = [
  { id: 'wheat', name: 'गेहूं (Wheat)', market: 'करनाल APMC', modalPrice: 2275, change: '+₹25', isUp: true, quality: 'मिल क्वालिटी' },
  { id: 'mustard', name: 'सरसों (Mustard)', market: 'हिसार APMC', modalPrice: 5450, change: '+₹60', isUp: true, quality: '42% तेल' },
  { id: 'paddy', name: 'धान 1121 (Basmati)', market: 'कैथल APMC', modalPrice: 3650, change: '+₹40', isUp: true, quality: 'सुपर' },
  { id: 'soybean', name: 'सोयाबीन (Soybean)', market: 'इंदौर APMC', modalPrice: 4650, change: '-₹15', isUp: false, quality: 'पीला दाना' },
  { id: 'cotton', name: 'कपास / नरमा (Cotton)', market: 'सिरसा APMC', modalPrice: 7100, change: '+₹80', isUp: true, quality: 'मीडियम स्टेपल' },
  { id: 'maize', name: 'मक्का (Maize)', market: 'दाहोद APMC', modalPrice: 2090, change: '+₹20', isUp: true, quality: 'हाइब्रिड' }
];

const govtSchemes = [
  {
    id: 'smam',
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
    id: 'drone',
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
    id: 'pmkisan',
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
    id: 'irrigation',
    title: 'PM कृषि सिंचाई योजना (PMKSY)',
    tag: '55% तक अनुदान',
    category: 'ड्रिप व स्प्रिंकलर',
    summary: 'खेतों में पानी बचाने हेतु ड्रिप एवं मिनी स्प्रिंकलर लगाने पर 45% से 55% का अनुदान।',
    eligibility: 'सिंचाई सुविधा वाले किसान जिनके पास कम से कम 0.5 एकड़ जमीन हो।',
    docs: ['बिजली कनेक्शन / बोरवेल रिकॉर्ड', 'आधार कार्ड', 'जमीन का नक्शा', 'बैंक पासबुक'],
    portalUrl: 'https://pmksy.gov.in',
    portalName: 'pmksy.gov.in'
  }
];

const MandiAndSchemesSection = () => {
  const [activeTab, setActiveTab] = useState('mandi'); // 'mandi' | 'schemes'
  const [selectedScheme, setSelectedScheme] = useState(null);

  return (
    <section id="mandi-schemes-section" className="px-5 py-4 my-2">
      {/* Header with Pill Switcher */}
      <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
        <div>
          <h2 className="text-[17px] sm:text-[19px] font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>किसान सुविधा व भाव</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </h2>
          <p className="text-[11px] font-semibold text-slate-400">
            दैनिक APMC मंडी दरें एवं सरकारी कृषि योजनाएं
          </p>
        </div>

        {/* Tab Toggle Buttons */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setActiveTab('mandi')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'mandi'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            📈 मंडी भाव
          </button>
          <button
            onClick={() => setActiveTab('schemes')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'schemes'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            🏛️ सरकारी योजनाएं
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
                <span className="text-[10px] font-bold text-slate-400">मॉडल भाव:</span>
                <span className="text-[15px] font-black text-emerald-700">
                  ₹{item.modalPrice.toLocaleString()} <span className="text-[9.5px] font-semibold text-slate-400">/क्विं.</span>
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
                  पात्रता एवं दस्तावेज देखें →
                </span>
                <span className="text-[10px] font-semibold text-slate-400">सरकारी पोर्टल</span>
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
              किसान हेल्पलाइन सहायता (Toll-Free)
            </h5>
            <p className="text-[10px] font-semibold text-emerald-800 truncate">
              मशीनरी या मजदूर बुकिंग में सहायता के लिए 1800-180-1551 पर कॉल करें
            </p>
          </div>
        </div>
        <a
          href="tel:18001801551"
          className="shrink-0 text-[11px] font-black bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-xl transition-all shadow-xs"
        >
          कॉल करें
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
                लाभ: {selectedScheme.tag}
              </p>

              <div className="mt-4 space-y-3.5">
                <div>
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    योजना का विवरण
                  </h5>
                  <p className="text-xs font-semibold text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {selectedScheme.summary}
                  </p>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    पात्रता (Eligibility)
                  </h5>
                  <p className="text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {selectedScheme.eligibility}
                  </p>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    आवश्यक दस्तावेज (Required Documents)
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
                  <span>आधिकारिक पोर्टल खोलें</span>
                  <FiExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => setSelectedScheme(null)}
                  className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                >
                  बंद करें
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
