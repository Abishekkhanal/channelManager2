const express = require('express');
const moment = require('moment');
const nodemailer = require('nodemailer');
const db = require('../config/database');
const { authenticateToken, requireManager, optionalAuth } = require('../middleware/auth');
const { validateBooking } = require('../middleware/validation');

const router = express.Router();

// Email transporter configuration
const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

// Helper function to generate booking reference
const generateBookingReference = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `BK${timestamp}${random}`;
};

// Helper function to send booking confirmation email
const sendBookingEmail = async (booking, type = 'confirmation') => {
    try {
        const subject = type === 'confirmation' ? 
            `Booking Confirmation - ${booking.booking_reference}` : 
            `Booking Cancelled - ${booking.booking_reference}`;
        
        const html = `
            <h2>Hotel Booking ${type === 'confirmation' ? 'Confirmation' : 'Cancellation'}</h2>
            <p>Dear ${booking.customer.first_name} ${booking.customer.last_name},</p>
            
            ${type === 'confirmation' ? 
                '<p>Thank you for your booking. Here are your booking details:</p>' :
                '<p>Your booking has been cancelled. Here were your booking details:</p>'
            }
            
            <table border="1" cellpadding="10" cellspacing="0">
                <tr><td><strong>Booking Reference:</strong></td><td>${booking.booking_reference}</td></tr>
                <tr><td><strong>Room:</strong></td><td>${booking.room.room_name}</td></tr>
                <tr><td><strong>Check-in:</strong></td><td>${moment(booking.check_in_date).format('MMMM Do YYYY')}</td></tr>
                <tr><td><strong>Check-out:</strong></td><td>${moment(booking.check_out_date).format('MMMM Do YYYY')}</td></tr>
                <tr><td><strong>Guests:</strong></td><td>${booking.adults} Adults${booking.children > 0 ? `, ${booking.children} Children` : ''}</td></tr>
                <tr><td><strong>Total Amount:</strong></td><td>$${booking.total_amount}</td></tr>
            </table>
            
            ${booking.special_requests ? `<p><strong>Special Requests:</strong> ${booking.special_requests}</p>` : ''}
            
            ${type === 'confirmation' ? 
                '<p>We look forward to welcoming you to our hotel.</p>' :
                '<p>If you have any questions, please contact us.</p>'
            }
            
            <p>Best regards,<br>Grand Hotel Team</p>
        `;
        
        const mailOptions = {
            from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
            to: booking.customer.email,
            subject: subject,
            html: html
        };
        
        await transporter.sendMail(mailOptions);
        
    } catch (error) {
        console.error('Email sending error:', error);
        throw error;
    }
};

