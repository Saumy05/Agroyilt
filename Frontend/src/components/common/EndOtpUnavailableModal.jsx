import React, { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiAlertTriangle, FiCamera, FiX, FiLoader, FiCheckCircle } from 'react-icons/fi';
import { toastManager } from '../../utils/toastManager';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload';
import { serviceTimerService } from '../../services/serviceTimerService';

const REASONS = [
  { id: 'FARMER_NOT_ANSWERING', label: 'Farmer not answering phone', hi: 'किसान फोन नहीं उठा रहा' },
  { id: 'FARMER_DISPUTING_WORK', label: 'Farmer disputing the work', hi: 'किसान काम पर विवाद कर रहा है' },
  { id: 'FARMER_LEFT_FIELD', label: 'Farmer left the field', hi: 'किसान खेत छोड़कर चला गया' }
];

/** One photo slot: tap to open the camera, uploads straight away and shows a preview. */
const PhotoSlot = ({ label, url, uploading, onPick, onClear }) => {
  const ref = useRef(null);
  return (
    <div className="relative">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      {url ? (
        <div className="relative h-24 rounded-xl overflow-hidden border-2 border-emerald-300">
          <img src={url} alt={label} className="w-full h-full object-cover" />
          <button type="button" onClick={onClear} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
            <FiX className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
          className="w-full h-24 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 flex flex-col items-center justify-center gap-1 text-[11px] font-bold active:scale-95 transition-all">
          {uploading ? <FiLoader className="w-5 h-5 animate-spin" /> : <FiCamera className="w-5 h-5" />}
          <span className="px-1 text-center leading-tight">{uploading ? 'Uploading…' : label}</span>
        </button>
      )}
    </div>
  );
};

/**
 * Vendor escape valve: the farmer cannot / will not give the End OTP.
 * Needs a reason, an odometer photo and at least one field photo, then opens an urgent support ticket (dispute)
 * and freezes billable time. The vendor may leave the field once this succeeds.
 */
const EndOtpUnavailableModal = ({ isOpen, bookingId, onClose, onSubmitted }) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [odometer, setOdometer] = useState('');
  const [fields, setFields] = useState(['', '']);
  const [uploading, setUploading] = useState(null); // 'odo' | 0 | 1
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const upload = async (file, slot) => {
    try {
      setUploading(slot);
      const url = await uploadToCloudinary(file, 'otp-evidence');
      if (slot === 'odo') setOdometer(url);
      else setFields((prev) => prev.map((u, i) => (i === slot ? url : u)));
    } catch {
      toastManager.error('Photo upload failed. Check your network and try again.');
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    const photos = fields.filter(Boolean);
    if (!reason) return toastManager.error('Select why the End OTP is unavailable');
    if (!odometer) return toastManager.error('Take a photo of the engine / odometer reading');
    if (photos.length < 1) return toastManager.error('Take at least one photo of the completed field');
    try {
      setSubmitting(true);
      await serviceTimerService.reportOtpUnavailable(bookingId, { reason, notes: notes.trim(), odometerPhoto: odometer, photos });
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      toastManager.error(err.response?.data?.message || 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (submitting || uploading !== null) return;
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {done ? (
            <div className="text-center space-y-3 py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <FiCheckCircle className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-gray-900">Dispute submitted</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Dispute submitted with your photo evidence. You may safely leave the field; support is contacting the farmer.
                <br />(आप सुरक्षित रूप से खेत छोड़ सकते हैं, सपोर्ट किसान से संपर्क कर रहा है।)
              </p>
              <p className="text-[11px] text-gray-500">Billing is paused at this moment. You'll be notified when support completes the booking.</p>
              <button onClick={onClose} className="w-full py-3 rounded-2xl font-black text-white bg-gradient-to-r from-emerald-600 to-teal-700 text-sm">Done</button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between border-b pb-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0"><FiAlertTriangle className="w-5 h-5" /></div>
                  <div>
                    <h3 className="text-base font-black text-gray-900">End OTP not available</h3>
                    <p className="text-[11px] text-gray-500">Why can't you get the farmer's End OTP? (अंतिम ओटीपी क्यों नहीं मिला?)</p>
                  </div>
                </div>
                <button onClick={close} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"><FiX className="w-4 h-4" /></button>
              </div>

              <div className="space-y-2">
                {REASONS.map((r) => (
                  <button key={r.id} type="button" onClick={() => setReason(r.id)}
                    className={`w-full text-left px-3.5 py-3 rounded-xl border-2 transition-all ${reason === r.id ? 'border-red-500 bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <span className={`block text-xs font-black ${reason === r.id ? 'text-red-700' : 'text-gray-800'}`}>{r.label}</span>
                    <span className="block text-[10px] text-gray-500">{r.hi}</span>
                  </button>
                ))}
              </div>

              <div>
                <p className="text-[11px] font-black text-gray-700 mb-1.5">Photo evidence <span className="text-red-500">*</span> (required)</p>
                <div className="grid grid-cols-3 gap-2">
                  <PhotoSlot label="Engine / odometer reading" url={odometer} uploading={uploading === 'odo'} onPick={(f) => upload(f, 'odo')} onClear={() => setOdometer('')} />
                  <PhotoSlot label="Completed field" url={fields[0]} uploading={uploading === 0} onPick={(f) => upload(f, 0)} onClear={() => setFields(([, b]) => ['', b])} />
                  <PhotoSlot label="Field (optional)" url={fields[1]} uploading={uploading === 1} onPick={(f) => upload(f, 1)} onClear={() => setFields(([a]) => [a, ''])} />
                </div>
              </div>

              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2}
                placeholder="Anything support should know? (optional)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />

              <p className="text-[10px] text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-2.5 leading-relaxed">
                Billing will be paused at this moment. Support reviews your photos and completes the booking, so you still get paid for the work done.
              </p>

              <button onClick={submit} disabled={submitting || uploading !== null}
                className="w-full py-4 rounded-2xl font-black text-white bg-gradient-to-r from-red-500 to-orange-600 shadow-lg shadow-red-200 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? <FiLoader className="w-5 h-5 animate-spin" /> : <FiAlertTriangle className="w-5 h-5" />}
                {submitting ? 'Submitting…' : 'Submit to Support'}
              </button>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default EndOtpUnavailableModal;
