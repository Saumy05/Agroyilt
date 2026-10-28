import React, { useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FiChevronRight, FiChevronLeft, FiUser, FiTruck, FiTool, FiUsers, FiX, FiGift } from 'react-icons/fi';
import { useBrand } from '../../../context/BrandContext';
import useReferralEnabled from '../../../hooks/useReferralEnabled';
import { extractReferralCode } from '../../../utils/referralStorage';
import { isFlutterWebView } from '../../../utils/platformUtils';
import { motion, AnimatePresence } from 'framer-motion';

const roles = [
  {
    id: 'farmer',
    label: 'Farmer',
    description: 'Book agricultural equipment & services for your fields',
    icon: FiUser,
    color: '#2E7D32',
    lightBg: '#E8F5E9',
    route: '/user/signup',
  },
  {
    id: 'vendor',
    label: 'Vendor',
    description: 'List your equipment & grow your agri-business',
    icon: FiTruck,
    color: '#1565C0',
    lightBg: '#E3F2FD',
    route: '/vendor/signup',
  },
  {
    id: 'worker',
    label: 'Independent Worker',
    description: 'Find farm jobs near you & earn on your schedule',
    icon: FiTool,
    color: '#E65100',
    lightBg: '#FFF3E0',
    route: '/worker/signup',
  },
];

