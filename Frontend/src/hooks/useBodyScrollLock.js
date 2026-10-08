import { useEffect } from 'react';
import { lockBodyScroll, unlockBodyScroll } from '../utils/globalScrollLock';

/**
 * Custom hook to lock body scrolling when a modal or dialog is open.
 * @param {boolean} isOpen - Whether the popup/modal is currently open.
 */
export function useBodyScrollLock(isOpen = true) {
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
      return () => unlockBodyScroll();
    }
  }, [isOpen]);
}

export default useBodyScrollLock;
