// server/routes/schedules.js
// Recording schedule management routes

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

/**
 * Safely parse JSON field - handles both MySQL (returns objects) and SQLite (returns strings)
 */
function safeJSONParse(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn('JSON parse error:', error.message);
      return fallback;
    }
  }
  return fallback;
}

// Get all schedules with pagination for large datasets
router.get('/', async (req, res) => {
  try {
    const dbAdapter = req.app.get('dbConnection');
    const dbType = req.app.get('dbType') || 'mysql';

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const { enabled, deviceId } = req.query;

    const conditions = [];
    const whereParams = [];

    if (enabled !== undefined) {
      conditions.push('enabled = ?');
      whereParams.push(enabled === 'true' ? 1 : 0);
    }

    if (deviceId) {
      conditions.push(`(device_ids LIKE ? OR device_ids IS NULL OR device_ids = '[]')`);
      whereParams.push(`%"${deviceId}"%`);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    // FIXED: Use string interpolation for LIMIT/OFFSET
    const selectQuery = `SELECT * FROM recording_schedules${whereClause} ORDER BY priority DESC, start_time ASC LIMIT ${limit} OFFSET ${offset}`;
    const countQuery = `SELECT COUNT(*) as total FROM recording_schedules${whereClause}`;

    let schedules = [];
    let total = 0;

    if (dbType === 'mysql') {
      const pool = dbAdapter.pool || dbAdapter.connection;

      try {
        // Use query() instead of execute()
        const [rows] = await pool.query(selectQuery, whereParams);
        schedules = rows;

        const [countRows] = await pool.query(countQuery, whereParams);
        total = countRows[0]?.total || 0;

        console.log(`✅ Fetched ${schedules.length} schedules, total: ${total}`);

      } catch (execError) {
        console.error('❌ MySQL query error:', execError.message);
        throw execError;
      }

    } else {
      const selectParams = [...whereParams, limit, offset];
      schedules = await dbAdapter.all(
        `SELECT * FROM recording_schedules${whereClause} ORDER BY priority DESC, start_time ASC LIMIT ? OFFSET ?`,
        selectParams
      );
      const countResult = await dbAdapter.get(countQuery, whereParams);
      total = countResult?.total || 0;
    }

    // Format response
    const formattedSchedules = schedules.map(schedule => ({
      id: schedule.id,
      name: schedule.name,
      enabled: Boolean(schedule.enabled),
      daysOfWeek: safeJSONParse(schedule.days_of_week, []),
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      quality: schedule.quality,
      chunkDuration: schedule.chunk_duration,
      deviceIds: safeJSONParse(schedule.device_ids, []),
      priority: schedule.priority,
      createdBy: schedule.created_by,
      createdAt: schedule.created_at,
      updatedAt: schedule.updated_at
    }));

    res.json({
      success: true,
      schedules: formattedSchedules,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 0
      }
    });

  } catch (error) {
    console.error('❌ Error fetching schedules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedules',
      details: error.message,
      schedules: [],
      pagination: { page: 1, limit: 50, total: 0, pages: 0 }
    });
  }
});

// Get single schedule by ID
router.get('/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const dbConnection = req.app.get('dbConnection');

    const schedule = await dbConnection.get(
      'SELECT * FROM recording_schedules WHERE id = ?',
      [scheduleId]
    );

    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }

    // Parse JSON fields safely
    const formattedSchedule = {
      ...schedule,
      daysOfWeek: safeJSONParse(schedule.days_of_week, []),
      deviceIds: safeJSONParse(schedule.device_ids, []),
      enabled: Boolean(schedule.enabled)
    };

    res.json({
      success: true,
      schedule: formattedSchedule
    });
  } catch (error) {
    console.error('❌ Error fetching schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule',
      details: error.message
    });
  }
});

