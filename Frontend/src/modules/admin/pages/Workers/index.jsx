import React from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiUsers, FiBriefcase, FiActivity, FiDollarSign, FiTag } from 'react-icons/fi';

import AllWorkers from './AllWorkers';
import WorkerBookings from './WorkerBookings';
import WorkerAnalytics from './WorkerAnalytics';
import WorkerRegistrationFees from './WorkerRegistrationFees';
import WorkCategories from './WorkCategories';

const Workers = () => {
  const location = useLocation();

  const navTabs = [
    { name: 'All Workers', path: '/admin/workers/all', icon: FiUsers },
    { name: 'Worker Bookings', path: '/admin/workers/bookings', icon: FiBriefcase },
    { name: 'Analytics', path: '/admin/workers/analytics', icon: FiActivity },
    { name: 'Registration Fees', path: '/admin/workers/registration-fees', icon: FiDollarSign },
    { name: 'Work Categories', path: '/admin/workers/categories', icon: FiTag },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Worker Management</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Manage farm workers, team leaders, and their bookings.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
        {navTabs.map(tab => {
          const isActive = location.pathname.includes(tab.path);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Icon size={18} />
              {tab.name}
            </Link>
          );
        })}
      </div>

      {/* Content Area */}
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="all" replace />} />
          <Route path="all" element={<AllWorkers />} />
          <Route path="bookings" element={<WorkerBookings />} />
          <Route path="analytics" element={<WorkerAnalytics />} />
          <Route path="registration-fees" element={<WorkerRegistrationFees />} />
          <Route path="categories" element={<WorkCategories />} />
          <Route path="*" element={<Navigate to="all" replace />} />
        </Routes>
      </motion.div>
    </div>
  );
};

export default Workers;
