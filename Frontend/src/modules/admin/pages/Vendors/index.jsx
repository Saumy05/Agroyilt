import React from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiUsers,
  FiBriefcase,
  FiActivity,
  FiDollarSign
} from 'react-icons/fi';

// Import sub-components
import AllOwners from './AllOwners';
import OwnerBookings from './OwnerBookings';
import OwnerAnalytics from './OwnerAnalytics';
import VendorRegistrationFees from './VendorRegistrationFees';
import VendorWallets from './VendorWallets';
import VendorIncentives from './VendorIncentives';

const Vendors = () => {
  const location = useLocation();

  const navTabs = [
    { name: 'All Vendors', path: '/admin/vendors/all', icon: FiUsers },
    { name: 'Vendor Bookings', path: '/admin/vendors/bookings', icon: FiBriefcase },
    { name: 'Vendor Analytics', path: '/admin/vendors/analytics', icon: FiActivity },
    { name: 'Registration Fees', path: '/admin/vendors/registration-fees', icon: FiDollarSign },
    { name: 'Vendor Wallets', path: '/admin/vendors/wallets', icon: FiDollarSign },
    { name: 'Incentives', path: '/admin/vendors/incentives', icon: FiActivity },
  ];

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Vendor Management</h1>
          <p className="text-xs text-slate-500 font-normal">Manage machinery owners, vendors, equipment bookings, and dues.</p>
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
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Icon size={14} />
              {tab.name}
            </Link>
          );
        })}
      </div>

      {/* Page Content */}
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="all" replace />} />
          <Route path="all" element={<AllOwners />} />
          <Route path="bookings" element={<OwnerBookings />} />
          <Route path="analytics" element={<OwnerAnalytics />} />
          <Route path="registration-fees" element={<VendorRegistrationFees />} />
          <Route path="wallets" element={<VendorWallets initialRole="vendor" />} />
          <Route path="incentives" element={<VendorIncentives initialRole="vendor" />} />
          <Route path="*" element={<Navigate to="all" replace />} />
        </Routes>
      </motion.div>
    </div>
  );
};

export default Vendors;
