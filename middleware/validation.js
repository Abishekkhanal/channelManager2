const { body, validationResult } = require('express-validator');

// Validation result handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

// Auth validation rules
const validateLogin = [
    body('email')
        .isEmail()
        .withMessage('Valid email is required')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    handleValidationErrors
];

const validateRegister = [
    body('username')
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
        .isEmail()
        .withMessage('Valid email is required')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    body('first_name')
        .isLength({ min: 2, max: 100 })
        .withMessage('First name must be between 2 and 100 characters'),
    body('last_name')
        .isLength({ min: 2, max: 100 })
        .withMessage('Last name must be between 2 and 100 characters'),
    body('role')
        .optional()
        .isIn(['admin', 'manager', 'staff'])
        .withMessage('Invalid role'),
    handleValidationErrors
];

// Room validation rules
const validateRoom = [
    body('room_number')
        .isLength({ min: 1, max: 20 })
        .withMessage('Room number is required and must be max 20 characters'),
    body('room_name')
        .isLength({ min: 1, max: 100 })
        .withMessage('Room name is required and must be max 100 characters'),
    body('description')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Description must be max 1000 characters'),
    body('room_category_id')
        .isInt({ min: 1 })
        .withMessage('Valid room category is required'),
    body('price_per_night')
        .isFloat({ min: 0 })
        .withMessage('Price per night must be a positive number'),
    body('max_occupancy')
        .isInt({ min: 1, max: 20 })
        .withMessage('Max occupancy must be between 1 and 20'),
    body('room_size')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Room size must be a positive number'),
    body('bed_type')
        .optional()
        .isLength({ max: 50 })
        .withMessage('Bed type must be max 50 characters'),
    body('cancellation_policy')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Cancellation policy must be max 1000 characters'),
    handleValidationErrors
];

// Booking validation rules
const validateBooking = [
    body('room_id')
        .isInt({ min: 1 })
        .withMessage('Valid room ID is required'),
    body('check_in_date')
        .isISO8601()
        .withMessage('Valid check-in date is required'),
    body('check_out_date')
        .isISO8601()
        .withMessage('Valid check-out date is required'),
    body('adults')
        .isInt({ min: 1, max: 20 })
        .withMessage('Adults must be between 1 and 20'),
    body('children')
        .optional()
        .isInt({ min: 0, max: 20 })
        .withMessage('Children must be between 0 and 20'),
    body('customer.first_name')
        .isLength({ min: 2, max: 100 })
        .withMessage('Customer first name is required'),
    body('customer.last_name')
        .isLength({ min: 2, max: 100 })
        .withMessage('Customer last name is required'),
    body('customer.email')
        .isEmail()
        .withMessage('Valid customer email is required')
        .normalizeEmail(),
    body('customer.phone')
        .optional()
        .isMobilePhone()
        .withMessage('Valid phone number is required'),
    body('special_requests')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Special requests must be max 500 characters'),
    handleValidationErrors
];

// Customer validation rules
const validateCustomer = [
    body('first_name')
        .isLength({ min: 2, max: 100 })
        .withMessage('First name must be between 2 and 100 characters'),
    body('last_name')
        .isLength({ min: 2, max: 100 })
        .withMessage('Last name must be between 2 and 100 characters'),
    body('email')
        .isEmail()
        .withMessage('Valid email is required')
        .normalizeEmail(),
    body('phone')
        .optional()
        .isMobilePhone()
        .withMessage('Valid phone number is required'),
    body('address')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Address must be max 500 characters'),
    body('city')
        .optional()
        .isLength({ max: 100 })
        .withMessage('City must be max 100 characters'),
    body('country')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Country must be max 100 characters'),
    body('postal_code')
        .optional()
        .isLength({ max: 20 })
        .withMessage('Postal code must be max 20 characters'),
    handleValidationErrors
];

// Search validation rules
const validateSearch = [
    body('check_in_date')
        .isISO8601()
        .withMessage('Valid check-in date is required'),
    body('check_out_date')
        .isISO8601()
        .withMessage('Valid check-out date is required'),
    body('adults')
        .isInt({ min: 1, max: 20 })
        .withMessage('Adults must be between 1 and 20'),
    body('children')
        .optional()
        .isInt({ min: 0, max: 20 })
        .withMessage('Children must be between 0 and 20'),
    body('room_category_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Valid room category ID required'),
    handleValidationErrors
];

module.exports = {
    validateLogin,
    validateRegister,
    validateRoom,
    validateBooking,
    validateCustomer,
    validateSearch,
    handleValidationErrors
};