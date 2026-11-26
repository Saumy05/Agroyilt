import React, { useEffect, useState, useRef } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { registerConfirmHandler } from '../../utils/confirmAction';
import { useLanguage } from '../../context/LanguageContext';
import { translateText } from '../../services/translationService';
import { getFromCoreDictionary } from '../../utils/coreDictionary';

const instantOrSame = (text, lang) => {
  if (!text || !lang || lang === 'en') return text;
  return getFromCoreDictionary(text, lang) || text;
};

const GlobalConfirmHost = () => {
  const { currentCode } = useLanguage();
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);
  const codeRef = useRef(currentCode);
  codeRef.current = currentCode;

  useEffect(() => {
    return registerConfirmHandler((message, options = {}) => {
      return new Promise((resolve) => {
        if (resolverRef.current) {
          resolverRef.current(false);
        }
        resolverRef.current = resolve;

        const lang = codeRef.current || 'en';
        const rawTitle = options.title || 'Confirm Action';
        const rawMessage = message || 'Are you sure you want to proceed?';
        const rawConfirm = options.confirmLabel || 'Confirm';
        const rawCancel = options.cancelLabel || 'Cancel';

        setState({
          isOpen: true,
          type: options.type || 'warning',
          title: instantOrSame(rawTitle, lang),
          message: instantOrSame(rawMessage, lang),
          confirmLabel: instantOrSame(rawConfirm, lang),
          cancelLabel: instantOrSame(rawCancel, lang),
        });

        if (lang && lang !== 'en') {
          Promise.all([
            translateText(rawTitle, lang),
            translateText(rawMessage, lang),
            translateText(rawConfirm, lang),
            translateText(rawCancel, lang),
          ]).then(([tTitle, tMsg, tConfirm, tCancel]) => {
            setState((prev) =>
              prev && prev.isOpen
                ? {
                    ...prev,
                    title: tTitle || prev.title,
                    message: tMsg || prev.message,
                    confirmLabel: tConfirm || prev.confirmLabel,
                    cancelLabel: tCancel || prev.cancelLabel,
                  }
                : prev
            );
          }).catch(() => {});
        }
      });
    });
  }, []);

  const settle = (result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    if (resolve) resolve(result);
  };

  if (!state) return null;

  return (
    <ConfirmDialog
      isOpen={state.isOpen}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      type={state.type}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );
};

export default GlobalConfirmHost;
