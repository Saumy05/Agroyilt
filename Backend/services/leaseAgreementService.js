'use strict';

/**
 * Digital lease agreement of an accepted land-lease offer.
 *
 * Flow: the owner accepts an offer -> the land becomes `agreement_pending` and an agreement is made from the active
 * template -> each party reads it and signs (registered name, locked; one-time code sent to their registered mobile) ->
 * when both have signed the agreement is FULLY_EXECUTED and the lease starts (`leased`, rent schedule created).
 * If it is not signed in time, or someone cancels, the land opens again.
 *
 * Every state change is a guarded findOneAndUpdate, so two people acting at once cannot both win.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const LandLease = require('../models/LandLease');
const LeaseAgreement = require('../models/LeaseAgreement');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { buildAgreement } = require('./landLeaseScheduleService');
const render = require('./agreementRenderService');
const { getActiveTemplate } = require('./agreementDefaults');
const { hashOtp, otpMatches, OTP_MAX_ATTEMPTS } = require('../utils/otpUtil');
const sms = require('./smsService');
const { notifyLease } = require('./landLeaseNotifyService');

const ROLES = ['landowner', 'farmer'];
const LIVE = ['DRAFT', 'PARTIALLY_SIGNED'];
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MIN_GAP_MS = 30 * 1000;
const OTP_MAX_SENDS = 6;

const agreementLink = (ag) => ({ link: `/user/agreements/${ag._id}`, agreementId: String(ag._id) });
const fail = (status, code, message) => ({ ok: false, status, code, message });
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const audit = (action, { by = null, role = null, details = '', ip = null } = {}) =>
  ({ action, performedBy: by, role, timestamp: new Date(), details, ipAddress: ip });

const TYPE_OF = { 'fixed-rent': 'FIXED_RENT', 'crop-share': 'BATAI_CROP_SHARE' };

const consentText = (name, language) => (language === 'en'
  ? `I, ${name}, solemnly declare that I have read and agree to all the terms of this lease agreement.`
  : `मैं, ${name}, घोषणा करता/करती हूँ कि मैंने इस पट्टा अनुबंध की सभी शर्तें पढ़ ली हैं और मैं इनसे सहमत हूँ।`);

const partyRole = (ag, userId) => {
  const id = String(userId || '');
  if (id && String(ag.landowner.userId) === id) return 'landowner';
  if (id && String(ag.farmer.userId) === id) return 'farmer';
  return null;
};

const getSettings = async () =>
  Settings.findOne({ type: 'global' }).select('landLeaseCommissionPercentage landLeaseRequireAgreement landLeaseAgreementValidDays').lean();

/** Whether accepted offers need a signed agreement before they become a lease (admin can switch it off). */
const agreementRequired = async () => (await getSettings())?.landLeaseRequireAgreement !== false;

