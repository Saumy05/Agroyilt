import React from 'react';
import { motion } from 'framer-motion';
import Logo from './Logo';

/**
 * LogoLoader Component
 * @param {boolean} fullScreen - If true, shows a full-screen overlay (for initial app load).
 *                               If false, shows an inline loader (for route transitions).
 * @param {boolean} overlay - If true with fullScreen, uses solid white background.
 *                            If false, uses transparent background (doesn't hide BottomNav).
 * @param {string} size - Size classes for the logo
 *
 * NOTE: On iOS devices, we show a simple native-style spinner instead of the animated logo.
 * Reason 1: App Store Guideline 4.2 — animated logo loading = instant web-wrapper identification = rejection.
 * Reason 2: Framer Motion infinite animations on iOS drain CPU/battery during the critical first load.
 */

// Detect iOS to avoid logo-based loading animation (App Store rejection risk)
function isIOS() {
  return /iP(hone|od|ad)/i.test(navigator.userAgent);
}

const LogoLoader = ({ fullScreen, overlay = false, inline = false, size = "w-20 h-20", delay = 0 }) => {
  const [isVisible, setIsVisible] = React.useState(delay === 0);

  React.useEffect(() => {
    if (delay > 0) {
      const timer = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(timer);
    }
  }, [delay]);

  if (!isVisible) return null;

  // For route transitions (default), use a non-blocking loader
  // For initial app load, use fullScreen with overlay
  // For inline loading (e.g. buttons), use inline
  const containerClasses = fullScreen
    ? overlay
      ? "fixed inset-0 flex items-center justify-center bg-white z-[9999]"
      : "fixed inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-[100]"
    : inline
      ? "flex items-center justify-center"
      : fullScreen === undefined
        // Page-level load: centred on the screen, under the bottom nav, never blocks taps
        ? "fixed inset-0 z-10 flex items-center justify-center pointer-events-none"
        // Explicit fullScreen={false}: sits inside its own section
        : "flex items-center justify-center w-full min-h-[60vh] pb-20";

  // On iOS: show a simple native spinner — no logo animation
  // This avoids App Store Guideline 4.2 rejection (web-wrapper detection)
  if (isIOS()) {
    const spinnerSize = inline ? "w-6 h-6" : "w-10 h-10";
    return (
      <div className={containerClasses}>
        <div
          className={`${spinnerSize} border-4 border-teal-100 border-t-teal-500 rounded-full animate-spin`}
        />
      </div>
    );
  }

  // On non-iOS (Android/Desktop): show the full branded logo loader
  return (
    <div className={containerClasses}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0.7 }}
        animate={{
          scale: [0.9, 1.05, 0.9],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 0.7,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className={`relative ${size} flex items-center justify-center`}
      >
        <Logo className="w-full h-full" />
        {/* Subtle ripple effect */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-teal-200"
          animate={{
            scale: [1, 1.4],
            opacity: [0.6, 0]
          }}
          transition={{
            duration: 0.7,
            repeat: Infinity,
            ease: "easeOut"
          }}
        />
      </motion.div>
    </div>
  );
};

export default LogoLoader;
