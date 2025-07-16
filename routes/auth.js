const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validateLogin, validateRegister } = require('../middleware/validation');

const router = express.Router();

// Helper function to generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

// Login route
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const users = await db.execute(
            'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = generateToken(user.id);

        // Return user data without password
        const userData = {
            id: user.id,
            username: user.username,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            phone: user.phone
        };

        res.json({
            message: 'Login successful',
            token,
            user: userData
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Register route (Admin only)
router.post('/register', authenticateToken, requireAdmin, validateRegister, async (req, res) => {
    try {
        const { username, email, password, first_name, last_name, role = 'staff', phone } = req.body;

        // Check if user already exists
        const existingUsers = await db.execute(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'User already exists with this email or username' });
        }

        // Hash password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Insert new user
        const result = await db.execute(
            'INSERT INTO users (username, email, password_hash, first_name, last_name, role, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, email, password_hash, first_name, last_name, role, phone]
        );

        const userId = result.insertId;

        // Return user data without password
        const userData = {
            id: userId,
            username,
            email,
            first_name,
            last_name,
            role,
            phone
        };

        res.status(201).json({
            message: 'User created successfully',
            user: userData
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const users = await db.execute(
            'SELECT id, username, email, first_name, last_name, role, phone, created_at FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            user: users[0]
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { first_name, last_name, phone } = req.body;

        // Validate input
        if (!first_name || !last_name) {
            return res.status(400).json({ error: 'First name and last name are required' });
        }

        // Update user
        await db.execute(
            'UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?',
            [first_name, last_name, phone, userId]
        );

        // Get updated user data
        const users = await db.execute(
            'SELECT id, username, email, first_name, last_name, role, phone FROM users WHERE id = ?',
            [userId]
        );

        res.json({
            message: 'Profile updated successfully',
            user: users[0]
        });

    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { current_password, new_password } = req.body;

        // Validate input
        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long' });
        }

        // Get current user
        const users = await db.execute(
            'SELECT password_hash FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(current_password, users[0].password_hash);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
        const new_password_hash = await bcrypt.hash(new_password, saltRounds);

        // Update password
        await db.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [new_password_hash, userId]
        );

        res.json({
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all users (Admin only)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await db.execute(
            'SELECT id, username, email, first_name, last_name, role, phone, is_active, created_at FROM users ORDER BY created_at DESC'
        );

        res.json({
            users
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user status (Admin only)
router.put('/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        // Validate input
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'is_active must be a boolean' });
        }

        // Cannot deactivate yourself
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }

        // Update user status
        await db.execute(
            'UPDATE users SET is_active = ? WHERE id = ?',
            [is_active, id]
        );

        res.json({
            message: `User ${is_active ? 'activated' : 'deactivated'} successfully`
        });

    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify token (for frontend to check if token is valid)
router.get('/verify', authenticateToken, (req, res) => {
    res.json({
        valid: true,
        user: req.user
    });
});

module.exports = router;