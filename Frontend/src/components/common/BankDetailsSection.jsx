import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiCreditCard, FiEdit2, FiCheck, FiAlertCircle, FiLock, FiX, FiEye, FiEyeOff } from 'react-icons/fi';
import withdrawalService from '../../services/withdrawalService';
import { toastManager } from '../../utils/toastManager';

/**
 * BankDetailsSection
 * Reusable banking details display & management for User, Vendor, and Worker
 * 
 * @param {boolean} isModalMode - If true, displays only the modal form (for withdrawal flow)
 * @param {boolean} isOpen - Modal open state when in modal mode
 * @param {function} onClose - Modal close handler
 * @param {function} onSuccess - Callback when banking details are successfully saved
 */
export const BankDetailsSection = ({
  isModalMode = false,
  isOpen = false,
  onClose = () => {},
  onSuccess = () => {},
  initialData = null,
  showTitle = true,
  onEditClick = null,
  onAddClick = null
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bankDetails, setBankDetails] = useState(initialData || null);
  const [isEditing, setIsEditing] = useState(isModalMode);
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [showConfirmAccountNumber, setShowConfirmAccountNumber] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    accountHolderName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: '',
    bankName: '',
    branchName: '',
    upiId: ''
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (!initialData) {
      loadBankDetails();
    } else {
      setBankDetails(initialData);
    }
  }, [initialData]);

  useEffect(() => {
    if (isModalMode) {
      setIsEditing(isOpen);
      if (isOpen && bankDetails) {
        populateForm(bankDetails);
      }
    }
  }, [isModalMode, isOpen, bankDetails]);

  const loadBankDetails = async () => {
    try {
      setLoading(true);
      const res = await withdrawalService.getBankDetails();
      if (res.success && res.data) {
        setBankDetails(res.data);
      }
    } catch (err) {
      console.error('Error fetching bank details:', err);
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (data) => {
    setFormData({
      accountHolderName: data.accountHolderName || '',
      accountNumber: '', // Keep blank for security re-entry
      confirmAccountNumber: '',
      ifsc: data.ifsc || data.ifscCode || '',
      bankName: data.bankName || '',
      branchName: data.branchName || '',
      upiId: data.upiId || ''
    });
    setFormErrors({});
  };

  const handleEditAction = () => {
    if (onEditClick) {
      onEditClick();
    } else if (!isModalMode && location.pathname.startsWith('/vendor')) {
      navigate('/vendor/bank-details/edit', { state: { from: location.pathname } });
    } else {
      handleStartEdit();
    }
  };

  const handleAddAction = () => {
    if (onAddClick) {
      onAddClick();
    } else if (!isModalMode && location.pathname.startsWith('/vendor')) {
      navigate('/vendor/bank-details/edit', { state: { from: location.pathname } });
    } else {
      setIsEditing(true);
    }
  };

  const handleStartEdit = () => {
    if (bankDetails) {
      populateForm(bankDetails);
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormErrors({});
    if (isModalMode) {
      onClose();
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let formatted = value;
    if (name === 'ifsc') {
      formatted = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    setFormData(prev => ({ ...prev, [name]: formatted }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.accountHolderName.trim()) {
      errors.accountHolderName = 'Account holder name is required';
    }

    if (!formData.accountNumber) {
      errors.accountNumber = 'Account number is required';
    } else if (!/^\d{9,18}$/.test(formData.accountNumber)) {
      errors.accountNumber = 'Valid account number (9 to 18 digits) is required';
    }

    if (formData.accountNumber !== formData.confirmAccountNumber) {
      errors.confirmAccountNumber = 'Account numbers do not match';
    }

    if (!formData.ifsc) {
      errors.ifsc = 'IFSC code is required';
    } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifsc.toUpperCase())) {
      errors.ifsc = 'Invalid IFSC code (e.g. SBIN0001234)';
    }

    if (!formData.bankName.trim()) {
      errors.bankName = 'Bank name is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      const res = await withdrawalService.updateBankDetails({
        accountHolderName: formData.accountHolderName.trim(),
        accountNumber: formData.accountNumber.trim(),
        ifsc: formData.ifsc.trim().toUpperCase(),
        ifscCode: formData.ifsc.trim().toUpperCase(),
        bankName: formData.bankName.trim(),
        branchName: formData.branchName.trim(),
        upiId: formData.upiId.trim()
      });

      if (res.success) {
        toastManager.success('Banking details saved securely!');
        setBankDetails(res.data);
        setIsEditing(false);
        // Clear sensitive plaintext numbers from form state
        setFormData({
          accountHolderName: '',
          accountNumber: '',
          confirmAccountNumber: '',
          ifsc: '',
          bankName: '',
          branchName: '',
          upiId: ''
        });
        onSuccess(res.data);
        if (isModalMode) {
          onClose();
        }
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || err.message || 'Failed to save bank details');
    } finally {
      setSaving(false);
    }
  };

  // Content of Form
  const renderForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
        <FiLock className="w-4 h-4 shrink-0 text-blue-600" />
        <span>Your banking details are encrypted and securely stored for payouts only.</span>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Account Holder Name *
        </label>
        <input
          type="text"
          name="accountHolderName"
          value={formData.accountHolderName}
          onChange={handleChange}
          placeholder="Name as registered with bank"
          className={`w-full p-2.5 bg-gray-50 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-green-500 ${
            formErrors.accountHolderName ? 'border-red-500' : 'border-gray-200'
          }`}
        />
        {formErrors.accountHolderName && (
          <p className="text-[10px] text-red-600 mt-1">{formErrors.accountHolderName}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Bank Account Number *
          </label>
          <div className="relative">
            <input
              type={showAccountNumber ? "text" : "password"}
              name="accountNumber"
              value={formData.accountNumber}
              onChange={handleChange}
              placeholder="Enter account number"
              autoComplete="new-password"
              className={`w-full p-2.5 pr-10 bg-gray-50 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-green-500 font-mono ${
                formErrors.accountNumber ? 'border-red-500' : 'border-gray-200'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowAccountNumber(prev => !prev)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              title={showAccountNumber ? "Hide Account Number" : "Show Account Number"}
            >
              {showAccountNumber ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
            </button>
          </div>
          {formErrors.accountNumber && (
            <p className="text-[10px] text-red-600 mt-1">{formErrors.accountNumber}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Confirm Account Number *
          </label>
          <div className="relative">
            <input
              type={showConfirmAccountNumber ? "text" : "password"}
              name="confirmAccountNumber"
              value={formData.confirmAccountNumber}
              onChange={handleChange}
              placeholder="Re-enter account number"
              className={`w-full p-2.5 pr-10 bg-gray-50 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-green-500 font-mono ${
                formErrors.confirmAccountNumber ? 'border-red-500' : 'border-gray-200'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmAccountNumber(prev => !prev)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              title={showConfirmAccountNumber ? "Hide Account Number" : "Show Account Number"}
            >
              {showConfirmAccountNumber ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
            </button>
          </div>
          {formErrors.confirmAccountNumber && (
            <p className="text-[10px] text-red-600 mt-1">{formErrors.confirmAccountNumber}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            IFSC Code *
          </label>
          <input
            type="text"
            name="ifsc"
            value={formData.ifsc}
            onChange={handleChange}
            maxLength={11}
            placeholder="e.g. SBIN0001234"
            className={`w-full p-2.5 bg-gray-50 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-green-500 uppercase font-mono ${
              formErrors.ifsc ? 'border-red-500' : 'border-gray-200'
            }`}
          />
          {formErrors.ifsc && (
            <p className="text-[10px] text-red-600 mt-1">{formErrors.ifsc}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Bank Name *
          </label>
          <input
            type="text"
            name="bankName"
            value={formData.bankName}
            onChange={handleChange}
            placeholder="e.g. State Bank of India"
            className={`w-full p-2.5 bg-gray-50 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-green-500 ${
              formErrors.bankName ? 'border-red-500' : 'border-gray-200'
            }`}
          />
          {formErrors.bankName && (
            <p className="text-[10px] text-red-600 mt-1">{formErrors.bankName}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Branch Name (Optional)
          </label>
          <input
            type="text"
            name="branchName"
            value={formData.branchName}
            onChange={handleChange}
            placeholder="e.g. Main Branch"
            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            UPI ID / VPA (Optional)
          </label>
          <input
            type="text"
            name="upiId"
            value={formData.upiId}
            onChange={handleChange}
            placeholder="e.g. name@okhdfcbank"
            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-green-500 font-mono"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-3">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl shadow-sm transition-all disabled:opacity-60 flex items-center gap-1.5"
        >
          {saving ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <FiCheck className="w-3.5 h-3.5" />
          )}
          Save Banking Details
        </button>
      </div>
    </form>
  );

  // If in Modal Mode
  if (isModalMode) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl border border-gray-100 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <FiX className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 bg-green-50 text-green-600 rounded-xl">
              <FiCreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {bankDetails?.accountNumberMasked ? 'Update Banking Details' : 'Add Banking Details'}
              </h3>
              <p className="text-xs text-gray-500">Provide bank details where you wish to receive payout</p>
            </div>
          </div>
          {renderForm()}
        </div>
      </div>
    );
  }

  // Normal Card Mode (for Profile / Settings)
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">
      {showTitle && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-50 text-green-600 rounded-xl">
              <FiCreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Banking Details</h3>
              <p className="text-xs text-gray-500">Manage account information for payout withdrawals</p>
            </div>
          </div>

          {!isEditing && bankDetails && bankDetails.accountNumberMasked && (
            <button
              onClick={handleEditAction}
              className="px-3.5 py-1.5 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FiEdit2 className="w-3.5 h-3.5" />
              <span>Edit Details</span>
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-400">Loading banking details...</p>
        </div>
      ) : isEditing ? (
        renderForm()
      ) : bankDetails && bankDetails.accountNumberMasked ? (
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-200/70">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bank Name</span>
              <p className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">{bankDetails.bankName || 'Verified Bank'}</p>
              {bankDetails.branchName && (
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">{bankDetails.branchName}</p>
              )}
            </div>
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Active</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Account Number</span>
              <p className="text-sm font-mono font-bold text-slate-800 mt-0.5">{bankDetails.accountNumberMasked}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Account Holder</span>
              <p className="text-xs sm:text-sm font-bold text-slate-800 uppercase mt-0.5">{bankDetails.accountHolderName}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">IFSC Code</span>
              <p className="text-xs sm:text-sm font-mono font-bold text-slate-800 mt-0.5">{bankDetails.ifsc || bankDetails.ifscCode}</p>
            </div>

            {bankDetails.upiId && (
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">UPI ID / VPA</span>
                <p className="text-xs sm:text-sm font-mono font-bold text-emerald-800 mt-0.5">{bankDetails.upiId}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <FiAlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-gray-700">No Banking Details Added</p>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">
            You must add your bank account details before requesting a withdrawal.
          </p>
          <button
            onClick={handleAddAction}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-green-700 transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FiCreditCard className="w-3.5 h-3.5" />
            <span>Add Banking Details</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default BankDetailsSection;
