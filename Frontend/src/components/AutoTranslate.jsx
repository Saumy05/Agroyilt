import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { translateText, getInstantTranslation } from '../services/translationService';
import { usesDevanagari } from '../utils/nativeTerms';

/**
 * Translates visible text on the page into the chosen language while mounted.
 * Known texts are swapped before the browser paints. Texts that must be fetched stay
 * hidden until their translation arrives (see [data-tr-pending] in index.css), so the
 * untranslated wording is not shown first.
 * Skips regions marked with translate="no" or data-no-translate.
 */

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG', 'PATH']);
const SKIP_SELECTOR = '[translate="no"],[data-no-translate]';
const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const BUTTON_INPUTS = 'input[type="button"], input[type="submit"], input[type="reset"]';
const HAS_ENGLISH = /[A-Za-z]{2,}/;
const HAS_HINDI = /[ऄ-हक़-ॡ]/;
const EMAIL_OR_LINK = /^\s*(?:\S+@\S+\.\S+|(?:https?:\/\/|www\.)\S+)\s*$/;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2500;

// Browser-drawn form messages: fetched early so they are ready when a form is submitted
const COMMON_FORM_MESSAGES = [
  'Please fill out this field.',
  'Please fill in this field.',
  'Please select an item in the list.',
  'Please check this box if you want to proceed.',
  'Please select one of these options.',
  'Please enter a number.',
  'Please match the requested format.',
  'Please select a file.'
];

/** Language a text is written in, or null when there is nothing to translate */
const sourceLangOf = (value, target) => {
  if (!value || EMAIL_OR_LINK.test(value)) return null;
  if (HAS_ENGLISH.test(value)) return 'en';
  // Some saved data (category names and the like) is typed in Hindi
  if (HAS_HINDI.test(value) && !usesDevanagari(target) && target !== 'hi') return 'hi';
  return null;
};

