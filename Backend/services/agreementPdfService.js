'use strict';

/**
 * The agreement as a PDF: the full text, the border sketch and corner table, and both parties' signature certificates
 * on the same document. Made on the server (the phone app has no print function) with an embedded Devanagari font, so
 * Hindi text is shaped correctly.
 */

const path = require('path');
const PDFDocument = require('pdfkit');
const render = require('./agreementRenderService');

const FONT = { regular: path.join(__dirname, '..', 'assets', 'fonts', 'Mukta-Regular.ttf'), bold: path.join(__dirname, '..', 'assets', 'fonts', 'Mukta-Bold.ttf') };
const MARGIN = 54;
const GREEN = '#047857';
const SLATE = '#0f172a';
const GREY = '#64748b';

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST' : '');

/** Writes text with **bold** parts. */
const richText = (doc, text, opts = {}) => {
  const parts = String(text).split(/(\*\*.+?\*\*)/g).filter(Boolean);
  parts.forEach((part, i) => {
    const bold = part.startsWith('**') && part.endsWith('**');
    doc.font(bold ? 'bold' : 'regular').text(bold ? part.slice(2, -2) : part, { ...opts, continued: i < parts.length - 1 });
  });
  if (!parts.length) doc.text('', opts);
  doc.font('regular');
};

const ensureSpace = (doc, needed) => {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
};

const drawBoundaryTable = (doc, terms, lang) => {
  const L = render.LABELS[lang] || render.LABELS.en;
  const x = MARGIN;
  const w = doc.page.width - MARGIN * 2;
  const cols = [w * 0.18, w * 0.41, w * 0.41];
  const rowH = 20;
  const cell = (cx, cy, cw, text, bold) => {
    doc.rect(cx, cy, cw, rowH).strokeColor('#cbd5e1').lineWidth(0.6).stroke();
    doc.font(bold ? 'bold' : 'regular').fontSize(9.5).fillColor(SLATE).text(String(text), cx + 6, cy + 5, { width: cw - 12, lineBreak: false });
  };
  const header = () => {
    ensureSpace(doc, rowH * 2);
    const y = doc.y;
    doc.rect(x, y, w, rowH).fill('#f1f5f9');
    [L.corner, L.latitude, L.longitude].forEach((t, i) => cell(x + cols.slice(0, i).reduce((a, b) => a + b, 0), y, cols[i], t, true));
    doc.y = y + rowH;
  };
  doc.moveDown(0.3);
  header();
  (terms.boundaryPoints || []).forEach((p, idx) => {
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 20) { doc.addPage(); header(); }
    const y = doc.y;
    [String(idx + 1), Number(p.lat).toFixed(6), Number(p.lng).toFixed(6)].forEach((t, i) => cell(x + cols.slice(0, i).reduce((a, b) => a + b, 0), y, cols[i], t, false));
    doc.y = y + rowH;
  });
  doc.x = MARGIN;
  if (terms.boundaryAreaAcres) {
    doc.moveDown(0.4).fontSize(10).fillColor(GREY);
    richText(doc, `${L.area}: **${Math.round(terms.boundaryAreaAcres * 100) / 100} ${L.acres}**`, { width: w });
  }
  doc.moveDown(0.5);
};

/** The same sketch as on screen: north up, corners numbered. */
const drawBoundaryMap = (doc, terms) => {
  const pts = (terms.boundaryPoints || []).filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  if (pts.length < 3) return;
  const size = 200;
  ensureSpace(doc, size + 20);
  const left = (doc.page.width - size) / 2;
  const top = doc.y + 6;
  const lats = pts.map(p => Number(p.lat));
  const k = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const xs = pts.map(p => Number(p.lng) * k);
  const ys = pts.map(p => -Number(p.lat));
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const pad = 22;
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (size - pad * 2) / span;
  const offX = (size - (maxX - minX) * scale) / 2;
  const offY = (size - (maxY - minY) * scale) / 2;
  const xy = pts.map((_, i) => [left + offX + (xs[i] - minX) * scale, top + offY + (ys[i] - minY) * scale]);

  doc.roundedRect(left, top, size, size, 6).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.save();
  doc.moveTo(xy[0][0], xy[0][1]);
  xy.slice(1).forEach(p => doc.lineTo(p[0], p[1]));
  doc.closePath().fillOpacity(0.2).fillAndStroke('#10b981', GREEN);
  doc.restore();
  doc.lineWidth(1.6).strokeColor(GREEN).moveTo(xy[0][0], xy[0][1]);
  xy.slice(1).forEach(p => doc.lineTo(p[0], p[1]));
  doc.closePath().stroke();
  xy.forEach((p, i) => {
    doc.circle(p[0], p[1], 7).fillColor(GREEN).fill();
    doc.fillColor('#ffffff').font('bold').fontSize(8).text(String(i + 1), p[0] - 7, p[1] - 4.5, { width: 14, align: 'center', lineBreak: false });
  });
  // north arrow
  const nx = left + size - 16; const ny = top + 18;
  doc.moveTo(nx, ny - 9).lineTo(nx + 5, ny + 5).lineTo(nx, ny + 2).lineTo(nx - 5, ny + 5).closePath().fillColor('#334155').fill();
  doc.font('bold').fontSize(8).fillColor('#334155').text('N', nx - 5, ny + 7, { width: 10, align: 'center', lineBreak: false });
  doc.font('regular').fillColor(SLATE);
  doc.y = top + size + 8;
};

