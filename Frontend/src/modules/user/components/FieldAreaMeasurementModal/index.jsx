import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiX,
  FiMapPin,
  FiCrosshair,
  FiRotateCcw,
  FiTrash2,
  FiCheck,
  FiLayers,
  FiSearch,
  FiInfo,
  FiEdit3,
  FiGlobe,
  FiSave
} from 'react-icons/fi';
import GoogleFieldMap from './components/GoogleFieldMap';
import LeafletFieldMap from './components/LeafletFieldMap';
import {
  calculateGeodesicArea,
  calculatePolygonPerimeter,
  convertArea,
  REGIONAL_BIGHA_RATES,
  calculatePolygonCenter
} from '../../../../utils/geoAreaCalculator';
import fieldAreaService from '../../../../services/fieldAreaService';
import { toastManager } from '../../../../utils/toastManager';

const defaultLocation = {
  lat: 28.6139,
  lng: 77.209
};

const FieldAreaMeasurementModal = ({
  isOpen,
  onClose,
  onApplyArea,
  initialAcres = null,
  initialCenter = null,
  initialPoints = []
}) => {
  const [points, setPoints] = useState(initialPoints || []);
  const [center, setCenter] = useState(initialCenter || defaultLocation);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('standard');
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'manual'
  const [manualInput, setManualInput] = useState(initialAcres ? String(initialAcres) : '1');
  const [savingFarm, setSavingFarm] = useState(false);
  const [farmName, setFarmName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Check if Google Maps API key is configured
  const hasGoogleApiKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim());
  const [mapEngine, setMapEngine] = useState(hasGoogleApiKey ? 'google' : 'leaflet');

  // Update mapEngine if key status changes
  useEffect(() => {
    if (hasGoogleApiKey) {
      setMapEngine('google');
    } else {
      setMapEngine('leaflet');
    }
  }, [hasGoogleApiKey]);

  // Sync initial center or acquire user's current GPS location on open
  useEffect(() => {
    if (isOpen) {
      if (initialCenter && initialCenter.lat && initialCenter.lng) {
        setCenter(initialCenter);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCenter({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            });
          },
          () => {
            // Keep default center
          },
          { enableHighAccuracy: true, timeout: 6000 }
        );
      }
      if (initialPoints && initialPoints.length > 0) {
        setPoints(initialPoints);
        setCenter(calculatePolygonCenter(initialPoints));
      }
      if (initialAcres) {
        setManualInput(String(initialAcres));
      }
    }
  }, [isOpen, initialCenter, initialPoints, initialAcres]);

  // Calculate live area and perimeter
  const areaData = useMemo(() => {
    if (activeTab === 'map') {
      if (points.length < 3) {
        return {
          ...convertArea(0, selectedRegion),
          perimeterMeters: 0,
          perimeterFeet: 0,
          pointsCount: points.length
        };
      }
      const sqM = calculateGeodesicArea(points);
      const perimeterM = calculatePolygonPerimeter(points);
      return {
        ...convertArea(sqM, selectedRegion),
        perimeterMeters: Math.round(perimeterM * 10) / 10,
        perimeterFeet: Math.round(perimeterM * 3.28084 * 10) / 10,
        pointsCount: points.length
      };
    } else {
      const parsed = parseFloat(manualInput) || 0;
      const sqM = parsed * 4046.8564224;
      return {
        ...convertArea(sqM, selectedRegion),
        perimeterMeters: 0,
        perimeterFeet: 0,
        pointsCount: 0
      };
    }
  }, [points, activeTab, manualInput, selectedRegion]);

  // Point management handlers
  const handleAddPoint = useCallback((newPt) => {
    setPoints((prev) => [...prev, newPt]);
  }, []);

  const handleUpdatePoint = useCallback((index, updatedPt) => {
    setPoints((prev) => {
      const copy = [...prev];
      copy[index] = updatedPt;
      return copy;
    });
  }, []);

  const handleUndoPoint = () => {
    setPoints((prev) => prev.slice(0, -1));
  };

  const handleClearPoints = () => {
    setPoints([]);
  };

  // GPS Locate field
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toastManager.error('Geolocation is not supported by your browser');
      return;
    }
    toastManager.info('Locating your field via GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        setCenter(userPos);
        toastManager.success('Map centered on your current location');
      },
      (err) => {
        console.error(err);
        toastManager.error('Unable to fetch GPS position. Please check location permissions.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Search village / location via OpenStreetMap Nominatim
  const handleSearchLocation = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&countrycodes=in&limit=1`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const found = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
        setCenter(found);
        toastManager.success(`Navigated to: ${data[0].display_name.split(',')[0]}`);
      } else {
        toastManager.error('Location not found. Try searching village or district name.');
      }
    } catch (error) {
      console.error(error);
      toastManager.error('Error searching location');
    } finally {
      setSearchLoading(false);
    }
  };

  // Save farm boundary to profile
  const handleSaveToMyFarms = async () => {
    if (!farmName.trim()) {
      setShowSaveInput(true);
      return;
    }
    setSavingFarm(true);
    try {
      await fieldAreaService.saveFarmBoundary({
        name: farmName,
        sizeInAcres: areaData.acresFormatted,
        polygonCoordinates: points,
        centerLocation: center
      });
      toastManager.success(`Farm "${farmName}" saved to your profile!`);
      setShowSaveInput(false);
      setFarmName('');
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Please log in to save farm boundary.');
    } finally {
      setSavingFarm(false);
    }
  };

  // Apply measured area
  const handleApply = () => {
    const finalAcres = areaData.acresFormatted;
    if (!finalAcres || finalAcres <= 0) {
      toastManager.error('Please mark a field border or enter a valid area first.');
      return;
    }

    if (onApplyArea) {
      onApplyArea({
        acres: finalAcres,
        bigha: areaData.bighaFormatted,
        guntha: areaData.gunthaFormatted,
        hectares: areaData.hectaresFormatted,
        sqMeters: areaData.sqMeters,
        points: activeTab === 'map' ? points : [],
        perimeterMeters: areaData.perimeterMeters,
        region: selectedRegion
      });
    }

    toastManager.success(`Applied ${finalAcres} Acres (${areaData.bighaFormatted} Bigha)`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-4xl h-[92vh] max-h-[880px] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/80"
        >
          {/* MODAL HEADER */}
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-800 via-emerald-700 to-green-800 text-white flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white shrink-0 border border-white/20">
                <FiMapPin size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black tracking-tight truncate">
                    खेत का क्षेत्रफल मापन • Field Area Measurement
                  </h2>
                </div>
                <p className="text-[11px] text-emerald-100/90 font-medium truncate">
                  Satellite border drawing & geodesic Acre / Bigha calculator
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Engine Switch Pill */}
              <div className="hidden sm:flex items-center gap-1 bg-black/25 px-2.5 py-1 rounded-full text-[10px] font-bold border border-white/10">
                <FiGlobe size={11} className="text-emerald-300" />
                <span>
                  {mapEngine === 'google'
                    ? 'Google Maps Hybrid'
                    : 'Esri World Satellite'}
                </span>
                {hasGoogleApiKey && (
                  <button
                    type="button"
                    onClick={() => setMapEngine((prev) => (prev === 'google' ? 'leaflet' : 'google'))}
                    className="ml-1 text-[9px] underline text-emerald-200 hover:text-white cursor-pointer"
                  >
                    Switch
                  </button>
                )}
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
                aria-label="Close"
              >
                <FiX size={18} />
              </button>
            </div>
          </div>

          {/* ENGINE STATUS BANNER (if Google API key is missing) */}
          {!hasGoogleApiKey && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 flex items-center justify-between text-[11px] text-amber-900 shrink-0">
              <span className="flex items-center gap-1.5 font-semibold">
                <FiInfo size={13} className="text-amber-600 shrink-0" />
                <span>
                  🛰️ High-Resolution Satellite View Active. Google Maps API will auto-activate when <code className="bg-amber-100 px-1 py-0.5 rounded text-[10px]">VITE_GOOGLE_MAPS_API_KEY</code> is added.
                </span>
              </span>
              <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                Fully Functional
              </span>
            </div>
          )}

          {/* TOOLBAR CONTROLS */}
          <div className="px-3 sm:px-4 py-2 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
            {/* Left: Mode Tabs & Region Selector */}
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-200/80 p-0.5 rounded-xl border border-slate-300/60">
                <button
                  type="button"
                  onClick={() => setActiveTab('map')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'map'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FiLayers size={13} />
                  <span>Map Drawing</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'manual'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FiEdit3 size={13} />
                  <span>Manual Input</span>
                </button>
              </div>

              {/* Regional Bigha Rate Selector */}
              <div className="relative">
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="bg-white border border-slate-300 text-slate-800 text-[11px] font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs cursor-pointer"
                >
                  {REGIONAL_BIGHA_RATES.map((r) => (
                    <option key={r.key} value={r.key}>
                      📍 {r.name} ({r.rate} Bigha/Acre)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right: Search & Action Buttons (Map Mode) */}
            {activeTab === 'map' && (
              <div className="flex items-center gap-1.5 flex-1 sm:flex-initial justify-end">
                {/* Search Village */}
                <form onSubmit={handleSearchLocation} className="relative flex-1 sm:w-56">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search village, city..."
                    className="w-full bg-white border border-slate-300 rounded-xl pl-7 pr-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <FiSearch size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
                </form>

                {/* GPS Locate Me */}
                <button
                  type="button"
                  onClick={handleLocateMe}
                  title="Center map on my field (GPS)"
                  className="p-1.5 sm:px-2.5 sm:py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                >
                  <FiCrosshair size={13} className="text-emerald-600" />
                  <span className="hidden sm:inline">My GPS</span>
                </button>

                {/* Undo Pin */}
                <button
                  type="button"
                  onClick={handleUndoPoint}
                  disabled={points.length === 0}
                  title="Undo last marked pin"
                  className="p-1.5 sm:px-2.5 sm:py-1 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                >
                  <FiRotateCcw size={12} />
                  <span className="hidden sm:inline">Undo</span>
                </button>

                {/* Clear All */}
                <button
                  type="button"
                  onClick={handleClearPoints}
                  disabled={points.length === 0}
                  title="Clear all marked points"
                  className="p-1.5 sm:px-2.5 sm:py-1 bg-white hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed text-rose-600 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                >
                  <FiTrash2 size={12} />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </div>
            )}
          </div>

          {/* MAIN BODY: MAP OR MANUAL */}
          <div className="flex-1 relative min-h-0 bg-slate-900 overflow-hidden">
            {activeTab === 'map' ? (
              <>
                {/* Map Component */}
                <div className="w-full h-full">
                  {mapEngine === 'google' && hasGoogleApiKey ? (
                    <GoogleFieldMap
                      center={center}
                      zoom={17}
                      points={points}
                      onAddPoint={handleAddPoint}
                      onUpdatePoint={handleUpdatePoint}
                    />
                  ) : (
                    <LeafletFieldMap
                      center={center}
                      zoom={17}
                      points={points}
                      onAddPoint={handleAddPoint}
                      onUpdatePoint={handleUpdatePoint}
                    />
                  )}
                </div>

                {/* Floating Map Instruction Pill */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                  <div className="bg-slate-950/85 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full text-xs font-bold shadow-lg border border-white/20 flex items-center gap-2">
                    {points.length === 0 ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        <span>👆 Click or tap farm corners to drop boundary pins</span>
                      </>
                    ) : points.length < 3 ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span>Drop {3 - points.length} more pin{3 - points.length > 1 ? 's' : ''} to complete field polygon</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>✅ {points.length} Pins Marked • Drag any numbered pin to fine-tune</span>
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* MANUAL INPUT TAB */
              <div className="w-full h-full bg-slate-50 p-6 flex flex-col items-center justify-center overflow-y-auto">
                <div className="w-full max-w-md bg-white rounded-2xl p-6 border border-slate-200/80 shadow-md">
                  <div className="flex items-center gap-2 mb-4 text-emerald-800">
                    <FiEdit3 size={20} />
                    <h3 className="font-black text-sm uppercase tracking-wider">
                      Manual Land Size Input
                    </h3>
                  </div>

                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Enter Total Land Size in Acres:
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="500"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      className="w-full text-2xl font-black text-slate-900 border-2 border-emerald-600 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="e.g. 2.5"
                    />
                    <span className="text-sm font-black text-slate-500">Acres</span>
                  </div>

                  {/* Preset Pills */}
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {[0.5, 1, 1.5, 2, 3, 5, 8, 10, 15, 20].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setManualInput(String(preset))}
                        className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          parseFloat(manualInput) === preset
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {preset} Acre{preset !== 1 ? 's' : ''}
                      </button>
                    ))}
                  </div>

                  <p className="text-[11px] text-slate-500 mt-4">
                    💡 Tip: Switch back to <strong>Map Drawing</strong> tab anytime to drop pins around your actual farm boundary on satellite imagery for centimeter precision.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* BOTTOM MEASUREMENT HUD & ACTIONS */}
          <div className="bg-white border-t border-slate-200/80 p-3 sm:p-4 shrink-0 shadow-lg">
            {/* Unit Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-3">
              {/* Primary Acre Display */}
              <div className="col-span-2 sm:col-span-2 bg-gradient-to-br from-emerald-50 to-green-100/70 border border-emerald-300 rounded-2xl p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">
                    🌾 Measured Land Size (एकड़)
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-2xl sm:text-3xl font-black text-emerald-900 leading-none">
                      {areaData.acresFormatted}
                    </span>
                    <span className="text-xs font-black text-emerald-700">Acres</span>
                  </div>
                </div>
                {areaData.pointsCount > 0 && (
                  <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                    {areaData.pointsCount} Pins
                  </span>
                )}
              </div>

              {/* Bigha */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  बीघा • Bigha
                </span>
                <span className="text-base font-black text-slate-900 mt-0.5">
                  {areaData.bighaFormatted}
                </span>
              </div>

              {/* Guntha */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  गुंठा • Guntha
                </span>
                <span className="text-base font-black text-slate-900 mt-0.5">
                  {areaData.gunthaFormatted}
                </span>
              </div>

              {/* Hectare */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  हेक्टेयर • Hectares
                </span>
                <span className="text-base font-black text-slate-900 mt-0.5">
                  {areaData.hectaresFormatted}
                </span>
              </div>

              {/* Perimeter */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  घेरा • Perimeter
                </span>
                <span className="text-base font-black text-slate-900 mt-0.5">
                  {areaData.perimeterMeters ? `${areaData.perimeterMeters} m` : '—'}
                </span>
              </div>
            </div>

            {/* Extra details (Sq Meters / Sq Feet) */}
            <div className="hidden sm:flex items-center justify-between text-[11px] text-slate-500 mb-3 px-1">
              <span>
                ≈ {areaData.sqMeters.toLocaleString('en-IN')} m² (वर्ग मीटर) • {areaData.sqFeet.toLocaleString('en-IN')} sq ft (वर्ग फीट)
              </span>
              <span>
                Regional Standard: <strong className="text-slate-700">{areaData.regionLabel}</strong>
              </span>
            </div>

            {/* Save Farm Input Drawer */}
            {showSaveInput && (
              <div className="flex items-center gap-2 mb-3 bg-emerald-50/80 p-2 rounded-xl border border-emerald-200">
                <input
                  type="text"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  placeholder="Enter Farm / Khet Name (e.g. North Khet #1)"
                  className="flex-1 bg-white border border-emerald-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveToMyFarms}
                  disabled={savingFarm}
                  className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 cursor-pointer disabled:opacity-50"
                >
                  {savingFarm ? 'Saving...' : 'Confirm Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveInput(false)}
                  className="px-2 py-1.5 text-slate-500 hover:text-slate-800 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveInput((prev) => !prev)}
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <FiSave size={13} />
                  <span className="hidden sm:inline">Save to My Farms</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleApply}
                disabled={!areaData.acresFormatted || areaData.acresFormatted <= 0}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 hover:from-emerald-700 hover:to-green-900 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-emerald-700/25 flex items-center gap-2 transition-all cursor-pointer"
              >
                <FiCheck size={16} />
                <span>Apply Measured Area ({areaData.acresFormatted} Acres)</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default FieldAreaMeasurementModal;
