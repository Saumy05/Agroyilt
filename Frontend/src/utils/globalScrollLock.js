/**
 * Global Scroll Lock Manager
 * Prevents background page scrolling when a modal or popup is open.
 */

let activeModalCount = 0;

export const lockBodyScroll = () => {
  activeModalCount++;
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.overflow = 'hidden';
  }
};

export const unlockBodyScroll = () => {
  activeModalCount = Math.max(0, activeModalCount - 1);
  if (activeModalCount === 0 && typeof document !== 'undefined' && document.body) {
    document.body.style.overflow = '';
  }
};
