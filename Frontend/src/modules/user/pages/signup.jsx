import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { FiUser, FiMail, FiPhone, FiArrowRight, FiChevronLeft, FiCheckCircle, FiX } from 'react-icons/fi';
import { toastManager } from '../../../utils/toastManager';
import { themeColors } from '../../../theme';
import { userAuthService } from '../../../services/authService';
import Logo from '../../../components/common/Logo';
import LogoLoader from '../../../components/common/LogoLoader';
import API from '../../../services/api';
import ReferralInput from '../../../components/common/ReferralInput';

import { z } from "zod";

// Zod schema
const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").regex(/^[a-zA-Z\s]+$/, "Name can only contain letters"),
  email: z.string().optional().refine(val => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), "Invalid email address"),
  phoneNumber: z.string().regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian phone number"),
});

const Signup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState('details'); // 'details' or 'otp'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    gender: ''
  });
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpToken, setOtpToken] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [errors, setErrors] = useState({});
  const [referralCode, setReferralCode] = useState('');
  const [isReferralVerified, setIsReferralVerified] = useState(false);

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyContent, setPolicyContent] = useState('');
  const [policyTitle, setPolicyTitle] = useState('');

  const handleOpenPolicy = async (type, title) => {
    setPolicyTitle(title);
    setShowPolicyModal(true);
    setPolicyContent('Loading...');
    try {
      const res = await API.get(`/content/policy/user/${type}`);
      if (res.data.success && res.data.data) {
        setPolicyContent(res.data.data.content || 'No content available.');
      } else {
        setPolicyContent('No content available.');
      }
    } catch (e) {
      setPolicyContent('Failed to load policy content.');
    }
  };


  // Timer countdown effect
  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Refs for auto-focus
  const nameInputRef = useRef(null);
  const otpInputRefs = useRef([]);
  const isSubmittingRef = useRef(false);

  // Pre-fill from navigation state
  useEffect(() => {
    if (location.state?.phone) {
      setFormData(prev => ({ ...prev, phoneNumber: location.state.phone }));
    }
    if (location.state?.verificationToken) {
      setVerificationToken(location.state.verificationToken);
    }
  }, [location.state]);

  // Auto-focus logic
  useEffect(() => {
    if (step === 'details' && nameInputRef.current) {
      setTimeout(() => nameInputRef.current.focus(), 100);
    } else if (step === 'otp' && otpInputRefs.current[0]) {
      setTimeout(() => otpInputRefs.current[0].focus(), 100);
    }
  }, [step]);

  const validateEmail = (email) => {
    if (!email) return "";
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|org|in|net|co)$/i;
    if (!emailRegex.test(email)) {
      return "Please enter a valid email address";
    }
    return "";
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Live Restriction for Name: Only allow alphabets and spaces
    if (name === 'name') {
      const filteredValue = value.replace(/[^A-Za-z\s]/g, '');
      setFormData(prev => ({ ...prev, [name]: filteredValue }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'email') {
      setErrors(prev => ({ ...prev, email: validateEmail(value) }));
    }
  };

  const handleDetailsSubmit = async (e) => {
    e.preventDefault();

    // Zod Validation
    const validationResult = signupSchema.safeParse(formData);

    if (!validationResult.success) {
      const issues = validationResult.error?.issues || [];
      issues.forEach(err => toastManager.error(err.message));
      return;
    }

    setIsLoading(true);

    if (verificationToken) {
      try {
        const response = await userAuthService.register({
          name: formData.name,
          email: formData.email || null,
          verificationToken,
          referralCode: referralCode || undefined
        });
        if (response.success) {
          try {
            const { registerFCMToken } = await import('../../../services/pushNotificationService');
            await registerFCMToken('user', true);
          } catch (e) { console.error(e); }

          toastManager.success(
            <div className="flex flex-col">
              <span className="font-bold">Successfully Registered!</span>
              <span className="text-xs">Welcome to Agroyilt.</span>
            </div>,
            { icon: <FiCheckCircle className="text-green-500" /> }
          );
          navigate('/user/settings/mpin-setup', { state: { isFirstTime: true } });
        } else {
          toastManager.error(response.message || 'Registration failed');
        }
      } catch (error) {
        const errorMsg = error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || error.message || 'Registration failed';
        toastManager.error(errorMsg);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const response = await userAuthService.sendOTP(formData.phoneNumber, formData.email || null);
      if (response.success) {
        setOtpToken(response.token);
        setIsLoading(false);
        setStep('otp');
        setResendTimer(120); // Start timer
        toastManager.success('OTP sent successfully');
      } else {
        setIsLoading(false);
        toastManager.error(response.message || 'Failed to send OTP');
      }
    } catch (error) {
      setIsLoading(false);
      toastManager.error(error.response?.data?.message || 'Failed to send OTP. Please try again.');
    }
  };

  const handleOtpChange = (index, value) => {
    // Allow only numbers
    if (value && !/^\d+$/.test(value)) return;

    // Handle paste of full OTP
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6);
      if (digits.length === 6) {
        const chars = digits.split('');
        setOtp(chars);
        otpInputRefs.current[5]?.focus();
        return;
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Auto-verify as last digit enters
  useEffect(() => {
    const otpValue = otp.join('');
    if (otpValue.length === 6 && !isLoading && !isSubmittingRef.current && otpToken) {
      handleOtpSubmit();
    }
  }, [otp]);

  const handleOtpSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isLoading || isSubmittingRef.current) return; // Prevent double submission
    
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      toastManager.error('Please enter complete OTP');
      return;
    }
    isSubmittingRef.current = true;
    setIsLoading(true);
    try {
      const response = await userAuthService.register({
        name: formData.name,
        email: formData.email || null,
        phone: formData.phoneNumber,
        gender: formData.gender || undefined,
        otp: otpValue,
        token: otpToken,
        referralCode: referralCode || undefined
      });
      if (response.success) {
        try {
          const { registerFCMToken } = await import('../../../services/pushNotificationService');
          await registerFCMToken('user', true);
        } catch (fcmError) {
          console.error('FCM Registration failed on signup:', fcmError);
        }

        toastManager.success(
          <div className="flex flex-col">
            <span className="font-bold">Successfully Registered!</span>
            <span className="text-xs">Your farmer account is pending admin approval.</span>
          </div>,
          { icon: <FiCheckCircle className="text-green-500" /> }
        );
        navigate('/user/settings/mpin-setup', { 
          state: { 
            isFirstTime: true, 
            approvalStatus: response.user?.approvalStatus || 'pending' 
          } 
        });
      } else {
        toastManager.error(response.message || 'Registration failed');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || error.message || 'Registration failed';
      toastManager.error(errorMsg);
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // Dark Green Theme Colors from Mockup
  const brandColor = '#426B4F'; // Solid dark green for buttons and text
  const inputBgColor = '#DFE8E2'; // Light green for inputs

  return (
    <div
      className="min-h-[100dvh] flex flex-col relative overflow-x-hidden bg-white justify-center items-center"
    >
      {/* Top Background with Wave */}
      <div
        className="absolute top-0 left-0 w-full h-[25vh] bg-cover bg-center z-0 sm:hidden"
        style={{ backgroundImage: "url('/auth-bg.jpg')", filter: 'brightness(0.95)' }}
      >
        <svg className="absolute bottom-0 w-full text-white" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '50px', transform: 'translateY(1px)' }}>
          <path fill="currentColor" fillOpacity="1" d="M0,224L80₹97.3C160₹71,320₹17,480₹22.7C640₹28,800₹92,960,208C1120,224₹280₹92₹360₹76L1440₹60L1440,320L1360,320C1280,320₹120,320,960,320C800,320,640,320,480,320C320,320₹60,320,80,320L0,320Z"></path>
        </svg>
      </div>

      <div className="bg-transparent px-8 py-4 w-full z-20 sm:max-w-md sm:mx-auto relative flex flex-col justify-center pb-10 sm:pb-0">
        <div className="mb-8 text-center relative z-10 flex flex-col items-center">
          {/* Back button */}
          <button onClick={() => navigate(-1)} className="absolute left-0 top-0 sm:hidden w-8 h-8 rounded-full bg-white/30 backdrop-blur-sm text-[#426B4F] flex items-center justify-center -translate-y-24">
            <FiChevronLeft className="w-5 h-5 text-white" />
          </button>

          <div className="relative inline-block mb-2">
            {step === 'details' ? (
              <Logo className="h-16 w-auto" />
            ) : (
              <h2 className="text-[32px] font-bold tracking-tight mb-2" style={{ color: brandColor }}>
                Verify Phone
              </h2>
            )}
          </div>
          <p className="text-sm font-medium text-gray-500">
            {step === 'details' ? 'Create your new account' : `Code sent to ${formData.phoneNumber}`}
          </p>
        </div>

        {step === 'details' ? (
          <form onSubmit={handleDetailsSubmit} className="space-y-5">
            {verificationToken && (
              <button
                type="button"
                onClick={() => navigate('/user/login')}
                className="flex items-center text-sm text-gray-400 hover:text-[#426B4F] transition-colors mb-4"
              >
                <FiChevronLeft className="mr-1" /> Back to Login
              </button>
            )}

            <div>
              <div
                className="relative flex items-center rounded-xl overflow-hidden px-4 py-1 border border-transparent focus-within:border-[#426B4F]/30 transition-colors"
                style={{ backgroundColor: inputBgColor }}
              >
                <div className="flex items-center text-[#426B4F] mr-3">
                  <FiUser className="h-5 w-5" />
                </div>
                <input
                  ref={nameInputRef}
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="block w-full py-4 bg-transparent border-none focus:ring-0 text-[#426B4F] font-bold placeholder-[#426B4F]/60 sm:text-sm"
                  placeholder="Full Name"
                />
              </div>
            </div>

            <div>
              <div
                className={`relative flex items-center rounded-xl overflow-hidden px-4 py-1 border transition-colors ${
                  errors.email ? 'border-red-500' : 'border-transparent focus-within:border-[#426B4F]/30'
                }`}
                style={{ backgroundColor: inputBgColor }}
              >
                <div className="flex items-center text-[#426B4F] mr-3">
                  <FiMail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`block w-full py-4 bg-transparent border-none focus:ring-0 font-bold placeholder-[#426B4F]/60 sm:text-sm ${
                    errors.email ? 'text-red-500' : 'text-[#426B4F]'
                  }`}
                  placeholder="farmer@agri.com"
                />
                {(formData.email && !errors.email) && (
                  <FiCheckCircle className="text-green-500 absolute right-4 h-5 w-5" />
                )}
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-500 font-medium px-2">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#426B4F] uppercase tracking-wider mb-1.5 ml-1">
                Gender (Optional)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['male', 'female', 'other'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, gender: prev.gender === g ? '' : g }))}
                    className={`py-3 px-3 rounded-xl text-xs font-bold capitalize transition-all border ${
                      formData.gender === g
                        ? 'bg-[#426B4F] text-white border-[#426B4F] shadow-sm'
                        : 'bg-white text-[#426B4F] border-[#426B4F]/20 hover:bg-[#426B4F]/5'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {!verificationToken && (
              <div>
                <div
                  className="relative flex items-center rounded-xl overflow-hidden px-4 py-1 border border-transparent focus-within:border-[#426B4F]/30 transition-colors"
                  style={{ backgroundColor: inputBgColor }}
                >
                  <div className="flex items-center text-[#426B4F] mr-3">
                    <FiPhone className="h-5 w-5" />
                    <span className="font-semibold ml-2 border-r border-[#426B4F]/20 pr-3">+91</span>
                  </div>
                  <input
                    id="phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    required
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    className="block w-full py-4 bg-transparent border-none focus:ring-0 text-[#426B4F] font-bold placeholder-[#426B4F]/60 sm:text-sm"
                    placeholder="Phone Number"
                  />
                </div>
              </div>
            )}

            <ReferralInput
              referralCode={referralCode}
              setReferralCode={setReferralCode}
              isVerified={isReferralVerified}
              setIsVerified={setIsReferralVerified}
            />

              <div className="flex items-start bg-gray-50 p-3 rounded-xl border border-gray-100 mt-2 mb-4">
                <input
                  type="checkbox"
                  id="user-terms"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 text-[#426B4F] focus:ring-[#426B4F] border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="user-terms" className="ml-3 block text-sm text-gray-700">
                  I agree to the{' '}
                  <button type="button" onClick={() => handleOpenPolicy('terms', 'Terms and Conditions')} className="text-[#426B4F] hover:underline font-bold">Terms and Conditions</button>
                  {' '}and{' '}
                  <button type="button" onClick={() => handleOpenPolicy('privacy', 'Privacy Policy')} className="text-[#426B4F] hover:underline font-bold">Privacy Policy</button>.
                </label>
              </div>

            <div>
              <button
                type="submit"
                disabled={isLoading || !acceptedTerms}
                className="w-full flex justify-center py-4 px-4 rounded-3xl text-sm font-bold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                style={{ backgroundColor: brandColor, boxShadow: '0 4px 14px 0 rgba(66, 107, 79, 0.39)' }}
              >
                {isLoading ? (
                  <LogoLoader fullScreen={false} inline={true} size="w-6 h-6" />
                ) : (
                  <span>{verificationToken ? 'Register' : 'Send OTP'}</span>
                )}
              </button>
            </div>



            <div className="mt-8 text-center text-sm">
              <span className="text-gray-400 font-medium">Already have an account? </span>
              <Link to="/user/login" className="text-[#426B4F] font-bold hover:underline">
                Log in
              </Link>
            </div>
          </form>
        ) : (
          <form className="space-y-8" onSubmit={handleOtpSubmit}>
            <div className="flex justify-center gap-2 sm:gap-3 py-4">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (otpInputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  className="w-12 h-12 text-center text-xl font-bold rounded-xl focus:ring-0 border-transparent transition-all duration-300"
                  style={{ backgroundColor: inputBgColor, color: brandColor }}
                />
              ))}
            </div>

            <div className="flex items-center justify-between px-2 text-sm font-medium">
              <button
                type="button"
                onClick={() => setStep('details')}
                className="flex items-center text-gray-400 hover:text-[#426B4F] transition-colors"
              >
                <FiChevronLeft className="mr-1" /> Change Number
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (resendTimer > 0) return;
                  try {
                    const response = await userAuthService.sendOTP(formData.phoneNumber, formData.email || null);
                    if (response.success) {
                      setOtpToken(response.token);
                      setResendTimer(120);
                      toastManager.success('New code sent!');
                    }
                  } catch (error) {
                    toastManager.error('Failed to resend code');
                  }
                }}
                disabled={resendTimer > 0}
                className="text-[#426B4F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold"
              >
                {resendTimer > 0
                  ? `Resend in ${Math.floor(resendTimer / 60)}:${String(resendTimer % 60).padStart(2, '0')}`
                  : 'Resend code'}
              </button>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading || otp.join('').length !== 6}
                className="w-full flex justify-center py-4 px-4 rounded-3xl text-sm font-bold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:-translate-y-0.5"
                style={{ backgroundColor: brandColor }}
              >
                {isLoading ? (
                  <LogoLoader fullScreen={false} inline={true} size="w-6 h-6" />
                ) : (
                  <span>Verify</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
      {showPolicyModal && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-fade-in m-auto relative">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-xl font-bold text-gray-900">{policyTitle}</h3>
              <button type="button" onClick={() => setShowPolicyModal(false)} className="text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-2 transition-colors">
                <FiX size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 whitespace-pre-wrap text-sm text-gray-700">
              {policyContent}
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button type="button" onClick={() => setShowPolicyModal(false)} className="px-6 py-2 bg-[#426B4F] text-white rounded-lg font-bold hover:bg-[#34533e] transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div >
  );
};

export default Signup;
