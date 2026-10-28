import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { HiOutlineUser, HiOutlineTruck, HiOutlineShieldCheck } from 'react-icons/hi';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

import farmerImg from '../landing_images/tracter.jpg';
import ownerImg from '../landing_images/harvester.jpg';
import adminImg from '../landing_images/admin_dashboard.png';

// Step connector with animated line
const StepConnector = ({ isActive }) => (
  <div className="flex-1 h-0.5 bg-gray-700 mx-2 relative overflow-hidden">
    <motion.div
      className="absolute inset-0 bg-yellow-400"
      initial={{ scaleX: 0, originX: 0 }}
      animate={{ scaleX: isActive ? 1 : 0 }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
    />
  </div>
);

const WorkflowSection = () => {
  const [activeTab, setActiveTab] = useState('farmer');
  const [activeStep, setActiveStep] = useState(0);
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true });

  // Auto-advance steps
  useEffect(() => {
    if (!isInView) return;
    setActiveStep(0);
    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % 6);
    }, 1200);
    return () => clearInterval(interval);
  }, [activeTab, isInView]);

  const allTexts = useMemo(() => [
    "How It Works", "A seamless experience built for India's agriculture ecosystem.",
    "Farmer Journey", "Owner Journey", "Admin Journey",
    "OTP Login", "Select Location", "Search Machine", "Check Slot", "Secure Pay", "Review",
    "KYC Auth", "List Machine", "Admin Verify", "Get Orders", "Start Work", "Direct Pay",
    "Verify KYC", "Fleet Monitor", "Global Push", "Escrow Pay", "Analytics", "Support",
    "Integrated with Real-time OTP & GPS Tracking for complete transparency",
    "farmer", "owner", "admin"
  ], []);

  const { getTranslatedText } = usePageTranslation(allTexts);

  const roleConfig = {
    farmer: { label: getTranslatedText("Farmer Journey"), shortLabel: getTranslatedText("Farmer"), icon: <HiOutlineUser />, color: 'green', image: farmerImg, steps: ["OTP Login", "Select Location", "Search Machine", "Check Slot", "Secure Pay", "Review"] },
    owner: { label: getTranslatedText("Owner Journey"), shortLabel: getTranslatedText("Owner"), icon: <HiOutlineTruck />, color: 'yellow', image: ownerImg, steps: ["KYC Auth", "List Machine", "Admin Verify", "Get Orders", "Start Work", "Direct Pay"] },
    admin: { label: getTranslatedText("Admin Journey"), shortLabel: getTranslatedText("Admin"), icon: <HiOutlineShieldCheck />, color: 'blue', image: adminImg, steps: ["Verify KYC", "Fleet Monitor", "Global Push", "Escrow Pay", "Analytics", "Support"] },
  };

  const colorMap = {
    green: { active: 'bg-green-600 border-green-500 text-white', ring: 'ring-green-500/40', tab: 'bg-green-600' },
    yellow: { active: 'bg-yellow-500 border-yellow-400 text-gray-900', ring: 'ring-yellow-500/40', tab: 'bg-yellow-500' },
    blue: { active: 'bg-blue-600 border-blue-500 text-white', ring: 'ring-blue-500/40', tab: 'bg-blue-600' },
  };

  const currentRole = roleConfig[activeTab];
  const colors = colorMap[currentRole.color];

  return (
    <section ref={sectionRef} id="workflow" className="py-8 sm:py-12 md:py-16 bg-gray-950 overflow-hidden relative">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-green-900/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-900/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-white text-center relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-5 sm:mb-8 md:mb-10"
        >
          <span className="text-[10px] text-green-400 font-black uppercase tracking-[0.3em]">Platform</span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black mt-1.5 sm:mt-2 mb-2 sm:mb-3 tracking-tight">{getTranslatedText("How It Works")}</h2>
          <p className="text-xs sm:text-sm text-gray-400 max-w-2xl mx-auto font-medium">
            {getTranslatedText("A seamless experience built for India's agriculture ecosystem.")}
          </p>
        </motion.div>

        {/* Role Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-xs sm:max-w-md mx-auto grid grid-cols-3 bg-gray-900 p-1 rounded-xl sm:rounded-2xl mb-6 md:mb-10 border border-gray-800"
        >
          {Object.entries(roleConfig).map(([role, config]) => (
            <button
              key={role}
              onClick={() => { setActiveTab(role); setActiveStep(0); }}
              className={`relative px-2 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl font-bold transition-all text-[11px] sm:text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 ${activeTab === role ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {activeTab === role && (
                <motion.div
                  layoutId="tabBg"
                  className={`absolute inset-0 rounded-lg sm:rounded-xl ${colorMap[config.color].tab}`}
                  transition={{ type: 'spring', duration: 0.4 }}
                />
              )}
              <span className="relative z-10 text-xs sm:text-sm">{config.icon}</span>
              <span className="relative z-10 hidden sm:inline">{config.label}</span>
              <span className="relative z-10 sm:hidden">{config.shortLabel || config.label}</span>
            </button>
          ))}
        </motion.div>

        {/* Main Workflow Panel */}
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex flex-col lg:flex-row bg-gray-900 rounded-2xl sm:rounded-[2.5rem] border border-gray-800 overflow-hidden shadow-2xl"
            >
              {/* LEFT: Image */}
              <div className="lg:w-5/12 h-44 sm:h-60 lg:h-auto relative overflow-hidden">
                <img
                  src={currentRole.image}
                  alt={currentRole.label}
                  className="w-full h-full object-cover opacity-70"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-gray-900 hidden lg:block" />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950 to-transparent lg:hidden" />
                <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 text-left">
                  <span className={`inline-flex items-center space-x-1 text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full mb-1.5 sm:mb-2 ${colors.active}`}>
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    <span>Active</span>
                  </span>
                  <h3 className="text-lg sm:text-2xl font-black text-white leading-tight">{currentRole.label}</h3>
                </div>
              </div>

              {/* RIGHT: Animated Steps */}
              <div className="lg:w-7/12 p-4 sm:p-6 lg:p-10 text-left flex flex-col justify-center">

                {/* Progress bar */}
                <div className="flex items-center mb-5 sm:mb-8">
                  {currentRole.steps.map((_, idx) => (
                    <React.Fragment key={idx}>
                      <motion.div
                        animate={{
                          scale: activeStep === idx ? 1.25 : 1,
                          backgroundColor: idx <= activeStep ? (currentRole.color === 'yellow' ? '#eab308' : currentRole.color === 'blue' ? '#2563eb' : '#16a34a') : '#374151'
                        }}
                        transition={{ duration: 0.3 }}
                        className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
                      />
                      {idx < currentRole.steps.length - 1 && (
                        <StepConnector isActive={idx < activeStep} />
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* Steps grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 mb-5 sm:mb-8">
                  {currentRole.steps.map((step, idx) => (
                    <motion.div
                      key={idx}
                      animate={{
                        borderColor: activeStep === idx ? (currentRole.color === 'yellow' ? '#eab308' : currentRole.color === 'blue' ? '#2563eb' : '#16a34a') : '#374151',
                        backgroundColor: activeStep === idx ? 'rgba(255,255,255,0.05)' : 'transparent',
                      }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-2.5 rounded-lg sm:rounded-xl border min-w-0"
                    >
                      <motion.div
                        animate={{
                          backgroundColor: idx <= activeStep ? (currentRole.color === 'yellow' ? '#eab308' : currentRole.color === 'blue' ? '#2563eb' : '#16a34a') : '#1f2937',
                          color: idx <= activeStep ? '#fff' : '#6b7280',
                          scale: activeStep === idx ? 1.15 : 1,
                        }}
                        transition={{ duration: 0.3 }}
                        className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg flex items-center justify-center text-[10px] sm:text-xs font-black"
                      >
                        {idx + 1}
                      </motion.div>
                      <p className={`font-bold text-[11px] sm:text-xs tracking-wide transition-colors truncate ${idx <= activeStep ? 'text-white' : 'text-gray-400'}`}>
                        {getTranslatedText(step)}
                      </p>
                    </motion.div>
                  ))}
                </div>

                {/* Footer note */}
                <div className="flex items-center space-x-2 sm:space-x-3 text-gray-500 pt-3 sm:pt-4 border-t border-gray-800">
                  <HiOutlineShieldCheck size={16} className="text-green-500 flex-shrink-0" />
                  <p className="text-[9px] sm:text-[10px] font-medium italic">{getTranslatedText("Integrated with Real-time OTP & GPS Tracking for complete transparency")}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};

export default WorkflowSection;
