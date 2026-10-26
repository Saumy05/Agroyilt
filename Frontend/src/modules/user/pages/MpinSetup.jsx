import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiLock, FiCheckCircle, FiArrowRight } from 'react-icons/fi';
import { toastManager } from '../../../utils/toastManager';
import { userAuthService } from '../../../services/authService';
import LogoLoader from '../../../components/common/LogoLoader';
import authStorage from '../../../utils/authStorage';

const MpinSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isFirstTime = location.state?.isFirstTime || false;

  const [step, setStep] = useState(1); // 1: Enter MPIN, 2: Confirm MPIN
  const [mpin, setMpin] = useState(['', '', '', '']);
  const [confirmMpin, setConfirmMpin] = useState(['', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);

  const mpinRefs = useRef([]);
  const confirmRefs = useRef([]);

  useEffect(() => {
    if (step === 1 && mpinRefs.current[0]) {
      setTimeout(() => mpinRefs.current[0].focus(), 100);
    } else if (step === 2 && confirmRefs.current[0]) {
      setTimeout(() => confirmRefs.current[0].focus(), 100);
    }
  }, [step]);

  const handleChange = (index, value, isConfirm) => {
    if (value && !/^\d+$/.test(value)) return;
    
    const newArr = isConfirm ? [...confirmMpin] : [...mpin];
    
    if (value.length > 1) {
      if (index === 0 && value.length === 4) {
        if (isConfirm) {
          setConfirmMpin(value.split(''));
          confirmRefs.current[3]?.focus();
        } else {
          setMpin(value.split(''));
          mpinRefs.current[3]?.focus();
        }
      }
      return;
    }

    newArr[index] = value;
    
    if (isConfirm) {
      setConfirmMpin(newArr);
      if (value && index < 3) confirmRefs.current[index + 1]?.focus();
    } else {
      setMpin(newArr);
      if (value && index < 3) mpinRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e, isConfirm) => {
    if (e.key === 'Backspace') {
      const arr = isConfirm ? confirmMpin : mpin;
      const refs = isConfirm ? confirmRefs : mpinRefs;
      
      if (!arr[index] && index > 0) {
        refs.current[index - 1]?.focus();
      }
    }
  };

  const handleNext = () => {
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
      const response = await userAuthService.setMpin({
        mpin: mpinValue,
        confirmMpin: confirmValue,
        // currentMpin would be needed if we were changing it, but here it's setup
      });

      if (response.success) {
        toastManager.success('MPIN set successfully!');
        const userData = authStorage.getUserData('user') || {};
        authStorage.updateUserData('user', { isMpinSet: true });
        
        const approvalStatus = location.state?.approvalStatus || userData.approvalStatus;

        if (isFirstTime) {
          // sign in again with the MPIN: that is where approval and the registration fee are checked
          toastManager.info(
            approvalStatus === 'approved'
              ? 'Your Farmer account is ready. Login with your MPIN to continue.'
              : 'Your Farmer account is registered and pending admin approval. You can login with your MPIN once approved.',
            { duration: 6000 }
          );
          authStorage.clearAuthSession('user');
          navigate('/app/login', { replace: true });
        } else {
          navigate('/user', { replace: true });
        }
      }
    } catch (error) {
      setIsLoading(false);
      toastManager.error(error.response?.data?.message || 'Failed to set MPIN');
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
          <h2 className="text-2xl font-bold text-gray-900">Set up MPIN</h2>
          <p className="text-sm text-gray-500 mt-2">
            Create a 4-digit MPIN for faster login in the future
          </p>
        </div>

        <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }} className="space-y-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4 text-center">
              {step === 1 ? 'Enter New MPIN' : 'Confirm MPIN'}
            </label>
            <div className="flex justify-center gap-3">
              {(step === 1 ? mpin : confirmMpin).map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => step === 1 ? (mpinRefs.current[index] = el) : (confirmRefs.current[index] = el)}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value, step === 2)}
                  onKeyDown={(e) => handleKeyDown(index, e, step === 2)}
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
                <span>{step === 1 ? 'Next' : 'Save MPIN'}</span>
              )}
            </button>
            
            {isFirstTime && (
              <button
                type="button"
                onClick={() => navigate('/user', { replace: true })}
                className="w-full py-3 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
              >
                Skip for now
              </button>
            )}
            
            {!isFirstTime && step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
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

export default MpinSetup;
