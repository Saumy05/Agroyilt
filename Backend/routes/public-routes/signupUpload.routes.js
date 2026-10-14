const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const cloudinaryService = require('../../services/cloudinaryService');

const router = express.Router();

const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

// Held in memory only long enough to forward to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP images and PDF files are allowed'), false);
  }
}).single('file');

// Unauthenticated (the person has no account yet), so keep it tight per IP
const signupUploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.SIGNUP_UPLOAD_RATE_LIMIT) || 30,
  message: { success: false, message: 'Too many uploads. Please try again in a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /api/public/signup-upload
 * Uploads one signup document (Aadhar, PAN, licence...) so the register request
 * only has to carry the returned URL instead of a base64 body.
 */
router.post('/signup-upload', signupUploadLimiter, (req, res, next) => {
  upload(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File size should be less than 10MB' : err.message;
    return res.status(400).json({ success: false, message });
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinaryService.uploadFile(dataUri, { folder: 'signup_documents' });
    if (!result.success) {
      return res.status(502).json({ success: false, message: 'Failed to upload file. Please try again.' });
    }
    return res.status(200).json({ success: true, url: result.url });
  } catch (error) {
    console.error('Signup upload error:', error);
    return res.status(500).json({ success: false, message: 'Failed to upload file. Please try again.' });
  }
});

module.exports = router;
