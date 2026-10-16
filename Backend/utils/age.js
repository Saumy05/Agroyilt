// Age rules for workers and vendors. Date of birth is stored (not age) so the age never goes stale.
const MIN_WORKING_AGE = 18;
const MAX_REASONABLE_AGE = 100;

// Accepts 'YYYY-MM-DD' or an ISO string. Returns a Date at UTC midnight, or null if unparseable.
const parseDob = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject rolled-over dates such as 2005-02-31
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
};

const calculateAge = (dob, now = new Date()) => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
};

// Returns { ok, dob, age, message }. `required` = reject a missing DOB (signup); otherwise missing is fine (legacy profiles).
const validateDob = (value, { required = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    return required
      ? { ok: false, message: 'Date of birth is required.' }
      : { ok: true, dob: null, age: null };
  }
  const dob = parseDob(value);
  if (!dob) return { ok: false, message: 'Please provide a valid date of birth.' };
  const age = calculateAge(dob);
  if (age < 0) return { ok: false, message: 'Date of birth cannot be in the future.' };
  if (age > MAX_REASONABLE_AGE) return { ok: false, message: 'Please provide a valid date of birth.' };
  if (age < MIN_WORKING_AGE) {
    return { ok: false, message: `You must be at least ${MIN_WORKING_AGE} years old to register.` };
  }
  return { ok: true, dob, age };
};

module.exports = { MIN_WORKING_AGE, parseDob, calculateAge, validateDob };
