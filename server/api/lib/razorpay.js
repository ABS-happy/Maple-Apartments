const Razorpay = require('razorpay');
const crypto = require('crypto');

/**
 * =========================================================================
 * RAZORPAY STANDARD WEB CHECKOUT CLIENT
 * =========================================================================
 * Keys are loaded securely from environment variables (.env / process.env).
 * KEY_SECRET is kept strictly on the backend and never exposed to the frontend.
 * =========================================================================
 */

function getRazorpayInstance() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        console.warn('⚠️  [Razorpay Warning] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set in environment variables.');
    }

    return new Razorpay({
        key_id: keyId || 'rzp_test_placeholder',
        key_secret: keySecret || 'placeholder_secret'
    });
}

// Dynamic proxy instance ensuring fresh process.env keys are always used
const razorpayInstance = new Proxy({}, {
    get(target, prop) {
        const instance = getRazorpayInstance();
        const val = instance[prop];
        return typeof val === 'function' ? val.bind(instance) : val;
    }
});

/**
 * Verify Razorpay payment signature using HMAC SHA-256
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * @param {string} orderId - Razorpay Order ID
 * @param {string} paymentId - Razorpay Payment ID
 * @param {string} signature - Razorpay Signature from checkout callback
 * @returns {boolean} - true if signature matches
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
    getRazorpayInstance,
    verifyPaymentSignature,
    getKeyId: () => process.env.RAZORPAY_KEY_ID
};

