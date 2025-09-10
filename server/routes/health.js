const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Get database connection from app
const getDbConnection = (req) => req.app.get('dbConnection');

// Health check endpoint - no auth required
router.get('/', async (req, res) => {
  try {
    const startTime = process.hrtime();

    // Check database connectivity
    const dbConnection = getDbConnection(req);
    let dbConnected = false;
    let dbType = process.env.DB_TYPE || 'unknown';

    if (dbConnection) {
      try {
        // Use the unified database adapter methods
        try {
          const testResult = await dbConnection.get("SELECT 1 as test");
          if (testResult && testResult.test === 1) {
            dbConnected = true;
          }
        } catch (error) {
          // Silent fail - already defaults to false
          dbConnected = false;
        }
      } catch (error) {
        logger.warn('Database connectivity test failed:', error.message);
        dbConnected = false;
      }
    }

    // Check ONVIF discovery service availability
    const onvifConnected = true; // Our discovery service is always available if server is running

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds

    const health = {
      status: dbConnected && onvifConnected ? 'healthy' : 'degraded',
      database: dbConnected ? 'connected' : 'disconnected',
      db: dbConnected ? 'connected' : 'disconnected', // Add both formats for compatibility
      database_type: dbType,
      discovery: onvifConnected ? 'ready' : 'inactive',
      onvif: onvifConnected ? 'ready' : 'inactive',
      onvif_discovery: onvifConnected ? 'active' : 'inactive',
      services: {
        auth: dbConnected,
        devices: dbConnected,
        recordings: dbConnected,
        motion_events: dbConnected
      },
      components: {
        database: dbConnected ? 'connected' : 'disconnected',
        discovery: onvifConnected ? 'ready' : 'inactive',
        streaming: 'ready'
      },
      uptime: process.uptime(),
      version: '1.0.0',
      response_time: Math.round(responseTime)
    };

    logger.info('Health check performed');

    // Return health data at root level for frontend compatibility
    res.json({
      success: true,
      status: health.status,
      database: health.database,
      db: health.db,
      database_type: health.database_type,
      discovery: health.discovery,
      onvif: health.onvif,
      onvif_discovery: health.onvif_discovery,
      services: health.services,
      components: health.components,
      uptime: health.uptime,
      version: health.version,
      response_time: health.response_time,
      health: health // Also include nested for backward compatibility
    });
  } catch (error) {
    logger.error('Health check error:', error);

    const errorHealth = {
      status: 'down',
      database: 'disconnected',
      db: 'disconnected',
      database_type: 'unknown',
      discovery: 'inactive',
      onvif: 'inactive',
      onvif_discovery: 'inactive',
      services: {
        auth: false,
        devices: false,
        recordings: false,
        motion_events: false
      },
      components: {
        database: 'disconnected',
        discovery: 'inactive',
        streaming: 'inactive'
      },
      uptime: 0,
      version: 'unknown',
      response_time: 0
    };

    res.status(500).json({
      success: false,
      error: 'Health check failed',
      status: errorHealth.status,
      database: errorHealth.database,
      db: errorHealth.db,
      database_type: errorHealth.database_type,
      discovery: errorHealth.discovery,
      onvif: errorHealth.onvif,
      onvif_discovery: errorHealth.onvif_discovery,
      services: errorHealth.services,
      components: errorHealth.components,
      uptime: errorHealth.uptime,
      version: errorHealth.version,
      response_time: errorHealth.response_time,
      health: errorHealth
    });
  }
});

/**
 * Helper function to check TCP port connectivity
 */
async function checkTcpPort(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let connected = false;
    let startTime = Date.now();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      connected = true;
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve({ success: true, latency });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ success: false, error: 'timeout' });
    });

    socket.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    socket.connect(port, host);
  });
}

/**
 * GET /api/health/devices/test - Test endpoint to debug device IDs
 */
