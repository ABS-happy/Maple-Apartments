const { connectToDatabase, User, Bill } = require('./lib/mongodb');
const { sendNotificationEmail } = require('./lib/mailer');

module.exports = async (req, res) => {
    // Note: Secure this with an API key if calling from an external cron service
    try {
        await connectToDatabase();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Find Unpaid bills due today or tomorrow
        const pendingBills = await Bill.find({ 
            status: 'Unpaid', 
            is_archived: { $ne: true },
            due_date: { $gte: today, $lt: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000) }
        });

        for (const bill of pendingBills) {
            const user = await User.findOne({ flat_number: bill.flat_number });
            const email = user.email || user.resident?.email;
            
            if (email) {
                const isDueToday = new Date(bill.due_date).toDateString() === today.toDateString();
                const subject = isDueToday ? 'Urgent: Rent Due Today' : 'Reminder: Rent Due Tomorrow';
                const body = `Hello Room ${bill.flat_number},\n\nYour maintenance bill of ₹${bill.amount} is due ${isDueToday ? 'TODAY' : 'tomorrow'}.\n\nPlease make payment to avoid penalties.`;
                
                await sendNotificationEmail(email, subject, body);
            }
        }

        res.json({ success: true, processedCount: pendingBills.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Reminder job failed' });
    }
};
