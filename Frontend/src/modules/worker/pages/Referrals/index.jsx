import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toastManager } from '../../../../utils/toastManager';
import {
  FiCopy,
  FiArrowLeft,
  FiGift,
  FiShare2,
  FiCheckCircle,
  FiClock,
  FiUsers,
  FiAward
} from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import referralService from '../../../../services/referralService';
import LogoLoader from '../../../../components/common/LogoLoader';
import useReferralEnabled from '../../../../hooks/useReferralEnabled';

const WorkerReferrals = () => {
  const navigate = useNavigate();
  const { enabled: referralOn, loaded: referralLoaded } = useReferralEnabled('worker');

  // Page is unreachable while the admin has referrals off
  useEffect(() => {
    if (referralLoaded && !referralOn) navigate('/worker/profile', { replace: true });
  }, [referralLoaded, referralOn]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    referralCode: '...',
    registerLink: '',
    totalReferred: 0,
    totalQualified: 0,
    pendingQualifications: 0,
    totalEarnedRupees: 0,
    rates: { farmer: 0, vendor: 0, worker: 0 },
    systemEnabled: true,
    history: []
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await referralService.getMyReferralStats();
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load referral stats:', err);
      toastManager.error('Could not load referral data');
    } finally {
      setLoading(false);
    }
  };

  const registerLink = data.registerLink || 'https://agroyilt.com/app/register';

  const handleCopy = (textToCopy, label = 'Referral Code') => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true);
        toastManager.success(`${label} copied to clipboard!`);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => fallbackCopy(textToCopy, label));
    } else {
      fallbackCopy(textToCopy, label);
    }
  };

  const fallbackCopy = (text, label) => {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      toastManager.success(`${label} copied to clipboard!`);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      toastManager.error('Copy failed. Please copy manually.');
    }
    document.body.removeChild(el);
  };

  const handleShareWhatsApp = () => {
    const text = `Join AgroYilt - India's Smart Agri Services & Equipment Platform! 🌾🚜\n\nUse my Referral Code: *${data.referralCode}*\n\nRegister directly here:\n${registerLink}\n\n(Enter this referral code during registration to get started!)`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join AgroYilt as Worker/Farmer',
          text: `Use my Referral Code: ${data.referralCode} when registering on AgroYilt!\nRegister here: ${registerLink}`,
        });
      } catch (e) {
        // User cancelled
      }
    } else {
      handleCopy(registerLink, 'Registration Link');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LogoLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Header */}
      <div className="bg-white sticky top-0 z-40 border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/worker/profile')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FiArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-2">
            <FiGift className="w-5 h-5 text-orange-600" />
            <h1 className="text-lg font-bold text-gray-900">Worker Refer & Earn</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Banner Hero Card */}
        <div className="relative overflow-hidden rounded-3xl p-6 text-white bg-gradient-to-br from-orange-600 via-amber-600 to-orange-700 shadow-xl shadow-orange-900/10">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 backdrop-blur-md mb-3 text-orange-100 uppercase tracking-wider">
              <FiAward className="w-3.5 h-3.5" /> Worker Community
            </span>
            <h2 className="text-2xl sm:text-3xl font-black mb-2">
              Invite Co-Workers & Farmers
            </h2>
            <p className="text-xs sm:text-sm text-orange-100/90 leading-relaxed mb-5 max-w-md">
              Refer fellow agricultural workers, team leaders, or farmers and earn cash rewards directly in your AgroYilt wallet upon account verification!
            </p>

            {/* Referral Code Box */}
            <div className="bg-white/10 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-white/20 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] text-orange-200 uppercase font-bold tracking-wider">Your Referral Code</p>
                <p className="text-xl sm:text-2xl font-black tracking-widest text-white font-mono mt-0.5">
                  {data.referralCode}
                </p>
              </div>
              <button
                onClick={() => handleCopy(data.referralCode, 'Referral Code')}
                className="px-4 py-2.5 bg-white text-orange-800 hover:bg-orange-50 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                {copied ? <FiCheckCircle className="w-4 h-4 text-orange-600" /> : <FiCopy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        </div>

        {/* Share Action Buttons */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-around gap-2">
          <button
            onClick={handleShareWhatsApp}
            className="flex-1 flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-emerald-50 transition-colors"
          >
            <div className="w-12 h-12 bg-[#25D366] text-white rounded-2xl flex items-center justify-center shadow-md shadow-[#25D366]/30">
              <FaWhatsapp className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-gray-700">WhatsApp</span>
          </button>

          <button
            onClick={() => handleCopy(registerLink, 'Registration Link')}
            className="flex-1 flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <div className="w-12 h-12 bg-slate-800 text-white rounded-2xl flex items-center justify-center shadow-md shadow-slate-800/20">
              <FiCopy className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-gray-700">Register Link</span>
          </button>

          <button
            onClick={handleNativeShare}
            className="flex-1 flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-orange-50 transition-colors"
          >
            <div className="w-12 h-12 bg-orange-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-orange-600/30">
              <FiShare2 className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-gray-700">More</span>
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Total Earned</p>
            <p className="text-2xl font-black text-orange-600 mt-1">₹{data.totalEarnedRupees}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Qualified</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{data.totalQualified}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-black text-amber-500 mt-1">{data.pendingQualifications}</p>
          </div>
        </div>

        {/* Role Reward Rates */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3 flex items-center gap-2">
            <FiAward className="text-orange-600" /> Reward Per Role Qualified
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl flex items-center justify-between sm:flex-col sm:items-start">
              <div>
                <span className="text-xs font-semibold text-emerald-900 block">🌾 Farmer</span>
                <span className="text-[10px] text-emerald-700">On farmer approval</span>
              </div>
              <span className="text-lg font-black text-emerald-700 sm:mt-2">₹{data.rates?.farmer ?? 0}</span>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between sm:flex-col sm:items-start">
              <div>
                <span className="text-xs font-semibold text-blue-900 block">🚛 Vendor</span>
                <span className="text-[10px] text-blue-700">On vendor approval</span>
              </div>
              <span className="text-lg font-black text-blue-700 sm:mt-2">₹{data.rates?.vendor ?? 0}</span>
            </div>

            <div className="p-3 bg-orange-50/70 border border-orange-100 rounded-xl flex items-center justify-between sm:flex-col sm:items-start">
              <div>
                <span className="text-xs font-semibold text-orange-900 block">🛠️ Independent Worker</span>
                <span className="text-[10px] text-orange-700">On worker approval</span>
              </div>
              <span className="text-lg font-black text-orange-700 sm:mt-2">₹{data.rates?.worker ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Referral History */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3 flex items-center justify-between">
            <span>Referral History</span>
            <span className="text-xs font-normal text-gray-500">
              {data.history?.length || 0} Invites
            </span>
          </h3>

          {!data.history || data.history.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                <FiUsers className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-gray-700">No referrals yet</p>
              <p className="text-xs text-gray-500 mt-1">Start sharing your referral link with other workers and farmers!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.history.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-gray-800">{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                        {item.role}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    {item.status === 'qualified' || item.rewardStatus === 'rewarded' ? (
                      <div>
                        <span className="text-xs font-black text-emerald-600">+₹{item.rewardAmount}</span>
                        <p className="text-[10px] font-semibold text-emerald-700 flex items-center justify-end gap-1">
                          <FiCheckCircle className="w-3 h-3" /> Credited
                        </p>
                      </div>
                    ) : item.status === 'reversed' ? (
                      <div>
                        <span className="text-xs font-bold text-rose-500">Reversed</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-xs font-bold text-amber-600">Pending</span>
                        <p className="text-[10px] text-gray-400 flex items-center justify-end gap-1">
                          <FiClock className="w-3 h-3" /> Approval
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkerReferrals;
