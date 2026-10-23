const LeaseAgreement = require('../../models/LeaseAgreement');
const svc = require('../../services/leaseAgreementService');

const MONGO_ID = /^[0-9a-fA-F]{24}$/;
const userIdOf = (req) => req.user?.id || req.user?._id;

/** Loads an agreement for one of its two parties (anyone else gets "not found", so ids cannot be probed). */
const loadForParty = async (req, res) => {
  const { id } = req.params;
  if (!MONGO_ID.test(String(id))) { res.status(404).json({ success: false, message: 'Agreement not found' }); return null; }
  const agreement = await LeaseAgreement.findById(id);
  const role = agreement ? svc.partyRole(agreement, userIdOf(req)) : null;
  if (!agreement || !role) { res.status(404).json({ success: false, message: 'Agreement not found' }); return null; }
  return { agreement, role };
};

const send = (res, result, okBody) => {
  if (result.ok) return res.status(200).json({ success: true, ...okBody(result) });
  return res.status(result.status || 400).json({ success: false, code: result.code, message: result.message });
};

const farmerAgreementController = {
  // My agreements (as the landowner or as the tenant farmer)
  getAgreements: async (req, res) => {
    try {
      const uid = userIdOf(req);
      const list = await LeaseAgreement.find({ $or: [{ 'landowner.userId': uid }, { 'farmer.userId': uid }] })
        .sort({ createdAt: -1 }).limit(100);
      const data = list.map(ag => {
        const role = svc.partyRole(ag, uid);
        const v = svc.view(ag, role);
        return {
          id: v.id, leaseId: v.leaseId, referenceNo: v.referenceNo, status: v.status, type: v.type, myRole: role,
          mySigned: v.mySigned, otherSigned: v.otherSigned, canSign: v.canSign, expiresAt: v.expiresAt, executedAt: v.executedAt,
          landowner: v.landowner.name, farmer: v.farmer.name,
          khasraNumber: v.terms.khasraNumber, village: v.terms.village, landAreaAcres: v.terms.landAreaAcres, createdAt: v.createdAt
        };
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Error fetching agreements:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // One agreement: the text, both parties' signature status, and what this user can do
  getAgreement: async (req, res) => {
    try {
      const found = await loadForParty(req, res);
      if (!found) return;
      res.status(200).json({ success: true, data: await svc.present(found.agreement, found.role) });
    } catch (error) {
      console.error('Error fetching agreement:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Send the signing code to the caller's registered mobile
  sendSigningOtp: async (req, res) => {
    try {
      const found = await loadForParty(req, res);
      if (!found) return;
      const result = await svc.sendSigningOtp(found.agreement, found.role, { ip: req.ip });
      send(res, result, (r) => ({ message: `A code was sent to ${r.sentTo}`, data: { sentTo: r.sentTo, expiresInSeconds: r.expiresInSeconds } }));
    } catch (error) {
      console.error('Error sending agreement OTP:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Sign: registered name (locked), the code, and the agreement text the caller saw
  signAgreement: async (req, res) => {
    try {
      const found = await loadForParty(req, res);
      if (!found) return;
      const { otp, accepted, contentHash, device } = req.body || {};
      const result = await svc.sign(found.agreement, found.role, {
        otp, accepted, contentHash, device: device && typeof device === 'object' ? device : {},
        ip: req.ip, userAgent: req.headers['user-agent']
      });
      if (result.ok) result.view = await svc.present(result.agreement, found.role);
      send(res, result, (r) => ({
        message: r.executed ? 'Agreement fully signed. The lease has started.' : 'You have signed. Waiting for the other party.',
        data: { executed: r.executed, agreement: r.view }
      }));
    } catch (error) {
      console.error('Error signing agreement:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // A ten-minute link to the PDF: the app's native file download cannot send the login header, so the link carries a signed token
  getPdfLink: async (req, res) => {
    try {
      const found = await loadForParty(req, res);
      if (!found) return;
      const token = svc.makeDownloadToken(found.agreement._id, userIdOf(req));
      const url = `${req.protocol}://${req.get('host')}/api/agreement-files/${found.agreement._id}.pdf?t=${encodeURIComponent(token)}`;
      res.status(200).json({ success: true, data: { url, fileName: `${found.agreement.referenceNo}.pdf`, expiresInSeconds: 600 } });
    } catch (error) {
      console.error('Error making agreement PDF link:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Either party can cancel until both have signed; the land opens again
  cancelAgreement: async (req, res) => {
    try {
      const found = await loadForParty(req, res);
      if (!found) return;
      const result = await svc.cancel(found.agreement, { by: found.role, userId: userIdOf(req), reason: req.body?.reason, ip: req.ip });
      send(res, result, (r) => ({ message: 'Agreement cancelled. The land is open for offers again.', data: svc.view(r.agreement, found.role) }));
    } catch (error) {
      console.error('Error cancelling agreement:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
};

module.exports = farmerAgreementController;
