/**
 * Firebase Messaging Service Worker
 * Handles background push notifications with sound alerts
 * Like Ola/Uber/Rapido - works even when app is closed
 */

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAyp1WH-pdFkg5MD-5-ysyi3qUHq3ir4hM",
  authDomain: "yatika-farm-service.firebaseapp.com",
  databaseURL: "https://yatika-farm-service-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "yatika-farm-service",
  storageBucket: "yatika-farm-service.firebasestorage.app",
  messagingSenderId: "882047767510",
  appId: "1:882047767510:web:580aa4ccce5108139e4a77",
  measurementId: "G-CEQVJNZ58F"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get messaging instance
const messaging = firebase.messaging();

// Broadcast incoming booking alert to all active tabs/windows
function broadcastIncomingAlert(data, notificationType) {
  const alertData = {
    type: 'AGROYILT_INCOMING_ALERT',
    notificationType: notificationType,
    data: data,
    requestId: data.requestId || data.bookingId,
    bookingId: data.bookingId || data.requestId,
    workTitle: data.workTitle,
    farmerName: data.farmerName,
    link: data.link,
    timestamp: Date.now()
  };

  // 1. Post message to all window clients
  if (self.clients && self.clients.matchAll) {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        try {
          client.postMessage(alertData);
        } catch (e) {}
      });
    }).catch(() => {});
  }

  // 2. BroadcastChannel (works cross-tab and into Web Workers / SPAs)
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('agroyilt_booking_alert_channel');
      bc.postMessage(alertData);
      setTimeout(() => { try { bc.close(); } catch (_) {} }, 1000);
    }
  } catch (e) {}
}

