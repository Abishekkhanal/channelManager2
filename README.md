# Hotel Booking Engine with PMS and Channel Manager

A comprehensive hotel booking system with integrated Property Management System (PMS) and Channel Manager functionality for synchronizing with Online Travel Agencies (OTAs).

## 🌟 Features

### Core Hotel Management
- **Room Management**: Add, edit, delete rooms with multiple images, amenities, and pricing
- **Booking Engine**: Customer-facing booking system with search, availability, and reservations
- **Customer Management**: Comprehensive customer database with booking history and preferences
- **Admin Dashboard**: Real-time analytics, occupancy tracking, and system monitoring

### Property Management System (PMS)
- **Availability Management**: Real-time room availability calendar
- **Pricing Management**: Dynamic pricing with seasonal adjustments
- **Booking Management**: Complete booking lifecycle management
- **Reporting**: Revenue analytics, occupancy reports, and customer insights

### Channel Manager & OTA Integration
- **Multi-OTA Support**: Booking.com, Agoda, Airbnb integration
- **ARI Sync**: Automatic synchronization of Availability, Rates, and Inventory
- **Manual & Automated Sync**: "Sync" button for manual updates + scheduled sync
- **XML Export**: OTA-compliant XML export functionality

### Additional Features
- **Multi-language Support**: Configurable language settings
- **Multi-currency Support**: Multiple currencies with exchange rates
- **Email Notifications**: Automated booking confirmations and cancellations
- **Security**: JWT authentication, input validation, rate limiting
- **File Upload**: Multiple image upload for rooms

## 🏗️ Architecture

### Technology Stack
- **Backend**: Node.js with Express.js
- **Database**: MySQL with connection pooling
- **Authentication**: JWT tokens with role-based access
- **File Upload**: Multer for image handling
- **Email**: Nodemailer for notifications
- **OTA Integration**: XML/JSON API support

### Security Features
- Helmet.js for security headers
- Rate limiting to prevent abuse
- Input validation with express-validator
- SQL injection prevention with parameterized queries
- XSS protection and CORS configuration

## 📦 Installation

### Prerequisites
- Node.js (v14 or higher)
- MySQL (v8.0 or higher)
- npm or yarn package manager

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hotel-booking-engine
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Database setup**
   ```bash
   # Create MySQL database
   mysql -u root -p
   
   # Run the schema file
   mysql -u root -p < database/schema.sql
   ```

4. **Environment configuration**
   ```bash
   # Copy and edit the .env file
   cp .env.example .env
   
   # Edit the .env file with your configuration
   nano .env
   ```

