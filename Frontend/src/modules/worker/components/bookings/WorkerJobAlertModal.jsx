import React, { useState, useEffect } from 'react';
import { FiX, FiMapPin, FiClock, FiArrowRight, FiBell, FiBriefcase, FiMinimize2 } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { playAlertRing, stopAlertRing } from '../../../../utils/notificationSound';
import workerService from '../../../../services/workerService';
import { toastManager } from '../../../../utils/toastManager';

const WorkerJobAlertModal = ({ isOpen, jobId, onClose, onJobAccepted }) => {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && jobId) {
      loadJobDetails();
      playAlertRing(true);
    } else {
      stopAlertRing();
      setJob(null);
    }
    return () => stopAlertRing();
  }, [isOpen, jobId]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (!isOpen || !jobId) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [isOpen, jobId]);

  const loadJobDetails = async () => {
    try {
      setLoading(true);
      const res = await workerService.getJobById(jobId);
      if (res.success) {
        setJob(res.data);
      }
    } catch (error) {
      console.error(error);
      toastManager.error('Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    try {
      const res = await workerService.respondToJob(jobId, 'ACCEPTED');
      if (res.success) {
        toastManager.success('Job Accepted Successfully!');
        onJobAccepted && onJobAccepted(jobId);
        onClose();
      } else {
        toastManager.error(res.message || 'Failed to accept job');
      }
    } catch (error) {
      toastManager.error('Failed to accept job');
    }
  };

  const handleReject = async () => {
    try {
      const res = await workerService.respondToJob(jobId, 'REJECTED');
      if (res.success) {
        toastManager.success('Job Declined');
        onClose();
      } else {
        toastManager.error(res.message || 'Failed to reject job');
      }
    } catch (error) {
      toastManager.error('Failed to decline job');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 40 }}
          className="bg-white w-full max-w-sm rounded-[3rem] overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] relative"
        >
          {/* Minimal Header */}
          <button
            onClick={() => {
              stopAlertRing();
              onClose();
            }}
            className="absolute top-4 right-4 z-50 p-2 bg-black/20 hover:bg-black/30 backdrop-blur-md rounded-full text-white transition-all active:scale-95"
            title="Close"
          >
            <FiX className="w-5 h-5" />
          </button>

          {/* Header Section */}
          <div className="relative h-44 bg-gradient-to-br from-blue-900 to-indigo-900 flex flex-col items-center justify-center pt-4">
            {/* Animated background elements */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute -top-10 -left-10 w-40 h-40 bg-white rounded-full"
              />
            </div>

            <div className="relative z-10 mb-3">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-[1.5rem] border border-white/20 flex items-center justify-center shadow-lg relative">
                <FiBriefcase className="w-7 h-7 text-white animate-bounce" />
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
              </div>
            </div>

            <h2 className="relative z-10 text-white text-2xl font-black tracking-tight">New Job Assigned!</h2>
            <div className="relative z-10 px-4 py-1 mt-1 bg-white/20 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest">
              Action Required
            </div>
          </div>

          {/* Body Section */}
          <div className="px-6 py-6 min-h-[250px] flex flex-col justify-center">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 font-medium">Loading details...</p>
              </div>
            ) : job ? (
              <>
                {/* Booking Card Details */}
                <div className="bg-gray-50 rounded-[2rem] p-5 border border-gray-100 space-y-4 mb-6">
                  {/* Service Row */}
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-xl shadow-sm border border-gray-100">
                      {job.serviceId?.iconUrl ? <img src={job.serviceId.iconUrl} className="w-8 h-8 object-contain" /> : <FiBriefcase className="w-6 h-6 text-amber-500" />}
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-gray-900 leading-none">{job.serviceType || job.serviceId?.title || 'Service'}</h4>
                      <p className="text-[11px] font-bold text-blue-600 mt-1">{job.customerName || job.userId?.name}</p>
                    </div>
                  </div>

                  <div className="h-px bg-gray-200/50 w-full" />

                  {/* Info Rows */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-white rounded-xl shadow-xs border border-gray-100">
                        <FiMapPin className="text-gray-400 w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location</p>
                        <p className="text-sm font-bold text-gray-800 line-clamp-2">
                          {typeof job.address === 'string' ? job.address : (job.address?.addressLine1 || job.location?.address)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-white rounded-xl shadow-xs border border-gray-100">
                        <FiClock className="text-gray-400 w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Time</p>
                        <p className="text-sm font-bold text-gray-800">{job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString() : 'Today'} ? {job.scheduledTime || 'Flexible'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleAccept}
                    className="w-full py-4 rounded-[1.5rem] bg-blue-900 hover:bg-blue-800 text-white font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 group"
                  >
                    Accept Job
                    <FiArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button
                    onClick={handleReject}
                    className="w-full py-4 rounded-[1.5rem] bg-red-100 hover:bg-red-200 text-red-600 font-bold text-sm active:scale-95 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    Decline
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-red-500 font-bold">Failed to load job data.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default WorkerJobAlertModal;
