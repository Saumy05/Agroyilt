import React, { useState, useEffect } from 'react';
import { FiX, FiAward } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { toastManager } from '../../../utils/toastManager';
import adminWalletService from '../../../services/adminWalletService';

const AwardIncentiveModal = ({
  isOpen,
  onClose,
  entity,
  role = 'vendor', // 'vendor' | 'worker' | 'user'
  period = 'All Time',
  onSuccess
}) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setReason('');
      setSubmitting(false);
    }
  }, [isOpen, entity]);

  if (!isOpen || !entity) return null;

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const identifier = entity.phone || entity.name || entity._id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      toastManager.error('Please enter a valid incentive amount greater than ₹0');
      return;
    }

    if (!reason.trim()) {
      toastManager.error('Reason / remarks are required');
      return;
    }

    try {
      setSubmitting(true);
      const res = await adminWalletService.awardIncentive({
        role,
        targetId: entity._id,
        amount: numAmount,
        reason: reason.trim(),
        period
      });

      if (res.success) {
        toastManager.success(res.message || 'Incentive awarded successfully');
        if (onSuccess) onSuccess(res.data);
        onClose();
      } else {
        toastManager.error(res.message || 'Failed to award incentive');
      }
    } catch (err) {
      console.error('Award incentive error:', err);
      toastManager.error(err.response?.data?.message || 'Failed to award incentive');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FiAward className="w-5 h-5 text-rose-700" />
                Award Incentive to {roleLabel} {identifier}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Incentive Amount */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Incentive Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500 text-sm font-medium">
                  ₹
                </span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Reason / Remarks */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Reason / Remarks
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Completed 50+ jobs in June with 4.8+ rating"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-colors resize-none"
                required
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-all shadow-sm flex items-center gap-2 disabled:opacity-60"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Credit Incentive'
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AwardIncentiveModal;
