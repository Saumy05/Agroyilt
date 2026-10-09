import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  FiArrowLeft, FiClock, FiMapPin, FiCalendar, FiDollarSign, 
  FiUsers, FiX, FiCheck, FiStar, FiPhone, FiCheckCircle, 
  FiAlertCircle, FiLayers, FiUser, FiInfo
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import workerRequestService from '../../../../services/workerRequestService';
import api from '../../../../services/api';
import Header from '../../components/layout/Header';

const STATUS_BADGES = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  leader_accepted: 'bg-blue-100 text-blue-800 border-blue-200',
  collecting_members: 'bg-purple-100 text-purple-800 border-purple-200',
  selection_pending: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  awaiting_payment: 'bg-orange-100 text-orange-800 border-orange-200',
  payment_pending: 'bg-orange-100 text-orange-800 border-orange-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200'
};

const WorkerGroupRequests = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [memberInvites, setMemberInvites] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Tab for leaders who might also want to see invites, or just based on role
  const [activeTab, setActiveTab] = useState('leader'); // 'leader' | 'member'

  // Negotiation State
  const [counterRate, setCounterRate] = useState('');
  const [activeNegotiationId, setActiveNegotiationId] = useState(null);

  // Dispatch Custom Selection State
  const [dispatchMemberIds, setDispatchMemberIds] = useState({}); // { [reqId]: [workerIds] }

  // Final Selection State
  const [activeSelectionId, setActiveSelectionId] = useState(null);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [submittingAction, setSubmittingAction] = useState(false);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      // 1. Get profile
      const profRes = await api.get('/workers/profile');
      let isLeader = false;
      if (profRes.data.success) {
        setProfile(profRes.data.worker);
        isLeader = profRes.data.worker.workerType === 'TEAM_LEADER';
        setActiveTab(isLeader ? 'leader' : 'member');
      }

      // 2. If leader, fetch leader requests & team roster for dispatching
      if (isLeader) {
        try {
          const [gRes, teamRes] = await Promise.all([
            workerRequestService.getGroupRequests(),
            api.get('/workers/team/me')
          ]);
          if (gRes.success) setRequests(gRes.data || []);
          if (teamRes.data.success && teamRes.data.members) setTeamMembers(teamRes.data.members);
        } catch (e) {
          console.error('Error fetching leader requests', e);
        }
      }

      // 3. Fetch member invites
      try {
        const invRes = await workerRequestService.getMemberGroupInvites();
        if (invRes.success) {
          setMemberInvites(invRes.data || []);
        }
      } catch (e) {
        console.error('Error fetching member invites', e);
      }

    } catch (err) {
      toast.error('Failed to load group booking data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const handleUpdate = () => fetchAllData();
    window.addEventListener('workerJobsUpdated', handleUpdate);
    window.addEventListener('team_member_response', handleUpdate);
    return () => {
      window.removeEventListener('workerJobsUpdated', handleUpdate);
      window.removeEventListener('team_member_response', handleUpdate);
    };
  }, []);

  const handleLeaderAction = async (id, action, rate = null) => {
    try {
      setSubmittingAction(true);
      await workerRequestService.leaderRespondToRequest(id, action, rate);
      toast.success(action === 'counter' ? 'Counter offer sent!' : `Request ${action === 'accept' ? 'accepted' : 'rejected'}`);
      fetchAllData();
      setActiveNegotiationId(null);
      setCounterRate('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDispatch = async (reqId) => {
    try {
      setSubmittingAction(true);
      const chosenIds = dispatchMemberIds[reqId];
      await workerRequestService.dispatchToMembers(reqId, chosenIds);
      toast.success('Dispatched to team members successfully!');
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Dispatch failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const toggleDispatchMember = (reqId, memberId) => {
    setDispatchMemberIds(prev => {
      const current = prev[reqId] || teamMembers.map(m => m._id);
      const exists = current.includes(memberId);
      const updated = exists ? current.filter(id => id !== memberId) : [...current, memberId];
      return { ...prev, [reqId]: updated };
    });
  };

  const toggleWorkerSelection = (id) => {
    setSelectedWorkers(prev => 
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  const submitFinalSelection = async (id, maxAllowed) => {
    if (selectedWorkers.length === 0) return toast.error('Please select at least one worker');
    if (selectedWorkers.length > maxAllowed) return toast.error(`Cannot select more than ${maxAllowed} workers`);

    try {
      setSubmittingAction(true);
      await workerRequestService.leaderSelectWorkers(id, selectedWorkers);
      toast.success('Workers finalized! Awaiting farmer payment.');
      fetchAllData();
      setActiveSelectionId(null);
      setSelectedWorkers([]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm selection');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleMemberResponse = async (id, action) => {
    try {
      setSubmittingAction(true);
      await workerRequestService.memberRespondToRequest(id, action);
      toast.success(`Job invitation ${action === 'accept' ? 'accepted' : 'declined'}`);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record response');
    } finally {
      setSubmittingAction(false);
    }
  };

  const isOnlineStatus = (status) => {
    const s = String(status || '').toUpperCase();
    return s === 'ONLINE' || s === 'AVAILABLE' || s === 'ACTIVE';
  };

  const isTeamLeader = profile?.workerType === 'TEAM_LEADER';

  // ── Render Leader Group Request Card ──────────────────────────────────────
  const renderLeaderRequest = (req) => {
    const lastNeg = req.negotiation?.[req.negotiation.length - 1];
    const isMyTurn = req.status === 'pending' && lastNeg && lastNeg.by === 'farmer';
    const ratePerWorker = lastNeg?.rate || req.farmerOfferedRatePerWorker || 0;
    const estTotal = ratePerWorker * (req.requiredWorkers || 1);

    const selectedDispatchList = dispatchMemberIds[req._id] || teamMembers.map(m => m._id);

    return (
      <div key={req._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-5">
        <div className="p-5">
          {/* Header Badge & Date */}
          <div className="flex justify-between items-center mb-3">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${STATUS_BADGES[req.status] || 'bg-slate-100 text-slate-700'}`}>
              {req.status.replace(/_/g, ' ')}
            </span>
            <span className="text-[11px] font-bold text-slate-400">
              {new Date(req.createdAt).toLocaleDateString()}
            </span>
          </div>

          {/* Work Title & Farmer Info */}
          <div className="mb-4">
            <h3 className="font-black text-slate-800 text-lg">{req.workTitle || 'Bulk Farm Work'}</h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span>Farmer: <strong className="text-slate-700">{req.farmerId?.name || 'Farmer'}</strong></span>
              {req.farmerId?.phone && <span>• {req.farmerId.phone}</span>}
            </div>
          </div>

          {/* Key Job Info Grid */}
          <div className="grid grid-cols-2 gap-2.5 mb-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Schedule</p>
              <p className="font-bold text-slate-800">{new Date(req.scheduledDate).toDateString()}</p>
              <p className="text-[11px] text-slate-500">{req.startTime} - {req.endTime}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Workers Needed</p>
              <p className="font-black text-blue-600 text-base">{req.requiredWorkers} Workers</p>
            </div>
            <div className="col-span-2 pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Offered Rate</p>
                <p className={`font-black text-base ${isMyTurn ? 'text-amber-600' : 'text-slate-800'}`}>
                  ₹{ratePerWorker} <span className="text-xs font-normal text-slate-400">/{req.rateUnit || 'day'} per worker</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Estimated Total</p>
                <p className="font-black text-emerald-600 text-base">₹{estTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Required Skills */}
          {Array.isArray(req.requiredSkills) && req.requiredSkills.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Required Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {req.requiredSkills.map((sk, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold text-[10px] rounded-md border border-blue-100">
                    {sk}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 1. Negotiation Phase (Accept / Counter / Reject) */}
          {isMyTurn && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-700 mb-2">Farmer Offer Pending Your Review:</p>
              {activeNegotiationId === req._id ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      value={counterRate} 
                      onChange={e => setCounterRate(e.target.value)} 
                      placeholder="Your rate per worker ₹" 
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold" 
                    />
                    <button 
                      onClick={() => handleLeaderAction(req._id, 'counter', counterRate)} 
                      disabled={submittingAction || !counterRate}
                      className="bg-amber-500 hover:bg-amber-600 text-white px-5 rounded-xl font-bold text-xs transition-colors disabled:opacity-50"
                    >
                      Send Offer
                    </button>
                    <button 
                      onClick={() => setActiveNegotiationId(null)} 
                      className="bg-slate-100 text-slate-600 px-3 rounded-xl hover:bg-slate-200"
                    >
                      <FiX />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleLeaderAction(req._id, 'accept')} 
                    disabled={submittingAction}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <FiCheck /> Accept ₹{ratePerWorker}/worker
                  </button>
                  <button 
                    onClick={() => setActiveNegotiationId(req._id)} 
                    className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 py-2.5 rounded-xl font-bold text-xs"
                  >
                    Counter Rate
                  </button>
                  <button 
                    onClick={() => handleLeaderAction(req._id, 'reject')} 
                    disabled={submittingAction}
                    className="px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold text-xs"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 2. Dispatch Phase (Leader selects eligible team members & dispatches) */}
          {req.status === 'leader_accepted' && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-sm text-slate-800">Dispatch to Team Members</h4>
                  <span className="text-[11px] font-bold text-blue-600">
                    {selectedDispatchList.length} of {teamMembers.length} Selected
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select which team members will receive this work request based on their skills:
                </p>
              </div>

              {/* Member Selection Roster with Skills */}
              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto pr-1">
                {teamMembers.map(m => {
                  const isChecked = selectedDispatchList.includes(m._id);
                  const online = isOnlineStatus(m.status);
                  const skills = Array.isArray(m.skills) ? m.skills : [];

                  return (
                    <div 
                      key={m._id}
                      onClick={() => toggleDispatchMember(req._id, m._id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        isChecked ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        onChange={() => {}} 
                        className="mt-1 accent-blue-600 h-4 w-4 rounded" 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 text-xs truncate">{m.name}</span>
                          <span className={`text-[9px] font-black uppercase ${online ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {online ? '• Online' : '• Offline'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{m.phone}</p>
                        {skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {skills.slice(0, 3).map((sk, idx) => (
                              <span key={idx} className="bg-white text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-200">
                                {sk}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={() => handleDispatch(req._id)} 
                disabled={submittingAction || selectedDispatchList.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black text-xs shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <FiUsers size={16} /> Dispatch Request ({selectedDispatchList.length} Members)
              </button>
            </div>
          )}

          {/* 3. Collecting Member Responses & Finalizing Selection */}
          {(req.status === 'collecting_members' || req.status === 'selection_pending') && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-black text-sm text-slate-800">Team Member Responses</h4>
                  <p className="text-xs text-slate-500">Need {req.requiredWorkers} workers to confirm</p>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {req.memberRequests?.filter(m => m.status === 'accepted').length || 0} Accepted
                </span>
              </div>

              {/* Members Response List */}
              <div className="space-y-2 mb-4">
                {req.memberRequests?.map(m => {
                  const workerObj = m.workerId || {};
                  const skills = Array.isArray(workerObj.skills) ? workerObj.skills : [];
                  const isAccepted = m.status === 'accepted';
                  const isRejected = m.status === 'rejected';

                  return (
                    <div key={m._id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-xs">{workerObj.name || 'Team Member'}</span>
                          {workerObj.rating ? (
                            <span className="text-[10px] text-amber-500 font-bold flex items-center gap-0.5">
                              <FiStar size={9} className="fill-amber-400" /> {Number(workerObj.rating).toFixed(1)}
                            </span>
                          ) : null}
                        </div>
                        {skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {skills.slice(0, 3).map((sk, idx) => (
                              <span key={idx} className="bg-white text-slate-600 text-[9px] font-medium px-1.5 py-0.5 rounded border border-slate-200">
                                {sk}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${
                        isAccepted ? 'bg-emerald-100 text-emerald-800' :
                        isRejected ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {m.status}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Final Selection UI */}
              {activeSelectionId === req._id ? (
                <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200">
                  <p className="text-xs font-black text-slate-800 mb-2">
                    Pick exactly {req.requiredWorkers} workers to assign to the booking:
                  </p>
                  
                  <div className="space-y-2 mb-4">
                    {req.memberRequests?.filter(m => m.status === 'accepted').map(m => {
                      const workerObj = m.workerId || {};
                      const isChecked = selectedWorkers.includes(workerObj._id);

                      return (
                        <div 
                          key={m._id}
                          onClick={() => toggleWorkerSelection(workerObj._id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                            isChecked ? 'border-emerald-600 bg-emerald-100/50' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => {}} 
                              className="accent-emerald-600 h-4 w-4 rounded" 
                            />
                            <div>
                              <span className="font-bold text-slate-800 text-xs">{workerObj.name}</span>
                              <p className="text-[10px] text-slate-400">{workerObj.phone}</p>
                            </div>
                          </div>
                          {workerObj.rating ? (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              ⭐ {Number(workerObj.rating).toFixed(1)}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => submitFinalSelection(req._id, req.requiredWorkers)} 
                      disabled={submittingAction || selectedWorkers.length !== req.requiredWorkers}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-xs shadow-sm disabled:opacity-50"
                    >
                      Confirm {selectedWorkers.length}/{req.requiredWorkers} Workers
                    </button>
                    <button 
                      onClick={() => setActiveSelectionId(null)} 
                      className="px-4 bg-white text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setActiveSelectionId(req._id);
                    const acceptedIds = req.memberRequests?.filter(m => m.status === 'accepted').map(m => m.workerId?._id) || [];
                    setSelectedWorkers(acceptedIds.slice(0, req.requiredWorkers));
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-black text-xs shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  disabled={(req.memberRequests?.filter(m => m.status === 'accepted').length || 0) < req.requiredWorkers}
                >
                  <FiCheckCircle size={15} /> Finalize Team Selection ({req.memberRequests?.filter(m => m.status === 'accepted').length || 0}/{req.requiredWorkers} Ready)
                </button>
              )}
            </div>
          )}

          {/* 4. Awaiting Farmer Payment */}
          {(req.status === 'awaiting_payment' || req.status === 'payment_pending') && (
            <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl text-center">
              <p className="text-xs font-black text-orange-800">Team Finalized! Awaiting Farmer Payment</p>
              <p className="text-[11px] text-orange-600 mt-1">The farmer has been notified to complete the escrow payment for ₹{estTotal.toLocaleString()}.</p>
            </div>
          )}

          {/* 5. Confirmed */}
          {req.status === 'confirmed' && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-xs font-black text-emerald-800 flex items-center justify-center gap-1.5">
                <FiCheckCircle className="text-emerald-600" /> Booking Confirmed & Workers Assigned
              </p>

              {req.paymentMethod === 'cash' ? (
                <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <p className="text-xs font-black text-amber-900">
                    💵 Cash Job — Collect ₹{(req.financialSnapshot?.totalPayable || (ratePerWorker * req.requiredWorkers)).toLocaleString()} from Farmer
                  </p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Collect cash directly upon job completion. Platform fee & commission will be debited from your Team Leader wallet.
                  </p>
                </div>
              ) : (
                <div className="mt-2 text-center">
                  <span className="text-[11px] font-bold text-emerald-700">💳 Paid Online via Platform</span>
                </div>
              )}

              {req.selectedWorkers?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-200/60">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase mb-1">Assigned Team Members:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {req.selectedWorkers.map(w => (
                      <span key={w._id} className="bg-white text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                        {w.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    );
  };

  // ── Render Member Group Invite Card ───────────────────────────────────────
  const renderMemberInvite = (req) => {
    const myEntry = req.memberRequests?.find(m => (m.workerId?._id || m.workerId)?.toString() === profile?._id?.toString()) ||
                    req.memberInvitations?.find(m => (m.workerId?._id || m.workerId)?.toString() === profile?._id?.toString());
    const rawStatus = myEntry?.status || req.status || 'pending';
    const myStatus = rawStatus.replace('member_', '');
    const ratePerWorker = req.offeredRate || myEntry?.offeredRate || req.agreedRatePerWorker || req.farmerOfferedRatePerWorker || 0;
    const rateUnit = req.rateUnit || (req.bookingType === 'DAILY' ? 'day' : 'hr');
    const targetId = req.requestId || req._id;
    const leaderName = req.teamLeader?.name || req.teamLeaderId?.name || 'Your Team Leader';

    return (
      <div key={targetId} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-5">
        <div className="p-5">
          <div className="flex justify-between items-center mb-3">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${STATUS_BADGES[myStatus] || 'bg-slate-100'}`}>
              Invite: {myStatus}
            </span>
            <span className="text-[11px] font-bold text-slate-400">
              {req.scheduledDate ? new Date(req.scheduledDate).toDateString() : (req.startDate ? new Date(req.startDate).toDateString() : 'Upcoming')}
            </span>
          </div>

          <h3 className="font-black text-slate-800 text-lg mb-1">{req.workTitle || req.workCategory || 'Team Farm Job'}</h3>
          <p className="text-xs text-slate-500 mb-3">
            Leader: <strong className="text-slate-700">{leaderName}</strong>
          </p>

          <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-100 mb-4 text-xs">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Schedule</p>
              <p className="font-bold text-slate-800">
                {req.bookingType === 'DAILY' ? `${req.numberOfDays || 1} Day(s)` : `${req.startTime || '00:00'} - ${req.endTime || 'Flexible'}`}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Your Earnings</p>
              <p className="font-black text-emerald-600 text-sm">₹{ratePerWorker} <span className="text-[10px] font-normal text-slate-400">/{rateUnit}</span></p>
            </div>
          </div>

          {myStatus === 'pending' && (
            <div className="flex gap-2">
              <button 
                onClick={() => handleMemberResponse(targetId, 'accept')} 
                disabled={submittingAction}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-1.5"
              >
                <FiCheck /> Accept Job (₹{ratePerWorker})
              </button>
              <button 
                onClick={() => handleMemberResponse(targetId, 'reject')} 
                disabled={submittingAction}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl font-bold text-xs"
              >
                Decline
              </button>
            </div>
          )}

          {myStatus === 'accepted' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
              <p className="text-xs font-black text-emerald-700">✓ You accepted this invitation. Team Leader is finalizing the team.</p>
            </div>
          )}

          {myStatus === 'rejected' && (
            <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-center">
              <p className="text-xs font-bold text-slate-500">You declined this invitation.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Helmet><title>Group Bookings | Agroyilt</title></Helmet>
      <Header title="Group Bookings" showBack={true} />

      <div className="max-w-2xl mx-auto px-4 pt-4">

        {/* Tabs for switching between Leader Requests and Member Invites */}
        {isTeamLeader && memberInvites.length > 0 && (
          <div className="flex bg-slate-200/80 p-1 rounded-xl mb-5 text-xs font-bold">
            <button 
              onClick={() => setActiveTab('leader')} 
              className={`flex-1 py-2 rounded-lg transition-all ${activeTab === 'leader' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Leader Requests ({requests.length})
            </button>
            <button 
              onClick={() => setActiveTab('member')} 
              className={`flex-1 py-2 rounded-lg transition-all ${activeTab === 'member' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              My Invites ({memberInvites.length})
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-semibold text-slate-500">Loading requests...</p>
          </div>
        ) : isTeamLeader && activeTab === 'leader' ? (
          requests.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm">
              <FiLayers className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <h3 className="font-black text-slate-700 text-base">No Group Booking Requests</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                When farmers search for team leaders and send group booking requests, they will appear here.
              </p>
            </div>
          ) : (
            requests.map(renderLeaderRequest)
          )
        ) : (
          memberInvites.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm">
              <FiUsers className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <h3 className="font-black text-slate-700 text-base">No Team Invitations</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                When your team leader dispatches a group farm job to you, it will appear here for you to accept.
              </p>
            </div>
          ) : (
            memberInvites.map(renderMemberInvite)
          )
        )}

      </div>
    </div>
  );
};

export default WorkerGroupRequests;
