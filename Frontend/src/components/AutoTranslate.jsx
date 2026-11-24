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
    const attrOriginals = new WeakMap(); // element -> original English placeholder
    const attrApplied = new WeakMap(); // element -> translated placeholder
    const attrInflight = new WeakMap();
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

    const scan = () => {
      timer = null;
      if (cancelled) return;

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

      document.querySelectorAll('[placeholder]').forEach((el) => {
        const value = el.getAttribute('placeholder') || '';
        if (attrApplied.get(el) === value || attrInflight.get(el) === value) return;
        if (!HAS_LETTERS.test(value) || el.closest('[translate="no"],[data-no-translate]')) return;

        attrOriginals.set(el, value);
        attrInflight.set(el, value);
        translateInto(value, (out) => {
          if (cancelled || attrInflight.get(el) !== value) return;
          attrInflight.delete(el);
          if (el.getAttribute('placeholder') !== value) return;
          attrApplied.set(el, out || value);
          if (out) el.setAttribute('placeholder', out);
        });
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
      attributeFilter: ['placeholder']
    });
    scan();

    return () => {
      cancelled = true;
      observer.disconnect();
      if (timer) clearTimeout(timer);

      // Restore original English when unmounting or switching to English
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (originals.has(node) && applied.get(node) === node.nodeValue) {
          node.nodeValue = originals.get(node);
        }
      }
      document.querySelectorAll('[placeholder]').forEach((el) => {
        if (attrOriginals.has(el) && attrApplied.get(el) === el.getAttribute('placeholder')) {
          el.setAttribute('placeholder', attrOriginals.get(el));
        }
      });
    };
  }, [currentCode]);

  return null;
};

export default AutoTranslate;
