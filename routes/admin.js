const express = require('express');
const moment = require('moment');
const db = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

const router = express.Router();

// Get dashboard overview statistics
router.get('/dashboard', authenticateToken, requireManager, async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const thisMonth = moment().format('YYYY-MM');
        
        // Get booking statistics
        const bookingStats = await db.execute(`
            SELECT 
                COUNT(*) as total_bookings,
                SUM(CASE WHEN booking_status = 'pending' THEN 1 ELSE 0 END) as pending_bookings,
                SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_bookings,
                SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
                SUM(CASE WHEN booking_status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
                SUM(CASE WHEN DATE(created_at) = ? THEN 1 ELSE 0 END) as today_bookings,
                SUM(CASE WHEN DATE_FORMAT(created_at, '%Y-%m') = ? THEN 1 ELSE 0 END) as month_bookings
            FROM bookings
        `, [today, thisMonth]);
        
        // Get revenue statistics
        const revenueStats = await db.execute(`
            SELECT 
                SUM(CASE WHEN booking_status IN ('confirmed', 'completed') THEN total_amount ELSE 0 END) as total_revenue,
                SUM(CASE WHEN booking_status IN ('confirmed', 'completed') AND DATE(created_at) = ? THEN total_amount ELSE 0 END) as today_revenue,
                SUM(CASE WHEN booking_status IN ('confirmed', 'completed') AND DATE_FORMAT(created_at, '%Y-%m') = ? THEN total_amount ELSE 0 END) as month_revenue,
                AVG(CASE WHEN booking_status IN ('confirmed', 'completed') THEN total_amount ELSE NULL END) as avg_booking_value
            FROM bookings
        `, [today, thisMonth]);
        
        // Get room statistics
        const roomStats = await db.execute(`
            SELECT 
                COUNT(*) as total_rooms,
                SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active_rooms,
                SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END) as inactive_rooms
            FROM rooms
        `);
        
        // Get current occupancy
        const occupancyStats = await db.execute(`
            SELECT 
                COUNT(DISTINCT b.room_id) as occupied_rooms,
                (SELECT COUNT(*) FROM rooms WHERE is_active = TRUE) as total_active_rooms
            FROM bookings b
            WHERE b.booking_status IN ('confirmed', 'completed')
            AND b.check_in_date <= ?
            AND b.check_out_date > ?
        `, [today, today]);
        
        const occupancyRate = occupancyStats[0].total_active_rooms > 0 ? 
            (occupancyStats[0].occupied_rooms / occupancyStats[0].total_active_rooms * 100).toFixed(2) : 0;
        
        // Get customer statistics
        const customerStats = await db.execute(`
            SELECT 
                COUNT(*) as total_customers,
                SUM(CASE WHEN DATE(created_at) = ? THEN 1 ELSE 0 END) as new_customers_today,
                SUM(CASE WHEN DATE_FORMAT(created_at, '%Y-%m') = ? THEN 1 ELSE 0 END) as new_customers_month
            FROM customers
        `, [today, thisMonth]);
        
        // Get recent bookings
        const recentBookings = await db.execute(`
            SELECT b.*, c.first_name, c.last_name, c.email, r.room_name, r.room_number
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN rooms r ON b.room_id = r.id
            ORDER BY b.created_at DESC
            LIMIT 10
        `);
        
        // Get upcoming check-ins
        const upcomingCheckIns = await db.execute(`
            SELECT b.*, c.first_name, c.last_name, c.email, r.room_name, r.room_number
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN rooms r ON b.room_id = r.id
            WHERE b.booking_status = 'confirmed'
            AND b.check_in_date BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY)
            ORDER BY b.check_in_date ASC
        `, [today, today]);
        
        // Get upcoming check-outs
        const upcomingCheckOuts = await db.execute(`
            SELECT b.*, c.first_name, c.last_name, c.email, r.room_name, r.room_number
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN rooms r ON b.room_id = r.id
            WHERE b.booking_status IN ('confirmed', 'completed')
            AND b.check_out_date BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY)
            ORDER BY b.check_out_date ASC
        `, [today, today]);
        
        res.json({
            bookings: bookingStats[0],
            revenue: revenueStats[0],
            rooms: roomStats[0],
            occupancy: {
                rate: occupancyRate,
                occupied_rooms: occupancyStats[0].occupied_rooms,
                total_active_rooms: occupancyStats[0].total_active_rooms
            },
            customers: customerStats[0],
            recent_bookings: recentBookings,
            upcoming_check_ins: upcomingCheckIns,
            upcoming_check_outs: upcomingCheckOuts
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get booking trends (for charts)
router.get('/booking-trends', authenticateToken, requireManager, async (req, res) => {
    try {
        const { period = 'month', type = 'bookings' } = req.query;
        
        let dateFormat, intervalCondition;
        
        switch (period) {
            case 'week':
                dateFormat = '%Y-%m-%d';
                intervalCondition = 'DATE_SUB(NOW(), INTERVAL 1 WEEK)';
                break;
            case 'month':
                dateFormat = '%Y-%m-%d';
                intervalCondition = 'DATE_SUB(NOW(), INTERVAL 1 MONTH)';
                break;
            case 'year':
                dateFormat = '%Y-%m';
                intervalCondition = 'DATE_SUB(NOW(), INTERVAL 1 YEAR)';
                break;
            default:
                dateFormat = '%Y-%m-%d';
                intervalCondition = 'DATE_SUB(NOW(), INTERVAL 1 MONTH)';
        }
        
        let query;
        if (type === 'revenue') {
            query = `
                SELECT 
                    DATE_FORMAT(created_at, '${dateFormat}') as date,
                    SUM(CASE WHEN booking_status IN ('confirmed', 'completed') THEN total_amount ELSE 0 END) as value
                FROM bookings
                WHERE created_at >= ${intervalCondition}
                GROUP BY DATE_FORMAT(created_at, '${dateFormat}')
                ORDER BY date
            `;
        } else {
            query = `
                SELECT 
                    DATE_FORMAT(created_at, '${dateFormat}') as date,
                    COUNT(*) as value
                FROM bookings
                WHERE created_at >= ${intervalCondition}
                GROUP BY DATE_FORMAT(created_at, '${dateFormat}')
                ORDER BY date
            `;
        }
        
        const trends = await db.execute(query);
        
        res.json({
            period,
            type,
            data: trends
        });
        
    } catch (error) {
        console.error('Booking trends error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get room performance
router.get('/room-performance', authenticateToken, requireManager, async (req, res) => {
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
        
        const roomPerformance = await db.execute(`
            SELECT 
                r.id,
                r.room_number,
                r.room_name,
                rc.name as category_name,
                COUNT(b.id) as total_bookings,
                SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as total_revenue,
                AVG(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE NULL END) as avg_revenue,
                SUM(CASE WHEN b.booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
                (COUNT(b.id) - SUM(CASE WHEN b.booking_status = 'cancelled' THEN 1 ELSE 0 END)) / COUNT(b.id) * 100 as success_rate
            FROM rooms r
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            LEFT JOIN bookings b ON r.id = b.room_id ${dateCondition}
            WHERE r.is_active = TRUE
            GROUP BY r.id, r.room_number, r.room_name, rc.name
            ORDER BY total_revenue DESC
        `);
        
        res.json({
            period,
            rooms: roomPerformance
        });
        
    } catch (error) {
        console.error('Room performance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get availability calendar
router.get('/availability-calendar', authenticateToken, requireManager, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        const startDate = start_date || moment().format('YYYY-MM-DD');
        const endDate = end_date || moment().add(30, 'days').format('YYYY-MM-DD');
        
        // Get all rooms
        const rooms = await db.execute(`
            SELECT r.*, rc.name as category_name
            FROM rooms r
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE r.is_active = TRUE
            ORDER BY r.room_number
        `);
        
        // Get bookings for the date range
        const bookings = await db.execute(`
            SELECT room_id, check_in_date, check_out_date, booking_status
            FROM bookings
            WHERE booking_status IN ('pending', 'confirmed', 'completed')
            AND NOT (check_out_date <= ? OR check_in_date >= ?)
        `, [startDate, endDate]);
        
        // Generate calendar data
        const calendar = [];
        const current = moment(startDate);
        const end = moment(endDate);
        
        while (current.isSameOrBefore(end)) {
            const date = current.format('YYYY-MM-DD');
            const dayData = {
                date: date,
                rooms: rooms.map(room => {
                    const roomBookings = bookings.filter(b => 
                        b.room_id === room.id &&
                        current.isSameOrAfter(moment(b.check_in_date)) &&
                        current.isBefore(moment(b.check_out_date))
                    );
                    
                    return {
                        room_id: room.id,
                        room_number: room.room_number,
                        room_name: room.room_name,
                        category_name: room.category_name,
                        is_available: roomBookings.length === 0,
                        booking_status: roomBookings.length > 0 ? roomBookings[0].booking_status : null
                    };
                })
            };
            
            calendar.push(dayData);
            current.add(1, 'day');
        }
        
        res.json({
            start_date: startDate,
            end_date: endDate,
            calendar
        });
        
    } catch (error) {
        console.error('Availability calendar error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get system alerts
router.get('/alerts', authenticateToken, requireManager, async (req, res) => {
    try {
        const alerts = [];
        
        // Check for rooms with no images
        const roomsWithoutImages = await db.execute(`
            SELECT r.id, r.room_number, r.room_name
            FROM rooms r
            LEFT JOIN room_images ri ON r.id = ri.room_id
            WHERE r.is_active = TRUE
            AND ri.id IS NULL
        `);
        
        if (roomsWithoutImages.length > 0) {
            alerts.push({
                type: 'warning',
                category: 'rooms',
                message: `${roomsWithoutImages.length} active rooms have no images`,
                details: roomsWithoutImages,
                action: 'Upload images for these rooms'
            });
        }
        
        // Check for bookings expiring soon
        const expiringBookings = await db.execute(`
            SELECT b.*, c.first_name, c.last_name, r.room_name
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN rooms r ON b.room_id = r.id
            WHERE b.booking_status = 'pending'
            AND b.created_at <= DATE_SUB(NOW(), INTERVAL 1 DAY)
        `);
        
        if (expiringBookings.length > 0) {
            alerts.push({
                type: 'warning',
                category: 'bookings',
                message: `${expiringBookings.length} pending bookings are over 24 hours old`,
                details: expiringBookings,
                action: 'Follow up on pending bookings'
            });
        }
        
        // Check for low occupancy
        const occupancyCheck = await db.execute(`
            SELECT 
                COUNT(DISTINCT b.room_id) as occupied_rooms,
                (SELECT COUNT(*) FROM rooms WHERE is_active = TRUE) as total_rooms
            FROM bookings b
            WHERE b.booking_status IN ('confirmed', 'completed')
            AND b.check_in_date <= CURDATE()
            AND b.check_out_date > CURDATE()
        `);
        
        const currentOccupancy = occupancyCheck[0].total_rooms > 0 ? 
            (occupancyCheck[0].occupied_rooms / occupancyCheck[0].total_rooms * 100) : 0;
        
        if (currentOccupancy < 30) {
            alerts.push({
                type: 'info',
                category: 'occupancy',
                message: `Current occupancy is ${currentOccupancy.toFixed(1)}%`,
                details: { occupancy: currentOccupancy },
                action: 'Consider promotional campaigns'
            });
        }
        
        // Check for OTA sync failures
        const failedSyncs = await db.execute(`
            SELECT oc.ota_name, COUNT(*) as failed_count
            FROM ota_sync_logs sl
            JOIN ota_configurations oc ON sl.ota_configuration_id = oc.id
            WHERE sl.status = 'failed'
            AND sl.sync_started_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
            GROUP BY oc.id, oc.ota_name
        `);
        
        if (failedSyncs.length > 0) {
            alerts.push({
                type: 'error',
                category: 'ota',
                message: `OTA sync failures detected`,
                details: failedSyncs,
                action: 'Check OTA configurations and retry sync'
            });
        }
        
        res.json({
            alerts,
            count: alerts.length
        });
        
    } catch (error) {
        console.error('System alerts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get activity log
router.get('/activity-log', authenticateToken, requireManager, async (req, res) => {
    try {
        const { limit = 50, page = 1 } = req.query;
        
        // This is a simplified activity log - in a production system, 
        // you'd want to implement proper activity logging
        const recentActivities = await db.execute(`
            SELECT 
                'booking' as type,
                CONCAT('New booking #', booking_reference, ' by ', c.first_name, ' ', c.last_name) as description,
                b.created_at as timestamp,
                u.first_name as user_name
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            LEFT JOIN users u ON b.source = 'admin'
            
            UNION ALL
            
            SELECT 
                'room' as type,
                CONCAT('Room ', room_number, ' updated') as description,
                r.updated_at as timestamp,
                NULL as user_name
            FROM rooms r
            WHERE r.updated_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)
            
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        `, [parseInt(limit), (page - 1) * parseInt(limit)]);
        
        res.json({
            activities: recentActivities,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
        
    } catch (error) {
        console.error('Activity log error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get system info
router.get('/system-info', authenticateToken, requireManager, async (req, res) => {
    try {
        const systemInfo = {
            version: '1.0.0',
            node_version: process.version,
            environment: process.env.NODE_ENV,
            uptime: process.uptime(),
            memory_usage: process.memoryUsage(),
            database_status: 'connected',
            last_backup: null, // This would be implemented based on backup strategy
            features: {
                rooms: true,
                bookings: true,
                customers: true,
                ota_sync: true,
                reports: true,
                multi_language: true,
                multi_currency: true
            }
        };
        
        res.json(systemInfo);
        
    } catch (error) {
        console.error('System info error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;