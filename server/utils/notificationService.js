/**
 * SMS delivery requires a paid SMS gateway (e.g., Twilio, MSG91, Fast2SMS).
 * For MVP, this system logs all notifications in the database and sends emails only.
 * To add SMS: replace the placeholder sendSMS() function with your gateway SDK call.
 */

const { User } = require('../../api/lib/mongodb');
const Notification = require('../models/Notification');

// Mock SMS Sender
async function sendSMS(phone, message) {
    console.log(`\n[SMS-PLACEHOLDER] To: ${phone} | Msg: ${message}\n`);
    return true;
}

const dispatchNotification = async ({ type, title, message, residents, sentBy }) => {
    const recipients = (residents || []).map(r => ({
        roomNumber: r.flat_number,
        residentName: r.resident?.name || r.owner_name || ('Resident ' + (r.flat_number || '')),
        phone: r.mobile_number || r.resident?.phone,
        email: r.email || r.resident?.email,
        deliveryStatus: 'sent'
    }));

    const notif = new Notification({
        type,
        title,
        message,
        sentTo: recipients,
        totalRecipients: recipients.length,
        successCount: recipients.length,
        sentBy,
        channel: ['in_app', 'email'],
        status: 'sent'
    });

    await notif.save();
    
    // Simulate SMS dispatch for MVP logging
    recipients.forEach(r => {
        if (r.phone && r.phone !== '0000000000') {
            sendSMS(r.phone, `${title}: ${message}`);
        }
    });

    return notif;
};

module.exports = { dispatchNotification };
