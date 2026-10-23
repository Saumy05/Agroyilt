const MAX_USER_ADDRESSES = 5;

/**
 * Checks and tidies a farmer's address list before it is saved:
 * at most MAX_USER_ADDRESSES, exactly one default (the first one flagged, else the first), and the default listed first
 * (the weather alerts and admin area filters read addresses[0] as the primary address).
 * @returns {{ addresses: object[] } | { error: string }}
 */
const normalizeAddressList = (list) => {
  if (!Array.isArray(list)) return { error: 'Addresses must be a list.' };
  if (list.length > MAX_USER_ADDRESSES) {
    return { error: `You can save up to ${MAX_USER_ADDRESSES} addresses. Remove one to add another.` };
  }
  if (list.length === 0) return { addresses: [] };

  const plain = list.map(a => (a && typeof a.toObject === 'function' ? a.toObject() : { ...a }));
  let defaultIdx = plain.findIndex(a => a.isDefault === true);
  if (defaultIdx === -1) defaultIdx = 0;

  const tidy = plain.map((a, i) => ({ ...a, isDefault: i === defaultIdx }));
  const [def] = tidy.splice(defaultIdx, 1);
  return { addresses: [def, ...tidy] };
};

module.exports = { MAX_USER_ADDRESSES, normalizeAddressList };
