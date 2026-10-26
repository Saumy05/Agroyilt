import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import referralService from '../../../services/referralService';
import flutterBridge from '../../../utils/flutterBridge';

const DEFAULT_PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.agroyilt.app';
const DEFAULT_REGISTER = 'https://agroyilt.com/app/register';

const withParam = (url, query) => `${url}${url.includes('?') ? '&' : '?'}${query}`;

/**
 * The page a shared referral link (/r/<CODE>) opens.
 * - Android phone in a browser: the Play Store, with the code attached as the install referrer, so the app can pick it up after install.
 * - Everyone else (iPhone, computer, inside the app): the web registration page with the code filled in.
 * Both ways stay on the page as buttons, in case the automatic jump does not happen.
 */
const ReferralInvite = () => {
  const { code } = useParams();
  const cleanCode = useMemo(() => String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32), [code]);
  const [links, setLinks] = useState(null);

  const isAndroidBrowser = /Android/i.test(navigator.userAgent) && !flutterBridge.isFlutter;

  useEffect(() => {
    let alive = true;
    referralService.getInviteConfig()
      .then((res) => alive && setLinks({
        playStoreUrl: res?.data?.playStoreUrl || DEFAULT_PLAY_STORE,
        registrationUrl: res?.data?.registrationUrl || DEFAULT_REGISTER
      }))
      .catch(() => alive && setLinks({ playStoreUrl: DEFAULT_PLAY_STORE, registrationUrl: DEFAULT_REGISTER }));
    return () => { alive = false; };
  }, []);

  const webUrl = links ? (cleanCode ? withParam(links.registrationUrl, `ref=${encodeURIComponent(cleanCode)}`) : links.registrationUrl) : '';
  const playUrl = links ? (cleanCode ? withParam(links.playStoreUrl, `referrer=${encodeURIComponent(`ref=${cleanCode}`)}`) : links.playStoreUrl) : '';

  // Keep the code on the clipboard too: a person who installs from the store can paste it if the app does not fill it in
  const copyCode = () => {
    try { navigator.clipboard?.writeText(cleanCode).catch(() => {}); } catch { /* not allowed without a tap */ }
  };

  useEffect(() => {
    if (!links) return undefined;
    if (!isAndroidBrowser) {
      window.location.replace(webUrl);
      return undefined;
    }
    copyCode();
    const timer = setTimeout(() => window.location.replace(playUrl), 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: 'linear-gradient(160deg, #1B5E20 0%, #43A047 100%)' }}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-6 space-y-4">
        <h1 className="text-xl font-black text-gray-900">You are invited to AgroYilt</h1>
        {cleanCode && (
          <p className="text-sm text-gray-600">
            Referral code <span className="font-mono font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg">{cleanCode}</span>
          </p>
        )}
        <p className="text-xs text-gray-500">{isAndroidBrowser ? 'Opening the Play Store…' : 'Opening registration…'}</p>

        {links && (
          <div className="space-y-2 pt-1">
            {isAndroidBrowser && (
              <a href={playUrl} onClick={copyCode} className="block w-full py-3 rounded-xl bg-emerald-700 text-white font-bold text-sm">
                Get the app on Google Play
              </a>
            )}
            <a href={webUrl} className={`block w-full py-3 rounded-xl font-bold text-sm ${isAndroidBrowser ? 'bg-gray-100 text-gray-800' : 'bg-emerald-700 text-white'}`}>
              Register on the web
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReferralInvite;
