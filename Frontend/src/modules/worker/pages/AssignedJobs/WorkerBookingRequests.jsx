import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FiArrowLeft, FiClock, FiMapPin, FiCalendar, FiDollarSign, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import workerBookingService from '../../../../services/workerBookingService'; // Use the main booking service
import workerService from '../../../../services/workerService';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
  expired: 'bg-slate-100 text-slate-700 border-slate-200',
  awaiting_farmer_confirmation: 'bg-blue-100 text-blue-700 border-blue-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-300'
};

const isPastScheduledTime = (req) => {
  if (!req) return false;
  if (req.isExpired || req.status === 'expired' || req.status === 'cancelled' || req.status === 'completed') {
    return true;
  }
  try {
    const isDaily = Boolean(req.startDate || req.bookingType === 'DAILY' || req.rateUnit === 'daily');
    const now = Date.now();
    if (isDaily) {
      const dateSource = req.endDate || req.startDate;
      if (dateSource) {
        const d = new Date(dateSource);
        if (!isNaN(d.getTime())) {
          const istStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
          const expiryTime = new Date(`${istStr}T23:59:59.999+05:30`).getTime();
          if (now >= expiryTime) return true;
        }
      }
    } else {
      const dateSource = req.scheduledDate || req.date || req.startDate;
      if (dateSource) {
        const d = new Date(dateSource);
        if (!isNaN(d.getTime())) {
          const istStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
          let targetDateStr = istStr;
          let targetHours = 23;
          let targetMinutes = 59;
          if (req.endTime && typeof req.endTime === 'string') {
            const match = req.endTime.trim().match(/^(\d{1,2}):(\d{2})/);
            if (match) {
              targetHours = parseInt(match[1], 10);
              targetMinutes = parseInt(match[2], 10);
              if (req.startTime && typeof req.startTime === 'string') {
                const sMatch = req.startTime.trim().match(/^(\d{1,2}):(\d{2})/);
                if (sMatch) {
                  const sMins = parseInt(sMatch[1], 10) * 60 + parseInt(sMatch[2], 10);
                  const eMins = targetHours * 60 + targetMinutes;
                  if (eMins < sMins) {
                    const nextDay = new Date(`${istStr}T12:00:00+05:30`);
                    nextDay.setDate(nextDay.getDate() + 1);
                    targetDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(nextDay);
                  }
                }
              }
            }
          }
          const hh = String(targetHours).padStart(2, '0');
          const mm = String(targetMinutes).padStart(2, '0');
          const scheduledExpiryTime = new Date(`${targetDateStr}T${hh}:${mm}:00+05:30`).getTime();
          if (now >= scheduledExpiryTime) return true;
        }
      }
    }
  } catch (e) {}
  return false;
};

