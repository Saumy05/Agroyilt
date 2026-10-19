/**
 * Push Notification Service
 * Handles FCM token registration and notification handling
 * 
 * NOTE: FCM Push Notifications are NOT supported on iOS Safari
 * (requires iOS 16.4+ AND app added to Home Screen as PWA).
 * All functions safely return/no-op on iOS to prevent hangs.
 */

import { messaging, getToken, onMessage, isSupported } from '../firebase';
import authStorage from '../utils/authStorage';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Check if running on iOS (iPhone, iPad, iPod)
 * FCM Service Workers are not properly supported on iOS Safari.
 * @returns {boolean}
 */
function isIOS() {
  return /iP(hone|od|ad)/i.test(navigator.userAgent);
}

/**
 * Check if running inside Flutter WebView
 * @returns {boolean}
 */
function isFlutterWebView() {
  return !!(window.flutter_inappwebview && window.flutter_inappwebview.callHandler);
}

/**
 * Get the current platform type
 * @returns {'web' | 'mobile'}
 */
function getPlatformType() {
  return isFlutterWebView() ? 'mobile' : 'web';
}

/**
 * Register service worker for push notifications
 * Skipped on iOS — FCM service workers hang on iOS Safari.
 * @returns {Promise<ServiceWorkerRegistration>}
 */
async function registerServiceWorker() {
  // Skip on iOS — FCM SW registration hangs or fails on iOS Safari
  if (isIOS()) {
    throw new Error('FCM Service Workers not supported on iOS Safari');
  }

  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers are not supported in this browser');
  }

  try {
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
      console.log('✅ Service Worker registered with scope:', registration.scope);
    } else {
      // If a new worker is waiting, signal it to activate
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }

    const readyRegistration = await navigator.serviceWorker.ready;
    return readyRegistration || registration;
  } catch (error) {
    console.error('❌ Service Worker registration failed:', error);
    throw error;
  }
}

/**
 * Request notification permission from user
 * @returns {Promise<boolean>}
 */
async function requestNotificationPermission() {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      return true;
    } else {
      return false;
    }
  }
  return false;
}

async function getFCMToken() {
  try {
    // 1. Verify browser support (prevents errors on Safari, Incognito, etc.)
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      console.warn('[FCM] ℹ️ Push notifications are not supported in this browser (e.g. Safari, Incognito, or disabled Google Push).');
      return null;
    }

    if (!messaging) {
      console.warn('❌ [ATTENTION] Firebase messaging not initialized. Check firebase.js for errors.');
      return null;
    }

    if (!VAPID_KEY) {
      console.warn('❌ [ATTENTION] VAPID_KEY is not defined in environment variables.');
      return null;
    }

    const registration = await registerServiceWorker();

    let token = null;
    try {
      token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });
    } catch (tokenErr) {
      const errStr = (tokenErr.message || tokenErr.code || '').toLowerCase();
      // Auto-heal: If an existing push subscription has a mismatched key, reset it and retry once
      if (errStr.includes('applicationserverkey') || errStr.includes('subscription') || tokenErr.code === 'messaging/token-subscribe-failed') {
        console.warn('[FCM] Stale push subscription detected. Cleaning up and retrying...');
        const existingSub = await registration.pushManager?.getSubscription().catch(() => null);
        if (existingSub) {
          await existingSub.unsubscribe().catch(() => {});
        }
        token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration
        });
      } else {
        throw tokenErr;
      }
    }

    if (token) {
      return token;
    } else {
      console.warn('[FCM] ⚠️ FCM getToken returned empty token');
      return null;
    }
  } catch (error) {
    if (error.name === 'AbortError' || error.message?.includes('push service error')) {
      console.warn('[FCM] ⚠️ Push service unavailable. If using Brave Browser, please enable "Use Google Services for Push Messaging" in brave://settings/privacy.');
    } else {
      console.error('[FCM] ❌ Error in getFCMToken:', error.name, error.message || error.code || error);
    }
    return null;
  }
}

/**
 * Register FCM token with backend
 * @param {string} userType - 'user', 'vendor', or 'worker'
 * @param {boolean} forceUpdate - Force token update
 * @returns {Promise<string|null>}
 */
