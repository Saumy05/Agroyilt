import React, { useState, useEffect } from 'react';
import { FiClock, FiCalendar, FiCheck, FiX, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../services/api';

/**
 * ExtensionResponseCard
 *
 * Rendered on Worker JobDetails / Dashboard when a Farmer requests an extension.
 * Shows extra time/days, extra earnings, and remaining evaluation time.
 * Allows worker to independently Accept or Decline.
 */
// memberId: set when a Team Leader answers for an offline member (no app)
const ExtensionResponseCard = ({ extension, workerId, memberId, onResponded }) => {
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  const isDaily = extension?.bookingType === 'DAILY';

  // Find this worker's entry in the extension
  const myEntry = extension?.workerExtensions?.find(
    w => (w.workerId?._id || w.workerId)?.toString() === workerId?.toString()
  ) || extension;

  const grossAmount = myEntry?.extensionGrossAmount || extension?.grossAmount || 0;
  const netAmount = myEntry?.extensionNetAmount || extension?.netAmount || grossAmount;
  const durationText = isDaily
    ? `${extension?.additionalDays || 1} extra day(s)`
    : `${extension?.extensionMinutes || 30} extra minutes`;

  // Countdown timer
  useEffect(() => {
    if (!extension?.expiresAt) return;

    const updateTimer = () => {
      const diff = new Date(extension.expiresAt) - new Date();
      if (diff <= 0) {
        setTimeLeft('Expired');
        setIsExpired(true);
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m}m ${s < 10 ? '0' : ''}${s}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [extension?.expiresAt]);

  const handleRespond = async (response) => {
    try {
      setLoading(true);
      const res = await api.post(`/workers/assignments/extension/${extension._id || extension.extensionId}/respond`, {
        response,
        ...(memberId ? { memberId } : {})
      });

      if (res.data?.success) {
        toast.success(`Extension ${response === 'accept' ? 'accepted' : 'declined'}`);
        if (onResponded) onResponded(res.data.data);
      } else {
        toast.error(res.data?.message || 'Failed to respond to extension');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to respond to extension');
    } finally {
      setLoading(false);
    }
  };

  if (myEntry?.status && myEntry.status !== 'REQUESTED') {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {myEntry.status === 'ACCEPTED' ? (
            <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">
              <FiCheck size={14} />
            </span>
          ) : (
            <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs">
              <FiX size={14} />
            </span>
          )}
          <div>
            <p className="font-bold text-xs text-slate-800">
              Extension {myEntry.status === 'ACCEPTED' ? 'Accepted' : 'Declined'}
            </p>
            <p className="text-[10px] text-slate-400">{durationText} (+₹{netAmount})</p>
          </div>
        </div>
        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
          myEntry.status === 'ACCEPTED'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-slate-100 border-slate-200 text-slate-600'
        }`}>
          {myEntry.status}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-2 border-emerald-500/30 rounded-3xl p-5 relative overflow-hidden shadow-sm animate-fade-in">
      {/* Top Banner */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            {isDaily ? <FiCalendar size={16} /> : <FiClock size={16} />}
          </div>
          <div>
            <h4 className="font-black text-slate-900 text-sm">
              {isDaily ? 'Work Day Extension' : 'Time Extension Request'}
            </h4>
            <p className="text-[10px] text-emerald-700 font-bold">Farmer requested more work</p>
          </div>
        </div>

        {/* Expiry countdown */}
        <span className={`text-[11px] font-mono font-black px-2.5 py-1 rounded-full border ${
          isExpired
            ? 'bg-red-50 border-red-200 text-red-600'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {timeLeft}
        </span>
      </div>

      {/* Details Box */}
      <div className="bg-white/80 rounded-2xl p-3.5 border border-emerald-100 mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-500">Duration:</span>
          <span className="font-black text-slate-800">{durationText}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Your Extra Earning:</span>
          <span className="font-black text-emerald-600 text-sm">+₹{netAmount}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => handleRespond('reject')}
          disabled={loading || isExpired}
          className="flex-1 py-3 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-2xl border border-slate-200 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
        >
          <FiX size={14} />
          <span>Decline</span>
        </button>

        <button
          type="button"
          onClick={() => handleRespond('accept')}
          disabled={loading || isExpired}
          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <FiCheck size={14} className="stroke-[3]" />
              <span>Accept (+₹{netAmount})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ExtensionResponseCard;