const WorkerBookingRequests = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Rate input state per request id
  const [offeredRates, setOfferedRates] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      // Fetch farmer broadcast requests pending for this worker (NEW endpoint)
      const res = await workerService.getPendingFarmerRequests();
      const data = res?.data || res || [];
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleAction = async (id, action, minRate, maxRate) => {
    if (action === 'accept') {
      const rate = Number(offeredRates[id]);
      if (!rate || (minRate && rate < minRate) || (maxRate && rate > maxRate)) {
        toast.error(`Please enter a valid rate between ₹${minRate || 0} and ₹${maxRate}`);
        return;
      }
      try {
        setSubmitting(true);
        await workerBookingService.workerRespondToFarmerRequest(id, action, rate);
        toast.success('Offer submitted successfully!');
        fetchRequests();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to submit offer');
      } finally {
        setSubmitting(false);
      }
    } else {
      // Reject
      if (!window.confirm('Are you sure you want to reject this request?')) return;
      try {
        setSubmitting(true);
        await workerBookingService.workerRespondToFarmerRequest(id, 'reject');
        toast.success('Request rejected');
        fetchRequests();
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message || '';
        if (err.response?.status === 410 || errMsg.toLowerCase().includes('expired')) {
          toast.success('Request has expired and has been dismissed.');
          fetchRequests();
        } else {
          toast.error(errMsg || 'Action failed');
        }
      } finally {
        setSubmitting(false);
      }
    }
  };

  const renderRequest = (req) => {
    // Find my status
    // Assuming the backend returns the worker's own status in `req.myStatus` or we can find it in dispatchedTo
    let myStatus = req.myStatus || 'pending';
    if (req.dispatchedTo && Array.isArray(req.dispatchedTo)) {
       // Worker panel API should populate the worker's user ID. We assume the backend already filtered it or marked it.
       // For safety, fallback to visual display based on status string.
    }

    const isExpired = isPastScheduledTime(req);
    const isPending = (req.status === 'pending' || req.status === 'matching') && !isExpired;
    const canRespond = myStatus === 'pending' && isPending;

    return (
      <div key={req._id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-4">
        <div className="p-5">
          <div className="flex justify-between items-start mb-3">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${STATUS_COLORS[isExpired ? 'expired' : req.status] || STATUS_COLORS.pending}`}>
              {isExpired ? 'EXPIRED' : req.status.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <FiClock size={10} />
              {new Date(req.createdAt).toLocaleDateString()}
            </span>
          </div>

          <div className="mb-4">
            <h3 className="font-black text-slate-800 text-lg">{req.workTitle}</h3>
            {req.workDescription && <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{req.workDescription}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1"><FiCalendar /> Date</p>
              <p className="font-black text-slate-700">{new Date(req.scheduledDate).toDateString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1"><FiClock /> Time</p>
              <p className="font-black text-slate-700">{req.startTime} - {req.endTime}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1"><FiMapPin /> Location</p>
              <p className="font-black text-slate-700 truncate">{req.location?.city || 'Not specified'}</p>
            </div>
            <div className="col-span-2 mt-2 pt-2 border-t border-slate-200">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1"><FiDollarSign /> Farmer Budget</p>
              <p className="font-black text-lg text-emerald-600">
                ₹{req.minRate} - ₹{req.maxRate} <span className="text-xs text-slate-400 font-medium">/{req.rateUnit || 'daily'}</span>
              </p>
            </div>
          </div>

          {canRespond && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-500 mb-2">Submit your rate offer to the farmer:</p>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input 
                    type="number" 
                    value={offeredRates[req._id] || ''} 
                    onChange={e => setOfferedRates({...offeredRates, [req._id]: e.target.value})} 
                    placeholder={`e.g. ${req.maxRate}`} 
                    min={req.minRate}
                    max={req.maxRate}
                    className="w-full border-2 border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold focus:outline-none focus:border-emerald-500 transition-colors" 
                  />
                </div>
                <button 
                  onClick={() => handleAction(req._id, 'accept', req.minRate, req.maxRate)} 
                  disabled={submitting}
                  className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-black text-sm active:scale-95 transition-transform shadow-sm disabled:opacity-50"
                >
                  Accept
                </button>
                <button 
                  onClick={() => handleAction(req._id, 'reject')} 
                  disabled={submitting}
                  className="bg-slate-100 text-slate-600 px-4 py-3 rounded-xl active:scale-95 transition-transform"
                >
                  <FiX size={20} />
                </button>
              </div>
            </div>
          )}

          {!canRespond && req.workerOffers && (
            <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100 text-center">
              <p className="text-xs font-bold text-blue-700">You submitted an offer. Waiting for farmer's payment...</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Helmet><title>Work Requests | AgroYilt</title></Helmet>

      <div className="bg-white sticky top-0 z-40 border-b border-slate-100 px-4 h-16 flex items-center gap-4 shadow-sm">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center active:scale-95">
          <FiArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-black text-slate-800">New Work Requests</h1>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
              <FiClock size={24} className="text-slate-400" />
            </div>
            <p className="font-black text-slate-700 text-lg mb-1">No incoming requests</p>
            <p className="text-sm text-slate-500 font-medium">We'll notify you when work matches your skills.</p>
          </div>
        ) : (
          requests.map(renderRequest)
        )}
      </div>
    </div>
  );
};

export default WorkerBookingRequests;
