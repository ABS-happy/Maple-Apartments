const mongoose = require('mongoose');

// Cache the connection
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (cached.conn && cached.conn.readyState === 1) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: true,
            serverSelectionTimeoutMS: 8000,
        };

        const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/maple_apartments';
        cached.promise = mongoose.connect(mongoURI, opts).then((m) => {
            return m;
        });
    }
    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }
    return cached.conn;
}

// Models
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    flat_number: { type: String, required: true },
    mobile_number: { type: String, required: true },
    email: { type: String },
    resident: {
        name: String,
        phone: String,
        email: String
    },
    owner_name: String,
    maintenanceAmount: { type: Number, default: 2500 },
    charges: {
        rental: { type: Number, default: 2500 },
        festival: { type: Number, default: 0 },
        parking: { type: Number, default: 0 },
        others: { type: Number, default: 0 }
    },
    draftCharges: {
        rental: Number,
        festival: Number,
        parking: Number,
        others: Number
    },
    draftDueDate: Date,
    hasDraft: { type: Boolean, default: false },
    notificationStatus: { type: String, default: 'Not Sent' },
    paymentStatus: { type: String, default: 'unpaid' },
    dueDate: Date,
    profile: {
        residents: String,
        year: String,
        status: String,
        pets: String
    },
    isOccupied: { type: Boolean, default: true },
    role: { type: String, enum: ['Admin', 'User'], default: 'User' },
    created_at: { type: Date, default: Date.now }
});

const billSchema = new mongoose.Schema({
    flat_number: { type: String, required: true },
    bill_type: { type: String, default: 'Maintenance' },
    amount: { type: Number, required: true },
    maintenance: { type: Number, default: 0 },
    festival: { type: Number, default: 0 },
    parking: { type: Number, default: 0 },
    others: { type: Number, default: 0 },
    status: { type: String, default: 'Unpaid' },
    is_draft: { type: Boolean, default: false },
    notification_status: { type: String, default: 'Not Sent' },
    notified_at: { type: Date },
    due_date: { type: Date, required: true },
    paid_at: { type: Date },
    paidAt: { type: Date },
    paymentId: { type: String },
    orderId: { type: String },
    month: { type: String },
    year: { type: Number },
    late_fee: { type: Number, default: 0 },
    is_archived: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});

const settingSchema = new mongoose.Schema({
    key: { type: String, default: 'general', unique: true },
    societyName: { type: String, default: 'Maple Apartments' },
    address: { type: String, default: '12-A, Maple Crossroad, Bangalore - 560001' },
    defaultMaintenance: { type: Number, default: 2500 },
    lateFeeAmount: { type: Number, default: 200 },
    gracePeriodDays: { type: Number, default: 0 },
    lateFeePercentage: { type: Number, default: 5 },
    reminderTemplate: { type: String, default: 'Dear Resident, your maintenance bill for [MONTH] of ₹[TOTAL] is due. Please pay via UPI or Cash to avoid late fees. — Management' },
    // Recurring Monthly Rent Billing Automation
    billingStartDay: { type: Number, default: 1, min: 1, max: 31 },
    defaultDueIntervalDays: { type: Number, default: 10, min: 1, max: 60 },
    autoBillingEnabled: { type: Boolean, default: true },
    copyPreviousMonthRates: { type: Boolean, default: true },
    lastAutoBillingRun: { type: Date },
    lastGeneratedCycle: { type: String, default: '' },
    updated_at: { type: Date, default: Date.now }
});

const notificationLogSchema = new mongoose.Schema({
    title: String,
    message: String,
    type: String,
    sentAt: { type: Date, default: Date.now }
});

const inviteSchema = new mongoose.Schema({
    flat_number: { type: String, required: true, unique: true },
    invite_code: { type: String, required: true },
    is_used: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
    bill_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: false },
    flat_number: { type: String, required: true },
    utr_number: { type: String, required: false },
    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },
    razorpay_signature: { type: String },
    amount: { type: Number, required: true },
    month: { type: String },
    year: { type: Number },
    transfer_mode: { type: String, default: 'Razorpay' },
    status: { type: String, enum: ['Pending', 'Verified', 'Failed', 'PAID', 'Paid'], default: 'Pending' },
    created_at: { type: Date, default: Date.now },
    verified_at: { type: Date }
});

const User = mongoose.models.User || mongoose.model('User', userSchema, 'flat_owners');
const Bill = mongoose.models.Bill || mongoose.model('Bill', billSchema, 'bills');
const NotificationLog = mongoose.models.NotificationLog || mongoose.model('NotificationLog', notificationLogSchema);
const Invite = mongoose.models.Invite || mongoose.model('Invite', inviteSchema, 'invites');
const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema, 'payments');
const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema, 'settings');

module.exports = { connectToDatabase, User, Bill, NotificationLog, Invite, Payment, Setting };

