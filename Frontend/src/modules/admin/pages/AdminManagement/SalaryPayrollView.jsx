import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiEye, FiX, FiUpload, FiCheckCircle, FiAlertCircle,
  FiDollarSign, FiUser, FiUsers, FiMapPin, FiCreditCard, FiSearch,
  FiCopy, FiPhone, FiRefreshCw, FiExternalLink, FiClock,
  FiCheck, FiChevronRight, FiFileText
} from "react-icons/fi";
import {
  getAdminSalaryList,
  generatePayroll,
  recordPayment,
  uploadPaymentProofFile
} from "../../services/adminPayrollService";
import { toastManager } from "../../../../utils/toastManager";

const STATUS = {
  PAID: { label: "Paid", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PARTIALLY_PAID: { label: "Partial", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PENDING_REVIEW: { label: "Pending", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  APPROVED: { label: "Approved", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  READY_FOR_PAYMENT: { label: "Ready to Pay", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  DRAFT: { label: "Draft", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  NOT_GENERATED: { label: "Not Generated", cls: "bg-slate-100 text-slate-500 border-slate-200" }
};

function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.NOT_GENERATED;
  return (
    <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border " + cfg.cls}>
      {cfg.label}
    </span>
  );
}

function CopyBtn({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        setCopied(true);
        toastManager.success((label || "Value") + " copied");
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-gray-500 hover:text-indigo-600 bg-gray-100 hover:bg-indigo-50 rounded-lg transition-all flex-shrink-0"
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <FiCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[10px] text-emerald-600 font-bold">Copied</span>
        </>
      ) : (
        <>
          <FiCopy className="w-3.5 h-3.5" />
          <span className="text-[10px]">Copy</span>
        </>
      )}
    </button>
  );
}

function RecordPaymentModal({ admin, onClose, onSuccess }) {
  const payableAmount = admin?.currentMonth?.liveEstimatedTotal || 0;
  const existingPayroll = admin?.payrollRecord;

  const [form, setForm] = useState({
    amount: payableAmount ? String(payableAmount) : "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "UPI",
    transactionReference: "",
    notes: "",
    paymentProofUrl: "",
    paymentProofFileName: ""
  });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toastManager.error("File size must be under 10 MB");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadPaymentProofFile(file);
      if (res.success && res.url) {
        setForm(f => ({
          ...f,
          paymentProofUrl: res.url,
          paymentProofFileName: file.name
        }));
        toastManager.success("Payment proof screenshot uploaded");
      } else {
        toastManager.error("Upload failed");
      }
    } catch {
      toastManager.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    const payAmt = Number(form.amount);
    if (!payAmt || payAmt <= 0) {
      toastManager.error("Enter a valid payment amount");
      return;
    }
    if (!form.transactionReference.trim() && (form.paymentMethod === "UPI" || form.paymentMethod === "BANK_TRANSFER")) {
      toastManager.error("UTR / Transaction Reference ID is required");
      return;
    }
    if (!form.paymentProofUrl) {
      toastManager.error("Please upload payment proof screenshot / receipt");
      return;
    }

    setSubmitting(true);
    try {
      let payrollId = existingPayroll?._id;
      if (!payrollId) {
        const genRes = await generatePayroll({ adminId: admin._id });
        if (!genRes.success) {
          toastManager.error("Could not initialize payroll record");
          setSubmitting(false);
          return;
        }
        payrollId = genRes.data?.payrolls?.[0]?._id;
        if (!payrollId) {
          toastManager.error("Payroll generation returned no record ID");
          setSubmitting(false);
          return;
        }
      }

      const res = await recordPayment(payrollId, {
        amount: payAmt,
        paymentDate: form.paymentDate,
        paymentMethod: form.paymentMethod,
        transactionReference: form.transactionReference.trim(),
        paymentProofUrl: form.paymentProofUrl,
        paymentProofFileName: form.paymentProofFileName,
        notes: form.notes.trim(),
        adjustmentReason: payAmt !== payableAmount ? "Amount adjusted by Super Admin" : ""
      });

      if (res.success) {
        toastManager.success(`Payment recorded successfully for ${admin.name}`);
        onSuccess();
        onClose();
      } else {
        toastManager.error(res.message || "Failed to record payment");
      }
    } catch (err) {
      toastManager.error(err?.response?.data?.message || "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10005] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[10004]"
      />

      {/* Modal Dialog / Mobile Bottom Sheet */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        className="relative z-[10005] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-white font-bold text-sm sm:text-base flex items-center gap-1.5">
              <FiCheckCircle className="w-4 h-4 text-emerald-200" />
              <span>Record Salary Payment</span>
            </h3>
            <p className="text-emerald-100 text-xs mt-0.5 font-medium">{admin?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
          {/* Payable Pill */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-xs text-emerald-800 font-medium">Estimated Payable This Month</span>
            <span className="text-sm sm:text-base font-black text-emerald-900">
              ₹{payableAmount.toLocaleString("en-IN")}
            </span>
          </div>

          {/* Amount Paid */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Amount Paid (₹) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder={`e.g. ${payableAmount}`}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Payment Date & Method Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.paymentDate}
                onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Method <span className="text-red-500">*</span>
              </label>
              <select
                value={form.paymentMethod}
                onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                <option value="BANK_TRANSFER">Bank Transfer (NEFT / IMPS)</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
          </div>

          {/* UTR / Reference */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              UTR / Reference / Transaction ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.transactionReference}
              onChange={e => setForm(f => ({ ...f, transactionReference: e.target.value }))}
              placeholder="e.g. 12-digit UTR ID (e.g. 429381749281)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Screenshot Upload with preview */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Payment Proof Screenshot / Receipt <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-3.5 text-center cursor-pointer transition ${
                form.paymentProofUrl
                  ? "border-emerald-400 bg-emerald-50/60"
                  : "border-gray-200 hover:border-emerald-400 bg-gray-50/60"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-emerald-700 text-xs font-bold py-2">
                  <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  Uploading proof...
                </div>
              ) : form.paymentProofUrl ? (
                <div className="space-y-1.5 py-1">
                  <div className="flex items-center justify-center gap-1.5 text-emerald-700 text-xs font-bold">
                    <FiCheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="truncate max-w-[200px]">{form.paymentProofFileName || "Screenshot Attached"}</span>
                  </div>
                  <p className="text-[10px] text-gray-500">Tap to replace file</p>
                </div>
              ) : (
                <div className="text-gray-500 text-xs py-1.5">
                  <FiUpload className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                  <p className="font-semibold text-gray-700">Tap to upload payment screenshot</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">PNG, JPG, PDF up to 10 MB</p>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Super Admin Remarks (Optional)
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Paid via PhonePe at 3:15 PM"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="p-3.5 border-t border-gray-100 bg-gray-50/80 flex gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm font-bold text-gray-600 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || uploading}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Recording...</span>
              </>
            ) : (
              <>
                <FiCheckCircle className="w-4 h-4" />
                <span>Confirm & Record</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AdminProfilePanel({ admin, onClose, onRecordPayment }) {
  if (!admin) return null;
  const bd = admin.salary?.bankDetails || {};
  const cm = admin.currentMonth || {};
  const pr = admin.payrollRecord;
  const hasUpi = bd.upiId && bd.upiId.trim();
  const hasBank = bd.accountNumber && bd.accountNumber.trim();
  const payableAmount = cm.liveEstimatedTotal || 0;

  // Direct UPI Intent URL for mobile phones
  const upiIntentUrl = hasUpi
    ? `upi://pay?pa=${encodeURIComponent(bd.upiId)}&pn=${encodeURIComponent(admin.name)}&am=${payableAmount || ""}&cu=INR&tn=Salary%20Payment%20AgroYilt`
    : null;

  return (
    <div className="fixed inset-0 z-[10002] flex justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[10001]"
      />

      {/* Slide-Over Panel */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="relative z-[10002] w-full sm:max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-base font-black text-white flex-shrink-0 shadow-xs">
              {admin.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">{admin.name}</p>
              <p className="text-indigo-200 text-xs truncate">{admin.email}</p>
              <p className="text-indigo-300 text-[11px] mt-0.5 flex items-center gap-1">
                <FiMapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{admin.territory || "Global"}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition flex-shrink-0 ml-2"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 pb-28 sm:pb-8">
          {/* Earnings Card */}
          <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/70 border border-indigo-100/90 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">
                {cm.payrollMonth || "Current Month"} — Live Earnings
              </p>
              {pr && <StatusBadge status={pr.status} />}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-xl px-3 py-2 border border-indigo-100">
                <span className="text-[10px] text-gray-500 block">Base Salary</span>
                <span className="font-bold text-gray-900 text-xs sm:text-sm">
                  ₹{(admin.salary?.baseSalary || 0).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="bg-white rounded-xl px-3 py-2 border border-purple-100">
                <span className="text-[10px] text-purple-600 block">Earned Incentives</span>
                <span className="font-bold text-purple-700 text-xs sm:text-sm">
                  +₹{(cm.totalIncentives || 0).toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Micro breakdown */}
            <div className="bg-white/80 rounded-xl px-3 py-2 border border-gray-100 space-y-1">
              <div className="flex justify-between text-[11px] text-gray-600">
                <span>Farmers Added ({cm.farmerCount || 0})</span>
                <span className="font-semibold">₹{cm.farmerIncentives || 0}</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-600">
                <span>Vendors Added ({cm.vendorCount || 0})</span>
                <span className="font-semibold">₹{cm.vendorIncentives || 0}</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-600">
                <span>Workers Added ({cm.workerCount || 0})</span>
                <span className="font-semibold">₹{cm.workerIncentives || 0}</span>
              </div>
              {cm.minRegistrationsThreshold > 0 && (
                <div className={`mt-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-between ${
                  cm.isThresholdMet 
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  <span>🎯 Boundary (&gt;{cm.minRegistrationsThreshold}):</span>
                  <span>
                    {cm.isThresholdMet 
                      ? `${cm.qualifyingRegistrationsCount || cm.qualifyingCount || 0} qualifying registrations` 
                      : `Locked (${cm.registrationsRemainingToUnlock !== undefined ? cm.registrationsRemainingToUnlock : Math.max(0, cm.minRegistrationsThreshold - (cm.currentTotalRegistrations || cm.totalCombinedRegistrations || ((cm.farmerCount || 0) + (cm.vendorCount || 0) + (cm.workerCount || 0))))} more needed)`}
                  </span>
                </div>
              )}
            </div>

            {/* Total Payable banner */}
            <div className="flex items-center justify-between bg-indigo-600 text-white rounded-xl px-3.5 py-2.5 shadow-sm">
              <span className="text-xs font-semibold">Total Payable</span>
              <span className="text-base sm:text-lg font-black">
                ₹{payableAmount.toLocaleString("en-IN")}
              </span>
            </div>

            {pr && pr.paidAmount > 0 && (
              <div className="flex items-center justify-between text-xs px-1 text-emerald-800 font-semibold">
                <span>Already Paid This Cycle:</span>
                <span>₹{pr.paidAmount.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>

          {/* UPI ID Section with 1-Tap Pay & Copy */}
          {hasUpi && (
            <div className="border border-emerald-200 rounded-2xl p-3.5 bg-emerald-50/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                    <FiPhone className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">UPI / Google Pay / PhonePe</h4>
                    <p className="text-[10px] text-emerald-700">Instant Mobile Payment</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between bg-white border border-emerald-200 rounded-xl px-3 py-2">
                <span className="font-mono text-xs sm:text-sm font-bold text-gray-900 break-all select-all">
                  {bd.upiId}
                </span>
                <CopyBtn value={bd.upiId} label="UPI ID" />
              </div>

              {/* 1-Tap open on mobile phone */}
              {upiIntentUrl && (
                <div className="pt-1">
                  <a
                    href={upiIntentUrl}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer text-center"
                  >
                    <FiExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Google Pay / PhonePe / Paytm</span>
                  </a>
                  <p className="text-[10px] text-emerald-700 text-center mt-1">
                    Tap to pay directly from your mobile payment app
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Bank Account Section */}
          {hasBank && (
            <div className="border border-blue-200 rounded-2xl p-3.5 bg-blue-50/60 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <FiCreditCard className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-blue-900">Bank Transfer (NEFT / IMPS)</h4>
                  <p className="text-[10px] text-blue-700">Bank Account Details</p>
                </div>
              </div>

              <div className="space-y-1.5">
                {[
                  { label: "Account Number", val: bd.accountNumber, isMono: true },
                  { label: "IFSC Code", val: bd.ifscCode, isMono: true },
                  { label: "Account Holder", val: bd.accountHolderName, isMono: false },
                  { label: "Bank Name", val: bd.bankName, isMono: false }
                ].map(row =>
                  row.val ? (
                    <div
                      key={row.label}
                      className="flex items-center justify-between bg-white border border-blue-100 rounded-xl px-3 py-2"
                    >
                      <div className="min-w-0 mr-2">
                        <span className="text-[10px] text-gray-400 block">{row.label}</span>
                        <span
                          className={`text-xs font-bold text-gray-900 break-all ${
                            row.isMono ? "font-mono" : ""
                          }`}
                        >
                          {row.val}
                        </span>
                      </div>
                      <CopyBtn value={row.val} label={row.label} />
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* Warning if no payment info */}
          {!hasUpi && !hasBank && (
            <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 text-center">
              <FiAlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-1.5" />
              <p className="text-xs font-bold text-amber-800">No Bank or UPI Details Added</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Edit this administrator account in the Admins tab to configure their UPI ID and Bank Account.
              </p>
            </div>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div className="p-3.5 border-t border-gray-100 bg-white flex-shrink-0 pb-safe">
          <button
            type="button"
            onClick={() => onRecordPayment(admin)}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20"
          >
            <FiCheckCircle className="w-4 h-4" />
            <span>I Have Paid — Record Payment &amp; Upload Proof</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AdminCard({ admin, onView, onPay }) {
  const cm = admin.currentMonth || {};
  const pr = admin.payrollRecord;
  const status = pr?.status || "NOT_GENERATED";
  const isPaid = status === "PAID";
  const bd = admin.salary?.bankDetails || {};
  const hasUpi = Boolean(bd.upiId && bd.upiId.trim());

  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3 transition-all ${
        isPaid ? "opacity-75 bg-slate-50/40" : "hover:border-slate-300"
      }`}
    >
      {/* Top row: Avatar, Name, Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm flex-shrink-0">
            {admin.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-xs sm:text-sm truncate">{admin.name}</p>
            <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
              <FiMapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <span>{admin.territory || "Global Access"}</span>
            </p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* 3-Column Financial Stat Strip */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="bg-slate-50 border border-slate-100 rounded-xl py-2 px-1">
          <p className="text-[9px] text-gray-500 font-semibold">Base</p>
          <p className="text-xs font-bold text-gray-900">
            ₹{(admin.salary?.baseSalary || 0).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-purple-50/70 border border-purple-100 rounded-xl py-2 px-1">
          <p className="text-[9px] text-purple-600 font-semibold">Incentives</p>
          <p className="text-xs font-bold text-purple-700">
            +₹{(cm.totalIncentives || 0).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl py-2 px-1">
          <p className="text-[9px] text-emerald-700 font-bold">Payable</p>
          <p className="text-xs font-black text-emerald-900">
            ₹{(cm.liveEstimatedTotal || 0).toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* UPI info tag */}
      {hasUpi && (
        <div className="flex items-center justify-between text-[10px] bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
          <span className="text-gray-500 font-medium">UPI:</span>
          <span className="font-mono text-gray-700 truncate max-w-[180px]">{bd.upiId}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => onView(admin)}
          className="flex-1 flex items-center justify-center gap-1 py-2 px-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
        >
          <FiEye className="w-3.5 h-3.5 text-slate-600" />
          <span>View Bank Details</span>
        </button>

        {!isPaid ? (
          <button
            type="button"
            onClick={() => onPay(admin)}
            className="flex-1 flex items-center justify-center gap-1 py-2 px-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <FiDollarSign className="w-3.5 h-3.5" />
            <span>Record Pay</span>
          </button>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-1 py-2 px-2 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold">
            <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Paid</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SalaryPayrollView() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [payingAdmin, setPayingAdmin] = useState(null);
  const [currentMonth, setCurrentMonth] = useState("");

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await getAdminSalaryList({ search });
      if (res.success) {
        setAdmins(res.data?.admins || []);
        setCurrentMonth(res.data?.currentPayrollMonth || "");
      }
    } catch {
      toastManager.error("Failed to load admin salary list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchList(), 350);
    return () => clearTimeout(t);
  }, [search]);

  const handleRecordPayment = (admin) => {
    setSelectedAdmin(null);
    setPayingAdmin(admin);
  };

  const totalPayable = admins.reduce((s, a) => s + (a.currentMonth?.liveEstimatedTotal || 0), 0);
  const paidCount = admins.filter(a => a.payrollRecord?.status === "PAID").length;
  const pendingCount = admins.filter(a => !a.payrollRecord || a.payrollRecord.status !== "PAID").length;

  return (
    <div className="space-y-3.5 sm:space-y-5 pb-24 lg:pb-8">
      {/* Title & Month Strip */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
            <span>Admin Salary &amp; Payroll Management</span>
            {currentMonth && (
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {currentMonth}
              </span>
            )}
          </h2>
          <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
            View admin UPI &amp; bank details, pay on mobile, then record payment &amp; proof
          </p>
        </div>
        <button
          type="button"
          onClick={fetchList}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition flex-shrink-0 bg-white shadow-xs"
        >
          <FiRefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* KPI Stat Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          {
            label: "Total Admins",
            val: admins.length,
            icon: FiUsers,
            color: "text-slate-900",
            bg: "bg-slate-50",
            iconColor: "text-slate-600"
          },
          {
            label: "Total Payable",
            val: `₹${totalPayable.toLocaleString("en-IN")}`,
            icon: FiDollarSign,
            color: "text-indigo-700",
            bg: "bg-indigo-50",
            iconColor: "text-indigo-600"
          },
          {
            label: "Paid",
            val: paidCount,
            icon: FiCheckCircle,
            color: "text-emerald-700",
            bg: "bg-emerald-50",
            iconColor: "text-emerald-600"
          },
          {
            label: "Pending",
            val: pendingCount,
            icon: FiClock,
            color: "text-amber-700",
            bg: "bg-amber-50",
            iconColor: "text-amber-600"
          }
        ].map(k => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-xs flex items-center gap-2.5"
            >
              <div className={`w-8 h-8 rounded-xl ${k.bg} ${k.iconColor} flex items-center justify-center flex-shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-500 font-semibold truncate">{k.label}</p>
                <p className={`text-sm sm:text-base font-black ${k.color} truncate`}>{k.val}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search admin by name, city, email..."
          className="w-full pl-9 pr-4 py-2 sm:py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        />
      </div>

      {/* Admin List Body */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-2.5">
          <div className="w-7 h-7 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-400 font-medium">Loading admin salary records...</p>
        </div>
      ) : admins.length === 0 ? (
        <div className="py-14 text-center space-y-2 bg-white rounded-2xl border border-slate-200/80 p-6">
          <FiUser className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-xs sm:text-sm font-bold text-gray-600">No administrators found</p>
          <p className="text-[11px] text-gray-400">Try changing your search terms</p>
        </div>
      ) : (
        <>
          {/* Mobile Card List (shown on < 1024px screens) */}
          <div className="block lg:hidden space-y-2.5">
            {admins.map(admin => (
              <AdminCard
                key={admin._id}
                admin={admin}
                onView={setSelectedAdmin}
                onPay={handleRecordPayment}
              />
            ))}
          </div>

          {/* Desktop Table View (shown on >= 1024px screens) */}
          <div className="hidden lg:block bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80">
                    {[
                      "Administrator",
                      "Territory",
                      "Base Salary",
                      "Incentives",
                      "Total Payable",
                      "Paid",
                      "Status",
                      "Action"
                    ].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 font-bold text-gray-500 text-[10px] uppercase tracking-wider ${
                          i <= 1 ? "text-left" : i >= 6 ? "text-center" : "text-right"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {admins.map(admin => {
                    const cm = admin.currentMonth || {};
                    const pr = admin.payrollRecord;
                    const status = pr?.status || "NOT_GENERATED";
                    const isPaid = status === "PAID";

                    return (
                      <tr
                        key={admin._id}
                        className={`transition hover:bg-slate-50/60 ${isPaid ? "opacity-75" : ""}`}
                      >
                        {/* Name & Avatar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black flex-shrink-0 text-xs">
                              {admin.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{admin.name}</p>
                              <p className="text-gray-400 text-[10px]">{admin.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Territory */}
                        <td className="px-4 py-3 text-gray-600 max-w-[130px]">
                          <span className="truncate block">{admin.territory || "Global Access"}</span>
                        </td>

                        {/* Base Salary */}
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">
                          ₹{(admin.salary?.baseSalary || 0).toLocaleString("en-IN")}
                        </td>

                        {/* Incentives */}
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-purple-700">
                            +₹{(cm.totalIncentives || 0).toLocaleString("en-IN")}
                          </span>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {cm.farmerCount || 0}F • {cm.vendorCount || 0}V • {cm.workerCount || 0}W
                          </div>
                        </td>

                        {/* Total Payable */}
                        <td className="px-4 py-3 text-right font-black text-gray-900">
                          ₹{(cm.liveEstimatedTotal || 0).toLocaleString("en-IN")}
                        </td>

                        {/* Paid */}
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">
                          {pr && pr.paidAmount > 0
                            ? `₹${(pr.paidAmount || 0).toLocaleString("en-IN")}`
                            : "-"}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={status} />
                        </td>

                        {/* Action buttons */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedAdmin(admin)}
                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition"
                              title="View Admin Profile & Bank Details"
                            >
                              <FiEye className="w-3.5 h-3.5" />
                            </button>
                            {!isPaid && (
                              <button
                                type="button"
                                onClick={() => handleRecordPayment(admin)}
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition"
                                title="Record Salary Payment"
                              >
                                <FiDollarSign className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Admin Profile & Payment Details Slide-Over */}
      <AnimatePresence>
        {selectedAdmin && (
          <AdminProfilePanel
            admin={selectedAdmin}
            onClose={() => setSelectedAdmin(null)}
            onRecordPayment={handleRecordPayment}
          />
        )}
      </AnimatePresence>

      {/* Record Payment Dialog */}
      <AnimatePresence>
        {payingAdmin && (
          <RecordPaymentModal
            admin={payingAdmin}
            onClose={() => setPayingAdmin(null)}
            onSuccess={() => fetchList()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}