/**
 * =========================================================================
 * MAPLE APARTMENTS - RAZORPAY PAYMENT GATEWAY UTILITY (TEST MODE)
 * =========================================================================
 * 
 * Reusable utility that:
 * 1. Dynamically injects https://checkout.razorpay.com/v1/checkout.js if not loaded.
 * 2. Initiates the Rent / Maintenance payment workflow via /api/rent/create-order.
 * 3. Launches the Razorpay Checkout modal with Project Maple theme (#f97316) and prefill data.
 * 4. Verifies the payment cryptographically via /api/rent/verify-payment.
 * 
 * TEST MODE CREDENTIALS:
 * - Test Card 1: 4012 0000 0000 0002 | Expiry: 12/28 | CVV: 123 | OTP: 123456
 * - Test Card 2: 4111 1111 1111 1111 | Expiry: 12/28 | CVV: 123 | OTP: 123456
 * - Test UPI: success@razorpay (auto-approved in sandbox)
 * - Test Netbanking: Choose any bank -> Click "Success" in sandbox
 * =========================================================================
 */

(function (window) {
    'use strict';

    const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
    let scriptPromise = null;

    /**
     * Dynamically loads Razorpay checkout script if not present
     * @returns {Promise<boolean>}
     */
    function loadRazorpayScript() {
        if (window.Razorpay) {
            return Promise.resolve(true);
        }

        if (scriptPromise) {
            return scriptPromise;
        }

        scriptPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`);
            if (existingScript) {
                existingScript.addEventListener('load', () => resolve(true));
                existingScript.addEventListener('error', () => reject(new Error('Failed to load Razorpay script')));
                return;
            }

            const script = document.createElement('script');
            script.src = RAZORPAY_SCRIPT_URL;
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => {
                scriptPromise = null;
                reject(new Error('Failed to load Razorpay Checkout SDK. Please check your internet connection.'));
            };
            document.head.appendChild(script);
        });

        return scriptPromise;
    }

    /**
     * Initiates the full Rent Payment workflow
     * @param {Object} params - { flatId, billId, amount, month, year, resident }
     * @param {Object} callbacks - { onStart, onVerifying, onSuccess, onError, onDismiss }
     */
    async function payRentWithRazorpay(params, callbacks = {}) {
        const { flatId, billId, amount, month, year, resident } = params || {};
        const { onStart, onVerifying, onSuccess, onError, onDismiss } = callbacks;

        try {
            if (typeof onStart === 'function') onStart();

            // 1. Ensure Razorpay SDK is loaded
            await loadRazorpayScript();

            if (!window.Razorpay) {
                throw new Error('Razorpay SDK could not be initialized.');
            }

            // 2. Call backend /api/rent/create-order
            const token = sessionStorage.getItem('maple_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const orderRes = await fetch('/api/rent/create-order', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    flatId: flatId || '',
                    roomId: flatId || '',
                    billId: billId || '',
                    amount: amount || undefined,
                    month: month || '',
                    year: year || ''
                })
            });

            const orderData = await orderRes.json();
            if (!orderRes.ok || !orderData.success) {
                throw new Error(orderData.error || 'Failed to initialize payment order on server.');
            }

            // 3. Configure Razorpay Checkout Options
            const residentInfo = orderData.resident || resident || {};
            const userStr = sessionStorage.getItem('maple_user');
            const userObj = userStr ? JSON.parse(userStr) : {};

            const prefillName = residentInfo.name || userObj.owner_name || `Resident ${flatId}`;
            const prefillEmail = residentInfo.email || userObj.email || '';
            const prefillPhone = residentInfo.phone || userObj.mobile_number || '';

            const options = {
                key: orderData.keyId, // Public Razorpay Key ID sent from backend (e.g. rzp_test_...)
                amount: orderData.amount, // Amount in paise
                currency: orderData.currency || 'INR',
                name: 'Maple Apartments',
                description: `Monthly Rent & Maintenance - Flat ${orderData.flatNumber || flatId} (${month || 'Current'})`,
                image: '/favicon.svg',
                order_id: orderData.orderId,
                prefill: {
                    name: prefillName,
                    email: prefillEmail,
                    contact: prefillPhone
                },
                notes: {
                    flatId: orderData.flatNumber || flatId,
                    billId: billId || orderData.billId || '',
                    paymentRecordId: orderData.paymentRecordId || ''
                },
                theme: {
                    color: '#f97316' // Maple primary orange theme
                },
                handler: async function (response) {
                    // Step 4: Verification
                    if (typeof onVerifying === 'function') onVerifying(response);

                    try {
                        const verifyRes = await fetch('/api/rent/verify-payment', {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                flatId: orderData.flatNumber || flatId,
                                roomId: orderData.flatNumber || flatId,
                                paymentRecordId: orderData.paymentRecordId,
                                billId: billId || orderData.billId
                            })
                        });

                        const verifyData = await verifyRes.json();
                        if (verifyRes.ok && verifyData.success) {
                            if (typeof onSuccess === 'function') {
                                onSuccess({
                                    ...verifyData,
                                    orderId: response.razorpay_order_id,
                                    paymentId: response.razorpay_payment_id,
                                    amount: orderData.amountInRupees || (orderData.amount / 100),
                                    flatNumber: orderData.flatNumber || flatId,
                                    month: month || 'Current Month'
                                });
                            }
                        } else {
                            throw new Error(verifyData.message || 'Payment signature verification failed.');
                        }
                    } catch (verifyErr) {
                        console.error('Payment verification failed:', verifyErr);
                        if (typeof onError === 'function') onError(verifyErr);
                    }
                },
                modal: {
                    ondismiss: function () {
                        if (typeof onDismiss === 'function') onDismiss();
                    }
                }
            };

            // 5. Open Razorpay Checkout Modal
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (failResponse) {
                console.error('Razorpay payment failed:', failResponse.error);
                if (typeof onError === 'function') {
                    onError(new Error(failResponse.error?.description || 'Payment was declined by bank or cancelled.'));
                }
            });
            rzp.open();

        } catch (err) {
            console.error('Razorpay rent initiation failed:', err);
            if (typeof onError === 'function') onError(err);
        }
    }

    // Export to global scope
    window.MapleRazorpay = {
        loadScript: loadRazorpayScript,
        payRent: payRentWithRazorpay
    };

})(window);

