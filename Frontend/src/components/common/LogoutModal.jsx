import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiLogOut, FiX } from 'react-icons/fi';

/**
 * Premium, reusable Logout Confirmation Modal / Bottom-Sheet.
 * Works seamlessly across User, Vendor, Worker, and Admin interfaces.
 */
const LogoutModal = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  title = 'Log Out of Agroyilt?',
  message = 'Are you sure you want to log out? You will need to sign back in to access your account.',
  confirmText = 'Yes, Log Out',
  cancelText = 'Stay Logged In',
  userName = null,
  role = null,
}) => {
  const [internalLoading, setInternalLoading] = useState(false);

  // Lock body scroll while modal is active
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading && !internalLoading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, internalLoading, onClose]);

  const handleConfirm = async () => {
    if (isLoading || internalLoading) return;

    try {
      setInternalLoading(true);
      if (onConfirm) {
        await onConfirm();
      }
    } catch (err) {
      console.error('Logout error in modal:', err);
    } finally {
      setInternalLoading(false);
    }
  };

  const busy = isLoading || internalLoading;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/65 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
          onClick={(e) => {
            // Dismiss on backdrop click
            if (e.target === e.currentTarget && !busy) {
              onClose();
            }
          }}
        >
          {/* Animated Modal Container */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="w-full sm:max-w-sm bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-7 text-center relative z-10 overflow-hidden"
          >
            {/* Mobile drag handle */}
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
              aria-label="Close"
            >
              <FiX className="w-5 h-5" />
            </button>

            {/* Glowing Icon Container */}
            <div className="relative mx-auto w-16 h-16 mb-4 flex items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-red-500/15 blur-xl"></div>
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-red-50 via-rose-50 to-red-100 border border-red-200/80 flex items-center justify-center text-red-500 shadow-sm">
                <FiLogOut className="w-8 h-8 transform -translate-x-0.5" />
              </div>
            </div>

            {/* Title & Description */}
            <h3 id="logout-modal-title" className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {title}
            </h3>
            <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed px-1">
              {message}
            </p>

            {/* Optional User / Role Indicator */}
            {(userName || role) && (
              <div className="mt-3.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="truncate max-w-[220px]">
                  {userName ? `${userName}${role ? ` (${role})` : ''}` : `Role: ${role}`}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirm}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-2xl shadow-lg shadow-red-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {busy ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                    <span>Logging out...</span>
                  </>
                ) : (
                  <>
                    <FiLogOut className="w-5 h-5" />
                    <span>{confirmText}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="w-full py-3.5 px-4 bg-slate-100 hover:bg-slate-200/80 active:bg-slate-200 text-slate-700 font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
              >
                {cancelText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

export default LogoutModal;