const AutoTranslate = () => {
  const { currentCode } = useLanguage();
  // The admin management portal stays in English
  const isAdmin = useLocation().pathname.startsWith('/admin');

  useLayoutEffect(() => {
    if (!currentCode || currentCode === 'en' || isAdmin || typeof document === 'undefined') return undefined;

    const target = currentCode;
    const states = new WeakMap(); // node -> Map(slot -> { original, applied, inflight, value, tries })
    const unchanged = new Set(); // texts that came back untranslated: never hide these again
    const hidden = new Map(); // element -> Set of its nodes still waiting
    const hiddenUnder = new WeakMap(); // node -> element hiding it
    const flaggedInputs = new Set(); // inputs carrying a translated browser validation message
    let cancelled = false;
    let retryTimer = null;

    const stateOf = (node, slot) => {
      let slots = states.get(node);
      if (!slots) states.set(node, (slots = new Map()));
      let state = slots.get(slot);
      if (!state) slots.set(slot, (state = {}));
      return state;
    };

    const textHider = (node) => ({
      hide: () => {
        const el = node.parentElement;
        if (!el) return;
        if (!hidden.has(el)) hidden.set(el, new Set());
        hidden.get(el).add(node);
        hiddenUnder.set(node, el);
        el.setAttribute('data-tr-pending', '');
      },
      show: () => {
        const el = hiddenUnder.get(node);
        if (!el) return;
        hiddenUnder.delete(node);
        const waiting = hidden.get(el);
        waiting?.delete(node);
        if (!waiting?.size) {
          hidden.delete(el);
          el.removeAttribute('data-tr-pending');
        }
      }
    });

    const placeholderHider = (el) => ({
      hide: () => el.setAttribute('data-tr-ph-pending', ''),
      show: () => el.removeAttribute('data-tr-ph-pending')
    });

    let scanAll = () => {};
    const scheduleRetry = () => {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!cancelled) scanAll();
      }, RETRY_DELAY_MS);
    };

    /** Translate one piece of text that lives on a node: its text, an attribute or the page title */
    const translateSlot = (node, slot, read, write, hider) => {
      const value = read();
      if (value == null) return;
      const state = stateOf(node, slot);
      if (state.applied === value || state.inflight === value) return;

      const source = sourceLangOf(value, target);
      if (!source) {
        state.inflight = null;
        hider?.show();
        return;
      }

      // Keep the spaces around a text, translate only the words
      const core = value.trim();
      const apply = (out) => {
        state.original = value;
        state.applied = value.match(/^\s*/)[0] + out + value.match(/\s*$/)[0];
        write(state.applied);
      };

      const instant = getInstantTranslation(core, target, source);
      if (instant) {
        state.inflight = null;
        apply(instant);
        hider?.show();
        return;
      }

      if (state.value !== value) {
        state.value = value;
        state.tries = 0;
      }
      if (state.tries > MAX_RETRIES) return;
      state.inflight = value;
      if (state.tries === 0 && !unchanged.has(core) && navigator.onLine !== false) hider?.hide();
      else hider?.show();

      translateText(core, target, source).then((out) => {
        if (cancelled || state.inflight !== value) return;
        state.inflight = null;
        if (read() === value) {
          if (out && out !== core) {
            apply(out);
          } else {
            unchanged.add(core);
            state.tries += 1;
            scheduleRetry();
          }
        }
        hider?.show();
      });
    };

    const translateTextNode = (node) => {
      const parent = node.parentElement;
      if (!node.isConnected || !parent) return;
      if (SKIP_TAGS.has(parent.nodeName.toUpperCase()) || parent.closest(SKIP_SELECTOR)) return;
      translateSlot(node, 'text', () => node.nodeValue, (v) => { node.nodeValue = v; }, textHider(node));
    };

    const translateAttr = (el, attr) => {
      if (!el.hasAttribute(attr) || el.closest(SKIP_SELECTOR)) return;
      translateSlot(
        el,
        attr,
        () => el.getAttribute(attr),
        (v) => el.setAttribute(attr, v),
        attr === 'placeholder' ? placeholderHider(el) : null
      );
    };

    const forEachTextNode = (root, visit) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) visit(node);
    };

    const forEachMatch = (root, selector, visit) => {
      if (root.matches(selector)) visit(root);
      root.querySelectorAll(selector).forEach(visit);
    };

    const translateTree = (root) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE || !root.isConnected) return;
      forEachTextNode(root, translateTextNode);
      TRANSLATABLE_ATTRS.forEach((attr) => forEachMatch(root, `[${attr}]`, (el) => translateAttr(el, attr)));
      forEachMatch(root, BUTTON_INPUTS, (el) => translateAttr(el, 'value'));
    };

    const titleEl = document.querySelector('title');
    const translateTitle = () => {
      if (titleEl) translateSlot(titleEl, 'title-text', () => document.title, (v) => { document.title = v; });
    };

    scanAll = () => {
      translateTitle();
      translateTree(document.body);
    };

    // Mutation callbacks run before the browser paints, so known texts never show untranslated
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'characterData') translateTextNode(m.target);
        else if (m.type === 'attributes') translateAttr(m.target, m.attributeName);
        else m.addedNodes.forEach(translateTree);
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS
    });
    const titleObserver = new MutationObserver(translateTitle);
    if (titleEl) titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });

    // "Please fill out this field" bubbles are drawn by the browser in its own language
    const onInvalid = (e) => {
      const input = e.target;
      const message = input.validationMessage;
      const source = sourceLangOf(message, target);
      if (!source) return;
      const instant = getInstantTranslation(message, target, source);
      if (instant) {
        input.setCustomValidity(instant);
        flaggedInputs.add(input);
      } else {
        translateText(message, target, source);
      }
    };
    // Clear our message as soon as the person does anything, so it never blocks a corrected form
    const clearFlagged = () => {
      flaggedInputs.forEach((input) => input.setCustomValidity(''));
      flaggedInputs.clear();
    };
    const CLEAR_EVENTS = ['input', 'change', 'pointerdown', 'keydown'];
    document.addEventListener('invalid', onInvalid, true);
    CLEAR_EVENTS.forEach((type) => document.addEventListener(type, clearFlagged, true));
    COMMON_FORM_MESSAGES.forEach((message) => translateText(message, target));

    scanAll();

    return () => {
      cancelled = true;
      observer.disconnect();
      titleObserver.disconnect();
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener('invalid', onInvalid, true);
      CLEAR_EVENTS.forEach((type) => document.removeEventListener(type, clearFlagged, true));
      clearFlagged();

      hidden.forEach((_, el) => el.removeAttribute('data-tr-pending'));
      document.querySelectorAll('[data-tr-ph-pending]').forEach((el) => el.removeAttribute('data-tr-ph-pending'));

      // Restore the original wording when switching language or leaving
      const restore = (node, slot, read, write) => {
        const state = states.get(node)?.get(slot);
        if (state?.original != null && state.applied === read()) write(state.original);
      };
      if (titleEl) restore(titleEl, 'title-text', () => document.title, (v) => { document.title = v; });
      forEachTextNode(document.body, (node) => restore(node, 'text', () => node.nodeValue, (v) => { node.nodeValue = v; }));
      [...TRANSLATABLE_ATTRS, 'value'].forEach((attr) => {
        document.body.querySelectorAll(`[${attr}]`).forEach((el) => {
          restore(el, attr, () => el.getAttribute(attr), (v) => el.setAttribute(attr, v));
        });
      });
    };
  }, [currentCode, isAdmin]);

  return null;
};

export default AutoTranslate;
