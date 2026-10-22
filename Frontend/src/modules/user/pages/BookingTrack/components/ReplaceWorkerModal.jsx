import React, { useState } from 'react';
import { FiX, FiRepeat } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../../services/api';

const localDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * ReplaceWorkerModal
 *
 * A DAILY booking needs a different worker from tomorrow. It uses the two existing farmer actions, in the safe order:
 *  1. ask for a new worker from tomorrow for the remaining days (nothing is assigned or paid until a worker accepts and the farmer pays)
 *  2. stop the current worker after today (settled for the days worked, unused days refunded)
 * If step 1 fails nothing changes. If step 2 fails the farmer keeps both and can use "Stop after today".
 */
const ReplaceWorkerModal = ({ isOpen, onClose, worker, requestId, remainingDays = 1, onDone }) => {
  const [rate, setRate] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !worker) return null;

  const days = Math.max(1, Number(remainingDays) || 1);
  const dayRate = Number(rate) || Number(worker.agreedRate) || 0;

  const handleConfirm = async () => {
    if (!(dayRate > 0)) {
      toast.error('Enter the daily rate for the new worker');
      return;
    }
    setLoading(true);
    try {
      const added = await api.post(`/users/farmer-worker-request/${requestId}/add-workers`, {
        additionalWorkersCount: 1,
        startDate: localDate(1),
        numberOfDays: days,
        offeredRate: dayRate
      });
      if (!added.data?.success) {
        toast.error(added.data?.message || 'Could not request a new worker');
        return;
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not request a new worker');
      setLoading(false);
      return;
    }

    try {
      const stopped = await api.post(`/users/farmer-worker-request/${requestId}/decrease-worker`, {
        assignmentId: worker.assignmentId,
        reason: 'Replaced by the farmer'
      });
      if (!stopped.data?.success) throw new Error(stopped.data?.message || 'failed');
      toast.success(`A new worker is being requested from tomorrow. ${worker.workerName} stops after today.`);
    } catch (err) {
      toast.error(`New worker requested, but ${worker.workerName} could not be stopped: ${err.response?.data?.message || err.message}. Use "Stop after today" on them.`, { duration: 7000 });
    } finally {
      setLoading(false);
      if (onDone) onDone();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
        <button onClick={onClose} disabled={loading}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all">
          <FiX size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center"><FiRepeat size={22} /></div>
          <div>
            <h3 className="font-black text-slate-900 text-lg">Replace worker from tomorrow</h3>
            <p className="text-xs text-slate-500">{worker.workerName} → a new worker</p>
          </div>
        </div>

        <ul className="text-xs text-slate-700 space-y-1.5 mb-4 list-disc pl-4 leading-relaxed">
          <li>{worker.workerName} finishes today and is paid for the days worked. Unused days are refunded to you.</li>
          <li>A new worker is requested from tomorrow for {days} day{days > 1 ? 's' : ''}.</li>
          <li>You choose the new worker and pay once someone accepts. Nothing is charged for them before that.</li>
        </ul>

        <label className="text-xs font-bold text-slate-600 mb-1 block">Daily rate for the new worker (₹)</label>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder={String(worker.agreedRate || '')}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 mb-5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} disabled={loading} className="py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold">Cancel</button>
          <button onClick={handleConfirm} disabled={loading}
            className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-50">
            {loading ? 'Working…' : 'Replace'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReplaceWorkerModal;
