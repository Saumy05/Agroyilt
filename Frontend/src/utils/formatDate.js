// The app-wide date format: DD/MM/YYYY (same as the booking checkout and the worker forms).
export const formatDateDDMMYYYY = (value) => {
  if (!value) return '';
  // "YYYY-MM-DD" strings are read as that calendar day, not shifted by the time zone
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [y, m, d] = value.trim().split('-');
    return `${d}/${m}/${y}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
};

/** DD/MM/YYYY, hh:mm AM/PM */
export const formatDateTimeDDMMYYYY = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${formatDateDDMMYYYY(date)}, ${time}`;
};
