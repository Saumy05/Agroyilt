import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { acceptBooking, rejectBooking } from '../../services/bookingService';
import BookingAlertModal from '../../components/bookings/BookingAlertModal';
import { toastManager } from '../../../../utils/toastManager';
import { useSocket } from '../../../../context/SocketContext'; // Import socket context

const BookingAlert = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const socket = useSocket(); // Use shared socket
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBooking = () => {
      try {
        const pendingJobs = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
        let foundBooking = pendingJobs.find(job => String(job.id || job._id) === String(id));

        if (!foundBooking) {
          // If not found in any local lists, it's likely already processed
          // Redirect to dashboard instead of showing fallback alert
          navigate('/vendor/dashboard', { replace: true });
          return;
        }
        setBooking(foundBooking);
      } catch (error) {
        console.error('Error loading booking:', error);
        navigate('/vendor/dashboard', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    loadBooking();
  }, [id]);

  // Listen for booking_taken event specifically for this booking
  useEffect(() => {
    if (!socket) return;

    const handleBookingTaken = (data) => {
      if (String(data.bookingId) === String(id)) {
        toastManager.error('This booking was just accepted by another vendor.', { icon: '⚡', id: `booking_taken:${data.bookingId}` });
        navigate('/vendor/dashboard', { replace: true }); // Close modal immediately
      }
    };

    socket.on('booking_taken', handleBookingTaken);

    return () => {
      socket.off('booking_taken', handleBookingTaken);
    };
  }, [socket, id, navigate]);

  const handleAccept = async () => {
    try {
      await acceptBooking(id);

      // Update local storage states
      const pendingJobs = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
      const updatedPending = pendingJobs.filter(job => job.id !== id && job._id !== id);
      localStorage.setItem('vendorPendingJobs', JSON.stringify(updatedPending));

      window.dispatchEvent(new Event('vendorJobsUpdated'));
      toastManager.success('Booking accepted successfully!');
      navigate(`/vendor/booking/${id}`, { replace: true });
    } catch (error) {
      console.error('Error accepting:', error);
      const status = error?.response?.status;
      // Always clear from local pending list and navigate back
      const pendingJobs = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
      const updatedPending = pendingJobs.filter(job => job.id !== id && job._id !== id);
      localStorage.setItem('vendorPendingJobs', JSON.stringify(updatedPending));
      window.dispatchEvent(new Event('vendorJobsUpdated'));
      if (status === 409) {
        toastManager.error('This job was already accepted by another vendor.');
      } else {
        toastManager.error('Failed to accept booking. It may have expired.');
      }
      navigate('/vendor/dashboard', { replace: true });
    }
  };

  const handleReject = async () => {
    // Always clear from local pending list first
    const pendingJobs = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
    const updated = pendingJobs.filter(job => job.id !== id && job._id !== id);
    localStorage.setItem('vendorPendingJobs', JSON.stringify(updated));
    window.dispatchEvent(new Event('vendorJobsUpdated'));

    try {
      const result = await rejectBooking(id, 'Vendor rejected');
      if (result?.alreadyTaken) {
        toastManager.error('This job was already accepted by another vendor.');
      } else {
        toastManager.success('Booking declined');
      }
    } catch (error) {
      console.error('Error rejecting:', error);
      // Silently navigate — booking is already cleared from local list
    } finally {
      navigate('/vendor/dashboard', { replace: true });
    }
  };

  const handleAssign = async () => {
    try {
      await acceptBooking(id);

      // Update local storage states
      const pendingJobs = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
      const updatedPending = pendingJobs.filter(job => job.id !== id);
      localStorage.setItem('vendorPendingJobs', JSON.stringify(updatedPending));

      window.dispatchEvent(new Event('vendorJobsUpdated'));
      toastManager.success('Booking accepted! Redirecting to assign operator...');
      navigate(`/vendor/booking/${id}/assign-worker`, { replace: true });
    } catch (error) {
      console.error('Error accepting:', error);
      toastManager.error('Failed to accept booking.');
      navigate('/vendor/dashboard', { replace: true });
    }
  };

  if (loading) return null;

  return (
    <BookingAlertModal
      isOpen={true}
      booking={booking}
      onAccept={handleAccept}
      onAssign={handleAssign}
      onReject={handleReject}
      onMinimize={() => navigate('/vendor/dashboard', { replace: true })}
    />
  );
};

export default BookingAlert;



