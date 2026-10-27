import React from 'react';
import { FiMapPin, FiExternalLink } from 'react-icons/fi';
import { getLocationInfo } from '../../utils/locationInfo';

/** PAID / UNPAID registration fee pill (a missing status counts as unpaid, same as the schema default). */
export const FeeStatusBadge = ({ status, amount }) => {
  const paid = status === 'PAID';
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider w-fit border ${
        paid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
      }`}
      title={paid ? 'Registration fee paid' : 'Registration fee not paid'}
    >
      Fee {paid ? 'Paid' : 'Unpaid'}{paid && amount > 0 ? ` · ₹${amount}` : ''}
    </span>
  );
};

/** Area + address line + "open in Google Maps" link for the admin list tables. */
export const LocationCell = ({ entity }) => {
  const { area, detail, mapUrl } = getLocationInfo(entity);

  if (!area && !detail) {
    return <span className="text-[10px] text-gray-400 italic">Not set</span>;
  }

  return (
    <div className="max-w-[200px]">
      <p className="font-bold text-gray-800 text-xs flex items-center gap-1">
        <FiMapPin className="w-3 h-3 text-rose-500 shrink-0" />
        <span className="truncate">{area || detail}</span>
      </p>
      {area && detail && (
        <p className="text-[10px] text-gray-500 mt-0.5 leading-tight line-clamp-2" title={detail}>{detail}</p>
      )}
      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline mt-0.5"
        >
          View on map <FiExternalLink className="w-2.5 h-2.5" />
        </a>
      )}
    </div>
  );
};

/** All / Paid / Unpaid selector used above the farmer, worker and vendor lists. */
export const FeeFilter = ({ value, onChange }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:border-green-500 cursor-pointer w-full sm:w-auto"
    title="Filter by registration fee"
  >
    <option value="">All Fees</option>
    <option value="PAID">Fee Paid</option>
    <option value="UNPAID">Fee Unpaid</option>
  </select>
);
