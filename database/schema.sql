-- Hotel Booking Engine Database Schema
-- MySQL Database

CREATE DATABASE IF NOT EXISTS hotel_booking_engine;
USE hotel_booking_engine;

-- Users/Admin table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role ENUM('admin', 'manager', 'staff') DEFAULT 'staff',
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Room categories table
CREATE TABLE room_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Amenities table
CREATE TABLE amenities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_number VARCHAR(20) NOT NULL UNIQUE,
    room_name VARCHAR(100) NOT NULL,
    description TEXT,
    room_category_id INT,
    price_per_night DECIMAL(10,2) NOT NULL,
    max_occupancy INT NOT NULL DEFAULT 1,
    room_size DECIMAL(8,2),
    bed_type VARCHAR(50),
    cancellation_policy TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_category_id) REFERENCES room_categories(id)
);

-- Room images table
CREATE TABLE room_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    image_path VARCHAR(255) NOT NULL,
    image_alt TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Room amenities junction table
CREATE TABLE room_amenities (
    room_id INT,
    amenity_id INT,
    PRIMARY KEY (room_id, amenity_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (amenity_id) REFERENCES amenities(id) ON DELETE CASCADE
);

-- Customers table
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    date_of_birth DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Bookings table
CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_reference VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT,
    room_id INT,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    adults INT NOT NULL DEFAULT 1,
    children INT DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    booking_status ENUM('pending', 'confirmed', 'cancelled', 'completed', 'no_show') DEFAULT 'pending',
    payment_status ENUM('pending', 'paid', 'refunded') DEFAULT 'pending',
    special_requests TEXT,
    source ENUM('direct', 'booking_com', 'agoda', 'airbnb', 'expedia', 'other') DEFAULT 'direct',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Room availability table
CREATE TABLE room_availability (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    date DATE NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    price_override DECIMAL(10,2),
    min_stay INT DEFAULT 1,
    max_stay INT DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    UNIQUE KEY unique_room_date (room_id, date)
);

-- OTA configurations table
CREATE TABLE ota_configurations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ota_name VARCHAR(100) NOT NULL,
    api_key VARCHAR(255),
    api_username VARCHAR(255),
    api_password VARCHAR(255),
    endpoint_url VARCHAR(255),
    hotel_id VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_at TIMESTAMP NULL,
    sync_frequency INT DEFAULT 60, -- minutes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- OTA sync logs table
CREATE TABLE ota_sync_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ota_configuration_id INT,
    sync_type ENUM('availability', 'rates', 'inventory', 'bookings') NOT NULL,
    status ENUM('success', 'failed', 'partial') NOT NULL,
    message TEXT,
    sync_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_completed_at TIMESTAMP NULL,
    records_processed INT DEFAULT 0,
    FOREIGN KEY (ota_configuration_id) REFERENCES ota_configurations(id)
);

-- Settings table
CREATE TABLE settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    data_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Currencies table
CREATE TABLE currencies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(3) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10),
    exchange_rate DECIMAL(10,4) DEFAULT 1.0000,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Languages table
CREATE TABLE languages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(5) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    native_name VARCHAR(100),
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default data
INSERT INTO users (username, email, password_hash, first_name, last_name, role) 
VALUES ('admin', 'admin@hotel.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin', 'User', 'admin');

INSERT INTO room_categories (name, description) VALUES
('Standard Single', 'Comfortable single room for one guest'),
('Standard Double', 'Spacious double room for two guests'),
('Deluxe', 'Premium room with enhanced amenities'),
('Suite', 'Luxurious suite with separate living area'),
('Presidential', 'Top-tier luxury accommodation');

INSERT INTO amenities (name, icon, description) VALUES
('WiFi', 'wifi', 'Complimentary high-speed internet'),
('Air Conditioning', 'ac', 'Climate control system'),
('TV', 'tv', 'Flat-screen television'),
('Mini Bar', 'minibar', 'Stocked mini refrigerator'),
('Room Service', 'room-service', '24/7 room service available'),
('Balcony', 'balcony', 'Private balcony with view'),
('Jacuzzi', 'jacuzzi', 'Private jacuzzi in room'),
('Safe', 'safe', 'In-room safety deposit box'),
('Parking', 'parking', 'Free parking space'),
('Gym Access', 'gym', 'Access to fitness center');

INSERT INTO currencies (code, name, symbol, is_default) VALUES
('USD', 'US Dollar', '$', TRUE),
('EUR', 'Euro', '€', FALSE),
('GBP', 'British Pound', '£', FALSE),
('JPY', 'Japanese Yen', '¥', FALSE);

INSERT INTO languages (code, name, native_name, is_default) VALUES
('en', 'English', 'English', TRUE),
('es', 'Spanish', 'Español', FALSE),
('fr', 'French', 'Français', FALSE),
('de', 'German', 'Deutsch', FALSE);

INSERT INTO settings (setting_key, setting_value, data_type, description) VALUES
('hotel_name', 'Grand Hotel', 'string', 'Hotel name'),
('hotel_email', 'info@grandhotel.com', 'string', 'Hotel contact email'),
('hotel_phone', '+1-555-0123', 'string', 'Hotel contact phone'),
('hotel_address', '123 Main Street, City, Country', 'string', 'Hotel address'),
('check_in_time', '15:00', 'string', 'Standard check-in time'),
('check_out_time', '11:00', 'string', 'Standard check-out time'),
('tax_rate', '0.10', 'number', 'Tax rate (10%)'),
('cancellation_hours', '24', 'number', 'Free cancellation hours before check-in'),
('max_advance_booking_days', '365', 'number', 'Maximum days in advance for booking');