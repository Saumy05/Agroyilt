export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Uppercases, drops spaces/symbols and trims to 11 chars. The 5th character of an IFSC is always the digit 0, so a typed letter O is corrected. */
export const normalizeIfsc = (value) => {
  const clean = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
  return clean.length >= 5 && clean[4] === 'O' ? `${clean.slice(0, 4)}0${clean.slice(5)}` : clean;
};
