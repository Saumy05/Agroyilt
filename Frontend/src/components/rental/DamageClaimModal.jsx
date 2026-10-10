import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiAlertTriangle,
  FiX,
  FiCamera,
  FiUploadCloud,
  FiTrash2,
  FiDollarSign,
  FiShield,
  FiLoader,
  FiCheckCircle,
  FiInfo
} from 'react-icons/fi';
import { toastManager } from '../../utils/toastManager';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload';

const SEVERITY_LEVELS = [
  {
    id: 'minor',
    label: 'Minor',
    desc: 'Surface scratches, chipped paint, minor wear',
    color: 'border-amber-300 bg-amber-50/50 text-amber-800'
  },
  {
    id: 'moderate',
    label: 'Moderate',
    desc: 'Broken teeth/blades, torn seal, damaged guard',
    color: 'border-orange-300 bg-orange-50/50 text-orange-800'
  },
  {
    id: 'severe',
    label: 'Severe',
    desc: 'Engine/motor inoperable, axle bend, major fracture',
    color: 'border-red-400 bg-red-50/60 text-red-800'
  }
];

const DamageClaimModal = ({
  isOpen,
  onClose,
  onSubmit,
  equipmentName = 'Machinery Equipment',
  securityDeposit = 0,
  role = 'farmer'
}) => {
  const [severity, setSeverity] = useState('moderate');
  const [description, setDescription] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (photos.length + files.length > 5) {
      toastManager.error('You can upload a maximum of 5 evidence photos');
      return;
    }

    try {
      setUploading(true);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
        
        let photoUrl;
        try {
          photoUrl = await uploadToCloudinary(file, 'rental_damages', (p) => setUploadProgress(p));
        } catch (uploadErr) {
          // Fallback to base64 DataURL if Cloudinary signature not configured
          photoUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });
        }

        if (photoUrl) {
          setPhotos(prev => [...prev, photoUrl]);
        }
      }
      toastManager.success(`${files.length} photo(s) attached successfully`);
    } catch (err) {
      console.error('Photo upload error:', err);
      toastManager.error('Failed to upload one or more photos');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim() || description.trim().length < 10) {
      toastManager.error('Please provide a detailed description (at least 10 characters)');
      return;
    }

    if (photos.length === 0) {
      toastManager.error('Please upload at least 1 photo as visual proof of the damage');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit({
        description: description.trim(),
        photos,
        severity,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : 0
      });
      toastManager.success('Damage claim submitted! AgroYilt admin notified.');
      onClose();
    } catch (err) {
      console.error('Damage report submit error:', err);
      toastManager.error(err?.response?.data?.message || err?.message || 'Failed to submit damage report');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl my-6"
        >
          {/* Header */}
          <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-red-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-600/20">
                <FiAlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-base">Report Equipment Damage</h3>
                <p className="text-xs text-red-800 font-medium">
                  {role === 'vendor' ? 'File damage claim against security deposit' : 'Report pre-existing or return incident damage'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
            >
              <FiX size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Caution banner */}
            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3">
              <FiInfo className="text-amber-600 shrink-0 mt-0.5" size={17} />
              <div className="text-xs text-amber-900">
                <p className="font-bold">Security Deposit Escrow Alert</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Filing this claim will flag the order as <strong>Disputed</strong> and freeze the security deposit
                  {securityDeposit > 0 ? ` of ₹${securityDeposit.toLocaleString('en-IN')}` : ''} until inspected and resolved by AgroYilt Admin.
                </p>
              </div>
            </div>

            {/* Severity selection */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Damage Severity Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITY_LEVELS.map((lvl) => {
                  const isSelected = severity === lvl.id;
                  return (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setSeverity(lvl.id)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? `${lvl.color} ring-2 ring-offset-1 ring-red-500 shadow-sm font-black`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-xs font-black">{lvl.label}</p>
                      <p className="text-[10px] leading-tight text-slate-500 mt-0.5 line-clamp-2">{lvl.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Photo Evidence Upload Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <FiCamera className="text-red-600" /> Evidence Photos (Required, Max 5)
                </label>
                <span className="text-[11px] font-bold text-slate-400">{photos.length}/5 uploaded</span>
              </div>

              {/* Photo Previews */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {photos.map((url, idx) => (
                    <div key={idx} className="relative group rounded-xl overflow-hidden aspect-video border border-slate-200 bg-slate-100 shadow-sm">
                      <img src={url} alt={`Damage evidence ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-lg opacity-90 hover:opacity-100 transition-opacity shadow"
                        title="Remove photo"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload trigger box */}
              {photos.length < 5 && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-red-400 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-slate-50/60 hover:bg-red-50/30"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoSelect}
                    disabled={uploading}
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <FiLoader className="animate-spin text-red-600" size={24} />
                      <p className="text-xs font-bold text-slate-600">Uploading photo... {uploadProgress}%</p>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                        <FiUploadCloud size={20} />
                      </div>
                      <p className="text-xs font-black text-slate-700">Click or tap to snap / upload damage photos</p>
                      <p className="text-[10px] text-slate-400">Take clear close-up & wide angle shots of the damaged part</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Estimated Repair / Claim Cost */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <FiDollarSign className="text-red-600" /> Estimated Damage / Repair Cost (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  placeholder="e.g. 2500"
                  className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                />
              </div>
              {/* Quick preset chips */}
              <div className="flex gap-2">
                {[500, 1500, 3000, 5000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setEstimatedCost(preset.toString())}
                    className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                  >
                    +₹{preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Detailed Description */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Damage Description & Circumstance (Required)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe exactly what part is damaged, how it happened, and the current operational state..."
                rows={3}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white resize-none"
              />
              <p className="text-[10px] text-slate-400 text-right">{description.length}/500 chars</p>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || uploading}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <FiLoader className="animate-spin" /> Submitting Claim...
                  </>
                ) : (
                  <>
                    <FiAlertTriangle /> Submit Damage Claim
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default DamageClaimModal;
