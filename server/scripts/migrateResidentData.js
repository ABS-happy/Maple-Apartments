const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/maple_apartments';

// Dataset provided by user
const BILLING_DATASET = [
    { room: "101", maintenance: 2700, parking: 0 },
    { room: "102", maintenance: 2700, parking: 100 },
    { room: "103", maintenance: 3000, parking: 0 },
    { room: "104", maintenance: 1500, parking: 0 },
    { room: "201", maintenance: 2700, parking: 100 },
    { room: "202", maintenance: 2700, parking: 0 },
    { room: "203", maintenance: 3000, parking: 0 },
    { room: "204", maintenance: 1500, parking: 500 },
    { room: "301", maintenance: 2700, parking: 0 },
    { room: "302", maintenance: 2700, parking: 0 },
    { room: "303", maintenance: 3000, parking: 0 },
    { room: "304", maintenance: 1500, parking: 0 },
    { room: "401", maintenance: 2700, parking: 0 },
    { room: "402", maintenance: 2700, parking: 100 },
    { room: "403", maintenance: 3000, parking: 100 },
    { room: "404", maintenance: 1500, parking: 0 }
];

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    flat_number: { type: String, unique: true },
    maintenance_charge: { type: Number, default: 0 },
    parking_charge: { type: Number, default: 0 },
    isOccupied: { type: Boolean, default: false },
    role: { type: String, default: 'User' }
});

const User = mongoose.models.User || mongoose.model('User', userSchema, 'flat_owners');

async function migrate() {
    console.log('🔗 Connecting to MongoDB for Real-Data Injection...');
    try {
        await mongoose.connect(mongoURI);
        const defaultPassword = await bcrypt.hash('Password123', 10);
        
        for (const data of BILLING_DATASET) {
            console.log(`Setting charges for Unit ${data.room}...`);
            
            // Look for existing room
            const existing = await User.findOne({ flat_number: data.room });
            
            if (existing) {
                // Update existing
                await User.findByIdAndUpdate(existing._id, {
                    $set: { 
                        maintenance_charge: data.maintenance,
                        parking_charge: data.parking
                    }
                });
            } else {
                // Create new vacant room with valid unique username
                await User.create({
                    username: `resident_${data.room}`,
                    password: defaultPassword,
                    flat_number: data.room,
                    mobile_number: '0000000000',
                    owner_name: `Owner ${data.room}`,
                    maintenance_charge: data.maintenance,
                    parking_charge: data.parking,
                    isOccupied: false
                });
            }
        }
        
        console.log('✅ Success! Your 16-room dataset is now perfectly synchronized with the database.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
