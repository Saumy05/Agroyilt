import React, { useState, useEffect } from 'react';
import { FiMapPin, FiChevronDown, FiX, FiCheck } from 'react-icons/fi';
import api from '../../services/api';

/**
 * RegistrationLocationPicker
 * Cascading State -> District -> Sub-district (Tehsil/Block) selector
 * used during registration for Farmer, Worker, and Vendor.
 *
 * @param {Object} value - { stateId: '', districtId: '', subDistrictId: '' }
 * @param {Function} onChange - ({ stateId, districtId, subDistrictId }) => void
 * @param {string} brandColor - primary theme color (e.g. '#347989' or '#426B4F')
 * @param {string} title - Section title (default: 'Your Location')
 * @param {string} subtitle - Helper subtitle (default: 'Select your state and district for local matching')
 * @param {boolean} optional - Whether to show the Optional badge (default: true)
 */
const RegistrationLocationPicker = ({
  value = { stateId: '', districtId: '', subDistrictId: '' },
  onChange,
  brandColor = '#347989',
  title = 'Your Location',
  subtitle = 'Helps match nearby bookings, farm jobs, and services',
  optional = true
}) => {
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [subDistricts, setSubDistricts] = useState([]);

  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingSubDistricts, setLoadingSubDistricts] = useState(false);

  // Load active states on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingStates(true);
    api.get('/public/states')
      .then(res => {
        if (isMounted) {
          setStates(res.data?.states || []);
        }
      })
      .catch(() => {
        if (isMounted) setStates([]);
      })
      .finally(() => {
        if (isMounted) setLoadingStates(false);
      });
    return () => { isMounted = false; };
  }, []);

  // Load districts when stateId changes
  useEffect(() => {
    let isMounted = true;
    if (!value?.stateId) {
      setDistricts([]);
      setSubDistricts([]);
      return;
    }

    setLoadingDistricts(true);
    api.get(`/public/states/${value.stateId}/districts`)
      .then(res => {
        if (isMounted) {
          setDistricts(res.data?.districts || []);
        }
      })
      .catch(() => {
        if (isMounted) setDistricts([]);
      })
      .finally(() => {
        if (isMounted) setLoadingDistricts(false);
      });
    return () => { isMounted = false; };
  }, [value?.stateId]);

  // Load sub-districts when districtId changes
  useEffect(() => {
    let isMounted = true;
    if (!value?.districtId) {
      setSubDistricts([]);
      return;
    }

    setLoadingSubDistricts(true);
    api.get(`/public/districts/${value.districtId}/sub-districts`)
      .then(res => {
        if (isMounted) {
          setSubDistricts(res.data?.subDistricts || []);
        }
      })
      .catch(() => {
        if (isMounted) setSubDistricts([]);
      })
      .finally(() => {
        if (isMounted) setLoadingSubDistricts(false);
      });
    return () => { isMounted = false; };
  }, [value?.districtId]);

  const handleStateChange = (e) => {
    const newStateId = e.target.value;
    onChange({
      stateId: newStateId,
      districtId: '',
      subDistrictId: ''
    });
  };

  const handleDistrictChange = (e) => {
    const newDistrictId = e.target.value;
    onChange({
      ...value,
      districtId: newDistrictId,
      subDistrictId: ''
    });
  };

  const handleSubDistrictChange = (e) => {
    onChange({
      ...value,
      subDistrictId: e.target.value
    });
  };

  const handleClear = () => {
    onChange({
      stateId: '',
      districtId: '',
      subDistrictId: ''
    });
  };

  const hasSelection = Boolean(value?.stateId || value?.districtId || value?.subDistrictId);

  return (
    <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 transition-all hover:border-slate-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ backgroundColor: brandColor }}
          >
            <FiMapPin className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-800">{title}</span>
              {optional && (
                <span className="text-[10px] font-semibold text-gray-500 bg-gray-200/70 px-1.5 py-0.5 rounded-full">
                  Optional
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 leading-tight">{subtitle}</p>
          </div>
        </div>

        {hasSelection && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] font-semibold text-gray-400 hover:text-red-500 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
            title="Clear location selection"
          >
            <FiX className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Select inputs */}
      <div className="space-y-2.5 mt-3">
        {/* State */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">
            State
          </label>
          <div className="relative">
            <select
              value={value?.stateId || ''}
              onChange={handleStateChange}
              disabled={loadingStates}
              className="w-full px-3.5 py-2.5 bg-white rounded-xl border border-gray-300 text-xs text-gray-800 outline-none appearance-none focus:ring-2 focus:ring-offset-1 focus:border-transparent transition-all disabled:bg-gray-100 disabled:text-gray-400 cursor-pointer pr-9"
              style={{ '--tw-ring-color': brandColor }}
            >
              <option value="">
                {loadingStates ? 'Loading states...' : 'Select State'}
              </option>
              {states.map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
              <FiChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* District */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">
            District {value?.stateId && <span className="text-amber-600">*</span>}
          </label>
          <div className="relative">
            <select
              value={value?.districtId || ''}
              onChange={handleDistrictChange}
              disabled={!value?.stateId || loadingDistricts}
              className="w-full px-3.5 py-2.5 bg-white rounded-xl border border-gray-300 text-xs text-gray-800 outline-none appearance-none focus:ring-2 focus:ring-offset-1 focus:border-transparent transition-all disabled:bg-gray-100 disabled:text-gray-400 cursor-pointer pr-9"
              style={{ '--tw-ring-color': brandColor }}
            >
              <option value="">
                {!value?.stateId
                  ? 'Select state first'
                  : loadingDistricts
                    ? 'Loading districts...'
                    : districts.length === 0
                      ? 'No districts found'
                      : 'Select District'}
              </option>
              {districts.map(d => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
              <FiChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Sub-district / Tehsil */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">
            Sub-district / Tehsil / Block <span className="text-gray-400 font-normal">(Optional)</span>
          </label>
          <div className="relative">
            <select
              value={value?.subDistrictId || ''}
              onChange={handleSubDistrictChange}
              disabled={!value?.districtId || loadingSubDistricts || subDistricts.length === 0}
              className="w-full px-3.5 py-2.5 bg-white rounded-xl border border-gray-300 text-xs text-gray-800 outline-none appearance-none focus:ring-2 focus:ring-offset-1 focus:border-transparent transition-all disabled:bg-gray-100 disabled:text-gray-400 cursor-pointer pr-9"
              style={{ '--tw-ring-color': brandColor }}
            >
              <option value="">
                {!value?.districtId
                  ? 'Select district first'
                  : loadingSubDistricts
                    ? 'Loading sub-districts...'
                    : subDistricts.length === 0
                      ? 'No sub-districts listed'
                      : 'Select Sub-district'}
              </option>
              {subDistricts.map(sd => (
                <option key={sd._id} value={sd._id}>{sd.name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
              <FiChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Selected summary pill */}
      {value?.districtId && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
          <FiCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <span className="font-medium truncate">
            {[
              subDistricts.find(sd => sd._id === value.subDistrictId)?.name,
              districts.find(d => d._id === value.districtId)?.name,
              states.find(s => s._id === value.stateId)?.name
            ].filter(Boolean).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
};

export default RegistrationLocationPicker;
