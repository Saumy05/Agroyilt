import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight, FiLink, FiUserPlus } from 'react-icons/fi';

/**
 * Ties an add-on (extra workers asked for after the booking started) to the booking it belongs to.
 * On the original booking: lists its add-ons. On an add-on: points back to the original booking.
 * Each add-on stays its own request (its own workers, codes and payment); this only links them.
 */
const AddOnLinks = ({ request }) => {
  const navigate = useNavigate();
  const addOns = Array.isArray(request?.addOns) ? request.addOns : [];
  const addOnOf = request?.addOnOf || null;
  if (!addOns.length && !addOnOf) return null;

  return (
    <div className="space-y-3">
      {addOnOf && (
        <button
          type="button"
          onClick={() => navigate(`/user/farmer-worker-request/${addOnOf.id}`)}
          className="w-full rounded-3xl border border-indigo-200 bg-indigo-50 p-4 flex items-center justify-between gap-3 text-left"
        >
          <span className="flex items-center gap-2 min-w-0">
            <FiLink className="text-indigo-700 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-indigo-900">Add-on to your booking</span>
              <span className="block text-[11px] text-indigo-800 truncate">{addOnOf.title || 'Original booking'}</span>
            </span>
          </span>
          <FiChevronRight className="text-indigo-700 shrink-0" />
        </button>
      )}

      {addOns.length > 0 && (
        <div className="rounded-3xl border border-indigo-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <FiUserPlus className="text-indigo-700" />
            <h2 className="font-black text-slate-900 text-sm">Added workers</h2>
          </div>
          <div className="space-y-2">
            {addOns.map(a => (
              <button
                key={a._id}
                type="button"
                onClick={() => navigate(`/user/farmer-worker-request/${a._id}`)}
                className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 flex items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-900 truncate">
                    {a.requiredWorkers || 1} more worker{(a.requiredWorkers || 1) > 1 ? 's' : ''}
                    {a.bookingType === 'DAILY' ? ` · ${a.numberOfDays || 1} day${(a.numberOfDays || 1) > 1 ? 's' : ''}` : ''}
                  </span>
                  <span className="block text-[11px] text-slate-600 truncate">{a.card?.label || a.status}{a.card?.detail ? ` · ${a.card.detail}` : ''}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {a.card?.needsAction && <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Action needed</span>}
                  <FiChevronRight className="text-slate-400" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AddOnLinks;
