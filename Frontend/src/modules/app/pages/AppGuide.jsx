import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  FiArrowLeft,
  FiPlay,
  FiPause,
  FiSmartphone,
  FiChevronUp,
  FiChevronDown,
  FiCheckCircle,
  FiInfo,
  FiDownload
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const guideData = {
  farmer: {
    id: 'farmer',
    label: 'Farmer / किसान',
    icon: '🌾',
    badge: 'Farmer Guide',
    landscapeSrc: '/videos/agroyilt_farmer_guide_actual_screens.mp4',
    verticalSrc: '/videos/agroyilt_farmer_guide_actual_screens_vertical.mp4',
    duration: '2 min 08 sec',
    points: [
      'Quick login with mobile number and 4-digit MPIN',
      'Rent tractors, harvesters, irrigation motors (₹50/hr) & pipes (₹5/day)',
      '3 Flexible modes: Hourly (timer with Reach OTP), Daily, or Theka (contract)',
      'Secure Escrow Wallet: payments released only after job completion',
      'Live booking status tracking and verified local machinery vendors',
    ],
    registerRoute: '/user/signup',
    registerLabel: 'Register as Farmer / किसान खाता बनाएं',
  },
  worker: {
    id: 'worker',
    label: 'Worker / मज़दूर',
    icon: '👷',
    badge: 'Worker Guide',
    landscapeSrc: '/videos/agroyilt_worker_training_guide.mp4',
    verticalSrc: '/videos/agroyilt_worker_training_guide_vertical.mp4',
    duration: '2 min 02 sec',
    points: [
      'Independent worker login & profile setup with 5-star ratings',
      'Live Online/Offline switch to work whenever you are free',
      'Set custom pricing: ₹100/hr, ₹600/day, or ₹1500/acre',
      'Instant push alerts when a local farmer books you',
      'Reach OTP start and direct earnings withdrawal to your bank account',
    ],
    registerRoute: '/worker/signup',
    registerLabel: 'Join as Worker / श्रमिक खाता बनाएं',
  },
  vendor: {
    id: 'vendor',
    label: 'Vendor / मालिक',
    icon: '🚜',
    badge: 'Machinery Owner Guide',
    landscapeSrc: '/videos/agroyilt_vendor_training_guide.mp4',
    verticalSrc: '/videos/agroyilt_vendor_training_guide_vertical.mp4',
    duration: '2 min 03 sec',
    points: [
      'Equipment provider registration & Aadhar KYC verification',
      'Add tractors, harvesters, Sinchai pumps (2HP) and pipes',
      'Configure service models (with driver or rental only) & set custom rates',
      'Manage incoming farmer bookings with date, farm area, and hours',
      'Guaranteed payouts backed by AgroYilt Escrow protection',
    ],
    registerRoute: '/vendor/signup',
    registerLabel: 'Register Machinery / मशीनरी जोड़ें',
  },
};

