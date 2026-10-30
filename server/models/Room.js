const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    // Adapting to existing 'flat_owners' schema
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    flat_number: { type: String, required: true },
    mobile_number: { type: String },
    
    // Resident structure from existing
    resident: {
        name: { type: String },
        phone: { type: String },
        email: { type: String },
        isActive: { type: Boolean, default: true }
    },
    
    floor: { type: Number },
    maintenanceAmount: { type: Number }, // legacy
    
    // NEW FIELDS
    charges: {
        rental:   { type: Number, default: 0 },
        festival: { type: Number, default: 0 },
        parking:  { type: Number, default: 0 },
        others:   { type: Number, default: 0 }
    },
    draftCharges: {
        rental:   { type: Number },
        festival: { type: Number },
        parking:  { type: Number },
        others:   { type: Number }
    },
    draftDueDate: { type: Date },
    hasDraft: { type: Boolean, default: false },
    notificationStatus: { type: String, default: 'Not Sent' },
    dueDate: { type: Date },
    paymentStatus: { type: String, enum: ['paid', 'unpaid', 'partial', 'overdue'], default: 'unpaid' },
    paidDate: { type: Date },
    notes: { type: String, default: '' },
    profile: {
        residents: String,
        year: String,
        status: String,
        pets: String
    },
    isOccupied: { type: Boolean, default: true },
    
    role: { type: String, default: 'User' }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

roomSchema.virtual('roomNumber').get(function() {
    return this.flat_number;
});

roomSchema.virtual('totalCharges').get(function () {
    const c = this.charges || {};
    return (c.rental || 0) + (c.festival || 0) + (c.parking || 0) + (c.others || 0);
});

module.exports = mongoose.model('RoomOverview', roomSchema, 'flat_owners');
