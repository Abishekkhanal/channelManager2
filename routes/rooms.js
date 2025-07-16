const express = require('express');
const moment = require('moment');
const db = require('../config/database');
const { authenticateToken, requireManager, optionalAuth } = require('../middleware/auth');
const { validateRoom, validateSearch } = require('../middleware/validation');
const { upload, handleUploadError, deleteUploadedFile, getFileUrl } = require('../middleware/upload');

const router = express.Router();

// Get all rooms (public endpoint with optional auth)
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { category_id, is_active = true } = req.query;
        
        let query = `
            SELECT r.*, rc.name as category_name, rc.description as category_description,
                   (SELECT COUNT(*) FROM room_images WHERE room_id = r.id) as image_count,
                   (SELECT image_path FROM room_images WHERE room_id = r.id AND is_primary = TRUE LIMIT 1) as primary_image
            FROM rooms r
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (category_id) {
            query += ' AND r.room_category_id = ?';
            params.push(category_id);
        }
        
        if (is_active !== undefined) {
            query += ' AND r.is_active = ?';
            params.push(is_active === 'true');
        }
        
        query += ' ORDER BY r.created_at DESC';
        
        const rooms = await db.execute(query, params);
        
        // Get amenities for each room
        for (let room of rooms) {
            const amenities = await db.execute(`
                SELECT a.* FROM amenities a
                JOIN room_amenities ra ON a.id = ra.amenity_id
                WHERE ra.room_id = ?
            `, [room.id]);
            
            room.amenities = amenities;
            
            // Format image URL
            if (room.primary_image) {
                room.primary_image_url = getFileUrl(room.primary_image);
            }
        }
        
        res.json({ rooms });
        
    } catch (error) {
        console.error('Get rooms error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get room by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const rooms = await db.execute(`
            SELECT r.*, rc.name as category_name, rc.description as category_description
            FROM rooms r
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE r.id = ?
        `, [id]);
        
        if (rooms.length === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const room = rooms[0];
        
        // Get room images
        const images = await db.execute(`
            SELECT * FROM room_images 
            WHERE room_id = ? 
            ORDER BY is_primary DESC, display_order ASC
        `, [id]);
        
        // Format image URLs
        room.images = images.map(img => ({
            ...img,
            image_url: getFileUrl(img.image_path)
        }));
        
        // Get room amenities
        const amenities = await db.execute(`
            SELECT a.* FROM amenities a
            JOIN room_amenities ra ON a.id = ra.amenity_id
            WHERE ra.room_id = ?
        `, [id]);
        
        room.amenities = amenities;
        
        res.json({ room });
        
    } catch (error) {
        console.error('Get room by ID error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new room (Admin/Manager only)
router.post('/', authenticateToken, requireManager, validateRoom, async (req, res) => {
    try {
        const {
            room_number,
            room_name,
            description,
            room_category_id,
            price_per_night,
            max_occupancy,
            room_size,
            bed_type,
            cancellation_policy,
            amenities = []
        } = req.body;
        
        // Check if room number already exists
        const existingRoom = await db.execute(
            'SELECT id FROM rooms WHERE room_number = ?',
            [room_number]
        );
        
        if (existingRoom.length > 0) {
            return res.status(400).json({ error: 'Room number already exists' });
        }
        
        // Insert room
        const result = await db.execute(`
            INSERT INTO rooms (room_number, room_name, description, room_category_id, price_per_night, max_occupancy, room_size, bed_type, cancellation_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [room_number, room_name, description, room_category_id, price_per_night, max_occupancy, room_size, bed_type, cancellation_policy]);
        
        const roomId = result.insertId;
        
        // Add amenities
        if (amenities.length > 0) {
            const amenityValues = amenities.map(amenityId => [roomId, amenityId]);
            const amenityPlaceholders = amenities.map(() => '(?, ?)').join(', ');
            await db.execute(
                `INSERT INTO room_amenities (room_id, amenity_id) VALUES ${amenityPlaceholders}`,
                amenityValues.flat()
            );
        }
        
        // Get the created room
        const createdRoom = await db.execute(`
            SELECT r.*, rc.name as category_name
            FROM rooms r
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE r.id = ?
        `, [roomId]);
        
        res.status(201).json({
            message: 'Room created successfully',
            room: createdRoom[0]
        });
        
    } catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update room (Admin/Manager only)