const drawSignatureBox = (doc, x, y, w, title, person, sig, forAdmin) => {
  const h = forAdmin ? 148 : 118;
  doc.roundedRect(x, y, w, h, 6).lineWidth(sig.signed ? 1.2 : 0.8).strokeColor(sig.signed ? GREEN : '#94a3b8');
  if (sig.signed) doc.stroke(); else doc.dash(3, { space: 3 }).stroke().undash(); // pending: dashed box
  doc.font('bold').fontSize(8.5).fillColor(GREY).text(title.toUpperCase(), x + 10, y + 9, { width: w - 20 });
  doc.font('bold').fontSize(12).fillColor(SLATE).text(person.name, x + 10, y + 24, { width: w - 20 });
  doc.font('regular').fontSize(9).fillColor(GREY).text(`Mobile: ${person.mobile || '-'}`, x + 10, doc.y + 1, { width: w - 20 });
  if (sig.signed) {
    const markY = doc.y + 6;
    doc.circle(x + 16, markY + 6, 5.5).fillColor(GREEN).fill();
    doc.lineWidth(1.4).strokeColor('#ffffff').moveTo(x + 13.5, markY + 6).lineTo(x + 15.5, markY + 8.2).lineTo(x + 19, markY + 4).stroke();
    doc.font('bold').fontSize(10).fillColor(GREEN).text('DIGITALLY SIGNED · VERIFIED', x + 28, markY + 1, { width: w - 38 });
    doc.font('regular').fontSize(8.5).fillColor(SLATE)
      .text(`Signed: ${fmtDateTime(sig.signedAt)}`, x + 10, doc.y + 2, { width: w - 20 })
      .text(`Registered name locked · OTP verified${sig.platform ? ` · ${sig.platform}` : ''}`, x + 10, doc.y + 1, { width: w - 20 });
    if (forAdmin) {
      doc.text(`IP: ${sig.ipAddress || '-'}`, x + 10, doc.y + 1, { width: w - 20 })
        .text(`Device: ${[sig.device?.platform, sig.device?.model, sig.device?.appVersion].filter(Boolean).join(' · ') || '-'}`, x + 10, doc.y + 1, { width: w - 20 });
    }
  } else {
    doc.font('regular').fontSize(10).fillColor(GREY).text('Signature pending', x + 10, doc.y + 8, { width: w - 20 });
  }
  doc.fillColor(SLATE);
  return h;
};

/**
 * Streams the agreement PDF to `res`.
 * @param {object} ag  LeaseAgreement document
 * @param {object} res  Express response (or any writable stream)
 * @param {{ settings?: object, forAdmin?: boolean }} opts  settings: company details for the header
 */
