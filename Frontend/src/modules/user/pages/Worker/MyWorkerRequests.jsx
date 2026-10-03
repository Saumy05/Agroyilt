import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  FiArrowLeft, FiClock, FiCheck, FiX,
  FiRefreshCcw, FiUsers, FiUser, FiPlus,
  FiAlertCircle, FiNavigation
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import workerBookingService from '../../../../services/workerBookingService';

// ── Status styles ───────────────────────────────────────────────────────────

const STATUS_COLORS = {
  pending:                     'bg-amber-100 text-amber-700 border-amber-200',
  matching:                    'bg-blue-100 text-blue-700 border-blue-200',
  awaiting_farmer_confirmation:'bg-orange-100 text-orange-800 border-orange-200',
  confirmed:                   'bg-emerald-100 text-emerald-700 border-emerald-200',
  accepted:                    'bg-blue-100 text-blue-700 border-blue-200',
  leader_accepted:             'bg-blue-100 text-blue-700 border-blue-200',
  collecting_members:          'bg-purple-100 text-purple-700 border-purple-200',
  selection_pending:           'bg-indigo-100 text-indigo-700 border-indigo-200',
  rejected:                    'bg-red-100 text-red-700 border-red-200',
  cancelled:                   'bg-slate-100 text-slate-700 border-slate-200',
  expired:                     'bg-slate-100 text-slate-700 border-slate-200',
};

const STATUS_LABELS = {
  pending:                     'Waiting for Responses',
  matching:                    'Matching Workers…',
  awaiting_farmer_confirmation:'Confirmation Needed',
  confirmed:                   'Confirmed',
  accepted:                    'Worker Accepted',
  leader_accepted:             'Leader Accepted',
  collecting_members:          'Gathering Team',
  selection_pending:           'Leader Selecting',
  rejected:                    'No Workers Available',
  cancelled:                   'Cancelled',
  expired:                     'Expired',
};

// ── Component ───────────────────────────────────────────────────────────────

