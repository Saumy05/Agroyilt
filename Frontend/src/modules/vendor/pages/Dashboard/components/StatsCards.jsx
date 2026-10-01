import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiBriefcase, FiCheckCircle, FiStar, FiArrowUpRight, FiAlertCircle } from 'react-icons/fi';
import { FaWallet } from 'react-icons/fa';
import { vendorTheme as themeColors } from '../../../../../theme';

const StatsCards = memo(({ stats }) => {
  const navigate = useNavigate();

  const operationalMetrics = [
    {
      title: 'Active Rentals',
      value: stats.activeJobs || 0,
      subtitle: `${stats.activeJobs || 0} on field`,
      icon: FiBriefcase,
      color: '#2E7D32', // Brand Green
      bgLight: 'bg-emerald-50',
      borderColor: 'border-emerald-100',
      onClick: () => navigate('/vendor/jobs')
    },
    {
      title: 'Orders Done',
      value: stats.completedJobs || 0,
      subtitle: 'Fulfilled orders',
      icon: FiCheckCircle,
      color: '#10B981', // Emerald
      bgLight: 'bg-emerald-50',
      borderColor: 'border-emerald-100',
      onClick: () => navigate('/vendor/jobs')
    },
    {
      title: 'Rating',
      value: stats.rating > 0 ? stats.rating.toFixed(1) : '5.0',
      subtitle: 'Customer reviews',
      icon: FiStar,
      color: '#F59E0B', // Amber
      bgLight: 'bg-amber-50',
      borderColor: 'border-amber-100',
      onClick: () => navigate('/vendor/my-ratings')
    },
    {
      title: 'Pending Alerts',
      value: stats.pendingAlerts || 0,
      subtitle: (stats.pendingAlerts || 0) > 0 ? 'Requires attention' : 'All clear',
      icon: (stats.pendingAlerts || 0) > 0 ? FiAlertCircle : FiClock,
      color: (stats.pendingAlerts || 0) > 0 ? '#EF4444' : '#64748B', // Slate / Red
      bgLight: (stats.pendingAlerts || 0) > 0 ? 'bg-rose-50' : 'bg-slate-50',
      borderColor: (stats.pendingAlerts || 0) > 0 ? 'border-rose-200' : 'border-slate-100',
      onClick: () => navigate('/vendor/booking-alerts')
    }
  ];

  return (
    <div className="px-4 py-1.5 space-y-2">
      {/* 1. Primary Revenue & Wallet Overview Card */}
      <div
        onClick={() => navigate('/vendor/wallet')}
        className="rounded-2xl p-3.5 cursor-pointer active:scale-[0.99] transition-all duration-200 relative overflow-hidden text-white shadow-xs hover:shadow-sm"
        style={{
          background: 'linear-gradient(135deg, #0f3822 0%, #1e5631 50%, #2e7d32 100%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        {/* Subtle decorative background circles */}
        <div
          className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
        />
        <div
          className="absolute right-12 -bottom-10 w-28 h-28 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #81c784 0%, transparent 70%)' }}
        />

        <div className="relative z-10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-emerald-100/85 tracking-wider uppercase">
              Today's Earnings
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black tracking-tight text-white">
                ₹{(stats.todayEarnings || 0).toLocaleString()}
              </span>
              <span className="text-[11px] font-medium text-emerald-200/80">
                • Total ₹{(stats.totalEarnings || 0).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {stats.pendingAlerts > 0 && (
              <span className="bg-rose-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                {stats.pendingAlerts} New
              </span>
            )}
            <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/25 shadow-inner">
              <FaWallet className="w-3.5 h-3.5 text-emerald-100" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Unified 2x2 Operations & Quality Metrics Grid */}
      <div className="grid grid-cols-2 gap-2">
        {operationalMetrics.map((item, index) => {
          const IconComp = item.icon;
          return (
            <div
              key={index}
              onClick={item.onClick}
              className={`bg-white rounded-xl p-2.5 border ${item.borderColor} shadow-xs active:scale-[0.98] transition-all cursor-pointer hover:shadow-sm`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-gray-500 block truncate">
                    {item.title}
                  </span>
                  <div className="text-xl font-black text-gray-900 tracking-tight leading-tight mt-0.5">
                    {item.value}
                  </div>
                  <div className="text-[10px] text-gray-400 font-medium truncate mt-0.5">
                    {item.subtitle}
                  </div>
                </div>

                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.bgLight} flex-shrink-0 mt-0.5`}
                >
                  <IconComp className="w-3.5 h-3.5" style={{ color: item.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

StatsCards.displayName = 'VendorStatsCards';

export default StatsCards;
