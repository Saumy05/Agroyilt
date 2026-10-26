/**
 * Razorpay's checkout can report "failed" / closed after a UPI app has paid (slow UPI callback inside the app's webview),
 * while the server already recorded the payment (the page's verify call or the gateway webhook). Before showing a failure,
 * ask the server: `isPaid` is an async check that returns true once the server shows the payment as done.
 */
export const waitForServerPayment = async (isPaid, { tries = 6, delayMs = 2000 } = {}) => {
  for (let i = 0; i < tries; i++) {
    try {
      if (await isPaid()) return true;
    } catch { /* keep trying */ }
    if (i < tries - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
};
