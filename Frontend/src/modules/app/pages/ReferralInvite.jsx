import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaGooglePlay, FaCheck, FaCopy } from 'react-icons/fa';
import { FiGift, FiGlobe, FiSmartphone, FiArrowRight } from 'react-icons/fi';
import referralService from '../../../services/referralService';
import flutterBridge from '../../../utils/flutterBridge';
import { useBrand } from '../../../context/BrandContext';
import { extractReferralCode } from '../../../utils/referralStorage';

const DEFAULT_PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.agroyilt.app';
const DEFAULT_REGISTER = 'https://agroyilt.com/app/register';

const withParam = (url, query) => `${url}${url.includes('?') ? '&' : '?'}${query}`;

const getAppId = (playUrl) => {
  try {
    const id = new URL(playUrl).searchParams.get('id');
    return id || 'com.agroyilt.app';
  } catch {
    return 'com.agroyilt.app';
  }
};

const buildMarketUrl = (playUrl, code) => {
  const appId = getAppId(playUrl);
  const referrer = code ? `&referrer=${encodeURIComponent(`ref=${code}`)}` : '';
  return `market://details?id=${encodeURIComponent(appId)}${referrer}`;
};

const buildHttpsPlayStoreUrl = (playUrl, code) => {
  const base = playUrl || DEFAULT_PLAY_STORE;
  if (!code) return base;
  return withParam(base, `referrer=${encodeURIComponent(`ref=${code}`)}`);
};

/**
 * Senior-grade Referral Landing & Deep Linking Page (/r/:code)
 * 
 * - Android Phones: Auto-copies code, attempts Google Play Store launch, 
 *   and provides a high-contrast 1-tap "Get it on Google Play" button if Chrome blocks intent navigation.
 * - Desktop / PC / Mac: Keeps the user in control! Shows the invite, allows 1-click code copy,
 *   provides a link to view on Google Play Store, and offers "Register in Web Browser".
 */
