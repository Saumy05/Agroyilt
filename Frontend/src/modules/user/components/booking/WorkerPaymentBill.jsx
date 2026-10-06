import React from 'react';
import { FiCheckCircle } from 'react-icons/fi';
import { rupees, paymentLineLabel } from '../../../../utils/workerPayment';

/**
 * Farmer's view of what a worker booking costs, line by line, rendered straight from the backend's
 * paymentSummary.bill. On cash bookings the totals are the sum of what each worker is told to collect,
 * so the farmer and the workers always see the same amount.
 */
const WorkerPaymentBill = ({ bill }) => {
  if (!bill || !Array.isArray(bill.lines) || bill.lines.length === 0) return null;
  const isCash = bill.paymentMethod === 'cash';
  const unit = bill.bookingType === 'DAILY' ? 'day' : 'hr';
  const allPaid = isCash ? bill.cashDue === 0 && bill.cashPaid > 0 : bill.lines.every(l => l.status === 'paid');
  const refund = bill.refund;

  return (
    <div className="space-y-3 text-sm">
      {bill.lines.map((line, i) => (
        <div key={i} className="flex justify-between gap-3">
          <div className="min-w-0">
            <span className="font-bold text-slate-800 block">{paymentLineLabel(line)}</span>
            <span className="text-[11px] text-slate-500 block">
              {line.workerCount} worker{line.workerCount === 1 ? '' : 's'}
              {line.rate ? ` × ${rupees(line.rate)}/${unit}` : ''}
              {' · '}workers {rupees(line.workerAmount)} + platform fee {rupees(line.platformFee)}
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="font-black text-slate-900 block">{rupees(line.total)}</span>
            <span className={`text-[10px] font-bold ${line.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
              {line.status === 'paid'
                ? (line.payment === 'cash' ? 'Paid in cash' : 'Paid online')
                : (line.payment === 'cash' ? 'Pay in cash' : 'Not paid')}
            </span>
          </div>
        </div>
      ))}

      <div className="border-t border-dashed border-slate-200" />

      {isCash ? (
        <div className={`p-3 rounded-2xl border ${allPaid ? 'bg-emerald-50/80 border-emerald-300' : 'bg-amber-50/60 border-amber-200'}`}>
          <div className="flex justify-between items-center">
            <div>
              <span className={`font-black text-sm block ${allPaid ? 'text-emerald-900' : 'text-amber-900'}`}>
                {allPaid ? 'Paid in cash' : 'Pay in cash when work is done'}
              </span>
              <span className={`text-[10px] font-medium ${allPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                Hand this to the worker{bill.workers.length === 1 ? '' : 's'} directly
              </span>
            </div>
            <span className={`text-xl font-black ${allPaid ? 'text-emerald-800' : 'text-amber-700'}`}>
              {rupees(allPaid ? bill.cashPaid : bill.cashDue)}
            </span>
          </div>
          {bill.workers.length > 1 && (
            <div className="mt-2 pt-2 border-t border-amber-200/70 space-y-1 text-xs">
              {bill.workers.map(w => (
                <div key={String(w.assignmentId)} className="flex justify-between text-slate-700">
                  <span>{w.status === 'paid' ? 'Paid' : 'Pay'} {w.workerName || 'worker'}</span>
                  <span className="font-bold flex items-center gap-1">
                    {w.status === 'paid' && <FiCheckCircle className="text-emerald-600" size={12} />}
                    {rupees(w.cashToPay)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center p-3 rounded-2xl border bg-teal-50/60 border-teal-100">
            <div>
              <span className="font-black text-sm block text-teal-900">{allPaid ? 'Total paid online' : 'Total'}</span>
              <span className="text-[10px] font-medium text-teal-700">
                Booked work is reserved at your maximum rate
              </span>
            </div>
            <span className="text-xl font-black text-teal-700">{rupees(allPaid ? bill.paidOnline : bill.total)}</span>
          </div>
          {refund && (
            <div className="flex justify-between items-center px-1 text-xs">
              <div>
                <span className="font-bold text-emerald-900 block">Refund of unused amount</span>
                <span className="text-[10px] text-emerald-700">
                  {refund.status === 'REFUNDED'
                    ? 'Credited to your AgroYilt wallet'
                    : 'Whatever the workers did not use comes back to your wallet after the work'}
                </span>
              </div>
              <span className="font-black text-emerald-700">
                {refund.amount !== null && refund.amount !== undefined ? rupees(refund.amount) : 'After work'}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WorkerPaymentBill;
