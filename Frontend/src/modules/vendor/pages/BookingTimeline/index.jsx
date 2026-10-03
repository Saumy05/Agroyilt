import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiCheck, FiClock, FiUser, FiUsers, FiMapPin, FiTool, FiDollarSign, FiFileText, FiCheckCircle, FiX, FiNavigation, FiPackage } from 'react-icons/fi';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import { 
  getBookingById, 
  updateBookingStatus, 
  startSelfJob, 
  verifySelfVisit, 
  completeSelfJob, 
  collectSelfCash, 
  startTrip, 
  endTrip 
} from '../../services/bookingService';
import { uploadToCloudinary } from '../../../../utils/cloudinaryUpload';
import { CashCollectionModal, ConfirmDialog } from '../../components/common';
import TripFlowModal from '../../components/common/TripFlowModal';
import LiveServiceTimer from '../../../../components/common/LiveServiceTimer';
import { WorkCompletionModal } from '../../../worker/components/common';
import vendorWalletService from '../../../../services/vendorWalletService';
import { toastManager } from '../../../../utils/toastManager';

// Kill orphaned GSAP ScrollTriggers before a page reload to prevent removeChild crash
const safeReload = () => {
  try {
    import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
      ScrollTrigger.getAll().forEach(t => t.kill());
    }).catch(() => {});
  } catch (_) {}
  window.location.reload();
};

// Dynamic Countdown Timer & Alert for active machinery rentals
const RentalTimer = ({ booking }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!booking) return;
    const isTimeBased = booking.rental_type === 'hourly' || booking.rental_type === 'daily' || booking.rental_type === 'monthly';
    const isActive = booking.status?.toLowerCase() === 'in_progress';

    if (!isTimeBased || !isActive || !booking.startedAt) return;

    const startedTime = new Date(booking.startedAt).getTime();
    const duration = booking.estimatedDuration || 1;
    // Calculate total duration in milliseconds
    const durationMs = booking.rental_type === 'hourly'
      ? duration * 60 * 60 * 1000
      : duration * 24 * 60 * 60 * 1000;

    const targetMs = startedTime + durationMs;

    const updateTimer = () => {
      const remaining = targetMs - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
        setIsExpired(true);
      } else {
        setTimeLeft(remaining);
        setIsExpired(false);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [booking]);

  if (!booking) return null;
  const isTimeBased = booking.rental_type === 'hourly' || booking.rental_type === 'daily' || booking.rental_type === 'monthly';
  const isActive = booking.status?.toLowerCase() === 'in_progress';

  if (!isTimeBased || !isActive || !booking.startedAt) return null;

  // Format timeLeft in HH:MM:SS or Days Hours Mins
  const formatTime = () => {
    const totalSecs = Math.floor(timeLeft / 1000);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);

    if (booking.rental_type === 'hourly') {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      if (days > 0) {
        return `${days} Day(s) ${remainingHours} Hour(s) ${mins} Min(s)`;
      }
      return `${remainingHours} Hour(s) ${mins} Min(s) ${secs} Sec(s)`;
    }
  };

  return (
    <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3.5 shadow-sm transition-all duration-300 ${
      isExpired
        ? 'bg-red-50 border-red-200 text-red-700 animate-pulse'
        : 'bg-green-50 border-green-100 text-green-700'
    }`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
        isExpired ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
      }`}>
        <FiClock className="w-5 h-5 animate-spin" style={{ animationDuration: isExpired ? '1.5s' : '8s' }} />
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-black uppercase tracking-wider mb-0.5">
          {isExpired ? 'Rental Duration Expired!' : 'Rental Period Active'}
        </h4>
        <p className="text-xs font-semibold opacity-95">
          {isExpired
            ? 'Please collect the equipment from the farmer & verify OTP to end trip.'
            : `Time Remaining: ${formatTime()}`}
        </p>
      </div>
    </div>
  );
};

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

