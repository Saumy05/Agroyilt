// Notification Sound Utility
// Plays notification sound and alert rings across User, Vendor, Worker, and Admin panels

let audioContext = null;

// Initialize Web Audio API context
const initAudio = () => {
  if (!audioContext && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
    }
  }
};

// Global unlock on first user interaction (browser autoplay policy requirement)
const unlockAudioContext = () => {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  // Remove one-time listeners
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', unlockAudioContext);
    document.removeEventListener('touchstart', unlockAudioContext);
    document.removeEventListener('keydown', unlockAudioContext);
    document.removeEventListener('pointerdown', unlockAudioContext);
  }
};

if (typeof document !== 'undefined') {
  document.addEventListener('click', unlockAudioContext, { passive: true });
  document.addEventListener('touchstart', unlockAudioContext, { passive: true });
  document.addEventListener('keydown', unlockAudioContext, { passive: true });
  document.addEventListener('pointerdown', unlockAudioContext, { passive: true });
}

// Play notification sound (Plays clear MP3 audio with synthesized fallback)
export const playNotificationSound = async () => {
  try {
    // 1. First priority: Play real audio file (MP3)
    const audio = new Audio('/notification.mp3');
    audio.volume = 1.0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        // If autoplay blocked or file failed, fallback to Web Audio synthesizer
        console.warn('[NotificationSound] Audio file play restricted, falling back to synthesizer:', err?.message || err);
        playSynthesizedChime();
      });
      return true;
    }
  } catch (error) {
    console.warn('[NotificationSound] Audio constructor error, fallback:', error);
    playSynthesizedChime();
  }
};

// Synthesized Chime Fallback using Web Audio API
const playSynthesizedChime = () => {
  try {
    initAudio();
    if (!audioContext) return;

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    const now = audioContext.currentTime;

    // Rich C-Major Bell Chord (C5, E5, G5, C6)
    const tones = [
      { freq: 523.25, time: 0, dur: 0.6, vol: 0.35 },    // C5
      { freq: 659.25, time: 0.08, dur: 0.6, vol: 0.35 }, // E5
      { freq: 783.99, time: 0.16, dur: 0.7, vol: 0.35 }, // G5
      { freq: 1046.50, time: 0.24, dur: 0.9, vol: 0.40 } // C6
    ];

    tones.forEach(({ freq, time, dur, vol }) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0, now + time);
      gain.gain.linearRampToValueAtTime(vol, now + time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start(now + time);
      osc.stop(now + time + dur);
    });
  } catch (e) {
    console.error('[NotificationSound] Synthesizer error:', e);
  }
};

// Play single short beep for small interactions
export const playSingleBeep = () => {
  try {
    initAudio();
    if (!audioContext) return;

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioContext.currentTime);

    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start();
    osc.stop(audioContext.currentTime + 0.15);
    return true;
  } catch (error) {
    console.error('Error playing beep:', error);
    return false;
  }
};

// Play distinct two-tone alert chime for cancellations (descending tones)
export const playCancellationAlert = () => {
  try {
    initAudio();
    if (!audioContext) {
      playNotificationSound();
      return;
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(440.00, now + 0.18); // A4
    osc.frequency.setValueAtTime(349.23, now + 0.36); // F4

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.04);
    gain.gain.setValueAtTime(0.35, now + 0.36);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(now);
    osc.stop(now + 0.7);
  } catch (e) {
    playNotificationSound();
  }
};

// Play urgent ring for booking alerts / incoming calls
let currentAudio = null;

// Browsers block audio until the user has touched the page. If the ring was blocked,
// start it on the first tap/click/key press, as long as it is still the current ring.
const retryRingOnNextGesture = (audio) => {
  if (typeof document === 'undefined') return;
  const events = ['pointerdown', 'touchstart', 'click', 'keydown'];
  const retry = () => {
    events.forEach((ev) => document.removeEventListener(ev, retry, true));
    if (currentAudio === audio) {
      audio.play().catch(() => {});
    }
  };
  events.forEach((ev) => document.addEventListener(ev, retry, true));
};

export const playAlertRing = (loop = false) => {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    const audio = new Audio('/booking-alert.mp3');
    audio.volume = 1.0;
    if (loop) audio.loop = true;
    currentAudio = audio;

    audio.play().catch((e) => {
      if (e.name === 'NotAllowedError') {
        console.warn('[NotificationSound] Audio blocked: User interaction required on this tab first.');
        retryRingOnNextGesture(audio);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('audio-play-blocked'));
        }
      } else if (e.name !== 'AbortError') {
        console.error('Error playing alert ring:', e);
      }
    });

    audio.onended = () => {
      if (currentAudio === audio) {
        currentAudio = null;
      }
    };

    return true;
  } catch (error) {
    console.error('Error in playAlertRing:', error);
    return false;
  }
};

export const stopAlertRing = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
};

// Check if sound is enabled in settings (checks localStorage & sessionStorage)
export const isSoundEnabled = (userType = 'admin') => {
  let storageKey = 'adminData';
  if (userType === 'user') storageKey = 'userData';
  else if (userType === 'worker') storageKey = 'workerData';
  else if (userType === 'vendor') storageKey = 'vendorData';

  const dataString = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey);
  if (dataString) {
    try {
      const data = JSON.parse(dataString);
      return data.settings?.soundAlerts !== false; // Default is true
    } catch {
      return true;
    }
  }
  return true;
};

export default {
  playNotificationSound,
  playSingleBeep,
  playAlertRing,
  stopAlertRing,
  isSoundEnabled
};
