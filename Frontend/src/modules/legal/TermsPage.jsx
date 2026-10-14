import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FiArrowLeft, FiFileText } from 'react-icons/fi';
import API from '../../services/api';
import LogoLoader from '../../components/common/LogoLoader';

// Public page: Terms & Privacy for every role. The text is managed by admin (Website Settings > Policies).
const ROLES = [
  { slug: 'farmer', apiRole: 'user', label: 'Farmer' },
  { slug: 'vendor', apiRole: 'vendor', label: 'Vendor' },
  { slug: 'worker', apiRole: 'worker', label: 'Worker' }
];
const DOCS = [
  { type: 'terms', label: 'Terms & Conditions' },
  { type: 'privacy', label: 'Privacy Policy' }
];

const TermsPage = () => {
  const navigate = useNavigate();
  const { role: roleParam } = useParams();
  const [searchParams] = useSearchParams();

  const slug = roleParam === 'user' ? 'farmer' : roleParam;
  const role = ROLES.find(r => r.slug === slug) || ROLES[0];
  const docType = searchParams.get('doc') === 'privacy' ? 'privacy' : 'terms';

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    API.get(`/content/policy/${role.apiRole}/${docType}`)
      .then(res => { if (!cancelled) setContent(res.data?.data?.content || ''); })
      .catch(() => { if (!cancelled) { setContent(''); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [role.apiRole, docType]);

  const go = (nextSlug, nextDoc) => {
    navigate(`/terms/${nextSlug}${nextDoc === 'privacy' ? '?doc=privacy' : ''}`, { replace: true });
  };
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  const pill = (active) =>
    `px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
      active ? 'bg-emerald-700 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
    }`;

  const docLabel = DOCS.find(d => d.type === docType).label;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="p-2 -ml-2 rounded-full text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Back"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-black text-slate-900">Terms & Policies</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {ROLES.map(r => (
            <button key={r.slug} type="button" onClick={() => go(r.slug, docType)} className={pill(r.slug === role.slug)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {DOCS.map(d => (
            <button key={d.type} type="button" onClick={() => go(role.slug, d.type)} className={pill(d.type === docType)}>
              {d.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-7 min-h-[240px]">
          <h2 className="text-base sm:text-lg font-black text-slate-900 mb-4">
            {docLabel} <span className="text-slate-400 font-bold">· {role.label}s</span>
          </h2>
          {loading ? (
            <div className="py-10"><LogoLoader fullScreen={false} /></div>
          ) : content.trim() ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 break-words">{content}</div>
          ) : (
            <div className="py-10 flex flex-col items-center text-center text-slate-400">
              <FiFileText className="w-10 h-10 mb-3" />
              <p className="text-sm font-semibold">
                {failed ? 'Could not load this document. Please try again.' : 'This document has not been published yet.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
