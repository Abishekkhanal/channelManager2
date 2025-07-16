const express = require('express');
const moment = require('moment');
const db = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

const router = express.Router();

// Get revenue report
router.get('/revenue', authenticateToken, requireManager, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;
        
        let dateCondition = '';
        let groupBy = '';
        
        if (start_date && end_date) {
            dateCondition = 'AND b.created_at BETWEEN ? AND ?';
            groupBy = 'DATE(b.created_at)';
        } else {
            switch (period) {
                case 'week':
                    dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
                    groupBy = 'DATE(b.created_at)';
                    break;
                case 'month':
                    dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
                    groupBy = 'DATE(b.created_at)';
                    break;
                case 'year':
                    dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
                    groupBy = 'DATE_FORMAT(b.created_at, "%Y-%m")';
                    break;
                default:
                    dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
                    groupBy = 'DATE(b.created_at)';
            }
        }
        
        const params = [];
        if (start_date && end_date) {
            params.push(start_date, end_date);
        }
        
        // Get overall revenue statistics
        const overallStats = await db.execute(`
            SELECT 
                SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as total_revenue,
                COUNT(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN 1 END) as successful_bookings,
                AVG(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE NULL END) as avg_booking_value,
                SUM(CASE WHEN b.booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
                COUNT(*) as total_bookings
            FROM bookings b
            WHERE 1=1 ${dateCondition}
        `, params);
        
        // Get revenue by date
        const revenueByDate = await db.execute(`
            SELECT 
                ${groupBy} as date,
                SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as revenue,
                COUNT(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN 1 END) as bookings,
                AVG(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE NULL END) as avg_value
            FROM bookings b
            WHERE 1=1 ${dateCondition}
            GROUP BY ${groupBy}
            ORDER BY date
        `, params);
        
        // Get revenue by room category
        const revenueByCategory = await db.execute(`
            SELECT 
                rc.name as category_name,
                SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as revenue,
                COUNT(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN 1 END) as bookings,
                AVG(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE NULL END) as avg_value
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE 1=1 ${dateCondition}
            GROUP BY rc.id, rc.name
            ORDER BY revenue DESC
        `, params);
        
        // Get revenue by source
        const revenueBySource = await db.execute(`
            SELECT 
                b.source,
                SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as revenue,
                COUNT(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN 1 END) as bookings,
                AVG(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE NULL END) as avg_value
            FROM bookings b
            WHERE 1=1 ${dateCondition}
            GROUP BY b.source
            ORDER BY revenue DESC
        `, params);
        
        res.json({
            period,
            start_date: start_date || null,
            end_date: end_date || null,
            overall: overallStats[0],
            by_date: revenueByDate,
            by_category: revenueByCategory,
            by_source: revenueBySource
        });
        
    } catch (error) {
        console.error('Revenue report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get occupancy report
router.get('/occupancy', authenticateToken, requireManager, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;
        
        let dateCondition = '';
        
        if (start_date && end_date) {
            dateCondition = 'AND b.check_in_date BETWEEN ? AND ?';
        } else {
            switch (period) {
                case 'week':
                    dateCondition = 'AND b.check_in_date >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
                    break;
                case 'month':
                    dateCondition = 'AND b.check_in_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
                    break;
                case 'year':
                    dateCondition = 'AND b.check_in_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
                    break;
                default:
                    dateCondition = 'AND b.check_in_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
            }
        }
        
        const params = [];
        if (start_date && end_date) {
            params.push(start_date, end_date);
        }
        
        // Get total active rooms
        const totalRooms = await db.execute('SELECT COUNT(*) as total FROM rooms WHERE is_active = TRUE');
        const totalActiveRooms = totalRooms[0].total;
        
        // Get average occupancy
        const avgOccupancy = await db.execute(`
            SELECT 
                AVG(daily_occupancy) as avg_occupancy_rate
            FROM (
                SELECT 
                    DATE(b.check_in_date) as date,
                    COUNT(DISTINCT b.room_id) / ? * 100 as daily_occupancy
                FROM bookings b
                WHERE b.booking_status IN ('confirmed', 'completed')
                ${dateCondition}
                GROUP BY DATE(b.check_in_date)
            ) as daily_stats
        `, [totalActiveRooms, ...params]);
        
        // Get occupancy by date
        const occupancyByDate = await db.execute(`
            SELECT 
                DATE(b.check_in_date) as date,
                COUNT(DISTINCT b.room_id) as occupied_rooms,
                COUNT(DISTINCT b.room_id) / ? * 100 as occupancy_rate
            FROM bookings b
            WHERE b.booking_status IN ('confirmed', 'completed')
            ${dateCondition}
            GROUP BY DATE(b.check_in_date)
            ORDER BY date
        `, [totalActiveRooms, ...params]);
        
        // Get occupancy by room category
        const occupancyByCategory = await db.execute(`
            SELECT 
                rc.name as category_name,
                COUNT(DISTINCT r.id) as category_rooms,
                COUNT(DISTINCT CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.room_id END) as occupied_rooms,
                COUNT(DISTINCT CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.room_id END) / COUNT(DISTINCT r.id) * 100 as occupancy_rate
            FROM rooms r
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            LEFT JOIN bookings b ON r.id = b.room_id ${dateCondition.replace('b.check_in_date', 'b.check_in_date')}
            WHERE r.is_active = TRUE
            GROUP BY rc.id, rc.name
            ORDER BY occupancy_rate DESC
        `, params);
        
        // Get length of stay analysis
        const lengthOfStay = await db.execute(`
            SELECT 
                CASE 
                    WHEN DATEDIFF(b.check_out_date, b.check_in_date) = 1 THEN '1 night'
                    WHEN DATEDIFF(b.check_out_date, b.check_in_date) BETWEEN 2 AND 3 THEN '2-3 nights'
                    WHEN DATEDIFF(b.check_out_date, b.check_in_date) BETWEEN 4 AND 7 THEN '4-7 nights'
                    WHEN DATEDIFF(b.check_out_date, b.check_in_date) > 7 THEN '7+ nights'
                    ELSE 'Other'
                END as stay_length,
                COUNT(*) as bookings,
                AVG(b.total_amount) as avg_revenue
            FROM bookings b
            WHERE b.booking_status IN ('confirmed', 'completed')
            ${dateCondition}
            GROUP BY 
                CASE 
                    WHEN DATEDIFF(b.check_out_date, b.check_in_date) = 1 THEN '1 night'
                    WHEN DATEDIFF(b.check_out_date, b.check_in_date) BETWEEN 2 AND 3 THEN '2-3 nights'
                    WHEN DATEDIFF(b.check_out_date, b.check_in_date) BETWEEN 4 AND 7 THEN '4-7 nights'
                    WHEN DATEDIFF(b.check_out_date, b.check_in_date) > 7 THEN '7+ nights'
                    ELSE 'Other'
                END
            ORDER BY bookings DESC
        `, params);
        
        res.json({
            period,
            start_date: start_date || null,
            end_date: end_date || null,
            total_rooms: totalActiveRooms,
            average_occupancy: avgOccupancy[0].avg_occupancy_rate || 0,
            by_date: occupancyByDate,
            by_category: occupancyByCategory,
            length_of_stay: lengthOfStay
        });
        
    } catch (error) {
        console.error('Occupancy report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get booking report
router.get('/bookings', authenticateToken, requireManager, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date, status, source } = req.query;
        
        let dateCondition = '';
        let statusCondition = '';
        let sourceCondition = '';
        
        if (start_date && end_date) {
            dateCondition = 'AND b.created_at BETWEEN ? AND ?';
        } else {
            switch (period) {
                case 'week':
                    dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
                    break;
                case 'month':
                    dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
                    break;
                case 'year':
                    dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
                    break;
                default:
                    dateCondition = 'AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
            }
        }
        
        if (status) {
            statusCondition = 'AND b.booking_status = ?';
        }
        
        if (source) {
            sourceCondition = 'AND b.source = ?';
        }
        
        const params = [];
        if (start_date && end_date) {
            params.push(start_date, end_date);
        }
        if (status) {
            params.push(status);
        }
        if (source) {
            params.push(source);
        }
        
        // Get booking summary
        const bookingSummary = await db.execute(`
            SELECT 
                COUNT(*) as total_bookings,
                SUM(CASE WHEN b.booking_status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN b.booking_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN b.booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN b.booking_status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN b.booking_status = 'no_show' THEN 1 ELSE 0 END) as no_show,
                AVG(DATEDIFF(b.check_out_date, b.check_in_date)) as avg_length_of_stay,
                AVG(b.adults + b.children) as avg_guests
            FROM bookings b
            WHERE 1=1 ${dateCondition} ${statusCondition} ${sourceCondition}
        `, params);
        
        // Get bookings by date
        const bookingsByDate = await db.execute(`
            SELECT 
                DATE(b.created_at) as date,
                COUNT(*) as total_bookings,
                SUM(CASE WHEN b.booking_status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN b.booking_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN b.booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN b.booking_status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM bookings b
            WHERE 1=1 ${dateCondition} ${statusCondition} ${sourceCondition}
            GROUP BY DATE(b.created_at)
            ORDER BY date
        `, params);
        
        // Get bookings by source
        const bookingsBySource = await db.execute(`
            SELECT 
                b.source,
                COUNT(*) as total_bookings,
                SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN 1 ELSE 0 END) as successful_bookings,
                SUM(CASE WHEN b.booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
                SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as total_revenue
            FROM bookings b
            WHERE 1=1 ${dateCondition} ${statusCondition} ${sourceCondition}
            GROUP BY b.source
            ORDER BY total_bookings DESC
        `, params);
        
        // Get cancellation analysis
        const cancellationAnalysis = await db.execute(`
            SELECT 
                CASE 
                    WHEN DATEDIFF(b.check_in_date, b.updated_at) >= 7 THEN '7+ days before'
                    WHEN DATEDIFF(b.check_in_date, b.updated_at) BETWEEN 1 AND 6 THEN '1-6 days before'
                    WHEN DATEDIFF(b.check_in_date, b.updated_at) = 0 THEN 'Same day'
                    ELSE 'After check-in'
                END as cancellation_timing,
                COUNT(*) as count
            FROM bookings b
            WHERE b.booking_status = 'cancelled'
            ${dateCondition} ${sourceCondition}
            GROUP BY 
                CASE 
                    WHEN DATEDIFF(b.check_in_date, b.updated_at) >= 7 THEN '7+ days before'
                    WHEN DATEDIFF(b.check_in_date, b.updated_at) BETWEEN 1 AND 6 THEN '1-6 days before'
                    WHEN DATEDIFF(b.check_in_date, b.updated_at) = 0 THEN 'Same day'
                    ELSE 'After check-in'
                END
            ORDER BY count DESC
        `, params.filter((_, index) => index !== 1)); // Remove status param for cancellation analysis
        
        res.json({
            period,
            start_date: start_date || null,
            end_date: end_date || null,
            filters: { status, source },
            summary: bookingSummary[0],
            by_date: bookingsByDate,
            by_source: bookingsBySource,
            cancellation_analysis: cancellationAnalysis
        });
        
    } catch (error) {
        console.error('Booking report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get customer report
router.get('/customers', authenticateToken, requireManager, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;
        
        let dateCondition = '';
        
        if (start_date && end_date) {
            dateCondition = 'AND c.created_at BETWEEN ? AND ?';
        } else {
            switch (period) {
                case 'week':
                    dateCondition = 'AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
                    break;
                case 'month':
                    dateCondition = 'AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
                    break;
                case 'year':
                    dateCondition = 'AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
                    break;
                default:
                    dateCondition = 'AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
            }
        }
        
        const params = [];
        if (start_date && end_date) {
            params.push(start_date, end_date);
        }
        
        // Get customer summary
        const customerSummary = await db.execute(`
            SELECT 
                COUNT(*) as total_customers,
                COUNT(CASE WHEN c.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN 1 END) as new_customers_month,
                COUNT(CASE WHEN c.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK) THEN 1 END) as new_customers_week,
                AVG(customer_stats.total_bookings) as avg_bookings_per_customer,
                AVG(customer_stats.total_spent) as avg_spent_per_customer
            FROM customers c
            LEFT JOIN (
                SELECT 
                    customer_id,
                    COUNT(*) as total_bookings,
                    SUM(CASE WHEN booking_status IN ('confirmed', 'completed') THEN total_amount ELSE 0 END) as total_spent
                FROM bookings
                GROUP BY customer_id
            ) customer_stats ON c.id = customer_stats.customer_id
            WHERE 1=1 ${dateCondition}
        `, params);
        
        // Get customers by country
        const customersByCountry = await db.execute(`
            SELECT 
                c.country,
                COUNT(*) as customer_count,
                AVG(customer_stats.total_spent) as avg_spent
            FROM customers c
            LEFT JOIN (
                SELECT 
                    customer_id,
                    SUM(CASE WHEN booking_status IN ('confirmed', 'completed') THEN total_amount ELSE 0 END) as total_spent
                FROM bookings
                GROUP BY customer_id
            ) customer_stats ON c.id = customer_stats.customer_id
            WHERE c.country IS NOT NULL AND c.country != ''
            ${dateCondition}
            GROUP BY c.country
            ORDER BY customer_count DESC
            LIMIT 10
        `, params);
        
        // Get top customers by spending
        const topCustomers = await db.execute(`
            SELECT 
                c.first_name,
                c.last_name,
                c.email,
                c.country,
                COUNT(b.id) as total_bookings,
                SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as total_spent,
                MAX(b.created_at) as last_booking_date
            FROM customers c
            LEFT JOIN bookings b ON c.id = b.customer_id
            WHERE 1=1 ${dateCondition}
            GROUP BY c.id, c.first_name, c.last_name, c.email, c.country
            ORDER BY total_spent DESC
            LIMIT 20
        `, params);
        
        // Get customer acquisition by date
        const customerAcquisition = await db.execute(`
            SELECT 
                DATE(c.created_at) as date,
                COUNT(*) as new_customers
            FROM customers c
            WHERE 1=1 ${dateCondition}
            GROUP BY DATE(c.created_at)
            ORDER BY date
        `, params);
        
        // Get repeat customer analysis
        const repeatCustomerAnalysis = await db.execute(`
            SELECT 
                CASE 
                    WHEN booking_count = 1 THEN 'One-time'
                    WHEN booking_count BETWEEN 2 AND 3 THEN '2-3 bookings'
                    WHEN booking_count BETWEEN 4 AND 10 THEN '4-10 bookings'
                    WHEN booking_count > 10 THEN '10+ bookings'
                END as customer_type,
                COUNT(*) as customer_count,
                AVG(total_spent) as avg_spent
            FROM (
                SELECT 
                    c.id,
                    COUNT(b.id) as booking_count,
                    SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as total_spent
                FROM customers c
                LEFT JOIN bookings b ON c.id = b.customer_id
                WHERE 1=1 ${dateCondition}
                GROUP BY c.id
            ) customer_stats
            GROUP BY 
                CASE 
                    WHEN booking_count = 1 THEN 'One-time'
                    WHEN booking_count BETWEEN 2 AND 3 THEN '2-3 bookings'
                    WHEN booking_count BETWEEN 4 AND 10 THEN '4-10 bookings'
                    WHEN booking_count > 10 THEN '10+ bookings'
                END
            ORDER BY customer_count DESC
        `, params);
        
        res.json({
            period,
            start_date: start_date || null,
            end_date: end_date || null,
            summary: customerSummary[0],
            by_country: customersByCountry,
            top_customers: topCustomers,
            acquisition_by_date: customerAcquisition,
            repeat_customer_analysis: repeatCustomerAnalysis
        });
        
    } catch (error) {
        console.error('Customer report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Export report data (CSV format)
router.get('/export/:type', authenticateToken, requireManager, async (req, res) => {
    try {
        const { type } = req.params;
        const { period = 'month', start_date, end_date } = req.query;
        
        let query = '';
        let filename = '';
        
        switch (type) {
            case 'bookings':
                query = `
                    SELECT 
                        b.booking_reference,
                        b.created_at,
                        b.check_in_date,
                        b.check_out_date,
                        b.adults,
                        b.children,
                        b.total_amount,
                        b.booking_status,
                        b.source,
                        CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                        c.email as customer_email,
                        r.room_number,
                        r.room_name
                    FROM bookings b
                    JOIN customers c ON b.customer_id = c.id
                    JOIN rooms r ON b.room_id = r.id
                    ORDER BY b.created_at DESC
                `;
                filename = 'bookings_report';
                break;
                
            case 'customers':
                query = `
                    SELECT 
                        c.first_name,
                        c.last_name,
                        c.email,
                        c.phone,
                        c.country,
                        c.created_at,
                        COUNT(b.id) as total_bookings,
                        SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as total_spent
                    FROM customers c
                    LEFT JOIN bookings b ON c.id = b.customer_id
                    GROUP BY c.id
                    ORDER BY total_spent DESC
                `;
                filename = 'customers_report';
                break;
                
            case 'revenue':
                query = `
                    SELECT 
                        DATE(b.created_at) as date,
                        COUNT(*) as total_bookings,
                        SUM(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE 0 END) as revenue,
                        AVG(CASE WHEN b.booking_status IN ('confirmed', 'completed') THEN b.total_amount ELSE NULL END) as avg_booking_value
                    FROM bookings b
                    GROUP BY DATE(b.created_at)
                    ORDER BY date DESC
                `;
                filename = 'revenue_report';
                break;
                
            default:
                return res.status(400).json({ error: 'Invalid report type' });
        }
        
        const data = await db.execute(query);
        
        // Convert to CSV
        if (data.length === 0) {
            return res.status(404).json({ error: 'No data found' });
        }
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    // Escape commas and quotes in CSV
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');
        
        res.set({
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}_${moment().format('YYYY-MM-DD')}.csv"`
        });
        
        res.send(csvContent);
        
    } catch (error) {
        console.error('Export report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;