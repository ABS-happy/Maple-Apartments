const { connectToDatabase, User, Bill, Payment } = require('./lib/mongodb');
const { authenticateToken } = require('./lib/auth');
const { sendNotificationEmail } = require('./lib/mailer');

module.exports = async (req, res) => {
    const user = authenticateToken(req);
    if (!user || user.role !== 'Admin') return res.status(401).json({ error: 'Unauthorized' });

    try {
        await connectToDatabase();
        const { action, flat_number, bill_id } = req.body || {};

        // 1. Update bill details / manual transaction (POST or PATCH)
        if (action === 'update-details' || (req.url && req.url.includes('update-details'))) {
            const { flat_number, amount, due_date, method, maintenance, festival, parking, others, status } = req.body || {};
            const targetFlat = flat_number || req.body?.flatNo || req.body?.flat;
            if (!targetFlat) return res.status(400).json({ error: 'flat_number is required' });

            const numAmount = Number(amount) || 0;
            const parsedDueDate = due_date ? new Date(due_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            let bill = await Bill.findOne({ flat_number: targetFlat, is_archived: { $ne: true } }).sort({ created_at: -1 });

            // If recording manual transaction (Cash, UPI, Bank Transfer, or status is paid)
            if (method && (method === 'Cash' || method === 'UPI' || method === 'Bank Transfer' || status === 'paid' || status === 'Paid')) {
                if (bill) {
                    bill.amount = numAmount || bill.amount;
                    bill.status = 'Paid';
                    bill.paid_at = new Date();
                    if (due_date) bill.due_date = parsedDueDate;
                    await bill.save();
                } else {
                    bill = new Bill({
                        flat_number: targetFlat,
                        amount: numAmount || 2500,
                        maintenance: numAmount || 2500,
                        status: 'Paid',
                        paid_at: new Date(),
                        due_date: parsedDueDate,
                        is_draft: false
                    });
                    await bill.save();
                }

                const paymentRecord = new Payment({
                    bill_id: bill._id,
                    flat_number: targetFlat,
                    utr_number: 'MANUAL_' + method.toUpperCase().replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-6),
                    amount: bill.amount,
                    transfer_mode: method,
                    status: 'Verified',
                    verified_at: new Date()
                });
                await paymentRecord.save();

                await User.findOneAndUpdate(
                    { flat_number: targetFlat },
                    { $set: { paymentStatus: 'paid', dueDate: parsedDueDate } }
                );

                return res.json({ success: true, message: `Recorded ${method} payment of ₹${bill.amount} for Room ${targetFlat}`, bill, payment: paymentRecord });
            }

            const maintNum = maintenance !== undefined ? Number(maintenance) : (bill ? bill.maintenance : (numAmount || 2500));
            const festNum = Number(festival) || 0;
            const parkNum = Number(parking) || 0;
            const othNum = Number(others) || 0;
            const total = numAmount || (maintNum + festNum + parkNum + othNum);

            if (bill) {
                bill.maintenance = maintNum;
                bill.festival = festNum;
                bill.parking = parkNum;
                bill.others = othNum;
                bill.amount = total;
                bill.due_date = parsedDueDate;
                if (status) bill.status = status === 'paid' ? 'Paid' : 'Unpaid';
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
                    status: status === 'paid' ? 'Paid' : 'Unpaid'
                });
                await bill.save();
            }

            // Update User
            const userUpdate = {
                charges: { rental: maintNum, festival: festNum, parking: parkNum, others: othNum },
                maintenanceAmount: maintNum,
                dueDate: parsedDueDate
            };
            if (status) userUpdate.paymentStatus = status.toLowerCase();
            await User.findOneAndUpdate({ flat_number: targetFlat }, { $set: userUpdate });

            // Notify Resident
            const resident = await User.findOne({ flat_number: targetFlat });
            const email = resident?.email || resident?.resident?.email;
            if (email) {
                const subject = 'Maple Apartments - Bill Update';
                const body = `Hello Room ${targetFlat},\n\nYour maintenance bill of ₹${total} is due on ${parsedDueDate.toLocaleDateString('en-GB')}.\n\nPlease check your resident dashboard.`;
                await sendNotificationEmail(email, subject, body).catch(() => {});
            }

            return res.json({ success: true, message: `Bill updated for Room ${targetFlat}`, bill });
        }

        // 2. Mark single bill paid
        if (action === 'mark-paid') {
            const resident = await User.findOne({ flat_number, role: 'User' });
            if (!resident) return res.status(404).json({ error: 'Resident not found' });

            resident.paymentStatus = 'paid';
            await resident.save();

            const bill = await Bill.findById(bill_id);
            if (bill) {
                bill.status = 'Paid';
                bill.paid_at = new Date();
                await bill.save();

                const email = resident.email || resident.resident?.email;
                if (email) {
                    const subject = 'Payment Successful - Maple Apartments';
                    const body = `Hello Room ${flat_number},\n\nYour payment of ₹${bill.amount} has been received.\nStatus: PAID\nDate: ${new Date().toLocaleDateString('en-GB')}\n\nThank you!`;
                    await sendNotificationEmail(email, subject, body).catch(() => {});
                }
            }
            return res.json({ success: true });
        }

        // 3. Mark all unpaid
        if (action === 'mark-all-unpaid') {
            await User.updateMany({ role: 'User' }, { $set: { paymentStatus: 'unpaid' } });
            await Bill.updateMany({ is_archived: { $ne: true } }, { $set: { status: 'Unpaid' } });
            return res.json({ success: true, message: 'All reset to Unpaid' });
        }

        // 4. Mark all paid
        if (action === 'mark-all-paid') {
            await User.updateMany({ role: 'User' }, { $set: { paymentStatus: 'paid' } });
            await Bill.updateMany({ is_archived: { $ne: true } }, { $set: { status: 'Paid', paid_at: new Date() } });
            return res.json({ success: true, message: 'All 16 rooms marked as Paid' });
        }

        // 5. Bulk publish
        if (action === 'bulk-publish' || (req.url && req.url.includes('bulk-publish'))) {
            const billsList = Array.isArray(req.body) ? req.body : (req.body.bills || []);
            let updatedCount = 0;
            for (const item of billsList) {
                const flatNo = item.flat_number || item.flatNo || item.roomId;
                if (!flatNo) continue;
                const maintNum = Number(item.maintenance) || 0;
                const festNum = Number(item.festival) || 0;
                const parkNum = Number(item.parking) || 0;
                const othNum = Number(item.others) || 0;
                const total = item.totalAmount !== undefined ? Number(item.totalAmount) : (maintNum + festNum + parkNum + othNum);
                const parsedDueDate = item.dueDate ? new Date(item.dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                const billStatus = (item.payment_status || item.status || 'unpaid').toLowerCase() === 'paid' ? 'Paid' : 'Unpaid';
                
                let bill = await Bill.findOne({ flat_number: flatNo, is_archived: { $ne: true } }).sort({ created_at: -1 });
                if (bill) {
                    bill.maintenance = maintNum; bill.festival = festNum; bill.parking = parkNum; bill.others = othNum;
                    bill.amount = total; bill.due_date = parsedDueDate; bill.status = billStatus; bill.is_draft = false;
                    bill.notification_status = 'Sent'; bill.notified_at = new Date();
                    await bill.save();
                } else {
                    bill = new Bill({
                        flat_number: flatNo, maintenance: maintNum, festival: festNum, parking: parkNum, others: othNum,
                        amount: total, due_date: parsedDueDate, status: billStatus, is_draft: false,
                        notification_status: 'Sent', notified_at: new Date()
                    });
                    await bill.save();
                }

                await User.findOneAndUpdate(
                    { flat_number: flatNo },
                    { $set: {
                        charges: { rental: maintNum, festival: festNum, parking: parkNum, others: othNum },
                        maintenanceAmount: maintNum || 2500, dueDate: parsedDueDate, paymentStatus: billStatus.toLowerCase(),
                        hasDraft: false, notificationStatus: 'Sent'
                    }}
                );
                updatedCount++;
            }
            return res.json({ success: true, count: updatedCount, message: 'All bills have been saved and sent to respective resident dashboards.' });
        }

        // 6. Bulk due date
        if (action === 'bulk-due-date' || (req.url && req.url.includes('bulk-due-date')) || (req.method === 'PATCH' && req.body?.dueDate)) {
            const { dueDate, roomIds } = req.body;
            if (!dueDate) return res.status(400).json({ error: 'dueDate is required' });
            const parsedDate = new Date(dueDate);
            await User.updateMany({ role: 'User' }, { $set: { dueDate: parsedDate, draftDueDate: parsedDate } });
            await Bill.updateMany({ is_archived: { $ne: true } }, { $set: { due_date: parsedDate } });
            return res.json({ success: true, message: 'Due date applied to all units', count: 16, dueDate });
        }

        res.status(400).json({ error: 'Invalid request action' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error: ' + err.message });
    }
};