// Create new schedule
router.post('/', async (req, res) => {
  try {
    const dbConnection = req.app.get('dbConnection');
    const {
      name,
      enabled = true,
      daysOfWeek,
      startTime,
      endTime,
      quality = 'medium',
      chunkDuration = 1,
      deviceIds = [],
      priority = 0,
      createdBy
    } = req.body;

    // Validation
    if (!name || !daysOfWeek || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, daysOfWeek, startTime, endTime'
      });
    }

    if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'daysOfWeek must be a non-empty array'
      });
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time format. Use HH:MM'
      });
    }

    // Check for schedule conflicts if enabled
    if (enabled) {
      const conflicts = await checkScheduleConflicts(
        dbConnection,
        null, // scheduleId (null for new schedule)
        daysOfWeek,
        startTime,
        endTime,
        deviceIds,
        priority
      );

      if (conflicts.length > 0) {
        console.warn('⚠️ Schedule conflicts detected:', conflicts);
        // Don't block creation, just warn
      }
    }

    const scheduleId = uuidv4();

    const query = `
      INSERT INTO recording_schedules (
        id, name, enabled, days_of_week, start_time, end_time,
        quality, chunk_duration, device_ids, priority, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await dbConnection.run(query, [
      scheduleId,
      name,
      enabled ? 1 : 0,
      JSON.stringify(daysOfWeek),
      startTime + ':00', // Add seconds
      endTime + ':00',
      quality,
      chunkDuration,
      JSON.stringify(deviceIds),
      priority,
      createdBy || null
    ]);

    console.log(`✅ Schedule created: ${name} (${scheduleId})`);

    // Return the created schedule
    const createdSchedule = await dbConnection.get(
      'SELECT * FROM recording_schedules WHERE id = ?',
      [scheduleId]
    );

    res.status(201).json({
      success: true,
      message: 'Schedule created successfully',
      schedule: {
        ...createdSchedule,
        daysOfWeek: safeJSONParse(createdSchedule.days_of_week, []),
        deviceIds: safeJSONParse(createdSchedule.device_ids, []),
        enabled: Boolean(createdSchedule.enabled)
      }
    });
  } catch (error) {
    console.error('❌ Error creating schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create schedule',
      details: error.message
    });
  }
});

// Update existing schedule
router.put('/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const dbConnection = req.app.get('dbConnection');

    // Check if schedule exists
    const existing = await dbConnection.get(
      'SELECT * FROM recording_schedules WHERE id = ?',
      [scheduleId]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }

    const {
      name,
      enabled,
      daysOfWeek,
      startTime,
      endTime,
      quality,
      chunkDuration,
      deviceIds,
      priority
    } = req.body;

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(enabled ? 1 : 0);
    }
    if (daysOfWeek !== undefined) {
      updates.push('days_of_week = ?');
      params.push(JSON.stringify(daysOfWeek));
    }
    if (startTime !== undefined) {
      updates.push('start_time = ?');
      params.push(startTime.includes(':') ? startTime + ':00' : startTime);
    }
    if (endTime !== undefined) {
      updates.push('end_time = ?');
      params.push(endTime.includes(':') ? endTime + ':00' : endTime);
    }
    if (quality !== undefined) {
      updates.push('quality = ?');
      params.push(quality);
    }
    if (chunkDuration !== undefined) {
      updates.push('chunk_duration = ?');
      params.push(chunkDuration);
    }
    if (deviceIds !== undefined) {
      updates.push('device_ids = ?');
      params.push(JSON.stringify(deviceIds));
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    params.push(scheduleId);

    const query = `
      UPDATE recording_schedules 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await dbConnection.run(query, params);

    console.log(`✅ Schedule updated: ${scheduleId}`);

    // Return updated schedule
    const updated = await dbConnection.get(
      'SELECT * FROM recording_schedules WHERE id = ?',
      [scheduleId]
    );

    res.json({
      success: true,
      message: 'Schedule updated successfully',
      schedule: {
        ...updated,
        daysOfWeek: safeJSONParse(updated.days_of_week, []),
        deviceIds: safeJSONParse(updated.device_ids, []),
        enabled: Boolean(updated.enabled)
      }
    });
  } catch (error) {
    console.error('❌ Error updating schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update schedule',
      details: error.message
    });
  }
});

// Delete schedule
router.delete('/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const dbConnection = req.app.get('dbConnection');

    const existing = await dbConnection.get(
      'SELECT * FROM recording_schedules WHERE id = ?',
      [scheduleId]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }

    await dbConnection.run(
      'DELETE FROM recording_schedules WHERE id = ?',
      [scheduleId]
    );

    console.log(`🗑️ Schedule deleted: ${scheduleId}`);

    res.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete schedule',
      details: error.message
    });
  }
});

