import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FiArrowLeft, FiPlus, FiList, FiSearch, FiUsers } from 'react-icons/fi';
import { motion } from 'framer-motion';

const WorkerExplorer = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Helmet>
        <title>Hire Workers | Agroyilt</title>
        <meta
          name="description"
          content="Post a work requirement and let AgroYilt automatically find the right farm workers near your location."
        />
      </Helmet>

      {/* Header */}
      <div className="bg-white sticky top-0 z-40 border-b border-slate-100 px-5 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/user')}
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 active:scale-95 transition-all"
          >
            <FiArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800">Hire Workers</h1>
            <p className="text-xs text-slate-500 font-medium">Smart auto-matching for your farm</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-5 space-y-5 mt-2">

        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-gradient-to-br from-green-600 via-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-lg shadow-emerald-200"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <FiSearch size={22} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-white/70 mb-1">
                Smart Matching
              </p>
              <h2 className="text-2xl font-black leading-tight mb-2">
                Create a Work Request
              </h2>
              <p className="text-sm text-white/85 leading-relaxed">
                Describe your requirement and the system will automatically find
                suitable workers near your work location.
              </p>
            </div>
          </div>
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm"
        >
          <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide mb-4">How it works</h3>
          <div className="space-y-3">
            {[
              { step: '1', text: 'Fill your work requirement form', color: 'bg-green-100 text-green-700' },
              { step: '2', text: 'System matches skilled workers near you', color: 'bg-blue-100 text-blue-700' },
              { step: '3', text: 'Workers accept — you confirm the booking', color: 'bg-emerald-100 text-emerald-700' },
            ].map(item => (
              <div key={item.step} className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${item.color}`}>
                  {item.step}
                </span>
                <p className="text-sm text-slate-600 font-medium">{item.text}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Primary CTA */}
        <motion.button
          id="new-worker-request-btn"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          onClick={() => navigate('/user/worker-request/new')}
          whileTap={{ scale: 0.97 }}
          className="w-full bg-gradient-to-r from-emerald-600 to-green-600 text-white py-4 rounded-3xl font-black text-base shadow-lg shadow-emerald-200/60 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
        >
          <FiPlus size={20} />
          New Request
        </motion.button>

        {/* Secondary CTA */}
        <motion.button
          id="my-worker-requests-btn"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          onClick={() => navigate('/user/my-bookings')}
          whileTap={{ scale: 0.97 }}
          className="w-full bg-white border-2 border-slate-200 text-slate-700 py-4 rounded-3xl font-black text-base flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
        >
          <FiList size={20} />
          My Requests & Bookings
        </motion.button>

        {/* Info note */}
        <p className="text-xs text-slate-400 text-center px-4 leading-relaxed">
          The system automatically finds workers with the right skills within the configured search radius. You don't need to browse or select workers manually.
        </p>
      </div>
    </div>
  );
};

export default WorkerExplorer;
