const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { connectToDatabase, User, Bill, NotificationLog, Invite, Payment } = require('./server/api/lib/mongodb');
const { authenticateToken } = require('./server/api/lib/auth');
const { sendNotificationEmail } = require('./server/api/lib/mailer');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// URL path normalizer for serverless environments (e.g. Vercel rewrites)
app.use((req, res, next) => {
    if (!req.url.startsWith('/api') && !req.url.startsWith('/public') && !req.url.includes('.')) {
        req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
    next();
});

// Ensure database connection is established for API requests
app.use(async (req, res, next) => {
    if (req.url.startsWith('/api')) {
        try {
            await connectToDatabase();
        } catch (err) {
            console.error('❌ Serverless MongoDB connection error:', err);
            return res.status(500).json({ error: 'Database connection error' });
        }
    }
    next();
});

// Initial database connection attempt for long-running server
connectToDatabase()
    .then(() => console.log('✅ Connected to MongoDB successfully'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// 1. Auth & Registration
const loginHandler = require('./server/api/login');
const registerHandler = require('./server/api/register');
const resetPasswordHandler = require('./server/api/reset-password');
const verifyUtrHandler = require('./server/api/verify-utr');
const billsHandler = require('./server/api/bills');
const complaintsHandler = require('./server/api/complaints');
const notificationsHandler = require('./server/api/notifications');
const remindersHandler = require('./server/api/reminders');
const rentHandler = require('./server/api/rent');

app.post('/api/login', (req, res) => loginHandler(req, res));

// Google OAuth Sign-In Endpoint
app.post('/api/auth/google', async (req, res) => {
    try {
        const { preferredIdentity, email, name } = req.body || {};
        let user = null;

        if (preferredIdentity) {
            const stripped = preferredIdentity.toString().trim().replace(/^(user|resident_?)/i, '');
            user = await User.findOne({
                $or: [
                    { username: new RegExp('^' + preferredIdentity.trim(), 'i') },
                    { username: stripped },
                    { flat_number: preferredIdentity.trim() },
                    { flat_number: stripped },
                    { email: new RegExp('^' + preferredIdentity.trim(), 'i') }
                ]
            });
        }

        if (!user && email) {
            user = await User.findOne({
                $or: [
                    { email: new RegExp('^' + email.trim(), 'i') },
                    { 'resident.email': new RegExp('^' + email.trim(), 'i') }
                ]
            });
        }

        if (!user) {
            user = await User.findOne({ role: 'User' }).sort({ flat_number: 1 });
        }

        if (!user) {
            return res.status(404).json({ error: 'No associated resident account found.' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role, flat_number: user.flat_number },
            process.env.JWT_SECRET || 'your_secret_key',
            { expiresIn: '24h' }
        );

        const resolvedName = user.owner_name || (user.resident && user.resident.name) || name || ('Resident ' + user.flat_number);
        const userResponse = {
            id: user._id,
            username: user.username,
            role: user.role,
            flat_number: user.flat_number,
            owner_name: resolvedName,
            name: resolvedName
        };

        res.json({
            success: true,
            token,
            user: userResponse,
            redirectUrl: user.role === 'Admin' ? '/admin' : '/dashboard'
        });
    } catch (err) {
        console.error('Google Auth Error:', err);
        res.status(500).json({ error: 'Google sign-in error: ' + err.message });
    }
});

app.post('/api/register', (req, res) => registerHandler(req, res));
app.post('/api/reset-password', (req, res) => resetPasswordHandler(req, res));
app.post('/api/verify-utr', (req, res) => verifyUtrHandler(req, res));
app.all('/api/reminders', (req, res) => remindersHandler(req, res));

// Razorpay Rent Payment Endpoints (Test Mode)
app.post('/api/rent/create-order', (req, res) => rentHandler.createOrder(req, res));
app.post('/api/rent/verify-payment', (req, res) => rentHandler.verifyPayment(req, res));
app.get('/api/rent/receipts/:flatNumber', (req, res) => rentHandler.getReceiptsForFlat(req, res));
app.get('/api/payments/all', (req, res) => rentHandler.getAllPaymentsHistory(req, res));

// 2. Overview & Rooms API
const overviewController = require('./server/controllers/overviewController');

app.get('/api/overview/rooms', (req, res) => overviewController.getOverview(req, res));
app.get('/api/rooms', (req, res) => {
    if (req.query.flat_number) {
        return require('./server/api/rooms')(req, res);
    }
    return overviewController.getOverview(req, res);
});
app.put('/api/rooms/bulk-update', (req, res) => overviewController.bulkUpdateRooms(req, res));
app.put('/api/rooms/:roomId/status', (req, res) => overviewController.updateStatus(req, res));
app.put('/api/rooms/:roomId', (req, res) => overviewController.updateRoom(req, res));

app.get('/api/rooms/:flatNo/history', async (req, res) => {
    try {
        const { flatNo } = req.params;
        const bills = await Bill.find({ flat_number: flatNo, status: 'Paid' }).sort({ paid_at: -1, created_at: -1 }).lean();
        const payments = await Payment.find({ flat_number: flatNo, status: { $in: ['PAID', 'Verified', 'Paid'] } }).sort({ verified_at: -1, created_at: -1 }).lean();

        const historyItems = [];

        // 1. Add verified recorded payments
        payments.forEach(p => {
            const bill = bills.find(b => b._id && b._id.toString() === (p.bill_id ? p.bill_id.toString() : ''));
            const month = p.month || bill?.month || bill?.billing_month || (p.verified_at ? new Date(p.verified_at).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : 'Current Month');
            historyItems.push({
                month,
                amount: p.amount,
                method: p.transfer_mode || 'Razorpay',
                paidDate: p.verified_at || p.created_at,
                status: 'Paid',
                flat_number: flatNo,
                razorpay_payment_id: p.razorpay_payment_id || '',
                razorpay_order_id: p.razorpay_order_id || ''
            });
        });

        // 2. Add paid bills that don't have separate payment records
        bills.forEach(b => {
            const hasPayment = payments.some(p => p.bill_id && p.bill_id.toString() === b._id.toString());
            if (!hasPayment) {
                const month = b.month || b.billing_month || (b.due_date ? new Date(b.due_date).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : 'Current Month');
                historyItems.push({
                    month,
                    amount: b.amount,
                    method: b.paymentId ? 'Razorpay' : 'Bank / Admin Verified',
                    paidDate: b.paid_at || b.due_date || b.created_at,
                    status: 'Paid',
                    flat_number: flatNo,
                    razorpay_payment_id: b.paymentId || ''
                });
            }
        });

        // Sort latest first
        historyItems.sort((a, b) => new Date(b.paidDate || 0) - new Date(a.paidDate || 0));

        // Deduplicate: strictly 1 receipt per billing month
        const deduped = [];
        const seen = new Set();
        historyItems.forEach(item => {
            const key = (item.month || 'Current').trim().toLowerCase().replace(/\s+/g, '_');
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(item);
            }
        });

        // If no verified payment done yet, returns clean empty array []
        res.json(deduped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Residents & Profiles
app.get('/api/residents', async (req, res) => {
    try {
        const { search, floor } = req.query;
        let filter = { role: 'User' };
        if (search) {
            filter.$or = [
                { flat_number: new RegExp(search, 'i') },
                { owner_name: new RegExp(search, 'i') },
                { 'resident.name': new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { mobile_number: new RegExp(search, 'i') }
            ];
        }
        if (floor && floor !== 'All') {
            filter.flat_number = new RegExp(`^${floor}`);
        }

        const residents = await User.find(filter).sort({ flat_number: 1 }).lean();
        const formatted = residents.map(r => ({
            _id: r._id,
            flat_number: r.flat_number,
            username: r.username,
            mobile_number: r.mobile_number,
            email: r.email,
            owner_name: r.owner_name || r.resident?.name || `Owner ${r.flat_number}`,
            resident: r.resident || { name: r.owner_name || `Owner ${r.flat_number}`, phone: r.mobile_number, email: r.email },
            maintenance_charge: r.charges?.rental || r.maintenanceAmount || 2500,
            parking_charge: r.charges?.parking || 0,
            paymentStatus: r.paymentStatus || 'unpaid',
            dueDate: r.dueDate,
            isOccupied: r.isOccupied !== false
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/residents/export/csv', async (req, res) => {
    try {
        const residents = await User.find({ role: 'User' }).sort({ flat_number: 1 }).lean();
        let csv = 'Flat Number,Resident Name,Mobile Number,Email,Ownership Type,Payment Status,Maintenance Charge,Due Date\n';
        for (const r of residents) {
            const name = (r.owner_name || r.resident?.name || `Owner ${r.flat_number}`).replace(/"/g, '""');
            const phone = r.mobile_number || '';
            const email = r.email || '';
            const type = r.ownership_type || 'Owner';
            const status = r.paymentStatus || 'unpaid';
            const charge = (r.charges?.rental || r.maintenanceAmount || 2500);
            const dueDate = r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-GB') : '';
            csv += `"${r.flat_number}","${name}","${phone}","${email}","${type}","${status}",${charge},"${dueDate}"\n`;
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="maple_residents.csv"');
        res.send(csv);
    } catch (err) {
        res.status(500).send('Error generating CSV: ' + err.message);
    }
});

app.post('/api/residents/:id/vacate', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'Resident not found' });
        user.isOccupied = !user.isOccupied;
        await user.save();
        res.json({ success: true, isOccupied: user.isOccupied });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/residents/:flatNo/profile', async (req, res) => {
    try {
        const { flatNo } = req.params;
        const user = await User.findOne({ flat_number: flatNo });
        if (!user) return res.status(404).json({ error: 'Resident not found' });

        const ownerName = user.owner_name || user.resident?.name || `Owner ${user.flat_number}`;
        const phone = user.mobile_number || user.resident?.phone || '';
        const email = user.email || user.resident?.email || '';
        const prof = user.profile || {};

        res.json({
            email,
            phone,
            user: {
                username: user.username,
                owner_name: ownerName,
                flat_number: user.flat_number,
                mobile_number: phone,
                email: email,
                role: user.role
            },
            profile: {
                name: ownerName,
                phone: phone,
                email: email,
                flat: user.flat_number,
                residents: prof.residents || '',
                year: prof.year || '',
                status: prof.status || (user.ownership_type || 'Self Occupied'),
                pets: prof.pets || ''
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/residents/:flatNo/profile', async (req, res) => {
    try {
        const { flatNo } = req.params;
        const { profile } = req.body || {};
        if (!profile) return res.status(400).json({ error: 'Profile data is required' });

        const updateSet = {
            'profile.residents': profile.residents || '',
            'profile.year': profile.year || '',
            'profile.status': profile.status || 'Self Occupied',
            'profile.pets': profile.pets || ''
        };
        if (profile.phone) {
            updateSet.mobile_number = profile.phone;
            updateSet['resident.phone'] = profile.phone;
        }

        const user = await User.findOneAndUpdate(
            { flat_number: flatNo },
            { $set: updateSet },
            { new: true }
        );
        res.json({ success: true, message: 'Profile updated successfully', profile: user.profile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/user/update-profile', async (req, res) => {
    try {
        const { owner_name, flat_number, email, mobile_number } = req.body;
        const updateData = {};
        if (owner_name) {
            updateData.owner_name = owner_name;
            updateData['resident.name'] = owner_name;
        }
        if (email) {
            updateData.email = email;
            updateData['resident.email'] = email;
        }
        if (mobile_number) {
            updateData.mobile_number = mobile_number;
            updateData['resident.phone'] = mobile_number;
        }

        const updated = await User.findOneAndUpdate(
            { flat_number },
            { $set: updateData },
            { new: true }
        );
        res.json({ success: true, user: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Bills API
app.get('/api/bills', async (req, res) => {
    try {
        const bills = await Bill.find({}).sort({ created_at: -1 });
        res.json(bills);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bills/:flat_number', async (req, res) => {
    try {
        const flatNo = req.params.flat_number;
        const resident = await User.findOne({ flat_number: flatNo, role: 'User' });

        let bills = await Bill.find({ 
            flat_number: flatNo,
            is_draft: { $ne: true },
            is_archived: { $ne: true }
        }).sort({ created_at: -1 });

        // If no bill exists yet or active bill is missing for this flat, auto-sync from resident profile
        if (bills.length === 0 && resident) {
            const c = resident.charges || {};
            const maint = Number(c.rental) || Number(resident.maintenanceAmount) || 2500;
            const fest = Number(c.festival) || 0;
            const park = Number(c.parking) || 0;
            const oth = Number(c.others) || 0;
            const total = maint + fest + park + oth;
            const dueDate = resident.dueDate || new Date('2026-11-15T00:00:00.000Z');
            const status = (resident.paymentStatus || 'unpaid').toLowerCase() === 'paid' ? 'Paid' : 'Unpaid';

            const newBill = new Bill({
                flat_number: flatNo,
                bill_type: 'Maintenance',
                maintenance: maint,
                festival: fest,
                parking: park,
                others: oth,
                amount: total,
                due_date: dueDate,
                status: status,
                is_draft: false,
                notification_status: resident.notificationStatus || 'Sent',
                notified_at: new Date()
            });
            await newBill.save();
            bills = [newBill];
        }

        res.json(bills);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Archived Bills Endpoint
app.get('/api/bills/:flat_number/archived', async (req, res) => {
    try {
        const flatNo = req.params.flat_number;
        const archivedBills = await Bill.find({
            flat_number: flatNo,
            is_archived: true
        }).sort({ created_at: -1 });
        res.json(archivedBills);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Archive Bill Endpoint
app.put('/api/bills/:billId/archive', async (req, res) => {
    try {
        const bill = await Bill.findByIdAndUpdate(
            req.params.billId,
            { $set: { is_archived: true } },
            { new: true }
        );
        if (!bill) return res.status(404).json({ error: 'Bill not found' });
        res.json({ success: true, message: 'Bill archived successfully', bill });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Restore Bill Endpoint
app.put('/api/bills/:billId/restore', async (req, res) => {
    try {
        const bill = await Bill.findByIdAndUpdate(
            req.params.billId,
            { $set: { is_archived: false } },
            { new: true }
        );
        if (!bill) return res.status(404).json({ error: 'Bill not found' });
        res.json({ success: true, message: 'Bill restored successfully', bill });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Bill Endpoint
app.delete('/api/bills/:billId', async (req, res) => {
    try {
        const bill = await Bill.findByIdAndDelete(req.params.billId);
        if (!bill) return res.status(404).json({ error: 'Bill not found' });
        res.json({ success: true, message: 'Bill deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Draft Endpoint: PATCH /api/admin/bills/:billId/draft & /api/admin/bills/draft
const handleSaveDraft = async (req, res) => {
    const admin = authenticateToken(req);
    if (!admin || admin.role !== 'Admin') {
        return res.status(401).json({ error: 'Unauthorized: Admin access required' });
    }

    try {
        const billId = req.params.billId;
        const { flat_number, maintenance, festival, parking, others, due_date, resident_name, status } = req.body;
        
        let targetFlat = flat_number;
        let bill = null;

        if (billId && mongoose.isValidObjectId(billId)) {
            bill = await Bill.findById(billId);
            if (bill) targetFlat = bill.flat_number;
        } else if (billId && !targetFlat) {
            targetFlat = billId;
        }

        if (!targetFlat) {
            return res.status(400).json({ error: 'flat_number or billId is required' });
        }

        const maintNum = Number(maintenance) || 0;
        const festNum = Number(festival) || 0;
        const parkNum = Number(parking) || 0;
        const othNum = Number(others) || 0;
        const total = maintNum + festNum + parkNum + othNum;
        const parsedDueDate = due_date ? new Date(due_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        if (!bill) {
            bill = await Bill.findOne({ flat_number: targetFlat, is_archived: { $ne: true } }).sort({ created_at: -1 });
        }

        if (bill) {
            bill.maintenance = maintNum;
            bill.festival = festNum;
            bill.parking = parkNum;
            bill.others = othNum;
            bill.amount = total;
            bill.due_date = parsedDueDate;
            bill.is_draft = true;
            if (status) bill.status = status;
            await bill.save();
        } else {
            bill = new Bill({
                flat_number: targetFlat,
                maintenance: maintNum,
                festival: festNum,
                parking: parkNum,
                others: othNum,
                amount: total,
                due_date: parsedDueDate,
                is_draft: true,
                status: status || 'Unpaid'
            });
            await bill.save();
        }

        // Update User / Room draft fields
        const userUpdate = {
            hasDraft: true,
            draftCharges: { rental: maintNum, festival: festNum, parking: parkNum, others: othNum },
            draftDueDate: parsedDueDate
        };
        if (resident_name) {
            userUpdate['resident.name'] = resident_name;
            userUpdate.owner_name = resident_name;
        }

        await User.findOneAndUpdate(
            { flat_number: targetFlat },
            { $set: userUpdate }
        );

        console.log(`[Draft Saved] Room ${targetFlat}: ₹${total}`);
        return res.json({
            success: true,
            message: `Draft saved for Room ${targetFlat}`,
            bill: {
                _id: bill._id,
                flat_number: bill.flat_number,
                amount: bill.amount,
                maintenance: bill.maintenance,
                festival: bill.festival,
                parking: bill.parking,
                others: bill.others,
                due_date: bill.due_date,
                is_draft: true,
                status: bill.status
            }
        });
    } catch (err) {
        console.error('Error in handleSaveDraft:', err);
        return res.status(500).json({ error: 'Failed to save draft: ' + err.message });
    }
};

// Publish & Send Endpoint: POST /api/admin/bills/:billId/publish-and-send & /api/admin/bills/publish-and-send
const handlePublishAndSend = async (req, res) => {
    const admin = authenticateToken(req);
    if (!admin || admin.role !== 'Admin') {
        return res.status(401).json({ error: 'Unauthorized: Admin access required' });
    }

    try {
        const billId = req.params.billId;
        const { flat_number, maintenance, festival, parking, others, due_date, resident_name, payment_status } = req.body;
        
        let targetFlat = flat_number;
        let bill = null;

        if (billId && mongoose.isValidObjectId(billId)) {
            bill = await Bill.findById(billId);
            if (bill) targetFlat = bill.flat_number;
        } else if (billId && !targetFlat) {
            targetFlat = billId;
        }

        if (!targetFlat) {
            return res.status(400).json({ error: 'flat_number or billId is required' });
        }

        const maintNum = Number(maintenance) || 0;
        const festNum = Number(festival) || 0;
        const parkNum = Number(parking) || 0;
        const othNum = Number(others) || 0;
        const total = maintNum + festNum + parkNum + othNum;
        const parsedDueDate = due_date ? new Date(due_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const billStatus = payment_status === 'paid' ? 'Paid' : 'Unpaid';

        if (!bill) {
            bill = await Bill.findOne({ flat_number: targetFlat, is_archived: { $ne: true } }).sort({ created_at: -1 });
        }

        if (bill) {
            bill.maintenance = maintNum;
            bill.festival = festNum;
            bill.parking = parkNum;
            bill.others = othNum;
            bill.amount = total;
            bill.due_date = parsedDueDate;
            bill.status = billStatus;
            bill.is_draft = false; // PUBLISHED
            bill.notification_status = 'Sent';
            bill.notified_at = new Date();
            await bill.save();
        } else {
            bill = new Bill({
                flat_number: targetFlat,
                maintenance: maintNum,
                festival: festNum,
                parking: parkNum,
                others: othNum,
                amount: total,
                due_date: parsedDueDate,
                status: billStatus,
                is_draft: false, // PUBLISHED
                notification_status: 'Sent',
                notified_at: new Date()
            });
            await bill.save();
        }

        // Commit active charges to User & clear draft
        const userUpdate = {
            charges: { rental: maintNum, festival: festNum, parking: parkNum, others: othNum },
            maintenanceAmount: maintNum || 2500,
            dueDate: parsedDueDate,
            paymentStatus: billStatus.toLowerCase(),
            hasDraft: false,
            notificationStatus: 'Sent',
            draftCharges: { rental: maintNum, festival: festNum, parking: parkNum, others: othNum },
            draftDueDate: parsedDueDate
        };
        if (resident_name) {
            userUpdate['resident.name'] = resident_name;
            userUpdate.owner_name = resident_name;
        }

        const residentUser = await User.findOneAndUpdate(
            { flat_number: targetFlat },
            { $set: userUpdate },
            { new: true }
        );

        // Record in NotificationLog
        const formattedDate = parsedDueDate.toLocaleDateString('en-GB');
        const notifTitle = `Room ${targetFlat} - Bill Published`;
        const notifMsg = `Official bill of ₹${total} published for Room ${targetFlat}. Due date: ${formattedDate}.`;
        await new NotificationLog({
            title: notifTitle,
            message: notifMsg,
            type: 'bill_dispatch',
            sentAt: new Date()
        }).save();

        // Dispatch notification email
        const email = residentUser?.email || residentUser?.resident?.email;
        if (email) {
            const subject = `Official Bill Update: Room ${targetFlat} - Maple Apartments`;
            const body = `Hello Room ${targetFlat},\n\nYour updated maintenance bill for ₹${total} is now published and due on ${formattedDate}.\n\nFee Breakdown:\n- Maintenance: ₹${maintNum}\n- Festival: ₹${festNum}\n- Parking: ₹${parkNum}\n- Others: ₹${othNum}\n\nTotal Due: ₹${total}\n\nPlease visit your Maple Apartments resident portal to review details and complete payment.\n\nThank you,\nMaple Apartments Management`;
            await sendNotificationEmail(email, subject, body);
        }

        console.log(`[Bill Published & Sent] Room ${targetFlat}: ₹${total}`);
        return res.json({
            success: true,
            message: `Updated bill sent to Room ${targetFlat} successfully!`,
            bill: {
                _id: bill._id,
                flat_number: bill.flat_number,
                amount: bill.amount,
                maintenance: bill.maintenance,
                festival: bill.festival,
                parking: bill.parking,
                others: bill.others,
                due_date: bill.due_date,
                is_draft: false,
                status: bill.status,
                notification_status: 'Sent',
                notified_at: bill.notified_at
            }
        });
    } catch (err) {
        console.error('Error in handlePublishAndSend:', err);
        return res.status(500).json({ error: 'Failed to publish and send bill: ' + err.message });
    }
};

// Bulk Due Date Endpoint: PATCH /api/admin/bills/bulk-due-date
const handleBulkDueDate = async (req, res) => {
    const admin = authenticateToken(req);
    if (!admin || admin.role !== 'Admin') {
        return res.status(401).json({ error: 'Unauthorized: Admin access required' });
    }

    try {
        const { dueDate, roomIds } = req.body;
        if (!dueDate) {
            return res.status(400).json({ error: 'dueDate is required (YYYY-MM-DD)' });
        }

        const parsedDate = new Date(dueDate);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        let userFilter = { role: 'User' };
        let billFilter = { is_archived: { $ne: true } };

        if (roomIds && Array.isArray(roomIds) && roomIds.length > 0 && !roomIds.includes('all')) {
            const validObjIds = roomIds.filter(id => mongoose.isValidObjectId(id));
            userFilter = {
                role: 'User',
                $or: [
                    { _id: { $in: validObjIds } },
                    { flat_number: { $in: roomIds } }
                ]
            };
            billFilter = {
                is_archived: { $ne: true },
                $or: [
                    { _id: { $in: validObjIds } },
                    { flat_number: { $in: roomIds } }
                ]
            };
        }

        const userResult = await User.updateMany(userFilter, {
            $set: {
                dueDate: parsedDate,
                draftDueDate: parsedDate
            }
        });

        const billResult = await Bill.updateMany(billFilter, {
            $set: {
                due_date: parsedDate
            }
        });

        console.log(`[Bulk Due Date] Applied ${dueDate} to ${userResult.modifiedCount || 16} rooms`);
        return res.json({
            success: true,
            message: 'Due date applied to all units successfully.',
            count: userResult.modifiedCount || billResult.modifiedCount || 16,
            dueDate: parsedDate.toISOString().split('T')[0]
        });
    } catch (err) {
        console.error('Error in handleBulkDueDate:', err);
        return res.status(500).json({ error: 'Failed to update bulk due date: ' + err.message });
    }
};

// Bulk Notification Endpoint: POST /api/admin/notifications/bulk-send
const handleBulkNotification = async (req, res) => {
    const admin = authenticateToken(req);
    if (!admin || admin.role !== 'Admin') {
        return res.status(401).json({ error: 'Unauthorized: Admin access required' });
    }

    try {
        const { message, title, targetRooms } = req.body;
        const notifTitle = title || 'Monthly Bill Reminder';
        const notifMsg = message || 'Dear Resident, this is a reminder regarding your apartment maintenance dues. Please review your dashboard for details.';

        await new NotificationLog({
            title: notifTitle,
            message: notifMsg,
            type: 'broadcast',
            sentAt: new Date()
        }).save();

        let userFilter = { role: 'User' };
        let billFilter = { is_archived: { $ne: true } };

        if (targetRooms && Array.isArray(targetRooms) && targetRooms.length > 0 && !targetRooms.includes('all')) {
            userFilter = { role: 'User', flat_number: { $in: targetRooms } };
            billFilter = { is_archived: { $ne: true }, flat_number: { $in: targetRooms } };
        }

        await User.updateMany(userFilter, {
            $set: { notificationStatus: 'Sent' }
        });

        await Bill.updateMany(billFilter, {
            $set: {
                notification_status: 'Sent',
                notified_at: new Date()
            }
        });

        // Asynchronously dispatch notification emails
        const residents = await User.find(userFilter).lean();
        const emailPromises = residents.map(r => {
            const email = r.email || r.resident?.email;
            if (email) {
                return sendNotificationEmail(email, `${notifTitle} - Maple Apartments`, notifMsg).catch(() => {});
            }
            return Promise.resolve();
        });
        Promise.all(emailPromises).catch(e => console.error('Bulk email error:', e));

        console.log(`[Bulk Notification] Broadcast sent to ${residents.length} units`);
        return res.json({
            success: true,
            count: residents.length,
            message: 'Notification broadcast sent to all residents successfully.'
        });
    } catch (err) {
        console.error('Error in handleBulkNotification:', err);
        return res.status(500).json({ error: 'Failed to send bulk notifications: ' + err.message });
    }
};

// Bulk Publish Bills Endpoint: POST /api/admin/bills/bulk-publish
const handleBulkPublish = async (req, res) => {
    const admin = authenticateToken(req);
    if (!admin || admin.role !== 'Admin') {
        return res.status(401).json({ error: 'Unauthorized: Admin access required' });
    }

    try {
        let billsList = Array.isArray(req.body) ? req.body : (req.body.bills || []);
        if (!billsList || billsList.length === 0) {
            const allUsers = await User.find({ role: 'User' }).lean();
            billsList = allUsers.map(u => ({
                flat_number: u.flat_number,
                maintenance: u.charges?.rental || u.maintenanceAmount || 2500,
                festival: u.charges?.festival || 0,
                parking: u.charges?.parking || 0,
                others: u.charges?.others || 0,
                dueDate: u.dueDate || new Date('2026-11-15T00:00:00.000Z'),
                resident_name: u.owner_name || u.resident?.name,
                payment_status: u.paymentStatus || 'unpaid'
            }));
        }

        let updatedCount = 0;

        for (const item of billsList) {
            const flatNo = item.flat_number || item.flatNo || item.roomId;
            if (!flatNo) continue;

            const maintNum = Number(item.maintenance) || 0;
            const festNum = Number(item.festival) || 0;
            const parkNum = Number(item.parking) || 0;
            const othNum = Number(item.others) || 0;
            const total = item.totalAmount !== undefined 
                ? Number(item.totalAmount) 
                : (maintNum + festNum + parkNum + othNum);
            const dueDateVal = item.dueDate || item.due_date;
            const parsedDueDate = dueDateVal ? new Date(dueDateVal) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            const billStatus = (item.payment_status || item.status || 'unpaid').toLowerCase() === 'paid' ? 'Paid' : 'Unpaid';
            const residentName = item.resident_name || item.resident;

            let bill = await Bill.findOne({ flat_number: flatNo, is_archived: { $ne: true } }).sort({ created_at: -1 });
            if (bill) {
                bill.maintenance = maintNum;
                bill.festival = festNum;
                bill.parking = parkNum;
                bill.others = othNum;
                bill.amount = total;
                bill.due_date = parsedDueDate;
                bill.status = billStatus;
                bill.is_draft = false; // PUBLISHED
                bill.notification_status = 'Sent';
                bill.notified_at = new Date();
                await bill.save();
            } else {
                bill = new Bill({
                    flat_number: flatNo,
                    maintenance: maintNum,
                    festival: festNum,
                    parking: parkNum,
                    others: othNum,
                    amount: total,
                    due_date: parsedDueDate,
                    status: billStatus,
                    is_draft: false,
                    notification_status: 'Sent',
                    notified_at: new Date()
                });
                await bill.save();
            }

            const userUpdate = {
                charges: { rental: maintNum, festival: festNum, parking: parkNum, others: othNum },
                maintenanceAmount: maintNum || 2500,
                dueDate: parsedDueDate,
                paymentStatus: billStatus.toLowerCase(),
                hasDraft: false,
                notificationStatus: 'Sent',
                draftCharges: { rental: maintNum, festival: festNum, parking: parkNum, others: othNum },
                draftDueDate: parsedDueDate
            };
            if (residentName) {
                userUpdate['resident.name'] = residentName;
                userUpdate.owner_name = residentName;
            }

            await User.findOneAndUpdate(
                { flat_number: flatNo },
                { $set: userUpdate },
                { new: true }
            );

            updatedCount++;
        }

        await new NotificationLog({
            title: 'All Bills Saved & Published',
            message: `Official bills updated and published across all ${updatedCount} units.`,
            type: 'bulk_bill_dispatch',
            sentAt: new Date()
        }).save();

        console.log(`[Bulk Publish] Committed & Published bills for ${updatedCount} units`);
        return res.json({
            success: true,
            count: updatedCount,
            message: 'All bills have been saved and sent to respective resident dashboards.'
        });
    } catch (err) {
        console.error('Error in handleBulkPublish:', err);
        return res.status(500).json({ error: 'Failed to bulk publish bills: ' + err.message });
    }
};

app.all('/api/admin/bills/bulk-due-date', handleBulkDueDate);
app.all('/api/admin/notifications/bulk-send', handleBulkNotification);
app.all('/api/admin/bills/bulk-publish', handleBulkPublish);

app.all('/api/admin/bills/:billId/draft', handleSaveDraft);
app.all('/api/admin/bills/draft', handleSaveDraft);
app.all('/api/admin/bills/:billId/publish-and-send', handlePublishAndSend);
app.all('/api/admin/bills/publish-and-send', handlePublishAndSend);

app.all('/api/bills/update-details', (req, res) => {
    req.body = req.body || {};
    req.body.action = 'update-details';
    return billsHandler(req, res);
});

app.post('/api/admin/bills/mark-all-unpaid', (req, res) => {
    req.body.action = 'mark-all-unpaid';
    return billsHandler(req, res);
});

app.post('/api/admin/bills/mark-all-paid', (req, res) => {
    req.body = req.body || {};
    req.body.action = 'mark-all-paid';
    return billsHandler(req, res);
});

app.post('/api/payments/record', async (req, res) => {
    try {
        const { flat_number, amount, month, method } = req.body || {};
        if (!flat_number) return res.status(400).json({ error: 'flat_number is required' });
        const numAmount = Number(amount) || 2500;
        const transferMode = method || 'Cash';

        let bill = await Bill.findOne({ flat_number, is_archived: { $ne: true } }).sort({ created_at: -1 });
        if (bill) {
            bill.status = 'Paid';
            bill.paid_at = new Date();
            await bill.save();
        } else {
            bill = new Bill({
                flat_number,
                amount: numAmount,
                maintenance: numAmount,
                status: 'Paid',
                paid_at: new Date(),
                due_date: new Date(),
                is_draft: false
            });
            await bill.save();
        }

        const payment = new Payment({
            bill_id: bill._id,
            flat_number,
            utr_number: 'REC_' + Date.now().toString().slice(-6),
            amount: numAmount,
            transfer_mode: transferMode,
            status: 'Verified',
            verified_at: new Date()
        });
        await payment.save();

        await User.findOneAndUpdate({ flat_number }, { $set: { paymentStatus: 'paid' } });
        res.json({ success: true, message: `Payment recorded for Room ${flat_number}`, payment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/bills/send-to-all', (req, res) => {
    res.json({ success: true, message: 'Bills dispatched to all units' });
});

app.post('/api/admin/rooms/:flatNo/mark-:status', async (req, res) => {
    try {
        const { flatNo, status } = req.params;
        const paymentStatus = status.toLowerCase(); // 'paid' or 'unpaid'
        
        await User.findOneAndUpdate(
            { flat_number: flatNo },
            { $set: { paymentStatus } }
        );

        await Bill.updateMany(
            { flat_number: flatNo, is_archived: { $ne: true } },
            { $set: { status: paymentStatus === 'paid' ? 'Paid' : 'Unpaid', paid_at: paymentStatus === 'paid' ? new Date() : null } }
        );

        res.json({ success: true, flat_number: flatNo, paymentStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.all('/api/bills', (req, res) => billsHandler(req, res));
app.all('/api/admin/bills', (req, res) => billsHandler(req, res));

// 5. Defaulters API
app.get('/api/defaulters', async (req, res) => {
    try {
        const users = await User.find({ role: 'User' }).lean();
        const bills = await Bill.find({ status: 'Unpaid', is_archived: { $ne: true } }).lean();

        const defaulters = users
            .filter(u => u.paymentStatus !== 'paid')
            .map((u, idx) => {
                const userBills = bills.filter(b => b.flat_number === u.flat_number);
                const total = userBills.reduce((acc, b) => acc + (b.amount || 0), 0) || u.maintenanceAmount || 2500;
                const mos = Math.max(userBills.length, 1);
                const risk = mos >= 3 ? 'High' : mos >= 2 ? 'Medium' : 'Low';
                return {
                    roomId: u._id,
                    roomNumber: u.flat_number,
                    residentName: u.resident?.name || u.owner_name || `Owner ${u.flat_number}`,
                    consecutiveMonthsUnpaid: mos,
                    totalUnpaidAmount: total,
                    riskScore: risk
                };
            })
            .sort((a, b) => b.totalUnpaidAmount - a.totalUnpaidAmount);

        res.json(defaulters);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/defaulters/:roomId/history', async (req, res) => {
    try {
        const user = await User.findById(req.params.roomId);
        if (!user) return res.status(404).json({ error: 'Room not found' });
        const bills = await Bill.find({ flat_number: user.flat_number }).sort({ created_at: -1 });
        res.json({ roomNumber: user.flat_number, bills });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Notifications API
app.post('/api/admin/send-manual-email', (req, res) => {
    req.body.action = 'send-manual';
    return notificationsHandler(req, res);
});

app.post('/api/notifications/send', (req, res) => {
    req.body.action = 'send-manual';
    return notificationsHandler(req, res);
});

app.post('/api/notifications/broadcast', (req, res) => {
    req.body.action = 'broadcast';
    return notificationsHandler(req, res);
});

app.get('/api/notifications/history', async (req, res) => {
    try {
        const logs = await NotificationLog.find({}).sort({ sentAt: -1 }).limit(50);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.all('/api/notifications', (req, res) => notificationsHandler(req, res));

// 7. Complaints API
app.all('/api/admin/complaints', (req, res) => complaintsHandler(req, res));
app.all('/api/admin/complaints/:id', (req, res) => complaintsHandler(req, res));
app.all('/api/complaints', (req, res) => complaintsHandler(req, res));
app.all('/api/complaints/:flat_number', (req, res) => complaintsHandler(req, res));


// -------------------------------------------------------------
// Static File Serving with Clean URLs
// -------------------------------------------------------------
const publicDir = path.join(__dirname, 'public');

// Clean URLs handler: if someone requests /admin-dashboard, serve /admin-dashboard.html
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    
    // Skip if path has a file extension or is an API route
    if (req.path.startsWith('/api') || path.extname(req.path)) {
        return next();
    }

    if (req.path === '/admin') {
        return res.sendFile(path.join(publicDir, 'admin-dashboard.html'));
    }
    if (req.path === '/dashboard') {
        return res.sendFile(path.join(publicDir, 'user-dashboard.html'));
    }

    const htmlPath = path.join(publicDir, `${req.path}.html`);
    if (fs.existsSync(htmlPath)) {
        return res.sendFile(htmlPath);
    }

    next();
});

// Serve static assets from public directory
app.use(express.static(publicDir));

// Fallback route: serve index.html for root or unknown frontend pages
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(path.join(publicDir, 'index.html'));
});

// -------------------------------------------------------------
// Start Express Server
// -------------------------------------------------------------
// Start Express Server (Standalone Node runtime)
if (require.main === module && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n======================================================`);
        console.log(`🍁 Maple Apartments Server is running!`);
        console.log(`🌐 Local URL: http://localhost:${PORT}`);
        console.log(`🔐 Admin Login: username: admin101 | password: Password101`);
        console.log(`               or username: admin    | password: admin2026`);
        console.log(`======================================================\n`);
    });
}

// Export Express app for Vercel Serverless Function runtime
module.exports = app;
