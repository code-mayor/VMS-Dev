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

// Get all audit logs
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const { limit = 100, offset = 0, user_id, action, start_date, end_date } = req.query;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Build query with filters
    let query = `
      SELECT 
        al.id,
        al.user_id,
        al.action,
        al.resource,
        al.resource_id,
        al.details,
        al.ip_address,
        al.user_agent,
        al.timestamp,
        u.name as user_name,
        u.email as user_email,
        u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (user_id) {
      query += ' AND al.user_id = ?';
      params.push(user_id);
    }

    if (action) {
      query += ' AND al.action LIKE ?';
      params.push(`%${action}%`);
    }

    if (start_date) {
      query += ' AND al.timestamp >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND al.timestamp <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY al.timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    // Execute query using unified method
    const auditLogs = await dbConnection.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
    const countParams = [];

    if (user_id) {
      countQuery += ' AND user_id = ?';
      countParams.push(user_id);
    }

    if (action) {
      countQuery += ' AND action LIKE ?';
      countParams.push(`%${action}%`);
    }

    if (start_date) {
      countQuery += ' AND timestamp >= ?';
      countParams.push(start_date);
    }

    if (end_date) {
      countQuery += ' AND timestamp <= ?';
      countParams.push(end_date);
    }

    const countResult = await dbConnection.get(countQuery, countParams);
    const total = countResult.total || 0;

    logger.info(`Retrieved ${auditLogs.length} audit logs out of ${total} total`);

    res.json({
      success: true,
      audit_logs: auditLogs,
      pagination: {
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit logs'
    });
  }
});

// Get audit logs for specific resource
router.get('/logs/resource/:resourceType/:resourceId', authenticateToken, async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const { limit = 50 } = req.query;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get audit logs for specific resource using unified method
    const auditLogs = await dbConnection.query(`
      SELECT 
        al.*,
        u.name as user_name,
        u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.resource = ? AND al.resource_id = ?
      ORDER BY al.timestamp DESC
      LIMIT ?
    `, [resourceType, resourceId, parseInt(limit)]);

    res.json({
      success: true,
      audit_logs: auditLogs,
      resource: {
        type: resourceType,
        id: resourceId
      }
    });
  } catch (error) {
    logger.error(`Error fetching audit logs for resource ${req.params.resourceType}/${req.params.resourceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resource audit logs'
    });
  }
});

// Create audit log entry (internal use by other routes)
router.post('/log', authenticateToken, async (req, res) => {
  try {
    const { action, resource, resource_id, details } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action is required'
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

    const now = new Date().toISOString();
    const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
    const user_agent = req.headers['user-agent'] || 'unknown';

    // Insert audit log using unified method
    await dbConnection.run(`
      INSERT INTO audit_logs (
        user_id, action, resource, resource_id, 
        details, ip_address, user_agent, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id,
      action,
      resource || null,
      resource_id || null,
      details || null,
      ip_address,
      user_agent,
      now
    ]);

    logger.info(`Audit log created: ${action} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Audit log entry created'
    });
  } catch (error) {
    logger.error('Error creating audit log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create audit log entry'
    });
  }
});

// Get audit log statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get statistics for the last N days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const startDateStr = startDate.toISOString();

    // Get action counts using unified method
    const actionStats = await dbConnection.query(`
      SELECT 
        action,
        COUNT(*) as count
      FROM audit_logs
      WHERE timestamp >= ?
      GROUP BY action
      ORDER BY count DESC
    `, [startDateStr]);

    // Get user activity stats
    const userStats = await dbConnection.query(`
      SELECT 
        u.name as user_name,
        u.email as user_email,
        COUNT(al.id) as action_count
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.timestamp >= ?
      GROUP BY al.user_id
      ORDER BY action_count DESC
      LIMIT 10
    `, [startDateStr]);

    // Get resource activity stats
    const resourceStats = await dbConnection.query(`
      SELECT 
        resource,
        COUNT(*) as count
      FROM audit_logs
      WHERE timestamp >= ? AND resource IS NOT NULL
      GROUP BY resource
      ORDER BY count DESC
    `, [startDateStr]);

    // Get total count
    const totalResult = await dbConnection.get(`
      SELECT COUNT(*) as total
      FROM audit_logs
      WHERE timestamp >= ?
    `, [startDateStr]);

    res.json({
      success: true,
      statistics: {
        period_days: parseInt(days),
        start_date: startDateStr,
        total_actions: totalResult.total || 0,
        actions_by_type: actionStats,
        top_users: userStats,
        resources: resourceStats
      }
    });
  } catch (error) {
    logger.error('Error fetching audit statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit statistics'
    });
  }
});

// Delete old audit logs (admin only)
router.delete('/logs/cleanup', authenticateToken, async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { days = 90 } = req.body;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    const cutoffDateStr = cutoffDate.toISOString();

    // Delete old logs using unified method
    const result = await dbConnection.run(`
      DELETE FROM audit_logs
      WHERE timestamp < ?
    `, [cutoffDateStr]);

    const deletedCount = result.changes || 0;

    // Log this cleanup action
    await dbConnection.run(`
      INSERT INTO audit_logs (
        user_id, action, resource, details, 
        ip_address, user_agent, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id,
      'audit_cleanup',
      'audit_logs',
      `Deleted ${deletedCount} logs older than ${days} days`,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
      new Date().toISOString()
    ]);

    logger.info(`Audit log cleanup: deleted ${deletedCount} logs older than ${days} days`);

    res.json({
      success: true,
      message: `Deleted ${deletedCount} audit logs older than ${days} days`,
      deleted_count: deletedCount
    });
  } catch (error) {
    logger.error('Error cleaning up audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup audit logs'
    });
  }
});

// Export audit logs as JSON or CSV
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { format = 'json', start_date, end_date } = req.query;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Build query
    let query = `
      SELECT 
        al.*,
        u.name as user_name,
        u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (start_date) {
      query += ' AND al.timestamp >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND al.timestamp <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY al.timestamp DESC';

    // Get audit logs using unified method
    const auditLogs = await dbConnection.query(query, params);

    if (format === 'csv') {
      // Convert to CSV
      const headers = ['ID', 'User ID', 'User Name', 'User Email', 'Action', 'Resource', 'Resource ID', 'Details', 'IP Address', 'User Agent', 'Timestamp'];
      const csvRows = [headers.join(',')];

      auditLogs.forEach(log => {
        const row = [
          log.id || '',
          log.user_id || '',
          log.user_name || '',
          log.user_email || '',
          log.action || '',
          log.resource || '',
          log.resource_id || '',
          log.details || '',
          log.ip_address || '',
          log.user_agent || '',
          log.timestamp || ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`);
        csvRows.push(row.join(','));
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit_logs_${Date.now()}.csv`);
      res.send(csvRows.join('\n'));
    } else {
      // Return as JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=audit_logs_${Date.now()}.json`);
      res.json({
        success: true,
        export_date: new Date().toISOString(),
        total_records: auditLogs.length,
        audit_logs: auditLogs
      });
    }
  } catch (error) {
    logger.error('Error exporting audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export audit logs'
    });
  }
});

module.exports = router;