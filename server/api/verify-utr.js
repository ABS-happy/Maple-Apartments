const { connectToDatabase, User, Bill, Payment } = require('./lib/mongodb');
const { sendNotificationEmail } = require('./lib/mailer');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        await connectToDatabase();
        const { bill_id, utr_number, amount, transfer_mode } = req.body;

        if (!bill_id || !utr_number || !amount || !transfer_mode) {
            return res.status(400).json({ error: 'All fields (bill_id, utr_number, amount, transfer_mode) are required.' });
        }

        // Mock failure handling: UTR must be at least 10 chars
        if (utr_number.length < 10) {
            return res.status(400).json({ error: 'Invalid UTR format. Expected typical 12-16 character bank reference.' });
        }

        const bill = await Bill.findById(bill_id);
        if (!bill) {
            return res.status(404).json({ error: 'Bill not found.' });
        }

        if (bill.status === 'Paid') {
            return res.status(400).json({ error: 'This bill is already marked as paid.' });
        }

        // Exact amount validation
        if (parseFloat(amount) !== bill.amount) {
            return res.status(400).json({ error: `Amount mismatch! The expected amount is ₹${bill.amount}, but you entered ₹${amount}.` });
        }

        // Create Payment Record
        const paymentRecord = new Payment({
            bill_id: bill._id,
            flat_number: bill.flat_number,
            utr_number: utr_number,
            amount: parseFloat(amount),
            transfer_mode: transfer_mode,
            status: 'Verified',
            verified_at: new Date()
        });
        await paymentRecord.save();

        // Update Bill
        bill.status = 'Paid';
        bill.paid_at = new Date();
        await bill.save();

        // Update User payment status so admin dashboard immediately reflects Paid
        await User.findOneAndUpdate(
            { flat_number: bill.flat_number },
            { $set: { paymentStatus: 'paid' } }
        );

        // Notify Resident
        const user = await User.findOne({ flat_number: bill.flat_number });
        if (user && (user.email || user.resident?.email)) {
            const email = user.email || user.resident?.email;
            const subject = `Payment Verified - Flat ${bill.flat_number}`;
            const body = `Hello,\n\nYour payment of ₹${amount} for ${bill.bill_type} (UTR: ${utr_number}) has been verified.\n\nThank you!`;
            await sendNotificationEmail(email, subject, body);
        }

        res.json({ message: 'UTR verified successfully!', bill });

    } catch (err) {
        console.error('UTR Verification error:', err);
        res.status(500).json({ error: 'Internal server error while verifying UTR' });
    }
};