const MyWorkerRequests = () => {
  const navigate = useNavigate();

  // Tabs: 'farmer' = new farmer-first, 'single' = legacy, 'group' = legacy
  const [tab, setTab] = useState('farmer');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Legacy negotiation state
  const [counterRate, setCounterRate] = useState('');
  const [activeNegotiationId, setActiveNegotiationId] = useState(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      let res;
      if (tab === 'farmer') {
        res = await workerBookingService.getMyFarmerRequests();
      } else if (tab === 'single') {
        res = await workerBookingService.getMyRequests();
      } else {
        res = await workerBookingService.getMyGroupRequests();
      }

      let data = res.data || [];

      // ── Client-side expiry guard ──────────────────────────────────────────
      // If backend returns a stale pending/matching request that has passed
      // its expiresAt window, mark it expired locally so the list is accurate.
      if (tab === 'farmer') {
        const now = Date.now();
        data = data.map(r => {
          if (['pending', 'matching'].includes(r.status) && r.expiresAt) {
            const expiresAtMs = new Date(r.expiresAt).getTime();
            if (!isNaN(expiresAtMs) && now > expiresAtMs) {
              return { ...r, status: 'expired' };
            }
          }
          return r;
        });
      }

      setRequests(data);
    } catch {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchRequests();
    setActiveNegotiationId(null);
  }, [fetchRequests]);

  // Legacy negotiation actions
  const handleLegacyAction = async (id, action, rate = null) => {
    try {
      if (tab === 'single') {
        await workerBookingService.respondToCounter(id, action, rate);
      } else {
        await workerBookingService.respondToGroupCounter(id, action, rate);
      }
      toast.success(action === 'counter' ? 'Counter offer sent!' : `Request ${action}ed`);
      fetchRequests();
      setActiveNegotiationId(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleLegacyCancel = async (id) => {
    if (!window.confirm('Cancel this request?')) return;
    try {
      if (tab === 'single') await workerBookingService.cancelRequest(id);
      else await workerBookingService.cancelGroupRequest(id);
      toast.success('Request cancelled');
      fetchRequests();
    } catch {
      toast.error('Cancel failed');
    }
  };

  // ── Render: Farmer-first broadcast request card ─────────────────────────
  const renderFarmerRequest = (req) => {
    const isPartial = req.status === 'awaiting_farmer_confirmation';
    const isConfirmed = req.status === 'confirmed';

    return (
      <div
        key={req._id}
        className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-4 cursor-pointer active:scale-[0.99] transition-all"
        onClick={() => navigate(`/user/farmer-worker-request/${req._id}`, { state: { fromHistory: true } })}
      >
        <div className="p-5">
          {/* Header row */}
          <div className="flex justify-between items-start mb-3">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${STATUS_COLORS[req.status] || STATUS_COLORS.pending}`}>
              {STATUS_LABELS[req.status] || req.status}
            </span>
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <FiClock size={10} />
              {new Date(req.createdAt).toLocaleDateString()}
            </span>
          </div>

          {/* Title + routing badge */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <FiUsers size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-black text-slate-800 text-base leading-tight truncate">{req.workTitle}</h3>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                {req.workCategory || 'Farm Work'} &bull;&nbsp;
                <span className="text-slate-600 font-bold">{req.requiredWorkers} worker{req.requiredWorkers !== 1 ? 's' : ''} needed</span>
              </p>
              <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${req.requestType === 'independent_broadcast' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                {req.requestType === 'independent_broadcast' ? <><FiUser size={10} /> Independent</> : <><FiUsers size={10} /> Team Leader</>}
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="bg-slate-50 rounded-2xl p-3 mb-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Needed</p>
              <p className="text-sm font-black text-slate-700">{req.requiredWorkers}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Accepted</p>
              <p className={`text-sm font-black ${req.acceptedWorkersCount > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                {req.acceptedWorkersCount || 0}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Date</p>
              <p className="text-[10px] font-black text-slate-700">{new Date(req.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
            </div>
          </div>

          {/* Live Tracking CTA on confirmed cards */}
          {isConfirmed && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <FiCheck size={14} className="text-emerald-500 stroke-[3]" />
                Workers Confirmed
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/user/booking/${req._id}/track`, { state: { fromHistory: true } });
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <FiNavigation size={12} className="animate-pulse" />
                <span>Live Tracking</span>
              </button>
            </div>
          )}

          {/* Partial confirmation alert */}
          {isPartial && (
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 flex items-center gap-2">
              <FiAlertCircle size={14} className="text-orange-500 shrink-0" />
              <p className="text-xs font-bold text-orange-700">
                Tap to confirm or reject — {req.acceptedWorkersCount} worker(s) available
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Render: legacy single/group card ────────────────────────────────────
  const renderLegacyRequest = (req) => {
    const isSingle = tab === 'single';
    const worker   = isSingle ? req.workerId : req.teamLeaderId;
    const lastNeg  = req.negotiation?.[req.negotiation.length - 1];
    const isMyTurn = req.status === 'pending' && lastNeg && lastNeg.by !== 'farmer';

    return (
      <div key={req._id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-4">
        <div className="p-5">
          <div className="flex justify-between items-start mb-3">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${STATUS_COLORS[req.status] || STATUS_COLORS.pending}`}>
              {STATUS_LABELS[req.status] || req.status}
            </span>
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <FiClock size={10} />
              {new Date(req.createdAt).toLocaleDateString()}
            </span>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isSingle ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {isSingle ? <FiUser size={20} /> : <FiUsers size={20} />}
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-lg leading-tight">{req.workTitle}</h3>
              <p className="text-sm font-medium text-slate-500">
                To: <span className="font-bold text-slate-700">{worker?.name || 'Unknown'}</span>
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 mb-4 grid grid-cols-2 gap-y-3">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Date</p>
              <p className="text-xs font-black text-slate-700">{new Date(req.scheduledDate).toDateString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Time</p>
              <p className="text-xs font-black text-slate-700">{req.startTime} – {req.endTime}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Offer</p>
              <p className={`text-xs font-black ${isMyTurn ? 'text-amber-600' : 'text-slate-700'}`}>
                ₹{lastNeg?.rate || (isSingle ? req.farmerOfferedRate : req.farmerOfferedRatePerWorker)} / {req.rateUnit}
              </p>
            </div>
          </div>

          {isMyTurn && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-bold text-amber-600 mb-3 text-center">Worker counter-offered. Respond:</p>
              {activeNegotiationId === req._id ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={counterRate}
                    onChange={e => setCounterRate(e.target.value)}
                    placeholder="New Rate ₹"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                  />
                  <button onClick={() => handleLegacyAction(req._id, 'counter', counterRate)} className="bg-amber-500 text-white px-4 rounded-xl font-bold text-xs">Send</button>
                  <button onClick={() => setActiveNegotiationId(null)} className="bg-slate-100 text-slate-600 px-3 rounded-xl"><FiX /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => handleLegacyAction(req._id, 'accept')} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl font-bold text-xs">Accept</button>
                  <button onClick={() => setActiveNegotiationId(req._id)} className="flex-1 bg-amber-50 text-amber-600 border border-amber-200 py-2.5 rounded-xl font-bold text-xs">Counter</button>
                  <button onClick={() => handleLegacyAction(req._id, 'reject')} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold text-xs">Reject</button>
                </div>
              )}
            </div>
          )}

          {req.status === 'pending' && !isMyTurn && (
            <div className="mt-4 border-t border-slate-100 pt-4 flex justify-end">
              <button onClick={() => handleLegacyCancel(req._id)} className="text-xs font-bold text-red-500 bg-red-50 px-4 py-2 rounded-xl">Cancel</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const TABS = [
    { key: 'farmer', label: '🌾 My Requests' },
    { key: 'single', label: 'Single' },
    { key: 'group',  label: 'Group' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Helmet>
        <title>My Worker Requests | Agroyilt</title>
      </Helmet>

      {/* Header */}
      <div className="bg-white sticky top-0 z-40 border-b border-slate-100">
        <div className="px-5 py-4 max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600">
              <FiArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-black text-slate-800">Worker Requests</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/user/worker-request/new')}
              className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center active:scale-95"
            >
              <FiPlus size={16} />
            </button>
            <button
              onClick={fetchRequests}
              className="w-9 h-9 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center active:scale-95"
            >
              <FiRefreshCcw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-slate-100 max-w-xl mx-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3.5 text-xs font-black border-b-2 transition-colors ${
                tab === t.key
                  ? t.key === 'farmer' ? 'border-emerald-600 text-emerald-700' : t.key === 'single' ? 'border-blue-600 text-blue-700' : 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-5">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-3xl h-40 animate-pulse border border-slate-100" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">📋</p>
            <p className="font-black text-slate-700 text-lg">No requests yet</p>
            <button
              onClick={() => navigate('/user/worker-request/new')}
              className="mt-5 bg-emerald-600 text-white font-bold text-sm px-6 py-3 rounded-2xl"
            >
              + Create New Request
            </button>
          </div>
        ) : (
          <div>
            {tab === 'farmer'
              ? requests.map(renderFarmerRequest)
              : requests.map(renderLegacyRequest)
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default MyWorkerRequests;
