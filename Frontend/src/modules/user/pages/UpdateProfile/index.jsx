import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiUser, FiMail, FiPhone, FiCamera, FiPlus, FiMapPin, FiTrash2, FiMap, FiCreditCard, FiX } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { themeColors } from '../../../../theme';
import { userAuthService } from '../../../../services/authService';
import AddressSelectionModal from '../Checkout/components/AddressSelectionModal';
import BankDetailsSection from '../../../../components/common/BankDetailsSection';
import { z } from "zod";
import authStorage from '../../../../utils/authStorage';

// Zod schema
const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address").refine(val => val.includes('@'), "Invalid email address").optional().or(z.literal('')),
});

const UpdateProfile = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    gender: '',
    profilePhoto: '', // URL
    farms: [],
  });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);

  // Map state for farms
  const [activeFarmIndex, setActiveFarmIndex] = useState(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  // Fetch user profile on component mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // First check current tab session
        const userData = authStorage.getUserData('user');
        if (userData) {
          setFormData({
            name: userData.name || '',
            email: userData.email || '',
            phone: userData.phone || '',
            gender: userData.gender || '',
            profilePhoto: userData.profilePhoto || '',
            farms: userData.farms || [],
          });
        }

        // Fetch fresh data from API
        const response = await userAuthService.getProfile();
        if (response.success && response.user) {
          const user = response.user;
          setFormData({
            name: user.name || '',
            email: user.email || '',
            phone: user.phone || '',
            gender: user.gender || '',
            profilePhoto: user.profilePhoto || '',
            farms: user.farms || [],
          });

          // Update session with fresh data including photo
          authStorage.updateUserData('user', user);
        }
      } catch (error) {
        // Use session data if API fails
        const userData = authStorage.getUserData('user');
        if (userData) {
          setFormData({
            name: userData.name || '',
            email: userData.email || '',
            phone: userData.phone || '',
            gender: userData.gender || '',
            profilePhoto: userData.profilePhoto || '',
            farms: userData.farms || [],
          });
        } else {
          toastManager.error('Failed to load profile data');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Upload file helper
  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    let baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    if (!baseUrl) {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseUrl = 'http://localhost:5000';
      } else {
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
        toastManager.error('File size should be less than 5MB');
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  // Format phone number for display
  const formatPhoneNumber = (phone) => {
    if (!phone) return '';
    if (phone.startsWith('+91')) return phone;
    if (phone.length === 10) return `+91 ${phone}`;
    return phone;
  };

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
    }
  };

  const handleAddFarm = () => {
    setFormData(prev => ({
      ...prev,
      farms: [
        ...prev.farms,
        {
          name: `Farm ${prev.farms.length + 1}`,
          sizeInAcres: '',
          cropType: [],
          location: { addressLine1: '', city: '', state: '', pincode: '', lat: null, lng: null, fullAddress: '' }
        }
      ]
    }));
  };

  const handleRemoveFarm = (index) => {
    setFormData(prev => ({
      ...prev,
      farms: prev.farms.filter((_, i) => i !== index)
    }));
  };

  const handleFarmChange = (index, field, value) => {
    setFormData(prev => {
      const newFarms = [...prev.farms];
      if (field === 'cropType') {
        // Assume comma separated string input for crop types
        newFarms[index][field] = value.split(',').map(s => s.trim()).filter(s => s);
      } else {
        newFarms[index][field] = value;
      }
      return { ...prev, farms: newFarms };
    });
  };

  const openAddressModalForFarm = (index) => {
    setActiveFarmIndex(index);
    setIsAddressModalOpen(true);
  };

  const handleAddressSave = (houseNumber, location) => {
    let city = '';
    let state = '';
    let pincode = '';

    if (location.components) {
      location.components.forEach(comp => {
        if (comp.types.includes('locality')) city = comp.long_name;
        if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
        if (comp.types.includes('postal_code')) pincode = comp.long_name;
      });
    }

    setFormData(prev => {
      const newFarms = [...prev.farms];
      if (activeFarmIndex !== null && newFarms[activeFarmIndex]) {
        newFarms[activeFarmIndex].location = {
          addressLine1: houseNumber || '',
          city,
          state,
          pincode,
          lat: location.lat,
          lng: location.lng,
          fullAddress: location.address
        };
      }
      return { ...prev, farms: newFarms };
    });
    
    setIsAddressModalOpen(false);
    setActiveFarmIndex(null);
  };

  const handleSave = async () => {
    // Zod Validation
    const validationResult = profileSchema.safeParse({
      name: formData.name.trim(),
      email: formData.email.trim()
    });

    if (!validationResult.success) {
      toastManager.error(validationResult.error?.issues?.[0]?.message || 'Please check your inputs');
      return;
    }

    setIsSaving(true);
    setUploading(true);
    try {
      let photoUrl = formData.profilePhoto;

      // Upload photo if selected
      if (photoFile) {
        try {
          photoUrl = await uploadFile(photoFile);
        } catch (err) {
          console.error('Photo upload failed:', err);
          toastManager.error('Failed to upload profile photo');
          setIsSaving(false);
          setUploading(false);
          return;
        }
      }

      const response = await userAuthService.updateProfile({
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        gender: formData.gender || null,
        profilePhoto: photoUrl,
        farms: formData.farms
      });

      if (response.success) {
        toastManager.success('Profile updated successfully!');
        // Update session
        if (response.user) {
          authStorage.updateUserData('user', response.user);
        }
        navigate('/user/account');
      } else {
        toastManager.error(response.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      toastManager.error(error.response?.data?.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
      setUploading(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiArrowLeft className="w-5 h-5 text-black" />
            </button>
            <h1 className="text-xl font-bold text-black">Update Profile</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        {/* Profile Form */}
        <div className="space-y-4">
          {/* Profile Photo */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="relative group">
              <div
                className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-xl"
                style={{ background: '#f0f0f0' }}
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
                htmlFor="user-photo-upload"
                className="absolute bottom-1 right-1 p-2 rounded-full cursor-pointer shadow-lg transition-transform active:scale-95 hover:scale-105"
                style={{ background: themeColors.button }}
              >
                <FiCamera className="w-5 h-5 text-white" />
                <input
                  id="user-photo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </label>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Full Name
            </label>
            <div className="relative">
              <div
                className="absolute left-3 top-1/2 transform -translate-y-1/2"
                style={{ color: themeColors.button }}
              >
                <FiUser className="w-5 h-5" />
              </div>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                disabled={isLoading}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{
                  focusRingColor: themeColors.button,
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = themeColors.button;
                  e.target.style.boxShadow = '0 0 0 3px rgba(0, 166, 166, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db';
                  e.target.style.boxShadow = 'none';
                }}
                placeholder="Enter your full name"
              />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <div
                className="absolute left-3 top-1/2 transform -translate-y-1/2"
                style={{ color: themeColors.button }}
              >
                <FiMail className="w-5 h-5" />
              </div>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                disabled={isLoading}
                className={`w-full pl-11 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                onFocus={(e) => {
                  e.target.style.borderColor = errors.email ? '#ef4444' : themeColors.button;
                  e.target.style.boxShadow = errors.email ? '0 0 0 3px rgba(239, 68, 68, 0.1)' : '0 0 0 3px rgba(0, 166, 166, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = errors.email ? '#ef4444' : '#d1d5db';
                  e.target.style.boxShadow = 'none';
                }}
                placeholder="Enter your email address"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-500 font-medium ml-1">
                  {errors.email}
                </p>
              )}
            </div>
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Phone Number
            </label>
            <div className="relative">
              <div
                className="absolute left-3 top-1/2 transform -translate-y-1/2"
                style={{ color: themeColors.button }}
              >
                <FiPhone className="w-5 h-5" />
              </div>
              <input
                type="tel"
                name="phone"
                value={formatPhoneNumber(formData.phone)}
                disabled
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed"
                placeholder="Phone number cannot be changed"
              />
              <p className="text-xs text-gray-500 mt-1 ml-1">
                Phone number cannot be changed for security reasons
              </p>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Gender
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['male', 'female', 'other'].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, gender: prev.gender === g ? '' : g }))}
                  className={`py-3 px-3 rounded-xl text-xs font-bold capitalize transition-all border ${
                    formData.gender === g
                      ? 'bg-[#00A6A6] text-white border-[#00A6A6] shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Farms Section */}
          <div className="mt-8 border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <label className="block text-base font-bold text-gray-800">
                Farms / Khet Details
              </label>
              <button
                type="button"
                onClick={handleAddFarm}
                className="flex items-center gap-1 text-sm font-bold transition-colors bg-blue-50 px-3 py-1.5 rounded-lg"
                style={{ color: themeColors.button }}
              >
                <FiPlus className="w-4 h-4" />
                Add Farm
              </button>
            </div>
            
            <div className="space-y-6">
              {formData.farms.map((farm, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative">
                  <button 
                    onClick={() => handleRemoveFarm(index)}
                    className="absolute top-3 right-3 p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                  
                  <div className="space-y-4 pr-8">
                    {/* Farm Name */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Farm Name</label>
                      <input
                        type="text"
                        value={farm.name}
                        onChange={(e) => handleFarmChange(index, 'name', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                        placeholder="e.g. Main Farm, North Field"
                      />
                    </div>
                    
                    <div className="flex gap-4">
                      {/* Farm Size */}
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Size (Acres)</label>
                        <input
                          type="number"
                          value={farm.sizeInAcres}
                          onChange={(e) => handleFarmChange(index, 'sizeInAcres', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                          placeholder="e.g. 10"
                        />
                      </div>
                      
                      {/* Crop Type */}
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Crops</label>
                        <input
                          type="text"
                          value={farm.cropType ? farm.cropType.join(', ') : ''}
                          onChange={(e) => handleFarmChange(index, 'cropType', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                          placeholder="e.g. Wheat, Rice"
                        />
                      </div>
                    </div>
                    
                    {/* Location */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Location</label>
                      <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 mb-2">
                        <p className="text-sm text-gray-700 truncate">
                          {farm.location?.fullAddress || 
                           (farm.location?.city ? `${farm.location.city}, ${farm.location.state}` : '') || 
                           'No location set'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openAddressModalForFarm(index)}
                        className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg font-semibold text-xs border border-blue-100 hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                      >
                        <FiMap className="w-4 h-4" />
                        Pin on Map
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {formData.farms.length === 0 && (
              <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 mt-2">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                  <FiMapPin className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-sm font-bold text-gray-700 mb-1">No Farms Added</h3>
                <p className="text-xs text-gray-500 px-4">Add your farms to get personalized agricultural services and better machinery matching.</p>
              </div>
            )}
          </div>
        </div>

        {/* Banking & Payout Details Card */}
        <div className="mt-6 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
              <FiCreditCard className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-800">Bank & Payout Details</h4>
              <p className="text-xs text-gray-500">Manage account for refunds & withdrawals</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowBankModal(true)}
            className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-lg transition-colors"
          >
            Manage
          </button>
        </div>

        {/* Save Button */}
        <div className="mt-8">
          <button
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="w-full text-white font-bold py-3.5 rounded-xl active:scale-98 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(135deg, ${themeColors.button} 0%, ${themeColors.icon} 100%)`,
              boxShadow: '0 4px 12px rgba(0, 166, 166, 0.4)',
            }}
            onMouseEnter={(e) => {
              if (!isLoading && !isSaving) {
                e.target.style.boxShadow = '0 6px 16px rgba(0, 166, 166, 0.5)';
                e.target.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.boxShadow = '0 4px 12px rgba(0, 166, 166, 0.4)';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </main>

      <AddressSelectionModal
        isOpen={isAddressModalOpen}
        onClose={() => {
          setIsAddressModalOpen(false);
          setActiveFarmIndex(null);
        }}
        address={
          (activeFarmIndex !== null && formData.farms[activeFarmIndex]?.location?.fullAddress) 
          || ''
        }
        houseNumber={
          (activeFarmIndex !== null && formData.farms[activeFarmIndex]?.location?.addressLine1) 
          || ''
        }
        onHouseNumberChange={(val) => {
          if (activeFarmIndex !== null) {
            setFormData(prev => {
              const newFarms = [...prev.farms];
              if (newFarms[activeFarmIndex]) {
                newFarms[activeFarmIndex].location = {
                  ...newFarms[activeFarmIndex].location,
                  addressLine1: val
                };
              }
              return { ...prev, farms: newFarms };
            });
          }
        }}
        onSave={handleAddressSave}
      />

      {/* Bank & Payout Details Modal */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowBankModal(false)}
              className="absolute top-5 right-5 p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors z-10"
              title="Close"
            >
              <FiX className="w-5 h-5" />
            </button>
            <BankDetailsSection />
          </div>
        </div>
      )}
    </div>
  );
};

export default UpdateProfile;