const ReferralInvite = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { appLogo, appName } = useBrand();

  const cleanCode = useMemo(() => extractReferralCode(code), [code]);
  const [links, setLinks] = useState(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(2);

  const isAndroidBrowser = useMemo(() => {
    return /Android/i.test(navigator.userAgent) && !flutterBridge.isFlutter;
  }, []);

  // Fetch configured Play Store and registration URLs
  useEffect(() => {
    let alive = true;
    referralService.getInviteConfig()
      .then((res) => {
        if (!alive) return;
        setLinks({
          playStoreUrl: res?.data?.playStoreUrl || DEFAULT_PLAY_STORE,
          registrationUrl: res?.data?.registrationUrl || DEFAULT_REGISTER
        });
      })
      .catch(() => {
        if (!alive) return;
        setLinks({ playStoreUrl: DEFAULT_PLAY_STORE, registrationUrl: DEFAULT_REGISTER });
      });
    return () => { alive = false; };
  }, []);

  const playStoreUrl = links?.playStoreUrl || DEFAULT_PLAY_STORE;
  const registrationUrl = links?.registrationUrl || DEFAULT_REGISTER;

  const httpsPlayUrl = useMemo(() => buildHttpsPlayStoreUrl(playStoreUrl, cleanCode), [playStoreUrl, cleanCode]);
  const marketUrl = useMemo(() => buildMarketUrl(playStoreUrl, cleanCode), [playStoreUrl, cleanCode]);
  const webUrl = useMemo(() => {
    return cleanCode ? withParam(registrationUrl, `ref=${encodeURIComponent(cleanCode)}`) : registrationUrl;
  }, [registrationUrl, cleanCode]);

  const copyCode = () => {
    if (!cleanCode) return;
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(cleanCode)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          })
          .catch(() => {});
      }
    } catch {
      /* clipboard blocked */
    }
  };

  // On Android devices, attempt auto-redirect after countdown while copying code
  useEffect(() => {
    if (!links || !isAndroidBrowser) return undefined;

    copyCode();

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Try market URI first (native Play Store handler), falling back to https Play Store
          try {
            window.location.href = marketUrl;
            setTimeout(() => {
              window.location.href = httpsPlayUrl;
            }, 1200);
          } catch {
            window.location.href = httpsPlayUrl;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [links, isAndroidBrowser, marketUrl, httpsPlayUrl]);

  const handleOpenPlayStore = (e) => {
    copyCode();
    if (isAndroidBrowser) {
      e.preventDefault();
      try {
        window.location.href = marketUrl;
        setTimeout(() => {
          window.location.href = httpsPlayUrl;
        }, 1200);
      } catch {
        window.location.href = httpsPlayUrl;
      }
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'linear-gradient(145deg, #0D3813 0%, #1B5E20 45%, #2E7D32 100%)',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#FFFFFF',
          borderRadius: '28px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)',
            padding: '28px 24px 20px',
            textAlign: 'center',
            borderBottom: '1px solid #C8E6C9',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '18px',
              background: '#FFFFFF',
              boxShadow: '0 8px 20px rgba(46, 125, 50, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginBottom: '14px',
            }}
          >
            <img
              src={appLogo || '/AgroyiltLogo.png'}
              alt={appName || 'AgroYilt'}
              style={{ width: '110%', height: '110%', objectFit: 'contain' }}
              onError={(e) => { e.target.src = '/AgroyiltLogo.png'; }}
            />
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#1B5E20',
              color: '#FFFFFF',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: '20px',
              marginBottom: '8px',
            }}
          >
            <FiGift size={12} />
            <span>Exclusive Invite</span>
          </div>

          <h1
            style={{
              margin: '0 0 6px',
              fontSize: '1.4rem',
              fontWeight: 800,
              color: '#1B5E20',
              letterSpacing: '-0.02em',
            }}
          >
            Join {appName || 'AgroYilt'}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '0.85rem',
              color: '#455A64',
              lineHeight: 1.4,
            }}
          >
            India's Smart Agri Services & Equipment Platform
          </p>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px 22px 28px' }}>
          {cleanCode && (
            <div
              style={{
                background: '#F1F8E9',
                border: '1.5px dashed #81C784',
                borderRadius: '18px',
                padding: '16px',
                textAlign: 'center',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#2E7D32',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '6px',
                }}
              >
                Your Referral Code
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '1.45rem',
                    fontWeight: 800,
                    color: '#1B5E20',
                    letterSpacing: '0.08em',
                  }}
                >
                  {cleanCode}
                </span>
                <button
                  onClick={copyCode}
                  type="button"
                  title="Copy Referral Code"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: copied ? '#2E7D32' : '#FFFFFF',
                    color: copied ? '#FFFFFF' : '#2E7D32',
                    border: '1px solid #A5D6A7',
                    padding: '6px 12px',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {copied ? <FaCheck size={11} /> : <FaCopy size={11} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <div
                style={{
                  fontSize: '0.72rem',
                  color: '#558B2F',
                  marginTop: '8px',
                  fontWeight: 500,
                }}
              >
                🎁 Bonus applied automatically on signup
              </div>
            </div>
          )}

          {/* Android Auto-Redirect Notice */}
          {isAndroidBrowser && (
            <div
              style={{
                textAlign: 'center',
                marginBottom: '16px',
                fontSize: '0.8rem',
                color: '#616161',
              }}
            >
              {countdown > 0 ? (
                <span>Taking you to Google Play Store in <strong>{countdown}s</strong>…</span>
              ) : (
                <span>If Google Play didn't open automatically, tap below:</span>
              )}
            </div>
          )}

          {/* Action CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Primary Google Play Store Button */}
            <a
              href={isAndroidBrowser ? marketUrl : httpsPlayUrl}
              onClick={handleOpenPlayStore}
              target={isAndroidBrowser ? '_self' : '_blank'}
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '15px 20px',
                borderRadius: '16px',
                background: '#1B5E20',
                color: '#FFFFFF',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.98rem',
                boxShadow: '0 6px 18px rgba(27, 94, 32, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              <FaGooglePlay size={20} color="#43A047" />
              <span>{isAndroidBrowser ? 'Open in Google Play Store' : 'View on Google Play Store'}</span>
            </a>

            {/* Web Registration Secondary Button */}
            <a
              href={webUrl}
              onClick={() => {
                copyCode();
                if (webUrl.startsWith('/')) {
                  navigate(webUrl);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '13px 20px',
                borderRadius: '16px',
                background: isAndroidBrowser ? '#F5F5F5' : '#E8F5E9',
                color: isAndroidBrowser ? '#424242' : '#1B5E20',
                border: isAndroidBrowser ? '1px solid #E0E0E0' : '1.5px solid #A5D6A7',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.88rem',
                transition: 'all 0.2s ease',
              }}
            >
              <FiGlobe size={16} />
              <span>Continue in Web Browser</span>
              <FiArrowRight size={14} />
            </a>
          </div>

          {/* Helpful Device Context Note */}
          <div
            style={{
              marginTop: '20px',
              padding: '12px',
              borderRadius: '12px',
              background: '#FAFAFA',
              border: '1px solid #EEEEEE',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '0.74rem',
              color: '#757575',
              lineHeight: 1.45,
            }}
          >
            <FiSmartphone size={16} color="#2E7D32" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              {isAndroidBrowser ? (
                <span>
                  The referral code will be automatically detected when you install and launch the app.
                </span>
              ) : (
                <span>
                  <strong>On a computer?</strong> You can register directly above in your browser, or open this link on an Android phone to install the AgroYilt app.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferralInvite;