const AppGuide = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial role from query params (?role=worker) or default to farmer
  const initialRole = searchParams.get('role');
  const [activeRole, setActiveRole] = useState(
    initialRole && guideData[initialRole] ? initialRole : 'farmer'
  );

  const [showDetails, setShowDetails] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  const current = guideData[activeRole];
  const videoSrc = current.verticalSrc;

  // Sync role to searchParams if user switches
  const handleRoleChange = (roleKey) => {
    setActiveRole(roleKey);
    setSearchParams({ role: roleKey });
  };

  // Video reload and play handling on switch
  useEffect(() => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.load();
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {
        // Autoplay may require user gesture on some browsers
        setIsPlaying(false);
      });
    }
  }, [activeRole]);

  const handleBack = () => {
    navigate('/app');
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        background: '#070c08',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 9999,
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Top App Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'rgba(10, 18, 12, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
          zIndex: 20,
        }}
      >
        {/* Back Button */}
        <button
          type="button"
          onClick={handleBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#fff',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          aria-label="Back"
        >
          <FiArrowLeft size={20} />
        </button>

        {/* Title */}
        <div style={{ textAlign: 'center', flex: 1, padding: '0 8px' }}>
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.2px' }}>
            AgroYilt Guide / वीडियो सीखें
          </h1>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#A5D6A7', fontWeight: 600 }}>
            Real Screens • Hindi Audio (~2 min)
          </p>
        </div>

        {/* Reel Format Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 10px',
            fontSize: '0.74rem',
            fontWeight: 700,
            borderRadius: '8px',
            background: '#2E7D32',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(46, 125, 50, 0.4)',
          }}
          title="Mobile Reel (9:16)"
        >
          <FiSmartphone size={13} />
          <span>Reel</span>
        </div>
      </div>

      {/* Role Tabs Segmented Control */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          padding: '8px 14px',
          background: 'rgba(0, 0, 0, 0.4)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          zIndex: 15,
        }}
      >
        {Object.entries(guideData).map(([key, item]) => {
          const isSelected = activeRole === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleRoleChange(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 6px',
                borderRadius: '12px',
                border: isSelected ? '1.5px solid #4CAF50' : '1px solid rgba(255, 255, 255, 0.08)',
                background: isSelected ? 'rgba(46, 125, 50, 0.4)' : 'rgba(255, 255, 255, 0.05)',
                color: isSelected ? '#A5D6A7' : 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
              <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: isSelected ? 800 : 600 }}>
                  {item.label.split('/')[0].trim()}
                </div>
                <div style={{ fontSize: '0.64rem', color: isSelected ? '#C8E6C9' : 'rgba(255, 255, 255, 0.45)' }}>
                  {item.label.split('/')[1]?.trim()}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Full-Screen Video Arena */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          overflow: 'hidden',
        }}
      >
        <video
          key={videoSrc}
          ref={videoRef}
          src={videoSrc}
          controls
          playsInline
          autoPlay
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            maxHeight: '100%',
            maxWidth: '500px',
            margin: '0 auto',
          }}
        />

        {/* Big initial Play/Pause Tap Target if paused */}
        {!isPlaying && (
          <div
            onClick={togglePlay}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.35)',
              cursor: 'pointer',
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#4CAF50',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 30px rgba(76, 175, 80, 0.6)',
                transition: 'transform 0.15s',
              }}
            >
              <FiPlay size={28} style={{ marginLeft: '4px' }} />
            </div>
            <span
              style={{
                marginTop: '12px',
                background: 'rgba(0, 0, 0, 0.75)',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              Tap to Play / चलाएं
            </span>
          </div>
        )}
      </div>

      {/* Expandable Details Drawer */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              background: 'rgba(14, 24, 16, 0.98)',
              borderTop: '1px solid rgba(255, 255, 255, 0.12)',
              padding: '12px 18px',
              maxHeight: '35vh',
              overflowY: 'auto',
              backdropFilter: 'blur(16px)',
              zIndex: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#A5D6A7' }}>
                Key Steps Shown in Video / वीडियो के मुख्य बिंदु:
              </div>
              <a
                href={videoSrc}
                download
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '0.72rem',
                  textDecoration: 'none',
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                }}
              >
                <FiDownload size={12} />
                <span>Download MP4</span>
              </a>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', color: 'rgba(255, 255, 255, 0.88)', fontSize: '0.76rem', lineHeight: 1.55 }}>
              {current.points.map((pt, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>{pt}</li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Sticky Action Bar */}
      <div
        style={{
          background: 'rgba(10, 18, 12, 0.95)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '10px 16px',
          backdropFilter: 'blur(12px)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* Toggle details handle */}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '0.74rem',
            cursor: 'pointer',
            padding: '2px',
          }}
        >
          <FiInfo size={13} style={{ color: '#A5D6A7' }} />
          <span>{showDetails ? 'Hide Video Summary' : 'View What This Video Teaches'}</span>
          {showDetails ? <FiChevronDown size={14} /> : <FiChevronUp size={14} />}
        </button>

        {/* Primary CTA + Login row */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => navigate(current.registerRoute)}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%)',
              color: '#fff',
              border: '1.5px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '14px',
              padding: '14px 16px',
              fontSize: '0.92rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(46, 125, 50, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'transform 0.15s ease',
            }}
            onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
            onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <span>{current.registerLabel}</span>
            <span>→</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/app/login')}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '14px',
              padding: '14px 16px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppGuide;

