import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVendorDashboard } from '../../../../context/VendorDashboardContext';
import BookingAlertModal from './BookingAlertModal';
import { acceptBooking, rejectBooking } from '../../services/bookingService';
import { toastManager } from '../../../../utils/toastManager';

const GlobalBookingAlertModal = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeAlertBookings,
    setActiveAlertBookings,
    stats
  } = useVendorDashboard();

  // Suppress modal on public/auth routes and dedicated standalone alert routes
  const isExcludedRoute = 
    location.pathname === '/vendor/login' ||
    location.pathname === '/vendor/signup' ||
    location.pathname === '/vendor/forgot-mpin' ||
    location.pathname.startsWith('/vendor/booking-alert/');

  if (isExcludedRoute) return null;
  if (!activeAlertBookings || activeAlertBookings.length === 0) return null;

  const handleAcceptAlert = async (bookingId) => {
    // Immediately mark as ignored so local/background polling doesn't keep it open
    window.dispatchEvent(new CustomEvent('removeVendorBooking', { detail: { id: String(bookingId) } }));
    setActiveAlertBookings([]);
    try {
      await acceptBooking(bookingId);
      toastManager.success('Booking accepted successfully!');
      navigate(`/vendor/booking/${bookingId}`);
    } catch (error) {
      const status = error?.response?.status;
      if (status === 409) {
        toastManager.error('This job was already accepted by another vendor.');
      } else {
        toastManager.error(error?.response?.data?.message || 'Failed to accept booking');
      }
    } finally {
      window.dispatchEvent(new Event('vendorStatsUpdated'));
      window.dispatchEvent(new Event('vendorJobsUpdated'));
    }
  };

  const handleRejectAlert = async (bookingId) => {
    // Immediately mark as ignored so local/background polling doesn't keep it open
    window.dispatchEvent(new CustomEvent('removeVendorBooking', { detail: { id: String(bookingId) } }));
    try {
      const result = await rejectBooking(bookingId);
      if (result?.alreadyTaken) {
        toastManager.error('This job was already accepted by another vendor.');
      } else {
        toastManager.success('Booking declined');
      }
    } catch (error) {
      console.error('Reject booking error (modal already closed):', error);
    } finally {
      window.dispatchEvent(new Event('vendorStatsUpdated'));
      window.dispatchEvent(new Event('vendorJobsUpdated'));
    }
  };

  const handleAssignAlert = (bookingId) => {
    setActiveAlertBookings([]);
    navigate(`/vendor/booking/${bookingId}`);
  };

  return (
    <BookingAlertModal 
      isOpen={activeAlertBookings && activeAlertBookings.length > 0}
      bookings={activeAlertBookings}
      onAccept={handleAcceptAlert}
      onReject={handleRejectAlert}
      onAssign={handleAssignAlert}
      onMinimize={() => setActiveAlertBookings([])}
      servicePayoutPct={stats?.servicePayoutPercentage || 70}
    />
  );
};

export default GlobalBookingAlertModal;
