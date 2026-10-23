'use strict';

/**
 * Builds the text of a lease agreement: the terms taken from the lease and the accepted offer, the template with its
 * {{placeholders}} filled in, and safe renderings of the result (HTML for the screen, blocks for the PDF).
 *
 * Safety: templates are plain text with a tiny markdown subset, never HTML. Every value put into a template is cleaned
 * (a farmer's name cannot add markup or another placeholder), and the HTML is built by escaping first.
 */

const crypto = require('crypto');
const escapeHtml = require('escape-html');
const { round2, splitAmount, FIRST_PAYMENT_GRACE_DAYS } = require('./landLeaseScheduleService');

const LABELS = {
  en: { acres: 'acres', months: 'months', perAcreYear: 'per acre per year', corner: 'Corner', latitude: 'Latitude', longitude: 'Longitude', area: 'Area of the marked border' },
  hi: { acres: 'एकड़', months: 'महीने', perAcreYear: 'प्रति एकड़ प्रति वर्ष', corner: 'कोना', latitude: 'अक्षांश (Latitude)', longitude: 'देशांतर (Longitude)', area: 'चिह्नित सीमा का क्षेत्रफल' }
};

/** Placeholders a template may use (the admin screen lists these). */
const PLACEHOLDERS = [
  ['agreement_id', 'Agreement number'], ['agreement_date', 'Date the agreement was made'],
  ['landowner_name', 'Landowner name'], ['landowner_mobile', 'Landowner mobile'],
  ['farmer_name', 'Tenant farmer name'], ['farmer_mobile', 'Tenant farmer mobile'],
  ['khasra_no', 'Khasra / Khata number'], ['land_area', 'Land area'], ['boundary_area', 'Area of the marked border'],
  ['village', 'Village'], ['tehsil', 'Tehsil'], ['district', 'District'], ['state', 'State'], ['full_address', 'Full address'],
  ['rent_amount', 'Rent per acre per year (fixed rent)'], ['total_rent', 'Total rent for the term (fixed rent)'],
  ['share_percentage', "Landowner's share of the crop, % (batai)"], ['tenant_share_percentage', "Tenant's share of the crop, % (batai)"],
  ['duration', 'Length of the lease'], ['available_from', 'Date the land is available from'], ['start_rule', 'When the lease starts'],
  ['crops', 'Crops'], ['payment_terms', 'How and when payment is made'],
  ['boundary_table', 'Table of the border corners with latitude and longitude'], ['boundary_map', 'Sketch of the land border'],
  ['standard_clauses', 'The standard clauses list of the template']
].map(([key, description]) => ({ key, description }));

const SPECIAL = { boundary_table: '[[BOUNDARY_TABLE]]', boundary_map: '[[BOUNDARY_MAP]]' };

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
};

/** A value that is safe to place in the text: one line, no markup characters, no placeholder syntax. */
const clean = (v, max = 160) => String(v ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\{\{|\}\}|\[\[|\]\]/g, '')
  .replace(/[*_`<>#]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

/** Everything the agreement says about the land and the deal, frozen at creation. */
const buildTerms = ({ lease, offer, commissionPercentage = 0 }) => {
  const loc = lease.location || {};
  const months = Math.max(1, Number(offer.durationMonths) || 12);
  const fixed = lease.leaseType === 'fixed-rent';
  const price = fixed ? (Number(offer.proposedPrice) || Number(lease.pricePerAcre)) : null;
  const share = fixed ? null : (Number(offer.proposedShare) || Number(lease.sharePercentage));
  const totalRent = fixed ? round2(lease.sizeInAcres * price * (months / 12)) : null;
  return {
    leaseType: lease.leaseType,
    khasraNumber: lease.khasraNumber,
    landAreaAcres: lease.sizeInAcres,
    boundaryAreaAcres: lease.boundaryAreaAcres,
    boundaryPoints: (lease.boundaryPoints || []).map(p => ({ lat: p.lat, lng: p.lng })),
    village: loc.village || '', tehsil: loc.tehsil || '', district: loc.district || '', state: loc.state || '',
    fullAddress: loc.fullAddress || '',
    durationMonths: months,
    pricePerAcrePerYear: price,
    totalRent,
    installmentCount: fixed ? months : null,
    advanceFirstInstallment: fixed && !!offer.payFirstInstallmentOnStart,
    firstInstallmentAmount: fixed ? splitAmount(totalRent, months)[0] : null,
    sharePercentage: share,
    crops: offer.proposedCrops || (lease.suitableCrops || []).join(', '),
    availableFrom: lease.availableFrom,
    commissionPercentage: Number(commissionPercentage) || 0
  };
};

const paymentTermsText = (terms, lang) => {
  const hi = lang === 'hi';
  if (terms.leaseType === 'fixed-rent') {
    const each = terms.installmentCount ? round2(terms.totalRent / terms.installmentCount) : terms.totalRent;
    const advance = terms.advanceFirstInstallment
      ? (hi
        ? ` पहली किस्त (${inr(terms.firstInstallmentAmount)}) दोनों पक्षों के हस्ताक्षर होते ही काश्तकार के AgroYilt वॉलेट से अपने आप काट ली जाएगी। यदि वह पट्टा शुरू होने के ${FIRST_PAYMENT_GRACE_DAYS} दिन के भीतर नहीं दी जाती, तो भूमि स्वामी तुरंत पट्टा समाप्त कर सकता है।`
        : ` The first installment (${inr(terms.firstInstallmentAmount)}) is charged automatically from the tenant's AgroYilt wallet as soon as both parties have signed. If it is not paid within ${FIRST_PAYMENT_GRACE_DAYS} days after the lease starts, the landowner may end the lease at once.`)
      : '';
    return hi
      ? `किराया ${terms.installmentCount} मासिक किस्तों में (लगभग ${inr(each)} प्रति माह) AgroYilt ऐप के माध्यम से दिया जाएगा। पहली किस्त पट्टा आरंभ होने पर और आगे हर महीने उसी तारीख को देय होगी।${advance}`
      : `The rent is paid in ${terms.installmentCount} monthly installments (about ${inr(each)} a month) through the AgroYilt app. The first installment is due when the lease starts and the others on the same date each month.${advance}`;
  }
  return hi
    ? `हर फसल कटने के बाद काश्तकार ऐप में फसल की कुल कीमत दर्ज करेगा, भूमि स्वामी उसे पुष्टि करेगा, और काश्तकार भूमि स्वामी का ${terms.sharePercentage}% हिस्सा AgroYilt ऐप के माध्यम से देगा।`
    : `After each harvest the tenant enters the total value of the crop in the app, the landowner confirms it, and the tenant pays the landowner's ${terms.sharePercentage}% share through the AgroYilt app.`;
};

