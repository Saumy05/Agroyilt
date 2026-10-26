import React, { useEffect, useState } from 'react';
import referralService from '../../../services/referralService';
import TranslatedText from '../../../components/TranslatedText';

const DEFAULT_PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.agroyilt.app';

/**
 * "Get the app on Google Play" for the website. The address is the one the admin set (the same one the referral invite uses).
 * Hidden on an iPhone / iPad, where the Play Store does not apply.
 */
const PlayStoreButton = ({ className = '' }) => {
  const [url, setUrl] = useState(DEFAULT_PLAY_STORE);

  useEffect(() => {
    let alive = true;
    referralService.getInviteConfig()
      .then((res) => { if (alive && res?.data?.playStoreUrl) setUrl(res.data.playStoreUrl); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (/iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-bold text-center shadow-xl transition-colors ${className}`}
    >
      <span aria-hidden="true">▶</span>
      <TranslatedText>Get the app on Google Play</TranslatedText>
    </a>
  );
};

export default PlayStoreButton;
