import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FiArrowLeft,
  FiSearch,
  FiFilter,
  FiPlus,
  FiMapPin,
  FiCheckCircle,
  FiClock,
  FiCalendar,
  FiDollarSign,
  FiPercent,
  FiPhone,
  FiUser,
  FiX,
  FiSend,
  FiLayers,
  FiDroplet,
  FiZap,
  FiShield,
  FiTrash2,
  FiCheck,
  FiInfo,
  FiMaximize2,
  FiChevronRight,
  FiCamera,
  FiUploadCloud,
  FiImage
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import landLeaseService from '../../services/landLeaseService';
import { toastManager } from '../../../../utils/toastManager';
import authStorage from '../../../../utils/authStorage';
import LeasePaymentsModal from './LeasePaymentsModal';
import flutterBridge from '../../../../utils/flutterBridge';
import { uploadToCloudinary } from '../../../../utils/cloudinaryUpload';
import { compressImage } from '../../../../utils/imageCompression';
import FieldAreaMeasurementModal from '../../components/FieldAreaMeasurementModal';
import BoundarySketch from '../../components/common/BoundarySketch';

const LandLeasePage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = authStorage.getUserData('user');

  // Active Main Tab
  const [activeTab, setActiveTab] = useState('explore'); // 'explore' | 'list' | 'my-leases'
  const [myLeasesSubTab, setMyLeasesSubTab] = useState('listings'); // 'listings' | 'offers'

  // Data states
  const [leases, setLeases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [leaseTypeFilter, setLeaseTypeFilter] = useState('all'); // 'all' | 'fixed-rent' | 'crop-share'
  const [sizeFilter, setSizeFilter] = useState('all'); // 'all' | 'small' | 'medium' | 'large'
  const [hideOwnListings, setHideOwnListings] = useState(false);

  // My Land Leases
  const [myListings, setMyListings] = useState([]);
  const [myOffers, setMyOffers] = useState([]);
  const [loadingMyLeases, setLoadingMyLeases] = useState(false);

  // Modals
  const [selectedLandDetail, setSelectedLandDetail] = useState(null);
  const [activeModalImageIndex, setActiveModalImageIndex] = useState(0);
  const [offerModalLand, setOfferModalLand] = useState(null);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [paymentsLandId, setPaymentsLandId] = useState(null);

  // Deep link from a notification: ?tab=my-leases&sub=listings|offers&pay=<landId>
  useEffect(() => {
    if (searchParams.get('tab') === 'my-leases') {
      setActiveTab('my-leases');
      if (['listings', 'offers'].includes(searchParams.get('sub'))) setMyLeasesSubTab(searchParams.get('sub'));
      if (searchParams.get('pay')) setPaymentsLandId(searchParams.get('pay'));
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Offer Form State
  const [offerForm, setOfferForm] = useState({
    proposedPrice: '',
    proposedShare: '',
    durationMonths: 12,
    proposedCrops: '',
    message: ''
  });

  // Listing Form State
  const [listingForm, setListingForm] = useState({
    title: '',
    description: '',
    sizeInAcres: '',
    khasraNumber: '',
    state: 'Rajasthan',
    district: '',
    tehsil: '',
    village: '',
    city: '',
    addressLine1: '',
    pincode: '',
    leaseType: 'fixed-rent',
    pricePerAcre: '',
    sharePercentage: '50',
    availableFrom: new Date().toISOString().split('T')[0],
    availableTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    soilType: 'Alluvial Soil',
    irrigationSource: 'Tubewell',
    electricity: true,
    fencing: false,
    roadAccess: 'Paved Road',
    suitableCrops: 'Wheat, Mustard, Gram',
    images: '',
    boundaryPoints: [] // corners of the land marked on the map (required)
  });
  // Full-screen border tool: { land } when fixing an existing listing, {} when marking for the new listing
  const [boundaryTool, setBoundaryTool] = useState(null);
  const [acceptDialog, setAcceptDialog] = useState(null); // { landId, offer } while the owner chooses the agreement language
  const [listingPhotos, setListingPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showManualUrlInput, setShowManualUrlInput] = useState(false);
  const [manualUrlInput, setManualUrlInput] = useState('');
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [submittingListing, setSubmittingListing] = useState(false);

  // Fetch available land leases
  const fetchLeases = async () => {
    try {
      setLoading(true);
      const res = await landLeaseService.browseLandLeases({
        type: leaseTypeFilter !== 'all' ? leaseTypeFilter : undefined,
        search: searchQuery || undefined
      });
      if (res?.success) {
        setLeases(res.data || []);
      }
    } catch (err) {
      console.error('Error fetching land leases:', err);
      toastManager.error('Failed to load farmland listings');
    } finally {
      setLoading(false);
    }
  };

  // Fetch My Leases
  const fetchMyLeases = async () => {
    try {
      setLoadingMyLeases(true);
      const res = await landLeaseService.getMyLeases();
      if (res?.success) {
        setMyListings(res.data?.myListings || []);
        setMyOffers(res.data?.myOffers || []);
      }
    } catch (err) {
      console.error('Error fetching my leases:', err);
    } finally {
      setLoadingMyLeases(false);
    }
  };

  useEffect(() => {
    fetchLeases();
  }, [leaseTypeFilter]);

  useEffect(() => {
    if (activeTab === 'my-leases') {
      fetchMyLeases();
    }
  }, [activeTab]);

  // Filtered Leases for UI
  const filteredLeases = useMemo(() => {
    return leases.filter((land) => {
      // Lease Type filter
      if (leaseTypeFilter !== 'all' && land.leaseType !== leaseTypeFilter) return false;

      // Size Filter
      if (sizeFilter === 'small' && land.sizeInAcres > 5) return false;
      if (sizeFilter === 'medium' && (land.sizeInAcres <= 5 || land.sizeInAcres > 15)) return false;
      if (sizeFilter === 'large' && land.sizeInAcres <= 15) return false;

      // Hide Own Listings filter if enabled
      const isMine = Boolean(
        land.isOwner ||
        (currentUser && String(land.ownerId?._id || land.ownerId) === String(currentUser._id || currentUser.id))
      );
      if (hideOwnListings && isMine) return false;

      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = land.title?.toLowerCase().includes(q);
        const cityMatch = land.location?.city?.toLowerCase().includes(q);
        const tehsilMatch = land.location?.tehsil?.toLowerCase().includes(q);
        const villageMatch = land.location?.village?.toLowerCase().includes(q);
        const districtMatch = land.location?.district?.toLowerCase().includes(q);
        const stateMatch = land.location?.state?.toLowerCase().includes(q);
        const khasraMatch = land.khasraNumber?.toLowerCase().includes(q);
        return titleMatch || cityMatch || tehsilMatch || villageMatch || districtMatch || stateMatch || khasraMatch;
      }

      return true;
    });
  }, [leases, leaseTypeFilter, sizeFilter, searchQuery, hideOwnListings, currentUser]);

  // Open Offer Modal
  const handleOpenOfferModal = (land) => {
    setOfferModalLand(land);
    setOfferForm({
      proposedPrice: land.leaseType === 'fixed-rent' ? land.pricePerAcre || '' : '',
      proposedShare: land.leaseType === 'crop-share' ? land.sharePercentage || 50 : '',
      durationMonths: 12,
      proposedCrops: (land.suitableCrops || []).join(', '),
      message: ''
    });
  };

  // Submit Offer
  const handleSubmitOffer = async (e) => {
    e.preventDefault();
    if (!offerModalLand) return;

    try {
      setSubmittingOffer(true);
      const res = await landLeaseService.submitOffer(offerModalLand._id, {
        proposedPrice: offerModalLand.leaseType === 'fixed-rent' ? Number(offerForm.proposedPrice) : undefined,
        proposedShare: offerModalLand.leaseType === 'crop-share' ? Number(offerForm.proposedShare) : undefined,
        durationMonths: Number(offerForm.durationMonths) || 12,
        proposedCrops: offerForm.proposedCrops,
        message: offerForm.message
      });

      if (res?.success) {
        toastManager.success('Offer submitted to the owner successfully!');
        setOfferModalLand(null);
        fetchMyLeases();
      } else {
        toastManager.error(res?.message || 'Failed to submit offer');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Error submitting offer');
    } finally {
      setSubmittingOffer(false);
    }
  };

  // Landowner accepts tenant's offer: asks which language the agreement is in, then makes the agreement to sign
  const handleAcceptOffer = (landId, offer) => setAcceptDialog({ landId, offer });

  const confirmAcceptOffer = async (language) => {
    const dialog = acceptDialog;
    if (!dialog) return;
    setAcceptDialog(null);
    try {
      const res = await landLeaseService.acceptOffer(dialog.landId, dialog.offer._id, language);
      if (res?.success) {
        fetchMyLeases();
        fetchLeases();
        if (res.agreementRequired && res.agreementId) {
          toastManager.success('Offer accepted. Now read and sign the agreement.');
          navigate(`/user/agreements/${res.agreementId}`);
        } else {
          toastManager.success('Offer accepted! The lease has been registered.');
        }
      } else {
        toastManager.error(res?.message || 'Failed to accept offer');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Error accepting offer');
    }
  };

  // Landowner rejects tenant's offer
  const handleRejectOffer = async (landId, offerId) => {
    if (!window.confirm('Do you want to reject this offer?')) {
      return;
    }
    try {
      const res = await landLeaseService.rejectOffer(landId, offerId);
      if (res?.success) {
        toastManager.success('Offer rejected');
        fetchMyLeases();
      } else {
        toastManager.error(res?.message || 'Failed to reject offer');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Error rejecting offer');
    }
  };

  // Delete listing
  const handleDeleteLand = async (landId) => {
    if (!window.confirm('Do you want to remove this land listing?')) {
      return;
    }
    try {
      const res = await landLeaseService.deleteLand(landId);
      if (res?.success) {
        toastManager.success('Listing removed');
        fetchMyLeases();
        fetchLeases();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to delete listing');
    }
  };

  // Handle adding photo file(s) (either from camera capture or gallery upload)
  const processAndAddFiles = async (files) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);

    if (listingPhotos.length + fileList.length > 5) {
      toastManager.error('Maximum 5 photos allowed');
      return;
    }

    try {
      setUploadingPhoto(true);
      const newPhotoUrls = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setUploadProgress(Math.round(((i + 1) / fileList.length) * 100));

        // 1. Client-side image compression
        let fileToUpload = file;
        try {
          fileToUpload = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
        } catch (compErr) {
          console.warn('Image compression fallback:', compErr);
        }

        // 2. Upload to Cloudinary with fallback to base64 Data URL
        let photoUrl = null;
        try {
          photoUrl = await uploadToCloudinary(fileToUpload, 'land_leases');
        } catch (uploadErr) {
          console.warn('Cloudinary upload error, using local Data URL fallback:', uploadErr);
          photoUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(fileToUpload);
          });
        }

        if (photoUrl) {
          newPhotoUrls.push(photoUrl);
        }
      }

      if (newPhotoUrls.length > 0) {
        setListingPhotos((prev) => [...prev, ...newPhotoUrls]);
        toastManager.success(`${newPhotoUrls.length} photo(s) added successfully`);
      }
    } catch (err) {
      console.error('Error uploading land photos:', err);
      toastManager.error('Problem adding photo');
    } finally {
      setUploadingPhoto(false);
      setUploadProgress(0);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  // Direct Camera Trigger
  const handleTriggerCamera = async () => {
    if (flutterBridge.isFlutter) {
      try {
        const file = await flutterBridge.openCamera();
        if (file) {
          await processAndAddFiles([file]);
          return;
        }
      } catch (err) {
        console.warn('Flutter native camera failed, fallback to HTML:', err);
      }
    }
    cameraInputRef.current?.click();
  };

  // Gallery Picker Trigger
  const handleTriggerGallery = () => {
    galleryInputRef.current?.click();
  };

  // Remove photo
  const handleRemovePhoto = (index) => {
    setListingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Add URL photo manually
  const handleAddManualUrl = () => {
    if (!manualUrlInput.trim()) return;
    if (listingPhotos.length >= 5) {
      toastManager.error('Maximum 5 photos allowed');
      return;
    }
    setListingPhotos((prev) => [...prev, manualUrlInput.trim()]);
    setManualUrlInput('');
    setShowManualUrlInput(false);
    toastManager.success('Photo link added');
  };

  // The border was marked: for a new listing keep it in the form; for an existing listing save it now
  const handleBoundaryApplied = async (field) => {
    const tool = boundaryTool;
    setBoundaryTool(null);
    if (!field?.points || field.points.length < 3) return;
    if (tool?.land) {
      try {
        const res = await landLeaseService.setBoundary(tool.land._id, field.points);
        if (res?.success) {
          toastManager.success('Land border saved');
          fetchMyLeases();
        } else {
          toastManager.error(res?.message || 'Could not save the border');
        }
      } catch (err) {
        toastManager.error(err.response?.data?.message || 'Could not save the border');
      }
      return;
    }
    setListingForm((f) => ({
      ...f,
      boundaryPoints: field.points,
      sizeInAcres: String(Math.round(field.acres * 100) / 100)
    }));
  };

  // Handle Create Listing
  const handleCreateListing = async (e) => {
    e.preventDefault();
    if (!listingForm.title || !listingForm.sizeInAcres || !listingForm.khasraNumber) {
      return toastManager.error('Please enter the title, area (acres) and khasra number');
    }
    if (!listingForm.district || !listingForm.tehsil || !listingForm.village) {
      return toastManager.error('Please enter the district, tehsil and village details');
    }
    if (!listingForm.boundaryPoints || listingForm.boundaryPoints.length < 3) {
      return toastManager.error('Please mark the land border on the map first');
    }

    try {
      setSubmittingListing(true);
      const cropsArray = listingForm.suitableCrops
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      // Photos to save: use uploaded photos if available, else manual URL or realistic fallback
      let finalImages = [...listingPhotos];
      if (finalImages.length === 0 && listingForm.images && listingForm.images.trim()) {
        finalImages = listingForm.images
          .split(',')
          .map((img) => img.trim())
          .filter(Boolean);
      }
      if (finalImages.length === 0) {
        finalImages = ['https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80'];
      }

      const payload = {
        title: listingForm.title,
        description: listingForm.description,
        sizeInAcres: Number(listingForm.sizeInAcres),
        khasraNumber: listingForm.khasraNumber,
        location: {
          addressLine1: listingForm.addressLine1,
          village: listingForm.village,
          tehsil: listingForm.tehsil,
          city: listingForm.tehsil || listingForm.village || listingForm.district,
          district: listingForm.district || listingForm.tehsil,
          state: listingForm.state,
          pincode: listingForm.pincode,
          fullAddress: [
            listingForm.addressLine1,
            listingForm.village ? `Village ${listingForm.village}` : '',
            listingForm.tehsil ? `Tehsil ${listingForm.tehsil}` : '',
            listingForm.district ? `District ${listingForm.district}` : '',
            listingForm.state
          ].filter(Boolean).join(', ')
        },
        leaseType: listingForm.leaseType,
        pricePerAcre: listingForm.leaseType === 'fixed-rent' ? Number(listingForm.pricePerAcre) : null,
        sharePercentage: listingForm.leaseType === 'crop-share' ? Number(listingForm.sharePercentage) : null,
        availableFrom: listingForm.availableFrom,
        availableTo: listingForm.availableTo,
        soilType: listingForm.soilType,
        irrigationSource: listingForm.irrigationSource,
        electricity: listingForm.electricity,
        fencing: listingForm.fencing,
        roadAccess: listingForm.roadAccess,
        suitableCrops: cropsArray,
        images: finalImages,
        boundaryPoints: listingForm.boundaryPoints
      };

      const res = await landLeaseService.listLand(payload);
      if (res?.success) {
        toastManager.success('Land listed successfully!');
        setListingPhotos([]);
        setListingForm({
          title: '',
          description: '',
          sizeInAcres: '',
          khasraNumber: '',
          state: 'Rajasthan',
          district: '',
          tehsil: '',
          village: '',
          city: '',
          addressLine1: '',
          pincode: '',
          leaseType: 'fixed-rent',
          pricePerAcre: '',
          sharePercentage: '50',
          availableFrom: new Date().toISOString().split('T')[0],
          availableTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          soilType: 'Alluvial Soil',
          irrigationSource: 'Tubewell',
          electricity: true,
          fencing: false,
          roadAccess: 'Paved Road',
          suitableCrops: 'Wheat, Mustard, Gram',
          images: '',
          boundaryPoints: []
        });
        setActiveTab('explore');
        fetchLeases();
        fetchMyLeases();
      } else {
        toastManager.error(res?.message || 'Failed to list land');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Error listing land');
    } finally {
      setSubmittingListing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF7] text-gray-900 pb-20">
      {/* 1. Ultra-Compact Sticky Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-emerald-800 via-teal-900 to-[#1b4332] text-white px-3 py-2 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          {/* Back & Title */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 active:scale-95 border border-white/10"
              aria-label="Go Back"
            >
              <FiArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-black text-white truncate leading-tight">
                Land Lease & Contract
              </h1>
              <p className="text-[10px] text-emerald-200/90 font-medium truncate">
                Fixed Rent & Crop Share Marketplace
              </p>
            </div>
          </div>

          {/* Compact Tab Pills */}
          <div className="flex items-center gap-0.5 p-0.5 bg-black/35 backdrop-blur-md rounded-xl shrink-0 border border-white/15 text-[11px] sm:text-xs">
            <button
              onClick={() => setActiveTab('explore')}
              className={`py-1 px-2.5 rounded-lg font-bold transition-all ${
                activeTab === 'explore'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-emerald-100/90 hover:text-white'
              }`}
            >
              🌾 Browse
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`py-1 px-2.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                activeTab === 'list'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-emerald-100/90 hover:text-white'
              }`}
            >
              <FiPlus className="w-3 h-3 text-emerald-700" />
              <span>List Land</span>
            </button>
            <button
              onClick={() => setActiveTab('my-leases')}
              className={`py-1 px-2.5 rounded-lg font-bold transition-all ${
                activeTab === 'my-leases'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-emerald-100/90 hover:text-white'
              }`}
            >
              📑 My Records
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 mt-2 sm:mt-3">
        {/* ========================================================
            TAB 1: EXPLORE / BROWSE FARMLAND
        ======================================================== */}
        {activeTab === 'explore' && (
          <div>
            {/* Compact Search & Horizontal Filter Strip */}
            <div className="bg-white rounded-xl p-2 sm:p-2.5 shadow-2xs border border-gray-200/80 mb-2 space-y-1.5">
              <div className="relative">
                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Search by farm name, district, tehsil, village, khasra number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-gray-50 rounded-lg text-xs border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:bg-white text-gray-800"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Single Line Scrollable Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
                <button
                  onClick={() => setLeaseTypeFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all ${
                    leaseTypeFilter === 'all'
                      ? 'bg-emerald-800 text-white shadow-2xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setLeaseTypeFilter('fixed-rent')}
                  className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    leaseTypeFilter === 'fixed-rent'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <FiDollarSign className="w-3 h-3" /> Fixed Rent
                </button>
                <button
                  onClick={() => setLeaseTypeFilter('crop-share')}
                  className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    leaseTypeFilter === 'crop-share'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <FiPercent className="w-3 h-3" /> Crop Share
                </button>

                <div className="h-4 w-[1px] bg-gray-200 shrink-0" />

                {[
                  { id: 'all', label: 'All Sizes' },
                  { id: 'small', label: '1-5 Acres' },
                  { id: 'medium', label: '5-15 Acres' },
                  { id: 'large', label: '15+ Acres' }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSizeFilter(s.id)}
                    className={`px-2 py-1 rounded-lg font-medium whitespace-nowrap transition-all ${
                      sizeFilter === s.id
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}

                <div className="h-4 w-[1px] bg-gray-200 shrink-0" />

                <button
                  onClick={() => setHideOwnListings(!hideOwnListings)}
                  className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    hideOwnListings
                      ? 'bg-emerald-800 text-white shadow-2xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {hideOwnListings ? '✓ Own listings hidden' : 'Hide my lands'}
                </button>
              </div>
            </div>

            {/* Results Count & Refresh */}
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[11px] font-bold text-gray-500">
                Available farmland: <b className="text-gray-800">{filteredLeases.length} listings</b>
              </span>
              <button
                onClick={fetchLeases}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
              >
                Refresh ↻
              </button>
            </div>

            {/* Farmland Grid (Compact Cards) */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="bg-white rounded-xl p-3 shadow-2xs animate-pulse border border-gray-100">
                    <div className="h-32 bg-gray-200 rounded-lg mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-3/4 mb-1.5" />
                    <div className="h-2.5 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredLeases.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center border border-gray-200/80 shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center text-xl mb-2">
                  🌾
                </div>
                <h3 className="text-sm font-bold text-gray-800">No land listings found</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Try changing the filters or add your own land.
                </p>
                <button
                  onClick={() => {
                    setLeaseTypeFilter('all');
                    setSizeFilter('all');
                    setSearchQuery('');
                  }}
                  className="mt-3 px-3.5 py-1.5 bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-2xs hover:bg-emerald-900"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {filteredLeases.map((land) => {
                  const isOwnLand = Boolean(
                    land.isOwner ||
                    (currentUser && String(land.ownerId?._id || land.ownerId) === String(currentUser._id || currentUser.id))
                  );

                  return (
                    <motion.div
                      key={land._id}
                      whileHover={{ y: -1 }}
                      className="bg-white rounded-xl overflow-hidden shadow-2xs border border-gray-200/90 hover:shadow-xs transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Compact Image Banner */}
                        <div className="relative h-32 sm:h-36 w-full bg-gray-100 overflow-hidden">
                          <img
                            src={land.images?.[0] || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80'}
                            alt={land.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                          {/* Top Left Badge: Lease Type */}
                          <div className="absolute top-2 left-2">
                            {land.leaseType === 'fixed-rent' ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-600 text-white shadow-xs">
                                <FiDollarSign className="w-3 h-3" />
                                ₹{Number(land.pricePerAcre || 0).toLocaleString('en-IN')}/acre/year
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-white shadow-xs">
                                <FiPercent className="w-3 h-3" />
                                {land.sharePercentage}% Crop Share
                              </span>
                            )}
                          </div>

                          {/* Top Right Badges: Status & Own Land indicator */}
                          <div className="absolute top-2 right-2 flex items-center gap-1">
                            {isOwnLand && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black shadow-xs bg-blue-600 text-white">
                                Your Listing
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs ${
                                land.status === 'leased'
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-black/50 backdrop-blur-md text-emerald-200'
                              }`}
                            >
                              {land.status === 'leased' ? 'Leased' : 'Available'}
                            </span>
                          </div>

                          {/* Bottom Overlay Info */}
                          <div className="absolute bottom-2 left-2 right-2 text-white flex items-center justify-between">
                            <div className="flex items-center gap-1 text-[11px] font-bold drop-shadow-sm truncate">
                              <FiMapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span className="truncate">
                                {[
                                  land.location?.village ? `Village ${land.location.village}` : '',
                                  land.location?.tehsil ? `Tehsil ${land.location.tehsil}` : (land.location?.city || ''),
                                  land.location?.district
                                ].filter(Boolean).join(', ') || land.location?.state || 'Rajasthan'}
                              </span>
                            </div>
                            <span className="bg-black/50 backdrop-blur-md px-1.5 py-0.5 rounded text-[10.5px] font-black text-emerald-200 shrink-0 ml-1">
                              {land.sizeInAcres} acres
                            </span>
                          </div>
                        </div>

                        {/* Content Card Body */}
                        <div className="p-2.5 space-y-1.5">
                          <div>
                            <h3 className="font-extrabold text-xs sm:text-sm text-gray-900 line-clamp-1 leading-snug">
                              {land.title}
                            </h3>
                            <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
                              {land.description}
                            </p>
                          </div>

                          {/* Compact Agricultural Features Strip */}
                          <div className="flex flex-wrap items-center gap-1 text-[10.5px] text-gray-600">
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded font-medium">
                              🌱 {land.soilType?.split(' ')[0] || 'Alluvial'}
                            </span>
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded font-medium">
                              💧 {land.irrigationSource?.split('/')[0] || 'Tubewell'}
                            </span>
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded font-medium">
                              Khasra: {land.khasraNumber}
                            </span>
                          </div>

                          {/* Owner Info & Verified Tag */}
                          <div className="flex items-center justify-between text-[10.5px] text-gray-500 pt-1 border-t border-gray-100">
                            <span className="inline-flex items-center gap-1 text-emerald-800 font-bold truncate">
                              <FiShield className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="truncate">{isOwnLand ? 'Your own land' : (land.owner?.name || 'Verified Owner')}</span>
                            </span>
                            <span className="text-gray-400 font-medium shrink-0">
                              {land.roadAccess?.split('/')[0] || 'Paved Road'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="p-2.5 pt-0 grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => setSelectedLandDetail(land)}
                          className="py-1.5 px-2 rounded-lg border border-emerald-900/20 text-emerald-900 hover:bg-emerald-50 text-xs font-bold transition-all flex items-center justify-center gap-1"
                        >
                          <FiMaximize2 className="w-3 h-3" />
                          <span>Details</span>
                        </button>

                        {isOwnLand ? (
                          <button
                            onClick={() => {
                              setActiveTab('my-leases');
                              setMyLeasesSubTab('listings');
                            }}
                            className="py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-2xs bg-blue-700 hover:bg-blue-800 text-white active:scale-95"
                          >
                            <FiCheckCircle className="w-3 h-3" />
                            <span>Manage</span>
                          </button>
                        ) : (
                          <button
                            disabled={land.status === 'leased'}
                            onClick={() => handleOpenOfferModal(land)}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-2xs ${
                              land.status === 'leased'
                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                : 'bg-emerald-800 hover:bg-emerald-900 text-white active:scale-95'
                            }`}
                          >
                            <FiSend className="w-3 h-3" />
                            <span>Make Offer</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 2: LIST FARMLAND FOR LEASE
        ======================================================== */}
        {activeTab === 'list' && (
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-emerald-900/10 mb-8 max-w-2xl mx-auto">
            <div className="border-b border-gray-100 pb-4 mb-5">
              <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-700">
                Farmland Listing Form
              </span>
              <h2 className="text-lg sm:text-xl font-black text-gray-900">
                List your farmland for lease / contract
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Enter your land area, location and lease model (fixed rent or crop share) to receive offers from other farmers right away.
              </p>
            </div>

            <form onSubmit={handleCreateListing} className="space-y-4 text-xs sm:text-sm">
              {/* Title */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  Land Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 10 acre fertile canal-irrigated field, Suratgarh Road"
                  value={listingForm.title}
                  onChange={(e) => setListingForm({ ...listingForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  Description & Features
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe soil fertility, water source, electricity connection and road connectivity..."
                  value={listingForm.description}
                  onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                />
              </div>

              {/* Size in Acres & Khasra No */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Size in Acres <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="e.g. 12"
                    value={listingForm.sizeInAcres}
                    onChange={(e) => setListingForm({ ...listingForm, sizeInAcres: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Khasra / Khata No. <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 142/18"
                    value={listingForm.khasraNumber}
                    onChange={(e) => setListingForm({ ...listingForm, khasraNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>
              </div>

              {/* Land border on the map: the agreement describes the land by these corners */}
              <div className={`rounded-2xl border p-3.5 space-y-2.5 ${listingForm.boundaryPoints.length >= 3 ? 'border-emerald-300 bg-emerald-50/60' : 'border-amber-300 bg-amber-50/60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-900 flex items-center gap-1.5">
                      <FiMapPin className="w-4 h-4 text-emerald-700" />
                      Land border on map <span className="text-red-500">*</span>
                      <span className="text-[11px] font-semibold text-gray-500">(भूमि की सीमा)</span>
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">
                      Stand on your land and tap each corner. These corners go into the lease agreement so everyone knows exactly which land it is.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBoundaryTool({})}
                    className="shrink-0 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5 active:scale-95"
                  >
                    <FiMapPin className="w-3.5 h-3.5" />
                    {listingForm.boundaryPoints.length >= 3 ? 'Edit border' : 'Mark border'}
                  </button>
                </div>
                {listingForm.boundaryPoints.length >= 3 && (
                  <div className="flex items-center gap-3">
                    <BoundarySketch points={listingForm.boundaryPoints} size={120} />
                    <p className="text-xs font-semibold text-emerald-900">
                      {listingForm.boundaryPoints.length} corners marked
                      <span className="block text-[11px] font-medium text-emerald-800/80">Area filled in from the border: {listingForm.sizeInAcres} acres</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Location Fields: Separate Tehsil and Village */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">State</label>
                  <input
                    type="text"
                    value={listingForm.state}
                    onChange={(e) => setListingForm({ ...listingForm, state: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    District <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kota"
                    value={listingForm.district}
                    onChange={(e) => setListingForm({ ...listingForm, district: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Tehsil <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ladpura"
                    value={listingForm.tehsil}
                    onChange={(e) => setListingForm({ ...listingForm, tehsil: e.target.value, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Village <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ranpur"
                    value={listingForm.village}
                    onChange={(e) => setListingForm({ ...listingForm, village: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>
              </div>

              {/* Lease Type Selection (Fixed Rent vs Crop Share) */}
              <div className="pt-2">
                <label className="block font-bold text-gray-800 mb-2">
                  Lease Arrangement <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setListingForm({ ...listingForm, leaseType: 'fixed-rent' })}
                    className={`p-3.5 rounded-2xl cursor-pointer border-2 transition-all ${
                      listingForm.leaseType === 'fixed-rent'
                        ? 'border-emerald-600 bg-emerald-50/60 shadow-xs'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
                        <FiDollarSign className="w-4 h-4 text-emerald-600" />
                        Fixed Rent
                      </span>
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          listingForm.leaseType === 'fixed-rent'
                            ? 'border-emerald-700 bg-emerald-700'
                            : 'border-gray-300'
                        }`}
                      >
                        {listingForm.leaseType === 'fixed-rent' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Receive a fixed cash rent every year (e.g. ₹35,000 / acre / year)
                    </p>
                  </div>

                  <div
                    onClick={() => setListingForm({ ...listingForm, leaseType: 'crop-share' })}
                    className={`p-3.5 rounded-2xl cursor-pointer border-2 transition-all ${
                      listingForm.leaseType === 'crop-share'
                        ? 'border-amber-600 bg-amber-50/60 shadow-xs'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
                        <FiPercent className="w-4 h-4 text-amber-600" />
                        Crop Share (Batai)
                      </span>
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          listingForm.leaseType === 'crop-share'
                            ? 'border-amber-600 bg-amber-600'
                            : 'border-gray-300'
                        }`}
                      >
                        {listingForm.leaseType === 'crop-share' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Share in the produce (e.g. 50-50 or 60-40 arrangement)
                    </p>
                  </div>
                </div>
              </div>

              {/* Dynamic Price / Share Field based on choice */}
              {listingForm.leaseType === 'fixed-rent' ? (
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Asking Annual Rent (₹ / acre / year) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 35000"
                    value={listingForm.pricePerAcre}
                    onChange={(e) => setListingForm({ ...listingForm, pricePerAcre: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-bold"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Owner Crop Share % <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={listingForm.sharePercentage}
                    onChange={(e) => setListingForm({ ...listingForm, sharePercentage: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white text-gray-900 font-bold"
                  >
                    <option value="50">50% owner share (50-50 Batai)</option>
                    <option value="60">60% owner share (60-40 Batai)</option>
                    <option value="40">40% owner share (40-60 Batai)</option>
                    <option value="33">33.3% owner share (1/3rd Batai)</option>
                  </select>
                </div>
              )}

              {/* Soil & Irrigation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Soil Type</label>
                  <select
                    value={listingForm.soilType}
                    onChange={(e) => setListingForm({ ...listingForm, soilType: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  >
                    <option value="Alluvial Soil">Alluvial Soil</option>
                    <option value="Black Cotton Soil">Black Cotton Soil</option>
                    <option value="Sandy Loam">Sandy Loam</option>
                    <option value="Red Soil">Red Soil</option>
                    <option value="Clay Soil">Clay Soil</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-800 mb-1">Irrigation Source</label>
                  <select
                    value={listingForm.irrigationSource}
                    onChange={(e) => setListingForm({ ...listingForm, irrigationSource: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  >
                    <option value="Tubewell">Tubewell</option>
                    <option value="Canal">Canal</option>
                    <option value="Canal + Tubewell">Canal + Tubewell</option>
                    <option value="Solar Pump">Solar Pump</option>
                    <option value="Drip System">Drip System</option>
                    <option value="Rainfed">Rainfed</option>
                  </select>
                </div>
              </div>

              {/* Facilities check */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={listingForm.electricity}
                    onChange={(e) => setListingForm({ ...listingForm, electricity: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="font-semibold text-gray-700">3-Phase Farm Electricity</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={listingForm.fencing}
                    onChange={(e) => setListingForm({ ...listingForm, fencing: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="font-semibold text-gray-700">Fencing</span>
                </label>
              </div>

              {/* Photo Upload & Camera Section */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-bold text-gray-800">
                    Farmland Photos
                  </label>
                  <span className="text-[11px] font-semibold text-gray-500">
                    {listingPhotos.length}/5 photos added
                  </span>
                </div>

                {/* Hidden native file inputs */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => processAndAddFiles(e.target.files)}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => processAndAddFiles(e.target.files)}
                />

                {/* Action buttons: Direct Camera & Gallery Upload */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    type="button"
                    disabled={uploadingPhoto || listingPhotos.length >= 5}
                    onClick={handleTriggerCamera}
                    className="p-3 sm:p-4 rounded-2xl border-2 border-dashed border-emerald-600 bg-emerald-50/70 hover:bg-emerald-100/70 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 text-emerald-900 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                      <FiCamera className="w-5 h-5" />
                    </div>
                    <span className="font-extrabold text-xs sm:text-sm">Take Photo (Camera)</span>
                    <span className="text-[10px] text-emerald-700/80 font-medium">Take a photo directly with the camera</span>
                  </button>

                  <button
                    type="button"
                    disabled={uploadingPhoto || listingPhotos.length >= 5}
                    onClick={handleTriggerGallery}
                    className="p-3 sm:p-4 rounded-2xl border-2 border-dashed border-teal-600 bg-teal-50/70 hover:bg-teal-100/70 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 text-teal-900 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                      <FiUploadCloud className="w-5 h-5" />
                    </div>
                    <span className="font-extrabold text-xs sm:text-sm">Choose from Gallery (Upload)</span>
                    <span className="text-[10px] text-teal-700/80 font-medium">File from phone or computer</span>
                  </button>
                </div>

                {/* Upload Spinner / Progress */}
                {uploadingPhoto && (
                  <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-emerald-900">Preparing and uploading photo...</p>
                      <div className="w-full bg-emerald-200 h-1.5 rounded-full mt-1 overflow-hidden">
                        <div
                          className="bg-emerald-700 h-full transition-all duration-300"
                          style={{ width: `${uploadProgress || 50}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Photos Preview Grid */}
                {listingPhotos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-3">
                    {listingPhotos.map((photoUrl, index) => (
                      <div
                        key={index}
                        className="relative rounded-xl overflow-hidden aspect-video sm:aspect-square bg-gray-100 border border-gray-200 group shadow-2xs"
                      >
                        <img
                          src={photoUrl}
                          alt={`Farm photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {index === 0 && (
                          <span className="absolute top-1.5 left-1.5 bg-emerald-800 text-white text-[9.5px] font-black px-1.5 py-0.5 rounded-md shadow-xs">
                            Main Photo
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(index)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 hover:bg-rose-600 text-white transition-colors"
                          title="Remove"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Optional Web Link / URL Toggle */}
                <div className="pt-1">
                  {!showManualUrlInput ? (
                    <button
                      type="button"
                      onClick={() => setShowManualUrlInput(true)}
                      className="text-[11px] font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <span>🔗 Or add a photo web link (Image URL)</span>
                    </button>
                  ) : (
                    <div className="space-y-1.5 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-700">Enter photo web link (URL)</span>
                        <button
                          type="button"
                          onClick={() => setShowManualUrlInput(false)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          placeholder="https://example.com/farm-image.jpg"
                          value={manualUrlInput}
                          onChange={(e) => setManualUrlInput(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-white rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-700 text-gray-800"
                        />
                        <button
                          type="button"
                          onClick={handleAddManualUrl}
                          className="px-3 py-1.5 bg-emerald-800 text-white rounded-lg text-xs font-bold hover:bg-emerald-900 cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit CTA */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={submittingListing}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-800 to-teal-800 text-white font-black text-sm shadow-md hover:from-emerald-900 hover:to-teal-900 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {submittingListing ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <FiCheckCircle className="w-4 h-4" />
                      <span>Publish Farmland Listing</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================
            TAB 3: MY LEASES & OFFERS
        ======================================================== */}
        {activeTab === 'my-leases' && (
          <div>
            {/* Sub-tab pills */}
            <div className="flex items-center gap-2 mb-4 bg-white p-1 rounded-2xl border border-gray-200 shadow-2xs max-w-sm">
              <button
                onClick={() => setMyLeasesSubTab('listings')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  myLeasesSubTab === 'listings'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                My Listed Land ({myListings.length})
              </button>
              <button
                onClick={() => setMyLeasesSubTab('offers')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  myLeasesSubTab === 'offers'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                My Sent Offers ({myOffers.length})
              </button>
            </div>

            {loadingMyLeases ? (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-400">
                <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs">Loading records...</p>
              </div>
            ) : myLeasesSubTab === 'listings' ? (
              /* Subtab A: My Listings */
              myListings.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-gray-200">
                  <p className="text-sm font-bold text-gray-800">You have not listed any land yet.</p>
                  <button
                    onClick={() => setActiveTab('list')}
                    className="mt-3 px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold"
                  >
                    + List your land for lease now
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myListings.map((item) => (
                    <div
                      key={item._id}
                      className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-emerald-900/10 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                item.status === 'leased'
                                  ? 'bg-blue-100 text-blue-800'
                                  : item.status === 'agreement_pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {item.status === 'leased' ? 'Leased' : item.status === 'agreement_pending' ? 'Signing' : 'Active'}
                            </span>
                            <span className="text-xs text-gray-400 font-medium">Khasra: {item.khasraNumber}</span>
                          </div>
                          <h4 className="font-extrabold text-base text-gray-900 mt-1">{item.title}</h4>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.status === 'active' && !(item.boundaryPoints && item.boundaryPoints.length >= 3) && (
                            <button
                              onClick={() => setBoundaryTool({ land: item })}
                              className="p-2 rounded-xl text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-xs flex items-center gap-1 font-bold"
                              title="A land border is needed before you can accept an offer"
                            >
                              <FiMapPin className="w-3.5 h-3.5" />
                              <span>Mark border</span>
                            </button>
                          )}
                          {item.agreementSummary && (
                            <button
                              onClick={() => navigate(`/user/agreements/${item.agreementSummary.id}`)}
                              className={`p-2 rounded-xl text-xs flex items-center gap-1 font-bold border ${
                                !item.agreementSummary.mySigned && ['DRAFT', 'PARTIALLY_SIGNED'].includes(item.agreementSummary.status)
                                  ? 'text-white bg-emerald-700 border-emerald-700'
                                  : 'text-emerald-800 bg-white border-emerald-200 hover:bg-emerald-50'
                              }`}
                            >
                              <span>{!item.agreementSummary.mySigned && ['DRAFT', 'PARTIALLY_SIGNED'].includes(item.agreementSummary.status) ? 'Sign agreement' : 'View agreement'}</span>
                            </button>
                          )}
                          {item.status === 'leased' && (
                            <button
                              onClick={() => setPaymentsLandId(item._id)}
                              className="p-2 rounded-xl text-emerald-800 hover:bg-emerald-50 border border-emerald-200 text-xs flex items-center gap-1 font-bold"
                            >
                              <FiDollarSign className="w-3.5 h-3.5" />
                              <span>Payments</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteLand(item._id)}
                            className="p-2 rounded-xl text-red-600 hover:bg-red-50 border border-red-100 text-xs flex items-center gap-1 font-bold"
                            title="Delete listing"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      {/* Specs */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-gray-400 block text-[10px]">Area</span>
                          <span className="font-bold text-gray-800">{item.sizeInAcres} acres</span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-gray-400 block text-[10px]">Model</span>
                          <span className="font-bold text-gray-800">
                            {item.leaseType === 'fixed-rent' ? `₹${item.pricePerAcre}/acre` : `${item.sharePercentage}% Crop Share`}
                          </span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-gray-400 block text-[10px]">Soil</span>
                          <span className="font-bold text-gray-800">{item.soilType}</span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-gray-400 block text-[10px]">Irrigation</span>
                          <span className="font-bold text-gray-800">{item.irrigationSource}</span>
                        </div>
                      </div>

                      {/* Received Offers Section */}
                      <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
                            <FiSend className="w-3.5 h-3.5 text-emerald-700" />
                            Received Offers: {item.offers?.length || 0}
                          </span>
                        </div>

                        {(!item.offers || item.offers.length === 0) ? (
                          <p className="text-xs text-gray-500 italic">
                            No new offers yet.
                          </p>
                        ) : (
                          <div className="space-y-2 mt-2">
                            {item.offers.map((offer) => (
                              <div
                                key={offer._id}
                                className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-gray-900">{offer.farmerName}</span>
                                    {offer.farmerPhone && (
                                      <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                        <FiPhone className="w-3 h-3" /> {offer.farmerPhone}
                                      </span>
                                    )}
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                        offer.status === 'accepted'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : offer.status === 'rejected'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {offer.status}
                                    </span>
                                  </div>

                                  <div className="text-xs text-emerald-800 font-bold mt-1">
                                    {item.leaseType === 'fixed-rent'
                                      ? `Proposed rent: ₹${offer.proposedPrice?.toLocaleString('en-IN') || item.pricePerAcre}/acre/year`
                                      : `Proposed share: ${offer.proposedShare || item.sharePercentage}% Crop Share`}
                                    <span className="text-gray-400 font-normal ml-2">({offer.durationMonths || 12} months)</span>
                                  </div>

                                  {offer.message && (
                                    <p className="text-xs text-gray-600 mt-1 italic">
                                      "{offer.message}"
                                    </p>
                                  )}
                                </div>

                                {offer.status === 'pending' && item.status === 'active' && (
                                  <div className="flex gap-1.5 shrink-0">
                                    <button
                                      onClick={() => handleRejectOffer(item._id, offer._id)}
                                      className="py-1.5 px-3 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1"
                                    >
                                      <span>Reject</span>
                                    </button>
                                    <button
                                      onClick={() => handleAcceptOffer(item._id, offer)}
                                      className="py-1.5 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1"
                                    >
                                      <FiCheck className="w-3.5 h-3.5" />
                                      <span>Accept</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* Subtab B: Offers Made by Me */
              myOffers.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-gray-200">
                  <p className="text-sm font-bold text-gray-800">You have not sent an offer on any land yet.</p>
                  <button
                    onClick={() => setActiveTab('explore')}
                    className="mt-3 px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold"
                  >
                    🌾 Browse available land
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {myOffers.map((item) => (
                    <div
                      key={item.landId}
                      className="bg-white rounded-2xl p-4 shadow-xs border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              item.myOffer?.status === 'accepted'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.myOffer?.status === 'rejected'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            Status: {item.myOffer?.status || 'Pending'}
                          </span>
                          <span className="text-xs text-gray-400">Owner: {item.ownerName}</span>
                        </div>
                        <h4 className="font-extrabold text-sm sm:text-base text-gray-900 mt-1">{item.title}</h4>
                        <p className="text-xs text-gray-500">
                          Location: {[item.location?.village ? `Village ${item.location.village}` : '', item.location?.tehsil ? `Tehsil ${item.location.tehsil}` : (item.location?.city || ''), item.location?.district].filter(Boolean).join(', ') || item.location?.state || 'Rajasthan'} • {item.sizeInAcres} acres
                        </p>
                      </div>

                      {item.agreementSummary && (
                        <button
                          onClick={() => navigate(`/user/agreements/${item.agreementSummary.id}`)}
                          className={`py-2 px-3 rounded-xl text-xs font-bold shrink-0 ${
                            !item.agreementSummary.mySigned && ['DRAFT', 'PARTIALLY_SIGNED'].includes(item.agreementSummary.status)
                              ? 'bg-emerald-700 text-white'
                              : 'bg-white text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {!item.agreementSummary.mySigned && ['DRAFT', 'PARTIALLY_SIGNED'].includes(item.agreementSummary.status) ? 'Sign agreement' : 'View agreement'}
                        </button>
                      )}
                      {item.isCurrentTenant && item.status === 'leased' && (
                        <button
                          onClick={() => setPaymentsLandId(item.landId)}
                          className="py-2 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"
                        >
                          <FiDollarSign className="w-3.5 h-3.5" />
                          <span>Payments</span>
                        </button>
                      )}

                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs">
                        <span className="text-gray-400 block text-[10px]">Your offer</span>
                        <span className="font-extrabold text-emerald-900">
                          {item.leaseType === 'fixed-rent'
                            ? `₹${item.myOffer?.proposedPrice || item.pricePerAcre}/acre/year`
                            : `${item.myOffer?.proposedShare || item.sharePercentage}% Crop Share`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          MODAL 1: SEND / NEGOTIATE OFFER MODAL
      ======================================================== */}
      <AnimatePresence>
        {offerModalLand && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setOfferModalLand(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>

              <div className="border-b border-gray-100 pb-3 mb-4">
                <span className="text-xs uppercase font-extrabold text-emerald-700 tracking-wider">
                  Lease Proposal / Negotiation
                </span>
                <h3 className="text-base sm:text-lg font-black text-gray-900 mt-0.5">
                  Send Lease Offer
                </h3>
                <p className="text-xs text-gray-500 line-clamp-1">{offerModalLand.title}</p>
              </div>

              <form onSubmit={handleSubmitOffer} className="space-y-4 text-xs sm:text-sm">
                {/* Proposed Rent or Share */}
                {offerModalLand.leaseType === 'fixed-rent' ? (
                  <div>
                    <label className="block font-bold text-gray-800 mb-1">
                      Proposed Annual Rent (₹ / acre / year)
                    </label>
                    <input
                      type="number"
                      required
                      placeholder={`Owner's ask: ₹${offerModalLand.pricePerAcre}`}
                      value={offerForm.proposedPrice}
                      onChange={(e) => setOfferForm({ ...offerForm, proposedPrice: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-bold text-gray-900"
                    />
                    <span className="text-[11px] text-gray-400 block mt-1">
                      Owner-set rent: ₹{Number(offerModalLand.pricePerAcre || 0).toLocaleString('en-IN')}/acre
                    </span>
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-gray-800 mb-1">
                      Proposed Crop Share (%)
                    </label>
                    <select
                      value={offerForm.proposedShare}
                      onChange={(e) => setOfferForm({ ...offerForm, proposedShare: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-600 font-bold text-gray-900"
                    >
                      <option value="50">50% owner share (50-50)</option>
                      <option value="60">60% owner share (60-40)</option>
                      <option value="40">40% owner share (40-60)</option>
                      <option value="33">33.3% owner share (1/3rd)</option>
                    </select>
                  </div>
                )}

                {/* Duration */}
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Lease Duration (Months)
                  </label>
                  <select
                    value={offerForm.durationMonths}
                    onChange={(e) => setOfferForm({ ...offerForm, durationMonths: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-gray-900 font-medium"
                  >
                    <option value="6">6 months (1 crop season)</option>
                    <option value="12">1 year (12 months - Rabi + Kharif)</option>
                    <option value="24">2 years (24 months)</option>
                    <option value="36">3 years (long term)</option>
                  </select>
                </div>

                {/* Proposed Crops */}
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Proposed Crops to Sow
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Wheat, Mustard, Chana"
                    value={offerForm.proposedCrops}
                    onChange={(e) => setOfferForm({ ...offerForm, proposedCrops: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-gray-900 font-medium"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Message or Special Terms for the Owner
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. I have my own tractor and equipment, and I propose paying in two instalments..."
                    value={offerForm.message}
                    onChange={(e) => setOfferForm({ ...offerForm, message: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-gray-900 font-medium"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submittingOffer}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-800 to-teal-800 text-white font-black shadow-md hover:from-emerald-900 hover:to-teal-900 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                  >
                    {submittingOffer ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <FiSend className="w-4 h-4" />
                        <span>Submit Proposal to Owner</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 2: LAND DETAILS MODAL
      ======================================================== */}
      <AnimatePresence>
        {selectedLandDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setSelectedLandDetail(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>

              <div className="border-b border-gray-100 pb-3 mb-4">
                <span className="text-xs uppercase font-extrabold text-emerald-700 tracking-wider">
                  Farmland Specifications
                </span>
                <h3 className="text-lg font-black text-gray-900 mt-0.5">
                  {selectedLandDetail.title}
                </h3>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <FiMapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {selectedLandDetail.location?.fullAddress || [
                    selectedLandDetail.location?.village ? `Village ${selectedLandDetail.location.village}` : '',
                    selectedLandDetail.location?.tehsil ? `Tehsil ${selectedLandDetail.location.tehsil}` : (selectedLandDetail.location?.city || ''),
                    selectedLandDetail.location?.district,
                    selectedLandDetail.location?.state
                  ].filter(Boolean).join(', ')}
                </p>
              </div>

              {/* Photo & Multiple Photos Carousel */}
              <div className="rounded-2xl overflow-hidden h-52 bg-gray-100 mb-2">
                <img
                  src={selectedLandDetail.images?.[activeModalImageIndex || 0] || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80'}
                  alt={selectedLandDetail.title}
                  className="w-full h-full object-cover"
                />
              </div>
              {selectedLandDetail.images && selectedLandDetail.images.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
                  {selectedLandDetail.images.map((imgUrl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveModalImageIndex(i)}
                      className={`relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                        (activeModalImageIndex || 0) === i ? 'border-emerald-700 ring-2 ring-emerald-500/30' : 'border-gray-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={imgUrl} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs mb-4">
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">Total Area</span>
                  <span className="font-extrabold text-gray-800 text-sm">{selectedLandDetail.sizeInAcres} acres</span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">Khasra No.</span>
                  <span className="font-extrabold text-gray-800 text-sm">{selectedLandDetail.khasraNumber}</span>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                  <span className="text-emerald-700 block text-[10px]">Lease Model</span>
                  <span className="font-extrabold text-emerald-900 text-sm">
                    {selectedLandDetail.leaseType === 'fixed-rent'
                      ? `₹${Number(selectedLandDetail.pricePerAcre || 0).toLocaleString('en-IN')}/acre`
                      : `${selectedLandDetail.sharePercentage}% Crop Share`}
                  </span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">Soil Type</span>
                  <span className="font-bold text-gray-800">{selectedLandDetail.soilType}</span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">Irrigation Source</span>
                  <span className="font-bold text-gray-800">{selectedLandDetail.irrigationSource}</span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">Road Access</span>
                  <span className="font-bold text-gray-800">{selectedLandDetail.roadAccess}</span>
                </div>
              </div>

              {/* Suitable Crops */}
              {selectedLandDetail.suitableCrops && selectedLandDetail.suitableCrops.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold text-gray-700 block mb-1.5">Suitable Crops:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLandDetail.suitableCrops.map((crop, idx) => (
                      <span key={idx} className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg text-xs font-semibold border border-emerald-200">
                        🌾 {crop}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 text-xs text-gray-700 mb-4">
                <span className="font-bold text-gray-900 block mb-1">Full Land Description:</span>
                <p className="leading-relaxed">{selectedLandDetail.description}</p>
              </div>

              {/* Owner Info & CTA */}
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-xs">
                    {selectedLandDetail.owner?.name?.charAt(0) || 'K'}
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-gray-900 block">
                      {(selectedLandDetail.isOwner || (currentUser && String(selectedLandDetail.ownerId?._id || selectedLandDetail.ownerId) === String(currentUser._id || currentUser.id)))
                        ? 'Your Listing'
                        : (selectedLandDetail.owner?.name || 'Verified Landowner')}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-semibold">Verified Land Owner</span>
                  </div>
                </div>

                {(selectedLandDetail.isOwner || (currentUser && String(selectedLandDetail.ownerId?._id || selectedLandDetail.ownerId) === String(currentUser._id || currentUser.id))) ? (
                  <button
                    onClick={() => {
                      setSelectedLandDetail(null);
                      setActiveTab('my-leases');
                      setMyLeasesSubTab('listings');
                    }}
                    className="py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                  >
                    <FiCheckCircle className="w-3.5 h-3.5" />
                    <span>Manage in My Listings</span>
                  </button>
                ) : (
                  <button
                    disabled={selectedLandDetail.status === 'leased'}
                    onClick={() => {
                      const l = selectedLandDetail;
                      setSelectedLandDetail(null);
                      handleOpenOfferModal(l);
                    }}
                    className="py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                  >
                    <FiSend className="w-3.5 h-3.5" />
                    <span>Make Offer</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {paymentsLandId && (
        <LeasePaymentsModal
          landId={paymentsLandId}
          onClose={() => setPaymentsLandId(null)}
          onChanged={fetchMyLeases}
        />
      )}
      {/* Accepting an offer makes the agreement: the owner picks its language first */}
      {acceptDialog && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-3" onClick={() => setAcceptDialog(null)}>
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-black text-gray-900 text-base">Accept this offer? · प्रस्ताव स्वीकार करें?</p>
            <p className="text-xs text-gray-600 leading-snug">
              A lease agreement will be made for both of you to read and sign. The lease starts only after you both sign.
              <span className="block mt-1">अनुबंध बनेगा। दोनों के हस्ताक्षर के बाद ही पट्टा शुरू होगा।</span>
            </p>
            <p className="text-[11px] font-bold uppercase text-gray-500">Agreement language · अनुबंध की भाषा</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => confirmAcceptOffer('hi')} className="py-3 rounded-xl bg-emerald-800 text-white font-black text-sm active:scale-95">हिन्दी</button>
              <button onClick={() => confirmAcceptOffer('en')} className="py-3 rounded-xl bg-white border-2 border-emerald-800 text-emerald-900 font-black text-sm active:scale-95">English</button>
            </div>
            <button onClick={() => setAcceptDialog(null)} className="w-full py-2 text-xs font-bold text-gray-500">Cancel</button>
          </div>
        </div>
      )}

      {/* Full-screen border tool */}
      {boundaryTool && (
        <FieldAreaMeasurementModal
          asPage
          isOpen
          onClose={() => setBoundaryTool(null)}
          onApplyArea={handleBoundaryApplied}
          initialAcres={boundaryTool.land?.sizeInAcres || Number(listingForm.sizeInAcres) || 1}
          initialPoints={boundaryTool.land?.boundaryPoints || (boundaryTool.land ? [] : listingForm.boundaryPoints)}
        />
      )}
    </div>
  );
};

export default LandLeasePage;
