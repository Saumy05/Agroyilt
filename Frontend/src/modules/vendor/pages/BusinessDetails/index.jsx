import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiSave, FiUploadCloud, FiCheckCircle, FiMapPin, FiCamera, FiUpload, FiClock, FiAlertCircle } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { vendorTheme as themeColors } from '../../../../theme';
import { FormContainer, FormSection } from '../../../../components/common';
import { vendorAuthService } from '../../../../services/authService';
import api from '../../../../services/api';
import AddressSelectionModal from '../../../user/pages/Checkout/components/AddressSelectionModal';
import authStorage from '../../../../utils/authStorage';

const BusinessDetails = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form State: Lab Registration
  const [isSoilLab, setIsSoilLab] = useState(false);
  const [labName, setLabName] = useState('');
  const [labLicenseNumber, setLabLicenseNumber] = useState('');
  const [certDoc, setCertDoc] = useState('');
  const [certPreview, setCertPreview] = useState('');

  // Form State: Shop Registration
  const [isAgriStore, setIsAgriStore] = useState(false);
  const [shopStatus, setShopStatus] = useState(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [shopFormData, setShopFormData] = useState({
      shopName: '',
      shopAddress: '',
      shopLocation: { lat: null, lng: null },
      shopLicense: '',
      licenseDocument: ''
  });
  const [shopLicenseFile, setShopLicenseFile] = useState(null);

  const [errors, setErrors] = useState({});

  useEffect(() => {
    // Load from tab-isolated session storage first
    const storedVendorData = authStorage.getUserData('vendor') || {};
    if (storedVendorData && Object.keys(storedVendorData).length > 0) {
      setProfile(storedVendorData);
      
      const hasSoilTesting = Array.isArray(storedVendorData.service) 
        ? storedVendorData.service.includes('soil_testing')
        : storedVendorData.service === 'soil_testing';
        
      setIsSoilLab(hasSoilTesting);
      
      if (storedVendorData.labDetails) {
        setLabName(storedVendorData.labDetails.labName || '');
        setLabLicenseNumber(storedVendorData.labDetails.licenseNumber || '');
        setCertPreview(storedVendorData.labDetails.certificationDocument || '');
      }
    }

    const fetchData = async () => {
      try {
        const [profileRes, shopStatusRes] = await Promise.all([
          vendorAuthService.getProfile(),
          api.get('/vendors/shop/status')
        ]);

        if (profileRes.success && profileRes.vendor) {
          const v = profileRes.vendor;
          setProfile(v);
          
          const hasSoilTesting = Array.isArray(v.service) 
            ? v.service.includes('soil_testing')
            : v.service === 'soil_testing';
            
          setIsSoilLab(hasSoilTesting);
          
          if (v.labDetails) {
            setLabName(v.labDetails.labName || '');
            setLabLicenseNumber(v.labDetails.licenseNumber || '');
            setCertPreview(v.labDetails.certificationDocument || '');
          }
        }

        if (shopStatusRes.data.success) {
            setShopStatus(shopStatusRes.data.data);
            if (shopStatusRes.data.data) {
                setIsAgriStore(true);
                setShopFormData({
                    shopName: shopStatusRes.data.data.shopName || '',
                    shopAddress: shopStatusRes.data.data.shopAddress || '',
                    shopLocation: shopStatusRes.data.data.shopLocation || { lat: null, lng: null },
                    shopLicense: shopStatusRes.data.data.shopLicense || '',
                    licenseDocument: shopStatusRes.data.data.licenseDocument || ''
                });
            }
        }

      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLabFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        toastManager.error('File size should not exceed 15MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setCertDoc(reader.result);
        setCertPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleShopFileUpload = async (file) => {
    const uploadData = new FormData();
    uploadData.append('file', file);
    try {
        const res = await api.post('/image/upload', uploadData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data.imageUrl;
    } catch (err) {
        console.error("Upload error:", err.response?.data || err.message);
        toastManager.error("File upload failed: " + (err.response?.data?.message || "Server Error"));
        return null;
    }
  };

  const handleAddressSave = (houseNumber, location) => {
      setShopFormData(prev => ({
          ...prev,
          shopAddress: location.address,
          shopLocation: { lat: location.lat, lng: location.lng }
      }));
      setErrors(prev => ({ ...prev, shopAddress: null }));
      setIsAddressModalOpen(false);
  };

  const validateForm = () => {
    let validationErrors = {};
    
    // Lab Validation
    if (isSoilLab) {
      if (!labName.trim()) {
        validationErrors.labName = 'Lab Name is required';
      } else if (labName.trim().length < 3) {
        validationErrors.labName = 'Lab Name must be at least 3 characters';
      } else if (!/^[A-Za-z0-9\s&*.,-]+$/.test(labName.trim())) {
        validationErrors.labName = 'Special characters are not allowed';
      }
      
      if (!labLicenseNumber.trim()) {
        validationErrors.labLicenseNumber = 'License Number is required';
      } else if (labLicenseNumber.trim().length < 4) {
        validationErrors.labLicenseNumber = 'License Number must be at least 4 characters';
      } else if (!/^[A-Za-z0-9-\s]+$/.test(labLicenseNumber.trim())) {
        validationErrors.labLicenseNumber = 'Only alphanumeric characters and hyphens allowed';
      }
    }

    // Shop Validation
    if (isAgriStore && (!shopStatus || (shopStatus.storeApprovalStatus !== 'pending' && shopStatus.storeApprovalStatus !== 'approved'))) {
        const shopNameRegex = /^[A-Za-z0-9\s&*.,-]{3,50}$/;
        if (!shopFormData.shopName.trim()) {
            validationErrors.shopName = "Shop name is required";
        } else if (!shopNameRegex.test(shopFormData.shopName.trim())) {
            validationErrors.shopName = "Invalid name (3-50 chars)";
        }

        if (!shopFormData.shopAddress) {
            validationErrors.shopAddress = "Please pick your shop location on map";
        }

        const licenseRegex = /^[A-Z0-9-]{5,25}$/i;
        if (!shopFormData.shopLicense.trim()) {
            validationErrors.shopLicense = "License number is required";
        } else if (!licenseRegex.test(shopFormData.shopLicense.trim())) {
            validationErrors.shopLicense = "Invalid format (5-25 alphanumeric chars)";
        }

        if (!shopLicenseFile && !shopFormData.licenseDocument) {
            validationErrors.licenseDocument = "License document photo is required";
        }
    }

    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  const handleSave = async () => {
    if (!profile) return;
    
    if (!validateForm()) {
      toastManager.error('Please fix the errors in the form.');
      return;
    }

    setIsSaving(true);
    let successCount = 0;
    
    try {
      // 1. Update Profile & Lab Details
      let currentServices = Array.isArray(profile.service) 
        ? [...profile.service] 
        : (profile.service ? [profile.service] : []);
        
      if (isSoilLab && !currentServices.includes('soil_testing')) {
        currentServices.push('soil_testing');
      } else if (!isSoilLab && currentServices.includes('soil_testing')) {
        currentServices = currentServices.filter(s => s !== 'soil_testing');
      }

      const updateData = { services: currentServices };
      if (isSoilLab) {
        updateData.labName = labName;
        updateData.licenseNumber = labLicenseNumber;
        if (certDoc) updateData.certificationDocument = certDoc;
      }

      const profileRes = await vendorAuthService.updateBusinessProfile(updateData);
      if (profileRes.success) {
          successCount++;
      } else {
          toastManager.error(profileRes.message || 'Failed to update business profile');
      }

      // 2. Update Shop Details (if opted in and not already pending/approved)
      if (isAgriStore && (!shopStatus || (shopStatus.storeApprovalStatus !== 'pending' && shopStatus.storeApprovalStatus !== 'approved'))) {
          let licenseUrl = shopFormData.licenseDocument;
          if (shopLicenseFile) {
              licenseUrl = await handleShopFileUpload(shopLicenseFile);
          }

          if (licenseUrl || shopFormData.licenseDocument) {
              const payload = {
                  ...shopFormData,
                  licenseDocument: licenseUrl || shopFormData.licenseDocument
              };

              const shopRes = await api.post('/vendors/shop/register', payload);
              if (shopRes.data.success) {
                  successCount++;
              }
          } else {
              toastManager.error("Shop License document upload failed.");
          }
      } else if (isAgriStore && shopStatus) {
         // It's already pending or approved, we just skip updating shop but still mark as success for profile update
         successCount++;
      } else {
          // They didn't opt for Agri Store, we just consider it a success for profile
          successCount++;
      }

      if (successCount > 0) {
        toastManager.success('Details saved successfully!');
        navigate('/vendor/profile', { replace: true });
      }

    } catch (err) {
      console.error('Save error:', err);
      toastManager.error('Server error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: themeColors.backgroundGradient }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: themeColors.button }}></div>
      </div>
    );
  }

  const isShopFormDisabled = shopStatus?.storeApprovalStatus === 'pending' || shopStatus?.storeApprovalStatus === 'approved';

  return (
    <div className="min-h-screen pb-6" style={{ background: themeColors.backgroundGradient }}>
      <div className="bg-white px-4 py-4 flex items-center gap-3 shadow-sm sticky top-0 z-20">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl active:bg-gray-100 transition-colors">
          <FiArrowLeft className="w-5 h-5 text-gray-800" />
        </button>
        <h1 className="text-xl font-bold text-gray-800 flex-1">Business & Registrations</h1>
      </div>

      <main className="p-4">
        <FormContainer>
          {/* Intro / Service Opt-ins */}
          <FormSection subtitle="Services" title="Service Opt-ins">
            <p className="text-xs text-gray-500 mb-2">
              Manage additional services you offer. Registrations will require admin verification.
            </p>

            <div className="space-y-3 pt-2">
                {/* Toggle Agri Store */}
                <div className="flex items-center justify-between p-4 rounded-xl border transition-all duration-300"
                    style={{ borderColor: isAgriStore ? themeColors.button : '#f1f5f9', backgroundColor: isAgriStore ? `${themeColors.button}05` : '#f8fafc' }}>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Operate as Agri-Store</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">Sell Seeds & Fertilizers</p>
                  </div>
                  <button 
                    onClick={() => setIsAgriStore(!isAgriStore)}
                    className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    style={{ backgroundColor: isAgriStore ? themeColors.button : '#cbd5e1' }}
                  >
                    <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isAgriStore ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
            </div>
          </FormSection>



          {/* Shop Registration Form */}
          {isAgriStore && (
            <FormSection subtitle="Seeds & Fertilizer" title="Shop Details" icon={FiCheckCircle}>
              {shopStatus?.storeApprovalStatus === 'pending' && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 flex items-start gap-3">
                      <FiClock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                          <p className="text-sm font-bold text-amber-800">Review in Progress</p>
                          <p className="text-[11px] text-amber-700 mt-0.5">Your application is currently being verified.</p>
                      </div>
                  </div>
              )}

              {shopStatus?.storeApprovalStatus === 'rejected' && (
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 mb-4 flex items-start gap-3">
                      <FiAlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
                      <div>
                          <p className="text-sm font-bold text-rose-800">Application Rejected</p>
                          <p className="text-[11px] text-rose-700 mt-0.5">{shopStatus.remarks || 'Please check your details and re-submit for approval.'}</p>
                      </div>
                  </div>
              )}

              <div className="space-y-4">
                <div>
                    <label className={`block text-xs font-semibold mb-1.5 ml-1 ${errors.shopName ? 'text-red-500' : 'text-gray-700'}`}>Shop Name *</label>
                    <input
                        type="text"
                        disabled={isShopFormDisabled}
                        value={shopFormData.shopName}
                        onChange={(e) => {
                            setShopFormData({...shopFormData, shopName: e.target.value});
                            if (errors.shopName) setErrors({...errors, shopName: null});
                        }}
                        placeholder="Enter Full Shop Name"
                        className={`w-full px-4 py-3 rounded-xl border-2 transition-all text-sm focus:outline-none text-gray-800 ${
                            errors.shopName ? 'border-red-300 bg-red-50 focus:border-red-400' : 'bg-gray-50 border-transparent focus:border-teal-100 focus:bg-white'
                        }`}
                    />
                    {errors.shopName && <p className="text-[10px] text-red-500 mt-1 ml-1 font-semibold">{errors.shopName}</p>}
                </div>

                <div>
                    <label className={`block text-xs font-semibold mb-1.5 ml-1 ${errors.shopAddress ? 'text-red-500' : 'text-gray-700'}`}>Business Location *</label>
                    <div className={`w-full px-4 py-3 bg-gray-50 border border-slate-100 rounded-xl mb-2 flex items-center min-h-[50px]`}>
                        <p className="text-xs text-gray-700 leading-normal font-medium">
                            {shopFormData.shopAddress || <span className="text-gray-400 italic">No location selected yet.</span>}
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={isShopFormDisabled}
                        onClick={() => setIsAddressModalOpen(true)}
                        className={`w-full py-3 bg-teal-50 text-teal-700 rounded-xl font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 border border-teal-100 transition-all shadow-sm ${isShopFormDisabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
                    >
                        <FiMapPin className="w-4 h-4" />
                        Pick verified location
                    </button>
                    {errors.shopAddress && <p className="text-[10px] text-red-500 mt-1 ml-1 font-semibold">{errors.shopAddress}</p>}
                </div>

                <div>
                    <label className={`block text-xs font-semibold mb-1.5 ml-1 ${errors.shopLicense ? 'text-red-500' : 'text-gray-700'}`}>License Number *</label>
                    <input
                        type="text"
                        disabled={isShopFormDisabled}
                        value={shopFormData.shopLicense}
                        onChange={(e) => {
                            setShopFormData({...shopFormData, shopLicense: e.target.value});
                            if (errors.shopLicense) setErrors({...errors, shopLicense: null});
                        }}
                        placeholder="e.g. FERT12345ABC"
                        className={`w-full px-4 py-3 rounded-xl border-2 transition-all text-sm focus:outline-none text-gray-800 uppercase ${
                            errors.shopLicense ? 'border-red-300 bg-red-50 focus:border-red-400' : 'bg-gray-50 border-transparent focus:border-teal-100 focus:bg-white'
                        }`}
                    />
                    {errors.shopLicense && <p className="text-[10px] text-red-500 mt-1 ml-1 font-semibold">{errors.shopLicense}</p>}
                </div>

                <div>
                    <label className={`block text-xs font-semibold mb-1.5 ml-1 ${errors.licenseDocument ? 'text-red-500' : 'text-gray-700'}`}>License Copy (Photos) *</label>
                    <div 
                        className={`border-2 border-dashed ${errors.licenseDocument ? 'border-red-300 bg-red-50' : 'border-gray-200'} rounded-[24px] p-6 flex flex-col items-center justify-center bg-gray-50 transition-all ${isShopFormDisabled ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer active:scale-98 hover:bg-gray-100'}`}
                        onClick={() => {
                            if(!isShopFormDisabled) document.getElementById('shop-license-up').click();
                        }}
                    >
                        <input 
                            type="file" 
                            id="shop-license-up" 
                            className="hidden" 
                            disabled={isShopFormDisabled}
                            accept="image/*,.pdf"
                            onChange={(e) => {
                                setShopLicenseFile(e.target.files[0]);
                                if (errors.licenseDocument) setErrors({...errors, licenseDocument: null});
                            }}
                        />
                        {shopLicenseFile ? (
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center shadow-inner">
                                    <FiCheckCircle className="text-teal-600 w-6 h-6" />
                                </div>
                                <span className="text-[11px] font-bold text-teal-800 truncate max-w-[200px] mt-1">{shopLicenseFile.name}</span>
                                <span className="text-[9px] text-gray-400 font-medium">Click to change file</span>
                            </div>
                        ) : shopFormData.licenseDocument ? (
                            <div className="relative group">
                                <img src={shopFormData.licenseDocument} alt="License" className="h-28 w-auto rounded-xl shadow-md border-4 border-white animate-fade-in" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-xl transition-opacity flex items-center justify-center">
                                    <FiUpload className="text-white w-5 h-5" />
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-2 shadow-sm border border-gray-100 text-gray-300">
                                    <FiCamera className="w-6 h-6" />
                                </div>
                                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Tap to Upload</span>
                                <span className="text-[9px] text-gray-400 mt-1 font-medium">JPG, PNG or PDF</span>
                            </>
                        )}
                    </div>
                    {errors.licenseDocument && <p className="text-[10px] text-red-500 mt-1 ml-1 font-semibold">{errors.licenseDocument}</p>}
                </div>
              </div>
            </FormSection>
          )}
        </FormContainer>
      </main>

      <AddressSelectionModal
          isOpen={isAddressModalOpen}
          onClose={() => setIsAddressModalOpen(false)}
          onSave={handleAddressSave}
          address={shopFormData.shopAddress}
      />

      {/* Save Button */}
      <div className="px-4 pb-8 pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 rounded-xl text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{
            backgroundColor: isSaving ? '#6b7280' : themeColors.button,
            opacity: isSaving ? 0.7 : 1,
            boxShadow: `0 8px 16px ${hexToRgba(themeColors.button, 0.25)}`
          }}
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <FiSave className="w-5 h-5" />
              Save Details
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Helper function
const hexToRgba = (hex, alpha) => {
  if (!hex) return '';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default BusinessDetails;
