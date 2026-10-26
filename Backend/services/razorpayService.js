const Razorpay = require('razorpay');

// Initialize Razorpay with validation
let razorpay;
try {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('⚠️  Razorpay credentials missing in .env file');
    console.error('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'Present' : 'Missing');
    console.error('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'Present' : 'Missing');
  } else {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('✅ Razorpay initialized successfully');
  }
} catch (error) {
  console.error('❌ Failed to initialize Razorpay:', error.message);
}

/**
 * Create Razorpay order
 */
const createOrder = async (amount, currency = 'INR', receipt = null, notes = {}) => {
  try {
    if (!razorpay) {
      return {
        success: false,
        error: 'Razorpay not initialized. Please check credentials in .env file.'
      };
    }

    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes
    };

    console.log('Creating Razorpay order with options:', {
      amount: options.amount,
      currency: options.currency,
      receipt: options.receipt
    });

    const order = await razorpay.orders.create(options);

    console.log('✅ Razorpay order created successfully:', order.id);

    return {
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt
    };
  } catch (error) {
    console.error('❌ Razorpay create order error:', {
      message: error.message,
      description: error.description,
      code: error.code,
      statusCode: error.statusCode,
      error: error.error
    });

    return {
      success: false,
      error: error.description || error.message || 'Failed to create Razorpay order'
    };
  }
};

/**
 * Verify payment signature
 */
const verifyPayment = (razorpay_order_id, razorpay_payment_id, razorpay_signature) => {
  const crypto = require('crypto');
  const secret = process.env.RAZORPAY_KEY_SECRET;

  const generated_signature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  return generated_signature === razorpay_signature;
};

/**
 * Get payment details
 */
const getPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return {
      success: true,
      payment
    };
  } catch (error) {
    console.error('Razorpay get payment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get order details (the amount and notes the SERVER fixed when it created the order)
 */
const getOrderDetails = async (orderId) => {
  try {
    if (!razorpay) return { success: false, error: 'Razorpay not initialized.' };
    const order = await razorpay.orders.fetch(orderId);
    return { success: true, order };
  } catch (error) {
    console.error('Razorpay get order error:', error.message);
    return { success: false, error: error.error?.description || error.message };
  }
};

/**
 * Refund payment
 */
const refundPayment = async (paymentId, amount = null, notes = {}) => {
  try {
    const refundOptions = {
      payment_id: paymentId,
      notes
    };

    if (amount) {
      refundOptions.amount = Math.round(amount * 100); // Convert to paise
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);
    return {
      success: true,
      refund
    };
  } catch (error) {
    console.error('Razorpay refund error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Razorpay UPI QR (one fixed amount, one payment). The QR pays into the company's Razorpay account and Razorpay tells us
 * about the payment (webhook `qr_code.credited`, or by asking for the QR's payments), so nobody has to type a reference.
 * Needs the QR Codes feature enabled on the Razorpay account.
 */
const createUpiQr = async ({ amount, name, description, closeBy, notes = {} }) => {
  try {
    if (!razorpay) return { success: false, error: 'Razorpay not initialized. Please check credentials in .env file.' };
    const qr = await razorpay.qrCode.create({
      type: 'upi_qr',
      name,
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: Math.round(amount * 100),
      description,
      close_by: Math.floor(closeBy.getTime() / 1000),
      notes
    });
    return { success: true, qr };
  } catch (error) {
    console.error('❌ Razorpay create QR error:', { message: error.message, description: error.description, code: error.code, statusCode: error.statusCode, error: error.error });
    return { success: false, error: error.error?.description || error.description || error.message || 'Failed to create the payment QR' };
  }
};

/** Payments made against a QR code: [{ id, amount (paise), status, ... }]. */
const fetchQrPayments = async (qrCodeId) => {
  try {
    if (!razorpay) return { success: false, error: 'Razorpay not initialized.' };
    const res = await razorpay.qrCode.fetchAllPayments(qrCodeId, { count: 20 });
    return { success: true, payments: res?.items || [] };
  } catch (error) {
    console.error('Razorpay fetch QR payments error:', error.message);
    return { success: false, error: error.error?.description || error.message };
  }
};

/** Close a QR that is no longer wanted (best effort: a failure only leaves it to expire on its own). */
const closeQr = async (qrCodeId) => {
  try {
    if (!razorpay) return { success: false };
    await razorpay.qrCode.close(qrCodeId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  createUpiQr,
  fetchQrPayments,
  closeQr,
  createOrder,
  verifyPayment,
  getPaymentDetails,
  getOrderDetails,
  refundPayment
};

