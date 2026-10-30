const { connectToDatabase, User, Invite } = require('./lib/mongodb');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        await connectToDatabase();
        const { username, ownerName, flatNumber, mobileNumber, password, email } = req.body;

        if (!username || !ownerName || !flatNumber || !mobileNumber || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // --- STRICT 16-USER ACCESS CONTROL ---
        const expectedUsername = `User${flatNumber}`;
        const expectedPassword = `PASS${flatNumber}`;

        if (username !== expectedUsername || password !== expectedPassword) {
            return res.status(401).json({ 
                error: `Access Denied: For Flat ${flatNumber}, you must use User ID '${expectedUsername}' and the designated password.` 
            });
        }
        // -------------------------------------

        // Validate registration entitlement
        const invite = await Invite.findOne({ flat_number: flatNumber });
        if (!invite) {
            return res.status(401).json({ error: 'This flat has not been invited by the Admin yet.' });
        }
        if (invite.is_used) {
            return res.status(401).json({ error: 'This flat has already been registered.' });
        }

        // Check existing user
        const existing = await User.findOne({ 
            $or: [
                { username: username },
                { flat_number: flatNumber }
            ]
        });

        if (existing) {
            return res.status(400).json({ error: 'A user with this username or flat number already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            owner_name: ownerName,
            flat_number: flatNumber,
            mobile_number: mobileNumber,
            email: email || null,
            password: hashedPassword,
            role: 'User'
        });

        await newUser.save();

        // Mark invite code as used
        invite.is_used = true;
        await invite.save();

        res.status(201).json({ message: 'User registered successfully' });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Internal server error while registering' });
    }
};

