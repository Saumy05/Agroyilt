import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAppLocale } from '../../../../utils/languageUtils';
import { FiArrowLeft, FiCheck, FiCalendar, FiClock, FiCreditCard, FiInfo, FiShield, FiStar, FiZap, FiCheckCircle } from 'react-icons/fi';
import { getPlans } from '../../services/planService';
import { userAuthService } from '../../../../services/authService';
import { toastManager } from '../../../../utils/toastManager';
import LogoLoader from '../../../../components/common/LogoLoader';

const PlanDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [plansRes, userRes] = await Promise.all([
        getPlans(),
        userAuthService.getProfile()
      ]);

      if (plansRes.success) {
        const found = plansRes.data.find(p => p._id === id);
        if (found) {
          setPlan(found);
        } else {
          toastManager.error('Plan not found');
          navigate('/user/my-plan');
        }
      }
      if (userRes.success) setUser(userRes.user);

    } catch (error) {
      console.error(error);
      toastManager.error('Could not load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LogoLoader />;
  if (!plan) return null;

  const currentPlan = user?.plans;
  const isCurrent = currentPlan?.isActive && currentPlan?.name === plan.name;
  const isUpgrade = currentPlan?.isActive && plan.price > (currentPlan?.price || 0);
  const isDowngradeOrSame = currentPlan?.isActive && plan.price <= (currentPlan?.price || 0) && !isCurrent;

  // Formatting date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString(getAppLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Helper for card style icons/colors
  const getTheme = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('platinum')) return { color: 'text-slate-900', bg: 'bg-slate-900', light: 'bg-slate-50', gradient: 'from-slate-800 to-slate-900' };
    if (lower.includes('diamond')) return { color: 'text-indigo-600', bg: 'bg-indigo-600', light: 'bg-indigo-50', gradient: 'from-indigo-500 via-purple-500 to-pink-500' };
    if (lower.includes('gold')) return { color: 'text-amber-600', bg: 'bg-amber-600', light: 'bg-amber-50', gradient: 'from-amber-400 to-yellow-500' };
    if (lower.includes('silver')) return { color: 'text-gray-600', bg: 'bg-gray-600', light: 'bg-gray-50', gradient: 'from-gray-400 to-slate-500' };
    return { color: 'text-primary-600', bg: 'bg-primary-600', light: 'bg-primary-50', gradient: 'from-primary-500 to-primary-600' };
  };

  const theme = getTheme(plan.name);

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Dynamic Header Background */}
      <div className={`h-64 w-full bg-gradient-to-br ${theme.gradient} relative overflow-hidden`}>
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0 0 L100 0 L100 100 Z" fill="white" />
          </svg>
        </div>

        {/* Back Button */}
        <div className="absolute top-6 left-4 z-20">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-all"
          >
            <FiArrowLeft className="w-6 h-6" />
          </button>
        </div>

        {/* Plan Title in Header */}
        <div className="absolute bottom-10 left-6 text-white animate-slide-in-bottom">
          <div className="flex items-center gap-2 mb-2">
            <FiStar className="w-5 h-5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">Subscription Plan</span>
          </div>
          <h1 className="text-4xl font-black">{plan.name}</h1>
        </div>
      </div>

      <div className="px-6 -mt-8 relative z-10">
        {/* Main Info Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 mb-6">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-gray-500 text-sm font-medium mb-1">Total Pricing</p>
              <div className="flex items-baseline">
                <span className={`text-4xl font-black ${theme.color}`}>₹{plan.price}</span>
                <span className="text-gray-400 text-sm ml-1">/ month</span>
              </div>
            </div>
            {isCurrent && (
              <span className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 border border-emerald-100 shadow-sm animate-pulse-subtle">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                ACTIVE NOW
              </span>
            )}
          </div>

          <div className="space-y-6">
            <h3 className="font-bold text-gray-900 border-b border-gray-50 pb-3">Plan Benefits</h3>
            <ul className="grid grid-cols-1 gap-4">
              {(plan.highlights || plan.services || []).map((service, index) => (
                <li key={index} className="flex items-start gap-4 p-4 rounded-2xl bg-gray-50/50 hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                  <div className={`mt-1 p-1.5 rounded-lg ${theme.bg} text-white shadow-md`}>
                    <FiCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-gray-800 font-semibold">{service}</span>
                    <p className="text-gray-400 text-xs mt-0.5">Premium benefit included in your plan</p>
                  </div>
                </li>
              ))}
              {(!(plan.highlights || plan.services) || (plan.highlights || plan.services).length === 0) && (
                <p className="text-gray-400 text-sm italic py-4 text-center">Standard benefits are included with this plan.</p>
              )}
            </ul>

            {(() => {
              const planOrder = ['Silver', 'Gold', 'Platinum', 'Diamond'];
              const currentName = planOrder.find(p => plan.name?.toLowerCase().includes(p.toLowerCase()));
              const currentIndex = currentName ? planOrder.indexOf(currentName) : -1;
              const previousPlan = currentIndex > 0 ? planOrder[currentIndex - 1] : null;

              if (previousPlan) {
                // Determine border color based on theme
                const borderColor = theme.color.replace('text-', 'border-').replace('600', '200');
                // Fallback if needed, but 'text-indigo-600' -> 'border-indigo-200' is standard tailwind.
                // However, dynamic string construction is risky. 
                // Let's use a simpler known border.
                return (
                  <div className={`mt-6 p-4 rounded-2xl border border-dashed flex items-start gap-3 bg-gray-50 border-gray-300`}>
                    <div className={`mt-0.5 p-1.5 rounded-full ${theme.bg} text-white shadow-sm shrink-0`}>
                      <FiInfo size={14} />
                    </div>
                    <div>
                      <h4 className={`text-base font-black ${theme.color} mb-1 uppercase tracking-wide`}>
                        INCLUDES {previousPlan} BENEFITS
                      </h4>
                      <p className="text-xs text-gray-600 leading-relaxed font-medium">
                        This plan is comprehensive! It includes <span className="font-bold text-gray-900 border-b-2 border-gray-200">everything in the {previousPlan} Plan</span> plus the exclusive {plan.name} benefits listed above.
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Free Coverage Section */}
        {((plan.freeCategories && plan.freeCategories.length > 0) || (plan.freeBrands && plan.freeBrands.length > 0) || (plan.freeServices && plan.freeServices.length > 0)) && (
          <div className="bg-gradient-to-br from-primary-50 to-white rounded-3xl p-8 mb-6 border border-primary-100 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-primary-100 text-primary-600 rounded-xl">
                <FiZap className="w-5 h-5 fill-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 leading-none">Free Coverage</h3>
                <p className="text-xs text-primary-600 font-bold uppercase tracking-wider mt-1">Zero billing on these services</p>
              </div>
            </div>

            <div className="space-y-6">
              {plan.freeCategories && plan.freeCategories.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Complimentary Categories</p>
                  <div className="flex flex-wrap gap-2">
                    {plan.freeCategories.map((cat, idx) => (
                      <span key={idx} className="bg-white border border-primary-100 text-primary-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary-500 rounded-full"></div>
                        {cat.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {plan.freeBrands && plan.freeBrands.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Complimentary Brands</p>
                  <div className="flex flex-wrap gap-2">
                    {plan.freeBrands.map((brand, idx) => (
                      <span key={idx} className="bg-white border border-indigo-100 text-indigo-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                        {brand.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {plan.freeServices && plan.freeServices.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Free Specific Services</p>
                  <div className="flex flex-wrap gap-2">
                    {plan.freeServices.map((svc, idx) => (
                      <span key={idx} className="bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md flex items-center gap-2">
                        <FiCheck className="w-3.5 h-3.5" />
                        {svc.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 p-4 bg-white/50 rounded-2xl border border-dashed border-primary-200">
              <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                * Services within the categories listed above are fully covered. For specific free services, only the mentioned service is complimentary.
              </p>
            </div>
          </div>
        )}

        {/* Status Card (Only if Current Plan) */}
        {isCurrent && (
          <div className="bg-slate-900 rounded-3xl p-8 mb-6 text-white shadow-2xl relative overflow-hidden group">
            {/* Background pattern */}
            <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <FiZap className="w-48 h-48" />
            </div>

            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <FiShield className="text-emerald-400" />
              Active Subscription Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                  <FiCalendar className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-0.5">Expires On</p>
                  <p className="text-lg font-black">{formatDate(currentPlan.expiry)}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                  <FiCreditCard className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-0.5">Amount Paid</p>
                  <p className="text-lg font-black">₹{currentPlan.price}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                  <FiClock className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-0.5">Renewal</p>
                  <p className="text-lg font-black italic">Auto-renew OFF</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                  <FiInfo className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-0.5">Status</p>
                  <p className="text-lg font-black text-emerald-400 uppercase tracking-widest">Active Member</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="fixed bottom-6 left-0 right-0 px-6 backdrop-blur-sm bg-white/30 py-4 border-t border-gray-100 sm:relative sm:border-0 sm:p-0 sm:bg-transparent sm:bottom-0">
          {!isCurrent && !isDowngradeOrSame ? (
            <button
              onClick={() => {
                navigate('/user/checkout', {
                  state: {
                    plan: {
                      id: plan._id,
                      name: plan.name,
                      price: plan.price,
                      description: plan.description || `${plan.duration || 'Monthly'} Plan`
                    },
                    isUpgrade
                  }
                });
              }}
              className={`w-full py-5 rounded-2xl font-black text-white shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2 group transform hover:-translate-y-1 ${theme.bg}`}
              style={{ boxShadow: `0 20px 25px -5px ${theme.bg}4D` }}
            >
              <FiZap className="fill-white group-hover:scale-125 transition-transform" />
              {isUpgrade ? 'Upgrade My Membership' : 'Subscribe Now'}
            </button>
          ) : isCurrent ? (
            <div className="bg-emerald-50 text-emerald-700 p-5 rounded-2xl border border-emerald-100 flex items-center justify-center gap-3 font-bold shadow-inner">
              <FiCheckCircle className="w-6 h-6" />
              You are currently enjoying this plan
            </div>
          ) : (
            <div className="bg-gray-100 text-gray-500 p-5 rounded-2xl border border-gray-200 flex items-center justify-center gap-3 font-bold italic">
              <FiInfo />
              Select a higher plan to upgrade
            </div>
          )}
        </div>

        {/* Extra Info */}
        <div className="mt-12 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-orange-50/50 rounded-2xl border border-orange-100 select-none">
            <FiShield className="text-orange-500 w-5 h-5 mt-0.5" />
            <p className="text-xs text-orange-800 leading-relaxed font-medium">
              Payment is 100% secure. You can cancel your subscription at any time from your settings. Benefits are applied instantly after payment completion.
            </p>
          </div>
          <p className="text-center text-gray-300 text-[10px] uppercase font-bold tracking-widest pb-10">
            Groo Subscription ? Secure & Trusted
          </p>
        </div>
      </div>
    </div>
  );
};

export default PlanDetails;
