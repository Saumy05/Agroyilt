import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiLock, FiCheckCircle, FiClock, FiShield, FiSend, FiAlertTriangle, FiXCircle, FiDownload } from 'react-icons/fi';
import leaseAgreementService from '../../services/leaseAgreementService';
import { toastManager } from '../../../../utils/toastManager';
import flutterBridge from '../../../../utils/flutterBridge';
import BoundarySketch from '../../components/common/BoundarySketch';

const STATUS = {
  DRAFT: { label: 'Waiting for signatures', hi: 'हस्ताक्षर बाकी', cls: 'bg-amber-100 text-amber-800' },
  PARTIALLY_SIGNED: { label: 'One signature done', hi: 'एक हस्ताक्षर हुआ', cls: 'bg-amber-100 text-amber-800' },
  FULLY_EXECUTED: { label: 'Signed by both', hi: 'दोनों ने हस्ताक्षर किए', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Cancelled', hi: 'रद्द', cls: 'bg-red-100 text-red-700' },
  EXPIRED: { label: 'Expired', hi: 'समय समाप्त', cls: 'bg-slate-200 text-slate-700' },
  DISPUTED: { label: 'Under review', hi: 'विवाद की जाँच', cls: 'bg-purple-100 text-purple-800' }
};

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Certificate block of one party: signed (with stamp) or still waiting. */
const SignatureBlock = ({ title, titleHi, person, sig, isMe }) => (
  <div className={`rounded-2xl border p-4 ${sig.signed ? 'border-emerald-300 bg-emerald-50/60' : 'border-dashed border-slate-300 bg-slate-50'}`}>
    <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{title} <span className="normal-case">· {titleHi}</span>{isMe && <span className="ml-1.5 text-emerald-700">(You)</span>}</p>
    <p className="mt-1 text-base font-extrabold text-slate-900 break-words">{person.name}</p>
    {sig.signed ? (
      <div className="mt-2 space-y-1 text-xs text-emerald-900">
        <p className="flex items-center gap-1.5 font-bold"><FiCheckCircle className="shrink-0" /> Digitally signed · Verified</p>
        <p>{fmtDateTime(sig.signedAt)}</p>
        <p className="text-[11px] text-emerald-800/80">Registered name locked · OTP verified{sig.platform ? ` · ${sig.platform}` : ''}</p>
      </div>
    ) : (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><FiClock className="shrink-0" /> Signature pending · हस्ताक्षर बाकी</p>
    )}
  </div>
);

const LeaseAgreementPage = () => {
  const { agreementId } = useParams();
  const navigate = useNavigate();
  const [ag, setAg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [readToEnd, setReadToEnd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [otpSentTo, setOtpSentTo] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [signing, setSigning] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const endRef = useRef(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const res = await leaseAgreementService.get(agreementId);
      if (res?.success) { setAg(res.data); setError(''); }
    } catch (err) {
      if (!quiet) setError(err.response?.data?.message || 'Could not open this agreement');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [agreementId]);

  useEffect(() => { load(); }, [load]);

  // coming back from the wallet screen: the balance may have changed
  useEffect(() => {
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // while it is still open, pick up the other party's signature
  useEffect(() => {
    if (!ag || !['DRAFT', 'PARTIALLY_SIGNED'].includes(ag.status)) return undefined;
    const t = setInterval(() => load(true), 20000);
    return () => clearInterval(t);
  }, [ag, load]);

  // signing is only offered once the reader has reached the end of the document
  useEffect(() => {
    if (!ag?.canSign || !endRef.current) return undefined;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setReadToEnd(true); }, { threshold: 0.6 });
    obs.observe(endRef.current);
    return () => obs.disconnect();
  }, [ag?.canSign, ag?.html]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendOtp = async () => {
    try {
      setSending(true);
      const res = await leaseAgreementService.sendOtp(agreementId);
      if (res?.success) {
        setOtpSentTo(res.data?.sentTo || '');
        setResendIn(30);
        toastManager.success(res.message || 'Code sent');
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not send the code');
    } finally {
      setSending(false);
    }
  };

  const sign = async () => {
    try {
      setSigning(true);
      const res = await leaseAgreementService.sign(agreementId, {
        otp,
        accepted,
        contentHash: ag.contentHash,
        device: {
          platform: flutterBridge.isFlutter ? 'AgroYilt app' : 'web',
          model: String(navigator.platform || '').slice(0, 60),
          appVersion: import.meta.env.VITE_APP_VERSION || null
        }
      });
      if (res?.success) {
        toastManager.success(res.message);
        setOtp(''); setOtpSentTo(''); setAccepted(false);
        setAg(res.data.agreement);
      }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not sign');
    } finally {
      setSigning(false);
    }
  };

  const downloadPdf = async () => {
    let link = null;
    try {
      const res = await leaseAgreementService.pdfLink(agreementId);
      if (!res?.success) {
        toastManager.error(res?.message || 'Could not download the PDF');
        return;
      }
      link = res.data;
      const result = await flutterBridge.downloadFile(link.url, link.fileName);
      // The app answers { success: false } when it could not save the file; only say "downloading" when it did not refuse
      if (result && result.success === false) throw new Error(result.error || 'The app could not save the file');
      toastManager.success('Downloading the PDF…');
    } catch (err) {
      if (!link) {
        toastManager.error(err.response?.data?.message || 'Could not download the PDF');
        return;
      }
      // Last resort: open the (ten-minute) link, so the phone's browser can download it
      console.warn('[Agreement] PDF download failed, opening the link:', err?.message);
      toastManager.error('Could not save the PDF directly. Opening it instead…');
      window.open(link.url, '_blank');
    }
  };

  const cancel = async () => {
    const reason = window.prompt('Why are you cancelling? (optional)\nरद्द करने का कारण (वैकल्पिक)');
    if (reason === null) return;
    try {
      const res = await leaseAgreementService.cancel(agreementId, reason);
      if (res?.success) { toastManager.success(res.message); setAg(res.data); }
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not cancel');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-9 h-9 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;
  }
  if (error || !ag) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center gap-3">
        <FiAlertTriangle className="w-9 h-9 text-amber-500" />
        <p className="font-bold text-slate-800">{error || 'Agreement not found'}</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">Go back</button>
      </div>
    );
  }

  const st = STATUS[ag.status] || STATUS.DRAFT;
  const t = ag.terms || {};
  const live = ['DRAFT', 'PARTIALLY_SIGNED'].includes(ag.status);
  const fixed = ag.type === 'FIXED_RENT';
  const otpReady = /^\d{6}$/.test(otp);

  return (
    <div className="min-h-screen bg-slate-100 pb-28">
      <style>{`
        .agr-doc { font-size: 16px; line-height: 1.7; color: #0f172a; word-break: break-word; }
        .agr-doc h1 { font-size: 1.25rem; font-weight: 800; text-align: center; margin: 0 0 1rem; }
        .agr-doc h2 { font-size: 1.05rem; font-weight: 800; margin: 1.4rem 0 .4rem; padding-bottom: .2rem; border-bottom: 1px solid #e2e8f0; }
        .agr-doc h3 { font-size: 1rem; font-weight: 700; margin: 1rem 0 .3rem; }
        .agr-doc p { margin: .45rem 0; }
        .agr-doc ol, .agr-doc ul { margin: .5rem 0 .5rem 1.2rem; padding: 0; }
        .agr-doc ol { list-style: decimal; } .agr-doc ul { list-style: disc; }
        .agr-doc li { margin: .35rem 0; }
        .agr-doc hr { margin: 1rem 0; border-color: #e2e8f0; }
        .agr-doc .agr-table { width: 100%; border-collapse: collapse; font-size: .85rem; margin: .6rem 0; }
        .agr-doc .agr-table th, .agr-doc .agr-table td { border: 1px solid #cbd5e1; padding: .35rem .5rem; text-align: left; }
        .agr-doc .agr-table th { background: #f1f5f9; }
        .agr-doc .agr-note { font-size: .85rem; color: #334155; }
        .agr-doc .agr-map { display: flex; justify-content: center; margin: .8rem 0; }
        .agr-doc .agr-sketch { max-width: 100%; height: auto; }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 shadow-xs">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 active:scale-95" aria-label="Back">
            <FiArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-black text-slate-900 truncate">Lease Agreement · पट्टा अनुबंध</h1>
            <p className="text-[11px] font-semibold text-slate-500 truncate">{ag.referenceNo}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${st.cls}`}>{st.label}<span className="block text-[9px] font-semibold">{st.hi}</span></span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3.5 pt-3.5 space-y-3.5">
        {/* Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-black ${fixed ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
              {fixed ? 'Fixed Rent · किराया' : 'Batai · बटाई'}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">Khasra {t.khasraNumber} · {t.village}{t.district ? `, ${t.district}` : ''}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-center">
            <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] font-bold uppercase text-slate-400">Land · भूमि</p><p className="font-black text-slate-900">{t.landAreaAcres} acres</p></div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-[10px] font-bold uppercase text-slate-400">Duration · अवधि</p>
              <p className="font-black text-slate-900">{t.durationMonths} months</p>
              <p className="text-[10px] font-semibold text-slate-500">{ag.effective?.startDate ? `${fmtDate(ag.effective.startDate)} – ${fmtDate(ag.effective.endDate)}` : 'starts when both sign'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5 col-span-2">
              <p className="text-[10px] font-bold uppercase text-slate-400">{fixed ? 'Rent · किराया' : "Owner's share · मालिक का हिस्सा"}</p>
              <p className="font-black text-slate-900">{fixed ? `${inr(t.pricePerAcrePerYear)} /acre/year · Total ${inr(t.totalRent)}` : `${t.sharePercentage}% of the crop`}</p>
            </div>
          </div>
          {!(t.boundaryPoints?.length >= 3) && t.pin && (
            <p className="mt-3 text-xs font-semibold text-slate-600 flex flex-wrap items-center gap-x-2">
              📍 Land location: {Number(t.pin.lat).toFixed(5)}, {Number(t.pin.lng).toFixed(5)}
              <a href={`https://www.google.com/maps?q=${t.pin.lat},${t.pin.lng}`} target="_blank" rel="noreferrer" className="underline font-black text-emerald-800">Open in Maps</a>
            </p>
          )}
          {t.boundaryPoints?.length >= 3 && (
            <div className="mt-3 flex items-center gap-3">
              <BoundarySketch points={t.boundaryPoints} size={110} />
              <p className="text-xs font-semibold text-slate-600">{t.boundaryPoints.length} border corners marked on the map{t.boundaryAreaAcres ? ` · ${t.boundaryAreaAcres} acres` : ''}</p>
            </div>
          )}
        </div>

        {/* Advance payment: installment 1 is charged from the farmer's wallet the moment both have signed */}
        {ag.advance?.required && live && (
          <div className={`rounded-2xl border p-3.5 text-sm ${ag.advance.short && ag.myRole === 'farmer' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-800'}`}>
            <p className="font-black">Payment at the start · शुरुआत में भुगतान</p>
            <p className="mt-0.5 text-[13px]">
              {inr(ag.advance.amount)} (the first payment of the rent) is taken from the farmer's wallet as soon as both have signed. If it is not paid within 3 days of the lease starting, the owner can end the lease.
            </p>
            {ag.myRole === 'farmer' && (
              <p className="mt-1.5 text-[13px] font-bold flex flex-wrap items-center gap-x-2">
                Your wallet: {inr(Math.round(ag.advance.balance))}
                {ag.advance.short
                  ? <> · add {inr(Math.ceil(ag.advance.amount - ag.advance.balance))} to sign <button onClick={() => navigate('/user/wallet')} className="underline font-black">Add money</button></>
                  : ' · enough'}
              </p>
            )}
          </div>
        )}

        {/* State banners */}
        {ag.status === 'FULLY_EXECUTED' && (
          <div className="rounded-2xl bg-emerald-600 text-white p-4 flex items-start gap-3">
            <FiShield className="w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <p className="font-black">Agreement signed by both parties</p>
              <p className="text-sm text-emerald-50">दोनों पक्षों ने हस्ताक्षर कर दिए हैं। {ag.executedAt ? fmtDateTime(ag.executedAt) : ''}</p>
              {ag.effective?.startDate && ag.effective?.endDate && (
                <p className="mt-1 text-sm font-bold">Lease period · पट्टा अवधि: {fmtDate(ag.effective.startDate)} – {fmtDate(ag.effective.endDate)}</p>
              )}
              <button onClick={() => navigate('/user/land-lease?tab=my-leases&sub=listings')} className="mt-2 px-3 py-1.5 rounded-lg bg-white/20 text-xs font-bold">Go to my leases</button>
            </div>
          </div>
        )}
        {['CANCELLED', 'EXPIRED'].includes(ag.status) && (
          <div className="rounded-2xl bg-slate-800 text-white p-4 flex items-start gap-3">
            <FiXCircle className="w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <p className="font-black">{ag.status === 'EXPIRED' ? 'This agreement expired unsigned' : 'This agreement was cancelled'}</p>
              <p className="text-sm text-slate-300">{ag.cancelReason || 'The land is open for offers again.'}</p>
            </div>
          </div>
        )}
        {live && ag.mySigned && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-sm font-semibold text-amber-900">
            You have signed. Waiting for the other party to sign · दूसरे पक्ष के हस्ताक्षर का इंतज़ार है।
          </div>
        )}
        {live && ag.expiresAt && (
          <p className="text-[11px] text-center font-semibold text-slate-500">Sign before {fmtDateTime(ag.expiresAt)}, or the agreement lapses and the land opens again.</p>
        )}

        <button onClick={downloadPdf} className="w-full py-3 rounded-xl bg-white border border-slate-300 text-slate-800 text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.99]">
          <FiDownload /> {ag.status === 'FULLY_EXECUTED' ? 'Download signed PDF · PDF डाउनलोड करें' : 'Download PDF copy · PDF कॉपी'}
        </button>

        {/* The agreement */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-6">
          <div className="agr-doc" dangerouslySetInnerHTML={{ __html: ag.html }} />

          {/* Both signatures on the same document */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SignatureBlock title="Landowner" titleHi="भूमि स्वामी" person={ag.landowner} sig={ag.signatures.landowner} isMe={ag.myRole === 'landowner'} />
            <SignatureBlock title="Farmer / Tenant" titleHi="पट्टाधारक" person={ag.farmer} sig={ag.signatures.farmer} isMe={ag.myRole === 'farmer'} />
          </div>
          <div ref={endRef} className="h-2" />
        </div>

        {/* Signing */}
        {ag.canSign && (
          <div className="bg-white rounded-2xl border-2 border-emerald-500 p-4 space-y-3.5 shadow-sm">
            <p className="font-black text-slate-900">Sign this agreement · अनुबंध पर हस्ताक्षर करें</p>
            {ag.myRole === 'farmer' && ag.advance?.short && (
              <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                Signing needs ₹{Math.ceil(ag.advance.amount - ag.advance.balance)} more in your wallet. Add money, then come back and sign.
              </p>
            )}
            {!readToEnd && (
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                Scroll through the whole agreement above to enable signing. · पूरा अनुबंध पढ़ने के बाद ही हस्ताक्षर होंगे।
              </p>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Your registered name · आपका पंजीकृत नाम</label>
              <div className="relative">
                <input value={ag.lockedName || ''} disabled readOnly className="w-full px-3.5 py-3 pr-24 rounded-xl bg-slate-100 border border-slate-200 font-extrabold text-slate-900" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-black text-emerald-700"><FiLock size={12} /> Verified</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">This name comes from your account and cannot be changed here.</p>
            </div>

            <label className={`flex items-start gap-3 p-3 rounded-xl border ${accepted ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'} ${readToEnd ? 'cursor-pointer' : 'opacity-50'}`}>
              <input type="checkbox" disabled={!readToEnd} checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="w-5 h-5 mt-0.5 accent-emerald-600 shrink-0" />
              <span className="text-sm font-semibold text-slate-800 leading-snug">{ag.consentText}</span>
            </label>

            {!otpSentTo ? (
              <button
                onClick={sendOtp}
                disabled={!readToEnd || !accepted || sending || (ag.myRole === 'farmer' && ag.advance?.short)}
                className="w-full py-3.5 rounded-xl bg-emerald-700 text-white font-black flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]"
              >
                <FiSend /> {sending ? 'Sending…' : 'Send OTP to my mobile · OTP भेजें'}
              </button>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-slate-600">Enter the 6-digit code sent to {otpSentTo}</p>
                <input
                  inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="w-full text-center tracking-[0.5em] text-2xl font-black px-3 py-3 rounded-xl border-2 border-slate-300 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  onClick={sign}
                  disabled={!otpReady || !accepted || signing}
                  className="w-full py-3.5 rounded-xl bg-emerald-700 text-white font-black flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]"
                >
                  <FiCheckCircle /> {signing ? 'Signing…' : 'Affix Digital Signature & Confirm · हस्ताक्षर करें'}
                </button>
                <button onClick={sendOtp} disabled={resendIn > 0 || sending} className="w-full text-xs font-bold text-emerald-800 disabled:text-slate-400">
                  {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
                </button>
              </div>
            )}
          </div>
        )}

        {live && ag.myRole && (
          <button onClick={cancel} className="w-full py-2.5 text-xs font-bold text-red-600">Cancel this agreement · अनुबंध रद्द करें</button>
        )}
      </div>
    </div>
  );
};

export default LeaseAgreementPage;
