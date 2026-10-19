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

// Notification sounds based on type
const NOTIFICATION_SOUNDS = {
  new_booking: '/booking-alert.mp3',
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
  let tag = data.bookingId || `notification-${Date.now()}`;
  let requireInteraction = false;
  let vibrate = [200, 100, 200];
  let actions = [];

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

    case 'new_booking':
    case 'new_booking_request':
      // High priority booking alert - like Ola/Uber
      notificationTitle = data.title || notification.title || '🔔 New Booking Request!';
      notificationBody = data.body || notification.body || 'You have a new service request.';
      requireInteraction = true; // Keep notification visible until user interacts
      vibrate = [500, 200, 500, 200, 500]; // Strong vibration pattern
      actions = [
        { action: 'accept', title: '✓ Accept', icon: '/icons/accept.png' },
        { action: 'reject', title: '✗ Decline', icon: '/icons/reject.png' }
      ];
      break;

    case 'job_assigned':
      // Worker job assignment - urgent
      notificationTitle = data.title || notification.title || '🔔 New Job Assigned!';
      notificationBody = data.body || notification.body || 'You have been assigned a new job.';
      requireInteraction = true;
      vibrate = [500, 200, 500, 200, 500];
      actions = [
        { action: 'accept', title: '✓ Accept Job', icon: '/icons/accept.png' },
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
  switch (action) {
    case 'accept':
      // Accept booking/job - navigate to details page
      if (data.bookingId) {
        if (data.notificationType === 'job_assigned') {
          urlToOpen = `/worker/job/${data.bookingId}`;
        } else {
          urlToOpen = `/vendor/booking-alert/${data.bookingId}`; // Opens the Accept/Reject alert modal
        }
      }
      break;

    case 'reject':
    case 'decline':
      // User rejected - just close notification
      return;

    case 'view':
    case 'track':
      // View details
      if (data.bookingId) {
        urlToOpen = data.link || `/user/booking/${data.bookingId}`;
      }
      break;

    case 'rate':
      // Navigate to rating page
      if (data.bookingId) {
        urlToOpen = `/user/booking/${data.bookingId}?rate=true`;
      }
      break;

    default:
      // Default click - for vendor booking alerts, open the alert page
      const clickNotifType = (data.notificationType || data.type || '').toLowerCase();
      if (data.bookingId && (clickNotifType === 'new_booking' || clickNotifType === 'new_booking_request')) {
        urlToOpen = `/vendor/booking-alert/${data.bookingId}`;
      } else {
        urlToOpen = data.link || data.url || '/';
      }
  }

  // Ensure URL is absolute
  const origin = self.location.origin;
  if (urlToOpen && !urlToOpen.startsWith('http')) {
    urlToOpen = new URL(urlToOpen, origin).href;
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          // Navigate to the specific URL
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

// Handle push events for additional processing
self.addEventListener('push', (event) => {
  console.log('[SW] 📨 Push event received:', event);
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('[SW] 📨 Push event data (JSON):', JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('[SW] 📨 Push event data (Text):', event.data.text());
    }
  } else {
    console.log('[SW] 📨 Push event has no data');
  }
});

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Service Worker installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] ✅ Service Worker activated');
  event.waitUntil(clients.claim());
});

// Message event for skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});

console.log('[SW] 🚀 Firebase Messaging Service Worker loaded');
