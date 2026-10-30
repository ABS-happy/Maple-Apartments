const jwt = require('jsonwebtoken');

function authenticateToken(req) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return null;

    try {
        return jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    } catch (err) {
        return null;
    }
}

module.exports = { authenticateToken };
