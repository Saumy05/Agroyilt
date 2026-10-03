/* eslint-disable react-hooks/set-state-in-effect */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, useMotionValue, useTransform } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { toast } from 'react-hot-toast';
import { FiBell, FiClock, FiCheckCircle, FiAlertCircle, FiX, FiTruck, FiUsers } from 'react-icons/fi';
import { toastManager } from '../utils/toastManager';
import { playNotificationSound, isSoundEnabled, playAlertRing, playCancellationAlert, stopAlertRing } from '../utils/notificationSound';
import { registerFCMToken } from '../services/pushNotificationService';
import authStorage from '../utils/authStorage';

const SwipeableNotification = ({ t, data, onClick }) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-200, 0, 200], [0, 1, 0]);

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      style={{ x, opacity }}
      onDragEnd={(e, { offset }) => {
        if (Math.abs(offset.x) > 80) { // Threshold
          toast.dismiss(t.id);
        }
      }}
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{
        opacity: t.visible ? 1 : 0,
        y: t.visible ? 0 : -20,
        scale: t.visible ? 1 : 0.95
      }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      whileTap={{ scale: 0.98 }}
      className="max-w-md w-full bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-gray-900/5 cursor-pointer dark:bg-gray-800 dark:ring-gray-700"
      onClick={onClick}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0 pt-0.5">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md">
              <FiBell className="text-lg" />
            </div>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {data.title}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {data.message}
            </p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200 dark:border-gray-700">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(t.id);
          }}
          className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-medium text-gray-400 hover:text-gray-500 focus:outline-none"
        >
          <FiX />
        </button>
      </div>
    </motion.div>
  );
};

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [reminderAlert, setReminderAlert] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Determine user type based on path or active tab session
  const getUserType = (path) => {
    if (path.startsWith('/vendor')) return 'vendor';
    if (path.startsWith('/worker')) return 'worker';
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/user')) return 'user';
    // If on general path (e.g. '/', '/services', '/cart', '/checkout'), check if this tab has an active session
    if (authStorage.isAuthenticated('user')) return 'user';
    if (authStorage.isAuthenticated('worker')) return 'worker';
    if (authStorage.isAuthenticated('vendor')) return 'vendor';
    if (authStorage.isAuthenticated('admin')) return 'admin';
    return null;
  };

  const userType = getUserType(location.pathname);

  // Compute token to reactively trigger socket connection/disconnection on auth state change
  const token = userType ? authStorage.getAccessToken(userType) : null;

  useEffect(() => {
    if (!userType) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // If no token, we don't connect
    if (!token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Disconnect previous if any
    if (socket) {
      socket.disconnect();
    }

    // Use HTTP URL for socket.io client - it handles WS upgrade automatically
    const socketBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';

    const newSocket = io(socketBaseUrl, {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'], // WebSocket first for instant real-time alerts
      path: '/socket.io/',
      secure: socketBaseUrl.startsWith('https://') || window.location.protocol === 'https:',
      rejectUnauthorized: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 10000,
      autoConnect: true
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      // Register FCM token for push notifications (on page load/refresh)
      if (userType && token) {
        registerFCMToken(userType, true).catch(() => {});
      }

      // If admin, join admin-specific room
      if (userType === 'admin') {
        const adminData = authStorage.getUserData('admin') || {};
        const adminId = adminData.id || adminData._id;
        if (adminId) {
          newSocket.emit('join_admin_room', adminId);
        }
      }

      // If vendor, join vendor-specific room
      if (userType === 'vendor') {
        const vendorData = authStorage.getUserData('vendor') || {};
        const vendorId = vendorData.id || vendorData._id;
        if (vendorId) {
          newSocket.emit('join_vendor_room', vendorId);
        }
      }

      // If worker, join worker-specific room
      if (userType === 'worker') {
        const workerData = authStorage.getUserData('worker') || {};
        const workerId = workerData.id || workerData._id;
        if (workerId) {
          newSocket.emit('join_worker_room', workerId);
        }
      }

      // If user (farmer), join user-specific room
      if (userType === 'user') {
        const userData = authStorage.getUserData('user') || {};
        const userId = userData.id || userData._id;
        if (userId) {
          newSocket.emit('join_user_room', userId);
        }
      }
    });

    newSocket.on('disconnect', () => {
      // disconnected silently
    });

    newSocket.on('connect_error', () => {
      // connection error handled silently
    });

    // Listen for generic notifications
    newSocket.on('notification', (data) => {
      // console.log('ðŸ”” App Notification received:', data);

      if (isSoundEnabled(userType)) {
        playNotificationSound();
      }

      if (data.type === 'booking_approaching' || data.type === 'booking_ending') {
        setReminderAlert({
          title: data.title,
          message: data.message,
          relatedId: data.relatedId,
          type: data.type
        });
      }

      // Show custom toast for all notifications
      toast.custom((t) => (
        <SwipeableNotification
          t={t}
          data={data}
          onClick={() => {
            toast.dismiss(t.id);
            const directLink = data.link || data.data?.link;
            if (directLink) {
              navigate(directLink);
              return;
            }

            const targetId = data.relatedId || data.data?.bookingId || data.data?.requestId;
            const notifType = (data.type || '').toLowerCase();
            const relType = (data.relatedType || '').toLowerCase();

            if (userType === 'vendor') {
              if (notifType.includes('ecommerce') || notifType.includes('order')) {
                navigate('/vendor/store/orders');
              } else if (notifType.includes('soil')) {
                navigate('/vendor/soil-tests');
              } else if (notifType.includes('wallet') || notifType.includes('payout')) {
                navigate('/vendor/wallet');
              } else if (notifType.includes('support') || relType.includes('support')) {
                const ticketId = data.data?.ticketId || targetId;
                navigate(`/vendor/help-support${ticketId ? `?ticketId=${ticketId}` : ''}`);
              } else if (targetId) {
                navigate(`/vendor/booking/${targetId}`);
              } else {
                navigate('/vendor/jobs');
              }
            } else if (userType === 'worker') {
              if (notifType.includes('team')) {
                navigate('/worker/team');
              } else if (notifType === 'group_booking_request' || notifType === 'group_member_request') {
                navigate('/worker/group-requests');
              } else if (['worker_booking_request', 'new_booking_request', 'job_request', 'extra_worker_dispatch'].includes(notifType)) {
                navigate('/worker/booking-requests');
              } else if (notifType.includes('wallet') || ['assignment_settled', 'earnings_credit', 'payment_received', 'payout_processed'].includes(notifType)) {
                navigate('/worker/wallet');
              } else if (notifType.includes('support') || relType.includes('support')) {
                const ticketId = data.data?.ticketId || targetId;
                navigate(`/worker/help-support${ticketId ? `?ticketId=${ticketId}` : ''}`);
              } else if (targetId) {
                navigate(`/worker/job/${targetId}`);
              } else {
                navigate('/worker/jobs');
              }
            } else {
              // User (Farmer)
              if (notifType.includes('ecommerce') || notifType.includes('order')) {
                navigate('/user/my-agri-orders');
              } else if (notifType.includes('soil')) {
                navigate('/user/soil-testing');
              } else if (notifType.includes('wallet') || notifType.includes('refund')) {
                navigate('/user/wallet');
              } else if (notifType.includes('support') || relType.includes('support')) {
                const ticketId = data.data?.ticketId || targetId;
                navigate(`/user/help-support${ticketId ? `?ticketId=${ticketId}` : ''}`);
              } else if (
                relType === 'workerbookingrequest' ||
                data.data?.requestId ||
                ['worker_booking', 'worker_request', 'day_completed', 'worker_arrived', 'worker_journey', 'worker_decreased', 'extra_worker', 'extension_'].some(k => notifType.includes(k))
              ) {
                const reqId = data.data?.requestId || targetId;
                if (['worker_journey_started', 'worker_arrived', 'worker_work_submitted', 'day_completed'].some(k => notifType.includes(k))) {
                  if (reqId) navigate(`/user/farmer-worker-request/${reqId}/track`);
                  else navigate('/user/my-bookings');
                } else if (reqId) {
                  navigate(`/user/farmer-worker-request/${reqId}`);
                } else {
                  navigate('/user/my-bookings');
                }
              } else if (targetId) {
                navigate(`/user/booking/${targetId}`);
              } else {
                navigate('/user/my-bookings');
              }
            }
          }}
        />
      ), {
        id: 'socket-notification', // Prevent stacking
        duration: 3500, // Slightly longer to allow interaction/reading since it's dismissible
        position: 'top-right'
      });

      // Dispatch update events to refresh UI components
      if (userType === 'worker') {
        window.dispatchEvent(new Event('workerJobsUpdated'));
        window.dispatchEvent(new Event('workerNotificationsUpdated'));
        if (
          data.type === 'worker_booking_request' ||
          data.type === 'new_booking_request' ||
          data.type === 'booking_request' ||
          data.type === 'group_booking_request' ||
          data.type === 'team_member_invitation' ||
          data.type === 'group_member_request'
        ) {
          // Play loud alert ring
          try {
            playAlertRing(true);
          } catch (soundErr) {
            console.warn('[SOCKET] Could not play alert ringtone:', soundErr);
          }
          
          const isTeam = data.type === 'team_member_invitation' || data.type === 'group_member_request' || data.data?.isTeamInvite;
          window.dispatchEvent(new CustomEvent('workerIncomingBooking', { 
            detail: {
              data: {
                ...(data.data || data),
                ...(isTeam ? { requestType: 'TEAM_MEMBER_INVITATION', isTeamInvite: true } : {})
              },
              relatedId: data.relatedId || (data.data && data.data.requestId)
            }
          }));
        } else if (
          data.type === 'worker_booking_cancelled' ||
          data.type === 'worker_request_cancelled' ||
          data.type === 'booking_cancelled' ||
          data.type === 'job_cancelled'
        ) {
          try {
            stopAlertRing();
            playCancellationAlert();
          } catch (e) {}

          const cancelDetail = {
            data: data.data || data,
            requestId: data.relatedId || data.data?.requestId || data.data?.bookingId || data._id,
            message: data.message || 'The farmer has cancelled this booking request.'
          };

          window.dispatchEvent(new CustomEvent('workerBookingCancelled', { detail: cancelDetail }));
          window.dispatchEvent(new CustomEvent('workerRequestCancelled', { detail: cancelDetail }));
          window.dispatchEvent(new Event('workerJobsUpdated'));

          toastManager.error(data.message || 'The farmer has cancelled this booking request.', {
            duration: 5000
          });
        }
      }
      if (userType === 'vendor') {
        window.dispatchEvent(new Event('vendorJobsUpdated'));
        window.dispatchEvent(new Event('vendorNotificationsUpdated'));
        window.dispatchEvent(new Event('vendorStatsUpdated'));

        // Fallback: Dispatch specific event for Incoming Booking Popup from notification
        if (data.type === 'booking_request' || data.type === 'new_booking') {
          // ensure we pass it in the shape IncomingBookingPopup expects
          window.dispatchEvent(new CustomEvent('vendorIncomingBooking', { 
            detail: {
              data: data.data || data,
              relatedId: data.relatedId || (data.data && data.data.bookingId)
            }
          }));
        }
      }
      if (userType === 'user') {
        window.dispatchEvent(new Event('userBookingsUpdated'));
        window.dispatchEvent(new Event('userNotificationsUpdated'));
      }
      if (userType === 'admin') {
        window.dispatchEvent(new Event('adminNotificationsUpdated'));
        window.dispatchEvent(new Event('adminStatsUpdated'));
      }
    });

    // Listen for real-time booking updates
    newSocket.on('booking_updated', () => {
      if (userType === 'user') window.dispatchEvent(new Event('userBookingsUpdated'));
      if (userType === 'vendor') window.dispatchEvent(new Event('vendorJobsUpdated'));
      if (userType === 'worker') window.dispatchEvent(new Event('workerJobsUpdated'));
    });

    // Listen for real-time branding updates from Admin Panel
    newSocket.on('branding:updated', (data) => {
      console.log('🎨 [SOCKET] branding:updated event received:', data);
      window.dispatchEvent(new CustomEvent('brandingUpdated', { detail: data }));
    });


    // Multi-Worker Live Tracking Global Events
    const handleTrackingEvent = (eventType, data) => {
      window.dispatchEvent(new CustomEvent('workerTrackingEvent', {
        detail: { eventType, data }
      }));
      if (userType === 'user') window.dispatchEvent(new Event('userBookingsUpdated'));
      if (userType === 'worker') window.dispatchEvent(new Event('workerJobsUpdated'));
    };

    newSocket.on('worker_journey_started', (data) => handleTrackingEvent('worker_journey_started', data));
    newSocket.on('worker_location_updated', (data) => handleTrackingEvent('worker_location_updated', data));
    newSocket.on('worker_arrived', (data) => handleTrackingEvent('worker_arrived', data));
    newSocket.on('worker_otp_verified', (data) => handleTrackingEvent('worker_otp_verified', data));
    newSocket.on('worker_work_started', (data) => handleTrackingEvent('worker_work_started', data));
    newSocket.on('worker_work_completed', (data) => handleTrackingEvent('worker_work_completed', data));

    // Listen for special Worker Booking Requests
    if (userType === 'worker') {
      const handleWorkerIncoming = (data) => {
        try {
          playAlertRing(true);
        } catch (soundErr) {
          console.warn('[SOCKET] Could not play alert ringtone:', soundErr);
        }

        const requestData = data.data || data;
        const reqId = data.relatedId || requestData.requestId || requestData._id;

        window.dispatchEvent(new CustomEvent('workerIncomingBooking', {
          detail: {
            data: requestData,
            relatedId: reqId
          }
        }));
        window.dispatchEvent(new Event('workerJobsUpdated'));
      };

      const handleWorkerCancellation = (data) => {
        try {
          stopAlertRing();
          playCancellationAlert();
        } catch (e) {}

        const cancelData = data?.data || data || {};
        const cancelReqId = cancelData.requestId || cancelData.bookingId || data?.relatedId || cancelData._id;
        const cancelMessage = cancelData.message || data?.message || 'The farmer has cancelled this booking request.';

        window.dispatchEvent(new CustomEvent('workerBookingCancelled', {
          detail: { ...cancelData, requestId: cancelReqId, message: cancelMessage }
        }));
        window.dispatchEvent(new CustomEvent('workerRequestCancelled', {
          detail: { ...cancelData, requestId: cancelReqId, message: cancelMessage }
        }));
        window.dispatchEvent(new Event('workerJobsUpdated'));

        toastManager.error(cancelMessage, { duration: 6000 });
      };

      newSocket.on('worker_booking_request', handleWorkerIncoming);
      newSocket.on('new_booking_request', handleWorkerIncoming);
      newSocket.on('booking_request', handleWorkerIncoming);
      newSocket.on('group_booking_request', handleWorkerIncoming);

      // Team member gets this when leader dispatches them for a group job
      const handleTeamInvite = (data) => {
        try { playAlertRing(true); } catch (e) {}
        const requestData = data.data || data;
        const reqId = data.relatedId || requestData.requestId || requestData._id;
        window.dispatchEvent(new CustomEvent('workerIncomingBooking', {
          detail: {
            data: { ...requestData, requestType: 'TEAM_MEMBER_INVITATION', isTeamInvite: true },
            relatedId: reqId
          }
        }));
        window.dispatchEvent(new Event('workerJobsUpdated'));
      };

      newSocket.on('team_member_invitation', handleTeamInvite);
      newSocket.on('group_member_request', handleTeamInvite);

      newSocket.on('worker_booking_cancelled', handleWorkerCancellation);
      newSocket.on('worker_request_cancelled', handleWorkerCancellation);
      newSocket.on('job_cancelled', handleWorkerCancellation);
      newSocket.on('booking_cancelled', handleWorkerCancellation);

      newSocket.on('team_member_response', (data) => {
        if (data?.message) {
          toastManager.info(data.message);
        }
        window.dispatchEvent(new CustomEvent('team_member_response', { detail: data }));
        window.dispatchEvent(new Event('workerJobsUpdated'));
      });

      newSocket.on('worker_booking_update', (data) => {
        window.dispatchEvent(new Event('workerJobsUpdated'));
      });
    }

    // Listen for special Farmer / User events
    if (userType === 'user') {
      newSocket.on('team_member_status_updated', (data) => {
        if (data?.message) {
          toastManager.info(data.message);
        }
        window.dispatchEvent(new CustomEvent('team_member_status_updated', { detail: data }));
        window.dispatchEvent(new Event('userBookingsUpdated'));
      });
    }

    // Listen for special Vendor Booking Requests
    if (userType === 'vendor') {
      newSocket.on('new_booking_request', (data) => {
        try {
          // Play alert ringtone
          try {
            playAlertRing(true);
          } catch (soundErr) {
            console.warn('[SOCKET] Could not play alert ringtone:', soundErr);
          }

          // Show immediate toast banner
          toastManager.success(
            `New Booking: ${data.serviceName || 'Equipment Service'} (₹${data.price || ''})`,
            {
              duration: 8000,
              style: {
                background: '#047857',
                color: '#fff',
                fontWeight: 'bold'
              }
            }
          );

          // Save to localStorage for the Alert screen and Dashboard to read
          const newJob = {
            ...data,
            id: data.bookingId,
            serviceType: data.serviceName,
            location: {
              address: data.address?.addressLine1 || 'Location shared',
              distance: (data.distance !== undefined && data.distance !== null && !isNaN(Number(data.distance)))
                ? (Number(data.distance) < 1
                  ? `${Math.round(Number(data.distance) * 1000)} m`
                  : `${Number(data.distance).toFixed(1)} km`)
                : (data.distance || 'Near you')
            },
            timeSlot: {
              date: data.scheduledDate,
              time: data.scheduledTime
            },
            status: 'requested',
            createdAt: new Date().toISOString()
          };

          const pendingJobs = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
          if (!pendingJobs.find(job => String(job.id || job._id) === String(newJob.id))) {
            pendingJobs.unshift(newJob);
            localStorage.setItem('vendorPendingJobs', JSON.stringify(pendingJobs));

            // Update stats
            const stats = JSON.parse(localStorage.getItem('vendorStats') || '{}');
            stats.pendingAlerts = (stats.pendingAlerts || 0) + 1;
            localStorage.setItem('vendorStats', JSON.stringify(stats));
          }

          // Trigger the Vendor Dashboard Alert Context
          window.dispatchEvent(new CustomEvent('showDashboardBookingAlert', { 
            detail: newJob
          }));

          // Also dispatch vendorIncomingBooking for any popup modal listening
          window.dispatchEvent(new CustomEvent('vendorIncomingBooking', { 
            detail: {
              data: newJob,
              relatedId: newJob.id
            }
          }));

        } catch (error) {
          console.error("Error processing new_booking_request storage:", error);
        }

        // Notify app components to refresh
        window.dispatchEvent(new Event('vendorJobsUpdated'));
        window.dispatchEvent(new Event('vendorStatsUpdated'));
        window.dispatchEvent(new Event('vendorNotificationsUpdated'));
      });

      // Listen for booking_taken - when another vendor accepts a job
      newSocket.on('booking_taken', (data) => {
        const takenBookingId = String(data.bookingId);

        // Remove from localStorage
        const pendingJobs = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
        const updatedPending = pendingJobs.filter(job => {
          const jobId = String(job.id || job._id);
          return jobId !== takenBookingId;
        });
        localStorage.setItem('vendorPendingJobs', JSON.stringify(updatedPending));

        // Update stats
        const stats = JSON.parse(localStorage.getItem('vendorStats') || '{}');
        if (stats.pendingAlerts > 0) {
          stats.pendingAlerts = Math.max(0, (stats.pendingAlerts || 0) - 1);
          localStorage.setItem('vendorStats', JSON.stringify(stats));
        }

        // Show toast notification
        toastManager.error(data.message || 'Job taken by another vendor');

        // Dispatch specific remove event for instant UI update
        window.dispatchEvent(new CustomEvent('removeVendorBooking', { detail: { id: takenBookingId } }));

        // Notify app components to refresh
        window.dispatchEvent(new Event('vendorJobsUpdated'));
        window.dispatchEvent(new Event('vendorStatsUpdated'));
      });
    }

    return () => {
      newSocket.disconnect();
    };
  }, [userType, token]); // Re-run if userType or token changes. Navigate is stable.

  return (
    <SocketContext.Provider value={socket}>
      {children}

      {/* Booking Slot Reminder Alert Modal Pop-up */}
      {reminderAlert && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setReminderAlert(null)}
          />
          <div className="relative bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-gray-100 animate-slide-up">
            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                reminderAlert.type === 'booking_ending' 
                  ? 'bg-orange-50 text-orange-600 border border-orange-100' 
                  : 'bg-teal-50 text-teal-600 border border-teal-100'
              }`}>
                <FiClock className="w-8 h-8" />
              </div>
              
              <h3 className="text-lg font-black text-gray-900 mb-2 uppercase tracking-tight">
                {reminderAlert.title}
              </h3>
              <p className="text-sm text-gray-500 mb-6 font-medium leading-relaxed">
                {reminderAlert.message}
              </p>
              
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setReminderAlert(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => {
                    const bookingId = reminderAlert.relatedId;
                    setReminderAlert(null);
                    if (bookingId) {
                      if (userType === 'vendor') {
                        navigate(`/vendor/booking/${bookingId}`);
                      } else if (userType === 'worker') {
                        navigate(`/worker/job/${bookingId}`);
                      } else {
                        navigate(`/user/booking/${bookingId}`);
                      }
                    }
                  }}
                  className={`flex-1 py-3 text-white rounded-xl text-sm font-bold shadow-lg transition-all ${
                    reminderAlert.type === 'booking_ending'
                      ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/10'
                      : 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/10'
                  }`}
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </SocketContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => useContext(SocketContext);

