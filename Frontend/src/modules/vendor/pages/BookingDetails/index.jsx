import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiMapPin, FiClock, FiDollarSign, FiUser, FiPhone, FiNavigation, FiArrowRight, FiEdit, FiCheckCircle, FiCreditCard, FiX, FiCheck, FiTool, FiXCircle, FiAward, FiPackage, FiAlertCircle, FiDownload, FiAlertTriangle, FiLoader, FiKey, FiCalendar, FiCompass } from 'react-icons/fi';
import { FaSeedling } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import {
  getBookingById,
  updateBookingStatus,
  startSelfJob,
  vendorReached,
  verifySelfVisit,
  completeSelfJob,
  startTrip,
  endTrip,
  machineryStartWork,
  machineryCompleteWork,
  acceptBooking,
  rejectBooking
} from '../../services/bookingService';
import vendorBillService from '../../../../services/vendorBillService';
import { CashCollectionModal, ConfirmDialog, OperatorPaymentModal } from '../../components/common';
import VisitVerificationModal from '../../components/common/VisitVerificationModal';
// Import shared WorkCompletionModal from worker directory or move to shared
import { WorkCompletionModal } from '../../../worker/components/common';
// import BillingModal from '../../components/bookings/BillingModal'; // Consumed by page now
import vendorWalletService from '../../../../services/vendorWalletService';
import { toastManager } from '../../../../utils/toastManager';
import { useAppNotifications } from '../../../../hooks/useAppNotifications';
import { useLocationTracking } from '../../../../hooks/useLocationTracking';
import TripFlowModal from '../../components/common/TripFlowModal';
import LiveServiceTimer from '../../../../components/common/LiveServiceTimer';
import DisputeModal from '../../../../components/common/DisputeModal'; // NEW
import disputeService from '../../../../services/disputeService'; // NEW
import LogoLoader from '../../../../components/common/LogoLoader'; // NEW
import flutterBridge from '../../../../utils/flutterBridge';
import authStorage from '../../../../utils/authStorage';
import { configService } from '../../../../services/configService'; // For commission %