const startRuleText = (terms, lang) => (lang === 'hi'
  ? `दोनों पक्षों में से बाद में हस्ताक्षर करने वाले के हस्ताक्षर की तारीख से (या ${fmtDate(terms.availableFrom)} से, यदि वह बाद की हो)`
  : `the date the later of the two parties signs this agreement (or ${fmtDate(terms.availableFrom)} if that is later)`);

/** Values for the {{placeholders}}. */
const placeholderValues = ({ terms, owner, farmer, referenceNo, agreementDate, language, standardClauses }) => {
  const L = LABELS[language] || LABELS.en;
  const fixed = terms.leaseType === 'fixed-rent';
  return {
    agreement_id: referenceNo,
    agreement_date: fmtDate(agreementDate),
    landowner_name: clean(owner.name, 120),
    landowner_mobile: clean(owner.mobile, 20),
    farmer_name: clean(farmer.name, 120),
    farmer_mobile: clean(farmer.mobile, 20),
    khasra_no: clean(terms.khasraNumber, 60),
    land_area: `${round2(terms.landAreaAcres)} ${L.acres}`,
    boundary_area: terms.boundaryAreaAcres ? `${round2(terms.boundaryAreaAcres)} ${L.acres}` : '',
    village: clean(terms.village, 80), tehsil: clean(terms.tehsil, 80), district: clean(terms.district, 80), state: clean(terms.state, 60),
    full_address: clean(terms.fullAddress, 240),
    rent_amount: fixed ? `${inr(terms.pricePerAcrePerYear)} ${L.perAcreYear}` : '',
    total_rent: fixed ? inr(terms.totalRent) : '',
    share_percentage: terms.sharePercentage != null ? String(terms.sharePercentage) : '',
    tenant_share_percentage: terms.sharePercentage != null ? String(round2(100 - terms.sharePercentage)) : '',
    duration: `${terms.durationMonths} ${L.months}`,
    available_from: fmtDate(terms.availableFrom),
    start_rule: startRuleText(terms, language),
    crops: clean(terms.crops, 200),
    payment_terms: paymentTermsText(terms, language),
    standard_clauses: (standardClauses || []).map((c, i) => `${i + 1}. ${clean(c, 1500)}`).join('\n')
  };
};

/**
 * Fills a template. Unknown placeholders are removed and reported.
 * @returns {{ text: string, unknown: string[] }}
 */
const fillTemplate = (template, ctx) => {
  const values = placeholderValues({ ...ctx, standardClauses: template.standardClauses, language: ctx.language || template.language });
  const unknown = [];
  const text = String(template.content).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, rawKey) => {
    const key = rawKey.toLowerCase();
    if (SPECIAL[key]) return SPECIAL[key];
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
    unknown.push(key);
    return '';
  });
  return { text, unknown: [...new Set(unknown)] };
};

