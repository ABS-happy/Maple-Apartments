const { connectToDatabase, User } = require('./lib/mongodb');
const { authenticateToken } = require('./lib/auth');
const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
    flat_number: { type: String, required: true },
    owner_name: { type: String },
    category: { type: String, default: 'General' },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'In Progress', 'Resolved'], default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

const Complaint = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema);

module.exports = async (req, res) => {
    try {
        await connectToDatabase();
        const auth = authenticateToken(req);

        // Path or Query params
        const urlParts = (req.url || '').split('?')[0].split('/').filter(Boolean);
        const lastPart = urlParts[urlParts.length - 1];
        const isParam = lastPart && lastPart !== 'complaints' && lastPart !== 'admin';

        if (req.method === 'GET') {
            // Flat number query or route param: e.g. /api/complaints/101
            const flatParam = req.params?.flat_number || (isParam && /^\d{3}$/.test(lastPart) ? lastPart : null);
            if (flatParam) {
                const list = await Complaint.find({ flat_number: flatParam }).sort({ createdAt: -1 });
                return res.json(list);
            }

            // Specific complaint ID: e.g. /api/admin/complaints/:id
            if (isParam && mongoose.isValidObjectId(lastPart)) {
                const c = await Complaint.findById(lastPart);
                if (!c) return res.status(404).json({ error: 'Complaint not found' });
                return res.json(c);
            }

            // Return all complaints for admin
            const list = await Complaint.find({}).sort({ createdAt: -1 });
            return res.json(list);
        }

        if (req.method === 'POST') {
            const { flat_number, owner_name, category, subject, title, description } = req.body || {};
            const flatNo = flat_number || (auth ? auth.flat_number : null);
            const sub = subject || title;

            if (!flatNo || !sub || !description) {
                return res.status(400).json({ error: 'Flat number, subject, and description are required' });
            }

            let resolvedOwner = owner_name;
            if (!resolvedOwner && flatNo) {
                const user = await User.findOne({ flat_number: flatNo });
                resolvedOwner = user ? (user.owner_name || user.resident?.name || `Resident ${flatNo}`) : `Resident ${flatNo}`;
            }

            const complaint = new Complaint({
                flat_number: flatNo,
                owner_name: resolvedOwner,
                category: category || 'Maintenance',
                subject: sub,
                description,
                status: 'Pending',
                createdAt: new Date()
            });

            await complaint.save();
            return res.json({ success: true, message: 'Complaint submitted successfully', complaint });
        }

        if (req.method === 'PATCH' || req.method === 'PUT') {
            const complaintId = req.params?.id || (isParam ? lastPart : null);
            const { status } = req.body || {};
            if (!complaintId) return res.status(400).json({ error: 'Complaint ID is required' });

            const updated = await Complaint.findByIdAndUpdate(
                complaintId,
                { $set: { status: status || 'Pending' } },
                { new: true }
            );
            if (!updated) return res.status(404).json({ error: 'Complaint not found' });
            return res.json({ success: true, complaint: updated });
        }

        if (req.method === 'DELETE') {
            const complaintId = req.params?.id || (isParam ? lastPart : null);
            if (!complaintId) return res.status(400).json({ error: 'Complaint ID is required' });

            const deleted = await Complaint.findByIdAndDelete(complaintId);
            if (!deleted) return res.status(404).json({ error: 'Complaint not found' });
            return res.json({ success: true, message: 'Complaint deleted successfully' });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('Complaints API error:', err);
        return res.status(500).json({ error: 'Complaints operation failed: ' + err.message });
    }
};
