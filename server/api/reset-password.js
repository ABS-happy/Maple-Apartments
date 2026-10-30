const { connectToDatabase, User } = require('./lib/mongodb');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        await connectToDatabase();
        const { username, mobileNumber, newPassword } = req.body || {};

        if (!username || !mobileNumber || !newPassword) {
            return res.status(400).json({ error: 'User ID, Mobile Number and New Password are required.' });
        }

        // Server-side validation rules
        if (newPassword.length < 12 || newPassword.length > 14) {
            return res.status(400).json({ error: 'Password must be 12-14 characters long.' });
        }
        if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[@#$!]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password does not meet all complexity rules.' });
        }

        // Strip prefixes (e.g. 'user101', 'resident_101', '101')
        const stripped = username.toString().trim().replace(/^(user|resident_?)/i, '');
        const cleanPhone = mobileNumber.toString().replace(/[^0-9]/g, '');

        // Find user matched flexibly by username/flat AND mobile_number
        const user = await User.findOne({
            $and: [
                {
                    $or: [
                        { username: new RegExp(`^${username.toString().trim()}$`, 'i') },
                        { username: stripped },
                        { flat_number: username.toString().trim() },
                        { flat_number: stripped },
                        { email: username.toString().trim() }
                    ]
                },
                {
                    $or: [
                        { mobile_number: mobileNumber.toString().trim() },
                        { mobile_number: cleanPhone },
                        { 'resident.phone': mobileNumber.toString().trim() },
                        { 'resident.phone': cleanPhone }
                    ]
                }
            ]
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid User ID or Mobile Number. Verification failed.' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedPassword;
        await user.save();

        res.json({ success: true, message: 'Password reset successfully!' });

    } catch (err) {
        console.error('Password reset error:', err);
        res.status(500).json({ error: 'Internal server error while resetting password: ' + err.message });
    }
};
