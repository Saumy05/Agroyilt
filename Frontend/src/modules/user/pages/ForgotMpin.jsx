import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiChevronLeft, FiCheckCircle } from 'react-icons/fi';
import { toastManager } from '../../../utils/toastManager';
import { userAuthService } from '../../../services/authService';
import { themeColors } from '../../../theme';
import LogoLoader from '../../../components/common/LogoLoader';

const ForgotMpin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const brandColor = themeColors?.primary || '#426B4F';
  const inputBgColor = themeColors?.inputBg || '#F5F5F5';

  const [step, setStep] = useState(1); // 1: OTP, 2: New MPIN, 3: Confirm MPIN
  const [phoneNumber, setPhoneNumber] = useState(location.state?.phone || '');
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpToken, setOtpToken] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  
  const [mpin, setMpin] = useState(['', '', '', '']);
  const [confirmMpin, setConfirmMpin] = useState(['', '', '', '']);
  
  const [isLoading, setIsLoading] = useState(false);

  const otpRefs = useRef([]);
  const mpinRefs = useRef([]);
  const confirmRefs = useRef([]);

  // Timer countdown
  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Initial OTP send if phone exists
  useEffect(() => {
    if (phoneNumber && step === 1 && !otpToken && !isLoading) {
      handleSendOtp();
    }
  }, []);

  const handleSendOtp = async () => {
    if (!phoneNumber || phoneNumber.length !== 10) {
      toastManager.error('Invalid phone number');
      navigate('/user/login');
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await userAuthService.sendOTP(phoneNumber, null, false, 'forgotMpin');
      if (response.success) {
        setOtpToken(response.token);
        setResendTimer(120);
        toastManager.success(
          <div className="flex items-center gap-2">
            <FiCheckCircle className="text-green-500" />
            <span>OTP sent successfully!</span>
          </div>
        );
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to send OTP');
      if (error.response?.status === 404) {
        navigate('/user/signup', { state: { phone: phoneNumber } });
      } else {
        navigate('/user/login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value && !/^\d+$/.test(value)) return;
    if (value.length > 1) {
      if (index === 0 && value.length === 6) {
        setOtp(value.split(''));
        otpRefs.current[5]?.focus();
      }
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const verifyOtp = async () => {
    const otpValue = otp.join('');
    if (otpValue.length !== 6) return;
    
    setIsLoading(true);
    try {
      const response = await userAuthService.verifyLogin({
        phone: phoneNumber,
        otp: otpValue
      });
      if (response.success) {
        setOtpToken(response.verificationToken);
        setStep(2);
        toastManager.success('OTP verified!');
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Invalid OTP');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (step === 1 && otp.join('').length === 6 && !isLoading) {
      verifyOtp();
    }
  }, [otp]);

  const handleMpinChange = (index, value, isConfirm = false) => {
    if (value && !/^\d+$/.test(value)) return;
    const arr = isConfirm ? confirmMpin : mpin;
    const setArr = isConfirm ? setConfirmMpin : setMpin;
    const refs = isConfirm ? confirmRefs : mpinRefs;

    if (value.length > 1) {
      if (index === 0 && value.length === 4) {
        setArr(value.split(''));
        refs.current[3]?.focus();
      }
      return;
    }
    const newArr = [...arr];
    newArr[index] = value;
    setArr(newArr);
    if (value && index < 3) refs.current[index + 1]?.focus();
  };

  const handleMpinKeyDown = (index, e, isConfirm = false) => {
    const arr = isConfirm ? confirmMpin : mpin;
    const refs = isConfirm ? confirmRefs : mpinRefs;
    if (e.key === 'Backspace' && !arr[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    const mpinVal = mpin.join('');
    const confirmVal = confirmMpin.join('');

    if (mpinVal !== confirmVal) {
      toastManager.error('MPINs do not match');
      setConfirmMpin(['', '', '', '']);
      confirmRefs.current[0]?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const response = await userAuthService.resetMpin({
        verificationToken: otpToken,
        mpin: mpinVal,
        confirmMpin: confirmVal
      });

      if (response.success) {
        toastManager.success('MPIN reset successfully!');
        try {
          const cleanPhone = phoneNumber.replace(/\D/g, '');
          const loginRes = await userAuthService.loginWithMpin({ phone: cleanPhone, mpin: mpinVal });
          if (loginRes.success && loginRes.accessToken) {
            navigate('/user', { replace: true });
            return;
          }
        } catch (e) {
          console.warn('Auto login after reset failed:', e);
        }
        navigate('/user/login');
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to reset MPIN');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pt-12 pb-6 px-6 relative">
      <button 
        onClick={() => navigate(-1)} 
        className="absolute top-6 left-6 p-2 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"
      >
        <FiChevronLeft className="w-6 h-6 text-gray-700" />
      </button>

      <div className="w-full max-w-md mx-auto mt-16">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
            {step === 1 ? 'Verify Phone' : step === 2 ? 'New MPIN' : 'Confirm MPIN'}
          </h1>
          <p className="text-gray-500 font-medium">
            {step === 1 
              ? `Enter the OTP sent to +91 ${phoneNumber}` 
              : 'Create a secure 4-digit MPIN for your account'}
          </p>
        </div>

        {step === 1 ? (
          <form className="space-y-8">
            <div className="flex justify-center gap-2 sm:gap-3 py-4">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (otpRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  className="w-12 h-12 text-center text-xl font-bold rounded-xl focus:ring-0 border-transparent transition-all duration-300"
                  style={{ backgroundColor: inputBgColor, color: brandColor }}
                />
              ))}
            </div>

            <div className="flex justify-center px-2 text-sm font-medium">
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isLoading || resendTimer > 0}
                className="text-[#426B4F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold"
              >
                {resendTimer > 0
                  ? `Resend in ${Math.floor(resendTimer / 60)}:${String(resendTimer % 60).padStart(2, '0')}`
                  : 'Resend OTP'}
              </button>
            </div>
            
            <button
                type="button"
                onClick={verifyOtp}
                disabled={isLoading || otp.join('').length !== 6}
                className="w-full flex justify-center py-4 px-4 rounded-3xl text-sm font-bold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:-translate-y-0.5"
                style={{ backgroundColor: brandColor }}
              >
                {isLoading ? <LogoLoader fullScreen={false} inline={true} size="w-6 h-6" /> : 'Verify OTP'}
            </button>
          </form>
        ) : (
          <form className="space-y-8" onSubmit={step === 2 ? (e) => { e.preventDefault(); setStep(3); } : handleReset}>
            <div className="flex justify-center gap-3 py-4">
              {(step === 2 ? mpin : confirmMpin).map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => ((step === 2 ? mpinRefs : confirmRefs).current[index] = el)}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleMpinChange(index, e.target.value, step === 3)}
                  onKeyDown={(e) => handleMpinKeyDown(index, e, step === 3)}
                  className="w-14 h-14 text-center text-2xl font-bold rounded-xl focus:ring-2 focus:ring-[#426B4F] border-transparent transition-all duration-300 shadow-sm"
                  style={{ backgroundColor: inputBgColor, color: brandColor }}
                />
              ))}
            </div>

            <button
                type="submit"
                disabled={isLoading || (step === 2 ? mpin.join('').length !== 4 : confirmMpin.join('').length !== 4)}
                className="w-full flex justify-center py-4 px-4 rounded-3xl text-sm font-bold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:-translate-y-0.5"
                style={{ backgroundColor: brandColor }}
              >
                {isLoading ? <LogoLoader fullScreen={false} inline={true} size="w-6 h-6" /> : (step === 2 ? 'Next' : 'Reset MPIN')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotMpin;
