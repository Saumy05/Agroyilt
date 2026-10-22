/**
 * Splits a saved address ("Area, City, State" from auto-detect, or a full Google address) into
 * a headline (first part) and a short "City, State" subline, so the two lines never repeat each other.
 */
export const splitLocation = (loc) => {
  const parts = String(loc || '')
    .split(/\s*[,-]\s*/)
    .map((p) => p.replace(/\s+\d{5,6}$/, '').trim()) // drop trailing PIN codes
    .filter((p) => p && !/^\d{5,6}$/.test(p) && p.toLowerCase() !== 'india');

  if (parts.length === 0) return { primary: '', secondary: '' };
  if (parts.length === 1) return { primary: parts[0], secondary: '' };
  const secondary = parts.slice(-2).filter((p) => p !== parts[0]).join(', ');
  return { primary: parts[0], secondary };
};
