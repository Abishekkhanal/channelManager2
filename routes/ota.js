const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const js2xmlparser = require('js2xmlparser');
const moment = require('moment');
const db = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

const router = express.Router();

// Helper function to log sync operations
const logSyncOperation = async (otaConfigId, syncType, status, message, recordsProcessed = 0) => {
    try {
        await db.execute(
            'INSERT INTO ota_sync_logs (ota_configuration_id, sync_type, status, message, records_processed, sync_completed_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [otaConfigId, syncType, status, message, recordsProcessed]
        );
    } catch (error) {
        console.error('Failed to log sync operation:', error);
    }
};

// Get all OTA configurations
router.get('/configurations', authenticateToken, requireManager, async (req, res) => {
    try {
        const configurations = await db.execute(`
            SELECT id, ota_name, api_username, endpoint_url, hotel_id, is_active, 
                   last_sync_at, sync_frequency, created_at, updated_at
            FROM ota_configurations
            ORDER BY created_at DESC
        `);
        
        res.json({ configurations });
        
    } catch (error) {
        console.error('Get OTA configurations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create OTA configuration
router.post('/configurations', authenticateToken, requireManager, async (req, res) => {
    try {
        const {
            ota_name,
            api_key,
            api_username,
            api_password,
            endpoint_url,
            hotel_id,
            sync_frequency = 60
        } = req.body;
        
        // Validate required fields
        if (!ota_name || !endpoint_url) {
            return res.status(400).json({ error: 'OTA name and endpoint URL are required' });
        }
        
        // Check if configuration already exists for this OTA
        const existingConfig = await db.execute(
            'SELECT id FROM ota_configurations WHERE ota_name = ?',
            [ota_name]
        );
        
        if (existingConfig.length > 0) {
            return res.status(400).json({ error: 'Configuration already exists for this OTA' });
        }
        
        // Create configuration
        const result = await db.execute(
            'INSERT INTO ota_configurations (ota_name, api_key, api_username, api_password, endpoint_url, hotel_id, sync_frequency) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [ota_name, api_key, api_username, api_password, endpoint_url, hotel_id, sync_frequency]
        );
        
        const configId = result.insertId;
        
        // Get the created configuration
        const createdConfig = await db.execute(
            'SELECT id, ota_name, api_username, endpoint_url, hotel_id, is_active, sync_frequency FROM ota_configurations WHERE id = ?',
            [configId]
        );
        
        res.status(201).json({
            message: 'OTA configuration created successfully',
            configuration: createdConfig[0]
        });
        
    } catch (error) {
        console.error('Create OTA configuration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update OTA configuration
router.put('/configurations/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            ota_name,
            api_key,
            api_username,
            api_password,
            endpoint_url,
            hotel_id,
            sync_frequency,
            is_active
        } = req.body;
        
        // Check if configuration exists
        const existingConfig = await db.execute('SELECT id FROM ota_configurations WHERE id = ?', [id]);
        if (existingConfig.length === 0) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        
        // Update configuration
        await db.execute(
            'UPDATE ota_configurations SET ota_name = ?, api_key = ?, api_username = ?, api_password = ?, endpoint_url = ?, hotel_id = ?, sync_frequency = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [ota_name, api_key, api_username, api_password, endpoint_url, hotel_id, sync_frequency, is_active, id]
        );
        
        res.json({ message: 'OTA configuration updated successfully' });
        
    } catch (error) {
        console.error('Update OTA configuration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete OTA configuration
router.delete('/configurations/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if configuration exists
        const existingConfig = await db.execute('SELECT id FROM ota_configurations WHERE id = ?', [id]);
        if (existingConfig.length === 0) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        
        // Delete configuration
        await db.execute('DELETE FROM ota_configurations WHERE id = ?', [id]);
        
        res.json({ message: 'OTA configuration deleted successfully' });
        
    } catch (error) {
        console.error('Delete OTA configuration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Booking.com ARI sync functions
const syncBookingComARI = async (config, rooms) => {
    try {
        // Build XML for Booking.com ARI update
        const ariData = {
            authentication: {
                username: config.api_username,
                password: config.api_password
            },
            hotel_id: config.hotel_id,
            rooms: rooms.map(room => ({
                room_id: room.id,
                room_name: room.room_name,
                rate: room.price_per_night,
                availability: room.is_available ? 1 : 0,
                inventory: 1, // Assuming 1 room per room type
                restrictions: {
                    min_stay: 1,
                    max_stay: 30,
                    closed_to_arrival: 0,
                    closed_to_departure: 0
                }
            }))
        };
        
        const xmlData = js2xmlparser.parse('ari_update', ariData);
        
        const response = await axios.post(config.endpoint_url, xmlData, {
            headers: {
                'Content-Type': 'application/xml',
                'Authorization': `Basic ${Buffer.from(`${config.api_username}:${config.api_password}`).toString('base64')}`
            },
            timeout: 30000
        });
        
        return {
            success: true,
            message: 'Booking.com ARI sync completed successfully',
            data: response.data
        };
        
    } catch (error) {
        console.error('Booking.com sync error:', error);
        return {
            success: false,
            message: `Booking.com sync failed: ${error.message}`
        };
    }
};

// Agoda ARI sync functions
const syncAgodaARI = async (config, rooms) => {
    try {
        // Build JSON for Agoda ARI update
        const ariData = {
            HotelId: config.hotel_id,
            RequestId: `agoda_${Date.now()}`,
            Rooms: rooms.map(room => ({
                RoomId: room.id,
                RoomType: room.room_name,
                Rates: [{
                    RatePlan: 'Standard',
                    Rate: room.price_per_night,
                    Date: moment().format('YYYY-MM-DD'),
                    Availability: room.is_available ? 1 : 0,
                    Inventory: 1
                }])
            }))
        };
        
        const response = await axios.post(config.endpoint_url, ariData, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.api_key}`,
                'X-Hotel-Id': config.hotel_id
            },
            timeout: 30000
        });
        
        return {
            success: true,
            message: 'Agoda ARI sync completed successfully',
            data: response.data
        };
        
    } catch (error) {
        console.error('Agoda sync error:', error);
        return {
            success: false,
            message: `Agoda sync failed: ${error.message}`
        };
    }
};

// Airbnb ARI sync functions
const syncAirbnbARI = async (config, rooms) => {
    try {
        // Build JSON for Airbnb ARI update
        const ariData = {
            listing_id: config.hotel_id,
            operations: rooms.map(room => ({
                room_id: room.id.toString(),
                availability: room.is_available,
                price: {
                    amount: room.price_per_night,
                    currency: 'USD'
                },
                date: moment().format('YYYY-MM-DD'),
                minimum_nights: 1
            }))
        };
        
        const response = await axios.post(config.endpoint_url, ariData, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.api_key}`,
                'X-Airbnb-API-Version': '1.0'
            },
            timeout: 30000
        });
        
        return {
            success: true,
            message: 'Airbnb ARI sync completed successfully',
            data: response.data
        };
        
    } catch (error) {
        console.error('Airbnb sync error:', error);
        return {
            success: false,
            message: `Airbnb sync failed: ${error.message}`
        };
    }
};

// Main sync function
const performOTASync = async (config) => {
    try {
        // Get all active rooms
        const rooms = await db.execute(`
            SELECT r.*, 
                   CASE WHEN COUNT(b.id) = 0 THEN TRUE ELSE FALSE END as is_available
            FROM rooms r
            LEFT JOIN bookings b ON r.id = b.room_id 
                AND b.booking_status IN ('pending', 'confirmed')
                AND b.check_in_date <= CURDATE()
                AND b.check_out_date > CURDATE()
            WHERE r.is_active = TRUE
            GROUP BY r.id
        `);
        
        let syncResult;
        
        switch (config.ota_name.toLowerCase()) {
            case 'booking.com':
            case 'booking_com':
                syncResult = await syncBookingComARI(config, rooms);
                break;
            case 'agoda':
                syncResult = await syncAgodaARI(config, rooms);
                break;
            case 'airbnb':
                syncResult = await syncAirbnbARI(config, rooms);
                break;
            default:
                throw new Error(`Unsupported OTA: ${config.ota_name}`);
        }
        
        // Log the sync operation
        await logSyncOperation(
            config.id,
            'availability',
            syncResult.success ? 'success' : 'failed',
            syncResult.message,
            rooms.length
        );
        
        // Update last sync time
        await db.execute(
            'UPDATE ota_configurations SET last_sync_at = NOW() WHERE id = ?',
            [config.id]
        );
        
        return syncResult;
        
    } catch (error) {
        console.error('OTA sync error:', error);
        await logSyncOperation(
            config.id,
            'availability',
            'failed',
            error.message,
            0
        );
        
        return {
            success: false,
            message: error.message
        };
    }
};

// Manual sync trigger (The "Sync" button functionality)
router.post('/sync/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get OTA configuration
        const configs = await db.execute('SELECT * FROM ota_configurations WHERE id = ? AND is_active = TRUE', [id]);
        
        if (configs.length === 0) {
            return res.status(404).json({ error: 'Active OTA configuration not found' });
        }
        
        const config = configs[0];
        
        // Perform sync
        const result = await performOTASync(config);
        
        res.json({
            message: result.success ? 'Sync completed successfully' : 'Sync failed',
            success: result.success,
            details: result.message,
            ota_name: config.ota_name,
            synced_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Manual sync error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Sync all active OTA configurations
router.post('/sync-all', authenticateToken, requireManager, async (req, res) => {
    try {
        // Get all active OTA configurations
        const configs = await db.execute('SELECT * FROM ota_configurations WHERE is_active = TRUE');
        
        if (configs.length === 0) {
            return res.status(400).json({ error: 'No active OTA configurations found' });
        }
        
        const syncResults = [];
        
        // Sync each OTA in parallel
        const syncPromises = configs.map(async (config) => {
            const result = await performOTASync(config);
            return {
                ota_name: config.ota_name,
                success: result.success,
                message: result.message
            };
        });
        
        const results = await Promise.all(syncPromises);
        
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;
        
        res.json({
            message: `Sync completed: ${successCount} successful, ${failureCount} failed`,
            total_otas: configs.length,
            successful_syncs: successCount,
            failed_syncs: failureCount,
            results: results,
            synced_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Sync all error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get sync logs
router.get('/sync-logs', authenticateToken, requireManager, async (req, res) => {
    try {
        const { ota_id, limit = 50, page = 1 } = req.query;
        
        let query = `
            SELECT sl.*, oc.ota_name
            FROM ota_sync_logs sl
            JOIN ota_configurations oc ON sl.ota_configuration_id = oc.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (ota_id) {
            query += ' AND sl.ota_configuration_id = ?';
            params.push(ota_id);
        }
        
        query += ' ORDER BY sl.sync_started_at DESC';
        
        // Add pagination
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const logs = await db.execute(query, params);
        
        res.json({ logs });
        
    } catch (error) {
        console.error('Get sync logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Test OTA connection
router.post('/test-connection/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get OTA configuration
        const configs = await db.execute('SELECT * FROM ota_configurations WHERE id = ?', [id]);
        
        if (configs.length === 0) {
            return res.status(404).json({ error: 'OTA configuration not found' });
        }
        
        const config = configs[0];
        
        // Test connection based on OTA type
        let testResult;
        
        try {
            switch (config.ota_name.toLowerCase()) {
                case 'booking.com':
                case 'booking_com':
                    // Test Booking.com connection
                    const bookingTestResponse = await axios.post(config.endpoint_url, 
                        js2xmlparser.parse('test_connection', {
                            authentication: {
                                username: config.api_username,
                                password: config.api_password
                            },
                            hotel_id: config.hotel_id
                        }), {
                        headers: {
                            'Content-Type': 'application/xml',
                            'Authorization': `Basic ${Buffer.from(`${config.api_username}:${config.api_password}`).toString('base64')}`
                        },
                        timeout: 15000
                    });
                    testResult = { success: true, message: 'Booking.com connection successful' };
                    break;
                    
                case 'agoda':
                    // Test Agoda connection
                    const agodaTestResponse = await axios.post(config.endpoint_url, 
                        { HotelId: config.hotel_id, RequestId: `test_${Date.now()}` }, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${config.api_key}`
                        },
                        timeout: 15000
                    });
                    testResult = { success: true, message: 'Agoda connection successful' };
                    break;
                    
                case 'airbnb':
                    // Test Airbnb connection
                    const airbnbTestResponse = await axios.get(`${config.endpoint_url}/test`, {
                        headers: {
                            'Authorization': `Bearer ${config.api_key}`,
                            'X-Airbnb-API-Version': '1.0'
                        },
                        timeout: 15000
                    });
                    testResult = { success: true, message: 'Airbnb connection successful' };
                    break;
                    
                default:
                    testResult = { success: false, message: `Unsupported OTA: ${config.ota_name}` };
            }
            
        } catch (error) {
            testResult = { 
                success: false, 
                message: `Connection failed: ${error.message}` 
            };
        }
        
        res.json({
            ota_name: config.ota_name,
            success: testResult.success,
            message: testResult.message,
            tested_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Test connection error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get sync statistics
router.get('/sync-stats', authenticateToken, requireManager, async (req, res) => {
    try {
        const { period = 'week' } = req.query;
        
        let dateCondition = '';
        if (period === 'week') {
            dateCondition = 'AND sl.sync_started_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
        } else if (period === 'month') {
            dateCondition = 'AND sl.sync_started_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
        } else if (period === 'year') {
            dateCondition = 'AND sl.sync_started_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
        }
        
        // Get sync statistics
        const syncStats = await db.execute(`
            SELECT 
                oc.ota_name,
                COUNT(sl.id) as total_syncs,
                SUM(CASE WHEN sl.status = 'success' THEN 1 ELSE 0 END) as successful_syncs,
                SUM(CASE WHEN sl.status = 'failed' THEN 1 ELSE 0 END) as failed_syncs,
                MAX(sl.sync_started_at) as last_sync_at,
                SUM(sl.records_processed) as total_records_processed
            FROM ota_configurations oc
            LEFT JOIN ota_sync_logs sl ON oc.id = sl.ota_configuration_id
            WHERE oc.is_active = TRUE ${dateCondition}
            GROUP BY oc.id, oc.ota_name
            ORDER BY oc.ota_name
        `);
        
        res.json({
            period,
            stats: syncStats
        });
        
    } catch (error) {
        console.error('Get sync statistics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Export XML for OTA compliance (as requested)
router.get('/export-xml/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get OTA configuration
        const configs = await db.execute('SELECT * FROM ota_configurations WHERE id = ?', [id]);
        
        if (configs.length === 0) {
            return res.status(404).json({ error: 'OTA configuration not found' });
        }
        
        const config = configs[0];
        
        // Get all rooms with current availability
        const rooms = await db.execute(`
            SELECT r.*, rc.name as category_name,
                   CASE WHEN COUNT(b.id) = 0 THEN TRUE ELSE FALSE END as is_available
            FROM rooms r
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            LEFT JOIN bookings b ON r.id = b.room_id 
                AND b.booking_status IN ('pending', 'confirmed')
                AND b.check_in_date <= CURDATE()
                AND b.check_out_date > CURDATE()
            WHERE r.is_active = TRUE
            GROUP BY r.id
        `);
        
        // Build XML structure for OTA compliance
        const xmlData = {
            '@': {
                'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
                'version': '1.0'
            },
            hotel: {
                '@': { id: config.hotel_id },
                name: 'Grand Hotel',
                rooms: {
                    room: rooms.map(room => ({
                        '@': { id: room.id },
                        name: room.room_name,
                        category: room.category_name,
                        capacity: room.max_occupancy,
                        rate: room.price_per_night,
                        availability: room.is_available ? 'available' : 'unavailable',
                        description: room.description,
                        amenities: {
                            // This would need to be populated from room_amenities
                        }
                    }))
                }
            }
        };
        
        const xmlString = js2xmlparser.parse('ota_export', xmlData);
        
        res.set({
            'Content-Type': 'application/xml',
            'Content-Disposition': `attachment; filename="ota_export_${config.ota_name}_${moment().format('YYYY-MM-DD')}.xml"`
        });
        
        res.send(xmlString);
        
    } catch (error) {
        console.error('Export XML error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;