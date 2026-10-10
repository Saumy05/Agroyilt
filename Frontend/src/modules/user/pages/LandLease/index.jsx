import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FiChevronRight
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import landLeaseService from '../../services/landLeaseService';
import { toastManager } from '../../../../utils/toastManager';
import authStorage from '../../../../utils/authStorage';

const LandLeasePage = () => {
  const navigate = useNavigate();
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

  // My Land Leases
  const [myListings, setMyListings] = useState([]);
  const [myOffers, setMyOffers] = useState([]);
  const [loadingMyLeases, setLoadingMyLeases] = useState(false);

  // Modals
  const [selectedLandDetail, setSelectedLandDetail] = useState(null);
  const [offerModalLand, setOfferModalLand] = useState(null);
  const [submittingOffer, setSubmittingOffer] = useState(false);

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
    city: '',
    addressLine1: '',
    pincode: '',
    leaseType: 'fixed-rent',
    pricePerAcre: '',
    sharePercentage: '50',
    availableFrom: new Date().toISOString().split('T')[0],
    availableTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    soilType: 'Alluvial Soil (दोमट मिट्टी)',
    irrigationSource: 'Tubewell / बोरवेल',
    electricity: true,
    fencing: false,
    roadAccess: 'Paved Road / पक्की सड़क',
    suitableCrops: 'Wheat, Mustard, Gram',
    images: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80'
  });
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

      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = land.title?.toLowerCase().includes(q);
        const cityMatch = land.location?.city?.toLowerCase().includes(q);
        const districtMatch = land.location?.district?.toLowerCase().includes(q);
        const stateMatch = land.location?.state?.toLowerCase().includes(q);
        const khasraMatch = land.khasraNumber?.toLowerCase().includes(q);
        return titleMatch || cityMatch || districtMatch || stateMatch || khasraMatch;
      }

      return true;
    });
  }, [leases, leaseTypeFilter, sizeFilter, searchQuery]);

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
        toastManager.success('प्रस्ताव सफलतापूर्वक भेजा गया! (Offer submitted to owner)');
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

  // Landowner accepts tenant's offer
  const handleAcceptOffer = async (landId, offerId) => {
    if (!window.confirm('क्या आप इस किसान के प्रस्ताव को स्वीकार करना चाहते हैं? (Accept this tenant offer?)')) {
      return;
    }
    try {
      const res = await landLeaseService.acceptOffer(landId, offerId);
      if (res?.success) {
        toastManager.success('प्रस्ताव स्वीकार कर लिया गया! पट्टा पंजीकृत हुआ। (Offer accepted!)');
        fetchMyLeases();
        fetchLeases();
      } else {
        toastManager.error(res?.message || 'Failed to accept offer');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Error accepting offer');
    }
  };

  // Delete listing
  const handleDeleteLand = async (landId) => {
    if (!window.confirm('क्या आप इस सूची को हटाना चाहते हैं? (Remove this land listing?)')) {
      return;
    }
    try {
      const res = await landLeaseService.deleteLand(landId);
      if (res?.success) {
        toastManager.success('सूची हटा दी गई (Listing removed)');
        fetchMyLeases();
        fetchLeases();
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to delete listing');
    }
  };

  // Handle Create Listing
  const handleCreateListing = async (e) => {
    e.preventDefault();
    if (!listingForm.title || !listingForm.sizeInAcres || !listingForm.khasraNumber) {
      return toastManager.error('कृपया शीर्षक, रकबा (एकड़) और खसरा नंबर दर्ज करें');
    }

    try {
      setSubmittingListing(true);
      const cropsArray = listingForm.suitableCrops
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const imagesArray = listingForm.images
        .split(',')
        .map((img) => img.trim())
        .filter(Boolean);

      const payload = {
        title: listingForm.title,
        description: listingForm.description,
        sizeInAcres: Number(listingForm.sizeInAcres),
        khasraNumber: listingForm.khasraNumber,
        location: {
          addressLine1: listingForm.addressLine1,
          city: listingForm.city,
          district: listingForm.district || listingForm.city,
          state: listingForm.state,
          pincode: listingForm.pincode,
          fullAddress: `${listingForm.addressLine1 ? listingForm.addressLine1 + ', ' : ''}${listingForm.city}, ${listingForm.state}`
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
        images: imagesArray.length > 0 ? imagesArray : undefined
      };

      const res = await landLeaseService.listLand(payload);
      if (res?.success) {
        toastManager.success('कृषि भूमि सफलतापूर्वक पट्टे हेतु सूचीबद्ध की गई! (Land listed successfully!)');
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
      {/* 1. Header & Hero Bar */}
      <div className="bg-gradient-to-br from-emerald-800 via-teal-900 to-[#1b4332] text-white px-4 pt-4 pb-6 shadow-md relative overflow-hidden">
        {/* Subtle Decorative Elements */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-teal-500/15 rounded-full blur-xl pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all active:scale-95 border border-white/15"
              aria-label="Go Back"
            >
              <FiArrowLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <span className="text-xs uppercase tracking-wider font-semibold text-emerald-200">
                SOW #20 • Market Ecosystem
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                भूमि पट्टा व ठेका (Land Lease & Theka)
              </h1>
            </div>
            <div className="w-10" />
          </div>

          <p className="text-xs sm:text-sm text-emerald-100 text-center max-w-lg mx-auto font-medium">
            निश्चित नकद किराया (Fixed Rent) या फसल साझा (Crop-Share / बटाई) व्यवस्था के तहत कृषि भूमि खोजें या अपनी जमीन पट्टे पर दें।
          </p>

          {/* Tab Navigation Pill Bar */}
          <div className="mt-5 flex items-center justify-center gap-1.5 p-1 bg-black/25 backdrop-blur-lg rounded-2xl max-w-md mx-auto border border-white/15">
            <button
              onClick={() => setActiveTab('explore')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'explore'
                  ? 'bg-white text-emerald-900 shadow-md scale-[1.02]'
                  : 'text-emerald-100/90 hover:text-white'
              }`}
            >
              <span>🌾 भूमि खोजें</span>
            </button>

            <button
              onClick={() => setActiveTab('list')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'list'
                  ? 'bg-white text-emerald-900 shadow-md scale-[1.02]'
                  : 'text-emerald-100/90 hover:text-white'
              }`}
            >
              <FiPlus className="w-4 h-4 text-emerald-700" />
              <span>पट्टा दें (List)</span>
            </button>

            <button
              onClick={() => setActiveTab('my-leases')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'my-leases'
                  ? 'bg-white text-emerald-900 shadow-md scale-[1.02]'
                  : 'text-emerald-100/90 hover:text-white'
              }`}
            >
              <span>📑 मेरे रिकॉर्ड</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-4">
        {/* ========================================================
            TAB 1: EXPLORE / BROWSE FARMLAND
        ======================================================== */}
        {activeTab === 'explore' && (
          <div>
            {/* Search & Filter Bar */}
            <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-emerald-900/10 mb-4 space-y-3">
              <div className="relative">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="खेत का नाम, जिला, तहसील, खसरा नंबर खोजें..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl text-xs sm:text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all text-gray-800"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Lease Type Filters */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
                <span className="text-gray-500 font-semibold shrink-0 flex items-center gap-1">
                  <FiFilter className="w-3.5 h-3.5" /> मॉडल:
                </span>
                <button
                  onClick={() => setLeaseTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                    leaseTypeFilter === 'all'
                      ? 'bg-emerald-800 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  सभी (All)
                </button>
                <button
                  onClick={() => setLeaseTypeFilter('fixed-rent')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    leaseTypeFilter === 'fixed-rent'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <FiDollarSign className="w-3.5 h-3.5" /> नकद किराया (Fixed Rent)
                </button>
                <button
                  onClick={() => setLeaseTypeFilter('crop-share')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    leaseTypeFilter === 'crop-share'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <FiPercent className="w-3.5 h-3.5" /> बटाई / फसल-साझा (Crop Share)
                </button>
              </div>

              {/* Size Filters */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs border-t border-gray-100 pt-2">
                <span className="text-gray-500 font-semibold shrink-0">रकबा (Size):</span>
                {[
                  { id: 'all', label: 'सभी आकार' },
                  { id: 'small', label: '1 - 5 एकड़' },
                  { id: 'medium', label: '5 - 15 एकड़' },
                  { id: 'large', label: '15+ एकड़' }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSizeFilter(s.id)}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all ${
                      sizeFilter === s.id
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Listings Count Banner */}
            <div className="flex items-center justify-between px-1 mb-3">
              <span className="text-xs font-bold text-gray-600">
                उपलब्ध कृषि भूमि ({filteredLeases.length} सूचियां)
              </span>
              <button
                onClick={fetchLeases}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
              >
                रिफ्रेश करें ↻
              </button>
            </div>

            {/* Farmland Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse border border-gray-100">
                    <div className="h-44 bg-gray-200 rounded-xl mb-3" />
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredLeases.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-gray-200/80 shadow-xs">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center text-2xl mb-3">
                  🌾
                </div>
                <h3 className="text-base font-bold text-gray-800">कोई भूमि सूची नहीं मिली</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  वर्तमान फिल्टर के अनुसार कोई कृषि भूमि उपलब्ध नहीं है। कृपया फिल्टर बदलकर प्रयास करें या अपनी भूमि सूचीबद्ध करें।
                </p>
                <button
                  onClick={() => {
                    setLeaseTypeFilter('all');
                    setSizeFilter('all');
                    setSearchQuery('');
                  }}
                  className="mt-4 px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-emerald-900"
                >
                  सभी फिल्टर हटाएं
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredLeases.map((land) => (
                  <motion.div
                    key={land._id}
                    whileHover={{ y: -2 }}
                    className="bg-white rounded-2xl overflow-hidden shadow-sm border border-emerald-900/10 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Banner & Lease Tag */}
                      <div className="relative h-48 w-full bg-gray-100 overflow-hidden">
                        <img
                          src={land.images?.[0] || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80'}
                          alt={land.title}
                          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                        {/* Top Left Badge: Lease Type */}
                        <div className="absolute top-3 left-3">
                          {land.leaseType === 'fixed-rent' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-md border border-emerald-400">
                              <FiDollarSign className="w-3.5 h-3.5" />
                              ₹{Number(land.pricePerAcre || 0).toLocaleString('en-IN')} / एकड़ / वर्ष
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-white shadow-md border border-amber-300">
                              <FiPercent className="w-3.5 h-3.5" />
                              {land.sharePercentage}% बटाई (फसल साझा)
                            </span>
                          )}
                        </div>

                        {/* Top Right Badge: Status */}
                        <div className="absolute top-3 right-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md ${
                              land.status === 'leased'
                                ? 'bg-rose-500 text-white'
                                : 'bg-emerald-900/80 backdrop-blur-md text-emerald-100 border border-emerald-400/30'
                            }`}
                          >
                            {land.status === 'leased' ? 'पट्टे पर दिया गया (Leased)' : 'उपलब्ध (Available)'}
                          </span>
                        </div>

                        {/* Bottom Overlay Info */}
                        <div className="absolute bottom-3 left-3 right-3 text-white flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold drop-shadow-md">
                            <FiMapPin className="w-3.5 h-3.5 text-emerald-400" />
                            <span>
                              {land.location?.city || land.location?.district || 'Rajasthan'}, {land.location?.state || 'India'}
                            </span>
                          </div>
                          <span className="bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-lg text-xs font-black text-emerald-200">
                            {land.sizeInAcres} एकड़ (Acres)
                          </span>
                        </div>
                      </div>

                      {/* Content Card Body */}
                      <div className="p-4 space-y-3">
                        <div>
                          <h3 className="font-extrabold text-base text-gray-900 line-clamp-1 leading-snug">
                            {land.title}
                          </h3>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                            {land.description}
                          </p>
                        </div>

                        {/* Key Agricultural Features Pills */}
                        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                          <div className="flex items-center gap-1.5 text-gray-700 bg-gray-50 p-2 rounded-xl border border-gray-100">
                            <FiLayers className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span className="truncate font-medium">{land.soilType || 'दोमट मिट्टी'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-700 bg-gray-50 p-2 rounded-xl border border-gray-100">
                            <FiDroplet className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate font-medium">{land.irrigationSource || 'ट्यूबवेल / बोरवेल'}</span>
                          </div>
                        </div>

                        {/* Additional specs row */}
                        <div className="flex items-center justify-between text-[11px] text-gray-500 border-t border-gray-100 pt-2.5">
                          <span className="font-medium">
                            खसरा नं: <b className="text-gray-800">{land.khasraNumber}</b>
                          </span>
                          <span className="inline-flex items-center gap-1 text-emerald-800 font-bold">
                            <FiShield className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{land.owner?.name || 'Verified Owner'}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="p-4 pt-0 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSelectedLandDetail(land)}
                        className="py-2.5 px-3 rounded-xl border border-emerald-900/20 text-emerald-900 hover:bg-emerald-50 text-xs font-bold transition-all flex items-center justify-center gap-1"
                      >
                        <FiMaximize2 className="w-3.5 h-3.5" />
                        <span>विवरण (Details)</span>
                      </button>

                      <button
                        disabled={land.status === 'leased'}
                        onClick={() => handleOpenOfferModal(land)}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm ${
                          land.status === 'leased'
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-emerald-800 hover:bg-emerald-900 text-white active:scale-95'
                        }`}
                      >
                        <FiSend className="w-3.5 h-3.5" />
                        <span>प्रस्ताव दें (Offer)</span>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 2: LIST FARMLAND FOR LEASE (पट्टा दें)
        ======================================================== */}
        {activeTab === 'list' && (
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-emerald-900/10 mb-8 max-w-2xl mx-auto">
            <div className="border-b border-gray-100 pb-4 mb-5">
              <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-700">
                Farmland Listing Form
              </span>
              <h2 className="text-lg sm:text-xl font-black text-gray-900">
                अपनी कृषि भूमि पट्टे / ठेके हेतु सूचीबद्ध करें
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                अपनी भूमि का रकबा, स्थान, पट्टा मॉडल (नकद या बटाई) दर्ज कर तुरंत अन्य किसानों से प्रस्ताव प्राप्त करें।
              </p>
            </div>

            <form onSubmit={handleCreateListing} className="space-y-4 text-xs sm:text-sm">
              {/* Title */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  भूमि का शीर्षक (Title) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="उदा. 10 एकड़ उपजाऊ नहरी खेत, सूरतगढ़ रोड"
                  value={listingForm.title}
                  onChange={(e) => setListingForm({ ...listingForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  विवरण व विशेषताएं (Description)
                </label>
                <textarea
                  rows={2}
                  placeholder="मिट्टी की उपजाऊ क्षमता, पानी की धार, बिजली कनेक्शन व सड़क कनेक्टिविटी की जानकारी दें..."
                  value={listingForm.description}
                  onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                />
              </div>

              {/* Size in Acres & Khasra No */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    कुल रकबा एकड़ में (Size in Acres) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="उदा. 12"
                    value={listingForm.sizeInAcres}
                    onChange={(e) => setListingForm({ ...listingForm, sizeInAcres: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    खसरा / खाता संख्या (Khasra No.) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. 142/18"
                    value={listingForm.khasraNumber}
                    onChange={(e) => setListingForm({ ...listingForm, khasraNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>
              </div>

              {/* Location Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">राज्य (State)</label>
                  <input
                    type="text"
                    value={listingForm.state}
                    onChange={(e) => setListingForm({ ...listingForm, state: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-800 mb-1">जिला (District)</label>
                  <input
                    type="text"
                    placeholder="उदा. Kota"
                    value={listingForm.district}
                    onChange={(e) => setListingForm({ ...listingForm, district: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-800 mb-1">तहसील / गांव (City/Village)</label>
                  <input
                    type="text"
                    placeholder="उदा. Ladpura"
                    value={listingForm.city}
                    onChange={(e) => setListingForm({ ...listingForm, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  />
                </div>
              </div>

              {/* Lease Type Selection (Fixed Rent vs Crop Share) */}
              <div className="pt-2">
                <label className="block font-bold text-gray-800 mb-2">
                  पट्टा मॉडल चुनें (Lease Arrangement) <span className="text-red-500">*</span>
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
                        निश्चित किराया (Fixed Rent)
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
                      प्रति वर्ष नकद किराया प्राप्त करें (जैसे ₹35,000 / एकड़ / वर्ष)
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
                        फसल साझा (बटाई / Batai)
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
                      उत्पादन में भागीदारी (जैसे 50-50 बटाई या 60-40 व्यवस्था)
                    </p>
                  </div>
                </div>
              </div>

              {/* Dynamic Price / Share Field based on choice */}
              {listingForm.leaseType === 'fixed-rent' ? (
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    मांगा गया वार्षिक किराया (₹ / एकड़ / वर्ष) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="उदा. 35000"
                    value={listingForm.pricePerAcre}
                    onChange={(e) => setListingForm({ ...listingForm, pricePerAcre: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-bold"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    मालिक का फसल हिस्सा % (Owner Crop Share %) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={listingForm.sharePercentage}
                    onChange={(e) => setListingForm({ ...listingForm, sharePercentage: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white text-gray-900 font-bold"
                  >
                    <option value="50">50% मालिक हिस्सा (आधा-आधा / 50-50 Batai)</option>
                    <option value="60">60% मालिक हिस्सा (60-40 Batai)</option>
                    <option value="40">40% मालिक हिस्सा (40-60 Batai)</option>
                    <option value="33">33.3% तिहाई हिस्सा (1/3rd Batai)</option>
                  </select>
                </div>
              )}

              {/* Soil & Irrigation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">मिट्टी का प्रकार (Soil Type)</label>
                  <select
                    value={listingForm.soilType}
                    onChange={(e) => setListingForm({ ...listingForm, soilType: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  >
                    <option value="Alluvial Soil (दोमट मिट्टी)">Alluvial Soil (दोमट मिट्टी)</option>
                    <option value="Black Cotton Soil (काली दोमट)">Black Cotton Soil (काली दोमट)</option>
                    <option value="Sandy Loam (बलुई दोमट)">Sandy Loam (बलुई दोमट)</option>
                    <option value="Red Soil (लाल मिट्टी)">Red Soil (लाल मिट्टी)</option>
                    <option value="Clay Soil (चिकनी मिट्टी)">Clay Soil (चिकनी मिट्टी)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-800 mb-1">सिंचाई का साधन (Irrigation)</label>
                  <select
                    value={listingForm.irrigationSource}
                    onChange={(e) => setListingForm({ ...listingForm, irrigationSource: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                  >
                    <option value="Tubewell / बोरवेल">Tubewell / बोरवेल</option>
                    <option value="Canal / नहर">Canal / नहर</option>
                    <option value="Canal + Tubewell">Canal + Tubewell</option>
                    <option value="Solar Pump / सोलर पंप">Solar Pump / सोलर पंप</option>
                    <option value="Drip System / ड्रिप">Drip System / ड्रिप</option>
                    <option value="Rainfed / बारानी">Rainfed / बारानी</option>
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
                  <span className="font-semibold text-gray-700">3-फेज कृषि बिजली</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={listingForm.fencing}
                    onChange={(e) => setListingForm({ ...listingForm, fencing: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="font-semibold text-gray-700">तारबंदी (Fencing)</span>
                </label>
              </div>

              {/* Photo URL */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">खेत की फोटो (Image URL)</label>
                <input
                  type="url"
                  placeholder="खेत की फोटो का लिंक (URL)"
                  value={listingForm.images}
                  onChange={(e) => setListingForm({ ...listingForm, images: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white text-gray-900 font-medium"
                />
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
                      <span>सूचीबद्ध करें (Publish Farmland Listing)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================
            TAB 3: MY LEASES & OFFERS (मेरे रिकॉर्ड)
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
                मेरी सूचीबद्ध भूमि ({myListings.length})
              </button>
              <button
                onClick={() => setMyLeasesSubTab('offers')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  myLeasesSubTab === 'offers'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                मेरे भेजे प्रस्ताव ({myOffers.length})
              </button>
            </div>

            {loadingMyLeases ? (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-400">
                <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs">रिकॉर्ड लोड हो रहे हैं...</p>
              </div>
            ) : myLeasesSubTab === 'listings' ? (
              /* Subtab A: My Listings */
              myListings.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-gray-200">
                  <p className="text-sm font-bold text-gray-800">आपने अभी तक कोई भूमि सूचीबद्ध नहीं की है।</p>
                  <button
                    onClick={() => setActiveTab('list')}
                    className="mt-3 px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold"
                  >
                    + अभी अपनी जमीन पट्टे पर दें
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
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {item.status === 'leased' ? 'पट्टे पर दिया गया (Leased)' : 'सक्रिय (Active)'}
                            </span>
                            <span className="text-xs text-gray-400 font-medium">खसरा: {item.khasraNumber}</span>
                          </div>
                          <h4 className="font-extrabold text-base text-gray-900 mt-1">{item.title}</h4>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteLand(item._id)}
                            className="p-2 rounded-xl text-red-600 hover:bg-red-50 border border-red-100 text-xs flex items-center gap-1 font-bold"
                            title="Delete listing"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                            <span>हटाएं</span>
                          </button>
                        </div>
                      </div>

                      {/* Specs */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-gray-400 block text-[10px]">रकबा</span>
                          <span className="font-bold text-gray-800">{item.sizeInAcres} एकड़</span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-gray-400 block text-[10px]">मॉडल</span>
                          <span className="font-bold text-gray-800">
                            {item.leaseType === 'fixed-rent' ? `₹${item.pricePerAcre}/एकड़` : `${item.sharePercentage}% बटाई`}
                          </span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-gray-400 block text-[10px]">मिट्टी</span>
                          <span className="font-bold text-gray-800">{item.soilType}</span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-gray-400 block text-[10px]">सिंचाई</span>
                          <span className="font-bold text-gray-800">{item.irrigationSource}</span>
                        </div>
                      </div>

                      {/* Received Offers Section */}
                      <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
                            <FiSend className="w-3.5 h-3.5 text-emerald-700" />
                            प्राप्त प्रस्ताव (Received Offers: {item.offers?.length || 0})
                          </span>
                        </div>

                        {(!item.offers || item.offers.length === 0) ? (
                          <p className="text-xs text-gray-500 italic">
                            अभी तक कोई नया प्रस्ताव नहीं आया है।
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
                                      ? `प्रस्तावित किराया: ₹${offer.proposedPrice?.toLocaleString('en-IN') || item.pricePerAcre}/एकड़/वर्ष`
                                      : `प्रस्तावित हिस्सा: ${offer.proposedShare || item.sharePercentage}% बटाई`}
                                    <span className="text-gray-400 font-normal ml-2">({offer.durationMonths || 12} माह हेतु)</span>
                                  </div>

                                  {offer.message && (
                                    <p className="text-xs text-gray-600 mt-1 italic">
                                      "{offer.message}"
                                    </p>
                                  )}
                                </div>

                                {offer.status === 'pending' && item.status !== 'leased' && (
                                  <button
                                    onClick={() => handleAcceptOffer(item._id, offer._id)}
                                    className="py-1.5 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs shrink-0 flex items-center gap-1"
                                  >
                                    <FiCheck className="w-3.5 h-3.5" />
                                    <span>स्वीकार करें (Accept)</span>
                                  </button>
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
                  <p className="text-sm font-bold text-gray-800">आपने किसी भूमि पर प्रस्ताव नहीं भेजा है।</p>
                  <button
                    onClick={() => setActiveTab('explore')}
                    className="mt-3 px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold"
                  >
                    🌾 उपलब्ध भूमि खोजें
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
                            स्थिति: {item.myOffer?.status || 'लंबित (Pending)'}
                          </span>
                          <span className="text-xs text-gray-400">मालिक: {item.ownerName}</span>
                        </div>
                        <h4 className="font-extrabold text-sm sm:text-base text-gray-900 mt-1">{item.title}</h4>
                        <p className="text-xs text-gray-500">
                          स्थान: {item.location?.city || item.location?.district || 'Rajasthan'} • {item.sizeInAcres} एकड़
                        </p>
                      </div>

                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs">
                        <span className="text-gray-400 block text-[10px]">आपका भेजा गया प्रस्ताव</span>
                        <span className="font-extrabold text-emerald-900">
                          {item.leaseType === 'fixed-rent'
                            ? `₹${item.myOffer?.proposedPrice || item.pricePerAcre}/एकड़/वर्ष`
                            : `${item.myOffer?.proposedShare || item.sharePercentage}% बटाई हिस्सा`}
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
                  पट्टा प्रस्ताव भेजें (Send Lease Offer)
                </h3>
                <p className="text-xs text-gray-500 line-clamp-1">{offerModalLand.title}</p>
              </div>

              <form onSubmit={handleSubmitOffer} className="space-y-4 text-xs sm:text-sm">
                {/* Proposed Rent or Share */}
                {offerModalLand.leaseType === 'fixed-rent' ? (
                  <div>
                    <label className="block font-bold text-gray-800 mb-1">
                      प्रस्तावित वार्षिक किराया (₹ / एकड़ / वर्ष)
                    </label>
                    <input
                      type="number"
                      required
                      placeholder={`मालिक की मांग: ₹${offerModalLand.pricePerAcre}`}
                      value={offerForm.proposedPrice}
                      onChange={(e) => setOfferForm({ ...offerForm, proposedPrice: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-bold text-gray-900"
                    />
                    <span className="text-[11px] text-gray-400 block mt-1">
                      मालिक का निर्धारित किराया: ₹{Number(offerModalLand.pricePerAcre || 0).toLocaleString('en-IN')}/एकड़
                    </span>
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-gray-800 mb-1">
                      प्रस्तावित फसल हिस्सा (बटाई %)
                    </label>
                    <select
                      value={offerForm.proposedShare}
                      onChange={(e) => setOfferForm({ ...offerForm, proposedShare: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-600 font-bold text-gray-900"
                    >
                      <option value="50">50% मालिक हिस्सा (50-50 बटाई)</option>
                      <option value="60">60% मालिक हिस्सा (60-40)</option>
                      <option value="40">40% मालिक हिस्सा (40-60)</option>
                      <option value="33">33.3% तिहाई हिस्सा (1/3rd)</option>
                    </select>
                  </div>
                )}

                {/* Duration */}
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    पट्टे की अवधि (माह / Duration Months)
                  </label>
                  <select
                    value={offerForm.durationMonths}
                    onChange={(e) => setOfferForm({ ...offerForm, durationMonths: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-gray-900 font-medium"
                  >
                    <option value="6">6 माह (एक फसल सीजन / 1 Crop Season)</option>
                    <option value="12">1 वर्ष (12 माह - रबी + खरीफ)</option>
                    <option value="24">2 वर्ष (24 माह)</option>
                    <option value="36">3 वर्ष (दीर्घकालिक / 3 Years)</option>
                  </select>
                </div>

                {/* Proposed Crops */}
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    प्रस्तावित फसलें (Proposed Crops to Sow)
                  </label>
                  <input
                    type="text"
                    placeholder="उदा. गेहूं, सरसों, चना"
                    value={offerForm.proposedCrops}
                    onChange={(e) => setOfferForm({ ...offerForm, proposedCrops: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-gray-900 font-medium"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    मालिक के लिए संदेश या विशेष शर्तें (Message / Terms)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="उदा. मेरे पास खुद का ट्रैक्टर व उपकरण उपलब्ध हैं, भुगतान दो किस्तों में करने का प्रस्ताव है..."
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
                        <span>प्रस्ताव भेजें (Submit Proposal to Owner)</span>
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
          MODAL 2: LAND DETAILS MODAL (विवरण देखें)
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
                  <FiMapPin className="w-3.5 h-3.5 text-emerald-600" />
                  {selectedLandDetail.location?.fullAddress || `${selectedLandDetail.location?.city}, ${selectedLandDetail.location?.state}`}
                </p>
              </div>

              {/* Photo */}
              <div className="rounded-2xl overflow-hidden h-52 bg-gray-100 mb-4">
                <img
                  src={selectedLandDetail.images?.[0] || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80'}
                  alt={selectedLandDetail.title}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs mb-4">
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">कुल रकबा</span>
                  <span className="font-extrabold text-gray-800 text-sm">{selectedLandDetail.sizeInAcres} एकड़</span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">खसरा संख्या</span>
                  <span className="font-extrabold text-gray-800 text-sm">{selectedLandDetail.khasraNumber}</span>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                  <span className="text-emerald-700 block text-[10px]">पट्टा मॉडल</span>
                  <span className="font-extrabold text-emerald-900 text-sm">
                    {selectedLandDetail.leaseType === 'fixed-rent'
                      ? `₹${Number(selectedLandDetail.pricePerAcre || 0).toLocaleString('en-IN')}/एकड़`
                      : `${selectedLandDetail.sharePercentage}% बटाई`}
                  </span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">मिट्टी का प्रकार</span>
                  <span className="font-bold text-gray-800">{selectedLandDetail.soilType}</span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">सिंचाई का साधन</span>
                  <span className="font-bold text-gray-800">{selectedLandDetail.irrigationSource}</span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 block text-[10px]">रास्ता</span>
                  <span className="font-bold text-gray-800">{selectedLandDetail.roadAccess}</span>
                </div>
              </div>

              {/* Suitable Crops */}
              {selectedLandDetail.suitableCrops && selectedLandDetail.suitableCrops.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold text-gray-700 block mb-1.5">उपयुक्त फसलें (Suitable Crops):</span>
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
                <span className="font-bold text-gray-900 block mb-1">खेत का पूरा विवरण:</span>
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
                      {selectedLandDetail.owner?.name || 'Verified Landowner'}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-semibold">प्रमाणित भूमि मालिक</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const l = selectedLandDetail;
                    setSelectedLandDetail(null);
                    handleOpenOfferModal(l);
                  }}
                  className="py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <FiSend className="w-3.5 h-3.5" />
                  <span>प्रस्ताव दें (Make Offer)</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LandLeasePage;
