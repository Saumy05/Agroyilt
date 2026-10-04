import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiMapPin, FiBell } from 'react-icons/fi';
import { vendorTheme as themeColors } from '../../../../../theme';
import { toastManager } from '../../../../../utils/toastManager';
import { acceptBooking, rejectBooking } from '../../../services/bookingService';

const PendingBookings = memo(({ bookings, setPendingBookings, setActiveAlertBooking }) => {
  const navigate = useNavigate();
  const [loadingAction, setLoadingAction] = React.useState({ id: null, type: null });

  const formatScheduleText = (b) => {
    const rawDate = b.timeSlot?.date || b.scheduledDate;
    let dateStr = '';
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        } else {
          dateStr = String(rawDate);
        }
      } catch {
        dateStr = String(rawDate);
      }
    }
    const rawTime = b.timeSlot?.time || b.scheduledTime;
    let timeStr = '';
    if (rawTime) {
      const trimmed = String(rawTime).trim();
      if (/am|pm/i.test(trimmed)) {
        timeStr = trimmed;
      } else if (trimmed.includes('-') || trimmed.includes('–')) {
        const delimiter = trimmed.includes('–') ? '–' : '-';
        timeStr = trimmed.split(delimiter).map(t => {
          const parts = t.trim().split(':');
          if (parts.length >= 2) {
            const h = parseInt(parts[0], 10);
            const m = parts[1].slice(0, 2);
            if (!isNaN(h)) return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
          }
          return t.trim();
        }).join(' – ');
      } else {
        const parts = trimmed.split(':');
        if (parts.length >= 2) {
          const h = parseInt(parts[0], 10);
          const m = parts[1].slice(0, 2);
          if (!isNaN(h)) timeStr = `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
        } else {
          timeStr = trimmed;
        }
      }
    }
    if (dateStr && timeStr) return `${dateStr} • ${timeStr}`;
    return dateStr || timeStr || 'Flexible';
  };

  if (bookings.length === 0) {
    return null;
  }

  const handleAcceptBooking = async (e, booking) => {
    e.stopPropagation();
    if (loadingAction.id) return;
    setLoadingAction({ id: booking.id, type: 'accept' });
    try {
      const response = await acceptBooking(booking.id);

      if (response.success) {
        // Only remove if successful
        setPendingBookings(prev => prev.filter(b => b.id !== booking.id));

        // Sync localStorage
        const pendingJobs = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
        const updated = pendingJobs.filter(b => b.id !== booking.id);
        localStorage.setItem('vendorPendingJobs', JSON.stringify(updated));

        // Remove from everywhere immediately
        window.dispatchEvent(new CustomEvent('removeVendorBooking', { detail: { id: booking.id } }));

        // Dispatch stats update event
        window.dispatchEvent(new Event('vendorStatsUpdated'));
        toastManager.success('Booking confirmed!');
      }
    } catch (error) {
      console.error('Error accepting:', error);
      toastManager.error('Failed to accept booking');
    } finally {
      if (typeof window !== 'undefined') setLoadingAction({ id: null, type: null });
    }
  };

  const handleRejectBooking = async (e, booking) => {
    e.stopPropagation();
    if (loadingAction.id) return;
    setLoadingAction({ id: booking.id, type: 'reject' });
    try {
      const response = await rejectBooking(booking.id, 'Vendor Dashboard Reject');

      if (response.success) {
        setPendingBookings(prev => prev.filter(b => b.id !== booking.id));

        // Sync localStorage
        const pendingJobs = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
        const updated = pendingJobs.filter(b => b.id !== booking.id);
        localStorage.setItem('vendorPendingJobs', JSON.stringify(updated));

        // Remove from everywhere immediately
        window.dispatchEvent(new CustomEvent('removeVendorBooking', { detail: { id: booking.id } }));
        toastManager.success('Booking rejected');
      }
    } catch (error) {
      console.error('Error rejecting:', error);
      toastManager.error('Failed to reject booking');
    } finally {
      if (typeof window !== 'undefined') setLoadingAction({ id: null, type: null });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-gray-800">Booking Requests</h2>
        <button
          onClick={() => navigate('/vendor/booking-alerts')}
          className="text-sm font-medium"
          style={{ color: themeColors.button }}
        >
          View All
        </button>
      </div>
      <div className="space-y-3">
        {bookings.map((booking) => (
          <div
            key={booking.id}
            onClick={() => setActiveAlertBooking(booking)}
            className="bg-white rounded-xl p-4 shadow-md cursor-pointer active:scale-98 transition-transform border-l-4"
            style={{
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)',
              borderLeftColor: '#F59E0B',
              borderTop: '1px solid rgba(245, 158, 11, 0.2)',
              borderRight: '1px solid rgba(245, 158, 11, 0.2)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
            }}
          >
            <div className="flex items-start justify-between mb-2 gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">
                  {booking.serviceCategory || 'Agriculture Details'}
                </p>
                <div className="flex items-start gap-2 mb-1">
                  <p className="font-bold text-gray-800 text-sm leading-tight line-clamp-2">{booking.serviceName || booking.serviceType || 'New Order Request'}</p>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-yellow-100 text-yellow-600 uppercase tracking-widest shrink-0 mt-0.5">
                    REQ
                  </span>
                </div>
                {booking.brandName && (
                  <div className="flex items-center gap-1.5 mb-1.5 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-md w-fit">
                    {booking.brandIcon && (
                      <img src={booking.brandIcon} alt={booking.brandName} className="w-3 h-3 object-contain" />
                    )}
                    <span className="text-[10px] font-bold text-gray-700 uppercase tracking-wide">{booking.brandName}</span>
                  </div>
                )}
                <p className="text-xs text-gray-500 font-medium line-clamp-1">{booking.customerName || 'Farmer'} ? {booking.location?.address || 'Location'}</p>
              </div>
              <div className="flex flex-col items-center shrink-0">
                {booking.categoryIcon ? (
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shadow-sm flex items-center justify-center p-0.5">
                    <img src={booking.categoryIcon} className="max-w-full max-h-full object-contain" alt="Category" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                    <FiBell className="w-5 h-5 animate-pulse" style={{ color: '#F59E0B' }} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <FiClock className="w-4 h-4" />
                <span>
                  {formatScheduleText(booking)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <FiMapPin className="w-4 h-4" />
                <span>
                  {(() => {
                    const dist = booking.location?.distance || booking.distance;
                    if (!dist || dist === 'N/A') return 'N/A';
                    return String(dist).includes('km') ? dist : `${dist} km`;
                  })()}
                </span>
              </div>
              <div className="text-sm font-bold text-gray-800">
                ₹{booking.price || 0}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                disabled={!!loadingAction.id}
                onClick={(e) => handleAcceptBooking(e, booking)}
                className="flex-1 bg-green-500 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {loadingAction.id === booking.id && loadingAction.type === 'accept' ? 'Accepting...' : 'Accept'}
              </button>
              <button
                disabled={!!loadingAction.id}
                onClick={(e) => handleRejectBooking(e, booking)}
                className="flex-1 bg-red-500 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {loadingAction.id === booking.id && loadingAction.type === 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

PendingBookings.displayName = 'VendorPendingBookings';

export default PendingBookings;
