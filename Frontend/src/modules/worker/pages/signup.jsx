import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { FiUser, FiMail, FiPhone, FiFileText, FiUpload, FiCamera, FiX, FiArrowRight, FiChevronLeft, FiCheckCircle } from 'react-icons/fi';
import { toastManager } from '../../../utils/toastManager';
import { themeColors } from '../../../theme';
import { workerAuthService } from '../../../services/authService';
import Logo from '../../../components/common/Logo';
import ReferralInput from '../../../components/common/ReferralInput';

import { z } from "zod";

// Zod schema for Worker Signup
const workerSignupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").regex(/^[a-zA-Z\s]+$/, "Name can only contain letters"),
  email: z.string().email("Please enter a valid email address"),
  phoneNumber: z.string().regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian phone number"),
  aadhar: z.string().regex(/^\d{12}$/, "Aadhar number must be exactly 12 digits"),
  hasBike: z.boolean().optional(),
  drivingLicenseNumber: z.string().optional()
});

const WorkerSignup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState('details'); // 'details' or 'otp'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    gender: 'male',
    aadhar: '',
    aadharDocument: null,
    aadharBackDocument: null,
    hasBike: false,
    drivingLicenseNumber: '',
    drivingLicenseDocument: null
  });
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpToken, setOtpToken] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documentPreview, setDocumentPreview] = useState({});
  const [resendTimer, setResendTimer] = useState(0);
  const [errors, setErrors] = useState({});
  const [referralCode, setReferralCode] = useState('');
  const [isReferralVerified, setIsReferralVerified] = useState(false);


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

  // Pre-fill from navigation state (Unified Flow)
  useEffect(() => {
    if (location.state?.phone && location.state?.verificationToken) {
      setFormData(prev => ({ ...prev, phoneNumber: location.state.phone }));
      setVerificationToken(location.state.verificationToken);
    }
  }, [location.state]);

  // Clear any existing worker tokens on page load
  useEffect(() => {
    localStorage.removeItem('workerAccessToken');
    localStorage.removeItem('workerRefreshToken');
    localStorage.removeItem('workerData');
  }, []);

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
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'email') {
      setErrors(prev => ({ ...prev, email: validateEmail(value) }));
    } else if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const handleDocumentUpload = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toastManager.error('Please upload a valid image or PDF');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toastManager.error('File size should be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      let fieldName = 'aadharDocument';
      if (type === 'aadharBack') fieldName = 'aadharBackDocument';
      if (type === 'drivingLicense') fieldName = 'drivingLicenseDocument';

      setFormData(prev => ({
        ...prev,
        [fieldName]: file
      }));
      setDocumentPreview(prev => ({
        ...prev,
        [type]: reader.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeDocument = (type) => {
    let fieldName = 'aadharDocument';
    if (type === 'aadharBack') fieldName = 'aadharBackDocument';
    if (type === 'drivingLicense') fieldName = 'drivingLicenseDocument';

    setFormData(prev => ({
      ...prev,
      [fieldName]: null
    }));
    setDocumentPreview(prev => ({
      ...prev,
      [type]: null
    }));
  };

  const handleDetailsSubmit = async (e) => {
    e.preventDefault();

    // Zod Validation
    const validationResult = workerSignupSchema.safeParse({
      name: formData.name,
      email: formData.email,
      phoneNumber: formData.phoneNumber,
      aadhar: formData.aadhar,
      hasBike: formData.hasBike,
      drivingLicenseNumber: formData.drivingLicenseNumber
    });

    if (!validationResult.success) {
      const issues = validationResult.error?.issues || [];
      issues.forEach(err => toastManager.error(err.message));
      return;
    }

    // Manual Document Check
    if (!formData.aadharDocument && !documentPreview.aadhar) {
      toastManager.error('Please upload Aadhar Front document');
      return;
    }
    if (!formData.aadharBackDocument && !documentPreview.aadharBack) {
      toastManager.error('Please upload Aadhar Back document');
      return;
    }

    setIsLoading(true);

    if (verificationToken) {
      try {
        const aadharDoc = documentPreview.aadhar || null;
        const aadharBackDoc = documentPreview.aadharBack || null;
        const dlDoc = documentPreview.drivingLicense || null;
        const registerData = {
          name: formData.name,
          email: formData.email,
          phone: formData.phoneNumber,
          aadhar: formData.aadhar,
          aadharDocument: aadharDoc,
          aadharBackDocument: aadharBackDoc,
          hasBike: Boolean(formData.hasBike),
          drivingLicenseNumber: formData.hasBike ? formData.drivingLicenseNumber : undefined,
          drivingLicenseDocument: formData.hasBike ? dlDoc : undefined,
          verificationToken,
          workerType: new URLSearchParams(location.search).get('type') || 'WORKER',
          referralCode: referralCode || undefined
        };

        const response = await workerAuthService.register(registerData);
        if (response.success) {
          toastManager.success('Registration details saved! Please set your MPIN to complete your profile.');
          navigate('/worker/settings/mpin-setup', {
            state: {
              isFirstTime: true,
              phone: formData.phoneNumber,
              approvalStatus: response.worker?.approvalStatus || 'pending'
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
      }
      return;
    }

    try {
      const response = await workerAuthService.sendOTP(formData.phoneNumber, formData.email);
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
      toastManager.error(error.response?.data?.message || 'Failed to send OTP');
    }
  };

  const handleOtpChange = (index, value) => {
    const cleanValue = value.replace(/\D/g, '').slice(0, 1);
    const newOtp = [...otp];
    newOtp[index] = cleanValue;
    setOtp(newOtp);

    if (cleanValue && index < 5) {
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
      const aadharDoc = documentPreview.aadhar || null;
      const aadharBackDoc = documentPreview.aadharBack || null;
      const dlDoc = documentPreview.drivingLicense || null;
      const registerData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phoneNumber,
        gender: formData.gender || 'male',
        aadhar: formData.aadhar,
        aadharDocument: aadharDoc,
        aadharBackDocument: aadharBackDoc,
        hasBike: Boolean(formData.hasBike),
        drivingLicenseNumber: formData.hasBike ? formData.drivingLicenseNumber : undefined,
        drivingLicenseDocument: formData.hasBike ? dlDoc : undefined,
        otp: otpValue,
        token: otpToken,
        workerType: new URLSearchParams(location.search).get('type') || 'WORKER',
        referralCode: referralCode || undefined
      };

      const response = await workerAuthService.register(registerData);
      if (response.success) {
        toastManager.success('Registration details saved! Please set your MPIN to complete your profile.');
        navigate('/worker/settings/mpin-setup', {
          state: {
            isFirstTime: true,
            phone: formData.phoneNumber,
            approvalStatus: response.worker?.approvalStatus || 'pending'
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

  const brandColor = themeColors.brand?.teal || '#347989';

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col justify-start sm:justify-center py-12 sm:px-6 lg:px-8 relative overflow-x-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#347989] opacity-[0.03] rounded-full blur-3xl animate-floating" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#D68F35] opacity-[0.03] rounded-full blur-3xl animate-floating" style={{ animationDelay: '2s' }} />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8 relative z-10 animate-fade-in">
        <Logo className="h-16 w-auto mx-auto transform hover:scale-110 transition-transform duration-500" />
        <h2 className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">
          {step === 'details' ? 'Xpert Registration' : 'Confirm Phone'}
        </h2>
        <p className="mt-2 text-sm text-gray-600 animate-stagger-1 animate-fade-in">
          Join the pros. Set your schedule, earn more.
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative z-10">
        <div className="bg-white py-8 px-4 shadow-2xl shadow-gray-200/50 sm:rounded-2xl sm:px-10 border border-gray-100 relative overflow-hidden animate-slide-in-bottom">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#347989] via-[#D68F35] to-[#BB5F36]" />

          {step === 'details' ? (
            <form onSubmit={handleDetailsSubmit} className="space-y-6">
              <div className="animate-stagger-1 animate-fade-in">
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <div className="relative rounded-xl shadow-sm group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                    <FiUser className="text-gray-400" />
                  </div>
                  <input
                    ref={nameInputRef}
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleInputChange}
                    className="block w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-offset-2 outline-none transition-all duration-300 hover:border-gray-400"
                    style={{ '--tw-ring-color': brandColor }}
                    placeholder="e.g. Rajesh Kumar"
                  />
                </div>
              </div>

              <div className="animate-stagger-2 animate-fade-in">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <div className="relative rounded-xl shadow-sm group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                    <FiMail className="text-gray-400" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`block w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-offset-2 outline-none transition-all duration-300 hover:border-gray-400 ${
                      errors.email ? 'border-red-500 ring-red-100' : 'border-gray-300'
                    }`}
                    style={{ '--tw-ring-color': errors.email ? '#ef4444' : brandColor }}
                    placeholder="farmer@agri.com"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-xs text-red-500 font-medium animate-fade-in">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="animate-stagger-2 animate-fade-in">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Gender</label>
                <div className="grid grid-cols-3 gap-2">
                  {['male', 'female', 'other'].map((g) => (
                    <button
                      type="button"
                      key={g}
                      onClick={() => setFormData(prev => ({ ...prev, gender: g }))}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold capitalize transition-all border ${
                        (formData.gender || 'male') === g
                          ? 'bg-[#347989] text-white border-[#347989] shadow-sm'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {!verificationToken && (
                <div className="animate-stagger-3 animate-fade-in">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <div className="relative rounded-xl shadow-sm group">
                    <div className="absolute inset-y-0 left-0 pl-3 border-r pr-2 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                      <span className="text-gray-500 font-bold text-sm">+91</span>
                    </div>
                    <input
                      type="tel"
                      required
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData(p => ({ ...p, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      className="block w-full pl-14 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-offset-2 outline-none transition-all duration-300 hover:border-gray-400"
                      style={{ '--tw-ring-color': brandColor }}
                      placeholder="9876543210"
                    />
                  </div>
                </div>
              )}

              <div className="animate-stagger-4 animate-fade-in">
                <label className="block text-sm font-medium text-gray-700 mb-1">Aadhar Number</label>
                <div className="relative rounded-xl shadow-sm group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                    <FiFileText className="text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.aadhar}
                    onChange={(e) => setFormData(p => ({ ...p, aadhar: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
                    className="block w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-offset-2 outline-none transition-all duration-300 hover:border-gray-400"
                    style={{ '--tw-ring-color': brandColor }}
                    placeholder="12-digit Aadhar"
                  />
                </div>
              </div>

              {/* Aadhar Upload */}
              {/* Aadhar Front Upload */}
              <div className="animate-stagger-5 animate-fade-in">
                <label className="block text-sm font-medium text-gray-700 mb-2">Aadhar Front</label>
                {documentPreview.aadhar ? (
                  <div className="relative group overflow-hidden rounded-xl">
                    <img src={documentPreview.aadhar} className="w-full h-32 object-cover border transform group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button type="button" onClick={() => removeDocument('aadhar')} className="bg-red-500 text-white rounded-full p-2 shadow-xl hover:bg-red-600 transition-colors">
                        <FiX size={20} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:border-[#347989] group bg-white">
                    <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-full mb-2 hover:bg-blue-100 transition-colors">
                        <FiUpload className="w-6 h-6" />
                      </div>
                      <span className="text-xs text-gray-500 font-bold">Upload Front</span>
                      <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleDocumentUpload(e, 'aadhar')} />
                    </label>
                  </div>
                )}
              </div>

              {/* Aadhar Back Upload */}
              <div className="animate-stagger-[5.5] animate-fade-in mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Aadhar Back</label>
                {documentPreview.aadharBack ? (
                  <div className="relative group overflow-hidden rounded-xl">
                    <img src={documentPreview.aadharBack} className="w-full h-32 object-cover border transform group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button type="button" onClick={() => removeDocument('aadharBack')} className="bg-red-500 text-white rounded-full p-2 shadow-xl hover:bg-red-600 transition-colors">
                        <FiX size={20} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:border-[#347989] group bg-white">
                    <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-full mb-2 hover:bg-blue-100 transition-colors">
                        <FiUpload className="w-6 h-6" />
                      </div>
                      <span className="text-xs text-gray-500 font-bold">Upload Back</span>
                      <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleDocumentUpload(e, 'aadharBack')} />
                    </label>
                  </div>
                )}
              </div>

              {/* Commute & Vehicle Section */}
              <div className="animate-stagger-6 animate-fade-in border-t border-gray-100 pt-5 mt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-bold text-gray-900">
                    Commute & Vehicle
                  </label>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                    Priority Matching
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Do you have a personal bike or two-wheeler for traveling to farm jobs?
                </p>

                {/* Yes / No Toggle Cards */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, hasBike: true }))}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                      formData.hasBike
                        ? 'border-[#347989] bg-[#347989]/5 text-gray-900 shadow-sm ring-1 ring-[#347989]/20'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl shrink-0">🛵</span>
                    <div>
                      <div className="text-xs font-bold leading-tight">Yes, have a bike</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">Travel up to 25 km</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, hasBike: false, drivingLicenseNumber: '', drivingLicenseDocument: null }))}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                      !formData.hasBike
                        ? 'border-[#347989] bg-[#347989]/5 text-gray-900 shadow-sm ring-1 ring-[#347989]/20'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl shrink-0">🚶</span>
                    <div>
                      <div className="text-xs font-bold leading-tight">No personal bike</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">Nearby & shared travel</div>
                    </div>
                  </button>
                </div>

                {/* Conditional DL fields if Bike = Yes */}
                {formData.hasBike && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Driving License (DL) Number <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        name="drivingLicenseNumber"
                        value={formData.drivingLicenseNumber}
                        onChange={(e) => setFormData(p => ({ ...p, drivingLicenseNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20) }))}
                        className="block w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-offset-2 outline-none uppercase font-mono tracking-wider transition-all hover:border-gray-400 bg-white"
                        style={{ '--tw-ring-color': brandColor }}
                        placeholder="e.g. DL1420210012345"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        Driving License Photo <span className="text-gray-400 font-normal">(Front Photo - Optional)</span>
                      </label>
                      {documentPreview.drivingLicense ? (
                        <div className="relative group overflow-hidden rounded-xl border border-gray-200 bg-white">
                          <img src={documentPreview.drivingLicense} className="w-full h-32 object-cover" alt="DL Preview" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button type="button" onClick={() => removeDocument('drivingLicense')} className="bg-red-500 text-white rounded-full p-2 shadow-xl hover:bg-red-600 transition-colors">
                              <FiX size={18} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-xl hover:bg-white transition-all hover:border-[#347989] group bg-white/70">
                          <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-full mb-1 group-hover:scale-110 transition-transform">
                              <FiUpload className="w-5 h-5" />
                            </div>
                            <span className="text-xs text-gray-600 font-bold">Upload DL Photo</span>
                            <span className="text-[10px] text-gray-400">JPG, PNG or PDF up to 5MB</span>
                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleDocumentUpload(e, 'drivingLicense')} />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <ReferralInput
                referralCode={referralCode}
                setReferralCode={setReferralCode}
                isVerified={isReferralVerified}
                setIsVerified={setIsReferralVerified}
              />

              <div className="animate-stagger-[6] animate-fade-in">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-base font-bold rounded-xl text-white transition-all transform hover:-translate-y-1 shadow-lg disabled:opacity-50 overflow-hidden"
                  style={{ backgroundColor: brandColor, boxShadow: `0 10px 15px -3px ${brandColor}4D` }}
                >
                  <span className="absolute inset-0 w-full h-full bg-white/10 group-hover:translate-x-full transition-transform duration-700 -translate-x-full" />
                  {isLoading ? 'Processing...' : (
                    <span className="flex items-center relative z-10">
                      {verificationToken ? 'Finish Registration' : 'Verify & Join'}
                      <FiArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                    </span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <button
                onClick={() => setStep('details')}
                className="flex items-center text-sm text-gray-500 hover:text-[#347989] transition-colors mb-4 animate-fade-in"
              >
                <FiChevronLeft className="mr-1" /> Edit details
              </button>

              <div className="text-center animate-fade-in">
                <h3 className="text-xl font-bold text-gray-900">Enter OTP</h3>
                <p className="text-sm text-gray-600">Waiting for 6-digit code...</p>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-8">
                <div className="flex justify-between gap-2 animate-stagger-1 animate-fade-in">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (otpInputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-full h-14 text-center text-xl font-bold border border-gray-300 rounded-xl focus:ring-2 focus:ring-offset-2 outline-none transition-all duration-300 hover:border-gray-400"
                      style={{ '--tw-ring-color': brandColor, backgroundColor: digit ? `${brandColor}05` : 'white' }}
                    />
                  ))}
                </div>

                <div className="text-center animate-stagger-2 animate-fade-in">
                  <button
                    type="button"
                    onClick={async () => {
                      if (resendTimer > 0) return;
                      try {
                        const response = await workerAuthService.sendOTP(formData.phoneNumber, formData.email);
                        if (response.success) {
                          setOtpToken(response.token);
                          setResendTimer(120);
                          toastManager.success('OTP sent again');
                        }
                      } catch (e) { toastManager.error('Resend failed'); }
                    }}
                    className="text-sm font-semibold transition-colors duration-300 opacity-70 hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={resendTimer > 0}
                    style={{ color: brandColor }}
                  >
                    {resendTimer > 0
                      ? `Resend in ${Math.floor(resendTimer / 60)}:${String(resendTimer % 60).padStart(2, '0')}`
                      : 'Resend Code'}
                  </button>
                </div>

                <div className="animate-stagger-3 animate-fade-in">
                  <button
                    type="submit"
                    disabled={isLoading || otp.join('').length !== 6}
                    className="group relative w-full py-4 rounded-xl text-white font-bold transform hover:-translate-y-1 transition-all shadow-lg disabled:opacity-50 overflow-hidden"
                    style={{ backgroundColor: brandColor, boxShadow: `0 10px 15px -3px ${brandColor}4D` }}
                  >
                    <span className="absolute inset-0 w-full h-full bg-white/10 group-hover:translate-x-full transition-transform duration-700 -translate-x-full" />
                    <span className="relative z-10">
                      {isLoading ? 'Verifying...' : 'Complete Sign Up'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-gray-500 animate-fade-in animate-stagger-4">
          Already an Xpert?{' '}
          <Link to="/worker/login" className="font-semibold hover:text-[#D68F35] transition-colors" style={{ color: brandColor }}>
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default WorkerSignup;