router.put('/:id', authenticateToken, requireManager, validateRoom, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            room_number,
            room_name,
            description,
            room_category_id,
            price_per_night,
            max_occupancy,
            room_size,
            bed_type,
            cancellation_policy,
            amenities = []
        } = req.body;
        
        // Check if room exists
        const existingRoom = await db.execute('SELECT id FROM rooms WHERE id = ?', [id]);
        if (existingRoom.length === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        // Check if room number already exists for other rooms
        const duplicateRoom = await db.execute(
            'SELECT id FROM rooms WHERE room_number = ? AND id != ?',
            [room_number, id]
        );
        
        if (duplicateRoom.length > 0) {
            return res.status(400).json({ error: 'Room number already exists' });
        }
        
        // Update room
        await db.execute(`
            UPDATE rooms 
            SET room_number = ?, room_name = ?, description = ?, room_category_id = ?, 
                price_per_night = ?, max_occupancy = ?, room_size = ?, bed_type = ?, 
                cancellation_policy = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [room_number, room_name, description, room_category_id, price_per_night, max_occupancy, room_size, bed_type, cancellation_policy, id]);
        
        // Update amenities
        await db.execute('DELETE FROM room_amenities WHERE room_id = ?', [id]);
        
        if (amenities.length > 0) {
            const amenityValues = amenities.map(amenityId => [id, amenityId]);
            const amenityPlaceholders = amenities.map(() => '(?, ?)').join(', ');
            await db.execute(
                `INSERT INTO room_amenities (room_id, amenity_id) VALUES ${amenityPlaceholders}`,
                amenityValues.flat()
            );
        }
        
        // Get the updated room
        const updatedRoom = await db.execute(`
            SELECT r.*, rc.name as category_name
            FROM rooms r
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE r.id = ?
        `, [id]);
        
        res.json({
            message: 'Room updated successfully',
            room: updatedRoom[0]
        });
        
    } catch (error) {
        console.error('Update room error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete room (Admin/Manager only)
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if room exists
        const existingRoom = await db.execute('SELECT id FROM rooms WHERE id = ?', [id]);
        if (existingRoom.length === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        // Check if room has active bookings
        const activeBookings = await db.execute(
            'SELECT id FROM bookings WHERE room_id = ? AND booking_status IN (?, ?)',
            [id, 'pending', 'confirmed']
        );
        
        if (activeBookings.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete room with active bookings. Cancel or complete bookings first.' 
            });
        }
        
        // Get room images to delete files
        const images = await db.execute('SELECT image_path FROM room_images WHERE room_id = ?', [id]);
        
        // Delete room (this will cascade delete images and amenities due to foreign key constraints)
        await db.execute('DELETE FROM rooms WHERE id = ?', [id]);
        
        // Delete image files
        images.forEach(img => {
            const filePath = `uploads/rooms/${img.image_path}`;
            deleteUploadedFile(filePath);
        });
        
        res.json({ message: 'Room deleted successfully' });
        
    } catch (error) {
        console.error('Delete room error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upload room images (Admin/Manager only)
router.post('/:id/images', authenticateToken, requireManager, upload.array('images', 10), handleUploadError, async (req, res) => {
    try {
        const { id } = req.params;
        const files = req.files;
        
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }
        
        // Check if room exists
        const existingRoom = await db.execute('SELECT id FROM rooms WHERE id = ?', [id]);
        if (existingRoom.length === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        // Get current max display order
        const maxOrderResult = await db.execute(
            'SELECT MAX(display_order) as max_order FROM room_images WHERE room_id = ?',
            [id]
        );
        
        let displayOrder = (maxOrderResult[0]?.max_order || 0) + 1;
        
        // Insert image records
        const imagePromises = files.map(async (file, index) => {
            const result = await db.execute(
                'INSERT INTO room_images (room_id, image_path, image_alt, display_order) VALUES (?, ?, ?, ?)',
                [id, file.filename, req.body[`alt_${index}`] || '', displayOrder + index]
            );
            
            return {
                id: result.insertId,
                image_path: file.filename,
                image_url: getFileUrl(file.filename),
                image_alt: req.body[`alt_${index}`] || '',
                display_order: displayOrder + index
            };
        });
        
        const uploadedImages = await Promise.all(imagePromises);
        
        res.json({
            message: 'Images uploaded successfully',
            images: uploadedImages
        });
        
    } catch (error) {
        console.error('Upload images error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete room image (Admin/Manager only)
router.delete('/:id/images/:imageId', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id, imageId } = req.params;
        
        // Get image details
        const images = await db.execute(
            'SELECT * FROM room_images WHERE id = ? AND room_id = ?',
            [imageId, id]
        );
        
        if (images.length === 0) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        const image = images[0];
        
        // Delete from database
        await db.execute('DELETE FROM room_images WHERE id = ?', [imageId]);
        
        // Delete file
        const filePath = `uploads/rooms/${image.image_path}`;
        deleteUploadedFile(filePath);
        
        res.json({ message: 'Image deleted successfully' });
        
    } catch (error) {
        console.error('Delete image error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Set primary image (Admin/Manager only)
router.put('/:id/images/:imageId/primary', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id, imageId } = req.params;
        
        // Check if image exists
        const images = await db.execute(
            'SELECT id FROM room_images WHERE id = ? AND room_id = ?',
            [imageId, id]
        );
        
        if (images.length === 0) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        // Remove primary flag from all images of this room
        await db.execute('UPDATE room_images SET is_primary = FALSE WHERE room_id = ?', [id]);
        
        // Set this image as primary
        await db.execute('UPDATE room_images SET is_primary = TRUE WHERE id = ?', [imageId]);
        
        res.json({ message: 'Primary image set successfully' });
        
    } catch (error) {
        console.error('Set primary image error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Search available rooms
router.post('/search', validateSearch, async (req, res) => {
    try {
        const { check_in_date, check_out_date, adults, children = 0, room_category_id } = req.body;
        
        // Validate dates
        const checkIn = moment(check_in_date);
        const checkOut = moment(check_out_date);
        
        if (!checkIn.isValid() || !checkOut.isValid()) {
            return res.status(400).json({ error: 'Invalid date format' });
        }
        
        if (checkIn.isSameOrAfter(checkOut)) {
            return res.status(400).json({ error: 'Check-out date must be after check-in date' });
        }
        
        if (checkIn.isBefore(moment().format('YYYY-MM-DD'))) {
            return res.status(400).json({ error: 'Check-in date cannot be in the past' });
        }
        
        const totalGuests = adults + children;
        
        // Build query for available rooms
        let query = `
            SELECT r.*, rc.name as category_name, rc.description as category_description,
                   (SELECT image_path FROM room_images WHERE room_id = r.id AND is_primary = TRUE LIMIT 1) as primary_image
            FROM rooms r
            LEFT JOIN room_categories rc ON r.room_category_id = rc.id
            WHERE r.is_active = TRUE 
            AND r.max_occupancy >= ?
        `;
        
        const params = [totalGuests];
        
        if (room_category_id) {
            query += ' AND r.room_category_id = ?';
            params.push(room_category_id);
        }
        
        // Check availability
        query += ` AND r.id NOT IN (
            SELECT DISTINCT b.room_id FROM bookings b
            WHERE b.booking_status IN ('pending', 'confirmed')
            AND NOT (b.check_out_date <= ? OR b.check_in_date >= ?)
        )`;
        
        params.push(check_in_date, check_out_date);
        
        query += ' ORDER BY r.price_per_night ASC';
        
        const availableRooms = await db.execute(query, params);
        
        // Calculate total price for each room
        const nights = checkOut.diff(checkIn, 'days');
        
        for (let room of availableRooms) {
            // Get amenities
            const amenities = await db.execute(`
                SELECT a.* FROM amenities a
                JOIN room_amenities ra ON a.id = ra.amenity_id
                WHERE ra.room_id = ?
            `, [room.id]);
            
            room.amenities = amenities;
            room.total_price = (room.price_per_night * nights).toFixed(2);
            room.nights = nights;
            
            // Format image URL
            if (room.primary_image) {
                room.primary_image_url = getFileUrl(room.primary_image);
            }
        }
        
        res.json({
            rooms: availableRooms,
            search_criteria: {
                check_in_date,
                check_out_date,
                adults,
                children,
                nights
            }
        });
        
    } catch (error) {
        console.error('Search rooms error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get room categories
router.get('/categories/all', async (req, res) => {
    try {
        const categories = await db.execute('SELECT * FROM room_categories ORDER BY name');
        res.json({ categories });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get amenities
router.get('/amenities/all', async (req, res) => {
    try {
        const amenities = await db.execute('SELECT * FROM amenities ORDER BY name');
        res.json({ amenities });
    } catch (error) {
        console.error('Get amenities error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;