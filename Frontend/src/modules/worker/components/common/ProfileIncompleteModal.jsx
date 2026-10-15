import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiAlertTriangle,
  FiCheck,
  FiX,
  FiArrowRight,
  FiTool,
  FiMapPin,
  FiDollarSign
} from 'react-icons/fi';

const ProfileIncompleteModal = ({
  isOpen,
  onClose,
  completion,
  title = "Complete Your Profile to Go Online",
  description = "Farmers need to know your work skills, location, and rates to send you job requests. Complete these details to start receiving work."
}) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const items = [
    {
      id: 'skills',
      label: 'Work Skills',
      hint: 'Add skills like Harvesting, Sowing, etc.',
      icon: FiTool,
      completed: completion?.hasSkills,
    },
    {
      id: 'address',
      label: 'Work Location / City',
      hint: 'Required for nearby farm distance matching',
      icon: FiMapPin,
      completed: completion?.hasAddress,
    },
    {
      id: 'rates',
      label: 'Wage Rates',
      hint: 'Set your daily or hourly expected wage',
      icon: FiDollarSign,
      completed: completion?.hasRates,
    },
  ];

  const handleGoToEdit = () => {
    onClose?.();
    navigate('/worker/profile/edit');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-100 overflow-hidden relative"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-all"
            aria-label="Close"
          >
            <FiX size={16} />
          </button>

          {/* Icon + Title */}
          <div className="flex items-start gap-3.5 mb-4 pr-6">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
              <FiAlertTriangle size={22} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full inline-block mb-1">
                Profile Incomplete
              </span>
              <h3 className="text-base font-extrabold text-slate-800 leading-snug">
                {title}
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed mb-4">
            {description}
          </p>

          {/* Checklist */}
          <div className="space-y-2 mb-5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                    item.completed
                      ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900'
                      : 'bg-amber-50/50 border-amber-200/70 text-slate-800'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      item.completed
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'bg-amber-200/80 text-amber-800'
                    }`}
                  >
                    {item.completed ? <FiCheck size={14} /> : <Icon size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold leading-tight">
                      {item.label}
                    </p>
                    <p className={`text-[10px] truncate ${item.completed ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {item.completed ? 'Configured' : item.hint}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                      item.completed
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.completed ? 'Ready' : 'Needed'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoToEdit}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span>Complete Profile Now</span>
              <FiArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 text-slate-500 hover:text-slate-700 font-semibold text-xs active:scale-95 transition-all"
            >
              Stay Offline for Now
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ProfileIncompleteModal;
