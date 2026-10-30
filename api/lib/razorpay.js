const Razorpay = require('razorpay');
const crypto = require('crypto');

/**
 * =========================================================================
 * RAZORPAY TEST MODE CLIENT INITIALIZATION
 * =========================================================================
 * Keys are loaded securely from environment variables (.env / process.env).
 * NEVER hardcode your Razorpay Key Secret in code.
 *
 * Test Mode Credentials for QA / Verification:
 * - Test Card 1: 4012 0000 0000 0002 | Expiry: 12/28 | CVV: 123 | OTP: 123456
 * - Test Card 2: 4111 1111 1111 1111 | Expiry: 12/28 | CVV: 123 | OTP: 123456
 * - Test UPI: success@razorpay (auto-approved)
 * - Test Netbanking: Select any bank (SBI/HDFC/ICICI) -> Click "Success"
 * =========================================================================
 */

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
    console.warn('⚠️  [Razorpay Warning] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set in environment variables. Set them in .env for live test payments.');
}

// Initialize Razorpay SDK instance
const razorpayInstance = new Razorpay({
    key_id: keyId || 'rzp_test_placeholder',
    key_secret: keySecret || 'placeholder_secret'
});

/**
 * Verify Razorpay payment signature using HMAC SHA-256
 * @param {string} orderId - Razorpay Order ID
 * @param {string} paymentId - Razorpay Payment ID
 * @param {string} signature - Razorpay Signature from checkout callback
 * @returns {boolean} - true if signature is authentic
 */
function verifyPaymentSignature(orderId, paymentId, signature) {
    if (!orderId || !paymentId || !signature) return false;
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return false;

    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    return expectedSignature === signature;
}

module.exports = {
    razorpayInstance,
    verifyPaymentSignature,
    getKeyId: () => process.env.RAZORPAY_KEY_ID
};

