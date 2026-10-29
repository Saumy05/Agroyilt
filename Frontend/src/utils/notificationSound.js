// Notification Sound Utility
// Plays notification sound and alert rings across User, Vendor, Worker, and Admin panels
import flutterBridge from './flutterBridge';

let audioContext = null;
let prewarmedAudio = null;
let isAudioPrewarmed = false;

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
  initAudio();
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  prewarmAudio();
};

export const prewarmAudio = () => {
  if (typeof window === 'undefined') return;
  initAudio();
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  if (!isAudioPrewarmed) {
    try {
      prewarmedAudio = new Audio('/booking-alert.mp3');
      prewarmedAudio.volume = 0.001;
      const p = prewarmedAudio.play();
      if (p !== undefined) {
        p.then(() => {
          prewarmedAudio.pause();
          prewarmedAudio.currentTime = 0;
          prewarmedAudio.volume = 1.0;
          isAudioPrewarmed = true;
        }).catch(() => {});
      }
    } catch (e) {}
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
let isAlertActive = false;
let synthRingInterval = null;
let vibrationInterval = null;

// Synthesizer Siren Fallback (continuous alarm siren if audio file is blocked)
const startSynthesizedRing = () => {
  if (synthRingInterval) return;
  initAudio();
  if (!audioContext) return;
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }

  const pulse = () => {
    try {
      if (!audioContext || audioContext.state === 'closed' || !isAlertActive) return;
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = 'sawtooth';
      // Dual-tone siren sweep (like European/US emergency tone)
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.35);
      osc.frequency.linearRampToValueAtTime(800, now + 0.7);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
      gain.gain.setValueAtTime(0.4, now + 0.65);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.7);

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start(now);
      osc.stop(now + 0.7);
    } catch (e) {}
  };

  pulse();
  synthRingInterval = setInterval(pulse, 850);
};

const stopSynthesizedRing = () => {
  if (synthRingInterval) {
    clearInterval(synthRingInterval);
    synthRingInterval = null;
  }
};

const startVibration = () => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([800, 400, 800, 400, 800, 400, 800, 400]);
      if (!vibrationInterval) {
        vibrationInterval = setInterval(() => {
          if (!isAlertActive) {
            clearInterval(vibrationInterval);
            vibrationInterval = null;
            return;
          }
          navigator.vibrate([800, 400, 800, 400, 800, 400, 800, 400]);
        }, 4800);
      }
    } catch (e) {}
  }
};

const stopVibration = () => {
  if (vibrationInterval) {
    clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(0);
    } catch (e) {}
  }
};

// Browsers block audio until the user has touched the page. If the ring was blocked,
// start it on the first tap/click/key press, as long as it is still the current ring.
const retryRingOnNextGesture = (audio) => {
  if (typeof document === 'undefined') return;
  const events = ['pointerdown', 'touchstart', 'click', 'keydown'];
  const retry = () => {
    events.forEach((ev) => document.removeEventListener(ev, retry, true));
    if (currentAudio === audio && isAlertActive) {
      audio.play().then(() => {
        stopSynthesizedRing();
      }).catch(() => {});
    }
  };
  events.forEach((ev) => document.addEventListener(ev, retry, true));
};

export const playAlertRing = (loop = false) => {
  try {
    isAlertActive = true;
    startVibration();

    // Signal native Flutter shell if running inside Android APK wrapper
    if (flutterBridge && flutterBridge.isFlutter) {
      flutterBridge.startAlertRing({ loop, sound: 'booking_alert' }).catch(() => {});
    }

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    // Try prewarmed audio first, or fallback to new Audio
    let audio = null;
    if (prewarmedAudio && isAudioPrewarmed) {
      audio = prewarmedAudio;
      audio.currentTime = 0;
    } else {
      audio = new Audio('/booking-alert.mp3');
    }

    audio.volume = 1.0;
    if (loop) audio.loop = true;
    currentAudio = audio;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // Playing successfully via MP3 audio
          stopSynthesizedRing();
        })
        .catch((e) => {
          console.warn('[NotificationSound] Audio play blocked/failed, activating synth siren:', e?.message || e);
          startSynthesizedRing();
          retryRingOnNextGesture(audio);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('audio-play-blocked'));
          }
        });
    }

    audio.onended = () => {
      if (!loop && currentAudio === audio) {
        stopAlertRing();
      }
    };

    return true;
  } catch (error) {
    console.error('Error in playAlertRing:', error);
    startSynthesizedRing();
    return false;
  }
};

export const stopAlertRing = () => {
  isAlertActive = false;
  stopVibration();
  stopSynthesizedRing();

  // Stop native Flutter ringtone if running inside Android APK wrapper
  if (flutterBridge && flutterBridge.isFlutter) {
    flutterBridge.stopAlertRing().catch(() => {});
  }

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

// Register cross-tab & service worker listeners for background alerts
if (typeof window !== 'undefined') {
  // 1. Service Worker PostMessage
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'AGROYILT_INCOMING_ALERT') {
        console.log('[NotificationSound] Background push alert received from SW:', event.data);
        playAlertRing(true);
        window.dispatchEvent(new CustomEvent('workerIncomingBooking', {
          detail: {
            source: 'push',
            data: event.data.data || event.data
          }
        }));
      }
    });
  }

  // 2. BroadcastChannel
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const alertChannel = new BroadcastChannel('agroyilt_booking_alert_channel');
      alertChannel.onmessage = (event) => {
        if (event.data?.type === 'AGROYILT_INCOMING_ALERT') {
          console.log('[NotificationSound] Background push alert received via BroadcastChannel:', event.data);
          playAlertRing(true);
          window.dispatchEvent(new CustomEvent('workerIncomingBooking', {
            detail: {
              source: 'push',
              data: event.data.data || event.data
            }
          }));
        }
      };
    } catch (e) {}
  }

  // 3. Auto-resume audio when returning from background / unlocking phone
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isAlertActive) {
      if (currentAudio && currentAudio.paused) {
        currentAudio.play().then(() => stopSynthesizedRing()).catch(() => startSynthesizedRing());
      }
    }
  });
  window.addEventListener('focus', () => {
    if (isAlertActive && currentAudio && currentAudio.paused) {
      currentAudio.play().then(() => stopSynthesizedRing()).catch(() => startSynthesizedRing());
    }
  });
}

export default {
  playNotificationSound,
  playSingleBeep,
  playAlertRing,
  stopAlertRing,
  prewarmAudio,
  isSoundEnabled
};
