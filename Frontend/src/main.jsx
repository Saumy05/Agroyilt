import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { LanguageProvider } from './context/LanguageContext'
import './index.css'
import App from './App.jsx'
import { reloadForNewVersion } from './utils/chunkReload'

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// ─── GSAP GLOBAL SAFETY CONFIG ───────────────────────────────────────────────
// Safely patch Node.prototype.removeChild to prevent third-party library crashes
if (typeof window !== 'undefined') {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      // Silently ignore to prevent the app from freezing on NotFoundError
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({
    ignoreMobileResize: true,         // Prevents 100vh div injection on mobile
    autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load', // No resize event
  });
}

// A code file from an older version is gone after a deploy: load the new version instead of showing an error
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadForNewVersion();
});

// Registers the worker that shows a friendly offline page (instead of the browser's error page) when the site is
// opened or reloaded with no internet. It is the same worker file and scope the push notifications use.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }).catch(() => { /* not available here */ });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </HelmetProvider>
  </StrictMode>,
)
