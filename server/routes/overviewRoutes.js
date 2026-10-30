const express = require('express');
const router = express.Router();
const { getOverview, updateRoom, bulkUpdateRooms, updateStatus } = require('../controllers/overviewController');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'maple_secret_key_2024';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token missing' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

router.use(authenticateToken);

router.get('/rooms', getOverview);
router.put('/rooms/bulk-update', bulkUpdateRooms);
router.put('/rooms/:roomId', updateRoom);
router.put('/rooms/:roomId/status', updateStatus);

module.exports = router;
