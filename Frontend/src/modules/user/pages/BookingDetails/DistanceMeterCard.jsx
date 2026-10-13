import React, { useEffect, useState } from 'react';

const fare = (p, km) => {
  if (!p) return 0;
  return Math.round(((p.baseCharge || 0) + Math.max(0, km - (p.baseKm || 0)) * (p.perKmRate || 0)) * 100) / 100;
};

/**
 * Live distance meter for per-km (trolley) bookings.
 * Shows the road distance driven so far and the fare it adds up to. Updates over the socket while the trip runs.
 */
const DistanceMeterCard = ({ booking, socket }) => {
  const [live, setLive] = useState(null);
  const id = booking?._id || booking?.id;

  useEffect(() => {
    if (!socket || !id) return undefined;
    const onDistance = (d) => { if (String(d.bookingId) === String(id)) setLive(d); };
    socket.on('distance_updated', onDistance);
    return () => socket.off('distance_updated', onDistance);
  }, [socket, id]);

  if (booking?.rental_type !== 'distance_based') return null;

  const trip = booking.distanceTrip || {};
  const pricing = live?.pricing || trip.pricing;
  const km = live?.totalDistanceKm ?? trip.totalDistanceKm ?? 0;
  const status = live?.status || trip.status || 'NOT_STARTED';
  const amount = status === 'STOPPED' ? (trip.fare || fare(pricing, km)) : fare(pricing, km);

  return (
    <div className="bg-white border border-teal-100 rounded-2xl p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black text-teal-700 uppercase tracking-wider">Distance Meter</p>
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${status === 'RUNNING' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
          {status === 'RUNNING' ? '● LIVE' : status === 'STOPPED' ? 'TRIP ENDED' : 'NOT STARTED'}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-black text-gray-900 leading-none">{Number(km).toFixed(2)} <span className="text-sm font-bold text-gray-400">km</span></p>
          <p className="text-[10px] text-gray-400 mt-1">by road</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black text-teal-700">₹{amount}</p>
          <p className="text-[10px] text-gray-400">{status === 'STOPPED' ? 'final fare' : 'fare so far'} (+GST)</p>
        </div>
      </div>
      {pricing && (
        <p className="text-[10px] text-gray-500 mt-3">
          ₹{pricing.baseCharge} for the first {pricing.baseKm} km, then ₹{pricing.perKmRate}/km
        </p>
      )}
    </div>
  );
};

export default DistanceMeterCard;
