const savedKey = (role) => `signup_referral_${role || 'default'}`;

/**
 * Safely extracts and normalizes a referral code from text, URL path, or query params.
 * Handles cases where sharing or copying merged adjacent text (e.g. "AGROU8Y52JOINAGROYILT-INDIASSMAR" -> "AGROU8Y52").
 */
export const extractReferralCode = (raw) => {
  if (!raw) return '';
  const text = String(raw).trim();

  // 1. Direct standard AgroYilt format: AGRO + 5 alphanumeric characters (e.g. AGROU8Y52)
  const standardMatch = text.match(/\b(AGRO[A-Z0-9]{5})\b/i) || text.match(/^(AGRO[A-Z0-9]{5})/i);
  if (standardMatch) {
    return standardMatch[1].toUpperCase();
  }

  // 2. Loose match for AGRO codes: AGRO + 4-10 characters before boundary
  const looseMatch = text.match(/^(AGRO[A-Z0-9]{4,10})/i);
  if (looseMatch) {
    return looseMatch[1].toUpperCase();
  }

  // 3. Fallback: clean first token up to 16 characters
  const token = text.split(/[\s/?#&]/)[0];
  return token.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
};

/** Referral code typed on a signup form, kept for the session so it survives a visit to Terms / Privacy */
export const readSavedReferral = (role) => {
  try { return sessionStorage.getItem(savedKey(role)) || ''; } catch (e) { return ''; }
};

export const saveReferral = (role, code) => {
  try {
    const clean = extractReferralCode(code);
    if (clean) sessionStorage.setItem(savedKey(role), clean);
    else sessionStorage.removeItem(savedKey(role));
  } catch (e) { /* storage unavailable */ }
};

/** Call after a successful signup so the next one starts with an empty referral field */
export const clearSavedReferral = (role) => saveReferral(role, '');
