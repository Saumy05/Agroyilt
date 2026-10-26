const axios = require('axios');

/**
 * Send SMS via SMS India Hub
 * @param {string} phone - Phone number
 * @param {string} message - Message content
 * @param {Object} [options]
 * @param {string} [options.templateId] - DLT template ID for this message (defaults to the OTP template)
 * @returns {Promise<Object>} - Response data
 */
const sendSMS = async (phone, message, options = {}) => {
  try {
    // Check for Test Mode or Specific Test Number
    const TEST_NUMBERS = ['6268455485', '6260491554', '6260491555'];
    if (process.env.USE_DEFAULT_OTP === 'true' || TEST_NUMBERS.includes(phone)) {
      console.log(`[SMS MOCK] To: ${phone}, Msg: ${message}`);
      return { success: true, data: 'Mock Success' };
    }

    // Check if SMS credentials are configured
    if (!process.env.SMS_INDIA_HUB_API_KEY || !process.env.SMS_INDIA_HUB_SENDER_ID) {
      console.warn('[SMS] Required SMS credentials (API_KEY or SENDER_ID) missing in .env. SMS not sent.');
      console.log(`[SMS MOCK] To: ${phone}, Msg: ${message}`);
      return { success: false, message: 'SMS configuration missing' };
    }

    // Format phone number with country code (91)
    const cleanPhone = String(phone).replace(/\D/g, '');
    const formattedNumber = cleanPhone.startsWith('91') && cleanPhone.length > 10 ? cleanPhone : `91${cleanPhone}`;

    // Build parameters matching SMSIndiaHub SendSMS API
    const templateId = options.templateId || process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID;
    const peId = options.peId || process.env.SMS_INDIA_HUB_PE_ID;

    const params = {
      APIKey: process.env.SMS_INDIA_HUB_API_KEY,
      senderid: process.env.SMS_INDIA_HUB_SENDER_ID,
      channel: 'Trans',
      DCS: 0,
      flashsms: 0,
      number: formattedNumber,
      text: message,
      route: 0,
    };

    if (templateId) {
      params.DLTTemplateId = templateId;
    }
    if (peId) {
      params.PEId = peId;
    }

    // Use official HTTPS endpoint
    const baseUrl = process.env.SMS_BASE_URL || 'https://cloud.smsindiahub.in/api/mt/SendSMS';
    console.log('[SMS] Sending request to:', baseUrl);
    console.log('[SMS] Params (masked):', { ...params, APIKey: '***' });

    const response = await axios.get(baseUrl, { params });

    console.log('[SMS] Response status:', response.status);
    console.log('[SMS] Response data:', response.data);

    // Check for successful response
    // SMS India Hub can return JSON object OR string
    let isSuccess = false;
    const data = response.data;

    if (typeof data === 'object' && data !== null) {
      // Handle JSON response
      if (data.ErrorCode === '000' || data.ErrorMessage === 'Done' || data.ErrorMessage === 'Success') {
        isSuccess = true;
      }
    } else {
      // Handle String response
      const responseStr = String(data || '');
      if (responseStr.startsWith('Success')) {
        isSuccess = true;
      }
    }

    if (isSuccess) {
      console.log(`[SMS] ✅ SMS sent successfully to ${phone}`);
      return { success: true, data: response.data };
    } else {
      console.error(`[SMS] ❌ SMS Provider Error:`, JSON.stringify(response.data));
      // Parse common string errors if it is a string
      if (typeof data === 'string' && data.includes('Invalid Login')) {
        console.error('[SMS] ⚠️  Authentication failed - check SMS_INDIA_HUB_USERNAME and SMS_INDIA_HUB_API_KEY');
      }
      return { success: false, error: response.data };
    }

  } catch (error) {
    console.error('[SMS] Network Error:', error.message);
    if (error.response) {
      console.error('[SMS] Error Response:', error.response.data);
    }
    return { success: false, error: error.message };
  }
};

/**
 * Send OTP specific SMS
 * @param {string} phone - Phone number
 * @param {string} otp - OTP code
 */
const sendOTP = async (phone, otp) => {
  // DLT-compliant message format (must match registered template in SMSIndiaHub):
  // Template: Welcome to the {#var#} powered by Appzeto.Your OTP for registration is {#var#}.BGADEC
  const appName = 'Agroylit';
  const message = `Welcome to the ${appName} powered by Appzeto.Your OTP for registration is ${otp}.BGADEC`;

  console.log(`[SMS] Attempting to send OTP to ${phone}`);
  console.log(`[SMS] Message: ${message}`);

  const result = await sendSMS(phone, message);

  if (!result.success) {
    console.error(`[SMS] Failed to send OTP to ${phone}:`, result.error);
  }

  return result;
};

/**
 * Account-approved SMS. The text must match the DLT template registered for it
 * (SMS_APPROVAL_DLT_TEMPLATE_ID); without that ID the provider would reject it, so it is skipped.
 * Template: "Dear {#var#}, your AgroYilt {#var#} account has been approved. You can now log in to the app with your MPIN. - AgroYilt"
 * @param {string} phone
 * @param {string} name
 * @param {string} roleLabel - Farmer | Vendor | Worker
 */
const sendAccountApprovedSMS = async (phone, name, roleLabel) => {
  const templateId = process.env.SMS_APPROVAL_DLT_TEMPLATE_ID;
  if (!templateId) {
    console.warn('[SMS] SMS_APPROVAL_DLT_TEMPLATE_ID not set; approval SMS skipped.');
    return { success: false, skipped: true };
  }
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'User';
  const message = `Dear ${firstName}, your AgroYilt ${roleLabel} account has been approved. You can now log in to the app with your MPIN. - AgroYilt`;
  return sendSMS(phone, message, { templateId });
};

/**
 * One-time code to sign a lease agreement. Wording must match a DLT template registered for it
 * (SMS_AGREEMENT_OTP_DLT_TEMPLATE_ID). Without that, the registered login OTP template is used so the code still arrives.
 * Template: "Your AgroYilt OTP to sign the lease agreement is {#var#}. Do not share it. - AgroYilt"
 */
const sendAgreementOtp = async (phone, otp) => {
  const templateId = process.env.SMS_AGREEMENT_OTP_DLT_TEMPLATE_ID;
  if (!templateId) return sendOTP(phone, otp);
  const message = `Your AgroYilt OTP to sign the lease agreement is ${otp}. Do not share it. - AgroYilt`;
  return sendSMS(phone, message, { templateId });
};

module.exports = {
  sendSMS,
  sendOTP,
  sendAgreementOtp,
  sendAccountApprovedSMS
};