const streamAgreementPdf = (ag, res, { settings = {}, forAdmin = false } = {}) => {
  const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: MARGIN + 10, left: MARGIN, right: MARGIN }, bufferPages: true, info: { Title: `Lease Agreement ${ag.referenceNo}`, Author: settings.companyName || 'AgroYilt', Subject: 'Land lease agreement' } });
  doc.registerFont('regular', FONT.regular);
  doc.registerFont('bold', FONT.bold);
  doc.pipe(res);

  const terms = ag.termsSnapshot;
  const lang = ag.language;
  const v = { status: ag.status };
  const contentWidth = doc.page.width - MARGIN * 2;

  // document header
  doc.font('bold').fontSize(9).fillColor(GREEN).text((settings.companyName || settings.appName || 'AgroYilt').toUpperCase(), { align: 'left' });
  doc.font('regular').fontSize(8.5).fillColor(GREY).text(`Agreement No. ${ag.referenceNo}  ·  Template v${ag.templateVersion || 1}`);
  doc.moveDown(0.8).fillColor(SLATE);

  // body
  render.toBlocks(ag.renderedContent).forEach((b) => {
    doc.x = MARGIN;
    switch (b.type) {
      case 'h1': ensureSpace(doc, 40); doc.font('bold').fontSize(16).fillColor(SLATE).text(b.text.replace(/\*\*/g, ''), { align: 'center', width: contentWidth }); doc.moveDown(0.6); break;
      case 'h2': ensureSpace(doc, 50); doc.moveDown(0.5).font('bold').fontSize(12.5).fillColor(SLATE).text(b.text.replace(/\*\*/g, ''), { width: contentWidth }); doc.moveTo(MARGIN, doc.y + 1).lineTo(MARGIN + contentWidth, doc.y + 1).lineWidth(0.5).strokeColor('#e2e8f0').stroke(); doc.moveDown(0.4); break;
      case 'h3': ensureSpace(doc, 40); doc.moveDown(0.3).font('bold').fontSize(11).text(b.text.replace(/\*\*/g, ''), { width: contentWidth }); doc.moveDown(0.2); break;
      case 'p': doc.x = MARGIN; doc.fontSize(10.5).fillColor(SLATE); richText(doc, b.text, { width: contentWidth, lineGap: 2 }); doc.moveDown(0.35); break;
      case 'ul': case 'ol':
        b.items.forEach((item, i) => {
          ensureSpace(doc, 30);
          const marker = b.type === 'ul' ? '•' : `${i + 1}.`;
          const y = doc.y;
          doc.font('regular').fontSize(10.5).fillColor(SLATE).text(marker, MARGIN, y, { width: 20, lineBreak: false });
          doc.y = y;
          doc.x = MARGIN + 22; // the text starts after the marker
          richText(doc, item, { width: contentWidth - 22, lineGap: 2 });
          doc.x = MARGIN;
          doc.moveDown(0.25);
        });
        break;
      case 'hr': doc.moveDown(0.3).moveTo(MARGIN, doc.y).lineTo(MARGIN + contentWidth, doc.y).lineWidth(0.5).strokeColor('#e2e8f0').stroke(); doc.moveDown(0.5); break;
      case 'boundary_table': drawBoundaryTable(doc, terms, lang); break;
      case 'boundary_map': drawBoundaryMap(doc, terms); break;
      default: break;
    }
  });

  // signatures: both on the same document, side by side
  ensureSpace(doc, 190);
  doc.moveDown(0.8);
  doc.font('bold').fontSize(11).fillColor(SLATE).text('Digital Signatures · डिजिटल हस्ताक्षर', MARGIN, doc.y);
  doc.moveDown(0.5);
  const boxW = (contentWidth - 14) / 2;
  const top = doc.y;
  const sigs = ag.signatures;
  const pub = (s) => ({ signed: !!s?.signed, signedAt: s?.signedAt, platform: s?.device?.platform, ipAddress: s?.ipAddress, device: s?.device });
  const h = drawSignatureBox(doc, MARGIN, top, boxW, 'Landowner · भूमि स्वामी', ag.landowner, pub(sigs.landowner), forAdmin);
  drawSignatureBox(doc, MARGIN + boxW + 14, top, boxW, 'Farmer / Tenant · पट्टाधारक', ag.farmer, pub(sigs.farmer), forAdmin);
  doc.y = top + h + 10;
  doc.font('regular').fontSize(8).fillColor(GREY).text(`Document fingerprint (SHA-256): ${ag.contentHash}`, MARGIN, doc.y, { width: contentWidth });
  if (ag.executedAt) doc.text(`Executed: ${fmtDateTime(ag.executedAt)}`, { width: contentWidth });
  if (ag.effective?.startDate && ag.effective?.endDate) {
    doc.font('bold').fontSize(9.5).fillColor(SLATE).text(`Lease period: ${render.fmtDate(ag.effective.startDate)} to ${render.fmtDate(ag.effective.endDate)}  (${terms.durationMonths} ${(render.LABELS[lang] || render.LABELS.en).months})`, { width: contentWidth });
  }

  // watermark + footer on every page
  const range = doc.bufferedPageRange();
  const mark = ag.status === 'FULLY_EXECUTED' ? null : (ag.status === 'CANCELLED' ? 'CANCELLED' : ag.status === 'EXPIRED' ? 'EXPIRED' : 'NOT SIGNED BY BOTH');
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (mark) {
      doc.save().rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] }).font('bold').fontSize(46).fillColor('#94a3b8').fillOpacity(0.16)
        .text(mark, 0, doc.page.height / 2 - 30, { width: doc.page.width, align: 'center', lineBreak: false }).restore();
    }
    // the footer sits inside the bottom margin: without this, writing there makes pdfkit add a blank page after each page
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillOpacity(1).font('regular').fontSize(8).fillColor(GREY)
      .text(`${ag.referenceNo}  ·  Page ${i - range.start + 1} of ${range.count}  ·  ${ag.contentHash.slice(0, 16)}`, MARGIN, doc.page.height - MARGIN + 4, { width: contentWidth, align: 'center', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  void v;
  doc.end();
};

module.exports = { streamAgreementPdf };
