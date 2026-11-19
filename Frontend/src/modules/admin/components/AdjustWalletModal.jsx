import React, { useState, useEffect } from 'react';
import { FiX, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { toastManager } from '../../../utils/toastManager';
import adminWalletService from '../../../services/adminWalletService';

const AdjustWalletModal = ({
  isOpen,
  onClose,
  entity,
  role = 'vendor', // 'vendor' | 'worker' | 'user'
  onSuccess
}) => {
  const [walletTarget, setWalletTarget] = useState('wallet_balance'); // 'wallet_balance' | 'cod_dues'
  const [actionType, setActionType] = useState('credit');             // 'credit' | 'debit'
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setWalletTarget('wallet_balance');
      setActionType('credit');
      setAmount('');
      setReason('');
      setSubmitting(false);
    }
  }, [isOpen, entity]);

  if (!isOpen || !entity) return null;

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const duesLabel = role === 'vendor' ? 'COD Dues' : 'Outstanding Dues';

  const walletBalance = Number(entity.walletBalance ?? 0);
  const credits = Number(entity.credits ?? 0);
  const dues = Number(entity.dues ?? 0);

  const presetAmounts = [100, 200, 500, 1000];

  const handleAddPreset = (preset) => {
    const current = parseFloat(amount) || 0;
    setAmount(String(current + preset));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      toastManager.error('Please enter a valid amount greater than ₹0');
      return;
    }

    if (walletTarget === 'wallet_balance' && actionType === 'debit' && numAmount > walletBalance) {
      const confirmOverdraft = window.confirm(
        `Warning: The debit amount (₹${numAmount.toLocaleString()}) exceeds current wallet balance (₹${walletBalance.toLocaleString()}). Proceed anyway?`
      );
      if (!confirmOverdraft) return;
    }

    try {
      setSubmitting(true);
      const res = await adminWalletService.adjustWallet({
        role,
        targetId: entity._id,
        walletTarget,
        actionType,
        amount: numAmount,
        reason: reason.trim() || undefined,
        allowNegative: true
      });

      if (res.success) {
        toastManager.success(res.message || 'Wallet adjusted successfully');
        if (onSuccess) onSuccess(res.data);
        onClose();
      } else {
        toastManager.error(res.message || 'Failed to adjust wallet');
      }
    } catch (err) {
      console.error('Wallet adjustment error:', err);
      toastManager.error(err.response?.data?.message || 'Failed to adjust wallet');
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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Adjust {roleLabel} Wallet
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {entity.name || 'Vendor'} {entity.phone ? `• ${entity.phone}` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
            {/* 3 Metric Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-center">
                <span className="text-xs font-medium text-emerald-800">Wallet Balance</span>
                <p className="text-base sm:text-lg font-bold text-emerald-600 mt-1">
                  ₹{walletBalance.toFixed(2)}
                </p>
              </div>

              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-center">
                <span className="text-xs font-medium text-indigo-800">Credits</span>
                <p className="text-base sm:text-lg font-bold text-indigo-600 mt-1">
                  {credits.toFixed(2)}
                </p>
              </div>

              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-center">
                <span className="text-xs font-medium text-amber-800">{duesLabel}</span>
                <p className="text-base sm:text-lg font-bold text-amber-600 mt-1">
                  ₹{dues.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Wallet Target */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Wallet Target
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWalletTarget('wallet_balance')}
                  className={`py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all ${
                    walletTarget === 'wallet_balance'
                      ? 'border-red-400 bg-red-50/20 text-gray-900 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Wallet Balance
                </button>
                <button
                  type="button"
                  onClick={() => setWalletTarget('cod_dues')}
                  className={`py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all ${
                    walletTarget === 'cod_dues'
                      ? 'border-red-400 bg-red-50/20 text-gray-900 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {duesLabel}
                </button>
              </div>
            </div>

            {/* Action Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Action Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActionType('credit')}
                  className={`py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                    actionType === 'credit'
                      ? 'border-emerald-500 bg-emerald-50/40 text-emerald-700 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span>+</span> Credit (Add)
                </button>
                <button
                  type="button"
                  onClick={() => setActionType('debit')}
                  className={`py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                    actionType === 'debit'
                      ? 'border-rose-500 bg-rose-50/40 text-rose-700 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span>-</span> Debit (Deduct)
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Amount (₹)
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
                  className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  required
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddPreset(preset)}
                    className="px-3 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 transition-colors"
                  >
                    +₹{preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Reason (optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Incentive bonus, penalty, cash adjustment..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
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
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow-sm flex items-center gap-2 disabled:opacity-60 ${
                  actionType === 'credit'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  actionType === 'credit' ? 'Confirm Credit' : 'Confirm Debit'
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AdjustWalletModal;
