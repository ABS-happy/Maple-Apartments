const crypto = require('crypto');
const { connectToDatabase, User, Bill, Payment } = require('./lib/mongodb');
const { razorpayInstance, verifyPaymentSignature, getKeyId } = require('./lib/razorpay');
const { sendNotificationEmail } = require('./lib/mailer');

/**
 * Rent Order Creation Handler
 * POST /api/create-order or POST /api/rent/create-order
 * 
 * Creates a Razorpay Order in paise (minimum 100 paise = 1 INR)
 * and returns { order_id, amount, currency }
 */
async function createOrder(req, res) {
    try {
        await connectToDatabase();

        const {
            amount,
            billAmountInRupees: inputRupees,
            amountInRupees: altRupees,
            amountInPaise: inputPaise,
            currency = 'INR',
            receipt,
            flatId,
            flat_number,
            roomId,
            room_id,
            residentId,
            billId,
            bill_id,
            month,
            year,
            notes = {}
        } = req.body || {};

        const targetFlat = (flatId || flat_number || roomId || room_id || '').toString().trim();

        let user = null;
        let bill = null;

        if (targetFlat) {
            user = await User.findOne({
                $or: [
                    { flat_number: targetFlat },
                    { _id: targetFlat.match(/^[0-9a-fA-F]{24}$/) ? targetFlat : null },
                    { username: targetFlat }
                ].filter(Boolean)
            });
        }

        const flatNo = user ? user.flat_number : (targetFlat || 'Standard');
        const targetBillId = billId || bill_id;
        if (targetBillId) {
            bill = await Bill.findById(targetBillId);
        }
        if (!bill && flatNo && flatNo !== 'Standard') {
            bill = await Bill.findOne({
                flat_number: flatNo,
                status: 'Unpaid',
                is_archived: { $ne: true }
            }).sort({ created_at: -1 });
        }

        // 1. Determine rent/maintenance total amount in Rupees
        let billAmountInRupees = 0;

        if (inputRupees !== undefined && inputRupees !== null && inputRupees !== '') {
            billAmountInRupees = Number(inputRupees);
        } else if (altRupees !== undefined && altRupees !== null && altRupees !== '') {
            billAmountInRupees = Number(altRupees);
        } else if (inputPaise !== undefined && inputPaise !== null && inputPaise !== '') {
            billAmountInRupees = Number(inputPaise) / 100;
        } else if (amount !== undefined && amount !== null && amount !== '') {
            const raw = Number(amount);
            // If raw amount is passed in paise (>= 100,000 and matches no direct bill amount), convert to Rupees
            if (raw >= 100000 && (!bill || Number(bill.amount) !== raw)) {
                billAmountInRupees = raw / 100;
            } else {
                billAmountInRupees = raw;
            }
        } else if (bill && Number(bill.amount) > 0) {
            billAmountInRupees = Number(bill.amount);
        } else if (user) {
            const c = user.charges || {};
            const sumCharges = (Number(c.rental) || 0) + (Number(c.festival) || 0) + (Number(c.parking) || 0) + (Number(c.others) || 0);
            billAmountInRupees = sumCharges > 0 ? sumCharges : (Number(user.maintenanceAmount) || 2500);
        } else {
            billAmountInRupees = 2500;
        }

        if (isNaN(billAmountInRupees) || billAmountInRupees <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid rent amount in Rupees is required'
            });
        }

        // Convert rent/maintenance total amount in Rupees to strictly integer paise:
        // amount: Math.round(Number(billAmountInRupees) * 100)
        const amountInPaise = parseInt(Math.round(Number(billAmountInRupees) * 100), 10);

        if (amountInPaise < 100) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be at least 100 paise (1 INR)'
            });
        }

        const receiptId = receipt || `rcpt_${flatNo}_${Date.now().toString().slice(-8)}`;

        const orderOptions = {
            amount: amountInPaise,
            currency: currency || 'INR',
            receipt: receiptId,
            notes: {
                ...notes,
                flatId: flatNo,
                residentId: user?._id?.toString() || residentId || '',
                billId: bill?._id?.toString() || '',
                month: month || '',
                year: year || new Date().getFullYear().toString()
            }
        };

        let order;
        try {
            order = await razorpayInstance.orders.create(orderOptions);
        } catch (sdkErr) {
            console.error('❌ Razorpay orders.create error:', sdkErr);
            if (sdkErr.statusCode === 401) {
                return res.status(401).json({
                    success: false,
                    error: 'Razorpay authentication failed. Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
                });
            }
            return res.status(sdkErr.statusCode || 500).json({
                success: false,
                error: sdkErr.error?.description || sdkErr.message || 'Failed to create Razorpay order'
            });
        }

        const residentName = user?.owner_name || user?.resident?.name || `Resident ${flatNo}`;
        const residentEmail = user?.email || user?.resident?.email || '';
        const residentPhone = user?.mobile_number || user?.resident?.phone || '';

        return res.json({
            success: true,
            order_id: order.id,
            id: order.id,
            orderId: order.id,
            amount: order.amount,
            amountInPaise: order.amount,
            amountInRupees: billAmountInRupees,
            currency: order.currency,
            key_id: getKeyId() || process.env.RAZORPAY_KEY_ID,
            keyId: getKeyId() || process.env.RAZORPAY_KEY_ID,
            receipt: order.receipt,
            billId: bill?._id?.toString() || "",
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
 * POST /api/verify-payment or POST /api/rent/verify-payment
 * 
 * Verifies Razorpay checkout signature using HMAC SHA-256 against RAZORPAY_KEY_SECRET.
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * Returns success only if signatures match.
 */
async function verifyPayment(req, res) {
    try {
        await connectToDatabase();

        const {
            order_id,
            payment_id,
            signature,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            flatId,
            flat_number,
            roomId,
            room_id,
            paymentRecordId,
            billId,
            bill_id,
            month
        } = req.body || {};

        const effectiveOrderId = order_id || razorpay_order_id;
        const effectivePaymentId = payment_id || razorpay_payment_id;
        const effectiveSignature = signature || razorpay_signature;

        if (!effectiveOrderId || !effectivePaymentId || !effectiveSignature) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: order_id, payment_id, signature'
            });
        }

        // 1. Cryptographically verify signature using HMAC SHA-256
        const isValid = verifyPaymentSignature(effectiveOrderId, effectivePaymentId, effectiveSignature);

        if (!isValid) {
            console.error(`❌ [Razorpay Signature Mismatch] order: ${effectiveOrderId}, payment: ${effectivePaymentId}`);
            
            // Mark payment record as Failed if found
            if (paymentRecordId) {
                await Payment.findByIdAndUpdate(paymentRecordId, {
                    $set: {
                        status: 'Failed',
                        razorpay_payment_id: effectivePaymentId,
                        razorpay_signature: effectiveSignature
                    }
                }).catch(() => {});
            }

            return res.status(400).json({
                success: false,
                error: 'Payment signature verification failed'
            });
        }

        // 2. Signature match confirmed!
        let payment = null;
        if (paymentRecordId) {
            payment = await Payment.findById(paymentRecordId);
        }
        if (!payment) {
            payment = await Payment.findOne({ razorpay_order_id: effectiveOrderId });
        }

        const targetFlat = flatId || flat_number || roomId || room_id || payment?.flat_number;
        const targetBillId = billId || bill_id || payment?.bill_id;

        // Save official Payment record strictly as 'PAID'
        const billRec = targetBillId ? await Bill.findById(targetBillId) : null;
        
        // Map stored and displayed currency value properly back to Rupees (amountInPaise / 100)
        let paidAmountInRupees = 0;
        if (billRec && Number(billRec.amount) > 0) {
            paidAmountInRupees = Number(billRec.amount);
        } else if (req.body.billAmountInRupees !== undefined && req.body.billAmountInRupees !== null) {
            paidAmountInRupees = Number(req.body.billAmountInRupees);
        } else if (req.body.amountInRupees !== undefined && req.body.amountInRupees !== null) {
            paidAmountInRupees = Number(req.body.amountInRupees);
        } else if (req.body.amountInPaise !== undefined && req.body.amountInPaise !== null) {
            paidAmountInRupees = Number(req.body.amountInPaise) / 100;
        } else if (payment && payment.amount) {
            const rawAmt = Number(payment.amount);
            paidAmountInRupees = (rawAmt >= 100000 && rawAmt % 100 === 0) ? (rawAmt / 100) : rawAmt;
        } else if (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '') {
            const rawAmt = Number(req.body.amount);
            paidAmountInRupees = (rawAmt >= 100000 && rawAmt % 100 === 0) ? (rawAmt / 100) : rawAmt;
        }

        if (!paidAmountInRupees || paidAmountInRupees <= 0) {
            try {
                const rzpOrder = await razorpayInstance.orders.fetch(effectiveOrderId);
                if (rzpOrder && rzpOrder.amount) {
                    paidAmountInRupees = Math.round(Number(rzpOrder.amount)) / 100;
                }
            } catch (e) {}
        }

        if (!paidAmountInRupees || paidAmountInRupees <= 0) {
            paidAmountInRupees = 2700;
        }

        const paidMonth = billRec?.month || billRec?.billing_month || (month ? month : new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }));

        if (payment) {
            payment.status = 'PAID';
            payment.amount = paidAmountInRupees;
            payment.month = paidMonth;
            payment.razorpay_order_id = effectiveOrderId;
            payment.razorpay_payment_id = effectivePaymentId;
            payment.razorpay_signature = effectiveSignature;
            payment.verified_at = new Date();
            await payment.save();
        } else if (targetFlat) {
            payment = new Payment({
                flat_number: targetFlat,
                bill_id: targetBillId,
                amount: paidAmountInRupees,
                month: paidMonth,
                year: new Date().getFullYear(),
                transfer_mode: 'Razorpay',
                razorpay_order_id: effectiveOrderId,
                razorpay_payment_id: effectivePaymentId,
                razorpay_signature: effectiveSignature,
                status: 'PAID',
                verified_at: new Date(),
                created_at: new Date()
            });
            await payment.save();
        }

        // Update flat's Bill status to 'Paid' and save paymentId, orderId, paidAt
        const billSetData = {
            status: 'Paid',
            paymentId: effectivePaymentId,
            orderId: effectiveOrderId,
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

        // Update User / Room rent status to 'paid' in flat_owners collection
        if (targetFlat) {
            await User.findOneAndUpdate(
                { flat_number: targetFlat },
                { $set: { paymentStatus: 'paid' } }
            );
        }

        // Notify Resident via Email if email is configured
        if (targetFlat) {
            const user = await User.findOne({ flat_number: targetFlat });
            const email = user?.email || user?.resident?.email;
            if (email) {
                const subject = `Rent Payment Receipt: Room ${targetFlat} - Maple Apartments`;
                const body = `Hello Room ${targetFlat},\n\nYour rent/maintenance payment has been successfully processed and verified via Razorpay.\n\nPayment ID: ${effectivePaymentId}\nOrder ID: ${effectiveOrderId}\nAmount: ₹${payment?.amount || paidAmountInRupees}\nStatus: PAID\nDate: ${new Date().toLocaleDateString('en-GB')}\n\nThank you for choosing digital payments!\nMaple Apartments Management`;
                sendNotificationEmail(email, subject, body).catch(e => console.error('Receipt email dispatch failed:', e));
            }
        }

        console.log(`✅ [Razorpay Success] Payment verified (Order: ${effectiveOrderId}, Payment ID: ${effectivePaymentId}, Amount: ₹${paidAmountInRupees})`);

        return res.json({
            success: true,
            message: 'Payment verified successfully',
            order_id: effectiveOrderId,
            payment_id: effectivePaymentId,
            orderId: effectiveOrderId,
            paymentId: effectivePaymentId,
            flatNumber: targetFlat,
            amount: paidAmountInRupees,
            amountInRupees: paidAmountInRupees,
            paidAt: new Date().toISOString()
        });

    } catch (err) {
        console.error('❌ Razorpay verify-payment error:', err);
        return res.status(500).json({
            success: false,
            error: err.message || 'Payment verification failed'
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

        // 2. Fetch strictly verified PAID payments from Payment collection
        const payments = await Payment.find({
            status: { $in: ['PAID', 'Verified', 'Paid'] }
        }).sort({ verified_at: -1, created_at: -1 }).lean();

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
        historyList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        // Deduplicate: strictly 1 receipt per flat per billing month (keep latest verified payment)
        const dedupedMap = new Map();
        historyList.forEach(item => {
            const mKey = (item.month || 'Current').trim().toLowerCase().replace(/\s+/g, '_');
            const key = `${item.flat_number}_${mKey}`;
            if (!dedupedMap.has(key)) {
                dedupedMap.set(key, item);
            }
        });
        const finalHistoryList = Array.from(dedupedMap.values());

        // Quick aggregate statistics from verified deduplicated payments
        const totalAmount = finalHistoryList.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
        const razorpayTotal = finalHistoryList
            .filter(item => (item.transfer_mode || '').toLowerCase() === 'razorpay')
            .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
        const razorpayCount = finalHistoryList.filter(item => (item.transfer_mode || '').toLowerCase() === 'razorpay').length;

        res.json({
            success: true,
            totalCount: finalHistoryList.length,
            totalAmount,
            razorpayCount,
            razorpayTotal,
            payments: finalHistoryList
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
