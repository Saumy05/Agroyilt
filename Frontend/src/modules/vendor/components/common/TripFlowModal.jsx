import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiCamera, FiX, FiCheck, FiUpload, FiLoader, FiRefreshCw, FiArrowRight } from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import { uploadToCloudinary } from '../../../../utils/cloudinaryUpload';
import { flutterBridge } from '../../../../utils/flutterBridge';

/**
 * TripFlowModal - Handles Start Trip / End Trip flow
 * Step 1: Open Camera → Take KM Photo
 * Step 2: Enter Farmer's OTP
 * Step 3: Submit
 *
 * Props:
 *   isOpen     {boolean}
 *   onClose    {() => void}
 *   mode       {'start' | 'end'}
 *   mode       {'start' | 'end'}
 *   onSubmit   {(photoUrl: string, otp: string, workUnits?: number) => Promise<void>}
 *   rentalType {string} 'hourly' | 'land_based' | 'monthly'
 *   isMachinery {boolean} True if this is an equipment rental
 */
const TripFlowModal = ({ isOpen, onClose, mode = 'start', onSubmit, rentalType, isMachinery = false, requiresDriver = true, trackingType = 'odometer', booking }) => {
    const [step, setStep] = useState(1); // 1 = Photo, 2 = OTP
    const [photoPreview, setPhotoPreview] = useState(null);
    const [photoFile, setPhotoFile] = useState(null);
    const [evidencePreview, setEvidencePreview] = useState(null);
    const [evidenceFile, setEvidenceFile] = useState(null);
    const [otp, setOtp] = useState(['', '', '', '']);
    const [workUnits, setWorkUnits] = useState(''); // Acres covered
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const fileInputRef = useRef(null);
    const otpRefs = [useRef(), useRef(), useRef(), useRef()];

    // Native Camera handler — Flutter mein native camera, web mein file input
    const handleOpenCamera = async (target = 'km') => {
        if (flutterBridge.isFlutter) {
            // Flutter app ke andar → native camera khulega
            try {
                const file = await flutterBridge.openCamera();
                if (!file) return;
                const reader = new FileReader();
                if (target === 'km') {
                    setPhotoFile(file);
                    reader.onloadend = () => setPhotoPreview(reader.result);
                } else {
                    setEvidenceFile(file);
                    reader.onloadend = () => setEvidencePreview(reader.result);
                }
                reader.readAsDataURL(file);
                flutterBridge.hapticFeedback('success');
            } catch (err) {
                console.error('[TripFlowModal] Native camera failed:', err);
                toastManager.error('Camera khulne mein dikkat hui, dobara try karein');
            }
        } else {
            // Normal web browser → HTML file input (capture="environment")
            fileInputRef.current?.click();
        }
    };

    const isStart = mode === 'start';
    // Machinery auto-generates End OTP, so vendor doesn't need to enter one on end trip
    // But for Standalone (no driver), we REQUIRE Start OTP to verify handover.
    const skipOtpStep = isStart ? !booking?.driver_start_otp : !booking?.driver_end_otp;
    const isMeterBased = trackingType === 'odometer';

    const title = isStart 
        ? (isMachinery ? '🚜 Start Field Service & Live Timer' : (requiresDriver ? '🚜 Start Trip' : '📦 Handover Equipment'))
        : (isMachinery ? '🏁 Complete Field Service & Bill' : (requiresDriver ? '🏁 End Trip' : '✅ Collect Equipment'));
    const photoLabel = isStart 
        ? (isMachinery ? 'Field & Machinery Setup Photo (Optional)' : (isMeterBased ? 'Starting Kilometer Photo' : 'Equipment Condition Photo (Optional)'))
        : (isMachinery ? 'Completed Field Work Photo (Optional)' : (isMeterBased ? 'Ending Kilometer Photo' : 'Rental Condition Photo (Optional)'));
    const themeColor = isStart ? '#16a34a' : '#dc2626'; // green for start, red for end

    // Reset state when modal closes / reopens or changes mode
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setPhotoPreview(null);
            setPhotoFile(null);
            setOtp(['', '', '', '']);
            setEvidencePreview(null);
            setEvidenceFile(null);
            setUploading(false);
            setSubmitting(false);

            // Auto-fill workUnits from booking.landSize for land_based end trip
            if (!isStart && rentalType === 'land_based' && booking?.landSize) {
                // landSize can be "5 Acres" or just "5" — extract numeric part
                const numericPart = parseFloat(String(booking.landSize));
                if (!isNaN(numericPart)) {
                    setWorkUnits(String(numericPart));
                } else {
                    setWorkUnits('');
                }
            } else {
                setWorkUnits('');
            }
        }
    }, [isOpen, mode]);

    const handleClose = () => {
        onClose();
    };

    // Auto-skip logic removed to let vendor see Step 1 first

    // Handle photo selection (camera or gallery)
    const handlePhotoCapture = (e, target = 'km') => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (target === 'km') {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setPhotoPreview(reader.result);
            reader.readAsDataURL(file);
        } else {
            setEvidenceFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setEvidencePreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    // OTP input logic
    const handleOtpChange = (idx, val) => {
        if (!/^\d?$/.test(val)) return;
        const newOtp = [...otp];
        newOtp[idx] = val;
        setOtp(newOtp);
        if (val && idx < 3) otpRefs[idx + 1].current?.focus();
    };
    const handleOtpKeyDown = (idx, e) => {
        if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
            otpRefs[idx - 1].current?.focus();
        }
    };

    // Go to Step 2: Upload photo to Cloudinary
    const handleProceed = async () => {
        if (step === 1) {
            try {
                setUploading(true);
                let url = '';
                if (photoFile) {
                    url = await uploadToCloudinary(photoFile);
                    setPhotoFile(url); // store URL
                }
                
                if (isStart) {
                    if (skipOtpStep) {
                        setSubmitting(true);
                        await onSubmit(url, '', undefined, undefined);
                        handleClose();
                    } else {
                        setStep(3);
                    }
                } else {
                    setStep(2);
                }
            } catch (err) {
                toastManager.error(err?.message || 'Photo upload/submit failed. Try again.');
            } finally {
                setUploading(false);
                setSubmitting(false);
            }
        } else if (step === 2) {
            try {
                let url = '';
                if (evidenceFile) {
                    setUploading(true);
                    url = await uploadToCloudinary(evidenceFile);
                    setEvidenceFile(url); // store URL
                }
                if (skipOtpStep) {
                    setSubmitting(true);
                    await onSubmit(photoFile, '', workUnits ? parseFloat(workUnits) : undefined, url);
                    handleClose();
                } else {
                    setStep(3);
                }
            } catch (err) {
                toastManager.error(err?.message || 'Evidence upload/submit failed. Try again.');
            } finally {
                setUploading(false);
                setSubmitting(false);
            }
        }
    };

    const handleSubmitSkippingOTP = async () => {
        if (!isStart && rentalType === 'land_based' && !workUnits) return toastManager.error('Please enter total area covered');

        try {
            setSubmitting(true);
            await onSubmit(photoFile, '', workUnits ? parseFloat(workUnits) : undefined, evidenceFile);
            handleClose();
        } catch (err) {
            toastManager.error(err?.message || 'Failed to submit. Try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Final Submit (OTP Mode)
    const handleSubmit = async () => {
        const otpStr = otp.join('');
        if (otpStr.length !== 4) return toastManager.error('Enter 4-digit OTP from farmer');
        if (!isStart && rentalType === 'land_based' && !workUnits) return toastManager.error('Please enter total area covered');

        try {
            setSubmitting(true);
            await onSubmit(photoFile, otpStr, workUnits ? parseFloat(workUnits) : undefined, evidenceFile);
            handleClose();
        } catch (err) {
            toastManager.error(err?.message || 'Failed to submit. Try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4"
                    onClick={(e) => e.target === e.currentTarget && handleClose()}
                >
                    <motion.div
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3"
                            style={{ borderBottom: `3px solid ${themeColor}` }}>
                            <div>
                                <h2 className="text-lg font-extrabold text-gray-900">{title}</h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Step {step === 3 && isStart ? 2 : step} of {skipOtpStep ? (isStart ? 1 : 2) : (isStart ? 2 : 3)}: {
                                       step === 1 ? (isMeterBased ? 'Take KM Photo' : 'Confirm & Handover') : 
                                       step === 2 ? (skipOtpStep ? 'Confirm Submission' : 'Evidence of Work') : 
                                       'Enter Farmer OTP'
                                    }
                                </p>
                            </div>
                            <button onClick={handleClose}
                                className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                                <FiX className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="flex gap-1.5 px-5 pt-3">
                            {(skipOtpStep ? (isStart ? [1] : [1, 2]) : (isStart ? [1, 3] : [1, 2, 3])).map(s => (
                                <div key={s} className="flex-1 h-1 rounded-full transition-all"
                                    style={{ background: step >= s ? themeColor : '#e5e7eb' }} />
                            ))}
                        </div>

                        <div className="px-5 py-5 space-y-4">

                            {/* === STEP 1: KM PHOTO === */}
                            {step === 1 && (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                                    <p className="text-sm font-semibold text-gray-700">{photoLabel}</p>

                                    {/* Photo Preview / Camera Button */}
                                    {photoPreview ? (
                                        <div className="relative">
                                            <img src={photoPreview} alt="KM" className="w-full h-52 object-cover rounded-2xl border-2 border-gray-200" />
                                            <button
                                                onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}
                                                className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow-md">
                                                <FiRefreshCw className="w-4 h-4 text-gray-700" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleOpenCamera('km')}
                                            className="w-full h-52 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all active:scale-95"
                                            style={{ borderColor: themeColor, background: `${themeColor}08` }}>
                                            <FiCamera className="w-10 h-10" style={{ color: themeColor }} />
                                            <p className="text-sm font-bold" style={{ color: themeColor }}>
                                                {isMeterBased ? 'Tap to Open Camera' : 'Take Photo (Optional)'}
                                            </p>
                                            <p className="text-[10px] text-gray-400 text-center px-6">
                                                {isMeterBased 
                                                    ? 'Take a clear photo of the odometer/meter' 
                                                    : 'Optionally document the equipment condition'
                                                }
                                            </p>
                                        </button>
                                    )}

                                    {/* Hidden file input - camera capture */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={handlePhotoCapture}
                                    />

                                    <button
                                        onClick={handleProceed}
                                        disabled={uploading}
                                        className="w-full py-4 mb-2 rounded-2xl font-extrabold text-white text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                                        style={{ background: themeColor }}>
                                        {uploading
                                            ? <><FiLoader className="w-4 h-4 animate-spin" /> {photoFile ? 'Uploading...' : 'Processing...'}</>
                                            : <><FiUpload className="w-4 h-4" /> {skipOtpStep && isStart ? (isMachinery ? 'Confirm & Start Field Service' : (requiresDriver ? 'Confirm & Start Engine' : 'Confirm Handover')) : (!photoPreview ? 'Skip Photo & Continue' : 'Next: Verify OTP')}</>}
                                    </button>
                                    {/* Safety spacer for mobile BottomNav */}
                                    <div className="h-20 sm:hidden" />
                                </motion.div>
                            )}

                            {/* === STEP 2: EVIDENCE PHOTO (Only for End Trip) === */}
                            {step === 2 && !isStart && (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                                    <p className="text-sm font-semibold text-gray-700">Finished Work Evidence</p>

                                    {evidencePreview ? (
                                        <div className="relative">
                                            <img src={evidencePreview} alt="Work Proof" className="w-full h-52 object-cover rounded-2xl border-2 border-gray-200" />
                                            <button
                                                onClick={() => { setEvidencePreview(null); setEvidenceFile(null); }}
                                                className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow-md">
                                                <FiRefreshCw className="w-4 h-4 text-gray-700" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleOpenCamera('evidence')}
                                            className="w-full h-52 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all active:scale-95"
                                            style={{ borderColor: themeColor, background: `${themeColor}08` }}>
                                            <FiCamera className="w-10 h-10" style={{ color: themeColor }} />
                                            <p className="text-sm font-bold" style={{ color: themeColor }}>Take Proof of Work</p>
                                            <p className="text-[10px] text-gray-400">Take a photo of the completed task side-by-side with the machine</p>
                                        </button>
                                    )}

                                    {/* Capture for Evidence */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={(e) => handlePhotoCapture(e, 'evidence')}
                                    />

                                    <div className="flex gap-3 pt-2">
                                        <button onClick={() => setStep(1)}
                                            className="w-28 py-3.5 rounded-2xl border-2 font-bold text-sm text-gray-600 border-gray-300 transition-all active:scale-95 flex items-center justify-center flex-shrink-0">
                                            ← Back
                                        </button>
                                        <button
                                            onClick={handleProceed}
                                            disabled={uploading}
                                            className="flex-1 py-3.5 rounded-2xl font-extrabold text-white text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                                            style={{ background: themeColor }}>
                                            {uploading
                                                ? <><FiLoader className="w-4 h-4 animate-spin" /> Uploading...</>
                                                : !evidencePreview 
                                                    ? <>{'Skip Photo & Continue'} <FiArrowRight className="w-4 h-4" /></>
                                                    : <><FiCheck className="w-4 h-4" /> {skipOtpStep ? 'Confirm & End Trip' : 'Verify & Continue'}</>}
                                        </button>
                                    </div>
                                    <div className="h-20 sm:hidden" />
                                </motion.div>
                            )}

                            {/* === STEP 3: OTP === */}
                            {step === 3 && (
                                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                                    {photoFile && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                                <FiCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
                                                <p className="text-xs font-semibold text-gray-700">Photos uploaded successfully ✅</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Additional Input for Land Based (Step 2) */}
                                    {!isStart && rentalType === 'land_based' && (
                                        <div className="space-y-2 p-4 bg-yellow-50 rounded-2xl border border-yellow-200">
                                            <p className="text-sm font-bold text-yellow-800">Total Work Finished</p>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={workUnits}
                                                    onChange={(e) => setWorkUnits(e.target.value)}
                                                    placeholder="Enter total area covered..."
                                                    className="w-full py-4 px-4 bg-white border-2 border-yellow-300 rounded-xl focus:outline-none text-lg font-bold text-yellow-900"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-yellow-600">Area</span>
                                            </div>
                                            <p className="text-[10px] text-yellow-700 italic">Bill will be calculated based on {workUnits || '0'} area.</p>
                                            {booking?.landSize && (
                                                <p className="text-[10px] text-yellow-600 font-semibold">
                                                    📋 Booked area: {booking.landSize} — adjust if actual work differed
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* OTP Input */}
                                    <div className="text-center space-y-2">
                                        <p className="text-sm font-bold text-gray-800">Enter Farmer's OTP</p>
                                        <p className="text-[11px] text-gray-500">Ask the farmer for their {isStart ? '4-digit Start' : '4-digit End'} OTP</p>
                                        <div className="flex justify-center gap-3 mt-4">
                                            {otp.map((digit, idx) => (
                                                <input
                                                    key={idx}
                                                    ref={otpRefs[idx]}
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={1}
                                                    value={digit}
                                                    onChange={e => handleOtpChange(idx, e.target.value)}
                                                    onKeyDown={e => handleOtpKeyDown(idx, e)}
                                                    className="w-14 h-14 text-center text-2xl font-extrabold border-2 rounded-xl focus:outline-none transition-all"
                                                    style={{
                                                        borderColor: digit ? themeColor : '#e5e7eb',
                                                        color: themeColor
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex gap-3 pt-2">
                                        <button onClick={() => setStep(isStart ? 1 : 2)}
                                            className="flex-1 py-3.5 rounded-2xl border-2 font-bold text-sm text-gray-600 border-gray-300 transition-all active:scale-95">
                                            ← Back
                                        </button>
                                        <button
                                            onClick={handleSubmit}
                                            disabled={otp.join('').length < 4 || submitting}
                                            className="flex-1 py-3.5 rounded-2xl font-extrabold text-white text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                                            style={{ background: themeColor }}>
                                            {submitting
                                                ? <><FiLoader className="w-4 h-4 animate-spin" /> Submitting...</>
                                                : <><FiCheck className="w-4 h-4" /> {isStart ? (isMachinery ? 'Confirm & Start Live Timer' : (requiresDriver ? 'Confirm Start Trip' : 'Confirm Handover')) : (isMachinery ? 'Confirm & Generate Bill' : (requiresDriver ? 'Confirm End Trip' : 'Confirm Collection'))}</>}
                                        </button>
                                    </div>
                                    <div className="h-20 sm:hidden" />
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
};

export default TripFlowModal;
