const savedKey = (role) => `signup_referral_${role || 'default'}`;

/** Referral code typed on a signup form, kept for the session so it survives a visit to Terms / Privacy */
export const readSavedReferral = (role) => {
  try { return sessionStorage.getItem(savedKey(role)) || ''; } catch (e) { return ''; }
};

export const saveReferral = (role, code) => {
  try {
    if (code && code.trim()) sessionStorage.setItem(savedKey(role), code.trim());
    else sessionStorage.removeItem(savedKey(role));
  } catch (e) { /* storage unavailable */ }
};

/** Call after a successful signup so the next one starts with an empty referral field */
export const clearSavedReferral = (role) => saveReferral(role, '');
