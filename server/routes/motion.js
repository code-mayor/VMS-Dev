const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const jwt = require('jsonwebtoken');
const { getMotionDetectionService } = require('../services/motion-detector');

// Get database connection from app
const getDbConnection = (req) => req.app.get('dbConnection');

// Get motion detection service instance
const motionService = getMotionDetectionService();

// Middleware to check authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-dev-secret');
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };
    next();
  } catch (error) {
    // For local development, accept any token that looks valid
    if (process.env.NODE_ENV === 'development' && token && token.length > 10) {
      req.user = { id: 'local-user', role: 'admin' };
      next();
    } else {
      res.status(403).json({ success: false, error: 'Invalid token' });
    }
  }
};

// Start motion detection for a device
router.post('/:deviceId/start', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { config } = req.body;

    const dbConnection = getDbConnection(req);

    // Verify device exists
    const device = await dbConnection.get('SELECT * FROM devices WHERE id = ?', [deviceId]);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    // Start motion detection
    await motionService.startDetection(deviceId, `stream-${deviceId}`, config);

    // Update device in database
    await dbConnection.run(
      'UPDATE devices SET motion_detection_enabled = 1 WHERE id = ?',
      [deviceId]
    );

    logger.info(`Motion detection started for device ${deviceId} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Motion detection started',
      deviceId
    });
  } catch (error) {
    logger.error(`Failed to start motion detection for ${req.params.deviceId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop motion detection for a device
router.post('/:deviceId/stop', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Stop motion detection
    motionService.stopDetection(deviceId);

    const dbConnection = getDbConnection(req);

    // Update device in database
    await dbConnection.run(
      'UPDATE devices SET motion_detection_enabled = 0 WHERE id = ?',
      [deviceId]
    );

    logger.info(`Motion detection stopped for device ${deviceId} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Motion detection stopped',
      deviceId
    });
  } catch (error) {
    logger.error(`Failed to stop motion detection for ${req.params.deviceId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get motion detection configuration
router.get('/:deviceId/config', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;

    const dbConnection = getDbConnection(req);

    // Get device configuration from database
    const device = await dbConnection.get(
      'SELECT motion_detection_enabled, motion_config FROM devices WHERE id = ?',
      [deviceId]
    );

    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    // Get runtime config from service
    const serviceStats = motionService.getStatistics(deviceId);

    const config = {
      enabled: Boolean(device.motion_detection_enabled),
      sensitivity: 75,
      minConfidence: 60,
      cooldownPeriod: 5000,
      enableObjectDetection: true,
      enableHumanDetection: true,
      enableAnimalDetection: true,
      enableVehicleDetection: true,
      alertSound: true,
      alertNotifications: true,
      ...(device.motion_config ? JSON.parse(device.motion_config) : {}),
      ...(serviceStats?.config || {})
    };

    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error(`Failed to get motion config for ${req.params.deviceId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update motion detection configuration
router.put('/:deviceId/config', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const config = req.body;

    const dbConnection = getDbConnection(req);

    // Update configuration in service
    motionService.updateConfig(deviceId, config);

    // Store configuration in database
    await dbConnection.run(
      'UPDATE devices SET motion_config = ? WHERE id = ?',
      [JSON.stringify(config), deviceId]
    );

    logger.info(`Motion config updated for device ${deviceId} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Configuration updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to update motion config for ${req.params.deviceId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get motion detection statistics for a device
router.get('/:deviceId/stats', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const stats = motionService.getStatistics(deviceId);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Motion detection not active for this device'
      });
    }

    res.json({ success: true, statistics: stats });
  } catch (error) {
    logger.error(`Failed to get motion stats for ${req.params.deviceId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch start motion detection
router.post('/batch/start', authenticateToken, async (req, res) => {
  try {
    const { deviceIds, config } = req.body;

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Device IDs array is required'
      });
    }

    const dbConnection = getDbConnection(req);

    // Start motion detection for all devices
    await motionService.startBatchDetection(deviceIds, config);

    // Update devices in database
    const placeholders = deviceIds.map(() => '?').join(',');
    await dbConnection.run(
      `UPDATE devices SET motion_detection_enabled = 1 WHERE id IN (${placeholders})`,
      deviceIds
    );

    logger.info(`Batch motion detection started for ${deviceIds.length} devices by user ${req.user.id}`);

    res.json({
      success: true,
      message: `Motion detection started for ${deviceIds.length} devices`
    });
  } catch (error) {
    logger.error('Failed to start batch motion detection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch stop motion detection
router.post('/batch/stop', authenticateToken, async (req, res) => {
  try {
    const { deviceIds } = req.body;

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Device IDs array is required'
      });
    }

    // Stop motion detection for all devices
    deviceIds.forEach(deviceId => {
      motionService.stopDetection(deviceId);
    });

    const dbConnection = getDbConnection(req);

    // Update devices in database
    const placeholders = deviceIds.map(() => '?').join(',');
    await dbConnection.run(
      `UPDATE devices SET motion_detection_enabled = 0 WHERE id IN (${placeholders})`,
      deviceIds
    );

    logger.info(`Batch motion detection stopped for ${deviceIds.length} devices by user ${req.user.id}`);

    res.json({
      success: true,
      message: `Motion detection stopped for ${deviceIds.length} devices`
    });
  } catch (error) {
    logger.error('Failed to stop batch motion detection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all motion events with enhanced filtering
router.get('/events', authenticateToken, async (req, res) => {
  try {
    const {
      device_id,
      start_date,
      end_date,
      alert_level,
      acknowledged,
      limit = 100,
      offset = 0
    } = req.query;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Build query with filters
    let whereConditions = [];
    let params = [];

    if (device_id) {
      whereConditions.push('me.device_id = ?');
      params.push(device_id);
    }

    if (start_date) {
      whereConditions.push('me.created_at >= ?');
      params.push(start_date);
    }

    if (end_date) {
      whereConditions.push('me.created_at <= ?');
      params.push(end_date);
    }

    if (alert_level) {
      whereConditions.push('me.alert_level = ?');
      params.push(alert_level);
    }

    if (acknowledged !== undefined) {
      whereConditions.push('me.acknowledged = ?');
      params.push(acknowledged === 'true' ? 1 : 0);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Query motion events with device information
    const motionEvents = await dbConnection.query(`
      SELECT 
        me.id,
        me.device_id,
        me.event_type,
        me.confidence,
        me.bounding_box,
        me.object_classification,
        me.alert_level,
        me.summary,
        me.thumbnail_path,
        me.video_path,
        me.acknowledged,
        me.acknowledged_by,
        me.acknowledged_at,
        me.created_at,
        d.name as device_name,
        d.ip_address as device_ip,
        d.location as device_location,
        u.name as acknowledged_by_name
      FROM motion_events me
      LEFT JOIN devices d ON me.device_id = d.id
      LEFT JOIN users u ON me.acknowledged_by = u.id
      ${whereClause}
      ORDER BY me.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    // Parse JSON fields for each event
    const parsedEvents = motionEvents.map(event => {
      let boundingBox = null;
      let objectClassification = null;

      if (event.bounding_box) {
        try {
          boundingBox = typeof event.bounding_box === 'string'
            ? JSON.parse(event.bounding_box)
            : event.bounding_box;
        } catch (e) {
          logger.warn(`Failed to parse bounding_box for event ${event.id}`);
        }
      }

      if (event.object_classification) {
        try {
          objectClassification = typeof event.object_classification === 'string'
            ? JSON.parse(event.object_classification)
            : event.object_classification;
        } catch (e) {
          logger.warn(`Failed to parse object_classification for event ${event.id}`);
        }
      }

      return {
        ...event,
        bounding_box: boundingBox,
        object_classification: objectClassification,
        acknowledged: Boolean(event.acknowledged)
      };
    });

    logger.info(`Retrieved ${parsedEvents.length} motion events`);

    res.json({
      success: true,
      motion_events: parsedEvents,
      total: parsedEvents.length
    });
  } catch (error) {
    logger.error('Error fetching motion events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch motion events'
    });
  }
});

// Get motion events for specific device
router.get('/events/device/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Query motion events for specific device
    const motionEvents = await dbConnection.query(`
      SELECT 
        me.*,
        d.name as device_name,
        u.name as acknowledged_by_name
      FROM motion_events me
      LEFT JOIN devices d ON me.device_id = d.id
      LEFT JOIN users u ON me.acknowledged_by = u.id
      WHERE me.device_id = ?
      ORDER BY me.created_at DESC
      LIMIT ? OFFSET ?
    `, [deviceId, parseInt(limit), parseInt(offset)]);

    // Parse JSON fields
    const parsedEvents = motionEvents.map(event => {
      let boundingBox = null;
      let objectClassification = null;

      if (event.bounding_box) {
        try {
          boundingBox = typeof event.bounding_box === 'string'
            ? JSON.parse(event.bounding_box)
            : event.bounding_box;
        } catch (e) {
          logger.warn(`Failed to parse bounding_box for event ${event.id}`);
        }
      }

      if (event.object_classification) {
        try {
          objectClassification = typeof event.object_classification === 'string'
            ? JSON.parse(event.object_classification)
            : event.object_classification;
        } catch (e) {
          logger.warn(`Failed to parse object_classification for event ${event.id}`);
        }
      }

      return {
        ...event,
        bounding_box: boundingBox,
        object_classification: objectClassification,
        acknowledged: Boolean(event.acknowledged)
      };
    });

    res.json({
      success: true,
      motion_events: parsedEvents,
      device_id: deviceId,
      total: parsedEvents.length
    });
  } catch (error) {
    logger.error(`Error fetching motion events for device ${req.params.deviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device motion events'
    });
  }
});

// Get single motion event
router.get('/events/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get single event
    const event = await dbConnection.get(`
      SELECT 
        me.*,
        d.name as device_name,
        d.ip_address as device_ip,
        u.name as acknowledged_by_name
      FROM motion_events me
      LEFT JOIN devices d ON me.device_id = d.id
      LEFT JOIN users u ON me.acknowledged_by = u.id
      WHERE me.id = ?
    `, [id]);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Motion event not found'
      });
    }

    // Parse JSON fields
    if (event.bounding_box) {
      try {
        event.bounding_box = typeof event.bounding_box === 'string'
          ? JSON.parse(event.bounding_box)
          : event.bounding_box;
      } catch (e) {
        logger.warn(`Failed to parse bounding_box for event ${event.id}`);
      }
    }

    if (event.object_classification) {
      try {
        event.object_classification = typeof event.object_classification === 'string'
          ? JSON.parse(event.object_classification)
          : event.object_classification;
      } catch (e) {
        logger.warn(`Failed to parse object_classification for event ${event.id}`);
      }
    }

    event.acknowledged = Boolean(event.acknowledged);

    res.json({
      success: true,
      motion_event: event
    });
  } catch (error) {
    logger.error(`Error fetching motion event ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch motion event'
    });
  }
});

// Create new motion event (from detection service)
router.post('/events', authenticateToken, async (req, res) => {
  try {
    const {
      device_id,
      event_type = 'motion',
      confidence,
      bounding_box,
      object_classification,
      alert_level,
      summary,
      thumbnail_path,
      video_path
    } = req.body;

    if (!device_id) {
      return res.status(400).json({
        success: false,
        error: 'Device ID is required'
      });
    }

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Generate unique ID
    const eventId = `motion-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    // Determine alert level if not provided
    const finalAlertLevel = alert_level || (() => {
      if (object_classification?.living?.human) return 'high';
      if (object_classification?.living?.animal || object_classification?.nonLiving?.vehicle) return 'medium';
      return 'low';
    })();

    // Generate summary if not provided
    const finalSummary = summary || (() => {
      if (object_classification) {
        const parts = [];
        if (object_classification.living?.human) parts.push('Human detected');
        if (object_classification.living?.animal) parts.push('Animal detected');
        if (object_classification.nonLiving?.vehicle) parts.push('Vehicle detected');
        return parts.length > 0 ? parts.join(', ') : 'Motion detected';
      }
      return 'Motion detected';
    })();

    // Insert new motion event
    await dbConnection.run(`
      INSERT INTO motion_events (
        id, device_id, event_type, confidence, 
        bounding_box, object_classification, alert_level, summary,
        thumbnail_path, video_path, 
        acknowledged, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      eventId,
      device_id,
      event_type,
      confidence || null,
      bounding_box ? JSON.stringify(bounding_box) : null,
      object_classification ? JSON.stringify(object_classification) : null,
      finalAlertLevel,
      finalSummary,
      thumbnail_path || null,
      video_path || null,
      0, // not acknowledged
      now
    ]);

    logger.info(`Created new motion event ${eventId} for device ${device_id}`);

    res.status(201).json({
      success: true,
      message: 'Motion event created successfully',
      event_id: eventId
    });
  } catch (error) {
    logger.error('Error creating motion event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create motion event'
    });
  }
});

