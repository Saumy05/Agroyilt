export const formatCurrency = (value) => {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN')}`;
};

export const formatDate = (dateStr, options = {}) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', options);
};

export const getDateRange = (period) => {
  const end = new Date();
  const start = new Date();
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === 'week') start.setDate(end.getDate() - 7);
  else if (period === 'month') start.setDate(end.getDate() - 30);
  else if (period === 'year') start.setDate(end.getDate() - 365);
  else start.setDate(end.getDate() - 30);
  return { start, end };
};

export const filterByDateRange = (data, start, end) => {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  return (data || []).filter((item) => {
    const d = new Date(item.date);
    return !Number.isNaN(d.getTime()) && d >= s && d <= e;
  });
};



// ── Chart axis labels ─────────────────────────────────────────────────────────
const trim = (n, digits) => String(Number(n.toFixed(digits)));

/**
 * Rupee amount for a chart's y-axis, in the Indian style: ₹0, ₹250, ₹1.5k, ₹2.4L, ₹1.2Cr.
 * Small amounts stay as they are (rounding everything to thousands made a quiet day read "₹0k" on every tick).
 */
export const formatRupeeAxis = (value) => {
  const v = Number(value) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7, 2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5, 2)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3, 1)}k`;
  return `${sign}₹${abs < 10 ? trim(abs, 2) : Math.round(abs)}`;
};

/** A plain count (customers, bookings) for a chart's y-axis: 0, 5, 12, 1.5k */
export const formatCountAxis = (value) => {
  const v = Number(value) || 0;
  return Math.abs(v) >= 1000 ? `${trim(v / 1000, 1)}k` : String(Math.round(v));
};
