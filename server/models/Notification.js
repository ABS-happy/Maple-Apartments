const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    notificationId: { type: String, unique: true },
    type: { type: String, enum: ['broadcast', 'payment_reminder', 'late_fee_alert', 'custom'], default: 'broadcast' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    sentTo: [{ 
        roomNumber: String, 
        residentName: String, 
        phone: String, 
        email: String, 
        deliveryStatus: { type: String, enum: ['sent', 'failed', 'pending'], default: 'sent' } 
    }],
    totalRecipients: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    sentBy: { type: String },
    channel: [{ type: String }],
    sentAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['draft', 'sent', 'partial'], default: 'sent' }
});

notificationSchema.pre('save', function(next) {
    if (!this.notificationId) {
        this.notificationId = `NOTIF-${Date.now()}`;
    }
    next();
});

module.exports = mongoose.model('Notification', notificationSchema);
