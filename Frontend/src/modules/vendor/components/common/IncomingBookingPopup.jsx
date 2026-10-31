import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiCheck, FiX, FiMapPin, FiClock } from 'react-icons/fi';
import api from '../../../../services/api';
import { toastManager } from '../../../../utils/toastManager';
import { formatRentalReturn } from '../../../../utils/rentalReturn';

const IncomingBookingPopup = () => {
  const [incomingData, setIncomingData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const audioRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleIncomingBooking = (e) => {
      console.log('[BOOKING] Incoming booking alert received');
      setIncomingData(e.detail);
      
      // Initialize and play sound
      if (!audioRef.current) {
        audioRef.current = new Audio('/bookingSound.mp3');
        audioRef.current.loop = true;
      }
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("Audio autoplay blocked by browser, user interaction needed:", error);
        });
      }
    };

    window.addEventListener('vendorIncomingBooking', handleIncomingBooking);
    
    return () => {
      window.removeEventListener('vendorIncomingBooking', handleIncomingBooking);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  const stopSoundAndClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIncomingData(null);
  };

  const handleAction = async (action) => {
    if (!incomingData?.relatedId) return;
    setIsProcessing(true);
    
    try {
      const res = await api.put(`/vendor/equipment/bookings/${incomingData.relatedId}/respond`, { action });
      if (res.data?.success) {
        toastManager.success(`Booking ${action === 'accept' ? 'accepted' : 'rejected'} successfully!`);
        window.dispatchEvent(new Event('vendorJobsUpdated')); // Refresh list
        stopSoundAndClose();
        if (action === 'accept') {
          navigate(`/vendor/booking/${incomingData.relatedId}`);
        }
      } else {
        toastManager.error(res.data?.message || 'Failed to process action');
      }
    } catch (err) {
      console.error(`Error ${action}ing booking:`, err);
      toastManager.error(err?.response?.data?.message || 'Something went wrong');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!incomingData) return null;

  // Extract relevant details
  const details = incomingData.data || {};
  const bookingId = incomingData.relatedId;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: "100%", opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden relative"
        >
          {/* Pulsing ring effect behind header */}
          <div className="absolute top-0 left-0 w-full h-32 bg-green-50 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-green-500/20 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-green-500/30 rounded-full animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.5s' }} />
          </div>
          
          <div className="relative pt-8 pb-6 px-6 text-center border-b border-gray-100 bg-white/90 backdrop-blur-md z-10">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
              <span className="text-3xl">🔔</span>
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">New Booking!</h2>
            <p className="text-green-600 font-bold text-sm mt-1 uppercase tracking-wide">Tap to respond quickly</p>
          </div>

          <div className="p-6 bg-gray-50/50 space-y-4 relative z-10">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{details.customerName || 'Customer'}</h3>
                  <p className="text-sm font-medium text-gray-500 flex items-center gap-1 mt-0.5">
                    <FiMapPin className="text-gray-400" />
                    {details.distance ? `${Number(details.distance).toFixed(1)} km away` : 'Nearby'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400 font-bold uppercase block mb-0.5">Earnings</span>
                  <span className="text-xl font-black text-gray-900 tracking-tight">₹{details.price || '--'}</span>
                </div>
              </div>
              
              <div className="pt-3 border-t border-gray-100 mt-2">
                <p className="text-gray-700 font-semibold mb-1">{details.serviceName || 'Machinery Service'}</p>
                <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
                  <FiClock className="text-gray-400" />
                  {details.scheduledDate} {details.scheduledTime ? `at ${details.scheduledTime}` : ''}
                </p>
                {formatRentalReturn(details) && (
                  <p className="text-xs text-emerald-700 font-bold mt-1">{formatRentalReturn(details)}</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleAction('reject')}
                disabled={isProcessing}
                className="flex-1 py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <FiX className="text-xl" />
                Reject
              </button>
              <button
                onClick={() => handleAction('accept')}
                disabled={isProcessing}
                className="flex-[2] py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black text-lg shadow-lg shadow-green-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <FiCheck className="text-xl" />
                    Accept
                  </>
                )}
              </button>
            </div>
            
            <button 
              onClick={() => {
                stopSoundAndClose();
                navigate(`/vendor/booking/${bookingId}`);
              }}
              className="w-full mt-2 py-3 text-gray-500 text-sm font-bold hover:text-gray-700 transition-colors"
            >
              View Full Details Instead
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default IncomingBookingPopup;
