import React, { useEffect, useRef, useState } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GOOGLE_MAPS_LOADER_ID, GOOGLE_MAPS_LIBRARIES } from '../../../../utils/googleMapsLoader';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const DISTRICT_TYPES = ['administrative_area_level_2', 'locality'];
const SUBDISTRICT_TYPES = ['administrative_area_level_3', 'sublocality', 'sublocality_level_1', 'locality'];

// "Indore District" / "Juni Indore Tahsil" -> "Indore" / "Juni Indore"
const cleanName = (s) => String(s || '').replace(/\s+(district|tahsil|tehsil|taluka|taluk|block)$/i, '').trim();

/**
 * Name field with Google place suggestions, so an admin picks a correctly spelled district / sub-district
 * instead of typing it. Typing still works (Google may not know every name), and with no Maps key it is a plain input.
 */
const PlaceNameSuggest = ({ value, onChange, placeholder, level = 'district', stateName = '', districtName = '', required = false, className = '' }) => {
  const { isLoaded, loadError } = useJsApiLoader({ id: GOOGLE_MAPS_LOADER_ID, googleMapsApiKey: MAPS_API_KEY, libraries: GOOGLE_MAPS_LIBRARIES });
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState('');   // why there are no suggestions, shown under the field
  const wrapRef = useRef(null);
  const timerRef = useRef(null);
  const serviceRef = useRef(null);
  const pickedRef = useRef(false); // do not re-search right after the admin picked a suggestion

  useEffect(() => {
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (pickedRef.current) { pickedRef.current = false; return; }
    const q = String(value || '').trim();
    if (!isLoaded || !MAPS_API_KEY || q.length < 2 || !window.google?.maps?.places) return;

    timerRef.current = setTimeout(() => {
      if (!serviceRef.current) serviceRef.current = new window.google.maps.places.AutocompleteService();
      const context = [districtName, stateName].filter(Boolean).join(', ');
      const request = level === 'district'
        // the state is part of the search so Google ranks that state's places first (it still filters to the state below)
        ? { input: stateName ? `${q}, ${stateName}` : q, componentRestrictions: { country: 'in' }, types: ['(regions)'] }
        : { input: context ? `${q}, ${context}` : q, componentRestrictions: { country: 'in' } };
      const wantedTypes = level === 'district' ? DISTRICT_TYPES : SUBDISTRICT_TYPES;

      setSearching(true);
      serviceRef.current.getPlacePredictions(request, (preds, status) => {
        setSearching(false);
        if (status === 'REQUEST_DENIED' || status === 'OVER_QUERY_LIMIT') {
          setProblem('Google suggestions are unavailable (Places API is not enabled for this key, or the quota is used). Type the name.');
          setSuggestions([]);
          return;
        }
        if (status !== 'OK' || !preds) { setProblem(`No suggestions found${stateName ? ` in ${stateName}` : ''}. Check the spelling or type the full name.`); setSuggestions([]); return; }
        setProblem('');
        let rows = preds.filter(p => (p.types || []).some(t => wantedTypes.includes(t)));
        // Only places inside the chosen state: a district of another state must never be offered here
        if (stateName) rows = rows.filter(p => (p.description || '').toLowerCase().includes(stateName.toLowerCase()));
        const seen = new Set();
        const out = [];
        rows.forEach(p => {
          const name = cleanName(p.structured_formatting?.main_text || p.description);
          if (name && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            out.push({ name, detail: p.structured_formatting?.secondary_text || '' });
          }
        });
        setSuggestions(out.slice(0, 6));
        setOpen(out.length > 0);
        if (out.length === 0) setProblem(`Google found no ${level === 'district' ? 'district' : 'sub-district'} matching this${stateName ? ` in ${stateName}` : ''}. Check the spelling or type the full name.`);
      });
    }, 250);
    return () => clearTimeout(timerRef.current);
  }, [value, isLoaded, level, stateName, districtName]);

  const pick = (name) => {
    pickedRef.current = true;
    onChange(name);
    setOpen(false);
    setSuggestions([]);
  };

  // too-short input shows nothing, whatever an earlier search left behind
  const shown = String(value || '').trim().length >= 2 ? suggestions : [];

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        required={required}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => shown.length && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className || 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400'}
      />
      {open && shown.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {shown.map(s => (
            <li key={s.name}>
              <button type="button" onClick={() => pick(s.name)}
                className="w-full text-left px-3 py-2 hover:bg-teal-50 text-sm text-gray-800 flex flex-col">
                <span className="font-medium">{s.name}</span>
                {s.detail && <span className="text-xs text-gray-500">{s.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-gray-400 mt-1">
        {!MAPS_API_KEY ? 'Google suggestions are off (no Maps key): type the name.'
          : loadError ? 'Google Maps could not load, so there are no suggestions. Type the name.'
          : searching ? 'Searching…'
          : String(value || '').trim().length < 2 ? 'Type at least 2 letters and the matching names will appear here to pick from.'
          : problem || 'Pick the correct name from the list above, or keep typing.'}
      </p>
    </div>
  );
};

export default PlaceNameSuggest;
