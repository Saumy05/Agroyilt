import React, { useState, useEffect } from 'react';
import { FiDollarSign, FiAlertCircle, FiCheck, FiX, FiCreditCard, FiClock, FiLock } from 'react-icons/fi';
import withdrawalService from '../../services/withdrawalService';
import BankDetailsSection from './BankDetailsSection';
import { toastManager } from '../../utils/toastManager';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

/**
 * Universal Withdrawal Request Modal
 * For User (Farmer), Vendor, and Worker (Independent & Team Leader)
 */
export const WithdrawalModal = ({
  isOpen = false,
  onClose = () => {},
  onSuccess = () => {},
  role = 'user',
  workerType = null
}) => {
  useBodyScrollLock(isOpen);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [balanceData, setBalanceData] = useState(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [showBankModal, setShowBankModal] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadBalance();
      setAmount('');
      setNotes('');
      setError('');
      setSuccessResult(null);
    }
  }, [isOpen]);

  const loadBalance = async () => {
    try {
      setLoading(true);
      const res = await withdrawalService.getBalance();
      if (res.success) {
        setBalanceData(res.data);
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to load balance');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableBalance = () => {
    return balanceData?.withdrawableBalance ?? balanceData?.availableBalance ?? balanceData?.balance ?? 0;
  };

  const handleAmountChange = (val) => {
    const clean = val.replace(/[^0-9]/g, '');
    setAmount(clean);
    setError('');

    const num = parseInt(clean, 10);
    if (!clean) return;

    if (balanceData) {
      const available = getAvailableBalance();
      if (num < balanceData.minWithdrawalAmount) {
        setError(`Minimum withdrawal amount is ₹${balanceData.minWithdrawalAmount}. Please enter ₹${balanceData.minWithdrawalAmount} or more to continue.`);
      } else if (num > available) {
        setError(`Your available withdrawal balance is ₹${available}.`);
      }
    }
  };

  const handleSetMax = () => {
    const available = getAvailableBalance();
    if (balanceData && available > 0) {
      setAmount(Math.floor(available).toString());
      if (available < balanceData.minWithdrawalAmount) {
        setError(`Minimum withdrawal amount is ₹${balanceData.minWithdrawalAmount}. Please enter ₹${balanceData.minWithdrawalAmount} or more to continue.`);
      } else {
        setError('');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseInt(amount, 10);

    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return setError('Please enter a valid withdrawal amount');
    }

    if (!balanceData?.hasBankDetails) {
      setShowBankModal(true);
      return;
    }

    if (numAmount < balanceData.minWithdrawalAmount) {
      return setError(`Minimum withdrawal amount is ₹${balanceData.minWithdrawalAmount}. Please enter ₹${balanceData.minWithdrawalAmount} or more to continue.`);
    }

    const available = getAvailableBalance();
    if (numAmount > available) {
      return setError(`Your available withdrawal balance is ₹${available}.`);
    }

    try {
      setSubmitting(true);
      const res = await withdrawalService.requestWithdrawal({
        amount: numAmount,
        notes: notes.trim()
      });

      if (res.success) {
        setSuccessResult(res.data);
        toastManager.success('Withdrawal request submitted successfully');
        onSuccess(res.data);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to submit withdrawal request';
      setError(msg);
      toastManager.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden relative">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-green-50 text-green-700 rounded-xl">
                <FiDollarSign className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Request Withdrawal</h3>
                <p className="text-xs text-gray-500">
                  {role === 'worker'
                    ? (workerType === 'TEAM_LEADER' ? 'Team Leader Payout' : 'Worker Payout')
                    : role === 'vendor'
                    ? 'Owner Earnings Payout'
                    : 'Farmer Wallet Withdrawal'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {loading ? (
              <div className="py-12 text-center">
                <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-gray-400">Loading wallet details...</p>
              </div>
            ) : successResult ? (
              /* Success confirmation view */
              <div className="text-center py-4 space-y-4">
                <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <FiCheck className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-gray-900">Request Submitted</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Your withdrawal request is pending review by admin.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2 text-xs text-left">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Requested Amount</span>
                    <span className="font-bold text-gray-900 text-sm">₹{successResult.amountINR || successResult.amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Request ID</span>
                    <span className="font-mono text-gray-800">{successResult.withdrawalId || successResult._id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                      {successResult.status || 'Pending'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Receiving Account</span>
                    <span className="font-mono text-gray-800">{successResult.bankAccountMasked || '••••'}</span>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400">
                  The amount has been safely reserved from your wallet and will be transferred to your bank account.
                </p>

                <button
                  onClick={onClose}
                  className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-xs shadow-md hover:bg-green-700 transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Request form view */
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Balance Cards Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Available Balance</p>
                    <p className="text-xl font-black text-gray-900 mt-0.5">
                      ₹{getAvailableBalance().toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Minimum Withdrawal</p>
                    <p className="text-xl font-black text-green-700 mt-0.5">
                      ₹{(balanceData?.minWithdrawalAmount || 300).toLocaleString()}
                    </p>
                  </div>
                </div>

                {balanceData?.reservedBalance > 0 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FiClock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      Pending In Review:
                    </span>
                    <span className="font-bold">₹{balanceData.reservedBalance.toLocaleString()}</span>
                  </div>
                )}

                {/* Bank Account Snapshot or Missing Alert */}
                {balanceData?.hasBankDetails ? (
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <FiCreditCard className="w-4 h-4 text-gray-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Payout Destination</p>
                        <p className="font-mono font-bold text-gray-800">
                          {balanceData.bankAccountMasked || balanceData.bankDetails?.accountNumberMasked || '•••• •••• ••••'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBankModal(true)}
                      className="text-xs font-semibold text-green-700 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                      <FiAlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      Please add your banking details before requesting a withdrawal.
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBankModal(true)}
                      className="w-full py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors shadow-sm"
                    >
                      Add Banking Details
                    </button>
                  </div>
                )}

                {/* Amount Input */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-gray-700">Withdrawal Amount</label>
                    <button
                      type="button"
                      onClick={handleSetMax}
                      className="text-[11px] font-bold text-green-700 hover:underline"
                    >
                      Withdraw All
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 font-bold text-gray-400 text-lg">₹</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder={balanceData ? `Min ₹${balanceData.minWithdrawalAmount}` : '0'}
                      className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold text-gray-900 outline-none focus:ring-2 focus:ring-green-500 font-mono"
                    />
                  </div>
                </div>

                {/* Quick Selection Chips */}
                <div className="flex items-center gap-2">
                  {[500, 1000, 2000, 5000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleAmountChange(val.toString())}
                      className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                    >
                      ₹{val}
                    </button>
                  ))}
                </div>

                {/* Optional Note */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Notes (Optional)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Urgent settlement request"
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                    <FiAlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting || !amount || (balanceData && !balanceData.hasBankDetails)}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-xs shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FiLock className="w-4 h-4" />
                    )}
                    Confirm Withdrawal
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Modal for adding/updating banking details */}
      <BankDetailsSection
        isModalMode={true}
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
        onSuccess={() => {
          setShowBankModal(false);
          loadBalance();
        }}
      />
    </>
  );
};

export default WithdrawalModal;
