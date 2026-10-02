import React, { useState } from 'react';
import {
  FiX, FiUsers, FiCalendar, FiClock, FiDollarSign,
  FiPlus, FiMinus, FiCheckCircle, FiShield, FiAlertCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../../services/api';

/**
 * AddWorkersModal
 *
 * Allows the farmer to dynamically request additional/extra workers
 * for today or upcoming days on an active booking.
 */
const AddWorkersModal = ({
  isOpen,
  onClose,
  requestId,
  bookingType = 'DAILY',
  defaultRate = 500,
  remainingDays = 1,
  onWorkersAdded
}) => {
  const isDaily = bookingType === 'DAILY';

  const [workersCount, setWorkersCount] = useState(1);
  const [daysCount, setDaysCount] = useState(Math.max(1, remainingDays));
  const [startTiming, setStartTiming] = useState('tomorrow'); // 'today' | 'tomorrow'
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'online'
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const rate = Number(defaultRate) || 500;
  const subtotal = isDaily ? rate * daysCount * workersCount : rate * workersCount;
  const platformFee = Math.round(subtotal * 0.1);
  const totalPayable = subtotal + platformFee;

  const handleConfirm = async () => {
    try {
      setLoading(true);

      const targetStartDate = new Date();
      if (startTiming === 'tomorrow') {
        targetStartDate.setDate(targetStartDate.getDate() + 1);
      }

      const payload = {
        additionalWorkersCount: workersCount,
        startDate: targetStartDate.toISOString().split('T')[0],
        numberOfDays: isDaily ? daysCount : 1,
        paymentMethod,
        offeredRate: rate,
        reason: 'Farmer requested additional manpower'
      };

      const res = await api.post(`/users/farmer-worker-request/${requestId}/add-workers`, payload);

      if (res.data?.success) {
        toast.success(res.data?.message || 'Additional workers requested successfully!');
        if (onWorkersAdded) onWorkersAdded(res.data.data);
        onClose();
      } else {
        toast.error(res.data?.message || 'Failed to request additional workers');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to request additional workers');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
              <FiUsers size={20} />
            </span>
            <div>
              <h3 className="font-black text-slate-900 text-base">Add Extra Workers</h3>
              <p className="text-xs text-slate-500">Need more hands to finish work faster?</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-all"
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="space-y-5">
          {/* Worker Counter */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-700 block">How many extra workers?</span>
              <span className="text-[11px] text-slate-400">Additional helpers</span>
            </div>
            <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
              <button
                type="button"
                onClick={() => setWorkersCount(c => Math.max(1, c - 1))}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-90 transition-all"
              >
                <FiMinus size={13} />
              </button>
              <span className="font-black text-base text-slate-800 w-5 text-center">{workersCount}</span>
              <button
                type="button"
                onClick={() => setWorkersCount(c => Math.min(10, c + 1))}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-90 transition-all"
              >
                <FiPlus size={13} />
              </button>
            </div>
          </div>

          {/* Start Timing */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">When are they needed?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStartTiming('today')}
                className={`py-3 px-3 rounded-2xl border text-xs font-bold transition-all text-center flex flex-col items-center gap-1 ${
                  startTiming === 'today'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>⚡ Today (Immediate)</span>
                <span className="text-[10px] font-normal text-slate-400">Join today's shift</span>
              </button>

              <button
                type="button"
                onClick={() => setStartTiming('tomorrow')}
                className={`py-3 px-3 rounded-2xl border text-xs font-bold transition-all text-center flex flex-col items-center gap-1 ${
                  startTiming === 'tomorrow'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>🌅 Tomorrow</span>
                <span className="text-[10px] font-normal text-slate-400">Start next morning</span>
              </button>
            </div>
          </div>

          {/* Number of Days (Daily only) */}
          {isDaily && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 block">For how many days?</span>
                <span className="text-[11px] text-slate-400">Working duration</span>
              </div>
              <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                <button
                  type="button"
                  onClick={() => setDaysCount(d => Math.max(1, d - 1))}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-90 transition-all"
                >
                  <FiMinus size={13} />
                </button>
                <span className="font-black text-base text-slate-800 w-5 text-center">{daysCount}</span>
                <button
                  type="button"
                  onClick={() => setDaysCount(d => d + 1)}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-90 transition-all"
                >
                  <FiPlus size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">Payment Option</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
                  paymentMethod === 'cash'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FiShield size={14} />
                <span>Cash on Farm</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('online')}
                className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
                  paymentMethod === 'online'
                    ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FiCheckCircle size={14} />
                <span>Online Escrow</span>
              </button>
            </div>
          </div>

          {/* Pricing Summary Breakdown */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Rate per Worker</span>
              <span className="font-bold text-slate-800">₹{rate} / {isDaily ? 'day' : 'shift'}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Manpower Subtotal ({workersCount} {workersCount === 1 ? 'worker' : 'workers'} × {isDaily ? `${daysCount}d` : '1 shift'})</span>
              <span className="font-bold text-slate-800">₹{subtotal}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Platform Service Fee (10%)</span>
              <span className="font-bold text-slate-800">₹{platformFee}</span>
            </div>
            <div className="border-t border-amber-200 pt-2 flex items-center justify-between">
              <span className="text-xs font-black text-slate-900">Total Additional Cost</span>
              <span className="text-base font-black text-amber-950">₹{totalPayable}</span>
            </div>
            {paymentMethod === 'cash' ? (
              <p className="text-[11px] text-emerald-800 font-medium pt-1">
                ✓ No advance needed. Pay physical cash to workers upon day completion.
              </p>
            ) : (
              <p className="text-[11px] text-blue-800 font-medium pt-1">
                ✓ Held in AgroYilt Escrow. Unused reserve refunded if work ends early.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black text-xs shadow-md shadow-amber-600/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <FiUsers size={14} />
                  <span>Request +{workersCount} Workers</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddWorkersModal;
