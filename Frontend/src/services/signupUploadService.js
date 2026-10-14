import api from './api';

/**
 * Upload one signup document and get back its URL, so the register request
 * carries a short URL instead of a base64 body (which proxies reject with 413).
 */
export const uploadSignupDocument = async (file) => {
  const body = new FormData();
  body.append('file', file);
  const response = await api.post('/public/signup-upload', body);
  if (!response.data?.success || !response.data?.url) {
    throw new Error(response.data?.message || 'Failed to upload file');
  }
  return response.data.url;
};
