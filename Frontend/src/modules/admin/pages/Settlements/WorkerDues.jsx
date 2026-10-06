import React, { useEffect, useState } from 'react';
import { FiCheck, FiX, FiRefreshCw, FiPlus } from 'react-icons/fi';
import Modal from '../../components/Modal';
import adminSettlementService from '../../../../services/adminSettlementService';
import { toastManager } from '../../../../utils/toastManager';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Worker dues: payments workers say they made to the admin (approve / reject), workers who still owe money,
 * and recording a payment a worker made in person. Dues change only on approve / record.
 */
const WorkerDues = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [recording, setRecording] = useState(null);
  const [record, setRecord] = useState({ amount: '', mode: 'cash', reference: '' });

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminSettlementService.getWorkerDues();
      if (res.success) setData(res.data);
    } catch (err) {
      toastManager.error(err?.response?.data?.message || 'Failed to load worker dues');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      toastManager.success(res.message || okMsg);
      await load();
      return true;
    } catch (err) {
      toastManager.error(err?.response?.data?.message || 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const approve = (p) => {
    if (!window.confirm(`Confirm you received ${rupees(p.amount)} from ${p.workerId?.name || 'this worker'}?`)) return;
    run(() => adminSettlementService.approveWorkerDuesPayment(p._id), 'Approved');
  };
  const reject = async () => {
    if (!reason.trim()) return toastManager.error('Give a reason so the worker knows what went wrong');
    if (await run(() => adminSettlementService.rejectWorkerDuesPayment(rejecting._id, reason.trim()), 'Rejected')) {
      setRejecting(null); setReason('');
    }
  };
  const saveRecord = async () => {
    if (await run(() => adminSettlementService.recordWorkerDuesPayment(recording._id, {
      amount: Number(record.amount), mode: record.mode, reference: record.reference || undefined
    }), 'Recorded')) {
      setRecording(null); setRecord({ amount: '', mode: 'cash', reference: '' });
    }
  };

  const totals = data?.totals || {};
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Worker Dues</h1>
          <p className="text-sm text-gray-500">Platform fees, commission and penalties workers owe from cash jobs</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Refresh">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ['Total owed by workers', rupees(totals.totalDues)],
          ['Workers with dues', totals.workersWithDues || 0],
          ['Payments to confirm', totals.pendingReview || 0]
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold">{label}</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <h2 className="px-4 py-3 border-b font-bold text-gray-800">Payments to confirm</h2>
        {(data?.pending || []).length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No payments waiting.</p>
        ) : (
          <div className="divide-y">
            {data.pending.map(p => (
              <div key={p._id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">{p.workerId?.name || 'Worker'} · {p.workerId?.phone}</p>
                  <p className="text-sm text-gray-600">
                    {rupees(p.amount)} by {p.offlineMode === 'upi' ? 'UPI' : 'cash'}
                    {p.reference ? ` · Ref ${p.reference}` : ''} · sent {when(p.createdAt)}
                  </p>
                  {p.note && <p className="text-xs text-gray-500">“{p.note}”</p>}
                  <p className="text-xs text-gray-500">Currently owes {rupees(p.workerId?.outstandingDues)}</p>
                </div>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => approve(p)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center gap-1 disabled:opacity-60">
                    <FiCheck /> Received
                  </button>
                  <button disabled={busy} onClick={() => setRejecting(p)} className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-bold flex items-center gap-1 disabled:opacity-60">
                    <FiX /> Not received
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <h2 className="px-4 py-3 border-b font-bold text-gray-800">Workers who owe money</h2>
        {(data?.workers || []).length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No worker owes anything.</p>
        ) : (
          <div className="divide-y">
            {data.workers.map(w => (
              <div key={w._id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900">{w.name} · {w.phone}</p>
                  <p className="text-sm text-gray-600">
                    Owes <span className="font-bold text-red-600">{rupees(w.outstandingDues)}</span>
                    {w.isRestricted && <span className="ml-2 text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Blocked from new jobs</span>}
                  </p>
                </div>
                <button
                  disabled={busy}
                  onClick={() => { setRecording(w); setRecord({ amount: String(w.outstandingDues), mode: 'cash', reference: '' }); }}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold flex items-center gap-1"
                >
                  <FiPlus /> Record payment
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <h2 className="px-4 py-3 border-b font-bold text-gray-800">Recent decisions</h2>
        {(data?.recent || []).length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Nothing yet.</p>
        ) : (
          <div className="divide-y text-sm">
            {data.recent.map(p => (
              <div key={p._id} className="px-4 py-2.5 flex justify-between gap-3">
                <span className="text-gray-700">
                  {p.workerId?.name || 'Worker'} · {rupees(p.amount)} · {p.method === 'online' ? 'online' : (p.offlineMode || 'cash')}
                  {p.status === 'REJECTED' && p.adminNote ? ` · ${p.adminNote}` : ''}
                </span>
                <span className={`font-bold ${p.status === 'PAID' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {p.status === 'PAID' ? 'Paid' : 'Rejected'} · {when(p.paidAt || p.reviewedAt || p.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal isOpen={Boolean(rejecting)} onClose={() => setRejecting(null)} title="Payment not received">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">The worker will see this reason. Their dues stay unchanged.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full border rounded-lg p-2 text-sm" placeholder="e.g. No UPI payment with this reference" />
          <button disabled={busy} onClick={reject} className="w-full py-2.5 rounded-lg bg-red-600 text-white font-bold disabled:opacity-60">Reject payment</button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(recording)} onClose={() => setRecording(null)} title={`Record payment from ${recording?.name || 'worker'}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Use this when the worker paid you in person. Dues update immediately.</p>
          <input type="number" min="1" value={record.amount} onChange={(e) => setRecord(r => ({ ...r, amount: e.target.value }))} className="w-full border rounded-lg p-2" placeholder="Amount" />
          <div className="flex gap-2">
            {['cash', 'upi'].map(m => (
              <button key={m} onClick={() => setRecord(r => ({ ...r, mode: m }))} className={`flex-1 py-2 rounded-lg border font-bold text-sm ${record.mode === m ? 'bg-teal-600 text-white border-teal-600' : ''}`}>
                {m === 'cash' ? 'Cash' : 'UPI'}
              </button>
            ))}
          </div>
          <input value={record.reference} onChange={(e) => setRecord(r => ({ ...r, reference: e.target.value }))} className="w-full border rounded-lg p-2 text-sm" placeholder="Reference (optional)" />
          <button disabled={busy} onClick={saveRecord} className="w-full py-2.5 rounded-lg bg-teal-600 text-white font-bold disabled:opacity-60">Save payment</button>
        </div>
      </Modal>
    </div>
  );
};

export default WorkerDues;
