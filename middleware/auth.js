const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify user still exists and is active
        const user = await db.execute(
            'SELECT id, username, email, role, is_active FROM users WHERE id = ? AND is_active = TRUE',
            [decoded.userId]
        );

        if (user.length === 0) {
            return res.status(401).json({ error: 'Invalid token - user not found' });
        }

        req.user = user[0];
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Middleware to check if user has admin role
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Middleware to check if user has admin or manager role
const requireManager = (req, res, next) => {
    if (!['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Manager access required' });
    }
    next();
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.execute(
            'SELECT id, username, email, role, is_active FROM users WHERE id = ? AND is_active = TRUE',
            [decoded.userId]
        );

        req.user = user.length > 0 ? user[0] : null;
    } catch (error) {
        req.user = null;
    }

    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireManager,
    optionalAuth
};