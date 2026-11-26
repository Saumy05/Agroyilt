import React, { useCallback, useEffect, useState } from 'react';
import { FiWifiOff, FiRefreshCw } from 'react-icons/fi';
import { useLanguage } from '../../context/LanguageContext';
import { translateBatch } from '../../services/translationService';

const OFFLINE_EN = {
  title: 'No internet connection',
  desc: 'Please check your mobile data or Wi-Fi and try again.',
  checking: 'Checking...',
  retry: 'Try again'
};

const OFFLINE_PRESETS = {
  hi: {
    title: 'इंटरनेट कनेक्शन नहीं है',
    desc: 'कृपया अपना मोबाइल डेटा या वाई-फ़ाई जांचें और पुनः प्रयास करें।',
    checking: 'जांच हो रही है...',
    retry: 'पुनः प्रयास करें'
  },
  mr: {
    title: 'इंटरनेट कनेक्शन नाही',
    desc: 'कृपया तुमचा मोबाइल डेटा किंवा वाय-फाय तपासा आणि पुन्हा प्रयत्न करा.',
    checking: 'तपासत आहे...',
    retry: 'पुन्हा प्रयत्न करा'
  },
  gu: {
    title: 'ઇન્ટરનેટ કનેક્શન નથી',
    desc: 'કૃપા કરીને તમારો મોબાઇલ ડેટા અથવા Wi-Fi તપાસો અને ફરી પ્રયાસ કરો.',
    checking: 'તપાસી રહ્યું છે...',
    retry: 'ફરી પ્રયાસ કરો'
  },
  pa: {
    title: 'ਇੰਟਰਨੈੱਟ ਕਨੈਕਸ਼ਨ ਨਹੀਂ ਹੈ',
    desc: 'ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਮੋਬਾਈਲ ਡਾਟਾ ਜਾਂ Wi-Fi ਜਾਂਚੋ ਅਤੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
    checking: 'ਜਾਂਚ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ...',
    retry: 'ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ'
  },
  bn: {
    title: 'ইন্টারনেট সংযোগ নেই',
    desc: 'অনুগ্রহ করে আপনার মোবাইল ডেটা বা Wi-Fi পরীক্ষা করে আবার চেষ্টা করুন।',
    checking: 'পরীক্ষা করা হচ্ছে...',
    retry: 'আবার চেষ্টা করুন'
  },
  ta: {
    title: 'இணைய இணைப்பு இல்லை',
    desc: 'உங்கள் மொபைல் டேட்டா அல்லது Wi-Fi ஐ சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
    checking: 'சரிபார்க்கிறது...',
    retry: 'மீண்டும் முயற்சிக்கவும்'
  },
  te: {
    title: 'ఇంటర్నెట్ కనెక్షన్ లేదు',
    desc: 'దయచేసి మీ మొబైల్ డేటా లేదా Wi-Fi ని తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.',
    checking: 'తనిఖీ చేస్తోంది...',
    retry: 'మళ్లీ ప్రయత్నించండి'
  },
  kn: {
    title: 'ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕವಿಲ್ಲ',
    desc: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಮೊಬೈಲ್ ಡೇಟಾ ಅಥವಾ Wi-Fi ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    checking: 'ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...',
    retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ'
  },
  ml: {
    title: 'ഇന്റർനെറ്റ് കണക്ഷൻ ഇല്ല',
    desc: 'ദയവായി നിങ്ങളുടെ മൊബൈൽ ഡാറ്റയോ Wi-Fi യോ പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കുക.',
    checking: 'പരിശോധിക്കുന്നു...',
    retry: 'വീണ്ടും ശ്രമിക്കുക'
  }
};

const getCachedOfflineStrings = (code) => {
  if (!code || code === 'en') return OFFLINE_EN;
  try {
    const raw = localStorage.getItem(`agroyilt_offline_i18n_${code}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return OFFLINE_PRESETS[code] || OFFLINE_EN;
};

/**
 * Full-screen "No internet connection" page, shown over the whole app while the device is offline.
 * It covers an app that is already open or opened from cache; a page that cannot be loaded at all is the
 * native WebView's error page, which only the app shell can replace.
 */
const NoInternetScreen = () => {
  const { currentCode } = useLanguage();
  const [strings, setStrings] = useState(() => getCachedOfflineStrings(currentCode));
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const [checking, setChecking] = useState(false);

  // Pre-cache offline strings for any selected language while online
  useEffect(() => {
    setStrings(getCachedOfflineStrings(currentCode));
    if (!currentCode || currentCode === 'en') return;
    if (OFFLINE_PRESETS[currentCode]) {
      try { localStorage.setItem(`agroyilt_offline_i18n_${currentCode}`, JSON.stringify(OFFLINE_PRESETS[currentCode])); } catch {}
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    translateBatch([OFFLINE_EN.title, OFFLINE_EN.desc, OFFLINE_EN.checking, OFFLINE_EN.retry], currentCode)
      .then(([title, desc, chk, retry]) => {
        const translated = {
          title: title || OFFLINE_EN.title,
          desc: desc || OFFLINE_EN.desc,
          checking: chk || OFFLINE_EN.checking,
          retry: retry || OFFLINE_EN.retry
        };
        if (translated.title === OFFLINE_EN.title) return; // not translated: try again next time
        setStrings(translated);
        try { localStorage.setItem(`agroyilt_offline_i18n_${currentCode}`, JSON.stringify(translated)); } catch {}
      })
      .catch(() => {});
  }, [currentCode]);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // navigator.onLine can lag, so Retry makes a real request before hiding the screen
  const retry = useCallback(async () => {
    setChecking(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      await fetch(`${window.location.origin}/robots.txt?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setChecking(false);
    }
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px', textAlign: 'center',
        background: 'linear-gradient(160deg, #1B5E20 0%, #2E7D32 35%, #388E3C 65%, #43A047 100%)',
        color: '#fff', fontFamily: "'Inter', 'Segoe UI', sans-serif"
      }}
    >
      <div style={{
        width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24
      }}>
        <FiWifiOff size={44} />
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>
        {strings.title}
      </h1>
      <p style={{ margin: '0 0 28px', fontSize: '0.92rem', opacity: 0.9, maxWidth: 300, lineHeight: 1.5 }}>
        {strings.desc}
      </p>
      <button
        type="button"
        onClick={retry}
        disabled={checking}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '14px 32px',
          borderRadius: 14, border: 'none', background: '#fff', color: '#1B5E20',
          fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', opacity: checking ? 0.7 : 1
        }}
      >
        <FiRefreshCw size={18} style={checking ? { animation: 'agro-spin 0.8s linear infinite' } : undefined} />
        {checking ? strings.checking : strings.retry}
      </button>
      <style>{'@keyframes agro-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
};

export default NoInternetScreen;
