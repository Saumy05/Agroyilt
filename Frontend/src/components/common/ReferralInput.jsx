import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiGift } from 'react-icons/fi';
import referralService from '../../services/referralService';
import useReferralEnabled from '../../hooks/useReferralEnabled';

const ReferralInputField = ({
  referralCode,
  setReferralCode,
  isVerified,
  setIsVerified,
  referrerDetails,
  setReferrerDetails
}) => {
  const [searchParams] = useSearchParams();
  const [hasCode, setHasCode] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Check URL query parameters for ?ref=... or ?referralCode=...
  useEffect(() => {
    const urlRef = searchParams.get('ref') || searchParams.get('referralCode');
    if (urlRef) {
      const cleanRef = urlRef.trim().toUpperCase();
      setHasCode(true);
      setInputCode(cleanRef);
      handleValidate(cleanRef);
    }
  }, [searchParams]);

  // Keep input synchronized if parent sets it
  useEffect(() => {
    if (referralCode && referralCode !== inputCode) {
      setInputCode(referralCode);
      setHasCode(true);
    }
  }, [referralCode]);

  // Debounced auto-validation after user stops typing
  useEffect(() => {
    if (!hasCode || !inputCode.trim() || isVerified) return;
    const clean = inputCode.trim().toUpperCase();
    if (clean.length < 4) return;

    const timer = setTimeout(() => {
      handleValidate(clean);
    }, 600);

    return () => clearTimeout(timer);
  }, [inputCode, hasCode]);

  const handleValidate = async (codeToTest) => {
    const target = (codeToTest || inputCode).trim().toUpperCase();
    if (!target) {
      setErrorMsg('Please enter a referral code');
      return;
    }

    setIsValidating(true);
    setErrorMsg('');

    try {
      const res = await referralService.validateReferralCode(target);
      if (res.success && res.data?.isValid) {
        setIsVerified(true);
        setReferralCode(target);
        if (setReferrerDetails) {
          setReferrerDetails(res.data);
        }
        setErrorMsg('');
      } else {
        setIsVerified(false);
        setReferralCode('');
        setErrorMsg(res.message || 'Invalid referral code');
      }
    } catch (err) {
      setIsVerified(false);
      setReferralCode('');
      setErrorMsg(err.message || 'Invalid referral code');
    } finally {
      setIsValidating(false);
    }
  };

  const handleToggle = (e) => {
    const checked = e.target.checked;
    setHasCode(checked);
    if (!checked) {
      setInputCode('');
      setReferralCode('');
      setIsVerified(false);
      setErrorMsg('');
      if (setReferrerDetails) setReferrerDetails(null);
    }
  };

  return (
    <div className="w-full my-3 p-3 bg-gray-50 rounded-2xl border border-gray-200/80 transition-all">
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          id="referral-checkbox"
          checked={hasCode}
          onChange={handleToggle}
          className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
        />
        <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-gray-800">
          <FiGift className="text-emerald-600 w-4 h-4" />
          <span>Have a Referral Code?</span>
        </div>
      </label>

      {hasCode && (
        <div className="mt-3 pt-3 border-t border-gray-200/70">
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Referral Code
          </label>
          <div className="flex gap-2">
            <input autoComplete="off"
              type="text"
              id="referral-code-input"
              value={inputCode}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setInputCode(val);
                setReferralCode(val.trim());
                setIsVerified(false);
                setErrorMsg('');
              }}
              onBlur={() => {
                if (inputCode.trim().length >= 4 && !isVerified && !isValidating) {
                  handleValidate(inputCode);
                }
              }}
              placeholder="e.g. AGRO7K4P9"
              maxLength={15}
              disabled={isValidating}
              className={`flex-1 px-3 py-2 text-sm uppercase font-mono font-bold tracking-wider rounded-xl border transition-all outline-none ${
                isVerified
                  ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 focus:ring-1 focus:ring-emerald-500'
                  : errorMsg
                  ? 'border-rose-400 bg-rose-50/30 text-rose-900 focus:ring-1 focus:ring-rose-400'
                  : 'border-gray-300 bg-white text-gray-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
              }`}
            />
            <button
              type="button"
              id="referral-apply-btn"
              onClick={() => handleValidate(inputCode)}
              disabled={isValidating || !inputCode.trim() || isVerified}
              className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                isVerified
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {isValidating ? (
                <>
                  <FiLoader className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying</span>
                </>
              ) : isVerified ? (
                <>
                  <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Applied</span>
                </>
              ) : (
                'Apply'
              )}
            </button>
          </div>

          {/* Status feedback */}
          {isVerified && (
            <p className="mt-2 text-xs font-semibold text-emerald-700 flex items-center gap-1.5 animate-fadeIn">
              <FiCheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>
                Code applied! {referrerDetails?.referrerName ? `Shared by ${referrerDetails.referrerName}` : ''}
              </span>
            </p>
          )}

          {errorMsg && (
            <p className="mt-2 text-xs font-semibold text-rose-600 flex items-center gap-1.5 animate-fadeIn">
              <FiAlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// Hidden entirely unless the admin has the referral program on for this role (off by default)
const ReferralInput = ({ role, ...props }) => {
  const { enabled } = useReferralEnabled(role);
  if (!enabled) return null;
  return <ReferralInputField {...props} />;
};

export default ReferralInput;
