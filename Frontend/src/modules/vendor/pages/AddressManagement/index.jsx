import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiMapPin, FiSave, FiSearch, FiHome, FiX } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { vendorTheme as themeColors } from '../../../../theme';
import vendorService from '../../../../services/vendorService';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import LocationPicker from '../../../user/pages/Checkout/components/LocationPicker';

const AddressManagement = () => {
  const navigate = useNavigate();
  const [address, setAddress] = useState(''); // Display address
  const [houseNumber, setHouseNumber] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null); // { lat, lng, address, components... }
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Load saved address from backend
  useEffect(() => {
    const loadAddress = async () => {
      try {
        const response = await vendorService.getProfile();
        // Check if response has vendor data
        if (response.success && response.vendor?.address) {
          const addr = response.vendor.address;

          let displayAddress = '';
          let location = null;
          let houseNum = '';

          if (typeof addr === 'string') {
            displayAddress = addr;
          } else {
            // It's an object
            houseNum = addr.addressLine1 || '';
            displayAddress = addr.fullAddress ||
              addr.address ||
              '';

            // If we have city/pincode but no fullAddress, try to construct
            if (!displayAddress && addr.city) {
              displayAddress = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
            }

            if (addr.lat && addr.lng) {
              location = {
                lat: parseFloat(addr.lat),
                lng: parseFloat(addr.lng),
                address: displayAddress
              };
            }
          }

          setAddress(displayAddress);
          setSearchQuery(displayAddress);
          setHouseNumber(houseNum);
          if (location) {
            setSelectedLocation(location);
          }
        }
      } catch (error) {
        console.error('Error loading address:', error);
      }
    };
    loadAddress();
  }, []);

  const [flyToPosition, setFlyToPosition] = useState(null);

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
    setSearchQuery(location.address);
    setAddress(location.address);
  };

  const handleSearchKeyDown = async (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      setIsSearching(true);
      const query = searchQuery.trim();

      const applyGeocodeResult = (lat, lng, formattedAddress, components) => {
        const location = {
          lat,
          lng,
          address: formattedAddress,
          components: components || []
        };
        setSelectedLocation(location);
        setAddress(formattedAddress);
        setSearchQuery(formattedAddress);
        setFlyToPosition({ lat, lng });
        toastManager.success('Location found and pinned on map');
      };

      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: query, componentRestrictions: { country: 'in' } }, (results, status) => {
          setIsSearching(false);
          if (status === 'OK' && results && results[0]) {
            const r = results[0];
            applyGeocodeResult(
              r.geometry.location.lat(),
              r.geometry.location.lng(),
              r.formatted_address,
              r.address_components
            );
          } else {
            toastManager.error('Address not found. Please try a different search.');
          }
        });
        return;
      }

      // Fallback via Google Geocode REST API
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:IN&key=${apiKey}`
        );
        const data = await response.json();
        if (data.status === 'OK' && data.results && data.results[0]) {
          const r = data.results[0];
          applyGeocodeResult(
            r.geometry.location.lat,
            r.geometry.location.lng,
            r.formatted_address,
            r.address_components
          );
        } else {
          toastManager.error('Address not found. Please try a different search.');
        }
      } catch (error) {
        console.error('Search error:', error);
        toastManager.error('Error searching for address.');
      } finally {
        setIsSearching(false);
      }
    }
  };

  const handleSave = async () => {
    if (!address || !selectedLocation) {
      toastManager.error('Please select an address');
      return;
    }

    setLoading(true);

    let city = '';
    let state = '';
    let pincode = '';
    let addressLine2 = '';

    if (selectedLocation.components) {
      selectedLocation.components.forEach(comp => {
        if (comp.types.includes('locality')) city = comp.long_name;
        if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
        if (comp.types.includes('postal_code')) pincode = comp.long_name;
        if (comp.types.includes('sublocality')) addressLine2 = comp.long_name;
      });
    }

    const addrData = {
      fullAddress: selectedLocation.address || address,
      addressLine1: houseNumber,
      addressLine2: addressLine2,
      city: city,
      state: state,
      pincode: pincode,
      lat: selectedLocation.lat,
      lng: selectedLocation.lng
    };

    try {
      const response = await vendorService.updateProfile({
        address: addrData
      });

      if (response.success) {
        toastManager.success('Address saved successfully!');
        setTimeout(() => {
           navigate(-1);
        }, 500);
      } else {
        toastManager.error(response.message || 'Failed to save address');
      }
    } catch (error) {
      console.error('Error saving address:', error);
      toastManager.error(error.response?.data?.message || 'Failed to save address');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header
        title="Manage Business Address"
        showBack={true}
        onBack={() => navigate(-1)}
      />

      <main className="px-4 py-6">
        {/* Info Card - Same logic as Modal */}
        <div className="rounded-xl p-3 mb-6 border" style={{ backgroundColor: `${themeColors.brand.teal}0D`, borderColor: `${themeColors.brand.teal}1A` }}>
          <div className="flex items-start gap-3">
            <FiMapPin className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: themeColors.button }} />
            <div>
              <h3 className="font-semibold mb-1 text-sm" style={{ color: themeColors.button }}>Set Business Location</h3>
              <p className="text-xs" style={{ color: `${themeColors.brand.teal}CC` }}>
                Place the pin accurately on the map to help customers locate you easily.
              </p>
            </div>
          </div>
        </div>

        {/* Map Section */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6 border border-gray-100 relative">
          <LocationPicker
            onLocationSelect={handleLocationSelect}
            initialPosition={selectedLocation}
            flyToPosition={flyToPosition}
          />
        </div>

        {/* Form Inputs Container */}
        <div className="bg-white rounded-xl p-4 shadow-md space-y-4">

          {/* Address Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Street Address / Area
            </label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
              <input
                type="text"
                placeholder={isSearching ? "Searching..." : "Search and press Enter..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                disabled={isSearching}
                className="w-full pl-10 pr-10 py-3 border-2 rounded-lg text-sm focus:outline-none transition-colors"
                style={{ 
                  borderColor: '#e5e7eb',
                  opacity: isSearching ? 0.7 : 1 
                }}
                onFocus={(e) => e.target.style.borderColor = themeColors.button}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
              {searchQuery && !isSearching && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <FiX className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* House Number */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Shop / Building Number
            </label>
            <div className="relative">
              <FiHome className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="e.g. Shop 101, Complex B"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 rounded-lg text-sm focus:outline-none transition-colors"
                style={{ borderColor: '#e5e7eb' }}
                onFocus={(e) => e.target.style.borderColor = themeColors.button}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
          </div>

          {/* Coordinates Display (Optional, for transparency) */}
          {selectedLocation && (
            <p className="text-xs text-gray-400">
              Lat/Lng: {selectedLocation.lat?.toFixed(5)}, {selectedLocation.lng?.toFixed(5)}
            </p>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!searchQuery || !selectedLocation || loading}
            className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            style={{
              background: themeColors.button,
              boxShadow: `0 4px 12px ${themeColors.button}40`
            }}
          >
            <FiSave className="w-5 h-5" />
            {loading ? 'Saving...' : 'Save Business Address'}
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default AddressManagement;

