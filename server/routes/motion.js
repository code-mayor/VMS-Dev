const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const jwt = require('jsonwebtoken');

// Get database connection from app
const getDbConnection = (req) => req.app.get('dbConnection');

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

// Get all motion events
router.get('/events', authenticateToken, async (req, res) => {
  try {
    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Query motion events with device information using unified method
    const motionEvents = await dbConnection.query(`
      SELECT 
        me.id,
        me.device_id,
        me.event_type,
        me.confidence,
        me.bounding_box,
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
      ORDER BY me.created_at DESC
      LIMIT 100
    `);

    // Parse JSON fields for each event
    const parsedEvents = motionEvents.map(event => {
      let boundingBox = null;
      if (event.bounding_box) {
        try {
          boundingBox = typeof event.bounding_box === 'string'
            ? JSON.parse(event.bounding_box)
            : event.bounding_box;
        } catch (e) {
          logger.warn(`Failed to parse bounding_box for event ${event.id}`);
        }
      }

      return {
        ...event,
        bounding_box: boundingBox,
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

    // Query motion events for specific device using unified method
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
      if (event.bounding_box) {
        try {
          boundingBox = typeof event.bounding_box === 'string'
            ? JSON.parse(event.bounding_box)
            : event.bounding_box;
        } catch (e) {
          logger.warn(`Failed to parse bounding_box for event ${event.id}`);
        }
      }

      return {
        ...event,
        bounding_box: boundingBox,
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

    // Get single event using unified method
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

// Create new motion event
router.post('/events', authenticateToken, async (req, res) => {
  try {
    const {
      device_id,
      event_type = 'motion',
      confidence,
      bounding_box,
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

    // Insert new motion event using unified method
    await dbConnection.run(`
      INSERT INTO motion_events (
        id, device_id, event_type, confidence, 
        bounding_box, thumbnail_path, video_path, 
        acknowledged, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      eventId,
      device_id,
      event_type,
      confidence || null,
      bounding_box ? JSON.stringify(bounding_box) : null,
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

    // Check if event exists using unified method
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

    // Update event as acknowledged using unified method
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

    // Check if event exists using unified method
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

    // Delete the event using unified method
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

    // Get statistics using unified method
    const stats = await dbConnection.get(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN acknowledged = 1 THEN 1 ELSE 0 END) as acknowledged_events,
        SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) as unacknowledged_events,
        AVG(confidence) as avg_confidence
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

module.exports = router;