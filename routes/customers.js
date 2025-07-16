const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');
const { validateCustomer } = require('../middleware/validation');

const router = express.Router();

// Get all customers (Admin/Manager only)
router.get('/', authenticateToken, requireManager, async (req, res) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        
        let query = `
            SELECT c.*, 
                   COUNT(b.id) as total_bookings,
                   SUM(CASE WHEN b.booking_status = 'completed' THEN b.total_amount ELSE 0 END) as total_spent,
                   MAX(b.created_at) as last_booking_date
            FROM customers c
            LEFT JOIN bookings b ON c.id = b.customer_id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (search) {
            query += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }
        
        query += ' GROUP BY c.id ORDER BY c.created_at DESC';
        
        // Add pagination
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const customers = await db.execute(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM customers c WHERE 1=1';
        const countParams = [];
        
        if (search) {
            countQuery += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)';
            const searchPattern = `%${search}%`;
            countParams.push(searchPattern, searchPattern, searchPattern);
        }
        
        const countResult = await db.execute(countQuery, countParams);
        const totalCustomers = countResult[0].total;
        
        res.json({
            customers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCustomers,
                pages: Math.ceil(totalCustomers / limit)
            }
        });
        
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get customer by ID with booking history
router.get('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get customer details
        const customers = await db.execute('SELECT * FROM customers WHERE id = ?', [id]);
        
        if (customers.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        const customer = customers[0];
        
        // Get customer's booking history
        const bookings = await db.execute(`
            SELECT b.*, r.room_name, r.room_number, rc.name as category_name
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE b.customer_id = ?
            ORDER BY b.created_at DESC
        `, [id]);
        
        // Calculate customer statistics
        const stats = {
            total_bookings: bookings.length,
            total_spent: bookings.reduce((sum, booking) => 
                booking.booking_status === 'completed' ? sum + parseFloat(booking.total_amount) : sum, 0),
            pending_bookings: bookings.filter(b => b.booking_status === 'pending').length,
            confirmed_bookings: bookings.filter(b => b.booking_status === 'confirmed').length,
            cancelled_bookings: bookings.filter(b => b.booking_status === 'cancelled').length,
            completed_bookings: bookings.filter(b => b.booking_status === 'completed').length
        };
        
        res.json({
            customer,
            bookings,
            stats
        });
        
    } catch (error) {
        console.error('Get customer by ID error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new customer (Admin/Manager only)
router.post('/', authenticateToken, requireManager, validateCustomer, async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            email,
            phone,
            address,
            city,
            country,
            postal_code,
            date_of_birth
        } = req.body;
        
        // Check if customer already exists
        const existingCustomer = await db.execute('SELECT id FROM customers WHERE email = ?', [email]);
        
        if (existingCustomer.length > 0) {
            return res.status(400).json({ error: 'Customer already exists with this email' });
        }
        
        // Create customer
        const result = await db.execute(
            'INSERT INTO customers (first_name, last_name, email, phone, address, city, country, postal_code, date_of_birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [first_name, last_name, email, phone, address, city, country, postal_code, date_of_birth]
        );
        
        const customerId = result.insertId;
        
        // Get the created customer
        const createdCustomer = await db.execute('SELECT * FROM customers WHERE id = ?', [customerId]);
        
        res.status(201).json({
            message: 'Customer created successfully',
            customer: createdCustomer[0]
        });
        
    } catch (error) {
        console.error('Create customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update customer (Admin/Manager only)
router.put('/:id', authenticateToken, requireManager, validateCustomer, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            first_name,
            last_name,
            email,
            phone,
            address,
            city,
            country,
            postal_code,
            date_of_birth
        } = req.body;
        
        // Check if customer exists
        const existingCustomer = await db.execute('SELECT id FROM customers WHERE id = ?', [id]);
        if (existingCustomer.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        // Check if email already exists for other customers
        const duplicateEmail = await db.execute(
            'SELECT id FROM customers WHERE email = ? AND id != ?',
            [email, id]
        );
        
        if (duplicateEmail.length > 0) {
            return res.status(400).json({ error: 'Email already exists for another customer' });
        }
        
        // Update customer
        await db.execute(
            'UPDATE customers SET first_name = ?, last_name = ?, email = ?, phone = ?, address = ?, city = ?, country = ?, postal_code = ?, date_of_birth = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [first_name, last_name, email, phone, address, city, country, postal_code, date_of_birth, id]
        );
        
        // Get the updated customer
        const updatedCustomer = await db.execute('SELECT * FROM customers WHERE id = ?', [id]);
        
        res.json({
            message: 'Customer updated successfully',
            customer: updatedCustomer[0]
        });
        
    } catch (error) {
        console.error('Update customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete customer (Admin/Manager only)
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if customer exists
        const existingCustomer = await db.execute('SELECT id FROM customers WHERE id = ?', [id]);
        if (existingCustomer.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        // Check if customer has active bookings
        const activeBookings = await db.execute(
            'SELECT id FROM bookings WHERE customer_id = ? AND booking_status IN (?, ?)',
            [id, 'pending', 'confirmed']
        );
        
        if (activeBookings.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete customer with active bookings. Cancel or complete bookings first.' 
            });
        }
        
        // Delete customer
        await db.execute('DELETE FROM customers WHERE id = ?', [id]);
        
        res.json({ message: 'Customer deleted successfully' });
        
    } catch (error) {
        console.error('Delete customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get customer statistics (Admin/Manager only)
router.get('/stats/overview', authenticateToken, requireManager, async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        
        let dateCondition = '';
        if (period === 'week') {
            dateCondition = 'AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
        } else if (period === 'month') {
            dateCondition = 'AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
        } else if (period === 'year') {
            dateCondition = 'AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
        }
        
        // Get customer statistics
        const customerStats = await db.execute(`
            SELECT 
                COUNT(*) as total_customers,
                COUNT(CASE WHEN c.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN 1 END) as new_customers_month,
                COUNT(CASE WHEN c.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK) THEN 1 END) as new_customers_week
            FROM customers c
            WHERE 1=1 ${dateCondition}
        `);
        
        // Get top customers by spending
        const topCustomers = await db.execute(`
            SELECT c.*, 
                   COUNT(b.id) as total_bookings,
                   SUM(CASE WHEN b.booking_status = 'completed' THEN b.total_amount ELSE 0 END) as total_spent
            FROM customers c
            LEFT JOIN bookings b ON c.id = b.customer_id
            GROUP BY c.id
            ORDER BY total_spent DESC
            LIMIT 10
        `);
        
        // Get customer countries
        const customerCountries = await db.execute(`
            SELECT country, COUNT(*) as count
            FROM customers
            WHERE country IS NOT NULL AND country != ''
            GROUP BY country
            ORDER BY count DESC
            LIMIT 10
        `);
        
        res.json({
            period,
            overview: customerStats[0],
            top_customers: topCustomers,
            countries: customerCountries
        });
        
    } catch (error) {
        console.error('Get customer statistics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Search customers (Admin/Manager only)
router.get('/search/:query', authenticateToken, requireManager, async (req, res) => {
    try {
        const { query } = req.params;
        const { limit = 10 } = req.query;
        
        const searchPattern = `%${query}%`;
        
        const customers = await db.execute(`
            SELECT c.*, 
                   COUNT(b.id) as total_bookings,
                   MAX(b.created_at) as last_booking_date
            FROM customers c
            LEFT JOIN bookings b ON c.id = b.customer_id
            WHERE c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ?
        `, [searchPattern, searchPattern, searchPattern, searchPattern, parseInt(limit)]);
        
        res.json({ customers });
        
    } catch (error) {
        console.error('Search customers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get customer booking preferences (Admin/Manager only)
router.get('/:id/preferences', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get customer's booking patterns
        const bookingPatterns = await db.execute(`
            SELECT 
                COUNT(*) as total_bookings,
                AVG(b.adults) as avg_adults,
                AVG(b.children) as avg_children,
                AVG(b.total_amount) as avg_spending,
                AVG(DATEDIFF(b.check_out_date, b.check_in_date)) as avg_stay_length,
                rc.name as preferred_category,
                COUNT(CASE WHEN rc.name IS NOT NULL THEN 1 END) as category_bookings
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE b.customer_id = ? AND b.booking_status IN ('confirmed', 'completed')
            GROUP BY rc.name
            ORDER BY category_bookings DESC
        `, [id]);
        
        // Get most used amenities
        const amenityPreferences = await db.execute(`
            SELECT a.name, a.icon, COUNT(*) as usage_count
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            JOIN room_amenities ra ON r.id = ra.room_id
            JOIN amenities a ON ra.amenity_id = a.id
            WHERE b.customer_id = ? AND b.booking_status IN ('confirmed', 'completed')
            GROUP BY a.id
            ORDER BY usage_count DESC
            LIMIT 5
        `, [id]);
        
        // Get seasonal booking patterns
        const seasonalPattern = await db.execute(`
            SELECT 
                MONTH(b.check_in_date) as month,
                COUNT(*) as bookings,
                AVG(b.total_amount) as avg_amount
            FROM bookings b
            WHERE b.customer_id = ? AND b.booking_status IN ('confirmed', 'completed')
            GROUP BY MONTH(b.check_in_date)
            ORDER BY month
        `, [id]);
        
        res.json({
            booking_patterns: bookingPatterns,
            amenity_preferences: amenityPreferences,
            seasonal_pattern: seasonalPattern
        });
        
    } catch (error) {
        console.error('Get customer preferences error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;