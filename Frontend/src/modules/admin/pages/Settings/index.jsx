import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSettings, FiGrid, FiDollarSign, FiSave, FiUser, FiMail, FiTrash2, FiPlus, FiUsers, FiShield, FiFileText, FiMapPin, FiPhone, FiHeadphones, FiMessageCircle, FiEdit, FiLock, FiUnlock, FiX, FiGlobe, FiUpload, FiCamera } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { getSettings, updateSettings, updateAdminProfile, getAdminProfile, getAllAdmins, createAdmin, deleteAdmin, updateAdminDetails, toggleAdminStatus, getRegistrationFees, updateRegistrationFee } from '../../services/settingsService';
import { toastManager } from '../../../../utils/toastManager';
import { useBrand } from '../../../../context/BrandContext';
import api from '../../../../services/api';
import authStorage from '../../../../utils/authStorage';

const AdminSettings = () => {
  const navigate = useNavigate();
  const { refreshBrandSettings } = useBrand();
  const [settings, setSettings] = useState({
    // No operator assignment in Agroyilt
  });

  const [financialSettings, setFinancialSettings] = useState({
    visitedCharges: 0,
    serviceGstPercentage: 18,
    partsGstPercentage: 18,
    servicePayoutPercentage: 90,
    partsPayoutPercentage: 100,
    vendorCashLimit: 10000,
    cancellationPenalty: 49,
    tdsPercentage: 1,
    platformFeePercentage: 1,
    bookingCommissionPercentage: 10,
    workerCommissionPercentage: 10,
    workerPlatformChargePercentage: 1,
    rentalGstPercentage: 5,
    minWithdrawalAmount: 300
  });

  // One-time registration fees state
  const [registrationFees, setRegistrationFees] = useState({
    USER: 0,
    VENDOR: 0,
    WORKER: 0
  });
  const [feesLoading, setFeesLoading] = useState(false);

  // Billing Configuration State
  const [billingSettings, setBillingSettings] = useState({
    companyName: 'TodayMyDream',
    companyGSTIN: '',
    companyPAN: '',
    companyAddress: '',
    companyCity: '',
    companyState: '',
    companyPincode: '',
    companyPhone: '',
    companyEmail: '',
    invoicePrefix: 'INV',
    sacCode: '998599'
  });
  const [billingLoading, setBillingLoading] = useState(false);

  const [systemSettings, setSystemSettings] = useState({
    maxIndependentWorkerRequest: 5,
    workerSearchRadiusKm: 25,
    workerPenaltyEnabled: false,
    workerPenaltyType: 'fixed',
    workerPenaltyAmount: 50,
    workerPenaltyPerMinute: 5,
    workerPenaltyFreeMinutes: 10,
    workerPenaltyMaxAmount: 500,
    workerPenaltyPercentage: 5,
    extensionExpiryMinutes: 30,
    maxWorkerDues: 500,
    workerCashPaymentEnabled: true,
    workerJourneyWindowMinutes: 120,
    workerEarlyStartMinutes: 30
  });
  const [systemLoading, setSystemLoading] = useState(false);

  // Support Settings State
  const [supportSettings, setSupportSettings] = useState({
    supportEmail: '',
    supportPhone: '',
    supportWhatsapp: ''
  });
  const [supportLoading, setSupportLoading] = useState(false);

  // Branding & App Identity State
  const [brandingSettings, setBrandingSettings] = useState({
    appName: 'AgroYilt',
    appTagline: 'Smart Agriculture Equipment Booking',
    appLogo: '/AgroyiltLogo.png',
    appFavicon: '/AgroyiltLogo.png'
  });
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const logoInputRef = useRef(null);
  const faviconInputRef = useRef(null);

  // Helper to compress image in browser using canvas
  const compressImage = (file, maxWidth = 512, maxHeight = 512, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Return compressed Base64 Data URL (webp format)
          const compressedBase64 = canvas.toDataURL('image/webp', quality);
          resolve(compressedBase64);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleLogoFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      // 1. Compress image in browser before upload
      const compressedBase64 = await compressImage(file, 512, 512, 0.85);

      // 2. Upload compressed image to Cloudinary via backend
      const res = await api.post('/admin/upload', { image: compressedBase64 });
      if (res.data && res.data.imageUrl) {
        setBrandingSettings(prev => ({ ...prev, appLogo: res.data.imageUrl }));
        toastManager.success('App Logo compressed & saved to Cloudinary!');
      } else {
        toastManager.error('Failed to upload logo image');
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
      toastManager.error(error.response?.data?.message || 'Failed to upload logo image file');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleFaviconFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFavicon(true);
    try {
      // 1. Compress favicon image in browser
      const compressedBase64 = await compressImage(file, 256, 256, 0.85);

      // 2. Upload compressed favicon to Cloudinary via backend
      const res = await api.post('/admin/upload', { image: compressedBase64 });
      if (res.data && res.data.imageUrl) {
        setBrandingSettings(prev => ({ ...prev, appFavicon: res.data.imageUrl }));
        toastManager.success('Favicon compressed & saved to Cloudinary!');
      } else {
        toastManager.error('Failed to upload favicon image');
      }
    } catch (error) {
      console.error('Error uploading favicon:', error);
      toastManager.error(error.response?.data?.message || 'Failed to upload favicon file');
    } finally {
      setUploadingFavicon(false);
      if (faviconInputRef.current) faviconInputRef.current.value = '';
    }
  };

  const [uploadingProfile, setUploadingProfile] = useState(false);
  const profileInputRef = useRef(null);

  const handleProfileImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingProfile(true);
    try {
      const compressedBase64 = await compressImage(file, 256, 256, 0.85);
      const res = await api.post('/admin/upload', { image: compressedBase64 });
      if (res.data && res.data.imageUrl) {
        setProfile(prev => ({ ...prev, profilePhoto: res.data.imageUrl }));
        toastManager.success('Profile photo uploaded successfully!');
      } else {
        toastManager.error('Failed to upload profile photo');
      }
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      toastManager.error(error.response?.data?.message || 'Failed to upload profile photo');
    } finally {
      setUploadingProfile(false);
      if (profileInputRef.current) profileInputRef.current.value = '';
    }
  };

  const [profile, setProfile] = useState(() => {
    try {
      const stored = authStorage.getUserData('admin') || {};
      return {
        name: stored.name || '',
        email: stored.email || '',
        role: stored.role || 'admin',
        assignedCity: stored.cityName || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        profilePhoto: stored.profilePhoto || null,
        bankDetails: {
          accountHolderName: stored.salary?.bankDetails?.accountHolderName || '',
          bankName: stored.salary?.bankDetails?.bankName || '',
          accountNumber: stored.salary?.bankDetails?.accountNumber || '',
          ifscCode: stored.salary?.bankDetails?.ifscCode || '',
          upiId: stored.salary?.bankDetails?.upiId || ''
        },
        salaryInfo: stored.salary || null
      };
    } catch (e) {
      return {
        name: '',
        email: '',
        role: 'admin',
        assignedCity: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        profilePhoto: null,
        bankDetails: {
          accountHolderName: '',
          bankName: '',
          accountNumber: '',
          ifscCode: '',
          upiId: ''
        },
        salaryInfo: null
      };
    }
  });

  // Admin Management State
  const [admins, setAdmins] = useState([]);
  const [cities, setCities] = useState([]); // State for cities
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', password: '', role: 'admin', cityId: '' }); // Added cityId
  const [adminLoading, setAdminLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [activeView, setActiveView] = useState('main'); // 'main', 'profile', 'financial', 'system', 'admins'

  const storedRole = (() => {
    try {
      const stored = authStorage.getUserData('admin') || {};
      return (stored.role || '').toLowerCase();
    } catch { return ''; }
  })();

  const currentRole = (profile.role || storedRole || '').toLowerCase();
  const isSuperAdmin = currentRole === 'super_admin' || currentRole === 'superadmin';

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await getAdminProfile();
        if (res.success && res.data) {
          setProfile(prev => ({
            ...prev,
            email: res.data.email,
            name: res.data.name || 'Admin',
            role: res.data.role || prev.role || 'admin',
            profilePhoto: res.data.profilePhoto || null,
            assignedCity: res.data.cityName || res.data.cityId?.name || '',
            bankDetails: {
              accountHolderName: res.data.salary?.bankDetails?.accountHolderName || '',
              bankName: res.data.salary?.bankDetails?.bankName || '',
              accountNumber: res.data.salary?.bankDetails?.accountNumber || '',
              ifscCode: res.data.salary?.bankDetails?.ifscCode || '',
              upiId: res.data.salary?.bankDetails?.upiId || ''
            },
            salaryInfo: res.data.salary || null
          }));
          authStorage.updateUserData('admin', res.data);
        }
      } catch (error) {
        console.error('Error loading admin profile:', error);
      }
    };

    const loadSettings = () => {
      try {
        const adminSettings = JSON.parse(localStorage.getItem('adminSettings') || '{}');
        if (Object.keys(adminSettings).length > 0) {
          setSettings(prev => ({ ...prev, ...adminSettings }));
        }
      } catch (error) {
        console.error('Error loading admin settings:', error);
      }
    };

    const loadFinancialSettings = async () => {
      try {
        const res = await getSettings();
        if (res.success && res.settings) {
          setFinancialSettings({
            visitedCharges: res.settings.visitedCharges || 0,
            serviceGstPercentage: res.settings.serviceGstPercentage ?? 18,
            partsGstPercentage: res.settings.partsGstPercentage ?? 18,
            servicePayoutPercentage: res.settings.servicePayoutPercentage ?? 90,
            partsPayoutPercentage: res.settings.partsPayoutPercentage ?? 100,
            tdsPercentage: res.settings.tdsPercentage || 1,
            platformFeePercentage: res.settings.platformFeePercentage || 1,
            vendorCashLimit: res.settings.vendorCashLimit || 10000,
            cancellationPenalty: res.settings.cancellationPenalty ?? 49,
            bookingCommissionPercentage: res.settings.bookingCommissionPercentage ?? 10,
            workerCommissionPercentage: res.settings.workerCommissionPercentage ?? 10,
            workerPlatformChargePercentage: res.settings.workerPlatformChargePercentage ?? 1,
            rentalGstPercentage: res.settings.rentalGstPercentage ?? 5,
            minWithdrawalAmount: res.settings.minWithdrawalAmountPaise ? Math.round(res.settings.minWithdrawalAmountPaise / 100) : (res.settings.minWithdrawalAmount || 300)
          });

          // Load billing settings
          setBillingSettings({
            companyName: res.settings.companyName || 'TodayMyDream',
            companyGSTIN: res.settings.companyGSTIN || '',
            companyPAN: res.settings.companyPAN || '',
            companyAddress: res.settings.companyAddress || '',
            companyCity: res.settings.companyCity || '',
            companyState: res.settings.companyState || '',
            companyPincode: res.settings.companyPincode || '',
            companyPhone: res.settings.companyPhone || '',
            companyEmail: res.settings.companyEmail || '',
            invoicePrefix: res.settings.invoicePrefix || 'INV',
            sacCode: res.settings.sacCode || '998599'
          });
          // Load system settings
          setSystemSettings({
            maxIndependentWorkerRequest: res.settings.maxIndependentWorkerRequest ?? 5,
            workerSearchRadiusKm: res.settings.workerSearchRadiusKm ?? 25,
            workerPenaltyEnabled: res.settings.workerPenaltyEnabled ?? false,
            workerPenaltyType: res.settings.workerPenaltyType || 'fixed',
            workerPenaltyAmount: res.settings.workerPenaltyAmount ?? 50,
            workerPenaltyPerMinute: res.settings.workerPenaltyPerMinute ?? 5,
            workerPenaltyFreeMinutes: res.settings.workerPenaltyFreeMinutes ?? 10,
            workerPenaltyMaxAmount: res.settings.workerPenaltyMaxAmount ?? 500,
            workerPenaltyPercentage: res.settings.workerPenaltyPercentage ?? 5,
            extensionExpiryMinutes: res.settings.extensionExpiryMinutes ?? 30,
            maxWorkerDues: res.settings.maxWorkerDues ?? 500,
            workerCashPaymentEnabled: res.settings.workerCashPaymentEnabled ?? true,
            workerJourneyWindowMinutes: res.settings.workerJourneyWindowMinutes ?? 120,
            workerEarlyStartMinutes: res.settings.workerEarlyStartMinutes ?? 30
          });
          // Load support settings
          setSupportSettings({
            supportEmail: res.settings.supportEmail || '',
            supportPhone: res.settings.supportPhone || '',
            supportWhatsapp: res.settings.supportWhatsapp || ''
          });
          // Load branding settings
          setBrandingSettings({
            appName: res.settings.appName || 'AgroYilt',
            appTagline: res.settings.appTagline || 'Smart Agriculture Equipment Booking',
            appLogo: res.settings.appLogo || '/AgroyiltLogo.png',
            appFavicon: res.settings.appFavicon || '/AgroyiltLogo.png'
          });
        }

        // Fetch registration fees
        try {
          const feesRes = await getRegistrationFees();
          if (feesRes?.success && feesRes.fees) {
            setRegistrationFees(feesRes.fees);
          }
        } catch (err) {
          console.error('Error loading registration fees:', err);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadProfile();
    loadSettings();
    loadFinancialSettings();
  }, []);

  const loadAdmins = async () => {
    try {
      console.log('Fetching admins list...');
      const res = await getAllAdmins();
      console.log('[ADMIN] Admins list loaded successfully');
      if (res.success) {
        setAdmins(res.data || []);
      }
    } catch (error) {
      console.error('Error loading admins:', error);
    }
  };

  // Load admins ONLY when entering admin view
  useEffect(() => {
    if (isSuperAdmin && activeView === 'admins') {
      if (admins.length === 0) loadAdmins();
    }
  }, [isSuperAdmin, activeView]);

  const handleToggle = (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    localStorage.setItem('adminSettings', JSON.stringify(updated));
    window.dispatchEvent(new Event('adminSettingsUpdated'));
  };

  const handleFinancialChange = (e) => {
    const { name, value } = e.target;
    setFinancialSettings(prev => ({
      ...prev,
      [name]: value === '' ? '' : Number(value)
    }));
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleBankChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({
      ...prev,
      bankDetails: {
        ...(prev.bankDetails || {}),
        [name]: name === 'ifscCode' ? value.toUpperCase() : value
      }
    }));
  };

  const handleFinancialSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(financialSettings).map(([k, v]) => [k, v === '' ? 0 : Number(v)])
      );
      await updateSettings(payload);
      toastManager.success('Financial settings updated');
    } catch (error) {
      toastManager.error('Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  // Handle billing settings change
  const handleBillingChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    // Live Input Restrictions
    if (name === 'companyCity' || name === 'companyState') {
      // Accept only alphabets and spaces
      newValue = value.replace(/[^a-zA-Z\s]/g, '');
    } else if (name === 'companyPhone') {
      // Accept only digits and limit to 10
      newValue = value.replace(/\D/g, '').slice(0, 10);
    } else if (name === 'companyPincode') {
      // Accept only digits and limit to 6
      newValue = value.replace(/\D/g, '').slice(0, 6);
    } else if (name === 'sacCode') {
      // Accept only digits and limit to 6
      newValue = value.replace(/\D/g, '').slice(0, 6);
    } else if (name === 'companyPAN') {
      // Auto-uppercase and limit to 10
      newValue = value.toUpperCase().slice(0, 10);
    } else if (name === 'companyGSTIN') {
      // Auto-uppercase and limit to 15
      newValue = value.toUpperCase().slice(0, 15);
    } else if (name === 'invoicePrefix') {
      newValue = value.toUpperCase().slice(0, 5);
    }

    setBillingSettings(prev => ({ ...prev, [name]: newValue }));
  };

  const validateBilling = () => {
    const {
      companyName, companyGSTIN, companyPAN, companyAddress,
      companyCity, companyState, companyPincode,
      companyPhone, companyEmail, invoicePrefix, sacCode
    } = billingSettings;

    if (!companyName?.trim()) return "Company Name is required";

    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!companyGSTIN || !gstRegex.test(companyGSTIN)) return "Invalid GSTIN format (ex: 27ABCDE1234F1Z5)";

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!companyPAN || !panRegex.test(companyPAN)) return "PAN should be in format (ex - ASDFE1234D)";

    if (!companyAddress?.trim()) return "Address is required";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!companyEmail || !emailRegex.test(companyEmail)) return "Company mail should be in format (ex: info@company.com)";

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!companyPhone || !phoneRegex.test(companyPhone)) return "Company phone no. should be in format (10 digits starting with 6-9)";

    if (!companyCity?.trim()) return "City field is required";
    if (/[^a-zA-Z\s]/.test(companyCity)) return "City field accept only alphabet";

    if (!companyState?.trim()) return "State field is required";
    if (/[^a-zA-Z\s]/.test(companyState)) return "State field accept only alphabet";

    const pincodeRegex = /^[1-9][0-9]{5}$/;
    if (!companyPincode || !pincodeRegex.test(companyPincode)) return "Invalid Pincode (must be 6 digits)";

    if (!invoicePrefix?.trim()) return "Invoice Prefix is required";

    const sacRegex = /^\d{6}$/;
    if (!sacCode || !sacRegex.test(sacCode)) return "Invalid SAC Code (must be 6 digits)";

    return null;
  };

  // Save billing settings
  const handleBillingSave = async (e) => {
    e.preventDefault();

    const error = validateBilling();
    if (error) return toastManager.error(error);

    setBillingLoading(true);
    try {
      await updateSettings(billingSettings);
      toastManager.success('Billing settings updated');
    } catch (error) {
      toastManager.error('Failed to update billing settings');
    } finally {
      setBillingLoading(false);
    }
  };

  // Handle system settings change
  const handleSystemChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setSystemSettings(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'workerPenaltyType') {
      setSystemSettings(prev => ({ ...prev, [name]: value }));
    } else {
      setSystemSettings(prev => ({ ...prev, [name]: value === '' ? '' : Number(value) }));
    }
  };

  const handleSystemSave = async (e) => {
    e.preventDefault();
    setSystemLoading(true);
    try {
      const payload = {
        maxIndependentWorkerRequest: Number(systemSettings.maxIndependentWorkerRequest) || 5,
        workerSearchRadiusKm: Number(systemSettings.workerSearchRadiusKm) || 25,
        workerPenaltyEnabled: Boolean(systemSettings.workerPenaltyEnabled),
        workerPenaltyType: systemSettings.workerPenaltyType || 'fixed',
        workerPenaltyAmount: Number(systemSettings.workerPenaltyAmount) || 0,
        workerPenaltyPerMinute: Number(systemSettings.workerPenaltyPerMinute) || 0,
        workerPenaltyFreeMinutes: Number(systemSettings.workerPenaltyFreeMinutes) || 0,
        workerPenaltyMaxAmount: Number(systemSettings.workerPenaltyMaxAmount) || 0,
        workerPenaltyPercentage: Number(systemSettings.workerPenaltyPercentage) || 0,
        extensionExpiryMinutes: Number(systemSettings.extensionExpiryMinutes) || 30,
        maxWorkerDues: Math.max(0, Number(systemSettings.maxWorkerDues) || 0),
        workerCashPaymentEnabled: Boolean(systemSettings.workerCashPaymentEnabled),
        workerJourneyWindowMinutes: Math.max(0, Number(systemSettings.workerJourneyWindowMinutes) || 0),
        workerEarlyStartMinutes: Math.max(0, Number(systemSettings.workerEarlyStartMinutes) || 0)
      };
      await updateSettings(payload);
      toastManager.success('System preferences & worker rules updated');
    } catch (error) {
      toastManager.error('Failed to update system settings');
    } finally {
      setSystemLoading(false);
    }
  };

  // Handle support settings change
  const handleSupportChange = (e) => {
    const { name, value } = e.target;
    setSupportSettings(prev => ({ ...prev, [name]: value }));
  };

  // Save support settings
  const handleSupportSave = async (e) => {
    e.preventDefault();
    setSupportLoading(true);
    try {
      await updateSettings(supportSettings);
      toastManager.success('Support settings updated');
    } catch (error) {
      toastManager.error('Failed to update support settings');
    } finally {
      setSupportLoading(false);
    }
  };

  const handleFeeChange = (role, value) => {
    setRegistrationFees(prev => ({ ...prev, [role]: value === '' ? '' : Number(value) }));
  };

  const handleSaveFees = async (e) => {
    e.preventDefault();
    setFeesLoading(true);
    try {
      await Promise.all([
        updateRegistrationFee('USER', registrationFees.USER || 0),
        updateRegistrationFee('VENDOR', registrationFees.VENDOR || 0),
        updateRegistrationFee('WORKER', registrationFees.WORKER || 0)
      ]);
      toastManager.success('Registration fees updated successfully!');
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to update registration fees');
    } finally {
      setFeesLoading(false);
    }
  };

  // Save branding settings
  const handleBrandingSave = async (e) => {
    e.preventDefault();
    setBrandingLoading(true);
    try {
      const res = await updateSettings(brandingSettings);
      if (res.success) {
        toastManager.success('App Branding & Identity updated successfully!');
        if (refreshBrandSettings) refreshBrandSettings();
        try {
          const bc = new BroadcastChannel('agroyilt_branding');
          bc.postMessage({ type: 'BRANDING_UPDATED', data: brandingSettings });
          bc.close();
        } catch (bcErr) {}
        window.dispatchEvent(new CustomEvent('brandingUpdated', { detail: brandingSettings }));
      } else {
        toastManager.error(res.message || 'Failed to update branding');
      }
    } catch (error) {
      console.error('Error updating branding settings:', error);
      toastManager.error('Failed to update branding settings');
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (profile.newPassword && profile.newPassword !== profile.confirmPassword) {
      return toastManager.error('Passwords do not match');
    }
    if (profile.newPassword && !profile.currentPassword) {
      return toastManager.error('Current password required');
    }

    setProfileLoading(true);
    try {
      const updateData = { 
        email: profile.email,
        name: profile.name,
        profilePhoto: profile.profilePhoto,
        bankDetails: profile.bankDetails
      };
      if (profile.newPassword) {
        updateData.currentPassword = profile.currentPassword;
        updateData.newPassword = profile.newPassword;
      } else if (profile.currentPassword) {
        updateData.currentPassword = profile.currentPassword;
      }

      const res = await updateAdminProfile(updateData);
      authStorage.updateUserData('admin', {
        email: profile.email,
        name: profile.name,
        profilePhoto: profile.profilePhoto,
        salary: res?.admin?.salary || { ...(profile.salaryInfo || {}), bankDetails: profile.bankDetails }
      });

      toastManager.success('Profile and payout details updated successfully');
      setProfile(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    const isEdit = !!newAdmin.id;

    if (!newAdmin.name || !newAdmin.email) {
      return toastManager.error('Name and Email are required');
    }
    if (!isEdit && !newAdmin.password) {
      return toastManager.error('Password is required for new admin');
    }

    setAdminLoading(true);
    try {
      // Prepare payload
      const payload = { ...newAdmin };
      if (payload.cityId) {
        const cityObj = cities.find(c => (c._id || c.id) === payload.cityId);
        if (cityObj) payload.cityName = cityObj.name;
      } else {
        delete payload.cityId;
        payload.cityName = '';
      }

      if (isEdit) {
        await updateAdminDetails(newAdmin.id, payload);
        toastManager.success('Admin updated successfully');
      } else {
        await createAdmin(payload);
        toastManager.success('Admin created successfully');
      }
      setNewAdmin({ name: '', email: '', password: '', role: 'admin', cityId: '' });
      setShowAddAdmin(false);
      loadAdmins();
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Operation failed');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleEditClick = (admin) => {
    setNewAdmin({
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      password: '',
      cityId: admin.cityId?._id || admin.cityId || '' // Handle populated or raw ID
    });
    setShowAddAdmin(true);
  };

  const handleBlockAdmin = async (id, currentStatus) => {
    const action = currentStatus ? 'block' : 'unblock';
    if (!window.confirm(`Are you sure you want to ${action} this admin?`)) return;

    try {
      await toggleAdminStatus(id);
      toastManager.success(`Admin ${action}ed`);
      loadAdmins();
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDeleteAdmin = async (id, name) => {
    if (!window.confirm(`Delete admin "${name}"? This cannot be undone.`)) return;
    try {
      await deleteAdmin(id);
      toastManager.success('Admin deleted');
      loadAdmins();
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to delete');
    }
  };

  // Render Function for Main Settings Menu
  const renderMainMenu = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Profile Settings Card */}
      <div onClick={() => setActiveView('profile')}
        className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
        <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
          <FiUser className="w-6 h-6 text-blue-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-2">Profile Settings</h3>
        <p className="text-sm text-gray-500">Manage your personal account details and password</p>
      </div>

      {/* Financial Settings Card - Super Admin Only */}
      {isSuperAdmin && (
        <div onClick={() => setActiveView('financial')}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-100 transition-colors">
            <FiDollarSign className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Financial Info</h3>
          <p className="text-sm text-gray-500">Configure charges, commissions, and billing details</p>
        </div>
      )}

      {/* System Settings Card - Super Admin Only */}
      {isSuperAdmin && (
        <div onClick={() => setActiveView('system')}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-100 transition-colors">
            <FiSettings className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">System & Support</h3>
          <p className="text-sm text-gray-500">Manage auto-assignment and help contact info</p>
        </div>
      )}

      {/* Branding & App Identity Card - Super Admin Only */}
      {isSuperAdmin && (
        <div onClick={() => setActiveView('branding')}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-amber-100 transition-colors">
            <FiGlobe className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Branding & App Identity</h3>
          <p className="text-sm text-gray-500">Change App Name, Logo, Tagline & Browser Favicon</p>
        </div>
      )}

      {/* Admin Management Card - Super Admin Only */}
      {isSuperAdmin && (
        <div onClick={() => navigate('/admin/admin-management')}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-amber-100 transition-colors">
            <FiUsers className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Manage Admins</h3>
          <p className="text-sm text-gray-500">Add, remove, and view all system administrators</p>
        </div>
      )}

    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* Header / Breadcrumb */}
      {activeView !== 'main' && (
        <button onClick={() => setActiveView('main')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 transition-colors">
          <span className="text-lg">←</span> Back to Settings
        </button>
      )}

      {activeView === 'main' && renderMainMenu()}

      <AnimatePresence mode="wait">

        {/* Profile View */}
        {activeView === 'profile' && (
          <motion.div key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
            <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4 mb-8">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl overflow-hidden border-2 border-white shadow-md">
                    {profile.profilePhoto ? (
                      <img src={profile.profilePhoto} alt="Admin" className="w-full h-full object-cover" />
                    ) : profile.name ? (
                      profile.name.charAt(0).toUpperCase()
                    ) : (
                      <FiUser />
                    )}
                  </div>
                  <input
                    type="file"
                    ref={profileInputRef}
                    onChange={handleProfileImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    onClick={() => profileInputRef.current?.click()}
                    disabled={uploadingProfile}
                    className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {uploadingProfile ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiCamera size={10} />}
                  </button>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{profile.name || 'Admin'}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      {isSuperAdmin && <FiShield className="text-amber-500" />}
                      {isSuperAdmin ? 'Super Admin' : 'Admin'} ? {profile.email}
                    </p>
                    {profile.role !== 'super_admin' ? (
                      <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded-lg border border-teal-100 flex items-center gap-1">
                        <FiMapPin className="w-2.5 h-2.5" />
                        {profile.assignedCity || 'Restricted Access'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-lg border border-amber-100">
                        Global Access
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <form onSubmit={handleProfileUpdate} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                      <input type="text" name="name" value={profile.name} onChange={handleProfileChange} required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                      <input type="email" name="email" value={profile.email} onChange={handleProfileChange} required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                    </div>
                  </div>

                <div className="pt-6 border-t border-gray-100 space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Change Password</h3>
                  <div className="space-y-4">
                    <input type="password" name="currentPassword" value={profile.currentPassword} onChange={handleProfileChange}
                      placeholder="Current Password"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input type="password" name="newPassword" value={profile.newPassword} onChange={handleProfileChange}
                        placeholder="New Password"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                      <input type="password" name="confirmPassword" value={profile.confirmPassword} onChange={handleProfileChange}
                        placeholder="Confirm New Password"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    </div>
                  </div>
                </div>

                {/* Assigned Salary & Incentive Package (Read-only for Admin, set by Super Admin) */}
                {profile.salaryInfo && (profile.salaryInfo.baseSalary > 0 || profile.salaryInfo.farmerIncentive > 0 || profile.salaryInfo.vendorIncentive > 0 || profile.salaryInfo.workerIncentive > 0) && (
                  <div className="pt-6 border-t border-gray-100 space-y-3">
                    <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide flex items-center gap-1.5">
                          <FiDollarSign className="text-indigo-600" /> Your Assigned Compensation Structure
                        </h4>
                        <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          Configured by Super Admin
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-white p-2.5 rounded-lg border border-indigo-50 shadow-xs">
                          <p className="text-[10px] text-gray-500">Base Salary</p>
                          <p className="text-sm font-bold text-gray-900">₹{(profile.salaryInfo.baseSalary || 0).toLocaleString()}</p>
                          <p className="text-[10px] text-gray-400 capitalize">{profile.salaryInfo.payFrequency || 'monthly'}</p>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-indigo-50 shadow-xs">
                          <p className="text-[10px] text-gray-500">Per Farmer</p>
                          <p className="text-sm font-bold text-emerald-600">+₹{profile.salaryInfo.farmerIncentive || 0}</p>
                          <p className="text-[10px] text-gray-400">per registration</p>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-indigo-50 shadow-xs">
                          <p className="text-[10px] text-gray-500">Per Owner</p>
                          <p className="text-sm font-bold text-blue-600">+₹{profile.salaryInfo.vendorIncentive || 0}</p>
                          <p className="text-[10px] text-gray-400">per registration</p>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-indigo-50 shadow-xs">
                          <p className="text-[10px] text-gray-500">Per Worker</p>
                          <p className="text-sm font-bold text-purple-600">+₹{profile.salaryInfo.workerIncentive || 0}</p>
                          <p className="text-[10px] text-gray-400">per registration</p>
                        </div>
                      </div>
                      {profile.salaryInfo.notes && (
                        <p className="text-[11px] text-indigo-700 bg-white/80 p-2 rounded-lg border border-indigo-100">
                          <span className="font-semibold">Note from Super Admin:</span> {profile.salaryInfo.notes}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Bank & Payout Information - Admin fills this directly */}
                <div className="pt-6 border-t border-gray-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
                        <FiDollarSign className="text-emerald-600" /> Bank &amp; Payout Information
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Provide your bank account or UPI details to receive your salary and onboarding incentives.
                      </p>
                    </div>
                    {profile.bankDetails?.accountNumber || profile.bankDetails?.upiId ? (
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                        ✓ Details Saved
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                        Pending Details
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Account Holder Name</label>
                      <input
                        type="text"
                        name="accountHolderName"
                        value={profile.bankDetails?.accountHolderName || ''}
                        onChange={handleBankChange}
                        placeholder="Full name as in bank passbook"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Bank Name</label>
                      <input
                        type="text"
                        name="bankName"
                        value={profile.bankDetails?.bankName || ''}
                        onChange={handleBankChange}
                        placeholder="e.g. State Bank of India, HDFC Bank"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Account Number</label>
                      <input
                        type="text"
                        name="accountNumber"
                        value={profile.bankDetails?.accountNumber || ''}
                        onChange={handleBankChange}
                        placeholder="Enter bank account number"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">IFSC Code</label>
                      <input
                        type="text"
                        name="ifscCode"
                        value={profile.bankDetails?.ifscCode || ''}
                        onChange={handleBankChange}
                        placeholder="e.g. SBIN0001234"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm uppercase font-mono"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">UPI ID (Optional)</label>
                      <input
                        type="text"
                        name="upiId"
                        value={profile.bankDetails?.upiId || ''}
                        onChange={handleBankChange}
                        placeholder="e.g. yourname@okhdfcbank"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                  <button type="submit" disabled={profileLoading}
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70 shadow-lg shadow-blue-200 transition-all">
                    {profileLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-5 h-5" />}
                    Update Profile &amp; Payout Info
                  </button>
                </div>
              </form>
            </div>
          </motion.div >
        )}

        {/* Financial View */}
        {
          activeView === 'financial' && (
            <motion.div key="financial" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* General Financial Settings */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-fit">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <FiDollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">Financial Configuration</h2>
                </div>

                <form onSubmit={handleFinancialSave} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Visit Charges (₹)</label>
                      <input type="number" name="visitedCharges" value={financialSettings.visitedCharges} onChange={handleFinancialChange}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Owner Cash Limit (₹)</label>
                      <input type="number" name="vendorCashLimit" value={financialSettings.vendorCashLimit} onChange={handleFinancialChange}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Service GST (%)</label>
                      <input type="number" name="serviceGstPercentage" value={financialSettings.serviceGstPercentage} onChange={handleFinancialChange}
                        min="0" max="100"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                      <p className="text-[10px] text-gray-400 mt-1">GST rate applied to services</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Rental GST (%)</label>
                      <input type="number" name="rentalGstPercentage" value={financialSettings.rentalGstPercentage} onChange={handleFinancialChange}
                        min="0" max="100"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                      <p className="text-[10px] text-gray-400 mt-1">GST rate applied on machine rentals (Agri)</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">TDS Percentage (%)</label>
                      <input type="number" name="tdsPercentage" value={financialSettings.tdsPercentage} onChange={handleFinancialChange}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Platform Fee (%)</label>
                      <input type="number" name="platformFeePercentage" value={financialSettings.platformFeePercentage} onChange={handleFinancialChange}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                      <p className="text-[10px] text-gray-400 mt-1">Fee charged on owner withdrawals</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Cancellation Penalty (₹)</label>
                      <input type="number" name="cancellationPenalty" value={financialSettings.cancellationPenalty} onChange={handleFinancialChange}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                    </div>
                    {/* Vendor Booking Commission Field */}
                    <div className="md:col-span-1">
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-semibold text-gray-500 uppercase">Vendor Commission (%)</label>
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                          Vendor Keeps: {100 - (financialSettings.bookingCommissionPercentage || 0)}%
                        </span>
                      </div>
                      <input
                        type="number" name="bookingCommissionPercentage"
                        value={financialSettings.bookingCommissionPercentage}
                        onChange={handleFinancialChange}
                        min="0" max="100"
                        className="w-full px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-lg outline-none focus:border-orange-500 transition-all font-bold text-orange-700"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Deducted from vendor earnings per machine/equipment booking</p>
                    </div>

                    {/* Worker Commission Field */}
                    <div className="md:col-span-1">
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-semibold text-gray-500 uppercase">Worker Commission (%)</label>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                          Worker Keeps: {100 - (financialSettings.workerCommissionPercentage || 0)}%
                        </span>
                      </div>
                      <input
                        type="number" name="workerCommissionPercentage"
                        value={financialSettings.workerCommissionPercentage}
                        onChange={handleFinancialChange}
                        min="0" max="100"
                        className="w-full px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg outline-none focus:border-emerald-500 transition-all font-bold text-emerald-700"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Deducted from independent worker earnings per completed job</p>
                    </div>

                    {/* Worker Platform Charge */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Worker Booking Platform Fee (%)</label>
                      <input
                        type="number" name="workerPlatformChargePercentage"
                        value={financialSettings.workerPlatformChargePercentage}
                        onChange={handleFinancialChange}
                        min="0" max="100"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all font-bold text-gray-800"
                      />
                    </div>

                    {/* Minimum Withdrawal Amount */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                        Minimum Withdrawal Amount (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 font-bold text-gray-400">₹</span>
                        <input
                          type="number"
                          name="minWithdrawalAmount"
                          value={financialSettings.minWithdrawalAmount}
                          onChange={handleFinancialChange}
                          min="1"
                          step="1"
                          className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all font-bold text-gray-900"
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        System-wide minimum amount required for Farmers, Vendors, and Workers to request a withdrawal (Stored safely as integer paise: ₹{financialSettings.minWithdrawalAmount || 300} = {Math.round((financialSettings.minWithdrawalAmount || 300) * 100)} paise)
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={loading}
                      className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-green-200">
                      {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>

              {/* Billing Information - Super Admin Only */}
              {isSuperAdmin && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-fit">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <FiFileText className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">Billing & Company Details</h2>
                      <p className="text-xs text-gray-500">For invoices and tax documents</p>
                    </div>
                  </div>

                  <form onSubmit={handleBillingSave} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Company Name</label>
                      <input type="text" name="companyName" value={billingSettings.companyName} onChange={handleBillingChange}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">GSTIN</label>
                        <input type="text" name="companyGSTIN" value={billingSettings.companyGSTIN} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500 uppercase" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">PAN</label>
                        <input type="text" name="companyPAN" value={billingSettings.companyPAN} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500 uppercase" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Full Address</label>
                      <textarea name="companyAddress" value={billingSettings.companyAddress} onChange={handleBillingChange} rows="2"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500 resize-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Company Email</label>
                        <input type="email" name="companyEmail" value={billingSettings.companyEmail} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Company Phone</label>
                        <input type="text" name="companyPhone" value={billingSettings.companyPhone} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                        <input type="text" name="companyCity" value={billingSettings.companyCity} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                        <input type="text" name="companyState" value={billingSettings.companyState} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Pincode</label>
                        <input type="text" name="companyPincode" value={billingSettings.companyPincode} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">Invoice Settings</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Prefix</label>
                          <input type="text" name="invoicePrefix" value={billingSettings.invoicePrefix} onChange={handleBillingChange}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500 uppercase" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">SAC Code</label>
                          <input type="text" name="sacCode" value={billingSettings.sacCode} onChange={handleBillingChange}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button type="submit" disabled={billingLoading}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-60">
                        {billingLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-4 h-4" />}
                        Update Billing
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* One-Time Registration Fees Management - Super Admin Only */}
              {isSuperAdmin && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-fit lg:col-span-2">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <FiShield className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">One-Time Registration Fees</h2>
                      <p className="text-xs text-gray-500">Platform activation fees charged to approved accounts on first login (Set 0 for free)</p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveFees} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-emerald-900 uppercase">Farmer (User) Fee</label>
                          <span className="text-[10px] font-semibold text-emerald-600 bg-white px-2 py-0.5 rounded shadow-xs">₹ INR</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={registrationFees.USER}
                          onChange={(e) => handleFeeChange('USER', e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-lg outline-none focus:border-emerald-500 text-lg font-bold text-gray-800"
                          placeholder="0"
                        />
                        <p className="text-[11px] text-gray-500 mt-2">Charged to Farmers on activation</p>
                      </div>

                      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-blue-900 uppercase">Vendor Fee</label>
                          <span className="text-[10px] font-semibold text-blue-600 bg-white px-2 py-0.5 rounded shadow-xs">₹ INR</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={registrationFees.VENDOR}
                          onChange={(e) => handleFeeChange('VENDOR', e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 text-lg font-bold text-gray-800"
                          placeholder="0"
                        />
                        <p className="text-[11px] text-gray-500 mt-2">Equipment & Agri Store Owners</p>
                      </div>

                      <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-purple-900 uppercase">Worker Fee</label>
                          <span className="text-[10px] font-semibold text-purple-600 bg-white px-2 py-0.5 rounded shadow-xs">₹ INR</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={registrationFees.WORKER}
                          onChange={(e) => handleFeeChange('WORKER', e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-purple-200 rounded-lg outline-none focus:border-purple-500 text-lg font-bold text-gray-800"
                          placeholder="0"
                        />
                        <p className="text-[11px] text-gray-500 mt-2">Independent Field Workers / Drivers</p>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={feesLoading}
                        className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-emerald-200 transition-all active:scale-95"
                      >
                        {feesLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-4 h-4" />}
                        Save Registration Fees
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </motion.div>
          )
        }

        {/* System & Support View */}
        {
          activeView === 'system' && (
            <motion.div key="system" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* System Settings */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-fit">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <FiSettings className="w-5 h-5 text-gray-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">System Preferences</h2>
                </div>

                <form onSubmit={handleSystemSave} className="space-y-6">
                  {/* Worker Routing Rules */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Worker Dispatch & Routing</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Max Independent Workers / Req</label>
                        <input type="number" name="maxIndependentWorkerRequest" value={systemSettings.maxIndependentWorkerRequest} onChange={handleSystemChange}
                          min="1" max="100"
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-500 transition-all font-bold text-gray-800" />
                        <p className="text-[10px] text-gray-400 mt-1">Requests above this go to Team Leaders.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Search Radius (km)</label>
                        <input type="number" name="workerSearchRadiusKm" value={systemSettings.workerSearchRadiusKm} onChange={handleSystemChange}
                          min="1" max="1000"
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-500 transition-all font-bold text-gray-800" />
                        <p className="text-[10px] text-gray-400 mt-1">Radius for matching nearby workers.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Extension Expiry (Mins)</label>
                        <input type="number" name="extensionExpiryMinutes" value={systemSettings.extensionExpiryMinutes} onChange={handleSystemChange}
                          min="1" max="180"
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-500 transition-all font-bold text-gray-800" />
                        <p className="text-[10px] text-gray-400 mt-1">Time workers have to accept extension requests.</p>
                      </div>
                    </div>
                  </div>

                  {/* Worker Late-Arrival Penalty Rules (Hourly Only) */}
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Worker Late-Arrival Penalty (Hourly)</h3>
                        <p className="text-xs text-gray-500">Deducts a penalty from worker earnings if worker arrives after grace period.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          name="workerPenaltyEnabled"
                          checked={Boolean(systemSettings.workerPenaltyEnabled)}
                          onChange={handleSystemChange}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                      </label>
                    </div>

                    {systemSettings.workerPenaltyEnabled && (
                      <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/60 space-y-4 animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-amber-950 uppercase mb-1.5">Penalty Rule Type</label>
                            <select
                              name="workerPenaltyType"
                              value={systemSettings.workerPenaltyType}
                              onChange={handleSystemChange}
                              className="w-full px-4 py-2.5 bg-white border border-amber-300 rounded-lg outline-none focus:border-amber-600 font-bold text-gray-800 text-sm"
                            >
                              <option value="fixed">Fixed Flat Penalty (₹)</option>
                              <option value="per_minute">Per Minute Late (₹/min)</option>
                              <option value="percentage">Percentage of Booking (%)</option>
                            </select>
                            <p className="text-[10px] text-amber-700 mt-1">Choose how late penalty is calculated.</p>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-amber-950 uppercase mb-1.5">Grace Period (Free Minutes)</label>
                            <input
                              type="number"
                              name="workerPenaltyFreeMinutes"
                              value={systemSettings.workerPenaltyFreeMinutes}
                              onChange={handleSystemChange}
                              min="0" max="60"
                              className="w-full px-4 py-2.5 bg-white border border-amber-300 rounded-lg outline-none focus:border-amber-600 font-bold text-gray-800 text-sm"
                            />
                            <p className="text-[10px] text-amber-700 mt-1">No penalty applied if arrival is within these minutes.</p>
                          </div>
                        </div>

                        {systemSettings.workerPenaltyType === 'fixed' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                            <div>
                              <label className="block text-xs font-semibold text-amber-950 uppercase mb-1.5">Flat Penalty Amount (₹)</label>
                              <input
                                type="number"
                                name="workerPenaltyAmount"
                                value={systemSettings.workerPenaltyAmount}
                                onChange={handleSystemChange}
                                min="0"
                                className="w-full px-4 py-2.5 bg-white border border-amber-300 rounded-lg outline-none focus:border-amber-600 font-bold text-gray-800 text-sm"
                              />
                              <p className="text-[10px] text-amber-700 mt-1">Fixed rupee deduction on worker earnings.</p>
                            </div>
                          </div>
                        )}

                        {systemSettings.workerPenaltyType === 'per_minute' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                            <div>
                              <label className="block text-xs font-semibold text-amber-950 uppercase mb-1.5">Rate Per Minute (₹/min)</label>
                              <input
                                type="number"
                                name="workerPenaltyPerMinute"
                                value={systemSettings.workerPenaltyPerMinute}
                                onChange={handleSystemChange}
                                min="0"
                                className="w-full px-4 py-2.5 bg-white border border-amber-300 rounded-lg outline-none focus:border-amber-600 font-bold text-gray-800 text-sm"
                              />
                              <p className="text-[10px] text-amber-700 mt-1">Penalty accumulated for each minute late after grace period.</p>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-amber-950 uppercase mb-1.5">Maximum Penalty Cap (₹)</label>
                              <input
                                type="number"
                                name="workerPenaltyMaxAmount"
                                value={systemSettings.workerPenaltyMaxAmount}
                                onChange={handleSystemChange}
                                min="0"
                                className="w-full px-4 py-2.5 bg-white border border-amber-300 rounded-lg outline-none focus:border-amber-600 font-bold text-gray-800 text-sm"
                              />
                              <p className="text-[10px] text-amber-700 mt-1">Maximum penalty ceiling that cannot be exceeded.</p>
                            </div>
                          </div>
                        )}

                        {systemSettings.workerPenaltyType === 'percentage' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                            <div>
                              <label className="block text-xs font-semibold text-amber-950 uppercase mb-1.5">Penalty Percentage (%)</label>
                              <input
                                type="number"
                                name="workerPenaltyPercentage"
                                value={systemSettings.workerPenaltyPercentage}
                                onChange={handleSystemChange}
                                min="0" max="100"
                                className="w-full px-4 py-2.5 bg-white border border-amber-300 rounded-lg outline-none focus:border-amber-600 font-bold text-gray-800 text-sm"
                              />
                              <p className="text-[10px] text-amber-700 mt-1">Deducted as a % of worker gross earnings.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* When workers may start (before the booked time) */}
                  <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-bold text-gray-800">Job Start Timing</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Start Journey opens (minutes before start)</label>
                        <input
                          type="number"
                          name="workerJourneyWindowMinutes"
                          value={systemSettings.workerJourneyWindowMinutes}
                          onChange={handleSystemChange}
                          min="0" max="1440"
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-500 font-bold text-gray-800 text-sm"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Workers cannot mark themselves “on the way” earlier than this. 120 = 2 hours.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Start OTP opens (minutes before start)</label>
                        <input
                          type="number"
                          name="workerEarlyStartMinutes"
                          value={systemSettings.workerEarlyStartMinutes}
                          onChange={handleSystemChange}
                          min="0" max="1440"
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-500 font-bold text-gray-800 text-sm"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">How early work may start if the farmer agrees. Being late is always allowed (late penalty applies).</p>
                      </div>
                    </div>
                  </div>

                  {/* Worker dues & cash bookings */}
                  <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-bold text-gray-800">Worker Dues & Cash Bookings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Dues Limit (₹)</label>
                        <input
                          type="number"
                          name="maxWorkerDues"
                          value={systemSettings.maxWorkerDues}
                          onChange={handleSystemChange}
                          min="0"
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-500 font-bold text-gray-800 text-sm"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">
                          A worker who owes more than this (platform fees, commission, penalties) cannot take new jobs until they pay. They are unblocked automatically once they are back under it.
                        </p>
                      </div>
                      <label className="flex items-start gap-3 cursor-pointer pt-5">
                        <input
                          type="checkbox"
                          name="workerCashPaymentEnabled"
                          checked={Boolean(systemSettings.workerCashPaymentEnabled)}
                          onChange={handleSystemChange}
                          className="w-5 h-5 mt-0.5 accent-gray-800"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-800">Allow cash payment for worker bookings</span>
                          <span className="block text-[10px] text-gray-500">When off, farmers must pay online when booking workers.</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={systemLoading}
                      className="px-6 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 flex items-center gap-2 disabled:opacity-60 shadow-md">
                      {systemLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-4 h-4" />}
                      Save Preferences
                    </button>
                  </div>
                </form>
              </div>

              {/* Support Settings */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-fit">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FiHeadphones className="w-5 h-5 text-blue-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">Contact & Support</h2>
                </div>

                <form onSubmit={handleSupportSave} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Support Email</label>
                    <div className="relative">
                      <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input type="email" name="supportEmail" value={supportSettings.supportEmail} onChange={handleSupportChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Support Phone</label>
                    <div className="relative">
                      <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input type="tel" name="supportPhone" value={supportSettings.supportPhone} onChange={handleSupportChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">WhatsApp Support</label>
                    <div className="relative">
                      <FiMessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input type="tel" name="supportWhatsapp" value={supportSettings.supportWhatsapp} onChange={handleSupportChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={supportLoading}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-blue-200">
                      {supportLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-4 h-4" />}
                      Save Details
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )
        }

        {/* Branding & App Identity View */}
        {
          activeView === 'branding' && (
            <motion.div key="branding" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                    <FiGlobe className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">App Branding & Identity</h2>
                    <p className="text-xs text-gray-500">Changes will instantly update Chrome Tab Title, Favicon Icon & App Logo</p>
                  </div>
                </div>

                <form onSubmit={handleBrandingSave} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">App Name (System Title)</label>
                    <input
                      type="text"
                      name="appName"
                      value={brandingSettings.appName}
                      onChange={(e) => setBrandingSettings(prev => ({ ...prev, appName: e.target.value }))}
                      placeholder="e.g. AgroYilt"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-500 focus:bg-white transition-all"
                      required
                    />
                    <p className="text-[11px] text-gray-400 mt-1">This updates the system branding, Chrome browser tab title, and headers everywhere.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">App Tagline</label>
                    <input
                      type="text"
                      name="appTagline"
                      value={brandingSettings.appTagline}
                      onChange={(e) => setBrandingSettings(prev => ({ ...prev, appTagline: e.target.value }))}
                      placeholder="e.g. Smart Agriculture Equipment Booking"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-amber-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* App Logo Field */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">App Logo Path / Image File</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          name="appLogo"
                          value={brandingSettings.appLogo}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, appLogo: e.target.value }))}
                          placeholder="/AgroyiltLogo.png or https://..."
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-amber-500 focus:bg-white transition-all"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          ref={logoInputRef}
                          onChange={handleLogoFileUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={uploadingLogo}
                          className="px-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-sm disabled:opacity-60"
                        >
                          {uploadingLogo ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiUpload className="w-3.5 h-3.5" />}
                          {uploadingLogo ? 'Uploading...' : 'Choose File'}
                        </button>
                      </div>
                      {/* Logo Preview */}
                      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">Logo Preview:</span>
                        <div className="h-12 w-12 aspect-square rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-200 shadow-sm shrink-0">
                          <img src={brandingSettings.appLogo || "/AgroyiltLogo.png"} alt="Preview" className="w-[125%] h-[125%] max-w-none object-cover object-center" onError={(e) => { e.target.src = "/AgroyiltLogo.png"; }} />
                        </div>
                      </div>
                    </div>

                    {/* App Favicon Field */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Browser Tab Favicon File / Icon URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          name="appFavicon"
                          value={brandingSettings.appFavicon}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, appFavicon: e.target.value }))}
                          placeholder="/AgroyiltLogo.png or https://..."
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-amber-500 focus:bg-white transition-all"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          ref={faviconInputRef}
                          onChange={handleFaviconFileUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => faviconInputRef.current?.click()}
                          disabled={uploadingFavicon}
                          className="px-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-sm disabled:opacity-60"
                        >
                          {uploadingFavicon ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiUpload className="w-3.5 h-3.5" />}
                          {uploadingFavicon ? 'Uploading...' : 'Choose File'}
                        </button>
                      </div>
                      {/* Favicon Preview */}
                      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">Favicon Preview:</span>
                        <img src={brandingSettings.appFavicon || "/AgroyiltLogo.png"} alt="Favicon" className="h-6 w-6 object-contain rounded border bg-white shadow-sm" onError={(e) => { e.target.src = "/AgroyiltLogo.png"; }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t">
                    <button
                      type="submit"
                      disabled={brandingLoading}
                      className="px-8 py-3 bg-amber-600 text-white font-bold rounded-xl text-sm hover:bg-amber-700 flex items-center gap-2 shadow-lg shadow-amber-200 transition-all disabled:opacity-60"
                    >
                      {brandingLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-5 h-5" />}
                      Save Branding & Update App
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )
        }


        {/* Admin Management View - Super Admin Only */}
        {
          activeView === 'admins' && isSuperAdmin && (
            <motion.div key="admins" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <FiUsers className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">Admin Management</h2>
                      <p className="text-sm text-gray-500">Total {admins.length} administrators found</p>
                    </div>
                  </div>
                  <button onClick={() => { setNewAdmin({ name: '', email: '', password: '', role: 'admin', cityId: '' }); setShowAddAdmin(!showAddAdmin); }}
                    className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg transition-all ${showAddAdmin ? 'bg-gray-100 text-gray-600' : 'bg-amber-600 text-white hover:bg-amber-700 shadow-amber-100'}`}>
                    {showAddAdmin ? <FiX className="w-4 h-4" /> : <FiPlus className="w-4 h-4" />}
                    {showAddAdmin ? 'Cancel' : 'Add New Admin'}
                  </button>
                </div>

                {/* Add/Edit Admin Form */}
                <AnimatePresence>
                  {showAddAdmin && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b border-gray-100 bg-amber-50/50">
                      <form onSubmit={handleCreateAdmin} className="p-6">
                        <h3 className="text-sm font-bold text-gray-800 mb-4">{newAdmin.id ? 'Edit Administrator' : 'Create New Administrator'}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4"> {/* Increased columns */}
                          <input type="text" placeholder="Full Name" value={newAdmin.name} onChange={e => setNewAdmin(p => ({ ...p, name: e.target.value }))}
                            className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
                          <input type="email" placeholder="Email Address" value={newAdmin.email} onChange={e => setNewAdmin(p => ({ ...p, email: e.target.value }))}
                            className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
                          <input type="password" placeholder={newAdmin.id ? "Password (leave blank to keep)" : "Password"} value={newAdmin.password} onChange={e => setNewAdmin(p => ({ ...p, password: e.target.value }))}
                            className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />

                          {/* Role Selection */}
                          <select value={newAdmin.role} onChange={e => setNewAdmin(p => ({ ...p, role: e.target.value }))}
                            className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200">
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super Admin</option>
                          </select>

                          {/* City Selection */}
                          <select value={newAdmin.cityId} onChange={e => setNewAdmin(p => ({ ...p, cityId: e.target.value }))}
                            className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200">
                            <option value="">All Cities (Global)</option>
                            {cities.map(city => (
                              <option key={city._id} value={city._id}>
                                {city.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex justify-end mt-4">
                          <button type="submit" disabled={adminLoading}
                            className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60 font-medium text-sm">
                            {adminLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (newAdmin.id ? 'Update Admin' : 'Create Admin')}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Admins Table List */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider border-b border-gray-100">
                        <th className="px-6 py-4 font-semibold">Administrator</th>
                        <th className="px-6 py-4 font-semibold">Role</th>
                        <th className="px-6 py-4 font-semibold">Assigned City</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {admins.map((admin) => (
                        <tr key={admin._id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center font-bold text-gray-600 shadow-sm border border-white">
                                {admin.name?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800 text-sm">{admin.name}</p>
                                <p className="text-xs text-gray-500">{admin.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 text-xs font-bold rounded-full border ${admin.role === 'super_admin'
                              ? 'bg-amber-50 text-amber-700 border-amber-100'
                              : 'bg-blue-50 text-blue-700 border-blue-100'
                              }`}>
                              {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {admin.cityId ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                                {admin.cityId.name || 'Unknown City'}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">All Cities</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`flex items-center gap-1.5 text-xs font-medium ${admin.isActive !== false ? 'text-green-600' : 'text-red-500'}`}>
                              <span className={`w-2 h-2 rounded-full ${admin.isActive !== false ? 'bg-green-500' : 'bg-red-500'}`}></span>
                              {admin.isActive !== false ? 'Active' : 'Blocked'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {admin._id !== profile.id && admin.email !== 'admin@admin.com' && (
                              <div className="flex justify-end gap-2">
                                <button onClick={() => handleEditClick(admin)}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  title="Edit Admin">
                                  <FiEdit className="w-4 h-4" />
                                </button>

                                <button onClick={() => handleBlockAdmin(admin._id, admin.isActive !== false)}
                                  className={`p-2 text-gray-400 rounded-lg transition-all ${admin.isActive !== false ? 'hover:text-amber-600 hover:bg-amber-50' : 'hover:text-green-600 hover:bg-green-50'
                                    }`}
                                  title={admin.isActive !== false ? "Block Admin" : "Unblock Admin"}>
                                  {admin.isActive !== false ? <FiLock className="w-4 h-4" /> : <FiUnlock className="w-4 h-4" />}
                                </button>

                                <button onClick={() => handleDeleteAdmin(admin._id, admin.name)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  title="Delete Admin">
                                  <FiTrash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {admins.length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-6 py-12 text-center text-gray-400">
                            <FiUsers className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>No administrators found</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )
        }
      </AnimatePresence >
    </motion.div >
  );
};
export default AdminSettings;
