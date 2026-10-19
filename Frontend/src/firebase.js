/**
 * Firebase Configuration
 * Initialize Firebase for push notifications
 * 
 * NOTE: Firebase Cloud Messaging (FCM) is NOT supported on iOS Safari
 * unless the app is installed as a PWA on the Home Screen (iOS 16.4+).
 * We must guard against this to prevent the app from hanging on iOS.
 */

import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

/**
 * Detect iOS Safari (FCM is unsupported / causes hangs)
 * Returns true for all iOS devices (iPhone, iPad, iPod)
 */
function isIOSSafari() {
  const ua = navigator.userAgent;
  return /iP(hone|od|ad)/i.test(ua);
}

// Initialize Firebase
let app;
let messaging = null; // null by default — safe fallback

try {
  app = initializeApp(firebaseConfig);

  // Only initialize Messaging on non-iOS platforms
  // iOS Safari does not support FCM service workers properly
  if (!isIOSSafari()) {
    messaging = getMessaging(app);
    // console.log('✅ Firebase Messaging initialized');
  } else {
    // console.log('ℹ️ iOS device detected — Firebase Messaging skipped (not supported)');
  }
} catch (error) {
  console.warn('❌ [ATTENTION] Firebase initialization failed:', error);
  messaging = null; // Ensure messaging is null on failure
}

export { app, messaging, getToken, onMessage, isSupported };
