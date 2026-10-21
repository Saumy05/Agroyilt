import React, { useEffect, useMemo, useState } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import PlaceNameSuggest from './PlaceNameSuggest';
import { DISTRICTS_BY_STATE } from './districtsByState';

const LIBRARIES = ['places', 'geometry'];
const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const OTHER = '__other__';

const cleanName = (s) => String(s || '').replace(/\s+(district|tahsil|tehsil|taluka|taluk|block)$/i, '').trim();
const key = (s) => cleanName(String(s || '').replace(/\(.*$/, ' ')).toLowerCase();

const SUB_WORDS = /\b(tahsil|tehsil|taluka|taluk|block|mandal)\b/i;

// Same state + district asked twice in one session: do not pay Google again
const cache = new Map();

/** Google place search for "<query>", following up to 3 pages (Google's maximum of 60 results). */
const searchAll = (service, query) => new Promise((resolve) => {
  const all = [];
  let pages = 0;
  const onPage = (results, status, pagination) => {
    if (status === 'OK' && results) all.push(...results);
    else if (status !== 'ZERO_RESULTS') return resolve({ all, status });
    pages += 1;
    if (pagination?.hasNextPage && pages < 3) setTimeout(() => pagination.nextPage(), 2000); // Google asks for a short pause between pages
    else resolve({ all, status: 'OK' });
  };
  service.textSearch({ query, region: 'in' }, onPage);
});

/**
 * Dropdown of a state's districts, or a district's sub-districts, fetched from Google.
 * Names already added are left out. "Other…" switches to a type-ahead for anything Google does not list.
 */
const GooglePlaceList = ({ level, stateName, districtName, existingNames = [], value, onChange, editing = false, required = false, placeholder }) => {
  const { isLoaded, loadError } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: MAPS_API_KEY, libraries: LIBRARIES });
  const [result, setResult] = useState({ key: '', items: [], problem: '' });
  const [customKey, setCustomKey] = useState('');

  const context = level === 'district' ? stateName : districtName;
  const noun = level === 'district' ? 'district' : 'sub-district';
  const cacheKey = `${level}|${stateName}|${districtName}`;
  // States with a built-in district list use it (instant, like the state dropdown); the rest are searched on Google
  const builtIn = level === 'district' && !editing ? DISTRICTS_BY_STATE[stateName] : null;
  const canSearch = !builtIn && !editing && Boolean(context) && isLoaded && Boolean(MAPS_API_KEY);

  // What we know for the current state / district: the built-in list, the session cache, or the latest finished search
  const cached = cache.get(cacheKey);
  const items = builtIn || cached || (result.key === cacheKey ? result.items : []);
  const problem = !cached && result.key === cacheKey ? result.problem : '';
  const loading = canSearch && !cached && result.key !== cacheKey;
  const custom = customKey === cacheKey;

  useEffect(() => {
    if (!canSearch || cache.has(cacheKey) || !window.google?.maps?.places) return;

    let cancelled = false;
    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
    const queries = level === 'district'
      ? [`districts in ${stateName}, India`, `${stateName} district`]
      : [`tehsils in ${districtName} district, ${stateName}, India`, `${districtName} tehsil`];

    (async () => {
      let all = [];
      let denied = false;
      for (const q of queries) {
        const r = await searchAll(service, q);
        if (r.status === 'REQUEST_DENIED' || r.status === 'OVER_QUERY_LIMIT') { denied = true; break; }
        all = all.concat(r.all);
        if (cancelled) return;
      }
      if (cancelled) return;
      if (denied && all.length === 0) {
        setResult({ key: cacheKey, items: [], problem: 'Google place search is unavailable (Places API is not enabled for this key, or the quota is used).' });
        return;
      }

      const stateLower = String(stateName).toLowerCase();
      const districtLower = String(districtName).toLowerCase();
      const typesOf = (r) => r.types || [];
      const inArea = all.filter((r) => {
        const address = (r.formatted_address || '').toLowerCase();
        return address.includes(stateLower) && (level === 'district' || address.includes(districtLower) || SUB_WORDS.test(r.name || ''));
      });

      // Google files many district seats under "town", so prefer true districts / tehsils, else accept towns in that area
      let pool;
      if (level === 'district') {
        pool = inArea.filter(r => typesOf(r).includes('administrative_area_level_2'));
        if (!pool.length) pool = inArea.filter(r => typesOf(r).some(t => ['locality', 'administrative_area_level_3', 'political'].includes(t)));
      } else {
        pool = inArea.filter(r => typesOf(r).includes('administrative_area_level_3') || SUB_WORDS.test(r.name || ''));
        if (!pool.length) pool = inArea.filter(r => typesOf(r).some(t => ['locality', 'sublocality', 'sublocality_level_1'].includes(t)));
      }

      const seen = new Set();
      const found = [];
      pool.forEach((r) => {
        const name = cleanName(r.name);
        if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); found.push(name); }
      });
      found.sort((x, y) => x.localeCompare(y));

      // Shown in the browser console so a bad result can be inspected
      console.info('[GooglePlaceList]', queries, { returned: all.length, inArea: inArea.length, listed: found.length, sample: all.slice(0, 8).map(r => ({ name: r.name, types: r.types })) });

      if (found.length) cache.set(cacheKey, found);
      setResult({
        key: cacheKey,
        items: found,
        problem: found.length ? '' : (all.length
          ? `Google returned ${all.length} places but none were clearly ${level === 'district' ? 'districts' : 'sub-districts'} of ${context}.`
          : '')
      });
    })();
    return () => { cancelled = true; };
  }, [canSearch, cacheKey, level, stateName, districtName, context]);

  const taken = useMemo(() => new Set(existingNames.map(key)), [existingNames]);
  const available = items.filter(n => !taken.has(key(n)));

  // Plain type-ahead: editing, no Maps key / load failure, Google had nothing, or the admin chose "Other"
  const typeAhead = editing || custom || (!builtIn && (!MAPS_API_KEY || loadError)) || (context && !loading && available.length === 0);
  if (typeAhead) {
    return (
      <div>
        <PlaceNameSuggest
          required={required} level={level === 'district' ? 'district' : 'subdistrict'} value={value} onChange={onChange}
          stateName={stateName} districtName={districtName} placeholder={placeholder}
        />
        {!editing && context && !loading && items.length > 0 && available.length === 0 && (
          <p className="text-[11px] text-amber-600 mt-1">Every {noun} {builtIn ? 'in the list' : 'Google lists'} for {context} is already added. Type a different name if one is missing.</p>
        )}
        {!editing && problem && <p className="text-[11px] text-amber-600 mt-1">{problem} Type the name.</p>}
        {!editing && context && !loading && !problem && items.length === 0 && (
          <p className="text-[11px] text-amber-600 mt-1">Google did not list any {noun}s for {context}. Type the name.</p>
        )}
        {custom && available.length > 0 && (
          <button type="button" onClick={() => { setCustomKey(''); onChange(''); }} className="text-[11px] text-teal-700 underline mt-1">
            Back to the list
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <select
        required={required}
        value={value}
        disabled={!context || loading}
        onChange={(e) => {
          if (e.target.value === OTHER) { setCustomKey(cacheKey); onChange(''); return; }
          onChange(e.target.value);
        }}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">
          {!context ? (level === 'district' ? 'Select a state first' : 'Select a district first')
            : loading ? `Loading ${noun}s from Google…` : `Select a ${noun}`}
        </option>
        {available.map(n => <option key={n} value={n}>{n}</option>)}
        {context && !loading && <option value={OTHER}>Other (type a name)…</option>}
      </select>
      {context && !loading && available.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-1">{available.length} {noun}{available.length === 1 ? '' : 's'} not added yet for {context}{builtIn ? '' : ' (from Google)'}. Not listed? Choose “Other”.</p>
      )}
    </div>
  );
};

export default GooglePlaceList;
