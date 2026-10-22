export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Uppercases, drops spaces/symbols and trims to 11 chars. The 5th character of an IFSC is always the digit 0, so a typed letter O is corrected. */
export const normalizeIfsc = (value) => {
  const clean = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
  return clean.length >= 5 && clean[4] === 'O' ? `${clean.slice(0, 4)}0${clean.slice(5)}` : clean;
};

/** Mobile keyboards: ask for capitals up front so the keyboard's own text matches the uppercased value React writes back, and keep suggestions/autofill off. */
export const IFSC_INPUT_PROPS = {
  autoCapitalize: 'characters',
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false
};

/** Account-number fields are masked with CSS, not type="password", so the browser's password manager never pops over the keyboard. */
export const NUMERIC_SECRET_PROPS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': 'true'
};
