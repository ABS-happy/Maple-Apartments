require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define Mongoose Schema and Model
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    owner_name: { type: String, required: true },
    flat_number: { type: String, required: true },
    mobile_number: { type: String, required: true },
    email: { type: String },
    password: { type: String, required: true },
    wing: { type: String, default: 'A' },
    floor_number: { type: Number },
    ownership_type: { type: String, enum: ['Owner', 'Tenant'], default: 'Owner' },
    move_in_date: { type: Date },
    role: { type: String, enum: ['Admin', 'User'], default: 'User' },
    created_at: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema, 'flat_owners');

async function seedDatabase() {
    try {
        console.log('Connecting to MongoDB...');
        const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/maple_apartments';
        await mongoose.connect(mongoURI);
        console.log('✅ Connected to MongoDB successfully.');

        // Clear existing data to ensure clean state
        await User.deleteMany({});
        console.log('Cleared existing database.');

        const Invite = mongoose.model('Invite', new mongoose.Schema({
            flat_number: String,
            invite_code: String,
            is_used: { type: Boolean, default: false }
        }), 'invites');

        await Invite.deleteMany({});
        const invitesToInsert = [];

        // 1. Generate 16 Invites (Flats 101-104, ..., 401-404)
        for (let floor = 1; floor <= 4; floor++) {
            for (let flat = 1; flat <= 4; flat++) {
                let flatNum = (floor * 100) + flat;
                invitesToInsert.push({
                    flat_number: flatNum.toString(),
                    invite_code: 'INIT', // Standard code, but we use strict UserID check anyway
                    is_used: false
                });
            }
        }
        await Invite.insertMany(invitesToInsert);
        console.log('✅ 16 Invites generated successfully!');

        // 2. Admin Users
        const adminPasswordPlain = 'admin2026';
        const adminHashed = await bcrypt.hash(adminPasswordPlain, 10);

        const admin101PasswordPlain = 'Password101';
        const admin101Hashed = await bcrypt.hash(admin101PasswordPlain, 10);
        
        const usersToInsert = [
            {
                username: 'admin',
                owner_name: 'System Admin',
                flat_number: 'ADM',
                mobile_number: '9999999999',
                email: 'admin@maple.com',
                password: adminHashed,
                wing: 'A',
                floor_number: 1,
                ownership_type: 'Owner',
                move_in_date: new Date('2026-03-01'),
                role: 'Admin'
            },
            {
                username: 'admin101',
                owner_name: 'Admin 101',
                flat_number: 'ADM2',
                mobile_number: '8888888888',
                email: 'admin101@maple.com',
                password: admin101Hashed,
                wing: 'A',
                floor_number: 1,
                ownership_type: 'Owner',
                move_in_date: new Date('2026-03-01'),
                role: 'Admin'
            }
        ];

        await User.insertMany(usersToInsert);
        console.log('✅ Admin users inserted successfully into MongoDB!');


    } catch (error) {
        console.error('❌ Expected Error inserting to Database:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

seedDatabase();
