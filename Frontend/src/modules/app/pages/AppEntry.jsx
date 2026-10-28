import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FiArrowRight, FiPlay } from 'react-icons/fi';
import { useBrand } from '../../../context/BrandContext';
import authStorage from '../../../utils/authStorage';
import { findVerifiedRole } from '../../../utils/verifySession';
import { isFlutterWebView } from '../../../utils/platformUtils';
import SupportContact from '../../../components/common/SupportContact';

const AppEntry = () => {
  const navigate = useNavigate();
  const { appLogo, appName } = useBrand();

  // A stored, unexpired token is only a hint: confirm with the server before skipping login
  const hasStoredSession = useMemo(
    () => ['user', 'vendor', 'worker'].some((role) => authStorage.isAuthenticated(role)),
    []
  );
  const [checking, setChecking] = useState(hasStoredSession);
  const [authenticatedRole, setAuthenticatedRole] = useState(null);

  // In any regular browser (phone or desktop), /app should immediately redirect to the landing page
  useEffect(() => {
    if (!isFlutterWebView()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // index.html paints the page green for the mobile entry screen; drop it once this screen is gone
  // ...and hand the status bar back to the white app screens
  useEffect(() => () => {
    document.documentElement.classList.remove('app-splash');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff');
  }, []);

  useEffect(() => {
    if (!hasStoredSession) return undefined;
    let cancelled = false;
    findVerifiedRole().then((role) => {
      if (cancelled) return;
      if (role) {
        setAuthenticatedRole(role);
        navigate(`/${role}`, { replace: true });
      } else {
        setChecking(false);
      }
    });
    return () => { cancelled = true; };
  }, [hasStoredSession, navigate]);

  if (checking || authenticatedRole) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #1B5E20 0%, #2E7D32 35%, #388E3C 65%, #43A047 100%)',
        }}
      >
        <div style={{
          width: '32px', height: '32px',
          border: '3px solid rgba(255,255,255,0.3)',
          borderTopColor: '#fff',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(160deg, #1B5E20 0%, #2E7D32 35%, #388E3C 65%, #43A047 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Helmet>
        <title>{appName || 'AgroYilt'} | Modern Farming Solutions</title>
        <link rel="canonical" href="https://agroyilt.com/" />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      {/* Background decorative circles */}
      <div style={{
        position: 'absolute', top: '-80px', right: '-80px',
        width: '260px', height: '260px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '60px', right: '-40px',
        width: '160px', height: '160px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-60px', left: '-60px',
        width: '200px', height: '200px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.05)', pointerEvents: 'none',
      }} />

      {/* Hero / Branding Section */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px 16px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{
          width: '92px', height: '92px', borderRadius: '26px',
          overflow: 'hidden', marginBottom: '20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src={appLogo || '/AgroyiltLogo.png'}
            alt={appName || 'AgroYilt'}
            style={{ width: '115%', height: '115%', objectFit: 'cover' }}
            onError={(e) => { e.target.src = '/AgroyiltLogo.png'; }}
          />
        </div>

        {/* App Name */}
        <h1 style={{
          color: '#fff',
          fontSize: '2.2rem',
          fontWeight: 800,
          letterSpacing: '-0.5px',
          marginBottom: '10px',
          fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
        }}>
          {appName || 'AgroYilt'}
        </h1>

        {/* Tagline */}
        <p style={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: '0.98rem',
          fontWeight: 400,
          lineHeight: 1.55,
          maxWidth: '280px',
          fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
        }}>
          Smart farming services — book equipment, grow your business, find work near you.
        </p>

        {/* Decorative dots */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px', marginBottom: '14px' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: i === 1 ? '24px' : '8px', height: '8px',
              borderRadius: '999px',
              background: i === 1 ? '#A5D6A7' : 'rgba(255,255,255,0.35)',
              transition: 'width 0.3s',
            }} />
          ))}
        </div>

        {/* Top Quick Guide Pill -> Direct Full-Screen Route */}
        <button
          type="button"
          onClick={() => navigate('/app/guide')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '999px',
            padding: '8px 18px',
            cursor: 'pointer',
            color: '#fff',
            fontSize: '0.85rem',
            fontWeight: 700,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
          onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.96)'; }}
          onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#A5D6A7',
            color: '#1B5E20',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <FiPlay size={10} style={{ marginLeft: '1px' }} />
          </span>
          <span>Watch App Guide / वीडियो देखें</span>
        </button>
      </div>

      {/* CTA Buttons Section */}
      <div style={{
        padding: '16px 24px 36px',
        display: 'flex', flexDirection: 'column', gap: '12px',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Watch Video Guide Highlight Button -> Navigates to Full-Screen Route */}
        <button
          id="app-entry-watch-guide-btn"
          type="button"
          onClick={() => navigate('/app/guide')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            background: 'rgba(255,255,255,0.18)',
            color: '#ffffff',
            border: '1.5px solid rgba(255,255,255,0.5)',
            borderRadius: '16px',
            padding: '16px 20px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
            transition: 'transform 0.15s, background 0.15s',
            width: '100%',
          }}
          onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
          onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span style={{
            width: '26px', height: '26px', borderRadius: '50%',
            background: '#ffffff', color: '#1B5E20',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}>
            <FiPlay size={13} style={{ marginLeft: '2px' }} />
          </span>
          <span>How It Works / ऐप सीखें (2 Min)</span>
        </button>

        {/* Register Button */}
        <button
          id="app-entry-register-btn"
          type="button"
          onClick={() => navigate('/app/register')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            background: '#fff',
            color: '#2E7D32',
            border: 'none',
            borderRadius: '16px',
            padding: '16px 24px',
            fontSize: '1.05rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
            transition: 'transform 0.15s, box-shadow 0.15s',
            width: '100%',
          }}
          onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
          onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span>Create Account</span>
          <FiArrowRight size={20} />
        </button>

        {/* Login Button */}
        <button
          id="app-entry-login-btn"
          type="button"
          onClick={() => navigate('/app/login')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            border: '1.5px solid rgba(255,255,255,0.4)',
            borderRadius: '16px',
            padding: '16px 24px',
            fontSize: '1.05rem',
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
            transition: 'transform 0.15s',
            width: '100%',
          }}
          onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
          onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span>Login to my account</span>
        </button>

        {/* Footer note */}
        <p style={{
          textAlign: 'center',
          color: 'rgba(255,255,255,0.6)',
          fontSize: '0.75rem',
          marginTop: '6px',
          fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
        }}>
          By continuing, you agree to our{' '}
          <span
            role="link"
            tabIndex={0}
            onClick={() => navigate('/terms/farmer')}
            onKeyDown={e => { if (e.key === 'Enter') navigate('/terms/farmer'); }}
            style={{ textDecoration: 'underline', textUnderlineOffset: '2px', color: 'rgba(255,255,255,0.9)', cursor: 'pointer', padding: '6px 0' }}
          >
            Terms
          </span>
          {' '}&{' '}
          <span
            role="link"
            tabIndex={0}
            onClick={() => navigate('/privacy/farmer')}
            onKeyDown={e => { if (e.key === 'Enter') navigate('/privacy/farmer'); }}
            style={{ textDecoration: 'underline', textUnderlineOffset: '2px', color: 'rgba(255,255,255,0.9)', cursor: 'pointer', padding: '6px 0' }}
          >
            Privacy Policy
          </span>
        </p>

        <SupportContact variant="dark" />
      </div>
    </div>
  );
};

export default AppEntry;
