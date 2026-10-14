import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiFileText, FiShield } from 'react-icons/fi';
import API from '../../services/api';
import LogoLoader from '../../components/common/LogoLoader';

// Dedicated public pages: /terms/:role and /privacy/:role (role = farmer | vendor | worker).
// The text is managed by the Super Admin (Settings > Policies), so it is never hardcoded here.
const ROLES = [
  { slug: 'farmer', apiRole: 'user', label: 'Farmer' },
  { slug: 'vendor', apiRole: 'vendor', label: 'Vendor' },
  { slug: 'worker', apiRole: 'worker', label: 'Worker' }
];
const DOCS = {
  terms: { title: 'Terms & Conditions', path: '/terms', icon: FiFileText, other: 'privacy' },
  privacy: { title: 'Privacy Policy', path: '/privacy', icon: FiShield, other: 'terms' }
};

const LegalPage = ({ doc }) => {
  const navigate = useNavigate();
  const { role: roleParam } = useParams();
  const meta = DOCS[doc];
  const Icon = meta.icon;
  const otherMeta = DOCS[meta.other];

  const slug = roleParam === 'user' ? 'farmer' : roleParam;
  const role = ROLES.find(r => r.slug === slug) || ROLES[0];

  const [content, setContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = `${meta.title} | AgroYilt`;
    return () => { document.title = previous; };
  }, [meta.title]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    API.get(`/content/policy/${role.apiRole}/${doc}`)
      .then(res => {
        if (cancelled) return;
        setContent(res.data?.data?.content || '');
        setUpdatedAt(res.data?.data?.updatedAt || null);
      })
      .catch(() => { if (!cancelled) { setContent(''); setUpdatedAt(null); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [role.apiRole, doc]);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

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
          <h1 className="text-lg font-black text-slate-900">{meta.title}</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {ROLES.map(r => (
            <Link
              key={r.slug}
              to={`${meta.path}/${r.slug}`}
              replace
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
                r.slug === role.slug
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-7 min-h-[240px]">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              {meta.title} <span className="text-slate-400 font-bold">· {role.label}s</span>
            </h2>
          </div>
          {updatedAt && !loading && (
            <p className="text-[11px] text-slate-400 font-medium mb-4 pl-12">
              Last updated {new Date(updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          <div className={updatedAt && !loading ? '' : 'mt-4'}>
            {loading ? (
              <div className="py-10"><LogoLoader fullScreen={false} /></div>
            ) : content.trim() ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 break-words">{content}</div>
            ) : (
              <div className="py-10 flex flex-col items-center text-center text-slate-400">
                <FiFileText className="w-10 h-10 mb-3" />
                <p className="text-sm font-semibold">
                  {failed ? 'Could not load this document. Please try again.' : 'This document is not available right now.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <Link
          to={`${otherMeta.path}/${role.slug}`}
          className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 hover:bg-slate-50 transition-colors"
        >
          <span className="text-sm font-bold text-slate-700">Also read: {otherMeta.title}</span>
          <span className="text-emerald-700 text-sm font-bold">View →</span>
        </Link>
      </div>
    </div>
  );
};

export const TermsPage = () => <LegalPage doc="terms" />;
export const PrivacyPage = () => <LegalPage doc="privacy" />;

export default LegalPage;
