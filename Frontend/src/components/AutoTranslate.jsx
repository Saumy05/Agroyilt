import { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { translateText } from '../services/translationService';

/**
 * Translates every visible text on the page into the chosen language while it is mounted, so screens that are written
 * in English only still follow the language setting. Only the text of existing text nodes (and placeholders) is replaced,
 * never the page structure, so React keeps working. English is put back when the language is English or this unmounts.
 *
 * Skip a part of the page with translate="no" or data-no-translate.
 * Translations come from the /v1/translate API (cached on the server and in the browser).
 */

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
const HAS_LETTERS = /[A-Za-z]{2,}/;
const SCAN_DELAY_MS = 150;

const isSkipped = (node) => {
  const parent = node.parentElement;
  if (!parent) return true;
  return SKIP_TAGS.has(parent.nodeName.toUpperCase()) || !!parent.closest('[translate="no"],[data-no-translate]');
};

const AutoTranslate = () => {
  const { currentCode } = useLanguage();

  useEffect(() => {
    if (currentCode === 'en' || typeof document === 'undefined') return undefined;

    const target = currentCode;
    const originals = new WeakMap(); // text node -> the English text it had
    const applied = new WeakMap(); // text node -> the translated text we put in it
    const inflight = new WeakMap(); // text node -> the English text being translated right now
    const attrOriginals = new WeakMap(); // element -> its English placeholder
    const attrApplied = new WeakMap(); // element -> the translated placeholder we put in it
    const attrInflight = new WeakMap();
    let cancelled = false;
    let timer = null;

    // Keep the spaces around a text, translate only the words
    const translateInto = (value, apply) => {
      const lead = value.match(/^\s*/)[0];
      const trail = value.match(/\s*$/)[0];
      const core = value.trim();
      translateText(core, target).then((t) => apply(t && t !== core ? lead + t + trail : null));
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
          if (current.nodeValue !== value) return; // React changed it meanwhile; the next scan picks it up
          if (out) {
            applied.set(current, out);
            current.nodeValue = out;
          } else {
            applied.set(current, value); // already the same in this language: do not ask again
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

      // Put the English back
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (originals.has(node) && applied.get(node) === node.nodeValue) node.nodeValue = originals.get(node);
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
