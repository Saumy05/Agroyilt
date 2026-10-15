import React from 'react';

/** Live meter shown to the vendor while a per-km (trolley) trip is running; once it ends, estimated vs actual distance. */
const DistanceTripCard = ({ km = 0, fare = 0, pricing, running, gpsError, estimatedKm, estimatedFare, stopped }) => {
  const actual = Number(km) || 0;
  const estimate = Number(estimatedKm) || 0;
  const diff = Math.round((actual - estimate) * 100) / 100;

  return (
    <div className="bg-white border border-teal-100 rounded-2xl p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black text-teal-700 uppercase tracking-wider">Distance Meter</p>
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${running ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
          {running ? '● TRACKING' : 'STOPPED'}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-3xl font-black text-gray-900 leading-none">{actual.toFixed(2)} <span className="text-sm font-bold text-gray-400">km</span></p>
        <div className="text-right">
          <p className="text-xl font-black text-teal-700">₹{fare}</p>
          <p className="text-[10px] text-gray-400">{stopped ? 'final fare' : 'fare so far'} (+GST)</p>
        </div>
      </div>
      {pricing && (
        <p className="text-[10px] text-gray-500 mt-3">₹{pricing.baseCharge} for the first {pricing.baseKm} km, then ₹{pricing.perKmRate}/km</p>
      )}
      {estimate > 0 && (
        <div className="mt-3 rounded-xl bg-teal-50/70 border border-teal-100 px-3 py-2 text-[11px] font-semibold text-teal-900">
          {stopped ? (
            <>
              Estimated {estimate} km → Actual {actual.toFixed(2)} km
              <span className="text-teal-700"> ({diff > 0 ? '+' : ''}{diff} km)</span>
              <span className="block text-[10px] text-teal-700/80">Billed on the actual distance driven.</span>
            </>
          ) : (
            <>
              Farmer's approx. trip: ~{estimate} km{estimatedFare ? ` (est. ₹${estimatedFare} + GST)` : ''}
              <span className="block text-[10px] text-teal-700/80">Only an estimate. The bill uses the distance actually driven.</span>
            </>
          )}
        </div>
      )}
      {running && !gpsError && <p className="text-[10px] text-gray-400 mt-1">Keep this screen open and GPS on while driving. Tap “Complete Work” to stop the meter.</p>}
      {gpsError && <p className="text-[11px] font-bold text-red-500 mt-2">{gpsError}</p>}
    </div>
  );
};

export default DistanceTripCard;
