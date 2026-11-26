import { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { translateText } from '../services/translationService';

/**
 * Translates visible text on the page into the chosen language while mounted.
 * Core UI elements translate with 0ms latency from the instant dictionary;
 * other texts are batched and fetched from cache/Google Cloud API.
 * Skips regions marked with translate="no" or data-no-translate.
 */

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG', 'PATH']);
const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const HAS_LETTERS = /[A-Za-z]{2,}/;
const SCAN_DELAY_MS = 100;

const isSkipped = (node) => {
  const parent = node.parentElement;
  if (!parent) return true;
  return SKIP_TAGS.has(parent.nodeName.toUpperCase()) || !!parent.closest('[translate="no"],[data-no-translate]');
};

const AutoTranslate = () => {
  const { currentCode } = useLanguage();

  useEffect(() => {
    if (!currentCode || currentCode === 'en' || typeof document === 'undefined') return undefined;
    // Don't auto-translate the admin management portal
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) return undefined;

    const target = currentCode;
    const originals = new WeakMap(); // text node -> original English text
    const applied = new WeakMap(); // text node -> translated text
    const inflight = new WeakMap(); // text node -> English text currently translating
    // Per-attribute maps: attr -> WeakMap<Element, string>
    const attrOriginals = new Map();
    const attrApplied = new Map();
    const attrInflight = new Map();
    const getAttrMap = (store, attr) => {
      if (!store.has(attr)) store.set(attr, new WeakMap());
      return store.get(attr);
    };

    let originalDocTitle = null;
    let appliedDocTitle = null;
    let inflightDocTitle = null;

    let cancelled = false;
    let timer = null;
    let isInternalMutating = false;

    // Keep the spaces around a text, translate only the words
    const translateInto = (value, apply) => {
      const lead = value.match(/^\s*/)[0];
      const trail = value.match(/\s*$/)[0];
      const core = value.trim();
      translateText(core, target).then((t) => {
        if (!cancelled) {
          apply(t && t !== core ? lead + t + trail : null);
        }
      });
    };

    const translateAttr = (el, attr) => {
      const value = el.getAttribute(attr) || '';
      const appliedMap = getAttrMap(attrApplied, attr);
      const inflightMap = getAttrMap(attrInflight, attr);
      const origMap = getAttrMap(attrOriginals, attr);

      if (appliedMap.get(el) === value || inflightMap.get(el) === value) return;
      if (!HAS_LETTERS.test(value) || el.closest('[translate="no"],[data-no-translate]')) return;

      origMap.set(el, value);
      inflightMap.set(el, value);
      translateInto(value, (out) => {
        if (cancelled || inflightMap.get(el) !== value) return;
        inflightMap.delete(el);
        if (el.getAttribute(attr) !== value) return;
        appliedMap.set(el, out || value);
        if (out) {
          isInternalMutating = true;
          try {
            el.setAttribute(attr, out);
          } finally {
            isInternalMutating = false;
          }
        }
      });
    };

    const scanTitle = () => {
      const title = document.title || '';
      if (!title || appliedDocTitle === title || inflightDocTitle === title || !HAS_LETTERS.test(title)) return;
      originalDocTitle = title;
      inflightDocTitle = title;
      translateInto(title, (out) => {
        if (cancelled || inflightDocTitle !== title) return;
        inflightDocTitle = null;
        if (document.title !== title) return;
        if (out) {
          appliedDocTitle = out;
          document.title = out;
        }
      });
    };

    const scan = () => {
      timer = null;
      if (cancelled) return;

      scanTitle();

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const value = node.nodeValue;
        if (applied.get(node) === value || inflight.get(node) === value) continue;
        if (!HAS_LETTERS.test(value) || isSkipped(node)) continue;

        originals.set(node, value);
        inflight.set(node, value);
        const current = node;
        translateInto(value, (out) => {
          if (cancelled || inflight.get(current) !== value) return;
          inflight.delete(current);
          if (current.nodeValue !== value) return; // React changed text meanwhile
          if (out) {
            applied.set(current, out);
            isInternalMutating = true;
            try {
              current.nodeValue = out;
            } finally {
              isInternalMutating = false;
            }
          }
        });
      }

      for (const attr of TRANSLATABLE_ATTRS) {
        document.querySelectorAll(`[${attr}]`).forEach((el) => translateAttr(el, attr));
      }

      document.querySelectorAll('input[type="button"], input[type="submit"], input[type="reset"]').forEach((el) => {
        translateAttr(el, 'value');
      });
    };

    const schedule = () => {
      if (isInternalMutating) return;
      if (!timer) timer = setTimeout(scan, SCAN_DELAY_MS);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS
    });

    const titleEl = document.querySelector('title');
    let titleObserver = null;
    if (titleEl) {
      titleObserver = new MutationObserver(scanTitle);
      titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    scan();

    return () => {
      cancelled = true;
      observer.disconnect();
      if (titleObserver) titleObserver.disconnect();
      if (timer) clearTimeout(timer);

      if (originalDocTitle && appliedDocTitle === document.title) {
        document.title = originalDocTitle;
      }

      // Restore original English when unmounting or switching to English
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (originals.has(node) && applied.get(node) === node.nodeValue) {
          node.nodeValue = originals.get(node);
        }
      }
      for (const attr of [...TRANSLATABLE_ATTRS, 'value']) {
        const origMap = getAttrMap(attrOriginals, attr);
        const appliedMap = getAttrMap(attrApplied, attr);
        document.querySelectorAll(`[${attr}]`).forEach((el) => {
          if (origMap.has(el) && appliedMap.get(el) === el.getAttribute(attr)) {
            el.setAttribute(attr, origMap.get(el));
          }
        });
      }
    };
  }, [currentCode]);

  return null;
};

export default AutoTranslate;
