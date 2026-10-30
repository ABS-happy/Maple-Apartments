const mongoose = require('mongoose');
const path = require('path');
const Room = require('../models/Room');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/maple_apartments';

mongoose.connect(mongoURI).then(async () => {
    const rooms = await Room.find({ role: 'User' });
    console.log(`Connected to DB. Found ${rooms.length} rooms matching role 'User'.`);
    let upgraded = 0;
    
    for (const room of rooms) {
        // Log the room exactly as it appears
        const currentRental = room.charges?.rental;
        console.log(`Checking Room ${room.flat_number}... maintenanceAmount=${room.maintenanceAmount}, currentRental=${currentRental}`);
        
        const defaultMaint = room.maintenanceAmount || room._doc?.maintenanceAmount || currentRental || 2500;
        const newCharges = {
            rental: defaultMaint,
            festival: room.charges?.festival || 0,
            parking: room.charges?.parking || 0,
            others: room.charges?.others || 0
        };
        const newDueDate = room.dueDate || new Date();
        const newPaymentStatus = room.paymentStatus || 'unpaid';
        
        await Room.findByIdAndUpdate(room._id, {
            $set: {
                charges: newCharges,
                dueDate: newDueDate,
                paymentStatus: newPaymentStatus
            }
        });
        upgraded++;
    }
    
    console.log(`Migration complete. Upgraded ${upgraded} rooms.`);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
