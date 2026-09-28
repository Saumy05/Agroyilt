import React, { useEffect } from 'react'; // Updated index to .jsx
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import AppRoutes from './routes';
import { SocketProvider } from './context/SocketContext';
import { CartProvider } from './context/CartContext';
import { GeoProvider } from './context/GeoContext';
import { EcommerceCartProvider } from './context/EcommerceCartContext';
import { BrandProvider } from './context/BrandContext';
import { initializePushNotifications, setupForegroundNotificationHandler } from './services/pushNotificationService';
// Global common imports removed here as they are now handled in AppRoutes.jsx for conditional rendering
// import { LocationPermissionChecker, Chatbot } from './components/common';

function App() {
  // Initialize push notifications on app load
  // NOTE: initializePushNotifications() safely returns early on iOS
  useEffect(() => {
    initializePushNotifications();

    // Only setup foreground handler if messaging is available (not iOS)
    // On iOS, messaging is null because FCM is not supported
    try {
      setupForegroundNotificationHandler((payload) => {
        console.log(' [App.jsx] Foreground notification received in callback:', payload);
        const title = payload.notification?.title || payload.data?.title || 'New Notification';
        const body = payload.notification?.body || payload.data?.body || '';
        const type = payload.data?.type || '';

        // Role & Route Filtering:
        // When on /admin portal, suppress personal worker/vendor/user account notifications (e.g. "Worker Account Approved, You can now login")
        const currentPath = window.location.pathname;
        if (currentPath.startsWith('/admin')) {
          const isWorkerPersonalMessage = payload.data?.workerId || type.startsWith('worker_') || title.includes('[Pro]') || title.toLowerCase().includes('worker account');
          const isVendorPersonalMessage = payload.data?.vendorId || type.startsWith('vendor_') || title.toLowerCase().includes('vendor account');
          const isFarmerPersonalMessage = payload.data?.userId || type.startsWith('farmer_') || title.toLowerCase().includes('farmer account');

          // Exceptions: Admin alerts that the admin actually needs to see
          const isAdminAlert = type.includes('_request') || type.includes('admin_') || type.includes('withdrawal') || type.includes('dispute') || payload.data?.adminId;

          if ((isWorkerPersonalMessage || isVendorPersonalMessage || isFarmerPersonalMessage) && !isAdminAlert) {
            console.log(' [App.jsx] Suppressed recipient personal notification on Admin portal:', title);
            return;
          }
        }

        console.log(` [App.jsx] Displaying in-app toast for: "${title}"`);
        toast((t) => (
          <div className="flex flex-col text-left">
            <span className="font-bold text-gray-900 text-sm leading-snug">{title}</span>
            {body && <span className="text-xs text-gray-600 mt-1 leading-relaxed">{body}</span>}
          </div>
        ), {
          icon: '🔔',
          duration: 5000,
          style: {
            background: '#ffffff',
            color: '#111827',
            border: '1px solid #e5e7eb',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            padding: '14px 18px',
          }
        });

        // Show native browser notification in foreground if permission is granted
        if ('Notification' in window && Notification.permission === 'granted') {
          console.log(' [App.jsx] Displaying native browser notification...');
          try {
            new Notification(title, {
              body: body,
              icon: payload.notification?.icon || payload.data?.icon || '/AgroyiltLogo.png'
            });
          } catch (e) {
            console.error('Error showing native notification in foreground:', e);
          }
        } else {
          console.log('Native browser notifications skipped. Permission status:', 'Notification' in window ? Notification.permission : 'Not supported');
        }

        // Dispatch update events for listening components to refresh UI
        window.dispatchEvent(new Event('vendorJobsUpdated'));
        window.dispatchEvent(new Event('vendorStatsUpdated'));
        window.dispatchEvent(new Event('workerJobsUpdated'));
        window.dispatchEvent(new Event('userBookingsUpdated'));
        window.dispatchEvent(new Event('appNotificationReceived'));

      });
    } catch (error) {
      console.log(error);
    }
  }, []);

  return (
    <BrowserRouter>
      <BrandProvider>
        <SocketProvider>
          <GeoProvider>
            <CartProvider>
              <EcommerceCartProvider>
                <div className="App">
                  <AppRoutes />
                  {/* Global components moved to routes/index.jsx */}
                  <Toaster
                    position="top-center"
                    reverseOrder={false}
                    toastOptions={{
                      duration: 2500,
                      style: {
                        background: '#ffffff',
                        color: '#111827',
                        borderRadius: '16px',
                        padding: '14px 20px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                        border: '1px solid #e5e7eb',
                        fontWeight: '500'
                      },
                      success: {
                        duration: 1500,
                        style: {
                          background: '#ffffff',
                          color: '#065f46',
                          border: '1px solid #a7f3d0'
                        },
                      },
                      error: {
                        duration: 3000,
                        style: {
                          background: '#ffffff',
                          color: '#991b1b',
                          border: '1px solid #fecaca'
                        },
                      },
                    }}
                  />
                </div>
              </EcommerceCartProvider>
            </CartProvider>
          </GeoProvider>
        </SocketProvider>
      </BrandProvider>
    </BrowserRouter>
  );
}

export default App;
