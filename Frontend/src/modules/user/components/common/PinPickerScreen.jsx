import React, { useState } from 'react';
import { FiArrowLeft, FiCheck, FiMapPin } from 'react-icons/fi';
import LocationPicker from '../../pages/Checkout/components/LocationPicker';

/**
 * Full-screen map where the farmer drops ONE pin on their land (tap the map, or use the location button to
 * stand-and-pin). Used for a land listing's location when the whole border is not marked.
 * Props: initialPosition {lat,lng}|null, onConfirm({lat,lng}), onClose()
 */
const PinPickerScreen = ({ initialPosition = null, onConfirm, onClose }) => {
  const [picked, setPicked] = useState(initialPosition);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 active:scale-95" aria-label="Back">
          <FiArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-gray-900">Put the land on the map · भूमि का स्थान</h2>
          <p className="text-[11px] text-gray-500">Stand on your land and tap the 📍 button, or tap its place on the map.</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <LocationPicker
          initialPosition={initialPosition}
          onLocationSelect={(loc) => setPicked({ lat: Number(loc.lat), lng: Number(loc.lng) })}
        />
      </div>

      <div className="p-4 border-t border-gray-200 space-y-2 bg-white">
        <p className={`text-xs font-semibold flex items-center gap-1.5 ${picked ? 'text-emerald-800' : 'text-gray-500'}`}>
          <FiMapPin /> {picked ? `Pin set · ${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}` : 'Tap the map to drop the pin'}
        </p>
        <button
          disabled={!picked}
          onClick={() => onConfirm(picked)}
          className="w-full py-3.5 rounded-xl bg-emerald-800 text-white font-black flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]"
        >
          <FiCheck /> Use this location · यही स्थान रखें
        </button>
      </div>
    </div>
  );
};

export default PinPickerScreen;