router.get('/devices/test', async (req, res) => {
  try {
    const dbConnection = getDbConnection(req);

    const devices = await dbConnection.all('SELECT id, name, ip_address, authenticated FROM devices WHERE authenticated = 1');

    logger.info(`Test: Found ${devices.length} authenticated devices`);
    devices.forEach(device => {
      logger.info(`Test Device: id="${device.id}", name="${device.name}", ip="${device.ip_address}"`);
    });

    res.json({
      success: true,
      raw_devices: devices,
      count: devices.length
    });
  } catch (error) {
    logger.error('Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/health/devices - Cross-platform device connectivity check
 * Uses TCP port checking instead of ping for better reliability
 */
router.get('/devices', async (req, res) => {
  try {
    const dbConnection = getDbConnection(req);

    // Get only authenticated devices
    let devices = [];
    try {
      devices = await dbConnection.all('SELECT * FROM devices WHERE authenticated = 1');
    } catch (err) {
      logger.error('Failed to fetch devices:', err);
      devices = [];
    }

    const deviceHealth = [];

    for (const device of devices) {
      const status = {
        id: device.id,
        name: device.name,
        ip: device.ip_address,
        authenticated: Boolean(device.authenticated),
        network: 'unknown',
        rtsp: 'unknown',
        lastSeen: device.last_seen,
        health: 'unknown',
        latency: null
      };

      try {
        // First check HTTP port (80) or the device's specified port
        const httpPort = device.port || 80;
        logger.debug(`Checking connectivity for ${device.name} at ${device.ip_address}:${httpPort}`);

        const httpCheck = await checkTcpPort(device.ip_address, httpPort, 3000);

        if (httpCheck.success) {
          status.network = 'reachable';
          status.latency = httpCheck.latency;

          // If HTTP is reachable, also check RTSP port
          logger.debug(`Checking RTSP port 554 for ${device.name}`);
          const rtspCheck = await checkTcpPort(device.ip_address, 554, 2000);
          status.rtsp = rtspCheck.success ? 'open' : 'closed';
        } else {
          // If HTTP port is not reachable, try ONVIF port 8080 as fallback
          logger.debug(`HTTP port failed, trying ONVIF port 8080 for ${device.name}`);
          const onvifCheck = await checkTcpPort(device.ip_address, 8080, 3000);

          if (onvifCheck.success) {
            status.network = 'reachable';
            status.latency = onvifCheck.latency;

            // Check RTSP port
            const rtspCheck = await checkTcpPort(device.ip_address, 554, 2000);
            status.rtsp = rtspCheck.success ? 'open' : 'closed';
          } else {
            // Last resort - just check RTSP port directly
            logger.debug(`Checking only RTSP port for ${device.name}`);
            const rtspCheck = await checkTcpPort(device.ip_address, 554, 3000);

            if (rtspCheck.success) {
              status.network = 'reachable';
              status.rtsp = 'open';
              status.latency = rtspCheck.latency;
            } else {
              status.network = 'unreachable';
              status.rtsp = 'unknown';
            }
          }
        }

      } catch (error) {
        // Network check failed completely
        status.network = 'unreachable';
        logger.debug(`Network check failed for ${device.ip_address}: ${error.message}`);
      }

      // Determine overall health based on connectivity
      if (status.network === 'reachable') {
        if (status.rtsp === 'open') {
          status.health = 'healthy';
        } else {
          // Device is reachable but RTSP is not working
          status.health = 'degraded';
        }
      } else {
        status.health = 'offline';
      }

      logger.debug(`Device ${device.name} health: ${status.health} (network: ${status.network}, rtsp: ${status.rtsp})`);
      deviceHealth.push(status);
    }

    const summary = {
      total: deviceHealth.length,
      healthy: deviceHealth.filter(d => d.health === 'healthy').length,
      degraded: deviceHealth.filter(d => d.health === 'degraded').length,
      offline: deviceHealth.filter(d => d.health === 'offline').length
    };

    logger.info(`Device health check complete: ${summary.healthy} healthy, ${summary.degraded} degraded, ${summary.offline} offline`);

    res.json({
      success: true,
      summary,
      devices: deviceHealth,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Device health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Device health check failed',
      message: error.message
    });
  }
});

/**
 * GET /api/health/detailed - Detailed health check with database table status
 */
router.get('/detailed', async (req, res) => {
  try {
    const startTime = process.hrtime();
    const dbConnection = getDbConnection(req);
    const dbType = process.env.DB_TYPE || 'unknown';

    let dbDetails = {
      connected: false,
      type: dbType,
      tables: {},
      performance: {}
    };

    if (dbConnection) {
      try {
        // Test connection based on database type
        if (dbType === 'mysql') {
          await dbConnection.query("SELECT 1 as test");
        } else {
          await dbConnection.get("SELECT 1 as test");
        }
        dbDetails.connected = true;

        // Check each table and get row counts
        const tables = [
          'users',
          'devices',
          'recordings',
          'motion_events',
          'audit_logs'
        ];

        for (const table of tables) {
          try {
            let count = 0;
            if (dbType === 'mysql') {
              const [rows] = await dbConnection.query(`SELECT COUNT(*) as count FROM ${table}`);
              count = rows[0].count || 0;
            } else {
              const countResult = await dbConnection.get(`SELECT COUNT(*) as count FROM ${table}`);
              count = countResult.count || 0;
            }

            dbDetails.tables[table] = {
              exists: true,
              rows: count
            };
          } catch (err) {
            dbDetails.tables[table] = {
              exists: false,
              rows: 0,
              error: err.message
            };
          }
        }

        // Database performance metrics
        const perfStart = Date.now();
        if (dbType === 'mysql') {
          await dbConnection.query("SELECT 1");
        } else {
          await dbConnection.get("SELECT 1");
        }
        dbDetails.performance.ping = Date.now() - perfStart;

        // Get active device count
        let activeDeviceCount = 0;
        try {
          if (dbType === 'mysql') {
            const [rows] = await dbConnection.query("SELECT COUNT(*) as count FROM devices WHERE status = 'discovered'");
            activeDeviceCount = rows[0].count || 0;
          } else {
            const activeDevices = await dbConnection.get("SELECT COUNT(*) as count FROM devices WHERE status = 'discovered'");
            activeDeviceCount = activeDevices.count || 0;
          }
        } catch (err) {
          logger.warn('Could not get active device count:', err.message);
        }
        dbDetails.active_devices = activeDeviceCount;

        // Get recent recordings count (last 24 hours)
        let recentRecordingCount = 0;
        try {
          if (dbType === 'mysql') {
            const [rows] = await dbConnection.query(`
              SELECT COUNT(*) as count FROM recordings 
              WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
            `);
            recentRecordingCount = rows[0].count || 0;
          } else {
            const recentRecordings = await dbConnection.get(`
              SELECT COUNT(*) as count FROM recordings 
              WHERE created_at >= datetime('now', '-1 day')
            `);
            recentRecordingCount = recentRecordings.count || 0;
          }
        } catch (err) {
          logger.warn('Could not get recent recording count:', err.message);
        }
        dbDetails.recent_recordings = recentRecordingCount;

      } catch (error) {
        logger.error('Database detailed check failed:', error);
        dbDetails.error = error.message;
      }
    }

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = seconds * 1000 + nanoseconds / 1000000;

    res.json({
      success: true,
      status: dbDetails.connected ? 'healthy' : 'degraded',
      database: dbDetails,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        node_version: process.version,
        platform: process.platform
      },
      response_time: Math.round(responseTime)
    });

  } catch (error) {
    logger.error('Detailed health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Detailed health check failed',
      message: error.message
    });
  }
});

/**
 * GET /api/health/hls - HLS streaming status
 */
router.get('/hls', async (req, res) => {
  try {
    const hlsDir = path.join(__dirname, '..', 'public', 'hls');

    if (!fs.existsSync(hlsDir)) {
      return res.json({
        success: true,
        streams: [],
        total: 0,
        active: 0,
        hlsDir: hlsDir,
        status: 'directory_not_found'
      });
    }

    const streamDirs = fs.readdirSync(hlsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const streamPath = path.join(hlsDir, dirent.name);
        const playlistPath = path.join(streamPath, 'playlist.m3u8');

        // Check if playlist exists and get its modification time
        let lastModified = null;
        let isActive = false;

        if (fs.existsSync(playlistPath)) {
          const stats = fs.statSync(playlistPath);
          lastModified = stats.mtime;
          // Consider stream active if playlist was modified in last 60 seconds
          isActive = (Date.now() - stats.mtime.getTime()) < 60000;
        }

        return {
          streamId: dirent.name,
          active: isActive,
          exists: fs.existsSync(playlistPath),
          lastModified: lastModified,
          url: `/hls/${dirent.name}/playlist.m3u8`,
          path: streamPath
        };
      });

    res.json({
      success: true,
      streams: streamDirs,
      total: streamDirs.length,
      active: streamDirs.filter(s => s.active).length,
      existing: streamDirs.filter(s => s.exists).length,
      hlsDir: hlsDir,
      status: 'ok'
    });

  } catch (error) {
    logger.error('HLS status check failed:', error);
    res.json({
      success: false,
      streams: [],
      total: 0,
      active: 0,
      error: error.message,
      status: 'error'
    });
  }
});

/**
 * GET /api/health/services - Individual service status
 */
router.get('/services', async (req, res) => {
  try {
    const dbConnection = getDbConnection(req);
    const dbType = process.env.DB_TYPE || 'unknown';
    const services = {};

    // Auth service check
    try {
      if (dbConnection) {
        if (dbType === 'mysql') {
          await dbConnection.query("SELECT COUNT(*) as count FROM users");
        } else {
          await dbConnection.get("SELECT COUNT(*) as count FROM users");
        }
        services.auth = { status: 'operational', message: 'Authentication service running' };
      } else {
        services.auth = { status: 'down', message: 'Database not connected' };
      }
    } catch (err) {
      services.auth = { status: 'error', message: err.message };
    }

    // Device service check
    try {
      if (dbConnection) {
        let deviceCount = 0;
        if (dbType === 'mysql') {
          const [rows] = await dbConnection.query("SELECT COUNT(*) as count FROM devices");
          deviceCount = rows[0].count || 0;
        } else {
          const result = await dbConnection.get("SELECT COUNT(*) as count FROM devices");
          deviceCount = result.count || 0;
        }
        services.devices = {
          status: 'operational',
          message: `Managing ${deviceCount} devices`
        };
      } else {
        services.devices = { status: 'down', message: 'Database not connected' };
      }
    } catch (err) {
      services.devices = { status: 'error', message: err.message };
    }

    // Recording service check
    try {
      if (dbConnection) {
        let recordingCount = 0;
        if (dbType === 'mysql') {
          const [rows] = await dbConnection.query("SELECT COUNT(*) as count FROM recordings");
          recordingCount = rows[0].count || 0;
        } else {
          const result = await dbConnection.get("SELECT COUNT(*) as count FROM recordings");
          recordingCount = result.count || 0;
        }
        services.recordings = {
          status: 'operational',
          message: `${recordingCount} recordings in database`
        };
      } else {
        services.recordings = { status: 'down', message: 'Database not connected' };
      }
    } catch (err) {
      services.recordings = { status: 'error', message: err.message };
    }

    // Motion detection service check
    try {
      if (dbConnection) {
        let eventCount = 0;
        if (dbType === 'mysql') {
          const [rows] = await dbConnection.query("SELECT COUNT(*) as count FROM motion_events");
          eventCount = rows[0].count || 0;
        } else {
          const result = await dbConnection.get("SELECT COUNT(*) as count FROM motion_events");
          eventCount = result.count || 0;
        }
        services.motion = {
          status: 'operational',
          message: `${eventCount} motion events recorded`
        };
      } else {
        services.motion = { status: 'down', message: 'Database not connected' };
      }
    } catch (err) {
      services.motion = { status: 'error', message: err.message };
    }

    // ONVIF discovery service (always available if server is running)
    services.discovery = {
      status: 'operational',
      message: 'ONVIF discovery service ready'
    };

    // Calculate overall status
    const statuses = Object.values(services).map(s => s.status);
    let overallStatus = 'operational';
    if (statuses.includes('down')) {
      overallStatus = 'partial_outage';
    }
    if (statuses.filter(s => s === 'down').length > statuses.length / 2) {
      overallStatus = 'major_outage';
    }

    res.json({
      success: true,
      overall_status: overallStatus,
      services: services,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Service status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Service status check failed',
      message: error.message
    });
  }
});

module.exports = router;