// Get active schedules for current time
router.get('/active/now', async (req, res) => {
  try {
    const dbConnection = req.app.get('dbConnection');
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;

    // Get all enabled schedules
    const schedules = await dbConnection.all(
      'SELECT * FROM recording_schedules WHERE enabled = 1 ORDER BY priority DESC'
    );

    // Filter schedules that are active right now
    const activeSchedules = schedules.filter(schedule => {
      const daysOfWeek = safeJSONParse(schedule.days_of_week, []);

      // Check if current day is in schedule
      if (!daysOfWeek.includes(currentDay)) {
        return false;
      }

      // Check if current time is within schedule time range
      const scheduleStart = schedule.start_time;
      const scheduleEnd = schedule.end_time;

      // Handle overnight schedules (e.g., 22:00 - 02:00)
      if (scheduleEnd < scheduleStart) {
        return currentTime >= scheduleStart || currentTime <= scheduleEnd;
      } else {
        return currentTime >= scheduleStart && currentTime <= scheduleEnd;
      }
    });

    // Format response
    const formattedSchedules = activeSchedules.map(schedule => ({
      ...schedule,
      daysOfWeek: safeJSONParse(schedule.days_of_week, []),
      deviceIds: safeJSONParse(schedule.device_ids, []),
      enabled: Boolean(schedule.enabled)
    }));

    res.json({
      success: true,
      activeSchedules: formattedSchedules,
      currentDay,
      currentTime: currentTime.substring(0, 5),
      count: formattedSchedules.length
    });
  } catch (error) {
    console.error('❌ Error fetching active schedules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active schedules',
      details: error.message
    });
  }
});

// Get schedule conflicts
router.post('/check-conflicts', async (req, res) => {
  try {
    const dbConnection = req.app.get('dbConnection');
    const { scheduleId, daysOfWeek, startTime, endTime, deviceIds, priority } = req.body;

    const conflicts = await checkScheduleConflicts(
      dbConnection,
      scheduleId,
      daysOfWeek,
      startTime,
      endTime,
      deviceIds,
      priority
    );

    res.json({
      success: true,
      hasConflicts: conflicts.length > 0,
      conflicts
    });
  } catch (error) {
    console.error('❌ Error checking conflicts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check conflicts',
      details: error.message
    });
  }
});

// Helper function to check schedule conflicts
async function checkScheduleConflicts(dbConnection, scheduleId, daysOfWeek, startTime, endTime, deviceIds, priority) {
  try {
    // Get all enabled schedules except the current one being edited
    let query = 'SELECT * FROM recording_schedules WHERE enabled = 1';
    const params = [];

    if (scheduleId) {
      query += ' AND id != ?';
      params.push(scheduleId);
    }

    const existingSchedules = await dbConnection.all(query, params);

    const conflicts = [];

    for (const existing of existingSchedules) {
      const existingDays = safeJSONParse(existing.days_of_week, []);
      const existingDevices = safeJSONParse(existing.device_ids, []);

      // Check if days overlap
      const dayOverlap = daysOfWeek.some(day => existingDays.includes(day));
      if (!dayOverlap) continue;

      // Check if devices overlap (empty arrays mean all devices)
      const deviceOverlap =
        (deviceIds.length === 0 || existingDevices.length === 0) ||
        deviceIds.some(id => existingDevices.includes(id));

      if (!deviceOverlap) continue;

      // Check if times overlap
      const newStart = startTime + ':00';
      const newEnd = endTime + ':00';
      const existingStart = existing.start_time;
      const existingEnd = existing.end_time;

      const timeOverlap = checkTimeOverlap(newStart, newEnd, existingStart, existingEnd);

      if (timeOverlap) {
        conflicts.push({
          scheduleId: existing.id,
          scheduleName: existing.name,
          priority: existing.priority,
          startTime: existingStart.substring(0, 5),
          endTime: existingEnd.substring(0, 5),
          willOverride: priority > existing.priority
        });
      }
    }

    return conflicts;
  } catch (error) {
    console.error('Error checking conflicts:', error);
    return [];
  }
}

// Helper function to check if time ranges overlap
function checkTimeOverlap(start1, end1, start2, end2) {
  // Handle overnight schedules
  const isOvernight1 = end1 < start1;
  const isOvernight2 = end2 < start2;

  if (!isOvernight1 && !isOvernight2) {
    // Simple case: both schedules are within same day
    return start1 < end2 && end1 > start2;
  }

  // Complex case: at least one schedule spans midnight
  // For simplicity, consider them as overlapping if they share any time
  return true;
}

// Get schedule execution logs (for audit/debugging)
router.get('/:scheduleId/logs', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { limit = 100, page = 1 } = req.query;
    const dbConnection = req.app.get('dbConnection');

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const logs = await dbConnection.all(
      `SELECT sl.*, d.name as device_name 
       FROM schedule_logs sl
       LEFT JOIN devices d ON sl.device_id = d.id
       WHERE sl.schedule_id = ?
       ORDER BY sl.timestamp DESC
       LIMIT ? OFFSET ?`,
      [scheduleId, parseInt(limit), offset]
    );

    const countResult = await dbConnection.get(
      'SELECT COUNT(*) as total FROM schedule_logs WHERE schedule_id = ?',
      [scheduleId]
    );

    res.json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.total,
        pages: Math.ceil(countResult.total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching schedule logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule logs',
      details: error.message
    });
  }
});

module.exports = router;