5. **Configure environment variables**
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=hotel_booking_engine
   DB_USER=root
   DB_PASSWORD=your_password_here
   
   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=7d
   
   # Email Configuration
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASSWORD=your_app_password
   FROM_EMAIL=noreply@grandhotel.com
   FROM_NAME=Grand Hotel
   
   # OTA API Configuration
   BOOKING_COM_API_KEY=your_booking_com_api_key
   BOOKING_COM_API_USERNAME=your_booking_com_username
   BOOKING_COM_API_PASSWORD=your_booking_com_password
   BOOKING_COM_ENDPOINT=https://supply-xml.booking.com/
   ```

6. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 🚀 Usage

### Default Admin Account
- **Email**: admin@hotel.com
- **Password**: password (change after first login)

### API Endpoints

#### Authentication
- `POST /api/auth/login` - Admin login
- `POST /api/auth/register` - Create new user (admin only)
- `GET /api/auth/profile` - Get current user profile
- `PUT /api/auth/profile` - Update user profile

#### Room Management
- `GET /api/rooms` - Get all rooms
- `POST /api/rooms` - Create new room
- `PUT /api/rooms/:id` - Update room
- `DELETE /api/rooms/:id` - Delete room
- `POST /api/rooms/:id/images` - Upload room images
- `DELETE /api/rooms/:id/images/:imageId` - Delete room image

#### Booking Management
- `POST /api/bookings` - Create booking
- `GET /api/bookings/reference/:reference` - Get booking by reference
- `PUT /api/bookings/:reference/cancel` - Cancel booking
- `GET /api/bookings/admin/all` - Get all bookings (admin)
- `PUT /api/bookings/admin/:id/status` - Update booking status

#### Customer Management
- `GET /api/customers` - Get all customers
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

#### OTA Channel Manager
- `GET /api/ota/configurations` - Get OTA configurations
- `POST /api/ota/configurations` - Create OTA configuration
- `POST /api/ota/sync/:id` - **Manual sync button** (key feature)
- `POST /api/ota/sync-all` - Sync all OTA configurations
- `GET /api/ota/sync-logs` - Get sync logs
- `GET /api/ota/export-xml/:id` - Export XML for OTA compliance

#### Reports & Analytics
- `GET /api/reports/revenue` - Revenue reports
- `GET /api/reports/occupancy` - Occupancy reports
- `GET /api/reports/bookings` - Booking reports
- `GET /api/reports/customers` - Customer reports
- `GET /api/reports/export/:type` - Export reports as CSV

#### Admin Dashboard
- `GET /api/admin/dashboard` - Dashboard overview
- `GET /api/admin/booking-trends` - Booking trends for charts
- `GET /api/admin/room-performance` - Room performance metrics
- `GET /api/admin/availability-calendar` - Availability calendar

## 🔧 OTA Integration Setup

### Booking.com Integration
1. Obtain API credentials from Booking.com Partner Hub
2. Add credentials to OTA configurations:
   ```json
   {
     "ota_name": "Booking.com",
     "api_username": "your_username",
     "api_password": "your_password",
     "endpoint_url": "https://supply-xml.booking.com/",
     "hotel_id": "your_hotel_id"
   }
   ```

### Agoda Integration
1. Register with Agoda YCS (Yield Control System)
2. Configure API settings:
   ```json
   {
     "ota_name": "Agoda",
     "api_key": "your_api_key",
     "endpoint_url": "https://affiliateservice7.agoda.com/",
     "hotel_id": "your_hotel_id"
   }
   ```

### Airbnb Integration
1. Join Airbnb API program
2. Set up API credentials:
   ```json
   {
     "ota_name": "Airbnb",
     "api_key": "your_api_key",
     "endpoint_url": "https://api.airbnb.com/",
     "hotel_id": "your_listing_id"
   }
   ```

## 📱 Frontend Development

The backend provides RESTful APIs that can be consumed by any frontend framework. Example frontend components needed:

### Customer-Facing Pages
- **Room Search**: Search available rooms by date and guest count
- **Room Details**: Display room information with image gallery
- **Booking Form**: Customer information and booking confirmation
- **Booking Management**: View/cancel/modify bookings

### Admin Dashboard Pages
- **Login**: Admin authentication
- **Dashboard**: Overview with key metrics and charts
- **Room Management**: Add/edit/delete rooms with image upload
- **Booking Management**: View and manage all bookings
- **Customer Management**: Customer database and analytics
- **OTA Configuration**: Set up and manage OTA integrations
- **Reports**: Revenue, occupancy, and booking reports

### Sample Frontend Integration
```javascript
// Example: Fetch available rooms
const searchRooms = async (checkIn, checkOut, adults, children) => {
  const response = await fetch('/api/rooms/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      check_in_date: checkIn,
      check_out_date: checkOut,
      adults: adults,
      children: children
    })
  });
  return response.json();
};

// Example: OTA Sync Button
const syncOTA = async (otaId) => {
  const response = await fetch(`/api/ota/sync/${otaId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

## 🔐 Security Considerations

### Authentication & Authorization
- JWT tokens with expiration
- Role-based access control (admin, manager, staff)
- Password hashing with bcrypt
- Session management

### Input Validation
- All inputs validated with express-validator
- SQL injection prevention
- XSS protection
- File upload restrictions

### Rate Limiting
- API rate limiting to prevent abuse
- Configurable limits per endpoint
- IP-based tracking

### Data Protection
- Environment variables for sensitive data
- Database connection pooling
- HTTPS enforcement (configure in production)

## 🚀 Deployment

### Production Setup
1. Set `NODE_ENV=production` in environment
2. Configure SSL certificates
3. Set up process manager (PM2 recommended)
4. Configure nginx reverse proxy
5. Set up database backups
6. Configure log rotation

### Environment Variables for Production
```env
NODE_ENV=production
PORT=5000
JWT_SECRET=your_production_jwt_secret
DB_HOST=your_production_db_host
DB_PASSWORD=your_production_db_password
SMTP_HOST=your_production_smtp_host
```

### PM2 Configuration
```json
{
  "name": "hotel-booking-engine",
  "script": "server.js",
  "instances": "max",
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "production",
    "PORT": 5000
  }
}
```

## 📊 Database Schema

The system uses MySQL with the following key tables:
- `users` - Admin users and staff
- `rooms` - Room inventory with details
- `room_images` - Room image storage
- `bookings` - Booking records
- `customers` - Customer information
- `ota_configurations` - OTA integration settings
- `ota_sync_logs` - Sync operation logs
- `settings` - System configuration

## 📈 Monitoring & Logging

### Application Monitoring
- Health check endpoint: `/api/health`
- Database connection monitoring
- Error logging and alerting
- Performance metrics

### OTA Sync Monitoring
- Sync success/failure tracking
- Automated retry mechanisms
- Alert notifications for failed syncs
- Comprehensive sync logs

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Check the API documentation
- Review error logs
- Contact system administrator

---

**Note**: This is a comprehensive hotel booking system with all requested features including the crucial OTA Channel Manager with "Sync" button functionality. The system is production-ready with security measures, error handling, and comprehensive API documentation.