// Create booking
router.post('/', validateBooking, async (req, res) => {
    try {
        const {
            room_id,
            check_in_date,
            check_out_date,
            adults,
            children = 0,
            special_requests,
            customer
        } = req.body;
        
        // Validate dates
        const checkIn = moment(check_in_date);
        const checkOut = moment(check_out_date);
        
        if (checkIn.isSameOrAfter(checkOut)) {
            return res.status(400).json({ error: 'Check-out date must be after check-in date' });
        }
        
        if (checkIn.isBefore(moment().format('YYYY-MM-DD'))) {
            return res.status(400).json({ error: 'Check-in date cannot be in the past' });
        }
        
        // Check if room exists and is available
        const rooms = await db.execute('SELECT * FROM rooms WHERE id = ? AND is_active = TRUE', [room_id]);
        if (rooms.length === 0) {
            return res.status(404).json({ error: 'Room not found or not available' });
        }
        
        const room = rooms[0];
        const totalGuests = adults + children;
        
        if (totalGuests > room.max_occupancy) {
            return res.status(400).json({ error: 'Total guests exceed room capacity' });
        }
        
        // Check room availability
        const conflictingBookings = await db.execute(`
            SELECT id FROM bookings 
            WHERE room_id = ? 
            AND booking_status IN ('pending', 'confirmed')
            AND NOT (check_out_date <= ? OR check_in_date >= ?)
        `, [room_id, check_in_date, check_out_date]);
        
        if (conflictingBookings.length > 0) {
            return res.status(400).json({ error: 'Room is not available for the selected dates' });
        }
        
        // Calculate total amount
        const nights = checkOut.diff(checkIn, 'days');
        const subtotal = room.price_per_night * nights;
        const taxRate = 0.10; // 10% tax
        const taxAmount = subtotal * taxRate;
        const totalAmount = subtotal + taxAmount;
        
        // Create or get customer
        let customerId;
        const existingCustomers = await db.execute('SELECT id FROM customers WHERE email = ?', [customer.email]);
        
        if (existingCustomers.length > 0) {
            customerId = existingCustomers[0].id;
            // Update customer information
            await db.execute(
                'UPDATE customers SET first_name = ?, last_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [customer.first_name, customer.last_name, customer.phone, customerId]
            );
        } else {
            // Create new customer
            const customerResult = await db.execute(
                'INSERT INTO customers (first_name, last_name, email, phone, address, city, country, postal_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [customer.first_name, customer.last_name, customer.email, customer.phone, customer.address, customer.city, customer.country, customer.postal_code]
            );
            customerId = customerResult.insertId;
        }
        
        // Create booking
        const bookingReference = generateBookingReference();
        const bookingResult = await db.execute(
            'INSERT INTO bookings (booking_reference, customer_id, room_id, check_in_date, check_out_date, adults, children, total_amount, special_requests, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [bookingReference, customerId, room_id, check_in_date, check_out_date, adults, children, totalAmount.toFixed(2), special_requests, 'direct']
        );
        
        const bookingId = bookingResult.insertId;
        
        // Get complete booking details for email
        const bookingDetails = await db.execute(`
            SELECT b.*, c.first_name, c.last_name, c.email, c.phone,
                   r.room_name, r.room_number, r.price_per_night
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN rooms r ON b.room_id = r.id
            WHERE b.id = ?
        `, [bookingId]);
        
        const booking = bookingDetails[0];
        booking.customer = {
            first_name: booking.first_name,
            last_name: booking.last_name,
            email: booking.email,
            phone: booking.phone
        };
        booking.room = {
            room_name: booking.room_name,
            room_number: booking.room_number,
            price_per_night: booking.price_per_night
        };
        
        // Send confirmation email
        try {
            await sendBookingEmail(booking, 'confirmation');
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Don't fail the booking if email fails
        }
        
        res.status(201).json({
            message: 'Booking created successfully',
            booking: {
                id: bookingId,
                booking_reference: bookingReference,
                check_in_date,
                check_out_date,
                adults,
                children,
                total_amount: totalAmount.toFixed(2),
                subtotal: subtotal.toFixed(2),
                tax_amount: taxAmount.toFixed(2),
                nights,
                status: 'pending'
            }
        });
        
    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get booking by reference (public endpoint)
router.get('/reference/:reference', async (req, res) => {
    try {
        const { reference } = req.params;
        
        const bookings = await db.execute(`
            SELECT b.*, c.first_name, c.last_name, c.email, c.phone,
                   r.room_name, r.room_number, r.price_per_night, r.description, r.cancellation_policy,
                   rc.name as category_name
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN rooms r ON b.room_id = r.id
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE b.booking_reference = ?
        `, [reference]);
        
        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        const booking = bookings[0];
        
        // Calculate nights
        const nights = moment(booking.check_out_date).diff(moment(booking.check_in_date), 'days');
        
        res.json({
            booking: {
                ...booking,
                nights,
                can_cancel: booking.booking_status === 'pending' || booking.booking_status === 'confirmed'
            }
        });
        
    } catch (error) {
        console.error('Get booking by reference error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Cancel booking
router.put('/:reference/cancel', async (req, res) => {
    try {
        const { reference } = req.params;
        const { reason } = req.body;
        
        // Get booking details
        const bookings = await db.execute(`
            SELECT b.*, c.first_name, c.last_name, c.email, c.phone,
                   r.room_name, r.room_number, r.price_per_night, r.cancellation_policy
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN rooms r ON b.room_id = r.id
            WHERE b.booking_reference = ?
        `, [reference]);
        
        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        const booking = bookings[0];
        
        if (booking.booking_status === 'cancelled') {
            return res.status(400).json({ error: 'Booking is already cancelled' });
        }
        
        if (booking.booking_status === 'completed') {
            return res.status(400).json({ error: 'Cannot cancel completed booking' });
        }
        
        // Check cancellation policy (24 hours before check-in)
        const checkInDate = moment(booking.check_in_date);
        const now = moment();
        const hoursDifference = checkInDate.diff(now, 'hours');
        
        if (hoursDifference < 24) {
            return res.status(400).json({ error: 'Cannot cancel booking less than 24 hours before check-in' });
        }
        
        // Update booking status
        await db.execute(
            'UPDATE bookings SET booking_status = ?, updated_at = CURRENT_TIMESTAMP WHERE booking_reference = ?',
            ['cancelled', reference]
        );
        
        // Prepare booking data for email
        booking.customer = {
            first_name: booking.first_name,
            last_name: booking.last_name,
            email: booking.email,
            phone: booking.phone
        };
        booking.room = {
            room_name: booking.room_name,
            room_number: booking.room_number,
            price_per_night: booking.price_per_night
        };
        
        // Send cancellation email
        try {
            await sendBookingEmail(booking, 'cancellation');
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
        }
        
        res.json({ message: 'Booking cancelled successfully' });
        
    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Modify booking (limited modifications)
router.put('/:reference/modify', async (req, res) => {
    try {
        const { reference } = req.params;
        const { special_requests } = req.body;
        
        // Get booking
        const bookings = await db.execute('SELECT * FROM bookings WHERE booking_reference = ?', [reference]);
        
        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        const booking = bookings[0];
        
        if (booking.booking_status === 'cancelled') {
            return res.status(400).json({ error: 'Cannot modify cancelled booking' });
        }
        
        if (booking.booking_status === 'completed') {
            return res.status(400).json({ error: 'Cannot modify completed booking' });
        }
        
        // Update special requests
        await db.execute(
            'UPDATE bookings SET special_requests = ?, updated_at = CURRENT_TIMESTAMP WHERE booking_reference = ?',
            [special_requests, reference]
        );
        
        res.json({ message: 'Booking modified successfully' });
        
    } catch (error) {
        console.error('Modify booking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all bookings (Admin/Manager only)
router.get('/admin/all', authenticateToken, requireManager, async (req, res) => {
    try {
        const { status, room_id, date_from, date_to, page = 1, limit = 50 } = req.query;
        
        let query = `
            SELECT b.*, c.first_name, c.last_name, c.email, c.phone,
                   r.room_name, r.room_number, rc.name as category_name
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN rooms r ON b.room_id = r.id
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ' AND b.booking_status = ?';
            params.push(status);
        }
        
        if (room_id) {
            query += ' AND b.room_id = ?';
            params.push(room_id);
        }
        
        if (date_from) {
            query += ' AND b.check_in_date >= ?';
            params.push(date_from);
        }
        
        if (date_to) {
            query += ' AND b.check_in_date <= ?';
            params.push(date_to);
        }
        
        query += ' ORDER BY b.created_at DESC';
        
        // Add pagination
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const bookings = await db.execute(query, params);
        
        // Get total count
        let countQuery = `
            SELECT COUNT(*) as total
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN rooms r ON b.room_id = r.id
            WHERE 1=1
        `;
        
        const countParams = [];
        
        if (status) {
            countQuery += ' AND b.booking_status = ?';
            countParams.push(status);
        }
        
        if (room_id) {
            countQuery += ' AND b.room_id = ?';
            countParams.push(room_id);
        }
        
        if (date_from) {
            countQuery += ' AND b.check_in_date >= ?';
            countParams.push(date_from);
        }
        
        if (date_to) {
            countQuery += ' AND b.check_in_date <= ?';
            countParams.push(date_to);
        }
        
        const countResult = await db.execute(countQuery, countParams);
        const totalBookings = countResult[0].total;
        
        res.json({
            bookings,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalBookings,
                pages: Math.ceil(totalBookings / limit)
            }
        });
        
    } catch (error) {
        console.error('Get all bookings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update booking status (Admin/Manager only)
router.put('/admin/:id/status', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        // Update booking status
        await db.execute(
            'UPDATE bookings SET booking_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [status, id]
        );
        
        res.json({ message: 'Booking status updated successfully' });
        
    } catch (error) {
        console.error('Update booking status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get booking statistics (Admin/Manager only)
router.get('/admin/stats', authenticateToken, requireManager, async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        
        let dateCondition = '';
        if (period === 'week') {
            dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
        } else if (period === 'month') {
            dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
        } else if (period === 'year') {
            dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
        }
        
        // Get booking counts by status
        const statusStats = await db.execute(`
            SELECT booking_status, COUNT(*) as count
            FROM bookings b
            WHERE 1=1 ${dateCondition}
            GROUP BY booking_status
        `);
        
        // Get revenue statistics
        const revenueStats = await db.execute(`
            SELECT 
                COUNT(*) as total_bookings,
                SUM(CASE WHEN booking_status = 'confirmed' THEN total_amount ELSE 0 END) as confirmed_revenue,
                SUM(CASE WHEN booking_status = 'completed' THEN total_amount ELSE 0 END) as completed_revenue,
                AVG(CASE WHEN booking_status IN ('confirmed', 'completed') THEN total_amount ELSE NULL END) as avg_booking_value
            FROM bookings b
            WHERE 1=1 ${dateCondition}
        `);
        
        // Get occupancy rate
        const occupancyStats = await db.execute(`
            SELECT 
                COUNT(DISTINCT b.room_id) as occupied_rooms,
                (SELECT COUNT(*) FROM rooms WHERE is_active = TRUE) as total_rooms
            FROM bookings b
            WHERE b.booking_status IN ('confirmed', 'completed')
            AND b.check_in_date <= CURDATE()
            AND b.check_out_date > CURDATE()
        `);
        
        const occupancyRate = occupancyStats[0].total_rooms > 0 ? 
            (occupancyStats[0].occupied_rooms / occupancyStats[0].total_rooms * 100).toFixed(2) : 0;
        
        res.json({
            period,
            status_breakdown: statusStats,
            revenue: revenueStats[0],
            occupancy: {
                rate: occupancyRate,
                occupied_rooms: occupancyStats[0].occupied_rooms,
                total_rooms: occupancyStats[0].total_rooms
            }
        });
        
    } catch (error) {
        console.error('Get booking statistics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;