import { toast } from 'react-hot-toast';

const DEDUPE_WINDOW_MS = 4000;
const activeToasts = new Map();

/**
 * Generates a deterministic key for a toast based on message and type if an explicit ID is not provided.
 */
const generateDeterministicKey = (type, message, explicitId) => {
  if (explicitId) return explicitId;
  
  // Clean up message to base alphanumeric characters to catch slight variations
  const normalizedMessage = typeof message === 'string' 
    ? message.toLowerCase().replace(/[^a-z0-9]/g, '') 
    : 'unknown';
    
  return `${type}:${normalizedMessage}`;
};

/**
 * Checks if a toast is a duplicate within the deduplication window.
 * Returns true if it should be blocked, false if it should be shown.
 */
const isDuplicate = (key) => {
  const now = Date.now();
  if (activeToasts.has(key)) {
    const timestamp = activeToasts.get(key);
    if (now - timestamp < DEDUPE_WINDOW_MS) {
      // It is a duplicate within the window, update timestamp so spam extends the block window slightly
      activeToasts.set(key, now);
      return true;
    }
  }
  activeToasts.set(key, now);
  
  // Cleanup old entries to prevent memory leak
  if (activeToasts.size > 50) {
    for (const [k, v] of activeToasts.entries()) {
      if (now - v > DEDUPE_WINDOW_MS) {
        activeToasts.delete(k);
      }
    }
  }
  
  return false;
};

/**
 * Extracts a user-friendly error message from various error object shapes.
 */
const extractErrorMessage = (error) => {
  if (!error) return 'An unknown error occurred. Please try again.';
  
  if (typeof error === 'string') return error;

  // Axios Error Shape
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  
  // Raw JS Error Object
  if (error.message) {
    // Avoid showing raw backend traces like MongoServerError
    if (error.message.includes('MongoServerError') || error.message.includes('Cast to ObjectId')) {
      return 'An internal database error occurred. Please try again later.';
    }
    if (error.message.includes('Network Error')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }
    return error.message;
  }

  return 'Something went wrong. Please try again.';
};

export const toastManager = {
  success: (message, options = {}) => {
    const key = generateDeterministicKey('success', message, options.id);
    if (isDuplicate(key)) return;
    toast.dismiss();
    return toast.success(message, { id: key, duration: 2500, ...options });
  },
  
  error: (errorOrMessage, options = {}) => {
    const message = extractErrorMessage(errorOrMessage);
    const key = generateDeterministicKey('error', message, options.id);
    if (isDuplicate(key)) return;
    toast.dismiss();
    return toast.error(message, { id: key, duration: 3000, ...options });
  },
  
  info: (message, options = {}) => {
    const key = generateDeterministicKey('info', message, options.id);
    if (isDuplicate(key)) return;
    toast.dismiss();
    return toast(message, { 
      id: key, 
      duration: 3000, 
      icon: 'ℹ️',
      ...options 
    });
  },
  
  warning: (message, options = {}) => {
    const key = generateDeterministicKey('warning', message, options.id);
    if (isDuplicate(key)) return;
    toast.dismiss();
    return toast(message, { 
      id: key, 
      duration: 3000,
      icon: '⚠️',
      style: {
        background: '#fff3cd',
        color: '#856404',
        border: '1px solid #ffeeba'
      },
      ...options 
    });
  },
  
  loading: (message, options = {}) => {
    toast.dismiss();
    return toast.loading(message, options);
  },

  // Helper to clear all toasts
  dismiss: (toastId) => toast.dismiss(toastId),
  dismissAll: () => toast.dismiss()
};
