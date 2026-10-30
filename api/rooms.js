const { connectToDatabase, User, Bill } = require('./lib/mongodb');
const { authenticateToken } = require('./lib/auth');

module.exports = async (req, res) => {
    const user = authenticateToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        await connectToDatabase();
        
        // Handle single room detail or all rooms list
        const { flat_number } = req.query;

        if (flat_number) {
            // Get specific room details
            const resident = await User.findOne({ flat_number, role: 'User' });
            const bills = await Bill.find({ flat_number }).sort({ created_at: -1 });

            if (!resident) return res.status(404).json({ error: 'Room not found' });

            return res.json({
                flat_number: resident.flat_number,
                resident_name: resident.resident?.name || 'N/A',
                mobile_number: resident.mobile_number,
                payment_status: resident.paymentStatus,
                maintenance_amount: resident.maintenanceAmount,
                bills: bills
            });
        }

        // Default: Get all rooms summary (Admin only)
        if (user.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' });

        const residents = await User.find({ role: 'User' });
        const allBills = await Bill.find({ is_archived: { $ne: true } });

        const summary = residents.map(r => {
            const latestBill = allBills
                .filter(b => b.flat_number === r.flat_number)
                .sort((a,b) => b.created_at - a.created_at)[0];

            return {
                flat_number: r.flat_number,
                resident_name: r.resident?.name || 'N/A',
                payment_status: r.paymentStatus,
                bill_amount: latestBill ? latestBill.amount : r.maintenanceAmount,
                due_date: latestBill ? latestBill.due_date : null
            };
        });

        res.json(summary);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
};
