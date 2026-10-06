// Display helpers for farmer ⇄ worker payment breakdowns. The amounts themselves always come from the
// backend (cashCollection on worker jobs, paymentSummary.bill on farmer requests) — never computed here.

export const rupees = (amount) =>
  `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** "1 hr 30 min", "45 min", "3 days" */
export const workLength = ({ minutes, days } = {}) => {
  if (days) return `${days} day${days === 1 ? '' : 's'}`;
  const m = Number(minutes) || 0;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h} hr ${rest} min`;
  if (h) return `${h} hr`;
  return `${rest} min`;
};

/** "Booked work (1 hr)" / "Extra time (+30 min)" */
export const paymentLineLabel = (line) =>
  line.kind === 'extension' ? `Extra time (+${workLength(line)})` : `Booked work (${workLength(line)})`;