async function registerFCMToken(userType = 'user', forceUpdate = false) {
  try {
    const platform = getPlatformType();

    // Check if running in Flutter WebView
    if (isFlutterWebView()) {
      try {
        const result = await window.flutter_inappwebview.callHandler('getFCMToken');
        if (result && result.success && result.token) {
          return await saveTokenToBackend(result.token, userType, 'mobile');
        }
      } catch (err) {
        // Flutter bridge not available, continue silently
      }
      return null;
    }

    // Check if already registered
    const storageKey = `fcm_token_${userType}_web`;
    const savedToken = localStorage.getItem(storageKey);
    if (savedToken && !forceUpdate) {
      return savedToken;
    }

    // Request permission
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return null;

    // Get token
    const token = await getFCMToken();
    if (!token) return null;

    return await saveTokenToBackend(token, userType, 'web');
  } catch (error) {
    console.error('[FCM] ❌ Error registering FCM token:', error);
    return null;
  }
}


/**
 * Helper to save FCM token to the backend
 * @param {string} token 
 * @param {string} userType 
 * @param {'web'|'mobile'} platform 
 */
async function saveTokenToBackend(token, userType, platform) {
  try {
    // Unified common endpoint for all roles
    const endpoint = '/fcm-tokens/save';

    // Get tab-isolated auth token for the target role
    const authToken = authStorage.getAccessToken(userType);
    if (!authToken) {
      console.warn(`[FCM] ℹ️ Skipping FCM token save: No auth token found for role '${userType}'.`);
      return null;
    }

    // Save to backend
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    const payload = {
      token: token,
      platform: platform
    };

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const storageKey = `fcm_token_${userType}_${platform}`;
      localStorage.setItem(storageKey, token);
      console.log(`[FCM] ✅ Token successfully registered for ${userType} (${platform})`);
      return token;
    } else {
      const errText = await response.text();
      console.warn(`[FCM] ⚠️ Backend rejected FCM token registration (${response.status}):`, errText);
      return null;
    }
  } catch (error) {
    console.error('[FCM] ❌ Error saving token to backend:', error);
    return null;
  }
}

/**
 * Remove FCM token from backend (removes specific token for current device)
 * @param {string} userType - 'user', 'vendor', or 'worker'
 */
async function removeFCMToken(userType = 'user') {
  try {
    // Detect platform automatically
    const platform = getPlatformType();
    const storageKey = `fcm_token_${userType}_${platform}`;
    const tokenToRemove = localStorage.getItem(storageKey);

    if (!tokenToRemove) {
      return;
    }

    // Unified common endpoint for all roles
    const endpoint = '/fcm-tokens/remove';

    const authToken = authStorage.getAccessToken(userType);
    // If we have an auth token in the tab session, remove from backend
    if (authToken) {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

      // Call remove endpoint with specific token
      await fetch(`${baseUrl}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          token: tokenToRemove,
          platform: platform
        })
      });
    }

    // Remove local FCM token cache
    localStorage.removeItem(storageKey);
  } catch (error) {
    // Silent fail
  }
}

/**
 * Setup foreground notification handler
 * @param {Function} handler - Custom handler function
 */
function setupForegroundNotificationHandler(handler) {
  if (!messaging) {
    // console.error('Firebase messaging not initialized');
    return;
  }

  onMessage(messaging, (payload) => {
    // Call custom handler (e.g. for toast)
    if (handler) {
      handler(payload);
    }
  });
}

/**
 * Initialize push notifications
 * Call this on app load
 * Safely skipped on iOS to prevent hanging.
 */
async function initializePushNotifications() {
  try {
    // Skip entirely on iOS — FCM is not supported
    if (isIOS()) {
      // console.log('ℹ️ iOS detected — Push Notifications skipped (not supported without PWA install)');
      return;
    }

    if (!('serviceWorker' in navigator)) {
      // console.log('Service workers not supported');
      return;
    }

    if (!('Notification' in window)) {
      // console.log('Notifications not supported');
      return;
    }

    await registerServiceWorker();
    // console.log('✅ Push notifications initialized');
  } catch (error) {
    // console.error('Error initializing push notifications:', error);
  }
}

export {
  initializePushNotifications,
  registerFCMToken,
  removeFCMToken,
  setupForegroundNotificationHandler,
  requestNotificationPermission,
  getFCMToken,
  isFlutterWebView
};
