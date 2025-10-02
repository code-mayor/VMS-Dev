// server/scripts/create-schedules-table.js
// Migration script to create recording_schedules table

const mysql = require('mysql2/promise');
require('dotenv').config();

async function createSchedulesTable() {
  let connection;
  
  try {
    // Connect to MySQL
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'onvif_vms'
    });

    console.log('✅ Connected to MySQL database');

    // Create recording_schedules table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS recording_schedules (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        days_of_week JSON NOT NULL COMMENT 'Array of days: 0=Sunday, 6=Saturday',
        start_time TIME NOT NULL COMMENT 'Schedule start time HH:MM:SS',
        end_time TIME NOT NULL COMMENT 'Schedule end time HH:MM:SS',
        quality VARCHAR(50) DEFAULT 'medium',
        chunk_duration INT DEFAULT 1 COMMENT 'Chunk duration in minutes',
        device_ids JSON COMMENT 'Array of device IDs, empty/null = all enabled devices',
        priority INT DEFAULT 0 COMMENT 'Higher priority wins on conflicts',
        created_by VARCHAR(36) COMMENT 'User ID who created the schedule',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_enabled (enabled),
        INDEX idx_priority (priority),
        INDEX idx_days_start (start_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.execute(createTableQuery);
    console.log('✅ Table recording_schedules created successfully');

    // Create index for better query performance on large datasets
    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_schedule_lookup 
      ON recording_schedules(enabled, priority DESC, start_time);
    `;
    
    await connection.execute(createIndexQuery);
    console.log('✅ Performance indexes created');

    // Create schedule_logs table for audit trail
    const createLogsTableQuery = `
      CREATE TABLE IF NOT EXISTS schedule_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        schedule_id VARCHAR(36) NOT NULL,
        device_id VARCHAR(36) NOT NULL,
        action VARCHAR(50) NOT NULL COMMENT 'started, completed, failed, skipped',
        recording_id VARCHAR(64) COMMENT 'Link to recordings table',
        error_message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_schedule_id (schedule_id),
        INDEX idx_device_id (device_id),
        INDEX idx_timestamp (timestamp),
        FOREIGN KEY (schedule_id) REFERENCES recording_schedules(id) ON DELETE CASCADE,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.execute(createLogsTableQuery);
    console.log('✅ Table schedule_logs created successfully');

    console.log('\n🎉 Migration completed successfully!');
    console.log('📋 Tables created:');
    console.log('   - recording_schedules (schedule definitions)');
    console.log('   - schedule_logs (execution audit trail)');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('👋 Database connection closed');
    }
  }
}

// Run migration if executed directly
if (require.main === module) {
  createSchedulesTable()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { createSchedulesTable };