// Acknowledge motion event
router.post('/events/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Check if event exists
    const event = await dbConnection.get(
      'SELECT id, acknowledged FROM motion_events WHERE id = ?',
      [id]
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Motion event not found'
      });
    }

    if (event.acknowledged) {
      return res.status(400).json({
        success: false,
        error: 'Motion event already acknowledged'
      });
    }

    const now = new Date().toISOString();

    // Update event as acknowledged
    await dbConnection.run(`
      UPDATE motion_events 
      SET acknowledged = ?, acknowledged_by = ?, acknowledged_at = ?
      WHERE id = ?
    `, [1, req.user.id, now, id]);

    logger.info(`Motion event ${id} acknowledged by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Motion event acknowledged successfully',
      acknowledged_at: now,
      acknowledged_by: req.user.id
    });
  } catch (error) {
    logger.error(`Error acknowledging motion event ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge motion event'
    });
  }
});

// Delete motion event
router.delete('/events/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const { id } = req.params;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Check if event exists
    const event = await dbConnection.get(
      'SELECT id FROM motion_events WHERE id = ?',
      [id]
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Motion event not found'
      });
    }

    // Delete the event
    await dbConnection.run(
      'DELETE FROM motion_events WHERE id = ?',
      [id]
    );

    logger.info(`Motion event ${id} deleted by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Motion event deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting motion event ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete motion event'
    });
  }
});

// Get motion event statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { device_id, start_date, end_date } = req.query;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (device_id) {
      whereClause += ' AND device_id = ?';
      params.push(device_id);
    }

    if (start_date) {
      whereClause += ' AND created_at >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND created_at <= ?';
      params.push(end_date);
    }

    // Get statistics
    const stats = await dbConnection.get(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN acknowledged = 1 THEN 1 ELSE 0 END) as acknowledged_events,
        SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) as unacknowledged_events,
        AVG(confidence) as avg_confidence,
        SUM(CASE WHEN alert_level = 'high' THEN 1 ELSE 0 END) as high_alerts,
        SUM(CASE WHEN alert_level = 'medium' THEN 1 ELSE 0 END) as medium_alerts,
        SUM(CASE WHEN alert_level = 'low' THEN 1 ELSE 0 END) as low_alerts
      FROM motion_events
      ${whereClause}
    `, params);

    res.json({
      success: true,
      statistics: {
        total_events: stats.total_events || 0,
        acknowledged_events: stats.acknowledged_events || 0,
        unacknowledged_events: stats.unacknowledged_events || 0,
        avg_confidence: stats.avg_confidence || 0,
        high_alerts: stats.high_alerts || 0,
        medium_alerts: stats.medium_alerts || 0,
        low_alerts: stats.low_alerts || 0,
        filters: {
          device_id,
          start_date,
          end_date
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching motion event statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// Get global motion detection statistics
router.get('/stats/all', authenticateToken, async (req, res) => {
  try {
    const stats = motionService.getAllStatistics();

    // Get WebSocket statistics if available
    const wsStats = req.app.get('motionWebSocketService')?.getStatistics() || {
      activeConnections: 0,
      subscribedDevices: 0,
      pendingAlerts: 0,
      totalAlerts: 0
    };

    res.json({
      success: true,
      motionDetection: stats,
      websocket: wsStats
    });
  } catch (error) {
    logger.error('Failed to get global motion statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;