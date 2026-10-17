import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  GoogleMap,
  Marker,
  useJsApiLoader
} from '@react-google-maps/api';
import { FiCrosshair } from 'react-icons/fi';
import { toastManager } from '../../../../../utils/toastManager';

const GOOGLE_LIBRARIES = ['places'];

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const defaultCenter = { lat: 28.6139, lng: 77.2090 };

const mapContainerStyle = { width: '100%', height: '100%' };

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  gestureHandling: 'greedy',
};

const LocationPicker = ({ onLocationSelect, initialPosition = null, flyToPosition = null }) => {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: MAPS_API_KEY,
    libraries: GOOGLE_LIBRARIES,
  });

  const [marker, setMarker] = useState(initialPosition || defaultCenter);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef(null);

  // Pan map when flyToPosition changes (from city search in parent)
  useEffect(() => {
    if (flyToPosition) {
      setMarker(flyToPosition);
      mapRef.current?.panTo(flyToPosition);
      mapRef.current?.setZoom(15);
    }
  }, [flyToPosition]);

  // Update marker from initialPosition
  useEffect(() => {
    if (initialPosition) {
      setMarker(initialPosition);
    }
  }, [initialPosition]);

  // Get user's current location on mount for centering marker only (do not auto-reverse geocode)
  useEffect(() => {
    if (!initialPosition && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMarker(newPos);
        },
        () => {}
      );
    }
  }, [initialPosition]);

  const reverseGeocode = useCallback(async (position) => {
    if (!position || typeof position.lat !== 'number' || typeof position.lng !== 'number') return;
    setLoading(true);

    const fallbackNominatimOrCoords = async () => {
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.lat}&lon=${position.lng}&zoom=18&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.display_name) {
            const comps = [];
            if (data.address) {
              const locality = data.address.city || data.address.town || data.address.village || data.address.suburb;
              if (locality) comps.push({ types: ['locality'], long_name: locality });
              if (data.address.state) comps.push({ types: ['administrative_area_level_1'], long_name: data.address.state });
              if (data.address.postcode) comps.push({ types: ['postal_code'], long_name: data.address.postcode });
            }
            if (onLocationSelect) {
              onLocationSelect({
                lat: position.lat,
                lng: position.lng,
                address: data.display_name,
                components: comps,
              });
            }
            return;
          }
        }
      } catch (e) {
        console.warn('Nominatim reverse geocode fallback failed:', e);
      }

      // Final coordinate fallback so user is NEVER blocked from completing booking!
      if (onLocationSelect) {
        onLocationSelect({
          lat: position.lat,
          lng: position.lng,
          address: `Pinned Location (${position.lat.toFixed(5)}, ${position.lng.toFixed(5)})`,
          components: [],
        });
      }
    };

    if (window.google?.maps?.Geocoder) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: position }, async (results, status) => {
          if (status === 'OK' && results && results[0]) {
            setLoading(false);
            if (onLocationSelect) {
              onLocationSelect({
                lat: position.lat,
                lng: position.lng,
                address: results[0].formatted_address,
                components: results[0].address_components || [],
              });
            }
          } else {
            console.warn(`[LocationPicker] Google Geocoder status: ${status}. Falling back to Nominatim.`);
            await fallbackNominatimOrCoords();
            setLoading(false);
          }
        });
        return;
      } catch (err) {
        console.error('Google Geocoding error:', err);
      }
    }

    await fallbackNominatimOrCoords();
    setLoading(false);
  }, [onLocationSelect]);

  const handleMapClick = useCallback((e) => {
    const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setMarker(newPos);
    reverseGeocode(newPos);
  }, [reverseGeocode]);

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      toastManager.error('Geolocation is not supported by your browser.');
      return;
    }
    setLoading(true);

    const onGeoSuccess = (pos) => {
      setLoading(false);
      const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMarker(newPos);
      mapRef.current?.panTo(newPos);
      mapRef.current?.setZoom(16);
      reverseGeocode(newPos);
    };

    const onGeoError = (error) => {
      setLoading(false);
      let msg = 'Unable to get your current location.';
      if (error.code === 1) msg = 'Location permission denied. Please allow location in browser/OS settings.';
      else if (error.code === 2) msg = 'Location unavailable. Please check your GPS/Wi-Fi connection.';
      else if (error.code === 3) msg = 'Location request timed out.';
      toastManager.error(`${msg} Please select manually on the map.`);
    };

    // Try high accuracy first (good for GPS phones), then fallback to low accuracy (good for Macs/laptops)
    navigator.geolocation.getCurrentPosition(
      onGeoSuccess,
      () => {
        navigator.geolocation.getCurrentPosition(
          onGeoSuccess,
          onGeoError,
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );
  };

  const containerRef = useRef(null);

  // Ensure all buttons created inside Google Maps (zoom, keyboard shortcuts) explicitly have type="button"
  const ensureButtonsAreNotSubmit = useCallback(() => {
    if (containerRef.current) {
      const buttons = containerRef.current.querySelectorAll('button');
      buttons.forEach(btn => {
        if (!btn.getAttribute('type') || btn.getAttribute('type') === 'submit') {
          btn.setAttribute('type', 'button');
        }
      });
    }
  }, []);

  useEffect(() => {
    ensureButtonsAreNotSubmit();
    const interval = setInterval(ensureButtonsAreNotSubmit, 1000);
    return () => clearInterval(interval);
  }, [ensureButtonsAreNotSubmit]);

  if (loadError) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-slate-100 rounded-2xl text-sm text-slate-500">
        Failed to load Google Maps. Check your API key.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-slate-100 rounded-2xl">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-medium">Loading map…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full relative shadow-sm rounded-2xl overflow-hidden border border-slate-200"
      onClickCapture={(e) => {
        // Prevent any button inside map from acting as form submit button
        const btn = e.target.closest('button');
        if (btn) {
          if (!btn.getAttribute('type') || btn.getAttribute('type') === 'submit') {
            btn.setAttribute('type', 'button');
          }
        }
      }}
    >
      <div className="relative h-64 bg-slate-100">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={marker}
          zoom={15}
          options={mapOptions}
          onClick={handleMapClick}
          onLoad={(map) => {
            mapRef.current = map;
            ensureButtonsAreNotSubmit();
          }}
        >
          <Marker position={marker} />
        </GoogleMap>

        {/* Pin Instruction Overlay */}
        <div
          className="absolute bottom-4 left-4 bg-slate-900/90 text-white px-3 py-1.5 rounded-xl text-[9px] uppercase font-black tracking-widest shadow-lg backdrop-blur-sm pointer-events-none"
          style={{ zIndex: 10 }}
        >
          {loading ? 'Fetching address…' : 'Tap map to pin location'}
        </div>

        {/* Locate Me Button */}
        <button
          type="button"
          onClick={handleCurrentLocation}
          style={{ zIndex: 10 }}
          className="absolute bottom-4 right-4 p-3.5 bg-white rounded-xl shadow-lg flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all border border-slate-100 text-teal-600"
        >
          <FiCrosshair className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default LocationPicker;
