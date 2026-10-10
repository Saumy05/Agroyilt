import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom numbered emerald pin for field vertices
const createNumberedPinIcon = (index) => {
  return L.divIcon({
    className: 'custom-field-pin',
    html: `<div style="
      background: linear-gradient(135deg, #059669, #047857);
      color: #ffffff;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 11px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      border: 2px solid #ffffff;
      cursor: grab;
      user-select: none;
    ">${index + 1}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
};

// Component to handle map clicks to drop pins
const MapClickHandler = ({ onAddPoint }) => {
  useMapEvents({
    click(e) {
      if (onAddPoint && e.latlng) {
        onAddPoint({
          lat: e.latlng.lat,
          lng: e.latlng.lng
        });
      }
    }
  });
  return null;
};

// Recenter component
const MapRecenter = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center && center.lat && center.lng) {
      map.flyTo([center.lat, center.lng], zoom || 17, {
        animate: true,
        duration: 0.8
      });
    }
  }, [center, zoom, map]);
  return null;
};

const LeafletFieldMap = ({
  center,
  zoom = 17,
  points = [],
  onAddPoint,
  onUpdatePoint
}) => {
  const polygonPositions = useMemo(() => {
    return points.map((p) => [p.lat, p.lng]);
  }, [points]);

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ minHeight: '380px' }}
      >
        {/* Esri World Imagery Satellite Tiles (No API key required) */}
        <TileLayer
          attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />

        {/* World Boundaries and Roads Overlay for village context */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
          opacity={0.7}
        />

        <MapClickHandler onAddPoint={onAddPoint} />
        <MapRecenter center={center} zoom={zoom} />

        {/* Dynamic Polygon */}
        {points.length >= 3 && (
          <Polygon
            positions={polygonPositions}
            pathOptions={{
              color: '#059669',
              fillColor: '#10b981',
              fillOpacity: 0.35,
              weight: 3
            }}
          />
        )}

        {/* Numbered Draggable Vertex Pins */}
        {points.map((pt, index) => (
          <Marker
            key={`leaflet-pin-${index}-${pt.lat}-${pt.lng}`}
            position={[pt.lat, pt.lng]}
            icon={createNumberedPinIcon(index)}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const position = marker.getLatLng();
                if (onUpdatePoint) {
                  onUpdatePoint(index, {
                    lat: position.lat,
                    lng: position.lng
                  });
                }
              }
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
};

export default LeafletFieldMap;
