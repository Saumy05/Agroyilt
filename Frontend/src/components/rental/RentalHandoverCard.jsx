import React, { useState } from 'react';
import {
  FiTruck,
  FiCheckCircle,
  FiClock,
  FiAlertTriangle,
  FiShield,
  FiCheck,
  FiFileText,
  FiCamera,
  FiMaximize2,
  FiX
} from 'react-icons/fi';
import ReturnHandoverModal from './ReturnHandoverModal';
import DamageClaimModal from './DamageClaimModal';

const RentalHandoverCard = ({
  booking,
  role = 'farmer', // 'farmer' | 'vendor'
  onRefresh,
  onConfirmReturn,
  onReportDamage
}) => {
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isDamageModalOpen, setIsDamageModalOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  if (!booking) return null;

  // Return handover only applies once rental is active (in_progress) or return/dispute has started
  const returnEligibleStatuses = ['in_progress', 'work_done', 'completed', 'returned', 'disputed'];
  const currentStatus = (booking.status || '').toLowerCase();
  if (!returnEligibleStatuses.includes(currentStatus)) {
    return null;
  }

  // Extract handover & damage data from either Booking or RentalTransaction schema
  const handover = booking.rentalHandover || {};
  const damage = booking.damageReport || {};
  const securityDeposit = booking.equipmentId?.pricing?.security_deposit || booking.securityDeposit || 0;

  const isFarmerConfirmed = Boolean(
    handover.farmerConfirmedReturn ||
    booking.farmerConfirmedReturn
  );

  const isVendorConfirmed = Boolean(
    handover.vendorConfirmedReturn ||
    booking.vendorConfirmedReturn
  );

  const isReturned = Boolean(
    (isFarmerConfirmed && isVendorConfirmed) ||
    booking.status === 'returned' ||
    handover.returnStatus === 'returned'
  );

  const hasDamageReport = Boolean(
    damage.reported ||
    damage.reportedBy ||
    booking.status === 'disputed' ||
    handover.returnStatus === 'disputed'
  );

  const depositRefundStatus = handover.depositRefundStatus || booking.depositRefundStatus || 'pending';

  const equipmentName = booking.equipmentId?.name || booking.serviceName || 'Rented Equipment';
  const otherPartyName = role === 'farmer' ? (booking.vendorId?.name || 'Equipment Vendor') : (booking.userId?.name || 'Farmer');

  const handleReturnSubmit = async (data) => {
    if (onConfirmReturn) {
      await onConfirmReturn(data);
    }
    if (onRefresh) onRefresh();
  };

  const handleDamageSubmit = async (data) => {
    if (onReportDamage) {
      await onReportDamage(data);
    }
    if (onRefresh) onRefresh();
  };

  return (
    <>
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <FiTruck size={17} />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 tracking-tight">Rental Return & Handover</h4>
              <p className="text-[10px] text-slate-400 font-medium">Bilateral inspection & deposit escrow status</p>
            </div>
          </div>

          {/* Status Badge */}
          {hasDamageReport ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-700 flex items-center gap-1">
              <FiAlertTriangle size={11} /> Damage Disputed
            </span>
          ) : isReturned ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <FiCheckCircle size={11} /> Return Completed
            </span>
          ) : isFarmerConfirmed ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 flex items-center gap-1">
              <FiClock size={11} /> Awaiting Inspection
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 flex items-center gap-1">
              <FiClock size={11} /> Rental Active
            </span>
          )}
        </div>

        {/* Handover Dual-Party Verification Status */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Farmer Status */}
          <div className={`p-3 rounded-2xl border ${
            isFarmerConfirmed
              ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Farmer Return</span>
              {isFarmerConfirmed ? (
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                  <FiCheck size={10} />
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">Pending</span>
              )}
            </div>
            <p className="text-xs font-black">
              {isFarmerConfirmed ? 'Confirmed Returned' : 'Not Yet Confirmed'}
            </p>
            {handover.farmerConfirmedAt && (
              <p className="text-[9px] text-slate-400 mt-0.5">
                {new Date(handover.farmerConfirmedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          {/* Vendor Status */}
          <div className={`p-3 rounded-2xl border ${
            isVendorConfirmed
              ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vendor Receipt</span>
              {isVendorConfirmed ? (
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                  <FiCheck size={10} />
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">Pending</span>
              )}
            </div>
            <p className="text-xs font-black">
              {isVendorConfirmed ? 'Inspected & Received' : 'Not Yet Received'}
            </p>
            {handover.vendorConfirmedAt && (
              <p className="text-[9px] text-slate-400 mt-0.5">
                {new Date(handover.vendorConfirmedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>

        {/* Security Deposit Escrow Banner */}
        {securityDeposit > 0 && (
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
            hasDamageReport
              ? 'bg-red-50/80 border-red-200 text-red-900'
              : depositRefundStatus === 'released'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center gap-2">
              <FiShield className={hasDamageReport ? 'text-red-600' : depositRefundStatus === 'released' ? 'text-emerald-600' : 'text-slate-400'} size={18} />
              <div>
                <p className="text-xs font-black">
                  Security Deposit: ₹{securityDeposit.toLocaleString('en-IN')}
                </p>
                <p className="text-[10px] text-slate-500">
                  {hasDamageReport
                    ? 'Deposit frozen in escrow pending admin claim inspection'
                    : depositRefundStatus === 'released'
                    ? 'Security deposit released and credited to farmer wallet'
                    : 'Held in platform escrow — auto-released upon clean return'}
                </p>
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
              hasDamageReport
                ? 'bg-red-200 text-red-800'
                : depositRefundStatus === 'released'
                ? 'bg-emerald-200 text-emerald-800'
                : 'bg-slate-200 text-slate-700'
            }`}>
              {hasDamageReport ? 'Frozen' : depositRefundStatus}
            </span>
          </div>
        )}

        {/* Notes (if any) */}
        {(handover.returnNotes || booking.handoverNotes) && (
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 text-xs text-slate-700">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Handover Notes</span>
            <p className="text-[11px] font-medium italic">"{handover.returnNotes || booking.handoverNotes}"</p>
          </div>
        )}

        {/* Damage Claim Summary Display (If reported) */}
        {hasDamageReport && damage.description && (
          <div className="p-4 rounded-2xl bg-red-50/90 border border-red-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-800">
                <FiAlertTriangle size={15} />
                <span className="text-xs font-black uppercase tracking-wider">Active Damage Claim Filed</span>
              </div>
              {damage.severity && (
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  damage.severity === 'severe'
                    ? 'bg-red-600 text-white'
                    : damage.severity === 'moderate'
                    ? 'bg-orange-500 text-white'
                    : 'bg-amber-400 text-amber-950'
                }`}>
                  {damage.severity} Severity
                </span>
              )}
            </div>

            <p className="text-xs font-medium text-red-950 bg-white/70 p-2.5 rounded-xl border border-red-200/60">
              {damage.description}
            </p>

            {damage.estimatedCost > 0 && (
              <div className="flex items-center justify-between text-xs font-black text-red-900 px-1">
                <span>Claimed Repair Cost:</span>
                <span>₹{Number(damage.estimatedCost).toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Photo Gallery Grid */}
            {damage.photos && damage.photos.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-red-700 flex items-center gap-1">
                  <FiCamera size={11} /> Photo Evidence ({damage.photos.length})
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {damage.photos.map((photoUrl, idx) => (
                    <div
                      key={idx}
                      onClick={() => setPreviewPhoto(photoUrl)}
                      className="relative group rounded-xl overflow-hidden aspect-square border border-red-200 bg-white shadow-sm cursor-pointer"
                    >
                      <img src={photoUrl} alt={`Damage photo ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                        <FiMaximize2 size={13} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-red-700 italic border-t border-red-200/80 pt-2">
              Reported by {damage.reporterRole || 'Party'} on {damage.reportedAt ? new Date(damage.reportedAt).toLocaleDateString('en-IN') : 'recently'}. An AgroYilt claim officer will mediate settlement.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex flex-wrap items-center gap-2">
          {/* Farmer Return Confirm Button */}
          {role === 'farmer' && !isFarmerConfirmed && !hasDamageReport && (
            <button
              type="button"
              onClick={() => setIsReturnModalOpen(true)}
              className="flex-1 min-w-[140px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5"
            >
              <FiCheckCircle size={14} /> Confirm Equipment Return
            </button>
          )}

          {/* Vendor Return Inspection Button */}
          {role === 'vendor' && !isVendorConfirmed && !hasDamageReport && (
            <button
              type="button"
              onClick={() => setIsReturnModalOpen(true)}
              className="flex-1 min-w-[140px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5"
            >
              <FiCheckCircle size={14} /> Inspect & Accept Return
            </button>
          )}

          {/* Report Damage Button */}
          {!hasDamageReport && !isReturned && (
            <button
              type="button"
              onClick={() => setIsDamageModalOpen(true)}
              className="py-2.5 px-3.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5"
            >
              <FiAlertTriangle size={13} /> Report Damage / Claim
            </button>
          )}
        </div>
      </div>

      {/* Handover Inspection Modal */}
      <ReturnHandoverModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        onSubmit={handleReturnSubmit}
        onOpenDamageReport={() => setIsDamageModalOpen(true)}
        equipmentName={equipmentName}
        securityDeposit={securityDeposit}
        role={role}
        otherPartyName={otherPartyName}
      />

      {/* Damage Claim Modal with Photo Upload */}
      <DamageClaimModal
        isOpen={isDamageModalOpen}
        onClose={() => setIsDamageModalOpen(false)}
        onSubmit={handleDamageSubmit}
        equipmentName={equipmentName}
        securityDeposit={securityDeposit}
        role={role}
      />

      {/* Fullscreen Photo Lightbox Modal */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-[1100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl bg-black">
            <img src={previewPhoto} alt="Damage evidence full view" className="max-w-full max-h-[85vh] object-contain" />
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 p-2 bg-black/60 text-white rounded-full hover:bg-black/90 transition-colors"
            >
              <FiX size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default RentalHandoverCard;
