import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSave, FiUser, FiBriefcase, FiPhone, FiMail, FiMapPin, FiChevronDown, FiCamera, FiUpload } from 'react-icons/fi';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import { publicCatalogService } from '../../../../services/catalogService';
import { vendorAuthService } from '../../../../services/authService';
import AddressSelectionModal from '../../../user/pages/Checkout/components/AddressSelectionModal';
import { toastManager } from '../../../../utils/toastManager';
import { z } from "zod";
import flutterBridge from '../../../../utils/flutterBridge';
import authStorage from '../../../../utils/authStorage';

// Zod schema
const vendorProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  businessName: z.string().optional(),
  phone: z.string().regex(/^\+?[0-9]{10₹3}$/, "Invalid phone number"),
  email: z.string().email("Invalid email address").optional().or(z.literal('')),
  address: z.custom((val) => {
    return (typeof val === 'string' && val.trim().length > 0) ||
      (typeof val === 'object' && val !== null && (val.fullAddress || val.addressLine1));
  }, "Address is required"),
  serviceCategories: z.any().optional(), // Relaxed validation for debugging
});

const EditProfile = () => {
  const navigate = useNavigate();

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const [formData, setFormData] = useState({
    name: '',
    gender: '',
    businessName: '',
    phone: '',
    email: '',
    address: '',
    serviceCategories: [], // Array for multiple selection
    profilePhoto: '', // URL
    aadharDocument: '', // URL
  });

  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [aadharFile, setAadharFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  // Load service categories from admin config (dynamic)
  const [categories, setCategories] = useState([]);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [errors, setErrors] = useState({});

  const handleNativeCamera = async (target = 'photo') => {
    const file = await flutterBridge.openCamera();
    if (file) {
      if (target === 'photo') {
        setPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(file));
      } else if (target === 'aadhar') {
        setAadharFile(file);
      }
      flutterBridge.hapticFeedback('success');
    }
  };

  useEffect(() => {
    const loadServiceCategories = async () => {
      try {
        const catRes = await publicCatalogService.getCategories();
        if (catRes.success) {
          setCategories(catRes.categories || []);
        }
      } catch (error) {
        console.error('Error loading service categories:', error);
      }
    };

    loadServiceCategories();
  }, []);

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient;

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        // Try to get fresh profile from API
        const response = await vendorAuthService.getProfile();

        if (response.success && response.vendor) {
          const v = response.vendor;

          let addressData = v.address;
          if (typeof v.address === 'string') {
            addressData = { fullAddress: v.address };
          } else if (!v.address) {
            addressData = {};
          }

          setFormData({
            name: v.name || '',
            gender: v.gender || '',
            businessName: v.businessName || '',
            phone: v.phone || '',
            email: v.email || '',
            address: addressData,
            serviceCategories: Array.isArray(v.service) ? v.service : (v.service ? [v.service] : []),
            profilePhoto: v.profilePhoto || '',
            aadharDocument: v.aadharDocument || (v.aadhar && v.aadhar.document) || '',
          });

          // Update tab-isolated vendor session
          authStorage.updateUserData('vendor', v);
        } else {
          // Fallback to tab-isolated session storage if API fails
          const storedData = authStorage.getUserData('vendor') || {};

          if (Object.keys(storedData).length > 0) {
            // ... existing fallback logic ...
            let addressData = storedData.address;
            if (typeof storedData.address === 'string') {
              addressData = { fullAddress: storedData.address };
            } else if (!storedData.address) {
              addressData = {};
            }

            setFormData({
              name: storedData.name || '',
              gender: storedData.gender || '',
              businessName: storedData.businessName || '',
              phone: storedData.phone || '',
              email: storedData.email || '',
              address: addressData,
              serviceCategory: storedData.service || storedData.serviceCategory || '',
              profilePhoto: storedData.profilePhoto || '',
              aadharDocument: storedData.aadharDocument || (storedData.aadhar && storedData.aadhar.document) || '',
            });
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };
    loadProfile();
  }, []);

  const handleAddressSave = (houseNumber, location) => {
    let city = '';
    let state = '';
    let pincode = '';
    let addressLine2 = '';

    // Parse Google Maps address components
    if (location.components) {
      location.components.forEach(comp => {
        if (comp.types.includes('locality')) city = comp.long_name;
        if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
        if (comp.types.includes('postal_code')) pincode = comp.long_name;
        if (comp.types.includes('sublocality')) addressLine2 = comp.long_name;
      });
    }

    // Update FormData with structured address object
    setFormData(prev => ({
      ...prev,
      address: {
        ...(typeof prev.address === 'object' ? prev.address : {}),
        fullAddress: location.address,
        addressLine1: houseNumber, // House/Flat No
        addressLine2: addressLine2, // Sublocality/Street
        city: city,
        state: state,
        pincode: pincode,
        lat: location.lat,
        lng: location.lng
      }
    }));
    setIsAddressModalOpen(false);
  };

  // Upload file helper
  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    let baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    if (!baseUrl) {
      // If no env var, check hostname to determine dev vs prod
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseUrl = 'http://localhost:5000';
      } else {
        // In production, fallback to same origin (relative path)
        baseUrl = window.location.origin;
      }
    }
    baseUrl = baseUrl.replace(/\/api$/, '');
    const response = await fetch(`${baseUrl}/api/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'Upload failed');
    return data.imageUrl;
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toastManager.info('File size should be less than 5MB');
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleAadharChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toastManager.info('File size should be less than 5MB');
        return;
      }
      setAadharFile(file);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null,
      }));
    }
  };

  const handleCategoryChange = (val) => {
    setFormData(prev => {
      const current = prev.serviceCategories || [];
      const updated = current.includes(val)
        ? current.filter(c => c !== val)
        : [...current, val];

      // When categories change, we might want to filter out skills that no longer apply?
      // For now, let's keep all skills or clear them if categories become empty.
      // Better: Keep skills, user can remove them manually.
      return {
        ...prev,
        serviceCategories: updated,
        // skills: [] // Optional: clear skills on category change? Maybe annoying. Let's keep them.
      };
    });
  };

  const handleSubmit = async () => {
    // Zod Validation
    const validationResult = vendorProfileSchema.safeParse({
      name: formData.name,
      businessName: formData.businessName,
      phone: formData.phone,
      email: formData.email,
      address: formData.address,
      serviceCategories: formData.serviceCategories,
    });

    if (!validationResult.success) {
      console.log('Validation failed:', validationResult.error);
      const errorMessage = validationResult.error?.errors?.[0]?.message || 'Validation failed';
      toastManager.error(errorMessage);
      return;
    }

    try {
      setUploading(true);
      let photoUrl = formData.profilePhoto;
      let aadharUrl = formData.aadharDocument;

      // Upload new photo if selected
      if (photoFile) {
        try {
          photoUrl = await uploadFile(photoFile);
        } catch (err) {
          console.error('Photo upload failed:', err);
          toastManager.error('Failed to upload profile photo');
          setUploading(false);
          return;
        }
      }

      // Upload Aadhar if selected
      if (aadharFile) {
        try {
          aadharUrl = await uploadFile(aadharFile);
        } catch (err) {
          console.error('Aadhar upload failed:', err);
          toastManager.error('Failed to upload Aadhar document');
          setUploading(false);
          return;
        }
      }

      // Prepare payload to match backend structure
      // Prepare payload to match backend structure
      const payload = {
        name: formData.name,
        gender: formData.gender || null,
        businessName: formData.businessName,
        address: formData.address,
        serviceCategory: formData.serviceCategories,
        profilePhoto: photoUrl,
        aadharDocument: aadharUrl
      };

      try {
        const response = await vendorAuthService.updateProfile(payload);
        if (response.success) {
          const updatedProfile = { ...response.vendor, skills: formData.skills }; // Keep local skills 

          // Update session
          authStorage.updateUserData('vendor', updatedProfile);

          // Dispatch events
          window.dispatchEvent(new Event('vendorProfileUpdated'));
          window.dispatchEvent(new Event('vendorDataUpdated'));

          navigate('/vendor/profile');
        } else {
          throw new Error(response.message || 'Failed to update profile');
        }
      } catch (apiError) {
        console.error('API update failed:', apiError);
        // Fallback to local storage if API is mock or fails? No, display error
        toastManager.info(apiError.message || 'Failed to save profile on server.');
      }

    } catch (error) {
      console.error('Error saving profile:', error);
      toastManager.error('Failed to save profile. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Edit Profile" />

      <main className="px-4 py-6">
        <div className="space-y-6">
          {/* Profile Photo - Integrated */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="relative group">
              <div
                className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-xl cursor-pointer"
                style={{ background: '#f0f0f0' }}
                onClick={() => flutterBridge.isFlutter ? handleNativeCamera('photo') : null}
              >
                {photoPreview || formData.profilePhoto ? (
                  <img
                    src={photoPreview || formData.profilePhoto}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                    <FiUser className="w-12 h-12" />
                  </div>
                )}
              </div>

              <label
                htmlFor={flutterBridge.isFlutter ? "" : "photo-upload"}
                onClick={() => flutterBridge.isFlutter ? handleNativeCamera('photo') : null}
                className="absolute bottom-1 right-1 p-2 rounded-full cursor-pointer shadow-lg transition-transform active:scale-95 hover:scale-105"
                style={{ background: themeColors.button }}
              >
                <FiCamera className="w-5 h-5 text-white" />
                {!flutterBridge.isFlutter && (
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                )}
              </label>
            </div>
            <p className="text-gray-500 text-xs mt-3 font-medium">Tap icon to change photo</p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiUser className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Name <span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter your name"
              className={`w-full px-4 py-3 bg-white rounded-xl border focus:outline-none focus:ring-2 ${errors.name ? 'border-red-500' : 'border-gray-200'
                }`}
              style={{ focusRingColor: themeColors.button }}
            />
            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiUser className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Owner Gender</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['male', 'female', 'other'].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => handleInputChange('gender', formData.gender === g ? '' : g)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold capitalize transition-all border ${
                    formData.gender === g
                      ? 'text-white shadow-xs'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                  style={formData.gender === g ? { backgroundColor: themeColors.button, borderColor: themeColors.button } : {}}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Business Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiBriefcase className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Business Name</span>
            </label>
            <input
              type="text"
              value={formData.businessName}
              onChange={(e) => handleInputChange('businessName', e.target.value)}
              placeholder="Enter business name"
              className={`w-full px-4 py-3 bg-white rounded-xl border focus:outline-none focus:ring-2 ${errors.businessName ? 'border-red-500' : 'border-gray-200'
                }`}
              style={{ focusRingColor: themeColors.button }}
            />
            {errors.businessName && <p className="text-red-500 text-sm mt-1">{errors.businessName}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiPhone className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Phone Number <span className="text-red-500">*</span></span>
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="Enter phone number"
              className={`w-full px-4 py-3 bg-white rounded-xl border focus:outline-none focus:ring-2 ${errors.phone ? 'border-red-500' : 'border-gray-200'
                }`}
              style={{ focusRingColor: themeColors.button }}
            />
            {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiMail className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Email</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Enter email address"
              className={`w-full px-4 py-3 bg-white rounded-xl border focus:outline-none focus:ring-2 ${errors.email ? 'border-red-500' : 'border-gray-200'
                }`}
              style={{ focusRingColor: themeColors.button }}
            />
            {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiMapPin className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Address <span className="text-red-500">*</span></span>
            </label>

            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 mb-2">
              <p className="text-sm font-medium text-gray-700">
                {formData.address?.fullAddress ||
                  (typeof formData.address === 'string' ? formData.address : '') ||
                  `${formData.address?.addressLine1 || ''} ${formData.address?.city || ''}`
                }
              </p>
              {!formData.address || (typeof formData.address === 'object' && !formData.address.fullAddress && !formData.address.addressLine1) ? (
                <p className="text-xs text-gray-400 italic mt-1">No address set</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setIsAddressModalOpen(true);
              }}
              className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm border border-blue-100 hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
            >
              <FiMapPin className="w-4 h-4" />
              Build/Change Location on Map
            </button>

            {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
          </div>

          {/* Service Category (Multi-Select) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiBriefcase className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Service Categories <span className="text-red-500">*</span></span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <div className="flex flex-wrap gap-2 overflow-hidden">
                  {formData.serviceCategories.length > 0 ? (
                    formData.serviceCategories.map((cat, idx) => (
                      <span key={idx} className="text-sm bg-blue-50 text-blue-700 px-2 py-1 rounded-md">
                        {cat}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400">Select Categories</span>
                  )}
                </div>
                <FiChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isCategoryOpen ? 'rotate-180' : ''}`} />
              </button>

              {isCategoryOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10 bg-transparent"
                    onClick={() => setIsCategoryOpen(false)}
                  />
                  <div className="absolute z-20 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-60 overflow-y-auto">
                    {categories.length > 0 ? (
                      categories.map((cat, index) => {
                        const isSelected = formData.serviceCategories.includes(cat.title);
                        return (
                          <button
                            key={cat._id || index}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent closing dropdown immediately
                              handleCategoryChange(cat.title);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 font-medium text-gray-700 border-b border-gray-50 last:border-0 flex items-center justify-between"
                          >
                            {cat.title}
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                              {isSelected && <span className="text-white text-xs">✓</span>}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-gray-400 text-sm">No categories found</div>
                    )}
                  </div>
                </>
              )}
            </div>
            {errors.serviceCategories && <p className="text-red-500 text-sm mt-1">{errors.serviceCategories}</p>}
          </div>

          {/* Aadhar Document Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiUpload className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Identity Proof (Aadhar) <span className="text-red-500">*</span></span>
            </label>

            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center transition-colors hover:border-blue-300 bg-gray-50 cursor-pointer"
              onClick={() => flutterBridge.isFlutter ? handleNativeCamera('aadhar') : null}
            >
              {!flutterBridge.isFlutter && (
                <input
                  id="aadhar-upload"
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleAadharChange}
                />
              )}
              <label htmlFor={flutterBridge.isFlutter ? "" : "aadhar-upload"} className="cursor-pointer flex flex-col items-center">
                {aadharFile ? (
                  <div className="flex items-center gap-2 text-green-600 font-medium">
                    <FiUpload className="w-5 h-5" />
                    <span className="truncate max-w-[200px]">{aadharFile.name}</span>
                  </div>
                ) : formData.aadharDocument ? (
                  <div className="flex flex-col items-center gap-2 w-full">
                    <div className="w-full h-32 rounded-lg overflow-hidden border border-gray-200 mb-2 relative group-hover:opacity-75 transition-opacity">
                      <img
                        src={formData.aadharDocument}
                        alt="Aadhar Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col items-center">
                      <p className="text-green-600 font-medium text-sm">Document Uploaded</p>
                      <span className="text-xs text-blue-500 underline mt-1">Click to replace</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <FiUpload className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-500 font-bold uppercase tracking-wider">Identity Verification</span>
                    <span className="text-xs text-gray-400 mt-2 px-4 leading-relaxed">Aadhar card is required to verify your identity as a service provider for secure transactions.</span>
                  </>
                )}
              </label>
            </div>
            {errors.aadharDocument && <p className="text-red-500 text-sm mt-1">{errors.aadharDocument}</p>}
          </div>

        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => navigate('/vendor/profile')}
            className="flex-1 py-4 rounded-xl font-semibold text-gray-700 bg-white border-2 border-gray-200 transition-all active:scale-95"
            style={{
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: themeColors.button,
              boxShadow: `0 4px 12px ${themeColors.button}40`,
            }}
          >
            {uploading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </main>

      <AddressSelectionModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        address={(typeof formData.address === 'object' ? formData.address?.fullAddress : formData.address) || ''}
        houseNumber={(typeof formData.address === 'object' ? formData.address?.addressLine1 : '') || ''}
        onHouseNumberChange={(val) => {
          if (typeof formData.address === 'object') {
            setFormData(prev => ({
              ...prev,
              address: { ...prev.address, addressLine1: val }
            }));
          }
        }}
        onSave={handleAddressSave}
      />

      <BottomNav />
    </div>
  );
};

export default EditProfile;

