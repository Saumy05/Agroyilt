import React, { useState } from 'react';
import { FiX, FiClock, FiCalendar, FiCheck, FiUsers, FiDollarSign, FiInfo } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../../services/api';

/**
 * ExtensionModal
 *
 * Handles Time & Day Extension requests from Farmer for active workers.
 * HOURLY: dynamic extension in minutes.
 * DAILY: additional working days.
 * Workers accept/reject independently. Farmer pays ONLY for accepted workers.
 */
const ExtensionModal = ({ isOpen, onClose, requestId, bookingType = 'HOURLY', workers = [], onExtensionCreated }) => {
  const isDaily = bookingType === 'DAILY';

  // Duration selection
  const [extensionMinutes, setExtensionMinutes] = useState(60);
  const [additionalDays, setAdditionalDays] = useState(1);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState(
    workers.filter(w => !w.isDecreased && w.journeyStatus !== 'CANCELLED' && w.journeyStatus !== 'COMPLETED').map(w => w.workerId)
  );
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const activeEligibleWorkers = workers.filter(
    w => !w.isDecreased && w.journeyStatus !== 'CANCELLED' && w.journeyStatus !== 'COMPLETED'
  );

  const toggleWorker = (workerId) => {
    setSelectedWorkerIds(prev =>
      prev.includes(workerId) ? prev.filter(id => id !== workerId) : [...prev, workerId]
    );
  };

  const selectAll = () => {
    setSelectedWorkerIds(activeEligibleWorkers.map(w => w.workerId));
  };

  // Calculate estimated service cost based on worker's original agreed rate
  const selectedWorkersList = activeEligibleWorkers.filter(w => selectedWorkerIds.includes(w.workerId));
  const estimatedCost = selectedWorkersList.reduce((sum, w) => {
    const rate = Number(w.agreedRate) || 0;
    if (isDaily) {
      return sum + rate * Number(additionalDays);
    } else {
      return sum + Math.round(rate * (Number(extensionMinutes) / 60));
    }
  }, 0);

  const handleRequestExtension = async () => {
    if (selectedWorkerIds.length === 0) {
      toast.error('Please select at least one worker to extend');
      return;
    }

    if (isDaily && (!additionalDays || Number(additionalDays) < 1)) {
      toast.error('Please select at least 1 additional day');
      return;
    }

    if (!isDaily && (!extensionMinutes || Number(extensionMinutes) < 60)) {
      toast.error('Please select at least 1 hour (60 minutes)');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        selectedWorkerIds,
        extensionMinutes: isDaily ? null : Number(extensionMinutes),
        additionalDays: isDaily ? Number(additionalDays) : null
      };

      const res = await api.post(`/users/farmer-worker-request/${requestId}/extension`, payload);
      if (res.data?.success) {
        toast.success(res.data?.message || 'Extension request sent to workers!');
        if (onExtensionCreated) onExtensionCreated(res.data.data);
        onClose();
      } else {
        toast.error(res.data?.message || 'Failed to request extension');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to request extension');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all"
        >
          <FiX size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            {isDaily ? <FiCalendar size={24} /> : <FiClock size={24} />}
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-lg">
              {isDaily ? 'Extend Working Days' : 'Extend Work Time'}
            </h3>
            <p className="text-xs text-slate-500">
              {isDaily ? 'Request additional working days' : 'Add extra hours to current shift'}
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3.5 mb-5 flex gap-2.5 items-start">
          <FiInfo className="text-blue-600 shrink-0 mt-0.5" size={16} />
          <p className="text-xs text-blue-800 leading-relaxed">
            {isDaily
              ? 'Selected workers will evaluate your request for extra days. You will only be billed for workers who explicitly ACCEPT.'
              : 'Workers will receive an instant notification to accept or reject. You will only pay for workers who accept the extension.'}
          </p>
        </div>

        {/* Duration Selection */}
        <div className="mb-5">
          <label className="text-xs font-bold text-slate-700 mb-2 block">
            {isDaily ? 'Additional Days *' : 'Extension Duration *'}
          </label>

          {isDaily ? (
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 5].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setAdditionalDays(d)}
                  className={`py-3 rounded-2xl text-xs font-bold border transition-all ${
                    additionalDays === d
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-black shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  +{d} {d === 1 ? 'Day' : 'Days'}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {[60, 120, 180, 240].map(m => {
                const hrs = m / 60;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setExtensionMinutes(m)}
                    className={`py-3 rounded-2xl text-xs font-bold border transition-all ${
                      extensionMinutes === m
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-black shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    +{hrs} {hrs === 1 ? 'Hour' : 'Hours'}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Worker Selection */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-700">Select Workers to Extend *</label>
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700"
            >
              Select All
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {activeEligibleWorkers.length === 0 ? (
              <p className="text-xs text-slate-400 p-3 bg-slate-50 rounded-2xl text-center">
                No active workers eligible for extension.
              </p>
            ) : (
              activeEligibleWorkers.map(w => {
                const isSelected = selectedWorkerIds.includes(w.workerId);
                const rate = Number(w.agreedRate) || 0;
                const cost = isDaily
                  ? rate * Number(additionalDays)
                  : Math.round(rate * (Number(extensionMinutes) / 60));

                return (
                  <div
                    key={w.workerId}
                    onClick={() => toggleWorker(w.workerId)}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                        isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <FiCheck size={12} className="stroke-[3]" />}
                      </div>
                      <div>
                        <p className="font-bold text-xs text-slate-800">{w.workerName}</p>
                        <p className="text-[10px] text-slate-400">Rate: ₹{rate}/{isDaily ? 'day' : 'hr'}</p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-700">
                      +₹{cost}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Cost Summary */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>Selected Workers:</span>
            <span className="font-bold text-slate-800">{selectedWorkerIds.length} worker(s)</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>Duration:</span>
            <span className="font-bold text-slate-800">
              {isDaily ? `+${additionalDays} day(s)` : `+${extensionMinutes} mins`}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
            <span className="font-black text-sm text-slate-800">Estimated Total Service:</span>
            <span className="font-black text-base text-emerald-600">₹{estimatedCost}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            * Plus platform fee as configured by Admin. Billed upon worker acceptance.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRequestExtension}
            disabled={loading || selectedWorkerIds.length === 0}
            className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <FiCheck size={14} />
                <span>Send Request to Workers</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExtensionModal;