// Notification sounds based on type
const NOTIFICATION_SOUNDS = {
  new_booking: '/booking-alert.mp3',
  new_booking_request: '/booking-alert.mp3',
  worker_booking_request: '/booking-alert.mp3',
  group_booking_request: '/booking-alert.mp3',
  team_member_invitation: '/booking-alert.mp3',
  booking_accepted: '/success.mp3',
  worker_assigned: '/notification.mp3',
  job_assigned: '/booking-alert.mp3',
  booking_completed: '/success.mp3',
  default: '/notification.mp3'
};

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] 🔔 Background message received:', payload);

  const data = payload.data || {};
  const notification = payload.notification || {};
  const notificationType = (data.type || data.notificationType || 'default').toLowerCase();

  // Determine notification style based on type
  // Prioritize data properties for data-only notifications
  let notificationTitle = data.title || notification.title;
  let notificationBody = data.body || notification.body;

  // If absolutely no content, do not show notification (prevent empty bubbles)
  if (!notificationTitle && !notificationBody) {
    console.log('[SW] 🚫 Skipping empty notification');
    return;
  }

  // Default fallbacks if one is missing
  notificationTitle = notificationTitle || 'App Notification';
  notificationBody = notificationBody || 'You have a new update.';

  let icon = data.icon || notification.icon || '/AgroyiltLogo.png';
  let badge = '/AgroyiltLogo.png';
  let tag = data.bookingId || data.requestId || `notification-${Date.now()}`;
  let requireInteraction = false;
  let vibrate = [200, 100, 200];
  let actions = [];

  const isUrgentBookingAlert = [
    'worker_booking_request',
    'group_booking_request',
    'team_member_invitation',
    'group_member_request',
    'new_booking',
    'new_booking_request',
    'job_assigned',
    'booking_requested'
  ].includes(notificationType) || data.isUrgentBooking === 'true' || data.channelId === 'booking_alerts';

  // Broadcast to any background open tab to start ringing immediately
  if (isUrgentBookingAlert) {
    broadcastIncomingAlert(data, notificationType);
  }

  // Enhanced styling for different notification types
  switch (notificationType) {
    case 'booking_requested':
      notificationTitle = notificationTitle || '📅 Booking Created!';
      notificationBody = notificationBody || 'Your service request has been received.';
      vibrate = [200, 100];
      actions = [
        { action: 'view', title: '👁️ View Status' }
      ];
      break;

    case 'worker_booking_request':
    case 'group_booking_request':
    case 'team_member_invitation':
    case 'group_member_request':
      // High priority worker booking request alert - ring & loud vibration like Ola/Uber/Rapido
      notificationTitle = data.title || notification.title || '🌾 New Work Request!';
      notificationBody = data.body || notification.body || (data.workTitle ? `New job request: ${data.workTitle}` : 'Farmer is requesting your service.');
      requireInteraction = true; // Keep visible on screen
      vibrate = [1000, 400, 1000, 400, 1000, 400, 1000, 400, 1000]; // Urgent phone ring vibration pattern
      actions = [
        { action: 'accept', title: '📞 ACCEPT & VIEW' },
        { action: 'reject', title: '✕ DECLINE' }
      ];
      break;

    case 'new_booking':
    case 'new_booking_request':
      // High priority vendor booking alert
      notificationTitle = data.title || notification.title || '🔔 New Booking Request!';
      notificationBody = data.body || notification.body || 'You have a new service request.';
      requireInteraction = true; // Keep notification visible until user interacts
      vibrate = [1000, 400, 1000, 400, 1000, 400, 1000, 400, 1000];
      actions = [
        { action: 'accept', title: '✓ Accept', icon: '/accept_icon_1767937404754.png' },
        { action: 'reject', title: '✗ Decline', icon: '/reject_icon_1767937423083.png' }
      ];
      break;

    case 'job_assigned':
      // Worker job assignment - urgent
      notificationTitle = data.title || notification.title || '🔔 New Job Assigned!';
      notificationBody = data.body || notification.body || 'You have been assigned a new job.';
      requireInteraction = true;
      vibrate = [1000, 400, 1000, 400, 1000, 400, 1000, 400, 1000];
      actions = [
        { action: 'accept', title: '✓ Accept Job', icon: '/accept_icon_1767937404754.png' },
        { action: 'view', title: '👁️ View Details' }
      ];
      break;

    case 'booking_accepted':
      notificationTitle = data.title || notification.title || '✅ Booking Confirmed!';
      notificationBody = data.body || notification.body || 'Your booking has been accepted.';
      vibrate = [200, 100, 200];
      actions = [
        { action: 'view', title: '👁️ View Booking' }
      ];
      break;

    case 'worker_assigned':
      notificationTitle = data.title || notification.title || '👷 Worker Assigned';
      notificationBody = data.body || notification.body || 'A professional has been assigned to your booking.';
      vibrate = [200, 100, 200];
      actions = [
        { action: 'track', title: '📍 Track Worker' }
      ];
      break;

    case 'journey_started':
    case 'worker_started':
      notificationTitle = data.title || notification.title || '📍 Professional is on the way!';
      notificationBody = data.body || notification.body || 'Your service provider has started their journey.';
      requireInteraction = true;
      vibrate = [500, 200, 500];
      actions = [
        { action: 'track', title: '📍 Track Arrival', icon: '/icons/track.png' }
      ];
      break;

    case 'work_done':
    case 'worker_completed':
      notificationTitle = data.title || notification.title || '✅ Work Finished!';
      notificationBody = data.body || notification.body || 'Professional has finished the work and is preparing the bill.';
      requireInteraction = true;
      vibrate = [200, 100, 200, 100, 200];
      actions = [
        { action: 'view', title: '👁️ View Summary' }
      ];
      break;

    case 'booking_completed':
      notificationTitle = data.title || notification.title || '🎉 Booking Completed!';
      notificationBody = data.body || notification.body || 'Service has been completed successfully.';
      vibrate = [200, 100, 200, 100, 200];
      actions = [
        { action: 'rate', title: '⭐ Rate Now' }
      ];
      break;
  }

  const notificationOptions = {
    body: notificationBody,
    icon: icon,
    badge: badge,
    tag: tag,
    data: {
      ...data,
      notificationType: notificationType,
      url: data.link || '/',
      timestamp: Date.now()
    },
    // Vibration pattern for mobile devices
    vibrate: vibrate,
    // Keep notification until user interacts (for important ones)
    requireInteraction: requireInteraction,
    // Action buttons
    actions: actions,
    // Sound will be played by the system for high priority
    silent: false,
    // Renotify even if same tag exists
    renotify: true,
    // Timestamp
    timestamp: Date.now()
  };

  // Always display system notification banner when background push arrives
  return self.registration.showNotification(notificationTitle, notificationOptions)
    .catch(function (err) {
      console.error('[SW] ⚠️ Error displaying notification:', err);
    });
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 📱 Notification clicked:', event.action, event.notification.data);

  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action;

  // Close the notification
  notification.close();

  let urlToOpen = data.url || data.link || '/';

  // Handle different actions
  const targetId = data.bookingId || data.requestId;
  const notifType = (data.notificationType || data.type || '').toLowerCase();

  switch (action) {
    case 'accept':
      if (targetId) {
        if (notifType === 'job_assigned') {
          urlToOpen = `/worker/job/${targetId}`;
        } else if (notifType.includes('team_member') || notifType.includes('group_member')) {
          urlToOpen = `/worker/group-requests`;
        } else if (notifType.includes('worker') || notifType.includes('group_booking')) {
          urlToOpen = `/worker/booking-requests`;
        } else {
          urlToOpen = `/vendor/booking-alert/${targetId}`;
        }
      }
      break;

    case 'reject':
    case 'decline':
      // User rejected - just close notification
      return;

    case 'view':
    case 'track':
      if (targetId) {
        if (notifType.includes('worker') || notifType.includes('job')) {
          urlToOpen = data.link || `/worker/booking-requests`;
        } else {
          urlToOpen = data.link || `/user/booking/${targetId}`;
        }
      }
      break;

    case 'rate':
      if (targetId) {
        urlToOpen = `/user/booking/${targetId}?rate=true`;
      }
      break;

    default:
      if (targetId && (notifType === 'worker_booking_request' || notifType === 'group_booking_request')) {
        urlToOpen = `/worker/booking-requests`;
      } else if (targetId && (notifType === 'team_member_invitation' || notifType === 'group_member_request')) {
        urlToOpen = `/worker/group-requests`;
      } else if (targetId && (notifType === 'new_booking' || notifType === 'new_booking_request')) {
        urlToOpen = `/vendor/booking-alert/${targetId}`;
      } else {
        urlToOpen = data.link || data.url || '/';
      }
  }

  // Ensure URL is absolute
  const origin = self.location.origin;
  if (urlToOpen && !urlToOpen.startsWith('http')) {
    urlToOpen = new URL(urlToOpen, origin).href;
  }

  // Open or focus the app and trigger foreground ringing/alert
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'AGROYILT_INCOMING_ALERT',
            notificationType: notifType,
            data: data,
            action: action
          });
          if (urlToOpen) {
            return client.navigate(urlToOpen);
          }
          return;
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] ❌ Notification closed:', event.notification.data);
});

