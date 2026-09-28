import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiPhone, FiCheckCircle, FiLock, FiEye, FiEyeOff, FiAlertCircle } from 'react-icons/fi';
import { toastManager } from '../../../utils/toastManager';
import { z } from 'zod';
import api from '../../../services/api';
import { userAuthService, vendorAuthService, workerAuthService } from '../../../services/authService';
import { useBrand } from '../../../context/BrandContext';
import authStorage from '../../../utils/authStorage';

// Phone validation
const phoneSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
});

const mpinSchema = z.object({
  mpin: z.string().regex(/^\d{4}$/, 'MPIN must be exactly 4 digits'),
});

const AppLogin = () => {
  const navigate = useNavigate();
  const { appLogo, appName } = useBrand();

  const [step, setStep] = useState('login'); // 'login' | 'forgot_phone' | 'forgot_otp' | 'set_mpin'
  const [phone, setPhone] = useState('');
  const [mpin, setMpin] = useState('');
  const [showMpin, setShowMpin] = useState(false);
  const [formError, setFormError] = useState('');

  // Forgot MPIN states
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpToken, setOtpToken] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [newMpin, setNewMpin] = useState('');
  const [confirmMpin, setConfirmMpin] = useState('');

  const [detectedRole, setDetectedRole] = useState(null); // 'user' | 'vendor' | 'worker'
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [multipleRoles, setMultipleRoles] = useState([]); // edge case: same phone in multiple roles

  const phoneInputRef = useRef(null);
  const mpinInputRef = useRef(null);
  const otpInputRefs = useRef([]);

  const authenticatedRole = React.useMemo(() => {
    if (authStorage.isAuthenticated('user')) return 'user';
    if (authStorage.isAuthenticated('vendor')) return 'vendor';
    if (authStorage.isAuthenticated('worker')) return 'worker';
    return null;
  }, []);

  // Auto-redirect if already logged in
  useEffect(() => {
    if (authenticatedRole) {
      navigate(`/${authenticatedRole}`, { replace: true });
    }
  }, [authenticatedRole, navigate]);

  // Resend timer
  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Auto-verify OTP when all 6 digits are entered
  useEffect(() => {
    const otpValue = otp.join('');
    if (otpValue.length === 6 && step === 'forgot_otp' && !isLoading && otpToken) {
      handleVerifyOtp();
    }
  }, [otp]);

  // ─── 1. NORMAL LOGIN FLOW ───────────────────────────────────────────────
  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    setFormError('');
    const cleanPhone = phone.replace(/\D/g, '');

    const phoneVal = phoneSchema.safeParse({ phone: cleanPhone });
    if (!phoneVal.success) {
      const msg = 'Please enter a valid 10-digit mobile number';
      setFormError(msg);
      toastManager.error(msg);
      return;
    }

    const mpinVal = mpinSchema.safeParse({ mpin });
    if (!mpinVal.success) {
      const msg = 'Please enter your 4-digit MPIN';
      setFormError(msg);
      toastManager.error(msg);
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Identify role
      const identifyRes = await api.post('/app/identify-role', { phone: cleanPhone });
      const roles = identifyRes.data?.roles || [];

      if (roles.length === 0) {
        const notFoundMsg = "No account found with this mobile number. Please check the number or register first.";
        setFormError(notFoundMsg);
        toastManager.error(notFoundMsg);
        setIsLoading(false);
        return;
      }

      let roleToUse = roles[0];
      if (roles.length > 1) {
        setMultipleRoles(roles);
        setIsLoading(false);
        return;
      }

      await executeMpinLogin(cleanPhone, mpin, roleToUse);
    } catch (error) {
      console.error('Login error:', error);
      setIsLoading(false);
      const status = error.response?.status;
      const rawMsg = (error.response?.data?.message || '').toLowerCase();
      let friendlyMsg = 'Unable to sign in. Please verify your mobile number and try again.';
      if (status === 404 || rawMsg.includes('not found') || rawMsg.includes('exist')) {
        friendlyMsg = 'No account found with this mobile number. Please register first.';
      } else if (status === 403 || rawMsg.includes('inactive') || rawMsg.includes('deactivated') || rawMsg.includes('suspended')) {
        friendlyMsg = 'Your account has been deactivated. Please contact customer support.';
      } else if (status === 429) {
        friendlyMsg = 'Too many attempts. Please wait a few moments and try again.';
      } else if (status >= 500) {
        friendlyMsg = 'Our server is temporarily busy. Please try again in a few moments.';
      } else if (!error.response || error.code === 'ERR_NETWORK') {
        friendlyMsg = 'Unable to connect to the server. Please check your internet connection.';
      }
      setFormError(friendlyMsg);
      toastManager.error(friendlyMsg);
    }
  };

  const executeMpinLogin = async (cleanPhone, mpinValue, role) => {
    try {
      setIsLoading(true);
      let response;
      if (role === 'user') {
        response = await userAuthService.loginWithMpin({ phone: cleanPhone, mpin: mpinValue });
      } else if (role === 'vendor') {
        response = await vendorAuthService.loginWithMpin({ phone: cleanPhone, mpin: mpinValue });
      } else if (role === 'worker') {
        response = await workerAuthService.loginWithMpin({ phone: cleanPhone, mpin: mpinValue });
      }

      if (response.success && response.accessToken) {
        toastManager.success('Welcome back! 👋');
        if (role === 'user') navigate('/user', { replace: true });
        else if (role === 'vendor') navigate('/vendor', { replace: true });
        else if (role === 'worker') navigate('/worker', { replace: true });
      }
    } catch (err) {
      setIsLoading(false);
      const errorData = err.response?.data;
      const status = err.response?.status;
      const rawMsg = (errorData?.message || '').toLowerCase();

      if (errorData?.code === 'ACCOUNT_PENDING_APPROVAL') {
        const msg = 'Your registration is pending admin approval. You will be able to log in once approved.';
        setFormError(msg);
        toastManager.info(msg, { duration: 6000 });
        return;
      }

      if (errorData?.code === 'ACCOUNT_REJECTED') {
        const msg = 'Your registration was not approved. Please contact support for assistance.';
        setFormError(msg);
        toastManager.error(msg, { duration: 6000 });
        return;
      }

      if (errorData?.code === 'REGISTRATION_FEE_REQUIRED') {
        const msg = 'Registration fee payment is required before you can access your account.';
        setFormError(msg);
        toastManager.error(msg);
        sessionStorage.setItem('preAuthToken', errorData.preAuthToken);
        sessionStorage.setItem('pendingRole', errorData.role);
        navigate('/app/registration-fee', { replace: true });
        return;
      }

      if (errorData?.mpinNotSet) {
        const msg = '4-digit MPIN is not yet set for your account. Redirecting to setup...';
        setFormError(msg);
        toastManager.error(msg);
        setStep('forgot_phone');
        return;
      }

      // Convert raw or technical errors into user-friendly guidance
      let friendlyMsg = 'Incorrect 4-digit MPIN. Please try again.';

      if (status === 429 || rawMsg.includes('locked') || rawMsg.includes('too many failed attempts')) {
        friendlyMsg = 'Too many incorrect attempts. For security reasons, your account is temporarily locked. Please try again later.';
      } else if (rawMsg.includes('attempts remaining')) {
        const match = rawMsg.match(/(\d+)\s+attempts?\s+remaining/);
        if (match && match[1]) {
          friendlyMsg = `Incorrect 4-digit MPIN. You have ${match[1]} attempt${match[1] === '1' ? '' : 's'} remaining.`;
        } else {
          friendlyMsg = 'Incorrect 4-digit MPIN. Please verify and try again.';
        }
      } else if (status === 404 || rawMsg.includes('not found') || rawMsg.includes('exist')) {
        friendlyMsg = 'No account found with this mobile number. Please register first.';
      } else if (status === 403 || rawMsg.includes('suspended') || rawMsg.includes('inactive') || rawMsg.includes('disabled') || rawMsg.includes('blocked')) {
        friendlyMsg = 'Your account has been deactivated. Please contact customer support.';
      } else if (status >= 500) {
        friendlyMsg = 'Our server is temporarily busy. Please try again in a few moments.';
      } else if (!err.response || err.code === 'ERR_NETWORK') {
        friendlyMsg = 'Unable to connect to the server. Please check your internet connection.';
      }

      setFormError(friendlyMsg);
      toastManager.error(friendlyMsg);
    }
  };

  // ─── 2. FORGOT MPIN FLOW ────────────────────────────────────────────────
  const handleForgotPhoneSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const cleanPhone = phone.replace(/\D/g, '');

    const validation = phoneSchema.safeParse({ phone: cleanPhone });
    if (!validation.success) {
      const msg = 'Please enter a valid 10-digit mobile number';
      setFormError(msg);
      toastManager.error(msg);
      return;
    }

    setIsLoading(true);

    try {
      const identifyRes = await api.post('/app/identify-role', { phone: cleanPhone });
      const roles = identifyRes.data?.roles || [];

      if (roles.length === 0) {
        const msg = "No account found with this mobile number. Please register first.";
        setFormError(msg);
        toastManager.error(msg);
        setIsLoading(false);
        return;
      }

      const roleToUse = roles[0]; // Uses first role found for OTP sending
      await sendOtpForRole(cleanPhone, roleToUse);
    } catch (error) {
      const msg = 'Unable to send verification OTP. Please check the number and try again.';
      setFormError(msg);
      toastManager.error(msg);
      setIsLoading(false);
    }
  };

  const sendOtpForRole = async (cleanPhone, role) => {
    try {
      let response;
      if (role === 'user') response = await userAuthService.sendOTP(cleanPhone, null, true, 'reset_mpin');
      else if (role === 'vendor') response = await vendorAuthService.sendOTP(cleanPhone, null, 'reset_mpin');
      else if (role === 'worker') response = await workerAuthService.sendOTP(cleanPhone, null, true, 'reset_mpin');

      if (response?.success || response?.token) {
        setOtpToken(response.token || 'sent');
        setDetectedRole(role);
        setStep('forgot_otp');
        setResendTimer(120);
        setIsLoading(false);
        toastManager.success('OTP sent successfully!');
      } else {
        throw new Error('Failed to send OTP');
      }
    } catch (err) {
      const msg = 'Unable to send verification OTP. Please try again in a few moments.';
      setFormError(msg);
      toastManager.error(msg);
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setFormError('');
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      const msg = 'Please enter all 6 digits of the verification code';
      setFormError(msg);
      toastManager.error(msg);
      return;
    }

    setIsLoading(true);
    const cleanPhone = phone.replace(/\D/g, '');

    try {
      let response;
      if (detectedRole === 'user') response = await userAuthService.verifyLogin({ phone: cleanPhone, otp: otpValue });
      else if (detectedRole === 'vendor') response = await vendorAuthService.verifyLogin({ phone: cleanPhone, otp: otpValue });
      else if (detectedRole === 'worker') response = await workerAuthService.verifyLogin({ phone: cleanPhone, otp: otpValue });

      if (response?.success && response?.verificationToken) {
        setVerificationToken(response.verificationToken);
        setStep('set_mpin');
        setIsLoading(false);
        toastManager.success('OTP Verified. Please set a new MPIN.');
      } else {
        throw new Error('Verification token not received.');
      }
    } catch (err) {
      const msg = 'Invalid or expired verification code. Please check and try again.';
      setFormError(msg);
      toastManager.error(msg);
      setIsLoading(false);
    }
  };

  const handleSetMpinSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    
    if (newMpin.length !== 4) {
      const msg = 'MPIN must be exactly 4 digits';
      setFormError(msg);
      toastManager.error(msg);
      return;
    }
    if (newMpin !== confirmMpin) {
      const msg = 'MPINs do not match. Please re-enter.';
      setFormError(msg);
      toastManager.error(msg);
      return;
    }

    setIsLoading(true);
    
    try {
      const payload = { verificationToken, mpin: newMpin, confirmMpin };
      let response;

      if (detectedRole === 'user') response = await userAuthService.resetMpin(payload);
      else if (detectedRole === 'vendor') response = await vendorAuthService.resetMpin(payload);
      else if (detectedRole === 'worker') response = await workerAuthService.resetMpin(payload);

      if (response?.success) {
        toastManager.success('MPIN updated successfully. You can now login.');
        // Reset states and go back to login
        setStep('login');
        setMpin('');
        setNewMpin('');
        setConfirmMpin('');
        setOtp(['', '', '', '', '', '']);
        setIsLoading(false);
      } else {
        throw new Error('Failed to update MPIN');
      }
    } catch (err) {
      const msg = 'Failed to update MPIN. Please try again.';
      setFormError(msg);
      toastManager.error(msg);
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value && !/^\d+$/.test(value)) return;
    if (value.length > 1) {
      if (index === 0 && value.length === 6) {
        setOtp(value.split(''));
        otpInputRefs.current[5]?.focus();
      }
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = () => {
    if (resendTimer > 0) return;
    setOtp(['', '', '', '', '', '']);
    sendOtpForRole(phone.replace(/\D/g, ''), detectedRole);
  };

  const roleLabel = {
    user: 'Farmer',
    vendor: 'Vendor',
    worker: 'Independent Worker',
  };

  const roleColor = {
    user: '#2E7D32',
    vendor: '#1565C0',
    worker: '#E65100',
  };

  const handleBack = () => {
    setFormError('');
    if (step === 'forgot_phone') setStep('login');
    else if (step === 'forgot_otp') { setStep('forgot_phone'); setOtp(['','','','','','']); }
    else if (step === 'set_mpin') { setStep('forgot_otp'); setNewMpin(''); setConfirmMpin(''); }
    else navigate('/app');
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#F8FAF8', fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '16px 20px 12px',
        background: '#fff', borderBottom: '1px solid #E8F5E9',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          id="app-login-back-btn"
          onClick={handleBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px', borderRadius: '10px',
            color: '#2E7D32', display: 'flex', alignItems: 'center',
          }}
        >
          <FiChevronLeft size={24} />
        </button>

        <div style={{
          width: '42px', height: '42px', borderRadius: '50%',
          overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', flexShrink: 0,
          background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <img
            src={appLogo || '/AgroyiltLogo.png'}
            alt={appName || 'AgroYilt'}
            style={{ width: '125%', height: '125%', objectFit: 'cover' }}
            onError={e => { e.target.src = '/AgroyiltLogo.png'; }}
          />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1B5E20' }}>
            {step === 'login' ? 'Login' : step === 'forgot_phone' ? 'Reset MPIN' : step === 'forgot_otp' ? 'Verify OTP' : 'Set New MPIN'}
          </h1>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#78909C' }}>
            {appName || 'AgroYilt'}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '32px 24px 16px' }}>

        {/* User-friendly Error Alert */}
        {formError && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '12px 16px', borderRadius: '12px',
            background: '#FFEBEE', border: '1px solid #FFCDD2',
            color: '#C62828', fontSize: '0.85rem', fontWeight: 500,
            marginBottom: '20px', lineHeight: 1.4
          }}>
            <FiAlertCircle size={20} style={{ flexShrink: 0, color: '#D32F2F', marginTop: '2px' }} />
            <span>{formError}</span>
          </div>
        )}

        {/* --- NORMAL LOGIN FLOW --- */}
        {step === 'login' && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 800, color: '#1B5E20' }}>
              Welcome back!
            </h2>
            <p style={{ margin: '0 0 32px', fontSize: '0.875rem', color: '#78909C', lineHeight: 1.5 }}>
              Login with your mobile number and 4-digit MPIN.
            </p>

            {multipleRoles.length > 1 && (
              <div style={{ marginBottom: '24px' }}>
                <p style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 600, color: '#263238' }}>
                  Multiple accounts found. Select role to login:
                </p>
                {multipleRoles.map(role => (
                  <button
                    key={role}
                    onClick={() => executeMpinLogin(phone.replace(/\D/g, ''), mpin, role)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '14px 16px',
                      background: '#fff', border: `2px solid ${roleColor[role]}`,
                      borderRadius: '14px', cursor: 'pointer',
                      marginBottom: '10px', color: roleColor[role],
                      fontSize: '0.95rem', fontWeight: 700,
                    }}
                  >
                    <span>Login as {roleLabel[role]}</span>
                    <FiChevronLeft size={18} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleLoginSubmit}>
              {/* Phone Input */}
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#546E7A', marginBottom: '8px' }}>
                Mobile Number
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: '#fff', border: '2px solid #E0E0E0',
                borderRadius: '14px', padding: '4px 16px 4px 12px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2E7D32' }}>
                  <FiPhone size={18} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#263238' }}>+91</span>
                </div>
                <div style={{ width: '1px', height: '28px', background: '#E0E0E0' }} />
                <input
                  ref={phoneInputRef}
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={e => { if (formError) setFormError(''); setPhone(e.target.value.replace(/\D/g, '')); }}
                  placeholder="Enter 10-digit number"
                  style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent', 
                    fontSize: '1rem', fontWeight: 500, color: '#263238', padding: '14px 0',
                    fontFamily: "'Inter', 'Segoe UI', sans-serif",
                    width: '100%', minWidth: 0
                  }}
                />
              </div>

              {/* MPIN Input */}
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#546E7A', marginBottom: '8px' }}>
                4-Digit MPIN
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: '#fff', border: '2px solid #E0E0E0',
                borderRadius: '14px', padding: '4px 16px 4px 12px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2E7D32' }}>
                  <FiLock size={18} />
                </div>
                <div style={{ width: '1px', height: '28px', background: '#E0E0E0' }} />
                <input
                  ref={mpinInputRef}
                  type={showMpin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  value={mpin}
                  onChange={e => { if (formError) setFormError(''); setMpin(e.target.value.replace(/\D/g, '')); }}
                  placeholder="• • • •"
                  style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent', 
                    fontSize: '1.2rem', fontWeight: 600, color: '#263238', padding: '14px 0',
                    letterSpacing: mpin ? '4px' : 'normal',
                    fontFamily: "'Inter', 'Segoe UI', sans-serif",
                    width: '100%', minWidth: 0
                  }}
                />
                <button type="button" onClick={() => setShowMpin(!showMpin)} style={{ background: 'none', border: 'none', color: '#9E9E9E', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                  {showMpin ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>

              <div style={{ textAlign: 'right', marginBottom: '32px' }}>
                <button type="button" onClick={() => { setFormError(''); setStep('forgot_phone'); setPhone(''); }} style={{ background: 'none', border: 'none', color: '#2E7D32', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  Forgot MPIN?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading || phone.length !== 10 || mpin.length !== 4}
                style={{
                  width: '100%', padding: '18px',
                  borderRadius: '16px', border: 'none',
                  background: (phone.length === 10 && mpin.length === 4 && !isLoading)
                    ? 'linear-gradient(135deg, #2E7D32 0%, #43A047 100%)' : '#E0E0E0',
                  color: (phone.length === 10 && mpin.length === 4 && !isLoading) ? '#fff' : '#9E9E9E',
                  fontSize: '1rem', fontWeight: 700,
                  cursor: (phone.length === 10 && mpin.length === 4 && !isLoading) ? 'pointer' : 'not-allowed',
                  boxShadow: (phone.length === 10 && mpin.length === 4 && !isLoading) ? '0 4px 16px rgba(46₹25,50,0.35)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          </>
        )}

        {/* --- FORGOT MPIN: PHONE INPUT --- */}
        {step === 'forgot_phone' && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 800, color: '#1B5E20' }}>
              Reset MPIN
            </h2>
            <p style={{ margin: '0 0 32px', fontSize: '0.875rem', color: '#78909C', lineHeight: 1.5 }}>
              Enter your registered mobile number to receive an OTP.
            </p>

            <form onSubmit={handleForgotPhoneSubmit}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#546E7A', marginBottom: '8px' }}>
                Mobile Number
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: '#fff', border: '2px solid #E0E0E0',
                borderRadius: '14px', padding: '4px 16px 4px 12px',
                transition: 'border-color 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2E7D32' }}>
                  <FiPhone size={18} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#263238' }}>+91</span>
                </div>
                <div style={{ width: '1px', height: '28px', background: '#E0E0E0' }} />
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={e => { if (formError) setFormError(''); setPhone(e.target.value.replace(/\D/g, '')); }}
                  placeholder="Enter 10-digit number"
                  style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent',
                    fontSize: '1rem', fontWeight: 500, color: '#263238', padding: '14px 0',
                    fontFamily: "'Inter', 'Segoe UI', sans-serif",
                    width: '100%', minWidth: 0
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || phone.length !== 10}
                style={{
                  marginTop: '24px', width: '100%', padding: '18px',
                  borderRadius: '16px', border: 'none',
                  background: phone.length === 10 && !isLoading
                    ? 'linear-gradient(135deg, #2E7D32 0%, #43A047 100%)' : '#E0E0E0',
                  color: phone.length === 10 && !isLoading ? '#fff' : '#9E9E9E',
                  fontSize: '1rem', fontWeight: 700,
                  cursor: phone.length === 10 && !isLoading ? 'pointer' : 'not-allowed',
                  boxShadow: phone.length === 10 && !isLoading ? '0 4px 16px rgba(46₹25,50,0.35)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {isLoading ? 'Sending OTP...' : 'Send OTP'}
              </button>
            </form>
          </>
        )}

        {/* --- FORGOT MPIN: OTP INPUT --- */}
        {step === 'forgot_otp' && (
          <>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: detectedRole ? `${roleColor[detectedRole]}15` : '#E8F5E9',
              border: `1px solid ${detectedRole ? roleColor[detectedRole] : '#A5D6A7'}`,
              borderRadius: '999px', padding: '4px 12px', marginBottom: '20px',
            }}>
              <FiCheckCircle size={14} color={detectedRole ? roleColor[detectedRole] : '#2E7D32'} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: detectedRole ? roleColor[detectedRole] : '#2E7D32' }}>
                {detectedRole ? roleLabel[detectedRole] : 'Account'} found
              </span>
            </div>

            <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800, color: '#1B5E20' }}>
              Enter OTP
            </h2>
            <p style={{ margin: '0 0 32px', fontSize: '0.875rem', color: '#78909C', lineHeight: 1.5 }}>
              We sent a 6-digit code to <strong style={{ color: '#263238' }}>+91 {phone}</strong>
            </p>

            <form onSubmit={handleVerifyOtp}>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '32px' }}>
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={el => { otpInputRefs.current[index] = el; }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(index, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(index, e)}
                    style={{
                      width: '48px', height: '56px',
                      textAlign: 'center', fontSize: '1.4rem', fontWeight: 700,
                      border: `2px solid ${digit ? (detectedRole ? roleColor[detectedRole] : '#2E7D32') : '#E0E0E0'}`,
                      borderRadius: '14px', background: '#fff', outline: 'none',
                      color: '#263238', transition: 'border-color 0.15s',
                      fontFamily: "'Inter', 'Segoe UI', sans-serif",
                    }}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={isLoading || otp.join('').length !== 6}
                style={{
                  width: '100%', padding: '18px',
                  borderRadius: '16px', border: 'none',
                  background: otp.join('').length === 6 && !isLoading
                    ? `linear-gradient(135deg, ${detectedRole ? roleColor[detectedRole] : '#2E7D32'} 0%, ${detectedRole ? roleColor[detectedRole] + 'cc' : '#43A047'} 100%)`
                    : '#E0E0E0',
                  color: otp.join('').length === 6 && !isLoading ? '#fff' : '#9E9E9E',
                  fontSize: '1rem', fontWeight: 700,
                  cursor: otp.join('').length === 6 && !isLoading ? 'pointer' : 'not-allowed',
                  boxShadow: otp.join('').length === 6 && !isLoading
                    ? `0 4px 16px ${detectedRole ? roleColor[detectedRole] + '55' : 'rgba(46₹25,50,0.35)'}` : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {isLoading ? 'Verifying...' : 'Verify OTP'}
              </button>

              <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.875rem', color: '#78909C' }}>
                {resendTimer > 0 ? (
                  <>Resend OTP in <strong style={{ color: '#2E7D32' }}>{resendTimer}s</strong></>
                ) : (
                  <>Didn't receive it?{' '}
                    <button type="button" onClick={handleResend} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2E7D32', fontWeight: 700, fontSize: '0.875rem', padding: 0 }}>
                      Resend OTP
                    </button>
                  </>
                )}
              </p>
            </form>
          </>
        )}

        {/* --- FORGOT MPIN: SET NEW MPIN --- */}
        {step === 'set_mpin' && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 800, color: '#1B5E20' }}>
              Set New MPIN
            </h2>
            <p style={{ margin: '0 0 32px', fontSize: '0.875rem', color: '#78909C', lineHeight: 1.5 }}>
              Create a 4-digit MPIN for your account.
            </p>

            <form onSubmit={handleSetMpinSubmit}>
              {/* New MPIN Input */}
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#546E7A', marginBottom: '8px' }}>
                New 4-Digit MPIN
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: '#fff', border: '2px solid #E0E0E0',
                borderRadius: '14px', padding: '4px 16px 4px 12px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2E7D32' }}><FiLock size={18} /></div>
                <div style={{ width: '1px', height: '28px', background: '#E0E0E0' }} />
                <input
                  type={showMpin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  value={newMpin}
                  onChange={e => setNewMpin(e.target.value.replace(/\D/g, ''))}
                  placeholder="? ? ? ?"
                  style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent', 
                    fontSize: '1.2rem', fontWeight: 600, color: '#263238', padding: '14px 0',
                    letterSpacing: newMpin ? '4px' : 'normal', fontFamily: "'Inter', 'Segoe UI', sans-serif",
                    width: '100%', minWidth: 0
                  }}
                />
                <button type="button" onClick={() => setShowMpin(!showMpin)} style={{ background: 'none', border: 'none', color: '#9E9E9E', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                  {showMpin ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>

              {/* Confirm MPIN Input */}
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#546E7A', marginBottom: '8px' }}>
                Confirm MPIN
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: '#fff', border: '2px solid #E0E0E0',
                borderRadius: '14px', padding: '4px 16px 4px 12px',
                marginBottom: '32px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2E7D32' }}><FiLock size={18} /></div>
                <div style={{ width: '1px', height: '28px', background: '#E0E0E0' }} />
                <input
                  type={showMpin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmMpin}
                  onChange={e => setConfirmMpin(e.target.value.replace(/\D/g, ''))}
                  placeholder="? ? ? ?"
                  style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent', 
                    fontSize: '1.2rem', fontWeight: 600, color: '#263238', padding: '14px 0',
                    letterSpacing: confirmMpin ? '4px' : 'normal', fontFamily: "'Inter', 'Segoe UI', sans-serif",
                    width: '100%', minWidth: 0
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || newMpin.length !== 4 || confirmMpin.length !== 4}
                style={{
                  width: '100%', padding: '18px',
                  borderRadius: '16px', border: 'none',
                  background: (newMpin.length === 4 && confirmMpin.length === 4 && !isLoading)
                    ? 'linear-gradient(135deg, #2E7D32 0%, #43A047 100%)' : '#E0E0E0',
                  color: (newMpin.length === 4 && confirmMpin.length === 4 && !isLoading) ? '#fff' : '#9E9E9E',
                  fontSize: '1rem', fontWeight: 700,
                  cursor: (newMpin.length === 4 && confirmMpin.length === 4 && !isLoading) ? 'pointer' : 'not-allowed',
                  boxShadow: (newMpin.length === 4 && confirmMpin.length === 4 && !isLoading) ? '0 4px 16px rgba(46₹25,50,0.35)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {isLoading ? 'Updating...' : 'Set MPIN'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Footer (Only on Login screen) */}
      {step === 'login' && (
        <div style={{ padding: '16px 24px 40px', textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', color: '#78909C' }}>
            Don't have an account?{' '}
            <button
              id="app-login-register-link"
              onClick={() => navigate('/app/register')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#2E7D32', fontWeight: 700, fontSize: '0.875rem', padding: 0,
              }}
            >
              Register
            </button>
          </p>
        </div>
      )}
    </div>
  );
};

export default AppLogin;
