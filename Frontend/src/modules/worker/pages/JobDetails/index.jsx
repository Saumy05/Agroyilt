import React, { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { FiMapPin, FiPhone, FiClock, FiUser, FiCheck, FiX, FiArrowRight, FiNavigation, FiTool, FiCheckCircle, FiDollarSign, FiCamera, FiPlus, FiTrash, FiXCircle, FiAward, FiFileText, FiAlertTriangle } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import { SkeletonCard } from '../../../../components/common/SkeletonLoaders';

const CashCollectionModal = lazy(() => import('../../components/common/CashCollectionModal'));
const VisitVerificationModal = lazy(() => import('../../components/common/VisitVerificationModal'));
const WorkCompletionModal = lazy(() => import('../../components/common/WorkCompletionModal'));
import ExtensionResponseCard from '../../components/ExtensionResponseCard';
import workerService from '../../../../services/workerService';
import api from '../../../../services/api';
import { toastManager } from '../../../../utils/toastManager';
import { useAppNotifications } from '../../../../hooks/useAppNotifications';
import { useLocationTracking } from '../../../../hooks/useLocationTracking';
import authStorage from '../../../../utils/authStorage';
import flutterBridge from '../../../../utils/flutterBridge';

// Real-time Active Work Stopwatch component
const ActiveWorkStopwatch = ({ job }) => {
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    let start = null;
    if (job?.startedAt) start = new Date(job.startedAt);
    else if (job?.workStartedAt) start = new Date(job.workStartedAt);
    else if (job?.inProgressAt) start = new Date(job.inProgressAt);
    else if (job?.journeyStartedAt) start = new Date(job.journeyStartedAt);
    else if (job?.createdAt) start = new Date(job.createdAt);

    const startTime = start ? start.getTime() : Date.now();

    const updateTimer = () => {
      const diffMs = Math.max(0, Date.now() - startTime);
      const totalSecs = Math.floor(diffMs / 1000);
      const hours = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
      const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
      const secs = String(totalSecs % 60).padStart(2, '0');
      setElapsed(`${hours}:${mins}:${secs}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [job]);

  const startDisplay = job?.scheduledTime || (job?.startedAt ? new Date(job.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Recently');

  return (
    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-2xl p-4 mb-4 shadow-lg flex items-center justify-between border border-amber-300/30 animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center text-white backdrop-blur-sm shadow-inner">
          <FiClock className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <p className="text-[11px] font-black uppercase tracking-wider text-amber-100">Live Work Timer</p>
          </div>
          <p className="text-2xl font-mono font-black tracking-wider text-white mt-0.5">{elapsed}</p>
        </div>
      </div>
      <div className="text-right text-xs text-amber-100">
        <p className="font-semibold text-[10px] uppercase tracking-wider">Started At</p>
        <p className="font-bold text-white text-sm">{startDisplay}</p>
      </div>
    </div>
  );
};

const getDurationInfo = (job) => {
  if (!job) return null;
  let start = null;
  if (job.startedAt) start = new Date(job.startedAt);
  else if (job.workStartedAt) start = new Date(job.workStartedAt);
  else if (job.inProgressAt) start = new Date(job.inProgressAt);
  else if (job.journeyStartedAt) start = new Date(job.journeyStartedAt);
  else if (job.scheduledDate && job.scheduledTime) {
    try {
      const dateStr = new Date(job.scheduledDate).toISOString().split('T')[0];
      const timeParts = job.scheduledTime.trim().split(' ')[0].split(':');
      if (timeParts.length >= 2) {
        let h = parseInt(timeParts[0], 10);
        const m = parseInt(timeParts[1], 10);
        if (job.scheduledTime.toLowerCase().includes('pm') && h < 12) h += 12;
        if (job.scheduledTime.toLowerCase().includes('am') && h === 12) h = 0;
        const d = new Date(dateStr);
        d.setHours(h, m, 0, 0);
        start = d;
      }
    } catch (e) {}
  }
  if (!start && job.createdAt) start = new Date(job.createdAt);

  let end = null;
  if (job.completedAt) end = new Date(job.completedAt);
  else if (job.workDoneAt) end = new Date(job.workDoneAt);
  else if (job.updatedAt && ['completed', 'work_done'].includes(job.status?.toLowerCase())) end = new Date(job.updatedAt);

  if (start && end && end >= start) {
    const diffMs = end.getTime() - start.getTime();
    const totalSecs = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    let durationStr = '';
    if (hours > 0) durationStr = `${hours}h ${mins}m ${secs}s`;
    else if (mins > 0) durationStr = `${mins}m ${secs}s`;
    else durationStr = `${secs}s`;

    return {
      startTime: job.scheduledTime || start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      endTime: end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      fullDate: end.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      duration: durationStr
    };
  }
  return null;
};

const JobDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const socket = useAppNotifications('worker');
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [otpInput, setOtpInput] = useState(['', '', '', '']); 
  const [workPhotos, setWorkPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [collectionAmount, setCollectionAmount] = useState('');
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  const actionLoadingRef = useRef(false);

  // Live completion is active ONLY if worker just finished the job in the current session
  const [justCompletedLocally, setJustCompletedLocally] = useState(Boolean(location.state?.justCompleted));
  const isLiveCompletion = Boolean(justCompletedLocally);

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

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const response = await workerService.getJobById(id);
      if (response.success) {
        // Map items for consistency
        const data = response.data;
        const gross = Number(
          data.paymentSummary?.grossAmount ||
          data.paymentSummary?.agreedRate ||
          data.workerFinancials?.workerOfferedRate ||
          data.workerGrossEarning ||
          data.agreedRate ||
          data.workerOfferedRate ||
          data.finalAmount ||
          0
        );
        const commRate = Number(
          data.paymentSummary?.commissionRate ??
          data.workerFinancials?.commissionRate ??
          (data.commissionRate !== undefined && data.commissionRate !== null && data.commissionRate > 0 ? data.commissionRate : 10)
        );
        const commAmt = Number(
          data.paymentSummary?.commissionAmount ??
          data.workerFinancials?.commissionAmount ??
          (data.commissionAmount !== undefined && data.commissionAmount !== null && data.commissionAmount > 0 ? data.commissionAmount : Math.round((gross * commRate) / 100))
        );
        const net = Number(
          data.paymentSummary?.netEarning ??
          data.workerFinancials?.netEarnings ??
          (data.workerNetEarning !== undefined && data.workerNetEarning !== null && data.workerNetEarning > 0 ? data.workerNetEarning : (gross - commAmt))
        );

        data.workerFinancials = {
          workerOfferedRate: gross,
          commissionRate: commRate,
          commissionAmount: commAmt,
          netEarnings: net
        };
        data.workerGrossEarning = gross;
        data.commissionRate = commRate;
        data.commissionAmount = commAmt;
        data.workerNetEarning = net;
        setJob({
          ...data,
          items: data.bookedItems || []
        });
      }
      setLoading(false);
    } catch (error) {
      // Error fetching job details
      toastManager.error('Failed to load job details');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobDetails();
    
    // Listen for socket events that update worker jobs
    const handleUpdate = () => {
      fetchJobDetails();
    };

    const handleCancelledJob = (data) => {
      fetchJobDetails();
      toastManager.error('This booking has been cancelled by the farmer.', { duration: 6000 });
    };
    
    window.addEventListener('workerJobsUpdated', handleUpdate);
    window.addEventListener('workerBookingCancelled', handleCancelledJob);
    if (socket?.on) {
      socket.on('worker_booking_cancelled', handleCancelledJob);
      socket.on('job_cancelled', handleCancelledJob);
      socket.on('booking_cancelled', handleCancelledJob);
      socket.on('extension_requested', handleUpdate);
      socket.on('extension_status_changed', handleUpdate);
      socket.on('extension_confirmed', handleUpdate);
      socket.on('worker_decreased', handleUpdate);
      socket.on('daily_day_started', handleUpdate);
      socket.on('daily_visit_otp_verified', handleUpdate);
      socket.on('daily_completion_otp_verified', handleUpdate);
    }

    return () => {
      window.removeEventListener('workerJobsUpdated', handleUpdate);
      window.removeEventListener('workerBookingCancelled', handleCancelledJob);
      if (socket?.off) {
        socket.off('worker_booking_cancelled', handleCancelledJob);
        socket.off('job_cancelled', handleCancelledJob);
        socket.off('booking_cancelled', handleCancelledJob);
        socket.off('extension_requested', handleUpdate);
        socket.off('extension_status_changed', handleUpdate);
        socket.off('extension_confirmed', handleUpdate);
        socket.off('worker_decreased', handleUpdate);
        socket.off('daily_day_started', handleUpdate);
        socket.off('daily_visit_otp_verified', handleUpdate);
        socket.off('daily_completion_otp_verified', handleUpdate);
      }
    };
  }, [id, socket]);

  const localWorker = authStorage.getUserData('worker') || {};
  const currentWorkerId = localWorker._id || localWorker.id || (typeof job?.workerId === 'string' ? job.workerId : job?.workerId?._id);
  const isDaily = job?.bookingType === 'DAILY' || job?.rateUnit === 'daily';

  const statusLower = job?.status?.toLowerCase() || '';

  // Auto-redirect to dashboard ONLY if this was an active live completion in the current session
  useEffect(() => {
    if (statusLower === 'completed' && !loading && isLiveCompletion) {
      const countdownInterval = setInterval(() => {
        setRedirectCountdown(c => (c > 1 ? c - 1 : 1));
      }, 1000);

      const redirectTimer = setTimeout(() => {
        navigate('/worker/dashboard', { replace: true });
      }, 3000);

      return () => {
        clearInterval(countdownInterval);
        clearTimeout(redirectTimer);
      };
    }
  }, [statusLower, loading, isLiveCompletion, navigate]);

  // Optimized Live Location Tracking with distance filter and heading
  const isTrackingActive = job?.status === 'journey_started' || job?.status === 'visited' || job?.status === 'in_progress';
  useLocationTracking(socket, id, isTrackingActive, {
    distanceFilter: 10, // Only emit when moved 10+ meters
    interval: 3000,     // Minimum 3s between emissions
    enableHighAccuracy: true
  });

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    // Mimic upload process using FileReader (Converting to Base64 for now)
    const uploadPromises = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(uploadPromises).then(urls => {
      setWorkPhotos(prev => [...prev, ...urls]);
      setIsUploading(false);
    });
  };

  const handleRemovePhoto = (index) => {
    setWorkPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleInitiateCashOTP = async (totalAmount, extraItems = []) => {
    try {
      setActionLoading(true);
      const res = await workerService.initiateCashCollection(id, totalAmount, extraItems);
      if (res.success) {
        return res;
      } else {
        throw new Error(res.message || 'Failed to send OTP');
      }
    } catch (error) {
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmCash = async (totalAmount, extraItems, otp) => {
    try {
      setActionLoading(true);
      const response = await workerService.collectCash(id, otp, totalAmount, extraItems);
      if (response.success) {
        toastManager.success('Payment collected & Job Completed!');
        setIsPaymentModalOpen(false);
        setJustCompletedLocally(true);
        fetchJobDetails();
      }
    } catch (error) {
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  const handleJobResponse = async (status) => {
    if (actionLoadingRef.current) return;
    actionLoadingRef.current = true;
    try {
      setActionLoading(true);
      let response;
      if (status === 'ACCEPTED') {
        try {
          response = await workerService.acceptJob(id);
        } catch (err) {
          response = await workerService.respondToJob(id, status);
        }
      } else {
        response = await workerService.respondToJob(id, status);
      }

      if (response && response.success) {
        toastManager.success(status === 'ACCEPTED' ? 'Job Accepted Successfully!' : 'Job Declined');
        if (status === 'ACCEPTED') {
          fetchJobDetails();
        } else {
          navigate('/worker/jobs');
        }
      } else {
        toastManager.error(response?.message || 'Failed to update job');
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
      setTimeout(() => { actionLoadingRef.current = false; }, 500);
    }
  };

  const handleStatusUpdate = async (type) => {
    if (type === 'visit' && !isVisitModalOpen) {
      if (job.status === 'journey_started') {
        try {
          await workerService.workerReached(id);
          toastManager.success('Customer notified that you reached');
        } catch (e) {
          // Reached notification failed
        }
      }
      setIsVisitModalOpen(true);
      return;
    }

    if (type === 'collect' && !isPaymentModalOpen) {
      setOtpInput(['', '', '', '']);
      setCollectionAmount(job.finalAmount);
      setIsPaymentModalOpen(true);
      return;
    }

    if (type === 'complete' && !isCompletionModalOpen) {
      setIsCompletionModalOpen(true);
      return;
    }

    try {
      setActionLoading(true);
      let response;
      if (type === 'start') {
        response = await workerService.startJob(id);
        navigate(`/worker/job/${id}/map`); // Navigate to map on start
        return;
      } else if (type === 'complete') {
        if (workPhotos.length === 0) {
          toastManager.error('Please upload at least one work photo');
          setActionLoading(false);
          return;
        }
        response = await workerService.completeJob(id, { workPhotos });
      }

      if (response && response.success) {
        toastManager.success(response.message || 'Updated successfully');
        setIsCompletionModalOpen(false);
        setJustCompletedLocally(true);
        fetchJobDetails();
      }
      setActionLoading(false);
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Action failed');
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
        <Header title="Job Details" />
        <main className="px-4 py-6 space-y-4">
          <div className="h-16 bg-white/50 rounded-2xl animate-pulse mb-6"></div>
          <SkeletonCard className="h-32 mb-6" />
          <SkeletonCard className="h-48 mb-6" />
          <SkeletonCard className="h-40" />
        </main>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: themeColors.backgroundGradient }}>
        <div>
          <FiXCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 font-bold text-xl mb-4">Job not found</p>
          <button onClick={() => navigate('/worker/jobs')} className="px-6 py-3 bg-blue-600 text-white rounded-xl">Back to Jobs</button>
        </div>
      </div>
    );
  }

  const getStatusLabel = (status) => {
    const labels = {
      'pending': 'Pending',
      'confirmed': 'Assigned', // Legacy?
      'assigned': 'Assigned',
      'visited': 'Visited',
      'journey_started': 'On The Way',
      'in_progress': 'In Progress',
      'work_done': 'Work Done',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
    };
    return labels[status.toLowerCase()] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': '#F59E0B',
      'confirmed': '#3B82F6',
      'assigned': '#3B82F6',
      'journey_started': '#3B82F6',
      'visited': '#F59E0B',
      'in_progress': '#F59E0B',
      'work_done': '#10B981',
      'completed': '#10B981',
      'cancelled': '#EF4444',
    };
    return colors[status.toLowerCase()] || '#6B7280';
  };

  const isAccepted = job?.workerResponse === 'ACCEPTED' || (job?.workerId && !['requested', 'searching', 'pending'].includes(statusLower));
  const isPendingAcceptance = !isAccepted && job?.workerResponse !== 'REJECTED' && ['requested', 'searching', 'pending', 'confirmed', 'assigned'].includes(statusLower);

  const renderActionButtons = (isSticky = false) => {
    if (isPendingAcceptance) {
      return (
        <div className={`flex gap-3 ${isSticky ? '' : 'mb-4'} animate-in slide-in-from-bottom-2`}>
          <button
            onClick={() => handleJobResponse('REJECTED')}
            disabled={actionLoading}
            className="flex-1 py-3.5 rounded-xl font-bold text-red-500 bg-red-50 border border-red-200 shadow-sm active:scale-95 transition-all text-base"
          >
            DECLINE
          </button>
          <button
            onClick={() => handleJobResponse('ACCEPTED')}
            disabled={actionLoading}
            className="flex-1 py-3.5 rounded-xl font-bold text-white shadow-xl active:scale-95 transition-all text-base flex items-center justify-center gap-2"
            style={{ background: themeColors.button }}
          >
            {actionLoading ? 'Loading...' : <>ACCEPT JOB <FiCheck className="w-5 h-5" /></>}
          </button>
        </div>
      );
    }

    if (isAccepted && (statusLower === 'confirmed' || statusLower === 'assigned')) {
      return (
        <button
          onClick={() => handleStatusUpdate('start')}
          disabled={actionLoading}
          className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all text-lg ${isSticky ? '' : 'mb-4'}`}
          style={{ background: themeColors.button }}
        >
          {actionLoading ? 'Loading...' : <>START JOURNEY <FiNavigation className="w-5 h-5" /></>}
        </button>
      );
    }

    if (statusLower === 'journey_started') {
      return (
        <button
          onClick={() => navigate(`/worker/job/${id}/map`)}
          disabled={actionLoading}
          className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all text-lg ${isSticky ? '' : 'mb-4'}`}
          style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' }}
        >
          <FiNavigation className="w-5 h-5" /> TRACK JOURNEY / REACHED
        </button>
      );
    }

    if (statusLower === 'visited' || statusLower === 'arrived') {
      return (
        <button
          onClick={() => handleStatusUpdate('visit')}
          disabled={actionLoading}
          className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all text-lg ${isSticky ? '' : 'mb-4'}`}
          style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)' }}
        >
          {actionLoading ? 'Loading...' : (isDaily ? <>ENTER TODAY'S REACH OTP <FiCheck className="w-5 h-5" /></> : <>ENTER VISIT OTP <FiCheck className="w-5 h-5" /></>)}
        </button>
      );
    }

    if (statusLower === 'in_progress') {
      return (
        <button
          onClick={() => handleStatusUpdate('complete')}
          disabled={actionLoading}
          className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all text-lg ${isSticky ? '' : 'mb-4'}`}
          style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
        >
          {actionLoading ? 'Loading...' : (isDaily ? <>COMPLETE TODAY'S WORK <FiCheckCircle className="w-5 h-5" /></> : <>COMPLETE WORK <FiCheckCircle className="w-5 h-5" /></>)}
        </button>
      );
    }

    if (statusLower === 'work_done') {
      // NEW FLOW: Farmer already paid upfront at booking time
      if (job.paymentStatus === 'success') {
        return (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-green-800 font-bold mb-1 flex items-center justify-center gap-1.5">
              <FiCheckCircle className="w-4 h-4 text-green-600" />
              <span>Payment Already Received</span>
            </p>
            <p className="text-green-600 text-sm">Farmer paid upfront at booking time. Your earnings will be credited to your wallet.</p>
          </div>
        );
      }
      // OLD FLOW: Payment pending after work done
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-blue-800 font-bold mb-1">Waiting for Farmer to Pay</p>
          <p className="text-blue-600 text-sm">The farmer is selecting the payment method. You'll be notified when they choose cash or online payment.</p>
        </div>
      );
    }

    if (statusLower === 'awaiting_payment') {
      if (job.paymentMethod === 'cash') {
        return (
          <button
            onClick={() => handleStatusUpdate('collect')}
            disabled={actionLoading}
            className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all text-lg ${isSticky ? '' : 'mb-4'}`}
            style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}
          >
            <FiDollarSign className="w-5 h-5" /> COLLECT CASH
          </button>
        );
      } else {
        return (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <p className="text-yellow-800 font-bold mb-1">Waiting for Payment</p>
            <p className="text-yellow-600 text-sm">The farmer is completing the online payment.</p>
          </div>
        );
      }
    }

    if (statusLower === 'completed') {
      const netAmount = (job.workerFinancials?.netEarnings || job.workerNetEarning || (job.finalAmount ? Math.round(job.finalAmount * 0.9) : 0));
      return (
        <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-5 text-center text-emerald-800 shadow-lg">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2 text-emerald-600 shadow-sm">
            <FiCheckCircle className="w-8 h-8" />
          </div>
          <h3 className="font-black text-lg text-emerald-900">Job Completed & Payment Settled</h3>
          <p className="text-xs text-emerald-700 font-medium mt-1 mb-4">
            Your net earnings of ₹{Number(netAmount).toLocaleString('en-IN')} have been credited to your AgroYilt wallet.
          </p>
          {isLiveCompletion ? (
            <button
              onClick={() => navigate('/worker/dashboard', { replace: true })}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3 rounded-xl text-sm shadow-md active:scale-95 transition-all inline-flex items-center gap-2"
            >
              Go to Dashboard ({redirectCountdown}s)
            </button>
          ) : (
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => navigate('/worker/jobs')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md active:scale-95 transition-all"
              >
                Back to My Jobs
              </button>
              <button
                onClick={() => navigate('/worker/wallet')}
                className="bg-white border border-emerald-300 text-emerald-800 font-bold px-4 py-2.5 rounded-xl text-xs shadow-sm hover:bg-emerald-100 active:scale-95 transition-all"
              >
                View in Wallet
              </button>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen pb-40" style={{ background: themeColors.backgroundGradient }}>
      <Header
        title="Job Details"
        showBack={!isLiveCompletion}
        onBack={() => {
          if (location.state?.fromDashboard) {
            navigate('/worker/dashboard');
          } else {
            navigate('/worker/jobs');
          }
        }}
      />

      <main className="px-4 py-6">
        {/* View Timeline Button & Top Action Banner */}
        <div className="mb-6">
          <button
            onClick={() => flutterBridge.navigateTo(`/worker/job/${id}/timeline`, navigate)}
            className="w-full bg-white border border-gray-200 py-3.5 rounded-2xl font-bold text-gray-700 flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all text-base mb-4"
          >
            <FiClock className="w-5 h-5 text-gray-500" />
            View Job Timeline
          </button>

          {/* Extension Response Card (if requested by farmer) */}
          {job?.activeExtension && ['WORKER_EVALUATION', 'REQUESTED'].includes(job.activeExtension.status) && (
            <div className="mb-4">
              <ExtensionResponseCard
                extension={job.activeExtension}
                workerId={currentWorkerId}
                onResponded={() => fetchJobDetails()}
              />
            </div>
          )}

          {/* Daily Schedule Card vs Hourly Stopwatch */}
          {isDaily ? (
            <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-700 text-white rounded-3xl p-5 mb-4 shadow-lg border border-amber-300/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
                    <FiClock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-100 block">Daily Booking Schedule</span>
                    <h3 className="font-black text-lg text-white">
                      Day {job.currentDayIndex || 1} of {job.bookedDays || 1}
                    </h3>
                  </div>
                </div>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm text-xs font-black rounded-xl text-white">
                  ₹{job.agreedRate || job.finalAmount}/day
                </span>
              </div>

              {job.isDecreased && (
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20 text-xs text-amber-100 mb-3">
                  <p className="font-black text-white mb-0.5 flex items-center gap-1.5">
                    <FiAlertTriangle className="w-4 h-4 text-amber-300" />
                    <span>Schedule Concluded After Today</span>
                  </p>
                  <p>The farmer has completed the job schedule. You will be settled for today and worked days once today's Completion OTP is verified.</p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-amber-100 pt-2 border-t border-white/10">
                <span>Completed: <strong className="text-white">{job.workedDays || 0} days</strong></span>
                <span>Status: <strong className="text-white uppercase font-black">{statusLower.replace('_', ' ')}</strong></span>
              </div>
            </div>
          ) : (
            ['in_progress', 'journey_started', 'visited'].includes(statusLower) && (
              <ActiveWorkStopwatch job={job} />
            )
          )}

          {renderActionButtons(false)}
        </div>

        {/* Customer Info Card */}
        <div className="bg-white rounded-2xl p-5 mb-6 shadow-md">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 border-2 border-gray-50">
              <FiUser className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 text-lg">{job.userId?.name || 'Customer'}</h3>
              <p className="text-sm text-gray-500">{job.serviceName}</p>
            </div>
            {job.userId?.phone && (
              <a href={`tel:${job.userId.phone}`} className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm border border-blue-100 active:scale-90 transition-transform">
                <FiPhone className="w-5 h-5" />
              </a>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-50">
            {/* Address Card with Map */}
            <div className="mt-4 bg-blue-50 rounded-xl p-3 border border-blue-100">
              <div className="flex items-start gap-3 mb-3">
                <FiMapPin className="w-5 h-5 mt-0.5 text-blue-600" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-400 uppercase">Service Location</p>
                  <p className="font-semibold text-gray-800 text-sm">
                    {job.address?.addressLine1}, {job.address?.city}
                  </p>
                </div>
              </div>

              {/* Map Embed */}
              <div
                className="w-full h-40 rounded-lg overflow-hidden mb-3 bg-gray-200 border border-blue-100 relative group cursor-pointer"
                onClick={() => navigate(`/worker/job/${id}/map`)}
              >
                {(() => {
                  const fullAddress = `${job.address?.addressLine1 || ''}, ${job.address?.city || ''}`;
                  const mapQuery = encodeURIComponent(fullAddress);

                  return (
                    <>
                      <iframe
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        style={{ border: 0, pointerEvents: 'none' }}
                        src={`https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`}
                        allowFullScreen
                        loading="lazy"
                        tabIndex="-1"
                      ></iframe>
                      {/* Overlay to intercept clicks */}
                      <div className="absolute inset-0 bg-transparent group-hover:bg-black/5 transition-colors flex items-center justify-center">
                        <span className="bg-white/90 px-3 py-1 rounded-full text-xs font-bold text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                          View Route
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              <button
                onClick={() => navigate(`/worker/job/${id}/map`)}
                className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform"
                style={{ background: themeColors.button }}
              >
                <FiNavigation className="w-4 h-4" />
                View Route
              </button>
            </div>

            {/* Rich Work Timeline & Scheduled / Completed Block */}
            {(() => {
              const dur = getDurationInfo(job);
              const isCompleted = ['completed', 'work_done'].includes(statusLower);

              if (isCompleted) {
                return (
                  <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 my-2">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-emerald-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                          <FiClock className="w-4 h-4" />
                        </div>
                        <h4 className="font-bold text-xs text-emerald-900 uppercase tracking-wider">Work Timeline & Duration</h4>
                      </div>
                      {dur?.duration && (
                        <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-full text-xs font-black shadow-sm">
                          ⏱ {dur.duration}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-sm">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Scheduled / Started</p>
                        <p className="font-black text-gray-800 text-sm mt-0.5">{job.scheduledTime || dur?.startTime || 'N/A'}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {new Date(job.scheduledDate || job.createdAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-sm">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completed At</p>
                        <p className="font-black text-emerald-700 text-sm mt-0.5">
                          {dur?.endTime || (job.completedAt ? new Date(job.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A')}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {job.completedAt ? new Date(job.completedAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className="flex items-start gap-3">
                  <FiClock className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Scheduled Time</p>
                    <p className="text-sm text-gray-700 font-medium">
                      {new Date(job.scheduledDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-sm font-bold text-blue-600 mt-0.5">{job.scheduledTime}</p>
                  </div>
                </div>
              );
            })()}

            {/* Agriculture / Drone Specific Details */}
            {(job.landSize || job.cropType || job.chemicalUsed) && (
              <div className="mt-2 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                {job.landSize && (
                  <div className="bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100 flex items-center gap-1.5">
                    <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Area:</span>
                    <span className="text-xs font-black text-emerald-800">{job.landSize}</span>
                  </div>
                )}
                {job.cropType && (
                  <div className="bg-amber-50 px-2.5 py-1 rounded-md border border-amber-100 flex items-center gap-1.5">
                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Crop:</span>
                    <span className="text-xs font-black text-amber-800">{job.cropType}</span>
                  </div>
                )}
                {job.chemicalUsed && (
                  <div className="bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 flex items-center gap-1.5">
                    <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Chem:</span>
                    <span className="text-xs font-black text-blue-800">{job.chemicalUsed}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Booked Services List */}
        {job.items && job.items.length > 0 && (
          <div className="bg-white rounded-2xl p-5 mb-6 shadow-md">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FiTool className="w-5 h-5 text-gray-500" /> Booked Services
            </h4>
            <div className="space-y-4">
              {job.items.map((item, index) => (
                <div key={index} className="flex justify-between items-start border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="font-bold text-gray-800">{item.card?.title || 'Service Item'}</p>
                    <p className="text-xs font-bold text-gray-400 uppercase">{item.sectionTitle || 'General'}</p>
                    {item.card?.features && item.card.features.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.card.features.map((f, i) => (
                          <span key={i} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-gray-900">Qty: {item.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        
          {/* Independent Worker Financials */}
          {job.workerFinancials ? (
            <div className="bg-white rounded-xl p-5 mb-6 shadow-sm border border-emerald-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -z-10 opacity-50" />
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                  <FiDollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">Your Earnings</h3>
                  <p className="text-xs text-slate-500">Worker Payment Breakdown</p>
                </div>
              </div>
              {/* Extension Breakdown Variables */}
              {(() => {
                const extBreakdown = job.workerFinancials?.extensionBreakdown || job.paymentSummary?.extensionBreakdown;
                const hasExt = Boolean(extBreakdown?.hasExtension);
                const baseGross = Number(extBreakdown?.baseGrossAmount ?? (job.workerFinancials.workerOfferedRate || job.workerGrossEarning || job.finalAmount || 0));
                const extGross = Number(extBreakdown?.extensionGrossAmount || 0);
                const totalGross = Number(job.workerFinancials.workerOfferedRate || job.workerGrossEarning || job.finalAmount || 0);
                const commRate = job.workerFinancials.commissionRate || 10;
                const commAmount = Number(job.workerFinancials.commissionAmount ?? Math.round((totalGross * commRate) / 100));
                const netEarning = Number(job.workerFinancials.netEarnings ?? (totalGross - commAmount));
                const extMins = extBreakdown?.extensionMinutes || 0;
                const extDays = extBreakdown?.additionalDays || 0;
                const extDurationLabel = extDays > 0 ? `+${extDays} Day(s)` : `+${extMins} Mins`;

                return (
                  <>
                    <div className="space-y-2.5 mb-4 text-sm">
                      {hasExt ? (
                        <>
                          {/* Base Shift Earnings */}
                          <div className="flex justify-between items-center text-gray-700">
                            <div>
                              <span className="font-semibold text-gray-800 block">Base Shift Earnings</span>
                              <span className="text-[11px] text-gray-400">
                                Scheduled {job.bookingType === 'DAILY' ? `${job.bookedDays || 1} day(s)` : 'shift'} @ ₹{(job.agreedRate || baseGross).toLocaleString('en-IN')}/{job.rateUnit || 'hr'}
                              </span>
                            </div>
                            <span className="font-bold text-gray-900">₹{baseGross.toFixed(2)}</span>
                          </div>

                          {/* Time Extension Pay Card */}
                          <div className="flex justify-between items-center bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <div>
                                <span className="font-bold text-xs text-emerald-950 block">
                                  Time Extension ({extDurationLabel})
                                </span>
                                <span className="text-[10px] text-emerald-700 font-medium">Extension work completed</span>
                              </div>
                            </div>
                            <span className="font-black text-emerald-700 text-sm">
                              +₹{extGross.toFixed(2)}
                            </span>
                          </div>

                          {/* Total Gross */}
                          <div className="flex justify-between items-center text-gray-700 pt-1 border-t border-gray-100">
                            <div>
                              <span className="font-semibold text-gray-800 text-xs uppercase tracking-wide">Total Gross Earnings</span>
                              <span className="text-[10px] text-gray-400 block">Base + Extension</span>
                            </div>
                            <span className="font-bold text-gray-900 text-base">₹{totalGross.toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-gray-600">
                          <span className="font-medium">Agreed Rate (Gross)</span>
                          <span className="font-bold text-gray-800">₹{totalGross.toFixed(2)}</span>
                        </div>
                      )}

                      {/* Platform Fee */}
                      <div className="flex justify-between text-amber-600">
                        <span className="font-medium">Platform Fee ({commRate}%)</span>
                        <span className="font-bold text-red-500">-₹{commAmount.toFixed(2)}</span>
                      </div>

                      {Number(job.extraChargesTotal) > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span className="font-medium">Extra Charges (Added by you)</span>
                          <span className="font-bold text-gray-800">+₹{(job.extraChargesTotal || 0).toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-end pt-3 border-t border-gray-100">
                      <div>
                        <span className="text-gray-900 font-bold block">Net Earnings (To Wallet)</span>
                        {hasExt && (
                          <span className="text-[10px] text-emerald-600 font-medium">
                            Includes ₹{Number(extBreakdown?.extensionNetAmount || 0).toFixed(2)} net from extension
                          </span>
                        )}
                      </div>
                      <span className="text-2xl font-black text-emerald-600">
                        ₹{(netEarning + (job.extraChargesTotal || 0)).toFixed(2)}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <React.Fragment>
              {/* Payment Details - Professional Card (Matched with Vendor) */}

        {/* ?????????????????????????????????????????????????????
          NEW FLOW: Worker Booking Payment Summary
          For WORKER providerType � show agreed rate, commission, net
          For VENDOR/service providerType � show old base price breakdown
          ??????????????????????????????????????????????????????? */}
        {job.providerType === 'WORKER' ? (
          /* ========== WORKER FLOW: Rate Breakdown Card ========== */
          <div
            className="bg-white rounded-xl p-5 mb-6 shadow-sm border border-gray-100"
            style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
              <div className="p-2 rounded-lg bg-emerald-50">
                <FiDollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Job Payment Breakdown</h3>
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  New Flow · Upfront Paid
                </span>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              {job.paymentSummary?.extensionBreakdown?.hasExtension ? (
                <>
                  <div className="flex justify-between items-center text-gray-700">
                    <div>
                      <span className="font-semibold text-gray-800 block">Base Shift Earnings</span>
                      <span className="text-[11px] text-gray-400">Scheduled {job.bookingType === 'DAILY' ? `${job.bookedDays || 1} day(s)` : 'work'}</span>
                    </div>
                    <span className="font-bold text-gray-900">
                      ₹{(job.paymentSummary.extensionBreakdown.baseGrossAmount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                    <span className="font-bold text-xs text-emerald-950">
                      Time Extension ({job.paymentSummary.extensionBreakdown.additionalDays > 0 ? `+${job.paymentSummary.extensionBreakdown.additionalDays} Day(s)` : `+${job.paymentSummary.extensionBreakdown.extensionMinutes} mins`})
                    </span>
                    <span className="font-black text-emerald-700 text-sm">
                      +₹{(job.paymentSummary.extensionBreakdown.extensionGrossAmount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-gray-700 pt-1 border-t border-gray-100">
                    <span className="font-semibold text-xs uppercase tracking-wide">Total Gross Rate</span>
                    <span className="font-bold text-gray-900">
                      ₹{(job.workerGrossEarning || job.agreedRate || job.workerOfferedRate || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </>
              ) : (
                /* Farmer's agreed rate = what farmer paid for this worker */
                <div className="flex justify-between items-center text-gray-700">
                  <span className="font-medium">Worker Agreed Rate</span>
                  <span className="font-bold text-gray-900">
                    ₹{(job.workerGrossEarning || job.agreedRate || job.workerOfferedRate || 0).toLocaleString('en-IN')}
                    <span className="text-xs text-gray-400 ml-1">/{job.rateUnit || 'day'}</span>
                  </span>
                </div>
              )}

              {/* Admin Commission deduction */}
              <div className="flex justify-between items-center text-gray-600">
                <span>Admin Commission ({job.commissionRate || 0}%)</span>
                <span className="font-bold text-red-500">
                  - ₹{(job.commissionAmount || 0).toLocaleString('en-IN')}
                </span>
              </div>

              {/* Divider */}
              <div className="border-t-2 border-dashed border-emerald-200 my-1" />

              {/* Net Earning — what worker actually gets */}
              <div className="flex justify-between items-end">
                <div>
                  <span className="font-black text-emerald-800 block">Your Net Earning</span>
                  {job.paymentSummary?.extensionBreakdown?.hasExtension && (
                    <span className="text-[10px] text-emerald-600 font-medium">
                      Includes ₹{Number(job.paymentSummary.extensionBreakdown.extensionNetAmount || 0).toFixed(2)} from extension
                    </span>
                  )}
                </div>
                <span className="text-2xl font-black text-emerald-700">
                  ₹{(job.workerNetEarning || 0).toLocaleString('en-IN')}
                </span>
              </div>

              {/* Wallet status badge */}
              <div className="pt-1">
                {job.walletCredited ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <span className="text-emerald-600 text-base">&#10003;</span>
                    <div>
                      <p className="text-xs font-black text-emerald-700">Credited to Wallet</p>
                      <p className="text-[10px] text-emerald-600 font-medium">
                        ₹{(job.walletCreditAmount || job.workerNetEarning || 0).toLocaleString('en-IN')} added on job completion
                      </p>
                    </div>
                  </div>
                ) : job.paymentStatus === 'success' ? (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                    <span className="text-blue-500 text-base">&#8987;</span>
                    <div>
                      <p className="text-xs font-black text-blue-700">Will Credit After Job Done</p>
                      <p className="text-[10px] text-blue-600 font-medium">
                        Payment is secured. Complete the job to receive earnings.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                    <span className="text-orange-500 text-base">!</span>
                    <p className="text-xs font-bold text-orange-700">Farmer payment pending</p>
                  </div>
                )}
              </div>

              {/* Rate unit info */}
              <p className="text-[10px] text-gray-400 text-center pt-1">
                Rate unit: {job.rateUnit || 'daily'} � Booking: {job.bookingNumber}
              </p>
            </div>
          </div>
        ) : (
          /* ========== VENDOR/SERVICE FLOW: Old breakdown ========== */
          <div
            className="bg-white rounded-xl p-5 mb-6 shadow-sm border border-gray-100"
            style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)' }}
          >
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
              <div className={`p-2 rounded-lg ${job.paymentMethod === 'plan_benefit' ? 'bg-amber-100' : 'bg-gray-100'}`}>
                <FiDollarSign className="w-5 h-5" style={{ color: job.paymentMethod === 'plan_benefit' ? '#d97706' : themeColors.button }} />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">
                  {job.paymentMethod === 'plan_benefit' ? 'Plan Benefit Summary' : 'Payment Summary'}
                </h3>
                {job.paymentMethod === 'plan_benefit' && (
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                    Plan Membership Active
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center text-gray-600">
                <span>Base Price</span>
                {job.paymentMethod === 'plan_benefit' ? (
                  <div className="flex items-center gap-2">
                    <span className="line-through text-gray-400 text-xs">₹{(job.basePrice || 0).toFixed(2)}</span>
                    <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE</span>
                  </div>
                ) : (
                  <span>₹{(job.basePrice || 0).toFixed(2)}</span>
                )}
              </div>

              {(job.tax > 0 || job.paymentMethod === 'plan_benefit') && (
                <div className="flex justify-between items-center text-gray-600">
                  <span>Tax</span>
                  {job.paymentMethod === 'plan_benefit' ? (
                    <div className="flex items-center gap-2">
                      <span className="line-through text-gray-400 text-xs">₹{(job.tax || 0).toFixed(2)}</span>
                      <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE</span>
                    </div>
                  ) : (
                    <span>+₹{(job.tax || 0).toFixed(2)}</span>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center text-gray-600">
                <span>Convenience Fee</span>
                {job.paymentMethod === 'plan_benefit' ? (
                  <div className="flex items-center gap-2">
                    <span className="line-through text-gray-400 text-xs">₹{(job.visitingCharges || 0).toFixed(2)}</span>
                    <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE</span>
                  </div>
                ) : (
                  <span className={`font-medium ${(job.visitingCharges || 0) === 0 ? 'text-gray-400 font-normal italic' : 'text-gray-900'}`}>
                    {(job.visitingCharges || 0) === 0 ? 'Not Added' : `+₹${(job.visitingCharges || 0).toFixed(2)}`}
                  </span>
                )}
              </div>

              {job.paymentMethod !== 'plan_benefit' && job.discount > 0 && (
                <div className="flex justify-between text-green-600 font-medium">
                  <span>Discount</span>
                  <span>-₹{(job.discount || 0).toFixed(2)}</span>
                </div>
              )}

              {job.extraCharges && job.extraCharges.length > 0 && (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Extra Charges (User Pays)</p>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                    {job.extraCharges.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-gray-700 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-bold bg-white border px-1.5 rounded text-gray-500">x{item.quantity || 1}</span>
                          <span>{item.name}</span>
                        </span>
                        <span className="font-medium">+₹{(item.total || item.price || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-blue-600 pt-2 mt-2 border-t border-gray-200">
                      <span>Subtotal Extras</span>
                      <span>+₹{(job.extraChargesTotal || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="my-4 border-t border-gray-200"></div>
              <div className="flex justify-between items-end mb-2">
                <span className="text-gray-900 font-bold">Total Amount (User Pays)</span>
                <span className="text-2xl font-bold text-gray-900">
                  ₹{(job.paymentMethod === 'plan_benefit' ? (job.extraChargesTotal || 0) : (job.finalAmount || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}
            </React.Fragment>
          )}

        {/* Booking Details Extra */}
        <div className="bg-gray-50 rounded-2xl p-5 shadow-inner mb-6 border border-gray-100">
          <div className="flex justify-between text-xs font-bold text-gray-400 uppercase mb-4">
            <span>Booking Number</span>
            <span className="text-gray-600">{job.bookingNumber}</span>
          </div>

          {job.status === 'completed' && (
            <div className="space-y-2 border-t border-gray-200/60 pt-3">
              <div className="flex justify-between items-center text-xs font-bold text-gray-400 uppercase">
                <span>Completed At</span>
                <span className="text-gray-700 font-semibold">{new Date(job.completedAt || job.updatedAt).toLocaleString('en-IN')}</span>
              </div>
              {(() => {
                const dur = getDurationInfo(job);
                if (dur?.duration) {
                  return (
                    <div className="flex justify-between items-center text-xs font-bold text-gray-400 uppercase">
                      <span>Total Work Duration</span>
                      <span className="text-emerald-700 font-black bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 shadow-sm">
                        ⏱ {dur.duration}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      </main>

      {/* Sticky Bottom Action Bar for Mobile */}
      {statusLower !== 'completed' && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-2xl z-40 max-w-md mx-auto">
          {renderActionButtons(true)}
        </div>
      )}

      {/* Unified Worker Completion Modal - REUSABLE COMPONENT */}
      <Suspense fallback={null}>
        <WorkCompletionModal
          isOpen={isCompletionModalOpen}
          onClose={() => setIsCompletionModalOpen(false)}
          job={job}
          loading={actionLoading}
          onComplete={async (photos, otp) => {
            try {
              setActionLoading(true);
              const response = await workerService.completeJob(id, { workPhotos: photos, otp });
              if (response && response.success) {
                toastManager.success(response.message || 'Job Completed successfully');
                setIsCompletionModalOpen(false);
                setJustCompletedLocally(true);
                fetchJobDetails();
              } else {
                toastManager.error(response?.message || 'Failed to complete job');
              }
            } catch (error) {
              toastManager.error(error.response?.data?.message || 'Failed to complete job');
            } finally {
              setActionLoading(false);
            }
          }}
        />
      </Suspense>

      

          {/* Visit OTP Modal - REUSABLE COMPONENT */}
      <Suspense fallback={null}>
        <VisitVerificationModal
          isOpen={isVisitModalOpen}
          onClose={() => setIsVisitModalOpen(false)}
          bookingId={id}
          onSuccess={() => {
            setIsVisitModalOpen(false);
            fetchJobDetails();
          }}
        />
      </Suspense>

      {/* Unified Cash Collection Modal - REUSABLE COMPONENT */}
      <Suspense fallback={null}>
        <CashCollectionModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          booking={job}
          onInitiateOTP={handleInitiateCashOTP}
          onConfirm={handleConfirmCash}
          loading={actionLoading}
        />
      </Suspense>
    </div>
  );
};

export default JobDetails;