// Handle push events for additional processing and instant client ringing
self.addEventListener('push', (event) => {
  console.log('[SW] 📨 Push event received:', event);
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('[SW] 📨 Push event data (JSON):', JSON.stringify(data, null, 2));
      const payloadData = data.data || data;
      const type = (payloadData.type || payloadData.notificationType || '').toLowerCase();
      if (
        type === 'worker_booking_request' ||
        type === 'group_booking_request' ||
        type === 'team_member_invitation' ||
        type === 'group_member_request' ||
        type === 'new_booking' ||
        type === 'new_booking_request' ||
        type === 'job_assigned'
      ) {
        broadcastIncomingAlert(payloadData, type);
      }
    } catch (e) {
      console.log('[SW] 📨 Push event data (Text):', event.data.text());
    }
  } else {
    console.log('[SW] 📨 Push event has no data');
  }
});

// ── Offline page ───────────────────────────────────────────────────────────────
// Opening or reloading the site with no internet would show the browser's own "webpage not available" page.
// Only page navigations are handled here (network first, the saved offline page when the network fails);
// app files are never cached, so a deploy can never leave an old version behind.
const OFFLINE_CACHE = 'agroyilt-offline-v1';
const OFFLINE_URL = '/offline.html';

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Service Worker installing...');
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .catch((err) => console.warn('[SW] Offline page not cached:', err))
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] ✅ Service Worker activated');
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('agroyilt-offline-') && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached || new Response('No internet connection', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })
  );
});

// Message event for skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});

console.log('[SW] 🚀 Firebase Messaging Service Worker loaded');