const BookingTimeline = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [currentStage, setCurrentStage] = useState(1);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [isWorkDoneModalOpen, setIsWorkDoneModalOpen] = useState(false);
  const [otpInput, setOtpInput] = useState(['', '', '', '']);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });
  const [workPhotos, setWorkPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isWorkApproved, setIsWorkApproved] = useState(false);
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [tripModalMode, setTripModalMode] = useState('start');

  const isAgriBooking = booking ? (
    !!booking.rental_type ||
    booking.serviceCategory === 'Agriculture' ||
    booking.serviceCategory === 'Machinery' ||
    booking.serviceCategory === 'Equipment' ||
    booking.providerType === 'MACHINERY' ||
    !!booking.equipmentId ||
    /agri|tractor|machin|equip|harvester|rotavator/i.test(booking.categoryId?.name || '')
  ) : false;

  const serviceLabel = useMemo(() => {
    if (!booking) return 'Equipment';
    const name = booking.serviceName || booking.equipmentId?.name || booking.categoryId?.name || '';
    if (/tractor/i.test(name)) return 'Tractor';
    if (/harvester/i.test(name)) return 'Harvester';
    if (/rotavator/i.test(name)) return 'Rotavator';
    if (/tiller/i.test(name)) return 'Tiller';
    if (/drone/i.test(name)) return 'Drone';
    if (/labour|worker|team/i.test(name)) return 'Team';
    if (/machinery|equipment/i.test(name) || booking.rental_type) return 'Equipment';
    return name || 'Equipment';
  }, [booking]);

  const requiresDriver = booking?.categoryId?.requiresDriver !== false; // Default true if category missing

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
    const loadBooking = async () => {
      try {
        const response = await getBookingById(id);
        const apiData = response.data || response;

        const isSelfJob = apiData.assignedAt && !apiData.workerId;
        const mappedBooking = {
          ...apiData,
          id: apiData._id || apiData.id,
          isSelfJob,
          assignedTo: apiData.workerId ? { name: apiData.workerId.name } : (apiData.assignedAt ? { name: 'You (Self)' } : null),
          location: {
            address: apiData.address?.addressLine1 || apiData.location?.address || 'Address not available',
            lat: apiData.address?.lat || apiData.location?.lat,
            lng: apiData.address?.lng || apiData.location?.lng
          },
          status: apiData.status,
          // Timeline mapping if backend supports it, otherwise derived from status/timestamps
          timeline: [
            { stage: 1, timestamp: apiData.createdAt },
            { stage: 2, timestamp: apiData.acceptedAt },
            { stage: 3, timestamp: apiData.assignedAt },
            { stage: 4, timestamp: apiData.startedAt }, // Assuming started means visited for now? Or keep null
            { stage: 5, timestamp: apiData.completedAt }, // Simplified mapping
          ]
        };
        setBooking(mappedBooking);

        // Determine current stage based on status
        // Determine current stage based on status
        const statusMap = {
          'requested': 1,
          'searching': 1,
          'confirmed': 2,
          'assigned': 3,
          'journey_started': 4,
          'visited': 6,
          'in_progress': 6.5,
          'work_done': 7,
          'completed': 8,
        };

        const isActuallyPaid = apiData.isWorkerPaid || apiData.workerPaymentStatus === 'PAID' || apiData.workerPaymentStatus === 'SUCCESS';
        const isSettled = apiData.finalSettlementStatus === 'DONE';

        // Custom logic for later stages
        let stage = statusMap[apiData.status] || 2;
        
        // Redirect logic for standalone: skip to stage 6 if status is confirmed/accepted
        if (!requiresDriver && (apiData.status === 'confirmed' || apiData.status === 'accepted')) {
          stage = 6; // Directly jump to Handover stage
        }


        if (apiData.status === 'completed') {
          if (isSettled) stage = 10; // Booking Complete
          else stage = 9; // Final Settlement
        }

        setCurrentStage(stage);
      } catch (error) {
        console.error('Error loading booking:', error);
      }
    };

    loadBooking();

    const handleUpdate = () => {
      loadBooking();
    };

    window.addEventListener('vendorJobsUpdated', handleUpdate);
    return () => window.removeEventListener('vendorJobsUpdated', handleUpdate);
  }, [id, isWorkApproved]);

  // Handle modal closing if payment is detected
  useEffect(() => {
    if (booking?.paymentStatus === 'SUCCESS') {
      // payment was successful
    }
  }, [booking?.paymentStatus]);

  // Lock scroll when modals are open
  useEffect(() => {
    const shouldLock = isVisitModalOpen || isWorkDoneModalOpen || isTripModalOpen || confirmDialog.isOpen;
    if (shouldLock) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isVisitModalOpen, isWorkDoneModalOpen, isTripModalOpen, confirmDialog.isOpen]);

  /* Handlers */

  const handleApproveWork = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Approve Work',
      message: "Approve operator's work and proceed to settlement?",
      type: 'info',
      onConfirm: async () => {
        try {
          setActionLoading(true);
          await updateBookingStatus(id, 'completed');
          toastManager.success('Work approved successfully');
          safeReload();
        } catch (e) {
          toastManager.error(e.response?.data?.message || 'Approval failed');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  const handleFinalSettlement = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Final Settlement',
      message: 'Mark final settlement as done? This will allow you to complete the booking.',
      type: 'warning',
      onConfirm: async () => {
        try {
          setActionLoading(true);
          // Using existing updateBookingStatus to mark settlement
          await updateBookingStatus(id, booking.status, { finalSettlementStatus: 'DONE' });
          toastManager.success('Final settlement completed!');
          safeReload();
        } catch (e) {
          toastManager.error(e.response?.data?.message || 'Final settlement failed');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };



  /* Handlers for Vendor Self-Job */
  const handleStartSelfJob = async () => {
    const executeStart = async () => {
      try {
        setActionLoading(true);
        await startSelfJob(id);
        toastManager.success('Journey Started');
        navigate(`/vendor/booking/${id}/map`);
      } catch (error) {
        toastManager.error('Failed to start journey');
      } finally {
        setActionLoading(false);
      }
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

  const handleVerifyVisit = async () => {
    const otp = otpInput.join('');
    if (otp.length !== 4) return toastManager.error('Enter 4-digit OTP');

    setActionLoading(true);
    // Location check for vendor? Optional or same as worker.
    if (!navigator.geolocation) return toastManager.error('Geolocation required');

    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        await verifySelfVisit(id, otp, location);
        toastManager.success('Visit Verified');
        setIsVisitModalOpen(false);
        safeReload();
      } catch (err) {
        toastManager.error(err.response?.data?.message || 'Verification failed');
        setActionLoading(false);
      }
    }, (error) => {
      console.error('Geolocation error:', error);
      toastManager.error('Could not get your location. Please enable GPS.');
      setActionLoading(false);
    }, { timeout: 10000 });
  };

  const handleCompleteWork = async (photos = []) => {
    try {
      setActionLoading(true);
      await completeSelfJob(id, { workPhotos: photos });
      toastManager.success('Work marked done');
      setIsWorkDoneModalOpen(false);
      safeReload();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTripSubmit = async (photoFile, otp, workUnits, evidenceFile) => {
    try {
      setActionLoading(true);
      
      let photoUrl = '';
      let evidenceUrl = '';

      // 1. Upload Photos if they are Files
      if (photoFile instanceof File) {
        toastManager.info('Uploading photo...', { id: 'uploading-trip-photo' });
        photoUrl = await uploadToCloudinary(photoFile, 'trips');
        toastManager.success('Photo uploaded', { id: 'uploading-trip-photo' });
      } else {
        photoUrl = photoFile;
      }

      if (evidenceFile instanceof File) {
        toastManager.info('Uploading evidence...', { id: 'uploading-trip-evidence' });
        evidenceUrl = await uploadToCloudinary(evidenceFile, 'evidence');
        toastManager.success('Evidence uploaded', { id: 'uploading-trip-evidence' });
      } else {
        evidenceUrl = evidenceFile;
      }

      // 2. Call API with URLs
      if (tripModalMode === 'start') {
        await startTrip(id, photoUrl, otp);
        toastManager.success(requiresDriver === false ? 'Equipment Handover Successful' : 'Engine started successfully');
      } else {
        await endTrip(id, photoUrl, otp, workUnits, evidenceUrl);
        toastManager.success('Work ended and bill generated successfully');
      }
      
      setIsTripModalOpen(false);
      // Delay reload to let UI catch up
      setTimeout(() => safeReload(), 1000);
    } catch (e) {
      console.error('Trip Submit Error:', e);
      toastManager.error(e?.response?.data?.message || e?.message || 'Failed to capture trip status');
    } finally {
      setActionLoading(false);
    }
  };

  const timelineStages = [
    {
      id: 1,
      title: 'Booking Requested',
      icon: FiClock,
      action: null,
      description: 'Booking request received',
    },
    {
      id: 2,
      title: 'Booking Accepted',
      icon: FiCheck,
      action: null,
      description: 'You accepted the booking',
    },
    {
      id: 3,
      title: 'Assign Operator',
      description: booking?.assignedTo ? `Assigned to ${booking.assignedTo.name}` : (requiresDriver === false ? 'Not required for this equipment' : 'Assign operator or start yourself'),
      icon: FiUsers,
      isCompleted: currentStage > 3,
      isSkipped: requiresDriver === false,
      action: currentStage === 2 && requiresDriver !== false ? () => navigate(`/vendor/booking/${id}/assign-worker`) : null,
    },
    {
      id: 4,
      title: isAgriBooking ? `${serviceLabel} Dispatched` : 'Journey Started',
      icon: FiMapPin,
      action: (currentStage === 2 || currentStage === 3) ? handleStartSelfJob : null,
      description: isAgriBooking 
        ? (booking?.isSelfJob ? `You are en route with ${serviceLabel.toLowerCase()}` : (booking?.assignedTo ? `Operator dispatched with ${serviceLabel.toLowerCase()}` : (currentStage === 2 ? `Dispatch ${serviceLabel.toLowerCase()} yourself or assign operator` : `Waiting to dispatch ${serviceLabel.toLowerCase()}`)))
        : (booking?.isSelfJob ? 'You started journey' : (booking?.assignedTo ? 'Operator started journey' : 'Waiting for journey start')),
    },
    {
      id: 5,
      title: isAgriBooking ? 'Arrived at Field' : 'Visited Site',
      icon: FiMapPin,
      action: (currentStage === 4) ? () => setIsVisitModalOpen(true) : null,
      description: isAgriBooking ? `${serviceLabel} reached farmer field` : 'Arrived at location',
    },
    {
      id: 6,
      title: isAgriBooking 
        ? 'Start Field Service & Timer' 
        : 'Work Done',
      icon: FiTool,
      action: (() => {
          if (['completed', 'work_done', 'in_progress'].includes(booking?.status?.toLowerCase())) return null;

          if (requiresDriver === false && isAgriBooking) {
              if (['confirmed', 'accepted', 'visited', 'assigned'].includes(booking?.status?.toLowerCase())) {
                  return () => { setTripModalMode('start'); setIsTripModalOpen(true); };
              }
          } else if (isAgriBooking) {
              if (booking?.status === 'visited') {
                  return () => { setTripModalMode('start'); setIsTripModalOpen(true); };
              }
          } else {
              if (currentStage === 5) return () => setIsWorkDoneModalOpen(true);
          }
          return null;
      })(),
      description: isAgriBooking 
        ? 'Verify Start OTP with farmer & start live minute-tracking timer' 
        : 'Service work in progress',
    },
    {
      id: 6.5,
      title: isAgriBooking 
        ? 'Complete Service & Bill' 
        : 'Work Completion',
      icon: FiPackage,
      action: (() => {
          if (booking?.status === 'in_progress') {
              return () => { setTripModalMode('end'); setIsTripModalOpen(true); };
          }
          return null;
      })(),
      description: isAgriBooking 
        ? 'Verify End OTP to finish work & generate active-minute bill' 
        : 'Complete the service work',
    },
    {
      id: 7,
      title: 'Collect Payment',
      icon: FiCheckCircle,
      action: (() => {
        if (booking?.status === 'completed' || booking?.status === 'COMPLETED' || booking?.paymentStatus === 'SUCCESS' || booking?.paymentStatus === 'paid' || booking?.paymentStatus === 'collected_by_vendor') return null;

        // If online payment and bill is already generated, let them click to view the bill on the billing page
        if (booking?.vendorBillId && booking?.paymentMethod !== 'cash' && booking?.paymentMethod !== 'pay_at_home' && booking?.paymentMethod !== 'plan_benefit') {
          return () => navigate(`/vendor/booking/${id}/billing`);
        }

        if (currentStage === 7) {
          return () => navigate(`/vendor/booking/${id}/billing`);
        }
        return null;
      })(),
      description: (booking?.vendorBillId && booking?.paymentMethod !== 'cash' && booking?.paymentMethod !== 'pay_at_home' && booking?.paymentMethod !== 'plan_benefit') ? 'Waiting for customer to pay online' : 'Collect cash with customer OTP or view bill',
    },
    {
      id: 9,
      title: 'Final Settlement',
      icon: FiFileText,
      action: (currentStage === 9) ? handleFinalSettlement : null,
      description: booking?.finalSettlementStatus === 'DONE' ? 'Settlement Done' : 'Complete final settlement',
    },
    {
      id: 10,
      title: 'Booking Complete',
      icon: FiCheckCircle,
      action: null,
      description: 'Booking successfully finalized',
    },
  ].filter(stage => {

    
    // Standalone: Hide Assigned (3), Journey (4), and Visited (5)
    if (!requiresDriver && [3, 4, 5].includes(stage.id)) return false;
    
    // Hide stage 6.5 (End Trip / Collect Equipment) if not an agriculture booking
    if (stage.id === 6.5 && !isAgriBooking) return false;
    
    return true;
  });

  // Auto-verify as last digit enters
  useEffect(() => {
    const otpValue = otpInput.join('');
    if (otpValue.length === 4 && !actionLoading && isVisitModalOpen) {
      handleVerifyVisit();
    }
  }, [otpInput]);

  const handleOtpChange = (index, value) => {
    if (value.length > 1) return;
    const newOtp = [...otpInput];
    newOtp[index] = value;
    setOtpInput(newOtp);
    if (value && index < 3) document.getElementById(`otp-${index + 1}`).focus();
  };

  // Arrival is confirmed by the customer's visit OTP (BookingDetails / map flow) — never by a plain status
  // update, which the server now refuses. This button only opens directions.
  async function handleVisitSite() {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${booking.location?.lat || 22.7196},${booking.location?.lng || 75.8577}`;
    window.open(url, '_blank');
  }

  // Work is finished by generating the bill (Complete Work) or ending the trip with the end OTP;
  // the server rejects a bare "work_done" status update.
  async function handleWorkDone() {
    toastManager.info
      ? toastManager.info('Use "Complete Work" to generate the bill and finish the job.')
      : toastManager.error('Use "Complete Work" to generate the bill and finish the job.');
  }




  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: themeColors.backgroundGradient }}>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Booking Timeline" />

      <main className="px-4 py-6">
        {(booking?.serviceTimer || booking?.equipmentId || booking?.rental_type || ['visited', 'in_progress', 'completed'].includes(booking?.status) || isAgriBooking) ? (
          <div className="mb-6">
            <LiveServiceTimer
              booking={booking}
              role="vendor"
              onStatusChange={() => {
                window.location.reload();
              }}
            />
          </div>
        ) : null}
        <div
          className="bg-white rounded-[2rem] p-8 shadow-lg border border-slate-100"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Timeline */}
          <div className="relative">
            {timelineStages.map((stage, index) => {
              const IconComponent = stage.icon;
              const isCompleted = stage.id < currentStage;
              const isCurrent = stage.id === currentStage;
              const isPending = stage.id > currentStage;
              const isSkipped = false; // We filter stages now, no need to skip visually in the flow unless needed for other reasons

              return (
                <div key={stage.id} className="relative pb-8 last:pb-0">
                  {/* Timeline Line */}
                  {index < timelineStages.length - 1 && (
                    <div
                      className="absolute left-6 top-12 w-0.5 h-full"
                      style={{
                        background: isCompleted ? themeColors.button : '#E5E7EB',
                      }}
                    />
                  )}

                  {/* Timeline Item */}
                  <div className="flex items-start gap-4">
                    {/* Icon Circle */}
                    <div
                      className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-white' : isCurrent ? 'bg-white' : 'bg-gray-100'
                        }`}
                      style={{
                        border: `3px solid ${isCompleted || isCurrent ? themeColors.button : '#E5E7EB'}`,
                        boxShadow: isCurrent ? `0 0 0 4px ${themeColors.button}20` : 'none',
                      }}
                    >
                      {isCompleted ? (
                        <FiCheck className="w-6 h-6" style={{ color: themeColors.button }} />
                      ) : (
                        <IconComponent
                          className="w-6 h-6"
                          style={{
                            color: isCurrent ? themeColors.button : '#9CA3AF',
                          }}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pt-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3
                          className={`font-semibold ${isCompleted || isCurrent ? 'text-gray-800' : 'text-gray-400'
                            }`}
                        >
                          {stage.title}
                        </h3>
                        {isSkipped && (
                          <span className="text-xs text-gray-500">Skipped</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{stage.description}</p>

                      {/* Action Button */}
                      {stage.action && !isSkipped && (
                        <button
                          onClick={stage.action}
                          className="px-4 py-2 rounded-lg font-semibold text-white text-sm transition-all active:scale-95"
                          style={{
                            background: themeColors.button,
                            boxShadow: `0 2px 8px ${themeColors.button}40`,
                          }}
                        >
                          {stage.id === 3 ? 'Assign Operator' :
                            stage.id === 4 ? (isAgriBooking ? (currentStage === 2 ? `Dispatch ${serviceLabel} Myself` : `Dispatch ${serviceLabel}`) : 'Start Journey') :
                              stage.id === 5 ? (isAgriBooking ? 'Mark Reached Field' : 'Mark Arrived') :
                                stage.id === 6 ? (isAgriBooking ? 'Start Field Service' : 'Mark Workdone') :
                                  stage.id === 6.5 ? (isAgriBooking ? 'Complete Service & Bill' : 'Mark Workdone') :
                                    stage.id === 7 ? (
                                      (booking?.paymentStatus === 'SUCCESS' || booking?.paymentStatus === 'paid' || booking?.paymentStatus === 'collected_by_vendor')
                                        ? 'Payment Done'
                                        : (booking?.vendorBillId ? 'Collect Cash / View Bill' : 'Collect Payment')
                                    ) :
                                      stage.id === 9 ? 'Final Settlement' : 'Continue'}
                        </button>
                      )}

                      {/* Payment Status Badge for Stage 7 */}
                      {stage.id === 7 && (booking?.paymentStatus === 'SUCCESS' || booking?.paymentStatus === 'paid' || booking?.paymentStatus === 'collected_by_vendor') && (
                        <div className="mt-2 flex items-center gap-1.5 text-green-600 font-bold text-xs bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
                          <FiCheckCircle className="w-4 h-4" />
                          {booking?.paymentStatus === 'collected_by_vendor' ? 'CASH PAYMENT COLLECTED' : 'ONLINE PAYMENT RECEIVED'}
                        </div>
                      )}

                      {/* Timestamp */}
                      {isCompleted && booking.timeline && booking.timeline.find(t => t.stage === stage.id) && (
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(booking.timeline.find(t => t.stage === stage.id).timestamp).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <BottomNav />

      {/* Visit OTP Modal */}
      {isVisitModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-slate-800 text-lg">Verify Self Visit</h3>
              <button onClick={() => setIsVisitModalOpen(false)}><FiX /></button>
            </div>
            <p className="text-sm text-slate-500 mb-6">Enter user OTP to verify arrival.</p>
            <div className="flex gap-2 justify-center mb-4">
              {[0, 1, 2, 3].map((i) => (
                <input key={i} id={`otp-${i}`} type="number" value={otpInput[i]} onChange={(e) => handleOtpChange(i, e.target.value)} className="w-14 h-14 border border-slate-300 rounded-2xl text-center text-xl font-black bg-slate-50 focus:bg-white focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" maxLength={1} />
              ))}
            </div>
            <button onClick={handleVerifyVisit} disabled={actionLoading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all mt-4">{actionLoading ? 'Verifying...' : 'Verify'}</button>
          </div>
        </div>
      )}

      {/* Work Done Modal */}
      <WorkCompletionModal
        isOpen={isWorkDoneModalOpen}
        onClose={() => setIsWorkDoneModalOpen(false)}
        job={booking}
        onComplete={handleCompleteWork}
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />

      {/* Machinery Trip Modal */}
      <TripFlowModal
        isOpen={isTripModalOpen}
        onClose={() => setIsTripModalOpen(false)}
        mode={tripModalMode}
        onSubmit={handleTripSubmit}
        rentalType={booking?.rental_type}
        isMachinery={isAgriBooking}
        requiresDriver={requiresDriver}
        trackingType={requiresDriver ? 'odometer' : 'condition'}
        booking={booking}
      />
    </div>
  );
};

export default BookingTimeline;

