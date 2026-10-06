import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft, FiSearch, FiStar, FiMapPin, FiFilter,
  FiUsers, FiAward, FiChevronRight, FiX
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import workerBookingService from '../../../../services/workerBookingService';

const StarRow = ({ rating }) => (
  <div className="flex items-center gap-0.5">
    {[1,2,3,4,5].map(s => (
      <svg key={s} width="10" height="10" viewBox="0 0 24 24" fill={s <= Math.round(rating) ? '#f59e0b' : '#e2e8f0'}>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    ))}
    <span className="text-[10px] text-slate-500 ml-1">{rating?.toFixed(1) || '0.0'}</span>
  </div>
);

const LeaderCard = ({ leader, onSelect }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200 overflow-hidden">
              {leader.profilePhoto
                ? <img src={leader.profilePhoto} alt={leader.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl font-black text-emerald-600">
                    {leader.name?.[0]?.toUpperCase()}
                  </div>
              }
            </div>
            <span className="absolute -top-1 -right-1 bg-amber-400 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">
              LEADER
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-black text-slate-800 text-base truncate">{leader.name}</h3>
            </div>
            <StarRow rating={leader.rating} />
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <FiUsers size={10} /> Team: {leader.teamId?.name || 'Unnamed Team'}
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Team Size</p>
            <p className="text-xl font-black text-emerald-600">{leader.teamId?.memberCount || 0}</p>
            <p className="text-[9px] text-slate-400">members</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-50">
          <div className="text-center">
            <p className="text-sm font-black text-slate-800">₹{leader.dailyRate || 0}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase">Avg Rate/Day</p>
          </div>
          {leader.teamId?.location?.city && (
            <div className="flex items-center gap-1 text-slate-500 text-xs">
              <FiMapPin size={11} />
              <span className="font-medium">{leader.teamId.location.city}</span>
            </div>
          )}
          <div className="ml-auto">
            <button
              onClick={() => onSelect(leader)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-2xl font-bold text-xs flex items-center gap-1 active:scale-95 transition-all"
            >
              Request Group <FiChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const FilterPanel = ({ filters, setFilters, onClose }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    className="fixed inset-0 bg-black/40 z-50 flex items-end"
    onClick={onClose}
  >
    <div className="bg-white w-full rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-black text-slate-800 text-lg">Filter Teams</h3>
        <button onClick={onClose}><FiX size={22} className="text-slate-500" /></button>
      </div>
      <div className="space-y-5">
        <div>
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Skill Needed</label>
          <input
            type="text"
            placeholder="e.g. Harvesting"
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
            value={filters.skill}
            onChange={e => setFilters(p => ({ ...p, skill: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Min Team Size</label>
          <input
            type="number"
            min="2"
            placeholder="e.g. 5"
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
            value={filters.minTeamSize}
            onChange={e => setFilters(p => ({ ...p, minTeamSize: e.target.value }))}
          />
        </div>
      </div>
      <button onClick={onClose} className="w-full mt-6 py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm">
        Apply Filters
      </button>
    </div>
  </motion.div>
);

const TeamLeaderList = () => {
  const navigate = useNavigate();
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({ skill: '', minTeamSize: '' });

  const fetchLeaders = async () => {
    try {
      setLoading(true);
      const res = await workerBookingService.listTeamLeaders({
        skill: filters.skill || undefined,
        minTeamSize: filters.minTeamSize || undefined
      });
      setLeaders(res.data || []);
    } catch (err) {
      toast.error('Failed to load team leaders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeaders(); }, [filters]);

  const filtered = leaders.filter(l =>
    !search ||
    l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.teamId?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (leader) => {
    navigate(`/user/group-request/${leader._id}`, { state: { leader } });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Helmet><title>Hire a Team | Agroyilt</title></Helmet>

      <div className="bg-white sticky top-0 z-40 border-b border-slate-100 px-5 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate('/user/worker-explorer')} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600">
            <FiArrowLeft size={20} />
          </button>
          <div className="flex-1 flex items-center bg-slate-50 rounded-2xl px-4 gap-2 border border-slate-100">
            <FiSearch size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search team or leader…"
              className="flex-1 py-3 bg-transparent text-sm font-medium focus:outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={() => setShowFilter(true)} className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white">
            <FiFilter size={16} />
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-slate-600">
            {loading ? 'Loading…' : `${filtered.length} teams available`}
          </p>
          <button onClick={() => navigate('/user/my-worker-requests?tab=group')} className="text-xs font-black text-emerald-600">
            My Requests →
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1,2].map(i => <div key={i} className="bg-white rounded-3xl h-40 animate-pulse border border-slate-100" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">🤝</p>
            <p className="font-black text-slate-700 text-lg">No Teams Found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(l => <LeaderCard key={l._id} leader={l} onSelect={handleSelect} />)}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showFilter && <FilterPanel filters={filters} setFilters={setFilters} onClose={() => setShowFilter(false)} />}
      </AnimatePresence>
    </div>
  );
};

export default TeamLeaderList;
