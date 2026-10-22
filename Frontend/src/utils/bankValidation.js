import { IFSC_REGEX, normalizeIfsc } from './ifsc';

/** Rules for every bank-detail field, shared by the profile form, the vendor edit page and (mirrored) the server. */
const NAME_RE = /^[\p{L}][\p{L} .'-]{2,59}$/u;
const BANK_RE = /^[\p{L}][\p{L}0-9 &.()'-]{2,59}$/u;
const BRANCH_RE = /^[\p{L}0-9][\p{L}0-9 &.,()/'-]{1,59}$/u;
const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

/** Error text for one field, or '' when it is fine. `form` supplies the other value a field depends on (the account number for the confirmation). */
export const validateBankField = (name, rawValue, form = {}) => {
  const value = String(rawValue ?? '').trim();
  switch (name) {
    case 'accountHolderName':
      if (!value) return 'Account holder name is required';
      if (!NAME_RE.test(value)) return 'Use 3 to 60 letters only (spaces, dots and hyphens are fine)';
      return '';
    case 'accountNumber':
      if (!value) return 'Account number is required';
      if (!/^\d+$/.test(value)) return 'Account number can only have digits';
      if (value.length < 9 || value.length > 18) return 'Account number must be 9 to 18 digits';
      if (/^(\d)\1+$/.test(value)) return 'This is not a valid account number';
      return '';
    case 'confirmAccountNumber':
      if (!value) return 'Please re-enter your account number';
      if (value !== String(form.accountNumber ?? '').trim()) return 'Account numbers do not match';
      return '';
    case 'ifsc':
      if (!value) return 'IFSC code is required';
      if (!IFSC_REGEX.test(normalizeIfsc(value))) return 'Invalid IFSC: 11 characters, 4 letters + 0 + 6 letters/digits (e.g. SBIN0001234)';
      return '';
    case 'bankName':
      if (!value) return 'Bank name is required';
      if (!BANK_RE.test(value)) return 'Enter the bank name using 3 to 60 letters';
      return '';
    case 'branchName':
      if (value && !BRANCH_RE.test(value)) return 'Branch name can have letters, numbers and spaces only (2 to 60 characters)';
      return '';
    case 'upiId':
      if (value && !UPI_RE.test(value)) return 'Enter a valid UPI ID, like name@okaxis';
      return '';
    default:
      return '';
  }
};

const FIELDS = ['accountHolderName', 'accountNumber', 'confirmAccountNumber', 'ifsc', 'bankName', 'branchName', 'upiId'];

/** Errors for the whole form: { field: message } with only the fields that have a problem */
export const validateBankDetails = (form) => {
  const errors = {};
  FIELDS.forEach((f) => {
    const message = validateBankField(f, form[f], form);
    if (message) errors[f] = message;
  });
  return errors;
};
