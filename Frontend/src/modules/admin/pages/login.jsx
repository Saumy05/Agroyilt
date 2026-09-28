import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiAlertCircle } from 'react-icons/fi';
import { toastManager } from '../../../utils/toastManager';
import { themeColors } from '../../../theme';
import { adminAuthService } from '../../../services/authService';

const AdminLogin = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

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
    if (formError) setFormError('');
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'email') {
      setErrors(prev => ({ ...prev, email: validateEmail(value) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.email || !formData.password) {
      const msg = 'Please enter both email and password';
      setFormError(msg);
      toastManager.error(msg);
      return;
    }

    setIsLoading(true);
    try {
      const response = await adminAuthService.login(formData.email, formData.password, rememberMe);
      if (response.success) {
        setIsLoading(false);
        // Store remember me preference
        if (rememberMe) {
          localStorage.setItem('adminRememberMe', 'true');
        }
        toastManager.success('Login successful!');
        navigate('/admin/dashboard');
      } else {
        setIsLoading(false);
        const msg = 'Invalid email or password. Please verify your credentials and try again.';
        setFormError(msg);
        toastManager.error(msg);
      }
    } catch (error) {
      setIsLoading(false);
      const status = error.response?.status;
      const rawMsg = (error.response?.data?.message || '').toLowerCase();

      let friendlyMsg = 'Invalid email or password. Please check your credentials and try again.';

      if (status === 400 || status === 401) {
        if (rawMsg.includes('not found') || rawMsg.includes('exist')) {
          friendlyMsg = 'No administrator account found with this email.';
        } else if (rawMsg.includes('inactive') || rawMsg.includes('suspended') || rawMsg.includes('disabled') || rawMsg.includes('blocked')) {
          friendlyMsg = 'Your administrator account has been deactivated. Please contact the Super Administrator.';
        } else {
          friendlyMsg = 'Incorrect email or password. Please check your credentials and try again.';
        }
      } else if (status === 403) {
        friendlyMsg = 'Access denied. You do not have permission to access the admin portal.';
      } else if (status === 429) {
        friendlyMsg = 'Too many failed login attempts. Please wait a few moments before trying again.';
      } else if (status >= 500) {
        friendlyMsg = 'Our server is temporarily busy. Please try again in a few moments.';
      } else if (!error.response || error.code === 'ERR_NETWORK') {
        friendlyMsg = 'Unable to connect to the server. Please check your internet connection.';
      }

      setFormError(friendlyMsg);
      toastManager.error(friendlyMsg);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, #00a6a6 0%, #008a8a 50%, #006b6b 100%)'
      }}
    >
      <div className="w-full max-w-md">
        {/* White Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${themeColors.button} 0%, #008a8a 100%)`,
                boxShadow: `0 4px 12px rgba(0, 166, 166, 0.3)`
              }}
            >
              <FiLock className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">
            Admin Login
          </h1>
          <p className="text-gray-600 text-center mb-6">
            Enter your credentials to access the admin panel
          </p>

          {/* User-friendly Error Alert */}
          {formError && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3 shadow-sm">
              <FiAlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
              <span className="font-medium leading-relaxed">{formError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                  <FiMail className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email"
                  className={`w-full pl-12 pr-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent text-gray-900 transition-all ${
                    errors.email ? 'border-red-500' : 'border-gray-300'
                  }`}
                  style={{
                    focusRingColor: errors.email ? '#ef4444' : themeColors.button
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = errors.email ? '#ef4444' : themeColors.button;
                    e.target.style.boxShadow = errors.email ? '0 0 0 3px rgba(239, 68, 68, 0.1)' : `0 0 0 3px rgba(0, 166, 166, 0.1)`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = errors.email ? '#ef4444' : '#d1d5db';
                    e.target.style.boxShadow = 'none';
                  }}
                  required
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-100 font-medium ml-1">
                    {errors.email}
                  </p>
                )}
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                  <FiLock className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Enter your password"
                  className="w-full pl-12 pr-12 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent text-gray-900"
                  onFocus={(e) => {
                    e.target.style.borderColor = themeColors.button;
                    e.target.style.boxShadow = `0 0 0 3px rgba(0, 166, 166, 0.1)`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db';
                    e.target.style.boxShadow = 'none';
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 border-gray-300 rounded"
                style={{
                  accentColor: themeColors.button
                }}
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-700">
                Remember me
              </label>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl text-white font-semibold text-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: `linear-gradient(135deg, ${themeColors.button} 0%, #008a8a 100%)`,
                boxShadow: '0 4px 12px rgba(0, 166, 166, 0.3)'
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 166, 166, 0.4)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, #008a8a 0%, #006b6b 100%)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 166, 166, 0.3)';
                e.currentTarget.style.background = `linear-gradient(135deg, ${themeColors.button} 0%, #008a8a 100%)`;
              }}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
};

export default AdminLogin;