const AppRegister = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { appLogo, appName } = useBrand();
  const [selected, setSelected] = useState(null);
  const [showWorkerTypeModal, setShowWorkerTypeModal] = useState(false);

  const { enabled: referralOn } = useReferralEnabled();
  const rawRef = searchParams.get('ref') || searchParams.get('referralCode') || '';
  const refCode = extractReferralCode(rawRef);

  const handleBack = () => {
    if (isFlutterWebView()) {
      navigate('/app');
    } else {
      navigate('/');
    }
  };

  const handleProceed = () => {
    if (!selected) return;
    if (selected === 'worker') {
      setShowWorkerTypeModal(true);
      return;
    }
    const role = roles.find(r => r.id === selected);
    if (role) {
      const search = refCode ? `?ref=${encodeURIComponent(refCode)}` : '';
      navigate(role.route + search);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#F8FAF8',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      <Helmet>
        <title>Create Account | {appName || 'AgroYilt'}</title>
        <link rel="canonical" href="https://agroyilt.com/" />
        <meta name="robots" content="noindex, follow" />
      </Helmet>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '16px 20px 12px',
        gap: '12px',
        background: '#fff',
        borderBottom: '1px solid #E8F5E9',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          id="app-register-back-btn"
          onClick={handleBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px', borderRadius: '10px',
            color: '#2E7D32', display: 'flex', alignItems: 'center',
          }}
        >
          <FiChevronLeft size={24} />
        </button>

        <div style={{
          width: '42px', height: '42px', borderRadius: '50%',
          overflow: 'hidden', background: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <img
            src={appLogo || '/AgroyiltLogo.png'}
            alt={appName || 'AgroYilt'}
            style={{ width: '125%', height: '125%', objectFit: 'cover' }}
            onError={e => { e.target.src = '/AgroyiltLogo.png'; }}
          />
        </div>

        <div>
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1B5E20' }}>
            Create Account
          </h1>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#78909C' }}>
            {appName || 'AgroYilt'}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '24px 20px 16px', overflowY: 'auto' }}>
        <p style={{
          margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 800, color: '#1B5E20',
        }}>
          Join AgroYilt as...
        </p>
        <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#78909C' }}>
          Select your role to get started
        </p>

        {refCode && referralOn && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#E8F5E9', border: '1px solid #A5D6A7',
            padding: '10px 14px', borderRadius: '12px',
            marginBottom: '16px', color: '#1B5E20', fontSize: '0.82rem', fontWeight: 600
          }}>
            <FiGift size={18} color="#2E7D32" />
            <span>Referral Invite Active: <strong>{refCode}</strong></span>
          </div>
        )}

        {/* Role Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {roles.map(role => {
            const Icon = role.icon;
            const isSelected = selected === role.id;
            return (
              <button
                key={role.id}
                id={`app-register-role-${role.id}`}
                onClick={() => setSelected(role.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  background: isSelected ? role.lightBg : '#fff',
                  border: isSelected
                    ? `2.5px solid ${role.color}`
                    : '2px solid #ECEFF1',
                  borderRadius: '18px',
                  padding: '18px 16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected
                    ? `0 4px 20px ${role.color}22`
                    : '0 2px 8px rgba(0,0,0,0.05)',
                  transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                  width: '100%',
                }}
              >
                {/* Icon Circle */}
                <div style={{
                  width: '52px', height: '52px', borderRadius: '15px', flexShrink: 0,
                  background: isSelected ? role.color : role.lightBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s',
                }}>
                  <Icon
                    size={26}
                    color={isSelected ? '#fff' : role.color}
                    style={{ transition: 'color 0.2s' }}
                  />
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '1rem', fontWeight: 700,
                    color: isSelected ? role.color : '#263238',
                    marginBottom: '4px',
                  }}>
                    {role.label}
                  </div>
                  <div style={{
                    fontSize: '0.8rem', color: '#78909C',
                    lineHeight: 1.4, whiteSpace: 'normal',
                  }}>
                    {role.description}
                  </div>
                </div>

                {/* Arrow / Checkmark */}
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSelected ? role.color : '#F5F5F5',
                  transition: 'background 0.2s',
                }}>
                  {isSelected ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7L5.5 10L11.5 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <FiChevronRight size={16} color="#B0BEC5" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 20px 40px' }}>
        {/* Proceed Button */}
        <button
          id="app-register-proceed-btn"
          onClick={handleProceed}
          disabled={!selected}
          style={{
            width: '100%', padding: '18px',
            borderRadius: '16px', border: 'none',
            background: selected
              ? 'linear-gradient(135deg, #2E7D32 0%, #43A047 100%)'
              : '#E0E0E0',
            color: selected ? '#fff' : '#9E9E9E',
            fontSize: '1rem', fontWeight: 700,
            cursor: selected ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: selected ? '0 4px 16px rgba(46₹25,50,0.35)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <span>Continue as {selected ? roles.find(r => r.id === selected) ?.label : '...'}</span>
          {selected && <FiChevronRight size={20} />}
        </button>

        {/* Login link */}
        <p style={{
          textAlign: 'center', marginTop: '20px',
          fontSize: '0.875rem', color: '#78909C',
        }}>
          Already have an account?{' '}
          <button
            id="app-register-login-link"
            onClick={() => navigate('/app/login')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#2E7D32', fontWeight: 700, fontSize: '0.875rem',
              padding: 0,
            }}
          >
            Login
          </button>
        </p>
      </div>

      {/* Worker Type Selection Bottom Sheet */}
      <AnimatePresence>
        {showWorkerTypeModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWorkerTypeModal(false)}
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                zIndex: 100,
              }}
            />
            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                background: '#fff',
                borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
                padding: '24px', zIndex: 101,
                boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
                display: 'flex', flexDirection: 'column', gap: '16px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1B5E20' }}>Choose Worker Type</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: '#78909C' }}>How do you want to work on AgroYilt?</p>
                </div>
                <button
                  onClick={() => setShowWorkerTypeModal(false)}
                  style={{
                    background: '#F5F5F5', border: 'none', width: '36px', height: '36px',
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#607D8B'
                  }}
                >
                  <FiX size={20} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={() => navigate('/worker/signup?type=TEAM_LEADER' + (refCode ? `&ref=${encodeURIComponent(refCode)}` : ''))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    background: '#fff', border: '2px solid #E3F2FD', borderRadius: '16px',
                    padding: '16px', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#1976D2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FiUsers size={24} color="#fff" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1565C0', marginBottom: '4px' }}>Team Leader</div>
                    <div style={{ fontSize: '0.8rem', color: '#78909C', lineHeight: 1.4 }}>Create a team, invite workers, and manage large farming contracts.</div>
                  </div>
                  <FiChevronRight size={20} color="#90CAF9" />
                </button>

                <button
                  onClick={() => navigate('/worker/signup?type=WORKER' + (refCode ? `&ref=${encodeURIComponent(refCode)}` : ''))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    background: '#fff', border: '2px solid #FFF3E0', borderRadius: '16px',
                    padding: '16px', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F57C00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FiTool size={24} color="#fff" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#E65100', marginBottom: '4px' }}>Independent Worker</div>
                    <div style={{ fontSize: '0.8rem', color: '#78909C', lineHeight: 1.4 }}>Work independently or join a Team Leader to find more jobs.</div>
                  </div>
                  <FiChevronRight size={20} color="#FFCC80" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AppRegister;
