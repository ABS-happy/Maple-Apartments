/**
 * =========================================================================
 * MAPLE APARTMENTS - RAZORPAY PAYMENT GATEWAY INTEGRATION (TEST MODE)
 * =========================================================================
 * 
 * Provides:
 * 1. Dynamic SDK loader for https://checkout.razorpay.com/v1/checkout.js
 * 2. Backend order initialization via POST /api/rent/create-order
 * 3. Native Razorpay Test Mode Checkout Modal (with Cards, UPI, Netbanking)
 * 4. Automatic fallback when remote test keys are unactivated/sandbox
 * 5. Cryptographic signature verification via POST /api/rent/verify-payment
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

        scriptPromise = new Promise((resolve) => {
            const existingScript = document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`);
            if (existingScript) {
                existingScript.addEventListener('load', () => resolve(true));
                existingScript.addEventListener('error', () => resolve(false));
                return;
            }

            const script = document.createElement('script');
            script.src = RAZORPAY_SCRIPT_URL;
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => {
                console.warn('[Razorpay] Remote checkout script blocked or offline. Falling back to built-in Test Sandbox Modal.');
                resolve(false);
            };
            document.head.appendChild(script);
        });

        return scriptPromise;
    }

    /**
     * Renders and opens the built-in Maple Razorpay Test Checkout Modal
     */
    function openRazorpayTestSandboxModal(orderData, callbacks, contextParams) {
        const { onVerifying, onSuccess, onError, onDismiss } = callbacks || {};
        const flatNo = orderData.flatNumber || contextParams.flatId || '101';
        const amount = orderData.amountInRupees || (orderData.amount / 100) || 2700;
        const billingMonth = contextParams.month || orderData.month || 'Current Month';
        const residentName = orderData.resident?.name || `Resident ${flatNo}`;
        const residentEmail = orderData.resident?.email || `user${flatNo}@maple.com`;
        const residentPhone = orderData.resident?.phone || '9000000' + flatNo;

        let modalEl = document.getElementById('mapleRzpSandboxModal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'mapleRzpSandboxModal';
            document.body.appendChild(modalEl);
        }

        modalEl.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(15, 23, 42, 0.78); backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center; padding: 1rem;
            animation: rzpFadeIn 0.2s ease-out;
        `;

        modalEl.innerHTML = `
            <div style="background: white; width: 100%; max-width: 480px; border-radius: 18px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <!-- Header -->
                <div style="background: #0f172a; padding: 1.25rem 1.5rem; color: white; display: flex; align-items: center; justify-content: space-between; border-top: 4px solid #f97316;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 38px; height: 38px; border-radius: 10px; background: #f97316; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; color: white;">
                            🍁
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: white;">Razorpay Checkout</h3>
                                <span style="background: #f59e0b; color: #78350f; font-size: 0.65rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Test Mode</span>
                            </div>
                            <p style="font-size: 0.78rem; color: #94a3b8; margin: 0.15rem 0 0 0;">Maple Apartment • Flat ${flatNo}</p>
                        </div>
                    </div>
                    <button id="rzpCloseBtn" style="background: transparent; border: none; color: #94a3b8; font-size: 1.4rem; cursor: pointer; padding: 0.25rem; line-height: 1;" title="Close Checkout">&times;</button>
                </div>

                <!-- Dues Summary Bar -->
                <div style="background: #fff7ed; padding: 1rem 1.5rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #fed7aa;">
                    <div>
                        <div style="font-size: 0.75rem; color: #9a3412; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Rent & Maintenance (${billingMonth})</div>
                        <div style="font-size: 0.8rem; color: #475569;">Ref Order: <code style="font-size: 0.75rem; background: #ffedd5; padding: 1px 4px; border-radius: 4px; color: #9a3412;">${orderData.orderId}</code></div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.5rem; font-weight: 800; color: #ea580c;">₹${amount}</div>
                    </div>
                </div>

                <!-- Payment Methods Form -->
                <div style="padding: 1.25rem 1.5rem;">
                    <!-- Method Selector Tabs -->
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.75rem;">
                        <button id="tabCard" style="flex: 1; padding: 0.5rem; font-size: 0.82rem; font-weight: 700; border: none; border-radius: 8px; background: #fff7ed; color: #ea580c; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
                            💳 Test Card
                        </button>
                        <button id="tabUpi" style="flex: 1; padding: 0.5rem; font-size: 0.82rem; font-weight: 600; border: none; border-radius: 8px; background: #f8fafc; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
                            ⚡ UPI
                        </button>
                        <button id="tabNetbanking" style="flex: 1; padding: 0.5rem; font-size: 0.82rem; font-weight: 600; border: none; border-radius: 8px; background: #f8fafc; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
                            🏛️ Netbanking
                        </button>
                    </div>

                    <!-- Card Panel -->
                    <div id="panelCard">
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem; margin-bottom: 1rem;">
                            <div style="font-size: 0.72rem; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Razorpay Test Card (Auto-filled)</div>
                            <div style="font-size: 1rem; font-family: monospace; font-weight: 700; color: #0f172a; letter-spacing: 1.5px; margin-bottom: 0.4rem;">
                                4012 •••• •••• 0002
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #475569;">
                                <span>Expires: <strong>12/28</strong></span>
                                <span>CVV: <strong>123</strong></span>
                                <span>OTP: <strong>123456</strong></span>
                            </div>
                        </div>
                    </div>

                    <!-- Resident Prefill Info -->
                    <div style="font-size: 0.78rem; color: #64748b; margin-bottom: 1rem; background: #f1f5f9; padding: 0.65rem 0.85rem; border-radius: 8px; display: flex; justify-content: space-between;">
                        <span>Payer: <strong>${residentName}</strong></span>
                        <span>Flat: <strong>${flatNo}</strong></span>
                    </div>

                    <!-- Sandbox Notice -->
                    <div style="font-size: 0.75rem; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 0.65rem 0.85rem; border-radius: 8px; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 1rem;">🛡️</span>
                        <span>Razorpay Test Sandbox is active. Clicking below verifies HMAC-SHA256 signature and registers your receipt immediately.</span>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                        <button id="rzpSubmitPayBtn" style="width: 100%; padding: 0.85rem; background: #f97316; hover: background: #ea580c; color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 1rem; cursor: pointer; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4); display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.15s;">
                            <span id="rzpBtnIcon">🔒</span> <span id="rzpBtnText">Pay ₹${amount} (Test Mode)</span>
                        </button>
                        <button id="rzpCancelBtn" style="width: 100%; padding: 0.65rem; background: transparent; border: 1px solid #cbd5e1; border-radius: 10px; color: #64748b; font-weight: 600; font-size: 0.85rem; cursor: pointer;">
                            Cancel & Return
                        </button>
                    </div>
                </div>
            </div>
        `;

        function closeModal() {
            modalEl.remove();
        }

        // Close handlers
        document.getElementById('rzpCloseBtn').onclick = () => {
            closeModal();
            if (typeof onDismiss === 'function') onDismiss();
        };

        document.getElementById('rzpCancelBtn').onclick = () => {
            closeModal();
            if (typeof onDismiss === 'function') onDismiss();
        };

        // Tabs handlers
        const tabCard = document.getElementById('tabCard');
        const tabUpi = document.getElementById('tabUpi');
        const tabNb = document.getElementById('tabNetbanking');
        const panelCard = document.getElementById('panelCard');

        tabCard.onclick = () => {
            tabCard.style.background = '#fff7ed'; tabCard.style.color = '#ea580c';
            tabUpi.style.background = '#f8fafc'; tabUpi.style.color = '#64748b';
            tabNb.style.background = '#f8fafc'; tabNb.style.color = '#64748b';
            panelCard.innerHTML = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem; margin-bottom: 1rem;">
                    <div style="font-size: 0.72rem; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Razorpay Test Card (Auto-filled)</div>
                    <div style="font-size: 1rem; font-family: monospace; font-weight: 700; color: #0f172a; letter-spacing: 1.5px; margin-bottom: 0.4rem;">4012 •••• •••• 0002</div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #475569;">
                        <span>Expires: <strong>12/28</strong></span>
                        <span>CVV: <strong>123</strong></span>
                        <span>OTP: <strong>123456</strong></span>
                    </div>
                </div>`;
        };

        tabUpi.onclick = () => {
            tabUpi.style.background = '#fff7ed'; tabUpi.style.color = '#ea580c';
            tabCard.style.background = '#f8fafc'; tabCard.style.color = '#64748b';
            tabNb.style.background = '#f8fafc'; tabNb.style.color = '#64748b';
            panelCard.innerHTML = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem; margin-bottom: 1rem;">
                    <div style="font-size: 0.72rem; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Virtual UPI Handle</div>
                    <div style="font-size: 1rem; font-family: monospace; font-weight: 700; color: #0f172a; margin-bottom: 0.25rem;">success@razorpay</div>
                    <div style="font-size: 0.75rem; color: #16a34a;">✓ Auto-approved in Razorpay Sandbox</div>
                </div>`;
        };

        tabNb.onclick = () => {
            tabNb.style.background = '#fff7ed'; tabNb.style.color = '#ea580c';
            tabCard.style.background = '#f8fafc'; tabCard.style.color = '#64748b';
            tabUpi.style.background = '#f8fafc'; tabUpi.style.color = '#64748b';
            panelCard.innerHTML = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem; margin-bottom: 1rem;">
                    <div style="font-size: 0.72rem; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 0.4rem;">Select Simulated Bank</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.8rem; font-weight: 600;">
                        <span style="padding: 0.4rem; background: white; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; color: #1e293b;">HDFC Bank</span>
                        <span style="padding: 0.4rem; background: white; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; color: #1e293b;">State Bank</span>
                        <span style="padding: 0.4rem; background: white; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; color: #1e293b;">ICICI Bank</span>
                        <span style="padding: 0.4rem; background: white; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; color: #1e293b;">Axis Bank</span>
                    </div>
                </div>`;
        };

        // Payment Submission Handler
        const submitBtn = document.getElementById('rzpSubmitPayBtn');
        submitBtn.onclick = async () => {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            document.getElementById('rzpBtnIcon').textContent = '⏳';
            document.getElementById('rzpBtnText').textContent = 'Verifying with Maple BMS...';

            if (typeof onVerifying === 'function') onVerifying();

            const token = sessionStorage.getItem('maple_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const paymentId = orderData.testPaymentId || (`pay_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
            const signature = orderData.testSignature;

            try {
                const verifyRes = await fetch('/api/rent/verify-payment', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        razorpay_order_id: orderData.orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature,
                        flatId: flatNo,
                        roomId: flatNo,
                        paymentRecordId: orderData.paymentRecordId,
                        billId: contextParams.billId || orderData.billId
                    })
                });

                const verifyData = await verifyRes.json();
                if (verifyRes.ok && verifyData.success) {
                    closeModal();
                    if (typeof onSuccess === 'function') {
                        onSuccess({
                            ...verifyData,
                            orderId: orderData.orderId,
                            paymentId: paymentId,
                            amount: amount,
                            flatNumber: flatNo,
                            month: billingMonth
                        });
                    }
                } else {
                    throw new Error(verifyData.message || 'Payment signature verification failed.');
                }
            } catch (err) {
                console.error('Test payment verification failed:', err);
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                document.getElementById('rzpBtnIcon').textContent = '⚠️';
                document.getElementById('rzpBtnText').textContent = 'Retry Payment';
                if (typeof onError === 'function') onError(err);
            }
        };
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

            // 1. Fetch Razorpay Order from server (/api/rent/create-order)
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

            // 2. Check if we should directly launch the Native Test Sandbox Modal
            // This happens when order is in test mode or keys are unactivated sandbox credentials
            const isSandboxOrder = orderData.isMockOrder || (orderData.orderId && orderData.orderId.startsWith('order_test_'));

            if (isSandboxOrder) {
                // Open test sandbox checkout directly
                openRazorpayTestSandboxModal(orderData, callbacks, params);
                return;
            }

            // 3. Attempt official window.Razorpay checkout SDK if real keys are configured
            const isSdkLoaded = await loadRazorpayScript();
            if (!isSdkLoaded || !window.Razorpay) {
                // Seamlessly fall back to sandbox modal if SDK is blocked by adblockers
                openRazorpayTestSandboxModal(orderData, callbacks, params);
                return;
            }

            const residentInfo = orderData.resident || resident || {};
            const userStr = sessionStorage.getItem('maple_user');
            const userObj = userStr ? JSON.parse(userStr) : {};

            const prefillName = residentInfo.name || userObj.owner_name || `Resident ${flatId}`;
            const prefillEmail = residentInfo.email || userObj.email || '';
            const prefillPhone = residentInfo.phone || userObj.mobile_number || '';

            const options = {
                key: orderData.keyId,
                amount: orderData.amount,
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
                theme: { color: '#f97316' },
                handler: async function (response) {
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

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (failResponse) {
                console.warn('Razorpay SDK payment.failed encountered:', failResponse.error);
                // If authentication failed on remote key, gracefully fall back to sandbox modal
                if (failResponse.error?.code === 'BAD_REQUEST_ERROR' || failResponse.error?.description?.includes('Authentication failed')) {
                    openRazorpayTestSandboxModal(orderData, callbacks, params);
                } else if (typeof onError === 'function') {
                    onError(new Error(failResponse.error?.description || 'Payment was declined or cancelled.'));
                }
            });

            try {
                rzp.open();
            } catch (openErr) {
                console.warn('rzp.open() threw error, opening sandbox fallback:', openErr);
                openRazorpayTestSandboxModal(orderData, callbacks, params);
            }

        } catch (err) {
            console.error('Razorpay rent initiation failed:', err);
            if (typeof onError === 'function') onError(err);
        }
    }

    // Export to global scope
    window.MapleRazorpay = {
        loadScript: loadRazorpayScript,
        payRent: payRentWithRazorpay,
        openModal: openRazorpayTestSandboxModal
    };

})(window);
