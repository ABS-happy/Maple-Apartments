const { connectToDatabase, User, Bill, Payment } = require('./lib/mongodb');
const { razorpayInstance, verifyPaymentSignature, getKeyId } = require('./lib/razorpay');
const { sendNotificationEmail } = require('./lib/mailer');

/**
 * Rent Order Creation Handler
 * POST /api/rent/create-order
 * 
 * Validates rent/maintenance dues from MongoDB, creates a Razorpay Order in paise,
 * and tracks the order in the database for secure verification.
 */
async function createOrder(req, res) {
    try {
        await connectToDatabase();

        const { flatId, flat_number, roomId, room_id, residentId, billId, bill_id, month, year } = req.body || {};
        const targetFlat = (flatId || flat_number || roomId || room_id || '').toString().trim();

        if (!targetFlat) {
            return res.status(400).json({ 
                success: false, 
                error: 'flatId (or flat_number) is required' 
            });
        }

        // 1. Fetch Resident and Bill records from database to validate amount
        const user = await User.findOne({
            $or: [
                { flat_number: targetFlat },
                { _id: targetFlat.match(/^[0-9a-fA-F]{24}$/) ? targetFlat : null },
                { username: targetFlat }
            ].filter(Boolean)
        });

        const flatNo = user ? user.flat_number : targetFlat;

        // Find active unpaid bill for this flat
        let bill = null;
        const targetBillId = billId || bill_id;
        if (targetBillId) {
            bill = await Bill.findById(targetBillId);
        }
        if (!bill) {
            bill = await Bill.findOne({ 
                flat_number: flatNo, 
                status: 'Unpaid', 
                is_archived: { $ne: true } 
            }).sort({ created_at: -1 });
        }

        // Calculate authoritative amount from DB
        let amountInRupees = 0;
        if (bill && Number(bill.amount) > 0) {
            amountInRupees = Number(bill.amount);
        } else if (user) {
            const c = user.charges || {};
            const sumCharges = (Number(c.rental) || 0) + (Number(c.festival) || 0) + (Number(c.parking) || 0) + (Number(c.others) || 0);
            amountInRupees = sumCharges > 0 ? sumCharges : (Number(user.maintenanceAmount) || 2500);
        } else {
            amountInRupees = 2500;
        }

        // Razorpay expects amount in paise (1 INR = 100 paise)
        const amountInPaise = Math.round(amountInRupees * 100);

        if (amountInPaise <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid payment amount. Amount must be greater than zero.' 
            });
        }

        // 2. Prepare order options
        const receiptId = `rcpt_${flatNo}_${Date.now().toString().slice(-8)}`;
        const orderOptions = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: receiptId,
            notes: {
                flatId: flatNo,
                residentId: user?._id?.toString() || residentId || '',
                billId: bill?._id?.toString() || '',
                month: month || '',
                year: year || new Date().getFullYear().toString()
            }
        };

        // 3. Create order via Razorpay SDK instance
        let order;
        try {
            order = await razorpayInstance.orders.create(orderOptions);
        } catch (sdkErr) {
            // Check if credentials are placeholder / unactivated keys in test mode
            const isPlaceholderSecret = !process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET.includes('*');
            const isTestAuthError = sdkErr.statusCode === 401 && (process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') || isPlaceholderSecret);

            if (isPlaceholderSecret || isTestAuthError) {
                console.warn('⚠️  [Razorpay Test Sandbox] Remote API returned 401 or placeholder keys detected. Creating mock sandbox order for local test mode.');
                order = {
                    id: `order_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    amount: amountInPaise,
                    currency: 'INR',
                    receipt: receiptId,
                    status: 'created'
                };
            } else {
                throw sdkErr;
            }
        }

        // 4. Save initial pending Payment log in database
        const paymentRecord = new Payment({
            bill_id: bill ? bill._id : undefined,
            flat_number: flatNo,
            amount: amountInRupees,
            month: month || bill?.month || new Date().toLocaleString('en-US', { month: 'long' }),
            year: Number(year) || new Date().getFullYear(),
            transfer_mode: 'Razorpay',
            razorpay_order_id: order.id,
            status: 'Pending',
            created_at: new Date()
        });
        await paymentRecord.save();

        const residentName = user?.owner_name || user?.resident?.name || `Resident ${flatNo}`;
        const residentEmail = user?.email || user?.resident?.email || '';
        const residentPhone = user?.mobile_number || user?.resident?.phone || '';

        return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,       // amount in paise
            amountInRupees: amountInRupees,
            currency: order.currency,
            keyId: getKeyId(),          // Public Razorpay Test Key for frontend checkout
            paymentRecordId: paymentRecord._id,
            receipt: order.receipt,
            flatNumber: flatNo,
            resident: {
                name: residentName,
                email: residentEmail,
                phone: residentPhone
            }
        });

    } catch (err) {
        console.error('❌ Razorpay create-order error:', err);
        return res.status(500).json({
            success: false,
            error: err.message || 'Failed to create Razorpay order'
        });
    }
}

/**
 * Rent Payment Verification Handler
 * POST /api/rent/verify-payment
 * 
 * Verifies Razorpay checkout signature using HMAC SHA-256 against RAZORPAY_KEY_SECRET.
 * Upon successful match, transitions flat rent status and bill to 'PAID'.
 */
async function verifyPayment(req, res) {
    try {
        await connectToDatabase();

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            flatId,
            flat_number,
            roomId,
            room_id,
            paymentRecordId,
            billId,
            bill_id
        } = req.body || {};

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing Razorpay verification parameters (razorpay_order_id, razorpay_payment_id, razorpay_signature).'
            });
        }

        // 1. Cryptographically verify signature using HMAC SHA-256
        const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

        if (!isValid) {
            console.error(`❌ [Razorpay Signature Mismatch] order: ${razorpay_order_id}, payment: ${razorpay_payment_id}`);
            
            // Mark payment record as Failed if found
            if (paymentRecordId) {
                await Payment.findByIdAndUpdate(paymentRecordId, {
                    $set: {
                        status: 'Failed',
                        razorpay_payment_id,
                        razorpay_signature
                    }
                }).catch(() => {});
            }

            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        // 2. Signature match confirmed! Find payment record and flat
        let payment = null;
        if (paymentRecordId) {
            payment = await Payment.findById(paymentRecordId);
        }
        if (!payment) {
            payment = await Payment.findOne({ razorpay_order_id });
        }

        const targetFlat = flatId || flat_number || roomId || room_id || payment?.flat_number;
        const targetBillId = billId || bill_id || payment?.bill_id;

        // 3. Update Payment record to 'PAID'
        if (payment) {
            payment.status = 'PAID';
            payment.razorpay_payment_id = razorpay_payment_id;
            payment.razorpay_signature = razorpay_signature;
            payment.verified_at = new Date();
            await payment.save();
        } else {
            payment = new Payment({
                flat_number: targetFlat || 'Unknown',
                bill_id: targetBillId,
                amount: 2500,
                transfer_mode: 'Razorpay',
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
                status: 'PAID',
                verified_at: new Date()
            });
            await payment.save();
        }

        // 4. Update flat's Bill status to 'Paid' and save paymentId, orderId, paidAt
        const billSetData = {
            status: 'Paid',
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            paid_at: new Date(),
            paidAt: new Date()
        };
        if (payment && payment.month) {
            billSetData.month = payment.month;
            billSetData.billing_month = payment.month;
        }

        let updatedBill = null;
        if (targetBillId) {
            updatedBill = await Bill.findByIdAndUpdate(
                targetBillId,
                { $set: billSetData },
                { new: true }
            );
        }
        if (!updatedBill && targetFlat) {
            updatedBill = await Bill.findOneAndUpdate(
                { flat_number: targetFlat, is_archived: { $ne: true } },
                { $set: billSetData },
                { sort: { created_at: -1 }, new: true }
            );
        }

        // Link bill_id on payment record if not yet set
        if (payment && updatedBill && !payment.bill_id) {
            payment.bill_id = updatedBill._id;
            await payment.save().catch(() => {});
        }

        // 5. Update User / Room rent status to 'paid' in flat_owners collection
        if (targetFlat) {
            await User.findOneAndUpdate(
                { flat_number: targetFlat },
                { $set: { paymentStatus: 'paid' } }
            );
        }

        // 6. Notify Resident via Email
        if (targetFlat) {
            const user = await User.findOne({ flat_number: targetFlat });
            const email = user?.email || user?.resident?.email;
            if (email) {
                const subject = `Rent Payment Receipt: Room ${targetFlat} - Maple Apartments`;
                const body = `Hello Room ${targetFlat},\n\nYour rent/maintenance payment has been successfully processed and verified via Razorpay.\n\nPayment ID: ${razorpay_payment_id}\nOrder ID: ${razorpay_order_id}\nAmount: ₹${payment.amount}\nStatus: PAID\nDate: ${new Date().toLocaleDateString('en-GB')}\n\nThank you for choosing digital payments!\nMaple Apartments Management`;
                sendNotificationEmail(email, subject, body).catch(e => console.error('Receipt email dispatch failed:', e));
            }
        }

        console.log(`✅ [Razorpay Success] Room ${targetFlat}: Payment ₹${payment.amount} verified (ID: ${razorpay_payment_id})`);

        return res.json({
            success: true,
            message: 'Payment verified successfully',
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            flatNumber: targetFlat,
            amount: payment.amount,
            paidAt: new Date().toISOString()
        });

    } catch (err) {
        console.error('❌ Razorpay verify-payment error:', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Payment verification failed'
        });
    }
}

/**
 * GET /api/rent/receipts/:flatNumber
 * Returns all verified/paid receipts for a specific flat so residents can view/download them anytime.
 */

/**
 * Normalizes month strings (e.g. "November", "November 2026") into a canonical "month year" key
 */
function normalizeMonthKey(monthStr, date) {
    const months = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ];
    const d = date ? new Date(date) : new Date();
    const defaultYear = d.getFullYear() || 2026;

    if (!monthStr) {
        const m = months[d.getMonth()] || 'current';
        return `${m} ${defaultYear}`;
    }

    const str = monthStr.toString().trim().toLowerCase();
    const foundMonth = months.find(m => str.includes(m));
    const yearMatch = str.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : defaultYear;

    if (foundMonth) {
        return `${foundMonth} ${year}`;
    }
    return `${str} ${year}`;
}

function formatDisplayMonth(monthKey, date) {
    if (!monthKey) return 'Current Month';
    return monthKey
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

async function getReceiptsForFlat(req, res) {
    try {
        await connectToDatabase();
        const { flatNumber } = req.params;
        if (!flatNumber) {
            return res.status(400).json({ error: 'flatNumber is required' });
        }

        // 1. Fetch user profile
        const user = await User.findOne({ flat_number: flatNumber }).lean();
        const residentName = user?.owner_name || user?.resident?.name || `Owner ${flatNumber}`;
        const residentPhone = user?.mobile_number || user?.resident?.phone || '';
        const residentEmail = user?.email || user?.resident?.email || '';

        // 2. Fetch all verified/paid payments for this flat
        const payments = await Payment.find({
            flat_number: flatNumber,
            status: { $in: ['PAID', 'Paid', 'Verified'] }
        }).sort({ created_at: -1, verified_at: -1 }).lean();

        // 3. Fetch all paid bills for this flat
        const paidBills = await Bill.find({
            flat_number: flatNumber,
            status: 'Paid'
        }).sort({ created_at: -1 }).lean();

        // Map: monthKey => Receipt (strictly ONE receipt per month)
        const receiptsByMonth = new Map();

        // Step A: Process Payment records first (Razorpay / verified payments take priority)
        for (const p of payments) {
            let matchedBill = null;
            if (p.bill_id) {
                matchedBill = paidBills.find(b => b._id && b._id.toString() === p.bill_id.toString());
            }
            if (!matchedBill && p.month) {
                matchedBill = paidBills.find(b => (b.month || '').toLowerCase().includes(p.month.toLowerCase()));
            }

            const paidDate = p.verified_at || p.created_at || new Date();
            const monthKey = normalizeMonthKey(p.month || matchedBill?.month || matchedBill?.billing_month, paidDate);
            const displayMonth = formatDisplayMonth(monthKey, paidDate);

            const isRazorpay = (p.transfer_mode || '').toLowerCase() === 'razorpay' || Boolean(p.razorpay_payment_id);
            const receiptId = p.razorpay_payment_id || p.utr_number || `RCPT-${flatNumber}-${p._id.toString().slice(-6).toUpperCase()}`;

            const item = {
                receiptId: receiptId,
                paymentId: p.razorpay_payment_id || p.utr_number || p._id.toString(),
                orderId: p.razorpay_order_id || '',
                flatNumber: flatNumber,
                residentName: residentName,
                residentPhone: residentPhone,
                residentEmail: residentEmail,
                amount: p.amount,
                month: displayMonth,
                monthKey: monthKey,
                year: p.year || (matchedBill?.due_date ? new Date(matchedBill.due_date).getFullYear() : new Date(paidDate).getFullYear()),
                breakdown: {
                    maintenance: matchedBill?.maintenance || p.amount,
                    festival: matchedBill?.festival || 0,
                    parking: matchedBill?.parking || 0,
                    others: matchedBill?.others || 0
                },
                method: p.transfer_mode || (isRazorpay ? 'Razorpay' : 'Bank Transfer'),
                status: 'PAID',
                paidAt: paidDate,
                source: 'Payment',
                isRazorpay: isRazorpay
            };

            // Keep only ONE receipt per month (prefer Razorpay / latest)
            if (!receiptsByMonth.has(monthKey)) {
                receiptsByMonth.set(monthKey, item);
            } else {
                const existing = receiptsByMonth.get(monthKey);
                if (!existing.isRazorpay && item.isRazorpay) {
                    receiptsByMonth.set(monthKey, item);
                } else if (new Date(item.paidAt) > new Date(existing.paidAt)) {
                    receiptsByMonth.set(monthKey, item);
                }
            }
        }

        // Step B: Process paid bills ONLY for bills & months not yet covered
        for (const b of paidBills) {
            // Skip if this bill's payment or order is already included
            const alreadyRepresented = Array.from(receiptsByMonth.values()).some(r => 
                (r.paymentId && b.paymentId && r.paymentId === b.paymentId) ||
                (r.orderId && b.orderId && r.orderId === b.orderId)
            );
            if (alreadyRepresented) continue;

            const paidDate = b.paid_at || b.due_date || b.created_at || new Date();
            const monthKey = normalizeMonthKey(b.month || b.billing_month, paidDate);

            if (!receiptsByMonth.has(monthKey)) {
                const displayMonth = formatDisplayMonth(monthKey, paidDate);
                receiptsByMonth.set(monthKey, {
                    receiptId: `RCPT-${flatNumber}-${b._id.toString().slice(-6).toUpperCase()}`,
                    paymentId: `BILL-${b._id.toString().slice(-8).toUpperCase()}`,
                    orderId: '',
                    flatNumber: flatNumber,
                    residentName: residentName,
                    residentPhone: residentPhone,
                    residentEmail: residentEmail,
                    amount: b.amount,
                    month: displayMonth,
                    monthKey: monthKey,
                    year: b.due_date ? new Date(b.due_date).getFullYear() : new Date(paidDate).getFullYear(),
                    breakdown: {
                        maintenance: b.maintenance || b.amount,
                        festival: b.festival || 0,
                        parking: b.parking || 0,
                        others: b.others || 0
                    },
                    method: 'Bank / Admin Verified',
                    status: 'PAID',
                    paidAt: paidDate,
                    source: 'Bill',
                    isRazorpay: false
                });
            }
        }

        // Exactly one receipt per month, sorted chronologically (latest month first)
        const receipts = Array.from(receiptsByMonth.values());
        receipts.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

        res.json({
            success: true,
            flatNumber,
            count: receipts.length,
            receipts
        });
    } catch (err) {
        console.error('Error fetching receipts for flat:', err);
        res.status(500).json({ error: err.message });
    }
}/**
 * GET /api/payments/all
 * Returns all payments made by all residents across all 16 flats in chronological order (latest first).
 */
async function getAllPaymentsHistory(req, res) {
    try {
        await connectToDatabase();

        // 1. Fetch all flat owners to map resident details
        const users = await User.find({ role: 'User' }).lean();
        const userMap = {};
        users.forEach(u => {
            userMap[u.flat_number] = {
                name: u.owner_name || u.resident?.name || `Owner ${u.flat_number}`,
                phone: u.mobile_number || u.resident?.phone || '',
                email: u.email || u.resident?.email || ''
            };
        });

        // 2. Fetch all payments from Payment collection
        const payments = await Payment.find().sort({ created_at: -1, verified_at: -1 }).lean();

        // 3. Fetch paid bills
        const paidBills = await Bill.find({ status: 'Paid' }).lean();
        const billMap = {};
        paidBills.forEach(b => {
            billMap[b._id.toString()] = b;
        });

        const historyList = [];

        payments.forEach(p => {
            const resident = userMap[p.flat_number] || { name: `Resident ${p.flat_number}`, phone: '', email: '' };
            const bill = p.bill_id ? billMap[p.bill_id.toString()] : null;
            const month = p.month || bill?.month || bill?.billing_month || (p.verified_at ? new Date(p.verified_at).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : 'Current Month');
            const refNumber = p.razorpay_payment_id || p.utr_number || `TXN-${p._id.toString().slice(-6).toUpperCase()}`;

            historyList.push({
                _id: p._id,
                flat_number: p.flat_number,
                resident_name: resident.name,
                resident_phone: resident.phone,
                resident_email: resident.email,
                amount: p.amount,
                month: month,
                year: p.year || (p.verified_at ? new Date(p.verified_at).getFullYear() : new Date().getFullYear()),
                transfer_mode: p.transfer_mode || (p.razorpay_order_id ? 'Razorpay' : 'Bank Transfer'),
                razorpay_order_id: p.razorpay_order_id || '',
                razorpay_payment_id: p.razorpay_payment_id || '',
                utr_number: p.utr_number || '',
                status: p.status || 'PAID',
                date: p.verified_at || p.created_at,
                breakdown: {
                    maintenance: bill?.maintenance || p.amount,
                    festival: bill?.festival || 0,
                    parking: bill?.parking || 0,
                    others: bill?.others || 0
                }
            });
        });

        // Also include paid bills that don't have a separate payment document
        paidBills.forEach(b => {
            const hasPayment = payments.some(p => {
                if (p.bill_id && p.bill_id.toString() === b._id.toString()) return true;
                if (p.flat_number === b.flat_number) {
                    const pKey = normalizeMonthKey(p.month, p.verified_at || p.created_at);
                    const bKey = normalizeMonthKey(b.month || b.billing_month, b.paid_at || b.due_date || b.created_at);
                    if (pKey === bKey) return true;
                }
                return false;
            });
            if (!hasPayment) {
                const resident = userMap[b.flat_number] || { name: `Resident ${b.flat_number}`, phone: '', email: '' };
                const month = b.month || b.billing_month || (b.due_date ? new Date(b.due_date).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : 'Current Month');
                historyList.push({
                    _id: b._id,
                    flat_number: b.flat_number,
                    resident_name: resident.name,
                    resident_phone: resident.phone,
                    resident_email: resident.email,
                    amount: b.amount,
                    month: month,
                    year: b.due_date ? new Date(b.due_date).getFullYear() : new Date().getFullYear(),
                    transfer_mode: 'Bank / Admin Verified',
                    razorpay_order_id: '',
                    razorpay_payment_id: '',
                    utr_number: `BILL-${b._id.toString().slice(-6).toUpperCase()}`,
                    status: 'PAID',
                    date: b.paid_at || b.due_date || b.created_at,
                    breakdown: {
                        maintenance: b.maintenance || b.amount,
                        festival: b.festival || 0,
                        parking: b.parking || 0,
                        others: b.others || 0
                    }
                });
            }
        });

        // Chronological order: latest payments first
        historyList.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Quick aggregate statistics
        const totalAmount = historyList.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
        const razorpayTotal = historyList
            .filter(item => (item.transfer_mode || '').toLowerCase() === 'razorpay')
            .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
        const razorpayCount = historyList.filter(item => (item.transfer_mode || '').toLowerCase() === 'razorpay').length;

        res.json({
            success: true,
            totalCount: historyList.length,
            totalAmount,
            razorpayCount,
            razorpayTotal,
            payments: historyList
        });
    } catch (err) {
        console.error('Error fetching all payments history:', err);
        res.status(500).json({ error: err.message });
    }
}

// Default Vercel Serverless Function Handler
async function rentApiHandler(req, res) {
    const url = req.url || '';
    if (url.includes('create-order')) return createOrder(req, res);
    if (url.includes('verify-payment')) return verifyPayment(req, res);
    if (url.includes('receipts')) {
        const match = url.match(/receipts\/([^\/\?]+)/);
        if (match) req.params = { ...(req.params || {}), flatNumber: match[1] };
        return getReceiptsForFlat(req, res);
    }
    if (url.includes('all') || url.includes('payments') || url.includes('history')) return getAllPaymentsHistory(req, res);
    return res.status(404).json({ error: 'Endpoint not found in rent API' });
}

module.exports = rentApiHandler;
module.exports.createOrder = createOrder;
module.exports.verifyPayment = verifyPayment;
module.exports.getReceiptsForFlat = getReceiptsForFlat;
module.exports.getAllPaymentsHistory = getAllPaymentsHistory;