const getScheduledDateTime = (b) => {
  if (!b?.scheduledDate || !b?.scheduledTime) return null;
  try {
    const datePart = new Date(b.scheduledDate).toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = b.scheduledTime;
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);
    if (hours === 12) {
      hours = 0;
    }
    if (modifier === 'PM') {
      hours += 12;
    }
    return new Date(`${datePart}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
  } catch (e) {
    console.error('Error parsing scheduled date time:', e);
    return null;
  }
};

const isJourneyTooEarly = (b) => {
  const scheduledDateTime = getScheduledDateTime(b);
  if (!scheduledDateTime) return false;
  const current = new Date();
  // 2 hours in ms = 7200000
  const difference = scheduledDateTime.getTime() - current.getTime();
  return difference > 7200000;
};

const BookingCountdown = ({ booking }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const scheduledDateTime = getScheduledDateTime(booking);
    if (!scheduledDateTime) return;

    const updateTime = () => {
      const diff = scheduledDateTime.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('');
        return;
      }
      
      const totalMins = Math.floor(diff / 60000);
      const mins = totalMins % 60;
      const totalHours = Math.floor(totalMins / 60);
      const hours = totalHours % 24;
      const days = Math.floor(totalHours / 24);

      let timeStr = 'Scheduled in ';
      if (days > 0) timeStr += `${days}d `;
      if (hours > 0) timeStr += `${hours}h `;
      timeStr += `${mins}m`;
      setTimeLeft(timeStr);
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [booking]);

  if (!timeLeft) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-bold">
      <FiClock className="w-3 h-3 text-blue-600" />
      <span>{timeLeft}</span>
    </div>
  );
};

export default function BookingDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isPayWorkerModalOpen, setIsPayWorkerModalOpen] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [isWorkDoneModalOpen, setIsWorkDoneModalOpen] = useState(false);


  const [actionLoading, setActionLoading] = useState(false);
  // ──────── TRIP FLOW STATE (New - agriculture feature) ────────
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false); // NEW
  const [tripMode, setTripMode] = useState('start'); // 'start' | 'end'
  const [bookingCommissionPct, setBookingCommissionPct] = useState(10); // Commission % from settings
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashModalMode, setCashModalMode] = useState('qr');
  // ─────────────────────────────────────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    type: 'warning'
  });

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient;

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  useEffect(() => {
    // Load booking from localStorage (mock data)
    // Load booking from API
    const loadBooking = async () => {
      try {
        setLoading(true);
        let billData = null;

        const [bookingRes, billRes] = await Promise.all([
          getBookingById(id),
          vendorBillService.getBill(id).catch(() => ({ success: false }))
        ]);

        const apiData = bookingRes.data || bookingRes;
        if (billRes && billRes.success) {
          billData = billRes.bill;
        }

        // Map API response to Component State structure
        const mappedBooking = {
          ...apiData,
          bill: billData || apiData.bill, // Prioritize fetched bill
          id: apiData._id || apiData.id,
          user: apiData.userId || apiData.user || { name: apiData.customerName || 'Farmer', phone: apiData.customerPhone || 'Hidden' },
          customerName: apiData.userId?.name || apiData.customerName || 'Farmer',
          customerPhone: apiData.userId?.phone || apiData.customerPhone || 'Hidden',
          serviceType: apiData.serviceId?.title || apiData.serviceName || apiData.serviceType || 'Service',
          items: apiData.bookedItems || [],
          location: {
            address: (() => {
              const a = apiData.address;
              if (!a) return 'Address not available';
              if (typeof a === 'string') return a;
              return `${a.addressLine2 ? a.addressLine2 + ', ' : ''}${a.addressLine1 || ''}, ${a.city || ''}`;
            })(),
            lat: apiData.address?.lat || 0,
            lng: apiData.address?.lng || 0,
            distance: apiData.distance ? `${apiData.distance.toFixed(1)} km` : 'N/A'
          },
          // Price Breakdown
          basePrice: parseFloat(apiData.basePrice || 0),
          tax: parseFloat(apiData.tax || (apiData.paymentMethod === 'plan_benefit' ? (apiData.basePrice || 0) * 0.18 : 0)),
          visitingCharges: parseFloat(apiData.visitingCharges || apiData.visitationFee || (apiData.paymentMethod === 'plan_benefit' ? 49 : 0)),
          discount: parseFloat(apiData.discount || 0),
          platformCommission: parseFloat(apiData.adminCommission || apiData.platformFee || apiData.commission || 0),
          finalAmount: parseFloat(apiData.finalAmount || 0),
          vendorEarnings: parseFloat(
            billData?.vendorTotalEarning ||
            apiData.vendorEarnings ||
            (apiData.paymentMethod === 'plan_benefit'
              ? (Number(apiData.basePrice || 0) * 0.7) // Fallback: 70% share from base
              : (apiData.finalAmount ? apiData.finalAmount - (apiData.commission || 0) : 0)
            )
          ),

          // Display Price (Vendor Earnings by default as requested)
          price: (apiData.vendorEarnings || (apiData.finalAmount ? apiData.finalAmount - (apiData.commission || 0) : 0)).toFixed(2),

          timeSlot: {
            date: apiData.scheduledDate ? new Date(apiData.scheduledDate).toLocaleDateString() : 'Today',
            time: apiData.scheduledTime || apiData.timeSlot?.start ? `${apiData.timeSlot?.start} - ${apiData.timeSlot?.end}` : 'Flexible'
          },
          status: apiData.status,
          description: apiData.description || apiData.notes || 'No description provided',
          assignedTo: apiData.workerId ? { name: apiData.workerId.name } : (apiData.assignedAt ? { name: 'You (Self)' } : null),
          workerResponse: apiData.workerResponse,
          workerResponseAt: apiData.workerResponseAt,
          paymentMethod: apiData.paymentMethod,
          paymentStatus: apiData.paymentStatus,
          cashCollected: apiData.cashCollected || false,
          categoryId: apiData.categoryId, // Store whole object for trackingType/requiresDriver
          // Rental details
          rental_type: apiData.rental_type,
          estimatedDuration: apiData.estimatedDuration,
          landSize: apiData.landSize,
          cropType: apiData.cropType,
          endDate: apiData.endDate,
          scheduledDate: apiData.scheduledDate,
        };

        setBooking(mappedBooking);
      } catch (error) {
        // Error loading booking
      } finally {
        setLoading(false);
      }
    };

    loadBooking();

    // Load commission % from global settings
    configService.getSettings().then(res => {
      if (res?.settings?.bookingCommissionPercentage !== undefined) {
        setBookingCommissionPct(res.settings.bookingCommissionPercentage);
      }
    }).catch(() => {});
    window.addEventListener('vendorJobsUpdated', loadBooking);

    return () => {
      window.removeEventListener('vendorJobsUpdated', loadBooking);
    };
  }, [id]);

  const refreshBooking = async () => {
    try {
      const res = await getBookingById(id);
      const apiData = res.data || res;
      if (apiData) {
        setBooking(prev => ({ ...prev, ...apiData }));
      }
    } catch (e) {
      console.warn('Failed to refresh booking:', e);
    }
  };


  // ADDED: Socket for Live Location Tracking in Details Page
  const socket = useAppNotifications('vendor'); // Get socket

  // Optimized Live Location Tracking with distance filter and heading
  const isTrackingActive =
    booking?.status === 'journey_started' ||
    booking?.status === 'visited' ||
    booking?.status === 'in_progress'; // Active during work/trip too for transparency

  useLocationTracking(socket, id, isTrackingActive, {
    distanceFilter: 10, // Only emit when moved 10+ meters
    interval: 3000,     // Minimum 3s between emissions
    enableHighAccuracy: true
  });

  // Listen for Real-Time Booking Updates (e.g. Online Payment)
  useEffect(() => {
    if (socket && id) {
      const handleBookingUpdate = (data) => {
        // Check if update is for this booking
        if (data.bookingId === id || data.relatedId === id || data._id === id) {

          // Update local state to trigger effects immediately
          setBooking(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              ...data, // Merge updates
              status: data.status || prev.status,
              paymentStatus: data.paymentStatus || prev.paymentStatus
            };
          });

          // Also trigger a full reload to be safe/sync
          window.dispatchEvent(new Event('vendorJobsUpdated'));

          // Check if this update is a payment success, if so, trigger reload for fresh state
          const isPaymentSuccess =
            data.paymentStatus === 'SUCCESS' ||
            data.paymentStatus === 'paid' ||
            data.type === 'payment_success';

          if (isPaymentSuccess) {
            toastManager.success('Online Payment Received!', { id: `payment_success:${id}` });
            setTimeout(() => window.location.reload(), 1500);
          }
        }
      };

      socket.on('booking_updated', handleBookingUpdate);
      socket.on('payment_success', handleBookingUpdate);

      return () => {
        socket.off('booking_updated', handleBookingUpdate);
        socket.off('payment_success', handleBookingUpdate);
      };
    }
  }, [socket, id]);

  const getAvailableStatuses = (currentStatus, booking) => {
    // Check payment status
    const workerPaymentDone = booking?.workerPaymentStatus === 'PAID';
    const finalSettlementDone = booking?.finalSettlementStatus === 'DONE';
    const isSelfJob = booking?.assignedTo?.name === 'You (Self)';

    const statusFlow = {
      'confirmed': ['assigned', 'visited', 'journey_started'],
      'assigned': ['visited', 'journey_started'],
      'journey_started': ['visited'],
      'visited': ['in_progress', 'work_done'],
      'in_progress': ['work_done'],
      'work_done': ['completed', 'final_settlement'],
      'final_settlement': ['completed'],
      'completed': [],
    };
    return statusFlow[currentStatus] || [];
  };

  const canPayWorker = (booking) => {
    // If assigned to self, no worker payment needed
    if (booking?.assignedTo?.name === 'You (Self)') return false;

    // Allow payment ONLY if booking is completed (Vendor Approved)
    const validStatus = booking?.status === 'completed';
    return validStatus && booking?.workerPaymentStatus !== 'PAID';
  };

  const canDoFinalSettlement = (booking) => {
    // Check if payment is already done (Online SUCCESS or Cash COLLECTED)
    // Robust check for various status strings (case-insensitive)
    const pStatus = booking?.paymentStatus?.toLowerCase() || '';
    const isPaid = pStatus === 'success' || pStatus === 'paid' || booking?.cashCollected;

    const status = booking?.status?.toLowerCase() || '';
    const isWorkDone = status === 'work_done' || status === 'completed' || status === 'worker_paid';

    // Simplified logic: Show button if work is done & customer paid, 
    // regardless of whether worker is marked as paid yet.
    return isWorkDone && isPaid && booking?.finalSettlementStatus !== 'DONE';
  };

  const handleStatusChange = async (newStatus) => {
    if (!booking) return;

    const availableStatuses = getAvailableStatuses(booking.status, booking);
    if (!availableStatuses.includes(newStatus)) {
      toastManager.error(`Cannot change status from ${booking.status} to ${newStatus}. Please follow the proper flow.`);
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Update Status',
      message: `Are you sure you want to change status to ${newStatus.replace('_', ' ')}?`,
      type: 'info',
      onConfirm: async () => {
        setLoading(true);
        try {
          await updateBookingStatus(id, newStatus);
          window.dispatchEvent(new Event('vendorJobsUpdated'));
          toastManager.success(`Status updated to ${newStatus.replace('_', ' ')} successfully!`);
          window.location.reload();
        } catch (error) {
          console.error('Error updating status:', error);
          toastManager.error('Failed to update status. Please try again.');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handlePayWorkerClick = () => {
    setIsPayWorkerModalOpen(true);
  };

  const handlePayWorkerSubmit = async (payoutData) => {
    const { amount, notes, transactionId, screenshot, paymentMethod } = payoutData;

    try {
      setPaySubmitting(true);
      const res = await vendorWalletService.payWorker(
        booking.id || booking._id,
        amount,
        notes,
        transactionId,
        screenshot,
        paymentMethod
      );

      if (res.success) {
        toastManager.success(res.message || 'Payment recorded successfully');
        setIsPayWorkerModalOpen(false);
        // Refresh booking data
        window.location.reload();
      } else {
        toastManager.error(res.message || 'Failed to record payment');
      }
    } catch (error) {
      toastManager.error('Failed to process payment');
    } finally {
      setPaySubmitting(false);
    }
  };

  const handleFinalSettlement = async () => {
    if (!booking) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Final Settlement',
      message: 'Mark final settlement as done? This will allow you to complete the booking.',
      type: 'warning',
      onConfirm: async () => {
        setLoading(true);
        try {
          await updateBookingStatus(id, booking.status, {
            finalSettlementStatus: 'DONE'
          });
          window.dispatchEvent(new Event('vendorJobsUpdated'));
          toastManager.success('Final settlement marked as done!');
          window.location.reload();
        } catch (error) {
          console.error('Error updating settlement:', error);
          toastManager.error('Failed to update settlement. Please try again.');
        } finally {
          setLoading(false);
        }
      }
    });
  };



  // Handle cash collection button click
  const handleCollectCashClick = () => {
    // Navigate to the full page billing flow
    navigate(`/vendor/booking/${booking.id || id}/billing`);
  };

  const canCollectCash = (booking) => {
    // Hide if already collected or paid online
    if (booking?.cashCollected || booking?.paymentStatus === 'collected_by_vendor') {
      return false;
    }

    // Cash can be collected when booking is completed/work_done and payment was cash/at home
    const isSelfJob = booking?.assignedTo?.name === 'You (Self)';
    const validStatus = isSelfJob
      ? (booking?.status === 'work_done' || booking?.status === 'completed')
      : booking?.status === 'completed';

    if (!validStatus) return false;
    
    // If online payment and bill is already generated, hide the button (no OTP required)
    if (booking?.vendorBillId && booking?.paymentMethod !== 'cash' && booking?.paymentMethod !== 'pay_at_home' && booking?.paymentMethod !== 'plan_benefit') {
      return false;
    }

    // CRITICAL FIX: Allow bill preparation for Plan Benefit bookings
    // Even if base is pre-paid (SUCCESS), vendor must generate final bill (for extras etc.)
    if (booking?.paymentMethod === 'plan_benefit') {
      return true;
    }

    if (booking?.paymentStatus === 'SUCCESS' || booking?.paymentStatus === 'paid') {
      return false;
    }

    // IMPORTANT: Only for Cash/Pay at Home methods.
    return (booking?.paymentMethod === 'cash' || booking?.paymentMethod === 'pay_at_home');
  };



  const handleDownloadInvoice = async () => {
    try {
      setActionLoading(true);
      const token = authStorage.getAccessToken('vendor');
      const url = `${import.meta.env.VITE_API_BASE_URL}/vendors/bookings/${id}/bill/download?token=${token}`;
      const fileName = `Invoice_${booking.bookingNumber}.pdf`;
      
      const result = await flutterBridge.downloadFile(url, fileName);
      if (result && result.success) {
        toastManager.success('Download started...');
      }
    } catch (error) {
      console.error('Download error:', error);
      toastManager.error('Failed to download invoice');
    } finally {
      setActionLoading(false);
    }
  };

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: themeColors.backgroundGradient }}>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  const handleCallUser = () => {
    const phone = booking.user?.phone || booking.customerPhone;
    if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      toastManager.error('Phone number not available');
    }
  };

  const handleAccept = async () => {
    try {
      setActionLoading(true);
      await acceptBooking(id);
      toastManager.success('Booking accepted successfully!');
      // Reload booking
      const res = await getBookingById(id);
      if (res.success) setBooking(res.data);
    } catch (err) {
      toastManager.error('Failed to accept booking');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setActionLoading(true);
      await rejectBooking(id, 'Vendor rejected from details page');
      toastManager.success('Booking rejected');
      navigate('/vendor/dashboard');
    } catch (err) {
      toastManager.error('Failed to reject booking');
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewTimeline = () => {
    flutterBridge.navigateTo(`/vendor/booking/${booking.id}/timeline`, navigate);
  };


  // Worker assignment removed — Workers are independent users, not Vendor-managed

  const handleStartJourney = async () => {
    const executeStart = async () => {
      // If self-job or worker assigned, call the start API first
      if (booking.assignedTo?.name === 'You (Self)' || booking.workerId) {
        try {
          setLoading(true);
          await startSelfJob(id);
          toastManager.success('Journey Started');
          // Refresh to update status
          const response = await getBookingById(id);
          const apiData = response.data || response;
          setBooking(prev => ({ ...prev, status: apiData.status }));
        } catch (error) {
          console.error('Error starting self journey:', error);
          toastManager.error('Failed to start journey');
          return;
        } finally {
          setLoading(false);
        }
      }

      navigate(`/vendor/booking/${booking.id || id}/map`);
    };

    if (isJourneyTooEarly(booking)) {
      setConfirmDialog({
        isOpen: true,
        title: 'Start Journey Early?',
        message: `This booking is scheduled for ${booking.scheduledTime} on ${new Date(booking.scheduledDate).toLocaleDateString()}. Are you sure you want to start the journey now?`,
        type: 'warning',
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          executeStart();
        }
      });
    } else {
      executeStart();
    }
  };

  // ──────── TRIP FLOW HANDLERS (New - agriculture feature) ────────
  const openTripModal = (mode) => {
    setTripMode(mode);
    setIsTripModalOpen(true);
  };

  const handleTripSubmit = async (photoUrl, otp, workUnits, evidencePhoto) => {
    // Detect if this is a machinery/equipment booking
    const isMachinery = !!(booking?.rental_type ||
      ['equipment', 'machinery', 'tractor', 'agriculture'].some(cat =>
        (booking?.serviceCategory || booking?.serviceType || '').toLowerCase().includes(cat)
      )
    );

    if (tripMode === 'start') {
      if (isMachinery) {
        // Machinery: vendor enters farmer's Start OTP + KM photo
        await machineryStartWork(id, otp, photoUrl);
        toastManager.success('🚜 Trip Started! OTP verified, work has begun.');
      } else {
        await startTrip(id, photoUrl, otp);
        toastManager.success('🚜 Trip Started! KM Photo & OTP verified.');
      }
    } else {
      if (isMachinery) {
        // Machinery end: only KM photo needed — system auto-generates End OTP for farmer
        await machineryCompleteWork(id, photoUrl, workUnits, evidencePhoto);
        toastManager.success('🏁 Work Completed! End OTP has been sent to the farmer.');
      } else {
        await endTrip(id, photoUrl, otp, workUnits, evidencePhoto);
        toastManager.success('🏁 Trip Ended! Bill Generated & Wallet Settled.');
      }
    }
    window.location.reload();
  };
  // ──────────────────────────────────────────────────────────────





  const handleCompleteWork = async (photos) => {
    try {
      setActionLoading(true);
      await completeSelfJob(id, { workPhotos: photos || [] });
      toastManager.success('Work marked done');
      setIsWorkDoneModalOpen(false);
      window.location.reload();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to complete job');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveWork = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Approve Work',
      message: 'Approve the work done by the operator? This will mark the job as completed and enable payout.',
      type: 'success',
      onConfirm: async () => {
        setLoading(true);
        try {
          await updateBookingStatus(id, 'completed');
          window.dispatchEvent(new Event('vendorJobsUpdated'));
          toastManager.success('Work Approved! You can now pay the operator.');
          window.location.reload();
        } catch (error) {
          console.error('Error approving work:', error);
          toastManager.error('Failed to approve work');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // --- Payment Breakdown Calculations ---
  // Default values from booking (fallback)
  const isPlanBenefit = booking?.paymentMethod === 'plan_benefit';
  const bill = booking?.bill;

  // Base Logic (Services)
  // Use bill.originalServiceBase if available, else fallback to totalServiceBase (for older bookings), else booking.basePrice
  const originalBase = bill 
    ? (bill.originalServiceBase || bill.totalServiceBase || 0) 
    : (parseFloat(booking?.basePrice) || 0);

  // Extra Services & Parts from vendor bill (if available)
  const allBillServices = bill?.services || [];
  const services = allBillServices.filter(s => !s.isOriginal);
  const originalServiceFromBill = allBillServices.find(s => s.isOriginal);
  const parts = bill?.parts || [];
  const customItems = bill?.customItems || [];

  let extraServiceBase = 0;
  let extraServiceGST = 0;
  services.forEach(s => {
    const qty = parseFloat(s.quantity) || 1;
    const base = (parseFloat(s.price) || 0) * qty;
    const gst = parseFloat(s.gstAmount) || 0;
    extraServiceBase += base;
    extraServiceGST += gst;
  });

  let partsBase = 0;
  let partsGST = 0;
  parts.forEach(p => {
    const qty = parseFloat(p.quantity) || 1;
    partsBase += ((parseFloat(p.price) || 0) * qty);
    partsGST += (parseFloat(p.gstAmount) || 0);
  });
  customItems.forEach(c => {
    const qty = parseFloat(c.quantity) || 1;
    partsBase += ((parseFloat(c.price) || 0) * qty);
    partsGST += (parseFloat(c.gstAmount) || 0);
  });

  // Tax Logic
  // Use bill.originalGST if available, else fallback to totalGST
  const originalGST = bill ? (bill.originalGST || bill.totalGST || 0) : (originalBase * 0.18);
  const totalGST = originalGST + extraServiceGST + partsGST;

  // Final Total from bill or booking
  const finalTotal = bill?.grandTotal || (booking?.finalAmount || 0);
  const hasBill = !!bill;

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Booking Details" />

      <main className="px-4 py-6">
        {/* Service Type Card */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Service Type</p>
              <p className="text-xl font-bold" style={{ color: themeColors.button }}>
                {booking.serviceType}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div
                className="px-3 py-1 rounded-full text-sm font-semibold"
                style={{
                  background: `${themeColors.button}15`,
                  color: themeColors.button,
                }}
              >
                {booking.status}
              </div>
              {booking.assignedTo?.name === 'You (Self)' && (
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md border border-green-100 uppercase tracking-wider">
                  Personal Job
                </span>
              )}
            </div>
          </div>

          {/* Agriculture Specific / Drone Details */}
          {(booking.landSize || booking.cropType || booking.chemicalUsed) && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-3">
              {booking.landSize && (
                <div className="bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-2">
                  <span className="text-[11px] text-emerald-600 font-bold uppercase tracking-wider">Area:</span>
                  <span className="text-sm font-black text-emerald-800">{booking.landSize}</span>
                </div>
              )}
              {booking.cropType && (
                <div className="bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 flex items-center gap-2">
                  <span className="text-[11px] text-amber-600 font-bold uppercase tracking-wider">Crop:</span>
                  <span className="text-sm font-black text-amber-800">{booking.cropType}</span>
                </div>
              )}
              {booking.chemicalUsed && (
                <div className="bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center gap-2">
                  <span className="text-[11px] text-blue-600 font-bold uppercase tracking-wider">Chemical:</span>
                  <span className="text-sm font-black text-blue-800">{booking.chemicalUsed}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Info Card */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${themeColors.icon}15` }}
              >
                <FiUser className="w-6 h-6" style={{ color: themeColors.icon }} />
              </div>
              <div>
                <p className="font-semibold text-gray-800">{booking.user?.name || booking.customerName || 'Farmer'}</p>
                <p className="text-sm text-gray-600">{booking.user?.phone || booking.customerPhone || 'Phone hidden'}</p>
              </div>
            </div>
            <button
              onClick={handleCallUser}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              style={{ backgroundColor: `${themeColors.button}15` }}
            >
              <FiPhone className="w-5 h-5" style={{ color: themeColors.button }} />
            </button>
          </div>
        </div>

        {/* Address Card with Map */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-start gap-3 mb-3">
            <FiMapPin className="w-5 h-5 mt-0.5" style={{ color: themeColors.icon }} />
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-1">Address</p>
              <p className="font-semibold text-gray-800">{booking.location.address}</p>
              <p className="text-sm text-gray-500 mt-1">{booking.location.distance} away</p>
            </div>
          </div>

          {/* Map Embed */}
          <div className="w-full h-48 rounded-lg overflow-hidden mb-3 bg-gray-200 relative group cursor-pointer" onClick={() => navigate(`/vendor/booking/${booking.id}/map`)}>
            {(() => {
              const hasCoordinates = booking.location.lat && booking.location.lng && booking.location.lat !== 0 && booking.location.lng !== 0;
              const mapQuery = hasCoordinates
                ? `${booking.location.lat},${booking.location.lng}`
                : encodeURIComponent(booking.location.address);

              return (
                <>
                  <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0, pointerEvents: 'none' }}
                    src={`https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`}
                    allowFullScreen
                    tabIndex="-1"
                  ></iframe>
                  {/* Overlay to intercept clicks */}
                  <div className="absolute inset-0 bg-transparent group-hover:bg-black/5 transition-colors flex items-center justify-center">
                    <span className="bg-white/90 px-3 py-1 rounded-full text-xs font-medium text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      View Full Map
                    </span>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => navigate(`/vendor/booking/${booking.id || id}/map`)}
              className="flex-1 py-3.5 rounded-xl font-bold border-2 flex items-center justify-center gap-2 transition-all active:scale-95 bg-white"
              style={{
                borderColor: themeColors.button,
                color: themeColors.button,
              }}
            >
              <FiMapPin className="w-5 h-5" />
              View Map
            </button>
            <button
              onClick={() => {
                const hasCoords = booking.location.lat && booking.location.lng;
                const dest = hasCoords
                  ? `${booking.location.lat},${booking.location.lng}`
                  : encodeURIComponent(booking.location.address);
                // Open directly to trigger app intent
                window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
              }}
              className="flex-1 py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-200"
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
              }}
            >
              <FiNavigation className="w-5 h-5" />
              Get Directions
            </button>
          </div>
        </div>

        {/* Service Description */}
        {/* Service Description */}
        {(() => {
          const genericDesc = 'No description provided';
          const mainDesc = booking.description === genericDesc ? null : booking.description;
          const serviceDesc = booking.serviceId?.description;
          const itemDesc = booking.items?.[0]?.card?.description;

          const displayDesc = mainDesc || serviceDesc || itemDesc;

          if (!displayDesc) return null;

          return (
            <div
              className="bg-white rounded-xl p-4 mb-4 shadow-md"
              style={{
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}
            >
              <p className="text-sm text-gray-600 mb-2">Service Description</p>
              <p className="text-gray-800">{displayDesc}</p>
            </div>
          );
        })()}

        {/* Booked Items Details */}
        {booking.items && booking.items.length > 0 && (
          <div
            className="bg-white rounded-xl p-4 mb-4 shadow-md"
            style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}
          >
            <p className="text-sm font-bold text-gray-700 mb-4">Order Summary</p>

            {/* Service Category & Request Configuration */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ backgroundColor: `${themeColors.button}15`, border: `1px solid ${themeColors.button}25` }}>
                  {booking.categoryIcon ? (
                    <img src={booking.categoryIcon} alt="" className="w-5 h-5 object-contain" />
                  ) : (
                    <FiTool className="w-4 h-4" style={{ color: themeColors.button }} />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</p>
                  <p className="text-sm font-bold text-gray-800">{booking.serviceCategory || booking.serviceType || 'Service'}</p>
                </div>
              </div>

              {/* Request Type (Agri Specific) */}
              {(booking.rental_type || booking.landSize || booking.estimatedDuration) && (
                <div className="flex items-center gap-2 border-l border-dashed border-gray-200 pl-3">
                  <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100">
                    <FiClock className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Request</p>
                    <p className="text-sm font-bold text-orange-700 capitalize">
                      {booking.rental_type?.replace('_', ' ') || 'Usage'} : {booking.rental_type === 'land_based' ? `${booking.landSize || 0}${typeof booking.landSize === 'string' && booking.landSize.match(/[a-zA-Z]/) ? '' : ' Acres'}` : `${booking.estimatedDuration || 0} Hrs`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Brand */}
            {(() => {
              const brandName = booking.brandName || booking.items?.[0]?.brandName;
              const brandIcon = booking.brandIcon || booking.items?.[0]?.brandIcon;
              if (!brandName) return null;
              return (
                <div className="flex items-center gap-3 mb-3 pt-3 border-t border-dashed border-gray-100">
                  <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                    {brandIcon ? (
                      <img src={brandIcon} alt={brandName} className="w-6 h-6 object-contain" />
                    ) : (
                      <span className="text-base font-black text-slate-400">{brandName.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brand</p>
                    <p className="text-sm font-bold text-gray-800">{brandName}</p>
                  </div>
                </div>
              );
            })()}

            {/* Service Cards */}
            <div className="pt-3 border-t border-dashed border-gray-100 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Services</p>
              {booking.items.map((item, index) => (
                <div key={index} className="flex justify-between items-start bg-gray-50 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded border"
                        style={{ color: themeColors.button, backgroundColor: `${themeColors.button}10`, borderColor: `${themeColors.button}25` }}>
                        ×{item.quantity}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 truncate">{item.card?.title || 'Service Item'}</span>
                    </div>
                    {item.card?.subtitle && <p className="text-xs text-gray-400 mt-0.5 ml-8 line-clamp-1">{item.card.subtitle}</p>}
                    {item.card?.duration && <p className="text-xs text-gray-400 mt-0.5 ml-8">⏱ {item.card.duration}</p>}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="text-sm font-bold text-gray-900">₹{((item.card?.price || 0) * (item.quantity || 1)).toLocaleString()}</p>
                    {item.quantity > 1 && <p className="text-xs text-gray-400">₹{item.card?.price || 0} each</p>}
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t border-gray-100 mt-1">
                <p className="text-sm font-semibold text-gray-700">Total Base Price</p>
                <p className="text-base font-bold" style={{ color: themeColors.button }}>₹{(booking.basePrice || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Time Slot */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-start gap-3">
            <FiClock className="w-5 h-5 mt-0.5" style={{ color: themeColors.icon }} />
            <div className="flex-1">
              <p className="text-sm text-gray-600">Preferred Time</p>
              <p className="font-semibold text-gray-800">{booking.timeSlot.date}</p>
              <p className="text-sm text-gray-600">{booking.timeSlot.time}</p>

              {/* Rental Details */}
              {booking.rental_type && booking.rental_type !== 'hourly' && (
                <div className="mt-2 space-y-1">
                  <span
                    className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: `${themeColors.button}15`, color: themeColors.button }}
                  >
                    {booking.rental_type === 'daily' ? 'Daily Rental' : booking.rental_type === 'land_based' ? 'Land Based' : booking.rental_type === 'monthly' ? 'Monthly Rental' : booking.rental_type}
                  </span>
                  {booking.rental_type === 'daily' && booking.estimatedDuration && (
                    <p className="text-sm font-semibold text-gray-700 flex items-center flex-wrap gap-1">
                      <FiCalendar className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span>{booking.estimatedDuration} Day{booking.estimatedDuration > 1 ? 's' : ''}</span>
                      {booking.endDate ? (
                        <span className="text-gray-500 font-normal"> · Ends {new Date(booking.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      ) : booking.scheduledDate && booking.estimatedDuration > 1 ? (() => {
                        const end = new Date(booking.scheduledDate);
                        end.setDate(end.getDate() + Number(booking.estimatedDuration) - 1);
                        return <span className="text-gray-500 font-normal"> · Ends {end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>;
                      })() : null}
                    </p>
                  )}
                  {booking.rental_type === 'monthly' && (
                    <p className="text-sm font-semibold text-gray-700 flex items-center flex-wrap gap-1">
                      <FiCalendar className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span>1 Month</span>
                      {booking.endDate && (
                        <span className="text-gray-500 font-normal"> · Ends {new Date(booking.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      )}
                    </p>
                  )}
                  {booking.rental_type === 'land_based' && booking.landSize && (
                    <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                      <FiCompass className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span>Area: {booking.landSize}</span>
                    </p>
                  )}
                  {booking.cropType && (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <FaSeedling className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span>Crop: {booking.cropType}</span>
                    </p>
                  )}
                </div>
              )}
              {booking.rental_type === 'hourly' && booking.estimatedDuration && (
                <p className="text-sm font-semibold text-gray-700 mt-1 flex items-center gap-1.5">
                  <FiClock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span>{booking.estimatedDuration} Hour{booking.estimatedDuration > 1 ? 's' : ''}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Payment Invoice Card - Dark Header Style (Exact Match with Billing) */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-xl border border-gray-100 mb-6">
          <div className="bg-gray-900 px-6 py-6 text-white text-center">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-1">TOTAL INVOICE AMOUNT</p>
            <h2 className="text-4xl font-black">₹{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
            <div className="mt-2.5">
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                booking.paymentStatus === 'SUCCESS' || booking.paymentStatus === 'paid' || booking.paymentStatus === 'success' || booking.paymentStatus === 'PAID'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                <FiDollarSign className="w-3 h-3" />
                <span>Payment: {booking.paymentStatus === 'SUCCESS' || booking.paymentStatus === 'paid' || booking.paymentStatus === 'success' || booking.paymentStatus === 'PAID' ? 'Received (Wallet Credited)' : 'Pending'}</span>
              </span>
            </div>
            {isPlanBenefit && (
              <span className="inline-block mt-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase">
                Plan Benefit Applied
              </span>
            )}
            {hasBill && (
              <button
                onClick={handleDownloadInvoice}
                disabled={actionLoading}
                className="mt-4 flex items-center justify-center gap-2 w-full max-w-[200px] mx-auto py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition-all active:scale-95 text-xs font-bold"
              >
                <FiDownload className="w-4 h-4" />
                {actionLoading ? 'Generating...' : 'Download Invoice PDF'}
              </button>
            )}
          </div>

          <div className="p-6 space-y-6 text-sm">
            {/* Services Section */}
            <div>
              <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs"><FiTool /></span>
                Services
              </h4>
              <div className="space-y-2 pl-2">
                <div className="flex justify-between text-gray-600">
                  <span>Original Booking : {booking.serviceType || 'Service'}</span>
                  {isPlanBenefit ? (
                    <div className="flex items-center gap-2">
                      <span className="line-through text-gray-400 text-xs">₹{originalBase.toFixed(2)}</span>
                      <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">FREE</span>
                    </div>
                  ) : (
                    <span className="font-medium text-gray-900">₹{originalBase.toFixed(2)}</span>
                  )}
                </div>

                {services.map((s, i) => (
                  <div key={i} className="flex justify-between text-gray-600">
                    <span>{s.name} x {s.quantity}</span>
                    <span className="font-mono">₹{((parseFloat(s.price) || 0) * (parseFloat(s.quantity) || 1)).toFixed(2)}</span>
                  </div>
                ))}

                {/* Service Discount (if any) */}
                {booking.discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Discount</span>
                    <span className="font-mono">-₹{(booking.discount).toFixed(2)}</span>
                  </div>
                )}

                {/* Service GST */}
                {(() => {
                  const activeGST = bill ? (originalGST + extraServiceGST) : (booking.tax || originalGST);
                  const activeBase = bill ? (originalBase - (booking.discount || 0) + extraServiceBase) : (originalBase - (booking.discount || 0));
                  const dynamicGstPct = (activeGST > 0 && activeBase > 0)
                    ? Math.round((activeGST * 100) / activeBase)
                    : 18;
                  return (
                    <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                      <span>Service GST ({dynamicGstPct}%)</span>
                      <span className="font-mono">₹{activeGST.toFixed(2)}</span>
                    </div>
                  );
                })()}

                {/* Service Subtotal */}
                <div className="flex justify-between font-bold text-gray-800 pt-1">
                  <span>Total Service</span>
                  <span>₹{(bill ? (originalBase + extraServiceBase + originalGST + extraServiceGST) : (originalBase - (booking.discount || 0) + (booking.tax || originalGST))).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Parts Section */}
            {(parts.length > 0 || customItems.length > 0) && (
              <div>
                <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                  <span className="w-6 h-6 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-xs"><FiPackage /></span>
                  Parts & Material
                </h4>
                <div className="space-y-2 pl-2">
                  {parts.map((p, i) => (
                    <div key={`p-${i}`} className="flex justify-between text-gray-600">
                      <span>{p.name} x {p.quantity}</span>
                      <span className="font-mono">₹{(p.price * p.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  {customItems.map((c, i) => (
                    <div key={`c-${i}`} className="flex justify-between text-gray-600">
                      <div>
                        <span>{c.name} x {c.quantity}</span>
                        {c.hsnCode && <p className="text-[9px] text-gray-400">HSN: {c.hsnCode}</p>}
                      </div>
                      <span className="font-mono">₹{(c.price * c.quantity).toFixed(2)}</span>
                    </div>
                  ))}

                  {/* Parts GST */}
                  <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                    <span>Parts GST (18%)</span>
                    <span className="font-mono">₹{partsGST.toFixed(2)}</span>
                  </div>

                  {/* Parts Subtotal */}
                  <div className="flex justify-between font-bold text-gray-800 pt-1">
                    <span>Total Parts</span>
                    <span>₹{(partsBase + partsGST).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Visiting Charges */}
            {(booking.visitingCharges > 0 || bill?.visitingCharges > 0) && (
              <div>
                <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                  <span className="w-6 h-6 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center text-xs"><FiClock /></span>
                  Visiting Charges
                </h4>
                <div className="flex justify-between pl-2 font-bold text-gray-800">
                  <span>Visiting Price</span>
                  <span>₹{(bill?.visitingCharges || booking.visitingCharges || 0).toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Transport Charges */}
            {bill?.transportCharges > 0 && (
              <div className="mt-4">
                <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                  <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs"><FiPackage /></span>
                  Transport Charges
                </h4>
                <div className="flex justify-between pl-2 font-bold text-gray-800">
                  <span>Transport/Travel</span>
                  <span>₹{(bill.transportCharges).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Vendor Earnings Footer - ONLY SHOW WHEN COMPLETED */}
          {(booking.status === 'completed' || booking.status === 'work_done' || booking.cashCollected) ? (
            <div className="bg-emerald-50 px-6 py-4 border-t border-emerald-100">
              <div className="space-y-2 mb-3 text-sm">
                <div className="flex justify-between items-center text-emerald-700">
                  <span>Service Earnings ({bill?.payoutConfig?.serviceSplitPercentage || 70}%)</span>
                  <span className="font-bold">₹{(bill?.vendorServiceEarning || (booking.vendorEarnings || 0)).toFixed(2)}</span>
                </div>
                {(parts.length > 0 || customItems.length > 0 || bill?.vendorPartsEarning > 0) && (
                  <div className="flex justify-between items-center text-emerald-700">
                    <span>Parts Earnings ({bill?.payoutConfig?.partsSplitPercentage || 10}%)</span>
                    <span className="font-bold">₹{(bill?.vendorPartsEarning || 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-emerald-200/50">
                <span className="text-emerald-800 font-bold text-xs uppercase tracking-wider">Total Net Earnings</span>
                <span className="text-emerald-700 font-black text-xl">
                  ₹{(bill?.vendorTotalEarning || booking.vendorEarnings || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-emerald-600/70 text-[10px] mt-2">
                <span>Platform Commission</span>
                <span>-₹{(bill?.adminCommission || booking.adminCommission || booking.platformCommission || 0).toFixed(2)}</span>
              </div>
              {/* Commission % info badge */}
              <div className="mt-2 flex items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                <span className="text-[9px] font-black text-orange-500 uppercase tracking-wider">Per Booking Commission</span>
                <span className="ml-auto text-[11px] font-black text-orange-600">{bookingCommissionPct}%</span>
                <span className="text-[9px] text-orange-400">deducted by platform</span>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100/50 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center justify-center gap-2">
                <FiAlertCircle className="w-3 h-3" />
                Net Earnings will be visible once completed
              </p>
            </div>
          )}
        </div>

        {/* Work Photos (after completion) */}
        {booking.workPhotos && booking.workPhotos.length > 0 && booking.assignedTo?.name !== 'You (Self)' && (
          <div className="bg-white rounded-xl p-4 mb-4 shadow-md border-t-4 border-green-500">
            <p className="text-sm font-semibold text-gray-700 mb-3">Work Evidence (Photos)</p>
            <div className="grid grid-cols-2 gap-2">
              {booking.workPhotos.map((photo, index) => (
                <div key={index} className="aspect-square rounded-lg overflow-hidden bg-gray-100 border relative group">
                  <img
                    src={photo.replace('/api/upload', 'http://localhost:5000/upload')}
                    alt={`Work evidence ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={() => window.open(photo.replace('/api/upload', 'http://localhost:5000/upload'), '_blank')}
                      className="bg-white text-gray-900 px-3 py-1 rounded-full text-xs font-bold"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Approval/Reject Buttons */}
            {booking.status === 'work_done' && booking.workerPaymentStatus !== 'PAID' && booking.assignedTo?.name !== 'You (Self)' && (
              <div className="flex gap-3 mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Reject Work',
                      message: 'Reject work? This will notify the worker to fix issues.',
                      type: 'warning',
                      onConfirm: () => {
                        toastManager.error('Work Marked as Rejected');
                        // Add actual reject logic here if available
                      }
                    });
                  }}
                  className="flex-1 py-3 bg-white text-red-600 rounded-xl font-bold text-sm active:scale-95 transition-transform border border-red-200 shadow-sm"
                >
                  <FiX className="inline w-4 h-4 mr-1" /> Reject Work
                </button>
                <button
                  onClick={handleApproveWork}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-sm shadow-md shadow-green-200 active:scale-95 transition-transform"
                >
                  <FiCheckCircle className="inline w-4 h-4 mr-1" /> Approve Work
                </button>
              </div>
            )}
          </div>
        )}

        {/* Worker & Job Status Card (Enhanced) - Hidden for Standalone */}
        {booking.assignedTo && booking.assignedTo?.name !== 'You (Self)' && booking.categoryId?.requiresDriver !== false && (
          <div className="bg-white rounded-2xl p-5 mb-5 shadow-lg border border-gray-100">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden border-2 border-white shadow-sm flex items-center justify-center">
                  <FiUser className="w-6 h-6 text-gray-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">{booking.assignedTo.name}</h3>
                  <p className="text-xs text-gray-500 font-medium">Equipment Operator</p>
                </div>
              </div>

              {/* Call Button */}
              {booking.assignedTo?.phone && (
                <a href={`tel:${booking.assignedTo.phone}`} className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 hover:bg-green-100 transition-colors">
                  <FiPhone className="w-5 h-5" />
                </a>
              )}
            </div>

            {/* Status Section - Premium Design */}
            <div className="rounded-2xl p-6 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
                boxShadow: 'inset 0 0 40px rgba(74, 222, 128, 0.05)'
              }}>

              {/* Decorative background blur */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>

              <div className="flex justify-between items-center mb-6 relative z-10">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="text-xs font-bold text-green-800 uppercase tracking-widest">Live Status</span>
                  <BookingCountdown booking={booking} />
                </div>
                {booking.workerAcceptedAt && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/60 border border-green-100/50 backdrop-blur-sm shadow-sm">
                    <FiClock className="w-3 h-3 text-green-600" />
                    <span className="text-[10px] text-green-700 font-bold font-mono">
                      {new Date(booking.workerAcceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>

              {/* Status Display */}
              {(!booking.workerResponse || booking.workerResponse === 'PENDING') && (booking.status === 'pending' || booking.status === 'assigned') ? (
                <div className="flex items-center gap-4 text-amber-600 bg-white/80 backdrop-blur-md p-4 rounded-xl border border-amber-100 shadow-sm relative z-10">
                  <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                    <FiClock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm text-gray-900">Awaiting Acceptance</p>
                    <p className="text-xs text-amber-700/80 font-medium mt-0.5">Operator has not responded yet</p>
                  </div>
                </div>
              ) : (booking.workerResponse === 'ACCEPTED' || ['journey_started', 'visited', 'in_progress', 'work_done', 'completed'].includes(booking.status)) ? (
                <div className="space-y-6 relative z-10">
                  {/* Progress Steps Visual - Pro Design */}
                  <div className="relative px-2">
                    {/* Track Line */}
                    <div className="absolute left-6 right-6 top-[15px] h-1.5 bg-gray-100/80 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(16₹85₹29,0.3)]" style={{
                        width: booking.status === 'completed' || booking.status === 'work_done' ? '100%' :
                          booking.status === 'in_progress' || booking.status === 'visited' ? '66%' :
                            booking.status === 'journey_started' ? '33%' : '0%'
                      }}>
                        <div className="w-full h-full bg-white/20 animate-[shimmer_2s_infinite]"></div>
                      </div>
                    </div>

                    <div className="flex justify-between items-start relative">
                      {/* Accepted Step */}
                      <div className="flex flex-col items-center gap-2 group cursor-default">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-green-200 ring-4 ring-white z-10 transition-transform group-hover:scale-110 duration-300">
                          <FiCheck className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-800 tracking-wide uppercase bg-white/50 px-2 py-0.5 rounded-full backdrop-blur-sm">Accepted</span>
                      </div>

                      {/* Started Step */}
                      <div className="flex flex-col items-center gap-2 group cursor-default">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg ring-4 ring-white z-10 transition-all duration-500 group-hover:scale-110 ${['journey_started', 'visited', 'in_progress', 'work_done', 'completed'].includes(booking.status) ? 'bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-green-200' : 'bg-white text-gray-300 border-2 border-dashed border-gray-200'}`}>
                          <FiNavigation className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full backdrop-blur-sm transition-colors ${['journey_started', 'visited', 'in_progress', 'work_done', 'completed'].includes(booking.status) ? 'text-emerald-800 bg-white/50' : 'text-gray-400'}`}>On Way</span>
                      </div>

                      {/* Working Step */}
                      <div className="flex flex-col items-center gap-2 group cursor-default">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg ring-4 ring-white z-10 transition-all duration-500 group-hover:scale-110 ${['visited', 'in_progress', 'work_done', 'completed'].includes(booking.status) ? 'bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-green-200' : 'bg-white text-gray-300 border-2 border-dashed border-gray-200'}`}>
                          <FiTool className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full backdrop-blur-sm transition-colors ${['visited', 'in_progress', 'work_done', 'completed'].includes(booking.status) ? 'text-emerald-800 bg-white/50' : 'text-gray-400'}`}>Working</span>
                      </div>

                      {/* Done Step */}
                      <div className="flex flex-col items-center gap-2 group cursor-default">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg ring-4 ring-white z-10 transition-all duration-500 group-hover:scale-110 ${['work_done', 'completed'].includes(booking.status) ? 'bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-green-200' : 'bg-white text-gray-300 border-2 border-dashed border-gray-200'}`}>
                          <FiCheckCircle className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full backdrop-blur-sm transition-colors ${['work_done', 'completed'].includes(booking.status) ? 'text-emerald-800 bg-white/50' : 'text-gray-400'}`}>Done</span>
                      </div>
                    </div>
                  </div>

                  {/* Clear Text Status with Glass Effect */}
                  <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white/50 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow duration-300">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${booking.status === 'journey_started' ? 'bg-blue-50 text-blue-600' :
                      booking.status === 'visited' ? 'bg-purple-50 text-purple-600' :
                        booking.status === 'in_progress' ? 'bg-orange-50 text-orange-600' :
                          ['work_done', 'completed'].includes(booking.status) ? 'bg-green-50 text-green-600' :
                            'bg-gray-100 text-gray-500'
                      }`}>
                      {booking.status === 'journey_started' ? <FiNavigation className="w-6 h-6 drop-shadow-sm" /> :
                        booking.status === 'visited' ? <FiMapPin className="w-6 h-6 drop-shadow-sm" /> :
                          booking.status === 'in_progress' ? <FiTool className="w-6 h-6 animate-pulse drop-shadow-sm" /> :
                            ['work_done', 'completed'].includes(booking.status) ? <FiCheckCircle className="w-6 h-6 drop-shadow-sm" /> :
                              <FiCheck className="w-6 h-6 text-gray-400" />}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-base tracking-tight mb-0.5">
                        {booking.status === 'journey_started' ? 'Operator is On the Way' :
                          booking.status === 'visited' ? 'Operator Reached Location' :
                            booking.status === 'in_progress' ? 'Work In Progress' :
                              ['work_done', 'completed'].includes(booking.status) ? 'Work Completed' :
                                'Operator Accepted Job'}
                      </p>
                      <p className="text-xs text-gray-500 font-medium">
                        {booking.status === 'journey_started' ? 'Tracking is active. Monitor live location.' :
                          booking.status === 'visited' ? 'Waiting for OTP verification to start work.' :
                            booking.status === 'in_progress' ? 'Service is currently being performed.' :
                              ['work_done', 'completed'].includes(booking.status) ? 'Service marked as done. Pending final checks.' :
                                'Worker is preparing to start the journey.'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                  <FiXCircle className="w-5 h-5" />
                  <div className="flex-1">
                    <p className="font-bold text-sm">Request Declined</p>
                    <p className="text-[10px] opacity-80">Operator is unavailable.</p>
                  </div>
                  <button onClick={handleAssignWorker} className="px-3 py-1 bg-white border border-red-200 rounded shadow-sm text-xs font-bold text-red-600 hover:bg-red-50">
                    Reassign
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Collection Section */}
        {canCollectCash(booking) && (
          <div
            className="bg-white rounded-2xl mb-4 overflow-hidden shadow-lg border-none relative group"
            style={{
              boxShadow: booking.paymentMethod === 'plan_benefit'
                ? '0 10px 30px -5px rgba(16, 185, 129, 0.2)'
                : '0 10px 30px -5px rgba(249, 115, 22, 0.2)',
            }}
          >
            {/* Top Accent Gradient */}
            <div className={`h-2 bg-gradient-to-r ${booking.paymentMethod === 'plan_benefit' ? 'from-emerald-400 to-teal-600' : 'from-orange-400 to-orange-600'}`} />

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${booking.paymentMethod === 'plan_benefit' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-500'}`}>
                  <FiCreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">
                    {booking.paymentMethod === 'plan_benefit' ? 'Prepare Final Bill' : 'Collect Payment'}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                    {booking.paymentMethod === 'plan_benefit' ? 'Add extra charges if any' : 'Step 1: Finish Settlement'}
                  </p>
                </div>
              </div>

              {booking.paymentMethod === 'plan_benefit' ? (
                /* Plan Benefit UI */
                <div className="bg-emerald-50/50 rounded-2xl p-4 mb-6 border border-emerald-100/50">
                  <div className="flex items-center gap-3 mb-3">
                    <FiCheckCircle className="w-5 h-5 text-emerald-600" />
                    <span className="font-bold text-emerald-800">Base Service Covered by Plan</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    The base service fee is covered by farmer's membership. You can add extra charges for parts or additional work.
                  </p>
                </div>
              ) : (
                /* Normal Cash Collection UI */
                <div className="bg-orange-50/50 rounded-2xl p-4 mb-6 border border-orange-100/50">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Amount to Collect</span>
                    <span className="text-2xl font-black text-orange-600">
                      ₹{(booking.finalAmount || parseFloat(booking.price) || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-[11px] text-orange-700/80 leading-relaxed">
                    <FiClock className="w-3 h-3 mt-0.5" />
                    <span>Farmer chose {booking.paymentMethod?.replace('_', ' ') || 'Cash'} payment. Please verify collection to proceed.</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <button
                  type="button"
                  id="vendor-scan-admin-qr-btn"
                  onClick={() => {
                    setCashModalMode('qr');
                    setIsCashModalOpen(true);
                  }}
                  disabled={loading}
                  className="w-full py-4 rounded-xl font-black bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md cursor-pointer"
                >
                  <FiCheckCircle className="w-5 h-5 text-emerald-200" />
                  <span>📲 Scan Admin QR (Online)</span>
                </button>

                <button
                  type="button"
                  onClick={handleCollectCashClick}
                  disabled={loading}
                  className="w-full py-4 rounded-xl font-bold bg-gray-900 hover:bg-black text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md cursor-pointer"
                >
                  <FiDollarSign className="w-5 h-5 text-orange-400" />
                  <span>{booking.paymentMethod === 'plan_benefit' ? 'Prepare/Edit Final Bill' : '💵 Collect Cash Notes'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Online Payment Done State */}
        {(booking?.paymentStatus === 'SUCCESS' || booking?.paymentStatus === 'paid') && booking?.status !== 'completed' && (
          <div className="bg-white rounded-2xl mb-4 overflow-hidden shadow-lg border-none relative group"
            style={{ boxShadow: '0 10px 30px -5px rgba(16, 185, 129, 0.2)' }}
          >
            <div className="h-2 bg-gradient-to-r from-green-400 to-green-600" />
            <div className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-500 shadow-inner">
                  <FiCheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">Paid Online</h3>
                  <p className="text-xs text-green-600 font-bold uppercase tracking-wider">Payment Verified</p>
                </div>
              </div>
              <div className="mt-4 bg-green-50/50 rounded-xl p-3 border border-green-100">
                <p className="text-xs text-green-800 font-medium">Farmer has paid ₹{booking.finalAmount.toLocaleString()} online via Razorpay. No cash collection needed.</p>
              </div>
            </div>
          </div>
        )}

        {/* Final Settlement Button (Improved UI) */}
        {canDoFinalSettlement(booking) && (
          <div
            className="bg-white rounded-2xl mb-4 overflow-hidden shadow-lg border-none relative"
            style={{
              boxShadow: '0 10px 30px -5px rgba(139, 92, 246, 0.15)',
            }}
          >
            <div className="h-2 bg-gradient-to-r from-violet-400 to-indigo-600" />

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-500 shadow-inner">
                  <FiCheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Finish Job</h3>
                  <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Step 2: Close Booking</p>
                </div>
              </div>

              <div className="bg-violet-50/50 rounded-2xl p-4 mb-6 border border-violet-100/50">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <FiCheck className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Payment Verified</span>
                    <p className="text-xs text-gray-500 mt-0.5">Payment has been successfully recorded. You can now close this booking.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleFinalSettlement}
                disabled={loading}
                className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 hover:brightness-105"
                style={{
                  background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                  boxShadow: '0 8px 16px -4px rgba(139, 92, 246, 0.4)',
                }}
              >
                <FiCheckCircle className="w-5 h-5" />
                Close Booking & Finalize
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 mb-4">
          {(booking.status === 'pending' || booking.status === 'searching') && (
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="flex-1 py-4 rounded-xl font-bold text-red-600 bg-red-50 border border-red-100 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                <FiXCircle className="w-5 h-5" />
                Reject
              </button>
              <button
                onClick={handleAccept}
                disabled={actionLoading}
                className="flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                <FiCheckCircle className="w-5 h-5" />
                Accept
              </button>
            </div>
          )}
          
          <button
            onClick={handleViewTimeline}
            className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: themeColors.button,
              boxShadow: `0 4px 12px ${themeColors.button}40`,
            }}
          >
            View Timeline
            <FiArrowRight className="w-5 h-5" />
          </button>



          {/* Self-Job Operational Buttons (Hidden for Agriculture to use new Trip Flow) */}
          {booking.assignedTo?.name === 'You (Self)' && !booking.rental_type && booking.serviceCategory !== 'Agriculture' && (
            <div className="space-y-3 pt-2">
              {(booking.status === 'confirmed' || booking.status === 'assigned') && (
                <button
                  onClick={handleStartJourney}
                  className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <FiNavigation className="w-5 h-5" />
                  Start Journey
                </button>
              )}

              {booking.status === 'journey_started' && (
                <button
                  onClick={async () => {
                    try {
                      setIsVisitModalOpen(true);
                      await vendorReached(id);
                    } catch (err) {
                      console.error('Failed to notify reached:', err);
                    }
                  }}
                  className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                  }}
                >
                  <FiMapPin className="w-5 h-5" />
                  Arrived (Arrived at farmer's site)
                </button>
              )}

              {(booking.status === 'visited' || booking.status === 'in_progress') && (
                <button
                  onClick={() => setIsWorkDoneModalOpen(true)}
                  className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <FiCheckCircle className="w-5 h-5" />
                  Work Done
                </button>
              )}
            </div>
          )}
        </div>

        {/* ══════ LIVE AGRICULTURAL SERVICE TIMER (PLAY / PAUSE / BREAKDOWN) ══════ */}
        {(booking?.serviceTimer || booking?.equipmentId || booking?.rental_type || ['visited', 'in_progress', 'completed'].includes(booking?.status)) && (
          <div className="mb-4">
            <LiveServiceTimer
              booking={booking}
              role="vendor"
              onStatusChange={refreshBooking}
            />
          </div>
        )}

        {/* ══════ EQUIPMENT TRIP FLOW (New - agriculture feature) ══════ */}
        {/* Note: Equipment trip start/end actions are handled inside the Booking Timeline page */}

        {/* Trip Completed Badge */}
        {booking.start_kilometer_photo && booking.end_kilometer_photo && (
          <div className="bg-white rounded-2xl mb-4 overflow-hidden shadow-lg border-t-4 border-green-500">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                  <FiCheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Trip Completed & Verified</p>
                  <p className="text-[10px] text-gray-500">Operation details and photos submitted.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Start KM Photo</p>
                  <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 border relative group">
                    <img src={booking.start_kilometer_photo} alt="Start KM" className="w-full h-full object-cover" />
                    <button onClick={() => window.open(booking.start_kilometer_photo, '_blank')} className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">View</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">End KM Photo</p>
                  <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 border relative group">
                    <img src={booking.end_kilometer_photo} alt="End KM" className="w-full h-full object-cover" />
                    <button onClick={() => window.open(booking.end_kilometer_photo, '_blank')} className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">View</button>
                  </div>
                </div>
                {booking.work_evidence_photo && (
                  <div className="col-span-2 space-y-1 pt-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                      <FiTool className="w-3 h-3 text-emerald-600" />
                      <span>Work Evidence (Field Photo)</span>
                    </p>
                    <div className="w-full aspect-video rounded-xl overflow-hidden bg-gray-100 border-2 border-dashed border-gray-200 relative group">
                      <img src={booking.work_evidence_photo} alt="Work Proof" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button onClick={() => window.open(booking.work_evidence_photo, '_blank')} className="bg-white text-gray-900 px-4 py-1.5 rounded-full text-xs font-bold shadow-lg">View Full Evidence</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* ═══════════════════════════════════════════════════════════ */}

        {/* Raise Dispute (Vendor Side) */}
        {['completed', 'work_done', 'cancelled'].includes(booking.status?.toLowerCase()) && (
          <div className="px-5 mb-10">
            <button
              onClick={() => setShowDisputeModal(true)}
              className="w-full py-4 rounded-xl text-amber-600 font-bold text-xs bg-amber-50 border border-amber-100 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <FiAlertTriangle className="w-4 h-4" />
              Report an Issue / Payment Dispute
            </button>
          </div>
        )}
      </main>



      {/* Pay Operator Modal */}
      <OperatorPaymentModal
        isOpen={isPayWorkerModalOpen}
        onClose={() => setIsPayWorkerModalOpen(false)}
        workerName={booking.assignedTo?.name}
        amountDue={booking.vendorEarnings * 0.9} // Estimation or based on your rule (90% to worker)
        onConfirm={handlePayWorkerSubmit}
        loading={paySubmitting}
      />

      {/* Visit OTP Modal */}
      <VisitVerificationModal
        isOpen={isVisitModalOpen}
        onClose={() => setIsVisitModalOpen(false)}
        bookingId={id}
        onSuccess={() => window.location.reload()}
      />

      {/* Unified Worker Completion Modal - REUSABLE COMPONENT */}
      <WorkCompletionModal
        isOpen={isWorkDoneModalOpen}
        onClose={() => setIsWorkDoneModalOpen(false)}
        job={booking}
        onComplete={async (photos) => {
          try {
            setActionLoading(true);
            // Use vendor-specific service call (completeSelfJob)
            await completeSelfJob(id, { workPhotos: photos });
            toastManager.success('Work marked done');
            setIsWorkDoneModalOpen(false);
            window.location.reload();
          } catch (err) {
            toastManager.error(err.response?.data?.message || 'Failed to complete job');
          } finally {
            setActionLoading(false);
          }
        }}
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => { return { ...prev, isOpen: false }; })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />



      {/* Trip Flow Modal (New - agriculture feature) */}
      <TripFlowModal
        isOpen={isTripModalOpen}
        onClose={() => setIsTripModalOpen(false)}
        mode={tripMode}
        rentalType={booking.rental_type}
        requiresDriver={booking.categoryId?.requiresDriver}
        trackingType={booking.categoryId?.trackingType}
        isMachinery={!!(booking?.rental_type || ['equipment', 'machinery', 'tractor', 'agriculture'].some(cat => (booking?.serviceCategory || booking?.serviceType || '').toLowerCase().includes(cat)))}
        onSubmit={handleTripSubmit}
        booking={booking}
      />

      {/* Dispute Modal */}
      <DisputeModal
        isOpen={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        onSubmit={async (data) => {
          try {
            await disputeService.raiseDispute(data);
            return { success: true };
          } catch (err) {
            toastManager.error(err?.message || 'Failed to raise dispute');
            throw err;
          }
        }}
        bookingId={id}
      />

      {/* Cash / Admin QR Collection Modal */}
      <CashCollectionModal
        isOpen={isCashModalOpen}
        defaultMode={cashModalMode}
        onClose={() => {
          setIsCashModalOpen(false);
          window.dispatchEvent(new Event('vendorJobsUpdated'));
        }}
        booking={booking}
        onConfirm={async (finalTotal, extraItems, otpString) => {
          await vendorWalletService.confirmCashCollection(id, finalTotal, otpString, extraItems);
          window.dispatchEvent(new Event('vendorJobsUpdated'));
        }}
        onInitiateOTP={async (finalTotal, extraItems) => {
          await vendorWalletService.initiateCashCollection(id, finalTotal, extraItems);
          window.dispatchEvent(new Event('vendorJobsUpdated'));
        }}
        loading={actionLoading}
      />

      <BottomNav />
    </div>
  );
}
