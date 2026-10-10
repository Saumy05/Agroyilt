import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCheckCircle,
  FiX,
  FiCheckSquare,
  FiSquare,
  FiAlertTriangle,
  FiShield,
  FiTruck,
  FiFileText,
  FiLoader
} from 'react-icons/fi';
import { toastManager } from '../../utils/toastManager';

const CHECKLIST_ITEMS = [
  { id: 'physical', label: 'Physical Integrity', desc: 'No cracks, dents, bent blades or missing guards' },
  { id: 'cleanliness', label: 'Field Cleanliness', desc: 'Washed and cleared of heavy farm mud & straw' },
  { id: 'mechanics', label: 'Mechanical Function', desc: 'Motor/engine starts and runs smoothly' },
  { id: 'accessories', label: 'Attachments & Accessories', desc: 'All hoses, keys, pins, and attachments accounted for' },
  { id: 'fuel', label: 'Fuel / Battery State', desc: 'Restored to pickup level as per rental agreement' }
];

const ReturnHandoverModal = ({
  isOpen,
  onClose,
  onSubmit,
  onOpenDamageReport,
  equipmentName = 'Machinery Equipment',
  securityDeposit = 0,
  role = 'farmer',
  otherPartyName = 'Vendor'
}) => {
  const [checklist, setChecklist] = useState({
    physical: true,
    cleanliness: true,
    mechanics: true,
    accessories: true,
    fuel: true
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleCheck = (id) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const allChecked = Object.values(checklist).every(Boolean);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      await onSubmit({
        checklist,
        notes: notes.trim(),
        confirmedAt: new Date().toISOString()
      });
      toastManager.success(
        role === 'vendor'
          ? 'Equipment return verified and accepted!'
          : 'Equipment return handover recorded!'
      );
      onClose();
    } catch (err) {
      console.error('Failed to confirm return:', err);
      toastManager.error(err?.response?.data?.message || err?.message || 'Failed to confirm return');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl my-6"
        >
          {/* Header */}
          <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-emerald-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                <FiTruck size={20} />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-base">
                  {role === 'vendor' ? 'Verify Return Handover' : 'Confirm Return Handover'}
                </h3>
                <p className="text-xs text-emerald-800 font-medium">
                  {role === 'vendor'
                    ? `Inspecting returned equipment from farmer`
                    : `Handing back equipment to ${otherPartyName}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
            >
              <FiX size={18} />
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Equipment & Deposit pill */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Rented Item</span>
                <p className="text-sm font-black text-slate-800">{equipmentName}</p>
              </div>
              {securityDeposit > 0 && (
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1 justify-end">
                    <FiShield size={11} /> Security Deposit
                  </span>
                  <p className="text-sm font-black text-emerald-700">₹{securityDeposit.toLocaleString('en-IN')}</p>
                </div>
              )}
            </div>

            {/* Inspection Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <FiCheckSquare className="text-emerald-600" /> Handover Inspection Checklist
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !allChecked;
                    setChecklist({
                      physical: nextVal,
                      cleanliness: nextVal,
                      mechanics: nextVal,
                      accessories: nextVal,
                      fuel: nextVal
                    });
                  }}
                  className="text-[11px] font-bold text-emerald-700 hover:underline"
                >
                  {allChecked ? 'Uncheck All' : 'Check All'}
                </button>
              </div>

              <div className="space-y-2">
                {CHECKLIST_ITEMS.map((item) => {
                  const isChecked = checklist[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleCheck(item.id)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all flex items-start gap-3 ${
                        isChecked
                          ? 'bg-emerald-50/40 border-emerald-300 text-slate-800'
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <div className="mt-0.5 text-emerald-600">
                        {isChecked ? <FiCheckSquare size={18} /> : <FiSquare size={18} className="text-slate-300" />}
                      </div>
                      <div className="flex-1">
                        <p className={`text-xs font-black ${isChecked ? 'text-slate-900' : 'text-slate-600'}`}>
                          {item.label}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Handover Notes */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <FiFileText className="text-emerald-600" /> Handover Notes & Observation (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Returned with full tank diesel at farm gate; checked together with vendor."
                rows={2}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-none"
              />
            </div>

            {/* Damage redirect alert */}
            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3">
              <FiAlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={17} />
              <div className="flex-1 text-xs text-amber-900">
                <p className="font-bold">Noticed cracks, broken parts, or damage?</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Do not confirm clean handover. Raise a damage claim with photo evidence before completing return.
                </p>
                {onOpenDamageReport && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDamageReport();
                    }}
                    className="mt-2 text-xs font-black text-amber-800 underline hover:text-amber-950 inline-flex items-center gap-1"
                  >
                    Open Damage Claim Form →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <FiLoader className="animate-spin" /> Verifying...
                </>
              ) : (
                <>
                  <FiCheckCircle /> {role === 'vendor' ? 'Verify & Accept Return' : 'Confirm Equipment Return'}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ReturnHandoverModal;
