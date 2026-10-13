import React from 'react';

/** Live meter shown to the vendor while a per-km (trolley) trip is running. */
const DistanceTripCard = ({ km = 0, fare = 0, pricing, running, gpsError }) => (
  <div className="bg-white border border-teal-100 rounded-2xl p-4 mb-4 shadow-sm">
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-black text-teal-700 uppercase tracking-wider">Distance Meter</p>
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${running ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
        {running ? '● TRACKING' : 'STOPPED'}
      </span>
    </div>
    <div className="flex items-end justify-between">
      <p className="text-3xl font-black text-gray-900 leading-none">{Number(km).toFixed(2)} <span className="text-sm font-bold text-gray-400">km</span></p>
      <div className="text-right">
        <p className="text-xl font-black text-teal-700">₹{fare}</p>
        <p className="text-[10px] text-gray-400">fare so far (+GST)</p>
      </div>
    </div>
    {pricing && (
      <p className="text-[10px] text-gray-500 mt-3">₹{pricing.baseCharge} for the first {pricing.baseKm} km, then ₹{pricing.perKmRate}/km</p>
    )}
    {running && !gpsError && <p className="text-[10px] text-gray-400 mt-1">Keep this screen open and GPS on while driving. Tap “Complete Work” to stop the meter.</p>}
    {gpsError && <p className="text-[11px] font-bold text-red-500 mt-2">{gpsError}</p>}
  </div>
);

export default DistanceTripCard;
