# ONVIF Video Management System - Installation Guide

This guide will help you set up the complete ONVIF Video Management System for local development and testing with real cameras.

## Prerequisites

### System Requirements
- **Node.js**: Version 16 or higher
- **npm**: Version 8 or higher
- **Operating System**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 18.04+)
- **RAM**: Minimum 4GB, recommended 8GB+
- **Storage**: At least 2GB free space for recordings
- **Network**: Access to ONVIF cameras on local network

### Optional Requirements
- **FFmpeg**: For video recording and processing
- **Docker**: For containerized deployment
- **Git**: For version control

## Quick Start (Automated Setup)

### 1. Download and Extract
```bash
# Download the project zip file and extract it
cd onvif-video-management-local
```

### 2. Run Setup Script
```bash
# This will install all dependencies and configure the environment
npm run setup
```

### 3. Test Camera Discovery
```bash
# Check if your cameras can be discovered
npm run discover
```

### 4. Start the Application
```bash
# Start both frontend and backend
npm run dev
```

### 5. Access the Application
Open your browser and go to: `http://localhost:3000`

**Login with default credentials:**
- **Admin**: `admin@local.dev` / `admin123`
- **Operator**: `operator@local.dev` / `operator123`
- **Viewer**: `viewer@local.dev` / `viewer123`

## Manual Installation

If the automated setup doesn't work, follow these manual steps:

### 1. Install Frontend Dependencies
```bash
npm install
```

### 2. Install Backend Dependencies
```bash
cd server
npm install
cd ..
```

### 3. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your settings
# The defaults should work for most setups
```

### 4. Create Required Directories
```bash
mkdir -p local/logs
mkdir -p local/recordings
mkdir -p local/thumbnails
mkdir -p local/motion_thumbnails
mkdir -p local/temp
mkdir -p local/exports
```

### 5. Start Services
```bash
# Terminal 1: Start backend server
cd server
npm start

# Terminal 2: Start frontend (in new terminal)
npm run dev:client
```

## Docker Installation

For a containerized setup:

### 1. Build and Run
```bash
# Build the Docker image
npm run docker:build

# Start all services
npm run docker:run
```

### 2. Access Application
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`

### 3. Stop Services
```bash
npm run docker:stop
```

## Camera Setup

### ONVIF Camera Configuration

1. **Enable ONVIF**: Ensure ONVIF is enabled in camera settings
2. **WS-Discovery**: Enable WS-Discovery for automatic detection
3. **User Account**: Create a user account for VMS access
4. **Network**: Ensure cameras are on the same subnet
5. **Ports**: Default ONVIF port is 80 or 8080

### Supported Camera Brands
- Hikvision
- Dahua
- Axis
- Bosch
- Sony
- Generic ONVIF-compliant cameras

### Network Requirements
- Cameras and VMS on same subnet
- Multicast enabled on network switches
- Firewall allows UDP port 3702 (WS-Discovery)
- Camera ONVIF ports accessible (usually 80/8080)

## Configuration

### Environment Variables (.env)
```bash
# Server Configuration
PORT=3001
CLIENT_PORT=3000

# Database
DB_PATH=./local/database.db

# ONVIF Settings
ONVIF_DISCOVERY_PORT=3702
DISCOVERY_TIMEOUT=5000
MAX_CAMERAS=50

# Recording Settings
RECORDINGS_PATH=./local/recordings
MAX_RECORDING_SIZE=1GB
RECORDING_CLEANUP_DAYS=30

# Security
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12
```

### Database
The system uses SQLite for local development:
- Database file: `./local/database.db`
- Automatic schema creation
- Demo users pre-created
- No additional setup required

## Testing

### 1. Server Health Check
```bash
curl http://localhost:3001/health
```

### 2. Camera Discovery Test
```bash
npm run discover
```

### 3. API Tests
```bash
# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local.dev","password":"admin123"}'
```

## Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Check what's using the ports
netstat -an | grep 3000
netstat -an | grep 3001

# Kill processes if needed
pkill -f "node.*3000"
pkill -f "node.*3001"
```

#### 2. Camera Discovery Issues
```bash
# Run discovery with elevated privileges
sudo npm run discover

# Check network interface
ip addr show  # Linux
ifconfig      # macOS
ipconfig      # Windows
```

#### 3. Database Issues
```bash
# Reset database
rm ./local/database.db
npm run dev:server  # Will recreate database
```

#### 4. Permission Errors
```bash
# Fix file permissions
chmod -R 755 ./local/
chown -R $USER:$USER ./local/
```

### Logs
Check log files for detailed error information:
- Application logs: `./local/logs/app.log`
- Audit logs: `./local/logs/audit.log`

## Development

### Project Structure
```
onvif-video-management-local/
├── src/                    # React frontend source
├── components/             # React components
├── services/              # Frontend services
├── server/                # Backend server
│   ├── routes/           # API routes
│   ├── services/         # Backend services
│   ├── database/         # Database operations
│   └── utils/           # Utilities
├── local/                # Local data storage
├── scripts/              # Utility scripts
└── docs/                # Documentation
```

### Adding Features
1. **Frontend**: Add components in `components/`
2. **Backend**: Add routes in `server/routes/`
3. **Database**: Update schema in `server/database/init.js`
4. **Services**: Add business logic in respective service directories

### Building for Production
```bash
# Build frontend
npm run build

# Start production server
npm run start
```

## Security Considerations

### Development Environment
- Default credentials are for development only
- Change JWT secret in production
- Enable HTTPS for production deployment
- Keep camera firmware updated

### Network Security
- Use VLANs to isolate camera traffic
- Enable camera authentication
- Regular security audits
- Monitor audit logs

## Performance Optimization

### Recommended Limits
- **Max cameras**: 20-30 for optimal performance
- **Concurrent streams**: 10-15 depending on resolution
- **Recording retention**: 30 days default
- **Motion detection**: Enable cleanup for old events

### System Resources
- **CPU**: Multi-core recommended for multiple streams
- **RAM**: 8GB+ for handling multiple camera feeds
- **Storage**: SSD recommended for recording storage
- **Network**: Gigabit Ethernet for HD streams

## Backup and Maintenance

### Regular Maintenance
```bash
# Clean old recordings (automated)
# Check logs for errors
tail -f ./local/logs/app.log

# Database backup
cp ./local/database.db ./local/database.backup.db

# Update dependencies
npm update
cd server && npm update && cd ..
```

### Backup Strategy
- **Database**: Regular SQLite backups
- **Recordings**: External storage backup
- **Configuration**: Version control for settings

## Support

### Getting Help
1. Check this installation guide
2. Review log files in `./local/logs/`
3. Test camera discovery with `npm run discover`
4. Check network connectivity to cameras
5. Verify ONVIF settings on cameras

### Common Commands
```bash
# Full restart
npm run docker:stop
npm run docker:run

# Reset everything
rm -rf local/
npm run setup

# Check system status
npm run test:cameras
curl http://localhost:3001/health
```

### Resources
- ONVIF Specification: https://www.onvif.org/
- Camera Setup Guides: Check manufacturer documentation
- Network Configuration: Ensure multicast is enabled

---

**Note**: This system is designed for local development and testing. For production deployment, additional security measures and scalability considerations are recommended.