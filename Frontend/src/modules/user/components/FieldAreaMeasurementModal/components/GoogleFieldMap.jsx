import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, MarkerF, PolygonF, DrawingManagerF } from '@react-google-maps/api';
import { FiLoader, FiAlertCircle } from 'react-icons/fi';

const libraries = ['places', 'geometry', 'drawing'];

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const mapOptions = {
  mapTypeId: 'hybrid', // Satellite with village and road names for farm boundary spotting
  tilt: 0,
  mapTypeControl: true,
  mapTypeControlOptions: {
    position: 3 // TOP_RIGHT in Google Maps
  },
  streetViewControl: false,
  fullscreenControl: false,
  zoomControl: true,
  gestureHandling: 'greedy'
};

const polygonOptions = {
  fillColor: '#10b981',
  fillOpacity: 0.35,
  strokeColor: '#047857',
  strokeWeight: 2.5,
  clickable: false,
  editable: false,
  zIndex: 1
};

const GoogleFieldMap = ({
  center,
  zoom = 17,
  points = [],
  onAddPoint,
  onUpdatePoint,
  onMapLoaded,
  isDrawingMode = false
}) => {
  const [map, setMap] = useState(null);
  const drawingManagerRef = useRef(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries
  });

  const onLoad = useCallback(
    (mapInstance) => {
      setMap(mapInstance);
      if (onMapLoaded) onMapLoaded(mapInstance);
    },
    [onMapLoaded]
  );

  // Recenter map when center prop changes
  useEffect(() => {
    if (map && center && center.lat && center.lng) {
      map.panTo({ lat: center.lat, lng: center.lng });
    }
  }, [center, map]);

  // Handle map click to drop vertex pin
  const handleMapClick = useCallback(
    (e) => {
      if (isDrawingMode) return; // Managed by DrawingManager
      if (e.latLng && onAddPoint) {
        onAddPoint({
          lat: e.latLng.lat(),
          lng: e.latLng.lng()
        });
      }
    },
    [isDrawingMode, onAddPoint]
  );

  // Handle marker drag to adjust polygon vertex
  const handleMarkerDragEnd = useCallback(
    (index, e) => {
      if (e.latLng && onUpdatePoint) {
        onUpdatePoint(index, {
          lat: e.latLng.lat(),
          lng: e.latLng.lng()
        });
      }
    },
    [onUpdatePoint]
  );

  // When DrawingManager creates a polygon
  const onPolygonComplete = useCallback(
    (polygon) => {
      const path = polygon.getPath();
      const coords = [];
      for (let i = 0; i < path.getLength(); i++) {
        const xy = path.getAt(i);
        coords.push({ lat: xy.lat(), lng: xy.lng() });
      }
      polygon.setMap(null); // Clear raw drawing instance; our state will render PolygonF
      coords.forEach((pt) => onAddPoint && onAddPoint(pt));
    },
    [onAddPoint]
  );

  if (loadError) {
    return (
      <div className="w-full h-full min-h-[350px] bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <FiAlertCircle size={36} className="text-amber-400 mb-2" />
        <p className="font-bold text-sm">Google Maps API Error</p>
        <p className="text-xs text-slate-300 mt-1 max-w-md">
          {loadError.message || 'Unable to load Google Maps. Please check your API key and billing settings.'}
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full min-h-[350px] bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <FiLoader size={32} className="animate-spin text-emerald-400 mb-3" />
        <p className="text-xs font-semibold text-slate-300">Loading Google Satellite Maps...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={zoom}
        options={mapOptions}
        onClick={handleMapClick}
        onLoad={onLoad}
      >
        {/* DrawingManager for direct polygon tool drawing */}
        {isDrawingMode && (
          <DrawingManagerF
            onLoad={(dm) => (drawingManagerRef.current = dm)}
            onPolygonComplete={onPolygonComplete}
            options={{
              drawingControl: true,
              drawingControlOptions: {
                position: 2, // TOP_CENTER
                drawingModes: ['polygon']
              },
              polygonOptions: {
                fillColor: '#10b981',
                fillOpacity: 0.35,
                strokeColor: '#047857',
                strokeWeight: 2.5
              }
            }}
          />
        )}

        {/* Dynamic Polygon connecting boundary pins */}
        {points.length >= 3 && (
          <PolygonF paths={points} options={polygonOptions} />
        )}

        {/* Draggable boundary pins with numerical label */}
        {points.map((pt, index) => (
          <MarkerF
            key={`pin-${index}-${pt.lat}-${pt.lng}`}
            position={pt}
            draggable={true}
            onDragEnd={(e) => handleMarkerDragEnd(index, e)}
            label={{
              text: String(index + 1),
              color: '#ffffff',
              fontWeight: '900',
              fontSize: '11px'
            }}
            icon={{
              path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
              fillColor: '#059669',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2.5,
              scale: 13
            }}
            title={`Pin #${index + 1} (Drag to adjust border)`}
          />
        ))}
      </GoogleMap>
    </div>
  );
};

export default GoogleFieldMap;