/** Placeholders written in a template that this system does not know (shown to the admin before saving). */
const findUnknownPlaceholders = (content) => {
  const known = new Set([...PLACEHOLDERS.map(p => p.key)]);
  const bad = [];
  String(content).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k) => { if (!known.has(k.toLowerCase())) bad.push(k); return m; });
  return [...new Set(bad)];
};

const contentHash = (text, terms) => crypto.createHash('sha256').update(JSON.stringify({ text, terms })).digest('hex');

// ── border: table + sketch ───────────────────────────────────────────────────────────────────────
const boundaryTableHtml = (terms, lang) => {
  const L = LABELS[lang] || LABELS.en;
  const rows = (terms.boundaryPoints || []).map((p, i) =>
    `<tr><td>${i + 1}</td><td>${Number(p.lat).toFixed(6)}</td><td>${Number(p.lng).toFixed(6)}</td></tr>`).join('');
  const area = terms.boundaryAreaAcres ? `<p class="agr-note">${escapeHtml(L.area)}: <strong>${round2(terms.boundaryAreaAcres)} ${escapeHtml(L.acres)}</strong></p>` : '';
  return `<table class="agr-table"><thead><tr><th>${escapeHtml(L.corner)}</th><th>${escapeHtml(L.latitude)}</th><th>${escapeHtml(L.longitude)}</th></tr></thead><tbody>${rows}</tbody></table>${area}`;
};

/** Same drawing as the app's BoundarySketch: north up, corners numbered. Pure string, nothing from outside. */
const boundarySvg = (points, size = 260) => {
  const pts = (points || []).filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  if (pts.length < 3) return '';
  const lats = pts.map(p => Number(p.lat));
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map(p => Number(p.lng) * k);
  const ys = pts.map(p => -Number(p.lat));
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const pad = 24;
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (size - pad * 2) / span;
  const offX = (size - (maxX - minX) * scale) / 2;
  const offY = (size - (maxY - minY) * scale) / 2;
  const xy = pts.map((_, i) => [offX + (xs[i] - minX) * scale, offY + (ys[i] - minY) * scale]);
  const d = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
  const dots = xy.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="8" fill="#059669" stroke="#fff" stroke-width="1.5"/><text x="${p[0].toFixed(1)}" y="${(p[1] + 3.2).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${i + 1}</text>`).join('');
  return `<svg class="agr-sketch" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Land border sketch"><rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="8" fill="#f8fafc" stroke="#cbd5e1"/><path d="${d}" fill="#10b98133" stroke="#047857" stroke-width="2" stroke-linejoin="round"/>${dots}<g transform="translate(${size - 18},18)"><path d="M0,-9 L5,5 L0,2 L-5,5 Z" fill="#334155"/><text x="0" y="17" text-anchor="middle" font-size="8" font-weight="700" fill="#334155">N</text></g></svg>`;
};

// ── text -> safe HTML / PDF blocks ───────────────────────────────────────────────────────────────
const inlineHtml = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

/** Splits the (already filled) text into simple blocks. */
const toBlocks = (text) => {
  const blocks = [];
  let list = null;
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line === SPECIAL.boundary_table) { flush(); blocks.push({ type: 'boundary_table' }); continue; }
    if (line === SPECIAL.boundary_map) { flush(); blocks.push({ type: 'boundary_map' }); continue; }
    if (line === '---') { flush(); blocks.push({ type: 'hr' }); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flush(); blocks.push({ type: `h${h[1].length}`, text: h[2] }); continue; }
    const ul = line.match(/^[-•]\s+(.*)$/);
    const ol = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (!list || list.type !== type) { flush(); list = { type, items: [] }; }
      list.items.push(ul ? ul[1] : ol[2]);
      continue;
    }
    flush();
    blocks.push({ type: 'p', text: line });
  }
  flush();
  return blocks;
};

const toHtml = (text, terms, lang) => toBlocks(text).map((b) => {
  switch (b.type) {
    case 'h1': return `<h1>${inlineHtml(b.text)}</h1>`;
    case 'h2': return `<h2>${inlineHtml(b.text)}</h2>`;
    case 'h3': return `<h3>${inlineHtml(b.text)}</h3>`;
    case 'p': return `<p>${inlineHtml(b.text)}</p>`;
    case 'ul': return `<ul>${b.items.map(i => `<li>${inlineHtml(i)}</li>`).join('')}</ul>`;
    case 'ol': return `<ol>${b.items.map(i => `<li>${inlineHtml(i)}</li>`).join('')}</ol>`;
    case 'hr': return '<hr/>';
    case 'boundary_table': return boundaryTableHtml(terms, lang);
    case 'boundary_map': return `<div class="agr-map">${boundarySvg(terms.boundaryPoints)}</div>`;
    default: return '';
  }
}).join('\n');

module.exports = {
  PLACEHOLDERS, buildTerms, fillTemplate, findUnknownPlaceholders, contentHash,
  toBlocks, toHtml, boundarySvg, boundaryTableHtml, clean, fmtDate, inr, LABELS
};
