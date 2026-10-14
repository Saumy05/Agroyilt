import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

// Lazy load sub-pages
import Blogs from './Blogs';
import Articles from './Articles';
import Reviews from './Reviews';
import FAQ from './FAQ';
import AboutUs from './AboutUs';
import AppGuide from './AppGuide';

const WebsiteSettings = () => {
  const location = useLocation();

  return (
    <div className="space-y-6">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="blogs" replace />} />
          <Route path="blogs" element={<Blogs />} />
          <Route path="articles" element={<Articles />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="faq" element={<FAQ />} />
          <Route path="about-us" element={<AboutUs />} />
          <Route path="app-guide" element={<AppGuide />} />
          <Route path="*" element={<Navigate to="blogs" replace />} />
        </Routes>
      </motion.div>
    </div>
  );
};

export default WebsiteSettings;
