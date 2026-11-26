import React, { useState, useEffect, useLayoutEffect } from 'react';
import { confirmAction } from '../../../../utils/confirmAction';
import { useNavigate } from 'react-router-dom';
import { FiUsers, FiPlus, FiEdit2, FiTrash2, FiSearch, FiUser, FiBriefcase, FiPhone } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { vendorTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import LogoLoader from '../../../../components/common/LogoLoader';
import { getWorkers, deleteWorker } from '../../services/workerService';
import { toastManager } from '../../../../utils/toastManager';


const WorkersList = () => {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

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
    const loadWorkers = async () => {
      try {
        const response = await getWorkers();
        const mapped = (response.data || response).map(w => ({
          ...w,
          id: w._id || w.id
        }));
        setWorkers(mapped || []);
      } catch (error) {
        console.error('Error loading workers:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWorkers();
    window.addEventListener('vendorWorkersUpdated', loadWorkers);

    return () => {
      window.removeEventListener('vendorWorkersUpdated', loadWorkers);
    };
  }, []);

  const handleDelete = async (workerId) => {
    if (await confirmAction('Are you sure you want to delete this worker?', { type: 'danger' })) {
      try {
        await deleteWorker(workerId);
        setWorkers(workers.filter(w => w.id !== workerId));
        window.dispatchEvent(new Event('vendorWorkersUpdated'));
      } catch (error) {
        console.error('Error deleting worker:', error);
        toastManager.error('Failed to delete worker');
      }
    }
  };

  const filteredWorkers = workers.filter(worker => {
    const workerStatus = (worker.status || 'OFFLINE').toUpperCase();
    const isOnline = workerStatus === 'ONLINE';
    const isOffline = workerStatus === 'OFFLINE' || workerStatus === 'ACTIVE';

    const matchesFilter = filter === 'all' ||
      (filter === 'online' && isOnline) ||
      (filter === 'offline' && isOffline);

    const matchesSearch = searchQuery === '' ||
      worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.phone.includes(searchQuery);

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Operators & Drivers" />

      <main className="px-4 py-6">
        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all font-medium"
            />
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { id: 'all', label: 'All Staff' },
            { id: 'online', label: 'Online' },
            { id: 'offline', label: 'Offline' },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => setFilter(option.id)}
              className={`px-5 py-2.5 rounded-full font-bold text-xs whitespace-nowrap transition-all duration-300 ${filter === option.id
                ? 'text-white shadow-lg shadow-teal-500/20'
                : 'bg-white text-gray-500 border border-gray-100'
                }`}
              style={
                filter === option.id
                  ? { background: themeColors.button }
                  : { boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)' }
              }
            >
              {option.label}
              {filter === option.id && (
                <span className="ml-2 bg-white/20 px-1.5 py-0.5 rounded-md text-[10px]">
                  {filteredWorkers.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Workers List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="h-5 w-40 bg-slate-100 rounded" />
                    <div className="h-4 w-24 bg-slate-100 rounded" />
                    <div className="flex gap-2">
                      <div className="h-6 w-16 bg-slate-100 rounded-full" />
                      <div className="h-6 w-16 bg-slate-100 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-dashed border-gray-200">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiUsers className="w-10 h-10 text-gray-200" />
            </div>
            <p className="text-gray-600 font-bold mb-1">No operators found</p>
            <p className="text-xs text-gray-400 mb-6 font-medium">
              {searchQuery ? 'Try matching a different name or phone' : 'Start by adding a driver/operator to your team'}
            </p>
            <button
              onClick={() => navigate('/vendor/workers/add')}
              className="px-8 py-3.5 rounded-xl font-bold text-white text-sm transition-all active:scale-95 shadow-lg shadow-teal-500/20"
              style={{ background: themeColors.button }}
            >
              Add Operator
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredWorkers.map((worker, index) => {
              const statusRaw = (worker.status || 'OFFLINE').toUpperCase();

              let displayStatus = 'Offline';
              let statusColor = '#94A3B8'; // Grey

              if (statusRaw === 'ONLINE') {
                statusColor = '#22C55E'; // Green
                displayStatus = 'Online';
              } else if (statusRaw === 'BUSY') {
                statusColor = '#F97316'; // Orange
                displayStatus = 'Busy';
              }

              return (
                <div
                  key={worker.id || index}
                  onClick={() => navigate(`/vendor/workers/${worker.id}/edit`)}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all active:scale-[0.99] group relative"
                >
                  <div className="flex gap-4">
                    {/* Profile Photo */}
                    <div className="relative shrink-0">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-50 border-2 border-white shadow-sm ring-1 ring-gray-100">
                        {worker.profilePhoto ? (
                          <img src={worker.profilePhoto} alt={worker.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-50">
                            <FiUser className="w-8 h-8 text-gray-300" />
                          </div>
                        )}
                      </div>
                      <div
                        className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-white shadow-sm transition-all duration-300 ${statusRaw === 'ONLINE' ? 'animate-pulse ring-4 ring-green-100' : ''}`}
                        style={{ backgroundColor: statusColor }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex justify-between items-start mb-1">
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 text-lg truncate">{worker.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
                              <span
                                className="text-[10px] font-bold uppercase tracking-wider"
                                style={{ color: statusColor }}
                              >
                                {displayStatus}
                              </span>
                            </div>
                            <span className="text-gray-300">?</span>
                            <span className="text-gray-500 font-medium text-xs font-mono">{worker.phone}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/vendor/workers/${worker.id}/edit`);
                            }}
                            className="p-1.5 rounded-lg hover:bg-teal-50 text-teal-600 transition-colors"
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(worker.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Skills & Stats */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex flex-wrap gap-1.5 min-w-0 max-w-[60%]">
                          {worker.skills && worker.skills.length > 0 ? (
                            worker.skills.slice(0, 2).map((skill, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-gray-50 text-gray-500 border border-gray-100 whitespace-nowrap"
                              >
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-gray-400 font-medium italic">No skills</span>
                          )}
                          {worker.skills?.length > 2 && (
                            <span className="text-[10px] text-gray-400 font-bold">+{worker.skills.length - 2}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 ml-auto shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-amber-400 text-xs text-yellow-500">⭐</span>
                            <span className="text-xs font-bold text-gray-800">{worker.rating || '4.5'}</span>
                          </div>
                          <div className="h-3 w-[1px] bg-gray-200" />
                          <div className="text-[10px] font-bold text-gray-600">
                            {worker.completedJobs || 0} Orders
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      <motion.button
        onClick={() => navigate('/vendor/workers/add')}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl active:scale-95 z-50 overflow-hidden"
        style={{
          background: themeColors.button,
          boxShadow: `0 8px 16px ${themeColors.brand.teal}40`,
          border: '2px solid rgba(255, 255, 255, 0.2)'
        }}
        initial={{ scale: 0, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        whileHover={{ scale: 1.1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <FiPlus className="w-8 h-8 font-bold" />
      </motion.button>

      <BottomNav />
    </div>
  );
};

export default WorkersList;
