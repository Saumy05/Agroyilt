import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiBell, FiAlertTriangle, FiXCircle, FiDownload, FiCheckCircle, FiClock, FiShield, FiFileText } from 'react-icons/fi';
import adminAgreementService from '../../services/adminAgreementService';
import { toastManager } from '../../../../utils/toastManager';
import { StatusBadge } from './index';
import { AGREEMENT_DOC_CSS } from './agreementStyles';

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-');

const ACTION_LABEL = {
  created: 'Agreement made', otp_sent: 'Signing code sent', signed: 'Signed', fully_executed: 'Both signed: agreement executed',
  cancelled: 'Cancelled', expired: 'Expired unsigned', reminder_sent: 'Automatic reminder', admin_reminder: 'Reminder from admin',
  dispute_flagged: 'Marked as disputed', dispute_resolved: 'Dispute closed'
};

const PartyCard = ({ title, person, sig }) => (
  <div className={`rounded-2xl border p-4 ${sig.signed ? 'border-emerald-200 bg-emerald-50/60' : 'border-dashed border-gray-300 bg-gray-50'}`}>
    <p className="text-[11px] font-black uppercase tracking-wide text-gray-500">{title}</p>
    <p className="font-extrabold text-gray-900">{person.name}</p>
    <p className="text-xs text-gray-500">{person.mobile}</p>
    {sig.signed ? (
      <dl className="mt-3 space-y-1 text-xs text-gray-700">
        <div className="flex items-center gap-1.5 font-bold text-emerald-700"><FiCheckCircle /> Signed · {fmtDateTime(sig.signedAt)}</div>
        <div>Name locked as: <b>{sig.lockedName}</b></div>
        <div>OTP verified: <b>{sig.otpVerified ? 'Yes' : 'No'}</b>{sig.otpVerifiedAt ? ` (${fmtDateTime(sig.otpVerifiedAt)})` : ''}</div>
        <div>IP address: <b>{sig.ipAddress || '-'}</b></div>
        <div>Device: <b>{[sig.device?.platform, sig.device?.model, sig.device?.appVersion].filter(Boolean).join(' · ') || '-'}</b></div>
        <div className="break-all text-[10px] text-gray-500">Signed text hash: {sig.contentHash}</div>
        <div className="text-[11px] italic text-gray-600">“{sig.consentText}”</div>
      </dl>
    ) : (
      <p className="mt-3 text-xs font-semibold text-gray-500 flex items-center gap-1.5"><FiClock /> Not signed yet</p>
    )}
  </div>
);

const AgreementDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ag, setAg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminAgreementService.get(id);
      if (res?.success) setAg(res.data);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not load the agreement');
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, okMsg) => {
    try {
      setBusy(true);
      const res = await fn();
      if (res?.success) { toastManager.success(res.message || okMsg); await load(); }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  const remind = () => run(() => adminAgreementService.remind(id));
  const flag = () => {
    const notes = window.prompt('Case notes for this dispute:');
    if (notes === null) return;
    run(() => adminAgreementService.flagDispute(id, notes));
  };
  const resolve = () => {
    const notes = window.prompt('How was it resolved? (optional)');
    if (notes === null) return;
    run(() => adminAgreementService.resolveDispute(id, notes));
  };
  const cancel = () => {
    const reason = window.prompt('Reason for cancelling this agreement:');
    if (reason === null) return;
    run(() => adminAgreementService.cancel(id, reason));
  };

  const downloadPdf = async () => {
    try {
      const blob = await adminAgreementService.pdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${ag.referenceNo}-certified.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toastManager.error('Could not make the PDF');
    }
  };

  // the evidence record (Section 65B data) saved as a file
  const downloadEvidence = async () => {
    try {
      const res = await adminAgreementService.audit(id);
      if (!res?.success) return;
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${ag.referenceNo}-evidence-record.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not build the evidence record');
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>;
  if (!ag) return <div className="p-10 text-center text-gray-500">Agreement not found.</div>;

  const live = ['DRAFT', 'PARTIALLY_SIGNED'].includes(ag.status);
  return (
    <div className="space-y-5">
      <style>{AGREEMENT_DOC_CSS}</style>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/admin/agreements')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"><FiArrowLeft /></button>
        <div>
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2"><FiFileText /> {ag.referenceNo} <StatusBadge value={ag.status} /></h2>
          <p className="text-xs text-gray-500">Template v{ag.templateVersion} · {ag.language === 'hi' ? 'Hindi' : 'English'} · made {fmtDateTime(ag.createdAt)}{ag.lease ? ` · land "${ag.lease.title}" is ${ag.lease.status.replace('_', ' ')}` : ''}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {live && <button disabled={busy} onClick={remind} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-bold flex items-center gap-1.5 hover:bg-gray-50"><FiBell /> Send reminder</button>}
          <button onClick={downloadPdf} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-bold flex items-center gap-1.5 hover:bg-gray-50"><FiFileText /> Certified PDF</button>
          <button onClick={downloadEvidence} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-bold flex items-center gap-1.5 hover:bg-gray-50"><FiDownload /> Evidence record</button>
          {ag.status === 'DISPUTED'
            ? <button disabled={busy} onClick={resolve} className="px-3 py-2 rounded-xl bg-purple-700 text-white text-sm font-bold flex items-center gap-1.5"><FiShield /> Close dispute</button>
            : ['DRAFT', 'PARTIALLY_SIGNED', 'FULLY_EXECUTED'].includes(ag.status) && <button disabled={busy} onClick={flag} className="px-3 py-2 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 text-sm font-bold flex items-center gap-1.5"><FiAlertTriangle /> Flag dispute</button>}
          {live && <button disabled={busy} onClick={cancel} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm font-bold flex items-center gap-1.5"><FiXCircle /> Cancel</button>}
        </div>
      </div>

      {ag.dispute?.flagged && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900">
          <b>Disputed</b> · {fmtDateTime(ag.dispute.flaggedAt)}<p className="mt-1 whitespace-pre-wrap">{ag.dispute.notes}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <PartyCard title="Landowner" person={ag.landowner} sig={ag.signatures.landowner} />
        <PartyCard title="Farmer / Tenant" person={ag.farmer} sig={ag.signatures.farmer} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-[11px] font-bold uppercase text-gray-500 mb-3">Agreement text (read only)</p>
          <div className="agr-doc" dangerouslySetInnerHTML={{ __html: ag.html }} />
          <p className="mt-4 break-all text-[10px] text-gray-400">Content hash: {ag.contentHash}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 h-fit">
          <p className="text-[11px] font-bold uppercase text-gray-500 mb-3">Timeline</p>
          <ol className="relative border-l border-gray-200 ml-2 space-y-4">
            {ag.timeline.map((t, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <p className="text-sm font-bold text-gray-900">{ACTION_LABEL[t.action] || t.action}</p>
                <p className="text-[11px] text-gray-500">{fmtDateTime(t.timestamp)}{t.role ? ` · ${t.role}` : ''}{t.ipAddress ? ` · ${t.ipAddress}` : ''}</p>
                {t.details && <p className="text-xs text-gray-600 mt-0.5">{t.details}</p>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};

export default AgreementDetail;
