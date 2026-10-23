import React from 'react';
import { FiMapPin, FiCheck } from 'react-icons/fi';
import { addressKey, addressText } from '../../../../utils/savedAddresses';

/**
 * Lists the farmer's saved addresses so one can be picked for a booking without opening the map.
 * Props: addresses (usable ones), selectedKey, onSelect(address), onPickOnMap(), onCancel()
 */
const SavedAddressChooser = ({ addresses, selectedKey, onSelect, onPickOnMap, onCancel }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
    <p className="px-1 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Choose an address</p>
    {addresses.map(a => {
      const key = addressKey(a);
      const active = key === selectedKey;
      return (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(a)}
          className={`w-full flex items-start gap-2 rounded-lg border p-2 text-left transition-colors ${active ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-100 hover:border-emerald-300'}`}
        >
          <FiMapPin className="mt-0.5 shrink-0 text-emerald-600" size={13} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-slate-800 leading-snug">{addressText(a)}</span>
            <span className="block text-[10px] text-slate-500">
              {[a.city, a.state].filter(Boolean).join(', ')}
              {a.isDefault ? ' · Default' : ''}
            </span>
          </span>
          {active && <FiCheck className="mt-0.5 shrink-0 text-emerald-600" size={14} />}
        </button>
      );
    })}
    <button
      type="button"
      onClick={onPickOnMap}
      className="w-full rounded-lg border border-dashed border-emerald-300 py-2 text-xs font-bold text-emerald-700 active:scale-95"
    >
      + Pick a new place on the map
    </button>
    {onCancel && (
      <button type="button" onClick={onCancel} className="w-full py-1 text-[11px] font-semibold text-slate-400">
        Cancel
      </button>
    )}
  </div>
);

export default SavedAddressChooser;
