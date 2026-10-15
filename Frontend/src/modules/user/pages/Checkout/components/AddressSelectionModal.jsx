import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { FiArrowLeft, FiX, FiSearch, FiMapPin, FiHome, FiLoader } from 'react-icons/fi';
import { themeColors } from '../../../../../theme';
import LocationPicker from './LocationPicker';
import { toastManager } from '../../../../../utils/toastManager';

const AddressSelectionModal = ({ isOpen, onClose, address = '', houseNumber = '', onHouseNumberChange, onSave }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [mapAddress, setMapAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [flyToPosition, setFlyToPosition] = useState(null);

  const searchContainerRef = useRef(null);
  const lastSelectedAddressRef = useRef('');
  const autocompleteServiceRef = useRef(null);

  // Initialize Google AutocompleteService when Google API is available
  useEffect(() => {
    const initService = () => {
      if (window.google?.maps?.places?.AutocompleteService) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      }
    };
    initService();
    const timer = setInterval(() => {
      if (window.google?.maps?.places?.AutocompleteService) {
        initService();
        clearInterval(timer);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Lock body scroll when modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (address && !mapAddress) {
        setMapAddress(address);
        setSearchQuery(address);
        lastSelectedAddressRef.current = address;
      }
    } else {
      document.body.style.overflow = '';
      setIsClosing(false);
      setSuggestions([]);
      setIsDropdownOpen(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, address]);

  // Dismiss dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 250);
  };

  // Trigger search via Google Places Autocomplete
  const performSearch = useCallback(async (queryText) => {
    const q = (queryText || '').trim();
    if (!q || q.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setIsDropdownOpen(true);

    if (autocompleteServiceRef.current || window.google?.maps?.places?.AutocompleteService) {
      if (!autocompleteServiceRef.current) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      }
      try {
        autocompleteServiceRef.current.getPlacePredictions(
          {
            input: q,
            componentRestrictions: { country: 'in' },
          },
          (predictions, status) => {
            setIsSearching(false);
            if (status === window.google.maps.places.PlacesServiceStatus.OK && Array.isArray(predictions)) {
              setSuggestions(predictions);
            } else {
              setSuggestions([]);
            }
          }
        );
        return;
      } catch (err) {
        console.warn('Google Places Autocomplete error:', err);
      }
    }

    // Fallback to Google Geocoding API if window.google is still loading
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:IN&key=${apiKey}`
        );
        const data = await response.json();
        if (data.status === 'OK' && Array.isArray(data.results)) {
          const mapped = data.results.map(r => ({
            place_id: r.place_id,
            description: r.formatted_address,
            structured_formatting: {
              main_text: r.address_components?.[0]?.long_name || r.formatted_address.split(',')[0],
              secondary_text: r.formatted_address.split(',').slice(1).join(', ').trim()
            },
            _geocodeResult: r
          }));
          setSuggestions(mapped);
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        console.warn('[AddressSearch] Geocode search error:', error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    } else {
      setIsSearching(false);
    }
  }, []);

  // Live debounced search as user types
  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (!trimmed || trimmed === lastSelectedAddressRef.current.trim()) {
      return;
    }

    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsDropdownOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(trimmed);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  // When user clicks a suggestion from the dropdown
  const handleSelectSuggestion = (prediction) => {
    const addressStr = prediction.description || prediction.formatted_address;
    lastSelectedAddressRef.current = addressStr;
    setSearchQuery(addressStr);
    setMapAddress(addressStr);
    setSuggestions([]);
    setIsDropdownOpen(false);

    if (prediction._geocodeResult) {
      const r = prediction._geocodeResult;
      const lat = typeof r.geometry.location.lat === 'function' ? r.geometry.location.lat() : r.geometry.location.lat;
      const lng = typeof r.geometry.location.lng === 'function' ? r.geometry.location.lng() : r.geometry.location.lng;
      const loc = {
        lat,
        lng,
        address: r.formatted_address,
        components: r.address_components || []
      };
      setSelectedLocation(loc);
      setFlyToPosition({ lat, lng });
      return;
    }

    if (window.google?.maps?.Geocoder) {
      const geocoder = new window.google.maps.Geocoder();
      const request = prediction.place_id
        ? { placeId: prediction.place_id }
        : { address: addressStr };

      geocoder.geocode(request, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const res = results[0];
          const lat = res.geometry.location.lat();
          const lng = res.geometry.location.lng();
          const loc = {
            lat,
            lng,
            address: res.formatted_address,
            components: res.address_components || []
          };
          setSelectedLocation(loc);
          setFlyToPosition({ lat, lng });
        }
      });
    }
  };

  // When user taps on the map pin or locate me
  const handleLocationSelect = (location) => {
    lastSelectedAddressRef.current = location.address;
    setSelectedLocation(location);
    setMapAddress(location.address);
    setSearchQuery(location.address);
    setSuggestions([]);
    setIsDropdownOpen(false);
  };

  // Keyboard navigation & enter handler
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0) {
        handleSelectSuggestion(suggestions[0]);
      } else if (searchQuery.trim()) {
        performSearch(searchQuery);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  // Don't render if closed and not animating
  if (!isOpen && !isClosing) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        animation: isClosing
          ? 'modalSlideDown 0.25s ease-in forwards'
          : 'modalSlideUp 0.25s ease-out forwards',
      }}
    >
      <style>{`
        @keyframes modalSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes modalSlideDown {
          from { transform: translateY(0);    opacity: 1; }
          to   { transform: translateY(100%); opacity: 0; }
        }
        @keyframes spinIcon {
          from { transform: translateY(-50%) rotate(0deg); }
          to   { transform: translateY(-50%) rotate(360deg); }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#fff',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <FiArrowLeft size={18} color="#111" />
          </button>
          <span style={{ fontWeight: 700, fontSize: 17, color: '#111' }}>Set Location on Map</span>
        </div>
        <button
          type="button"
          onClick={handleClose}
          style={{
            background: '#f3f4f6',
            border: 'none',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <FiX size={18} color="#111" />
        </button>
      </div>

      {/* ── Scrollable Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

        {/* Info banner */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            background: `${themeColors.brand?.teal || '#059669'}12`,
            border: `1px solid ${themeColors.brand?.teal || '#059669'}30`,
            borderRadius: 12,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 12,
          }}>
            <FiMapPin size={16} color={themeColors.button || '#059669'} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: themeColors.button || '#059669' }}>Set Your Service Location</div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                Tap on the map or search for an address to pin your location.
              </div>
            </div>
          </div>
        </div>

        {/* Map */}
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <LocationPicker
              onLocationSelect={handleLocationSelect}
              initialPosition={selectedLocation}
              flyToPosition={flyToPosition}
            />
          </div>
        </div>

        {/* Search + House Number + Save */}
        <div style={{ padding: '0 16px' }}>

          {/* Address Search Label */}
          <label style={{
            display: 'block', fontSize: 10, fontWeight: 800, color: '#9ca3af',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, marginLeft: 2,
          }}>
            Search Address
          </label>
          
          {/* Search Box Container with Dropdown */}
          <div ref={searchContainerRef} style={{ position: 'relative', marginBottom: 16, zIndex: 50 }}>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => performSearch(searchQuery)}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  padding: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2
                }}
                title="Click to search"
              >
                <FiSearch size={16} color={isSearching ? (themeColors.button || '#059669') : '#9ca3af'} />
              </button>

              <input
                type="text"
                placeholder={isSearching ? "Searching locations..." : "Search colony, city, landmark..."}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => {
                  if (suggestions.length > 0 || (searchQuery.trim().length >= 2 && !isSearching)) {
                    setIsDropdownOpen(true);
                  }
                }}
                onKeyDown={handleSearchKeyDown}
                style={{
                  width: '100%',
                  padding: '12px 64px 12px 38px',
                  background: '#f9fafb',
                  border: isDropdownOpen && (suggestions.length > 0 || isSearching) ? `1.5px solid ${themeColors.button || '#059669'}` : '1px solid #e5e7eb',
                  borderRadius: isDropdownOpen && (suggestions.length > 0 || isSearching) ? '12px 12px 0 0' : 12,
                  fontSize: 14,
                  fontWeight: 500,
                  outline: 'none',
                  boxSizing: 'border-box',
                  color: '#1e293b',
                  transition: 'border 0.2s',
                }}
              />

              <div style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                zIndex: 2
              }}>
                {isSearching && (
                  <div style={{
                    width: 15,
                    height: 15,
                    border: `2px solid ${themeColors.button || '#059669'}30`,
                    borderTopColor: themeColors.button || '#059669',
                    borderRadius: '50%',
                    animation: 'spinIcon 0.7s linear infinite'
                  }} />
                )}
                {searchQuery && !isSearching && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSuggestions([]);
                      setIsDropdownOpen(false);
                      lastSelectedAddressRef.current = '';
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center' }}
                  >
                    <FiX size={15} color="#9ca3af" />
                  </button>
                )}
              </div>
            </div>

            {/* ── Search Suggestions Dropdown ── */}
            {isDropdownOpen && searchQuery.trim().length >= 2 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#ffffff',
                borderRadius: '0 0 14px 14px',
                border: `1.5px solid ${themeColors.button || '#059669'}`,
                borderTop: '1px solid #f1f5f9',
                boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.16)',
                zIndex: 9999,
                maxHeight: 280,
                overflowY: 'auto',
              }}>
                {isSearching && suggestions.length === 0 ? (
                  <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
                    <div style={{
                      width: 15,
                      height: 15,
                      border: `2px solid ${themeColors.button || '#059669'}30`,
                      borderTopColor: themeColors.button || '#059669',
                      borderRadius: '50%',
                      animation: 'spinIcon 0.7s linear infinite'
                    }} />
                    Searching places...
                  </div>
                ) : suggestions.length > 0 ? (
                  <div>
                    <div style={{
                      padding: '7px 14px',
                      background: '#f8fafc',
                      borderBottom: '1px solid #f1f5f9',
                      fontSize: 10,
                      fontWeight: 800,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}>
                      Select Location ({suggestions.length})
                    </div>
                    {suggestions.map((item, idx) => {
                      const mainName = item.structured_formatting?.main_text || item.description?.split(',')[0] || item.display_name?.split(',')[0] || item.name || 'Location';
                      const subAddress = item.structured_formatting?.secondary_text || item.description?.split(',').slice(1).join(', ').trim() || '';
                      return (
                        <div
                          key={item.place_id || idx}
                          onClick={() => handleSelectSuggestion(item)}
                          style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            borderBottom: idx === suggestions.length - 1 ? 'none' : '1px solid #f3f4f6',
                            transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                        >
                          <div style={{
                            marginTop: 2,
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: '#ecfdf5',
                            color: themeColors.button || '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <FiMapPin size={13} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {mainName}
                            </div>
                            <div style={{
                              fontSize: 11,
                              color: '#64748b',
                              lineHeight: 1.35,
                              marginTop: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>
                              {subAddress || item.display_name}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : !isSearching ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: 2 }}>No matching places found</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Try searching by colony, road, landmark, or city name</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* House/Flat Number */}
          <label style={{
            display: 'block', fontSize: 10, fontWeight: 800, color: '#9ca3af',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, marginLeft: 2,
          }}>
            House / Flat / Office No. (Optional)
          </label>
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <FiHome size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
            <input
              type="text"
              placeholder="e.g. Flat 101, Block A"
              value={houseNumber}
              onChange={(e) => onHouseNumberChange(e.target.value)}
              style={{
                width: '100%', padding: '12px 12px 12px 36px',
                background: '#f9fafb', border: '1px solid #e5e7eb',
                borderRadius: 12, fontSize: 14, fontWeight: 500,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Selected address preview */}
          {mapAddress ? (
            <div style={{
              background: `${themeColors.brand?.teal || '#059669'}0D`,
              border: `1px solid ${themeColors.brand?.teal || '#059669'}30`,
              borderRadius: 12, padding: '10px 14px', marginBottom: 16,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <FiMapPin size={14} color={themeColors.button || '#059669'} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{mapAddress}</span>
            </div>
          ) : null}

          {/* Save Button */}
          <button
            type="button"
            onClick={() => onSave(houseNumber, selectedLocation || (mapAddress ? { address: mapAddress } : null))}
            disabled={!mapAddress}
            style={{
              width: '100%', padding: '15px', borderRadius: 14,
              background: mapAddress ? (themeColors.button || '#059669') : '#d1d5db',
              color: '#fff', fontWeight: 800, fontSize: 13,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              border: 'none', cursor: mapAddress ? 'pointer' : 'not-allowed',
              boxShadow: mapAddress ? `0 6px 18px ${(themeColors.button || '#059669')}40` : 'none',
              marginBottom: 40, transition: 'all 0.2s',
            }}
          >
            {mapAddress ? '✓ Confirm & Save Location' : 'Pin a Location on Map First'}
          </button>
        </div>
      </div>
    </div>
  );

  // Portal → renders directly on document.body, bypasses any parent CSS stacking
  return ReactDOM.createPortal(modalContent, document.body);
};

export default AddressSelectionModal;
