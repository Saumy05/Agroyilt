import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiDollarSign,
  FiCheckCircle,
  FiClock,
  FiCalendar,
  FiFileText,
  FiAward,
  FiPrinter,
  FiAlertCircle,
  FiDownload,
  FiChevronDown,
  FiChevronUp
} from 'react-icons/fi';
import { getMyPayrollHistory } from '../../services/adminPayrollService';
import { toastManager } from '../../../../utils/toastManager';

export default function MySalaryPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await getMyPayrollHistory();
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      toastManager.error('Failed to load salary history');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPayslip = (payroll) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const lastPayment = payroll.payments?.filter(p => p.status === 'SUCCESS').slice(-1)[0];

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>AgroYilt Payslip - ${payroll.payrollMonth}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; }
          .header { border-bottom: 2px solid #0284c7; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-end; }
          .logo { font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
          .logo span { color: #0284c7; }
          .title { font-size: 14px; font-weight: bold; color: #64748b; text-transform: uppercase; }
          .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 30px; background: #f8fafc; padding: 18px; border-radius: 8px; }
          .meta-item { font-size: 13px; }
          .meta-item strong { display: block; color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 3px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #475569; }
          td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .total-row td { font-weight: bold; font-size: 15px; background: #f8fafc; border-top: 2px solid #cbd5e1; }
          .status-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
          .paid { background: #dcfce7; color: #166534; }
          .pending { background: #dbeafe; color: #1e40af; }
          .footer { margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">Agro<span>Yilt</span></div>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">AgroYilt Technologies Private Limited</p>
          </div>
          <div style="text-align: right;">
            <div class="title">Official Salary Statement</div>
            <div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${payroll.payrollMonth}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><strong>Employee / Administrator:</strong> ${payroll.adminName}</div>
          <div class="meta-item"><strong>Territory / Scope:</strong> ${payroll.adminTerritory}</div>
          <div class="meta-item"><strong>Email:</strong> ${payroll.adminEmail}</div>
          <div class="meta-item"><strong>Payment Status:</strong> <span class="status-badge ${payroll.status === 'PAID' ? 'paid' : 'pending'}">${payroll.status}</span></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Earnings Description</th>
              <th>Rate / Metric</th>
              <th style="text-align: right;">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Monthly Base Salary</td>
              <td>Fixed Monthly Base</td>
              <td style="text-align: right;">₹${(payroll.baseSalary || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Farmer Registration Incentives</td>
              <td>${payroll.farmerCount || 0} registered</td>
              <td style="text-align: right;">+₹${(payroll.farmerIncentives || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Vendor Incentives</td>
              <td>${payroll.vendorCount || 0} registered</td>
              <td style="text-align: right;">+₹${(payroll.vendorIncentives || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Worker Registration Incentives</td>
              <td>${payroll.workerCount || 0} registered</td>
              <td style="text-align: right;">+₹${(payroll.workerIncentives || 0).toLocaleString()}</td>
            </tr>
            ${payroll.bonus > 0 ? `
            <tr>
              <td>Approved Bonuses & Adjustments</td>
              <td>Allowance</td>
              <td style="text-align: right;">+₹${payroll.bonus.toLocaleString()}</td>
            </tr>` : ''}
            ${payroll.deductions > 0 ? `
            <tr>
              <td>Approved Deductions</td>
              <td>Deduction</td>
              <td style="text-align: right; color: #dc2626;">-₹${payroll.deductions.toLocaleString()}</td>
            </tr>` : ''}
            <tr class="total-row">
              <td colspan="2">Net Payable Salary</td>
              <td style="text-align: right; color: #0369a1;">₹${(payroll.netPayable || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td colspan="2">Total Paid Amount</td>
              <td style="text-align: right; font-weight: bold; color: #166534;">₹${(payroll.paidAmount || 0).toLocaleString()}</td>
            </tr>
            ${payroll.remainingAmount > 0 ? `
            <tr>
              <td colspan="2">Pending Balance</td>
              <td style="text-align: right; font-weight: bold; color: #b45309;">₹${payroll.remainingAmount.toLocaleString()}</td>
            </tr>` : ''}
          </tbody>
        </table>

        ${lastPayment ? `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; font-size: 12px; margin-bottom: 25px;">
          <strong style="color: #475569; display: block; margin-bottom: 6px; text-transform: uppercase;">Payment Settlement Details:</strong>
          <div>Method: ${lastPayment.paymentMethod} &nbsp;|&nbsp; UTR / Ref: ${lastPayment.transactionReference || 'Direct'} &nbsp;|&nbsp; Date: ${new Date(lastPayment.paymentDate).toLocaleDateString()}</div>
        </div>
        ` : ''}

        <div class="footer">
          This is a computer-generated statement and does not require a physical signature.<br/>
          AgroYilt Administrative Payroll & Compensation System
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const curSummary = data?.currentMonthSummary || {};

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FiDollarSign className="w-6 h-6 text-emerald-600" />
          My Compensation &amp; Salary History
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          View your assigned monthly compensation, live registration incentives, and official payment records.
        </p>
      </div>

      {/* Current Month Live Accrual Card */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 uppercase tracking-wider text-indigo-200">
              {curSummary.monthName || 'Current Month'} Cycle
            </span>
            <p className="text-xs text-indigo-300 mt-1">Live Estimated Compensation Accrual</p>
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
              curSummary.payrollStatus === 'PAID'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                : curSummary.payrollStatus === 'PARTIALLY_PAID'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                  : 'bg-blue-500/20 text-blue-200 border border-blue-400/30'
            }`}>
              Status: {curSummary.payrollStatus || 'PENDING PAYMENT'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-white/10 p-3.5 rounded-xl backdrop-blur-xs">
            <span className="text-xs text-indigo-200 font-medium block">Monthly Base Salary</span>
            <span className="text-2xl font-black text-white mt-1 block">
              ₹{(curSummary.baseSalary || 0).toLocaleString()}
            </span>
          </div>

          <div className="bg-white/10 p-3.5 rounded-xl backdrop-blur-xs">
            <span className="text-xs text-purple-200 font-medium block">Live Earned Incentives</span>
            <span className="text-2xl font-black text-purple-300 mt-1 block">
              +₹{(curSummary.liveEarnedIncentives || 0).toLocaleString()}
            </span>
            <span className="text-[10px] text-indigo-200 mt-1 block">
              👨‍🌾 {curSummary.currentFarmers || 0} · 🚜 {curSummary.currentVendors || 0} · 👷 {curSummary.currentWorkers || 0}
            </span>
          </div>

          <div className="bg-white/15 p-3.5 rounded-xl backdrop-blur-xs border border-white/20">
            <span className="text-xs text-emerald-200 font-bold block uppercase tracking-wider">
              Estimated Current Payable
            </span>
            <span className="text-3xl font-black text-emerald-300 mt-1 block">
              ₹{(curSummary.liveEstimatedTotal || 0).toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-300 mt-1 block">
              Settled: ₹{(curSummary.paidAmount || 0).toLocaleString()} · Due: ₹{(curSummary.remainingAmount || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {curSummary.lastPayment && (
          <div className="bg-emerald-500/15 border border-emerald-500/30 p-3 rounded-xl text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <FiCheckCircle className="text-emerald-400" />
                Latest Settlement via {curSummary.lastPayment.paymentMethod?.replace('_', ' ')}
              </span>
              <span className="text-indigo-200 text-[11px]">
                {new Date(curSummary.lastPayment.paymentDate).toLocaleDateString()}
              </span>
            </div>
            {curSummary.lastPayment.transactionReference && (
              <p className="font-mono text-[11px] text-emerald-200">
                UTR: {curSummary.lastPayment.transactionReference}
              </p>
            )}
            {curSummary.lastPayment.paymentProofUrl && (
              <div className="pt-1">
                <a
                  href={curSummary.lastPayment.paymentProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-emerald-300 underline hover:text-white"
                >
                  View Payment Screenshot ↗
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Historical Payroll Records Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <FiFileText className="text-blue-600" />
            Previous Monthly Salary Records &amp; Payslips
          </h2>
          <span className="text-xs text-gray-400">
            {data?.payrolls?.length || 0} archived cycles
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-gray-500 font-semibold">Loading statement...</p>
          </div>
        ) : !data || data.payrolls.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <FiClock className="w-8 h-8 text-gray-400 mx-auto" />
            <h4 className="text-sm font-bold text-gray-700">No Past Records Available</h4>
            <p className="text-xs text-gray-400">
              When Super Admin records and settles your monthly salary, your official slips will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.payrolls.map(item => {
              const isExpanded = expandedId === item._id;
              const isPaid = item.status === 'PAID';
              const lastPayment = item.payments?.filter(p => p.status === 'SUCCESS').slice(-1)[0];

              return (
                <div
                  key={item._id}
                  className="border border-gray-100 hover:border-blue-200 rounded-2xl overflow-hidden transition shadow-sm"
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : item._id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        <FiCalendar className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{item.payrollMonth}</p>
                        <p className="text-[11px] text-gray-400">
                          Base: ₹{(item.baseSalary || 0).toLocaleString()} · Incentives: ₹{(item.totalIncentives || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-black text-gray-900">₹{(item.netPayable || 0).toLocaleString()}</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isPaid
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      {isExpanded ? <FiChevronUp className="w-4 h-4 text-gray-400" /> : <FiChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-gray-100 p-4 bg-slate-50/40 space-y-3 text-xs"
                      >
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                          <div className="p-2.5 bg-white rounded-xl border border-gray-200/60">
                            <span className="text-[10px] text-gray-500 font-bold block">Base Salary</span>
                            <span className="font-bold text-gray-900">₹{(item.baseSalary || 0).toLocaleString()}</span>
                          </div>
                          <div className="p-2.5 bg-white rounded-xl border border-gray-200/60">
                            <span className="text-[10px] text-purple-700 font-bold block">Incentives Earned</span>
                            <span className="font-bold text-purple-700">+₹{(item.totalIncentives || 0).toLocaleString()}</span>
                          </div>
                          <div className="p-2.5 bg-white rounded-xl border border-gray-200/60">
                            <span className="text-[10px] text-emerald-700 font-bold block">Paid Amount</span>
                            <span className="font-bold text-emerald-700">₹{(item.paidAmount || 0).toLocaleString()}</span>
                          </div>
                          <div className="p-2.5 bg-white rounded-xl border border-gray-200/60">
                            <span className="text-[10px] text-amber-700 font-bold block">Balance Due</span>
                            <span className="font-bold text-amber-700">₹{(item.remainingAmount || 0).toLocaleString()}</span>
                          </div>
                        </div>

                        {lastPayment && (
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                            <div className="flex items-center justify-between font-bold text-emerald-900">
                              <span>Settled via {lastPayment.paymentMethod}</span>
                              <span className="text-[11px] font-medium text-emerald-700">
                                {new Date(lastPayment.paymentDate).toLocaleDateString()}
                              </span>
                            </div>
                            {lastPayment.transactionReference && (
                              <p className="font-mono text-[11px] text-emerald-800">
                                UTR: {lastPayment.transactionReference}
                              </p>
                            )}
                            {lastPayment.paymentProofUrl && (
                              <div className="pt-1">
                                <a
                                  href={lastPayment.paymentProofUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-bold text-emerald-700 underline"
                                >
                                  View Payment Screenshot ↗
                                </a>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => handlePrintPayslip(item)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition shadow-sm"
                          >
                            <FiPrinter className="w-3.5 h-3.5 text-gray-500" />
                            Print / Download Payslip
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
