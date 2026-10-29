import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiLock } from 'react-icons/fi';
import { toastManager } from '../../../utils/toastManager';
// authService exports vendorAuthService, let's import it
import { vendorAuthService } from '../../../services/authService';
import authStorage from '../../../utils/authStorage';
import LogoLoader from '../../../components/common/LogoLoader';

const VendorMpinSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isFirstTime = location.state?.isFirstTime || false;

  // Step 0 asks for the current MPIN (only when one is already set), 1 the new MPIN, 2 the confirmation
  const [needsCurrent, setNeedsCurrent] = useState(
    !isFirstTime && !!authStorage.getUserData('vendor')?.isMpinSet
  );
  const [step, setStep] = useState(needsCurrent ? 0 : 1);
  const [currentMpin, setCurrentMpin] = useState(['', '', '', '']);
  const [mpin, setMpin] = useState(['', '', '', '']);
  const [confirmMpin, setConfirmMpin] = useState(['', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);

  const currentRefs = useRef([]);
  const mpinRefs = useRef([]);
  const confirmRefs = useRef([]);

  useEffect(() => {
    if (isFirstTime) return;
    vendorAuthService.getMpinStatus()
      .then((res) => {
        if (res?.success && res.isMpinSet) {
          setNeedsCurrent(true);
          setStep((prev) => (prev === 1 && mpin.join('') === '' ? 0 : prev));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 0 && currentRefs.current[0]) {
      setTimeout(() => currentRefs.current[0].focus(), 100);
    } else if (step === 1 && mpinRefs.current[0]) {
      setTimeout(() => mpinRefs.current[0].focus(), 100);
    } else if (step === 2 && confirmRefs.current[0]) {
      setTimeout(() => confirmRefs.current[0].focus(), 100);
    }
  }, [step]);

  const fields = {
    current: [currentMpin, setCurrentMpin, currentRefs],
    new: [mpin, setMpin, mpinRefs],
    confirm: [confirmMpin, setConfirmMpin, confirmRefs],
  };
  const kindForStep = ['current', 'new', 'confirm'][step];

  const handleChange = (index, value, kind) => {
    if (value && !/^\d+$/.test(value)) return;

    const [arr, setArr, refs] = fields[kind];
    const newArr = [...arr];

    if (value.length > 1) {
      if (index === 0 && value.length === 4) {
        setArr(value.split(''));
        refs.current[3]?.focus();
      }
      return;
    }

    newArr[index] = value;
    setArr(newArr);
    if (value && index < 3) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e, kind) => {
    if (e.key === 'Backspace') {
      const [arr, , refs] = fields[kind];
      if (!arr[index] && index > 0) {
        refs.current[index - 1]?.focus();
      }
    }
  };

  const handleNext = () => {
    if (step === 0) {
      if (currentMpin.join('').length !== 4) {
        toastManager.error('Please enter your current 4-digit MPIN');
        return;
      }
      setStep(1);
      return;
    }
    if (mpin.join('').length !== 4) {
      toastManager.error('Please enter a 4-digit MPIN');
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const mpinValue = mpin.join('');
    const confirmValue = confirmMpin.join('');

    if (confirmValue.length !== 4) {
      toastManager.error('Please confirm your 4-digit MPIN');
      return;
    }
    if (mpinValue !== confirmValue) {
      toastManager.error('MPINs do not match');
      setConfirmMpin(['', '', '', '']);
      confirmRefs.current[0]?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const response = await vendorAuthService.setMpin({
        mpin: mpinValue,
        confirmMpin: confirmValue,
        ...(needsCurrent && { currentMpin: currentMpin.join('') }),
      });

      if (response.success) {
        toastManager.success('MPIN set successfully!');
        const vendorData = authStorage.getUserData('vendor') || {};
        authStorage.updateUserData('vendor', { isMpinSet: true });
        
        const approvalStatus = location.state?.approvalStatus || vendorData.approvalStatus;

        if (isFirstTime && approvalStatus !== 'approved') {
          toastManager.info('Your account is registered and pending admin approval. You can login with your MPIN once approved.', { duration: 6000 });
          authStorage.clearAuthSession('vendor');
          navigate('/vendor/login', { replace: true });
        } else {
          if (isFirstTime) {
            toastManager.success('Welcome! Your Vendor account is ready.');
          }
          navigate('/vendor', { replace: true });
        }
      }
    } catch (error) {
      setIsLoading(false);
      toastManager.error(error.response?.data?.message || 'Failed to set MPIN');
      if (needsCurrent && error.response?.status === 401) {
        setCurrentMpin(['', '', '', '']);
        setMpin(['', '', '', '']);
        setConfirmMpin(['', '', '', '']);
        setStep(0);
      }
    }
  };

  const brandColor = '#426B4F';

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#DFE8E2] text-[#426B4F] mb-4">
            <FiLock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Vendor MPIN Setup</h2>
          <p className="text-sm text-gray-500 mt-2">
            {needsCurrent ? 'Change your 4-digit MPIN' : 'Create a 4-digit MPIN for faster login in the future'}
          </p>
        </div>

        <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }} className="space-y-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4 text-center">
              {['Enter Current MPIN', 'Enter New MPIN', 'Confirm New MPIN'][step]}
            </label>
            <div className="flex justify-center gap-3">
              {fields[kindForStep][0].map((digit, index) => (
                <input
                  key={`${kindForStep}-${index}`}
                  ref={(el) => (fields[kindForStep][2].current[index] = el)}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value, kindForStep)}
                  onKeyDown={(e) => handleKeyDown(index, e, kindForStep)}
                  className="w-14 h-14 text-center text-2xl font-bold rounded-xl focus:ring-2 border-gray-200 focus:border-transparent transition-all shadow-sm"
                  style={{ '--tw-ring-color': brandColor }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-4 px-4 rounded-xl text-sm font-bold text-white transition-all duration-300 shadow-md hover:-translate-y-0.5"
              style={{ backgroundColor: brandColor }}
            >
              {isLoading ? (
                <LogoLoader fullScreen={false} inline={true} size="w-6 h-6" />
              ) : (
                <span>{step === 2 ? 'Save MPIN' : 'Next'}</span>
              )}
            </button>
            
            {isFirstTime && (
              <button
                type="button"
                onClick={() => {
                  const vendorData = authStorage.getUserData('vendor') || {};
                  const approvalStatus = location.state?.approvalStatus || vendorData.approvalStatus;
                  if (approvalStatus !== 'approved') {
                    toastManager.info('Your registration is complete and pending admin approval.');
                    authStorage.clearAuthSession('vendor');
                    navigate('/vendor/login', { replace: true });
                  } else {
                    navigate('/vendor', { replace: true });
                  }
                }}
                className="w-full py-3 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
              >
                Skip for now
              </button>
            )}
            
            {!isFirstTime && step > (needsCurrent ? 0 : 1) && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="w-full py-3 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
              >
                Back
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default VendorMpinSetup;
