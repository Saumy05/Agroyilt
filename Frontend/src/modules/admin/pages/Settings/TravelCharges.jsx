import React, { useEffect, useState } from 'react';
import { FiSave, FiNavigation } from 'react-icons/fi';
import { getSettings, updateSettings } from '../../services/settingsService';
import { toastManager } from '../../../../utils/toastManager';
import LogoLoader from '../../../../components/common/LogoLoader';

// Admin: what a farmer pays a vendor / worker for travelling to the farm. Saved as settings.travelCharge.{worker,vendor}.
const EMPTY_RULE = { enabled: false, freeKm: 3, outboundPerKm: 2, returnEnabled: false, returnFreeKm: 3, returnPerKm: 1, maxCharge: 0 };
const ROLES = [
  { key: 'worker', title: 'Workers & Team Leaders', hint: 'Labour bookings: the worker travels from where they are to the farmer\'s location.' },
  { key: 'vendor', title: 'Vendors (Machinery)', hint: 'Machinery bookings: the vendor travels from their location to the farmer\'s location.' }
];

const toNum = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));

const previewAmount = (rule, km) => {
  const r = (n) => Math.round(n * 100) / 100;
  if (!rule.enabled) return null;
  const out = r(Math.max(0, km - (Number(rule.freeKm) || 0)) * (Number(rule.outboundPerKm) || 0));
  const back = rule.returnEnabled ? r(Math.max(0, km - (Number(rule.returnFreeKm) || 0)) * (Number(rule.returnPerKm) || 0)) : 0;
  let total = r(out + back);
  const cap = Number(rule.maxCharge) || 0;
  if (cap > 0 && total > cap) total = cap;
  return { out, back, total };
};

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</p>}
  </div>
);

const inputCls = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-500 transition-all font-bold text-gray-800 disabled:opacity-50';

const TravelCharges = () => {
  const [rules, setRules] = useState({ worker: EMPTY_RULE, vendor: EMPTY_RULE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sampleKm, setSampleKm] = useState(25);

  useEffect(() => {
    (async () => {
      try {
        const res = await getSettings();
        const tc = res?.settings?.travelCharge || {};
        setRules({
          worker: { ...EMPTY_RULE, ...(tc.worker || {}) },
          vendor: { ...EMPTY_RULE, ...(tc.vendor || {}) }
        });
      } catch (e) {
        toastManager.error('Failed to load travel charge settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setField = (role, name, value) => setRules(prev => ({ ...prev, [role]: { ...prev[role], [name]: value } }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clean = (r) => ({
        enabled: !!r.enabled,
        freeKm: Number(r.freeKm) || 0,
        outboundPerKm: Number(r.outboundPerKm) || 0,
        returnEnabled: !!r.returnEnabled,
        returnFreeKm: Number(r.returnFreeKm) || 0,
        returnPerKm: Number(r.returnPerKm) || 0,
        maxCharge: Number(r.maxCharge) || 0
      });
      await updateSettings({ travelCharge: { worker: clean(rules.worker), vendor: clean(rules.vendor) } });
      toastManager.success('Travel charge settings saved');
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Failed to save travel charge settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LogoLoader />;

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-5xl">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-50 rounded-lg"><FiNavigation className="w-5 h-5 text-blue-600" /></div>
          <h2 className="text-lg font-bold text-gray-800">Travel Charges</h2>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          What the farmer pays for the vendor or worker to travel to the farm. Distance is the road distance between the
          farmer's booking location and the vendor / worker's location when they accept. The whole amount goes to the
          vendor / worker (no platform commission), and is released only after arrival is confirmed with the visit OTP.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-500 uppercase">Preview for a trip of</label>
          <input type="number" min="0" value={sampleKm} onChange={(e) => setSampleKm(Number(e.target.value) || 0)}
            className="w-24 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-800 outline-none" />
          <span className="text-xs font-semibold text-gray-500">km</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ROLES.map(({ key, title, hint }) => {
          const r = rules[key];
          const prev = previewAmount(r, sampleKm);
          return (
            <div key={key} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">{title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" className="sr-only peer" checked={!!r.enabled} onChange={(e) => setField(key, 'enabled', e.target.checked)} />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                </label>
              </div>

              <div className={`grid grid-cols-2 gap-4 ${r.enabled ? '' : 'opacity-60'}`}>
                <Field label="Free distance (km)" hint="No charge up to here.">
                  <input type="number" min="0" step="0.5" disabled={!r.enabled} value={r.freeKm} onChange={(e) => setField(key, 'freeKm', toNum(e.target.value))} className={inputCls} />
                </Field>
                <Field label="Rate per km (₹)" hint="For every km after the free distance.">
                  <input type="number" min="0" step="0.5" disabled={!r.enabled} value={r.outboundPerKm} onChange={(e) => setField(key, 'outboundPerKm', toNum(e.target.value))} className={inputCls} />
                </Field>
              </div>

              <div className={`border-t pt-4 space-y-4 ${r.enabled ? '' : 'opacity-60'}`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" disabled={!r.enabled} checked={!!r.returnEnabled} onChange={(e) => setField(key, 'returnEnabled', e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-sm font-bold text-gray-700">Also charge the return trip</span>
                </label>
                <div className={`grid grid-cols-2 gap-4 ${r.returnEnabled ? '' : 'opacity-50'}`}>
                  <Field label="Return free distance (km)">
                    <input type="number" min="0" step="0.5" disabled={!r.enabled || !r.returnEnabled} value={r.returnFreeKm} onChange={(e) => setField(key, 'returnFreeKm', toNum(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Return rate per km (₹)" hint="Set any rate: higher, lower or the same.">
                    <input type="number" min="0" step="0.5" disabled={!r.enabled || !r.returnEnabled} value={r.returnPerKm} onChange={(e) => setField(key, 'returnPerKm', toNum(e.target.value))} className={inputCls} />
                  </Field>
                </div>
              </div>

              <div className={`border-t pt-4 ${r.enabled ? '' : 'opacity-60'}`}>
                <Field label="Maximum travel charge (₹)" hint="Safety cap on the total. 0 = no cap.">
                  <input type="number" min="0" step="1" disabled={!r.enabled} value={r.maxCharge} onChange={(e) => setField(key, 'maxCharge', toNum(e.target.value))} className={inputCls} />
                </Field>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-800">
                {prev ? (
                  <>
                    <span className="font-bold">{sampleKm} km:</span> outbound ₹{prev.out}
                    {r.returnEnabled ? <> + return ₹{prev.back}</> : null} = <span className="font-black">₹{prev.total}</span>
                    {Number(r.maxCharge) > 0 && prev.total === Number(r.maxCharge) ? ' (capped)' : ''}
                  </>
                ) : (
                  <span className="font-semibold">Travel charge is off for this group.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50">
          {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-4 h-4" />}
          Save Travel Charges
        </button>
      </div>
    </form>
  );
};

export default TravelCharges;
