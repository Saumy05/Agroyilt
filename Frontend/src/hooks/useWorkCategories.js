import { useEffect, useMemo, useState } from 'react';
import workCategoryService from '../services/workCategoryService';
import { WORKER_SERVICES, canonicalService } from '../constants/workerServices';

/**
 * The work categories the admin manages: one list for the farmer's request forms, the worker's profile, team members and Add Worker.
 * Until the list arrives (or if it cannot be loaded) the built-in list in constants/workerServices.js is used, so the forms always work.
 * One request per page load, shared by every screen.
 */
let cached = null;
let inflight = null;

const loadCategories = () => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = workCategoryService.getAll()
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        cached = list.length ? list : null;
        return cached;
      })
      .catch(() => null)
      .finally(() => { inflight = null; });
  }
  return inflight;
};

const FALLBACK = WORKER_SERVICES.map((name) => ({ name, icon: '🌾', title: name, description: '', aliases: [] }));

export function useWorkCategories() {
  const [categories, setCategories] = useState(cached);

  useEffect(() => {
    let alive = true;
    loadCategories().then((list) => { if (alive && list) setCategories(list); });
    return () => { alive = false; };
  }, []);

  const list = categories || FALLBACK;
  const names = useMemo(() => list.map((c) => c.name), [list]);

  // every name a worker may have saved (current or old) -> the current name
  const toCurrent = useMemo(() => {
    const map = new Map();
    list.forEach((c) => {
      (c.aliases || []).forEach((a) => map.set(String(a).trim().toLowerCase(), c.name));
      map.set(c.name.trim().toLowerCase(), c.name);
    });
    return map;
  }, [list]);

  const canonical = (name) => {
    const text = String(name ?? '').trim();
    return toCurrent.get(text.toLowerCase()) || canonicalService(text);
  };

  const canonicalList = (items) => {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
      .map(canonical)
      .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  };

  return { categories: list, names, canonical, canonicalList, fromServer: !!categories };
}

/**
 * For the farmer's request forms: the cards (icon, title, description, skill) keyed by category name.
 * `staticData` is the form's own built-in set, used until the admin's list arrives. "Other" is always kept.
 */
export function useWorkCategoryTemplates(staticData) {
  const { categories, names, canonical, fromServer } = useWorkCategories();

  const categoryData = useMemo(() => {
    if (!fromServer) return staticData;
    const data = {};
    categories.forEach((c) => {
      data[c.name] = { icon: c.icon || '🌾', title: c.title || c.name, description: c.description || '', skill: c.name };
    });
    if (staticData.Other) data.Other = staticData.Other;
    return data;
  }, [categories, fromServer, staticData]);

  return {
    categoryData,
    categoryNames: Object.keys(categoryData),
    skillNames: fromServer ? names : Object.keys(staticData).filter((k) => k !== 'Other'),
    canonical
  };
}

export default useWorkCategories;
