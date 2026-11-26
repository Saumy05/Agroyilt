let confirmHandler = null;

export const registerConfirmHandler = (handler) => {
  confirmHandler = handler;
  return () => {
    if (confirmHandler === handler) confirmHandler = null;
  };
};

/**
 * Promise-based confirmation dialog that renders in React DOM (so it is translated
 * into the active app language, unlike native window.confirm).
 * @param {string} message
 * @param {{ title?: string, confirmLabel?: string, cancelLabel?: string, type?: 'warning'|'danger'|'info' }} [options]
 * @returns {Promise<boolean>}
 */
export const confirmAction = (message, options = {}) => {
  if (confirmHandler) {
    return confirmHandler(message, options);
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return Promise.resolve(window.confirm(message));
  }
  return Promise.resolve(false);
};
