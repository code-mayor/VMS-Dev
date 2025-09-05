# Local ONVIF Video Management System

A comprehensive video management system for local networks with real ONVIF camera support. This version runs entirely on your local machine and can discover and manage ONVIF-compliant cameras on your network.

## Features

- 🔍 **Automatic ONVIF Discovery**: Finds cameras on your local network using WS-Discovery protocol
- 🎥 **Live Video Streaming**: Real-time video feeds from ONVIF cameras
- 🎛️ **PTZ Controls**: Pan, tilt, zoom controls for supported cameras
- 📹 **Video Recording**: Local recording with playback capabilities
- 🚨 **Motion Detection**: Configurable motion detection with alerts
- 👥 **User Management**: Role-based access control (Admin, Operator, Viewer)
- 🔒 **Security Features**: Audit logging, session management, password reset
- 📊 **Health Monitoring**: System status and camera health checks

## Requirements

- Node.js 16 or higher
- npm or yarn
- Windows, macOS, or Linux
- Network access to ONVIF cameras
- (Optional) FFmpeg for video recording

## Quick Start

### 1. Installation

```bash
# Clone or download the project
git clone <repository-url>
cd onvif-video-management-local

# Run the setup script
npm run setup

# Install dependencies
npm install
```

### 2. Configuration

The setup script creates a `.env` file with default settings. You can modify it as needed:

```env
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
```

### 3. Test Camera Discovery

Before starting the application, test if your cameras can be discovered:

```bash
npm run discover
```

This will scan your network for ONVIF cameras and display any found devices.

### 4. Start the Application

```bash
# Start both frontend and backend
npm run dev

# Or start them separately
npm run dev:client  # Frontend on port 3000
npm run dev:server  # Backend on port 3001
```

### 5. Access the Application

Open your browser and go to: `http://localhost:3000`

**Default Login Credentials:**
- **Admin**: admin@local.dev / admin123
- **Operator**: operator@local.dev / operator123
- **Viewer**: viewer@local.dev / viewer123

## Camera Setup

### ONVIF Camera Requirements

1. **ONVIF Compliance**: Cameras must support ONVIF Profile S or T
2. **Network Configuration**: Cameras must be on the same network segment
3. **Discovery Enabled**: WS-Discovery must be enabled on the camera
4. **Authentication**: Have camera username/password ready

### Common Camera Brands

The system has been tested with cameras from:
- Hikvision
- Dahua
- Axis
- Bosch
- Sony
- Generic ONVIF cameras

### Camera Configuration Steps

1. **Physical Setup**: Connect cameras to your network
2. **IP Configuration**: Assign static IPs or use DHCP
3. **ONVIF Settings**: Enable ONVIF and WS-Discovery in camera settings
4. **User Account**: Create a user account for the VMS access
5. **Port Configuration**: Ensure ONVIF port (usually 80 or 8080) is accessible

## Directory Structure

```
onvif-video-management-local/
├── src/                    # React frontend source
├── server/                 # Backend server code
├── local/                  # Local data storage
│   ├── database.db        # SQLite database
│   ├── recordings/        # Video recordings
│   ├── thumbnails/        # Video thumbnails
│   └── logs/             # Application logs
├── scripts/               # Utility scripts
├── .env                   # Environment configuration
└── package.json          # Dependencies
```

## Usage Guide

### 1. Device Discovery

- Navigate to **Devices** → **ONVIF Discovery**
- Click **"Discover Devices"** to scan the network
- Found cameras will appear in the device list
- Click **"Connect"** to authenticate with each camera

### 2. Live Viewing

- Go to **Devices** → **Live View**
- Select connected cameras to view live feeds
- Use PTZ controls for supported cameras

### 3. Recording

- Access **Devices** → **Video Recording**
- Start/stop manual recordings
- Configure scheduled recordings
- View and play back recorded videos

### 4. Motion Detection

- Navigate to **Devices** → **Motion Detection**
- Configure sensitivity settings
- Set up motion-triggered recording
- Review motion events and alerts

### 5. User Management

- Go to **User Management** (Admin only)
- Create/edit user accounts
- Assign roles and permissions
- Monitor user activity

## Troubleshooting

### Camera Discovery Issues

1. **No cameras found**:
   - Check network connectivity
   - Verify ONVIF is enabled on cameras
   - Try running with elevated privileges: `sudo npm run discover`
   - Check firewall settings

2. **Cameras found but can't connect**:
   - Verify camera credentials
   - Check ONVIF port accessibility
   - Ensure camera firmware is up to date

3. **Partial camera features**:
   - Some cameras may not support all ONVIF features
   - Check camera ONVIF profile compatibility
   - Update camera firmware if available

### Application Issues

1. **Server won't start**:
   - Check if ports 3001 and 3000 are available
   - Verify Node.js version (16+)
   - Check log files in `./local/logs/`

2. **Database issues**:
   - Delete `./local/database.db` to reset
   - Check disk space in `./local/` directory
   - Verify write permissions

3. **Recording problems**:
   - Install FFmpeg for video processing
   - Check storage space in `./local/recordings/`
   - Verify camera stream URLs

## Development

### Adding New Features

1. **Backend API**: Add routes in `server/routes/`
2. **Frontend Components**: Add React components in `src/components/`
3. **Database Changes**: Update schema in `server/database/init.js`
4. **ONVIF Features**: Extend `server/services/onvif-discovery.js`

### Testing

```bash
# Test camera discovery
npm run test:cameras

# Check server health
curl http://localhost:3001/health

# View logs
tail -f ./local/logs/app.log
```

## Security Considerations

- **Network Security**: Keep cameras on isolated VLAN
- **Authentication**: Change default passwords
- **Updates**: Keep camera firmware updated
- **Access Control**: Use appropriate user roles
- **Logging**: Monitor audit logs for suspicious activity

## Performance Optimization

- **Camera Limits**: Recommend max 20-30 cameras per system
- **Recording**: Use motion-triggered recording to save storage
- **Streaming**: Limit concurrent viewers per camera
- **Cleanup**: Enable automatic cleanup of old recordings

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting guide above
2. Review log files in `./local/logs/`
3. Test camera discovery with `npm run discover`
4. Check camera documentation for ONVIF settings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with real cameras
5. Submit a pull request

---

**Note**: This is a local development system. For production use, consider additional security measures, backup strategies, and scalability requirements.