// ── making the agreement ─────────────────────────────────────────────────────────────────────────
const newReferenceNo = () => `AGY-L-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/**
 * The owner accepts an offer on an open listing: the land waits for signatures and the agreement is made.
 * @returns {Promise<{ ok: true, lease, agreement } | { ok: false, status, code?, message }>}
 */
const startAgreementForOffer = async ({ leaseId, ownerId, offerId, language = 'hi' }) => {
  const lang = language === 'en' ? 'en' : 'hi';
  const lease = await LandLease.findOne({ _id: leaseId, ownerId });
  if (!lease) return fail(404, 'NOT_FOUND', 'भूमि नहीं मिली या आप इसके मालिक नहीं हैं (Land not found or unauthorized)');
  if (lease.status !== 'active') return fail(400, 'NOT_AVAILABLE', 'यह भूमि पहले ही पट्टे पर दी जा चुकी है या उपलब्ध नहीं है (Land is not available for lease)');
  const offer = lease.offers.id(offerId);
  if (!offer) return fail(404, 'OFFER_NOT_FOUND', 'प्रस्ताव नहीं मिला (Offer not found)');
  if (offer.status !== 'pending') return fail(400, 'OFFER_NOT_PENDING', 'यह प्रस्ताव अब लंबित नहीं है (Offer is no longer pending)');
  if (!(lease.boundaryPoints && lease.boundaryPoints.length >= 3)) {
    return fail(400, 'BOUNDARY_REQUIRED', 'भूमि की सीमा नक्शे पर चिह्नित करें, फिर प्रस्ताव स्वीकार करें (Mark the land border on the map before accepting an offer)');
  }

  const [owner, tenant, settings] = await Promise.all([
    User.findById(ownerId).select('name phone'),
    User.findById(offer.farmerId).select('name phone'),
    getSettings()
  ]);
  if (!owner?.name?.trim()) return fail(400, 'OWNER_NAME_REQUIRED', 'Add your name in your profile before accepting an offer. It is printed on the agreement.');
  if (!tenant?.name?.trim()) return fail(409, 'TENANT_NAME_REQUIRED', 'The farmer has no name on their profile yet, so an agreement cannot be made. Ask them to complete their profile.');

  const template = await getActiveTemplate(TYPE_OF[lease.leaseType], lang);
  if (!template) return fail(500, 'NO_TEMPLATE', 'No agreement template is available.');

  // claim the land for this offer (one winner if two accepts race)
  const claimed = await LandLease.findOneAndUpdate(
    { _id: lease._id, ownerId, status: 'active', offers: { $elemMatch: { _id: offer._id, status: 'pending' } } },
    { $set: { status: 'agreement_pending', 'offers.$.status': 'accepted', currentTenantId: offer.farmerId } },
    { new: true }
  );
  if (!claimed) return fail(409, 'CONFLICT', 'This offer was just handled. Refresh and try again.');

  try {
    const terms = render.buildTerms({ lease: claimed, offer, commissionPercentage: settings?.landLeaseCommissionPercentage ?? 2 });
    const now = new Date();
    let agreement = null;
    for (let attempt = 0; attempt < 5 && !agreement; attempt++) {
      const referenceNo = newReferenceNo();
      const { text } = render.fillTemplate(template, {
        terms, owner: { name: owner.name, mobile: owner.phone }, farmer: { name: tenant.name, mobile: tenant.phone },
        referenceNo, agreementDate: now, language: lang
      });
      try {
        agreement = await LeaseAgreement.create({
          leaseId: claimed._id,
          offerId: offer._id,
          referenceNo,
          templateId: template._id,
          templateVersion: template.version,
          type: TYPE_OF[claimed.leaseType],
          language: lang,
          landowner: { userId: owner._id, name: owner.name.trim(), mobile: owner.phone || '' },
          farmer: { userId: tenant._id, name: tenant.name.trim(), mobile: tenant.phone || '' },
          termsSnapshot: terms,
          renderedContent: text,
          contentHash: render.contentHash(text, terms),
          status: 'DRAFT',
          expiresAt: new Date(now.getTime() + (settings?.landLeaseAgreementValidDays || 7) * 24 * 60 * 60 * 1000),
          auditTrail: [audit('created', { by: owner._id, role: 'landowner', details: `Agreement ${referenceNo} made from template v${template.version} (${lang})` })]
        });
      } catch (err) {
        if (!(err && err.code === 11000 && /referenceNo/.test(err.message || ''))) throw err;
      }
    }
    if (!agreement) throw new Error('Could not make a unique agreement number');

    await LandLease.updateOne({ _id: claimed._id }, { $set: { agreementId: agreement._id } });
    claimed.agreementId = agreement._id;

    notifyLease(offer.farmerId, 'land_lease_agreement_ready', '📝 अनुबंध पर हस्ताक्षर करें (Sign the agreement)',
      `"${claimed.title}" का पट्टा अनुबंध तैयार है। पढ़कर हस्ताक्षर करें, तभी पट्टा शुरू होगा।`, claimed._id, agreementLink(agreement));
    notifyLease(ownerId, 'land_lease_agreement_ready', '📝 अनुबंध पर हस्ताक्षर करें (Sign the agreement)',
      `"${claimed.title}" का पट्टा अनुबंध तैयार है। पढ़कर हस्ताक्षर करें।`, claimed._id, agreementLink(agreement));
    return { ok: true, lease: claimed, agreement };
  } catch (err) {
    // could not make the agreement: give the land back so nothing is stuck
    await LandLease.updateOne(
      { _id: claimed._id, status: 'agreement_pending' },
      { $set: { status: 'active', currentTenantId: null, agreementId: null, 'offers.$[o].status': 'pending' } },
      { arrayFilters: [{ 'o._id': offer._id }] }
    );
    throw err;
  }
};

// ── reading it ───────────────────────────────────────────────────────────────────────────────────
const isExpired = (ag) => LIVE.includes(ag.status) && ag.expiresAt && new Date(ag.expiresAt) <= new Date();

const publicSignature = (sig, forAdmin) => ({
  signed: !!sig?.signed,
  lockedName: sig?.lockedName || null,
  signedAt: sig?.signedAt || null,
  platform: sig?.device?.platform || null,
  otpVerified: !!sig?.otpVerifiedAt,
  ...(forAdmin ? { ipAddress: sig?.ipAddress || null, userAgent: sig?.userAgent || null, device: sig?.device || null, consentText: sig?.consentText || null, otpVerifiedAt: sig?.otpVerifiedAt || null, contentHash: sig?.contentHash || null } : {})
});

/** The agreement as the app / admin screen needs it (never the signing codes). */
const view = (ag, role, { forAdmin = false } = {}) => {
  const doc = ag.toObject ? ag.toObject() : ag;
  const mySig = role ? doc.signatures?.[role] : null;
  const expired = isExpired(doc);
  const canSign = !!role && LIVE.includes(doc.status) && !expired && !mySig?.signed;
  const myName = role ? doc[role].name : null;
  return {
    id: doc._id,
    leaseId: doc.leaseId,
    referenceNo: doc.referenceNo,
    status: expired ? 'EXPIRED' : doc.status,
    type: doc.type,
    language: doc.language,
    landowner: { name: doc.landowner.name, mobile: doc.landowner.mobile },
    farmer: { name: doc.farmer.name, mobile: doc.farmer.mobile },
    terms: doc.termsSnapshot,
    html: render.toHtml(doc.renderedContent, doc.termsSnapshot, doc.language),
    contentHash: doc.contentHash,
    templateVersion: doc.templateVersion,
    signatures: { landowner: publicSignature(doc.signatures?.landowner, forAdmin), farmer: publicSignature(doc.signatures?.farmer, forAdmin) },
    myRole: role,
    mySigned: !!mySig?.signed,
    otherSigned: role ? !!doc.signatures?.[role === 'landowner' ? 'farmer' : 'landowner']?.signed : null,
    canSign,
    lockedName: myName,
    consentText: myName ? consentText(myName, doc.language) : null,
    expiresAt: doc.expiresAt,
    executedAt: doc.executedAt,
    effective: doc.effective || { startDate: null, endDate: null },
    cancelledAt: doc.cancelledAt,
    cancelledBy: doc.cancelledBy,
    cancelReason: doc.cancelReason,
    dispute: forAdmin ? doc.dispute : { flagged: !!doc.dispute?.flagged },
    createdAt: doc.createdAt,
    timeline: (doc.auditTrail || []).map(a => ({
      action: a.action, role: a.role, timestamp: a.timestamp, details: a.details,
      ...(forAdmin ? { ipAddress: a.ipAddress, performedBy: a.performedBy } : {})
    }))
  };
};

// ── signing: one-time code ───────────────────────────────────────────────────────────────────────
/** Sends a signing code to the party's registered mobile. */
const sendSigningOtp = async (ag, role, { ip = null } = {}) => {
  if (!LIVE.includes(ag.status) || isExpired(ag)) return fail(409, 'NOT_SIGNABLE', 'This agreement can no longer be signed.');
  if (ag.signatures[role].signed) return fail(409, 'ALREADY_SIGNED', 'You have already signed this agreement.');

  const slot = ag.otp?.[role] || {};
  if (slot.sentAt && Date.now() - new Date(slot.sentAt).getTime() < OTP_MIN_GAP_MS) {
    return fail(429, 'TOO_SOON', 'A code was just sent. Wait a few seconds before asking for another.');
  }
  if ((slot.sendCount || 0) >= OTP_MAX_SENDS) return fail(429, 'TOO_MANY', 'Too many codes were requested. Please try again later or contact support.');

  const user = await User.findById(ag[role].userId).select('phone');
  const phone = user?.phone;
  if (!phone) return fail(409, 'NO_PHONE', 'No registered mobile number found on your account.');

  const code = String(crypto.randomInt(100000, 1000000));
  const path = `otp.${role}`;
  const set = {
    [`${path}.hash`]: hashOtp(code),
    [`${path}.expiresAt`]: new Date(Date.now() + OTP_TTL_MS),
    [`${path}.attempts`]: 0,
    [`${path}.sentAt`]: new Date()
  };
  const updated = await LeaseAgreement.findOneAndUpdate(
    { _id: ag._id, status: { $in: LIVE }, [`signatures.${role}.signed`]: { $ne: true } },
    { $set: set, $inc: { [`${path}.sendCount`]: 1 }, $push: { auditTrail: audit('otp_sent', { by: ag[role].userId, role, ip }) } },
    { new: true }
  );
  if (!updated) return fail(409, 'NOT_SIGNABLE', 'This agreement can no longer be signed.');

  const sent = await sms.sendAgreementOtp(phone, code);
  if (sent && sent.success === false) {
    console.error('[leaseAgreement] signing OTP SMS failed:', sent.message || sent.error);
    return fail(502, 'SMS_FAILED', 'Could not send the code right now. Please try again in a moment.');
  }
  return { ok: true, sentTo: `${'•'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`, expiresInSeconds: OTP_TTL_MS / 1000 };
};

const devBypass = (code) => (process.env.USE_DEFAULT_OTP === 'true' || process.env.NODE_ENV === 'development') && String(code) === '123456';

/** True when `code` is the pending signing code of this party (an attempt is reserved first, so guesses are limited). */
const checkSigningOtp = async (ag, role, code) => {
  if (devBypass(code)) return { ok: true };
  const input = String(code ?? '').trim();
  if (!/^\d{6}$/.test(input)) return fail(400, 'BAD_OTP', 'Enter the 6-digit code.');
  const path = `otp.${role}`;
  const now = new Date();
  const reserved = await LeaseAgreement.findOneAndUpdate(
    { _id: ag._id, status: { $in: LIVE }, [`signatures.${role}.signed`]: { $ne: true }, [`${path}.attempts`]: { $lt: OTP_MAX_ATTEMPTS }, [`${path}.expiresAt`]: { $gt: now } },
    { $inc: { [`${path}.attempts`]: 1 } },
    { new: true }
  ).select(`+${path}.hash`);
  if (!reserved || !reserved.otp?.[role]?.hash) {
    const slot = ag.otp?.[role] || {};
    if ((slot.attempts || 0) >= OTP_MAX_ATTEMPTS) return fail(429, 'OTP_LOCKED', 'Too many wrong codes. Ask for a new code.');
    return fail(400, 'OTP_EXPIRED', 'The code has expired or was not sent. Ask for a new code.');
  }
  if (!otpMatches(input, reserved.otp[role].hash)) {
    const left = Math.max(0, OTP_MAX_ATTEMPTS - (reserved.otp[role].attempts || 0));
    return fail(400, 'OTP_WRONG', left > 0 ? `Wrong code. ${left} attempts left.` : 'Wrong code. Ask for a new code.');
  }
  return { ok: true };
};

// ── signing ──────────────────────────────────────────────────────────────────────────────────────
/**
 * Signs for one party: the registered name is locked (taken from the account, never typed), the code sent to their
 * mobile must be right, and the text they saw must be the text on record.
 */
const sign = async (ag, role, { otp, accepted, contentHash, device = {}, ip = null, userAgent = null }) => {
  if (!LIVE.includes(ag.status) || isExpired(ag)) return fail(409, 'NOT_SIGNABLE', 'This agreement can no longer be signed.');
  if (ag.signatures[role].signed) return fail(409, 'ALREADY_SIGNED', 'You have already signed this agreement.');
  if (accepted !== true) return fail(400, 'CONSENT_REQUIRED', 'Tick the box to confirm you have read and agree to the agreement.');
  if (!contentHash || contentHash !== ag.contentHash) {
    return fail(409, 'CONTENT_CHANGED', 'The agreement was changed. Open it again and read it before signing.');
  }

  // the name printed on the agreement must still be the account's name (it is what the signature certifies)
  const user = await User.findById(ag[role].userId).select('name');
  if (norm(user?.name) !== norm(ag[role].name)) {
    return fail(409, 'NAME_CHANGED', 'The name on your account no longer matches the name on this agreement. Ask the other party to cancel it so a new agreement can be made.');
  }

  const otpResult = await checkSigningOtp(ag, role, otp);
  if (!otpResult.ok) return otpResult;

  const now = new Date();
  const signature = {
    signed: true,
    lockedName: ag[role].name,
    signedAt: now,
    ipAddress: ip,
    userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
    device: {
      platform: device.platform ? String(device.platform).slice(0, 40) : null,
      model: device.model ? String(device.model).slice(0, 80) : null,
      appVersion: device.appVersion ? String(device.appVersion).slice(0, 40) : null
    },
    consentText: consentText(ag[role].name, ag.language),
    otpVerifiedAt: now,
    contentHash: ag.contentHash
  };
  const path = `otp.${role}`;
  const signed = await LeaseAgreement.findOneAndUpdate(
    { _id: ag._id, status: { $in: LIVE }, [`signatures.${role}.signed`]: { $ne: true } },
    {
      $set: { [`signatures.${role}`]: signature, [`${path}.hash`]: null, [`${path}.expiresAt`]: null },
      $push: { auditTrail: audit('signed', { by: ag[role].userId, role, details: `${ag[role].name} signed`, ip }) }
    },
    { new: true }
  );
  if (!signed) return fail(409, 'ALREADY_SIGNED', 'This agreement was just signed or changed. Refresh and check.');

  const both = signed.signatures.landowner.signed && signed.signatures.farmer.signed;
  if (!both) {
    await LeaseAgreement.updateOne({ _id: signed._id, status: 'DRAFT' }, { $set: { status: 'PARTIALLY_SIGNED' } });
    const other = role === 'landowner' ? 'farmer' : 'landowner';
    notifyLease(signed[other].userId, 'land_lease_agreement_signed', '✍️ दूसरे पक्ष ने हस्ताक्षर किए (Other party signed)',
      `${signed[role].name} ने अनुबंध पर हस्ताक्षर कर दिए हैं। अब आप पढ़कर हस्ताक्षर करें।`, signed.leaseId, agreementLink(signed));
    return { ok: true, agreement: await LeaseAgreement.findById(signed._id), executed: false };
  }

  // both signed: exactly one caller makes it FULLY_EXECUTED and starts the lease
  const executed = await LeaseAgreement.findOneAndUpdate(
    { _id: signed._id, status: { $in: LIVE } },
    { $set: { status: 'FULLY_EXECUTED', executedAt: new Date(), expiresAt: null }, $push: { auditTrail: audit('fully_executed', { role: 'system', details: 'Both parties signed' }) } },
    { new: true }
  );
  if (executed) await activateLease(executed);
  return { ok: true, agreement: await LeaseAgreement.findById(signed._id), executed: !!executed };
};

// ── lease start / end ────────────────────────────────────────────────────────────────────────────
/** Starts the lease of a fully signed agreement: rent schedule created, land `leased`, other offers declined. Safe to repeat. */
const activateLease = async (ag) => {
  const claimed = await LandLease.findOneAndUpdate(
    { _id: ag.leaseId, agreementId: ag._id, status: 'agreement_pending' },
    { $set: { status: 'leased', currentTenantId: ag.farmer.userId } },
    { new: false }
  );
  if (!claimed) return false; // already started (or the land was taken back)

  try {
    const lease = await LandLease.findById(ag.leaseId);
    const offer = lease.offers.id(ag.offerId);
    const settings = await getSettings();
    const { agreement, installments } = buildAgreement(lease, offer, settings?.landLeaseCommissionPercentage ?? 2);
    lease.agreement = agreement;
    lease.installments = installments;

    const declined = [];
    lease.offers.forEach(o => {
      if (String(o._id) !== String(offer._id) && o.status === 'pending') { o.status = 'rejected'; declined.push(o.farmerId); }
    });
    await lease.save();
    await LeaseAgreement.updateOne({ _id: ag._id }, {
      $set: { 'effective.startDate': agreement.startDate, 'effective.endDate': agreement.endDate },
      $push: { auditTrail: audit('lease_started', { role: 'system', details: `Lease period ${render.fmtDate(agreement.startDate)} to ${render.fmtDate(agreement.endDate)}` }) }
    });

    notifyLease(ag.farmer.userId, 'land_lease_agreement_executed', '✅ पट्टा शुरू (Lease started)',
      `"${lease.title}" का अनुबंध दोनों के हस्ताक्षर से पूरा हुआ। किस्तें "भुगतान" में देखें।`, lease._id);
    notifyLease(ag.landowner.userId, 'land_lease_agreement_executed', '✅ पट्टा शुरू (Lease started)',
      `"${lease.title}" का अनुबंध दोनों के हस्ताक्षर से पूरा हुआ।`, lease._id);
    declined.forEach(farmerId => notifyLease(farmerId, 'land_lease_offer_rejected', 'प्रस्ताव अस्वीकार (Offer declined)',
      `"${lease.title}" किसी और किसान को दे दी गई।`, lease._id));
    return true;
  } catch (err) {
    // the agreement is executed; the lease start is retried by the periodic reconcile
    console.error('[leaseAgreement] activating lease failed (will retry):', err);
    await LandLease.updateOne({ _id: ag.leaseId, status: 'leased', 'agreement.startDate': null }, { $set: { status: 'agreement_pending' } });
    return false;
  }
};

/** Gives the land back to the marketplace after an agreement that did not go through. */
const reopenLease = async (ag) => {
  await LandLease.updateOne(
    { _id: ag.leaseId, agreementId: ag._id, status: 'agreement_pending' },
    { $set: { status: 'active', currentTenantId: null, agreementId: null, 'offers.$[o].status': 'cancelled' } },
    { arrayFilters: [{ 'o._id': ag.offerId }] }
  );
};

/**
 * Cancels an agreement that is not fully signed yet. `by` is landowner | farmer | admin | system.
 */
const cancel = async (ag, { by, userId = null, reason = '', ip = null, status = 'CANCELLED' }) => {
  const updated = await LeaseAgreement.findOneAndUpdate(
    { _id: ag._id, status: { $in: LIVE } },
    {
      $set: { status, cancelledAt: new Date(), cancelledBy: by, cancelReason: String(reason || '').slice(0, 500), expiresAt: null },
      $push: { auditTrail: audit(status === 'EXPIRED' ? 'expired' : 'cancelled', { by: userId, role: by, details: reason || '', ip }) }
    },
    { new: true }
  );
  if (!updated) return fail(409, 'NOT_CANCELLABLE', 'This agreement is already signed by both parties or closed.');
  await reopenLease(updated);

  const title = (await LandLease.findById(updated.leaseId).select('title').lean())?.title || '';
  const type = status === 'EXPIRED' ? 'land_lease_agreement_expired' : 'land_lease_agreement_cancelled';
  const heading = status === 'EXPIRED' ? 'अनुबंध की समय सीमा समाप्त (Agreement expired)' : 'अनुबंध रद्द (Agreement cancelled)';
  const body = status === 'EXPIRED'
    ? `"${title}" के अनुबंध पर समय पर हस्ताक्षर नहीं हुए, इसलिए वह रद्द हो गया। भूमि फिर उपलब्ध है।`
    : `"${title}" का अनुबंध रद्द कर दिया गया। भूमि फिर उपलब्ध है।`;
  ROLES.forEach(r => { if (by === r && userId) return; notifyLease(updated[r].userId, type, heading, body, updated.leaseId); });
  return { ok: true, agreement: updated };
};

// ── periodic job ─────────────────────────────────────────────────────────────────────────────────
const REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;

/** Lapses unsigned agreements, reminds the people who still have to sign, and finishes any lease start that failed. */
const runPeriodic = async () => {
  const now = new Date();
  let expired = 0; let reminded = 0; let reconciled = 0;
  try {
    const stale = await LeaseAgreement.find({ status: { $in: LIVE }, expiresAt: { $lte: now } }).select('_id').lean();
    for (const { _id } of stale) {
      const ag = await LeaseAgreement.findById(_id);
      if (ag && (await cancel(ag, { by: 'system', reason: 'Not signed in time', status: 'EXPIRED' })).ok) expired++;
    }

    const soon = await LeaseAgreement.find({
      status: { $in: LIVE }, reminderSentAt: null,
      expiresAt: { $gt: now, $lte: new Date(now.getTime() + REMINDER_BEFORE_MS) }
    });
    for (const ag of soon) {
      const claimed = await LeaseAgreement.findOneAndUpdate({ _id: ag._id, reminderSentAt: null, status: { $in: LIVE } }, { $set: { reminderSentAt: now }, $push: { auditTrail: audit('reminder_sent', { role: 'system' }) } });
      if (!claimed) continue;
      ROLES.filter(r => !ag.signatures[r].signed).forEach(r =>
        notifyLease(ag[r].userId, 'land_lease_agreement_reminder', '⏰ अनुबंध पर हस्ताक्षर बाकी (Signature pending)', 'अनुबंध कल तक समाप्त हो जाएगा। कृपया हस्ताक्षर करें।', ag.leaseId, agreementLink(ag)));
      reminded++;
    }

    // an agreement both parties signed whose lease never started (the start failed once): start it now
    const waiting = await LandLease.find({ status: 'agreement_pending', agreementId: { $ne: null } }).select('agreementId').lean();
    for (const w of waiting) {
      const ag = await LeaseAgreement.findOne({ _id: w.agreementId, status: { $in: ['FULLY_EXECUTED', 'DISPUTED'] } });
      if (ag && await activateLease(ag)) reconciled++;
    }
  } catch (err) {
    console.error('[leaseAgreement] periodic job error:', err);
  }
  return { expired, reminded, reconciled };
};

// ── short-lived download link (the phone app's file download cannot send the login header) ──────
const LINK_TTL_MS = 10 * 60 * 1000;
const linkSecret = () => process.env.JWT_SECRET || process.env.OTP_HMAC_SECRET || 'agroyilt-dev-agreement-link';
const b64 = (s) => Buffer.from(s).toString('base64url');
const linkSig = (body) => crypto.createHmac('sha256', linkSecret()).update(body).digest('base64url');

/** A link token that lets the holder download this agreement's PDF for ten minutes, as this party. */
const makeDownloadToken = (agreementId, userId) => {
  const body = b64(JSON.stringify({ a: String(agreementId), u: String(userId), e: Date.now() + LINK_TTL_MS }));
  return `${body}.${linkSig(body)}`;
};

/** @returns {{ agreementId: string, userId: string } | null} */
const readDownloadToken = (token) => {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = Buffer.from(linkSig(body));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.e > Date.now() ? { agreementId: p.a, userId: p.u } : null;
  } catch (_) { return null; }
};

module.exports = {
  makeDownloadToken, readDownloadToken,
  agreementRequired, startAgreementForOffer, partyRole, view, sendSigningOtp, sign, cancel, activateLease, runPeriodic, consentText, isExpired, audit, TYPE_OF
};
