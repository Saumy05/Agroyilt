import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiCheck, FiClock, FiUser, FiMapPin, FiTool, FiDollarSign, FiCheckCircle, FiX, FiNavigation } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import { CashCollectionModal, WorkCompletionModal } from '../../components/common';
import workerService from '../../../../services/workerService';
import { toastManager } from '../../../../utils/toastManager';

const JobTimeline = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [currentStage, setCurrentStage] = useState(1);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isWorkDoneModalOpen, setIsWorkDoneModalOpen] = useState(false);
  const [otpInput, setOtpInput] = useState(['', '', '', '']);
  const [actionLoading, setActionLoading] = useState(false);
  const [workPhotos, setWorkPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  useLayoutEffect(() => {
    const bgStyle = themeColors.backgroundGradient;
    document.documentElement.style.background = bgStyle;
    document.body.style.background = bgStyle;
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, []);

  useEffect(() => {
    fetchJobDetails();

    const handleUpdate = () => fetchJobDetails();
    window.addEventListener('workerJobsUpdated', handleUpdate);

    return () => window.removeEventListener('workerJobsUpdated', handleUpdate);
  }, [id]);

  const fetchJobDetails = async () => {
    try {
      const response = await workerService.getJobById(id);
      if (response.success) {
        const apiData = response.data;
        setJob(apiData);
        determineStage(apiData.status, apiData);
      }
    } catch (error) {
      console.error('Error fetching job:', error);
      toastManager.error('Failed to load job details');
    }
  };

  const determineStage = (status, jobData) => {
    const isPaid = jobData?.isWorkerPaid || jobData?.workerPaymentStatus === 'PAID' || jobData?.workerPaymentStatus === 'SUCCESS';
    const isSettled = jobData?.finalSettlementStatus === 'DONE';
    const customerPaid = jobData?.cashCollected || jobData?.paymentStatus === 'SUCCESS' || jobData?.paymentStatus === 'success';

    switch (status) {
      case 'confirmed':
      case 'assigned':
      case 'accepted':
        setCurrentStage(1);
        break;
      case 'journey_started': setCurrentStage(2); break;
      case 'visited':
      case 'in_progress': setCurrentStage(3); break;
      case 'work_done':
        if (jobData?.assignmentId) setCurrentStage(3); // stopped, waiting for the farmer's End OTP
        else if (customerPaid) setCurrentStage(6); // Move to Vendor Approval
        else setCurrentStage(5); // Go to Customer Payment
        break;
      case 'completed':
        if (isSettled) setCurrentStage(11);
        else if (isPaid) setCurrentStage(9);
        else setCurrentStage(8);
        break;
      default: setCurrentStage(1);
    }
  };

  const handleAction = async (type) => {
    try {
      setActionLoading(true);
      if (type === 'start') {
        const res = await workerService.startJob(id);
        if (res.success) {
          toastManager.success('Journey Started');
          fetchJobDetails();
        }
      }
      setActionLoading(false);
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Action failed');
      setActionLoading(false);
    }
  };

  const handleRequestPayment = () => {
    toastManager.success('Payment request sent to Vendor', {
      style: { borderRadius: '10px', background: '#333', color: '#fff' },
    });
  };

  const handleConfirmSettlement = async () => {
    if (window.confirm("Confirm that you have received all payments and finalize this job?")) {
      try {
        setActionLoading(true);
        await workerService.updateJobStatus(id, job.status, { finalSettlementStatus: 'DONE' });
        toastManager.success('Final settlement confirmed');
        fetchJobDetails();
      } catch (e) {
        toastManager.error('Failed to confirm settlement');
      } finally {
        setActionLoading(false);
      }
    }
  };

  const verifyVisit = async () => {
    const otp = otpInput.join('');
    if (otp.length !== 4) return toastManager.error('Enter 4-digit OTP');

    setActionLoading(true);
    if (!navigator.geolocation) {
      setActionLoading(false);
      return toastManager.error('Geolocation required');
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        const response = await workerService.verifyVisit(id, otp, location);
        if (response.success) {
          toastManager.success('Visit Verified');
          setIsVisitModalOpen(false);
          setOtpInput(['', '', '', '']);
          fetchJobDetails();
        }
      } catch (error) {
        toastManager.error(error.response?.data?.message || 'Verification failed');
      } finally {
        setActionLoading(false);
      }
    });
  };

  const handleCompleteJob = async () => {
    if (workPhotos.length === 0) {
      // Allow mocking for now if no photo upload UI present in modal
    }
    try {
      setActionLoading(true);
      const response = await workerService.completeJob(id, { workPhotos: workPhotos.length > 0 ? workPhotos : ['https://placehold.co/400'] });
      if (response.success) {
        toastManager.success('Work marked done');
        setIsWorkDoneModalOpen(false);
        fetchJobDetails();
      }
    } catch (error) {
      toastManager.error(error.response?.data?.message || 'Completion failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInitiateOTP = async (totalAmount, extraItems = []) => {
    try {
      setActionLoading(true);
      const res = await workerService.initiateCashCollection(id, totalAmount, extraItems);
      if (res.success) {
        return res;
      } else {
        throw new Error(res.message || 'Failed to send OTP');
      }
    } catch (err) {
      console.error('Initiate cash error:', err);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleCollectCash = async (totalAmount, extraItems, otp) => {
    try {
      setActionLoading(true);
      const response = await workerService.collectCash(id, otp, totalAmount, extraItems);
      if (response.success) {
        toastManager.success('Payment Collected & Job Completed!');
        setIsPaymentModalOpen(false);
        fetchJobDetails();
      }
    } catch (error) {
      console.error('Confirm cash error:', error);
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  // Auto-verify as last digit enters
  useEffect(() => {
    const otpValue = otpInput.join('');
    if (otpValue.length === 4 && !actionLoading && isVisitModalOpen) {
      verifyVisit();
    }
  }, [otpInput]);

  const handleOtpChange = (index, value) => {
    if (value.length > 1) return;
    const newOtp = [...otpInput];
    newOtp[index] = value;
    setOtpInput(newOtp);
    if (value && index < 3) document.getElementById(`otp-${index + 1}`).focus();
  };

  const isPending = (job?.status === 'assigned' || job?.status === 'confirmed' || job?.status === 'pending') && job?.workerResponse !== 'ACCEPTED';

  const timelineStages = [
    {
      id: 1,
      title: isPending ? 'Job Assigned' : 'Job Accepted',
      icon: isPending ? FiUser : FiCheck,
      action: isPending
        ? () => navigate(`/worker/job/${id}`)
        : (currentStage === 1 ? () => handleAction('start') : null),
      actionLabel: isPending ? 'View & Respond' : 'Start Journey',
      description: isPending ? 'New job assigned. Waiting for response.' : 'You have accepted the job. Ready to start.',
      timestamp: job?.workerAcceptedAt || job?.assignedAt
    },
    {
      id: 2,
      title: 'Journey Started',
      icon: FiNavigation,
      action: currentStage === 2 ? () => setIsVisitModalOpen(true) : null,
      actionLabel: 'Verify Arrival (OTP)',
      description: 'On the way to customer location.',
      timestamp: job?.journeyStartedAt
    },
    {
      id: 3,
      title: 'Site Visit',
      icon: FiMapPin,
      // farmer-worker jobs stop and complete via the End OTP flow on the job screen
      action: currentStage === 3
        ? (job?.assignmentId ? () => navigate(`/worker/job/${id}`) : () => setIsWorkDoneModalOpen(true))
        : null,
      actionLabel: job?.assignmentId ? 'Stop Work / End OTP' : 'Mark workdone',
      description: 'Work in progress at site.',
      timestamp: job?.visitedAt
    },
    {
      id: 4,
      title: 'Work Done',
      icon: FiTool,
      action: null,
      description: 'Service work marked as completed.',
      timestamp: job?.updatedAt
    },
    {
      id: 5,
      title: 'Customer Payment',
      icon: FiDollarSign,
      action: currentStage === 5 && !job?.cashCollected && job?.paymentMode === 'CASH' ? () => setIsPaymentModalOpen(true) : null,
      actionLabel: 'Collect Cash',
      description: job?.cashCollected ? 'Cash collected successfully.' : (job?.paymentMode === 'CASH' ? 'Pending cash collection.' : 'Online payment verified.'),
      timestamp: null
    },
    {
      id: 6,
      title: 'Vendor Approval',
      icon: FiUser,
      action: null,
      description: 'Waiting for vendor to review and approve work.',
      timestamp: null
    },
    {
      id: 7,
      title: 'Job Completed',
      icon: FiCheckCircle,
      action: null,
      description: 'Job marked as completed.',
      timestamp: job?.completedAt
    },
    {
      id: 8,
      title: 'Worker Payment',
      icon: FiDollarSign,
      action: (currentStage === 8 && !(job?.isWorkerPaid || job?.workerPaymentStatus === 'PAID' || job?.workerPaymentStatus === 'SUCCESS')) ? handleRequestPayment : null,
      actionLabel: 'Ask Vendor for Payment',
      description: (job?.isWorkerPaid || job?.workerPaymentStatus === 'PAID' || job?.workerPaymentStatus === 'SUCCESS') ? 'Payment received successfully.' : 'Waiting for vendor to release payment.',
    },
    {
      id: 9,
      title: 'Final Settlement',
      icon: FiCheckCircle,
      action: currentStage === 9 ? handleConfirmSettlement : null,
      actionLabel: 'Confirm Settlement',
      description: job?.finalSettlementStatus === 'DONE' ? 'Final settlement done.' : 'Waiting for vendor confirmation.',
    },
    {
      id: 10,
      title: 'Job Closed',
      icon: FiCheckCircle,
      action: null,
      description: 'Final settlement done. Job closed.',
    }
  ];

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Job Timeline" />

      <main className="px-4 py-8">
        <div
          className="bg-white/90 backdrop-blur-md rounded-3xl p-8 shadow-2xl relative overflow-hidden"
          style={{
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl"></div>

          <div className="relative">
            {timelineStages.map((stage, index) => {
              const IconComponent = stage.icon;
              const isCompleted = stage.id < currentStage;
              const isCurrent = stage.id === currentStage;

              return (
                <div key={stage.id} className="relative pb-10 last:pb-0">
                  {index < timelineStages.length - 1 && (
                    <div
                      className="absolute left-[23px] top-12 w-0.5 h-full opacity-20"
                      style={{
                        background: isCompleted ? `linear-gradient(to bottom, ${themeColors.button}, #E5E7EB)` : '#E5E7EB',
                        backgroundColor: isCompleted ? themeColors.button : '#E5E7EB'
                      }}
                    />
                  )}

                  <div className="flex items-start gap-6 relative">
                    {/* Ripple effect for current stage */}
                    {isCurrent && (
                      <div className="absolute left-0 top-0 w-12 h-12 rounded-full animate-ping bg-blue-400/20"></div>
                    )}

                    <div
                      className="relative z-10 w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-500 ease-out"
                      style={{
                        background: isCompleted ? themeColors.button : isCurrent ? '#fff' : '#F9FAFB',
                        border: `2px solid ${isCompleted || isCurrent ? themeColors.button : '#F3F4F6'}`,
                        boxShadow: isCurrent ? `0 10px 20px ${themeColors.button}30` : 'none',
                        color: isCompleted ? '#fff' : isCurrent ? themeColors.button : '#9CA3AF',
                        transform: isCurrent ? 'scale(1.1) translateY(-2px)' : 'scale(1)',
                      }}
                    >
                      {isCompleted ? <FiCheck className="w-6 h-6" /> : <IconComponent className="w-6 h-6" />}
                    </div>

                    <div className="flex-1 pt-1">
                      <h3 className={`font-bold text-lg tracking-tight ${isCompleted || isCurrent ? 'text-gray-900' : 'text-gray-400'}`}>
                        {stage.title}
                      </h3>
                      <p className={`text-sm leading-relaxed transition-colors duration-300 ${isCurrent ? 'text-gray-600 font-medium' : 'text-gray-500'}`}>
                        {stage.description}
                      </p>

                      {stage.timestamp && (
                        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mt-2 flex items-center gap-1">
                          <FiClock className="w-3 h-3" />
                          {new Date(stage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ? {new Date(stage.timestamp).toLocaleDateString()}
                        </p>
                      )}

                      {stage.action && (
                        <button
                          onClick={stage.action}
                          disabled={actionLoading}
                          className="group relative px-6 py-2.5 rounded-xl font-bold text-white text-sm shadow-lg overflow-hidden transition-all duration-300 active:scale-95 hover:shadow-xl mt-4 inline-flex items-center gap-2"
                          style={{ background: themeColors.button }}
                        >
                          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                          {actionLoading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          ) : stage.id === 9 ? <FiCheckCircle /> : null}
                          <span className="relative z-10">{actionLoading ? 'Processing...' : stage.actionLabel}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Modals reused from JobDetails but simplified */}
      {/* Verify Visit Modal */}
      {isVisitModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
            <div className="flex justify-between mb-4">
              <h3 className="font-bold text-lg">Verify Arrival</h3>
              <button onClick={() => setIsVisitModalOpen(false)}><FiX /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Enter customer OTP</p>
            <div className="flex gap-2 justify-center mb-6">
              {[0, 1, 2, 3].map(i => (
                <input key={i} id={`otp-${i}`} type="number" className="w-12 h-12 border rounded text-center text-xl"
                  value={otpInput[i]} onChange={e => handleOtpChange(i, e.target.value)} maxLength={1} />
              ))}
            </div>
            <button onClick={verifyVisit} disabled={actionLoading} className="w-full py-3 rounded-xl text-white font-bold" style={{ background: themeColors.button }}>
              {actionLoading ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </div>
      )}

      {/* Work Done Modal - Reused Component */}
      <WorkCompletionModal
        isOpen={isWorkDoneModalOpen}
        onClose={() => setIsWorkDoneModalOpen(false)}
        job={job}
        onComplete={async (photos) => {
          try {
            setActionLoading(true);
            const response = await workerService.completeJob(id, { workPhotos: photos });
            if (response.success) {
              toastManager.success('Work marked done');
              setIsWorkDoneModalOpen(false);
              fetchJobDetails();
            }
          } catch (error) {
            toastManager.error(error.response?.data?.message || 'Completion failed');
          } finally {
            setActionLoading(false);
          }
        }}
        loading={actionLoading}
      />

      {/* Unified Cash Collection Modal */}
      <CashCollectionModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        booking={job}
        onInitiateOTP={handleInitiateOTP}
        onConfirm={handleCollectCash}
        loading={actionLoading}
      />
    </div>
  );
};

export default JobTimeline;
