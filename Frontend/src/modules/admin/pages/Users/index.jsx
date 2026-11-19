import React from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiUsers, FiShoppingBag, FiActivity, FiDollarSign, FiCreditCard } from 'react-icons/fi';

// Import sub-components
import AllFarmers from './AllFarmers';
import FarmerBookings from './FarmerBookings';
import FarmerAnalytics from './FarmerAnalytics';
import FarmerRegistrationFees from './FarmerRegistrationFees';
import VendorWallets from '../Vendors/VendorWallets';

const Users = () => {
  const location = useLocation();

  const navTabs = [
    { name: 'All Farmers', path: '/admin/users/all', icon: FiUsers },
    { name: 'Farmer Bookings', path: '/admin/users/bookings', icon: FiShoppingBag },
    { name: 'Farmer Analytics', path: '/admin/users/analytics', icon: FiActivity },
    { name: 'Registration Fees', path: '/admin/users/registration-fees', icon: FiCreditCard },
    { name: 'Farmer Wallets', path: '/admin/users/wallets', icon: FiDollarSign },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Farmer Management</h1>
          <p className="text-xs text-slate-500 font-normal">Manage farmers, their equipment bookings, wallets, and dues.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1.5 pb-0.5 scrollbar-hide">
        {navTabs.map(tab => {
          const isActive = location.pathname.includes(tab.path);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Icon size={14} />
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
          <Route path="all" element={<AllFarmers />} />
          <Route path="bookings" element={<FarmerBookings />} />
          <Route path="analytics" element={<FarmerAnalytics />} />
          <Route path="registration-fees" element={<FarmerRegistrationFees />} />
          <Route path="wallets" element={<VendorWallets initialRole="user" />} />
          <Route path="*" element={<Navigate to="all" replace />} />
        </Routes>
      </motion.div>
    </div>
  );
};

export default Users;
