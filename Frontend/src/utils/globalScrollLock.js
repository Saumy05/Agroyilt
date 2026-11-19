/**
 * Global Scroll Lock Manager
 * Prevents background page scrolling when a modal or popup is open.
 * Handles document.body, document.documentElement, and layout containers (<main>).
 */

let activeModalCount = 0;
let originalMainOverflow = '';

export const lockBodyScroll = () => {
  activeModalCount++;
  if (typeof document !== 'undefined') {
    if (document.body) {
      document.body.style.overflow = 'hidden';
    }
    if (document.documentElement) {
      document.documentElement.style.overflow = 'hidden';
    }
    const main = document.querySelector('main');
    if (main) {
      if (activeModalCount === 1) {
        originalMainOverflow = main.style.overflow || '';
      }
      main.style.overflow = 'hidden';
    }
  }
};

export const unlockBodyScroll = () => {
  activeModalCount = Math.max(0, activeModalCount - 1);
  if (activeModalCount === 0 && typeof document !== 'undefined') {
    if (document.body) {
      document.body.style.overflow = '';
    }
    if (document.documentElement) {
      document.documentElement.style.overflow = '';
    }
    const main = document.querySelector('main');
    if (main) {
      main.style.overflow = originalMainOverflow;
    }
  }
};

