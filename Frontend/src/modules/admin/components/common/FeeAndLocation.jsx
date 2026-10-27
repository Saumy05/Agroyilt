import React, { useState, useEffect } from 'react';
import { FiMapPin, FiExternalLink } from 'react-icons/fi';
import { getLocationInfo } from '../../utils/locationInfo';
import registrationFeeService from '../../services/registrationFeeService';

// One fetch shared by every badge on the page; refetched on next mount after a failure.
let feesPromise = null;
const loadFees = () => {
  if (!feesPromise) {
    feesPromise = registrationFeeService.getConfigs().then((res) => res?.fees || {}).catch((err) => {
      feesPromise = null;
      throw err;
    });
  }
  return feesPromise;
};

/** Current registration fee per role ({ USER, WORKER, VENDOR }); empty until loaded. */
export const useRegistrationFees = () => {
  const [fees, setFees] = useState({});
  useEffect(() => {
    let alive = true;
    loadFees().then((f) => alive && setFees(f)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return fees;
};

/**
 * PAID / UNPAID registration fee pill (a missing status counts as unpaid, same as the schema default).
 * Shows "Free" for accounts that paid ₹0, and for unpaid ones while that `role`'s (USER | WORKER | VENDOR) fee is ₹0.
 */
export const FeeStatusBadge = ({ status, amount, role }) => {
  const fees = useRegistrationFees();
  const paid = status === 'PAID';
  // Unpaid while the fee is ₹0, or auto-approved at ₹0 during a free period (stored as PAID, amount 0).
  const free = paid ? !(amount > 0) : role && fees[role] === 0;
  if (free) {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider w-fit border bg-sky-50 text-sky-700 border-sky-200"
        title="Registration fee is currently free"
      >
        Fee Free
      </span>
    );
  }
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

/** All / Paid / Free / Unpaid selector used above the farmer, worker and vendor lists. */
export const FeeFilter = ({ value, onChange }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:border-green-500 cursor-pointer w-full sm:w-auto"
    title="Filter by registration fee"
  >
    <option value="">All Fees</option>
    <option value="PAID">Fee Paid</option>
    <option value="FREE">Fee Free</option>
    <option value="UNPAID">Fee Unpaid</option>
  </select>
);
