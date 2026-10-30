// Defaulter Logic Engine - Functional Version
// This engine receives models from the main server to avoid import errors

const getDefaulters = async (UserModel, BillModel) => {
    try {
        const residents = await UserModel.find({ role: 'User' });
        const allUnpaidBills = await BillModel.find({ status: { $in: ['Unpaid', 'Overdue'] } }).sort({ billMonth: -1 });

        const defaulters = residents.map(room => {
            const roomBills = allUnpaidBills.filter(b => b.flat_number === room.flat_number);
            
            if (roomBills.length === 0) return null;

            // Sort room bills by date to calculate streak
            const sorted = roomBills.sort((a, b) => new Date(b.due_date || 0) - new Date(a.due_date || 0));
            
            // Calculate consecutive streak (most recent streak)
            let streak = sorted.length; 

            const totalAmount = sorted.reduce((sum, b) => sum + (b.amount || 0), 0);
            const oldestBill = sorted[sorted.length - 1];
            const today = new Date();
            const oldestDate = new Date(oldestBill.due_date || Date.now());
            const daysSinceOldest = Math.floor((today - oldestDate) / (1000 * 60 * 60 * 24));

            const riskScore = (streak * 30) + (totalAmount / 100);

            return {
                roomId: room._id,
                roomNumber: room.flat_number,
                floor: room.floor,
                residentName: room.resident?.name || 'Unknown',
                phone: room.resident?.phone || '—',
                email: room.resident?.email || '—',
                consecutiveMonthsUnpaid: streak,
                totalUnpaidAmount: totalAmount,
                riskScore,
                oldestUnpaidDate: oldestBill.due_date || new Date(),
                daysSinceOldest
            };
        }).filter(Boolean);

        return defaulters.sort((a, b) => b.riskScore - a.riskScore);
    } catch (err) {
        console.error('Defaulter Engine Error:', err);
        return [];
    }
};

module.exports = { getDefaulters };
