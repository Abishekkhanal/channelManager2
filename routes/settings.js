const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

const router = express.Router();

// Get all settings
router.get('/', authenticateToken, requireManager, async (req, res) => {
    try {
        const settings = await db.execute('SELECT * FROM settings ORDER BY setting_key');
        
        // Convert to key-value object for easier frontend consumption
        const settingsObj = {};
        settings.forEach(setting => {
            let value = setting.setting_value;
            
            // Parse based on data type
            switch (setting.data_type) {
                case 'number':
                    value = parseFloat(value);
                    break;
                case 'boolean':
                    value = value === 'true';
                    break;
                case 'json':
                    try {
                        value = JSON.parse(value);
                    } catch (e) {
                        value = setting.setting_value;
                    }
                    break;
                default:
                    value = setting.setting_value;
            }
            
            settingsObj[setting.setting_key] = {
                value: value,
                description: setting.description,
                data_type: setting.data_type
            };
        });
        
        res.json({
            settings: settingsObj
        });
        
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a setting
router.put('/:key', authenticateToken, requireManager, async (req, res) => {
    try {
        const { key } = req.params;
        const { value, description } = req.body;
        
        if (value === undefined) {
            return res.status(400).json({ error: 'Value is required' });
        }
        
        // Check if setting exists
        const existingSetting = await db.execute('SELECT * FROM settings WHERE setting_key = ?', [key]);
        
        if (existingSetting.length === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }
        
        const setting = existingSetting[0];
        let processedValue = value;
        
        // Process value based on data type
        switch (setting.data_type) {
            case 'number':
                processedValue = parseFloat(value).toString();
                if (isNaN(processedValue)) {
                    return res.status(400).json({ error: 'Invalid number value' });
                }
                break;
            case 'boolean':
                processedValue = Boolean(value).toString();
                break;
            case 'json':
                try {
                    processedValue = JSON.stringify(value);
                } catch (e) {
                    return res.status(400).json({ error: 'Invalid JSON value' });
                }
                break;
            default:
                processedValue = value.toString();
        }
        
        // Update setting
        await db.execute(
            'UPDATE settings SET setting_value = ?, description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
            [processedValue, description, key]
        );
        
        res.json({
            message: 'Setting updated successfully',
            setting: {
                key: key,
                value: value,
                description: description || setting.description
            }
        });
        
    } catch (error) {
        console.error('Update setting error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a new setting
router.post('/', authenticateToken, requireManager, async (req, res) => {
    try {
        const { setting_key, setting_value, data_type = 'string', description } = req.body;
        
        if (!setting_key || setting_value === undefined) {
            return res.status(400).json({ error: 'Setting key and value are required' });
        }
        
        // Check if setting already exists
        const existingSetting = await db.execute('SELECT id FROM settings WHERE setting_key = ?', [setting_key]);
        
        if (existingSetting.length > 0) {
            return res.status(400).json({ error: 'Setting already exists' });
        }
        
        // Validate data type
        const validDataTypes = ['string', 'number', 'boolean', 'json'];
        if (!validDataTypes.includes(data_type)) {
            return res.status(400).json({ error: 'Invalid data type' });
        }
        
        let processedValue = setting_value;
        
        // Process value based on data type
        switch (data_type) {
            case 'number':
                processedValue = parseFloat(setting_value).toString();
                if (isNaN(processedValue)) {
                    return res.status(400).json({ error: 'Invalid number value' });
                }
                break;
            case 'boolean':
                processedValue = Boolean(setting_value).toString();
                break;
            case 'json':
                try {
                    processedValue = JSON.stringify(setting_value);
                } catch (e) {
                    return res.status(400).json({ error: 'Invalid JSON value' });
                }
                break;
            default:
                processedValue = setting_value.toString();
        }
        
        // Create setting
        await db.execute(
            'INSERT INTO settings (setting_key, setting_value, data_type, description) VALUES (?, ?, ?, ?)',
            [setting_key, processedValue, data_type, description]
        );
        
        res.status(201).json({
            message: 'Setting created successfully',
            setting: {
                key: setting_key,
                value: setting_value,
                data_type: data_type,
                description: description
            }
        });
        
    } catch (error) {
        console.error('Create setting error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a setting
router.delete('/:key', authenticateToken, requireManager, async (req, res) => {
    try {
        const { key } = req.params;
        
        // Check if setting exists
        const existingSetting = await db.execute('SELECT id FROM settings WHERE setting_key = ?', [key]);
        
        if (existingSetting.length === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }
        
        // Delete setting
        await db.execute('DELETE FROM settings WHERE setting_key = ?', [key]);
        
        res.json({ message: 'Setting deleted successfully' });
        
    } catch (error) {
        console.error('Delete setting error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all currencies
router.get('/currencies', async (req, res) => {
    try {
        const currencies = await db.execute('SELECT * FROM currencies ORDER BY is_default DESC, name');
        res.json({ currencies });
        
    } catch (error) {
        console.error('Get currencies error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create currency
router.post('/currencies', authenticateToken, requireManager, async (req, res) => {
    try {
        const { code, name, symbol, exchange_rate = 1.0000, is_default = false } = req.body;
        
        if (!code || !name) {
            return res.status(400).json({ error: 'Currency code and name are required' });
        }
        
        // Check if currency already exists
        const existingCurrency = await db.execute('SELECT id FROM currencies WHERE code = ?', [code]);
        
        if (existingCurrency.length > 0) {
            return res.status(400).json({ error: 'Currency already exists' });
        }
        
        // If setting as default, remove default from other currencies
        if (is_default) {
            await db.execute('UPDATE currencies SET is_default = FALSE');
        }
        
        // Create currency
        const result = await db.execute(
            'INSERT INTO currencies (code, name, symbol, exchange_rate, is_default) VALUES (?, ?, ?, ?, ?)',
            [code, name, symbol, exchange_rate, is_default]
        );
        
        res.status(201).json({
            message: 'Currency created successfully',
            currency: {
                id: result.insertId,
                code,
                name,
                symbol,
                exchange_rate,
                is_default
            }
        });
        
    } catch (error) {
        console.error('Create currency error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update currency
router.put('/currencies/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, symbol, exchange_rate, is_default, is_active } = req.body;
        
        // Check if currency exists
        const existingCurrency = await db.execute('SELECT * FROM currencies WHERE id = ?', [id]);
        
        if (existingCurrency.length === 0) {
            return res.status(404).json({ error: 'Currency not found' });
        }
        
        // If setting as default, remove default from other currencies
        if (is_default) {
            await db.execute('UPDATE currencies SET is_default = FALSE WHERE id != ?', [id]);
        }
        
        // Update currency
        await db.execute(
            'UPDATE currencies SET code = ?, name = ?, symbol = ?, exchange_rate = ?, is_default = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [code, name, symbol, exchange_rate, is_default, is_active, id]
        );
        
        res.json({ message: 'Currency updated successfully' });
        
    } catch (error) {
        console.error('Update currency error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete currency
router.delete('/currencies/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if currency exists
        const existingCurrency = await db.execute('SELECT is_default FROM currencies WHERE id = ?', [id]);
        
        if (existingCurrency.length === 0) {
            return res.status(404).json({ error: 'Currency not found' });
        }
        
        // Cannot delete default currency
        if (existingCurrency[0].is_default) {
            return res.status(400).json({ error: 'Cannot delete default currency' });
        }
        
        // Delete currency
        await db.execute('DELETE FROM currencies WHERE id = ?', [id]);
        
        res.json({ message: 'Currency deleted successfully' });
        
    } catch (error) {
        console.error('Delete currency error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all languages
router.get('/languages', async (req, res) => {
    try {
        const languages = await db.execute('SELECT * FROM languages ORDER BY is_default DESC, name');
        res.json({ languages });
        
    } catch (error) {
        console.error('Get languages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create language
router.post('/languages', authenticateToken, requireManager, async (req, res) => {
    try {
        const { code, name, native_name, is_default = false } = req.body;
        
        if (!code || !name) {
            return res.status(400).json({ error: 'Language code and name are required' });
        }
        
        // Check if language already exists
        const existingLanguage = await db.execute('SELECT id FROM languages WHERE code = ?', [code]);
        
        if (existingLanguage.length > 0) {
            return res.status(400).json({ error: 'Language already exists' });
        }
        
        // If setting as default, remove default from other languages
        if (is_default) {
            await db.execute('UPDATE languages SET is_default = FALSE');
        }
        
        // Create language
        const result = await db.execute(
            'INSERT INTO languages (code, name, native_name, is_default) VALUES (?, ?, ?, ?)',
            [code, name, native_name, is_default]
        );
        
        res.status(201).json({
            message: 'Language created successfully',
            language: {
                id: result.insertId,
                code,
                name,
                native_name,
                is_default
            }
        });
        
    } catch (error) {
        console.error('Create language error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update language
router.put('/languages/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, native_name, is_default, is_active } = req.body;
        
        // Check if language exists
        const existingLanguage = await db.execute('SELECT * FROM languages WHERE id = ?', [id]);
        
        if (existingLanguage.length === 0) {
            return res.status(404).json({ error: 'Language not found' });
        }
        
        // If setting as default, remove default from other languages
        if (is_default) {
            await db.execute('UPDATE languages SET is_default = FALSE WHERE id != ?', [id]);
        }
        
        // Update language
        await db.execute(
            'UPDATE languages SET code = ?, name = ?, native_name = ?, is_default = ?, is_active = ? WHERE id = ?',
            [code, name, native_name, is_default, is_active, id]
        );
        
        res.json({ message: 'Language updated successfully' });
        
    } catch (error) {
        console.error('Update language error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete language
router.delete('/languages/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if language exists
        const existingLanguage = await db.execute('SELECT is_default FROM languages WHERE id = ?', [id]);
        
        if (existingLanguage.length === 0) {
            return res.status(404).json({ error: 'Language not found' });
        }
        
        // Cannot delete default language
        if (existingLanguage[0].is_default) {
            return res.status(400).json({ error: 'Cannot delete default language' });
        }
        
        // Delete language
        await db.execute('DELETE FROM languages WHERE id = ?', [id]);
        
        res.json({ message: 'Language deleted successfully' });
        
    } catch (error) {
        console.error('Delete language error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get hotel information
router.get('/hotel-info', async (req, res) => {
    try {
        const hotelSettings = await db.execute(`
            SELECT setting_key, setting_value 
            FROM settings 
            WHERE setting_key IN ('hotel_name', 'hotel_email', 'hotel_phone', 'hotel_address', 'check_in_time', 'check_out_time')
        `);
        
        const hotelInfo = {};
        hotelSettings.forEach(setting => {
            hotelInfo[setting.setting_key] = setting.setting_value;
        });
        
        res.json({ hotel_info: hotelInfo });
        
    } catch (error) {
        console.error('Get hotel info error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update hotel information
router.put('/hotel-info', authenticateToken, requireManager, async (req, res) => {
    try {
        const { hotel_name, hotel_email, hotel_phone, hotel_address, check_in_time, check_out_time } = req.body;
        
        const updates = {
            hotel_name,
            hotel_email,
            hotel_phone,
            hotel_address,
            check_in_time,
            check_out_time
        };
        
        // Update each setting
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                await db.execute(
                    'UPDATE settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
                    [value, key]
                );
            }
        }
        
        res.json({ message: 'Hotel information updated successfully' });
        
    } catch (error) {
        console.error('Update hotel info error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get email configuration
router.get('/email-config', authenticateToken, requireManager, async (req, res) => {
    try {
        const emailConfig = {
            smtp_host: process.env.SMTP_HOST || '',
            smtp_port: process.env.SMTP_PORT || '587',
            smtp_user: process.env.SMTP_USER || '',
            from_email: process.env.FROM_EMAIL || '',
            from_name: process.env.FROM_NAME || ''
        };
        
        res.json({ email_config: emailConfig });
        
    } catch (error) {
        console.error('Get email config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Test email configuration
router.post('/test-email', authenticateToken, requireManager, async (req, res) => {
    try {
        const { test_email } = req.body;
        
        if (!test_email) {
            return res.status(400).json({ error: 'Test email address is required' });
        }
        
        const nodemailer = require('nodemailer');
        
        // Create transporter
        const transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });
        
        // Send test email
        const mailOptions = {
            from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
            to: test_email,
            subject: 'Hotel Booking System - Test Email',
            html: `
                <h2>Email Configuration Test</h2>
                <p>This is a test email from your Hotel Booking System.</p>
                <p>If you received this email, your email configuration is working correctly.</p>
                <p>Sent at: ${new Date().toISOString()}</p>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        res.json({ message: 'Test email sent successfully' });
        
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ 
            error: 'Failed to send test email',
            details: error.message 
        });
    }
});

module.exports = router;