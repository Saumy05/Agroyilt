import api from '../../../services/api';

/**
 * Digital lease agreements (land lease / Theka): read, sign with a one-time code, cancel.
 */
const leaseAgreementService = {
  /** My agreements (as landowner or as tenant farmer) */
  list: async () => {
    const response = await api.get('/farmer/agreements');
    return response.data;
  },

  /** One agreement: text, both signatures, and what I can do */
  get: async (id) => {
    const response = await api.get(`/farmer/agreements/${id}`);
    return response.data;
  },

  /** Send the signing code to my registered mobile */
  sendOtp: async (id) => {
    const response = await api.post(`/farmer/agreements/${id}/otp`);
    return response.data;
  },

  /**
   * Sign. The name is never sent: the server uses the registered name.
   * @param {{ otp: string, accepted: boolean, contentHash: string, device?: object }} body
   */
  sign: async (id, body) => {
    const response = await api.post(`/farmer/agreements/${id}/sign`, body);
    return response.data;
  },

  /** A 10-minute link to the PDF (the app's file download cannot send the login header) */
  pdfLink: async (id) => {
    const response = await api.post(`/farmer/agreements/${id}/pdf-link`);
    return response.data;
  },

  cancel: async (id, reason = '') => {
    const response = await api.post(`/farmer/agreements/${id}/cancel`, { reason });
    return response.data;
  }
};

export default leaseAgreementService;
