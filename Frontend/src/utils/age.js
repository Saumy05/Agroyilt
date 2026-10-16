// Mirrors Backend/utils/age.js. The backend is the source of truth; this just gives instant feedback.
export const MIN_WORKING_AGE = 18;

const pad = (n) => String(n).padStart(2, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Latest DOB that still makes someone 18 today (used as the date picker's max)
export const maxDobForAdult = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_WORKING_AGE);
  return toISODate(d);
};

export const minDob = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 100);
  return toISODate(d);
};

// Accepts 'YYYY-MM-DD' or an ISO string; returns whole years or null
export const calculateAge = (dob) => {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob));
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  const monthDiff = now.getMonth() + 1 - mo;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age -= 1;
  return age;
};

// '' when valid, otherwise the message to show
export const getDobError = (dob, { required = true } = {}) => {
  if (!dob) return required ? 'Date of birth is required' : '';
  const age = calculateAge(dob);
  if (age === null) return 'Please enter a valid date of birth';
  if (age < 0) return 'Date of birth cannot be in the future';
  if (age > 100) return 'Please enter a valid date of birth';
  if (age < MIN_WORKING_AGE) return `You must be at least ${MIN_WORKING_AGE} years old to register`;
  return '';
};

// 'YYYY-MM-DD' for <input type="date"> from a stored ISO string
export const toDateInputValue = (value) => (value ? String(value).slice(0, 10) : '');
