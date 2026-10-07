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

const Vendors = () => {
  const location = useLocation();

  const navTabs = [
    { name: 'All Vendors', path: '/admin/vendors/all', icon: FiUsers },
    { name: 'Vendor Bookings', path: '/admin/vendors/bookings', icon: FiBriefcase },
    { name: 'Vendor Analytics', path: '/admin/vendors/analytics', icon: FiActivity },
    { name: 'Registration Fees', path: '/admin/vendors/registration-fees', icon: FiDollarSign },
  ];

  return (
    <div className="space-y-6">
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
          <Route path="*" element={<Navigate to="all" replace />} />
        </Routes>
      </motion.div>
    </div>
  );
};

export default Vendors;
