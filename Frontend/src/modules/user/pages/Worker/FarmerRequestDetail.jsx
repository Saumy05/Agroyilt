import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  FiArrowLeft, FiClock, FiMapPin, FiUsers, FiCalendar,
  FiCheck, FiX, FiXCircle, FiAlertCircle, FiRefreshCcw, FiCreditCard,
  FiNavigation, FiStar, FiPhone
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import workerBookingService from '../../../../services/workerBookingService';

const STATUS_CONFIG = {
  pending:                    { color: 'bg-amber-100 text-amber-700 border-amber-200',    label: 'Waiting for Responses' },
  matching:                   { color: 'bg-blue-100 text-blue-700 border-blue-200',       label: 'Matching Workers...'    },
  awaiting_farmer_confirmation:{ color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Select Workers to Book' },
  confirmed:                  { color: 'bg-emerald-100 text-emerald-700 border-emerald-200',label: 'Confirmed'             },
  rejected:                   { color: 'bg-red-100 text-red-700 border-red-200',          label: 'No Workers Available'   },
  cancelled:                  { color: 'bg-slate-100 text-slate-700 border-slate-200',    label: 'Cancelled'              },
  expired:                    { color: 'bg-slate-100 text-slate-600 border-slate-200',    label: 'Expired'                },
};

const FarmerRequestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const handleCancelConfirm = async () => {
    try {
      setCancelling(true);
      setIsCancelModalOpen(false);
      await workerBookingService.cancelFarmerRequest(id);
      toast.success('Request cancelled successfully');
      navigate('/user/my-worker-requests', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const fetchRequest = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await workerBookingService.getFarmerRequestById(id);
      setRequest(res.data);
    } catch (err) {
      if (!silent) toast.error('Failed to load request details.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRequest();
    const interval = setInterval(() => {
      if (request && ['pending', 'matching', 'awaiting_farmer_confirmation'].includes(request.status)) {
        fetchRequest(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchRequest, request?.status]);

  // Real-time listener for team members accepting or declining
  useEffect(() => {
    const handleTeamMemberUpdate = (e) => {
      const detail = e.detail || {};
      if (!detail.requestId || String(detail.requestId) === String(id)) {
        fetchRequest(true);
        if (detail.message) {
          toast.success(detail.message);
        }
      }
    };

    const handleUserBookingsUpdate = () => {
      fetchRequest(true);
    };

    window.addEventListener('team_member_status_updated', handleTeamMemberUpdate);
    window.addEventListener('userBookingsUpdated', handleUserBookingsUpdate);
    window.addEventListener('userNotificationsUpdated', handleUserBookingsUpdate);
    return () => {
      window.removeEventListener('team_member_status_updated', handleTeamMemberUpdate);
      window.removeEventListener('userBookingsUpdated', handleUserBookingsUpdate);
      window.removeEventListener('userNotificationsUpdated', handleUserBookingsUpdate);
    };
  }, [id, fetchRequest]);

  const toggleWorkerSelection = (workerId) => {
    setSelectedWorkerIds(prev => {
      if (prev.includes(workerId)) {
        if (prev.length <= 1) {
          toast.error('At least 1 worker must be selected.');
          return prev;
        }
        return prev.filter(id => id !== workerId);
      }
      if (prev.length >= request.requiredWorkers) {
         toast.error(`You can only select up to ${request.requiredWorkers} workers.`);
         return prev;
      }
      return [...prev, workerId];
    });
  };

  const handleProceedToPayment = async () => {
    if (selectedWorkerIds.length === 0) {
       toast.error('Please select at least one worker to proceed.');
       return;
    }
    try {
       setProcessing(true);
       await workerBookingService.selectWorkersForBooking(id, selectedWorkerIds);
       navigate(`/user/worker-booking-payment/${id}`);
    } catch (error) {
       toast.error(error?.response?.data?.message || 'Failed to process selection.');
    } finally {
       setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this work request? Workers who were notified will be informed.')) return;
    try {
      setCancelling(true);
      await workerBookingService.cancelFarmerRequest(id);
      toast.success('Request cancelled.');
      navigate('/user/my-worker-requests', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to cancel request.');
    } finally {
      setCancelling(false);
    }
  };

  const isTeamLeaderMode = Boolean(
    request && (request.bookingMode === 'TEAM_LEADER' || request.requestType === 'team_leader')
  );

  useEffect(() => {
    if (request && isTeamLeaderMode && Array.isArray(request.workerOffers) && request.workerOffers.length > 0) {
      const allIds = request.workerOffers.map(o => o.workerId?._id || o.workerId).filter(Boolean);
      if (allIds.length > 0) {
        setSelectedWorkerIds(prev => {
          if (prev.length > 0) {
            const validPrev = prev.filter(id => allIds.includes(id));
            return validPrev.length > 0 ? validPrev : allIds;
          }
          return allIds;
        });
      }
    }
  }, [request, isTeamLeaderMode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <FiAlertCircle size={48} className="text-slate-400 mb-3" />
        <h2 className="text-xl font-bold text-slate-800 mb-1">Request Not Found</h2>
        <p className="text-slate-500 text-sm mb-6">Could not load the work request details.</p>
        <button
          onClick={() => navigate('/user/my-worker-requests')}
          className="px-6 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-bold"
        >
          My Requests
        </button>
      </div>
    );
  }

  const statusConf = STATUS_CONFIG[request.status] || { color: 'bg-slate-100', label: request.status };
  const canCancel = ['pending', 'matching', 'awaiting_farmer_confirmation'].includes(request.status);

  // Safely get available offers
  const offers = request.workerOffers || [];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Helmet><title>Request Details | AgroYilt</title></Helmet>

      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/user/my-worker-requests')}
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
            >
              <FiArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Request Details</h1>
              <p className="text-xs text-slate-500">ID: {request._id?.substring(0, 8)}...</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusConf.color}`}>
              {statusConf.label}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        
        {/* Basic Info */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 relative overflow-hidden">
          <div className="flex justify-between items-start gap-4">
            <div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full mb-2 inline-block">
                {request.bookingType === 'DAILY' ? 'Daily Contract' : (request.workCategory || 'General Service')}
              </span>
              <h2 className="text-xl font-extrabold text-slate-900">{request.workTitle}</h2>
              <p className="text-slate-500 text-xs mt-1 leading-relaxed">{request.workDescription}</p>
            </div>
            
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Budget</p>
              {(() => {
                const isDaily = request.bookingType === 'DAILY' || request.rateUnit === 'daily';
                const unitSuffix = isDaily ? '/day' : '/hr';
                const minRate = isDaily ? (request.minDailyRate || request.minRate) : (request.minRate || request.farmerOfferedRate);
                const maxRate = isDaily ? (request.maxDailyRate || request.maxRate) : request.maxRate;

                if (minRate && maxRate && minRate !== maxRate) {
                  return (
                    <div>
                      <p className="text-base font-black text-emerald-600">₹{minRate} - ₹{maxRate}</p>
                      <p className="text-[10px] text-slate-400 font-medium">per worker {unitSuffix}</p>
                    </div>
                  );
                } else if (maxRate || minRate) {
                  return (
                    <div>
                      <p className="text-base font-black text-emerald-600">₹{maxRate || minRate}</p>
                      <p className="text-[10px] text-slate-400 font-medium">per worker {unitSuffix}</p>
                    </div>
                  );
                }
                return <p className="text-sm font-bold text-slate-600">Flexible</p>;
              })()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 border-t border-slate-100 pt-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <FiCalendar size={14} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  {request.bookingType === 'DAILY' ? 'Daily Schedule' : 'Date'}
                </p>
                <p className="text-sm font-bold text-slate-700">
                  {request.bookingType === 'DAILY'
                    ? `${request.numberOfDays || 1} Day(s) (Starts ${request.startDate ? new Date(request.startDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Soon'})`
                    : (request.scheduledDate ? new Date(request.scheduledDate).toLocaleDateString('en-IN') : 'Scheduled')}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <FiClock size={14} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  {request.bookingType === 'DAILY' ? 'Working Hours' : 'Time Slot'}
                </p>
                <p className="text-sm font-bold text-slate-700">
                  {request.bookingType === 'DAILY'
                    ? 'Full Day (Daily Rate)'
                    : `${request.startTime || '00:00'} - ${request.endTime || '00:00'}`}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <FiUsers size={14} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Required</p>
                <p className="text-sm font-bold text-slate-700">{request.requiredWorkers} Worker(s)</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <FiMapPin size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Location</p>
                <p className="text-sm font-bold text-slate-700 truncate">{request.location?.city || 'Location'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Worker / Team Selection (Pre-payment) */}
        {['awaiting_farmer_confirmation', 'matching', 'pending'].includes(request.status) && request.paymentStatus !== 'success' && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            {isTeamLeaderMode ? (
              /* ── TEAM LEADER GROUP PROPOSAL ── */
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">
                    {offers.length > 0 ? `Team Proposal (${selectedWorkerIds.length}/${offers.length} Selected)` : 'Team Leader Matching'}
                  </h3>
                  {offers.length > 0 && (
                    <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      {selectedWorkerIds.length === offers.length ? 'Full Team Ready' : `${selectedWorkerIds.length} Selected`}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 mb-4 font-medium">
                  {offers.length > 0 
                    ? `The Team Leader assembled ${offers.length} workers. You can tap on any worker to include or exclude them according to your need and budget:`
                    : `Searching for nearby Team Leaders who can provide a full team of ${request.requiredWorkers} workers...`}
                </p>

                {offers.length === 0 ? (
                  <div className="py-8 text-center bg-blue-50/50 rounded-2xl border border-blue-100 border-dashed">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm text-blue-600">
                      <FiUsers size={20} />
                    </div>
                    <p className="text-sm font-bold text-slate-700 mb-1">Waiting for Team Leader...</p>
                    <p className="text-xs text-slate-500 px-6">Nearby Team Leaders with active teams are reviewing your request.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {offers.map((offer, idx) => {
                      const worker = offer.workerId || {};
                      const skills = Array.isArray(worker.skills) ? worker.skills : [];
                      const isLeader = idx === 0;
                      const isSelected = selectedWorkerIds.includes(worker._id);

                      return (
                        <div 
                          key={worker._id || idx} 
                          onClick={() => toggleWorkerSelection(worker._id)}
                          className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                            isSelected 
                              ? 'border-emerald-500 bg-emerald-50/20 shadow-sm' 
                              : 'border-slate-200 bg-slate-50/60 opacity-60 hover:opacity-100 hover:border-slate-300'
                          }`}
                        >
                          {/* Checkbox indicator */}
                          <div className="pt-1 shrink-0">
                            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                            }`}>
                              {isSelected && <FiCheck size={12} className="stroke-[3]" />}
                            </div>
                          </div>

                          <div className="relative shrink-0">
                            {worker.profilePhoto ? (
                              <img src={worker.profilePhoto} alt={worker.name} className="w-11 h-11 rounded-xl object-cover border border-slate-200" />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-black text-sm">
                                {worker.name ? worker.name.charAt(0).toUpperCase() : 'W'}
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm truncate">{worker.name}</span>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${isLeader ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {isLeader ? 'Team Leader' : 'Team Member'}
                              </span>
                              {!isLeader && (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ✓ Ready & Accepted
                                </span>
                              )}
                              {worker.rating > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                  <FiStar size={9} className="fill-amber-500" /> {worker.rating.toFixed(1)}
                                </span>
                              )}
                            </div>

                            {skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {skills.slice(0, 3).map((sk, sIdx) => (
                                  <span key={sIdx} className="bg-white text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-200">
                                    {sk}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-emerald-600">₹{offer.offeredRate || (request.maxRate || request.farmerOfferedRate || 0)}</span>
                            <span className="text-[10px] text-slate-400 block">/{request.rateUnit || 'hr'}</span>
                          </div>
                        </div>
                      );
                    })}

                    <div className="mt-5 pt-5 border-t border-slate-100">
                      <button
                        onClick={handleProceedToPayment}
                        disabled={processing || selectedWorkerIds.length === 0}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-black text-sm shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                        {processing ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            Confirm Team & Proceed to Payment ({selectedWorkerIds.length} Worker{selectedWorkerIds.length !== 1 ? 's' : ''})
                            <FiArrowLeft className="rotate-180" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── INDEPENDENT WORKERS BROADCAST ── */
              <div>
                <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide mb-1">Select Workers to Book</h3>
                <p className="text-xs text-slate-500 mb-4 font-medium">
                  Select up to {request.requiredWorkers} workers. Their exact rates and contact details will be revealed after you lock in the payment for the maximum budget. Any unused amount (if they bid lower) is instantly refunded to your wallet!
                </p>

                {offers.length === 0 ? (
                  <div className="py-8 text-center bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                      <FiClock className="text-slate-400" size={20} />
                    </div>
                    <p className="text-sm font-bold text-slate-600 mb-1">Waiting for Workers...</p>
                    <p className="text-xs text-slate-500 px-6">Workers in your area are reviewing your request.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {offers.map((offer, idx) => {
                      const worker = offer.workerId || {};
                      const isSelected = selectedWorkerIds.includes(worker._id);
                      const isSelectable = offer.status === 'pending' || offer.status === 'selected';

                      return (
                        <div 
                          key={worker._id || idx} 
                          onClick={() => isSelectable && toggleWorkerSelection(worker._id)}
                          className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
                            !isSelectable ? 'opacity-50 border-slate-100 bg-slate-50' :
                            isSelected ? 'border-emerald-500 bg-emerald-50/30 shadow-sm' : 'border-slate-100 bg-white cursor-pointer hover:border-emerald-200'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {isSelected ? <FiCheck /> : (worker?.name ? worker.name.charAt(0).toUpperCase() : '?')}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">
                              {worker?.name || 'Worker'}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {worker?.rating > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">
                                  <FiStar size={10} className="fill-amber-500" /> {worker.rating.toFixed(1)}
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md uppercase tracking-wide">
                                Privacy Hidden
                              </span>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            {isSelectable ? (
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}>
                                {isSelected && <FiCheck size={12} />}
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-slate-400 capitalize">{offer.status}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Proceed Button */}
                    {selectedWorkerIds.length > 0 && (
                      <div className="mt-5 pt-5 border-t border-slate-100">
                        <button
                          onClick={handleProceedToPayment}
                          disabled={processing}
                          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                          {processing ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                              Proceed to Payment ({selectedWorkerIds.length})
                              <FiArrowLeft className="rotate-180" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Active Booking Banner (Confirmed, pending payment) ─────────────── */}
        {request.status === 'confirmed' && request.paymentStatus !== 'success' && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-5 shadow-lg shadow-emerald-400/20 relative overflow-hidden">
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full" />
            <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-white/10 rounded-full" />
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-xl">🎉</div>
              <div>
                <h3 className="text-white font-black text-base">Active Booking!</h3>
                <p className="text-emerald-100 text-xs font-medium">Workers are confirmed for your job</p>
              </div>
            </div>
            <p className="text-emerald-50 text-xs mb-4 font-medium leading-relaxed">
              {request.acceptedWorkersCount || request.finalWorkers?.length || 0} worker(s) accepted your request for <span className="font-black">{request.workTitle}</span>. Track them live or contact them directly.
            </p>
            <button
              onClick={() => navigate(`/user/farmer-worker-request/${request._id}/track`)}
              className="w-full py-3 bg-white text-emerald-700 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
            >
              <FiNavigation size={16} className="animate-pulse text-emerald-600" />
              Track Workers Live
            </button>
          </div>
        )}

        {/* Confirmed Workers (Post-confirmation) */}
        {(request.status === 'confirmed' || request.paymentStatus === 'success') && request.finalWorkers?.length > 0 && (
          <div className="bg-white rounded-3xl border-2 border-emerald-500 shadow-sm p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -z-10 opacity-50" />
            
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <FiCheck size={16} className="stroke-[3]" />
                </div>
                <h3 className="font-black text-emerald-800 text-sm uppercase tracking-wide">
                  Booking Confirmed
                </h3>
              </div>

              {/* Live Tracking Action Button */}
              <button
                onClick={() => navigate(`/user/booking/${request._id}/track`, { state: { fromHistory: true } })}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
              >
                <FiNavigation size={14} className="animate-pulse" />
                <span>Live Tracking Map</span>
              </button>
            </div>
            
            <p className="text-xs text-slate-500 font-medium mb-4">
              {request.paymentMethod === 'cash' 
                ? 'Your booking is confirmed with Cash on Service. Worker details are unlocked below.' 
                : 'Your payment was successful and worker details are unlocked. You can track their live journey to your farm in real time.'}
            </p>

            <div className="space-y-3">
              {request.finalWorkers.map((w, i) => (
                <div key={w?._id || i} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl p-3">
                  <div className="w-12 h-12 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-emerald-700 font-black text-lg shrink-0">
                    {w?.name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-800">{w?.name || 'Worker'}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      {w?.rating > 0 && (
                        <span className="text-xs text-amber-600 font-bold flex items-center gap-0.5">
                          <FiStar size={11} className="fill-amber-500" />
                          {w?.rating?.toFixed(1)}
                        </span>
                      )}
                      {w?.phone && (
                        <span className="text-xs text-slate-600 font-bold flex items-center gap-1">
                          <FiPhone size={11} />
                          {w?.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end mr-3">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Agreed Rate</p>
                    <p className="text-lg font-black text-emerald-600">₹{request.workerOffers?.find(o => (o.workerId?._id || o.workerId) ?.toString() === (w?._id || w) ?.toString()) ?.offeredRate || request.maxRate}</p>
                  </div>
                  {w?.phone && (
                    <a
                      href={`tel:${w?.phone}`}
                      className="w-10 h-10 rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-200 flex items-center justify-center active:scale-95 transition-transform shrink-0"
                      title={`Call ${w.name}`}
                    >
                      <FiPhone size={16} />
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom Full-Width Live Tracking Button */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={() => navigate(`/user/booking/${request._id}/track`, { state: { fromHistory: true } })}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <FiNavigation className="animate-pulse" />
                <span>Track All Workers Live ({request.finalWorkers.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* Canonical Farmer Payment Summary */}
        {(request.paymentStatus === 'success' || request.paymentSummary) && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3.5">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                ₹
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Payment Summary</h3>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  Authoritative Breakdown
                </span>
              </div>
            </div>

            {(() => {
              const isCash = request.paymentMethod === 'cash';
              const isConfirmed = request.status === 'confirmed';
              const isPaid = request.paymentStatus === 'success' || (isCash && isConfirmed);
              const isDaily = request.bookingType === 'DAILY' || request.rateUnit === 'daily';
              const effectiveWorkerCount = (isPaid || isConfirmed)
                ? (request.paymentSummary?.selectedWorkerCount || request.selectedWorkerIds?.length || 1)
                : (selectedWorkerIds.length > 0 ? selectedWorkerIds.length : (request.selectedWorkerIds?.length || request.requiredWorkers || 1));

              // Maximum / Effective rate per worker (use maxRate, fallback to minRate)
              const ratePerWorker = Number(
                request.paymentSummary?.maxRatePerWorker ||
                (isDaily
                  ? (request.maxDailyRate || request.minDailyRate || request.maxRate || request.minRate)
                  : (request.maxRate || request.minRate || request.farmerOfferedRate)) ||
                0
              );

              // Duration in hours (for hourly booking)
              let durationHours = 1;
              let diffMinutes = 60;
              if (!isDaily) {
                if (request.durationMinutes && Number(request.durationMinutes) > 0) {
                  diffMinutes = Number(request.durationMinutes);
                  durationHours = diffMinutes / 60;
                } else if (request.startTime && request.endTime) {
                  const [sH, sM] = request.startTime.split(':').map(Number);
                  const [eH, eM] = request.endTime.split(':').map(Number);
                  if (!isNaN(sH) && !isNaN(eH)) {
                    let dm = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
                    if (dm < 0) dm += 24 * 60;
                    if (dm > 0) {
                      diffMinutes = dm;
                      durationHours = dm / 60;
                    }
                  }
                } else if (request.paymentSummary?.durationHours && Number(request.paymentSummary.durationHours) > 0) {
                  durationHours = Number(request.paymentSummary.durationHours);
                  diffMinutes = Math.round(durationHours * 60);
                }
              }
              const numberOfDays = isDaily
                ? Number(request.paymentSummary?.numberOfDays || request.numberOfDays || 1)
                : 1;

              // Worker reserve: rate * workers * (durationHours or numberOfDays)
              const calculatedReserve = isDaily
                ? Math.round(ratePerWorker * effectiveWorkerCount * numberOfDays)
                : Math.round(ratePerWorker * effectiveWorkerCount * durationHours);

              const reserveAmount = isPaid
                ? Number(request.paymentSummary?.workerReserveAmount || calculatedReserve)
                : calculatedReserve;

              const platformRate = Number(request.financialSnapshot?.platformChargeRate || request.paymentSummary?.platformChargeRate || 10);
              const platformFee = isPaid
                ? Number(request.paymentSummary?.platformFeeAmount || request.financialSnapshot?.platformChargeAmount || Math.round((reserveAmount * platformRate) / 100))
                : Math.round((reserveAmount * platformRate) / 100);

              const totalAmount = isPaid
                ? Number(request.paymentSummary?.totalPaidAmount || request.financialSnapshot?.totalPayable || (reserveAmount + platformFee))
                : (reserveAmount + platformFee);

              const rateUnitDisplay = isDaily ? '/day' : '/hourly';

              const formatDurationText = (mins, hrs) => {
                if (mins && mins > 0) {
                  const h = Math.floor(mins / 60);
                  const m = Math.round(mins % 60);
                  if (h > 0 && m > 0) return `${h} hr ${m} min`;
                  if (h > 0) return `${h} hour${h > 1 ? 's' : ''}`;
                  return `${m} min${m > 1 ? 's' : ''}`;
                }
                const roundedHrs = Number(hrs.toFixed(2));
                return `${roundedHrs} hour${roundedHrs !== 1 ? 's' : ''}`;
              };

              const formattedDuration = formatDurationText(diffMinutes, durationHours);
              const cleanDurationHours = Number(durationHours.toFixed(2));

              const calculationFormulaText = isDaily
                ? `₹${ratePerWorker.toLocaleString('en-IN')} × ${effectiveWorkerCount} worker${effectiveWorkerCount !== 1 ? 's' : ''} × ${numberOfDays} day${numberOfDays !== 1 ? 's' : ''}`
                : `₹${ratePerWorker.toLocaleString('en-IN')} × ${effectiveWorkerCount} worker${effectiveWorkerCount !== 1 ? 's' : ''} × ${cleanDurationHours} hr${cleanDurationHours !== 1 ? 's' : ''}`;

              return (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="font-medium">Workers Selected</span>
                    <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-full text-xs">
                      {effectiveWorkerCount}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600">
                    <span className="font-medium">Maximum Rate / Worker</span>
                    <span className="font-bold text-slate-900">
                      ₹{ratePerWorker.toLocaleString('en-IN')}
                      <span className="text-xs text-slate-400 font-normal ml-1">{rateUnitDisplay}</span>
                    </span>
                  </div>

                  {!isDaily && (
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium">Booking Duration</span>
                      <span className="font-bold text-slate-900">
                        {formattedDuration}
                        <span className="text-xs text-slate-400 font-normal ml-1">({request.startTime} - {request.endTime})</span>
                      </span>
                    </div>
                  )}

                  {isDaily && (
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium">Working Days</span>
                      <span className="font-bold text-slate-900">
                        {numberOfDays} day{numberOfDays !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-slate-600">
                    <div>
                      <span className="font-medium">Worker Payment Reserve</span>
                      <span className="block text-[11px] text-slate-400 font-mono">
                        {calculationFormulaText}
                      </span>
                    </div>
                    <span className="font-bold text-slate-900">
                      ₹{reserveAmount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600">
                    <span className="font-medium">Platform Fee ({platformRate}%)</span>
                    <span className="font-bold text-slate-900">
                      +₹{platformFee.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {request.paymentMethod && (
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium">Payment Mode</span>
                      <span className={`font-bold px-2.5 py-0.5 rounded-full text-xs uppercase ${
                        isCash ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {isCash ? '💵 Cash on Service' : '💳 Online Escrow'}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-dashed border-slate-200 my-1" />

                  <div className={`flex justify-between items-center p-3 rounded-2xl border ${isCash ? 'bg-amber-50/60 border-amber-200' : 'bg-teal-50/60 border-teal-100'}`}>
                    <div>
                      <span className={`font-black text-sm block ${isCash ? 'text-amber-900' : 'text-teal-900'}`}>
                        {isCash ? 'Pay on Completion (Cash)' : (isPaid ? 'Total Paid' : 'Total Payable')}
                      </span>
                      <span className={`text-[10px] font-medium ${isCash ? 'text-amber-700' : 'text-teal-700'}`}>
                        {isCash ? 'Pay worker directly upon completion' : 'Reserve + Platform Fee'}
                      </span>
                    </div>
                    <span className={`text-xl font-black ${isCash ? 'text-amber-700' : 'text-teal-700'}`}>
                      ₹{totalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              );
            })()}

              {/* ── TIME EXTENSION BREAKDOWN (If extensions exist) ── */}
              {(() => {
                const extSum = request.paymentSummary?.extensionsSummary;
                const hasExt = Boolean(extSum?.hasExtension || (request.confirmedExtensions && request.confirmedExtensions.length > 0));
                if (!hasExt) return null;

                const totalExtMins = extSum?.totalExtensionMinutes || 0;
                const totalExtDays = extSum?.totalAdditionalDays || 0;
                const durationLabel = totalExtDays > 0 ? `+${totalExtDays} Day(s)` : `+${totalExtMins} Mins`;
                const extGross = extSum?.totalExtensionGrossAmount || 0;
                const extFee = extSum?.totalExtensionPlatformFee || 0;
                const extTotalPaid = extSum?.totalExtensionPaidAmount || (extGross + extFee);

                return (
                  <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 space-y-2.5 mt-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <FiClock className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                          Time Extension Added
                        </span>
                      </div>
                      <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                        {durationLabel}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-amber-950 pt-1 border-t border-amber-200/60">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Worker Extension Pay:</span>
                        <span className="font-bold text-slate-800">₹{Number(extGross).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Extension Platform Fee:</span>
                        <span className="font-medium text-slate-800">+₹{Number(extFee).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-amber-200 font-bold">
                        <span className="text-amber-900">Total Extension Paid:</span>
                        <span className="text-sm font-black text-amber-800">₹{Number(extTotalPaid).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Settlement & Refund Section */}
              <div className="pt-2 space-y-2">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-2">
                  <div className="flex justify-between items-center text-slate-600">
                    <div>
                      <span className="font-bold text-sm text-slate-900 block">Actual Worker Settlement</span>
                      {request.paymentSummary?.extensionsSummary?.hasExtension && (
                        <span className="text-[11px] text-slate-500">
                          Base (₹{Number(request.paymentSummary.extensionsSummary.baseActualWorkerAmount).toLocaleString('en-IN')}) + Extension (₹{Number(request.paymentSummary.extensionsSummary.extensionWorkerAmount).toLocaleString('en-IN')})
                        </span>
                      )}
                    </div>
                    <span className="font-black text-slate-900 text-base">
                      {request.paymentSummary?.actualWorkerAmount !== null && request.paymentSummary?.actualWorkerAmount !== undefined ? (
                        `₹${Number(request.paymentSummary.actualWorkerAmount).toLocaleString('en-IN')}`
                      ) : (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          Pending / In Progress
                        </span>
                      )}
                    </span>
                  </div>

                  {request.paymentSummary?.extensionsSummary?.hasExtension && (
                    <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 flex justify-between">
                      <span>Base Shift Actual Pay:</span>
                      <span className="font-semibold text-slate-700">₹{Number(request.paymentSummary.extensionsSummary.baseActualWorkerAmount).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Refund Status</span>
                    <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                      request.paymentSummary?.refundStatus === 'REFUNDED'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : request.paymentSummary?.refundStatus === 'PENDING'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}>
                      {request.paymentSummary?.refundStatus || (request.refundCredited ? 'REFUNDED' : 'PENDING')}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-emerald-100">
                    <div>
                      <span className="text-sm font-bold text-emerald-900 block">Refund Amount</span>
                      <span className="text-[10px] text-emerald-700">
                        Unused portion of initial worker reserve
                      </span>
                    </div>
                    <span className="text-base font-black text-emerald-700">
                      {request.paymentSummary?.refundAmount !== null && request.paymentSummary?.refundAmount !== undefined ? (
                        `₹${Number(request.paymentSummary.refundAmount).toLocaleString('en-IN')}`
                      ) : (
                        <span className="text-xs font-medium text-emerald-600 italic">Pending Settlement</span>
                      )}
                    </span>
                  </div>

                  <p className="text-[10px] text-emerald-600 leading-tight">
                    {request.paymentSummary?.refundStatus === 'REFUNDED'
                      ? 'Unused reserve has been credited to your AgroYilt wallet.'
                      : 'Unused worker reserve will be automatically credited to your wallet once work is completed.'}
                  </p>
                </div>
              </div>

              {/* Payment Reference ID(s) */}
              <div className="space-y-1 pt-1 text-xs text-slate-400">
                {request.razorpayPaymentId && (
                  <div className="flex justify-between items-center">
                    <span>Initial Payment Ref</span>
                    <span className="font-mono text-slate-600">{request.razorpayPaymentId}</span>
                  </div>
                )}
                {request.paymentSummary?.extensionsSummary?.items?.map((ext, idx) => (
                  ext.paymentReference && (
                    <div key={idx} className="flex justify-between items-center text-[11px]">
                      <span>Ext #{idx + 1} Payment Ref</span>
                      <span className="font-mono text-slate-600">{ext.paymentReference}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
        )}

        {/* Work Description */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide mb-2">Work Description</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{request.workDescription}</p>
        </div>

        {/* Cancel button */}
        {canCancel && request.paymentStatus !== 'success' && (
          <button
            onClick={() => setIsCancelModalOpen(true)}
            disabled={cancelling}
            className="w-full py-4 border-2 border-red-100 text-red-500 bg-red-50/50 hover:bg-red-50 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 transition-all mt-4"
          >
            {cancelling ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" /> : <FiX size={16} />}
            Cancel Request
          </button>
        )}
      </div>
      {/* Custom Cancel Confirmation Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4 mx-auto">
              <FiXCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">Cancel Request?</h3>
            <p className="text-slate-500 text-center text-sm mb-6">
              Are you sure you want to cancel this work request? Workers who were notified will be informed.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsCancelModalOpen(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all"
              >
                No, Keep it
              </button>
              <button 
                onClick={handleCancelConfirm}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all shadow-md shadow-red-200"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmerRequestDetail;




