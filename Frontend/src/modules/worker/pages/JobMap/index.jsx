// JobMap component for tracking worker journey and arrival verification
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, OverlayView, PolylineF } from '@react-google-maps/api';
import { GOOGLE_MAPS_LOADER_ID, GOOGLE_MAPS_LIBRARIES } from '../../../../utils/googleMapsLoader';
import { FiArrowLeft, FiNavigation, FiMapPin, FiCrosshair, FiPhone, FiCheckCircle, FiMaximize, FiMinimize, FiClock, FiWifiOff, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import workerService from '../../../../services/workerService';
import VisitVerificationModal from '../../components/common/VisitVerificationModal';
import useAppNotifications from '../../../../hooks/useAppNotifications';

const SHOW_SIMULATION_BUTTON = false; // Set to true for debugging

const JobMap = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [coords, setCoords] = useState(null);
  const [heading, setHeading] = useState(0);
  const [routePath, setRoutePath] = useState([]);
  const [directions, setDirections] = useState(null);
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [isAutoCenter, setIsAutoCenter] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [map, setMap] = useState(null);
  const [isNavigationMode, setIsNavigationMode] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSimulating, setIsSimulating] = useState(false);

  // Network Status Listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;

  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  const mapRef = useRef(null);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const response = await workerService.getJobById(id);
        const data = response.data || response;
        setJob(data);

        // 1. Destination: Fixed Job Address from DB
        const bAddr = data.address || {};

        if (bAddr.lat && bAddr.lng) {
          setCoords({ lat: parseFloat(bAddr.lat), lng: parseFloat(bAddr.lng) });
        } else {
          const addressStr = typeof bAddr === 'string' ? bAddr : `${bAddr.addressLine1 || ''}, ${bAddr.city || ''}, ${bAddr.state || ''} ${bAddr.pincode || ''}`;
          if (addressStr.replaceAll(',', '').trim() && !addressStr.toLowerCase().includes('current location')) {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ address: addressStr }, (results, status) => {
              if (status === 'OK' && results[0]) {
                setCoords(results[0].geometry.location.toJSON());
              }
            });
          }
        }

      } catch (error) {
        // Error
      } finally {
        setLoading(false);
      }
    };
    if (isLoaded) fetchJob();
  }, [id, isLoaded]);

  // Watch Location
  useEffect(() => {
    // START CHANGE: If simulating, do NOT watch real GPS position
    if (isSimulating) return;
    // END CHANGE

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          // START CHANGE: Double check simulating state inside callback
          if (isSimulating) return;
          // END CHANGE

          const { latitude, longitude, heading: gpsHeading } = position.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });

          // Use GPS heading if available (more accurate for movement)
          if (gpsHeading !== null && !isNaN(gpsHeading)) {
            setHeading(gpsHeading);
          }
        },
        (error) => {
          // GPS Tracking Error
          if (error.code === 1) { // PERMISSION_DENIED
            toastManager.error("Location permission denied. Map cannot track you.");
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      toastManager.error("Geolocation not supported on this device");
    }
  }, [isSimulating]); // Add isSimulating to dependency array

  const socket = useAppNotifications('worker'); // Use worker namespace

  // ... code ...

  // Sync Location to Backend (Periodic)
  useEffect(() => {
    if (socket && id) {
      socket.emit('join_tracking', id);
    }
  }, [socket, id]);

  useEffect(() => {
    if (currentLocation && socket && id) {
      const syncInterval = setInterval(() => {
        // START CHANGE: If simulating, do NOT emit periodic updates here (simulation loop does it)
        if (isSimulating) return;
        // END CHANGE

        if (currentLocation.lat && currentLocation.lng) {
          socket.emit('update_location', {
            bookingId: id,
            lat: currentLocation.lat,
            lng: currentLocation.lng
          });
        }
      }, 5000);

      return () => clearInterval(syncInterval);
    }
  }, [currentLocation, socket, id, isSimulating]); // Add isSimulating to dependency array
  // DEBUG: Location Simulator for testing
  const simulationRef = useRef(null);

  const startSimulation = () => {
    if (!currentLocation || !coords || !socket) {
      toastManager.error('Wait for map to load first');
      return;
    }

    if (!routePath || routePath.length === 0) {
      toastManager.error('No road path found. Wait for route to load.');
      return;
    }

    setIsSimulating(true);
    toastManager.success('Simulation started. Following the road.');

    // Generate detailed points along the specific road path
    const pathPoints = [];
    const stepMeters = 20; // Distance between points (smaller = smoother)

    // Use the FULL path for simulation, not the sliced visualization path
    const simPath = fullRoutePathRef.current && fullRoutePathRef.current.length > 0 ? fullRoutePathRef.current : routePath;

    for (let i = 0; i < simPath.length - 1; i++) {
      const p1 = simPath[i];
      const p2 = simPath[i + 1];

      // Helper to safely get coords whether it's a LatLng object or plain object
      const getLat = (p) => typeof p.lat === 'function' ? p.lat() : p.lat;
      const getLng = (p) => typeof p.lng === 'function' ? p.lng() : p.lng;

      const lat1 = getLat(p1);
      const lng1 = getLng(p1);
      const lat2 = getLat(p2);
      const lng2 = getLng(p2);

      const p1LatLng = new window.google.maps.LatLng(lat1, lng1);
      const p2LatLng = new window.google.maps.LatLng(lat2, lng2);

      const dist = window.google.maps.geometry.spherical.computeDistanceBetween(p1LatLng, p2LatLng);
      const steps = Math.max(1, Math.floor(dist / stepMeters));

      for (let j = 0; j < steps; j++) {
        const fraction = j / steps;
        const lat = lat1 + (lat2 - lat1) * fraction;
        const lng = lng1 + (lng2 - lng1) * fraction;
        pathPoints.push({ lat, lng });
      }
    }
    // Add destination
    const last = simPath[simPath.length - 1];
    const lastLat = typeof last.lat === 'function' ? last.lat() : last.lat;
    const lastLng = typeof last.lng === 'function' ? last.lng() : last.lng;
    pathPoints.push({ lat: lastLat, lng: lastLng });

    let pathIndex = 0;

    simulationRef.current = setInterval(() => {
      if (pathIndex >= pathPoints.length) {
        stopSimulation();
        toastManager.success('Arrived at destination.');
        return;
      }

      const point = pathPoints[pathIndex];
      let simHeading = heading;

      // Calculate heading for correct icon rotation
      if (pathIndex < pathPoints.length - 1) {
        const nextPoint = pathPoints[pathIndex + 1];
        simHeading = window.google.maps.geometry.spherical.computeHeading(
          new window.google.maps.LatLng(point),
          new window.google.maps.LatLng(nextPoint)
        );
      }

      // Emit to socket
      socket.emit('update_location', {
        bookingId: id,
        lat: point.lat,
        lng: point.lng,
        heading: simHeading
      });

      // Update local display
      setCurrentLocation(point);
      setHeading(simHeading);

      pathIndex++;
    }, 1000); // Update every 1 second
  };

  const stopSimulation = () => {
    if (simulationRef.current) {
      clearInterval(simulationRef.current);
      simulationRef.current = null;
    }
    setIsSimulating(false);
  };

  // Cleanup simulation on unmount
  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
      }
    };
  }, []);

  // Animated location for smooth marker movement
  const [animatedLocation, setAnimatedLocation] = useState(null);
  const targetLocationRef = useRef(null);
  const animatedLocationRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (!currentLocation) return;

    targetLocationRef.current = currentLocation;

    if (!animatedLocationRef.current) {
      animatedLocationRef.current = currentLocation;
      setAnimatedLocation(currentLocation);
      return;
    }

    const animateToTarget = () => {
      const target = targetLocationRef.current;
      const current = animatedLocationRef.current;
      if (!target || !current) return;

      const latDiff = target.lat - current.lat;
      const lngDiff = target.lng - current.lng;
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

      if (distance < 0.00001) {
        animatedLocationRef.current = target;
        setAnimatedLocation(target);
        return;
      }

      const lerpFactor = 0.1;
      const newLat = current.lat + latDiff * lerpFactor;
      const newLng = current.lng + lngDiff * lerpFactor;
      const newLocation = { lat: newLat, lng: newLng };

      animatedLocationRef.current = newLocation;
      setAnimatedLocation(newLocation);
      animationFrameRef.current = requestAnimationFrame(animateToTarget);
    };

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(animateToTarget);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [currentLocation]);

  // Sync Location to Backend (Periodic)
  useEffect(() => {
    if (socket && id) {
      socket.emit('join_tracking', id);
    }
  }, [socket, id]);

  useEffect(() => {
    if (currentLocation && socket && id) {
      const syncInterval = setInterval(() => {
        if (currentLocation.lat && currentLocation.lng) {
          socket.emit('update_location', {
            bookingId: id,
            lat: currentLocation.lat,
            lng: currentLocation.lng
          });
        }
      }, 5000);

      return () => clearInterval(syncInterval);
    }
  }, [currentLocation, socket, id]);

  const prevLocationRef = useRef(null);

  const directionsCalculatedRef = useRef(false);

  const fullRoutePathRef = useRef([]);

  // Calculate Route ONCE on initial load only
  useEffect(() => {
    if (isLoaded && currentLocation && coords && map && !directionsCalculatedRef.current) {
      directionsCalculatedRef.current = true; // Prevent recalculation

      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin: currentLocation,
          destination: coords,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            setDirections(result);
            setRouteError(null);
            const leg = result.routes[0].legs[0];
            setDistance(leg.distance.text);
            setDuration(leg.duration.text);

            // Store full path and set initial state
            fullRoutePathRef.current = result.routes[0].overview_path;
            setRoutePath(result.routes[0].overview_path);

            // Center on location
            map.setCenter(currentLocation);
            map.setZoom(15);
          } else {
            // Fallback: If worker is nearby (<300m), at destination (16m), or API key lacks Directions Service
            const riderPoint = new window.google.maps.LatLng(currentLocation);
            const destPoint = new window.google.maps.LatLng(coords);
            const distanceMeters = window.google.maps.geometry.spherical.computeDistanceBetween(riderPoint, destPoint);

            if (distanceMeters < 500 || status === 'ZERO_RESULTS' || status === 'REQUEST_DENIED') {
              setRouteError(null);
              fullRoutePathRef.current = [currentLocation, coords];
              setRoutePath([currentLocation, coords]);
              setDistance(distanceMeters < 1000 ? `${Math.round(distanceMeters)} m` : `${(distanceMeters / 1000).toFixed(1)} km`);
              setDuration(distanceMeters < 500 ? '< 1 min' : `${Math.round((distanceMeters / 1000 / 30) * 60)} min`);
              map.setCenter(currentLocation);
              map.setZoom(16);
            } else {
              setRouteError('Could not calculate a driving route to this location.');
            }
          }
        }
      );
    }
  }, [isLoaded, coords, map, currentLocation]);

  // Update distance, ETA, and Clear Traveled Path as worker moves
  useEffect(() => {
    if (isLoaded && currentLocation && coords && window.google && directionsCalculatedRef.current) {
      // 1. Calculate straight-line distance
      const riderPoint = new window.google.maps.LatLng(currentLocation);
      const destPoint = new window.google.maps.LatLng(coords);
      const distanceMeters = window.google.maps.geometry.spherical.computeDistanceBetween(riderPoint, destPoint);

      // Convert to km
      const distanceKm = distanceMeters / 1000;

      // Format distance
      if (distanceKm < 1) {
        setDistance(`${Math.round(distanceMeters)} m`);
      } else {
        setDistance(`${distanceKm.toFixed(1)} km`);
      }

      // Estimate time (assuming average speed of 30 km/h in city)
      const avgSpeedKmh = 30;
      const timeHours = distanceKm / avgSpeedKmh;
      const timeMinutes = Math.round(timeHours * 60);

      if (timeMinutes < 1) {
        setDuration('< 1 min');
      } else if (timeMinutes < 60) {
        setDuration(`${timeMinutes} min`);
      } else {
        const hours = Math.floor(timeMinutes / 60);
        const mins = timeMinutes % 60;
        setDuration(`${hours} hr ${mins} min`);
      }

      // 2. Clear Traveled Path Visualization
      if (fullRoutePathRef.current && fullRoutePathRef.current.length > 0) {
        let closestIndex = -1;
        let minDist = Infinity;

        fullRoutePathRef.current.forEach((p, idx) => {
          const d = window.google.maps.geometry.spherical.computeDistanceBetween(riderPoint, p);
          if (d < minDist) {
            minDist = d;
            closestIndex = idx;
          }
        });

        if (closestIndex !== -1) {
          const remaining = fullRoutePathRef.current.slice(closestIndex + 1);
          setRoutePath([currentLocation, ...remaining]);
        }
      }
    }
  }, [currentLocation, coords, isLoaded]);

  // Calculate Heading based on movement
  useEffect(() => {
    if (isLoaded && currentLocation && window.google) {
      if (prevLocationRef.current) {
        const start = new window.google.maps.LatLng(prevLocationRef.current);
        const end = new window.google.maps.LatLng(currentLocation);
        const distanceMoved = window.google.maps.geometry.spherical.computeDistanceBetween(start, end);

        if (distanceMoved > 1) { // Reduced threshold
          const newHeading = window.google.maps.geometry.spherical.computeHeading(start, end);
          setHeading(newHeading);
        }
      } else if (coords) {
        const start = new window.google.maps.LatLng(currentLocation);
        const end = new window.google.maps.LatLng(coords);
        setHeading(window.google.maps.geometry.spherical.computeHeading(start, end));
      }
      prevLocationRef.current = currentLocation;
    }
  }, [currentLocation, isLoaded, coords]);

  // Sync Map Heading & Tilt
  useEffect(() => {
    if (map && currentLocation && heading && isAutoCenter) {
      map.setHeading(heading);
      map.setTilt(45); // 45 degree tilt for 3D feel
    }
  }, [map, heading, isAutoCenter, currentLocation]);

  const destinationMarker = useMemo(() => coords && (
    <OverlayView
      position={coords}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div className="relative -translate-x-1/2 -translate-y-[90%] pointer-events-none flex flex-col items-center">
        <FiMapPin className="w-10 h-10 text-red-600 drop-shadow-xl fill-red-600 stroke-white stroke-[1.5px]" />
        <div className="w-3 h-1 bg-black/20 rounded-full blur-[2px] mt-[-2px]"></div>
      </div>
    </OverlayView>
  ), [coords]);

  // Use standard image for rider or generate a similar one if 'rider-3D.png' is missing. 
  // Assuming 'rider-3D.png' exists in public folder as per Vendor map.
  const riderMarker = useMemo(() => animatedLocation && (
    <OverlayView
      position={animatedLocation}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        style={{
          position: 'absolute',
          transform: 'translate(-50%, -50%)',
          cursor: 'pointer'
        }}
        className="pointer-events-none"
      >
        <div
          className="relative z-20 w-16 h-16"
          style={{
            transform: `rotate(${heading}deg)`,
            transition: 'transform 0.3s ease-out'
          }}
        >
          <img
            src="/WhatsApp_Image_2026-05-11_at_1.51.50_PM-removebg-preview.png"
            alt="Rider"
            className="w-full h-full object-contain drop-shadow-xl"
            onError={(e) => { e.target.onerror = null; e.target.src = "https://cdn-icons-png.flaticon.com/512/2972/2972185.png" }}
          />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-teal-500/30 rounded-full animate-ping z-10 pointer-events-none"></div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-12 h-3 bg-black/20 blur-sm rounded-full z-0"></div>
      </div>
    </OverlayView>
  ), [animatedLocation, heading]);

  const mapOptions = useMemo(() => ({
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeId: 'roadmap',
    gestureHandling: 'greedy',
    rotateControl: true,
    tiltControl: true,
    isFractionalZoomEnabled: true,
    mapId: mapId || '8e0a97af9386fefc',
  }), [mapId]);

  // Default center fallback (use currentLocation, coords, or default to India)
  const defaultCenter = useMemo(() => {
    if (currentLocation) return currentLocation;
    if (coords) return coords;
    return { lat: 20.5937, lng: 78.9629 }; // Center of India as fallback
  }, [currentLocation, coords]);

  if (!isLoaded || loading) return <div className="h-screen bg-gray-100 flex items-center justify-center"><div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="h-screen flex flex-col relative bg-white overflow-hidden">
      {/* Top Floating Header */}
      {/* Top Floating Header - Always Visible */}
      <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="pointer-events-auto bg-white/90 backdrop-blur-md p-3 rounded-full shadow-lg text-gray-700 hover:bg-white transition-all active:scale-95"
        >
          <FiArrowLeft className="w-6 h-6" />
        </button>
      </div>

      {/* No Internet Overlay */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-4 right-4 z-50 bg-red-500 text-white p-4 rounded-xl shadow-2xl flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shrink-0">
              <FiWifiOff className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm">No Internet Connection</h3>
              <p className="text-xs text-red-100">Check your network settings.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Route Error Overlay (Centered) */}
      <AnimatePresence>
        {routeError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-x-4 top-[20%] z-40 bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-sm mx-auto border border-gray-100"
          >
            <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center mb-4">
              <FiAlertTriangle className="w-8 h-8 text-orange-500" />
            </div>
            <h3 className="text-lg font-black text-gray-800 mb-2">Route Not Found</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              We couldn't calculate a driving path to this location. The destination might be unreachable by road or off the map.
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <FiRefreshCw className="w-4 h-4" /> Retry
              </button>
              <button
                onClick={() => {
                  const dest = coords ? `${coords.lat},${coords.lng}` : encodeURIComponent(job?.address?.addressLine1 || '');
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
                }}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                Open Maps
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Screen Stats Card */}
      <AnimatePresence>
        {isFullScreen && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-6 left-0 right-0 z-10 flex justify-center pointer-events-none"
          >
            <div className="pointer-events-auto bg-white/95 backdrop-blur-xl px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-6 border border-white/20 ring-1 ring-black/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center">
                  <FiMapPin className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Remaining</p>
                  <p className="text-sm font-black text-gray-800">{distance}</p>
                </div>
              </div>

              <div className="w-px h-8 bg-gray-100"></div>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                  <FiClock className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ETA</p>
                  <p className="text-sm font-black text-gray-800">{duration}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 w-full h-full relative">
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          defaultCenter={defaultCenter}
          defaultZoom={14}
          onLoad={map => {
            setMap(map);
            map.setTilt(0);
          }}
          onDragStart={() => setIsAutoCenter(false)}
          options={mapOptions}
        >
          {directions && (
            <>
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  suppressPolylines: true
                }}
              />
              <PolylineF
                path={routePath}
                options={{
                  strokeColor: "#0F766E", // Dark Teal
                  strokeWeight: 8,
                  strokeOpacity: 1,
                  zIndex: 50
                }}
              />
            </>
          )}

          {destinationMarker}
          {riderMarker}
        </GoogleMap>

        {/* Full Screen Toggle */}
        <button
          onClick={() => setIsFullScreen(!isFullScreen)}
          className="absolute top-24 right-4 p-4 rounded-full shadow-2xl transition-all active:scale-90 z-20 bg-white text-gray-700 hover:bg-gray-50"
          style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
        >
          {isFullScreen ? <FiMinimize className="w-6 h-6" /> : <FiMaximize className="w-6 h-6" />}
        </button>

        {/* Recenter Button */}
        <button
          onClick={() => {
            setIsAutoCenter(true);
            if (map && currentLocation) {
              map.panTo(currentLocation);
              if (!isNavigationMode) {
                map.setZoom(15);
              } else {
                map.setZoom(18);
              }
            }
          }}
          className={`absolute top-40 right-4 p-4 rounded-full shadow-2xl transition-all active:scale-90 z-50 ${isAutoCenter ? 'bg-teal-600 text-white animate-pulse' : 'bg-white text-gray-700'}`}
          style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
        >
          <FiCrosshair className="w-6 h-6" />
        </button>

        {/* DEBUG: Simulation Button */}
        {SHOW_SIMULATION_BUTTON && (
          <button
            onClick={isSimulating ? stopSimulation : startSimulation}
            className={`absolute top-56 right-4 px-4 py-3 rounded-full shadow-2xl transition-all active:scale-90 z-50 text-xs font-bold ${isSimulating ? 'bg-red-500 text-white' : 'bg-purple-600 text-white'}`}
            style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
          >
            {isSimulating ? 'Stop Simulation' : 'Simulate'}
          </button>
        )}
      </div>

      {/* Modern Bottom Card */}
      <div className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] z-20 p-6 pb-8 transition-transform duration-300 ${isFullScreen ? 'translate-y-full' : ''}`}>
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>

        {/* Time & Distance Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm font-medium text-teal-600 mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse"></span>
              {duration ? `Trip time: ${duration}` : 'Calculating path...'}
            </p>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Job Location</h2>
          </div>
          {distance && (
            <div className="text-right">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Distance</p>
              <p className="text-xl font-bold text-gray-800">{distance}</p>
            </div>
          )}
        </div>

        {/* Address Section */}
        <div className="bg-gray-50 rounded-2xl p-4 flex items-start gap-4 mb-4 border border-gray-100">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-teal-600 border border-gray-100 shrink-0">
            <FiMapPin className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 mb-0.5 truncate">Address</h3>
            <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
              {(() => {
                const addr = job?.address;
                if (!addr) return 'Address loading...';
                if (typeof addr === 'string') return addr;
                return `${addr.addressLine2 ? addr.addressLine2 + ', ' : ''}${addr.addressLine1 || ''}, ${addr.city || ''} ${addr.pincode || ''}`;
              })()}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {job?.status === 'journey_started' && (
            <button
              onClick={async () => {
                try {
                  await workerService.workerReached(id);
                  toastManager.success('Customer notified that you reached');
                } catch (e) {
                  console.error('Reached notification failed', e);
                }
                setIsVisitModalOpen(true);
              }}
              className="px-6 bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-all active:scale-95"
            >
              <FiCheckCircle className="w-5 h-5" /> Reached
            </button>
          )}

          {(job?.userId?.phone || job?.customerPhone) && (
            <a href={`tel:${job.userId?.phone || job.customerPhone}`} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-teal-600/30 transition-all active:scale-95">
              <FiPhone className="w-5 h-5" /> Call
            </a>
          )}
          <button
            onClick={() => {
              const bAddr = job?.address;
              const addressStr = typeof bAddr === 'string' ? bAddr : `${bAddr.addressLine1 || ''}, ${bAddr.city || ''}`;
              const dest = coords ? `${coords.lat},${coords.lng}` : encodeURIComponent(addressStr);
              window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
            }}
            className="w-14 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl flex items-center justify-center transition-all active:scale-95"
          >
            <FiNavigation className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Visit OTP Modal */}
      <VisitVerificationModal
        isOpen={isVisitModalOpen}
        onClose={() => setIsVisitModalOpen(false)}
        bookingId={id}
        onSuccess={() => navigate(`/worker/job/${id}`)}
      />
    </div>
  );
};

export default JobMap;
