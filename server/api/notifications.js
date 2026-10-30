const { connectToDatabase, User, NotificationLog } = require('./lib/mongodb');
const { authenticateToken } = require('./lib/auth');
const { sendNotificationEmail } = require('./lib/mailer');

module.exports = async (req, res) => {
    const admin = authenticateToken(req);
    if (!admin || admin.role !== 'Admin') return res.status(401).json({ error: 'Unauthorized' });

    try {
        await connectToDatabase();
        const { action, flat_number, message, title } = req.body;

        if (action === 'send-manual') {
            const user = await User.findOne({ flat_number, role: 'User' });
            const email = user.email || user.resident?.email;
            if (!email) return res.status(400).json({ error: 'No email found' });

            await sendNotificationEmail(email, 'Management Update - Maple Apartments', message);
            
            await new NotificationLog({ title: `Room ${flat_number}`, message, type: 'manual' }).save();
            return res.json({ success: true });
        }

        if (action === 'broadcast' || action === 'bulk-send' || req.url.includes('bulk-send')) {
            const notifTitle = title || 'Monthly Bill Reminder';
            const notifMsg = message || 'Dear Resident, this is a reminder regarding your apartment maintenance dues.';
            const residents = await User.find({ role: 'User' });
            for (const r of residents) {
                const email = r.email || r.resident?.email;
                if (email) await sendNotificationEmail(email, notifTitle, notifMsg).catch(() => {});
            }
            await User.updateMany({ role: 'User' }, { $set: { notificationStatus: 'Sent' } });
            await Bill.updateMany({ is_archived: { $ne: true } }, { $set: { notification_status: 'Sent', notified_at: new Date() } });
            await new NotificationLog({ title: notifTitle, message: notifMsg, type: 'broadcast' }).save();
            return res.json({ success: true, count: residents.length, message: 'Notification broadcast sent to all residents successfully.' });
        }

        res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to dispatch' });
    }
};
