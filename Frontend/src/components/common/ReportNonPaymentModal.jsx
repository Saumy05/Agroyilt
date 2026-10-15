import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiAlertTriangle, FiX, FiCheckCircle } from 'react-icons/fi';
import { toastManager } from '../../utils/toastManager';
import { paymentDefaultService } from '../../services/paymentDefaultService';

const REASONS = [
  { id: 'FARMER_REFUSES_TO_PAY', label: 'Farmer refuses to pay', hi: 'किसान पैसे देने से मना कर रहा है' },
  { id: 'FARMER_DISPUTES_AMOUNT', label: 'Farmer disputes the amount', hi: 'किसान बिल की रकम पर विवाद कर रहा है' },
  { id: 'FARMER_UNREACHABLE', label: 'Farmer is unreachable', hi: 'किसान से संपर्क नहीं हो रहा' }
];

/**
 * Vendor escape valve: the bill is ready but the farmer will not pay.
 * Opens an urgent support dispute. The farmer can still pay until support decides.
 */
const ReportNonPaymentModal = ({ isOpen, bookingId, amount, onClose, onSubmitted }) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const submit = async () => {
    if (!reason) return toastManager.error('Select why the payment could not be collected');
    try {
      setSubmitting(true);
      await paymentDefaultService.report(bookingId, { reason, notes: notes.trim() });
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => { if (!submitting) onClose(); };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {done ? (
            <div className="text-center space-y-3 py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <FiCheckCircle className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-gray-900">Reported to support</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Support will contact the farmer and decide. If the farmer is found at fault, your earning for this job is paid to your wallet.
                <br />(सपोर्ट किसान से संपर्क करेगा। किसान की गलती होने पर आपकी कमाई वॉलेट में आ जाएगी।)
              </p>
              <button onClick={onClose} className="w-full py-3 rounded-2xl font-black text-white bg-gradient-to-r from-emerald-600 to-teal-700 text-sm">Done</button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between border-b pb-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0"><FiAlertTriangle className="w-5 h-5" /></div>
                  <div>
                    <h3 className="text-base font-black text-gray-900">Farmer is not paying</h3>
                    <p className="text-[11px] text-gray-500">Bill due: ₹{Number(amount || 0).toLocaleString()} (किसान भुगतान नहीं कर रहा)</p>
                  </div>
                </div>
                <button onClick={close} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"><FiX className="w-4 h-4" /></button>
              </div>

              <div className="space-y-2">
                {REASONS.map((r) => (
                  <button key={r.id} type="button" onClick={() => setReason(r.id)}
                    className={`w-full text-left px-3.5 py-3 rounded-xl border-2 transition-all ${reason === r.id ? 'border-red-500 bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <span className={`block text-xs font-black ${reason === r.id ? 'text-red-700' : 'text-gray-800'}`}>{r.label}</span>
                    <span className="block text-[10px] text-gray-500">{r.hi}</span>
                  </button>
                ))}
              </div>

              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2}
                placeholder="Anything support should know? (optional)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />

              <p className="text-[10px] text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-2.5 leading-relaxed">
                Support gets the trip details (distance driven, time, bill) as evidence. The farmer can still pay until support decides.
              </p>

              <button
                onClick={submit} disabled={submitting}
                className="w-full py-3.5 rounded-2xl font-black text-white bg-gradient-to-r from-red-500 to-red-600 text-sm disabled:opacity-50 active:scale-95 transition-all"
              >
                {submitting ? 'Submitting…' : 'Report to Support'}
              </button>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ReportNonPaymentModal;
