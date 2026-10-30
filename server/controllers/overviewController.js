const Room = require('../models/Room');
const { Bill } = require('../api/lib/mongodb');

const getOverview = async (req, res) => {
    try {
        const roomsInDb = await Room.find({ role: 'User' });
        const allBills = await Bill.find({ is_archived: { $ne: true } }).sort({ created_at: -1 });
        
        // Define all 16 expected rooms
        const allRoomNumbers = [];
        for (let floor = 1; floor <= 4; floor++) {
            for (let flat = 1; flat <= 4; flat++) {
                allRoomNumbers.push(`${floor}0${flat}`);
            }
        }

        let totalBilled = 0;
        let totalCollected = 0;
        let paidCount = 0;
        let unpaidCount = 0;
        let partialCount = 0;
        let overdueCount = 0;

        const formattedRooms = allRoomNumbers.map(flatNo => {
            // Find existing record or fallback to stub
            let room = roomsInDb.find(r => r.flat_number === flatNo);
            
            if (!room) {
                // Return a virtual stub for the UI to display
                room = {
                    _id: `temp_${flatNo}`,
                    flat_number: flatNo,
                    resident: { name: `Owner ${flatNo}` },
                    charges: { rental: 0, festival: 0, parking: 0, others: 0 },
                    paymentStatus: 'unpaid',
                    dueDate: null,
                    isStub: true
                };
            }

            const roomObj = room.toObject ? room.toObject({ virtuals: true }) : { ...room };
            const roomBills = allBills.filter(b => b.flat_number === flatNo);
            const latestBill = roomBills[0];
            const draftBill = roomBills.find(b => b.is_draft === true);

            // Ensure resident name is properly resolved
            const resName = roomObj.owner_name || roomObj.resident?.name || `Owner ${flatNo}`;
            roomObj.resident = {
                name: resName,
                phone: roomObj.mobile_number || roomObj.resident?.phone || '',
                email: roomObj.email || roomObj.resident?.email || ''
            };
            roomObj.owner_name = resName;

            // Ensure charges exist and match latest bill if charges were blank
            let c = roomObj.charges || {};
            let sum = (Number(c.rental) || 0) + (Number(c.festival) || 0) + (Number(c.parking) || 0) + (Number(c.others) || 0);
            if (sum === 0 && latestBill && latestBill.amount > 0) {
                c = {
                    rental: Number(latestBill.maintenance) || Number(latestBill.amount) || Number(roomObj.maintenanceAmount) || 2500,
                    festival: Number(latestBill.festival) || 0,
                    parking: Number(latestBill.parking) || 0,
                    others: Number(latestBill.others) || 0
                };
                roomObj.charges = c;
                sum = (Number(c.rental) || 0) + (Number(c.festival) || 0) + (Number(c.parking) || 0) + (Number(c.others) || 0);
            }

            // Sync payment status with latest bill if present
            const isBillPaid = latestBill && latestBill.status && latestBill.status.toLowerCase() === 'paid';
            const isRoomPaid = roomObj.paymentStatus && roomObj.paymentStatus.toLowerCase() === 'paid';

            if (isBillPaid || isRoomPaid) {
                roomObj.paymentStatus = 'paid';
            } else {
                roomObj.paymentStatus = 'unpaid';
            }

            totalBilled += sum;
            
            if (roomObj.paymentStatus === 'paid') {
                paidCount++;
                totalCollected += sum;
            } else if (roomObj.paymentStatus === 'unpaid') unpaidCount++;
            else if (roomObj.paymentStatus === 'partial') partialCount++;
            else if (roomObj.paymentStatus === 'overdue') overdueCount++;
            
            // Attach draft and bill meta
            roomObj.hasDraft = Boolean(roomObj.hasDraft || draftBill);
            if (draftBill && !roomObj.draftCharges) {
                roomObj.draftCharges = {
                    rental: draftBill.maintenance,
                    festival: draftBill.festival,
                    parking: draftBill.parking,
                    others: draftBill.others
                };
            }
            if (draftBill && !roomObj.draftDueDate) {
                roomObj.draftDueDate = draftBill.due_date;
            }
            if (latestBill) {
                roomObj.latestBill = {
                    _id: latestBill._id,
                    amount: latestBill.amount,
                    status: latestBill.status,
                    is_draft: latestBill.is_draft,
                    notification_status: latestBill.notification_status || 'Not Sent',
                    due_date: latestBill.due_date
                };
            }
            roomObj.notificationStatus = latestBill?.notification_status || roomObj.notificationStatus || 'Not Sent';

            return roomObj;
        });

        res.json({
            rooms: formattedRooms,
            summary: {
                totalRooms: 16,
                paidCount,
                unpaidCount,
                partialCount,
                overdueCount,
                totalBilled,
                totalCollected,
                totalPending: totalBilled - totalCollected
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch overview' });
    }
};

const updateRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        const updates = req.body;
        
        let $setParams = {};
        
        if (updates.charges) {
            if (updates.charges.rental !== undefined) $setParams['charges.rental'] = Number(updates.charges.rental);
            if (updates.charges.festival !== undefined) $setParams['charges.festival'] = Number(updates.charges.festival);
            if (updates.charges.parking !== undefined) $setParams['charges.parking'] = Number(updates.charges.parking);
            if (updates.charges.others !== undefined) $setParams['charges.others'] = Number(updates.charges.others);
        }
        if (updates.dueDate !== undefined) $setParams.dueDate = updates.dueDate;
        if (updates.paymentStatus !== undefined) $setParams.paymentStatus = updates.paymentStatus;
        if (updates.paidDate !== undefined) $setParams.paidDate = updates.paidDate;
        if (updates.notes !== undefined) $setParams.notes = updates.notes;

        let room;
        // If it's a stub, we need to find by flat_number or create it
        if (roomId.startsWith('temp_')) {
            const flatNo = roomId.split('_')[1];
            room = await Room.findOneAndUpdate(
                { flat_number: flatNo },
                { 
                    $set: { 
                        ...$setParams,
                        username: `resident_${flatNo}`,
                        password: 'Password123' // default for stubs
                    } 
                },
                { upsert: true, new: true, runValidators: false }
            );
        } else {
            room = await Room.findByIdAndUpdate(roomId, { $set: $setParams }, { returnDocument: 'after' });
        }

        if (!room) return res.status(404).json({ error: 'Room not found' });
        
        // Synchronize changes to active Bill so Resident Dashboard reflects updates immediately
        const billUpdate = {};
        if (updates.paymentStatus) {
            billUpdate.status = updates.paymentStatus === 'paid' ? 'Paid' : 'Unpaid';
            billUpdate.paid_at = updates.paymentStatus === 'paid' ? (updates.paidDate || new Date()) : null;
        }
        if (updates.dueDate) billUpdate.due_date = updates.dueDate;
        if (updates.charges) {
            const m = Number(room.charges?.rental) || 0;
            const f = Number(room.charges?.festival) || 0;
            const p = Number(room.charges?.parking) || 0;
            const o = Number(room.charges?.others) || 0;
            billUpdate.maintenance = m;
            billUpdate.festival = f;
            billUpdate.parking = p;
            billUpdate.others = o;
            billUpdate.amount = m + f + p + o;
        }
        if (Object.keys(billUpdate).length > 0) {
            await Bill.updateMany(
                { flat_number: room.flat_number, is_archived: { $ne: true } },
                { $set: billUpdate }
            );
        }

        console.log(`Room ${room.flat_number} charges updated by admin`); 
        res.json(room);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
};

const bulkUpdateRooms = async (req, res) => {
    try {
        const updates = req.body;
        let updated = 0;
        let failed = 0;
        
        await Promise.all(updates.map(async (data) => {
            try {
                let $setParams = {};
                if (data.charges) {
                    if (data.charges.rental !== undefined) $setParams['charges.rental'] = Number(data.charges.rental);
                    if (data.charges.festival !== undefined) $setParams['charges.festival'] = Number(data.charges.festival);
                    if (data.charges.parking !== undefined) $setParams['charges.parking'] = Number(data.charges.parking);
                    if (data.charges.others !== undefined) $setParams['charges.others'] = Number(data.charges.others);
                }
                if (data.dueDate !== undefined) $setParams.dueDate = data.dueDate;
                if (data.paymentStatus !== undefined) $setParams.paymentStatus = data.paymentStatus;
                if (data.paidDate !== undefined) $setParams.paidDate = data.paidDate;
                if (data.notes !== undefined) $setParams.notes = data.notes;
                
                const rId = data.roomId || data._id;
                let room;
                if (rId && rId.startsWith('temp_')) {
                    const flatNo = rId.split('_')[1];
                    room = await Room.findOneAndUpdate(
                        { flat_number: flatNo },
                        { $set: { ...$setParams, username: `resident_${flatNo}`, password: 'Password123' } },
                        { upsert: true }
                    );
                } else {
                    room = await Room.findByIdAndUpdate(rId, { $set: $setParams });
                }

                if (room) updated++;
                else failed++;
            } catch (e) {
                failed++;
            }
        }));
        
        res.json({ updated, failed });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Bulk update failed' });
    }
};

const updateStatus = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { paymentStatus, paidDate } = req.body;
        const room = await Room.findByIdAndUpdate(roomId, { paymentStatus, paidDate }, { returnDocument: 'after' });
        if (room) {
            await Bill.updateMany(
                { flat_number: room.flat_number, is_archived: { $ne: true } },
                { $set: { status: paymentStatus === 'paid' ? 'Paid' : 'Unpaid', paid_at: paymentStatus === 'paid' ? (paidDate || new Date()) : null } }
            );
        }
        res.json(room);
    } catch (err) {
        res.status(500).json({ error: 'Status update failed' });
    }
};

module.exports = { getOverview, updateRoom, bulkUpdateRooms, updateStatus };
