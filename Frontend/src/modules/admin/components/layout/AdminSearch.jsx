import { useState, useEffect, useMemo, useRef } from 'react';
import { FiSearch, FiX, FiCornerDownLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import adminMenu from '../../config/adminMenu.json';
import authStorage from '../../../../utils/authStorage';
import { getChildRoute, filterMenuForAdmin } from '../../utils/adminNavigation';

const MAX_RESULTS = 8;

const AdminSearch = () => {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Flat list of every page the current admin may open
  const entries = useMemo(() => {
    const admin = authStorage.getUserData('admin') || {};
    const menu = filterMenuForAdmin(adminMenu, { role: admin.role || 'admin', permissions: admin.permissions });
    return menu.flatMap((item) => [
      { label: item.title, group: item.category, route: item.route },
      ...(item.children || []).map((child) => ({
        label: child,
        group: item.title,
        route: getChildRoute(item.route, child),
      })),
    ]);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return entries
      .map((e) => {
        const label = e.label.toLowerCase();
        const group = e.group.toLowerCase();
        let score = 0;
        if (label.startsWith(q)) score = 3;
        else if (label.includes(q)) score = 2;
        else if (`${group} ${label}`.includes(q)) score = 1;
        return { ...e, score };
      })
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);
  }, [query, entries]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Ctrl/Cmd+K focuses the search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (entry) => {
    navigate(entry.route);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      go(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xs hidden md:block">
      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search pages…  (Ctrl K)"
        aria-label="Search admin pages"
        className="w-full h-10 pl-9 pr-8 rounded-xl bg-gray-50 border border-gray-200/80 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
      />
      {query && (
        <button
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <FiX />
        </button>
      )}

      {open && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-40">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">No pages match “{query.trim()}”</p>
          ) : (
            <ul role="listbox">
              {results.map((r, i) => (
                <li key={`${r.route}-${r.label}`} role="option" aria-selected={i === activeIndex}>
                  <button
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => go(r)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === activeIndex ? 'bg-blue-50' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-800 truncate">{r.label}</span>
                      <span className="block text-[11px] text-gray-500 truncate">{r.group}</span>
                    </span>
                    {i === activeIndex && <FiCornerDownLeft className="text-blue-500 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminSearch;
