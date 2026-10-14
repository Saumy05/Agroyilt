import api from './api';
import { compressImage } from '../utils/imageCompression';

// Vercel rejects request bodies over 4.5MB with a 413 before the app sees them
export const MAX_SIGNUP_UPLOAD_BYTES = 4 * 1024 * 1024;

const COMPRESSION_STEPS = [
  { maxWidth: 1600, maxHeight: 1600, quality: 0.8 },
  { maxWidth: 1280, maxHeight: 1280, quality: 0.65 },
  { maxWidth: 1000, maxHeight: 1000, quality: 0.5 }
];

/**
 * Shrinks an image until it fits the upload limit. PDFs can't be shrunk in the browser,
 * so they are only size-checked.
 */
const fitForUpload = async (file) => {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_SIGNUP_UPLOAD_BYTES) {
      throw new Error('PDF is too large. Please upload a PDF under 4MB or a photo of the document.');
    }
    return file;
  }

  let result = file;
  for (const step of COMPRESSION_STEPS) {
    try {
      result = await compressImage(file, { ...step, outputType: 'image/jpeg' });
    } catch (e) {
      console.error('Image compression failed', e);
      break;
    }
    if (result.size <= MAX_SIGNUP_UPLOAD_BYTES) return result;
  }
  if (result.size > MAX_SIGNUP_UPLOAD_BYTES) {
    throw new Error('Image is too large. Please upload a smaller image.');
  }
  return result;
};

/**
 * Upload one signup document and get back its URL, so the register request
 * carries a short URL instead of a base64 body (which proxies reject with 413).
 * The file is shrunk first, because the upload itself must stay under the host's body limit.
 */
export const uploadSignupDocument = async (file) => {
  const prepared = await fitForUpload(file);
  const body = new FormData();
  body.append('file', prepared);
  try {
    const response = await api.post('/public/signup-upload', body);
    if (!response.data?.success || !response.data?.url) {
      throw new Error(response.data?.message || 'Failed to upload file');
    }
    return response.data.url;
  } catch (error) {
    if (error.response?.status === 413) {
      throw new Error('File is too large to upload. Please choose a smaller file.');
    }
    throw error;
  }
};

/**
 * True only for an uploaded document's http(s) URL. Drafts saved by older builds hold base64
 * data URIs here, and sending one in the register request is what gets rejected with a 413.
 */
export const isRemoteUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);
